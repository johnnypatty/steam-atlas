use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use keyring::Entry;
use regex::Regex;
use scraper::{Html, Selector};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use url::Url;

const MAX_LOCAL_IMAGE_BYTES: u64 = 12 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const SECRET_SERVICE: &str = "app.steamatlas.desktop";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretBundle {
    steam_api_key: String,
    steam_ladder_api_key: String,
    backend: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    os: String,
    architecture: String,
    steam_roots: Vec<String>,
    flatpak_steam: bool,
    secure_storage: String,
    package_formats: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SteamAccount {
    steam_id: String,
    account_name: String,
    persona_name: String,
    avatar: Option<String>,
    most_recent: bool,
    remember_password: bool,
    timestamp: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Game {
    appid: u64,
    name: String,
    image: String,
    price: String,
    #[serde(rename = "type")]
    app_type: String,
    platforms: Vec<String>,
    review: String,
    review_score: u64,
    players: Option<String>,
    deck: String,
    tags: Vec<String>,
    summary: Option<String>,
    release_date: Option<String>,
    developers: Option<Vec<String>>,
    publishers: Option<Vec<String>>,
    dlc_count: Option<usize>,
    demo_appid: Option<u64>,
    installed: Option<bool>,
    install_dir: Option<String>,
    build_id: Option<String>,
    size_on_disk: Option<u64>,
    last_updated: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    id: String,
    file_name: String,
    file_path: String,
    app_id: Option<String>,
    depot_id: Option<String>,
    manifest_id: Option<String>,
    size: u64,
    imported_at: String,
    status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountProfile {
    steam_id: String,
    persona_name: Option<String>,
    avatar: Option<String>,
    level: Option<u64>,
    country: Option<String>,
    profile_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupRecord {
    id: String,
    source_path: String,
    backup_path: String,
    created_at: String,
    file_count: u64,
    total_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotRecord {
    id: String,
    app_id: String,
    file_name: String,
    file_path: String,
    preview_data_url: String,
    size: u64,
    modified_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrphanRecord {
    name: String,
    path: String,
    estimated_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CrashReport {
    file_path: String,
    category: String,
    confidence: String,
    summary: String,
    suggestions: Vec<String>,
    excerpt: String,
}

#[derive(Debug, Deserialize)]
struct StoreSearchResponse {
    results_html: String,
}

fn capture_vdf_value(content: &str, key: &str) -> Option<String> {
    let pattern = format!(r#""{}"\s+"([^"]*)""#, regex::escape(key));
    Regex::new(&pattern)
        .ok()?
        .captures(content)?
        .get(1)
        .map(|value| value.as_str().replace(r"\\", r"\"))
}

fn steam_roots() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(target_os = "windows") {
        if let Ok(path) = std::env::var("PROGRAMFILES(X86)") {
            candidates.push(PathBuf::from(path).join("Steam"));
        }
        if let Ok(path) = std::env::var("PROGRAMFILES") {
            candidates.push(PathBuf::from(path).join("Steam"));
        }
        candidates.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
        candidates.push(PathBuf::from(r"C:\Program Files\Steam"));
    } else if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".steam/steam"));
        candidates.push(home.join(".local/share/Steam"));
        candidates.push(home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"));
        candidates.push(home.join("Library/Application Support/Steam"));
    }

    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| path.exists())
        .filter(|path| seen.insert(path.to_string_lossy().to_lowercase()))
        .collect()
}

fn library_roots(steam_root: &Path) -> Vec<PathBuf> {
    let mut roots = vec![steam_root.to_path_buf()];
    let file = steam_root.join("steamapps/libraryfolders.vdf");
    if let Ok(content) = fs::read_to_string(file) {
        if let Ok(path_pattern) = Regex::new(r#""path"\s+"([^"]+)""#) {
            for captures in path_pattern.captures_iter(&content) {
                if let Some(value) = captures.get(1) {
                    let path = PathBuf::from(value.as_str().replace(r"\\", r"\"));
                    if path.exists() && !roots.contains(&path) {
                        roots.push(path);
                    }
                }
            }
        }
    }
    roots
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(6))
        .timeout(Duration::from_secs(14))
        .user_agent("Steam-Atlas/0.2 (+local desktop application)")
        .build()
        .map_err(|error| format!("Could not initialize the network client: {error}"))
}

async fn fetch_json<T: DeserializeOwned>(url: &str, max_bytes: u64) -> Result<T, String> {
    let response = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Network request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Remote service returned HTTP {}.", response.status()));
    }
    if response.content_length().is_some_and(|length| length > max_bytes) {
        return Err("Remote response exceeded Atlas safety limits.".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read the remote response: {error}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err("Remote response exceeded Atlas safety limits.".to_string());
    }
    serde_json::from_slice(&bytes).map_err(|error| format!("Remote response was invalid: {error}"))
}

async fn fetch_text(url: &str, max_bytes: u64) -> Result<String, String> {
    let response = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Network request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Remote service returned HTTP {}.", response.status()));
    }
    if response.content_length().is_some_and(|length| length > max_bytes) {
        return Err("Remote response exceeded Atlas safety limits.".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read the remote response: {error}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err("Remote response exceeded Atlas safety limits.".to_string());
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| "Remote response was not valid UTF-8.".to_string())
}

fn data_url_for_file(path: &Path) -> Option<String> {
    if fs::metadata(path).ok()?.len() > MAX_LOCAL_IMAGE_BYTES {
        return None;
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("jpg")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        _ => "image/jpeg",
    };
    let bytes = fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

fn secret_entry(name: &str) -> Result<Entry, String> {
    match name {
        "steam-web-api" | "steam-ladder-api" => Entry::new(SECRET_SERVICE, name)
            .map_err(|error| format!("Credential vault is unavailable: {error}")),
        _ => Err("Unsupported credential name.".to_string()),
    }
}

fn read_secret(name: &str) -> Result<String, String> {
    let entry = secret_entry(name)?;
    match entry.get_password() {
        Ok(value) => Ok(value),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(error) => Err(format!("Could not read the protected credential: {error}")),
    }
}

fn write_secret(name: &str, value: &str) -> Result<(), String> {
    let entry = secret_entry(name)?;
    if value.trim().is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("Could not clear the protected credential: {error}")),
        };
    }
    if value.len() > 4096 || value.chars().any(|character| character == '\0') {
        return Err("Credential value is invalid or unexpectedly large.".to_string());
    }
    entry
        .set_password(value.trim())
        .map_err(|error| format!("Could not protect the credential: {error}"))
}

#[tauri::command]
fn load_secrets() -> Result<SecretBundle, String> {
    Ok(SecretBundle {
        steam_api_key: read_secret("steam-web-api")?,
        steam_ladder_api_key: read_secret("steam-ladder-api")?,
        backend: if cfg!(target_os = "windows") {
            "Windows Credential Manager".to_string()
        } else if cfg!(target_os = "linux") {
            "Linux Secret Service".to_string()
        } else {
            "Operating-system credential vault".to_string()
        },
    })
}

#[tauri::command]
fn save_secrets(steam_api_key: String, steam_ladder_api_key: String) -> Result<(), String> {
    write_secret("steam-web-api", &steam_api_key)?;
    write_secret("steam-ladder-api", &steam_ladder_api_key)
}

#[tauri::command]
fn platform_info() -> PlatformInfo {
    let roots = steam_roots();
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        flatpak_steam: roots.iter().any(|path| path.to_string_lossy().contains(".var/app/")),
        steam_roots: roots
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        secure_storage: if cfg!(target_os = "windows") {
            "Windows Credential Manager".to_string()
        } else if cfg!(target_os = "linux") {
            "Linux Secret Service".to_string()
        } else {
            "Native credential vault".to_string()
        },
        package_formats: if cfg!(target_os = "windows") {
            vec!["Portable EXE".to_string(), "NSIS".to_string()]
        } else {
            vec!["AppImage".to_string(), "DEB".to_string()]
        },
    }
}

fn xml_value(content: &str, tag: &str) -> Option<String> {
    let cdata_pattern = format!(
        r#"(?s)<{0}>\s*<!\[CDATA\[(.*?)\]\]>\s*</{0}>"#,
        regex::escape(tag)
    );
    if let Ok(pattern) = Regex::new(&cdata_pattern) {
        if let Some(value) = pattern
            .captures(content)
            .and_then(|captures| captures.get(1))
        {
            return Some(value.as_str().trim().to_string());
        }
    }
    let plain_pattern = format!(
        r#"(?s)<{0}>\s*([^<]*?)\s*</{0}>"#,
        regex::escape(tag)
    );
    Regex::new(&plain_pattern)
        .ok()?
        .captures(content)?
        .get(1)
        .map(|value| value.as_str().trim().to_string())
}

#[tauri::command]
fn detect_steam_accounts() -> Result<Vec<SteamAccount>, String> {
    let root = steam_roots()
        .into_iter()
        .next()
        .ok_or("Steam installation was not found in a standard location.")?;
    let file = root.join("config/loginusers.vdf");
    let content = fs::read_to_string(&file)
        .map_err(|error| format!("Could not read {}: {error}", file.display()))?;

    let account_header =
        Regex::new(r#""(?P<steamid>\d{17})"\s*\{"#).map_err(|error| error.to_string())?;
    let headers: Vec<_> = account_header.captures_iter(&content).collect();
    let mut accounts = Vec::new();
    for (index, captures) in headers.iter().enumerate() {
        let steam_id = captures
            .name("steamid")
            .map(|value| value.as_str().to_string())
            .unwrap_or_default();
        let body_start = captures.get(0).map(|value| value.end()).unwrap_or(0);
        let body_end = headers
            .get(index + 1)
            .and_then(|next| next.get(0))
            .map(|value| value.start())
            .unwrap_or(content.len());
        let body = &content[body_start..body_end];
        if steam_id.is_empty() {
            continue;
        }
        accounts.push(SteamAccount {
            steam_id,
            account_name: capture_vdf_value(body, "AccountName").unwrap_or_default(),
            persona_name: capture_vdf_value(body, "PersonaName")
                .unwrap_or_else(|| "Steam user".to_string()),
            avatar: None,
            most_recent: capture_vdf_value(body, "MostRecent").as_deref() == Some("1"),
            remember_password: capture_vdf_value(body, "RememberPassword").as_deref()
                == Some("1"),
            timestamp: capture_vdf_value(body, "Timestamp").and_then(|value| value.parse().ok()),
        });
    }

    accounts.sort_by_key(|account| !account.most_recent);
    Ok(accounts)
}

#[tauri::command]
async fn fetch_account_profile_no_key(steam_id: String) -> Result<AccountProfile, String> {
    if steam_id.len() != 17 || !steam_id.chars().all(|value| value.is_ascii_digit()) {
        return Err("SteamID64 must contain exactly 17 digits.".to_string());
    }

    for root in steam_roots() {
        let cache = root.join("config/avatarcache");
        for extension in ["jpg", "jpeg", "png", "webp"] {
            let candidate = cache.join(format!("{steam_id}.{extension}"));
            if candidate.is_file() {
                return Ok(AccountProfile {
                    steam_id,
                    persona_name: None,
                    avatar: data_url_for_file(&candidate),
                    level: None,
                    country: None,
                    profile_url: None,
                });
            }
        }
    }

    let url = format!("https://steamcommunity.com/profiles/{steam_id}?xml=1");
    let content = fetch_text(&url, 1024 * 1024).await?;

    Ok(AccountProfile {
        steam_id: steam_id.clone(),
        persona_name: xml_value(&content, "steamID"),
        avatar: xml_value(&content, "avatarFull")
            .or_else(|| xml_value(&content, "avatarMedium")),
        level: xml_value(&content, "steamLevel").and_then(|value| value.parse().ok()),
        country: xml_value(&content, "location"),
        profile_url: Some(format!("https://steamcommunity.com/profiles/{steam_id}")),
    })
}

fn local_game_from_manifest(path: &Path) -> Result<Game, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let appid = capture_vdf_value(&content, "appid")
        .and_then(|value| value.parse::<u64>().ok())
        .ok_or("Missing AppID")?;
    let name = capture_vdf_value(&content, "name").unwrap_or_else(|| format!("App {appid}"));
    let install_dir_name = capture_vdf_value(&content, "installdir").unwrap_or_default();
    let build_id = capture_vdf_value(&content, "buildid");
    let size_on_disk = capture_vdf_value(&content, "SizeOnDisk")
        .and_then(|value| value.parse::<u64>().ok());
    let steamapps = path.parent().unwrap_or_else(|| Path::new(""));
    let install_dir = steamapps.join("common").join(install_dir_name);

    Ok(Game {
        appid,
        name,
        image: format!(
            "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
        ),
        price: "Owned".to_string(),
        app_type: "Game".to_string(),
        platforms: vec![if cfg!(target_os = "linux") {
            "Linux / Proton".to_string()
        } else {
            "Windows".to_string()
        }],
        review: "Local install".to_string(),
        review_score: 0,
        players: None,
        deck: "Unknown".to_string(),
        tags: vec!["Installed".to_string()],
        summary: None,
        release_date: None,
        developers: None,
        publishers: None,
        dlc_count: None,
        demo_appid: None,
        installed: Some(true),
        install_dir: Some(install_dir.to_string_lossy().to_string()),
        build_id,
        size_on_disk,
        last_updated: None,
    })
}

fn local_library_art(steam_root: &Path, appid: u64) -> Option<String> {
    let cache = steam_root.join("appcache/librarycache");
    let candidates = [
        cache.join(format!("{appid}_header.jpg")),
        cache.join(format!("{appid}/header.jpg")),
        cache.join(format!("{appid}/library_hero.jpg")),
        cache.join(format!("{appid}/library_600x900.jpg")),
        steam_root.join(format!("steam/games/{appid}.ico")),
    ];
    candidates
        .iter()
        .find(|path| path.is_file())
        .and_then(|path| data_url_for_file(path))
}

#[tauri::command]
fn scan_installed_games() -> Result<Vec<Game>, String> {
    let steam_root = steam_roots()
        .into_iter()
        .next()
        .ok_or("Steam installation was not found in a standard location.")?;
    let mut games = Vec::new();
    for root in library_roots(&steam_root) {
        let steamapps = root.join("steamapps");
        let entries = match fs::read_dir(&steamapps) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                if let Ok(mut game) = local_game_from_manifest(&path) {
                    if let Some(image) = local_library_art(&steam_root, game.appid) {
                        game.image = image;
                    }
                    games.push(game);
                }
            }
        }
    }
    games.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(games)
}

fn price_from_store(data: &Value) -> String {
    if data.get("is_free").and_then(Value::as_bool) == Some(true) {
        return "Free".to_string();
    }
    data.get("price_overview")
        .and_then(|value| value.get("final_formatted"))
        .and_then(Value::as_str)
        .unwrap_or("See Steam")
        .to_string()
}

fn game_from_store(appid: u64, data: &Value) -> Game {
    let platforms = data
        .get("platforms")
        .and_then(Value::as_object)
        .map(|values| {
            values
                .iter()
                .filter(|(_, enabled)| enabled.as_bool() == Some(true))
                .map(|(name, _)| match name.as_str() {
                    "windows" => "Windows".to_string(),
                    "mac" => "macOS".to_string(),
                    "linux" => "Linux".to_string(),
                    other => other.to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    let tags = data
        .get("genres")
        .and_then(Value::as_array)
        .map(|genres| {
            genres
                .iter()
                .filter_map(|genre| genre.get("description").and_then(Value::as_str))
                .take(4)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default();
    let app_type = match data.get("type").and_then(Value::as_str).unwrap_or("game") {
        "dlc" => "DLC",
        "demo" => "Demo",
        "tool" => "Tool",
        _ => "Game",
    };

    Game {
        appid,
        name: data
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Unknown app")
            .to_string(),
        image: data
            .get("header_image")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        price: price_from_store(data),
        app_type: app_type.to_string(),
        platforms,
        review: "See Steam".to_string(),
        review_score: 0,
        players: None,
        deck: "Unknown".to_string(),
        tags,
        summary: data
            .get("short_description")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        release_date: data
            .get("release_date")
            .and_then(|value| value.get("date"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        developers: data
            .get("developers")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect()
            }),
        publishers: data
            .get("publishers")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect()
            }),
        dlc_count: data
            .get("dlc")
            .and_then(Value::as_array)
            .map(Vec::len),
        demo_appid: data
            .get("demos")
            .and_then(Value::as_array)
            .and_then(|demos| demos.first())
            .and_then(|demo| demo.get("appid"))
            .and_then(Value::as_u64),
        installed: None,
        install_dir: None,
        build_id: None,
        size_on_disk: None,
        last_updated: None,
    }
}

#[tauri::command]
async fn fetch_store_app(app_id: u64) -> Result<Game, String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={app_id}&l=english"
    );
    let response: Value = fetch_json(&url, 5 * 1024 * 1024).await?;
    let app_key = app_id.to_string();
    let root = response
        .get(app_key.as_str())
        .ok_or("Steam returned no information for that AppID.")?;
    if root.get("success").and_then(Value::as_bool) != Some(true) {
        return Err("Steam did not return a successful app response.".to_string());
    }
    let data = root.get("data").ok_or("Steam app data was empty.")?;
    Ok(game_from_store(app_id, data))
}

#[tauri::command]
async fn search_steam_store(query: String) -> Result<Vec<Game>, String> {
    let clean = query.trim();
    if clean.is_empty() {
        return Ok(Vec::new());
    }
    if clean.chars().count() > 120 {
        return Err("Search query is limited to 120 characters.".to_string());
    }
    let url = format!(
        "https://store.steampowered.com/search/results/?query&term={}&start=0&count=24&infinite=1&l=english",
        urlencoding::encode(clean)
    );
    let payload: StoreSearchResponse = fetch_json(&url, 5 * 1024 * 1024).await?;
    let document = Html::parse_fragment(&payload.results_html);
    let row_selector = Selector::parse("a.search_result_row").map_err(|e| e.to_string())?;
    let title_selector = Selector::parse(".title").map_err(|e| e.to_string())?;
    let price_selector =
        Selector::parse(".discount_final_price").map_err(|e| e.to_string())?;
    let image_selector = Selector::parse("img").map_err(|e| e.to_string())?;

    let mut games = Vec::new();
    for row in document.select(&row_selector) {
        let Some(appid) = row
            .value()
            .attr("data-ds-appid")
            .and_then(|value| value.split(',').next())
            .and_then(|value| value.parse::<u64>().ok())
        else {
            continue;
        };
        let name = row
            .select(&title_selector)
            .next()
            .map(|value| value.text().collect::<String>())
            .unwrap_or_else(|| format!("App {appid}"));
        let price = row
            .select(&price_selector)
            .next()
            .map(|value| value.text().collect::<String>().trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "See Steam".to_string());
        let image = row
            .select(&image_selector)
            .next()
            .and_then(|value| value.value().attr("src"))
            .unwrap_or("")
            .replace("capsule_sm_120", "header");

        games.push(Game {
            appid,
            name,
            image,
            price,
            app_type: "Game".to_string(),
            platforms: Vec::new(),
            review: "See Steam".to_string(),
            review_score: 0,
            players: None,
            deck: "Unknown".to_string(),
            tags: Vec::new(),
            summary: None,
            release_date: None,
            developers: None,
            publishers: None,
            dlc_count: None,
            demo_appid: None,
            installed: None,
            install_dir: None,
            build_id: None,
            size_on_disk: None,
            last_updated: None,
        });
    }
    Ok(games)
}

#[tauri::command]
fn choose_executable() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    let extensions = ["exe", "com", "bat", "cmd", "ps1", "lnk"].as_slice();
    #[cfg(not(target_os = "windows"))]
    let extensions = ["AppImage", "sh", "run", "bin"].as_slice();
    let file = rfd::FileDialog::new()
        .add_filter(
            "Applications and scripts",
            extensions,
        )
        .pick_file();
    Ok(file.map(|path| path.to_string_lossy().to_string()))
}

fn manifest_entry(path: &Path) -> Result<ManifestEntry, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_MANIFEST_BYTES {
        return Err("Manifest exceeds the 4 MiB inspection limit.".to_string());
    }
    let content = fs::read_to_string(path).unwrap_or_default();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("manifest")
        .to_string();
    let app_from_name = Regex::new(r"appmanifest_(\d+)\.acf")
        .ok()
        .and_then(|pattern| pattern.captures(&file_name))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string());
    let app_id = capture_vdf_value(&content, "appid").or(app_from_name);
    let depot_id = capture_vdf_value(&content, "depotid").or_else(|| {
        Regex::new(r"(\d+)_\d+\.manifest")
            .ok()
            .and_then(|pattern| pattern.captures(&file_name))
            .and_then(|captures| captures.get(1))
            .map(|value| value.as_str().to_string())
    });
    let manifest_id = capture_vdf_value(&content, "manifest")
        .or_else(|| capture_vdf_value(&content, "gid"));
    let path_string = path.to_string_lossy().to_string();

    Ok(ManifestEntry {
        id: format!("{}-{}", unix_timestamp(), metadata.len()),
        file_name,
        file_path: path_string,
        app_id,
        depot_id,
        manifest_id,
        size: metadata.len(),
        imported_at: "Just now".to_string(),
        status: "valid".to_string(),
    })
}

#[tauri::command]
fn choose_manifest_files() -> Result<Vec<ManifestEntry>, String> {
    let files = rfd::FileDialog::new()
        .add_filter("Steam manifest files", &["acf", "manifest"])
        .pick_files()
        .unwrap_or_default();
    Ok(files
        .iter()
        .filter_map(|path| manifest_entry(path).ok())
        .collect())
}

#[tauri::command]
fn choose_background_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(source) = rfd::FileDialog::new()
        .add_filter("Background images", &["jpg", "jpeg", "png", "webp"])
        .pick_file()
    else {
        return Ok(None);
    };
    let metadata = fs::metadata(&source)
        .map_err(|error| format!("Could not inspect the selected image: {error}"))?;
    if metadata.len() > MAX_LOCAL_IMAGE_BYTES {
        return Err("Background image must be 12 MiB or smaller.".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("jpg")
        .to_ascii_lowercase();
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Atlas data directory: {error}"))?
        .join("appearance");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create appearance directory: {error}"))?;
    let destination = directory.join(format!("background.{extension}"));
    fs::copy(&source, &destination)
        .map_err(|error| format!("Could not copy the selected background: {error}"))?;
    Ok(Some(destination.to_string_lossy().to_string()))
}

#[tauri::command]
fn choose_folder() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

fn copy_folder_recursive(source: &Path, destination: &Path) -> Result<(u64, u64), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    let mut file_count = 0_u64;
    let mut total_bytes = 0_u64;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            let (nested_count, nested_bytes) =
                copy_folder_recursive(&source_path, &destination_path)?;
            file_count += nested_count;
            total_bytes += nested_bytes;
        } else if file_type.is_file() {
            let size = entry.metadata().map(|value| value.len()).unwrap_or(0);
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("Could not back up {}: {error}", source_path.display()))?;
            file_count += 1;
            total_bytes += size;
        }
    }
    Ok((file_count, total_bytes))
}

