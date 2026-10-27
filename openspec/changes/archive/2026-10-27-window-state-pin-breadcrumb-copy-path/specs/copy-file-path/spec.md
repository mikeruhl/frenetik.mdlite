## ADDED Requirements

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
