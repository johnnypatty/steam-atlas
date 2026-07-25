# Changelog

## 0.1.0-beta.1 — 2026-07-25

### Added

- Keyless local-cache/public-XML account avatar enrichment.
- Local-cache and multi-CDN Steam artwork fallback component.
- Custom dark dropdown component.
- Appearance studio with backgrounds, transparency, color, layout, OLED, and
  reduced-motion controls.
- Twenty-feature Power Suite.
- Global Ctrl+K command palette.
- Windows notification-area tray restore.
- Safe portable settings import/export.
- GitHub Actions Windows build workflow.

### Changed

- Release builds use the Windows GUI subsystem and do not open an extra
  console window.
- Windows build script now propagates failures, detects stale output, and
  reports portable and installer artifacts separately.
- Steam screenshot indexing targets the expected local screenshot paths and
  limits previews.

### Security

- Orphan scanning remains preview-only.
- Achievement tooling remains read-only.
- Portable exports exclude API keys and custom local paths.
- Backup recursion skips symbolic links.
