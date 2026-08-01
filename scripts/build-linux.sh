#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -f src-tauri/tauri.conf.json ]]; then
  echo "Run this script from the Steam Atlas project directory." >&2
  exit 1
fi

for command_name in node npm rustc cargo; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

echo "Steam Atlas — Linux build"
npm ci
npm run check
npm run desktop:linux

appimage_count=$(find src-tauri/target/release/bundle/appimage -maxdepth 1 -type f -name '*.AppImage' 2>/dev/null | wc -l)
deb_count=$(find src-tauri/target/release/bundle/deb -maxdepth 1 -type f -name '*.deb' 2>/dev/null | wc -l)

if [[ "$appimage_count" -eq 0 || "$deb_count" -eq 0 ]]; then
  echo "Build exited without both expected Linux packages." >&2
  exit 1
fi

echo "Linux AppImage and DEB packages are ready."
