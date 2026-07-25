# Steam Atlas Beta 0.1

Steam Atlas is a Windows-first, local-first Steam companion built with Tauri 2,
Rust, React and TypeScript. It combines store discovery, local library and
account inspection, manifest organization, safe backup utilities, executable
launching, and a 20-tool Power Suite.

![Steam Atlas overview](steam-atlas-preview.png)

> Beta software: keep backups of important data. Steam Atlas is independent and
> is not affiliated with Valve, SteamDB, Steam Ladder, or Kaspersky.

## Beta 0.1 highlights

- Release builds no longer open a second console window.
- The Windows build script reports the real exit code and only marks freshly
  generated `.exe`, NSIS, and MSI files as successful.
- Account avatars load without a Steam Web API key: Atlas checks Steam's local
  avatar cache, then the account's public Steam Community XML profile.
- Game artwork checks Steam's local library cache, then a multi-CDN fallback
  chain, and finally a generated placeholder.
- The white native currency menu is replaced by a consistent dark dropdown.
- Full appearance studio: presets, a custom background, opacity, blur,
  saturation, overlay, panel/sidebar/top-bar transparency, two accents, glow,
  radius, density, scale, OLED mode, and reduced motion.
- Global `Ctrl+K` command palette and Windows notification-area tray mode.

## The 20-feature Power Suite

1. Save Vault — dated copies of explicitly selected save folders.
2. Launch Profiles — reusable AppID and launch-argument presets.
3. Config Manager — configuration snapshots before edits.
4. Update Intelligence — local BuildIDs with SteamDB history links.
5. Library Analytics — collection, platform, and disk-footprint summaries.
6. Backlog Board — local Backlog, Playing, Completed, and Paused lists.
7. Screenshot Studio — read-only indexing of recent Steam screenshots.
8. Achievement Lens — read-only public Steam achievement pages.
9. Compatibility Desk — local platform hints and ProtonDB links.
10. Orphan Scanner — preview-only detection; it never deletes folders.
11. Duplicate Analyzer — repeated title and install-path detection.
12. Mod Command Center — local AppID associations and Tools Hub integration.
13. Price Watchlist — on-demand Steam Store price refreshes.
14. Session Timeline — local history for launches made through Atlas profiles.
15. Crash Assistant — local signature checks for common text logs and dumps.
16. Account Compare — safe local/public metadata comparison.
17. Artwork Board — custom artwork references with Steam CDN fallbacks.
18. Command Palette — keyboard navigation and common actions.
19. Tray Mode — hide to and restore from the Windows notification area.
20. Portable Settings — secret-free appearance and region export/import.

The Power Suite is intentionally conservative. It does not modify
achievements, remove orphan folders, bypass Steam ownership, scrape SteamDB, or
upload private files.

## Existing core features

- Steam Store search by title or exact AppID, including games, DLC, demos, and
  tools returned by Steam.
- Local Steam library discovery and parsing of legitimate
  `appmanifest_*.acf` files across configured library folders.
- Local account discovery from `config/loginusers.vdf`; no password, Steam
  Guard secret, refresh token, or sentry-file access.
- Optional Steam Web API owned-library data and optional Steam Ladder ranking
  data.
- Manifest Vault for importing and inspecting `.acf` and `.manifest` metadata.
- Authorized SteamCMD launcher. SteamCMD itself handles login, Steam Guard, and
  entitlement enforcement.
- Tools Hub for explicitly selected `.exe`, `.com`, `.bat`, `.cmd`, `.ps1`,
  and `.lnk` files, with arguments and working directories.

Steam Atlas does not fabricate licenses, depot keys, or Steam entitlements. A
manifest identifies content; it does not grant ownership.

## Build on Windows

### 1. Install prerequisites

Use 64-bit Windows 10 or 11 and install:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Windows 11 normally includes WebView2. If it is absent:

```powershell
winget install --id Microsoft.EdgeWebView2Runtime -e
```

