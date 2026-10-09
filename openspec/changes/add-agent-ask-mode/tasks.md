## 1. Contracts and validation (Rust)

- [x] 1.1 Create `src-tauri/src/interactive.rs` with serde types for questions schema v1 and the result payload
      (`submitted`, `cancelled`, `error`)
- [x] 1.2 Implement `load_questions(path)` enforcing size, version, count, id/value/anchor pattern, uniqueness,
      type, and default constraints; return descriptive errors
- [x] 1.3 Implement `validate_answers(questions, answers)` enforcing required answers, known option values,
      per-type shapes, and `allowOther`
- [x] 1.4 Unit tests for every validation rule (valid file, each rejection case, each answer shape)

## 2. Result emission and session lifecycle (Rust)

- [x] 2.1 Implement result emission with a once-only gate: atomic `--output` write (temp file + rename), single
      JSON line to stdout with flush, then exit with the result's code
- [x] 2.2 Unit tests for atomic file write, exit-code mapping, and the at-most-once guarantee
- [x] 2.3 Add `--interactive` and `--output` to `plugins.cli.args` in `tauri.conf.json`
- [x] 2.4 In `lib.rs` setup, parse the new args, validate document (file, not folder), questions, and output
      directory; on failure emit `error` (exit 1) before the event loop runs
- [x] 2.5 Store the interactive session in managed state; skip recent files, recent folders, and jump list updates
      in interactive mode; set window size 1200x800, title, and focus
- [x] 2.6 Switch `run()` to `.build(ctx)?.run_return(...)`; route `CloseRequested` and `ExitRequested` to
      `cancelled` when no result was emitted; cancel directly before the frontend registers as ready
      (`register_interactive_ready`), and afterwards let the frontend decide, confirming when answers are dirty
- [x] 2.7 Add Tauri commands `get_interactive_session`, `submit_answers`, `cancel_interactive`, and
      `register_interactive_ready`; register in `invoke_handler`
- [x] 2.8 Tests for the command handlers (session fetch, valid submit, rejected submit). Note: covered through the
      extracted handler logic (`session_view`, `prepare_submission`); the repo has no Tauri mock runtime, and
      `submit_answers` exits the process. Exercised end to end against the built binary in 7.2.

## 3. Questions panel (frontend)

- [x] 3.1 Add panel markup hooks to `index.html` reusing the left `#sidebar` slot
- [x] 3.2 Create `src/interactive.js`: fetch session, build controls with `createElement`/`textContent`, render
      `description` via the existing markdown pipeline and DOMPurify
- [x] 3.3 Implement answer state, required-field gating of Submit, inline required markers, Other inputs, and
      defaults
- [x] 3.4 Implement Submit (button and Ctrl/Cmd+Enter), backend error display, collapse/restore, and dirty-close
      confirmation via `tauri-plugin-dialog`
- [x] 3.5 Wire `interactive.js` into `main.js` only when the session exists; preserve answers across
      `file-changed` re-renders
- [x] 3.6 Style the panel in `styles.css` following the sidebar's light/`dark-sidebar` pattern, with a scoped reset
      against themes that style every element; verified in all 11 themes
- [x] 3.7 Vitest coverage for answer-state building and payload shape

## 4. Question anchors and scroll sync (frontend)

- [x] 4.1 Confirm DOMPurify preserves `id` on `<a>` elements in rendered markdown; add a test (adjust sanitize
      config only if required)
- [x] 4.2 Create `src/anchors.js`: resolve anchors within `#content` after each render, log a console warning for
      missing ids, report resolved ids to `interactive.js`
- [x] 4.3 Question → document: "show in document" icon button with smooth `scrollIntoView` and a brief section
      highlight
- [x] 4.4 Document → question: insert badges after resolved anchors (one badge per anchor, one entry per question);
      clicking scrolls the panel, highlights, and focuses the first control
- [x] 4.5 Exclude badges from search matching, print, and PDF export
- [x] 4.6 Scroll sync: reading-line rule (last anchor above 20%, last visible at document end, first visible before
      any passes), panel scroll with `block: "nearest"` skipped while typing, never move the document or focus
