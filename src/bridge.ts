import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  AccountProfile,
  ArtworkInstallResult,
  BackupPreview,
  BackupRecord,
  ConfigDiff,
  CrashReport,
  Game,
  ManifestEntry,
  OrphanRecord,
  PlatformInfo,
  RestoreResult,
  ScreenshotRecord,
  SteamAccount,
  SystemDiagnostics
} from "./types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isDesktop = () => Boolean(window.__TAURI_INTERNALS__);
export const localAssetUrl = (path: string) =>
  isDesktop() && path ? convertFileSrc(path) : "";

async function desktopInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isDesktop()) {
    throw new Error("This action becomes available in the compiled desktop app.");
  }
  return invoke<T>(command, args);
}

export const bridge = {
  platformInfo: () => desktopInvoke<PlatformInfo>("platform_info"),
  loadUserData: () => desktopInvoke<string | null>("load_user_data"),
  saveUserData: (json: string) => desktopInvoke<void>("save_user_data", { json }),
  exportUserData: (json: string) => desktopInvoke<string | null>("export_user_data", { json }),
  importUserData: () => desktopInvoke<string | null>("import_user_data"),
  loadSecrets: () =>
    desktopInvoke<{ steamApiKey: string; steamLadderApiKey: string; backend: string }>(
      "load_secrets"
    ),
  saveSecrets: (steamApiKey: string, steamLadderApiKey: string) =>
    desktopInvoke<void>("save_secrets", { steamApiKey, steamLadderApiKey }),
  detectAccounts: () => desktopInvoke<SteamAccount[]>("detect_steam_accounts"),
  scanLibrary: () => desktopInvoke<Game[]>("scan_installed_games"),
  searchStore: (query: string) =>
    desktopInvoke<Game[]>("search_steam_store", { query }),
  getStoreApp: (appId: number) =>
    desktopInvoke<Game>("fetch_store_app", { appId }),
  chooseExecutable: () =>
    desktopInvoke<string | null>("choose_executable"),
  chooseManifests: () =>
    desktopInvoke<ManifestEntry[]>("choose_manifest_files"),
  launchTool: (
    path: string,
    args: string[],
    workingDirectory?: string
  ) =>
    desktopInvoke<void>("launch_external_tool", {
      path,
      args,
      workingDirectory
    }),
  openExternal: (url: string) =>
    desktopInvoke<void>("open_external", { url }),
  fetchOwnedGames: (steamId: string, apiKey: string) =>
    desktopInvoke<Game[]>("fetch_owned_games", { steamId, apiKey }),
  fetchSteamLadder: (steamId: string, apiKey: string) =>
    desktopInvoke<Record<string, unknown>>("fetch_steam_ladder", {
      steamId,
      apiKey
    }),
  runSteamCmdDownload: (
    steamCmdPath: string,
    accountName: string,
    appId: string,
    depotId: string,
    manifestId?: string
  ) =>
    desktopInvoke<void>("run_steamcmd_download", {
      steamCmdPath,
      accountName,
      appId,
      depotId,
      manifestId
    }),
  fetchAccountProfile: (steamId: string) =>
    desktopInvoke<AccountProfile>("fetch_account_profile_no_key", { steamId }),
  chooseBackgroundImage: () =>
    desktopInvoke<string | null>("choose_background_image"),
  chooseFolder: () => desktopInvoke<string | null>("choose_folder"),
  backupFolder: (sourcePath: string) =>
    desktopInvoke<BackupRecord>("backup_folder", { sourcePath }),
  previewRestore: (backupPath: string, destinationPath: string) =>
    desktopInvoke<BackupPreview>("preview_backup_restore", {
      backupPath,
      destinationPath
    }),
  restoreBackup: (backupPath: string, destinationPath: string) =>
    desktopInvoke<RestoreResult>("restore_backup", {
      backupPath,
      destinationPath
    }),
  launchSteamGame: (appId: string, args: string[]) =>
    desktopInvoke<void>("launch_steam_game", { appId, args }),
  revealPath: (path: string) => desktopInvoke<void>("reveal_path", { path }),
  scanScreenshots: () =>
    desktopInvoke<ScreenshotRecord[]>("scan_steam_screenshots"),
  scanGameScreenshots: (appId: string) =>
    desktopInvoke<ScreenshotRecord[]>("scan_game_screenshots", { appId }),
  exportScreenshot: (path: string) =>
    desktopInvoke<string | null>("export_screenshot", { path }),
  compareConfigFiles: () => desktopInvoke<ConfigDiff | null>("compare_config_files"),
  chooseWorkspaceArtwork: (appId: string, kind: "grid" | "portrait" | "hero" | "logo") =>
    desktopInvoke<string | null>("choose_workspace_artwork", { appId, kind }),
  installSteamArtwork: (appId: string, steamId: string, kind: "grid" | "portrait" | "hero" | "logo", sourcePath: string) =>
    desktopInvoke<ArtworkInstallResult>("install_steam_artwork", { appId, steamId, kind, sourcePath }),
  restoreSteamArtwork: (appId: string, steamId: string, kind: "grid" | "portrait" | "hero" | "logo", backupPath: string) =>
    desktopInvoke<ArtworkInstallResult>("restore_steam_artwork", { appId, steamId, kind, backupPath }),
  scanOrphans: () => desktopInvoke<OrphanRecord[]>("scan_orphaned_game_folders"),
  analyzeCrashLog: () => desktopInvoke<CrashReport | null>("analyze_crash_log"),
  systemDiagnostics: () => desktopInvoke<SystemDiagnostics>("system_diagnostics"),
  exportDiagnostics: (json: string) => desktopInvoke<string | null>("export_diagnostics", { json }),
  exportSettings: (json: string) =>
    desktopInvoke<string | null>("export_portable_settings", { json }),
  importSettings: () =>
    desktopInvoke<string | null>("import_portable_settings"),
  hideToTray: () => desktopInvoke<void>("hide_to_tray")
};
