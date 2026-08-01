# Changelog

## 1.0.0-rc.1 — unreleased

### Added

- Per-game workspaces for private notes, ratings, tags, favorites and backlog
  state.
- Explicit save/config locations, reusable launch profiles and trusted
  pre-launch tools.
- SHA-256 snapshot manifests, integrity verification, recovery-before-restore
  and confirmed retention cleanup restricted to the Atlas vault.
- Screenshot Studio with exact-AppID scanning, fullscreen review, favorites,
  private tags and explicit original-byte export behavior.
- Text configuration comparison and reversible Steam client artwork history.
- Local system/crash diagnostics with sensitive-path/account redaction.
- Steam Deck/TV presentation mode and selectable overview modules.
- Atomic personal-data persistence, schema migration and reviewed import/export.
- English first-run onboarding, skip navigation, high contrast and reduced motion.
- Windows/Linux release-candidate workflow that remains draft until qualified.

### Security

- Dedicated AppID/argument game-launch endpoint and first-launch trust review.
- Canonical path checks, symlink skipping, input limits and narrow deletion scope.
- Stable release documentation for privacy, architecture, migrations, updater
  keys, Windows signing and hardware qualification.

### Release blockers

- Windows and Linux native CI must pass from the final candidate commit.
- A user-owned updater signing key and optional Windows publisher certificate
  must be configured outside the repository.
- Windows and Steam Deck/Linux hardware qualification must be completed.
- Stable publication requires explicit project-owner approval.

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
