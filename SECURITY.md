# Security policy

## Supported version

Security fixes target the newest `0.2.x` beta. Older prereleases should be
upgraded before a report is reproduced.

## Trust boundary

Steam Atlas is local-first and has no Atlas account or cloud database. It may:

- read Steam's local account display metadata, app manifests, artwork cache and
  recent screenshots after an explicit scan;
- copy an explicitly selected folder into its application-data backup area;
- query a documented set of Steam, Steam Community and Steam Ladder HTTPS
  endpoints with bounded responses and timeouts;
- open only allowlisted HTTPS destinations and `steam://open/games`;
- launch only an explicitly selected, supported local application/script with a
  bounded argument array; and
- start official SteamCMD with validated identifiers.

It must not read Steam passwords or Guard secrets, collect refresh/session
tokens, fabricate entitlements, unlock paid content, delete orphaned folders,
accept generic shell command strings or launch programs silently.

## Protected credentials

Optional API keys are stored in Windows Credential Manager or Linux Secret
Service. Beta 0.2 migrates legacy keys from WebView storage and rewrites browser
settings without those fields. Portable exports are defensively redacted in
both the UI and Rust backend.

The credential vault is scoped to the logged-in operating-system account. Do
not share an unlocked OS session with untrusted users.

## Reporting a vulnerability

Use a private GitHub security advisory. Do not place credentials, real local
paths, Steam account data or a working exploit in a public issue.

Useful details include:

- affected source commit and operating system;
- expected versus actual security boundary;
- minimal reproduction using non-sensitive sample data;
- whether the issue requires user interaction; and
- suggested mitigation, if known.

## Antivirus detections

An unsigned launcher can trigger reputation and behavioral heuristics. Include
the antivirus product/database version, exact detection name, affected artifact,
SHA-256, build command and source commit. Prefer vendor analysis and narrow,
file-specific exclusions; never disable antivirus globally.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for abuse cases and mitigations.
