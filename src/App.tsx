import {
  Activity,
  AppWindow,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  CircleGauge,
  Clock3,
  CloudDownload,
  Command,
  Database,
  ExternalLink,
  FileArchive,
  FolderOpen,
  Gamepad2,
  Globe2,
  HardDrive,
  Heart,
  KeyRound,
  Layers3,
  LibraryBig,
  Link2,
  ListFilter,
  Menu,
  MoreHorizontal,
  PackageCheck,
  PanelLeftClose,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  TerminalSquare,
  Trash2,
  Trophy,
  UserRound,
  Users,
  Wrench,
  X,
  Zap
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState
} from "react";
import { bridge, isDesktop, localAssetUrl } from "./bridge";
import { DarkSelect } from "./components/DarkSelect";
import { GameImage } from "./components/GameImage";
import { AtlasLogo } from "./components/AtlasLogo";
import {
  featuredGames,
  installedGames,
  sampleAccounts,
  sampleManifests,
  sampleTools
} from "./data";
import { PowerSuite } from "./PowerSuite";
import { GameWorkspace } from "./GameWorkspace";
import {
  loadAtlasData,
  parseAtlasData,
  saveAtlasData,
  serializeAtlasData,
  withWorkspace
} from "./storage";
import type {
  AtlasUserData,
  AppSettings,
  ExternalTool,
  Game,
  GameWorkspaceData,
  ManifestEntry,
  Page,
  PlatformInfo,
  SteamAccount
} from "./types";

const defaultSettings: AppSettings = {
  steamApiKey: "",
  steamLadderApiKey: "",
  countryCode: "TR",
  currency: "TRY",
  accent: "#66e3ff",
  secondaryAccent: "#a78bfa",
  compactMode: false,
  steamPath: "",
  backgroundImagePath: "",
  backgroundPreset: "nebula",
  backgroundOpacity: 34,
  backgroundBlur: 2,
  backgroundSaturation: 105,
  overlayStrength: 74,
  panelOpacity: 92,
  sidebarOpacity: 96,
  topbarOpacity: 88,
  cornerRadius: 17,
  glowIntensity: 48,
  uiScale: 100,
  density: "comfortable",
  oledMode: false,
  reduceMotion: false,
  theme: "system"
};

const navItems: { id: Page; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: CircleGauge },
  { id: "discover", label: "Discover", icon: Sparkles },
  { id: "library", label: "Library", icon: LibraryBig },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "manifests", label: "Manifest Vault", icon: Database },
  { id: "tools", label: "Tools Hub", icon: Wrench },
  { id: "power", label: "Power Suite", icon: Zap },
  { id: "settings", label: "Settings", icon: Settings }
];

const loadJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
};

