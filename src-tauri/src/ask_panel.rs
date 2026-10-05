//! Plan `ask-panel-above-pill`: the Ask answer panel. It opens just above the pill, centred on
//! it, on the screen the pill is on, and stays until Escape, its ✕, or a new run.
//!
//! All maths here is in logical points (macOS "points"). Tauri reports window and monitor
//! positions in physical pixels, each scaled by its own screen's factor, so every rectangle is
//! divided by its own scale factor before it is compared with another (mixed Retina and 1x
//! screens, see `CLAUDE.md`). The panel's position always comes from the stored anchor; it is
//! never read back from its own window and written again, which would drift.

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Label of the Ask window (see `tauri.conf.json`).
pub const ASK_WINDOW_LABEL: &str = "ask";
/// Label of the capsule (pill) window.
const CAPSULE_WINDOW_LABEL: &str = "capsule";
/// Sent to the Ask window when the panel closes (Escape, a new run), so it drops its content.
pub const PANEL_CLOSED_EVENT: &str = "ask:panel_closed";

/// The panel's width for a short answer, without the window's shadow padding. A long answer
/// or the open sources column make the page ask for more, up to `panel_limits`.
pub const PANEL_WIDTH: f64 = 420.0;
/// Plan `ask-web-search`: the panel may be at most this share of the work area's width…
pub const MAX_WIDTH_SHARE: f64 = 2.0 / 3.0;
/// …and this share of its height; past that the answer scrolls inside the panel.
pub const MAX_HEIGHT_SHARE: f64 = 0.5;
/// On a very short screen half its height is too little; the panel may still use this much.
pub const MIN_MAX_HEIGHT: f64 = 240.0;
/// Transparent room around the panel inside its window, for the shadow.
pub const WINDOW_PADDING: f64 = 16.0;
/// Space between the panel's bottom edge and the pill's top edge.
pub const GAP_ABOVE_PILL: f64 = 10.0;
/// The panel stays at least this far inside the screen.
pub const SCREEN_MARGIN: f64 = 8.0;
/// The panel's height before the page has reported its own.
pub const DEFAULT_PANEL_HEIGHT: f64 = 160.0;
/// The capsule window pads the pill by this much on each side (`useCapsuleResize`).
pub const CAPSULE_WINDOW_PADDING: f64 = 12.0;
/// Without a visible pill: its usual bottom edge sits this far above the bottom of the screen's
/// work area, the part the Dock does not cover (`PILL_BOTTOM_GAP` in `useCapsuleResize`).
pub const PILL_BOTTOM_GAP: f64 = 16.0;
/// Without a pill ever seen: its usual height (`PILL_HEIGHT` in `useCapsuleResize`).
const DEFAULT_PILL_HEIGHT: f64 = 32.0;
/// How often the cursor is checked against the panel while it is open (click-through).
const CURSOR_POLL: std::time::Duration = std::time::Duration::from_millis(30);
/// Room around the panel's reported rectangle that still catches clicks, so its edge and the
/// first frames of a size change never drop a click on the panel itself.
pub const HIT_SLOP: f64 = 4.0;

/// A rectangle in global logical points (y grows downwards, as Tauri reports it).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LogicalRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl LogicalRect {
    fn right(&self) -> f64 {
        self.x + self.width
    }

    fn bottom(&self) -> f64 {
        self.y + self.height
    }

    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }

    fn centre(&self) -> (f64, f64) {
        (self.x + self.width / 2.0, self.y + self.height / 2.0)
    }
}

/// Converts a physical rectangle (as Tauri reports windows and monitors) to logical points with
/// that window's or monitor's own scale factor.
pub fn logical_rect(x: i32, y: i32, width: u32, height: u32, scale: f64) -> LogicalRect {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    LogicalRect {
        x: f64::from(x) / scale,
        y: f64::from(y) / scale,
        width: f64::from(width) / scale,
        height: f64::from(height) / scale,
    }
}

/// The pill's frame inside the capsule window's logical frame.
pub fn pill_frame_in_capsule(capsule_window: LogicalRect) -> LogicalRect {
    LogicalRect {
        x: capsule_window.x + CAPSULE_WINDOW_PADDING,
        y: capsule_window.y + CAPSULE_WINDOW_PADDING,
        width: (capsule_window.width - 2.0 * CAPSULE_WINDOW_PADDING).max(0.0),
        height: (capsule_window.height - 2.0 * CAPSULE_WINDOW_PADDING).max(0.0),
    }
}

/// Where the panel hangs: above `pill_top`, centred on `centre_x`, inside `screen`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PanelAnchor {
    pub centre_x: f64,
    pub pill_top: f64,
    pub screen: LogicalRect,
}

