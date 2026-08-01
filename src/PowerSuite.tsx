import {
  Activity,
  Archive,
  BarChart3,
  BookMarked,
  Boxes,
  Bug,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudDownload,
  Command,
  Copy,
  DatabaseBackup,
  ExternalLink,
  FileCog,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Image,
  ListChecks,
  MonitorCog,
  Palette,
  Play,
  Plus,
  RefreshCcw,
  Save,
  ScanSearch,
  Settings2,
  ShieldCheck,
  Star,
  Trash2,
  Trophy,
  Users,
  Wrench,
  Zap
} from "lucide-react";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import { bridge, isDesktop } from "./bridge";
import { DarkSelect } from "./components/DarkSelect";
import { GameImage } from "./components/GameImage";
import { featuredGames } from "./data";
import type {
  AppSettings,
  BackupRecord,
  CrashReport,
  ExternalTool,
  Game,
  OrphanRecord,
  Page,
  ScreenshotRecord,
  SteamAccount,
  SystemDiagnostics
} from "./types";

type FeatureId =
  | "save-vault"
  | "launch-profiles"
  | "config-manager"
  | "update-intel"
  | "analytics"
  | "backlog"
  | "screenshots"
  | "achievements"
  | "compatibility"
  | "orphans"
  | "duplicates"
  | "mods"
  | "watchlist"
  | "timeline"
  | "crash"
  | "account-compare"
  | "artwork"
  | "command-palette"
  | "tray"
  | "portable";

type StoredLaunchProfile = {
  id: string;
  name: string;
  appId: string;
  args: string;
};

type BacklogItem = {
  id: string;
  title: string;
  appId: string;
  status: "Backlog" | "Playing" | "Completed" | "Paused";
};

type WatchItem = {
  id: string;
  appId: string;
  name: string;
  price: string;
  target: string;
  refreshedAt?: string;
};

type SessionItem = {
  id: string;
  name: string;
  appId: string;
  launchedAt: string;
};

type ModEntry = {
  id: string;
  name: string;
  appId: string;
  path: string;
};

type ArtworkEntry = {
  id: string;
  appId: string;
  title: string;
  image: string;
};

const features: {
  id: FeatureId;
  title: string;
  description: string;
  icon: typeof Activity;
  badge: string;
}[] = [
  { id: "save-vault", title: "Save Vault", description: "Version local save folders into dated snapshots.", icon: DatabaseBackup, badge: "READY" },
  { id: "launch-profiles", title: "Launch Profiles", description: "Save AppIDs and launch arguments as reusable presets.", icon: Play, badge: "READY" },
  { id: "config-manager", title: "Config Manager", description: "Snapshot configuration folders before you tweak them.", icon: FileCog, badge: "READY" },
  { id: "update-intel", title: "Update Intelligence", description: "Track local BuildIDs and jump to authoritative history.", icon: RefreshCcw, badge: "READY" },
  { id: "analytics", title: "Library Analytics", description: "Summarize footprint, platforms and collection health.", icon: BarChart3, badge: "READY" },
  { id: "backlog", title: "Backlog Board", description: "Keep a private, local play queue with clear states.", icon: ListChecks, badge: "READY" },
  { id: "screenshots", title: "Screenshot Studio", description: "Index recent Steam screenshots across local accounts.", icon: Image, badge: "DESKTOP" },
  { id: "achievements", title: "Achievement Lens", description: "Open read-only public achievement pages per account.", icon: Trophy, badge: "PUBLIC" },
  { id: "compatibility", title: "Compatibility Desk", description: "Review platform hints and ProtonDB resources.", icon: MonitorCog, badge: "READY" },
  { id: "orphans", title: "Orphan Scanner", description: "Preview unregistered common-folder leftovers safely.", icon: ScanSearch, badge: "PREVIEW" },
  { id: "duplicates", title: "Duplicate Analyzer", description: "Spot repeated title names and install paths.", icon: Copy, badge: "READY" },
  { id: "mods", title: "Mod Command Center", description: "Associate mod folders and utilities with AppIDs.", icon: Wrench, badge: "LOCAL" },
  { id: "watchlist", title: "Price Watchlist", description: "Refresh current Steam store pricing on demand.", icon: Star, badge: "READY" },
  { id: "timeline", title: "Session Timeline", description: "Keep a local history of launches made through Atlas.", icon: Clock3, badge: "READY" },
  { id: "crash", title: "Crash Assistant", description: "Classify common crash-log patterns without uploading.", icon: Bug, badge: "LOCAL" },
  { id: "account-compare", title: "Account Compare", description: "Compare safe metadata for identities on this PC.", icon: Users, badge: "READY" },
  { id: "artwork", title: "Artwork Board", description: "Save custom artwork references for any AppID.", icon: Palette, badge: "READY" },
  { id: "command-palette", title: "Command Palette", description: "Navigate and run core actions from Ctrl+K.", icon: Command, badge: "LIVE" },
  { id: "tray", title: "Tray Mode", description: "Hide Atlas and restore it from its notification icon.", icon: Boxes, badge: "DESKTOP" },
  { id: "portable", title: "Portable Settings", description: "Export appearance and region settings without secrets.", icon: CloudDownload, badge: "SAFE" }
];

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved =
        typeof next === "function"
          ? (next as (current: T) => T)(current)
          : next;
      localStorage.setItem(key, JSON.stringify(resolved));
      return resolved;
    });
  };
  return [value, update] as const;
}