const hexToRgb = (hex: string) => {
  const clean = hex.replace("#", "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((value) => `${value}${value}`)
          .join("")
      : clean;
  const value = Number.parseInt(expanded, 16);
  return Number.isFinite(value)
    ? `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`
    : "102, 227, 255";
};

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Game[]>(featuredGames);
  const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [workspaceGame, setWorkspaceGame] = useState<Game | null>(null);
  const [userData, setUserData] = useState<AtlasUserData>(loadAtlasData);
  const [userDataReady, setUserDataReady] = useState(!isDesktop());
  const [accounts, setAccounts] = useState<SteamAccount[]>([]);
  const [library, setLibrary] = useState<Game[]>([]);
  const [manifests, setManifests] = useState<ManifestEntry[]>(() =>
    loadJson("atlas.manifests", [])
  );
  const [tools, setTools] = useState<ExternalTool[]>(() =>
    loadJson("atlas.tools", [])
  );
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...defaultSettings,
    ...loadJson<Partial<AppSettings>>("atlas.settings", {})
  }));
  const [showToolModal, setShowToolModal] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    const legacySteamApiKey = settings.steamApiKey;
    const legacySteamLadderApiKey = settings.steamLadderApiKey;
    void (async () => {
      try {
        if (legacySteamApiKey || legacySteamLadderApiKey) {
          await bridge.saveSecrets(legacySteamApiKey, legacySteamLadderApiKey);
        }
        const [secrets, info] = await Promise.all([
          bridge.loadSecrets(),
          bridge.platformInfo()
        ]);
        setSettings((current) => ({
          ...current,
          steamApiKey: secrets.steamApiKey,
          steamLadderApiKey: secrets.steamLadderApiKey
        }));
        setPlatform(info);
      } catch (error) {
        notify(
          error instanceof Error
            ? `Secure storage: ${error.message}`
            : "Secure credential storage is unavailable."
        );
      }
    })();
  // Legacy values are captured once, then removed from WebView storage below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const image = settings.backgroundImagePath
      ? localAssetUrl(settings.backgroundImagePath)
      : "";
    root.style.setProperty("--accent", settings.accent);
    root.style.setProperty("--accent-rgb", hexToRgb(settings.accent));
    root.style.setProperty("--accent-secondary", settings.secondaryAccent);
    root.style.setProperty(
      "--accent-secondary-rgb",
      hexToRgb(settings.secondaryAccent)
    );
    root.style.setProperty("--background-image", image ? `url("${image}")` : "none");
    root.style.setProperty("--background-opacity", String(settings.backgroundOpacity / 100));
    root.style.setProperty("--background-blur", `${settings.backgroundBlur}px`);
    root.style.setProperty("--background-saturation", `${settings.backgroundSaturation}%`);
    root.style.setProperty("--overlay-strength", String(settings.overlayStrength / 100));
    root.style.setProperty("--panel-opacity", String(settings.panelOpacity / 100));
    root.style.setProperty("--sidebar-opacity", String(settings.sidebarOpacity / 100));
    root.style.setProperty("--topbar-opacity", String(settings.topbarOpacity / 100));
    root.style.setProperty("--radius", `${settings.cornerRadius}px`);
    root.style.setProperty("--glow-intensity", String(settings.glowIntensity / 100));
    root.style.setProperty("--ui-scale", String(settings.uiScale / 100));
    root.dataset.backgroundPreset = settings.backgroundPreset;
    root.dataset.density = settings.density;
    const systemLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const resolvedTheme = settings.theme === "system"
      ? (systemLight ? "light" : "dark")
      : settings.theme;
    root.dataset.theme = resolvedTheme;
    root.dataset.oled = String(settings.oledMode && resolvedTheme === "dark");
    root.dataset.reduceMotion = String(settings.reduceMotion);
    const { steamApiKey: _steamApiKey, steamLadderApiKey: _steamLadderApiKey, ...safeSettings } = settings;
    localStorage.setItem("atlas.settings", JSON.stringify(safeSettings));
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    localStorage.setItem("atlas.tools", JSON.stringify(tools));
  }, [tools]);

  useEffect(() => {
    localStorage.setItem("atlas.manifests", JSON.stringify(manifests));
  }, [manifests]);

  useEffect(() => {
    if (!isDesktop()) return;
    void bridge.loadUserData()
      .then((json) => {
        if (json) setUserData(parseAtlasData(json));
      })
      .catch((error) => notify(error instanceof Error ? error.message : "Atlas could not load workspace data."))
      .finally(() => setUserDataReady(true));
  }, []);

  useEffect(() => {
    if (!userDataReady) return;
    if (isDesktop()) {
      void bridge.saveUserData(serializeAtlasData(userData))
        .catch((error) => notify(error instanceof Error ? error.message : "Atlas could not save workspace data."));
      return;
    }
    try {
      saveAtlasData(userData);
    } catch {
      notify("Atlas could not save personal workspace data. Check available disk space.");
    }
  }, [userData, userDataReady]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timeout);
  }, [toast]);

  const notify = (message: string) => setToast(message);

  const openLink = async (url: string) => {
    try {
      if (isDesktop()) await bridge.openExternal(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not open the link.");
    }
  };

  const handleSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    const clean = query.trim();
    if (!clean) {
      setSearchResults(featuredGames);
      setPage("discover");
      return;
    }
    setSearching(true);
    setPage("discover");
    try {
      if (/^\d+$/.test(clean) && isDesktop()) {
        const game = await bridge.getStoreApp(Number(clean));
        setSearchResults([game]);
      } else if (isDesktop()) {
        setSearchResults(await bridge.searchStore(clean));
      } else {
        const lower = clean.toLowerCase();
        const result = featuredGames.filter(
          (game) =>
            game.name.toLowerCase().includes(lower) ||
            game.tags.some((tag) => tag.toLowerCase().includes(lower)) ||
            String(game.appid) === clean
        );
        setSearchResults(result);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Store search failed.");
    } finally {
      setSearching(false);
    }
  };

  const syncLocal = async () => {
    setSyncing(true);
    try {
      if (isDesktop()) {
        const [foundAccounts, foundGames] = await Promise.all([
          bridge.detectAccounts(),
          bridge.scanLibrary()
        ]);
        setAccounts(foundAccounts);
        setLibrary(foundGames);
        notify(
          `Detected ${foundAccounts.length} account${foundAccounts.length === 1 ? "" : "s"} and ${foundGames.length} installed games.`
        );
        const hydrated = await Promise.all(
          foundAccounts.map(async (account) => {
            try {
              const profile = await bridge.fetchAccountProfile(account.steamId);
              return {
                ...account,
                personaName: profile.personaName || account.personaName,
                avatar: profile.avatar || account.avatar,
                level: profile.level ?? account.level,
                country: profile.country || account.country
              };
            } catch {
              return account;
            }
          })
        );
        setAccounts(hydrated);
      } else {
        setAccounts(sampleAccounts);
        setLibrary(installedGames);
        notify("Preview data loaded. Desktop builds scan your real Steam folders.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Local scan failed.");
    } finally {
      setSyncing(false);
    }
  };

  const importManifests = async () => {
    try {
      const entries = isDesktop()
        ? await bridge.chooseManifests()
        : sampleManifests;
      const next = [...manifests];
      for (const entry of entries) {
        if (!next.some((existing) => existing.filePath === entry.filePath)) {
          next.unshift(entry);
        }
      }
      setManifests(next);
      notify(`${entries.length} manifest file${entries.length === 1 ? "" : "s"} inspected.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Manifest import failed.");
    }
  };

  const addExecutable = async () => {
    try {
      if (!isDesktop()) {
        setShowToolModal(true);
        return;
      }
      const path = await bridge.chooseExecutable();
      if (!path) return;
      const file = path.split(/[\\/]/).pop() ?? "New tool";
      const name = file.replace(/\.(exe|bat|cmd|ps1|lnk)$/i, "");
      setTools((current) => [
        {
          id: crypto.randomUUID(),
          name,
          description: "Custom executable",
          path,
          args: [],
          category: "Utility",
          color: settings.accent,
          favorite: false
        },
        ...current
      ]);
      notify(`${name} added to Tools Hub.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not select the file.");
    }
  };

  const launchTool = async (tool: ExternalTool) => {
    if (!isDesktop()) {
      notify("Executable launching is enabled in the compiled desktop app.");
      return;
    }
    try {
      await bridge.launchTool(tool.path, tool.args, tool.workingDirectory);
      const launched = new Date().toISOString();
      setTools((current) =>
        current.map((entry) =>
          entry.id === tool.id ? { ...entry, lastLaunched: launched } : entry
        )
      );
      notify(`${tool.name} launched.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The tool did not launch.");
    }
  };

  const addManualTool = (tool: Omit<ExternalTool, "id" | "favorite">) => {
    setTools((current) => [
      {
        ...tool,
        id: crypto.randomUUID(),
        favorite: false
      },
      ...current
    ]);
    setShowToolModal(false);
    notify(`${tool.name} added.`);
  };

  const accountCount = accounts.length || 0;
  const installedCount = library.length || 0;
  const totalSize = library.reduce(
    (sum, game) => sum + (game.sizeOnDisk ?? 0),
    0
  );
  const primaryAccount =
    accounts.find((account) => account.mostRecent) ?? accounts[0];

  const activeTitle =
    navItems.find((item) => item.id === page)?.label ?? "Overview";

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setPage("overview")}
          aria-label="Steam Atlas home"
        >
          <span className="brand-mark"><AtlasLogo /></span>
          {sidebarOpen && (
            <span className="brand-copy">
              <strong>STEAM ATLAS</strong>
              <small>CONTROL CENTER</small>
            </span>
          )}
        </button>

        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
              title={label}
            >
              <Icon size={18} strokeWidth={1.8} />
              {sidebarOpen && <span>{label}</span>}
              {sidebarOpen && id === "manifests" && manifests.length > 0 && (
                <em>{manifests.length}</em>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        {sidebarOpen && (
          <div className="local-status">
            <div className="status-head">
              <span className={`status-dot ${isDesktop() ? "online" : ""}`} />
              <span>
                {isDesktop()
                  ? `${platform?.os === "linux" ? "Linux" : "Windows"} connected`
                  : "Browser preview"}
              </span>
            </div>
            <p>
              {isDesktop()
                ? "Local-only access is ready."
                : "Compile with Tauri to enable scans and launching."}
            </p>
          </div>
        )}
        <button
          className="collapse-button"
          onClick={() => setSidebarOpen((open) => !open)}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={18} />}
          {sidebarOpen && <span>Collapse</span>}
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Atlas</span>
            <strong>{activeTitle}</strong>
          </div>
          <form className="global-search" onSubmit={handleSearch}>
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Steam or enter an AppID..."
              aria-label="Search Steam"
            />
            <kbd>Enter</kbd>
          </form>
          <button
            className="icon-button sync-button"
            onClick={syncLocal}
            title="Scan local Steam installation"
          >
            <RefreshCcw size={18} className={syncing ? "spinning" : ""} />
          </button>
          <button className="profile-chip" onClick={() => setPage("accounts")}>
            <span>
              {primaryAccount?.avatar ? (
                <img src={primaryAccount.avatar} alt="" />
              ) : (
                (primaryAccount?.personaName || "Local profile")
                  .slice(0, 2)
                  .toUpperCase()
              )}
            </span>
            <div>
              <strong>{primaryAccount?.personaName || "Local profile"}</strong>
              <small>{accountCount ? `${accountCount} accounts` : "Not scanned"}</small>
            </div>
            <ChevronDown size={15} />
          </button>
        </header>

        <div className="content">
          {page === "overview" && (
            <Overview
              accounts={accountCount}
              games={installedCount}
              totalSize={totalSize}
              manifests={manifests.length}
              onNavigate={setPage}
              onGame={setSelectedGame}
              syncLocal={syncLocal}
            />
          )}
          {page === "discover" && (
            <Discover
              games={searchResults}
              loading={searching}
              query={query}
              onSearch={handleSearch}
              onGame={setSelectedGame}
              onLink={openLink}
            />
          )}
          {page === "library" && (
            <Library
              games={library}
              workspaces={userData.workspaces}
              onScan={syncLocal}
              onGame={setSelectedGame}
              onWorkspace={setWorkspaceGame}
              onWorkspaceUpdate={(appId, update) =>
                setUserData((current) => withWorkspace(current, appId, update))
              }
              onLink={openLink}
            />
          )}
          {page === "accounts" && (
            <Accounts
              accounts={accounts}
              settings={settings}
              onScan={syncLocal}
              onLink={openLink}
              notify={notify}
            />
          )}
          {page === "manifests" && (
            <Manifests
              entries={manifests}
              onImport={importManifests}
              onRemove={(id) =>
                setManifests((current) =>
                  current.filter((entry) => entry.id !== id)
                )
              }
              onLink={openLink}
              notify={notify}
            />
          )}
          {page === "tools" && (
            <ToolsHub
              tools={tools}
              onAdd={addExecutable}
              onManual={() => setShowToolModal(true)}
              onLaunch={launchTool}
              onToggleFavorite={(id) =>
                setTools((current) =>
                  current.map((tool) =>
                    tool.id === id
                      ? { ...tool, favorite: !tool.favorite }
                      : tool
                  )
                )
              }
              onRemove={(id) =>
                setTools((current) =>
                  current.filter((tool) => tool.id !== id)
                )
              }
            />
          )}
          {page === "power" && (
            <PowerSuite
              library={library}
              accounts={accounts}
              tools={tools}
              settings={settings}
              onNavigate={setPage}
              onLink={openLink}
              notify={notify}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              settings={settings}
              setSettings={setSettings}
              notify={notify}
              onLink={openLink}
              platform={platform}
            />
          )}
        </div>
      </main>

      {selectedGame && (
        <GameDrawer
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          onWorkspace={() => {
            setWorkspaceGame(selectedGame);
            setSelectedGame(null);
          }}
          onLink={openLink}
        />
      )}
      {workspaceGame && (
        <GameWorkspace
          game={workspaceGame}
          workspace={userData.workspaces[String(workspaceGame.appid)] ?? {
            appId: String(workspaceGame.appid),
            favorite: false,
            status: "Backlog",
            rating: 0,
            notes: "",
            tags: [],
            compatibilityNotes: "",
            preferredProtonVersion: "",
            saveLocations: [],
            configLocations: [],
            launchProfiles: [],
            backups: [],
            screenshotFavorites: [],
            screenshotTags: {},
            customArtwork: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }}
          platform={platform}
          sessions={userData.sessions.filter((session) => session.appId === String(workspaceGame.appid))}
          onUpdate={(update) =>
            setUserData((current) => withWorkspace(current, String(workspaceGame.appid), update))
          }
          onSession={(session) =>
            setUserData((current) => ({ ...current, sessions: [session, ...current.sessions].slice(0, 2_000) }))
          }
          onClose={() => setWorkspaceGame(null)}
          onLink={openLink}
          notify={notify}
        />
      )}
      {showToolModal && (
        <ToolModal
          onClose={() => setShowToolModal(false)}
          onSave={addManualTool}
          accent={settings.accent}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={(target) => {
            setPage(target);
            setPaletteOpen(false);
          }}
          onScan={() => {
            setPaletteOpen(false);
            void syncLocal();
          }}
          onImport={() => {
            setPaletteOpen(false);
            void importManifests();
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <Check size={17} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function Overview({
  accounts,
  games,
  totalSize,
  manifests,
  onNavigate,
  onGame,
  syncLocal
}: {
  accounts: number;
  games: number;
  totalSize: number;
  manifests: number;
  onNavigate: (page: Page) => void;
  onGame: (game: Game) => void;
  syncLocal: () => void;
}) {
  return (
    <div className="page overview-page">
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-content">
          <span className="eyebrow">
            <span className="pulse-dot" /> LOCAL-FIRST STEAM INTELLIGENCE
          </span>
          <h1>
            Your entire Steam world,
            <br />
            <em>mapped in one place.</em>
          </h1>
          <p>
            Explore the catalogue, inspect local installations, compare
            accounts, archive manifests and launch every utility from a single
            command center.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={syncLocal}>
              <RefreshCcw size={17} /> Scan this PC
            </button>
            <button
              className="secondary-button"
              onClick={() => onNavigate("discover")}
            >
              Explore Steam <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <div className="hero-orbit">
          <div className="orbital-ring ring-one" />
          <div className="orbital-ring ring-two" />
          <div className="planet">
            <Gamepad2 size={48} strokeWidth={1.2} />
          </div>
          <span className="orbit-node node-one" />
          <span className="orbit-node node-two" />
          <span className="orbit-node node-three" />
        </div>
      </section>

      <section className="stat-grid">
        <StatCard
          icon={<LibraryBig />}
          label="Installed games"
          value={games ? String(games) : "—"}
          detail={games ? "Across detected libraries" : "Ready for local scan"}
          accent="cyan"
        />
        <StatCard
          icon={<HardDrive />}
          label="Storage indexed"
          value={totalSize ? formatBytes(totalSize) : "—"}
          detail="Local game content"
          accent="violet"
        />
        <StatCard
          icon={<Users />}
          label="Local accounts"
          value={accounts ? String(accounts) : "—"}
          detail="No credentials accessed"
          accent="amber"
        />
        <StatCard
          icon={<FileArchive />}
          label="Manifest vault"
          value={String(manifests)}
          detail="Inspected local records"
          accent="green"
        />
      </section>

      <div className="section-heading">
        <div>
          <span className="eyebrow">DISCOVERY SIGNAL</span>
          <h2>Worth a closer look</h2>
        </div>
        <button className="text-button" onClick={() => onNavigate("discover")}>
          View catalogue <ArrowRight size={16} />
        </button>
      </div>
      <div className="game-row">
        {featuredGames.slice(0, 4).map((game) => (
          <GameCard key={game.appid} game={game} onClick={() => onGame(game)} />
        ))}
      </div>

      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">QUICK ACTIONS</span>
              <h3>Operate without friction</h3>
            </div>
            <Zap size={19} />
          </div>
          <div className="quick-actions">
            <QuickAction
              icon={<Database />}
              title="Inspect manifests"
              detail="Parse ACF and manifest metadata"
              onClick={() => onNavigate("manifests")}
            />
            <QuickAction
              icon={<TerminalSquare />}
              title="Launch a utility"
              detail="Open your saved executable hub"
              onClick={() => onNavigate("tools")}
            />
            <QuickAction
              icon={<Users />}
              title="Compare accounts"
              detail="SteamID, library and ladder data"
              onClick={() => onNavigate("accounts")}
            />
          </div>
        </section>
        <section className="panel system-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">SYSTEM STATUS</span>
              <h3>Safety by design</h3>
            </div>
            <ShieldCheck size={20} />
          </div>
          <ul className="health-list">
            <li>
              <span className="health-icon good">
                <Check size={14} />
              </span>
              <div>
                <strong>Local-only configuration</strong>
                <small>Settings stay on this PC</small>
              </div>
              <em>Ready</em>
            </li>
            <li>
              <span className="health-icon good">
                <Check size={14} />
              </span>
              <div>
                <strong>Credential-safe account scan</strong>
                <small>Reads public local account metadata</small>
              </div>
              <em>Ready</em>
            </li>
            <li>
              <span className="health-icon neutral">
                <KeyRound size={14} />
              </span>
              <div>
                <strong>Optional API connections</strong>
                <small>Add keys in Settings</small>
              </div>
              <em>Optional</em>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  accent
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <article className={`stat-card ${accent}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function QuickAction({
  icon,
  title,
  detail,
  onClick
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <ArrowRight size={16} />
    </button>
  );
}

function Discover({
  games,
  loading,
  query,
  onSearch,
  onGame,
  onLink
}: {
  games: Game[];
  loading: boolean;
  query: string;
  onSearch: (event?: FormEvent) => void;
  onGame: (game: Game) => void;
  onLink: (url: string) => void;
}) {
  const [filter, setFilter] = useState("All");
  const filtered = useMemo(
    () =>
      filter === "All" ? games : games.filter((game) => game.type === filter),
    [filter, games]
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="STEAM CATALOGUE"
        title={query ? `Results for “${query}”` : "Discover your next world"}
        description="Search Steam directly, inspect useful metadata and jump to trusted external sources."
        actions={
          <button
            className="secondary-button"
            onClick={() => onLink("https://store.steampowered.com/demos/")}
          >
            <Gamepad2 size={17} /> Official demos
          </button>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          {["All", "Game", "DLC", "Demo", "Tool"].map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <button className="filter-button">
          <ListFilter size={16} /> Filters
        </button>
      </div>
      {loading ? (
        <div className="loading-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton-card" key={index} />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="catalogue-grid">
          {filtered.map((game) => (
            <GameCard
              key={game.appid}
              game={game}
              onClick={() => onGame(game)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search />}
          title="No matches in this view"
          detail={
            isDesktop()
              ? "Try another title, tag or exact AppID."
              : "The browser preview searches its sample catalogue. The desktop app searches Steam."
          }
          action={
            <button className="primary-button" onClick={() => onSearch()}>
              Reset search
            </button>
          }
        />
      )}
    </div>
  );
}

function GameCard({ game, onClick }: { game: Game; onClick: () => void }) {
  return (
    <article
      className="game-card"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="game-art">
        <GameImage game={game} alt={`${game.name} artwork`} />
        <div className="game-art-overlay" />
        {game.discount ? (
          <span className="discount">-{game.discount}%</span>
        ) : null}
        <span className={`deck-badge ${game.deck?.toLowerCase()}`}>
          <Gamepad2 size={12} /> {game.deck ?? "Unknown"}
        </span>
      </div>
      <div className="game-card-body">
        <div className="game-title-line">
          <div>
            <h3>{game.name}</h3>
            <span>APP {game.appid}</span>
          </div>
          <button
            className="mini-icon"
            aria-label={`Favorite ${game.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <Heart size={16} />
          </button>
        </div>
        <div className="tag-row">
          {game.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="game-meta">
          <span className="review-score">
            <span style={{ width: `${game.reviewScore}%` }} />
          </span>
          <small>{game.reviewScore}%</small>
          <strong>{game.price}</strong>
        </div>
      </div>
    </article>
  );
}

function Library({
  games,
  workspaces,
  onScan,
  onGame,
  onWorkspace,
  onWorkspaceUpdate,
  onLink
}: {
  games: Game[];
  workspaces: Record<string, GameWorkspaceData>;
  onScan: () => void;
  onGame: (game: Game) => void;
  onWorkspace: (game: Game) => void;
  onWorkspaceUpdate: (appId: string, update: (workspace: GameWorkspaceData) => GameWorkspaceData) => void;
  onLink: (url: string) => void;
}) {
  const [libraryQuery, setLibraryQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sort, setSort] = useState("name");
  const shown = [...games]
    .filter((game) => {
      const workspace = workspaces[String(game.appid)];
      const search = `${game.name} ${game.tags.join(" ")} ${workspace?.tags.join(" ") || ""}`.toLowerCase();
      return search.includes(libraryQuery.toLowerCase())
        && (statusFilter === "All" || workspace?.status === statusFilter)
        && (!favoriteOnly || workspace?.favorite);
    })
    .sort((left, right) => {
      if (sort === "size") return (right.sizeOnDisk || 0) - (left.sizeOnDisk || 0);
      if (sort === "rating") return (workspaces[String(right.appid)]?.rating || 0) - (workspaces[String(left.appid)]?.rating || 0);
      return left.name.localeCompare(right.name);
    });
  const totalSize = games.reduce(
    (sum, game) => sum + (game.sizeOnDisk ?? 0),
    0
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="LOCAL INDEX"
        title="Installed library"
        description="See what is installed across every detected Steam library folder."
        actions={
          <button className="primary-button" onClick={onScan}>
            <RefreshCcw size={17} /> Scan libraries
          </button>
        }
      />
      <div className="library-summary">
        <div>
          <span>Indexed titles</span>
          <strong>{games.length || "—"}</strong>
        </div>
        <div>
          <span>Total footprint</span>
          <strong>{totalSize ? formatBytes(totalSize) : "—"}</strong>
        </div>
        <div className="storage-line">
          <span style={{ width: games.length ? "62%" : "0%" }} />
        </div>
        <small>Storage visualization updates after a local scan.</small>
      </div>
      <div className="toolbar">
        <label className="inline-search">
          <Search size={16} />
          <input
            value={libraryQuery}
            onChange={(event) => setLibraryQuery(event.target.value)}
            placeholder="Filter installed games"
          />
        </label>
        <div className="library-filter-select">
          <DarkSelect
            value={statusFilter}
            ariaLabel="Filter by backlog status"
            options={["All", "Backlog", "Next", "Playing", "Finished", "Dropped", "Replay"].map((value) => ({ value, label: value === "All" ? "All statuses" : value }))}
            onChange={setStatusFilter}
          />
        </div>
        <div className="library-filter-select">
          <DarkSelect
            value={sort}
            ariaLabel="Sort library"
            options={[
              { value: "name", label: "Sort: Name" },
              { value: "size", label: "Sort: Largest" },
              { value: "rating", label: "Sort: My rating" }
            ]}
            onChange={setSort}
          />
        </div>
        <button className={`secondary-button ${favoriteOnly ? "active" : ""}`} onClick={() => setFavoriteOnly((value) => !value)} aria-pressed={favoriteOnly}>
          <Heart size={16} fill={favoriteOnly ? "currentColor" : "none"} /> Favorites
        </button>
        <button
          className="secondary-button"
          onClick={() => onLink("steam://open/games")}
        >
          <ExternalLink size={16} /> Open Steam Library
        </button>
      </div>
      {shown.length ? (
        <div className="library-table">
          <div className="table-head">
            <span>Game</span>
            <span>Build</span>
            <span>Size</span>
            <span>Updated</span>
            <span />
          </div>
          {shown.map((game) => (
            <div
              className="library-row"
              key={game.appid}
              role="button"
              tabIndex={0}
              onClick={() => onGame(game)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onGame(game);
              }}
            >
              <span className="library-game">
                <GameImage game={game} alt={`${game.name} artwork`} />
                <span>
                  <strong>{game.name}</strong>
                  <small>
                    AppID {game.appid}
                    {workspaces[String(game.appid)]?.status ? ` · ${workspaces[String(game.appid)].status}` : ""}
                    {workspaces[String(game.appid)]?.rating ? ` · ${workspaces[String(game.appid)].rating.toFixed(1)}/10` : ""}
                  </small>
                </span>
              </span>
              <span>
                <code>{game.buildId ?? "Unknown"}</code>
              </span>
              <span>{formatBytes(game.sizeOnDisk)}</span>
              <span>{game.lastUpdated ?? "Unknown"}</span>
              <span>
                <button
                  className={`mini-icon ${workspaces[String(game.appid)]?.favorite ? "active" : ""}`}
                  title={workspaces[String(game.appid)]?.favorite ? "Remove favorite" : "Add favorite"}
                  onClick={(event) => {
                    event.stopPropagation();
                    const current = workspaces[String(game.appid)] ?? {
                      appId: String(game.appid), favorite: false, status: "Backlog", rating: 0, notes: "", tags: [], compatibilityNotes: "", preferredProtonVersion: "", saveLocations: [], configLocations: [], launchProfiles: [], backups: [], screenshotFavorites: [], screenshotTags: {}, customArtwork: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                    };
                    onWorkspaceUpdate(String(game.appid), (workspace) => ({ ...workspace, favorite: !current.favorite }));
                  }}
                ><Heart size={16} fill={workspaces[String(game.appid)]?.favorite ? "currentColor" : "none"} /></button>
                <button className="text-button" onClick={(event) => { event.stopPropagation(); onWorkspace(game); }}>Workspace <ArrowRight size={14} /></button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<HardDrive />}
          title="Your local index is waiting"
          detail="Run a scan to detect Steam library folders and parse their legitimate local app manifests."
          action={
            <button className="primary-button" onClick={onScan}>
              Scan this PC
            </button>
          }
        />
      )}
    </div>
  );
}

function Accounts({
  accounts,
  settings,
  onScan,
  onLink,
  notify
}: {
  accounts: SteamAccount[];
  settings: AppSettings;
  onScan: () => void;
  onLink: (url: string) => void;
  notify: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    accounts[0]?.steamId ?? null
  );
  const [ladderData, setLadderData] = useState<Record<string, unknown> | null>(
    null
  );

  useEffect(() => {
    if (!selectedId && accounts[0]) setSelectedId(accounts[0].steamId);
  }, [accounts, selectedId]);

  useEffect(() => setLadderData(null), [selectedId]);

  const selected =
    accounts.find((account) => account.steamId === selectedId) ?? accounts[0];

  const refreshLadder = async () => {
    if (!selected) return;
    if (!settings.steamLadderApiKey) {
      notify("Add your Steam Ladder API key in Settings first.");
      return;
    }
    try {
      const result = await bridge.fetchSteamLadder(
        selected.steamId,
        settings.steamLadderApiKey
      );
      setLadderData(result);
      notify("Steam Ladder data refreshed.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Ladder refresh failed.");
    }
  };

  const ladderValue = (...keys: string[]) => {
    if (!ladderData) return "Connect API";
    const queue: unknown[] = [ladderData];
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object") continue;
      const object = current as Record<string, unknown>;
      for (const key of keys) {
        const value = object[key];
        if (typeof value === "string" || typeof value === "number") {
          return String(value);
        }
      }
      queue.push(...Object.values(object).filter((value) => value && typeof value === "object"));
    }
    return "Unavailable";
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="IDENTITY MAP"
        title="Accounts on this PC"
        description="Inspect local Steam identities without reading passwords, Steam Guard secrets or session tokens."
        actions={
          <button className="primary-button" onClick={onScan}>
            <RefreshCcw size={17} /> Detect accounts
          </button>
        }
      />
      {accounts.length ? (
        <div className="account-layout">
          <aside className="account-list panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">LOCAL ACCOUNTS</span>
                <h3>{accounts.length} detected</h3>
              </div>
            </div>
            {accounts.map((account) => (
              <button
                key={account.steamId}
                className={`account-option ${
                  selected?.steamId === account.steamId ? "active" : ""
                }`}
                onClick={() => setSelectedId(account.steamId)}
              >
                <span className="avatar">
                  {account.avatar ? (
                    <img src={account.avatar} alt="" />
                  ) : (
                    account.personaName.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span>
                  <strong>{account.personaName}</strong>
                  <small>{account.accountName}</small>
                </span>
                {account.mostRecent && <span className="current-dot" />}
              </button>
            ))}
          </aside>
          {selected && (
            <section className="account-detail">
              <div className="profile-banner panel">
                <div className="profile-main">
                  <span className="profile-avatar">
                    {selected.avatar ? (
                      <img src={selected.avatar} alt="" />
                    ) : (
                      selected.personaName.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <div>
                    <span className="eyebrow">
                      {selected.mostRecent ? "MOST RECENT LOGIN" : "LOCAL PROFILE"}
                    </span>
                    <h2>{selected.personaName}</h2>
                    <code>{selected.steamId}</code>
                  </div>
                </div>
                <div className="profile-actions">
                  <button
                    className="secondary-button"
                    onClick={() =>
                      onLink(
                        `https://steamcommunity.com/profiles/${selected.steamId}`
                      )
                    }
                  >
                    Steam <ExternalLink size={15} />
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      onLink(`https://steamladder.com/profile/${selected.steamId}`)
                    }
                  >
                    Ladder <BarChart3 size={15} />
                  </button>
                </div>
              </div>
              <div className="account-stat-grid">
                <MiniStat
                  icon={<Trophy />}
                  label="Steam level"
                  value={selected.level ? String(selected.level) : "API"}
                />
                <MiniStat
                  icon={<Gamepad2 />}
                  label="Games owned"
                  value={selected.games ? String(selected.games) : "API"}
                />
                <MiniStat
                  icon={<Clock3 />}
                  label="Total hours"
                  value={selected.playtime?.toLocaleString() ?? "API"}
                />
                <MiniStat
                  icon={<Globe2 />}
                  label="Country"
                  value={selected.country ?? "—"}
                />
              </div>
              <div className="panel ladder-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">STEAM LADDER</span>
                    <h3>Competitive profile intelligence</h3>
                  </div>
                  <button className="text-button" onClick={refreshLadder}>
                    Refresh data <RefreshCcw size={15} />
                  </button>
                </div>
                <div className="ladder-grid">
                  <div>
                    <small>World XP rank</small>
                    <strong>{ladderValue("worldwide_xp_rank", "world_xp_rank", "xp_rank")}</strong>
                    <span>{ladderData ? "Latest Steam Ladder response" : "Live after key setup"}</span>
                  </div>
                  <div>
                    <small>Game count rank</small>
                    <strong>{ladderValue("worldwide_games_rank", "world_game_count_rank", "game_count_rank")}</strong>
                    <span>{ladderData ? "Latest Steam Ladder response" : "Live after key setup"}</span>
                  </div>
                  <div>
                    <small>Account age rank</small>
                    <strong>{ladderValue("worldwide_timecreated_rank", "world_account_age_rank", "account_age_rank")}</strong>
                    <span>{ladderData ? "Latest Steam Ladder response" : "Live after key setup"}</span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<Users />}
          title="No accounts indexed yet"
          detail="Atlas reads Steam’s local loginusers.vdf only for account names, SteamIDs and safe display metadata."
          action={
            <button className="primary-button" onClick={onScan}>
              Detect local accounts
            </button>
          }
        />
      )}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="mini-stat">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Manifests({
  entries,
  onImport,
  onRemove,
  onLink,
  notify
}: {
  entries: ManifestEntry[];
  onImport: () => void;
  onRemove: (id: string) => void;
  onLink: (url: string) => void;
  notify: (message: string) => void;
}) {
  const [manifestQuery, setManifestQuery] = useState("");
  const shown = entries.filter((entry) =>
    [entry.fileName, entry.appId, entry.depotId, entry.manifestId]
      .filter(Boolean)
      .some((value) =>
        String(value).toLowerCase().includes(manifestQuery.toLowerCase())
      )
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="LOCAL RECORDS"
        title="Manifest Vault"
        description="Inspect and organize app manifests you legitimately possess. Atlas never fabricates licenses or depot keys."
        actions={
          <>
            <button
              className="secondary-button"
              onClick={() => onLink("https://steamdb.info/")}
            >
              SteamDB <ExternalLink size={16} />
            </button>
            <button className="primary-button" onClick={onImport}>
              <Plus size={17} /> Import files
            </button>
          </>
        }
      />
      <div className="notice-card">
        <ShieldCheck size={22} />
        <div>
          <strong>Authorization-aware by design</strong>
          <p>
            Manifest metadata can identify content and versions, but it does not
            grant ownership. Downloads remain subject to Steam account
            entitlement.
          </p>
        </div>
      </div>
      <AuthorizedDownloadPanel notify={notify} />
      <div className="toolbar">
        <label className="inline-search">
          <Search size={16} />
          <input
            value={manifestQuery}
            onChange={(event) => setManifestQuery(event.target.value)}
            placeholder="Search AppID, DepotID or ManifestID"
          />
        </label>
        <span className="count-label">{shown.length} records</span>
      </div>
      {shown.length ? (
        <div className="manifest-grid">
          {shown.map((entry) => (
            <article className="manifest-card" key={entry.id}>
              <div className="manifest-file-icon">
                <FileArchive size={23} />
              </div>
              <div className="manifest-copy">
                <div>
                  <h3>{entry.fileName}</h3>
                  <span className={`validity ${entry.status}`}>
                    <BadgeCheck size={13} /> {entry.status}
                  </span>
                </div>
                <code>{entry.filePath}</code>
                <dl>
                  <div>
                    <dt>AppID</dt>
                    <dd>{entry.appId ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>DepotID</dt>
                    <dd>{entry.depotId ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(entry.size)}</dd>
                  </div>
                  <div>
                    <dt>Imported</dt>
                    <dd>{entry.importedAt}</dd>
                  </div>
                </dl>
              </div>
              <div className="manifest-actions">
                {entry.appId && (
                  <button
                    className="mini-icon"
                    title="Open app on SteamDB"
                    onClick={() =>
                      onLink(`https://steamdb.info/app/${entry.appId}/depots/`)
                    }
                  >
                    <ExternalLink size={16} />
                  </button>
                )}
                <button
                  className="mini-icon danger"
                  title="Remove from Atlas vault"
                  onClick={() => onRemove(entry.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Archive />}
          title="No manifest records"
          detail="Select local .acf or .manifest files to inspect their identifiers and keep an organized index."
          action={
            <button className="primary-button" onClick={onImport}>
              Select manifest files
            </button>
          }
        />
      )}
    </div>
  );
}

function AuthorizedDownloadPanel({
  notify
}: {
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [steamCmdPath, setSteamCmdPath] = useState("");
  const [accountName, setAccountName] = useState("");
  const [appId, setAppId] = useState("");
  const [depotId, setDepotId] = useState("");
  const [manifestId, setManifestId] = useState("");

  const chooseSteamCmd = async () => {
    try {
      const path = await bridge.chooseExecutable();
      if (path) setSteamCmdPath(path);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not select SteamCMD.");
    }
  };

  const download = async (event: FormEvent) => {
    event.preventDefault();
    if (!isDesktop()) {
      notify("Authorized downloads run from the compiled desktop app.");
      return;
    }
    try {
      await bridge.runSteamCmdDownload(
        steamCmdPath,
        accountName,
        appId,
        depotId,
        manifestId || undefined
      );
      notify("SteamCMD opened. Complete Steam authentication in its console.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "SteamCMD could not be opened."
      );
    }
  };

  return (
    <section className={`download-panel panel ${open ? "open" : ""}`}>
      <button className="download-panel-head" onClick={() => setOpen(!open)}>
        <span>
          <CloudDownload size={20} />
        </span>
        <div>
          <strong>Authorized depot download</strong>
          <small>
            SteamCMD validates ownership and handles Steam Guard itself
          </small>
        </div>
        <ChevronDown size={17} />
      </button>
      {open && (
        <form className="download-form" onSubmit={download}>
          <label className="field steamcmd-path">
            <span>SteamCMD executable</span>
            <div className="input-action">
              <input
                value={steamCmdPath}
                onChange={(event) => setSteamCmdPath(event.target.value)}
                placeholder="steamcmd.exe on Windows · steamcmd.sh on Linux"
                required
              />
              <button type="button" onClick={chooseSteamCmd}>
                Browse
              </button>
            </div>
          </label>
          <label className="field">
            <span>Steam account name</span>
            <input
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Account name"
              required
            />
          </label>
          <label className="field">
            <span>AppID</span>
            <input
              value={appId}
              inputMode="numeric"
              onChange={(event) => setAppId(event.target.value)}
              placeholder="1086940"
              required
            />
          </label>
          <label className="field">
            <span>DepotID</span>
            <input
              value={depotId}
              inputMode="numeric"
              onChange={(event) => setDepotId(event.target.value)}
              placeholder="Depot ID"
              required
            />
          </label>
          <label className="field">
            <span>ManifestID</span>
            <input
              value={manifestId}
              inputMode="numeric"
              onChange={(event) => setManifestId(event.target.value)}
              placeholder="Optional — latest if empty"
            />
          </label>
          <button className="primary-button" type="submit">
            <ArrowDownToLine size={16} /> Open SteamCMD
          </button>
          <p>
            Atlas never receives your password or Steam Guard code. Enter them
            only in the official SteamCMD console. Steam will reject depots the
            account cannot access.
          </p>
        </form>
      )}
    </section>
  );
}

function ToolsHub({
  tools,
  onAdd,
  onManual,
  onLaunch,
  onToggleFavorite,
  onRemove
}: {
  tools: ExternalTool[];
  onAdd: () => void;
  onManual: () => void;
  onLaunch: (tool: ExternalTool) => void;
  onToggleFavorite: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="EXECUTABLE LAUNCHER"
        title="Tools Hub"
        description="Pin trusted local utilities, configure arguments and launch them from one clean dashboard."
        actions={
          <>
            <button className="secondary-button" onClick={onManual}>
              <AppWindow size={17} /> Manual entry
            </button>
            <button className="primary-button" onClick={onAdd}>
              <Plus size={17} /> Select executable
            </button>
          </>
        }
      />
      <div className="notice-card tools-notice">
        <ShieldCheck size={22} />
        <div>
          <strong>You stay in control</strong>
          <p>
            Atlas launches only files you explicitly add. Review third-party
            tools yourself; Atlas does not download, endorse or automate them.
          </p>
        </div>
      </div>
      {tools.length ? (
        <div className="tools-grid">
          {tools.map((tool) => (
            <article className="tool-card" key={tool.id}>
              <div
                className="tool-icon"
                style={
                  { "--tool-color": tool.color } as React.CSSProperties
                }
              >
                <TerminalSquare size={26} />
              </div>
              <button
                className={`favorite ${tool.favorite ? "active" : ""}`}
                onClick={() => onToggleFavorite(tool.id)}
                title="Toggle favorite"
              >
                <Star size={16} fill={tool.favorite ? "currentColor" : "none"} />
              </button>
              <h3>{tool.name}</h3>
              <p>{tool.description}</p>
              <div className="tool-path">
                <FolderOpen size={14} />
                <code>{tool.path}</code>
              </div>
              <div className="tool-meta">
                <span>{tool.category}</span>
                <small>
                  {tool.lastLaunched
                    ? `Last run ${new Date(tool.lastLaunched).toLocaleDateString()}`
                    : "Never launched"}
                </small>
              </div>
              <div className="tool-actions">
                <button
                  className="launch-button"
                  onClick={() => onLaunch(tool)}
                >
                  <Play size={16} fill="currentColor" /> Launch
                </button>
                <button
                  className="mini-icon danger"
                  onClick={() => onRemove(tool.id)}
                  title="Remove from Tools Hub"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
          <button className="add-tool-card" onClick={onAdd}>
            <span>
              <Plus size={24} />
            </span>
            <strong>Add another tool</strong>
            <small>Executable, shortcut or script</small>
          </button>
        </div>
      ) : (
        <EmptyState
          icon={<TerminalSquare />}
          title="Build your command deck"
          detail="Choose an executable, shortcut or supported script. Atlas remembers its path and optional arguments."
          action={
            <button className="primary-button" onClick={onAdd}>
              Add your first tool
            </button>
          }
        />
      )}
    </div>
  );
}

function SettingsPage({
  settings,
  setSettings,
  notify,
  onLink,
  platform
}: {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  notify: (message: string) => void;
  onLink: (url: string) => void;
  platform: PlatformInfo | null;
}) {
  const [draft, setDraft] = useState<AppSettings>({
    ...defaultSettings,
    ...settings
  });

  const save = async () => {
    try {
      if (isDesktop()) {
        await bridge.saveSecrets(draft.steamApiKey, draft.steamLadderApiKey);
      }
      setSettings(draft);
      notify(
        isDesktop()
          ? "Settings saved. API keys are protected by the operating system."
          : "Preview settings saved locally."
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save credentials securely.");
    }
  };

  const pickBackground = async () => {
    if (!isDesktop()) {
      notify("Background file selection is available in the desktop build.");
      return;
    }
    try {
      const path = await bridge.chooseBackgroundImage();
      if (path) {
        setDraft({
          ...draft,
          backgroundImagePath: path,
          backgroundPreset: "none"
        });
        notify("Background selected. Save changes to apply it.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not select an image.");
    }
  };

  const exportPortable = async () => {
    const portable = {
      ...draft,
      steamApiKey: "",
      steamLadderApiKey: "",
      backgroundImagePath: ""
    };
    try {
      const path = await bridge.exportSettings(JSON.stringify(portable, null, 2));
      if (path) notify(`Portable settings exported to ${path}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Export failed.");
    }
  };

  const importPortable = async () => {
    try {
      const json = await bridge.importSettings();
      if (!json) return;
      const imported = JSON.parse(json) as Partial<AppSettings>;
      const next = {
        ...defaultSettings,
        ...draft,
        ...imported,
        steamApiKey: draft.steamApiKey,
        steamLadderApiKey: draft.steamLadderApiKey
      };
      setDraft(next);
      setSettings(next);
      notify("Portable appearance and region settings imported.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import failed.");
    }
  };

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="CONFIGURATION"
        title="Settings"
        description="Connect optional public-data APIs and tune Atlas to your system."
        actions={
          <button className="primary-button" onClick={() => void save()}>
            <Check size={17} /> Save changes
          </button>
        }
      />
      <div className="settings-layout">
        <section className="settings-section panel">
          <div className="settings-heading">
            <span>
              <Link2 size={20} />
            </span>
            <div>
              <h3>Data connections</h3>
              <p>
                {platform?.secureStorage || "Operating-system credential vault"}
              </p>
            </div>
          </div>
          <label className="field">
            <span>
              Steam Web API key
              <button
                onClick={() =>
                  onLink("https://steamcommunity.com/dev/apikey")
                }
              >
                Get key <ExternalLink size={12} />
              </button>
            </span>
            <input
              type="password"
              value={draft.steamApiKey}
              onChange={(event) =>
                setDraft({ ...draft, steamApiKey: event.target.value })
              }
              placeholder="Optional — required for public library/profile data"
            />
            <small>
              Used only for Valve’s public Web API. Never enter a publisher key.
            </small>
          </label>
          <label className="field">
            <span>
              Steam Ladder API key
              <button
                onClick={() =>
                  onLink("https://steamladder.com/user/settings/api")
                }
              >
                Get key <ExternalLink size={12} />
              </button>
            </span>
            <input
              type="password"
              value={draft.steamLadderApiKey}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  steamLadderApiKey: event.target.value
                })
              }
              placeholder="Optional — enables rank data"
            />
          </label>
        </section>

        <section className="settings-section panel">
          <div className="settings-heading">
            <span>
              <Globe2 size={20} />
            </span>
            <div>
              <h3>Store region</h3>
              <p>Controls regional price and language hints.</p>
            </div>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Country code</span>
              <input
                value={draft.countryCode}
                maxLength={2}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    countryCode: event.target.value.toUpperCase()
                  })
                }
              />
            </label>
            <div className="field">
              <span>Currency</span>
              <DarkSelect
                value={draft.currency}
                onChange={(currency) => setDraft({ ...draft, currency })}
                ariaLabel="Store currency"
                options={[
                  { value: "TRY", label: "TRY", detail: "Turkish lira" },
                  { value: "EUR", label: "EUR", detail: "Euro" },
                  { value: "USD", label: "USD", detail: "US dollar" },
                  { value: "GBP", label: "GBP", detail: "British pound" }
                ]}
              />
            </div>
          </div>
          <label className="field">
            <span>Steam installation override</span>
            <input
              value={draft.steamPath}
              onChange={(event) =>
                setDraft({ ...draft, steamPath: event.target.value })
              }
              placeholder="Leave empty for automatic detection"
            />
          </label>
        </section>

        <section className="settings-section panel appearance-wide">
          <div className="settings-heading">
            <span>
              <Layers3 size={20} />
            </span>
            <div>
              <h3>Appearance</h3>
              <p>Make the command center feel like yours.</p>
            </div>
          </div>
          <label className="field color-field">
            <span>Accent color</span>
            <div>
              <input
                type="color"
                value={draft.accent}
                onChange={(event) =>
                  setDraft({ ...draft, accent: event.target.value })
                }
              />
              <code>{draft.accent.toUpperCase()}</code>
              {["#66e3ff", "#a78bfa", "#56f39a", "#ffb55e", "#ff6c8f"].map(
                (color) => (
                  <button
                    key={color}
                    className={draft.accent === color ? "active" : ""}
                    style={{ background: color }}
                    onClick={() => setDraft({ ...draft, accent: color })}
                    aria-label={`Use ${color}`}
                  />
                )
              )}
            </div>
          </label>
          <label className="field color-field">
            <span>Secondary glow</span>
            <div>
              <input
                type="color"
                value={draft.secondaryAccent}
                onChange={(event) =>
                  setDraft({ ...draft, secondaryAccent: event.target.value })
                }
              />
              <code>{draft.secondaryAccent.toUpperCase()}</code>
              {["#a78bfa", "#ff6c8f", "#56f39a", "#ffb55e", "#5b8cff"].map(
                (color) => (
                  <button
                    type="button"
                    key={color}
                    className={draft.secondaryAccent === color ? "active" : ""}
                    style={{ background: color }}
                    onClick={() =>
                      setDraft({ ...draft, secondaryAccent: color })
                    }
                    aria-label={`Use ${color}`}
                  />
                )
              )}
            </div>
          </label>
          <div className="background-controls">
            <div className="field">
              <span>Interface theme</span>
              <DarkSelect
                value={draft.theme}
                onChange={(theme) => setDraft({ ...draft, theme: theme as AppSettings["theme"] })}
                ariaLabel="Interface theme"
                options={[
                  { value: "system", label: "System", detail: "Follow Windows or Linux" },
                  { value: "dark", label: "Dark", detail: "Atlas night" },
                  { value: "light", label: "Light", detail: "High-clarity daylight" }
                ]}
              />
            </div>
            <div className="field">
              <span>Built-in background</span>
              <DarkSelect
                value={draft.backgroundPreset}
                onChange={(backgroundPreset) =>
                  setDraft({
                    ...draft,
                    backgroundPreset:
                      backgroundPreset as AppSettings["backgroundPreset"],
                    backgroundImagePath:
                      backgroundPreset === "none"
                        ? draft.backgroundImagePath
                        : ""
                  })
                }
                ariaLabel="Background preset"
                options={[
                  { value: "nebula", label: "Atlas nebula", detail: "Cyan and violet" },
                  { value: "midnight", label: "Midnight", detail: "Deep blue" },
                  { value: "ember", label: "Ember", detail: "Warm red and gold" },
                  { value: "forest", label: "Forest", detail: "Emerald atmosphere" },
                  { value: "none", label: "Custom / none", detail: "Use your image" }
                ]}
              />
            </div>
            <div className="background-picker">
              <span>Custom background image</span>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={pickBackground}
                >
                  <FolderOpen size={16} /> Choose image
                </button>
                {draft.backgroundImagePath && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setDraft({ ...draft, backgroundImagePath: "" })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <small>
                {draft.backgroundImagePath || "JPG, PNG or WebP · copied into Atlas app data"}
              </small>
            </div>
          </div>
          <div className="range-grid">
            <RangeControl
              label="Background opacity"
              value={draft.backgroundOpacity}
              min={0}
              max={100}
              suffix="%"
              onChange={(backgroundOpacity) =>
                setDraft({ ...draft, backgroundOpacity })
              }
            />
            <RangeControl
              label="Background blur"
              value={draft.backgroundBlur}
              min={0}
              max={24}
              suffix="px"
              onChange={(backgroundBlur) =>
                setDraft({ ...draft, backgroundBlur })
              }
            />
            <RangeControl
              label="Background saturation"
              value={draft.backgroundSaturation}
              min={0}
              max={180}
              suffix="%"
              onChange={(backgroundSaturation) =>
                setDraft({ ...draft, backgroundSaturation })
              }
            />
            <RangeControl
              label="Dark overlay"
              value={draft.overlayStrength}
              min={20}
              max={95}
              suffix="%"
              onChange={(overlayStrength) =>
                setDraft({ ...draft, overlayStrength })
              }
            />
            <RangeControl
              label="Panel opacity"
              value={draft.panelOpacity}
              min={45}
              max={100}
              suffix="%"
              onChange={(panelOpacity) => setDraft({ ...draft, panelOpacity })}
            />
            <RangeControl
              label="Sidebar opacity"
              value={draft.sidebarOpacity}
              min={45}
              max={100}
              suffix="%"
              onChange={(sidebarOpacity) =>
                setDraft({ ...draft, sidebarOpacity })
              }
            />
            <RangeControl
              label="Top bar opacity"
              value={draft.topbarOpacity}
              min={45}
              max={100}
              suffix="%"
              onChange={(topbarOpacity) =>
                setDraft({ ...draft, topbarOpacity })
              }
            />
            <RangeControl
              label="Corner radius"
              value={draft.cornerRadius}
              min={4}
              max={30}
              suffix="px"
              onChange={(cornerRadius) =>
                setDraft({ ...draft, cornerRadius })
              }
            />
            <RangeControl
              label="Glow intensity"
              value={draft.glowIntensity}
              min={0}
              max={100}
              suffix="%"
              onChange={(glowIntensity) =>
                setDraft({ ...draft, glowIntensity })
              }
            />
            <RangeControl
              label="Interface scale"
              value={draft.uiScale}
              min={85}
              max={115}
              suffix="%"
              onChange={(uiScale) => setDraft({ ...draft, uiScale })}
            />
          </div>
          <div className="appearance-options">
            <div className="field">
              <span>Information density</span>
              <DarkSelect
                value={draft.density}
                onChange={(density) =>
                  setDraft({
                    ...draft,
                    density: density as AppSettings["density"],
                    compactMode: density === "compact"
                  })
                }
                ariaLabel="Information density"
                options={[
                  { value: "comfortable", label: "Comfortable" },
                  { value: "compact", label: "Compact" },
                  { value: "spacious", label: "Spacious" }
                ]}
              />
            </div>
            <SettingToggle
              title="OLED black"
              detail="Use pure black in the deepest surfaces."
              checked={draft.oledMode}
              onChange={(oledMode) => setDraft({ ...draft, oledMode })}
            />
            <SettingToggle
              title="Reduce motion"
              detail="Disable animated transitions and orbit effects."
              checked={draft.reduceMotion}
              onChange={(reduceMotion) => setDraft({ ...draft, reduceMotion })}
            />
          </div>
        </section>

        <section className="settings-section panel privacy-panel">
          <div className="settings-heading">
            <span>
              <ShieldCheck size={20} />
            </span>
            <div>
              <h3>Privacy model</h3>
              <p>Atlas is built to minimize access.</p>
            </div>
          </div>
          <ul>
            <li>
              <Check size={15} /> No Steam passwords or Guard secrets
            </li>
            <li>
              <Check size={15} /> No remote Atlas account
            </li>
            <li>
              <Check size={15} /> Explicit executable selection
            </li>
            <li>
              <Check size={15} /> Steam entitlement remains authoritative
            </li>
            <li>
              <Check size={15} /> {platform?.os === "linux" ? "Linux, Flatpak and Proton aware" : "Windows Credential Manager integration"}
            </li>
          </ul>
          <div className="portable-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={exportPortable}
            >
              <ArrowDownToLine size={16} /> Export safe settings
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={importPortable}
            >
              <CloudDownload size={16} /> Import settings
            </button>
          </div>
          <small className="privacy-note">
            Exports intentionally exclude API keys and your custom background path.
          </small>
        </section>
      </div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span>
        <strong>{label}</strong>
        <code>
          {value}
          {suffix}
        </code>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SettingToggle({
  title,
  detail,
  checked,
  onChange
}: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function GameDrawer({
  game,
  onClose,
  onWorkspace,
  onLink
}: {
  game: Game;
  onClose: () => void;
  onWorkspace: () => void;
  onLink: (url: string) => void;
}) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="game-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="drawer-close" onClick={onClose}>
          <X size={19} />
        </button>
        <div className="drawer-hero">
          <GameImage game={game} alt={`${game.name} artwork`} />
          <div />
        </div>
        <div className="drawer-content">
          <span className="eyebrow">
            {game.type.toUpperCase()} · APP {game.appid}
          </span>
          <h2>{game.name}</h2>
          <p>{game.summary ?? "Detailed store metadata is available online."}</p>
          <div className="drawer-score">
            <div>
              <strong>{game.reviewScore}%</strong>
              <span>{game.review}</span>
            </div>
            <div>
              <strong>{game.players ?? "—"}</strong>
              <span>Players now</span>
            </div>
            <div>
              <strong>{game.dlcCount ?? 0}</strong>
              <span>Listed DLC</span>
            </div>
          </div>
          <div className="tag-row large">
            {game.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <dl className="drawer-facts">
            <div>
              <dt>Release</dt>
              <dd>{game.releaseDate ?? "See store"}</dd>
            </div>
            <div>
              <dt>Platforms</dt>
              <dd>{game.platforms.join(", ")}</dd>
            </div>
            <div>
              <dt>Steam Deck</dt>
              <dd>{game.deck ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Price</dt>
              <dd>{game.price}</dd>
            </div>
          </dl>
          <div className="drawer-actions">
            <button className="primary-button" onClick={onWorkspace}>
              Open workspace <ArrowRight size={16} />
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                onLink(`https://store.steampowered.com/app/${game.appid}`)
              }
            >
              View on Steam <ExternalLink size={16} />
            </button>
            <button
              className="secondary-button"
              onClick={() => onLink(`https://steamdb.info/app/${game.appid}/`)}
            >
              SteamDB <Database size={16} />
            </button>
          </div>
          <div className="authorized-box">
            <PackageCheck size={20} />
            <div>
              <strong>Content access</strong>
              <p>
                Installation and depot downloads are handled only when Steam
                recognizes an appropriate license on the active account.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ToolModal({
  onClose,
  onSave,
  accent
}: {
  onClose: () => void;
  onSave: (tool: Omit<ExternalTool, "id" | "favorite">) => void;
  accent: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [path, setPath] = useState("");
  const [args, setArgs] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [category, setCategory] = useState("Utility");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !path.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || "Custom local utility",
      path: path.trim(),
      args: args
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean),
      workingDirectory: workingDirectory.trim() || undefined,
      category,
      color: accent,
      lastLaunched: undefined
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">TOOLS HUB</span>
            <h2>Add a local utility</h2>
          </div>
          <button type="button" className="mini-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="field">
          <span>Display name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My utility"
            required
          />
        </label>
        <label className="field">
          <span>Executable or script path</span>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="C:\Tools\utility.exe"
            required
          />
        </label>
        <label className="field">
          <span>Description</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What does this tool do?"
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Arguments</span>
            <input
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              placeholder="--optional flags"
            />
          </label>
          <div className="field">
            <span>Category</span>
            <DarkSelect
              value={category}
              onChange={setCategory}
              ariaLabel="Tool category"
              options={[
                { value: "Utility", label: "Utility" },
                { value: "Graphics", label: "Graphics" },
                { value: "Mods", label: "Mods" },
                { value: "Backup", label: "Backup" },
                { value: "Diagnostics", label: "Diagnostics" }
              ]}
            />
          </div>
        </div>
        <label className="field">
          <span>Working directory</span>
          <input
            value={workingDirectory}
            onChange={(event) => setWorkingDirectory(event.target.value)}
            placeholder="Optional"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            <Plus size={16} /> Add tool
          </button>
        </div>
      </form>
    </div>
  );
}

function CommandPalette({
  onClose,
  onNavigate,
  onScan,
  onImport
}: {
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onScan: () => void;
  onImport: () => void;
}) {
  const [filter, setFilter] = useState("");
  const commands = [
    ...navItems.map((item) => ({
      id: item.id,
      label: `Go to ${item.label}`,
      detail: "Navigation",
      icon: item.icon,
      action: () => onNavigate(item.id)
    })),
    {
      id: "scan-pc",
      label: "Scan this PC",
      detail: "Accounts and installed games",
      icon: RefreshCcw,
      action: onScan
    },
    {
      id: "import-manifests",
      label: "Inspect manifest files",
      detail: "Manifest Vault",
      icon: FileArchive,
      action: onImport
    }
  ].filter((item) =>
    `${item.label} ${item.detail}`.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="modal-backdrop command-backdrop" onMouseDown={onClose}>
      <div
        className="command-palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label>
          <Search size={19} />
          <input
            autoFocus
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Type a command or page…"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-results">
          {commands.map(({ id, label, detail, icon: Icon, action }) => (
            <button type="button" key={id} onClick={action}>
              <span>
                <Icon size={17} />
              </span>
              <div>
                <strong>{label}</strong>
                <small>{detail}</small>
              </div>
              <ArrowRight size={15} />
            </button>
          ))}
          {!commands.length && <p>No matching command.</p>}
        </div>
        <footer>
          <span>
            <Command size={13} /> Ctrl K
          </span>
          opens this palette anywhere
        </footer>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  action
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export default App;
