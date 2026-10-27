# copy-file-path Specification

## Purpose

Let users copy the absolute path of the currently open file to the clipboard from the File menu or a keyboard
shortcut, in single-file and folder modes.

In folder mode, a right-click menu on navigation tree files and folders also copies the full or root-relative
path. It uses the native menu popup, which follows the OS appearance, closes on outside click, and needs no
per-theme styling. It is pointer-only because tree rows are not keyboard-focusable. Relative paths come from the
same Rust helper that feeds the folder breadcrumb.

## Requirements

### Requirement: Copy current file path from the File menu

The system SHALL provide a **File → Copy File Path** menu item that writes the absolute path of the currently
open markdown file to the system clipboard as plain text.

#### Scenario: Copy in single-file mode

- **WHEN** a file is open in single-file mode and the user selects **File → Copy File Path**
- **THEN** the clipboard contains the absolute path of that file

#### Scenario: Copy in folder mode

- **WHEN** a folder is open in folder mode, a file from the navigation tree is displayed, and the user selects
  **File → Copy File Path**
- **THEN** the clipboard contains the absolute path of the displayed file, not the folder path

#### Scenario: Path follows navigation

- **WHEN** the user opens file A, then switches to file B (via the navigation tree, Recent Files, or Open...),
  then selects **File → Copy File Path**
- **THEN** the clipboard contains the absolute path of file B

### Requirement: Copy current file path via keyboard shortcut

The system SHALL perform the same copy action when the user presses **Shift+Alt+C** (Windows/Linux) or
**Shift+Option+C** (macOS) while the main window has focus, and the menu item SHALL display this shortcut.

#### Scenario: Shortcut copies path

- **WHEN** a file is open and the user presses Shift+Alt+C with focus in the rendered content
- **THEN** the clipboard contains the absolute path of the open file

#### Scenario: Shortcut does not fire inside text inputs

- **WHEN** focus is in the search input or an interactive-mode text field and the user presses Shift+Alt+C
- **THEN** the copy action is not performed and the input receives the keystroke normally

### Requirement: Copied path uses normalized display form

The copied path SHALL be the same normalized form the app uses for display: native path separators, with any
Windows verbatim prefix removed (`\\?\C:\...` becomes `C:\...`; `\\?\UNC\server\share\...` becomes
`\\server\share\...`).

#### Scenario: Verbatim prefix stripped

- **WHEN** the open file's internal path is `\\?\C:\docs\readme.md` and the user copies the file path
- **THEN** the clipboard contains `C:\docs\readme.md`

#### Scenario: UNC path normalized

- **WHEN** the open file's internal path is `\\?\UNC\server\share\doc.md` and the user copies the file path
- **THEN** the clipboard contains `\\server\share\doc.md`

### Requirement: Copy is unavailable when no file is open

The **Copy File Path** menu item SHALL be disabled, and the shortcut SHALL do nothing and leave the clipboard
unchanged, whenever no file is open.

#### Scenario: Empty welcome state

- **WHEN** the app launched with no file or folder argument and shows the welcome screen
- **THEN** the **Copy File Path** menu item is disabled and pressing Shift+Alt+C leaves the clipboard unchanged

#### Scenario: Folder mode with no file selected

- **WHEN** a folder is open in folder mode and no file is displayed
- **THEN** the **Copy File Path** menu item is disabled

#### Scenario: Enablement updates on file open

- **WHEN** the app transitions from a no-file state to displaying a file (either mode)
- **THEN** the **Copy File Path** menu item becomes enabled

#### Scenario: Startup error

- **WHEN** the app shows a startup error because the requested file could not be opened
- **THEN** the **Copy File Path** menu item is disabled

### Requirement: User feedback on copy

After a successful copy the system SHALL show a brief, non-blocking confirmation in the main window that
disappears on its own without user action and is announced to assistive technology. If the clipboard write
fails, the system SHALL show an error using the existing alert pattern and SHALL NOT show the success
confirmation.

