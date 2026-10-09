## Context

The authoritative path of the open file lives in Rust (`AppState.file_path`), already normalized for display by
`display_path()` in `src-tauri/src/lib.rs`. An empty `file_path` means "no file open" (empty mode and folder mode
before a file is chosen); `startup_error` marks a failed launch. Menu items are built in
`src-tauri/src/menu.rs` and dispatched by id in the `on_menu_event` chain in `lib.rs`. Enabled state is already
data-driven for one item (`toggle-show-frontmatter` via `has_frontmatter`) and the menu is rebuilt through
`rebuild_menu()` when state changes. Keyboard shortcuts such as Find and Zoom are declared both as menu
accelerators and as `keydown` handlers in `src/main.js`, because WebView2 focus can swallow native accelerators.
The only existing error surface is `window.alert` (PDF export). No clipboard plugin is installed.

## Goals / Non-Goals

**Goals:**

- One Rust code path that copies the current file's display path to the clipboard.
- Menu item and Shift+Alt+C shortcut reach that path in both single-file and folder modes.
- Menu item disabled when no file is open.
- Lightweight success confirmation that works across all 11 themes; failures surfaced via the existing alert.

**Non-Goals:**

- Sidebar context menus, relative paths, `file://` URIs, folder paths.
- Reading the clipboard.
- User-configurable shortcut.

## Decisions

### D1: Write the clipboard from Rust with `tauri-plugin-clipboard-manager`

The menu click arrives in Rust with no webview user gesture, so `navigator.clipboard.writeText` triggered via an
emitted event is not guaranteed to be permitted by WebView2/WKWebView. Rust already owns the path, so writing
there avoids a round-trip and keeps the frontend free of path handling.

- Alternative: `navigator.clipboard.writeText` in the webview. Rejected: unreliable without transient
  activation; would need the path shipped to JS.
- Alternative: `arboard` crate directly. Rejected: the official Tauri plugin wraps it with Tauri lifecycle
  integration and is the supported route; same footprint.

Writes use `app.clipboard().write_text(...)` (`ClipboardExt`). No JS package or capability permission is needed
because the plugin's JS API is not used.

### D2: Single `copy_current_file_path(app) -> Result<Option<String>, String>` helper

Lives next to `display_path` responsibilities (a small function in `commands.rs`). Returns `Ok(None)` when no file
is open, `Ok(Some(path))` on success, `Err` on clipboard failure. Two thin callers:

- Menu handler branch `id == "copy-file-path"` in `lib.rs`.
- `#[tauri::command] copy_file_path` invoked by the frontend shortcut.

Both report outcome to the frontend: success emits/returns so JS shows the toast; failure shows the alert. The
menu path emits `file-path-copied` / `file-path-copy-error` events; the command path returns the result to the
`invoke` caller. The frontend uses one `notifyPathCopied()` / error function for both.

A pure function `current_file_display_path(state: &AppState) -> Option<String>` encapsulates the "is a file
open" rule (non-empty `file_path` and no `startup_error`) so it is unit-testable without a clipboard.

### D3: Menu enablement via a `has_file` flag passed to `build_menu`

Mirror the `has_frontmatter` pattern: add `has_file: bool` to the menu-build inputs, computed from
`current_file_display_path(&state).is_some()`. Call `rebuild_menu` after state transitions that change it
(`switch_file`, open-folder-file, entering folder mode, entering empty/file mode). Place the item in the File
menu after **Open Folder...**/Recent Files separator group, before **Find...**.

- Alternative: always enabled, no-op when empty. Rejected: spec requires disabled state; a dead menu item is
  misleading.

### D4: Shortcut = Shift+Alt+C, declared twice like existing shortcuts

Menu accelerator `"Shift+Alt+C"` (Tauri maps Alt to Option on macOS). Matching `keydown` handler in `main.js`
checks `e.altKey && e.shiftKey && e.code === "KeyC"` (use `code`, since Alt/Option changes `e.key` on macOS and
some layouts) and skips when `e.target` is an `input`, `textarea`, or contenteditable. It calls
`invoke("copy_file_path")`. If both the native accelerator and the JS handler fire, the action is idempotent and
D5 collapses duplicate toasts.

- Alternative: Ctrl+Shift+C. Rejected: opens the DevTools element picker in WebView2 debug builds and is
  "copy" in many terminals. Shift+Alt+C matches VS Code's "Copy Path".

### D5: Toast element reused, not stacked

Add one `<div id="toast" role="status" aria-live="polite" hidden>` inside `#main-content`. `showToast(text)`
sets text, unhides, and (re)starts a ~1.8 s timer; repeated calls restart the timer rather than creating new
nodes. Styled in `styles.css` by mirroring the search bar's pattern: light default colors plus a
`body.dark-sidebar #toast` override, which is how the search bar already adapts across all 11 themes (no theme
file overrides it). Positioned bottom-center, `pointer-events: none`, padding, radius, border, and font size
matching the search bar. Hidden in print media. Focus is never moved.

### D6: Errors via `window.alert`

Matches the existing PDF export error pattern; no new dialog component.

## Risks / Trade-offs

- [New Rust dependency increases binary size slightly] → Official plugin, small; justified in proposal.
- [Native accelerator and JS handler both fire, double clipboard write] → Writes are identical and idempotent;
  toast restarts instead of stacking.
- [Linux clipboard ownership is lost when the process exits on some X11 setups] → Accepted; the app stays open
  while the user pastes. Documented as known limitation.
- [Menu enablement goes stale if a state transition misses `rebuild_menu`] → Command path re-checks state and
  returns `None`, so a stale-enabled item only produces no-op; add tests on `current_file_display_path` and
  manually verify each transition listed in tasks.
- [Toast contrast wrong in a bundled theme (Splendor, Retro, Air, Modest set their own page colors)] → Follow
  the search bar's light/`dark-sidebar` pattern, which already works in all themes; verify all 11 manually.

## Migration Plan

Additive feature; no data or settings migration. Rollback by reverting the PR.

## Open Questions

- None blocking. Shortcut choice (Shift+Alt+C) can be revisited in review.
