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
pub(crate) enum Placement {
    At { x: i32, y: i32, width: u32, height: u32 },
    Centered { width: u32, height: u32 },
}

#[derive(Default)]
pub(crate) struct NormalBounds(Mutex<Option<WindowState>>);

pub(crate) fn parse_window_state(value: serde_json::Value) -> Option<WindowState> {
    serde_json::from_value::<WindowState>(value)
        .ok()
        .filter(|s| s.width > 0 && s.height > 0)
}

fn title_band_visible(state: &WindowState, width: u32, monitors: &[Area]) -> bool {
    let left = i64::from(state.x);
    let right = left + i64::from(width);
    let top = i64::from(state.y);
    monitors.iter().any(|m| {
        let overlap = right.min(i64::from(m.x) + i64::from(m.width)) - left.max(i64::from(m.x));
        overlap >= MIN_VISIBLE_WIDTH
            && top >= i64::from(m.y)
            && top + TITLE_BAND_HEIGHT <= i64::from(m.y) + i64::from(m.height)
    })
}

pub(crate) fn resolve_placement(
    state: &WindowState,
    monitors: &[Area],
    min: (u32, u32),
    frame: (u32, u32),
) -> Placement {
    let largest = monitors.iter().max_by_key(|m| u64::from(m.width) * u64::from(m.height));
    let width = largest
        .map_or(state.width, |m| state.width.min(m.width.saturating_sub(frame.0)))
        .max(min.0);
    let height = largest
        .map_or(state.height, |m| state.height.min(m.height.saturating_sub(frame.1)))
        .max(min.1);
    if title_band_visible(state, width, monitors) {
        Placement::At {
            x: state.x,
            y: state.y,
            width,
            height,
        }
    } else {
        Placement::Centered { width, height }
    }
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
    let monitors: Vec<Area> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let area = m.work_area();
            Area {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            }
        })
        .collect();
    let frame = match (window.outer_size(), window.inner_size()) {
        (Ok(outer), Ok(inner)) => (
            outer.width.saturating_sub(inner.width),
            outer.height.saturating_sub(inner.height),
        ),
        _ => (0, 0),
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let min = (
        (min_logical.0 * scale).round() as u32,
        (min_logical.1 * scale).round() as u32,
    );
    match resolve_placement(&state, &monitors, min, frame) {
        Placement::At { x, y, width, height } => {
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
        Placement::Centered { width, height } => {
            let _ = window.set_size(PhysicalSize::new(width, height));
            let _ = window.center();
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

    const MIN: (u32, u32) = (620, 300);
    const NO_FRAME: (u32, u32) = (0, 0);

    fn monitor(x: i32, y: i32, width: u32, height: u32) -> Area {
        Area { x, y, width, height }
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

    #[test]
    fn visible_position_is_kept() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(300, 200, 1000, 650), &monitors, MIN, NO_FRAME),
            Placement::At {
                x: 300,
                y: 200,
                width: 1000,
                height: 650
            }
        );
    }

    #[test]
    fn disconnected_monitor_falls_back_to_centered() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(2200, 100, 1000, 650), &monitors, MIN, NO_FRAME),
            Placement::Centered {
                width: 1000,
                height: 650
            }
        );
    }

    #[test]
    fn position_on_secondary_monitor_with_negative_origin_is_kept() {
        let monitors = [monitor(0, 0, 1920, 1080), monitor(-1280, 0, 1280, 1024)];
        assert_eq!(
            resolve_placement(&state(-1200, 100, 900, 600), &monitors, MIN, NO_FRAME),
            Placement::At {
                x: -1200,
                y: 100,
                width: 900,
                height: 600
            }
        );
    }

    #[test]
    fn mostly_off_screen_but_title_band_reachable_is_kept() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(1800, 300, 1000, 700), &monitors, MIN, NO_FRAME),
            Placement::At {
                x: 1800,
                y: 300,
                width: 1000,
                height: 700
            }
        );
    }

    #[test]
    fn title_band_with_too_little_overlap_falls_back() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert!(matches!(
            resolve_placement(&state(1850, 300, 1000, 700), &monitors, MIN, NO_FRAME),
            Placement::Centered { .. }
        ));
    }

    #[test]
    fn title_band_above_monitor_falls_back() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert!(matches!(
            resolve_placement(&state(100, -40, 1000, 700), &monitors, MIN, NO_FRAME),
            Placement::Centered { .. }
        ));
    }

    #[test]
    fn title_band_below_monitor_bottom_falls_back() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert!(matches!(
            resolve_placement(&state(100, 1050, 1000, 700), &monitors, MIN, NO_FRAME),
            Placement::Centered { .. }
        ));
    }

    #[test]
    fn size_is_clamped_to_largest_monitor() {
        let monitors = [monitor(0, 0, 1280, 720)];
        assert_eq!(
            resolve_placement(&state(0, 0, 3000, 2000), &monitors, MIN, NO_FRAME),
            Placement::At {
                x: 0,
                y: 0,
                width: 1280,
                height: 720
            }
        );
    }

    #[test]
    fn size_is_clamped_to_one_monitor_not_per_axis_maxima() {
        let monitors = [monitor(0, 0, 3440, 1440), monitor(3440, 0, 1080, 1920)];
        assert_eq!(
            resolve_placement(&state(0, 0, 4000, 3000), &monitors, MIN, NO_FRAME),
            Placement::At {
                x: 0,
                y: 0,
                width: 3440,
                height: 1440
            }
        );
    }

    #[test]
    fn frame_is_subtracted_so_the_outer_window_fits() {
        let monitors = [monitor(0, 0, 1280, 720)];
        assert_eq!(
            resolve_placement(&state(0, 0, 3000, 2000), &monitors, MIN, (16, 39)),
            Placement::At {
                x: 0,
                y: 0,
                width: 1264,
                height: 681
            }
        );
    }

    #[test]
    fn size_is_raised_to_minimum() {
        let monitors = [monitor(0, 0, 1920, 1080)];
        assert_eq!(
            resolve_placement(&state(10, 10, 200, 100), &monitors, MIN, NO_FRAME),
            Placement::At {
                x: 10,
                y: 10,
                width: 620,
                height: 300
            }
        );
    }

    #[test]
    fn no_monitors_centers_without_clamping() {
        assert_eq!(
            resolve_placement(&state(10, 10, 900, 600), &[], MIN, NO_FRAME),
            Placement::Centered {
                width: 900,
                height: 600
            }
        );
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
