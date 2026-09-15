## 1. Backend: scanned-path registry

- [x] 1.1 Add a registry field to `AppState` (e.g. `folder_files: std::collections::HashSet<std::path::PathBuf>`)
      tracking every markdown file path currently known to be scanned under `folder_path`.
- [x] 1.2 Populate/clear the registry in `scan.rs::run_progressive_scan` as files are discovered, and clear it
      when folder mode is exited / a new folder is opened.
- [x] 1.3 Add a unit test in `scan.rs` covering registry population during a nested-folder scan.

## 2. Backend: watcher event handling

- [x] 2.1 In `watcher.rs::start_folder_watcher`, replace the unconditional
      `if !event.path.extension().is_some_and(is_markdown_ext) { continue; }` with logic that also handles
      non-markdown / extension-less paths that no longer exist on disk.
- [x] 2.2 For each such path, look up the registry for entries whose path is equal to or nested under the
      deleted path; for every match, build a `FolderChangeEntry { exists: false, .. }`, remove it from the
      registry, and include it in the batch (dedupe as already done via `seen`).
- [x] 2.3 Keep existing per-markdown-file handling (create/delete) unchanged, but make sure it also updates the
      new registry (insert on `exists: true`, remove on `exists: false`).
- [x] 2.4 Add a unit/integration test simulating a directory-delete event against a pre-populated registry and
      asserting the emitted `FolderChangeEntry` list contains every descendant file with `exists: false`.

## 3. Verification

- [x] 3.1 Run `cargo clippy -- -D warnings` and `cargo test` in `src-tauri/`. (clippy clean, 43/43 tests pass)
- [x] 3.2 Run ESLint on touched frontend files. `sidebar.js` stayed untouched as designed; `main.js` needed a
      fix (see 3.3b) — `pnpm lint` clean on it.
- [x] 3.3 Manual test: open folder mode on a directory with nested subfolders containing `.md` files; delete a
      subfolder from Explorer while the app is open; confirm the subfolder and all its files disappear from the
      nav tree without needing to reopen the folder. (user confirmed: added folder showed up, deleted, removed
      from nav)
- [x] 3.3b Manual test on a real project folder (reopen/recent-folder case) surfaced a separate pre-existing
      bug: `main.js`'s `folder-changed` listener discarded all but the last payload received inside its 500ms
      debounce window, permanently losing earlier file-create entries (root-level `.md` files stayed missing
      after reopening a folder; each further watcher event only ever revealed the newest one). Fixed by
      accumulating payloads across the debounce window (`src/main.js`) instead of replacing them; see
      design.md "Correction found during manual verification". Verified: clippy clean, 43/43 Rust tests still
      pass after the fix.
- [x] 3.4 Manual test: repeat with the deleted subfolder containing the currently-open file; confirm main
      content clears in addition to the tree updating. (user confirmed pass)
- [x] 3.5 Manual test: delete a single `.md` file (not a folder) and confirm existing behavior still works
      (regression check). (user confirmed pass)
- [x] 3.6 Manual test: create a new `.md` file and a new nested folder+file while folder mode is open; confirm
      both appear correctly (regression check on the create path). (user confirmed pass)
