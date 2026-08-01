# Steam Atlas threat model

## Assets to protect

- Steam credentials, Guard secrets and session material that Atlas must never
  request or read.
- Optional public-data API keys.
- User-selected save/config folders and backups.
- Local filesystem paths, account identifiers and diagnostic logs.
- User intent around launching programs and opening external destinations.

## Main threats and controls

| Threat | Control |
| --- | --- |
| Plaintext API-key exposure | Windows Credential Manager/Linux Secret Service; legacy migration; export redaction |
| Command injection | No command-string endpoint; argument arrays; length/NUL limits; OS-specific extensions |
| Path confusion or symlink escape | Canonical executable/working-directory checks; backup traversal skips symlinks |
| Malicious external links | Parsed URLs; HTTPS-only host allowlist; one narrow Steam URI |
| Oversized or hostile local input | Manifest, background, log and settings limits; bounded image previews |
| Oversized remote response | Connect/request timeouts, status checks and byte limits |
| Accidental data deletion | Orphan scanner is preview-only; no native delete command |
| Entitlement bypass | Steam/SteamCMD remain authoritative; no license or depot-key fabrication |
| Supply-chain regression | npm audit, cargo audit, CodeQL, Dependabot and lockfile-based npm installs |

## Out of scope for Beta 0.2

- Protection from malware already running as the same operating-system user.
- Code signing and publisher reputation; release workflows are prepared, but a
  private signing certificate is not stored in the repository.
- Automatic destructive cleanup or unattended restore.
- Reverse engineering of Steam protocols or DRM.

Any new native command must document the user gesture, validated inputs,
filesystem/network scope, failure behavior and test coverage.