const bytes = (value = 0) => {
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return `${(value / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
};

const readableDate = (value: string) => {
  const parsed = /^\d+$/.test(value)
    ? new Date(Number(value) * 1000)
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export function PowerSuite({
  library,
  accounts,
  tools,
  settings,
  onNavigate,
  onLink,
  notify
}: {
  library: Game[];
  accounts: SteamAccount[];
  tools: ExternalTool[];
  settings: AppSettings;
  onNavigate: (page: Page) => void;
  onLink: (url: string) => void;
  notify: (message: string) => void;
}) {
  const [active, setActive] = useState<FeatureId>("save-vault");
  const [featureQuery, setFeatureQuery] = useState("");
  const [backups, setBackups] = useStoredState<BackupRecord[]>("atlas.backups", []);
  const [launchProfiles, setLaunchProfiles] = useStoredState<StoredLaunchProfile[]>("atlas.launchProfiles", []);
  const [backlog, setBacklog] = useStoredState<BacklogItem[]>("atlas.backlog", []);
  const [watchlist, setWatchlist] = useStoredState<WatchItem[]>("atlas.watchlist", []);
  const [timeline, setTimeline] = useStoredState<SessionItem[]>("atlas.timeline", []);
  const [mods, setMods] = useStoredState<ModEntry[]>("atlas.mods", []);
  const [artwork, setArtwork] = useStoredState<ArtworkEntry[]>("atlas.artwork", []);
  const [folderPath, setFolderPath] = useState("");
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([]);
  const [orphans, setOrphans] = useState<OrphanRecord[]>([]);
  const [crashReport, setCrashReport] = useState<CrashReport | null>(null);
  const [busy, setBusy] = useState("");

  const shownFeatures = features.filter((feature) =>
    `${feature.title} ${feature.description}`
      .toLowerCase()
      .includes(featureQuery.toLowerCase())
  );

  const chooseFolder = async () => {
    try {
      const selected = await bridge.chooseFolder();
      if (selected) setFolderPath(selected);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Folder selection failed.");
    }
  };

  const createBackup = async () => {
    if (!folderPath.trim()) {
      notify("Choose a folder first.");
      return;
    }
    setBusy("backup");
    try {
      const record = await bridge.backupFolder(folderPath);
      setBackups((current) => [record, ...current].slice(0, 30));
      notify(`Snapshot created with ${record.fileCount} files.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Snapshot failed.");
    } finally {
      setBusy("");
    }
  };

  const scanScreenshots = async () => {
    setBusy("screenshots");
    try {
      const result = await bridge.scanScreenshots();
      setScreenshots(result);
      notify(`Indexed ${result.length} recent screenshots.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Screenshot scan failed.");
    } finally {
      setBusy("");
    }
  };

  const scanOrphans = async () => {
    setBusy("orphans");
    try {
      const result = await bridge.scanOrphans();
      setOrphans(result);
      notify(`Found ${result.length} possible leftover folders. Nothing was removed.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Orphan scan failed.");
    } finally {
      setBusy("");
    }
  };

  const analyzeCrash = async () => {
    setBusy("crash");
    try {
      const result = await bridge.analyzeCrashLog();
      setCrashReport(result);
      if (result) notify("Crash log analyzed locally.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Crash analysis failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page power-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">STEAM ATLAS 1.0 · POWER SUITE</span>
          <h1>Twenty useful tools, one safe workspace.</h1>
          <p>
            Local-first helpers for games you own—no entitlement changes,
            credential capture, or automatic deletion.
          </p>
        </div>
        <label className="inline-search power-search">
          <ScanSearch size={16} />
          <input
            value={featureQuery}
            onChange={(event) => setFeatureQuery(event.target.value)}
            placeholder="Filter 20 features"
          />
        </label>
      </div>

      <div className="power-feature-grid">
        {shownFeatures.map(({ id, title, description, icon: Icon, badge }) => (
          <button
            type="button"
            key={id}
            className={`power-feature ${active === id ? "active" : ""}`}
            onClick={() => setActive(id)}
          >
            <span className="power-feature-icon"><Icon size={19} /></span>
            <span>
              <small>{badge}</small>
              <strong>{title}</strong>
              <em>{description}</em>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>

      <section className="power-workbench panel">
        <WorkbenchHeader feature={features.find((item) => item.id === active)!} />
        {(active === "save-vault" || active === "config-manager") && (
          <BackupWorkbench
            mode={active}
            folderPath={folderPath}
            setFolderPath={setFolderPath}
            chooseFolder={chooseFolder}
            createBackup={createBackup}
            busy={busy === "backup"}
            backups={backups}
          />
        )}
        {active === "launch-profiles" && (
          <LaunchWorkbench
            profiles={launchProfiles}
            setProfiles={setLaunchProfiles}
            timeline={timeline}
            setTimeline={setTimeline}
            onLink={onLink}
            notify={notify}
          />
        )}
        {active === "update-intel" && (
          <UpdateWorkbench library={library} onLink={onLink} />
        )}
        {active === "analytics" && <AnalyticsWorkbench library={library} />}
        {active === "backlog" && (
          <BacklogWorkbench items={backlog} setItems={setBacklog} />
        )}
        {active === "screenshots" && (
          <ScreenshotWorkbench
            screenshots={screenshots}
            scan={scanScreenshots}
            busy={busy === "screenshots"}
          />
        )}
        {active === "achievements" && (
          <AchievementWorkbench accounts={accounts} onLink={onLink} />
        )}
        {active === "compatibility" && (
          <CompatibilityWorkbench library={library} onLink={onLink} />
        )}
        {active === "orphans" && (
          <OrphanWorkbench
            orphans={orphans}
            scan={scanOrphans}
            busy={busy === "orphans"}
          />
        )}
        {active === "duplicates" && <DuplicateWorkbench library={library} />}
        {active === "mods" && (
          <ModWorkbench
            mods={mods}
            setMods={setMods}
            tools={tools}
            onNavigate={onNavigate}
          />
        )}
        {active === "watchlist" && (
          <WatchlistWorkbench
            items={watchlist}
            setItems={setWatchlist}
            currency={settings.currency}
            notify={notify}
          />
        )}
        {active === "timeline" && <TimelineWorkbench items={timeline} />}
        {active === "crash" && (
          <CrashWorkbench
            report={crashReport}
            analyze={analyzeCrash}
            busy={busy === "crash"}
            notify={notify}
          />
        )}
        {active === "account-compare" && <AccountWorkbench accounts={accounts} />}
        {active === "artwork" && (
          <ArtworkWorkbench entries={artwork} setEntries={setArtwork} />
        )}
        {active === "command-palette" && (
          <InfoAction
            icon={<Command />}
            title="The global palette is active"
            detail="Press Ctrl+K anywhere in Atlas to navigate, scan this PC, or open the Manifest Vault without leaving the keyboard."
            action={<kbd>Ctrl K</kbd>}
          />
        )}
        {active === "tray" && <TrayWorkbench notify={notify} />}
        {active === "portable" && (
          <InfoAction
            icon={<ShieldCheck />}
            title="Portable, but not leaky"
            detail="Open Settings to export or import your appearance and region configuration. API keys and custom local paths are intentionally omitted."
            action={
              <button className="primary-button" onClick={() => onNavigate("settings")}>
                Open Settings <ChevronRight size={16} />
              </button>
            }
          />
        )}
      </section>
    </div>
  );
}

function WorkbenchHeader({
  feature
}: {
  feature: (typeof features)[number];
}) {
  const Icon = feature.icon;
  return (
    <div className="workbench-heading">
      <span><Icon size={21} /></span>
      <div>
        <small>{feature.badge} WORKBENCH</small>
        <h2>{feature.title}</h2>
        <p>{feature.description}</p>
      </div>
    </div>
  );
}

function BackupWorkbench({
  mode,
  folderPath,
  setFolderPath,
  chooseFolder,
  createBackup,
  busy,
  backups
}: {
  mode: "save-vault" | "config-manager";
  folderPath: string;
  setFolderPath: (path: string) => void;
  chooseFolder: () => void;
  createBackup: () => void;
  busy: boolean;
  backups: BackupRecord[];
}) {
  return (
    <div className="workbench-body">
      <div className="safe-note">
        <ShieldCheck size={17} />
        {mode === "save-vault"
          ? "Select a save folder you recognize. Atlas copies it into its own dated backup vault."
          : "Choose a configuration folder before changing game settings. This creates a recoverable snapshot."}
      </div>
      <div className="path-action">
        <label className="field">
          <span>Source folder</span>
          <input
            value={folderPath}
            onChange={(event) => setFolderPath(event.target.value)}
            placeholder="Choose a save or configuration folder"
          />
        </label>
        <button className="secondary-button" onClick={chooseFolder}>
          <FolderOpen size={16} /> Browse
        </button>
        <button className="primary-button" onClick={createBackup} disabled={busy}>
          <Archive size={16} /> {busy ? "Copying…" : "Create snapshot"}
        </button>
      </div>
      <div className="record-list">
        {backups.slice(0, 6).map((backup) => (
          <div key={backup.id}>
            <span><CheckCircle2 size={16} /></span>
            <div>
              <strong>{backup.sourcePath.split(/[\\/]/).pop()}</strong>
              <small>{readableDate(backup.createdAt)} · {backup.fileCount} files · {bytes(backup.totalBytes)}</small>
              <code>{backup.backupPath}</code>
            </div>
          </div>
        ))}
        {!backups.length && <p className="workbench-empty">No snapshots yet.</p>}
      </div>
    </div>
  );
}

function LaunchWorkbench({
  profiles,
  setProfiles,
  timeline,
  setTimeline,
  onLink,
  notify
}: {
  profiles: StoredLaunchProfile[];
  setProfiles: (next: StoredLaunchProfile[] | ((current: StoredLaunchProfile[]) => StoredLaunchProfile[])) => void;
  timeline: SessionItem[];
  setTimeline: (next: SessionItem[] | ((current: SessionItem[]) => SessionItem[])) => void;
  onLink: (url: string) => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const [args, setArgs] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !/^\d+$/.test(appId)) return;
    setProfiles((current) => [
      { id: crypto.randomUUID(), name: name.trim(), appId, args: args.trim() },
      ...current
    ]);
    setName("");
    setAppId("");
    setArgs("");
  };
  const launch = (profile: StoredLaunchProfile) => {
    const safeArgs = encodeURIComponent(profile.args);
    onLink(`steam://run/${profile.appId}//${safeArgs}`);
    setTimeline((current) => [
      { id: crypto.randomUUID(), name: profile.name, appId: profile.appId, launchedAt: new Date().toISOString() },
      ...current
    ].slice(0, 100));
    notify(`Launch request sent to Steam for ${profile.name}.`);
  };
  return (
    <div className="workbench-body">
      <form className="compact-form" onSubmit={submit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" />
        <input value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} placeholder="AppID" />
        <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="Optional launch arguments" />
        <button className="primary-button"><Plus size={16} /> Save</button>
      </form>
      <div className="profile-card-grid">
        {profiles.map((profile) => (
          <article key={profile.id}>
            <span>APP {profile.appId}</span>
            <h3>{profile.name}</h3>
            <code>{profile.args || "Default arguments"}</code>
            <div>
              <button className="launch-button" onClick={() => launch(profile)}><Play size={15} /> Launch</button>
              <button className="mini-icon danger" onClick={() => setProfiles((current) => current.filter((item) => item.id !== profile.id))}><Trash2 size={15} /></button>
            </div>
          </article>
        ))}
        {!profiles.length && <p className="workbench-empty">Save a launch profile to begin.</p>}
      </div>
    </div>
  );
}

function UpdateWorkbench({ library, onLink }: { library: Game[]; onLink: (url: string) => void }) {
  return (
    <div className="workbench-body">
      {library.length ? (
        <div className="data-table compact-data-table">
          {library.slice(0, 12).map((game) => (
            <div key={game.appid}>
              <span><GameImage game={game} /></span>
              <div><strong>{game.name}</strong><small>AppID {game.appid}</small></div>
              <code>Build {game.buildId || "unknown"}</code>
              <button className="text-button" onClick={() => onLink(`https://steamdb.info/app/${game.appid}/patchnotes/`)}>History <ExternalLink size={13} /></button>
            </div>
          ))}
        </div>
      ) : <p className="workbench-empty">Scan your installed library to populate local BuildIDs.</p>}
    </div>
  );
}

function AnalyticsWorkbench({ library }: { library: Game[] }) {
  const total = library.reduce((sum, game) => sum + (game.sizeOnDisk || 0), 0);
  const desktopReady = library.filter((game) =>
    game.platforms.some((platform) => ["Windows", "Linux", "Linux / Proton"].includes(platform))
  ).length;
  const largest = [...library].sort((a, b) => (b.sizeOnDisk || 0) - (a.sizeOnDisk || 0)).slice(0, 5);
  return (
    <div className="workbench-body">
      <div className="metric-grid">
        <Metric label="Indexed games" value={String(library.length)} />
        <Metric label="Total footprint" value={bytes(total)} />
        <Metric label="Desktop-ready" value={String(desktopReady)} />
        <Metric label="Known BuildIDs" value={String(library.filter((game) => game.buildId).length)} />
      </div>
      <div className="rank-list">
        {largest.map((game, index) => (
          <div key={game.appid}><span>{index + 1}</span><strong>{game.name}</strong><small>{bytes(game.sizeOnDisk)}</small></div>
        ))}
      </div>
      {!library.length && <p className="workbench-empty">Run a local scan for meaningful analytics.</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function BacklogWorkbench({
  items,
  setItems
}: {
  items: BacklogItem[];
  setItems: (next: BacklogItem[] | ((current: BacklogItem[]) => BacklogItem[])) => void;
}) {
  const [title, setTitle] = useState("");
  const [appId, setAppId] = useState("");
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setItems((current) => [{ id: crypto.randomUUID(), title: title.trim(), appId, status: "Backlog" }, ...current]);
    setTitle("");
    setAppId("");
  };
  return (
    <div className="workbench-body">
      <form className="compact-form" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Game title" />
        <input value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} placeholder="Optional AppID" />
        <button className="primary-button"><Plus size={16} /> Add</button>
      </form>
      <div className="backlog-board">
        {(["Backlog", "Playing", "Completed", "Paused"] as const).map((status) => (
          <section key={status}>
            <header><strong>{status}</strong><span>{items.filter((item) => item.status === status).length}</span></header>
            {items.filter((item) => item.status === status).map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong><small>{item.appId ? `APP ${item.appId}` : "No AppID"}</small>
                <DarkSelect
                  value={item.status}
                  ariaLabel={`Status for ${item.title}`}
                  options={["Backlog", "Playing", "Completed", "Paused"].map((value) => ({ value, label: value }))}
                  onChange={(value) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: value as BacklogItem["status"] } : entry))}
                />
                <button className="mini-icon danger" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 size={14} /></button>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function ScreenshotWorkbench({ screenshots, scan, busy }: { screenshots: ScreenshotRecord[]; scan: () => void; busy: boolean }) {
  return (
    <div className="workbench-body">
      <button className="primary-button" onClick={scan} disabled={busy}><RefreshCcw size={16} /> {busy ? "Scanning…" : "Scan recent screenshots"}</button>
      <div className="screenshot-grid">
        {screenshots.map((shot) => (
          <article key={shot.id}><img src={shot.previewDataUrl} alt={shot.fileName} /><span><strong>APP {shot.appId}</strong><small>{shot.fileName}</small></span></article>
        ))}
      </div>
      {!screenshots.length && <p className="workbench-empty">The scan is read-only and previews at most 24 recent local images.</p>}
    </div>
  );
}

function AchievementWorkbench({ accounts, onLink }: { accounts: SteamAccount[]; onLink: (url: string) => void }) {
  const [steamId, setSteamId] = useState(accounts[0]?.steamId || "");
  const [appId, setAppId] = useState("");
  return (
    <div className="workbench-body">
      <div className="path-action">
        <div className="field">
          <span>Local account</span>
          <DarkSelect value={steamId} onChange={setSteamId} ariaLabel="Steam account" options={accounts.map((account) => ({ value: account.steamId, label: account.personaName, detail: account.steamId }))} />
        </div>
        <label className="field"><span>AppID</span><input value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} placeholder="570" /></label>
        <button className="primary-button" disabled={!steamId || !appId} onClick={() => onLink(`https://steamcommunity.com/profiles/${steamId}/stats/${appId}/`)}><Trophy size={16} /> Open public stats</button>
      </div>
      <div className="safe-note"><ShieldCheck size={17} /> Read-only links only. Atlas does not unlock, edit, or spoof achievements.</div>
    </div>
  );
}

function CompatibilityWorkbench({ library, onLink }: { library: Game[]; onLink: (url: string) => void }) {
  const [appId, setAppId] = useState("");
  return (
    <div className="workbench-body">
      <div className="metric-grid">
        <Metric label="Atlas platform" value={navigator.platform || "Desktop"} />
        <Metric label="Windows/Linux-ready" value={String(library.filter((game) => game.platforms.some((platform) => ["Windows", "Linux", "Linux / Proton"].includes(platform))).length)} />
        <Metric label="Deck verified" value={String(library.filter((game) => game.deck === "Verified").length)} />
        <Metric label="Deck playable" value={String(library.filter((game) => game.deck === "Playable").length)} />
      </div>
      <div className="path-action">
        <label className="field"><span>AppID for ProtonDB</span><input value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} placeholder="AppID" /></label>
        <button className="secondary-button" disabled={!appId} onClick={() => onLink(`https://www.protondb.com/app/${appId}`)}>Open ProtonDB <ExternalLink size={15} /></button>
      </div>
    </div>
  );
}

function OrphanWorkbench({ orphans, scan, busy }: { orphans: OrphanRecord[]; scan: () => void; busy: boolean }) {
  return (
    <div className="workbench-body">
      <div className="safe-note"><ShieldCheck size={17} /> Preview-only: Atlas never deletes these folders.</div>
      <button className="primary-button" onClick={scan} disabled={busy}><ScanSearch size={16} /> {busy ? "Scanning…" : "Scan common folders"}</button>
      <div className="record-list">
        {orphans.map((item) => <div key={item.path}><span><HardDrive size={16} /></span><div><strong>{item.name}</strong><small>{bytes(item.estimatedBytes)}</small><code>{item.path}</code></div></div>)}
      </div>
      {!orphans.length && <p className="workbench-empty">Run the scanner to compare folders against installed app manifests.</p>}
    </div>
  );
}

function DuplicateWorkbench({ library }: { library: Game[] }) {
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, Game[]>();
    library.forEach((game) => {
      const key = game.name.toLowerCase().replace(/\W+/g, "");
      groups.set(key, [...(groups.get(key) || []), game]);
    });
    return [...groups.values()].filter((group) => group.length > 1);
  }, [library]);
  const paths = useMemo(() => {
    const seen = new Map<string, Game[]>();
    library.filter((game) => game.installDir).forEach((game) => seen.set(game.installDir!, [...(seen.get(game.installDir!) || []), game]));
    return [...seen.values()].filter((group) => group.length > 1);
  }, [library]);
  return (
    <div className="workbench-body">
      <div className="metric-grid"><Metric label="Similar title groups" value={String(duplicateGroups.length)} /><Metric label="Repeated install paths" value={String(paths.length)} /></div>
      {[...duplicateGroups, ...paths].map((group, index) => <div className="duplicate-group" key={index}>{group.map((game) => <span key={game.appid}><strong>{game.name}</strong><small>APP {game.appid}</small></span>)}</div>)}
      {!duplicateGroups.length && !paths.length && <p className="workbench-empty">{library.length ? "No duplicates detected in the current local index." : "Scan your library first."}</p>}
    </div>
  );
}

function ModWorkbench({
  mods,
  setMods,
  tools,
  onNavigate
}: {
  mods: ModEntry[];
  setMods: (next: ModEntry[] | ((current: ModEntry[]) => ModEntry[])) => void;
  tools: ExternalTool[];
  onNavigate: (page: Page) => void;
}) {
  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const [path, setPath] = useState("");
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!name || !appId || !path) return;
    setMods((current) => [{ id: crypto.randomUUID(), name, appId, path }, ...current]);
    setName(""); setAppId(""); setPath("");
  };
  return (
    <div className="workbench-body">
      <form className="compact-form" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mod setup name" />
        <input value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} placeholder="AppID" />
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="Mod folder or manager path" />
        <button className="primary-button"><Plus size={16} /> Associate</button>
      </form>
      <div className="record-list">
        {mods.map((mod) => <div key={mod.id}><span><Wrench size={16} /></span><div><strong>{mod.name}</strong><small>APP {mod.appId}</small><code>{mod.path}</code></div><button className="mini-icon danger" onClick={() => setMods((current) => current.filter((item) => item.id !== mod.id))}><Trash2 size={15} /></button></div>)}
      </div>
      <button className="text-button" onClick={() => onNavigate("tools")}>Open executable Tools Hub ({tools.filter((tool) => tool.category === "Mods").length} mod tools) <ChevronRight size={14} /></button>
    </div>
  );
}

function WatchlistWorkbench({
  items,
  setItems,
  currency,
  notify
}: {
  items: WatchItem[];
  setItems: (next: WatchItem[] | ((current: WatchItem[]) => WatchItem[])) => void;
  currency: string;
  notify: (message: string) => void;
}) {
  const [appId, setAppId] = useState("");
  const [target, setTarget] = useState("");
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d+$/.test(appId)) return;
    let game = featuredGames.find((entry) => entry.appid === Number(appId));
    try {
      if (isDesktop()) game = await bridge.getStoreApp(Number(appId));
    } catch {
      // The AppID is still useful even if the store is temporarily unreachable.
    }
    const next: WatchItem = {
      id: crypto.randomUUID(),
      appId,
      name: game?.name || `Steam app ${appId}`,
      price: game?.price || "Refresh later",
      target: target || "Any discount",
      refreshedAt: new Date().toISOString()
    };
    setItems((current) => [next, ...current.filter((item) => item.appId !== appId)]);
    setAppId(""); setTarget("");
  };
  const refresh = async (item: WatchItem) => {
    try {
      const game = await bridge.getStoreApp(Number(item.appId));
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, name: game.name, price: game.price, refreshedAt: new Date().toISOString() } : entry));
      notify(`${game.name} pricing refreshed.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Price refresh failed.");
    }
  };
  return (
    <div className="workbench-body">
      <form className="compact-form" onSubmit={add}>
        <input value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} placeholder="AppID" />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`Target price (${currency})`} />
        <button className="primary-button"><Plus size={16} /> Watch</button>
      </form>
      <div className="watch-grid">
        {items.map((item) => <article key={item.id}><span>APP {item.appId}</span><h3>{item.name}</h3><strong>{item.price}</strong><small>Target: {item.target}</small><div><button className="text-button" onClick={() => refresh(item)}>Refresh <RefreshCcw size={13} /></button><button className="mini-icon danger" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 size={14} /></button></div></article>)}
      </div>
    </div>
  );
}

function TimelineWorkbench({ items }: { items: SessionItem[] }) {
  return (
    <div className="workbench-body">
      <div className="timeline-list">
        {items.map((item) => <div key={item.id}><span><Play size={14} /></span><div><strong>{item.name}</strong><small>APP {item.appId}</small></div><time>{new Date(item.launchedAt).toLocaleString()}</time></div>)}
      </div>
      {!items.length && <p className="workbench-empty">Launch a saved profile to start the local timeline.</p>}
    </div>
  );
}

function CrashWorkbench({ report, analyze, busy, notify }: { report: CrashReport | null; analyze: () => void; busy: boolean; notify: (message: string) => void }) {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const inspectSystem = async () => {
    setDiagnosticBusy(true);
    try {
      setDiagnostics(await bridge.systemDiagnostics());
      notify("Local system diagnostics generated.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not generate diagnostics.");
    } finally {
      setDiagnosticBusy(false);
    }
  };
  const exportReport = async () => {
    try {
      const path = await bridge.exportDiagnostics(JSON.stringify({
        generatedAt: new Date().toISOString(),
        system: diagnostics,
        crash: report
      }));
      if (path) notify(`Redacted diagnostic report exported to ${path}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not export diagnostics.");
    }
  };
  return (
    <div className="workbench-body">
      <div className="diagnostic-actions"><button className="primary-button" onClick={analyze} disabled={busy}><Bug size={16} /> {busy ? "Analyzing…" : "Choose crash log"}</button><button className="secondary-button" onClick={inspectSystem} disabled={diagnosticBusy}><MonitorCog size={16} /> {diagnosticBusy ? "Inspecting…" : "Generate system report"}</button><button className="secondary-button" onClick={exportReport} disabled={!diagnostics && !report}><CloudDownload size={16} /> Export redacted JSON</button></div>
      {diagnostics && <div className="diagnostic-summary"><Metric label="Atlas version" value={diagnostics.appVersion} /><Metric label="Host" value={`${diagnostics.os} · ${diagnostics.architecture}`} /><Metric label="Steam roots" value={String(diagnostics.steamRoots.length)} /><Metric label="Steam Deck" value={diagnostics.steamDeck ? "Detected" : "No"} /><article><strong>CPU</strong><span>{diagnostics.cpu}</span></article><article><strong>Credential storage</strong><span>{diagnostics.secureStorage}</span></article><div className="safe-note"><ShieldCheck size={17} /> Nothing is uploaded. Exports are scrubbed again by the native backend before being written.</div></div>}
      {report ? <div className="crash-report"><header><span>{report.confidence} confidence</span><h3>{report.category}</h3><p>{report.summary}</p></header><ul>{report.suggestions.map((tip) => <li key={tip}><CheckCircle2 size={14} /> {tip}</li>)}</ul><pre>{report.excerpt}</pre></div> : <p className="workbench-empty">TXT, LOG and DMP files are inspected locally for common error signatures.</p>}
    </div>
  );
}

