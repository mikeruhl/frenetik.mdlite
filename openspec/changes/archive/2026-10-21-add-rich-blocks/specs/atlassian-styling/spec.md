## ADDED Requirements

### Requirement: GitHub alerts render as Panels

The system SHALL render the five GitHub alert types as Panels with tones NOTE→info, TIP→success, IMPORTANT→note,
WARNING→warning, CAUTION→error, legible in all bundled themes.

#### Scenario: Warning panel

- **WHEN** a Document contains `> [!WARNING]` followed by text
- **THEN** the text renders inside a Panel with the warning tone

### Requirement: Status Lozenges

The system SHALL render `<mark data-status="TONE">TEXT</mark>` as a Status Lozenge when TONE is one of neutral, info,
success, warning, error, note, and SHALL drop any other `data-status` value.

#### Scenario: Success lozenge

- **WHEN** a Document contains `<mark data-status="success">DONE</mark>`
- **THEN** DONE renders as an inline success-toned Status Lozenge

#### Scenario: Unknown tone

- **WHEN** a Document contains `<mark data-status="evil">X</mark>`
- **THEN** X renders as a plain highlighted mark with no tone

### Requirement: Expands

The system SHALL render `<details><summary>` as a collapsible Expand styled consistently with Panels.

#### Scenario: Collapsed by default

- **WHEN** a Document contains `<details><summary>More</summary>Body</details>`
- **THEN** only "More" is visible until the reader expands it
