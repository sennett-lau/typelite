# Identity and build

Names, identifiers and build settings for Typelite. Back to [index](index.md).

## Identity

| Where | Value |
|---|---|
| App name, window titles, tray, UI text | Typelite |
| Bundle id (`tauri.conf.json`) | `dev.typelite.mac` |
| Crate and library names (`Cargo.toml`) | `typelite`, `typelite_lib` |
| npm package (`package.json`) | `typelite` |
| Data folder, database, keychain service | `dev.typelite.mac`, `typelite.db`, `Typelite` |
| Env vars and thread names | `TYPELITE_*`, `typelite-*` |
| Icons | `src-tauri/icons/source/*.svg` |

## Licence

MIT. `LICENSE` carries every required copyright notice.

## Build and signing

- `npx tauri build --bundles app`.
- `rust-toolchain.toml` pins a current stable Rust, so builds do not depend on the machine's
  global default.
- Every build should be signed with one stable certificate, so macOS permissions survive
  rebuilds.

## Updates

There is no auto-updater until Typelite publishes its own releases with its own signing key.
