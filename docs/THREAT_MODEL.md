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
| Snapshot tampering | SHA-256 sidecar manifests; verification before restore; legacy snapshots labeled unverified |
| Accidental data deletion | Orphan scanner remains preview-only; snapshot cleanup requires confirmation and accepts only complete top-level Atlas vault folders |
| Entitlement bypass | Steam/SteamCMD remain authoritative; no license or depot-key fabrication |
| Supply-chain regression | npm audit, cargo audit, CodeQL, Dependabot and lockfile-based npm installs |

## Out of scope for 1.0

- Protection from malware already running as the same operating-system user.
- Code signing and publisher reputation; release workflows are prepared, but a
  private signing certificate is not stored in the repository.
- Automatic destructive cleanup, unattended restore or cloud backup.
- Reverse engineering of Steam protocols or DRM.

Any new native command must document the user gesture, validated inputs,
filesystem/network scope, failure behavior and test coverage.
