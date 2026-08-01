import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileCog,
  FolderOpen,
  Gamepad2,
  Heart,
  Image,
  Rocket,
  MonitorCog,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Star,
  Tag,
  Trash2
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { bridge, isDesktop, localAssetUrl } from "./bridge";
import { DarkSelect } from "./components/DarkSelect";
import { GameImage } from "./components/GameImage";
import type {
  BackupPreview,
  ArtworkKind,
  ConfigDiff,
  Game,
  GameLaunchProfile,
  GameSession,
  GameWorkspaceData,
  LibraryStatus,
  ManagedLocation,
  PlatformInfo,
  ScreenshotRecord
} from "./types";

type WorkspaceTab = "overview" | "saves" | "launch" | "config" | "media" | "artwork" | "compatibility";

const statusOptions: LibraryStatus[] = [
  "Backlog",
  "Next",
  "Playing",
  "Finished",
  "Dropped",
  "Replay"
];

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof Save }> = [
  { id: "overview", label: "Overview", icon: Gamepad2 },
  { id: "saves", label: "Save Vault", icon: Save },
  { id: "launch", label: "Launch profiles", icon: Rocket },
  { id: "config", label: "Configs", icon: FileCog },
  { id: "media", label: "Screenshots", icon: Image },
  { id: "artwork", label: "Artwork", icon: Palette },
  { id: "compatibility", label: "Compatibility", icon: MonitorCog }
];

