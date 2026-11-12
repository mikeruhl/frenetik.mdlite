## ADDED Requirements

### Requirement: Copy as Markdown from the File menu

The system SHALL provide a **File → Copy as Markdown** menu item that writes the markdown source of the currently
displayed file to the system clipboard as plain text, byte for byte as displayed, including any frontmatter.

#### Scenario: Copy in single-file mode

- **WHEN** a file is open in single-file mode and the user selects **File → Copy as Markdown**
- **THEN** the clipboard contains the exact markdown source of that file as plain text

#### Scenario: Copy in folder mode

- **WHEN** a file from the navigation tree is displayed in folder mode and the user selects **File → Copy as
  Markdown**
- **THEN** the clipboard contains the markdown source of the displayed file, not of any other file

#### Scenario: Source follows live reload

- **WHEN** the displayed file changes on disk and the view reloads, then the user selects **File → Copy as
  Markdown**
- **THEN** the clipboard contains the reloaded source

#### Scenario: Frontmatter included

- **WHEN** the file begins with a YAML frontmatter block and the user copies as markdown
- **THEN** the clipboard text begins with that frontmatter block unchanged

### Requirement: Copy as Rich Text from the File menu

The system SHALL provide a **File → Copy as Rich Text** menu item that writes the rendered document to the system
clipboard as HTML with a plain text alternative, so that pasting into a rich text editor preserves formatting.

#### Scenario: Paste into a rich text editor

- **WHEN** the user selects **File → Copy as Rich Text** and pastes into Microsoft Word
- **THEN** headings, emphasis, lists, tables, links, blockquotes, and code blocks appear formatted

#### Scenario: Paste into a plain text target

- **WHEN** the user selects **File → Copy as Rich Text** and pastes into a plain text editor
- **THEN** the pasted text is the readable text of the document, without HTML tags

#### Scenario: Theme independence

- **WHEN** the active theme is any of the 11 bundled themes and the user copies as rich text
- **THEN** the HTML carries the same fixed light styling regardless of theme and does not rely on theme CSS
  variables or stylesheets

#### Scenario: Output is sanitized

- **WHEN** the document contains HTML that the renderer would sanitize
- **THEN** the copied HTML contains no scripts, event handlers, or other content removed by sanitization

### Requirement: Rich text excludes interface chrome and keeps content

The rich text output SHALL contain document content only. It SHALL omit code block copy buttons, search highlight
marks, interactive mode controls, and other non-content interface elements. Diagram and chart blocks SHALL be
embedded as raster images. Images that cannot travel with the clipboard SHALL be replaced by their alt text.

#### Scenario: Code block copy button omitted

- **WHEN** the document has a fenced code block and the user copies as rich text
- **THEN** the HTML contains the code with syntax coloring and no copy button

#### Scenario: Search highlights omitted

- **WHEN** search highlights are visible and the user copies as rich text
- **THEN** the HTML does not contain highlight markup

#### Scenario: Diagram embedded as image

- **WHEN** the document contains a rendered mermaid diagram and the user copies as rich text
- **THEN** the HTML contains an image for the diagram and no inline SVG

#### Scenario: Diagram failure degrades one block

- **WHEN** rasterizing one diagram fails
- **THEN** that diagram is replaced by its source text and the rest of the document is copied normally

#### Scenario: Local image not embeddable

- **WHEN** the document references a local image that cannot be embedded within the size cap
- **THEN** the HTML contains the image's alt text in its place and no `file:` or app-internal URL

#### Scenario: Blocked remote image

- **WHEN** a remote image is shown as a blocked placeholder
- **THEN** the HTML contains the image's alt text in its place

### Requirement: Copy items are unavailable when no file is displayed

The **Copy as Markdown** and **Copy as Rich Text** menu items SHALL be disabled whenever **Copy File Path** is
disabled, and neither action SHALL change the clipboard when no file is displayed.

#### Scenario: Welcome screen

- **WHEN** the app shows the welcome screen
- **THEN** both items are disabled

#### Scenario: Folder mode with no file selected

- **WHEN** a folder is open and no file is displayed
- **THEN** both items are disabled

#### Scenario: Startup error

- **WHEN** the app shows a startup error
- **THEN** both items are disabled

#### Scenario: Enablement updates on file open

- **WHEN** the app transitions from no file to a displayed file
- **THEN** both items become enabled

### Requirement: Menu placement

Both items SHALL appear in the **File** menu in the same group as **Copy File Path**, adjacent to it.

#### Scenario: Items grouped

- **WHEN** the user opens the File menu
- **THEN** Copy File Path, Copy as Markdown, and Copy as Rich Text appear together between the same separators

### Requirement: User feedback on document copy

After a successful copy the system SHALL show the existing brief, non-blocking toast stating what was copied
("Markdown copied" or "Rich text copied"). If the clipboard write fails, the system SHALL show an error using the
existing alert pattern and SHALL NOT show the success toast. If rich text omitted content (images over the size
cap, diagrams that failed), the toast SHALL say so.

#### Scenario: Markdown success

- **WHEN** Copy as Markdown succeeds
- **THEN** a "Markdown copied" toast appears and disappears automatically without moving focus

#### Scenario: Rich text success

- **WHEN** Copy as Rich Text succeeds with nothing omitted
- **THEN** a "Rich text copied" toast appears and disappears automatically without moving focus

#### Scenario: Content omitted

- **WHEN** Copy as Rich Text succeeds but one or more images or diagrams were replaced by text
- **THEN** the toast indicates that some content was replaced

#### Scenario: Clipboard failure

- **WHEN** the clipboard write fails for either action
- **THEN** an alert reports that the content could not be copied and no success toast is shown

### Requirement: Selection copy is unchanged

The system SHALL NOT alter the clipboard behavior of selecting rendered text and copying it with the standard copy
command.

#### Scenario: Standard copy of a selection

- **WHEN** the user selects text in the rendered content and presses the platform copy shortcut
- **THEN** the clipboard receives the selection exactly as before this change
