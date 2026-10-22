## ADDED Requirements

### Requirement: Trusted in-folder navigation

In folder mode, the system SHALL open a clicked link whose target resolves to a markdown file inside the open
folder in the current window, without confirmation, adding the move to Back/Forward history.

#### Scenario: Relative link to a sibling folder

- **WHEN** folder `C:\repo\docs` is open, `guides\setup.md` is displayed, and the user clicks
  `[deploy](../services/deployment.md)`
- **THEN** `C:\repo\docs\services\deployment.md` is displayed, the sidebar highlights it, and Back returns to
  `guides\setup.md`

#### Scenario: Link with a fragment

- **WHEN** the user clicks an in-folder link `other.md#install`
- **THEN** `other.md` is displayed and scrolled to the `install` heading

#### Scenario: Hidden file inside the folder

- **WHEN** Show Hidden Files is off and the user clicks an in-folder link to `.github/CONTRIBUTING.md`
- **THEN** the file is displayed without confirmation, no sidebar row is highlighted, and a later folder rescan does
  not blank the view while the file still exists

#### Scenario: Target inside a collapsed folder

- **WHEN** the target's parent folder is collapsed in the sidebar
- **THEN** the parent folders expand and the target's row is scrolled into view and highlighted

#### Scenario: Escape through `..` or a symlink

- **WHEN** a relative link's path, or a symlink or junction along it, resolves outside the open folder
- **THEN** the link is treated as outside the folder and requires confirmation

### Requirement: Confirmation for links that leave the current view

The system SHALL show a confirmation dialog, displaying the full resolved destination, before following any link
that is not trusted in-folder navigation, a trusted domain, or `mailto`. Cancelling SHALL leave the app unchanged.

#### Scenario: Any file link in single-file mode

- **WHEN** a document is open in single-file mode and the user clicks a link to another markdown file
- **THEN** a dialog shows the resolved absolute path and nothing opens until the user chooses Open

#### Scenario: Cancel

- **WHEN** the dialog is open and the user presses Escape, clicks the overlay, or chooses Cancel
- **THEN** the dialog closes and nothing is opened

#### Scenario: Displayed destination is the real target

- **WHEN** the link text is `https://good.example` but the href is `https://evil.example`
- **THEN** the dialog shows `https://evil.example` with `evil.example` emphasized

### Requirement: Markdown outside the folder opens a new instance

The system SHALL open a confirmed link to a markdown file outside the open folder, or any confirmed markdown link
in single-file mode, in a new mdlite instance, leaving the current window unchanged.

#### Scenario: Outside link confirmed

- **WHEN** the user confirms a link to `C:\other\notes.md` while folder `C:\repo` is open
- **THEN** a new mdlite window shows `C:\other\notes.md` and the original window still shows its file and folder

### Requirement: Non-markdown files open only if their type is safe

The system SHALL open a confirmed link to an existing non-markdown file in the OS default application if its
extension is on the Safe File Types list, and SHALL otherwise be revealed in the OS file manager without being
opened. This applies inside and outside the open folder.

#### Scenario: Safe type

- **WHEN** the user confirms a link to `diagram.png` and `png` is a Safe File Type
- **THEN** the image opens in the default image viewer

#### Scenario: Executable

- **WHEN** the user confirms a link to `deploy.ps1`
- **THEN** the file manager opens with `deploy.ps1` selected and the script is not run

#### Scenario: Macro-enabled document

- **WHEN** the user confirms a link to `report.docm` and `docm` is not a Safe File Type
- **THEN** the file is revealed, not opened

### Requirement: Safe File Types is user-editable with a protected core

The system SHALL provide a **View → Safe File Types** submenu listing each extension with a remove item, an
**Add File Type…** item, and **Reset to Defaults**. Executable extensions SHALL NOT be addable.

#### Scenario: Defaults on first run

- **WHEN** the user has never edited Safe File Types
- **THEN** the list contains png, jpg, jpeg, gif, webp, bmp, svg, pdf, txt, csv, json, yaml, yml, log, mp3, wav,
  mp4, webm, mov, docx, xlsx, pptx

#### Scenario: Executable rejected

- **WHEN** the user tries to add `exe`, `.BAT`, or `ps1`
- **THEN** the list is unchanged and a notice explains that executable types cannot be opened directly

