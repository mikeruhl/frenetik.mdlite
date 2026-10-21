## ADDED Requirements

### Requirement: Printed content is never scrolled or clipped

The system SHALL print tables and code blocks without scrollbars. A table wider than the page SHALL be limited to the
page width, with cell text wrapped so every column appears in the output.

#### Scenario: Wide table

- **WHEN** the reader prints or exports PDF of a Document containing a table wider than the page
- **THEN** the table fits the page width, every column is visible, and no scrollbar is shown

#### Scenario: Code block in Retro, Modest, or Splendor

- **WHEN** the reader prints a Document with a code block under the Retro, Modest, or Splendor theme
- **THEN** the code block prints with its lines wrapped and no scrollbar track
