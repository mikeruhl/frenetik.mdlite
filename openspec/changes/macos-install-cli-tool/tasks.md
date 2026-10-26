## 1. Install logic module

- [x] 1.1 Create `src-tauri/src/cli_install.rs` and register it in `lib.rs`
- [x] 1.2 Add pure functions `is_bundle_executable`, `classify_link`, `osascript_error`, `build_install_command`,
  `build_uninstall_command` with unit tests (spaces, quotes, non-bundle paths, foreign link targets)
- [x] 1.3 Add macOS-gated `install` that resolves `current_exe()`, rejects non-bundle executables, runs the script
  through `osascript` with administrator privileges, and emits `cli-tool-installed` or `cli-tool-error`
- [x] 1.4 Add macOS-gated `uninstall` that inspects `/usr/local/bin/mdlite`, handles missing and foreign files, runs
  the elevated removal, and emits `cli-tool-uninstalled` or `cli-tool-error`
- [x] 1.5 Treat osascript user cancellation (error -128) as a silent no-op

## 2. Menu and event wiring

- [x] 2.1 Add macOS-gated **Install Command Line Tool** and **Uninstall Command Line Tool** items to the File menu in
  `menu.rs`, above Quit
- [x] 2.2 Dispatch the new menu ids to `cli_install::install` and `cli_install::uninstall` in the `on_menu_event`
  chain in `lib.rs`, off the main thread so the password prompt does not block the UI

## 3. Frontend feedback

- [x] 3.1 Add `cli-tool-installed` and `cli-tool-uninstalled` listeners in `src/main.js` that call `showToast`
- [x] 3.2 Add a `cli-tool-error` listener that calls `window.alert` with the payload

## 4. Docs and specs

- [x] 4.1 Replace the macOS row in the README command line table with a pointer to **File → Install Command Line
  Tool**
- [x] 4.2 Update the Purpose of `openspec/specs/cli-path-registration/spec.md` if the new scope warrants it

## 5. Verification

- [x] 5.1 `cargo clippy -- -D warnings` and `cargo test` pass
- [x] 5.2 ESLint passes
- [ ] 5.3 Confirm Windows build shows no new menu items and Linux/Windows compile with the macOS code gated out
- [ ] 5.4 Manual test on macOS: install, new terminal runs `mdlite --help`, reinstall repoints, uninstall removes,
  uninstall again reports not installed, cancel at prompt is silent, foreign file at the path is left alone
- [ ] 5.5 Include the macOS manual test plan in the PR description
