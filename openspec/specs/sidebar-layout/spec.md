# sidebar-layout Specification

## Purpose

Define how the sidebar in folder mode and the interactive questions panel can be resized, collapsed, and restored.
Both modes share one layout module (`src/sidebar-layout.js`): the width is a `--sidebar-width` CSS custom property
rather than an inline style, so mode-specific rules don't fight inline-style specificity; the divider is a real
`separator` element, so it can take focus and carry ARIA values; and dragging uses pointer capture, so it keeps
tracking when the pointer leaves the window. Collapsing hides the sidebar completely instead of leaving an icon rail,
so the content gets the full window width. Layout is presentational, so it is saved in `localStorage` rather than the
Rust config. The interactive panel's collapsed state is not saved, because an agent is waiting on the answers and the
questions must be visible at launch.

## Requirements

### Requirement: Sidebar width is adjustable by dragging

While folder mode or an interactive session is open and the sidebar is expanded, the system SHALL provide a vertical
divider between the sidebar and the rendered content that the user can drag horizontally to change the sidebar width.
The width MUST stay between 150px and the lesser of 600px and 60% of the viewport width. The default width is 250px in
folder mode and 340px for the interactive questions panel.

#### Scenario: Drag widens the sidebar

- **WHEN** the user presses the divider and drags to the right
- **THEN** the sidebar width increases with the pointer and the rendered content narrows accordingly, up to the maximum
  width

#### Scenario: Drag narrows the sidebar

- **WHEN** the user presses the divider and drags to the left
- **THEN** the sidebar width decreases with the pointer, stopping at the minimum width

#### Scenario: Drag continues outside the window

- **WHEN** the user drags the divider and the pointer leaves the window before release
- **THEN** the resize continues to track the pointer and ends on release

#### Scenario: Double-click resets width

- **WHEN** the user double-clicks the divider
- **THEN** the sidebar width returns to the default for the current mode (250px in folder mode, 340px in interactive
  mode)

#### Scenario: Footer follows the sidebar edge

- **WHEN** the sidebar is resized or collapsed
- **THEN** the footer attribution bar starts at the sidebar's right edge, or at the window's left edge when collapsed

### Requirement: Divider is keyboard accessible

The divider SHALL be focusable, expose the `separator` role with its current width, and adjust the sidebar width from
the keyboard.

#### Scenario: Arrow keys resize

- **WHEN** the divider has focus and the user presses Left or Right arrow
- **THEN** the sidebar width decreases or increases by 16px, or by 64px when Shift is held, within the allowed range

#### Scenario: Home and End jump to limits

- **WHEN** the divider has focus and the user presses Home or End
- **THEN** the sidebar width becomes the minimum or maximum allowed width respectively

### Requirement: Sidebar can be collapsed and expanded

While folder mode or an interactive session is open, the system SHALL let the user collapse the sidebar so the rendered
content fills the full window width, and expand it again to the width it had before collapsing. Collapse and expand
SHALL be available from a button in the sidebar header, an expand control visible while collapsed, `Ctrl+B` (`Cmd+B` on
macOS), and a View menu item.

#### Scenario: Collapse via button

- **WHEN** the user activates the collapse button in the sidebar header
- **THEN** the sidebar and divider are hidden and the rendered content spans the full window width

#### Scenario: Expand restores prior width

- **WHEN** the sidebar is collapsed and the user activates the expand control or presses `Ctrl+B` / `Cmd+B`
- **THEN** the sidebar reappears at the width it had before it was collapsed

#### Scenario: Shortcut ignored without a sidebar

- **WHEN** neither folder mode nor an interactive session is open and the user presses `Ctrl+B` / `Cmd+B`
- **THEN** nothing changes

#### Scenario: Tree state preserved across collapse

- **WHEN** the user collapses and then expands the sidebar
- **THEN** expanded folders, the active file highlight, and the tree scroll position are unchanged

### Requirement: Sidebar layout persists across launches

The system SHALL persist the sidebar width in both modes, and the collapsed state in folder mode, and restore them on
the next launch. Width is stored separately for folder mode and interactive mode. The interactive panel MUST always open
expanded. If stored values are missing, unreadable, or out of range, the system MUST fall back to the default width,
expanded, after clamping.

#### Scenario: Width restored

- **WHEN** the user resizes the sidebar, quits, and relaunches in folder mode
- **THEN** the sidebar opens at the previously chosen width

#### Scenario: Collapsed state restored

- **WHEN** the user collapses the sidebar, quits, and relaunches in folder mode
- **THEN** the sidebar opens collapsed with the expand control visible

#### Scenario: Stored width exceeds current window

- **WHEN** the stored width is larger than the allowed maximum for the current window
- **THEN** the sidebar width is clamped to the allowed maximum

#### Scenario: Storage unavailable

- **WHEN** reading or writing stored layout fails
- **THEN** the sidebar uses the default width and expanded state and the application continues without error

### Requirement: Interactive questions panel uses the same layout controls

The interactive-mode questions panel SHALL use the same divider, collapse icon, full-collapse behavior, expand control,
and `Ctrl+B` / `Cmd+B` shortcut as the folder sidebar. The layout controls SHALL NOT appear in printed output.

#### Scenario: Panel is resizable

- **WHEN** an interactive session is open and the user drags the divider
- **THEN** the questions panel width changes within the allowed range and the width is restored in the next interactive
  session

#### Scenario: Panel collapses fully

- **WHEN** the user activates the collapse button in the questions panel header
- **THEN** the panel and divider are hidden, the document fills the window, and the expand control is visible

#### Scenario: Interactive panel opens expanded

- **WHEN** an interactive session starts after the panel was collapsed in a previous session
- **THEN** the panel opens expanded

#### Scenario: Jumping to a question expands the panel

- **WHEN** the panel is collapsed and the user activates a `Q1` badge in the document
- **THEN** the panel expands and the question is shown

#### Scenario: Print output

- **WHEN** the user prints a document in folder mode or interactive mode
- **THEN** the divider and expand control do not appear in the output

### Requirement: Layout controls render in all bundled themes

The divider, collapse button, and expand control SHALL be visible and legible in all 11 bundled themes, including
variants that use the dark sidebar styling, in both folder and interactive mode. The collapse and expand icons SHALL be
inline SVG that inherits the theme text color.

#### Scenario: Theme switch

- **WHEN** the user switches between bundled themes
- **THEN** the divider line, hover state, focus ring, and expand control remain visible against both the sidebar and
  content backgrounds