/// The screen that holds `point`, else the one nearest to it (a point in a gap between screens).
pub fn screen_for_point(screens: &[LogicalRect], x: f64, y: f64) -> Option<LogicalRect> {
    if let Some(screen) = screens.iter().find(|screen| screen.contains(x, y)) {
        return Some(*screen);
    }
    screens.iter().copied().min_by(|a, b| {
        distance_squared(a, x, y)
            .partial_cmp(&distance_squared(b, x, y))
            .unwrap_or(std::cmp::Ordering::Equal)
    })
}

fn distance_squared(rect: &LogicalRect, x: f64, y: f64) -> f64 {
    let dx = (rect.x - x).max(x - rect.right()).max(0.0);
    let dy = (rect.y - y).max(y - rect.bottom()).max(0.0);
    dx * dx + dy * dy
}

/// The anchor above a visible pill, on the screen that holds the pill's centre.
pub fn anchor_above_pill(pill: LogicalRect, screens: &[LogicalRect]) -> Option<PanelAnchor> {
    let (centre_x, centre_y) = pill.centre();
    let screen = screen_for_point(screens, centre_x, centre_y)?;
    Some(PanelAnchor {
        centre_x,
        pill_top: pill.y,
        screen,
    })
}

/// The anchor when no pill is up: the pill's usual place on `screen` (a work area): centred,
/// its bottom `PILL_BOTTOM_GAP` above the work area's bottom.
pub fn anchor_on_screen(screen: LogicalRect, pill_height: f64) -> PanelAnchor {
    let (centre_x, _) = screen.centre();
    PanelAnchor {
        centre_x,
        pill_top: screen.bottom() - PILL_BOTTOM_GAP - pill_height,
        screen,
    }
}

/// Plan `ask-web-search`: the largest panel on a screen (a work area), without padding.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelLimits {
    pub max_width: f64,
    pub max_height: f64,
}

/// ⅔ of the work area's width and ½ of its height, never below the short-answer width (or
/// `MIN_MAX_HEIGHT`) and never outside the screen's margins.
pub fn panel_limits(screen: LogicalRect) -> PanelLimits {
    let usable_width = (screen.width - 2.0 * SCREEN_MARGIN).max(1.0);
    let usable_height = (screen.height - 2.0 * SCREEN_MARGIN).max(1.0);
    PanelLimits {
        max_width: (screen.width * MAX_WIDTH_SHARE)
            .max(PANEL_WIDTH)
            .min(usable_width)
            .floor(),
        max_height: (screen.height * MAX_HEIGHT_SHARE)
            .max(MIN_MAX_HEIGHT)
            .min(usable_height)
            .floor(),
    }
}

/// The panel window's frame for a panel of `panel_width` × `panel_height` (without padding):
/// centred on the anchor, its bottom `GAP_ABOVE_PILL` above the pill, and kept `SCREEN_MARGIN`
/// inside the screen. A panel larger than `panel_limits` is capped to them.
pub fn panel_window_frame(
    anchor: &PanelAnchor,
    panel_width: f64,
    panel_height: f64,
) -> LogicalRect {
    let screen = anchor.screen;
    let limits = panel_limits(screen);
    let panel_width = panel_width.max(1.0).min(limits.max_width);
    let panel_height = panel_height.max(1.0).min(limits.max_height);

    // Horizontal: centred on the pill, then pushed inside the screen. A screen narrower than
    // the panel aligns it to the left margin.
    let min_x = screen.x + SCREEN_MARGIN;
    let max_x = screen.right() - SCREEN_MARGIN - panel_width;
    let panel_x = (anchor.centre_x - panel_width / 2.0).min(max_x).max(min_x);

    // Vertical: just above the pill, then pushed inside the screen.
    let min_y = screen.y + SCREEN_MARGIN;
    let max_y = screen.bottom() - SCREEN_MARGIN - panel_height;
    let panel_y = (anchor.pill_top - GAP_ABOVE_PILL - panel_height)
        .min(max_y)
        .max(min_y);

    LogicalRect {
        x: (panel_x - WINDOW_PADDING).round(),
        y: (panel_y - WINDOW_PADDING).round(),
        width: (panel_width + 2.0 * WINDOW_PADDING).round(),
        height: (panel_height + 2.0 * WINDOW_PADDING).round(),
    }
}

