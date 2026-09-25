# Design

Tokens, type and layout. Back to [index](index.md). Where this file and `mock.html` disagree,
the mock wins for looks and this file wins for behaviour.

## Tokens

| Token | Light | Dark (Aurora) |
|---|---|---|
| Window glass (sidebar) | `rgba(246,246,248,.62)` over the native blur | `rgba(18,24,34,.50)` |
| Content area | `rgba(255,255,255,.72)` | `rgba(14,20,30,.55)` |
| Card / group | `#ffffff` | `rgba(36,44,60,.66)` |
| Text / muted / faint | `#1d1d1f` / `#6e6e73` / `#8e8e93` | `#f1f6ff` / `#a6b3c8` / `#6f7d94` |
| Lines / hairlines | `rgba(0,0,0,.09)` / `rgba(0,0,0,.06)` | `rgba(255,255,255,.12)` / `rgba(255,255,255,.08)` |
| Accent / accent soft | `#0a84ff` / `rgba(10,132,255,.12)` | `#3fd8c2` / `rgba(63,216,194,.18)` |
| Corner glows | none | teal `rgba(63,216,194,.26)` top right of content and top left of sidebar; violet `rgba(175,82,222,.26)` bottom left of content |
| Feature colours (tile icons) | Dictate `#0a84ff`, Translate `#30b0c7`, Ask `#af52de` | Dictate `#3fd8c2`, Translate `#7aa7ff`, Ask `#d77bff` |
| Key caps | `#ffffff` on `#d2d2d7` | `#2c3646` on `#445066` |
| Success / warning / error | `#30d158` / `#ff9f0a` / `#ff453a` | same |

Dark-only touches: switches get a faint accent glow, and page titles fade from text colour into
the accent. The capsule pill keeps its dark glass in both modes; in dark mode its waveform and
active chips use the Aurora accent.

## Type (SF Pro, system font)

- Page title 22 pt bold, tracking −0.02 em. Page subtitle 13 pt muted.
- Group label 11 pt semibold, uppercase, tracking 0.06 em, faint colour, sits above its group.
- Row label 13 pt; row help text 11.5 pt muted under the label.
- Values that are technical (URLs, model names) use SF Mono 12 pt muted.

## Window and sidebar

- Plan `glass-main-window`: `titleBarStyle: "Overlay"`, hidden title, transparent window, macOS window effect,
  28 pt drag strip, traffic lights inside the sidebar's top padding.
- Sidebar 208 pt: logo mark (the one-colour mark, accent colour) and "Typelite"; nav items
  Home, Settings, Dictionary with 15 pt line icons; active item = accent-soft background and
  accent text; a status block near the bottom showing a green dot per endpoint ("Speech · <preset
  name>", "AI · <preset name>", red dot when the last test or request failed); About pinned last.

## Screens

- **Home:** title "Welcome to Typelite" and a one-line subtitle; three tiles (icon in feature
  colour, name, short description, key caps of the live binding); below, two columns: "Your
  setup" grouped rows and "What's new" list.
- **Settings:** title, then a segmented control with the five sections. Each section is a stack
  of labelled groups (see the mock for Speech, AI, Prompt Presets and System). Prompt Presets
  keeps its own Prompts / Apps sub-tabs as a second segmented control.
- **Dictionary:** title, subtitle, Words / Corrections segmented control, an "Add" group with
  inline fields, then the list as grouped rows.
- **About:** large icon, name, version and licence, then grouped rows (language, source, built
  with).
- **Onboarding:** same tokens, type and controls; each step's content is grouped rows.

## Controls

- Switches: macOS style, 32 × 19 pt, accent when on.
- Pop-up menus: native `<select>` styled as a small raised button with a chevron.
- Buttons: accent fill for the main action, hairline-tinted for secondary.
- No rounded "cards with shadows" except groups and Home tiles; no hover scale animations.

## Icons

- App icon from `src-tauri/icons/source/typelite-icon.svg` (generate all sizes with
  `npx tauri icon`).
- Menu-bar icon: `typelite-tray.svg`, used as a macOS template image.
- Sidebar and About mark: `typelite-mark.svg` (currentColor).
