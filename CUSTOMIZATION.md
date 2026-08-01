# Customizing Steam Atlas

This guide is organized from safest visual changes to deeper native features.
Create a Git commit before structural changes so you can return to a working
version.

## Change the name

Update all three locations:

1. `src/App.tsx` — visible brand text.
2. `src-tauri/tauri.conf.json` — `productName`, window title and descriptions.
3. `package.json` and `src-tauri/Cargo.toml` — package names.

Keep the Tauri `identifier` stable after distributing the app. Changing it
makes Windows treat the result as a different application.

## Use the in-app appearance studio

Open **Settings → Appearance** before editing code. Beta 0.2 can change:

- primary and secondary accents;
- four built-in backgrounds or one custom JPG/PNG/WebP;
- background opacity, blur, saturation, and dark overlay;
- panel, sidebar, and top-bar opacity;
- glow strength, corner radius, interface scale, and density; and
- system/light/dark themes, OLED black and reduced-motion modes.

The custom background is copied into Atlas's application-data directory, so
moving the original image does not break the app. **Export safe settings**
omits API keys and the machine-specific background path.

## Change default colors and appearance

Global design tokens live at the top of `src/styles.css`:

```css
:root {
  --accent: #66e3ff;
  --bg: #07090d;
  --panel: rgba(17, 22, 30, 0.92);
  --muted: #7e8997;
  --green: #56f39a;
  --amber: #ffb55e;
  --red: #ff6c78;
  --violet: #a78bfa;
}
```

Runtime settings are applied as CSS variables by the main effect in
`src/App.tsx`. To change defaults, edit the complete `defaultSettings` object
there and the fallback tokens at the top/end of `src/styles.css`.

Built-in background recipes are selected with the
`data-background-preset` attribute. Search `styles.css` for:

```css
html[data-background-preset="nebula"] body::before
```

Clone one of those blocks to redesign a preset without adding an image file.

## Change the logo and installer icon

Edit `assets/steam-atlas-logo.svg` in Figma, Inkscape or a text editor. Generate
the desktop icon set:

```powershell
npx tauri icon .\assets\steam-atlas-logo.svg
```

Tauri writes the Windows, Linux and cross-platform icon files to
`src-tauri/icons`. Rebuild both platform packages afterward. The matching
repository banner lives at `assets/social-preview.svg`.

## Change the preview catalogue

`src/data.ts` contains browser-mode examples. Each `Game` follows the interface
defined in `src/types.ts`. Steam header artwork follows this public pattern:

```text
https://cdn.cloudflare.steamstatic.com/steam/apps/APPID/header.jpg
```

Preview values must remain clearly distinct from live API data. The desktop
search uses Steam directly.

## Extend the Power Suite

All 20 workbenches live in `src/PowerSuite.tsx`.

1. Add a new ID to `FeatureId`.
2. Add its card metadata to `features`.
3. Create a focused workbench component.
4. Render it under the matching `active` condition.
5. Put native filesystem or process behavior behind a narrow Rust command.
6. Add responsive styles under the Power Suite section of `src/styles.css`.

The small `useStoredState` helper is appropriate for personal lists and
preferences. Large indexes and binary files should not go into `localStorage`.
Secrets must use the narrow `load_secrets`/`save_secrets` native boundary backed
by Windows Credential Manager or Linux Secret Service.

## Add a navigation page

1. Add its identifier to the `Page` union in `src/types.ts`.
2. Add a label and icon to `navItems` in `src/App.tsx`.
3. Create the page component.
4. Add a conditional render beside the existing page renders.
5. Add page-specific CSS to `src/styles.css`.
6. Run `npm run build`.

Example shape:

```tsx
function SavesPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="LOCAL BACKUPS"
        title="Save Vault"
        description="Back up explicitly selected save folders."
      />
    </div>
  );
}
```

## Add a native Rust command

Native commands are exposed deliberately. Never add a generic “execute shell
string” command.

1. Add a typed function to `src-tauri/src/lib.rs`:

   ```rust
   #[tauri::command]
   fn inspect_folder(path: String) -> Result<Vec<String>, String> {
       // Validate and constrain the path before reading.
       Ok(Vec::new())
   }
   ```

2. Register it in `tauri::generate_handler![...]` at the bottom of that file.
3. Add a typed wrapper in `src/bridge.ts`:

   ```ts
   inspectFolder: (path: string) =>
     desktopInvoke<string[]>("inspect_folder", { path })
   ```

4. Call `bridge.inspectFolder(path)` from the interface.
5. Test failure cases as carefully as success cases.

## Add another external data source

Prefer an official documented API. Add its domain to `connect-src` in
`src-tauri/tauri.conf.json` only after deciding exactly which endpoint is
needed. Keep requests in Rust when a key or CORS handling is involved.

Do not scrape SteamDB. SteamDB states that automated scraping is prohibited and
that it does not provide a public API. Atlas therefore links to SteamDB and
retrieves comparable base data from Steam.

## Extend protected key storage

Beta 0.2 already stores optional keys in Windows Credential Manager or Linux
Secret Service through narrow Rust commands. When adding another credential:

1. Add its fixed identifier to the Rust allowlist.
2. Reuse the native keyring boundary; never place the value in `localStorage`.
3. Keep portable exports defensively redacted in Rust as well as TypeScript.
4. Redact values from errors, logs, diagnostics and screenshots.
5. Add migration and deletion behavior for any replaced identifier.

## Add SQLite

The current tool and manifest collections are intentionally small and stored
locally as JSON. For a large catalogue or history:

1. Add `rusqlite` with the bundled SQLite feature.
2. Store the database under Tauri's per-user application-data directory.
3. Add migrations from the first schema version.
4. Keep API keys out of SQLite.
5. Expose paginated query commands rather than returning the whole database.

Suggested tables:

- `catalogue_cache`
- `installed_apps`
- `manifest_index`
- `external_tools`
- `account_snapshots`
- `price_observations`
- `user_notes`

## Safe extension rules

- Treat Steam's license decision as authoritative.
- Do not accept or generate depot decryption keys.
- Do not expose arbitrary shell commands to WebView code.
- Validate identifiers as numbers before placing them into SteamCMD arguments.
- Use argument arrays, never concatenated command strings.
- Keep publisher Web API keys out of desktop applications.
- Preserve the CSP and add the narrowest possible domain allowance.
- Never write to Steam configuration automatically without a backup and a
  clear user confirmation.

## Prepare a GitHub release

1. Commit source only; `.gitignore` already excludes `node_modules`, `dist`,
   and Rust build output.
2. Open a pull request. `.github/workflows/windows-build.yml` runs the web gate,
   Rust tests, native Windows NSIS build and native Linux AppImage/DEB build.
3. Test both artifacts on clean Windows and Linux accounts.
4. Create a version tag such as `v0.2.0-beta.1`.
5. Run the **Draft prerelease** workflow and inspect its draft before publish.
6. Before a broad public release, obtain platform-appropriate signing keys and
   keep them in GitHub encrypted secrets, never in source.
7. Enable GitHub private vulnerability reporting/security advisories.