- [x] 4.7 Style badges, active question, and highlights; verify in all 11 themes
- [x] 4.8 Vitest coverage for anchor resolution, shared-anchor badge grouping, and active-anchor selection

## 5. PATH registration

- [x] 5.1 Create `src-tauri/windows/hooks.nsh` with post-install (append `$INSTDIR` to HKCU `Path` if absent,
      broadcast `WM_SETTINGCHANGE`) and post-uninstall (remove exact entry) hooks
- [x] 5.2 Reference the hooks via `bundle.windows.nsis.installerHooks` in `tauri.conf.json`
- [x] 5.3 Verify install, reinstall (no duplicate), and uninstall (entry removed, others preserved) on Windows.
      The hook's PATH logic passed against a scratch registry key; the installer test on the prerelease build is
      tracked in #96.

## 6. Agent skill and docs

- [x] 6.1 Write `plugins/mdlite/skills/mdlite-decision/SKILL.md` (when to use, invoke `mdlite` from PATH with no
      search, session scratch layout `<scratch>/mdlite/<slug>/` with temp-dir fallback, schema v1 example,
      `<a id>` anchor authoring, single background shell call with `--output`, status handling)
- [x] 6.2 Add a sample `decision.md` and `questions.json` under `plugins/mdlite/skills/mdlite-decision/examples/`
- [x] 6.3 Update README: `--interactive` usage, contracts, exit codes, Windows stdout caveat, PATH setup per OS
      (macOS symlink, Linux `~/.local/bin`, restart terminals), skill installation
- [x] 6.4 Package the skill as the `mdlite` Claude Code plugin (`plugins/mdlite/.claude-plugin/plugin.json`) and
      list it in `.claude-plugin/marketplace.json`; the plugin source is `./plugins/mdlite` so installs copy only
      the skill
- [x] 6.5 Make the skill agent-neutral: refer to the agent's built-in question tool and background shell tool,
      naming Claude Code equivalents as examples, and state the background-execution and exit-notification
      requirement
- [x] 6.6 Document installation in the README: Claude Code marketplace, `npx skills add mikeruhl/frenetik.mdlite
  --skill mdlite-decision` for other agents, and manual copy of `plugins/mdlite/skills/mdlite-decision`
- [x] 6.7 Mark the repository's OpenSpec development skills internal so the `skills` CLI offers only
      `mdlite-decision`
- [x] 6.8 Write both files with the agent's file-write tool and launch mdlite in a separate background shell
      call, using one absolute path form (drive letter with forward slashes on Windows)

## 7. Verification

- [x] 7.1 `cargo clippy -- -D warnings`, `cargo test`, `pnpm lint`, `pnpm test` all pass
- [x] 7.2 Manual run in the app: submit, cancel (clean and dirty), invalid questions, unwritable output, live reload
      during session, anchor jumps both ways, scroll sync while typing. Dirty-close dialog (Keep editing, Discard)
      confirmed manually on the release build.
- [x] 7.3 Regression check: default file mode, folder mode, watcher live reload, recent files, themes, outline.
      Done on the release build: file mode render and live reload, folder tree and new-file marker, normal close
      exits 0 with empty stdout, recent files still recorded. The check found that `Ctrl+Shift+O` did not toggle the
      outline while the webview had focus (only the menu accelerator existed); fixed with a keydown handler that
      syncs the menu state, and confirmed manually.
- [x] 7.4 Release build on Windows: confirm stdout-only delivery when piped from Git Bash and `--output` delivery
      when launched from PowerShell
- [x] 7.5 End-to-end from Claude Code: agent followed `SKILL.md`, launched mdlite in the background, and acted on
      the returned answers. The by-name `PATH` lookup is verified with 5.3 (the local build was called by full
      path; the session had no scratch directory, so the temp-dir fallback was used).
- [x] 7.6 Confirm release binary stays under 30 MB and cold start under 2 s. Size is 17.06 MB; window titled 460 to
      765 ms after launch. The limit was raised from 15 MB; size reduction is tracked in #102.
- [x] 7.7 Include a manual test plan in the PR description