Restart PowerShell and confirm:

```powershell
node --version
npm --version
rustc --version
cargo --version
```

### 2. Run or build

Open PowerShell in the extracted project:

```powershell
npm install
npm run desktop:dev
```

Build the production app and installers:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

Fresh output is reported individually:

- Portable app: `src-tauri\target\release\steam-atlas.exe`
- NSIS: `src-tauri\target\release\bundle\nsis\`
- MSI: `src-tauri\target\release\bundle\msi\`

The first Rust build takes longer because Cargo downloads and compiles the
native dependencies.

### If installer packaging says “no such host”

Your earlier build compiled the portable application successfully, then Tauri
could not resolve `github.com` while obtaining its NSIS packaging dependency.
That is a DNS/network failure, not a source-code compile failure.

Check:

```powershell
Resolve-DnsName github.com
Test-NetConnection github.com -Port 443
```

Then retry `npm run desktop:build`. A VPN, DNS filter, firewall, antivirus web
filter, or temporary DNS outage can cause this. The fixed script now returns
the failure instead of printing a false success.

## Steam API key and avatars

You do **not** need to verify a phone number just to get Atlas account avatars.
Beta 0.1 reads the local Steam avatar cache first and can query public Steam
Community profile XML without an API key. Private profiles or offline systems
fall back to initials.

A normal Steam Web API key remains optional for richer owned-game/profile
statistics. Only verify your phone if you independently want that Steam
feature and are comfortable doing so; Atlas does not require it for local
scanning, avatars, artwork, backups, or the Tools Hub.

## Why antivirus software may warn

Self-built Windows apps are unsigned and have little reputation. Steam Atlas
also performs behaviors that heuristic scanners watch closely: it reads local
Steam configuration, makes HTTPS requests, opens file dialogs, launches
user-selected programs, can start SteamCMD, and creates local backups. That
combination can cause a false-positive even when the source is clean.

Before allowing a detection:

1. Record the exact Kaspersky detection name and affected file.
2. Update Kaspersky databases and rebuild from this source.
3. Check the file with
   [Kaspersky Threat Intelligence Portal](https://opentip.kaspersky.com/) or
   use [Kaspersky's false-positive guidance](https://support.kaspersky.com/1870)
   to request reanalysis.
4. Prefer a file-specific exclusion over excluding the whole project or Steam
   directory.
5. For public releases, code-sign the executable and installer. Reputation
   improves over time, but signing is not a guarantee against every heuristic.

See [SECURITY.md](SECURITY.md) for the trust boundary and reporting guidance.

## Browser-only development

```powershell
npm run dev
```

Browser mode uses clearly marked sample data and cannot scan folders, open
native dialogs, create backups, use the tray, or launch executables.

## Project map

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Navigation, main pages, settings, and command palette |
| `src/PowerSuite.tsx` | All 20 beta workbenches |
| `src/components/` | Resilient artwork and custom dark controls |
| `src/styles.css` | Visual system, appearance engine, and responsive layout |
| `src/bridge.ts` | Typed frontend-to-Rust command bridge |
| `src/types.ts` | Shared frontend data shapes |
| `src-tauri/src/lib.rs` | Steam scans, profile lookup, backups, dialogs, tray, and launching |
| `src-tauri/tauri.conf.json` | Window, CSP, local asset, and installer configuration |
| `scripts/build-windows.ps1` | Reliable Windows build and artifact reporting |
| `CUSTOMIZATION.md` | Practical customization guide |

## Validation

- TypeScript strict check and Vite production build: passed.
- Dependency audit: zero known vulnerabilities at packaging time.
- Tauri configuration inspection: passed.
- The current delivery environment does not contain Rust or Windows build
  tools, so compile the native Beta 0.1 changes on Windows or use the included
  GitHub Actions workflow before publishing a release.

## License

MIT. See [LICENSE](LICENSE).
