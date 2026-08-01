export type Page =
  | "overview"
  | "discover"
  | "library"
  | "accounts"
  | "manifests"
  | "tools"
  | "power"
  | "settings";

export interface Game {
  appid: number;
  name: string;
  image: string;
  capsule?: string;
  price: string;
  discount?: number;
  type: "Game" | "DLC" | "Demo" | "Tool";
  platforms: string[];
  review: string;
  reviewScore: number;
  players?: string;
  deck?: "Verified" | "Playable" | "Unknown";
  tags: string[];
  summary?: string;
  releaseDate?: string;
  developers?: string[];
  publishers?: string[];
  dlcCount?: number;
  demoAppid?: number;
  installed?: boolean;
  installDir?: string;
  buildId?: string;
  sizeOnDisk?: number;
  lastUpdated?: string;
}

export interface SteamAccount {
  steamId: string;
  accountName: string;
  personaName: string;
  avatar?: string;
  mostRecent: boolean;
  rememberPassword: boolean;
  timestamp?: number;
  level?: number;
  games?: number;
  playtime?: number;
  country?: string;
}

export interface ManifestEntry {
  id: string;
  fileName: string;
  filePath: string;
  appId?: string;
  depotId?: string;
  manifestId?: string;
  size: number;
  importedAt: string;
  status: "valid" | "inspect" | "duplicate";
}

export interface ExternalTool {
  id: string;
  name: string;
  description: string;
  path: string;
  args: string[];
  workingDirectory?: string;
  category: string;
  color: string;
  favorite: boolean;
  lastLaunched?: string;
}

export interface AppSettings {
  steamApiKey: string;
  steamLadderApiKey: string;
  countryCode: string;
  currency: string;
  accent: string;
  secondaryAccent: string;
  compactMode: boolean;
  steamPath: string;
  backgroundImagePath: string;
  backgroundPreset: "nebula" | "midnight" | "ember" | "forest" | "none";
  backgroundOpacity: number;
  backgroundBlur: number;
  backgroundSaturation: number;
  overlayStrength: number;
  panelOpacity: number;
  sidebarOpacity: number;
  topbarOpacity: number;
  cornerRadius: number;
  glowIntensity: number;
  uiScale: number;
  density: "compact" | "comfortable" | "spacious";
  oledMode: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  theme: "system" | "dark" | "light";
  updateChannel: "stable" | "beta" | "manual";
  onboardingComplete: boolean;
}

export interface PlatformInfo {
  os: "windows" | "linux" | "macos" | "unknown";
  architecture: string;
  steamRoots: string[];
  flatpakSteam: boolean;
  secureStorage: string;
  packageFormats: string[];
  steamDeck?: boolean;
  desktopSession?: string;
  gamescopeAvailable?: boolean;
  mangoHudAvailable?: boolean;
  protonRoots?: string[];
}

export interface AccountProfile {
  steamId: string;
  personaName?: string;
  avatar?: string;
  level?: number;
  country?: string;
  profileUrl?: string;
}

export interface BackupRecord {
  id: string;
  sourcePath: string;
  backupPath: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  appId?: string;
  locationId?: string;
  kind?: "save" | "config" | "recovery";
}

export type LibraryStatus =
  | "Backlog"
  | "Next"
  | "Playing"
  | "Finished"
  | "Dropped"
  | "Replay";

export interface ManagedLocation {
  id: string;
  label: string;
  path: string;
  kind: "save" | "config";
  enabled: boolean;
  createdAt: string;
}

export interface GameLaunchProfile {
  id: string;
  name: string;
  appId: string;
  arguments: string[];
  protonVersion?: string;
  backupBeforeLaunch: boolean;
  saveLocationIds: string[];
  createdAt: string;
  lastLaunchedAt?: string;
}

export interface GameSession {
  id: string;
  appId: string;
  profileId?: string;
  profileName: string;
  launchedAt: string;
}

export interface GameWorkspaceData {
  appId: string;
  favorite: boolean;
  status: LibraryStatus;
  rating: number;
  notes: string;
  tags: string[];
  compatibilityNotes: string;
  preferredProtonVersion: string;
  saveLocations: ManagedLocation[];
  configLocations: ManagedLocation[];
  launchProfiles: GameLaunchProfile[];
  backups: BackupRecord[];
  screenshotFavorites: string[];
  screenshotTags: Record<string, string[]>;
  customArtwork: Partial<Record<ArtworkKind, string>>;
  createdAt: string;
  updatedAt: string;
}

export type ArtworkKind = "grid" | "portrait" | "hero" | "logo";

export interface ConfigDiffLine {
  line: number;
  before?: string;
  after?: string;
}

export interface ConfigDiff {
  beforePath: string;
  afterPath: string;
  beforeLines: number;
  afterLines: number;
  truncated: boolean;
  changes: ConfigDiffLine[];
}

export interface AtlasUserData {
  schemaVersion: number;
  workspaces: Record<string, GameWorkspaceData>;
  sessions: GameSession[];
}

export interface BackupPreview {
  backupPath: string;
  destinationPath: string;
  fileCount: number;
  totalBytes: number;
  recoveryWillBeCreated: boolean;
}

export interface RestoreResult {
  restoredFileCount: number;
  restoredBytes: number;
  recoveryBackup: BackupRecord;
}

export interface ScreenshotRecord {
  id: string;
  appId: string;
  fileName: string;
  filePath: string;
  previewDataUrl: string;
  size: number;
  modifiedAt: string;
}

export interface OrphanRecord {
  name: string;
  path: string;
  estimatedBytes: number;
}

export interface CrashReport {
  filePath: string;
  category: string;
  confidence: "low" | "medium" | "high";
  summary: string;
  suggestions: string[];
  excerpt: string;
}

export interface SystemDiagnostics {
  appVersion: string;
  os: string;
  architecture: string;
  cpu: string;
  memoryBytes?: number;
  steamRoots: string[];
  flatpakSteam: boolean;
  steamDeck: boolean;
  desktopSession: string;
  secureStorage: string;
  packageFormats: string[];
  notes: string[];
}
