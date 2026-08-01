import type {
  AtlasUserData,
  GameLaunchProfile,
  GameWorkspaceData,
  LibraryStatus
} from "./types";

export const ATLAS_DATA_SCHEMA = 1;
const STORAGE_KEY = "atlas.userData";

const statuses = new Set<LibraryStatus>([
  "Backlog",
  "Next",
  "Playing",
  "Finished",
  "Dropped",
  "Replay"
]);

const now = () => new Date().toISOString();

export const emptyWorkspace = (appId: string): GameWorkspaceData => ({
  appId,
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
  createdAt: now(),
  updatedAt: now()
});

const normalizeProfile = (
  value: Partial<GameLaunchProfile>,
  appId: string
): GameLaunchProfile => ({
  id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
  name: typeof value.name === "string" && value.name.trim()
    ? value.name.slice(0, 80)
    : "Default",
  appId,
  arguments: Array.isArray(value.arguments)
    ? value.arguments.filter((item): item is string => typeof item === "string").slice(0, 64)
    : [],
  protonVersion: typeof value.protonVersion === "string" ? value.protonVersion.slice(0, 120) : "",
  backupBeforeLaunch: Boolean(value.backupBeforeLaunch),
  saveLocationIds: Array.isArray(value.saveLocationIds)
    ? value.saveLocationIds.filter((item): item is string => typeof item === "string").slice(0, 64)
    : [],
  preLaunchToolIds: Array.isArray(value.preLaunchToolIds)
    ? value.preLaunchToolIds.filter((item): item is string => typeof item === "string").slice(0, 16)
    : [],
  createdAt: typeof value.createdAt === "string" ? value.createdAt : now(),
  lastLaunchedAt: typeof value.lastLaunchedAt === "string" ? value.lastLaunchedAt : undefined
});

export const normalizeWorkspace = (
  value: Partial<GameWorkspaceData>,
  appId: string
): GameWorkspaceData => {
  const fallback = emptyWorkspace(appId);
  return {
    ...fallback,
    ...value,
    appId,
    favorite: Boolean(value.favorite),
    status: statuses.has(value.status as LibraryStatus)
      ? value.status as LibraryStatus
      : "Backlog",
    rating: Math.max(0, Math.min(10, Number(value.rating) || 0)),
    notes: typeof value.notes === "string" ? value.notes.slice(0, 50_000) : "",
    tags: Array.isArray(value.tags)
      ? [...new Set(value.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 40)
      : [],
    compatibilityNotes: typeof value.compatibilityNotes === "string"
      ? value.compatibilityNotes.slice(0, 20_000)
      : "",
    preferredProtonVersion: typeof value.preferredProtonVersion === "string"
      ? value.preferredProtonVersion.slice(0, 120)
      : "",
    saveLocations: Array.isArray(value.saveLocations) ? value.saveLocations.slice(0, 64) : [],
    configLocations: Array.isArray(value.configLocations) ? value.configLocations.slice(0, 64) : [],
    launchProfiles: Array.isArray(value.launchProfiles)
      ? value.launchProfiles.slice(0, 64).map((profile) => normalizeProfile(profile, appId))
      : [],
    backups: Array.isArray(value.backups) ? value.backups.slice(0, 250) : [],
    screenshotFavorites: Array.isArray(value.screenshotFavorites)
      ? value.screenshotFavorites.filter((item): item is string => typeof item === "string").slice(0, 1_000)
      : [],
    screenshotTags: value.screenshotTags && typeof value.screenshotTags === "object" && !Array.isArray(value.screenshotTags)
      ? Object.fromEntries(Object.entries(value.screenshotTags).slice(0, 1_000).map(([key, tags]) => [key, Array.isArray(tags) ? tags.filter((item): item is string => typeof item === "string").slice(0, 20) : []]))
      : {},
    customArtwork: value.customArtwork && typeof value.customArtwork === "object" && !Array.isArray(value.customArtwork)
      ? value.customArtwork
      : {},
    createdAt: typeof value.createdAt === "string" ? value.createdAt : fallback.createdAt,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : fallback.updatedAt
  };
};

const migrateLegacyData = (): AtlasUserData => {
  const result: AtlasUserData = {
    schemaVersion: ATLAS_DATA_SCHEMA,
    workspaces: {},
    sessions: []
  };
  try {
    const backlog = JSON.parse(localStorage.getItem("atlas.backlog") || "[]") as Array<Record<string, unknown>>;
    for (const item of backlog) {
      const appId = typeof item.appId === "string" && /^\d+$/.test(item.appId) ? item.appId : "";
      if (!appId) continue;
      const workspace = result.workspaces[appId] || emptyWorkspace(appId);
      const legacyStatus = item.status === "Completed" ? "Finished" : item.status;
      workspace.status = statuses.has(legacyStatus as LibraryStatus)
        ? legacyStatus as LibraryStatus
        : "Backlog";
      result.workspaces[appId] = workspace;
    }
    const profiles = JSON.parse(localStorage.getItem("atlas.launchProfiles") || "[]") as Array<Record<string, unknown>>;
    for (const item of profiles) {
      const appId = typeof item.appId === "string" && /^\d+$/.test(item.appId) ? item.appId : "";
      if (!appId) continue;
      const workspace = result.workspaces[appId] || emptyWorkspace(appId);
      const legacyArgs = typeof item.args === "string" ? item.args.trim() : "";
      workspace.launchProfiles.push(normalizeProfile({
        id: typeof item.id === "string" ? item.id : undefined,
        name: typeof item.name === "string" ? item.name : "Imported profile",
        arguments: legacyArgs ? [legacyArgs] : []
      }, appId));
      result.workspaces[appId] = workspace;
    }
  } catch {
    // Legacy data is optional. A malformed old prototype must not block startup.
  }
  return result;
};

export const loadAtlasData = (): AtlasUserData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacyData();
    return parseAtlasData(raw);
  } catch {
    return migrateLegacyData();
  }
};

export const parseAtlasData = (raw: string): AtlasUserData => {
  const parsed = JSON.parse(raw) as Partial<AtlasUserData>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Atlas user data must be a JSON object.");
  }
  const workspaces = Object.fromEntries(
    Object.entries(parsed.workspaces || {})
      .filter(([appId]) => /^\d+$/.test(appId))
      .map(([appId, workspace]) => [appId, normalizeWorkspace(workspace, appId)])
  );
  return {
    schemaVersion: ATLAS_DATA_SCHEMA,
    workspaces,
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions.slice(0, 2_000) : []
  };
};

export const serializeAtlasData = (data: AtlasUserData) => JSON.stringify({
  ...data,
  schemaVersion: ATLAS_DATA_SCHEMA,
  sessions: data.sessions.slice(0, 2_000)
});

export const saveAtlasData = (data: AtlasUserData) => {
  localStorage.setItem(STORAGE_KEY, serializeAtlasData(data));
};

export const withWorkspace = (
  data: AtlasUserData,
  appId: string,
  update: (workspace: GameWorkspaceData) => GameWorkspaceData
): AtlasUserData => {
  const current = data.workspaces[appId] || emptyWorkspace(appId);
  const next = normalizeWorkspace({
    ...update(current),
    updatedAt: now()
  }, appId);
  return {
    ...data,
    workspaces: { ...data.workspaces, [appId]: next }
  };
};
