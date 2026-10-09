## Context

mdlite is a Tauri 2 viewer. `lib.rs::run()` parses one positional `path` argument via `tauri-plugin-cli`,
chooses `AppMode::{Empty, File, Folder}`, and builds the menu, watchers, and persisted state (recent files,
jump list). There is no single-instance plugin, so each invocation is an independent process, which suits a
one-shot request/response model. Release builds set `windows_subsystem = "windows"`, so the process has no
console of its own on Windows. The left `#sidebar` slot is used only in folder mode; the right `#toc-panel` slot
hosts the outline.

The caller is an agent that can write files, run a long-lived command in the background, be notified when it
exits, and read its output. Claude Code's Bash tool caps foreground commands at 10 minutes but supports
`run_in_background`, which re-invokes the agent when the process exits; other agents qualify if their shell tool
offers the same.

## Goals / Non-Goals

**Goals:**

- One invocation in, one structured result out, with a result guaranteed on every exit path.
- Agent-agnostic, versioned input and output contracts.
- The document stays primary; questions are visible without hiding it.
- Zero impact on default (non-interactive) behavior and persisted user state.

**Non-Goals:**

- See proposal Non-goals (no editing, no server/MCP, no multi-round, no advanced controls, no detached-process
  fallback for agents without background shell execution).
- Watching the questions definition for changes during a session.

## Decisions

D2, D3, and D5 were evaluated as options; the user confirmed the recommended option in each case.

### D1. Flag name and shape

`mdlite <document.md> --interactive <questions.json> [--output <answers.json>]`

- `--interactive` takes the questions source as its value, so "interactive" and "has questions" cannot diverge.
- Interactive mode requires a file path (not a folder). A folder or missing document is an input error.
- `--output` requires `--interactive`. Passing `--output` alone is an input error (stderr message, exit 1).
- Alternative considered: a bare `--interactive` boolean plus `--questions <file>`. Rejected: two flags that must
  always appear together.

### D2. Input transport (DECIDED: A)

| Option                      | Shape                                         | Pros                                                                                                                                   | Cons                                                                                            |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **A. Separate JSON file**   | `--interactive q.json`                        | Strict schema, trivial validation with existing `serde_json`, agents write it with a file tool, document stays clean for other viewers | Two files per decision                                                                          |
| B. Fenced block in document | ` ```mdlite-questions ` block in the `.md`    | Single file; questions sit next to the context they relate to; enables inline layout (D3-C)                                            | Document renders oddly elsewhere; parsing embedded in markdown pipeline; harder error reporting |
| C. Stdin                    | `cat q.json \| mdlite doc.md --interactive -` | No temp file                                                                                                                           | Unreliable with Windows GUI subsystem; awkward for agent tools; not re-runnable                 |
| D. CLI args                 | `--question "..." --option ...`               | No files                                                                                                                               | Quoting failures with long or multiline text; no descriptions                                   |

Decision: **A**, JSON (not YAML, which would add a dependency). The schema below is transport-neutral so B can
be added later by extracting the same object from a fenced block. The two-file cost is absorbed by the skill,
which writes both files into the agent's session scratch directory (D8).

Questions schema v1:

```json
{
  "version": 1,
  "title": "Choose a caching strategy",
  "submitLabel": "Submit",
  "questions": [
    {
      "id": "strategy",
      "type": "single",
      "prompt": "Which strategy should we use?",
      "description": "Optional **markdown** shown under the prompt.",
      "required": true,
      "allowOther": true,
      "default": "redis",
      "anchor": "caching-options",
      "options": [
        { "value": "redis", "label": "Redis", "description": "Optional markdown." },
        { "value": "memory", "label": "In-process LRU" }
      ]
    },
    {
      "id": "risks",
      "type": "multi",
      "prompt": "Which risks matter?",
      "options": [{ "value": "cost", "label": "Cost" }]
    },
    { "id": "notes", "type": "text", "prompt": "Anything else?", "multiline": true, "placeholder": "..." }
  ]
}
```

- Types: `single` (radio), `multi` (checkbox), `text` (input or textarea).
- `anchor` (optional) names an element `id` in the rendered document and matches `^[A-Za-z0-9_-]{1,64}$`;
  see D10.
- Limits: file at most 256 KB; at most 50 questions; at most 50 options per question; `id` and option `value`
  match `^[A-Za-z0-9_-]{1,64}$` and are unique within their scope; `version` must equal 1.
- Rust is the validation authority. Validation runs in `setup` before the window is shown; failure produces an
  error result (D4) and exit code 1.

### D3. UI layout (DECIDED: A)

| Option                                                 | Pros                                                                                                                          | Cons                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **A. Left docked panel (reuse `#sidebar` slot)**       | Questions always visible while reading; slot is idle in file mode; outline stays on the right; matches existing panel styling | Narrows the document; default window must widen              |
| B. Bottom sheet                                        | Full-width document                                                                                                           | Competes for vertical space; long forms need inner scrolling |
| C. Inline at end of document (or at anchors with D2-B) | Natural reading order; no new layout                                                                                          | Questions scroll out of view; Submit far from context        |
| D. Modal/wizard after reading                          | Focused answering                                                                                                             | Hides the document while answering                           |