#[tauri::command]
fn backup_folder(app: tauri::AppHandle, source_path: String) -> Result<BackupRecord, String> {
    let source = PathBuf::from(&source_path);
    if !source.is_dir() {
        return Err("The selected backup source is not a folder.".to_string());
    }
    let timestamp = unix_timestamp();
    let safe_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("backup")
        .replace(|value: char| !value.is_ascii_alphanumeric() && value != '-' && value != '_', "_");
    let destination = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("backups")
        .join(format!("{safe_name}-{timestamp}"));
    let (file_count, total_bytes) = copy_folder_recursive(&source, &destination)?;
    Ok(BackupRecord {
        id: format!("backup-{timestamp}"),
        source_path,
        backup_path: destination.to_string_lossy().to_string(),
        created_at: timestamp.to_string(),
        file_count,
        total_bytes,
    })
}

fn visit_files(
    root: &Path,
    depth: usize,
    output: &mut Vec<PathBuf>,
    extensions: &[&str],
    limit: usize,
) {
    if depth == 0 || output.len() >= limit {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        if output.len() >= limit {
            break;
        }
        let path = entry.path();
        if path.is_dir() {
            visit_files(&path, depth - 1, output, extensions, limit);
        } else if path.is_file() {
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if extensions.contains(&extension.as_str()) {
                output.push(path);
            }
        }
    }
}

