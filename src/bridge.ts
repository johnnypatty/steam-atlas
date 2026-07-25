import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  AccountProfile,
  BackupRecord,
  CrashReport,
  Game,
  ManifestEntry,
  OrphanRecord,
  ScreenshotRecord,
  SteamAccount
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
  scanScreenshots: () =>
    desktopInvoke<ScreenshotRecord[]>("scan_steam_screenshots"),
  scanOrphans: () => desktopInvoke<OrphanRecord[]>("scan_orphaned_game_folders"),
  analyzeCrashLog: () => desktopInvoke<CrashReport | null>("analyze_crash_log"),
  exportSettings: (json: string) =>
    desktopInvoke<string | null>("export_portable_settings", { json }),
  importSettings: () =>
    desktopInvoke<string | null>("import_portable_settings"),
  hideToTray: () => desktopInvoke<void>("hide_to_tray")
};
