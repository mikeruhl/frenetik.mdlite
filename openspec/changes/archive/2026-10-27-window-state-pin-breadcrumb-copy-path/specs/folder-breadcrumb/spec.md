## ADDED Requirements

### Requirement: Breadcrumb shows the open file's path in folder mode

In folder mode, when a file is displayed, the system SHALL show a breadcrumb bar above the content listing the
opened root folder, each intermediate folder, and the current file, in order. The final segment SHALL show a file
icon and the filename and SHALL NOT be clickable. The breadcrumb SHALL expose `nav` semantics with an accessible
name and mark the final segment with `aria-current="page"`.

#### Scenario: File in a nested folder

- **WHEN** the opened root is `docs` and the displayed file is `docs/guide/setup/install.md`
- **THEN** the breadcrumb shows `docs`, `guide`, `setup`, then `install.md` with a file icon

#### Scenario: File at the root

- **WHEN** the displayed file is directly inside the opened root
- **THEN** the breadcrumb shows the root name followed by the filename

#### Scenario: Path follows navigation

- **WHEN** the user switches files through the tree, a local link, or back and forward navigation
- **THEN** the breadcrumb updates to the newly displayed file

#### Scenario: Hidden outside folder mode

- **WHEN** the app is in single-file mode, interactive mode, or the welcome state
- **THEN** no breadcrumb bar is shown

#### Scenario: No file displayed

- **WHEN** folder mode is active and no file is displayed, or the displayed file was deleted
- **THEN** the breadcrumb bar is hidden

### Requirement: Folder segments reveal the folder in the tree

Each folder segment, including the root, SHALL be a keyboard-focusable button. Activating a folder segment SHALL
expand that folder and all of its ancestors in the navigation tree, show the sidebar if it is collapsed, and scroll
the folder into view. Activating the root segment SHALL scroll the tree to the top. Activation SHALL NOT change the
displayed file.

#### Scenario: Reveal a collapsed folder

- **WHEN** the user activates the `guide` segment while that folder is collapsed in the tree
- **THEN** `guide` and its ancestors are expanded and `guide` is scrolled into view

#### Scenario: Sidebar collapsed

- **WHEN** the sidebar is collapsed and the user activates a folder segment
- **THEN** the sidebar is shown and the folder is revealed

#### Scenario: Displayed file unchanged

- **WHEN** the user activates a folder segment
- **THEN** the same file remains displayed and the navigation history is unchanged

#### Scenario: Keyboard activation

- **WHEN** focus is on a folder segment and the user presses Enter or Space
- **THEN** the folder is revealed as with a click

### Requirement: Deep paths truncate middle segments

When the path has more than four segments, the breadcrumb SHALL show the root, an ellipsis marker, and the last
two segments (the parent folder and the filename). The ellipsis SHALL expose the omitted segment names as its
tooltip text. When the available width is still too small, the filename SHALL truncate with a trailing ellipsis
while the full name remains available as tooltip text.

#### Scenario: Six segment path

- **WHEN** the path is `root/a/b/c/d/file.md`
- **THEN** the breadcrumb shows `root`, an ellipsis, `d`, and `file.md`, and the ellipsis tooltip lists `a/b/c`

#### Scenario: Four or fewer segments

- **WHEN** the path has four or fewer segments
- **THEN** every segment is shown with no ellipsis

#### Scenario: Narrow window

- **WHEN** the window is narrower than the breadcrumb content
- **THEN** the bar does not cause horizontal page scroll and the filename truncates with a trailing ellipsis

### Requirement: Breadcrumb text is rendered safely

Folder and file names SHALL be rendered as plain text and SHALL NOT be interpreted as HTML.

#### Scenario: Name containing markup

- **WHEN** a folder is named `<img src=x onerror=alert(1)>`
- **THEN** the breadcrumb shows that literal text and no element is created from it

### Requirement: Breadcrumb renders in every theme

The breadcrumb bar, separators, buttons, hover state, and focus ring SHALL be legible under all 11 bundled themes
using the active theme's colors, and SHALL be excluded from printed output and PDF export.

#### Scenario: Theme switch

- **WHEN** the user switches between bundled themes
- **THEN** the breadcrumb text and focus ring stay legible against the bar background

#### Scenario: Printing

- **WHEN** the user prints or exports a document in folder mode
- **THEN** the breadcrumb bar does not appear in the output
