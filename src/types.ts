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
  theme: "system" | "dark" | "light";
}

export interface PlatformInfo {
  os: "windows" | "linux" | "macos" | "unknown";
  architecture: string;
  steamRoots: string[];
  flatpakSteam: boolean;
  secureStorage: string;
  packageFormats: string[];
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