#[tauri::command]
fn scan_steam_screenshots() -> Result<Vec<ScreenshotRecord>, String> {
    let root = steam_roots()
        .into_iter()
        .next()
        .ok_or("Steam installation was not found.")?;
    let mut paths = Vec::new();
    let userdata = root.join("userdata");
    if let Ok(users) = fs::read_dir(userdata) {
        for user in users.flatten().filter(|entry| entry.path().is_dir()) {
            let remote = user.path().join("760/remote");
            let Ok(apps) = fs::read_dir(remote) else {
                continue;
            };
            for app in apps.flatten().filter(|entry| entry.path().is_dir()) {
                let screenshots = app.path().join("screenshots");
                if screenshots.is_dir() {
                    visit_files(
                        &screenshots,
                        2,
                        &mut paths,
                        &["jpg", "jpeg", "png", "webp"],
                        160,
                    );
                }
            }
        }
    }
    paths.sort_by_key(|path| {
        std::cmp::Reverse(
            fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .ok(),
        )
    });
    paths.truncate(24);
    Ok(paths
        .into_iter()
        .filter_map(|path| {
            let metadata = fs::metadata(&path).ok()?;
            if metadata.len() > 8 * 1024 * 1024 {
                return None;
            }
            let app_id = path
                .ancestors()
                .find_map(|ancestor| {
                    let name = ancestor.file_name()?.to_str()?;
                    (name.chars().all(|value| value.is_ascii_digit())
                        && ancestor.join("screenshots").is_dir())
                    .then_some(name.to_string())
                })
                .unwrap_or_else(|| "unknown".to_string());
            let modified = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_secs().to_string())
                .unwrap_or_default();
            Some(ScreenshotRecord {
                id: format!("shot-{}-{modified}", metadata.len()),
                app_id,
                file_name: path.file_name()?.to_string_lossy().to_string(),
                file_path: path.to_string_lossy().to_string(),
                preview_data_url: data_url_for_file(&path)?,
                size: metadata.len(),
                modified_at: modified,
            })
        })
        .collect())
}