Decision: **A**. Details:

- Panel header shows `title`; scrollable body lists questions; sticky footer holds Submit (primary) and Cancel.
- Window opens at 1200x800 logical px and is focused. Title: `mdlite — <title> — awaiting answers`.
- Panel is collapsible (button in header) so a narrow window can show the document full width.
- Controls are native `<input>`/`<textarea>` elements styled with the same CSS variables the sidebar and outline
  already use, so all 11 themes apply without per-theme CSS.
- Prompts and labels use `textContent`. `description` fields go through the existing marked + DOMPurify path.
- Submit is disabled until required questions are answered; unanswered required questions are marked inline.
- `Ctrl+Enter` (Windows/Linux) / `Cmd+Enter` (macOS) submits. `Escape` does nothing, to avoid accidental cancel.

### D4. Output contract

Answers payload v1 (single JSON object, one line on stdout):

```json
{
  "version": 1,
  "status": "submitted",
  "document": "C:\\path\\to\\doc.md",
  "answers": {
    "strategy": { "value": "redis" },
    "risks": { "values": ["latency"], "other": "cold start" },
    "notes": { "text": "Ship behind a flag." }
  }
}
```

- `single`: `{ "value": "<option value>" }` or `{ "other": "<text>" }`.
- `multi`: `{ "values": [...] }`, plus `"other"` when `allowOther` text was entered.
- `text`: `{ "text": "..." }`.
- Unanswered optional questions are omitted.

| Status      | Exit code | Body                                                  |
| ----------- | --------- | ----------------------------------------------------- |
| `submitted` | 0         | `answers` present                                     |
| `error`     | 1         | `error` message; invalid args, document, or questions |
| `cancelled` | 2         | no `answers`                                          |

No timeout. The session lasts until the user submits or closes the window. The agent is not blocked because the
skill runs mdlite in the background, and unattended use is out of scope for an interactive window.

Answers are re-validated in Rust against the questions definition before `submitted` is emitted.

### D5. Output channel (DECIDED: stdout always, `--output` optional)

| Option               | Pros                                               | Cons                                                                                                                                                                      |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdout only          | No temp file                                       | Windows GUI-subsystem process writes nowhere unless the parent supplied redirected handles; an interactive `cmd`/PowerShell user sees nothing and the shell does not wait |
| `--output` file only | Works on every platform and launch style           | Caller must pick a path                                                                                                                                                   |
| **Both**             | Pipes work out of the box; file is the robust path | Two sinks to keep consistent                                                                                                                                              |

Decision: **always write stdout; additionally write `--output` when given**. Stdout carries only the result JSON
line (diagnostics go to stderr), so a caller can parse it without filtering. The file is written to a sibling
temp file and renamed so readers never see a partial result. The skill passes `--output` into session scratch
as the robust path and falls back to stdout.

### D6. Exactly-one-result guarantee

A dedicated `interactive` module owns the session: the parsed questions, output path, and an atomic
"result emitted" flag. A single `emit_result(result)` function writes the sinks, flushes, and then calls
`AppHandle::exit(code)`. Every exit path routes through it:

- Submit command → `submitted`.
- Window `CloseRequested` and `RunEvent::ExitRequested` (Cmd+Q, menu quit) while not yet emitted → `cancelled`.
  This requires switching `run()` from `.run(ctx)` to `.build(ctx)?.run(|app, event| ...)`.
- Setup validation failure → `error`.

If answers are dirty, closing the window first shows a confirmation via the existing `tauri-plugin-dialog`
("Discard your answers?"). Declining keeps the window open.

