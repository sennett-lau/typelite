# Execution

How a detected command is checked and carried out. Part of [voice-commands](index.md). Code:
`src-tauri/src/voice_commands/mod.rs`, `apps.rs`, `platform.rs`.

## Targets come from closed lists

| Action | Target must be | Rejected example |
|---|---|---|
| open_app, switch_to, hide_app, quit_app | an installed `.app` bundle found by the scan | "Photoshop" when it is not installed |
| open_url | http or https, with a host, without user info | `file:`, `javascript:`, `ftp:` |
| open_folder | Downloads, Desktop, Documents or Applications | `/etc` |
| run_shortcut | a name from `shortcuts list` (case-insensitive exact) | anything else |

The AI only names a target; resolution always goes through these lists.

## App resolution

The scan reads `/Applications`, `/System/Applications`, `~/Applications` and their `Utilities`
folders, at most once a minute. Each bundle has its file name and, from
`NSFileManager displayNameAtPath:`, its localized Finder name (計算機 for Calculator). Matching
ignores case, spaces and punctuation, in this order: exact name or alias (100), the built-in alias
list (Chrome, VS Code, 微信, 設定, …), a prefix (80) or substring (70) of four or more characters,
then an edit distance of 1 (names of 5 to 8 characters) or 2 (longer). Short names need an exact
match. Equal best scores for different apps are "ambiguous".

## The macOS calls

- **Open and switch:** `NSWorkspace openURL:` with the bundle's file URL. It launches the app,
  or brings a running one to the front. Switching to an app that is not running opens it.
- **Hide:** `NSRunningApplication hide` on the running app with that bundle path.
- **Quit:** `NSRunningApplication terminate`, like ⌘Q, so the app can still ask to save.
- **Web address:** `NSWorkspace openURL:` in the default browser.
- **Folder:** `NSWorkspace openURL:` with the folder's file URL (Finder).
- **Shortcut:** `/usr/bin/shortcuts run <name>`, started and not waited for. The name is one
  argument; no shell.

None of these needs Accessibility or Automation permission.

## Quit confirmation

Quit does not run at once. It stores the app under a random token (one at a time, 60 s) and
returns "needs confirm". The panel's Confirm sends the token back (`confirm_voice_command`),
which quits the app once. Cancel (`cancel_voice_command`), ✕, Escape and the next Ask run clear
it; closing the Ask panel always clears it.
