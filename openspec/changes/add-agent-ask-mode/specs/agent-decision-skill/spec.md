## ADDED Requirements

### Requirement: Skill ships in the repository

The repository SHALL contain a Claude Code skill at `plugins/mdlite/skills/mdlite-decision/SKILL.md` with valid frontmatter
(`name`, `description`) and installation instructions in the README (copy the folder to `~/.claude/skills/`).

#### Scenario: Skill discovered after install

- **WHEN** the skill folder is copied to `~/.claude/skills/` and Claude Code starts
- **THEN** `mdlite-decision` appears in the available skills list

### Requirement: Skill defines when to use mdlite

The skill SHALL instruct the agent to use mdlite interactive mode for decisions that need substantial context
(comparison tables, diagrams, code samples, multiple options with tradeoffs) and to use ordinary chat or
`AskUserQuestion` for short questions.

#### Scenario: Trivial question

- **WHEN** the agent needs a yes/no answer with no supporting context
- **THEN** the skill guidance directs the agent not to launch mdlite

### Requirement: Skill defines invocation protocol

The skill SHALL instruct the agent to: invoke `mdlite` by command name from `PATH` without searching for the
binary; write the document, questions file, and output file into a new `mdlite/<slug>/` folder under the
session scratch directory, using the OS temp directory only when no scratch directory is available; follow
questions schema v1; launch mdlite with `--output` using background execution so the agent is not blocked by
tool timeouts; and stop with a clear message to the user if the command is not found.

#### Scenario: Binary not on PATH

- **WHEN** invoking `mdlite` fails with command not found
- **THEN** the agent reports that mdlite must be installed and on `PATH`, points to the README section, and does
  not search the filesystem for the binary

#### Scenario: Files placed in session scratch

- **WHEN** the agent prepares a decision and a session scratch directory is available
- **THEN** `decision.md`, `questions.json`, and `answers.json` are all created under
  `<scratch>/mdlite/<slug>/`

#### Scenario: Long-running decision

- **WHEN** the user takes longer than the agent's foreground tool timeout to answer
- **THEN** the agent still receives the result because mdlite was launched in the background

### Requirement: Skill defines anchor authoring

The skill SHALL instruct the agent to place an `<a id="..."></a>` marker immediately before each document section
a question relates to, set that question's `anchor` to the same id, and never reference an anchor id it has not
written into the document.

#### Scenario: Question tied to a section

- **WHEN** the agent writes a question about a section of the decision document
- **THEN** the document contains `<a id="X"></a>` before that section and the question has `"anchor": "X"`

### Requirement: Skill defines result handling

The skill SHALL instruct the agent to read the `--output` file (falling back to captured stdout), branch on
`status` (`submitted`, `cancelled`, `error`), act only on answers present in the payload, and treat a
missing or empty result with a non-zero exit code as `cancelled`.

#### Scenario: Cancelled decision

- **WHEN** the result status is `cancelled`
- **THEN** the agent does not proceed with any option and asks the user how to continue

#### Scenario: Submitted decision

- **WHEN** the result status is `submitted`
- **THEN** the agent restates the chosen answers to the user and proceeds accordingly
