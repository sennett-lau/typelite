# Placement on the work area

Where the pill (and the Ask panel without a visible pill) sits on a screen. Back to
[index](index.md).

## Before

The capsule window's centre was 80 pt plus half the window's height above the whole screen's
bottom edge. That leaves room for a Dock, but on screens without one (external monitors, an
auto-hidden Dock, full-screen Spaces) the pill floated about 90 pt above the edge.

## Now

- Each monitor's work area comes from Tauri's `workArea` (macOS `NSScreen.visibleFrame`: the
  screen minus the menu bar and the Dock), in physical pixels, converted to logical points with
  that monitor's own scale factor. Without a work area the whole screen is used.
- The pill's bottom edge sits `PILL_BOTTOM_GAP` (16 pt) above the work area's bottom. The
  capsule window is the pill plus 12 pt padding, so the window's bottom is 4 pt above the work
  area's bottom.
- Horizontally the pill is centred on the work area.
- The anchor is the pill's vertical centre, so the window still grows and shrinks around it.
- The Ask panel (`ask_panel.rs`) uses the same gap and the work areas for its "no pill" anchor
  and for keeping the panel inside the screen; above a visible pill it still hangs from the
  pill's actual frame, 10 pt above it.

| Screen | Work area bottom | Pill bottom |
|---|---|---|
| Dock at the bottom | top of the Dock | 16 pt above the Dock |
| Dock on the left or right | screen edge | 16 pt above the edge, centred between the Dock and the other edge |
| No Dock on this screen, or the Dock auto-hides | screen edge | 16 pt above the edge |
| Full-screen Space | screen edge | 16 pt above the edge |

## Considered

- A different gap per case (above the Dock vs the edge): one gap is simpler and looks the same
  everywhere.
- Centring on the whole screen with a side Dock: the pill would sit off-centre in the usable
  space.
