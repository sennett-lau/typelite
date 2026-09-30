# Updates from GitHub Releases

Typelite updates itself from its GitHub Releases with Tauri's updater plugin: it finds a newer
version, downloads it in the background, checks its signature, installs it and asks the user to
restart. Settings → System → Updates has **Update automatically** (on by default) and **Check
for updates**; a bar on Home offers **Update** or **Restart to update** when a version is waiting.

Status: building — 2026-09-30

## Goals

- One click from "a new version exists" to running it, with no new DMG and no Gatekeeper
  "Open Anyway" (files the updater downloads are not quarantined).
- Updates on by default, off with one switch; with it off, nothing is checked unless the user
  presses Check for updates.
- Only genuine releases install: every package is signed and checked before it replaces the app.

## Non-goals

- Delta updates, update channels (beta) or rollbacks.
- Updating the development build: it never updates itself (its update would be the release app).
- Keeping the Accessibility grant across updates; that needs a stable signing certificate (a
  separate change). Until then Home's Ready bar says how to turn it on again.

## Key decisions

| Decision | Reason |
|---|---|
| Tauri's updater plugin with a static `latest.json` on each release, read from `…/releases/latest/download/latest.json` | No server of our own; GitHub Releases is free and the repository is public, so no login. |
| Packages are signed with Tauri's updater key (minisign); the public key is in `tauri.conf.json`, the private key is the `TAURI_SIGNING_PRIVATE_KEY` secret | A package that does not match is refused (tried: a changed signature fails to install), and it needs no Apple Developer account. |
| **Update automatically** is on by default | The user's choice (2026-09-30): most people should get fixes without thinking about it. The check asks GitHub for one file and sends nothing about the user; Settings says so. |
| Automatic mode checks 20 s after start and then every 6 hours, downloads in the background, then waits for the user to restart | Never interrupts a dictation, and never slows the launch. |
| With it off, Check for updates only checks; Update downloads and installs | The user decides when to download. |
| The update status lives in Rust (`updates.rs`) and reaches every window through `update:status` | Home and Settings show the same thing, and a download continues when the page changes. |
| The development build has no updater (`dev-build` feature) | A release update would replace Typelite Dev with Typelite. |
| A patch for an older line is published with **Set as the latest release** off | `releases/latest` must stay on the newest line, or its users would be offered nothing newer. The updater only installs a higher version, so an older one never downgrades anyone. |

## Parts

| File | Covers |
|---|---|
| [behaviour.md](behaviour.md) | States, what Home and Settings show, the release files. |

## Open questions

- Show What's New from `latest.json` in the Home bar (a "What's new" link), or keep the bar short.