/// Whether the cursor at global `(x, y)` is over the panel. `window` is the Ask window's frame
/// and `panel` the panel's rectangle inside it (window-local). Without a reported panel the whole
/// window counts, so clicks are never lost before the page has laid out.
pub fn cursor_over_panel(window: LogicalRect, panel: Option<LogicalRect>, x: f64, y: f64) -> bool {
    let Some(panel) = panel else {
        return window.contains(x, y);
    };
    LogicalRect {
        x: window.x + panel.x - HIT_SLOP,
        y: window.y + panel.y - HIT_SLOP,
        width: panel.width + 2.0 * HIT_SLOP,
        height: panel.height + 2.0 * HIT_SLOP,
    }
    .contains(x, y)
}

/// Whether the panel is open, where it hangs, and how large the page says it is.
#[derive(Debug)]
pub struct AskPanelState(Mutex<AskPanelInner>);

#[derive(Debug)]
struct AskPanelInner {
    open: bool,
    anchor: Option<PanelAnchor>,
    panel_width: f64,
    panel_height: f64,
    /// The pill's height when it was last seen, for placing the panel without a visible pill.
    last_pill_height: f64,
    /// The window frame last applied, for the click-through hit test.
    frame: Option<LogicalRect>,
    /// The panel's rectangle inside the window, as the page last reported it.
    hit_rect: Option<LogicalRect>,
    /// True while a cursor tracker thread runs.
    tracking: bool,
}

impl Default for AskPanelState {
    fn default() -> Self {
        Self(Mutex::new(AskPanelInner {
            open: false,
            anchor: None,
            panel_width: PANEL_WIDTH,
            panel_height: DEFAULT_PANEL_HEIGHT,
            last_pill_height: DEFAULT_PILL_HEIGHT,
            frame: None,
            hit_rect: None,
            tracking: false,
        }))
    }
}

impl AskPanelState {
    fn lock(&self) -> std::sync::MutexGuard<'_, AskPanelInner> {
        self.0.lock().unwrap_or_else(|error| error.into_inner())
    }

    /// True while the panel is up (Escape then closes it).
    pub fn is_open(&self) -> bool {
        self.lock().open
    }

    /// Opens the panel at `anchor`. A panel that is already open keeps its size, so a new
    /// message does not jump; a fresh one starts at the default size. Returns the frame, or
    /// None without an anchor (no screen was found; the window then stays where it is).
    pub fn open(&self, anchor: Option<PanelAnchor>) -> Option<LogicalRect> {
        let mut inner = self.lock();
        if !inner.open {
            inner.panel_width = PANEL_WIDTH;
            inner.panel_height = DEFAULT_PANEL_HEIGHT;
            inner.hit_rect = None;
        }
        inner.open = true;
        inner.anchor = anchor;
        anchor.map(|anchor| panel_window_frame(&anchor, inner.panel_width, inner.panel_height))
    }

    /// The page reported its size. Returns the new frame while the panel is open.
    pub fn set_panel_size(&self, width: f64, height: f64) -> Option<LogicalRect> {
        let mut inner = self.lock();
        let valid = |v: f64| v.is_finite() && v > 0.0;
        if !valid(width) || !valid(height) {
            return None;
        }
        inner.panel_width = width;
        inner.panel_height = height;
        match (inner.open, inner.anchor) {
            (true, Some(anchor)) => Some(panel_window_frame(&anchor, width, height)),
            _ => None,
        }
    }

    /// The largest panel on the screen the open panel hangs on.
    pub fn limits(&self) -> Option<PanelLimits> {
        self.lock().anchor.map(|anchor| panel_limits(anchor.screen))
    }

    /// Closes the panel. Returns true when it was open.
    pub fn close(&self) -> bool {
        let mut inner = self.lock();
        let was_open = inner.open;
        inner.open = false;
        inner.hit_rect = None;
        was_open
    }

    fn set_frame(&self, frame: LogicalRect) {
        self.lock().frame = Some(frame);
    }

    /// The page reported where the panel is inside the window.
    pub fn set_hit_rect(&self, rect: LogicalRect) {
        let valid = |v: f64| v.is_finite() && v >= 0.0;
        if [rect.x, rect.y, rect.width, rect.height]
            .into_iter()
            .all(valid)
        {
            self.lock().hit_rect = Some(rect);
        }
    }

    /// Whether the cursor is over the panel; None while closed or before the window is placed.
    fn cursor_over_panel(&self, x: f64, y: f64) -> Option<bool> {
        let inner = self.lock();
        if !inner.open {
            return None;
        }
        Some(cursor_over_panel(inner.frame?, inner.hit_rect, x, y))
    }

    /// Claims the tracker; false when one already runs.
    fn start_tracking(&self) -> bool {
        let mut inner = self.lock();
        !std::mem::replace(&mut inner.tracking, true)
    }

    /// Releases the tracker unless the panel opened again meanwhile; true when it stopped.
    fn stop_tracking_if_closed(&self) -> bool {
        let mut inner = self.lock();
        if inner.open {
            return false;
        }
        inner.tracking = false;
        true
    }

    fn remember_pill_height(&self, height: f64) {
        if height > 0.0 {
            self.lock().last_pill_height = height;
        }
    }

    fn last_pill_height(&self) -> f64 {
        self.lock().last_pill_height
    }
}

