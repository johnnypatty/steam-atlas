use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use keyring::Entry;
use regex::Regex;
use scraper::{Html, Selector};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use url::Url;

const MAX_LOCAL_IMAGE_BYTES: u64 = 12 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MAX_USER_DATA_BYTES: usize = 8 * 1024 * 1024;
const SECRET_SERVICE: &str = "app.steamatlas.desktop";
const BACKUP_MANIFEST_SUFFIX: &str = ".atlas-manifest.json";

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
    steam_deck: bool,
    desktop_session: String,
    gamescope_available: bool,
    mango_hud_available: bool,
    proton_roots: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSecurityInfo {
    version: String,
    executable_path: String,
    executable_sha256: String,
    build_type: String,
    capabilities: Vec<String>,
    read_scopes: Vec<String>,
    network_domains: Vec<String>,
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
    minimum_requirements: Option<String>,
    recommended_requirements: Option<String>,
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
    integrity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifestFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    schema_version: u32,
    created_at: String,
    source_path: String,
    files: Vec<BackupManifestFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupIntegrityResult {
    status: String,
    file_count: u64,
    total_bytes: u64,
    checked_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupPreview {
    backup_path: String,
    destination_path: String,
    file_count: u64,
    total_bytes: u64,
    recovery_will_be_created: bool,
    integrity: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreResult {
    restored_file_count: u64,
    restored_bytes: u64,
    recovery_backup: BackupRecord,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemDiagnostics {
    app_version: String,
    os: String,
    architecture: String,
    cpu: String,
    memory_bytes: Option<u64>,
    steam_roots: Vec<String>,
    flatpak_steam: bool,
    steam_deck: bool,
    desktop_session: String,
    secure_storage: String,
    package_formats: Vec<String>,
    notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigDiffLine {
    line: usize,
    before: Option<String>,
    after: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigDiff {
    before_path: String,
    after_path: String,
    before_lines: usize,
    after_lines: usize,
    truncated: bool,
    changes: Vec<ConfigDiffLine>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtworkInstallResult {
    target_path: String,
    backup_path: Option<String>,
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
        .user_agent("Steam-Atlas/1.0 (+local desktop application)")
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

fn user_data_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Atlas data directory: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create Atlas data directory: {error}"))?;
    Ok((
        directory.join("user-data.json"),
        directory.join("user-data.backup.json"),
        directory.join("user-data.tmp.json"),
    ))
}

fn validate_user_data_json(json: &str) -> Result<(), String> {
    if json.len() > MAX_USER_DATA_BYTES {
        return Err("Atlas user data exceeds the 8 MiB safety limit.".to_string());
    }
    let value: Value = serde_json::from_str(json)
        .map_err(|_| "Atlas user data is not valid JSON.".to_string())?;
    let object = value
        .as_object()
        .ok_or("Atlas user data must be a JSON object.")?;
    let schema = object
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or("Atlas user data is missing a valid schema version.")?;
    if schema == 0 || schema > 100 {
        return Err("Atlas user data uses an unsupported schema version.".to_string());
    }
    if !object.get("workspaces").is_some_and(Value::is_object)
        || !object.get("sessions").is_some_and(Value::is_array)
    {
        return Err("Atlas user data has an invalid structure.".to_string());
    }
    for forbidden in ["steamApiKey", "steamLadderApiKey", "password", "accessToken"] {
        if object.contains_key(forbidden) {
            return Err("Sensitive credentials cannot be stored in Atlas user data.".to_string());
        }
    }
    Ok(())
}

fn read_valid_user_data(path: &Path) -> Result<Option<String>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Could not inspect Atlas user data: {error}"))?;
    if metadata.len() > MAX_USER_DATA_BYTES as u64 {
        return Err("Atlas user data exceeds the 8 MiB safety limit.".to_string());
    }
    let json = fs::read_to_string(path)
        .map_err(|error| format!("Could not read Atlas user data: {error}"))?;
    validate_user_data_json(&json)?;
    Ok(Some(json))
}

#[tauri::command]
fn load_user_data(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (primary, backup, _) = user_data_paths(&app)?;
    match read_valid_user_data(&primary) {
        Ok(Some(json)) => Ok(Some(json)),
        Ok(None) => read_valid_user_data(&backup),
        Err(primary_error) => match read_valid_user_data(&backup) {
            Ok(Some(json)) => Ok(Some(json)),
            Ok(None) => Err(format!(
                "Primary user data is invalid ({primary_error}) and no recovery copy exists."
            )),
            Err(backup_error) => Err(format!(
                "Primary user data is invalid ({primary_error}); recovery copy is also invalid ({backup_error})."
            )),
        },
    }
}

#[tauri::command]
fn save_user_data(app: tauri::AppHandle, json: String) -> Result<(), String> {
    validate_user_data_json(&json)?;
    let (primary, backup, temporary) = user_data_paths(&app)?;
    if temporary.exists() {
        fs::remove_file(&temporary)
            .map_err(|error| format!("Could not clear an interrupted Atlas save: {error}"))?;
    }
    let mut file = fs::File::create(&temporary)
        .map_err(|error| format!("Could not prepare Atlas user data: {error}"))?;
    file.write_all(json.as_bytes())
        .map_err(|error| format!("Could not write Atlas user data: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Could not finalize Atlas user data: {error}"))?;
    drop(file);

    if primary.is_file() {
        fs::copy(&primary, &backup)
            .map_err(|error| format!("Could not create the previous-data recovery copy: {error}"))?;
        fs::remove_file(&primary)
            .map_err(|error| format!("Could not rotate Atlas user data: {error}"))?;
    }
    if let Err(error) = fs::rename(&temporary, &primary) {
        if backup.is_file() {
            let _ = fs::copy(&backup, &primary);
        }
        return Err(format!("Could not atomically publish Atlas user data: {error}"));
    }
    Ok(())
}

#[tauri::command]
fn export_user_data(json: String) -> Result<Option<String>, String> {
    validate_user_data_json(&json)?;
    let value: Value = serde_json::from_str(&json)
        .map_err(|_| "Atlas user data is not valid JSON.".to_string())?;
    let content = serde_json::to_string_pretty(&value)
        .map_err(|error| format!("Could not prepare Atlas user data: {error}"))?;
    let Some(path) = rfd::FileDialog::new()
        .set_file_name("steam-atlas-personal-data.json")
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return Ok(None);
    };
    fs::write(&path, content)
        .map_err(|error| format!("Could not export Atlas user data: {error}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn import_user_data() -> Result<Option<String>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Steam Atlas personal data", &["json"])
        .pick_file()
    else {
        return Ok(None);
    };
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Could not inspect Atlas user data: {error}"))?;
    if metadata.len() > MAX_USER_DATA_BYTES as u64 {
        return Err("Atlas user data exceeds the 8 MiB safety limit.".to_string());
    }
    let json = fs::read_to_string(path)
        .map_err(|error| format!("Could not read Atlas user data: {error}"))?;
    validate_user_data_json(&json)?;
    Ok(Some(json))
}

#[tauri::command]
fn platform_info() -> PlatformInfo {
    let roots = steam_roots();
    let os_release = fs::read_to_string("/etc/os-release").unwrap_or_default().to_ascii_lowercase();
    let steam_deck = cfg!(target_os = "linux")
        && (os_release.contains("steamos")
            || os_release.contains("steam deck")
            || std::env::var("SteamDeck").is_ok());
    let proton_roots = roots
        .iter()
        .flat_map(|root| {
            [
                root.join("compatibilitytools.d"),
                root.join("steamapps/common"),
                root.join("steamapps/compatdata"),
            ]
        })
        .filter(|path| path.is_dir())
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
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
        steam_deck,
        desktop_session: std::env::var("XDG_CURRENT_DESKTOP")
            .or_else(|_| std::env::var("DESKTOP_SESSION"))
            .unwrap_or_default(),
        gamescope_available: command_available("gamescope"),
        mango_hud_available: command_available("mangohud"),
        proton_roots,
    }
}

#[tauri::command]
fn app_security_info() -> Result<AppSecurityInfo, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("Could not resolve the Atlas executable: {error}"))?
        .canonicalize()
        .map_err(|error| format!("Could not validate the Atlas executable: {error}"))?;
    Ok(AppSecurityInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        executable_sha256: hash_file(&executable)?,
        executable_path: executable.to_string_lossy().to_string(),
        build_type: if cfg!(debug_assertions) { "debug" } else { "release" }.to_string(),
        capabilities: vec![
            "Read detected Steam metadata".to_string(),
            "Read files and folders explicitly selected by the user".to_string(),
            "Create and restore Atlas-managed snapshots after review".to_string(),
            "Launch trusted tools and validated Steam AppIDs".to_string(),
            "Open allowlisted external resources".to_string(),
        ],
        read_scopes: vec![
            "Steam login display metadata and app manifests".to_string(),
            "Steam screenshots and artwork cache".to_string(),
            "User-selected save, configuration and diagnostic paths".to_string(),
            "Atlas application-data directory".to_string(),
        ],
        network_domains: vec![
            "store.steampowered.com".to_string(),
            "api.steampowered.com".to_string(),
            "steamcommunity.com".to_string(),
            "steamladder.com (optional)".to_string(),
            "Official Steam artwork CDNs".to_string(),
        ],
    })
}

fn command_available(name: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|directory| {
        let direct = directory.join(name);
        if direct.is_file() {
            return true;
        }
        cfg!(target_os = "windows") && ["exe", "cmd", "bat"]
            .iter()
            .any(|extension| directory.join(format!("{name}.{extension}")).is_file())
    })
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
        minimum_requirements: None,
        recommended_requirements: None,
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

fn clean_store_text(value: &str) -> String {
    Html::parse_fragment(value)
        .root_element()
        .text()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(8_000)
        .collect()
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
        minimum_requirements: data
            .get("pc_requirements")
            .and_then(|value| value.get("minimum"))
            .and_then(Value::as_str)
            .map(clean_store_text),
        recommended_requirements: data
            .get("pc_requirements")
            .and_then(|value| value.get("recommended"))
            .and_then(Value::as_str)
            .map(clean_store_text),
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
            minimum_requirements: None,
            recommended_requirements: None,
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

fn copy_folder_recursive_inner(
    source: &Path,
    destination: &Path,
    remaining: &mut usize,
    total_bytes: &mut u64,
) -> Result<u64, String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    let mut file_count = 0_u64;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            let nested_count = copy_folder_recursive_inner(
                &source_path,
                &destination_path,
                remaining,
                total_bytes,
            )?;
            file_count += nested_count;
        } else if file_type.is_file() {
            if *remaining == 0 {
                return Err("The folder exceeds Atlas's 200,000-file safety limit.".to_string());
            }
            *remaining -= 1;
            let size = entry.metadata().map(|value| value.len()).unwrap_or(0);
            *total_bytes = total_bytes.saturating_add(size);
            if *total_bytes > 50 * 1024 * 1024 * 1024 {
                return Err("The folder exceeds Atlas's 50 GiB backup safety limit.".to_string());
            }
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("Could not back up {}: {error}", source_path.display()))?;
            file_count += 1;
        }
    }
    Ok(file_count)
}