fn folder_size_limited(path: &Path, remaining: &mut usize) -> u64 {
    if *remaining == 0 {
        return 0;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    let mut total = 0_u64;
    for entry in entries.flatten() {
        if *remaining == 0 {
            break;
        }
        *remaining -= 1;
        let child = entry.path();
        if child.is_dir() {
            total += folder_size_limited(&child, remaining);
        } else {
            total += entry.metadata().map(|value| value.len()).unwrap_or(0);
        }
    }
    total
}

#[tauri::command]
fn scan_orphaned_game_folders() -> Result<Vec<OrphanRecord>, String> {
    let steam_root = steam_roots()
        .into_iter()
        .next()
        .ok_or("Steam installation was not found.")?;
    let mut results = Vec::new();
    for root in library_roots(&steam_root) {
        let steamapps = root.join("steamapps");
        let mut installed = HashSet::new();
        if let Ok(entries) = fs::read_dir(&steamapps) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default();
                if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Some(directory) = capture_vdf_value(&content, "installdir") {
                            installed.insert(directory.to_ascii_lowercase());
                        }
                    }
                }
            }
        }
        let common = steamapps.join("common");
        let Ok(entries) = fs::read_dir(common) else {
            continue;
        };
        for entry in entries.flatten().filter(|entry| entry.path().is_dir()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if !installed.contains(&name.to_ascii_lowercase()) {
                let mut remaining = 20_000;
                results.push(OrphanRecord {
                    name,
                    path: entry.path().to_string_lossy().to_string(),
                    estimated_bytes: folder_size_limited(&entry.path(), &mut remaining),
                });
            }
        }
    }
    Ok(results)
}