/// Every screen's work area (the part not covered by the menu bar or the Dock, macOS
/// `visibleFrame`) as a logical rectangle, each converted with its own scale factor. In a
/// full-screen Space, or with an auto-hidden Dock, it is (nearly) the whole screen.
fn screen_rects(window: &tauri::WebviewWindow) -> Vec<LogicalRect> {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let area = monitor.work_area();
            logical_rect(
                area.position.x,
                area.position.y,
                area.size.width,
                area.size.height,
                monitor.scale_factor(),
            )
        })
        .collect()
}

/// The visible pill's logical frame, read from the capsule window (never written back).
fn visible_pill_frame(app: &tauri::AppHandle) -> Option<LogicalRect> {
    let capsule = app.get_webview_window(CAPSULE_WINDOW_LABEL)?;
    if !capsule.is_visible().unwrap_or(false) {
        return None;
    }
    let position = capsule.outer_position().ok()?;
    let size = capsule.outer_size().ok()?;
    let scale = capsule.scale_factor().ok()?;
    let window = logical_rect(position.x, position.y, size.width, size.height, scale);
    Some(pill_frame_in_capsule(window))
}

/// The cursor in logical points. Tauri scales it by the primary monitor's factor, whatever
/// screen the cursor is on.
fn cursor_point(window: &tauri::WebviewWindow) -> Option<(f64, f64)> {
    let cursor = window.cursor_position().ok()?;
    let scale = window
        .primary_monitor()
        .ok()
        .flatten()
        .map_or(1.0, |monitor| monitor.scale_factor());
    let scale = if scale > 0.0 { scale } else { 1.0 };
    Some((cursor.x / scale, cursor.y / scale))
}

/// Where the panel should hang right now: above the visible pill, else at the pill's usual
/// place on the cursor's screen.
fn current_anchor(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    state: &AskPanelState,
) -> Option<PanelAnchor> {
    let screens = screen_rects(window);
    if let Some(pill) = visible_pill_frame(app) {
        state.remember_pill_height(pill.height);
        if let Some(anchor) = anchor_above_pill(pill, &screens) {
            return Some(anchor);
        }
    }
    let screen = match cursor_point(window) {
        Some((x, y)) => screen_for_point(&screens, x, y),
        None => None,
    }
    .or_else(|| screens.first().copied())?;
    Some(anchor_on_screen(screen, state.last_pill_height()))
}

/// Size and position in one turn of the main thread, so macOS never draws the panel at its
/// new size in the old place (it is centred on the pill, so that would be a sideways jump
/// each time the sources column opens or closes). Same as `set_capsule_frame` in lib.rs.
fn apply_frame(window: &tauri::WebviewWindow, frame: LogicalRect) {
    if let Some(state) = window.try_state::<AskPanelState>() {
        state.set_frame(frame);
    }
    crate::overlay_window::set_frame(&window, frame.x, frame.y, frame.width, frame.height);
}

/// Places the Ask window above the pill and shows it without taking focus from the frontmost
/// app. The window is not focusable (see `tauri.conf.json`), so `show` never activates it.
pub fn show(app: &tauri::AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let window = crate::ensure_ask_window(app)?;
    let state = app.state::<AskPanelState>();
    // The window can never become key, so clicks reach its buttons while the app keeps focus.
    let _ = window.set_focusable(false);
    // Allowed over full-screen apps (idempotent; see `overlay_window`).
    crate::overlay_window::make_overlay(&window);
    if let Some(frame) = state.open(current_anchor(app, &window, &state)) {
        apply_frame(&window, frame);
    }
    let _ = window.show();
    track_cursor(app);
    Ok(window)
}

