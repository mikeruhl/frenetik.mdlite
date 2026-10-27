## Context

The main window is created in Rust (`"create": false` in `tauri.conf.json`, 900x700 default, 620x300 minimum), and
`lib.rs` then forces a mode-specific size after the file or folder is known: 1100x700 when a folder opens (startup
and runtime switch) and 1200x800 for an interactive session. Settings live in the `tauri-plugin-store` file
`settings.json` through the `store_get_*` and `store_set_*` helpers in `config.rs`. The View menu is built in
`menu.rs` and its events are handled in one `on_menu_event` chain in `lib.rs`. The sidebar tree in `src/sidebar.js`
tracks folders in `folderNodeMap` keyed by the same path strings the scan emits, and `scan.rs` already has
`compute_path_chain(root, file)` returning the ancestor folders for a file. Copy File Path already normalizes paths
through `display_path` and writes the clipboard in Rust.

Sidebar layout is saved in `localStorage` because it is presentational. Window geometry cannot use that: it must be
read before the window exists, so it goes in the Rust store.

## Goals / Non-Goals

**Goals:**

- Window geometry survives restarts, including multi-monitor and DPI changes, without ever opening off screen.
- Always-on-top is one menu click, persisted, and visibly indicated.
- The current file's place in the folder tree is always visible, and any ancestor can be located in one click.
- Tree entries can copy their full or root-relative path without leaving the tree.
- No new crate or npm dependency.

**Non-Goals:**

- Per-mode geometry, geometry saved on move or resize, or restoring a minimized window.
- A custom title bar, tray icon, or folder listing view.
- Path actions in single-file mode.

## Decisions

### D1. Persist geometry in the Rust store, saved on close, restored at window build

Store one `window_state` object: `{ x, y, width, height, maximized }` in physical pixels. Save it from the existing
`WindowEvent::CloseRequested` handler before `handle_interactive_close` can intercept, using the last non-maximized
bounds when the window is maximized so un-maximizing after restore returns to a sensible rectangle. Skip the save
when the window is minimized (Windows reports a sentinel position) and keep the previous value.

Restore with the window still hidden and show it afterwards, so there is no visible jump. Restore runs after the
menu is attached: the menu bar takes client height, so restoring the inner size earlier shrinks the window by the
menu height on every launch (observed as a 20 pixel loss per session). The saved rectangle is validated against
the monitors' work areas: at least a 100x50 pixel region of the title bar band (top edge of the rectangle) must
intersect one, otherwise the position is dropped and the window is centered at the saved size. Size is clamped to
the minimum size and to the largest work area minus the window frame.

Normal bounds are tracked in memory from move and resize events. A moved event can arrive before the window reports
itself maximized, so a frame that covers the monitor's work area is never remembered as normal bounds; without this
filter a maximized close saved the maximized frame and un-maximizing after restore left the window full size. Physical pixels are stored because position and monitor
rectangles are physical in Tauri, so no scale-factor conversion can drift between sessions; if a monitor's scale
changed, the size still lands inside the validated, clamped bounds.

Alternatives: `tauri-plugin-window-state` (rejected: new dependency, and its restore runs before our mode-specific
`set_size`, so we would still need custom ordering, plus it saves on every move); saving on every resize (rejected:
write amplification for a value only read at launch).

### D2. Saved geometry suppresses the mode-specific default sizes

Today `set_size(1100x700)` and `set_size(1200x800)` run whenever a folder or interactive session opens. If those
ran after restore they would erase the restored size on every launch. Decision: a small helper
`apply_default_size(window, w, h)` calls `set_size` only when no `window_state` is stored. After the first close
the user's geometry wins in every mode, including runtime switches to folder mode via the menu.