### D7. Isolation from persisted state

In interactive mode, setup skips `store_add_recent`, recent-folder updates, `jumplist::notify_recent_doc`, and
`jumplist::update_jump_list`. Theme and zoom are still read; changing them still persists (user preference, not
session data). The document file watcher stays active so the agent may refine the document mid-session.

### D8. Agent skill

`plugins/mdlite/skills/mdlite-decision/SKILL.md` in the repo, in the open Agent Skills format. It instructs the
agent:

1. Use it for decisions with substantial context (tradeoff tables, diagrams, code); use plain chat or the agent's
   built-in question tool for quick questions.
2. Invoke `mdlite` by name from `PATH` (D9). No binary search. If the command is not found, stop and tell the
   user how to put mdlite on `PATH`.
3. Use a new `mdlite/<slug>/` folder under the session scratch directory. Use the OS temp directory only when no
   scratch directory is provided.
4. Write `decision.md` and `questions.json` with the agent's file-write tool, then run
   `mdlite decision.md --interactive questions.json --output answers.json` in a separate shell call. The flow
   requires a shell tool that runs a long-lived command in the background and notifies the agent on exit
   (Claude Code: Bash with `run_in_background: true`).
5. On completion, read `answers.json` (fall back to captured stdout), branch on `status`, and never assume an
   answer that is absent.

Files are written with the file-write tool rather than shell heredocs. Heredocs fail in ways that depend on the
content: a line equal to the delimiter truncates the file, an indented terminator copied from the skill never
closes, and long commands can fail the shell tool's parser before mdlite starts. Writing the files directly costs
two extra tool calls and removes all three. On Windows, one absolute path form with a drive letter and forward
slashes (`C:/...`) works in file tools, Git Bash, and mdlite.

Distribution:

- **Claude Code**: `.claude-plugin/marketplace.json` lists the `mdlite` plugin with source `./plugins/mdlite`;
  `plugins/mdlite/.claude-plugin/plugin.json` points at `./skills/`. Users run
  `/plugin marketplace add mikeruhl/frenetik.mdlite` and `/plugin install mdlite@mdlite`; updates arrive through
  the plugin manager. Keeping the plugin in its own folder means an install copies only the skill, not the repo.
- **Other agents**: `npx skills add mikeruhl/frenetik.mdlite` offers the plugin's skills and places the chosen ones
  in each detected agent's skills directory. The repository's OpenSpec development skills are marked internal so
  the CLI offers only `mdlite-decision` and `mdlite-preview` (D11).
- **Manual**: copy the folders under `plugins/mdlite/skills/` into the agent's skills directory.

Alternative considered: a detached-process fallback for agents without background execution. Rejected for now;
the README states the background-shell requirement instead.

### D9. `mdlite` on PATH

Skills normally call outside tools (`gh`, `az`, `git`) by command name and assume `PATH`. Searching for the binary
on every invocation wastes agent tokens and is brittle, so mdlite takes responsibility for being on `PATH`:

- **Windows (NSIS)**: add `bundle.windows.nsis.installerHooks` pointing at `src-tauri/windows/hooks.nsh`. The
  post-install hook appends `$INSTDIR` to the per-user `Path` (HKCU\Environment) if absent and broadcasts
  `WM_SETTINGCHANGE`; the post-uninstall hook removes it. Per-user scope avoids an elevation prompt.
- **macOS (.dmg)**: the binary lives at `/Applications/mdlite.app/Contents/MacOS/mdlite`. README documents
  `sudo ln -sf /Applications/mdlite.app/Contents/MacOS/mdlite /usr/local/bin/mdlite`. An in-app "Install command
  line tool" menu item is deferred.
- **Linux (AppImage)**: README documents moving or symlinking the AppImage to `~/.local/bin/mdlite`.

Alternative considered: an `MDLITE_PATH` env var plus per-OS search in the skill. Rejected for token cost and
because it pushes install knowledge into every agent.

### D10. Question anchors and scroll sync

Links questions to the document sections they concern, in both directions.

- **Anchor target**: explicit elements only. The agent writes `<a id="caching-options"></a>` immediately before
  the relevant section and sets the question's `anchor` to that id. Heading ids are not used as targets:
  predicting the slug algorithm and handling duplicate headings is error-prone for agents. DOMPurify must keep
  `id` on these elements; a test confirms it.