fn copy_folder_recursive(source: &Path, destination: &Path) -> Result<(u64, u64), String> {
    let mut remaining = 200_000_usize;
    let mut total_bytes = 0_u64;
    let file_count = copy_folder_recursive_inner(
        source,
        destination,
        &mut remaining,
        &mut total_bytes,
    )?;
    Ok((file_count, total_bytes))
}

fn inspect_folder_recursive(source: &Path, remaining: &mut usize) -> Result<(u64, u64), String> {
    if *remaining == 0 {
        return Err("The folder exceeds Atlas's 200,000-file safety limit.".to_string());
    }
    let mut file_count = 0_u64;
    let mut total_bytes = 0_u64;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        if *remaining == 0 {
            return Err("The folder exceeds Atlas's 200,000-file safety limit.".to_string());
        }
        *remaining -= 1;
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            let (nested_count, nested_bytes) = inspect_folder_recursive(&entry.path(), remaining)?;
            file_count = file_count.saturating_add(nested_count);
            total_bytes = total_bytes.saturating_add(nested_bytes);
        } else if file_type.is_file() {
            file_count = file_count.saturating_add(1);
            total_bytes = total_bytes.saturating_add(entry.metadata().map(|value| value.len()).unwrap_or(0));
            if total_bytes > 50 * 1024 * 1024 * 1024 {
                return Err("The folder exceeds Atlas's 50 GiB backup safety limit.".to_string());
            }
        }
    }
    Ok((file_count, total_bytes))
}

