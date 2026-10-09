## 1. Dependency

- [x] 1.1 Add `tauri-plugin-clipboard-manager = "2"` to `src-tauri/Cargo.toml` and register it with
      `.plugin(tauri_plugin_clipboard_manager::init())` in `lib.rs`
- [x] 1.2 Confirm no JS package or capability permission is needed (Rust-side writes only); `cargo build` succeeds

## 2. Rust core

- [x] 2.1 Add pure `current_file_display_path(state: &AppState) -> Option<String>` (None when `file_path` empty or
      `startup_error` set; otherwise `display_path(&file_path)`)
- [x] 2.2 Unit tests for 2.1: empty mode, folder mode without file, folder mode with file, file mode, startup error,
      `\\?\` and `\\?\UNC\` normalization
- [x] 2.3 Add `copy_current_file_path(app) -> Result<Option<String>, String>` that writes via `ClipboardExt::write_text`
- [x] 2.4 Add `#[tauri::command] copy_file_path` wrapping 2.3; register in the invoke handler
- [x] 2.5 Test the command handler's no-file path returns `Ok(None)` without touching the clipboard

## 3. Menu

- [x] 3.1 Add `has_file` input to `build_menu`/`rebuild_menu`, computed via `current_file_display_path`
- [x] 3.2 Add File menu item `copy-file-path` labeled "Copy File Path\tShift+Alt+C" (shortcut display only, no
      native accelerator), `.enabled(has_file)`, placed after the Recent Files group and before Find
- [x] 3.3 Handle `id == "copy-file-path"` in `on_menu_event`: emit `file-path-copied` on success, `file-path-copy-error`
      with message on failure, nothing on `None`
- [x] 3.4 Call `rebuild_menu` on every transition that changes `has_file`: `switch_file`, `open_folder_file`, entering
      folder mode, entering file mode, empty startup, startup error

## 4. Frontend

- [x] 4.1 Add `<div id="toast" role="status" aria-live="polite" hidden>` inside `#main-content` in `index.html`
- [x] 4.2 Add `showToast(text)` in `main.js` that reuses the single element and restarts a ~1.8 s hide timer
- [x] 4.3 Listen for `file-path-copied` (show "Path copied") and `file-path-copy-error` (`window.alert("Could not copy
file path: " + msg)`)
- [x] 4.4 Add keydown handler (sole shortcut path): `e.altKey && e.shiftKey && e.code === "KeyC"`, skip when target is
      input/textarea/contenteditable, `invoke("copy_file_path")`, toast on `Some`, alert on rejection
- [x] 4.5 Add "Copy file path | Shift+Alt+C" row to `WELCOME_MD` shortcut table
- [x] 4.6 Style `#toast` in `styles.css` with theme-derived colors (`--theme-bg`/`--theme-fg` set in `applyTheme`),
      bottom-center, `pointer-events: none`, hidden in `@media print`

## 5. Verification

- [x] 5.1 `cargo clippy -- -D warnings` and `cargo test` pass
- [x] 5.2 `pnpm lint` and `pnpm test` pass
- [x] 5.3 Running app, single-file mode: menu item and shortcut copy the correct path; paste confirms
- [x] 5.4 Running app, folder mode: path follows the selected file across tree navigation, Recent Files, and Open...
- [x] 5.5 Menu item disabled on welcome screen, folder mode with no file selected, and startup error; enabled after
      opening a file
- [x] 5.6 Shortcut ignored in search input and interactive-mode text fields
- [x] 5.7 Toast legible in all 11 themes; repeated copies show one toast; toast absent from print/PDF output
- [x] 5.8 Regression check: live reload, Find, zoom, print, PDF export, outline toggle unaffected
- [x] 5.9 Write manual test plan for the PR description covering 5.3 to 5.8
