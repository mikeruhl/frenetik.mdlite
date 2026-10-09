## ADDED Requirements

### Requirement: Anchors resolve against explicit document ids

The system SHALL resolve a question's optional `anchor` to the element in the rendered document whose `id` equals
the anchor value, searching only within the document content. Rendered markdown SHALL preserve `id` attributes on
`<a>` elements through sanitization. Resolution SHALL run after the initial render and after every live-reload
re-render.

#### Scenario: Anchor present in document

- **WHEN** a question has `"anchor": "caching-options"` and the document contains `<a id="caching-options"></a>`
- **THEN** the question shows a "show in document" control and the document shows a badge for that question

#### Scenario: Anchor missing from document

- **WHEN** a question's anchor id does not exist in the rendered document
- **THEN** the question shows no "show in document" control, a warning is logged to the console, and Submit
  behaves normally

#### Scenario: Anchor added by live reload

- **WHEN** the document is edited on disk to add a previously missing anchor
- **THEN** after re-render the question gains its link and badge, and entered answers are preserved

### Requirement: Question to document navigation

The system SHALL scroll the document to a question's resolved anchor with smooth scrolling when the user activates
that question's "show in document" control, and SHALL briefly highlight the target section.

#### Scenario: Jump to section

- **WHEN** the user clicks "show in document" on an anchored question
- **THEN** the document scrolls so the anchor is in view and the section is highlighted briefly

### Requirement: Document to question navigation

The system SHALL render a badge after each resolved anchor listing the numbers of the questions that reference
it. Activating a badge entry SHALL scroll the questions panel to that question, highlight it, and focus its
first control. Badges SHALL be excluded from search matches, printing, and PDF export.

#### Scenario: Jump to question

- **WHEN** the user clicks the `Q2` badge in the document
- **THEN** the panel scrolls to question 2, highlights it, and focuses its first control

#### Scenario: Shared anchor

- **WHEN** questions 2 and 5 reference the same anchor
- **THEN** one badge shows `Q2` and `Q5` as separate clickable entries

#### Scenario: Badges absent from print

- **WHEN** the user prints or exports the document to PDF during an interactive session
- **THEN** no question badges appear in the output

### Requirement: Scroll sync highlights the question in view

While the user scrolls the document, the system SHALL mark as active the questions of the section being read:
the last resolved anchor above a reading line at 20% of the viewport height; at the end of the document, the last
visible anchor; before any anchor reaches the line, the first visible anchor. The system SHALL scroll the panel
only as needed to keep the active question visible, and not while the user is typing in the panel. Scroll sync
SHALL NOT scroll the document, change focus, or alter answers.

#### Scenario: Last section of a short document

- **WHEN** the user scrolls to the end of a document whose final anchored section cannot reach the reading line
- **THEN** the question for that final section becomes active

#### Scenario: Reading through sections

- **WHEN** the user scrolls the document from the section anchored to question 1 into the section anchored to
  question 3
- **THEN** question 3 becomes the active question in the panel and question 1 is no longer active

#### Scenario: Typing is not interrupted

- **WHEN** the user is typing in a text question and the document scrolls such that another question becomes
  active
- **THEN** focus and caret position remain in the text question being edited

#### Scenario: No anchors

- **WHEN** no question has a resolved anchor
- **THEN** no question is marked active and no badges are rendered
