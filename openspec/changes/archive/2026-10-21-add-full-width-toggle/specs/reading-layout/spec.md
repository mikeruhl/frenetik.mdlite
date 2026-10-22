## ADDED Requirements

### Requirement: Full Width setting

The system SHALL provide a Full Width setting, off by default, exposed as a check item in the View menu. When on, the
Document content SHALL have no maximum width and SHALL fill the window apart from a horizontal margin of at least 2rem
on each side, or the active theme's padding where that is larger. When off, the Document content SHALL use the active theme's maximum width.

#### Scenario: Enable Full Width

- **WHEN** the reader selects View > Full Width while it is off
- **THEN** the Document content expands to the window width with at least a 2rem margin on each side, and the menu item
  shows a check mark

#### Scenario: Theme with no side padding

- **WHEN** Full Width is on under the Air theme, which has no side padding of its own
- **THEN** the Document text stays at least 2rem from each window edge

#### Scenario: Disable Full Width

- **WHEN** the reader selects View > Full Width while it is on
- **THEN** the Document content returns to the theme's maximum width and the check mark is removed

#### Scenario: Theme change keeps the setting

- **WHEN** Full Width is on and the reader switches theme
- **THEN** the Document content remains full width under the new theme

### Requirement: Full Width persists

The system SHALL persist the Full Width setting across restarts and apply it before the first Document render.

#### Scenario: Restart with Full Width on

- **WHEN** the reader enables Full Width, closes mdlite, and reopens it
- **THEN** the Document renders full width with no visible width change after first paint, and the menu item is
  checked

### Requirement: Print is unaffected by Full Width

The system SHALL produce identical print and PDF output regardless of the Full Width setting.

#### Scenario: Print with Full Width on

- **WHEN** Full Width is on and the reader prints or exports PDF
- **THEN** the output matches the output produced with Full Width off
