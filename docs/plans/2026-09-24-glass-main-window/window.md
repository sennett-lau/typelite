# Window

Config, layout and styling for the glass main window. Back to [index](index.md).

## Window config (`tauri.conf.json`, window `main`)

- `titleBarStyle: "Overlay"`, `hiddenTitle: true`, `transparent: true`, `decorations: true`.
- `windowEffects`: `{ "effects": ["sidebar"], "state": "followsWindowActiveState" }`. If
  `sidebar` looks too light or too dark in testing, try `underWindowBackground` or `hudWindow`.
- `macOSPrivateApi` is already on, which transparent windows need.
- Traffic-light buttons get a small inset (`trafficLightPosition`) so they sit inside the
  sidebar's top padding.

## Layout

- The sidebar gets about 28 pt of top padding so its first item clears the window buttons.
- A 28 pt tall strip across the whole top edge carries `data-tauri-drag-region`, so the window
  can be dragged from anywhere along the top. Controls inside it stay clickable.
- The content area starts under the same strip.

## Styling (tokens in `globals.css`)

- `html`, `body` and the root layout become transparent so the effect view shows through.
- Sidebar background: transparent.
- Content background: a new token, about 60 % white in light mode and 45 % `#1e1e20` in dark mode,
  so text stays readable.
- Cards and inputs on the content area keep their current solid surfaces.
- Borders between sidebar and content: one hairline using `--color-border` at low opacity.
- When the window is inactive, macOS fades the effect automatically (`followsWindowActiveState`).