#### Scenario: Remove

- **WHEN** the user removes `pdf` and then confirms a link to `spec.pdf`
- **THEN** the file is revealed instead of opened

### Requirement: Trusted Domains

The confirmation dialog for `http` and `https` links SHALL offer "Always trust `<scheme>://<host>`". Links whose
scheme and host together match a Trusted Domains entry SHALL open in the system browser without the dialog. The system SHALL provide a **View →
Trusted Domains** submenu to remove entries.

#### Scenario: Trust a domain

- **WHEN** the user checks "Always trust https://docs.example.com" and chooses Open
- **THEN** the link opens in the browser, and later `https://docs.example.com` links open without the dialog

#### Scenario: Trust does not cross schemes

- **WHEN** `https://docs.example.com` is trusted and the user clicks `http://docs.example.com/page`
- **THEN** the dialog is shown with the not-encrypted warning

#### Scenario: Subdomains are not implied

- **WHEN** `https://example.com` is trusted and the user clicks a link to `https://api.example.com`
- **THEN** the dialog is shown

#### Scenario: Unencrypted link

- **WHEN** the user clicks an `http://` link to an untrusted host
- **THEN** the dialog states the link is not encrypted

### Requirement: Unsupported schemes are blocked

The system SHALL refuse links with any scheme other than `http`, `https`, `mailto`, and `file`, and SHALL show a
notice naming the blocked scheme. Such links SHALL NOT reach the WebView or the OS.

#### Scenario: Custom protocol handler

- **WHEN** the user clicks `ms-msdt:/id PCWDiagnostic` or `vscode://file/x`
- **THEN** nothing opens and a notice says the link type is not supported

#### Scenario: Script URL

- **WHEN** a link with a `javascript:` href survives into the rendered document and the user clicks it
- **THEN** nothing runs and a notice is shown

### Requirement: Missing targets

The system SHALL show, for a file link whose target does not exist, a "File not found" notice naming the resolved path, with no
dialog.

#### Scenario: Broken relative link

- **WHEN** the user clicks `../missing.md` and it does not exist
- **THEN** a notice reads "File not found:" followed by the resolved path

### Requirement: The WebView never navigates on link clicks

The system SHALL NOT navigate the app window away from the app when any link in rendered
content is clicked.

#### Scenario: Relative link in any mode

- **WHEN** the user clicks any non-fragment link in rendered content
- **THEN** the app page remains loaded and the outcome is one of: navigation within the folder, the dialog, an
  opened target, or a notice

#### Scenario: Context menu or drag bypasses the click handler

- **WHEN** the user chooses "Open link in new window" from the WebView context menu, or drags a link onto the window
- **THEN** no new window opens and the main window does not navigate away from the app

### Requirement: Network locations are not contacted before confirmation

The system SHALL NOT access a network location (a UNC path such as `\server\share\…`, including `file://server/…`)
while resolving a link, unless it is on the same share as the open document or folder. Such links SHALL show the
confirmation dialog identifying a network location, and the system SHALL access the path only after the user chooses
Open.

#### Scenario: Link to an unknown share

- **WHEN** the user clicks `\files.example\share\notes.md` while viewing a local document
- **THEN** a dialog titled "Open network location?" shows the path, and no connection to `files.example` is made
  until the user chooses Open

#### Scenario: Cancel never connects

- **WHEN** the user cancels that dialog
- **THEN** no connection to the network host is ever made

#### Scenario: Confirmed network document

- **WHEN** the user chooses Open and the target is a markdown file that exists
- **THEN** it opens in a new mdlite instance

#### Scenario: Confirmed network target missing

- **WHEN** the user chooses Open and the target does not exist or the host is unreachable
- **THEN** a notice reports that the file could not be opened, and the app stays responsive while waiting

#### Scenario: Same share as the open folder

- **WHEN** folder `\server\docs` is open and the user clicks a relative link to another markdown file in it
- **THEN** the link navigates in place without confirmation

### Requirement: Link resolution does not block the window

The system SHALL resolve and open links without blocking the user interface thread.

#### Scenario: Slow file system

- **WHEN** resolving a link takes several seconds (slow disk or confirmed share)
- **THEN** the window keeps repainting and responding to scrolling meanwhile
