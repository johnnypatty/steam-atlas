# Security policy

## Supported version

Steam Atlas is beta software. Security fixes currently target the newest
`0.1.x` source version only.

## Trust boundary

Steam Atlas is local-first and has no Atlas account or cloud database. It may:

- read Steam's local account list and app manifests;
- read recent screenshot images after an explicit scan;
- copy an explicitly selected folder into Atlas's backup directory;
- open approved `https`, `http`, and `steam` links;
- launch only a user-selected executable or supported script type;
- start official `steamcmd.exe` with validated identifiers; and
- make HTTPS requests to Steam Store, Steam Community, Valve Web API, and
  Steam Ladder endpoints.

It must not read Steam passwords or Guard secrets, fabricate entitlements,
delete orphaned folders, accept arbitrary shell command strings, or silently
launch programs.

Optional API keys are stored in WebView local storage in this beta. Do not use
them on a shared Windows account. Portable exports deliberately exclude keys.

## Antivirus detections

An unsigned, newly built launcher can trigger reputation or behavioral
heuristics. Do not assume every alert is a false positive.

When reporting a detection, include:

- antivirus product and database version;
- exact detection name;
- whether it affected the portable EXE, MSI, or NSIS installer;
- SHA-256 hash of the affected file;
- build command and source commit; and
- whether the detection reproduces after rebuilding on a clean machine.

Submit false positives through the antivirus vendor's official analysis
channel. Use narrow, file-specific exclusions only after review. Never ask
users to disable their antivirus globally.

## Reporting a vulnerability

Open a private GitHub security advisory when the repository enables them. Do
not publish credentials, local paths, Steam account data, or a working exploit
in a public issue.
