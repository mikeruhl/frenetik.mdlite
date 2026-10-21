# print-readiness Specification

## Purpose

Ensures print and PDF export capture fully rendered Rich Blocks without delaying initial display.

## Requirements

### Requirement: Print and PDF wait for Rich Blocks

The system SHALL wait for every Rich Block in the current Document to finish rendering before starting print or PDF
export, up to a 10-second timeout.

#### Scenario: Print immediately after opening

- **WHEN** the reader opens a Document with Mermaid blocks and presses Ctrl+P before the diagrams have rendered
- **THEN** the print dialog opens only after all diagrams have rendered, and the printed output contains them

#### Scenario: PDF export waits

- **WHEN** the reader triggers PDF export while Rich Blocks are still rendering
- **THEN** the PDF is produced after rendering completes and contains the rendered blocks

#### Scenario: Timeout

- **WHEN** Rich Block rendering does not complete within 10 seconds of a print or export request
- **THEN** a toast states that diagrams may be incomplete and print or export proceeds

### Requirement: Initial display is not blocked

The system SHALL display the Document text before Rich Blocks finish rendering.

#### Scenario: Text visible first

- **WHEN** a Document with many Mermaid blocks is opened
- **THEN** its text is displayed without waiting for the diagrams

### Requirement: Printed content is never scrolled or clipped

The system SHALL print tables and code blocks without scrollbars. A table wider than the page SHALL be limited to the
page width, with cell text wrapped so every column appears in the output.

#### Scenario: Wide table

- **WHEN** the reader prints or exports PDF of a Document containing a table wider than the page
- **THEN** the table fits the page width, every column is visible, and no scrollbar is shown

#### Scenario: Code block in Retro, Modest, or Splendor

- **WHEN** the reader prints a Document with a code block under the Retro, Modest, or Splendor theme
- **THEN** the code block prints with its lines wrapped and no scrollbar track