#### Scenario: Success confirmation

- **WHEN** the copy succeeds
- **THEN** a "Path copied" confirmation appears in the main window and disappears automatically within a few
  seconds, without moving focus

#### Scenario: Repeated copies

- **WHEN** the user copies the path several times in quick succession
- **THEN** a single confirmation is shown (restarting its timer), not a stack of confirmations

#### Scenario: Clipboard failure

- **WHEN** the clipboard write fails
- **THEN** an alert reports that the path could not be copied, and no success confirmation is shown

#### Scenario: Confirmation renders in every theme

- **WHEN** the confirmation is shown under any of the 11 bundled themes
- **THEN** its text is legible against its background and it uses the active theme's colors

### Requirement: Shortcut documented on welcome screen

The welcome screen keyboard shortcut table SHALL list the Copy File Path action and its shortcut.

#### Scenario: Welcome table entry

- **WHEN** the welcome screen is displayed
- **THEN** the keyboard shortcuts table contains a "Copy file path" row with "Shift+Alt+C"

### Requirement: Navigation tree context menu copies paths

The system SHALL open a context menu with **Copy Full Path** and **Copy Relative Path** when the user right-clicks
a file or folder row in the folder-mode navigation tree, instead of the default webview menu. Choosing an item SHALL
write the corresponding path to the system clipboard as plain text.

#### Scenario: Copy full path of a file

- **WHEN** the user right-clicks `guide/setup.md` in the tree and chooses **Copy Full Path**
- **THEN** the clipboard contains the absolute path of that file in the normalized display form

#### Scenario: Copy relative path of a file

- **WHEN** the opened root is `C:\docs` and the user right-clicks `C:\docs\guide\setup.md` and chooses **Copy
  Relative Path**
- **THEN** the clipboard contains `guide\setup.md`

#### Scenario: Copy path of a folder

- **WHEN** the user right-clicks a folder row and chooses **Copy Full Path** or **Copy Relative Path**
- **THEN** the clipboard contains that folder's absolute path or its path relative to the opened root

#### Scenario: Entry that is not the displayed file

- **WHEN** the user right-clicks a tree file other than the one displayed
- **THEN** the copied path is for the right-clicked entry, and the displayed file does not change

#### Scenario: Context menu not offered outside the tree

- **WHEN** the user right-clicks the rendered content or the sidebar background
- **THEN** no path context menu is shown

### Requirement: Relative path is relative to the opened root folder

The relative path SHALL be computed from the folder opened in folder mode, SHALL use the platform's native
separators, and SHALL NOT have a leading separator or `.` prefix. The copied absolute path SHALL follow the same
normalization rules as the existing File menu copy, including removal of Windows verbatim and UNC prefixes.

#### Scenario: Native separators

- **WHEN** a relative path is copied on Windows
- **THEN** it uses backslashes, and on macOS and Linux it uses forward slashes

#### Scenario: Verbatim prefix on root

- **WHEN** the opened root's internal path is `\\?\C:\docs` and the user copies the relative path of
  `\\?\C:\docs\a\b.md`
- **THEN** the clipboard contains `a\b.md`

#### Scenario: Entry outside the root

- **WHEN** a tree entry's path is not under the opened root (stale entry)
- **THEN** nothing is written to the clipboard and an error is shown through the existing alert pattern

### Requirement: Context menu copy gives the same feedback as menu copy

After a successful context menu copy the system SHALL show the same brief, non-blocking "Path copied"
confirmation. If the clipboard write fails, the system SHALL show an error using the existing alert pattern and
SHALL NOT show the confirmation.

#### Scenario: Success confirmation

- **WHEN** a context menu copy succeeds
- **THEN** a "Path copied" confirmation appears and disappears automatically without moving focus

#### Scenario: Clipboard failure

- **WHEN** the clipboard write fails
- **THEN** an alert reports that the path could not be copied and no confirmation is shown
