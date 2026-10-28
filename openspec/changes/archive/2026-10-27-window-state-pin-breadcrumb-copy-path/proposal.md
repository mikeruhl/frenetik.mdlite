## Why

Four small friction points keep users re-doing work every session: the window opens at default size and position
every launch (#19), mdlite gets buried behind the editor or terminal it is used beside (#26), a deep folder tree
hides where the open file lives (#27), and copying a path from the navigation tree is impossible, since the
existing Copy File Path only covers the currently open file. All four are small, independent, and touch the same
shell code (window setup, View menu, sidebar), so they ship together.

## What Changes

- Persist window geometry (position, size, maximized) to the existing settings store on close and restore it on
  the next launch. A saved position that is no longer on any connected monitor falls back to defaults. Saved
  geometry takes precedence over the per-mode default sizes now applied when a folder or interactive session opens.
- Add **View → Always on Top** (checkable, with accelerator). The preference persists across launches. A pin
  badge in the main window shows when it is active and toggles it off when clicked.
- Add a breadcrumb path bar above the content in folder mode: root folder, intermediate folders, and the current
  file with a file icon. Folder segments are clickable and reveal that folder in the navigation tree. Deep paths
  collapse their middle segments into an ellipsis.
- Add a right-click context menu on navigation tree files and folders with **Copy Full Path** and **Copy Relative
  Path** (relative to the opened root folder), reusing the normalized display form and the "Path copied" toast.
- No new dependencies. The context menu uses the native menu API already shipped in `@tauri-apps/api`, which
  needs one new capability permission.

## Capabilities

### New Capabilities

- `window-state-persistence`: Save and restore window position, size, and maximized state across launches, with
  monitor-visibility validation and DPI-safe units.
- `always-on-top`: Menu-driven, persisted always-on-top toggle with an in-window pin indicator.
- `folder-breadcrumb`: Breadcrumb path bar for the open file in folder mode, with clickable folder segments and
  middle-segment truncation.

### Modified Capabilities

- `copy-file-path`: Add context-menu copy of full and relative paths for navigation tree entries. Existing
  requirements for the File menu item and shortcut are unchanged.

## Impact

- Rust: `src-tauri/src/config.rs` (new store keys `window_state`, `always_on_top`), `lib.rs` (restore on window
  creation, save on close, conditional default sizing, menu event), `menu.rs` (View item), `commands.rs` (path
  copy and breadcrumb commands), `scan.rs` (reuse `compute_path_chain`).
- Frontend: `index.html` (breadcrumb bar, pin badge), `src/sidebar.js` (context menu hook, reveal folder), new
  `src/breadcrumb.js`, `src/styles.css` (theme-variable based styling), `src/main.js` (event wiring).
- `src-tauri/capabilities/default.json`: add the `core:menu` permission for the native popup menu.
- Specs: three new spec files, one delta to `copy-file-path`, README shortcut list.
- Applies to all 11 bundled themes; breadcrumb bar and pin badge must use existing theme variables only.

## Non-goals

- Per-mode or per-monitor window geometry profiles, or saving geometry on move/resize events (close only).
- A tray or title bar icon for always-on-top; the native title bar is not customized.
- Context menu or breadcrumb in single-file mode, where there is no root folder to be relative to.
- Context menu actions beyond copying paths (open in file manager, rename, delete).
- Folder pages or listings: clicking a breadcrumb folder reveals it in the tree, it does not open a new view.
- Editing the always-on-top state from the command line.
