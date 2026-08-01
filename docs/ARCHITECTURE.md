# Architecture

## Components

| Layer | Responsibility | Trust level |
| --- | --- | --- |
| React/TypeScript WebView | Navigation, state, review dialogs and presentation | Untrusted input boundary |
| Typed bridge (`src/bridge.ts`) | Narrow command names and typed arguments/results | Boundary adapter |
| Rust/Tauri core | Path validation, Steam scans, backups, launching and network limits | Privileged local core |
| OS credential vault | Optional API keys | OS-account protected |
| Atlas app-data directory | Atomic user data, snapshots and managed artwork history | User-local persistent data |
| Steam/SteamCMD | Ownership, authentication, downloads and game launching | Authoritative external application |

The WebView never receives a generic filesystem, shell or HTTP proxy command.
Every native capability has a dedicated Rust function with bounded inputs.

## Important flows

### Save backup and restore

1. The user selects and registers a folder.
2. Rust canonicalizes it, rejects the Atlas vault itself, skips symlinks and
   enforces the 200,000-file/50-GiB limits.
3. Atlas creates a unique snapshot, then writes a SHA-256 sidecar manifest.
4. Restore canonicalizes both paths and verifies the integrity manifest.
5. Atlas snapshots the current destination before copying restored files.

Legacy Beta snapshots remain readable but are labeled `legacy-unverified`.

### Trusted launch profiles

1. The user explicitly selects a supported executable/script.
2. Atlas stores the canonical path and displays the exact path, arguments and
   working directory before the first launch.
3. Only trusted tools can be attached to game launch profiles.
4. Steam games use a dedicated AppID-and-argument command; arbitrary shell text
   is not accepted.

### Personal data

Workspace data uses a versioned schema. The Rust core validates size and JSON
shape, writes a temporary file, rotates the previous valid copy and then
atomically replaces the primary file. Imports show counts before replacement.

## Platform adapters

Windows and Linux share the React interface and safety model. Rust handles
platform-specific Steam roots, executable formats, credential vaults, reveal
operations and packaging. Linux detection covers native Steam, Flatpak Steam,
secondary libraries, Proton roots, Gamescope, MangoHud and Steam Deck.

## Extension rules

New native commands must document:

- the user gesture that authorizes the action;
- canonical path and symlink behavior;
- size/count/time limits;
- network destinations, if any;
- failure and rollback behavior; and
- tests for accepted and rejected inputs.
