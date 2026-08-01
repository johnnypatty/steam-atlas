# Changelog

## 0.2.0-beta.1 — 2026-08-01

### Added

- Native Linux, Flatpak Steam and secondary-library discovery.
- AppImage and DEB builds beside Windows portable EXE and NSIS.
- Windows Credential Manager/Linux Secret Service API-key storage and legacy
  plaintext migration.
- New Atlas Node SVG identity, regenerated application icons and social preview.
- System, light, dark and OLED themes.
- Cross-platform diagnostics and package information.
- Windows/Linux CI, CodeQL, Rust audit, Dependabot and draft-release automation.
- Native tests for trusted URL handling and VDF path parsing.

### Improved

- Canonical executable and working-directory validation.
- OS-specific executable filters and SteamCMD selection.
- Strict HTTPS destination allowlist and narrow Steam URI support.
- Input, manifest, background, import/export and remote-response limits.
- Request timeouts and safer error messages.
- Secret-free portable exports enforced in both frontend and backend.
- Windows build now asks Tauri only for NSIS and reports only expected output.

### Retained from the first preview

- Keyless local/public profile avatars and multi-source artwork recovery.
- Full appearance controls, custom dropdowns and `Ctrl+K` command palette.
- Twenty Power Suite workbenches, preview-only orphan detection, read-only
  achievement links and symlink-skipping backups.

### Known beta limitations

- Binaries are unsigned and may trigger antivirus reputation warnings.
- Some profile data depends on Steam privacy settings and network availability.
- Linux desktop integration varies by distribution and Secret Service provider.
- Restore and cleanup remain deliberately conservative while the beta is tested.