#[tauri::command]
fn analyze_crash_log() -> Result<Option<CrashReport>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Crash and log files", &["log", "txt", "mdmp", "dmp"])
        .pick_file()
    else {
        return Ok(None);
    };
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("dmp") || value.eq_ignore_ascii_case("mdmp"))
        == Some(true)
    {
        return Ok(Some(CrashReport {
            file_path: path.to_string_lossy().to_string(),
            category: "Binary crash dump".to_string(),
            confidence: "medium".to_string(),
            summary: "This is a binary dump. Atlas can identify it but cannot safely decode it yet."
                .to_string(),
            suggestions: vec![
                "Keep the dump and its matching executable version.".to_string(),
                "Inspect it with WinDbg Preview for a full stack trace.".to_string(),
            ],
            excerpt: "Binary dump selected; text preview unavailable.".to_string(),
        }));
    }
    let file = fs::File::open(&path).map_err(|error| error.to_string())?;
    let mut content = String::new();
    file.take(2 * 1024 * 1024)
        .read_to_string(&mut content)
        .map_err(|error| error.to_string())?;
    let lowered = content.to_ascii_lowercase();
    let (category, confidence, summary, suggestions) = if lowered.contains("out of memory")
        || lowered.contains("bad allocation")
    {
        (
            "Memory exhaustion",
            "high",
            "The log indicates that the process ran out of usable memory.",
            vec![
                "Close memory-heavy applications and remove unstable mods.".to_string(),
                "Keep the Windows page file enabled and system-managed.".to_string(),
                "Test lower texture or asset-streaming settings.".to_string(),
            ],
        )
    } else if lowered.contains("device removed")
        || lowered.contains("dxgi_error")
        || lowered.contains("d3d")
    {
        (
            "Graphics device/DirectX",
            "high",
            "The log points to a DirectX or graphics-device failure.",
            vec![
                "Return GPU clocks to stock while testing.".to_string(),
                "Clean-install the current stable graphics driver.".to_string(),
                "Disable overlays and graphics injectors temporarily.".to_string(),
            ],
        )
    } else if lowered.contains("access violation") || lowered.contains("0xc0000005") {
        (
            "Access violation",
            "high",
            "The process attempted to access invalid memory.",
            vec![
                "Verify game files and test without mods.".to_string(),
                "Disable overlays and third-party injectors.".to_string(),
                "Run a memory stability test if crashes affect multiple games.".to_string(),
            ],
        )
    } else if lowered.contains("missing") && lowered.contains(".dll") {
        (
            "Missing dependency",
            "medium",
            "The log appears to reference a missing DLL or runtime component.",
            vec![
                "Verify the game through Steam.".to_string(),
                "Repair Microsoft Visual C++ redistributables and DirectX runtime.".to_string(),
            ],
        )
    } else {
        (
            "Unclassified crash",
            "low",
            "Atlas found no high-confidence signature in the selected text log.",
            vec![
                "Check the final exception and module names in the excerpt.".to_string(),
                "Compare a clean launch against your current mod and overlay setup.".to_string(),
            ],
        )
    };
    let excerpt = content
        .lines()
        .rev()
        .take(100)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    Ok(Some(CrashReport {
        file_path: path.to_string_lossy().to_string(),
        category: category.to_string(),
        confidence: confidence.to_string(),
        summary: summary.to_string(),
        suggestions,
        excerpt,
    }))
}

