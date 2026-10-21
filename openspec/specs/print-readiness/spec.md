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