- **Resolution in the frontend**: Rust validates only the id pattern, since it never sees the rendered DOM.
  After every render (initial and live reload), `interactive.js` resolves each anchor with
  `getElementById` scoped to `#content`. Unresolved anchors log a console warning and that question shows no
  link; submit is unaffected.
- **Question → document**: an anchored question shows a "show in document" icon button. Clicking it calls
  `scrollIntoView({ behavior: "smooth" })` on the anchor, matching outline behavior, and briefly highlights the
  following block.
- **Document → question**: each resolved anchor gets an inline badge (`Q2`, or `Q2 Q5` when several questions
  share an anchor) inserted as a sibling element after the anchor. Clicking a badge scrolls the panel to that
  question, highlights it, and focuses its first control. Badges are UI chrome: excluded from search matches,
  print, and PDF export.
- **Scroll sync**: a rAF-throttled scroll listener on the document scroll container picks the section being
  read: the last anchor above a reading line at 20% of the viewport; at the end of the document, the last
  visible anchor; before any anchor reaches the line, the first visible anchor. Its questions are marked active
  and the first is scrolled into view within the panel (`block: "nearest"`), skipped while the user is typing in
  the panel. Sync never moves the document and never changes focus. An `IntersectionObserver` with a top band
  (the `toc.js` pattern) was tried first and rejected: anchors in the last screenful of a short document never
  reach the band, so their questions never became active.
- **Responsibility split**: anchor resolution, badges, and scroll sync live in a separate `src/anchors.js`
  module so `interactive.js` keeps form state only.

### D11. Preview skill

A second skill, `mdlite-preview`, ships in the same plugin. It tells the agent to open markdown it writes for the
user to read (reports, plans, reviews) in mdlite, in the background, instead of only printing the path. It is a
separate skill because a skill loads when its description matches the situation, and "just wrote a markdown file"
is a different trigger from "major decision".

Gating:

- **Opt-in** is installing the plugin. **Opt-out** is a line in the agent's instructions file (`CLAUDE.md`); no
  config file or environment variable.
- **Which files** is the agent's judgment: new files written for the user, not maintained repository docs. Each
  file or folder opens once per session; live reload covers later edits.
- **Missing binary**: no pre-check. The first exit 127 is reported once and auto-opening stops for the session.

mdlite has no single-instance handling, so every launch is a new window. Several temporary files are therefore
written into one `<scratch>/mdlite/<slug>/` folder and opened once in folder view.

Alternative considered: a Claude Code `PostToolUse` hook on markdown writes. Rejected: Claude Code only, cannot
tell a report from a `README.md` edit, and needs per-session state to avoid reopening and repeated failures.

## Risks / Trade-offs

- [Windows stdout is silent when not piped] → `--output` file sink; skill always uses it; README documents it.
- [Process killed externally leaves no result] → Caller treats a missing or empty result with a non-zero exit as
  cancelled; documented in skill.
- [User walks away, agent waits indefinitely] → skill uses background execution so the
  agent is not blocked.
- [Malicious or oversized questions file] → size and count limits, strict id patterns, DOMPurify on markdown,
  `textContent` elsewhere.
- [Shared modules regress (`lib.rs`, `main.js`)] → interactive logic isolated in new modules; default path
  changes limited to a mode branch; regression checks in tasks.
- [Window too narrow with panel plus outline] → collapsible panel; min width unchanged.
- [PATH edits by the installer can corrupt a long user Path] → read-modify-write of the HKCU value only, skip if
  already present, never touch the system Path; uninstall removes only the exact entry.
- [Agent references an anchor id it never wrote] → link silently omitted with a console warning; the skill
  instructs agents to write the `<a id>` marker for every anchor they reference.
- [Scroll sync jitter when sections are short] → only the topmost visible anchor is active, and panel scrolling
  uses `block: "nearest"` so it moves only when the active question is off screen.
- [Already-open terminals do not see the new PATH] → README notes restarting the terminal or agent session.

## Migration Plan

Additive. No config or store migration. Rollback is reverting the PR; existing invocations are unaffected.

## Open Questions

None. Resolved: input transport (D2-A), layout (D3-A), output channel (D5), no timeout (D4), PATH strategy (D9),
skill distribution (Claude Code marketplace plugin, `skills` CLI, manual copy, D8), anchors with explicit ids
and scroll sync (D10), preview skill gating (D11).