#[tauri::command]
fn export_portable_settings(json: String) -> Result<Option<String>, String> {
    if json.len() > 256 * 1024 {
        return Err("Settings export exceeds the 256 KiB limit.".to_string());
    }
    let mut value: Value = serde_json::from_str(&json)
        .map_err(|_| "Settings export is not valid JSON.".to_string())?;
    let object = value
        .as_object_mut()
        .ok_or("Settings export must be a JSON object.")?;
    object.remove("steamApiKey");
    object.remove("steamLadderApiKey");
    let safe_json = serde_json::to_string_pretty(&value)
        .map_err(|error| format!("Could not serialize safe settings: {error}"))?;
    let Some(path) = rfd::FileDialog::new()
        .set_file_name("steam-atlas-settings.json")
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return Ok(None);
    };
    fs::write(&path, safe_json).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn import_portable_settings() -> Result<Option<String>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Steam Atlas settings", &["json"])
        .pick_file()
    else {
        return Ok(None);
    };
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > 256 * 1024 {
        return Err("Settings import exceeds the 256 KiB limit.".to_string());
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let value: Value = serde_json::from_str(&content)
        .map_err(|_| "Settings file is not valid JSON.".to_string())?;
    if !value.is_object() {
        return Err("Settings file must contain a JSON object.".to_string());
    }
    Ok(Some(content))
}

