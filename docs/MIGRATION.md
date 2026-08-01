# Beta 0.2 to 1.0 migration

## Automatic migrations

- Legacy workspace data from WebView storage is normalized into the versioned
  local user-data database.
- Optional API keys found in legacy settings are moved into Windows Credential
  Manager or Linux Secret Service and removed from WebView storage.
- Missing workspace fields receive conservative defaults. Existing notes,
  tags, launch profiles and backup records are preserved.
- Beta snapshots without a SHA-256 sidecar remain available as
  `legacy-unverified`; Atlas does not silently claim they are verified.

## Recommended before upgrading

1. Keep the Beta source/archive and installer until the release candidate has
   been tested on the same computer.
2. Export personal workspace data from Settings.
3. Keep an independent copy of critical game saves outside Atlas.
4. Record custom tool paths and Steam installation overrides.

## First 1.0 launch

1. Run the setup guide and perform a read-only local scan.
2. Open Settings and verify the detected platform and credential backend.
3. Open one game workspace and verify registered save/config folders.
4. Create a new SHA-256 snapshot and run **Verify**.
5. Test restore only with non-critical sample data first.

## Rollback

Uninstalling 1.0 does not intentionally remove Atlas app data or backup
snapshots. Reinstalling Beta may not understand new 1.0 fields, so restore the
pre-upgrade personal-data export only if a rollback is necessary. Never replace
save folders directly without keeping a separate recovery copy.
