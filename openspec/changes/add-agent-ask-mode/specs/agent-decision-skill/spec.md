## ADDED Requirements

### Requirement: Skill ships in the repository

The repository SHALL contain an Agent Skills format skill at `plugins/mdlite/skills/mdlite-decision/SKILL.md` with
valid frontmatter (`name`, `description`), packaged as the `mdlite` Claude Code plugin
(`plugins/mdlite/.claude-plugin/plugin.json`) and listed in a marketplace manifest at
`.claude-plugin/marketplace.json`. The README SHALL document installation through the Claude Code marketplace,
through the `skills` CLI for other agents, and by manually copying the folders under `plugins/mdlite/skills/` into
an agent's skills directory.

#### Scenario: Installed through the Claude Code marketplace

- **WHEN** the user runs `/plugin marketplace add mikeruhl/frenetik.mdlite` and `/plugin install mdlite@mdlite`
- **THEN** `mdlite-decision` appears in the available skills list

#### Scenario: Installed for another agent

- **WHEN** the user runs `npx skills add mikeruhl/frenetik.mdlite` and selects `mdlite-decision`, or copies
  `plugins/mdlite/skills/mdlite-decision` into the agent's skills directory
- **THEN** the agent can discover and load `mdlite-decision`

#### Scenario: Internal skills are excluded while both public skills remain

- **WHEN** the `skills` CLI lists skills in the repository
- **THEN** the repository's internal OpenSpec development skills are not offered for installation, and
  `mdlite-decision` and `mdlite-preview` are offered

### Requirement: Skill is agent-neutral with a stated shell requirement

The skill SHALL avoid depending on a single agent's tool names, and SHALL state that its flow requires a shell tool
that runs a long-lived command in the background and notifies the agent when the command exits, naming the
Claude Code equivalent (Bash with `run_in_background`) as an example.

#### Scenario: Shell requirement stated

- **WHEN** an agent reads the skill
- **THEN** the skill states the background-execution and exit-notification requirement before the launch step

### Requirement: Skill defines when to use mdlite

The skill SHALL instruct the agent to use mdlite interactive mode for decisions that need substantial context
(comparison tables, diagrams, code samples, multiple options with tradeoffs) and to use ordinary chat or the
agent's built-in question tool for short questions.

#### Scenario: Trivial question

- **WHEN** the agent needs a yes/no answer with no supporting context
- **THEN** the skill guidance directs the agent not to launch mdlite

### Requirement: Skill defines invocation protocol

The skill SHALL instruct the agent to: invoke `mdlite` by command name from `PATH` without searching for the
binary; write the document, questions file, and output file into a new `mdlite/<slug>/` folder under the
session scratch directory, using the OS temp directory only when no scratch directory is available; follow
questions schema v1; write both files with the agent's file-write tool rather than the shell; launch mdlite with
`--output` in a separate background shell call so the agent is not blocked by tool timeouts; use one absolute
path form for every tool call (on Windows, a drive letter with forward slashes); and stop with a clear message to
the user if the command is not found.

#### Scenario: Binary not on PATH

- **WHEN** invoking `mdlite` fails with command not found
- **THEN** the agent reports that mdlite must be installed and on `PATH`, points to the README section, and does
  not search the filesystem for the binary

#### Scenario: Files placed in session scratch

- **WHEN** the agent prepares a decision and a session scratch directory is available
- **THEN** `decision.md`, `questions.json`, and `answers.json` are all created under
  `<scratch>/mdlite/<slug>/`

#### Scenario: Content would break a shell heredoc

- **WHEN** the document contains code blocks, delimiter-like lines, or other text that a shell heredoc could
  misparse
- **THEN** the agent writes the file with its file-write tool, so the content reaches disk unchanged and mdlite
  still launches

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