/// Click-through: the window is as large as the largest panel (so size changes never move it),
/// but only the panel should catch clicks. While the panel is open this checks the cursor every
/// `CURSOR_POLL` and lets clicks outside the panel fall through to the app behind
/// (`setIgnoresMouseEvents:` on macOS). A window that ignores the mouse gets no events, so the
/// page cannot do this itself.
fn track_cursor(app: &tauri::AppHandle) {
    if !app.state::<AskPanelState>().start_tracking() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let mut ignoring = false;
        loop {
            let Some(window) = app.get_webview_window(ASK_WINDOW_LABEL) else {
                break;
            };
            let state = app.state::<AskPanelState>();
            let over = cursor_point(&window).and_then(|(x, y)| state.cursor_over_panel(x, y));
            match over {
                Some(over) => {
                    if ignoring == over {
                        ignoring = !over;
                        let _ = window.set_ignore_cursor_events(ignoring);
                    }
                }
                None if !state.is_open() => {
                    if ignoring {
                        let _ = window.set_ignore_cursor_events(false);
                    }
                    if state.stop_tracking_if_closed() {
                        break;
                    }
                }
                None => {}
            }
            std::thread::sleep(CURSOR_POLL);
        }
    });
}

/// Closes the panel (Escape, ✕, a new run, or after Insert). Returns true when it was open.
pub fn close(app: &tauri::AppHandle) -> bool {
    let Some(state) = app.try_state::<AskPanelState>() else {
        return false;
    };
    let was_open = state.close();
    if let Some(window) = app.get_webview_window(ASK_WINDOW_LABEL) {
        let _ = window.hide();
        if was_open {
            let _ = window.emit(PANEL_CLOSED_EVENT, ());
        }
    }
    was_open
}

/// True while the panel is up.
pub fn is_open(app: &tauri::AppHandle) -> bool {
    app.try_state::<AskPanelState>()
        .is_some_and(|state| state.is_open())
}

/// The page's ✕ button.
#[tauri::command]
pub fn close_ask_panel(app: tauri::AppHandle) {
    close(&app);
}

/// Plan `ask-web-search`: the largest panel the page may lay out on the current screen, so a
/// long answer can widen to it and scroll past its height.
#[tauri::command]
pub fn ask_panel_limits(app: tauri::AppHandle) -> Option<PanelLimits> {
    app.state::<AskPanelState>().limits()
}

/// The page reports the panel's size; the window keeps its bottom edge, grows upwards and
/// stays centred on the pill.
#[tauri::command]
pub fn resize_ask_panel(app: tauri::AppHandle, width: f64, height: f64) {
    let Some(frame) = app.state::<AskPanelState>().set_panel_size(width, height) else {
        return;
    };
    if let Some(window) = app.get_webview_window(ASK_WINDOW_LABEL) {
        apply_frame(&window, frame);
    }
}

/// The page reports the panel's rectangle inside the window (CSS pixels = logical points), for
/// click-through outside it.
#[tauri::command]
pub fn set_ask_panel_hit_rect(app: tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) {
    app.state::<AskPanelState>().set_hit_rect(LogicalRect {
        x,
        y,
        width,
        height,
    });
}

/// The panel's Copy button. The page is never focused, so it cannot use the browser clipboard;
/// the text goes on the clipboard here and stays there (the user asked for it).
#[tauri::command]
pub async fn copy_ask_text(text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Nothing to copy".to_string());
    }
    let copy_only = crate::output::clipboard::ClipboardOutput::with_options(
        crate::output::clipboard::ClipboardOutputOptions {
            restore_after_paste: false,
            auto_paste: false,
            ..crate::output::clipboard::ClipboardOutputOptions::default()
        },
    );
    crate::output::TextOutput::type_text(&copy_only, &text)
        .await
        .map_err(|error| error.to_string())?;
    tracing::info!("Ask panel: copied ({} chars)", text.chars().count());
    Ok(())
}

