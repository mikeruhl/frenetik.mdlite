## Why

Agents such as Claude Code present major, context-heavy decisions as terminal text, which is hard to read and
awkward to answer. mdlite already renders rich markdown from the command line; adding a way to collect answers
and return them to the calling process turns mdlite into a standalone, agent-agnostic "decision document"
surface: the agent writes the document and questions, the human reads and answers in a native window, and the
agent receives structured answers when the window exits.

## What Changes

- Add an `--interactive <questions.json>` CLI mode that opens a markdown document alongside agent-supplied
  questions defined in a separate, versioned JSON file.
- Define a versioned output contract (answers payload) mdlite emits on exit as a single JSON line on stdout, and
  optionally to a file via `--output`, plus documented exit codes for submitted, cancelled, and invalid input.
  Sessions have no timeout.
- Add a question/answer UI (choice, multi-choice, free text) with a Submit action, hosted in the left sidebar
  slot that is otherwise used only in folder mode.
- Let questions reference anchors in the document: click a question to jump to its section, click a badge in
  the document to jump to its question, and highlight the question for the section in view as the user scrolls.
- Register `mdlite` on the user `PATH` from the Windows installer, and document PATH setup for macOS and Linux,
  so agents invoke it by name.
- Closing the window without submitting exits with a "cancelled" result so the caller is never left guessing.
- Interactive sessions do not modify recent-files, jump lists, or other persisted user state.
- Ship an agent-neutral skill (Agent Skills format) at `plugins/mdlite/skills/mdlite-decision` that tells an agent
  when to use mdlite for a decision, how to author the document and questions, how to invoke mdlite without
  blocking, and how to read the result. The flow requires a shell tool that runs a command in the background and
  notifies the agent on exit.
- Distribute the skill as the `mdlite` Claude Code plugin through a marketplace manifest in this repository, and
  for other agents through the `skills` CLI or a manual copy of the skill folder.
- No changes to existing default (non-interactive) behavior.

## Non-goals

- Editing the markdown document inside mdlite.
- A long-lived server, socket, or MCP endpoint. Communication is strictly one invocation in, one result out.
- Multi-round conversation within a single session (the agent re-invokes mdlite for follow-ups).
- Rich form controls beyond the initial set (date pickers, file uploads, sliders, conditional questions).
- A detached-process fallback for agents whose shell tool cannot run a command in the background and notify on
  exit.
- Agent-specific integrations beyond the skill; the CLI contract stays agent-agnostic.

## Capabilities

### New Capabilities

- `interactive-mode`: CLI flag, input contract (questions), output contract (answers, exit codes), cancel
  semantics, validation, and the in-app question/answer UI.
- `question-anchors`: Two-way navigation between questions and anchored document sections, plus scroll sync.
- `agent-decision-skill`: Agent-neutral skill, packaged as a Claude Code marketplace plugin and installable in
  other agents, describing when and how an agent invokes mdlite interactive mode and consumes its result.
- `cli-path-registration`: Making the `mdlite` command resolvable from `PATH` after installation.

### Modified Capabilities

None. `folder-navigation` requirements are unaffected; interactive mode is file-mode only.

## Impact

- **Rust**: `lib.rs` (CLI parsing, setup branch, exit handling), new `interactive.rs` module (contract types,
  validation, result emission), `commands.rs` or the new module (new Tauri commands), `tauri.conf.json` (new CLI
  args). Release builds use the Windows GUI subsystem, which constrains stdout delivery (see design.md).
- **Frontend**: new `src/interactive.js` (form state) and `src/anchors.js` (anchor links, badges, scroll sync)
  modules, `index.html` panel markup, `styles.css` panel styling using
  existing theme variables; must render in all 11 bundled themes.
- **Installer**: new `src-tauri/windows/hooks.nsh` NSIS hooks, referenced from `tauri.conf.json`.
- **Dependencies**: none planned. `serde`/`serde_json` (already present) cover the contracts; DOMPurify and
  marked (already present) cover any markdown in question text.
- **Docs**: README usage section for `--interactive` and skill installation; new
  `plugins/mdlite/skills/mdlite-decision/SKILL.md`.
- **Packaging**: new `.claude-plugin/marketplace.json` and `plugins/mdlite/.claude-plugin/plugin.json`; OpenSpec
  development skills under `.claude/skills/` marked internal so the `skills` CLI offers only `mdlite-decision`.
- **Security**: question text is caller-supplied and must be sanitized; input file size and question counts are
  bounded.
