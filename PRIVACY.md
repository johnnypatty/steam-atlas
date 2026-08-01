# Steam Atlas privacy notice

Steam Atlas is a local-first desktop application. It has no Atlas account,
advertising SDK, analytics SDK, telemetry collector or hosted Atlas database.

## Data read from this computer

Atlas reads only the local information needed for features the user opens:

- Steam installation and library locations;
- `loginusers.vdf` display metadata, never passwords or Steam Guard material;
- installed-app manifests and library sizes;
- Steam artwork and screenshots for display or explicit export;
- save, configuration, diagnostic and executable paths selected by the user;
- small text configuration files selected for comparison; and
- bounded diagnostic logs selected for local crash analysis.

Save/config folders are never guessed and restored automatically. A user must
register the folder, request a snapshot, review the destination and confirm a
restore. Every restore creates a recovery snapshot first.

## Data stored locally

Personal workspace data is stored atomically in the operating system's Atlas
application-data directory. It includes notes, tags, ratings, launch profiles,
registered paths, backup records and screenshot favorites/tags.

Optional API keys are stored in Windows Credential Manager or Linux Secret
Service. They are excluded from settings and personal-data exports.

Snapshots and artwork history are stored in Atlas-managed application-data
folders. New snapshots include SHA-256 integrity manifests. Cleanup requires a
visible confirmation and can target only complete top-level Atlas snapshots.

## Network connections

Atlas can connect directly to a narrow set of HTTPS services for an action the
user requests:

- Steam Store and Steam Web API;
- Steam Community public profiles;
- Steam Ladder when the user provides its optional API key; and
- official Steam artwork CDNs for missing images.

ProtonDB, SteamDB and other reference pages are opened in the system browser;
Atlas does not scrape them. Network requests have timeouts and response-size
limits. Atlas does not upload saves, screenshots, diagnostics or personal
workspace data.

## Export and deletion

Portable settings exports exclude API keys and local background paths. Personal
data exports contain the local workspace database and may include filesystem
paths, so users should review them before sharing.

Uninstalling Atlas may leave application data, backups and settings behind
depending on the operating system/package manager. Delete the Atlas app-data
directory only after making any backup copies you want to keep.

## Changes

Material privacy changes must be documented in the changelog and reviewed as a
security-sensitive pull request. A future telemetry or cloud-sync feature would
be opt-in and requires a separate design and privacy review; none exists today.