#[tauri::command]
fn launch_external_tool(
    path: String,
    args: Vec<String>,
    working_directory: Option<String>,
) -> Result<(), String> {
    let executable = PathBuf::from(&path);
    if !executable.is_file() {
        return Err("The selected executable no longer exists.".to_string());
    }
    let executable = executable
        .canonicalize()
        .map_err(|error| format!("Could not validate the selected file: {error}"))?;
    if args.len() > 128
        || args
            .iter()
            .any(|value| value.len() > 4096 || value.chars().any(|character| character == '\0'))
    {
        return Err("The launch arguments exceed Atlas safety limits.".to_string());
    }
    let extension = executable
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    #[cfg(target_os = "windows")]
    let allowed = ["exe", "com", "bat", "cmd", "ps1", "lnk"].as_slice();
    #[cfg(not(target_os = "windows"))]
    let allowed = ["appimage", "sh", "run", "bin"].as_slice();
    if !allowed.contains(&extension.as_str()) {
        return Err("Atlas only launches explicitly selected executables or scripts.".to_string());
    }

    #[cfg(target_os = "windows")]
    let mut command = if extension == "ps1" {
        let mut shell = Command::new("powershell.exe");
        shell.args(["-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-File"]);
        shell.arg(&executable);
        shell
    } else if extension == "bat" || extension == "cmd" {
        let mut shell = Command::new("cmd.exe");
        shell.arg("/C").arg(&executable);
        shell
    } else {
        Command::new(&executable)
    };
    #[cfg(not(target_os = "windows"))]
    let mut command = Command::new(&executable);
    command.args(args);

    if let Some(directory) = working_directory.filter(|value| !value.trim().is_empty()) {
        let directory_path = PathBuf::from(directory);
        if !directory_path.is_dir() {
            return Err("The configured working directory does not exist.".to_string());
        }
        let directory_path = directory_path
            .canonicalize()
            .map_err(|error| format!("Could not validate the working directory: {error}"))?;
        command.current_dir(directory_path);
    } else if let Some(parent) = executable.parent() {
        command.current_dir(parent);
    }

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("The operating system could not launch this file: {error}"))
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "Atlas blocked an invalid link.".to_string())?;
    if !is_trusted_external_url(&parsed) {
        return Err("Atlas blocked a link outside its trusted destination list.".to_string());
    }
    open::that(parsed.as_str()).map_err(|error| error.to_string())
}

fn is_trusted_external_url(parsed: &Url) -> bool {
    let permitted = match parsed.scheme() {
        "https" => parsed.host_str().is_some_and(|host| {
            let host = host.to_ascii_lowercase();
            [
                "steampowered.com",
                "steamcommunity.com",
                "steamdb.info",
                "steamladder.com",
                "protondb.com",
            ]
            .iter()
            .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
        }),
        "steam" => parsed.host_str() == Some("open") && parsed.path() == "/games",
        _ => false,
    };
    permitted
}

#[tauri::command]
fn hide_to_tray(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .hide()
        .map_err(|error| format!("Could not hide Atlas: {error}"))
}

