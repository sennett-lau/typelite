# Levels of computer control

Where this plan sits among ways Typelite could operate the Mac. Part of
[voice-commands](index.md).

| Level | What it does | How | Status |
|---|---|---|---|
| 1 | Direct actions: open, switch, hide or quit an app, open a link or folder, run a Shortcut | Patterns, then AI tool calls; closed target lists; `NSWorkspace` | This plan |
| 2 | Act inside an app: press a button, choose a menu item, fill a field | An agent reading the Accessibility tree, several steps | Out of scope |
| 3 | Anything on screen | Screenshot-based computer use, or handing the task to an external agent | Out of scope |

Level 1 needs no new permission and cannot do anything the user could not undo, apart from
quitting, which asks first. Levels 2 and 3 need their own plans: they read other apps' content,
take several AI steps and need a safety model for actions that change data.

Shortcuts are the way to extend level 1 without code: a user can build a Shortcut and say "run
the shortcut <name>".