const bytes = (value = 0) => {
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return `${(value / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
};

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || "Folder";

export function GameWorkspace({
  game,
  workspace,
  platform,
  sessions,
  onUpdate,
  onSession,
  onClose,
  onLink,
  notify
}: {
  game: Game;
  workspace: GameWorkspaceData;
  platform: PlatformInfo | null;
  sessions: GameSession[];
  onUpdate: (update: (current: GameWorkspaceData) => GameWorkspaceData) => void;
  onSession: (session: GameSession) => void;
  onClose: () => void;
  onLink: (url: string) => void;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [tagDraft, setTagDraft] = useState("");

  const addTag = (event: FormEvent) => {
    event.preventDefault();
    const tag = tagDraft.trim().slice(0, 32);
    if (!tag || workspace.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
    onUpdate((current) => ({ ...current, tags: [...current.tags, tag].slice(0, 40) }));
    setTagDraft("");
  };

  return (
    <div className="workspace-shell" role="dialog" aria-modal="true" aria-label={`${game.name} workspace`}>
      <header className="workspace-hero">
        {workspace.customArtwork.hero ? (
          <img src={localAssetUrl(workspace.customArtwork.hero)} alt="" />
        ) : (
          <GameImage game={game} alt="" />
        )}
        <div className="workspace-hero-shade" />
        <button className="workspace-back" onClick={onClose}><ArrowLeft size={18} /> Library</button>
        <div className="workspace-title">
          <span>GAME WORKSPACE · APP {game.appid}</span>
          <h1>{game.name}</h1>
          <p>{game.summary || "Your local command center for this game."}</p>
        </div>
        <div className="workspace-hero-actions">
          <button
            className={`workspace-favorite ${workspace.favorite ? "active" : ""}`}
            onClick={() => onUpdate((current) => ({ ...current, favorite: !current.favorite }))}
            aria-pressed={workspace.favorite}
          >
            <Heart size={17} fill={workspace.favorite ? "currentColor" : "none"} />
            {workspace.favorite ? "Favorited" : "Favorite"}
          </button>
          <div className="workspace-status-select">
            <DarkSelect
              value={workspace.status}
              ariaLabel="Library status"
              options={statusOptions.map((value) => ({ value, label: value }))}
              onChange={(value) => onUpdate((current) => ({ ...current, status: value as LibraryStatus }))}
            />
          </div>
        </div>
      </header>

      <div className="workspace-layout">
        <nav className="workspace-tabs" aria-label="Game workspace sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </nav>

        <main className="workspace-content">
          {tab === "overview" && (
            <section className="workspace-overview">
              <div className="workspace-metrics">
                <Metric label="Status" value={workspace.status} />
                <Metric label="Your rating" value={workspace.rating ? `${workspace.rating.toFixed(1)} / 10` : "Not rated"} />
                <Metric label="Save locations" value={String(workspace.saveLocations.length)} />
                <Metric label="Launch profiles" value={String(workspace.launchProfiles.length)} />
              </div>

              <div className="workspace-grid-two">
                <article className="workspace-panel">
                  <header><Star size={18} /><div><h2>Personal score</h2><p>Private and stored only in Atlas.</p></div></header>
                  <div className="rating-control">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={workspace.rating}
                      onChange={(event) => onUpdate((current) => ({ ...current, rating: Number(event.target.value) }))}
                    />
                    <strong>{workspace.rating.toFixed(1)}</strong>
                  </div>
                </article>
                <article className="workspace-panel">
                  <header><Tag size={18} /><div><h2>Personal tags</h2><p>Build collections in your own language.</p></div></header>
                  <form className="tag-editor" onSubmit={addTag}>
                    <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} maxLength={32} placeholder="Add a tag" />
                    <button className="secondary-button"><Plus size={15} /> Add</button>
                  </form>
                  <div className="workspace-tags">
                    {workspace.tags.map((tag) => (
                      <button key={tag} title="Remove tag" onClick={() => onUpdate((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))}>
                        {tag} <span>×</span>
                      </button>
                    ))}
                    {!workspace.tags.length && <small>No personal tags yet.</small>}
                  </div>
                </article>
              </div>

              <article className="workspace-panel workspace-notes">
                <header><FileCog size={18} /><div><h2>Game notes</h2><p>Build ideas, controls, quests, mod notes, or anything worth remembering.</p></div></header>
                <textarea
                  value={workspace.notes}
                  maxLength={50_000}
                  onChange={(event) => onUpdate((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Write private notes for this game…"
                />
                <small>{workspace.notes.length.toLocaleString()} / 50,000 characters · saved automatically</small>
              </article>

              <article className="workspace-panel">
                <header><Clock3 size={18} /><div><h2>Recent Atlas launches</h2><p>Only launches requested through a saved Atlas profile appear here.</p></div></header>
                <div className="workspace-session-list">
                  {sessions.slice(0, 8).map((session) => (
                    <div key={session.id}><Play size={14} /><strong>{session.profileName}</strong><time>{new Date(session.launchedAt).toLocaleString()}</time></div>
                  ))}
                  {!sessions.length && <p className="workspace-empty">No Atlas launch history for this game.</p>}
                </div>
              </article>
            </section>
          )}

          {tab === "saves" && (
            <LocationWorkbench
              kind="save"
              locations={workspace.saveLocations}
              backups={workspace.backups.filter((backup) => backup.kind !== "config")}
              onLocations={(saveLocations) => onUpdate((current) => ({ ...current, saveLocations }))}
              onBackup={(backup) => onUpdate((current) => ({ ...current, backups: [{ ...backup, appId: String(game.appid), kind: "save" as const }, ...current.backups].slice(0, 250) }))}
              notify={notify}
            />
          )}

          {tab === "launch" && (
            <LaunchProfiles
              game={game}
              profiles={workspace.launchProfiles}
              saveLocations={workspace.saveLocations}
              onProfiles={(launchProfiles) => onUpdate((current) => ({ ...current, launchProfiles }))}
              onBackup={(backup) => onUpdate((current) => ({ ...current, backups: [{ ...backup, appId: String(game.appid), kind: "save" as const }, ...current.backups].slice(0, 250) }))}
              onSession={onSession}
              notify={notify}
            />
          )}

          {tab === "config" && (
            <ConfigManager
              locations={workspace.configLocations}
              backups={workspace.backups.filter((backup) => backup.kind === "config")}
              onLocations={(configLocations) => onUpdate((current) => ({ ...current, configLocations }))}
              onBackup={(backup) => onUpdate((current) => ({ ...current, backups: [{ ...backup, appId: String(game.appid), kind: "config" as const }, ...current.backups].slice(0, 250) }))}
              notify={notify}
            />
          )}

          {tab === "media" && <MediaWorkbench game={game} workspace={workspace} onUpdate={onUpdate} notify={notify} />}

          {tab === "artwork" && <ArtworkWorkbench game={game} workspace={workspace} onUpdate={onUpdate} notify={notify} />}

          {tab === "compatibility" && (
            <CompatibilityWorkbench
              game={game}
              platform={platform}
              workspace={workspace}
              onUpdate={onUpdate}
              onLink={onLink}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function LocationWorkbench({
  kind,
  locations,
  backups,
  onLocations,
  onBackup,
  notify
}: {
  kind: "save" | "config";
  locations: ManagedLocation[];
  backups: GameWorkspaceData["backups"];
  onLocations: (locations: ManagedLocation[]) => void;
  onBackup: (backup: GameWorkspaceData["backups"][number]) => void;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const noun = kind === "save" ? "save" : "configuration";

  const addLocation = async () => {
    try {
      const path = await bridge.chooseFolder();
      if (!path || locations.some((item) => item.path.toLowerCase() === path.toLowerCase())) return;
      onLocations([...locations, {
        id: crypto.randomUUID(),
        label: folderName(path),
        path,
        kind,
        enabled: true,
        createdAt: new Date().toISOString()
      }]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not select the folder.");
    }
  };

  const createBackup = async (location: ManagedLocation) => {
    setBusy(location.id);
    try {
      const backup = await bridge.backupFolder(location.path);
      onBackup({ ...backup, locationId: location.id, kind });
      notify(`${location.label} snapshot created with ${backup.fileCount.toLocaleString()} files.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Backup failed.");
    } finally {
      setBusy("");
    }
  };

  const inspectRestore = async (backupPath: string, destinationPath: string) => {
    try {
      setPreview(await bridge.previewRestore(backupPath, destinationPath));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not inspect the restore.");
    }
  };

  const confirmRestore = async () => {
    if (!preview) return;
    setRestoreBusy(true);
    try {
      const result = await bridge.restoreBackup(preview.backupPath, preview.destinationPath);
      onBackup({ ...result.recoveryBackup, kind: "recovery" });
      notify(`Restore completed. A recovery snapshot was created first.`);
      setPreview(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <section>
      <div className="workspace-section-heading">
        <div><span>{kind === "save" ? <Save /> : <FileCog />}</span><div><h2>{kind === "save" ? "Save Vault" : "Configuration manager"}</h2><p>Register known folders, create snapshots, and restore only after reviewing the target.</p></div></div>
        <button className="primary-button" onClick={addLocation}><FolderOpen size={16} /> Add {noun} folder</button>
      </div>
      <div className="workspace-safety"><ShieldCheck size={17} /> Symbolic links are skipped. Every restore creates a recovery snapshot before writing files.</div>

      <div className="location-list">
        {locations.map((location) => (
          <article key={location.id}>
            <div className="location-main"><FolderOpen size={19} /><div><input value={location.label} maxLength={80} aria-label="Folder label" onChange={(event) => onLocations(locations.map((item) => item.id === location.id ? { ...item, label: event.target.value } : item))} /><code>{location.path}</code></div></div>
            <div className="location-actions">
              <button className="secondary-button" onClick={() => bridge.revealPath(location.path).catch((error) => notify(String(error)))}><ExternalLink size={15} /> Show</button>
              <button className="primary-button" disabled={busy === location.id} onClick={() => createBackup(location)}><Archive size={15} /> {busy === location.id ? "Copying…" : "Snapshot"}</button>
              <button className="mini-icon danger" aria-label={`Remove ${location.label}`} onClick={() => onLocations(locations.filter((item) => item.id !== location.id))}><Trash2 size={15} /></button>
            </div>
          </article>
        ))}
        {!locations.length && <div className="workspace-empty-card"><FolderOpen /><h3>No {noun} folders registered</h3><p>Atlas will never guess and modify a folder without showing it to you first.</p></div>}
      </div>

      <div className="workspace-section-heading compact"><div><span><Clock3 /></span><div><h2>Snapshots</h2><p>Newest snapshots are shown first.</p></div></div></div>
      <div className="backup-table">
        {backups.map((backup) => {
          const destination = locations.find((item) => item.id === backup.locationId)?.path || backup.sourcePath;
          return (
            <div key={backup.id + backup.backupPath}>
              <CheckCircle2 size={16} />
              <span><strong>{folderName(backup.sourcePath)}</strong><small>{new Date(/^\d+$/.test(backup.createdAt) ? Number(backup.createdAt) * 1000 : backup.createdAt).toLocaleString()}</small></span>
              <code>{backup.fileCount.toLocaleString()} files · {bytes(backup.totalBytes)}</code>
              <button className="text-button" onClick={() => inspectRestore(backup.backupPath, destination)}><RotateCcw size={14} /> Review restore</button>
            </div>
          );
        })}
        {!backups.length && <p className="workspace-empty">No snapshots recorded for this workspace.</p>}
      </div>

      {preview && (
        <div className="restore-review" role="alertdialog" aria-label="Review restore">
          <div><ShieldCheck size={22} /><span><strong>Review restore</strong><small>No files have been changed yet.</small></span></div>
          <dl>
            <div><dt>Snapshot</dt><dd>{preview.backupPath}</dd></div>
            <div><dt>Destination</dt><dd>{preview.destinationPath}</dd></div>
            <div><dt>Contents</dt><dd>{preview.fileCount.toLocaleString()} files · {bytes(preview.totalBytes)}</dd></div>
            <div><dt>Protection</dt><dd>A recovery snapshot will be created first.</dd></div>
          </dl>
          <footer><button className="secondary-button" onClick={() => setPreview(null)}>Cancel</button><button className="primary-button" disabled={restoreBusy} onClick={confirmRestore}><RotateCcw size={15} /> {restoreBusy ? "Restoring…" : "Create recovery and restore"}</button></footer>
        </div>
      )}
    </section>
  );
}

function ConfigManager({
  locations,
  backups,
  onLocations,
  onBackup,
  notify
}: {
  locations: ManagedLocation[];
  backups: GameWorkspaceData["backups"];
  onLocations: (locations: ManagedLocation[]) => void;
  onBackup: (backup: GameWorkspaceData["backups"][number]) => void;
  notify: (message: string) => void;
}) {
  const [diff, setDiff] = useState<ConfigDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const compare = async () => {
    setBusy(true);
    try {
      const result = await bridge.compareConfigFiles();
      if (result) {
        setDiff(result);
        notify(`Compared ${result.beforeLines.toLocaleString()} and ${result.afterLines.toLocaleString()} lines.`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Configuration comparison failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <LocationWorkbench
        kind="config"
        locations={locations}
        backups={backups}
        onLocations={onLocations}
        onBackup={onBackup}
        notify={notify}
      />
      <section className="config-compare-section">
        <div className="workspace-section-heading"><div><span><FileCog /></span><div><h2>Text configuration comparison</h2><p>Select exactly two small text configs. Atlas reads them locally and shows changed line positions.</p></div></div><button className="secondary-button" disabled={busy} onClick={compare}><FileCog size={15} /> {busy ? "Comparing…" : "Choose two files"}</button></div>
        <div className="workspace-safety"><ShieldCheck size={17} /> Supported text formats are limited to CFG, CONF, INI, JSON, TOML, TXT, VDF, XML and YAML. Binary files are rejected.</div>
        {diff ? (
          <div className="config-diff">
            <header><div><span>BEFORE</span><code>{diff.beforePath}</code><small>{diff.beforeLines.toLocaleString()} lines</small></div><div><span>AFTER</span><code>{diff.afterPath}</code><small>{diff.afterLines.toLocaleString()} lines</small></div></header>
            <div className="config-diff-lines">
              {diff.changes.map((change) => <div key={change.line}><strong>{change.line}</strong><pre>{change.before ?? ""}</pre><pre>{change.after ?? ""}</pre></div>)}
              {!diff.changes.length && <p className="workspace-empty">The files are identical line by line.</p>}
            </div>
            {diff.truncated && <footer>Showing the first 500 changed positions. The original files were not modified.</footer>}
          </div>
        ) : <div className="workspace-empty-card"><FileCog /><h3>No comparison loaded</h3><p>Create a snapshot first, change your config, then compare the previous and current files.</p></div>}
      </section>
    </>
  );
}

function LaunchProfiles({
  game,
  profiles,
  saveLocations,
  onProfiles,
  onBackup,
  onSession,
  notify
}: {
  game: Game;
  profiles: GameLaunchProfile[];
  saveLocations: ManagedLocation[];
  onProfiles: (profiles: GameLaunchProfile[]) => void;
  onBackup: (backup: GameWorkspaceData["backups"][number]) => void;
  onSession: (session: GameSession) => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [argumentsText, setArgumentsText] = useState("");
  const [protonVersion, setProtonVersion] = useState("");
  const [backupBeforeLaunch, setBackupBeforeLaunch] = useState(false);
  const [busy, setBusy] = useState("");

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const profile: GameLaunchProfile = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 80),
      appId: String(game.appid),
      arguments: argumentsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 64),
      protonVersion: protonVersion.trim().slice(0, 120),
      backupBeforeLaunch,
      saveLocationIds: backupBeforeLaunch ? saveLocations.filter((item) => item.enabled).map((item) => item.id) : [],
      createdAt: new Date().toISOString()
    };
    onProfiles([profile, ...profiles]);
    setName(""); setArgumentsText(""); setProtonVersion(""); setBackupBeforeLaunch(false);
  };

  const launch = async (profile: GameLaunchProfile) => {
    setBusy(profile.id);
    try {
      if (!isDesktop()) throw new Error("Launch profiles are available in the desktop build.");
      if (profile.backupBeforeLaunch) {
        for (const location of saveLocations.filter((item) => profile.saveLocationIds.includes(item.id))) {
          const backup = await bridge.backupFolder(location.path);
          onBackup({ ...backup, appId: String(game.appid), locationId: location.id, kind: "save" });
        }
      }
      await bridge.launchSteamGame(String(game.appid), profile.arguments);
      const launchedAt = new Date().toISOString();
      onProfiles(profiles.map((item) => item.id === profile.id ? { ...item, lastLaunchedAt: launchedAt } : item));
      onSession({ id: crypto.randomUUID(), appId: String(game.appid), profileId: profile.id, profileName: profile.name, launchedAt });
      notify(`${game.name} launch request sent to Steam.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Launch failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section>
      <div className="workspace-section-heading"><div><span><Rocket /></span><div><h2>Launch profiles</h2><p>Arguments are stored as an explicit array and passed through a dedicated Steam launch command.</p></div></div></div>
      <div className="workspace-safety"><ShieldCheck size={17} /> Enter one complete argument per line. Atlas does not execute an unrestricted shell command.</div>
      <form className="launch-profile-form workspace-panel" onSubmit={add}>
        <label><span>Profile name</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Modded, performance, ultrawide…" /></label>
        <label><span>Proton version note</span><input value={protonVersion} maxLength={120} onChange={(event) => setProtonVersion(event.target.value)} placeholder="Optional, for example Proton Experimental" /></label>
        <label className="launch-arguments"><span>Launch arguments · one per line</span><textarea value={argumentsText} onChange={(event) => setArgumentsText(event.target.value)} placeholder={'-novid\n-windowed\n-w 1920'} /></label>
        <label className="check-row"><input type="checkbox" checked={backupBeforeLaunch} onChange={(event) => setBackupBeforeLaunch(event.target.checked)} /><span><strong>Back up registered save folders first</strong><small>{saveLocations.length ? `${saveLocations.length} available location(s)` : "Register a save folder before enabling this"}</small></span></label>
        <button className="primary-button" disabled={!name.trim() || (backupBeforeLaunch && !saveLocations.length)}><Plus size={16} /> Save profile</button>
      </form>
      <div className="launch-profile-grid">
        {profiles.map((profile) => (
          <article key={profile.id}>
            <header><span>APP {profile.appId}</span>{profile.backupBeforeLaunch && <em><Save size={12} /> protected launch</em>}</header>
            <h3>{profile.name}</h3>
            <p>{profile.protonVersion || "Default compatibility runtime"}</p>
            <div className="argument-chips">{profile.arguments.map((argument, index) => <code key={`${argument}-${index}`}>{argument}</code>)}{!profile.arguments.length && <small>Default Steam arguments</small>}</div>
            <footer><button className="launch-button" disabled={busy === profile.id} onClick={() => launch(profile)}><Play size={15} /> {busy === profile.id ? "Preparing…" : "Launch"}</button><button className="mini-icon danger" aria-label={`Delete ${profile.name}`} onClick={() => onProfiles(profiles.filter((item) => item.id !== profile.id))}><Trash2 size={15} /></button></footer>
          </article>
        ))}
        {!profiles.length && <div className="workspace-empty-card"><Rocket /><h3>No launch profiles</h3><p>Create a safe reusable profile for this game.</p></div>}
      </div>
    </section>
  );
}

function MediaWorkbench({
  game,
  workspace,
  onUpdate,
  notify
}: {
  game: Game;
  workspace: GameWorkspaceData;
  onUpdate: (update: (current: GameWorkspaceData) => GameWorkspaceData) => void;
  notify: (message: string) => void;
}) {
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const scan = async () => {
    setBusy(true);
    try {
      const result = await bridge.scanGameScreenshots(String(game.appid));
      setScreenshots(result);
      notify(`Found ${result.length} recent ${game.name} screenshot${result.length === 1 ? "" : "s"}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Screenshot scan failed.");
    } finally {
      setBusy(false);
    }
  };
  const shown = screenshots.filter((shot) =>
    shot.fileName.toLowerCase().includes(filter.toLowerCase())
      && (!favoriteOnly || workspace.screenshotFavorites.includes(shot.filePath))
  );
  const toggleFavorite = (path: string) => onUpdate((current) => ({
    ...current,
    screenshotFavorites: current.screenshotFavorites.includes(path)
      ? current.screenshotFavorites.filter((item) => item !== path)
      : [path, ...current.screenshotFavorites].slice(0, 1_000)
  }));
  const exportShot = async (shot: ScreenshotRecord) => {
    try {
      const path = await bridge.exportScreenshot(shot.filePath);
      if (path) notify(`Screenshot exported to ${path}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Screenshot export failed.");
    }
  };
  return (
    <section>
      <div className="workspace-section-heading"><div><span><Image /></span><div><h2>Screenshot Studio</h2><p>Read-only indexing of screenshots Steam stores locally for this AppID.</p></div></div><button className="primary-button" disabled={busy} onClick={scan}><Image size={16} /> {busy ? "Scanning…" : "Scan screenshots"}</button></div>
      <div className="workspace-media-toolbar"><label className="inline-search"><Image size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter file names" /></label><button className={`secondary-button ${favoriteOnly ? "active" : ""}`} onClick={() => setFavoriteOnly((value) => !value)}><Heart size={15} fill={favoriteOnly ? "currentColor" : "none"} /> Favorites</button></div>
      <div className="workspace-media-grid">
        {shown.map((shot) => <article key={shot.filePath}><div className="workspace-shot"><img src={shot.previewDataUrl} alt={shot.fileName} /><button className={workspace.screenshotFavorites.includes(shot.filePath) ? "active" : ""} onClick={() => toggleFavorite(shot.filePath)} aria-label="Toggle screenshot favorite"><Heart size={15} fill={workspace.screenshotFavorites.includes(shot.filePath) ? "currentColor" : "none"} /></button></div><div><strong>{shot.fileName}</strong><small>{bytes(shot.size)} · {new Date(Number(shot.modifiedAt) * 1000).toLocaleString()}</small><span><button className="text-button" onClick={() => bridge.revealPath(shot.filePath).catch((error) => notify(String(error)))}>Show <ExternalLink size={13} /></button><button className="text-button" onClick={() => exportShot(shot)}>Export <Save size={13} /></button></span></div></article>)}
        {!shown.length && <div className="workspace-empty-card"><Image /><h3>No screenshots to show</h3><p>Run a local scan or change the active filters. Nothing is uploaded.</p></div>}
      </div>
    </section>
  );
}

function ArtworkWorkbench({
  game,
  workspace,
  onUpdate,
  notify
}: {
  game: Game;
  workspace: GameWorkspaceData;
  onUpdate: (update: (current: GameWorkspaceData) => GameWorkspaceData) => void;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState<ArtworkKind | "">("");
  const definitions: Array<{ kind: ArtworkKind; title: string; guidance: string }> = [
    { kind: "grid", title: "Landscape grid", guidance: "Recommended 920 × 430" },
    { kind: "portrait", title: "Portrait grid", guidance: "Recommended 600 × 900" },
    { kind: "hero", title: "Workspace hero", guidance: "Recommended 1920 × 620" },
    { kind: "logo", title: "Transparent logo", guidance: "PNG with transparent background" }
  ];
  const choose = async (kind: ArtworkKind) => {
    setBusy(kind);
    try {
      const path = await bridge.chooseWorkspaceArtwork(String(game.appid), kind);
      if (path) {
        onUpdate((current) => ({ ...current, customArtwork: { ...current.customArtwork, [kind]: path } }));
        notify(`${definitions.find((item) => item.kind === kind)?.title} updated. The previous file was archived.`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Artwork import failed.");
    } finally {
      setBusy("");
    }
  };
  return (
    <section>
      <div className="workspace-section-heading"><div><span><Palette /></span><div><h2>Artwork Studio</h2><p>Atlas copies selected images into managed application storage and preserves replaced files in local history.</p></div></div></div>
      <div className="workspace-safety"><ShieldCheck size={17} /> This milestone changes Atlas workspace artwork only. It does not overwrite Steam client artwork behind your back.</div>
      <div className="workspace-artwork-grid">
        {definitions.map(({ kind, title, guidance }) => {
          const path = workspace.customArtwork[kind];
          return <article key={kind}><div className={`artwork-preview ${kind}`}>{path ? <img src={localAssetUrl(path)} alt={`${title} preview`} /> : <Palette />}</div><div><span>{kind.toUpperCase()}</span><h3>{title}</h3><p>{guidance}</p><footer><button className="secondary-button" disabled={busy === kind} onClick={() => choose(kind)}><FolderOpen size={14} /> {busy === kind ? "Copying…" : path ? "Replace" : "Choose image"}</button>{path && <button className="mini-icon danger" title="Remove from workspace" onClick={() => onUpdate((current) => { const customArtwork = { ...current.customArtwork }; delete customArtwork[kind]; return { ...current, customArtwork }; })}><Trash2 size={14} /></button>}</footer></div></article>;
        })}
      </div>
    </section>
  );
}

function CompatibilityWorkbench({
  game,
  platform,
  workspace,
  onUpdate,
  onLink
}: {
  game: Game;
  platform: PlatformInfo | null;
  workspace: GameWorkspaceData;
  onUpdate: (update: (current: GameWorkspaceData) => GameWorkspaceData) => void;
  onLink: (url: string) => void;
}) {
  const platformSummary = useMemo(() => game.platforms.join(", ") || "Unknown", [game.platforms]);
  return (
    <section>
      <div className="workspace-section-heading"><div><span><MonitorCog /></span><div><h2>Compatibility desk</h2><p>Local platform facts, personal observations, and authoritative external resources.</p></div></div></div>
      <div className="workspace-metrics">
        <Metric label="Atlas host" value={platform ? `${platform.os} · ${platform.architecture}` : "Desktop preview"} />
        <Metric label="Store platforms" value={platformSummary} />
        <Metric label="Steam Deck" value={game.deck || "Unknown"} />
        <Metric label="Install size" value={bytes(game.sizeOnDisk)} />
      </div>
      <div className="workspace-grid-two">
        <article className="workspace-panel">
          <header><Gamepad2 size={18} /><div><h2>Linux / Proton</h2><p>Record the version that works best on your machine.</p></div></header>
          <label className="field"><span>Preferred Proton version</span><input value={workspace.preferredProtonVersion} maxLength={120} onChange={(event) => onUpdate((current) => ({ ...current, preferredProtonVersion: event.target.value }))} placeholder="Proton Experimental, GE-Proton…" /></label>
          <div className="workspace-link-row"><button className="secondary-button" onClick={() => onLink(`https://www.protondb.com/app/${game.appid}`)}>ProtonDB <ExternalLink size={14} /></button><button className="secondary-button" onClick={() => onLink(`https://steamdb.info/app/${game.appid}/info/`)}>SteamDB info <Database size={14} /></button></div>
        </article>
        <article className="workspace-panel workspace-notes">
          <header><FileCog size={18} /><div><h2>Compatibility notes</h2><p>Drivers, launch options, controllers, mods, or known issues.</p></div></header>
          <textarea value={workspace.compatibilityNotes} maxLength={20_000} onChange={(event) => onUpdate((current) => ({ ...current, compatibilityNotes: event.target.value }))} placeholder="Document what worked on this system…" />
          <small>{workspace.compatibilityNotes.length.toLocaleString()} / 20,000 characters · saved automatically</small>
        </article>
      </div>
    </section>
  );
}
