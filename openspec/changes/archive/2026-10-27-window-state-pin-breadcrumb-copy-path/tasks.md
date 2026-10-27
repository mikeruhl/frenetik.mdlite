## 1. Window state persistence (#19)

- [x] 1.1 Add `WindowState` struct and `store_get_window_state` / `store_set_window_state` in `config.rs`, treating unparsable or non-positive values as absent
- [x] 1.2 Add pure functions for visibility validation (title band intersects a monitor by 100x50) and size clamping, with unit tests covering disconnected monitor, reduced resolution, partially off screen, and minimum size
- [x] 1.3 Restore saved geometry and maximized state at main window creation in `lib.rs`, before the window is shown, falling back to centered default size
- [x] 1.4 Save geometry in the `CloseRequested` handler before the interactive close flow, using last non-maximized bounds when maximized and skipping when minimized
- [x] 1.5 Add `apply_default_size` helper and replace the three `set_size` calls so defaults apply only when no `window_state` is stored
- [x] 1.6 Verify in the running app: restart restores position and size, maximized restore, disconnected-monitor fallback (simulate by editing `settings.json`), folder and interactive modes respect saved size

## 2. Always on top (#26)

- [x] 2.1 Add `always_on_top` to `AppState` and `store_get_always_on_top` / `store_set_always_on_top` in `config.rs`
- [x] 2.2 Add checkable **View → Always on Top** with `CmdOrCtrl+Shift+T` to `menu.rs`, carried through `MenuState` so rebuilds keep the check state
- [x] 2.3 Handle the menu event in `lib.rs`: flip state, persist, call `set_always_on_top`, emit `set-always-on-top`; apply the stored value at window creation
- [x] 2.4 Add a `set_always_on_top` Tauri command and register it so the pin badge can toggle the same path
- [x] 2.5 Add the pin button to `index.html`, wire show/hide and click in `main.js`, set `aria-pressed`, and style with theme variables only in `styles.css`
- [x] 2.6 Add the "Always on top" row to the welcome screen shortcut table in `main.js` and the README shortcut list
- [x] 2.7 Verify in the running app across all 11 themes: toggle from menu, shortcut, and badge; state persists across restart; focus is not stolen

## 3. Shared path helper and commands (#27 and context menu)

- [x] 3.1 Add `relative_to_root(root, path)` using `display_path` normalization, with unit tests for Windows verbatim and UNC roots, nested files, folders, the root itself, and paths outside the root
- [x] 3.2 Add `copy_tree_path(path, kind)` command that returns the copied string, reusing the clipboard write used by `copy_path_with`, with tests for full, relative, outside-root error, and clipboard failure
- [x] 3.3 Add `get_breadcrumb(path)` command built on `compute_path_chain`, returning root, folders, and file entries whose paths match `folderNodeMap` keys, with unit tests
- [x] 3.4 Register both commands in `lib.rs`

## 4. Breadcrumb path bar (#27)

- [x] 4.1 Add `<nav id="breadcrumb" aria-label="Path">` above `#content` in `index.html`, hidden by default
- [x] 4.2 Create `src/breadcrumb.js` with `updateBreadcrumb(path)`, `clearBreadcrumb()`, and a pure `buildSegments` function implementing the four-segment truncation rule, using `textContent` only and a stale-result guard
- [x] 4.3 Add `src/breadcrumb.test.js` covering segment building, truncation boundary at four and five segments, ellipsis tooltip, markup-in-name safety, and stale-result guard
- [x] 4.4 Export `revealFolder(path)` from `sidebar.js` (expand ancestors, show collapsed sidebar, scroll into view; root scrolls to top) and add tests in `sidebar.test.js`
- [x] 4.5 Call `updateBreadcrumb` from `loadFile` and `clearBreadcrumb` from `exitFolderMode` and when the current file is deleted in `applyFolderChanges` and `handleScanComplete`
- [x] 4.6 Style the bar, buttons, separators, file icon, focus ring, and narrow-window truncation with theme variables; hide it in print and PDF export styles
- [x] 4.7 Verify in the running app across all 11 themes: nested file, root file, link navigation, back and forward, collapsed sidebar, narrow window, printing

## 5. Tree context menu (copy paths)

- [x] 5.1 Add `core:menu:default` to `src-tauri/capabilities/default.json`
- [x] 5.2 Add a delegated `contextmenu` listener on `#sidebar-tree` in `sidebar.js` for `.tree-file` and `.tree-folder` rows, building the native menu with **Copy Full Path** and **Copy Relative Path**
- [x] 5.3 Invoke `copy_tree_path`, show the existing "Path copied" toast on success and the existing alert pattern on failure
- [x] 5.4 Extract the menu item to path-kind mapping and error handling so it is unit-testable in `sidebar.test.js` without a native menu
- [x] 5.5 Verify in the running app: files, folders, non-displayed file, outside-content right click shows no path menu, Windows separators and verbatim prefix

## 6. Specs, docs, and wrap-up

- [x] 6.1 Run `cargo fmt`, `cargo clippy -- -D warnings`, `cargo test`, `pnpm lint`, and `pnpm test` with zero warnings and failures
- [x] 6.2 Re-check shared modules for regressions: File menu Copy File Path, sidebar collapse and resize, folder watcher live updates, interactive mode close flow
- [x] 6.3 Sync delta specs to `openspec/specs/`, writing a Purpose section for each new capability that records the design rationale (D1 to D7)
- [x] 6.4 Update README feature and shortcut lists
