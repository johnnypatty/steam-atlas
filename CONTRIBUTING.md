# Contributing to Steam Atlas

Contributions are welcome when they preserve the project's local-first,
authorization-aware boundary.

## Before opening a pull request

1. Create a focused branch from `main`.
2. Keep native commands narrow; never expose arbitrary shell execution.
3. Do not add entitlement bypasses, depot keys, achievement manipulation or
   credential/session-token collection.
4. Add tests for parsing, validation and security-boundary changes.
5. Run:

```bash
npm ci
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
```

6. Explain user impact, platform behavior and validation in the PR body.

## Code style

- React/TypeScript owns presentation and typed command calls.
- Rust owns filesystem, network, credential-vault and process operations.
- Prefer allowlists, canonical paths, bounded reads and explicit confirmations.
- Preserve browser-preview fallbacks without pretending sample data is live.
- Update README, security policy and changelog when behavior changes.

## Reports and proposals

Use issues for bugs and scoped features. Use a private security advisory for
vulnerabilities. Never post real Steam credentials or local account data.