function AccountWorkbench({ accounts }: { accounts: SteamAccount[] }) {
  return (
    <div className="workbench-body">
      <div className="account-compare-grid">
        {accounts.map((account) => <article key={account.steamId}><span className="profile-avatar small">{account.avatar ? <img src={account.avatar} alt="" /> : account.personaName.slice(0, 2).toUpperCase()}</span><h3>{account.personaName}</h3><code>{account.steamId}</code><dl><div><dt>Level</dt><dd>{account.level || "—"}</dd></div><div><dt>Games</dt><dd>{account.games || "—"}</dd></div><div><dt>Hours</dt><dd>{account.playtime || "—"}</dd></div><div><dt>Country</dt><dd>{account.country || "—"}</dd></div></dl></article>)}
      </div>
      {!accounts.length && <p className="workbench-empty">Detect accounts first. Public values depend on each profile’s privacy settings.</p>}
    </div>
  );
}

function ArtworkWorkbench({
  entries,
  setEntries
}: {
  entries: ArtworkEntry[];
  setEntries: (next: ArtworkEntry[] | ((current: ArtworkEntry[]) => ArtworkEntry[])) => void;
}) {
  const [title, setTitle] = useState("");
  const [appId, setAppId] = useState("");
  const [image, setImage] = useState("");
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!title || !appId || !image) return;
    setEntries((current) => [{ id: crypto.randomUUID(), title, appId, image }, ...current]);
    setTitle(""); setAppId(""); setImage("");
  };
  return (
    <div className="workbench-body">
      <form className="compact-form artwork-form" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Display title" />
        <input value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} placeholder="AppID" />
        <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="HTTPS artwork URL" />
        <button className="primary-button"><Save size={16} /> Save</button>
      </form>
      <div className="artwork-grid">
        {entries.map((entry) => {
          const game: Game = { appid: Number(entry.appId), name: entry.title, image: entry.image, price: "", type: "Game", platforms: [], review: "", reviewScore: 0, tags: [] };
          return <article key={entry.id}><GameImage game={game} alt={entry.title} /><span><strong>{entry.title}</strong><small>APP {entry.appId}</small></span><button className="mini-icon danger" onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))}><Trash2 size={14} /></button></article>;
        })}
      </div>
    </div>
  );
}

function TrayWorkbench({ notify }: { notify: (message: string) => void }) {
  const hide = async () => {
    try {
      await bridge.hideToTray();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Tray mode is available in the desktop build.");
    }
  };
  return (
    <InfoAction
      icon={<Boxes />}
      title="Notification-area restore is ready"
      detail="Click the Atlas tray icon to restore the window. Use this button to hide Atlas without ending your local session."
      action={<button className="primary-button" onClick={hide}>Hide to tray</button>}
    />
  );
}

function InfoAction({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action: ReactNode }) {
  return <div className="info-action"><span>{icon}</span><div><h3>{title}</h3><p>{detail}</p></div>{action}</div>;
}
