# window-state-persistence Specification

## Purpose

Restore the main window's position, size, and maximized state across launches. Geometry is saved in the Rust
settings store rather than `localStorage` because it must be read before the window exists. It is written on close
only, in physical pixels, so display scaling cannot drift the result. Restore runs after the menu is attached,
because the menu bar takes client height and restoring the inner size earlier shrinks the window by the menu height
on every launch. Normal bounds are tracked in memory from move and resize events, and a frame that fills the
monitor's work area is ignored, because a moved event can arrive before the window reports itself maximized. A
saved position is applied only if its title bar is reachable on a connected monitor, and the size is clamped to the
largest work area minus the window frame. Saved geometry replaces the per-mode default sizes, which apply only
before the first save. A window-state plugin was rejected: it adds a dependency, saves on every move, and its
restore order conflicts with the mode-specific sizing.

## Requirements

### Requirement: Window geometry is saved on close

The system SHALL save the main window's position, size, and maximized state to the settings store when the main
window is closed. When the window is maximized, the saved position and size SHALL be the last non-maximized
bounds. When the window is minimized at close, the system SHALL keep the previously saved geometry unchanged.

#### Scenario: Normal window saved

- **WHEN** the user resizes and moves the window, then closes it
- **THEN** the stored geometry contains the window's final position and size and `maximized` is false

#### Scenario: Maximized window saved

- **WHEN** the user closes the window while it is maximized
- **THEN** the stored `maximized` is true and the stored position and size are the last non-maximized bounds

#### Scenario: Minimized window at close

- **WHEN** the user minimizes the window and closes it from the taskbar
- **THEN** the previously stored geometry is unchanged

### Requirement: Window geometry is restored on launch

The system SHALL restore the saved position, size, and maximized state when the main window is created, before the
window is shown. Sizes SHALL NOT be smaller than the window minimum size.

#### Scenario: Restore after restart

- **WHEN** the app is closed at position (300, 200) with size 1000x650 and then launched again
- **THEN** the window appears at that position with that size

#### Scenario: Restore maximized

- **WHEN** the app was closed maximized and is launched again
- **THEN** the window opens maximized, and un-maximizing returns it to the saved non-maximized bounds

#### Scenario: No saved geometry

- **WHEN** the app is launched with no stored geometry
- **THEN** the window opens at the default size for the current mode, placed by the operating system

#### Scenario: Corrupt stored geometry

- **WHEN** the stored geometry cannot be parsed or has non-positive dimensions
- **THEN** it is ignored and the window opens as if no geometry were saved

### Requirement: Saved position must be visible on a connected monitor

The system SHALL apply a saved position only if at least a 100x50 pixel region of the window's title bar band
intersects a currently connected monitor. Otherwise the system SHALL discard the saved position, keep the saved
size clamped to the largest connected monitor, and center the window on the primary monitor.

#### Scenario: Monitor disconnected

- **WHEN** the window was last closed on a secondary monitor that is no longer connected
- **THEN** the window opens centered on the primary monitor and is fully reachable

#### Scenario: Resolution reduced

- **WHEN** the saved size is larger than the current largest monitor
- **THEN** the window opens clamped to fit that monitor

#### Scenario: Partially off screen but reachable

- **WHEN** the saved position leaves most of the window off screen but the title bar band still overlaps a monitor
  by at least 100x50 pixels
- **THEN** the saved position is applied unchanged

### Requirement: Geometry uses physical pixels

The system SHALL store and compare window position and size in physical pixels so restoring is independent of
display scale factor.

#### Scenario: Scaled display

- **WHEN** the app is closed on a 150 percent scaled display and relaunched on the same display
- **THEN** the window occupies the same physical rectangle

### Requirement: Saved geometry overrides mode default sizes

When saved geometry exists, the system SHALL NOT apply the folder-mode (1100x700) or interactive-mode (1200x800)
default sizes, including when the user switches from file mode to folder mode at runtime. When no saved geometry
exists, those defaults SHALL apply as before.

#### Scenario: Folder opened with saved geometry

- **WHEN** geometry has been saved and the user launches mdlite with a folder argument
- **THEN** the window opens at the saved size, not 1100x700

#### Scenario: Interactive session with saved geometry

- **WHEN** geometry has been saved and an interactive session starts
- **THEN** the window opens at the saved size, not 1200x800

#### Scenario: First run in folder mode

- **WHEN** no geometry has been saved and the user opens a folder
- **THEN** the window is sized 1100x700