fn backup_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Atlas data directory: {error}"))?
        .join("backups");
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create the backup vault: {error}"))?;
    root.canonicalize()
        .map_err(|error| format!("Could not validate the backup vault: {error}"))
}

fn safe_folder_name(path: &Path, fallback: &str) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(fallback)
        .replace(
            |value: char| !value.is_ascii_alphanumeric() && value != '-' && value != '_',
            "_",
        )
}

fn unique_backup_destination(root: &Path, name: &str) -> PathBuf {
    let timestamp = unix_timestamp();
    for suffix in 0..10_000_u32 {
        let candidate = if suffix == 0 {
            root.join(format!("{name}-{timestamp}"))
        } else {
            root.join(format!("{name}-{timestamp}-{suffix}"))
        };
        if !candidate.exists() {
            return candidate;
        }
    }
    root.join(format!("{name}-{timestamp}-overflow"))
}

fn backup_manifest_path(backup: &Path) -> Result<PathBuf, String> {
    let file_name = backup
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The snapshot name is not valid UTF-8.".to_string())?;
    Ok(backup.with_file_name(format!("{file_name}{BACKUP_MANIFEST_SUFFIX}")))
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open {} for verification: {error}", path.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not verify {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn collect_manifest_files(
    root: &Path,
    current: &Path,
    remaining: &mut usize,
    output: &mut Vec<BackupManifestFile>,
) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|error| error.to_string())? {
        if *remaining == 0 {
            return Err("The snapshot exceeds Atlas's 200,000-file safety limit.".to_string());
        }
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            return Err("A symbolic link appeared inside the snapshot during verification.".to_string());
        }
        if file_type.is_dir() {
            collect_manifest_files(root, &entry.path(), remaining, output)?;
        } else if file_type.is_file() {
            *remaining -= 1;
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "A snapshot file escaped its expected root.".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let size = entry.metadata().map_err(|error| error.to_string())?.len();
            output.push(BackupManifestFile {
                path: relative,
                size,
                sha256: hash_file(&path)?,
            });
        }
    }
    Ok(())
}

fn write_backup_manifest(backup: &Path, source_path: &str, created_at: &str) -> Result<(), String> {
    let mut files = Vec::new();
    let mut remaining = 200_000_usize;
    collect_manifest_files(backup, backup, &mut remaining, &mut files)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    let manifest = BackupManifest {
        schema_version: 1,
        created_at: created_at.to_string(),
        source_path: source_path.to_string(),
        files,
    };
    let path = backup_manifest_path(backup)?;
    let temporary = path.with_extension("json.tmp");
    let encoded = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("Could not encode the snapshot integrity manifest: {error}"))?;
    fs::write(&temporary, encoded)
        .map_err(|error| format!("Could not write the snapshot integrity manifest: {error}"))?;
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not finalize the snapshot integrity manifest: {error}"))
}

fn verify_backup_path(backup: &Path) -> Result<BackupIntegrityResult, String> {
    let manifest_path = backup_manifest_path(backup)?;
    if !manifest_path.is_file() {
        let mut remaining = 200_000_usize;
        let (file_count, total_bytes) = inspect_folder_recursive(backup, &mut remaining)?;
        return Ok(BackupIntegrityResult {
            status: "legacy-unverified".to_string(),
            file_count,
            total_bytes,
            checked_at: unix_timestamp().to_string(),
        });
    }
    let encoded = fs::read(&manifest_path)
        .map_err(|error| format!("Could not read the snapshot integrity manifest: {error}"))?;
    if encoded.len() > 64 * 1024 * 1024 {
        return Err("The snapshot integrity manifest is unexpectedly large.".to_string());
    }
    let manifest: BackupManifest = serde_json::from_slice(&encoded)
        .map_err(|error| format!("The snapshot integrity manifest is invalid: {error}"))?;
    if manifest.schema_version != 1 {
        return Err("This snapshot uses an unsupported integrity-manifest version.".to_string());
    }
    let mut current = Vec::new();
    let mut remaining = 200_000_usize;
    collect_manifest_files(backup, backup, &mut remaining, &mut current)?;
    let expected: HashMap<_, _> = manifest
        .files
        .iter()
        .map(|file| (file.path.as_str(), (file.size, file.sha256.as_str())))
        .collect();
    if expected.len() != manifest.files.len() || current.len() != manifest.files.len() {
        return Err("Snapshot verification failed: files were added, removed, or duplicated.".to_string());
    }
    let mut total_bytes = 0_u64;
    for file in &current {
        let Some((size, sha256)) = expected.get(file.path.as_str()) else {
            return Err(format!("Snapshot verification failed: {} was not recorded.", file.path));
        };
        if *size != file.size || *sha256 != file.sha256 {
            return Err(format!("Snapshot verification failed: {} has changed.", file.path));
        }
        total_bytes = total_bytes.saturating_add(file.size);
    }
    Ok(BackupIntegrityResult {
        status: "verified-sha256".to_string(),
        file_count: current.len() as u64,
        total_bytes,
        checked_at: unix_timestamp().to_string(),
    })
}

fn validated_backup_path(app: &tauri::AppHandle, value: &str) -> Result<PathBuf, String> {
    let root = backup_root(app)?;
    let path = PathBuf::from(value);
    if !path.is_dir() {
        return Err("The selected snapshot no longer exists.".to_string());
    }
    let path = path
        .canonicalize()
        .map_err(|error| format!("Could not validate the snapshot: {error}"))?;
    if path == root || !path.starts_with(&root) {
        return Err("Atlas only restores snapshots from its protected backup vault.".to_string());
    }
    Ok(path)
}