#[tauri::command]
fn run_steamcmd_download(
    steam_cmd_path: String,
    account_name: String,
    app_id: String,
    depot_id: String,
    manifest_id: Option<String>,
) -> Result<(), String> {
    let executable = PathBuf::from(&steam_cmd_path);
    if !executable.is_file() {
        return Err("Select the official SteamCMD executable.".to_string());
    }
    let executable_name = executable
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let expected_name = if cfg!(target_os = "windows") {
        executable_name.eq_ignore_ascii_case("steamcmd.exe")
    } else {
        executable_name == "steamcmd.sh" || executable_name == "steamcmd"
    };
    if !expected_name {
        return Err("Select the official SteamCMD executable for this operating system.".to_string());
    }
    let executable = executable
        .canonicalize()
        .map_err(|error| format!("Could not validate SteamCMD: {error}"))?;
    let valid_account = Regex::new(r"^[A-Za-z0-9_.-]{1,64}$")
        .map_err(|error| error.to_string())?;
    if !valid_account.is_match(&account_name) {
        return Err("The Steam account name contains unsupported characters.".to_string());
    }
    let numeric = |value: &str| !value.is_empty() && value.chars().all(|item| item.is_ascii_digit());
    if !numeric(&app_id) || !numeric(&depot_id) {
        return Err("AppID and DepotID must contain digits only.".to_string());
    }
    if let Some(value) = manifest_id.as_deref() {
        if !value.is_empty() && !numeric(value) {
            return Err("ManifestID must contain digits only.".to_string());
        }
    }

    let mut command = Command::new(&executable);
    command.args([
        "+login",
        &account_name,
        "+download_depot",
        &app_id,
        &depot_id,
    ]);
    if let Some(value) = manifest_id.filter(|value| !value.is_empty()) {
        command.arg(value);
    }
    command.arg("+quit");
    if let Some(parent) = executable.parent() {
        command.current_dir(parent);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x00000010);
    }

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("SteamCMD could not be started: {error}"))
}

#[tauri::command]
async fn fetch_owned_games(steam_id: String, api_key: String) -> Result<Vec<Game>, String> {
    if !steam_id.chars().all(|value| value.is_ascii_digit()) {
        return Err("SteamID must contain digits only.".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("A Steam Web API key is required.".to_string());
    }
    let url = format!(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={}&steamid={}&include_appinfo=1&include_played_free_games=1&format=json",
        urlencoding::encode(api_key.trim()),
        steam_id
    );
    let payload: Value = fetch_json(&url, 8 * 1024 * 1024).await?;
    let values = payload
        .pointer("/response/games")
        .and_then(Value::as_array)
        .ok_or("Steam returned no public library. Check the key and profile privacy.")?;
    Ok(values
        .iter()
        .filter_map(|value| {
            let appid = value.get("appid")?.as_u64()?;
            Some(Game {
                appid,
                name: value
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown app")
                    .to_string(),
                image: format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
                ),
                price: "Owned".to_string(),
                app_type: "Game".to_string(),
                platforms: Vec::new(),
                review: "Owned".to_string(),
                review_score: 0,
                players: None,
                deck: "Unknown".to_string(),
                tags: Vec::new(),
                summary: None,
                release_date: None,
                developers: None,
                publishers: None,
                dlc_count: None,
                demo_appid: None,
                installed: None,
                install_dir: None,
                build_id: None,
                size_on_disk: None,
                last_updated: None,
            })
        })
        .collect())
}

#[tauri::command]
async fn fetch_steam_ladder(
    steam_id: String,
    api_key: String,
) -> Result<Value, String> {
    if !steam_id.chars().all(|value| value.is_ascii_digit()) {
        return Err("SteamID must contain digits only.".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("A Steam Ladder API key is required.".to_string());
    }
    let url = format!("https://steamladder.com/api/v1/profile/{steam_id}/");
    let response = http_client()?
        .get(url)
        .header("Authorization", format!("Token {}", api_key.trim()))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Steam Ladder returned HTTP {}. Verify your API key and rate limit.",
            response.status()
        ));
    }
    if response.content_length().is_some_and(|length| length > 4 * 1024 * 1024) {
        return Err("Steam Ladder response exceeded Atlas safety limits.".to_string());
    }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("Steam Ladder response exceeded Atlas safety limits.".to_string());
    }
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let mut tray = TrayIconBuilder::new().tooltip("Steam Atlas");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    if let Some(window) = tray.app_handle().get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })
            .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            platform_info,
            load_secrets,
            save_secrets,
            detect_steam_accounts,
            fetch_account_profile_no_key,
            scan_installed_games,
            fetch_store_app,
            search_steam_store,
            choose_executable,
            choose_manifest_files,
            choose_background_image,
            choose_folder,
            backup_folder,
            scan_steam_screenshots,
            scan_orphaned_game_folders,
            analyze_crash_log,
            export_portable_settings,
            import_portable_settings,
            hide_to_tray,
            launch_external_tool,
            open_external,
            run_steamcmd_download,
            fetch_owned_games,
            fetch_steam_ladder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Steam Atlas");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_url_allowlist_accepts_expected_destinations() {
        for value in [
            "https://store.steampowered.com/app/730",
            "https://steamcommunity.com/profiles/76561198000000000",
            "https://steamdb.info/app/730/",
            "https://www.protondb.com/app/730",
            "steam://open/games",
        ] {
            assert!(is_trusted_external_url(&Url::parse(value).unwrap()), "{value}");
        }
    }

    #[test]
    fn external_url_allowlist_rejects_lookalikes_and_unsafe_schemes() {
        for value in [
            "https://steamcommunity.com.attacker.example/",
            "http://store.steampowered.com/",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "steam://run/730",
        ] {
            assert!(!is_trusted_external_url(&Url::parse(value).unwrap()), "{value}");
        }
    }

    #[test]
    fn vdf_capture_unescapes_windows_paths() {
        let value = capture_vdf_value(r#""path" "D:\\SteamLibrary""#, "path");
        assert_eq!(value.as_deref(), Some(r"D:\SteamLibrary"));
    }
}
