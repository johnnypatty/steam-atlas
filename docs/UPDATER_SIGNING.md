# Update and signing setup

Steam Atlas must not auto-install unsigned updates. Tauri updater signatures
cannot be disabled, and the updater remains inactive until a trusted public key
is embedded.

## Updater key ownership

The project owner generates the updater key pair on a trusted computer using
the official Tauri CLI. The private key and password must never be committed,
pasted into chat, attached to an issue or stored in a build artifact.

The public key may be committed to `tauri.conf.json`. CI receives the private
key and password only through protected GitHub Actions secrets for the release
environment.

Official setup: <https://v2.tauri.app/plugin/updater/>

## Windows publisher signing

Updater signing proves that an update belongs to the configured Atlas updater;
it does not create Windows publisher reputation. Windows executables/installers
need a user-owned code-signing certificate and protected signing credentials.

Official guidance: <https://v2.tauri.app/distribute/sign/windows/>

## Release rules

- Stable builds are produced only from a protected `v1.0.0` tag.
- CI creates a draft release first.
- Windows and Linux artifacts, checksums and the SBOM are reviewed before
  publication.
- The private updater key is never downloadable from GitHub Actions.
- A missing signing secret must fail closed; it must not fall back to unsigned
  automatic updates.
- Key rotation requires a documented migration release signed by the previous
  trusted key whenever possible.