#[tauri::command]
fn backup_folder(app: tauri::AppHandle, source_path: String) -> Result<BackupRecord, String> {
    let source = PathBuf::from(&source_path);
    if !source.is_dir() {
        return Err("The selected backup source is not a folder.".to_string());
    }
    let timestamp = unix_timestamp();
    let canonical_source = source
        .canonicalize()
        .map_err(|error| format!("Could not validate the backup source: {error}"))?;
    let root = backup_root(&app)?;
    if canonical_source.starts_with(&root) {
        return Err("A backup source cannot be inside Atlas's own backup vault.".to_string());
    }
    let mut remaining = 200_000_usize;
    inspect_folder_recursive(&canonical_source, &mut remaining)?;
    let safe_name = safe_folder_name(&source, "backup");
    let destination = unique_backup_destination(&root, &safe_name);
    let (file_count, total_bytes) = match copy_folder_recursive(&canonical_source, &destination) {
        Ok(result) => result,
        Err(error) => {
            let _ = fs::remove_dir_all(&destination);
            return Err(error);
        }
    };
    let created_at = timestamp.to_string();
    if let Err(error) = write_backup_manifest(&destination, &source_path, &created_at) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }
    Ok(BackupRecord {
        id: format!("backup-{timestamp}"),
        source_path,
        backup_path: destination.to_string_lossy().to_string(),
        created_at,
        file_count,
        total_bytes,
        integrity: "verified-sha256".to_string(),
    })
}

#[tauri::command]
fn verify_backup_integrity(
    app: tauri::AppHandle,
    backup_path: String,
) -> Result<BackupIntegrityResult, String> {
    let backup = validated_backup_path(&app, &backup_path)?;
    verify_backup_path(&backup)
}

