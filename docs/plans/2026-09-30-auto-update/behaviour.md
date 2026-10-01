# Behaviour

What the user sees and what a release carries. Back to [index.md](index.md).

## States

```
idle ─check─> checking ─> upToDate
                      └─> available ──(auto, or Update)──> downloading ─> ready ─Restart─> new version
                      └─> failed (message)
dev build: disabled
```

| State | Home bar | Settings → System → Updates |
|---|---|---|
| idle, checking, upToDate | hidden | "Typelite X.Y.Z", the line under it, Check for updates |
| available (auto off) | "Typelite N is available." · Update | Update |
| downloading | "Downloading Typelite N… 42%" | the same line |
| ready | "Typelite N is ready. Restart to start using it" (with the Accessibility hint) · Restart to update | Restart to update |
| failed | only after an Update the user pressed: the reason | the reason, Check for updates |
| disabled (dev build) | hidden | "The development build does not update itself." |

## Release files

Each release adds, next to the DMG and the ZIP:

- `Typelite_X.Y.Z_aarch64.app.tar.gz`: the app, as Tauri's updater package.
- `Typelite_X.Y.Z_aarch64.app.tar.gz.sig`: its signature.
- `latest.json`: `version`, `notes` (What's New), `pub_date`, and for `darwin-aarch64` the
  package URL and signature (`scripts/updater-manifest.mjs`).

`SHA256SUMS.txt` covers the DMG, the ZIP and the package.

## Tested (2026-09-30)

On a clean Mac, a build pointing at a local `latest.json` (version 9.9.9) found the update 20 s
after start, downloaded and installed it (the app binary on disk changed). With one character
of the signature changed, the install was refused and the app stayed as it was.
