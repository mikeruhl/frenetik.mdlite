## ADDED Requirements

### Requirement: Always on Top menu toggle

The system SHALL provide a checkable **View → Always on Top** menu item with the accelerator **Ctrl+Shift+T**
(Windows/Linux) or **Cmd+Shift+T** (macOS). Toggling it SHALL keep the main window above all other windows when
enabled and restore normal stacking when disabled. The menu check state SHALL always reflect the current state.

#### Scenario: Enable from menu

- **WHEN** the user selects **View → Always on Top** while it is unchecked
- **THEN** the main window stays above other application windows and the menu item is checked

#### Scenario: Disable from menu

- **WHEN** the user selects **View → Always on Top** while it is checked
- **THEN** the main window returns to normal stacking and the menu item is unchecked

#### Scenario: Keyboard shortcut

- **WHEN** the user presses Ctrl+Shift+T (Cmd+Shift+T on macOS)
- **THEN** the state toggles exactly as when the menu item is selected

#### Scenario: Menu rebuild keeps state

- **WHEN** the menu is rebuilt (for example after a theme change or opening a recent file)
- **THEN** the **Always on Top** item keeps the current checked state

### Requirement: Always on top persists across launches

The system SHALL store the always-on-top preference in the settings store and apply it when the main window is
created. The default SHALL be disabled.

#### Scenario: Restored on launch

- **WHEN** the user enables Always on Top, quits, and relaunches
- **THEN** the window starts above other windows and the menu item is checked

#### Scenario: Default

- **WHEN** the app is launched with no stored preference
- **THEN** Always on Top is disabled

### Requirement: Pin indicator while active

While always-on-top is enabled the system SHALL show a pin button in the main window with an accessible name and a
pressed state. Clicking it SHALL disable always-on-top. The indicator SHALL be hidden when the feature is
disabled and SHALL NOT take keyboard focus away from the content on state changes.

#### Scenario: Indicator visible when enabled

- **WHEN** Always on Top is enabled
- **THEN** the pin button is visible and exposes `aria-pressed="true"`

#### Scenario: Click to unpin

- **WHEN** the user clicks the pin button
- **THEN** always-on-top is disabled, the pin button is hidden, and the menu item is unchecked

#### Scenario: Indicator renders in every theme

- **WHEN** the pin button is shown under any of the 11 bundled themes
- **THEN** its icon and background are legible and use the active theme's colors

### Requirement: Shortcut documented on welcome screen

The welcome screen keyboard shortcut table SHALL list the Always on Top shortcut.

#### Scenario: Welcome table entry

- **WHEN** the welcome screen is shown
- **THEN** the shortcut table contains an "Always on top" row with Ctrl+Shift+T