/// The panel's Insert and "Try replacing again" buttons: pastes the text into the frontmost app
/// (clipboard, ⌘V, then the old clipboard back). The panel never took focus, so the paste lands
/// at the cursor, or replaces the highlight when one is still selected. Closes the panel when
/// the paste went through.
#[tauri::command]
pub async fn insert_ask_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Nothing to insert".to_string());
    }
    let paste = crate::output::clipboard::ClipboardOutput::new();
    let result = crate::output::TextOutput::type_text(&paste, &text)
        .await
        .map_err(|error| error.to_string())?;
    if result.status != crate::output::InsertStatus::Inserted {
        tracing::warn!("Ask panel: insert did not go through ({:?})", result.status);
        return Err("The text could not be inserted".to_string());
    }
    tracing::info!("Ask panel: inserted ({} chars)", text.chars().count());
    close(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> LogicalRect {
        LogicalRect {
            x,
            y,
            width,
            height,
        }
    }

    /// The visible panel (the window without its shadow padding).
    fn panel_of(frame: LogicalRect) -> LogicalRect {
        rect(
            frame.x + WINDOW_PADDING,
            frame.y + WINDOW_PADDING,
            frame.width - 2.0 * WINDOW_PADDING,
            frame.height - 2.0 * WINDOW_PADDING,
        )
    }

    #[test]
    fn panel_hangs_just_above_the_pill_and_centred_on_it() {
        let screen = rect(0.0, 0.0, 1512.0, 982.0);
        let pill = rect(681.0, 866.0, 150.0, 36.0);
        let anchor = anchor_above_pill(pill, &[screen]).expect("a screen holds the pill");
        let panel = panel_of(panel_window_frame(&anchor, PANEL_WIDTH, 200.0));

        assert_eq!(panel.width, PANEL_WIDTH);
        assert_eq!(panel.height, 200.0);
        assert_eq!(panel.bottom(), pill.y - GAP_ABOVE_PILL);
        assert_eq!(panel.x + panel.width / 2.0, pill.x + pill.width / 2.0);
    }

    #[test]
    fn the_pill_frame_follows_the_capsule_window_whatever_its_height() {
        // A 40 pt pill (another plan's size) in its 12 pt padded window.
        let window = rect(600.0, 850.0, 174.0 + 24.0, 64.0);
        let pill = pill_frame_in_capsule(window);
        assert_eq!(pill, rect(612.0, 862.0, 174.0, 40.0));
        let anchor = anchor_above_pill(pill, &[rect(0.0, 0.0, 1512.0, 982.0)]).unwrap();
        assert_eq!(anchor.pill_top, 862.0);
    }

    #[test]
    fn panel_stays_inside_the_screen_edges() {
        let screen = rect(0.0, 0.0, 1512.0, 982.0);
        // Pill dragged to the far left and far right.
        for pill in [
            rect(4.0, 866.0, 150.0, 36.0),
            rect(1400.0, 866.0, 110.0, 36.0),
        ] {
            let anchor = anchor_above_pill(pill, &[screen]).unwrap();
            let panel = panel_of(panel_window_frame(&anchor, PANEL_WIDTH, 200.0));
            assert!(panel.x >= screen.x + SCREEN_MARGIN, "{panel:?}");
            assert!(panel.right() <= screen.right() - SCREEN_MARGIN, "{panel:?}");
        }
        // Pill dragged to the top: the panel cannot go above the screen.
        let anchor = anchor_above_pill(rect(700.0, 20.0, 150.0, 36.0), &[screen]).unwrap();
        let panel = panel_of(panel_window_frame(&anchor, PANEL_WIDTH, 200.0));
        assert_eq!(panel.y, screen.y + SCREEN_MARGIN);
    }

    #[test]
    fn a_panel_taller_than_the_screen_is_capped_to_it() {
        let screen = rect(0.0, 0.0, 800.0, 200.0);
        let anchor = anchor_on_screen(screen, 36.0);
        let panel = panel_of(panel_window_frame(&anchor, PANEL_WIDTH, 1_000.0));
        assert_eq!(panel.y, SCREEN_MARGIN);
        assert_eq!(panel.height, 200.0 - 2.0 * SCREEN_MARGIN);
    }

    #[test]
    fn a_large_panel_is_capped_to_two_thirds_of_the_width_and_half_the_height() {
        let screen = rect(0.0, 25.0, 1512.0, 887.0);
        let limits = panel_limits(screen);
        assert_eq!(
            limits,
            PanelLimits {
                max_width: 1008.0,
                max_height: 443.0
            }
        );
        let anchor = anchor_on_screen(screen, 32.0);
        let panel = panel_of(panel_window_frame(&anchor, 5_000.0, 5_000.0));
        assert_eq!(panel.width, 1008.0);
        assert_eq!(panel.height, 443.0);
        // Still centred on the pill and just above it.
        assert_eq!(panel.x + panel.width / 2.0, anchor.centre_x);
        assert_eq!(panel.bottom(), anchor.pill_top - GAP_ABOVE_PILL);
    }

    #[test]
    fn limits_never_go_below_the_short_panel_or_outside_the_screen() {
        // Narrow: ⅔ of 500 is below 420, so 420; the margins still win on a 400 pt screen.
        assert_eq!(
            panel_limits(rect(0.0, 0.0, 500.0, 900.0)).max_width,
            PANEL_WIDTH
        );
        assert_eq!(panel_limits(rect(0.0, 0.0, 400.0, 900.0)).max_width, 384.0);
        // Short: half of 300 is below the floor, so the floor.
        assert_eq!(
            panel_limits(rect(0.0, 0.0, 1000.0, 300.0)).max_height,
            MIN_MAX_HEIGHT
        );
    }

    #[test]
    fn a_wider_panel_keeps_its_centre_and_bottom_edge() {
        let state = AskPanelState::default();
        let anchor = anchor_on_screen(rect(0.0, 0.0, 1512.0, 982.0), 36.0);
        let first = state.open(Some(anchor)).unwrap();
        let wide = state.set_panel_size(708.0, DEFAULT_PANEL_HEIGHT).unwrap();
        assert_eq!(first.bottom(), wide.bottom());
        assert_eq!(first.x + first.width / 2.0, wide.x + wide.width / 2.0);
        assert_eq!(state.limits().unwrap().max_width, 1008.0);
    }

    #[test]
    fn a_narrow_screen_aligns_the_panel_to_its_left_margin() {
        let screen = rect(100.0, 0.0, 400.0, 800.0);
        let anchor = anchor_on_screen(screen, 36.0);
        let panel = panel_of(panel_window_frame(&anchor, PANEL_WIDTH, 120.0));
        assert_eq!(panel.x, screen.x + SCREEN_MARGIN);
    }

    #[test]
    fn each_screen_converts_with_its_own_scale_factor() {
        // A Retina laptop (2x) with a 1x monitor to its right.
        let retina = logical_rect(0, 0, 3024, 1964, 2.0);
        let external = logical_rect(1512, 0, 1920, 1080, 1.0);
        assert_eq!(retina, rect(0.0, 0.0, 1512.0, 982.0));
        assert_eq!(external, rect(1512.0, 0.0, 1920.0, 1080.0));

        // A capsule window on the external screen reports physical pixels at 1x.
        let capsule = logical_rect(2385, 956, 174, 60, 1.0);
        let pill = pill_frame_in_capsule(capsule);
        let anchor = anchor_above_pill(pill, &[retina, external]).unwrap();
        assert_eq!(anchor.screen, external);
        let panel = panel_of(panel_window_frame(&anchor, PANEL_WIDTH, 150.0));
        assert!(panel.x >= external.x + SCREEN_MARGIN);
        assert!(panel.right() <= external.right() - SCREEN_MARGIN);
        assert_eq!(panel.bottom(), pill.y - GAP_ABOVE_PILL);

        // The same pill on the Retina screen reports doubled pixels; the maths lands on it.
        let capsule = logical_rect(1362, 1732, 348, 120, 2.0);
        let pill = pill_frame_in_capsule(capsule);
        let anchor = anchor_above_pill(pill, &[retina, external]).unwrap();
        assert_eq!(anchor.screen, retina);
        assert_eq!(pill, rect(693.0, 878.0, 150.0, 36.0));
    }

    #[test]
    fn a_pill_in_a_gap_between_screens_uses_the_nearest_screen() {
        let left = rect(0.0, 0.0, 1000.0, 800.0);
        let right = rect(1000.0, 200.0, 1000.0, 800.0);
        // A point left of `right`, below `left`: nearer to `left`'s bottom edge.
        let screen = screen_for_point(&[left, right], 900.0, 820.0).unwrap();
        assert_eq!(screen, left);
        assert_eq!(screen_for_point(&[], 0.0, 0.0), None);
    }

    #[test]
    fn without_a_pill_the_panel_uses_the_pills_usual_place() {
        let screen = rect(0.0, 0.0, 1512.0, 982.0);
        let anchor = anchor_on_screen(screen, 32.0);
        assert_eq!(anchor.centre_x, 756.0);
        // The pill's bottom sits `PILL_BOTTOM_GAP` above the work area's bottom.
        assert_eq!(anchor.pill_top, 982.0 - PILL_BOTTOM_GAP - 32.0);
    }

    #[test]
    fn without_a_pill_the_panel_sits_above_the_dock_or_near_the_bottom_edge() {
        // Work areas in points: a Retina screen with the menu bar and a 70 pt Dock at the
        // bottom, and a 1x external screen with only its menu bar (no Dock, or full screen).
        let with_dock = logical_rect(0, 50, 3024, 1774, 2.0);
        let without_dock = logical_rect(1512, 25, 1920, 1055, 1.0);
        assert_eq!(with_dock, rect(0.0, 25.0, 1512.0, 887.0));

        let above_dock = anchor_on_screen(with_dock, 32.0);
        assert_eq!(above_dock.pill_top + 32.0, 912.0 - PILL_BOTTOM_GAP);
        let panel = panel_of(panel_window_frame(&above_dock, PANEL_WIDTH, 150.0));
        assert_eq!(panel.bottom(), above_dock.pill_top - GAP_ABOVE_PILL);

        let near_edge = anchor_on_screen(without_dock, 32.0);
        assert_eq!(near_edge.pill_top + 32.0, 1080.0 - PILL_BOTTOM_GAP);
        assert_eq!(near_edge.centre_x, 1512.0 + 960.0);
    }

    #[test]
    fn height_changes_keep_the_bottom_edge_and_grow_upwards() {
        let state = AskPanelState::default();
        let anchor = anchor_on_screen(rect(0.0, 0.0, 1512.0, 982.0), 36.0);
        let first = state.open(Some(anchor)).unwrap();
        let taller = state
            .set_panel_size(PANEL_WIDTH, 260.0)
            .expect("the panel is open");
        assert_eq!(first.bottom(), taller.bottom());
        assert!(taller.y < first.y);
        assert_eq!(first.x, taller.x);
    }

    #[test]
    fn panel_state_opens_and_closes_once() {
        let state = AskPanelState::default();
        assert!(!state.is_open());
        assert!(!state.close(), "closing a closed panel reports nothing");
        assert_eq!(
            state.set_panel_size(PANEL_WIDTH, 200.0),
            None,
            "closed: no resize"
        );

        state.open(Some(anchor_on_screen(rect(0.0, 0.0, 1512.0, 982.0), 36.0)));
        assert!(state.is_open());
        assert!(state.close());
        assert!(!state.is_open());
        assert!(!state.close());
    }

    #[test]
    fn a_fresh_panel_starts_at_the_default_height_and_an_open_one_keeps_its_height() {
        let state = AskPanelState::default();
        let anchor = anchor_on_screen(rect(0.0, 0.0, 1512.0, 982.0), 36.0);
        state.open(Some(anchor));
        state.set_panel_size(PANEL_WIDTH, 300.0);
        let reopened_while_open = state.open(Some(anchor)).unwrap();
        assert_eq!(
            reopened_while_open.height,
            300.0 + 2.0 * WINDOW_PADDING,
            "a new message in an open panel does not jump"
        );
        state.close();
        let fresh = state.open(Some(anchor)).unwrap();
        assert_eq!(fresh.height, DEFAULT_PANEL_HEIGHT + 2.0 * WINDOW_PADDING);
    }

    #[test]
    fn an_unanchored_panel_is_open_but_never_moved() {
        let state = AskPanelState::default();
        assert_eq!(state.open(None), None);
        assert!(state.is_open());
        assert_eq!(state.set_panel_size(PANEL_WIDTH, 200.0), None);
    }

    #[test]
    fn only_the_panel_catches_the_cursor_and_the_rest_clicks_through() {
        let window = rect(500.0, 400.0, 1040.0, 475.0);
        let panel = Some(rect(310.0, 300.0, 420.0, 160.0));
        // On the panel, and just inside its slop.
        assert!(cursor_over_panel(window, panel, 1000.0, 800.0));
        assert!(cursor_over_panel(window, panel, 500.0 + 310.0 - 2.0, 800.0));
        // The transparent sides and top of the window let clicks through.
        assert!(!cursor_over_panel(window, panel, 560.0, 800.0));
        assert!(!cursor_over_panel(window, panel, 1000.0, 450.0));
        // Before the page reports, the whole window catches clicks.
        assert!(cursor_over_panel(window, None, 560.0, 800.0));
        assert!(!cursor_over_panel(window, None, 100.0, 100.0));
    }

    #[test]
    fn the_hit_rect_is_dropped_when_the_panel_closes_or_opens_fresh() {
        let state = AskPanelState::default();
        let anchor = anchor_on_screen(rect(0.0, 0.0, 1512.0, 982.0), 36.0);
        let frame = state.open(Some(anchor)).unwrap();
        state.set_frame(frame);
        state.set_hit_rect(rect(10.0, 10.0, 20.0, 20.0));
        assert_eq!(
            state.cursor_over_panel(frame.x + 100.0, frame.y + 100.0),
            Some(false)
        );
        state.set_hit_rect(rect(f64::NAN, 0.0, 1.0, 1.0));
        assert_eq!(state.lock().hit_rect, Some(rect(10.0, 10.0, 20.0, 20.0)));
        state.close();
        assert_eq!(state.cursor_over_panel(frame.x, frame.y), None);
        state.open(Some(anchor));
        assert_eq!(state.lock().hit_rect, None);
    }

    #[test]
    fn invalid_sizes_are_ignored() {
        let state = AskPanelState::default();
        state.open(Some(anchor_on_screen(rect(0.0, 0.0, 1512.0, 982.0), 36.0)));
        assert_eq!(state.set_panel_size(PANEL_WIDTH, 0.0), None);
        assert_eq!(state.set_panel_size(PANEL_WIDTH, f64::NAN), None);
        assert_eq!(state.set_panel_size(-1.0, 200.0), None);
    }
}