#[tauri::command]
fn delete_backup_snapshot(app: tauri::AppHandle, backup_path: String) -> Result<(), String> {
    let root = backup_root(&app)?;
    let backup = validated_backup_path(&app, &backup_path)?;
    if backup.parent() != Some(root.as_path()) {
        return Err("Atlas only removes complete top-level snapshots from its vault.".to_string());
    }
    let manifest = backup_manifest_path(&backup)?;
    fs::remove_dir_all(&backup)
        .map_err(|error| format!("Could not remove the selected snapshot: {error}"))?;
    if manifest.is_file() {
        fs::remove_file(&manifest)
            .map_err(|error| format!("The snapshot was removed, but its integrity record remains: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn preview_backup_restore(
    app: tauri::AppHandle,
    backup_path: String,
    destination_path: String,
) -> Result<BackupPreview, String> {
    let backup = validated_backup_path(&app, &backup_path)?;
    let destination = PathBuf::from(&destination_path);
    if !destination.is_dir() {
        return Err("The restore destination is not an existing folder.".to_string());
    }
    let destination = destination
        .canonicalize()
        .map_err(|error| format!("Could not validate the restore destination: {error}"))?;
    let root = backup_root(&app)?;
    if destination.starts_with(&root) || backup.starts_with(&destination) || destination.starts_with(&backup) {
        return Err("The snapshot and restore destination must be separate folders.".to_string());
    }
    let mut remaining = 200_000_usize;
    let (file_count, total_bytes) = inspect_folder_recursive(&backup, &mut remaining)?;
    let integrity = verify_backup_path(&backup)?.status;
    Ok(BackupPreview {
        backup_path: backup.to_string_lossy().to_string(),
        destination_path: destination.to_string_lossy().to_string(),
        file_count,
        total_bytes,
        recovery_will_be_created: true,
        integrity,
    })
}

#[tauri::command]
fn restore_backup(
    app: tauri::AppHandle,
    backup_path: String,
    destination_path: String,
) -> Result<RestoreResult, String> {
    let preview = preview_backup_restore(app.clone(), backup_path, destination_path)?;
    let backup = PathBuf::from(&preview.backup_path);
    let destination = PathBuf::from(&preview.destination_path);
    let root = backup_root(&app)?;
    let recovery_name = format!("recovery-{}", safe_folder_name(&destination, "restore"));
    let recovery_path = unique_backup_destination(&root, &recovery_name);
    let created_at = unix_timestamp();
    let (recovery_files, recovery_bytes) = copy_folder_recursive(&destination, &recovery_path)?;
    let recovery_created_at = created_at.to_string();
    if let Err(error) = write_backup_manifest(
        &recovery_path,
        &destination.to_string_lossy(),
        &recovery_created_at,
    ) {
        let _ = fs::remove_dir_all(&recovery_path);
        return Err(error);
    }
    let recovery_backup = BackupRecord {
        id: format!("recovery-{created_at}"),
        source_path: destination.to_string_lossy().to_string(),
        backup_path: recovery_path.to_string_lossy().to_string(),
        created_at: recovery_created_at,
        file_count: recovery_files,
        total_bytes: recovery_bytes,
        integrity: "verified-sha256".to_string(),
    };
    let (restored_file_count, restored_bytes) = copy_folder_recursive(&backup, &destination)
        .map_err(|error| format!("Restore stopped after creating a recovery snapshot: {error}"))?;
    Ok(RestoreResult {
        restored_file_count,
        restored_bytes,
        recovery_backup,
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

#[tauri::command]
fn scan_game_screenshots(app_id: String) -> Result<Vec<ScreenshotRecord>, String> {
    if app_id.is_empty() || app_id.len() > 20 || !app_id.chars().all(|value| value.is_ascii_digit()) {
        return Err("The screenshot AppID must contain digits only.".to_string());
    }
    let mut paths = Vec::new();
    for root in steam_roots() {
        let userdata = root.join("userdata");
        let Ok(users) = fs::read_dir(userdata) else {
            continue;
        };
        for user in users.flatten().filter(|entry| entry.path().is_dir()) {
            let screenshots = user
                .path()
                .join("760/remote")
                .join(&app_id)
                .join("screenshots");
            if screenshots.is_dir() {
                visit_files(
                    &screenshots,
                    2,
                    &mut paths,
                    &["jpg", "jpeg", "png", "webp"],
                    500,
                );
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
    paths.truncate(120);
    Ok(paths
        .into_iter()
        .filter_map(|path| {
            let metadata = fs::metadata(&path).ok()?;
            if metadata.len() > 8 * 1024 * 1024 {
                return None;
            }
            let modified = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_secs().to_string())
                .unwrap_or_default();
            Some(ScreenshotRecord {
                id: format!("shot-{}-{modified}", metadata.len()),
                app_id: app_id.clone(),
                file_name: path.file_name()?.to_string_lossy().to_string(),
                file_path: path.to_string_lossy().to_string(),
                preview_data_url: data_url_for_file(&path)?,
                size: metadata.len(),
                modified_at: modified,
            })
        })
        .collect())
}

#[tauri::command]
fn export_screenshot(path: String) -> Result<Option<String>, String> {
    let source = PathBuf::from(&path);
    if !source.is_file() {
        return Err("The selected screenshot no longer exists.".to_string());
    }
    let source = source
        .canonicalize()
        .map_err(|error| format!("Could not validate the screenshot: {error}"))?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !["jpg", "jpeg", "png", "webp"].contains(&extension.as_str()) {
        return Err("Atlas only exports supported image files.".to_string());
    }
    let inside_steam_screenshots = steam_roots().into_iter().any(|root| {
        root.canonicalize().ok().is_some_and(|root| {
            source.starts_with(root)
                && source.components().any(|part| {
                    part.as_os_str().to_string_lossy().eq_ignore_ascii_case("screenshots")
                })
        })
    });
    if !inside_steam_screenshots {
        return Err("Atlas only exports screenshots from detected Steam libraries.".to_string());
    }
    if fs::metadata(&source).map(|value| value.len()).unwrap_or(u64::MAX) > MAX_LOCAL_IMAGE_BYTES {
        return Err("The screenshot exceeds Atlas's 12 MiB export limit.".to_string());
    }
    let file_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("steam-screenshot.png");
    let Some(destination) = rfd::FileDialog::new()
        .set_file_name(file_name)
        .add_filter("Image", &[extension.as_str()])
        .save_file()
    else {
        return Ok(None);
    };
    fs::copy(&source, &destination)
        .map_err(|error| format!("Could not export the screenshot: {error}"))?;
    Ok(Some(destination.to_string_lossy().to_string()))
}

fn read_config_text(path: &Path) -> Result<String, String> {
    const CONFIG_EXTENSIONS: &[&str] = &["cfg", "conf", "ini", "json", "toml", "txt", "vdf", "xml", "yaml", "yml"];
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !CONFIG_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Select a supported text configuration file.".to_string());
    }
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Could not inspect the configuration file: {error}"))?;
    if metadata.len() > 2 * 1024 * 1024 {
        return Err("Configuration files must be 2 MiB or smaller.".to_string());
    }
    let content = fs::read_to_string(path)
        .map_err(|_| "The configuration file is not valid UTF-8 text.".to_string())?;
    if content.contains('\0') {
        return Err("Binary configuration files cannot be compared as text.".to_string());
    }
    Ok(content)
}

#[tauri::command]
fn compare_config_files() -> Result<Option<ConfigDiff>, String> {
    let files = rfd::FileDialog::new()
        .add_filter(
            "Text configuration files",
            &["cfg", "conf", "ini", "json", "toml", "txt", "vdf", "xml", "yaml", "yml"],
        )
        .pick_files()
        .unwrap_or_default();
    if files.is_empty() {
        return Ok(None);
    }
    if files.len() != 2 {
        return Err("Select exactly two configuration files to compare.".to_string());
    }
    let before_path = files[0]
        .canonicalize()
        .map_err(|error| format!("Could not validate the first configuration: {error}"))?;
    let after_path = files[1]
        .canonicalize()
        .map_err(|error| format!("Could not validate the second configuration: {error}"))?;
    if before_path == after_path {
        return Err("Select two different configuration files.".to_string());
    }
    let before = read_config_text(&before_path)?;
    let after = read_config_text(&after_path)?;
    let before_lines = before.lines().collect::<Vec<_>>();
    let after_lines = after.lines().collect::<Vec<_>>();
    let max_lines = before_lines.len().max(after_lines.len());
    let mut changes = Vec::new();
    let mut truncated = false;
    for index in 0..max_lines {
        let left = before_lines.get(index).copied();
        let right = after_lines.get(index).copied();
        if left == right {
            continue;
        }
        if changes.len() == 500 {
            truncated = true;
            break;
        }
        changes.push(ConfigDiffLine {
            line: index + 1,
            before: left.map(|value| value.chars().take(2_000).collect()),
            after: right.map(|value| value.chars().take(2_000).collect()),
        });
    }
    Ok(Some(ConfigDiff {
        before_path: before_path.to_string_lossy().to_string(),
        after_path: after_path.to_string_lossy().to_string(),
        before_lines: before_lines.len(),
        after_lines: after_lines.len(),
        truncated,
        changes,
    }))
}

#[tauri::command]
fn choose_workspace_artwork(
    app: tauri::AppHandle,
    app_id: String,
    kind: String,
) -> Result<Option<String>, String> {
    if app_id.is_empty() || app_id.len() > 20 || !app_id.chars().all(|value| value.is_ascii_digit()) {
        return Err("The artwork AppID must contain digits only.".to_string());
    }
    if !["grid", "portrait", "hero", "logo"].contains(&kind.as_str()) {
        return Err("Unsupported artwork type.".to_string());
    }
    let Some(source) = rfd::FileDialog::new()
        .add_filter("Artwork images", &["jpg", "jpeg", "png", "webp"])
        .pick_file()
    else {
        return Ok(None);
    };
    let metadata = fs::metadata(&source)
        .map_err(|error| format!("Could not inspect the artwork: {error}"))?;
    if metadata.len() > MAX_LOCAL_IMAGE_BYTES {
        return Err("Artwork must be 12 MiB or smaller.".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Atlas data directory: {error}"))?
        .join("workspace-artwork")
        .join(&app_id);
    let history = directory.join("history");
    fs::create_dir_all(&history)
        .map_err(|error| format!("Could not create the artwork history: {error}"))?;
    if let Ok(entries) = fs::read_dir(&directory) {
        for entry in entries.flatten().filter(|entry| entry.path().is_file()) {
            let path = entry.path();
            if path.file_stem().and_then(|value| value.to_str()) == Some(kind.as_str()) {
                let old_extension = path.extension().and_then(|value| value.to_str()).unwrap_or("png");
                let backup = history.join(format!("{kind}-{}.{}", unix_timestamp(), old_extension));
                fs::copy(&path, backup)
                    .map_err(|error| format!("Could not preserve the previous artwork: {error}"))?;
                fs::remove_file(path)
                    .map_err(|error| format!("Could not rotate the previous artwork: {error}"))?;
            }
        }
    }
    let destination = directory.join(format!("{kind}.{extension}"));
    fs::copy(source, &destination)
        .map_err(|error| format!("Could not copy the selected artwork: {error}"))?;
    Ok(Some(destination.to_string_lossy().to_string()))
}

fn artwork_stem(app_id: &str, kind: &str) -> Result<String, String> {
    if app_id.is_empty() || app_id.len() > 20 || !app_id.chars().all(|value| value.is_ascii_digit()) {
        return Err("The artwork AppID must contain digits only.".to_string());
    }
    match kind {
        "grid" => Ok(app_id.to_string()),
        "portrait" => Ok(format!("{app_id}p")),
        "hero" => Ok(format!("{app_id}_hero")),
        "logo" => Ok(format!("{app_id}_logo")),
        _ => Err("Unsupported artwork type.".to_string()),
    }
}

fn steam_account_grid_root(steam_id: &str) -> Result<(String, PathBuf), String> {
    const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;
    if steam_id.len() != 17 || !steam_id.chars().all(|value| value.is_ascii_digit()) {
        return Err("Select a valid local Steam account.".to_string());
    }
    let id64 = steam_id
        .parse::<u64>()
        .map_err(|_| "The selected SteamID is invalid.".to_string())?;
    let account_id = id64
        .checked_sub(STEAM_ID64_BASE)
        .ok_or("The selected SteamID is outside the supported range.")?
        .to_string();
    for root in steam_roots() {
        let account_root = root.join("userdata").join(&account_id);
        if account_root.is_dir() {
            let grid = account_root.join("config/grid");
            fs::create_dir_all(&grid)
                .map_err(|error| format!("Could not create the Steam artwork folder: {error}"))?;
            let grid = grid
                .canonicalize()
                .map_err(|error| format!("Could not validate the Steam artwork folder: {error}"))?;
            return Ok((account_id, grid));
        }
    }
    Err("The selected account's local Steam userdata folder was not found.".to_string())
}

fn artwork_backup_root(
    app: &tauri::AppHandle,
    account_id: &str,
    app_id: &str,
    kind: &str,
) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Atlas data directory: {error}"))?
        .join("steam-artwork-backups")
        .join(account_id)
        .join(app_id)
        .join(kind);
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create Steam artwork history: {error}"))?;
    root.canonicalize()
        .map_err(|error| format!("Could not validate Steam artwork history: {error}"))
}

fn unique_artwork_backup(root: &Path, file_name: &str) -> PathBuf {
    let timestamp = unix_timestamp();
    for suffix in 0..10_000_u32 {
        let name = if suffix == 0 {
            format!("{timestamp}-{file_name}")
        } else {
            format!("{timestamp}-{suffix}-{file_name}")
        };
        let candidate = root.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    root.join(format!("{timestamp}-overflow-{file_name}"))
}

fn current_steam_artwork(grid: &Path, stem: &str) -> Vec<PathBuf> {
    let mut paths = fs::read_dir(grid)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path.file_stem().and_then(|value| value.to_str()) == Some(stem)
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|extension| ["jpg", "jpeg", "png", "webp"].contains(&extension.to_ascii_lowercase().as_str()))
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths
}

fn preserve_current_artwork(
    current: &[PathBuf],
    backup_root: &Path,
) -> Result<Option<String>, String> {
    let mut primary_backup = None;
    for path in current {
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("artwork.png");
        let backup = unique_artwork_backup(backup_root, file_name);
        fs::copy(path, &backup)
            .map_err(|error| format!("Could not preserve existing Steam artwork: {error}"))?;
        if primary_backup.is_none() {
            primary_backup = Some(backup.to_string_lossy().to_string());
        }
    }
    Ok(primary_backup)
}

#[tauri::command]
fn install_steam_artwork(
    app: tauri::AppHandle,
    app_id: String,
    steam_id: String,
    kind: String,
    source_path: String,
) -> Result<ArtworkInstallResult, String> {
    let stem = artwork_stem(&app_id, &kind)?;
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err("Choose artwork inside this Atlas workspace first.".to_string());
    }
    let source = source
        .canonicalize()
        .map_err(|error| format!("Could not validate the Atlas artwork: {error}"))?;
    let managed_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Atlas data directory: {error}"))?
        .join("workspace-artwork")
        .join(&app_id)
        .canonicalize()
        .map_err(|error| format!("Could not validate managed artwork storage: {error}"))?;
    if !source.starts_with(&managed_root)
        || source.components().any(|part| part.as_os_str().to_string_lossy() == "history")
    {
        return Err("Steam artwork must come from the active Atlas workspace asset.".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !["jpg", "jpeg", "png", "webp"].contains(&extension.as_str()) {
        return Err("Unsupported artwork image format.".to_string());
    }
    let (account_id, grid) = steam_account_grid_root(&steam_id)?;
    let backup_root = artwork_backup_root(&app, &account_id, &app_id, &kind)?;
    let current = current_steam_artwork(&grid, &stem);
    let backup_path = preserve_current_artwork(&current, &backup_root)?;
    for path in current {
        fs::remove_file(path)
            .map_err(|error| format!("Could not rotate existing Steam artwork: {error}"))?;
    }
    let target = grid.join(format!("{stem}.{extension}"));
    fs::copy(&source, &target)
        .map_err(|error| format!("Could not install Steam artwork: {error}"))?;
    Ok(ArtworkInstallResult {
        target_path: target.to_string_lossy().to_string(),
        backup_path,
    })
}

#[tauri::command]
fn restore_steam_artwork(
    app: tauri::AppHandle,
    app_id: String,
    steam_id: String,
    kind: String,
    backup_path: String,
) -> Result<ArtworkInstallResult, String> {
    let stem = artwork_stem(&app_id, &kind)?;
    let (account_id, grid) = steam_account_grid_root(&steam_id)?;
    let backup_root = artwork_backup_root(&app, &account_id, &app_id, &kind)?;
    let backup = PathBuf::from(&backup_path)
        .canonicalize()
        .map_err(|error| format!("Could not validate the artwork backup: {error}"))?;
    if !backup.is_file() || !backup.starts_with(&backup_root) {
        return Err("Atlas only restores artwork from its managed history.".to_string());
    }
    let extension = backup
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !["jpg", "jpeg", "png", "webp"].contains(&extension.as_str()) {
        return Err("The artwork backup has an unsupported format.".to_string());
    }
    let current = current_steam_artwork(&grid, &stem);
    let current_backup = preserve_current_artwork(&current, &backup_root)?;
    for path in current {
        fs::remove_file(path)
            .map_err(|error| format!("Could not rotate current Steam artwork: {error}"))?;
    }
    let target = grid.join(format!("{stem}.{extension}"));
    fs::copy(&backup, &target)
        .map_err(|error| format!("Could not restore Steam artwork: {error}"))?;
    Ok(ArtworkInstallResult {
        target_path: target.to_string_lossy().to_string(),
        backup_path: current_backup,
    })
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
            file_path: redact_sensitive_text(&path.to_string_lossy()),
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
    let excerpt = redact_sensitive_text(&content
        .lines()
        .rev()
        .take(100)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n"));
    Ok(Some(CrashReport {
        file_path: redact_sensitive_text(&path.to_string_lossy()),
        category: category.to_string(),
        confidence: confidence.to_string(),
        summary: summary.to_string(),
        suggestions,
        excerpt,
    }))
}

fn redact_sensitive_text(input: &str) -> String {
    let mut output = input.to_string();
    if let Some(home) = dirs::home_dir() {
        let home = home.to_string_lossy();
        if !home.is_empty() {
            output = output.replace(home.as_ref(), "[HOME]");
        }
    }
    for (pattern, replacement) in [
        (r"\b7656119\d{10}\b", "[STEAM_ID]"),
        (r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[EMAIL]"),
        (r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[IP_ADDRESS]"),
        (r"(?i)(api[_ -]?key|access[_ -]?token|password)\s*[:=]\s*[^\s,;]+", "$1=[REDACTED]"),
    ] {
        if let Ok(regex) = Regex::new(pattern) {
            output = regex.replace_all(&output, replacement).into_owned();
        }
    }
    output
}

fn linux_memory_bytes() -> Option<u64> {
    let content = fs::read_to_string("/proc/meminfo").ok()?;
    let kilobytes = content
        .lines()
        .find(|line| line.starts_with("MemTotal:"))?
        .split_whitespace()
        .nth(1)?
        .parse::<u64>()
        .ok()?;
    Some(kilobytes.saturating_mul(1024))
}

fn local_cpu_name() -> String {
    if let Ok(value) = std::env::var("PROCESSOR_IDENTIFIER") {
        if !value.trim().is_empty() {
            return value.trim().to_string();
        }
    }
    fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                let (key, value) = line.split_once(':')?;
                (key.trim() == "model name").then(|| value.trim().to_string())
            })
        })
        .unwrap_or_else(|| "Unavailable without additional system access".to_string())
}

#[tauri::command]
fn system_diagnostics() -> SystemDiagnostics {
    let platform = platform_info();
    SystemDiagnostics {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: platform.os,
        architecture: platform.architecture,
        cpu: local_cpu_name(),
        memory_bytes: if cfg!(target_os = "linux") { linux_memory_bytes() } else { None },
        steam_roots: platform
            .steam_roots
            .iter()
            .map(|path| redact_sensitive_text(path))
            .collect(),
        flatpak_steam: platform.flatpak_steam,
        steam_deck: platform.steam_deck,
        desktop_session: platform.desktop_session,
        secure_storage: platform.secure_storage,
        package_formats: platform.package_formats,
        notes: vec![
            "Atlas diagnostics are generated locally.".to_string(),
            "Home-directory paths, SteamIDs, email addresses, IP addresses, passwords, tokens, and API-key values are redacted from exports.".to_string(),
            "No diagnostic report is uploaded automatically.".to_string(),
        ],
    }
}

fn sanitize_diagnostic_value(value: &mut Value) {
    match value {
        Value::String(text) => *text = redact_sensitive_text(text),
        Value::Array(items) => items.iter_mut().for_each(sanitize_diagnostic_value),
        Value::Object(object) => {
            object.retain(|key, nested| {
                let normalized = key
                    .to_ascii_lowercase()
                    .chars()
                    .filter(|character| !matches!(character, '_' | '-' | ' '))
                    .collect::<String>();
                let safe = !["steamapikey", "steamladderapikey", "password", "accesstoken", "token"]
                    .contains(&normalized.as_str());
                if safe {
                    sanitize_diagnostic_value(nested);
                }
                safe
            });
        }
        _ => {}
    }
}

#[tauri::command]
fn export_diagnostics(json: String) -> Result<Option<String>, String> {
    if json.len() > 2 * 1024 * 1024 {
        return Err("The diagnostic report exceeds the 2 MiB export limit.".to_string());
    }
    let mut value: Value = serde_json::from_str(&json)
        .map_err(|_| "The diagnostic report is not valid JSON.".to_string())?;
    if !value.is_object() {
        return Err("The diagnostic report must be a JSON object.".to_string());
    }
    sanitize_diagnostic_value(&mut value);
    let content = serde_json::to_string_pretty(&value)
        .map_err(|error| format!("Could not prepare the diagnostic report: {error}"))?;
    let Some(path) = rfd::FileDialog::new()
        .set_file_name("steam-atlas-diagnostics.json")
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return Ok(None);
    };
    fs::write(&path, content)
        .map_err(|error| format!("Could not export the diagnostic report: {error}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
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

fn steam_launch_url(app_id: &str, args: &[String]) -> Result<String, String> {
    if app_id.is_empty() || app_id.len() > 20 || !app_id.chars().all(|value| value.is_ascii_digit()) {
        return Err("The Steam AppID must contain digits only.".to_string());
    }
    let parsed = app_id
        .parse::<u64>()
        .map_err(|_| "The Steam AppID is invalid.".to_string())?;
    if parsed == 0 {
        return Err("The Steam AppID must be greater than zero.".to_string());
    }
    if args.len() > 64
        || args.iter().any(|value| {
            value.len() > 2_048
                || value.chars().any(|character| character == '\0' || character == '\r' || character == '\n')
        })
    {
        return Err("The launch profile exceeds Atlas safety limits.".to_string());
    }
    let arguments = args
        .iter()
        .map(|value| urlencoding::encode(value).into_owned())
        .collect::<Vec<_>>()
        .join("%20");
    if arguments.is_empty() {
        Ok(format!("steam://run/{app_id}"))
    } else {
        Ok(format!("steam://run/{app_id}//{arguments}/"))
    }
}

#[tauri::command]
fn launch_steam_game(app_id: String, args: Vec<String>) -> Result<(), String> {
    let url = steam_launch_url(&app_id, &args)?;
    open::that(&url).map_err(|error| format!("Steam could not accept the launch request: {error}"))
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    if path.len() > 32_768 || path.chars().any(|character| character == '\0') {
        return Err("The selected path is invalid.".to_string());
    }
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("The selected file or folder no longer exists.".to_string());
    }
    let path = path
        .canonicalize()
        .map_err(|error| format!("Could not validate the selected path: {error}"))?;
    open::that(path).map_err(|error| format!("The operating system could not reveal this path: {error}"))
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
                "kaspersky.com",
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
                minimum_requirements: None,
                recommended_requirements: None,
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
            app_security_info,
            load_secrets,
            save_secrets,
            load_user_data,
            save_user_data,
            export_user_data,
            import_user_data,
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
            verify_backup_integrity,
            delete_backup_snapshot,
            preview_backup_restore,
            restore_backup,
            launch_steam_game,
            reveal_path,
            scan_steam_screenshots,
            scan_game_screenshots,
            export_screenshot,
            compare_config_files,
            choose_workspace_artwork,
            install_steam_artwork,
            restore_steam_artwork,
            scan_orphaned_game_folders,
            analyze_crash_log,
            system_diagnostics,
            export_diagnostics,
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
            "https://support.kaspersky.com/1870",
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

    #[test]
    fn steam_launch_url_encodes_explicit_argument_values() {
        let url = steam_launch_url(
            "730",
            &["-novid".to_string(), "-w 1920".to_string()],
        )
        .unwrap();
        assert_eq!(url, "steam://run/730//-novid%20-w%201920/");
    }

    #[test]
    fn steam_launch_url_rejects_invalid_ids_and_multiline_arguments() {
        assert!(steam_launch_url("not-a-number", &[]).is_err());
        assert!(steam_launch_url("0", &[]).is_err());
        assert!(steam_launch_url("730", &["-safe\n+quit".to_string()]).is_err());
    }

    #[test]
    fn diagnostic_redaction_removes_common_sensitive_values() {
        let redacted = redact_sensitive_text(
            "steam=76561198012345678 email=user@example.com ip=192.168.1.2 api_key=secret",
        );
        assert!(!redacted.contains("76561198012345678"));
        assert!(!redacted.contains("user@example.com"));
        assert!(!redacted.contains("192.168.1.2"));
        assert!(!redacted.contains("secret"));
        assert!(redacted.contains("[STEAM_ID]"));
    }

    #[test]
    fn artwork_names_follow_steam_grid_conventions() {
        assert_eq!(artwork_stem("730", "grid").unwrap(), "730");
        assert_eq!(artwork_stem("730", "portrait").unwrap(), "730p");
        assert_eq!(artwork_stem("730", "hero").unwrap(), "730_hero");
        assert_eq!(artwork_stem("730", "logo").unwrap(), "730_logo");
        assert!(artwork_stem("../730", "grid").is_err());
        assert!(artwork_stem("730", "unknown").is_err());
    }

    #[test]
    fn store_requirement_html_is_reduced_to_bounded_text() {
        let text = clean_store_text("<strong>Minimum:</strong><br>Windows 10 &amp; 8 GB RAM");
        assert!(text.contains("Minimum:"));
        assert!(text.contains("Windows 10 & 8 GB RAM"));
        assert!(!text.contains('<'));
    }

    #[test]
    fn backup_integrity_manifest_detects_changed_files() {
        let root = std::env::temp_dir().join(format!(
            "steam-atlas-integrity-test-{}-{}",
            std::process::id(),
            unix_timestamp()
        ));
        let backup = root.join("snapshot");
        fs::create_dir_all(backup.join("nested")).unwrap();
        fs::write(backup.join("save.dat"), b"original save").unwrap();
        fs::write(backup.join("nested").join("config.ini"), b"quality=high").unwrap();

        write_backup_manifest(&backup, "test-source", "1").unwrap();
        let verified = verify_backup_path(&backup).unwrap();
        assert_eq!(verified.status, "verified-sha256");
        assert_eq!(verified.file_count, 2);

        fs::write(backup.join("save.dat"), b"tampered save").unwrap();
        assert!(verify_backup_path(&backup).is_err());

        let _ = fs::remove_dir_all(&root);
    }
}
