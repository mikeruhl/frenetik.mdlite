## ADDED Requirements

### Requirement: Interactive mode is opt-in via CLI flag

The system SHALL enter interactive mode only when invoked as
`mdlite <document> --interactive <questions> [--output <file>]`. Invocations without
`--interactive` SHALL behave exactly as before this change.

#### Scenario: Interactive invocation opens document with questions

- **WHEN** mdlite is started with a valid markdown file and a valid questions file via `--interactive`
- **THEN** the window shows the rendered document and the questions panel, titled
  `mdlite — <title> — awaiting answers`

#### Scenario: Default invocation unchanged

- **WHEN** mdlite is started with only a file or folder path
- **THEN** no questions panel is shown and closing the window exits with code 0 and no stdout output

#### Scenario: Folder passed as document

- **WHEN** `--interactive` is used and the document path is a directory
- **THEN** the system emits an `error` result and exits with code 1 without showing the window

### Requirement: Questions definition is validated before display

The system SHALL parse the questions definition as JSON schema version 1 and reject it before showing the window
when: the file exceeds 256 KB, `version` is not 1, there are zero or more than 50 questions, a question has more
than 50 options, a `single` or `multi` question has no options, an `id` or option `value` does not match
`^[A-Za-z0-9_-]{1,64}$`, ids or option values are duplicated within their scope, a `type` is not `single`,
`multi`, or `text`, a `default` references an unknown option, or an `anchor` does not match
`^[A-Za-z0-9_-]{1,64}$`.

#### Scenario: Valid definition accepted

- **WHEN** the questions file satisfies every constraint
- **THEN** the questions are displayed in file order with defaults preselected

#### Scenario: Invalid definition rejected

- **WHEN** the questions file contains a duplicate question id
- **THEN** the system emits an `error` result whose `error` names the offending id, writes the message to
  stderr, and exits with code 1

#### Scenario: Missing or unreadable questions file

- **WHEN** the questions path does not exist or is not valid JSON
- **THEN** the system emits an `error` result and exits with code 1

### Requirement: Questions panel renders supported controls

The system SHALL render `single` questions as radio groups, `multi` questions as checkbox groups, and `text`
questions as a single-line input or, when `multiline` is true, a textarea. When `allowOther` is true on a choice
question, the system SHALL show an "Other" free-text input. Prompts, labels, and placeholders SHALL be inserted as
plain text; `description` fields SHALL be rendered as markdown and sanitized with DOMPurify.

#### Scenario: Script in description is neutralized

- **WHEN** a question `description` contains `<img src=x onerror=alert(1)>`
- **THEN** the rendered panel contains no executable handler and no script runs

#### Scenario: Panel renders in every theme

- **WHEN** the user switches through all 11 bundled themes during an interactive session
- **THEN** panel text, controls, and buttons remain legible and use the active theme's colors

#### Scenario: Panel collapse

- **WHEN** the user clicks the panel collapse control
- **THEN** the document expands to full width and the panel can be restored without losing entered answers

### Requirement: Submit returns validated answers

The system SHALL enable Submit only when every `required` question has an answer. On Submit (button or
`Ctrl+Enter` / `Cmd+Enter`), the system SHALL re-validate answers against the definition in the backend, emit a
`submitted` result containing `answers` keyed by question id, and exit with code 0. Unanswered optional questions
SHALL be omitted from `answers`.

#### Scenario: Submit with all required answers

- **WHEN** the user answers all required questions and clicks Submit
- **THEN** stdout receives one line of JSON with `"version":1`, `"status":"submitted"`, the absolute document
  path, and the answers, and the process exits with code 0

#### Scenario: Required question unanswered

- **WHEN** a required question has no answer
- **THEN** Submit is disabled and the unanswered question is visibly marked

#### Scenario: Answer shapes by type

- **WHEN** the user picks option `redis` for a `single` question, options `a` and `b` plus Other text `c` for a
  `multi` question, and types `hello` in a `text` question
- **THEN** the answers are `{"value":"redis"}`, `{"values":["a","b"],"other":"c"}`, and `{"text":"hello"}`
  respectively

### Requirement: Every exit path produces exactly one result

The system SHALL emit exactly one result per interactive session. Closing the window, quitting via menu or
keyboard, or the process exiting for any handled reason before Submit SHALL emit a `cancelled` result and exit
with code 2. When answers have been entered, closing the window SHALL first ask the user to confirm discarding
them.

#### Scenario: Close without answering

- **WHEN** the user closes the window before entering any answer
- **THEN** a `{"version":1,"status":"cancelled"}` result is emitted and the process exits with code 2

#### Scenario: Close with unsaved answers

- **WHEN** the user has entered answers and closes the window
- **THEN** a confirmation dialog appears; confirming emits `cancelled` with exit code 2, declining keeps the
  window open with answers intact

#### Scenario: No duplicate result

- **WHEN** the user submits and the window then closes as part of shutdown
- **THEN** only the `submitted` result is emitted

### Requirement: Sessions do not time out

The system SHALL keep an interactive session open until the user submits or closes the window. There SHALL be no
timeout option and no `timed_out` status.

#### Scenario: Long idle session

- **WHEN** an interactive window is left idle for an extended period
- **THEN** it remains open with answers intact and no result is emitted until the user submits or closes it

### Requirement: Result delivered to stdout and optional file

The system SHALL write every result as a single JSON line to stdout and flush it before exiting. In interactive
mode, stdout SHALL contain nothing but that line; diagnostics SHALL go to stderr. `--output` is optional. When
`--output` is given, the system SHALL also write the same JSON to that path atomically (write to a sibling temporary file,
then rename) before writing stdout.

#### Scenario: Output file written atomically

- **WHEN** mdlite runs with `--output answers.json` and the user submits
- **THEN** `answers.json` contains the complete result and no partially written file is ever observable at
  that path

#### Scenario: Stdout only result without --output

- **WHEN** mdlite runs in interactive mode without `--output`, its stdout is piped, and the user submits
- **THEN** the captured stdout parses as exactly one JSON object and no file is written

#### Scenario: Output path not writable

- **WHEN** the `--output` directory does not exist
- **THEN** an `error` result is written to stdout, the message is written to stderr, and the process exits with
  code 1 before the window is shown

### Requirement: Interactive sessions do not alter persisted history

In interactive mode the system SHALL NOT add the document to recent files, recent folders, or OS jump lists. The
document file watcher SHALL remain active so external edits re-render live.

#### Scenario: Recent files untouched

- **WHEN** an interactive session for `decision.md` completes
- **THEN** `decision.md` does not appear in File → Open Recent on the next normal launch

#### Scenario: Document live reload

- **WHEN** the document is modified on disk during an interactive session
- **THEN** the rendered document updates and entered answers are preserved
