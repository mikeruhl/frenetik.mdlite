## ADDED Requirements

### Requirement: Live Blocks run only with consent

The system SHALL display an unrun Live Block as its source with a **Run** control, SHALL run it only after the reader
activates **Run**, and SHALL remember consent for that Document path until the Document's content changes.

#### Scenario: First open

- **WHEN** a Document containing an `html-live` block is opened for the first time
- **THEN** the block's source and a Run control are shown and no script executes

#### Scenario: Reopen unchanged

- **WHEN** the reader ran the Document's Live Blocks, closes the Document, and reopens it unchanged
- **THEN** its Live Blocks run without asking again

#### Scenario: Content changed

- **WHEN** a consented Document's content changes on disk
- **THEN** its Live Blocks revert to showing source and a Run control

### Requirement: Live Blocks are isolated from mdlite

A running Live Block SHALL NOT be able to invoke any mdlite command, read or alter the main document, navigate the main
window, open windows, submit forms, or make network requests.

#### Scenario: Command invocation attempt

- **WHEN** a Live Block calls the Tauri invoke bridge for any registered command
- **THEN** the call fails or never completes, and no command handler executes

#### Scenario: Parent access attempt

- **WHEN** a Live Block reads `window.parent.document`
- **THEN** access is denied

#### Scenario: Network attempt

- **WHEN** a Live Block calls `fetch("https://example.com")` or loads a remote image
- **THEN** the request is blocked

### Requirement: d3 is available in Live Blocks

The system SHALL provide the bundled d3 library as the global `d3` inside every Live Block, and no other library.

#### Scenario: d3 chart

- **WHEN** a Live Block script uses `d3.select` to draw an SVG
- **THEN** the SVG is displayed inside the block

### Requirement: Live Blocks follow the theme

The system SHALL expose the active theme's colors to Live Blocks as CSS custom properties and update them when the theme
changes.

#### Scenario: Theme variables

- **WHEN** a running Live Block styles text with the provided foreground variable and the reader switches theme
- **THEN** the text color updates to the new theme's foreground

### Requirement: Live Blocks in print and PDF

The system SHALL print a run Live Block as a snapshot of its rendered output, and an unrun Live Block as its source.

#### Scenario: Run block printed

- **WHEN** the reader prints a Document whose Live Block has run and produced output
- **THEN** the printed page shows a static image of that output

#### Scenario: Unrun block printed

- **WHEN** the reader prints a Document whose Live Block has not run
- **THEN** the printed page shows the block's source code
