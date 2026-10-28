use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Window};

use crate::config::{store_get_window_state, store_set_window_state};

const TITLE_BAND_HEIGHT: i64 = 50;
const MIN_VISIBLE_WIDTH: i64 = 100;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub(crate) struct WindowState {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) maximized: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Area {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Monitor {
    pub(crate) area: Area,
    pub(crate) scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Placement {
    At { x: i32, y: i32, width: u32, height: u32 },
    Centered { x: i32, y: i32, width: u32, height: u32 },
}

#[derive(Default)]
pub(crate) struct NormalBounds(Mutex<Option<WindowState>>);

pub(crate) fn parse_window_state(value: serde_json::Value) -> Option<WindowState> {
    serde_json::from_value::<WindowState>(value)
        .ok()
        .filter(|s| s.width > 0 && s.height > 0)
}

fn title_band_visible(state: &WindowState, width: u32, area: &Area) -> bool {
    let left = i64::from(state.x);
    let right = left + i64::from(width);
    let top = i64::from(state.y);
    let overlap = right.min(i64::from(area.x) + i64::from(area.width)) - left.max(i64::from(area.x));
    overlap >= MIN_VISIBLE_WIDTH
        && top >= i64::from(area.y)
        && top + TITLE_BAND_HEIGHT <= i64::from(area.y) + i64::from(area.height)
}

fn scaled(logical: f64, scale: f64) -> u32 {
    (logical * scale).round() as u32
}

fn fit_to_monitor(
    state: &WindowState,
    monitor: &Monitor,
    min_logical: (f64, f64),
    frame_logical: (f64, f64),
) -> (u32, u32) {
    let frame = (
        scaled(frame_logical.0, monitor.scale),
        scaled(frame_logical.1, monitor.scale),
    );
    let width = state
        .width
        .min(monitor.area.width.saturating_sub(frame.0))
        .max(scaled(min_logical.0, monitor.scale));
    let height = state
        .height
        .min(monitor.area.height.saturating_sub(frame.1))
        .max(scaled(min_logical.1, monitor.scale));
    (width, height)
}

fn centered_in(
    state: &WindowState,
    monitor: &Monitor,
    min_logical: (f64, f64),
    frame_logical: (f64, f64),
) -> Placement {
    let (width, height) = fit_to_monitor(state, monitor, min_logical, frame_logical);
    let outer_width = i64::from(width) + i64::from(scaled(frame_logical.0, monitor.scale));
    let outer_height = i64::from(height) + i64::from(scaled(frame_logical.1, monitor.scale));
    let area = &monitor.area;
    let x = i64::from(area.x) + ((i64::from(area.width) - outer_width) / 2).max(0);
    let y = i64::from(area.y) + ((i64::from(area.height) - outer_height) / 2).max(0);
    Placement::Centered {
        x: x as i32,
        y: y as i32,
        width,
        height,
    }
}

/// `monitors[0]` is the primary monitor and receives the window when the saved position is no longer reachable.
pub(crate) fn resolve_placement(
    state: &WindowState,
    monitors: &[Monitor],
    min_logical: (f64, f64),
    frame_logical: (f64, f64),
) -> Option<Placement> {
    let fallback = monitors.first()?;
    let target = monitors
        .iter()
        .find(|m| title_band_visible(state, state.width, &m.area));
    if let Some(monitor) = target {
        let (width, height) = fit_to_monitor(state, monitor, min_logical, frame_logical);
        if title_band_visible(state, width, &monitor.area) {
            return Some(Placement::At {
                x: state.x,
                y: state.y,
                width,
                height,
            });
        }
    }
    Some(centered_in(state, fallback, min_logical, frame_logical))
}

fn capture(window: &Window) -> Option<WindowState> {
    if window.is_minimized().unwrap_or(false) || window.is_maximized().unwrap_or(false) {
        return None;
    }
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    (size.width > 0 && size.height > 0).then_some(WindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized: false,
    })
}

fn remember(app: &tauri::AppHandle, bounds: Option<WindowState>) {
    *app.state::<NormalBounds>().0.lock().unwrap() = bounds;
}

/// A moved or resized event can arrive before the window reports itself maximized, so a frame that fills the
/// monitor's work area is treated as maximized and never remembered as the normal bounds.
fn fills_work_area(outer: (u32, u32), work_area: (u32, u32)) -> bool {
    outer.0 >= work_area.0 && outer.1 >= work_area.1
}

pub(crate) fn track(window: &Window) {
    let Some(state) = capture(window) else {
        return;
    };
    if let (Ok(Some(monitor)), Ok(outer)) = (window.current_monitor(), window.outer_size()) {
        let work_area = monitor.work_area().size;
        if fills_work_area((outer.width, outer.height), (work_area.width, work_area.height)) {
            return;
        }
    }
    remember(window.app_handle(), Some(state));
}

pub(crate) fn save(window: &Window) {
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let app = window.app_handle();
    let maximized = window.is_maximized().unwrap_or(false);
    let tracked = *app.state::<NormalBounds>().0.lock().unwrap();
    let Some(mut state) = capture(window).or(tracked) else {
        return;
    };
    state.maximized = maximized;
    store_set_window_state(app, &state);
}

pub(crate) fn restore(window: &WebviewWindow, min_logical: (f64, f64)) {
    let app = window.app_handle();
    let Some(state) = store_get_window_state(app) else {
        return;
    };
    let primary_position = window.primary_monitor().ok().flatten().map(|m| *m.position());
    let mut available = window.available_monitors().unwrap_or_default();
    available.sort_by_key(|m| Some(*m.position()) != primary_position);
    let monitors: Vec<Monitor> = available
        .iter()
        .map(|m| {
            let area = m.work_area();
            Monitor {
                area: Area {
                    x: area.position.x,
                    y: area.position.y,
                    width: area.size.width,
                    height: area.size.height,
                },
                scale: m.scale_factor(),
            }
        })
        .collect();
    let current_scale = window.scale_factor().unwrap_or(1.0);
    let frame_logical = match (window.outer_size(), window.inner_size()) {
        (Ok(outer), Ok(inner)) => (
            f64::from(outer.width.saturating_sub(inner.width)) / current_scale,
            f64::from(outer.height.saturating_sub(inner.height)) / current_scale,
        ),
        _ => (0.0, 0.0),
    };
    match resolve_placement(&state, &monitors, min_logical, frame_logical) {
        None => {}
        Some(Placement::At { x, y, width, height }) => {
            let _ = window.set_position(PhysicalPosition::new(x, y));
            let _ = window.set_size(PhysicalSize::new(width, height));
            remember(
                app,
                Some(WindowState {
                    x,
                    y,
                    width,
                    height,
                    maximized: false,
                }),
            );
        }
        Some(Placement::Centered { x, y, width, height }) => {
            let _ = window.set_position(PhysicalPosition::new(x, y));
            let _ = window.set_size(PhysicalSize::new(width, height));
        }
    }
    if state.maximized {
        let _ = window.maximize();
    }
}

pub(crate) fn apply_default_size(window: &WebviewWindow, width: f64, height: f64) {
    if store_get_window_state(window.app_handle()).is_none() {
        let _ = window.set_size(LogicalSize::new(width, height));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: (f64, f64) = (620.0, 300.0);
    const NO_FRAME: (f64, f64) = (0.0, 0.0);

    fn monitor(x: i32, y: i32, width: u32, height: u32) -> Monitor {
        scaled_monitor(x, y, width, height, 1.0)
    }

    fn scaled_monitor(x: i32, y: i32, width: u32, height: u32, scale: f64) -> Monitor {
        Monitor {
            area: Area { x, y, width, height },
            scale,
        }
    }

    fn state(x: i32, y: i32, width: u32, height: u32) -> WindowState {
        WindowState {
            x,
            y,
            width,
            height,
            maximized: false,
        }
    }

    fn at(x: i32, y: i32, width: u32, height: u32) -> Option<Placement> {
        Some(Placement::At { x, y, width, height })
    }

    fn centered(x: i32, y: i32, width: u32, height: u32) -> Option<Placement> {
        Some(Placement::Centered { x, y, width, height })
    }

    #[test]
    fn visible_position_is_kept() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(300, 200, 1000, 650), &monitors, MIN, NO_FRAME),
            at(300, 200, 1000, 650)
        );
    }

    #[test]
    fn disconnected_monitor_falls_back_to_centered_on_primary() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(2200, 100, 1000, 650), &monitors, MIN, NO_FRAME),
            centered(460, 215, 1000, 650)
        );
    }

    #[test]
    fn position_on_secondary_monitor_with_negative_origin_is_kept() {
        let monitors = [monitor(0, 0, 1920, 1080), monitor(-1280, 0, 1280, 1024)];
        assert_eq!(
            resolve_placement(&state(-1200, 100, 900, 600), &monitors, MIN, NO_FRAME),
            at(-1200, 100, 900, 600)
        );
    }

    #[test]
    fn mostly_off_screen_but_title_band_reachable_is_kept() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(1800, 300, 1000, 700), &monitors, MIN, NO_FRAME),
            at(1800, 300, 1000, 700)
        );
    }

    #[test]
    fn title_band_with_too_little_overlap_falls_back() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert!(matches!(
            resolve_placement(&state(1850, 300, 1000, 700), &monitors, MIN, NO_FRAME),
            Some(Placement::Centered { .. })
        ));
    }

    #[test]
    fn title_band_above_monitor_falls_back() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert!(matches!(
            resolve_placement(&state(100, -40, 1000, 700), &monitors, MIN, NO_FRAME),
            Some(Placement::Centered { .. })
        ));
    }

    #[test]
    fn title_band_below_monitor_bottom_falls_back() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert!(matches!(
            resolve_placement(&state(100, 1050, 1000, 700), &monitors, MIN, NO_FRAME),
            Some(Placement::Centered { .. })
        ));
    }

    #[test]
    fn size_is_clamped_to_the_target_monitor() {
        let monitors = [monitor(0, 0, 1280, 720)];
        assert_eq!(
            resolve_placement(&state(0, 0, 3000, 2000), &monitors, MIN, NO_FRAME),
            at(0, 0, 1280, 720)
        );
    }

    #[test]
    fn size_is_clamped_to_one_monitor_not_per_axis_maxima() {
        let monitors = [monitor(0, 0, 3440, 1440), monitor(3440, 0, 1080, 1920)];
        assert_eq!(
            resolve_placement(&state(0, 0, 4000, 3000), &monitors, MIN, NO_FRAME),
            at(0, 0, 3440, 1440)
        );
    }

    #[test]
    fn frame_is_subtracted_so_the_outer_window_fits() {
        let monitors = [monitor(0, 0, 1280, 720)];
        assert_eq!(
            resolve_placement(&state(0, 0, 3000, 2000), &monitors, MIN, (16.0, 39.0)),
            at(0, 0, 1264, 681)
        );
    }

    #[test]
    fn size_is_raised_to_minimum() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(10, 10, 200, 100), &monitors, MIN, NO_FRAME),
            at(10, 10, 620, 300)
        );
    }

    #[test]
    fn minimum_uses_the_destination_monitor_scale() {
        let monitors = [
            scaled_monitor(0, 0, 3840, 2160, 1.5),
            scaled_monitor(3840, 0, 1920, 1080, 1.0),
        ];
        assert_eq!(
            resolve_placement(&state(4000, 100, 800, 600), &monitors, MIN, NO_FRAME),
            at(4000, 100, 800, 600)
        );
        assert_eq!(
            resolve_placement(&state(100, 100, 800, 600), &monitors, MIN, NO_FRAME),
            at(100, 100, 930, 600)
        );
    }

    #[test]
    fn fallback_is_clamped_to_the_primary_monitor_it_is_centered_on() {
        let monitors = [monitor(0, 0, 1920, 1040), monitor(1920, 0, 3840, 2120)];
        assert_eq!(
            resolve_placement(&state(9000, 0, 2400, 1600), &monitors, MIN, (16.0, 39.0)),
            centered(0, 0, 1904, 1001)
        );
    }

    #[test]
    fn fallback_is_centered_within_a_primary_that_is_not_at_the_origin() {
        let monitors = [monitor(1920, 100, 1920, 1080), monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(9000, 0, 1000, 600), &monitors, MIN, NO_FRAME),
            centered(2380, 340, 1000, 600)
        );
    }

    #[test]
    fn no_monitors_leaves_placement_alone() {
        assert_eq!(resolve_placement(&state(10, 10, 900, 600), &[], MIN, NO_FRAME), None);
    }

    #[test]
    fn frame_filling_work_area_counts_as_maximized() {
        assert!(fills_work_area((3456, 1408), (3440, 1392)));
        assert!(fills_work_area((1920, 1040), (1920, 1040)));
    }

    #[test]
    fn frame_smaller_than_work_area_is_normal() {
        assert!(!fills_work_area((1000, 650), (3440, 1392)));
        assert!(!fills_work_area((3440, 900), (3440, 1392)));
        assert!(!fills_work_area((2000, 1392), (3440, 1392)));
    }

    #[test]
    fn parse_accepts_valid_state() {
        let value = serde_json::json!({"x": 5, "y": 6, "width": 700, "height": 500, "maximized": true});
        assert_eq!(
            parse_window_state(value),
            Some(WindowState {
                x: 5,
                y: 6,
                width: 700,
                height: 500,
                maximized: true
            })
        );
    }

    #[test]
    fn parse_rejects_corrupt_state() {
        for value in [
            serde_json::json!("nope"),
            serde_json::json!({"x": 1}),
            serde_json::json!({"x": 1, "y": 1, "width": 0, "height": 500, "maximized": false}),
            serde_json::json!({"x": 1, "y": 1, "width": 500, "height": 0, "maximized": false}),
            serde_json::json!({"x": "a", "y": 1, "width": 500, "height": 500, "maximized": false}),
        ] {
            assert_eq!(parse_window_state(value.clone()), None, "{value}");
        }
    }
}