Alternative: keep the forced sizes and only restore position (rejected: size is half of the request in #19).
Alternative: per-mode geometry (rejected as non-goal, doubles state and validation for little gain).

### D3. Always-on-top state lives in `AppState` and the store, applied through the window API

`always_on_top: bool` is read from the store at startup and applied with `set_always_on_top`. The View menu item is
a `CheckMenuItem` like the existing toggles, with `CmdOrCtrl+Shift+T`. The handler flips `AppState`, writes the
store, applies the window flag, and emits `set-always-on-top` so the frontend can show or hide the pin badge.
Persisted by default because the issue allows it and a user who pins a reference window expects it to stay pinned.

The indicator is an in-page pin button, not a title prefix: titles are set in many places in `lib.rs` and
`commands.rs`, so a prefix would need every call site changed, and a native title bar cannot host an icon. The
badge sits in the top corner of `#main-content`, is a real `<button>` with an accessible name and `aria-pressed`,
and clicking it invokes the same toggle command. Styling uses only existing theme variables.

### D4. Relative path and breadcrumb segments are computed in Rust, one shared helper

A single function `relative_to_root(root, path) -> Option<PathBuf>` strips the opened root. Two commands use it:

- `copy_tree_path(path, kind)` where `kind` is `full` or `relative`; it normalizes with `display_path`, writes the
  clipboard, and returns the copied string so the frontend shows the existing "Path copied" toast.
- `get_breadcrumb(path)` returns `{ root: {name, path}, folders: [{name, path}], file: {name, path} }` built from
  `compute_path_chain`, so folder `path` values match the keys in `folderNodeMap` exactly.

Doing this in Rust keeps one code path for Windows verbatim prefixes and UNC roots (already handled by
`display_path`) and makes the logic unit-testable with `cargo test`. Computing it in JS from the displayed strings
was rejected because separators and verbatim prefixes differ per platform and the tree keys would not line up.

A path outside the root (stale tree entry after the root changed) makes both commands return an error; the
frontend shows it through the existing toast error pattern instead of copying something wrong.

### D5. Context menu uses the native menu API from `@tauri-apps/api/menu`

Right-click on a `.tree-file` or `.tree-folder` row calls `preventDefault`, builds a native menu with **Copy Full
Path** and **Copy Relative Path**, and pops it up at the cursor. Native menus follow the OS appearance, close on
outside click and Escape, and need no per-theme CSS, which matters with 11 themes. The only cost is one capability
entry (`core:menu:default`) in `capabilities/default.json`. The menu is pointer-only: tree rows are not
keyboard-focusable today, so a context-key trigger has nothing to attach to, and adding tree keyboard navigation is
out of scope.

Alternative: DOM-rendered menu (rejected: needs focus management, outside-click handling, viewport clamping, and
styling in all 11 themes for a two-item menu).

### D6. Breadcrumb is a frontend module fed by `get_breadcrumb`

`src/breadcrumb.js` owns a `<nav id="breadcrumb" aria-label="Path">` above `#content`, visible only under
`body.folder-mode` with a file open. `sidebar.js` calls `updateBreadcrumb(path)` from `loadFile` and clears it on
exit and when the current file is deleted. Folder segments are `<button>` elements; clicking calls a new exported
`revealFolder(path)` in `sidebar.js` that expands the folder and its ancestors, makes the sidebar visible if it is
collapsed, and scrolls the row into view. The root segment scrolls the tree to the top. The final segment is the
filename with an inline SVG file icon in the same style as the sidebar icons, rendered as plain text, not a link.

Truncation: when the path has more than four segments, keep the root, an ellipsis element, and the last two
segments; the ellipsis carries the hidden segments in its `title`. CSS `text-overflow: ellipsis` handles residual
overflow on the filename in a narrow window. All text is set with `textContent`; names are never injected as HTML.

### D7. Document the specs where the rationale lives

New specs get a Purpose section when synced, per project convention, instead of an ADR.

## Risks / Trade-offs

- [Restored window lands on a monitor that is gone or rearranged] → Title-band intersection check, fallback to
  default size and centered placement.
- [Close handler runs while the interactive close flow is pending] → Save runs first and is independent of
  whether the close proceeds, so a cancelled close still stores valid geometry.
- [Persisted always-on-top surprises a user at next launch] → Pin badge is visible whenever active and one click
  turns it off; the menu check state mirrors it.
- [Stored geometry makes the 1100x700 and 1200x800 defaults apply only on first run] → Intentional per D2; a
  corrupt or unparsable `window_state` is treated as absent.
- [Native context menu cannot be exercised by DOM tests] → Path logic is unit-tested in Rust and the menu wiring is
  kept to a thin handler verified in the running app.
- [Rapid file switching races the async breadcrumb fetch] → `updateBreadcrumb` ignores results for a path that is
  no longer current.

## Migration Plan

No data migration. New store keys default to absent (`window_state`) and `false` (`always_on_top`). Rollback is
removing the feature; stale keys in `settings.json` are ignored.

## Open Questions

- None blocking. If interactive agent sessions should always open at 1200x800 regardless of saved geometry, D2
  needs a mode exception; current decision favors one consistent rule.
