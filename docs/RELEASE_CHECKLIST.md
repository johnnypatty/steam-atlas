# Steam Atlas 1.0 release checklist

## Source and security

- [ ] Version is consistent in `package.json`, lockfiles, Cargo and Tauri config.
- [ ] Frontend tests, TypeScript, production build and dependency audit pass.
- [ ] Rust tests, formatting, Clippy and `cargo audit` pass from a committed lockfile.
- [ ] CodeQL and dependency review pass.
- [ ] Native commands match the threat model and have rejected-input tests.
- [ ] Privacy, migration, signing and changelog documents match actual behavior.
- [ ] No token, API key, private signing key, home path or real SteamID is committed.

## Windows qualification

- [ ] Clean Windows 11 install and upgrade from Beta 0.2.
- [ ] Steam in default and secondary libraries.
- [ ] Account/avatar scan with public and private profiles.
- [ ] Backup, SHA-256 verify and restore with disposable sample data.
- [ ] Trusted tool and launch-profile review.
- [ ] Screenshot/artwork flows and reversible artwork restore.
- [ ] NSIS install, uninstall and portable executable.
- [ ] Antivirus scan recorded with exact SHA-256 and detection name.

## Linux and Steam Deck qualification

- [ ] Ubuntu AppImage and DEB on a clean user account.
- [ ] Native Steam and Flatpak Steam detection.
- [ ] Secondary library and Proton-root detection.
- [ ] Secret Service behavior with available and unavailable keyrings.
- [ ] Tray behavior under supported desktop environments.
- [ ] Steam Deck/Gamescope layout, focus navigation and readable target sizes.
- [ ] Backup/restore test on a case-sensitive filesystem.

## Release artifacts

- [ ] User-owned updater key configured; private key remains secret.
- [ ] Windows publisher signing configured or unsigned status stated prominently.
- [ ] Draft GitHub release contains Windows and Linux artifacts.
- [ ] `CHECKSUMS-SHA256.txt`, source archive and SBOM are attached.
- [ ] Checksums are verified after downloading the draft assets.
- [ ] Release notes include known limitations and migration instructions.
- [ ] Tag points to the qualified commit and all required checks are green.
- [ ] Project owner explicitly approves publishing stable 1.0.
