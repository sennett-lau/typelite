# Native target-app check before paste

Before inserting a result, Typelite checks that the app the user dictated into is still in front.
On macOS that check ran an AppleScript through System Events, about 200–300 ms each time, and
the paste path runs it twice. It now asks AppKit directly, which takes microseconds.

Status: building (2026-10-05)

## Goals

- Remove about half a second from every dictation's paste step on macOS.
- Same safety: never paste into a different app than the one dictated into.

## Non-goals

- Context detection at the start of a recording (it needs the window title and browser host and
  runs in the background).
- Windows and Linux, which keep their current check.

## Key decisions

- **Read `NSWorkspace.frontmostApplication`.** It gives the process ID and bundle ID, all that the
  target guard compares, with no new process and no permission.
- **A separate `front_app_guard` on the signal source,** defaulting to the full `collect`, so
  other platforms and the test fakes are unchanged.
- **Rely on Tauri's main run loop** to keep that property current; measured switch detection
  was 18–30 ms, inside the restore loop's 200 ms.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole change; it is small enough for one file. |

## Open questions

- None. The end-to-end paste time is to be confirmed in the app's `[Pipeline Timing]` log.
