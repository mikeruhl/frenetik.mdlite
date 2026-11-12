## ADDED Requirements

### Requirement: Copy File Path shares its menu group with document copy items

The **Copy File Path** menu item SHALL remain in the File menu group that also holds **Copy as Markdown** and **Copy
as Rich Text**, and SHALL keep its label, shortcut, enablement, and feedback behavior unchanged.

#### Scenario: Copy File Path unchanged by grouping

- **WHEN** the user selects **File → Copy File Path** after the document copy items are added
- **THEN** the clipboard contains the absolute path of the displayed file and a "Path copied" toast appears
