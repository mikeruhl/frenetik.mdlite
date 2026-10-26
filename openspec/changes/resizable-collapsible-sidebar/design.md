## Context

Folder mode renders `#sidebar` (header plus `#sidebar-tree`) beside `#main-content` in a flex row (`#app-container`). Sidebar width is a hardcoded `250px` in `src/styles.css`. Interactive mode reuses the same `#sidebar` slot for the questions panel with its own widths (340px, 36px collapsed rail) and its own `interactive-collapsed` body class. This change moves both onto one shared layout. Existing precedent for client-side persistence is `localStorage` (`mdlite-mermaid-*`). Existing precedent for dual shortcut handling (menu accelerator plus DOM `keydown`, because accelerators do not fire while the webview has focus) is the outline toggle in `src/toc.js`, `src/main.js`, and `src-tauri/src/menu.rs`.

## Goals / Non-Goals

**Goals:**
- Drag-resizable sidebar width with sane bounds.
- Collapse to zero width for a full-width reading view; one-step restore.
- Keyboard and pointer access; state survives restart.
- Correct in all 11 bundled themes and the dark-sidebar variants.

**Non-Goals:**
- TOC panel, per-folder widths, animation, touch gestures, persisting the interactive collapsed state.

## Decisions

**1. Width is a CSS custom property, not inline pixel styles.**
`#sidebar` uses `width: var(--sidebar-width, 250px)`. JS sets `--sidebar-width` on `document.documentElement`. Alternative: set `style.width` directly. Rejected because interactive mode overrides `#sidebar` width in CSS and a custom property lets the folder-mode rule be scoped (`body.folder-mode:not(.interactive-mode)`) without fighting inline-style specificity.

**2. Separate divider element between `#sidebar` and `#main-content`.**
Add `<div id="sidebar-divider" role="separator" aria-orientation="vertical" tabindex="0">` as a flex sibling. Alternative: a pseudo-element or absolutely positioned handle inside `#sidebar`. Rejected because a real element is focusable, carries ARIA value attributes, and gets a hit target wider than the 1px border without altering sidebar layout.

**3. Pointer Events with pointer capture.**
`pointerdown` on the divider calls `setPointerCapture`; `pointermove` updates width via `requestAnimationFrame`; `pointerup`/`pointercancel` ends the drag and persists. Alternative: `mousemove` on `document`. Rejected because capture keeps the drag alive when the cursor leaves the window and unifies mouse and pen. While dragging, `body.sidebar-resizing` disables text selection and sets `cursor: col-resize`.

**4. Width clamp: min 150px, max `min(600px, 60vw)`.**
Re-applied on window resize so a persisted width never exceeds the current viewport. Default 250px. Double-click on the divider resets to default. Arrow keys on the focused divider adjust by 16px (Shift: 64px); Home/End jump to min/max.

**5. Collapse is a body class `sidebar-collapsed`.**
CSS hides `#sidebar` and `#sidebar-divider` under that class, giving `#main-content` the full width. A small expand tab (`#sidebar-expand`, fixed to the left edge, vertically near the top) is shown only in collapsed folder mode; a collapse button sits in `#sidebar-header`. The previous width is retained in the custom property, so expand restores it exactly. Alternative: collapse to a narrow icon rail like interactive mode (36px). Rejected because the request is a fullscreen view; an overlaid tab costs no layout width.

**6. `Ctrl+B` / `Cmd+B` toggles collapse.**
Matches the VS Code sidebar convention and is unused here. Wired with the same pattern as the outline toggle: View menu item with `CmdOrCtrl+B` accelerator emitting an event, plus a DOM `keydown` handler for focused-webview cases. The shortcut is a no-op unless folder mode or an interactive session is open.

**7. Persistence in `localStorage` with guarded access.**
Keys `mdlite-sidebar-width` and `mdlite-sidebar-collapsed` for folder mode, `mdlite-interactive-width` for the interactive panel. The interactive collapsed state is not persisted: an agent is waiting on the answers, so the questions must be visible on launch. Reads and writes are wrapped in try/catch and fall back to defaults. Alternative: Rust-side `config.rs`. Rejected because the state is purely presentational, needed only at frontend init, and `localStorage` is already used; no new Tauri command surface.

**8. New module `src/sidebar-layout.js`.**
Owns drag, keyboard, collapse, persistence, and clamp. `src/sidebar.js` keeps tree concerns only (single responsibility). `src/main.js` calls `initSidebarLayout()` once. Exports pure helpers (`clampWidth`, `parseStoredWidth`) so unit tests run without a DOM, matching `src/sidebar.test.js` style.

**9. Interactive panel shares the layout (supersedes the earlier scope guard).**
`initSidebarLayout(mode)` takes `"folder"` or `"interactive"`. The mode selects the default width (250 or 340), the storage key, and whether collapsed state persists. Both modes use one divider, one expand tab, the body class `sidebar-collapsed`, and the `--sidebar-width` property. The collapse button is a shared `.sidebar-collapse-btn` class on `#sidebar-collapse` and `#interactive-collapse`. The `interactive-collapsed` class, the 36px rail, and its header rules are removed. Jumping to a question calls the shared expand. Alternative: keep the rail and add only a divider. Rejected because the user asked for one design across both modes.

**10. Icon is an inline SVG.**
A 16px stroke icon (bar plus left arrow, `currentColor`) inherits every theme and dark-sidebar color with no asset or CSP change. The expand tab reuses it mirrored with `scaleX(-1)`.

**11. Attribution bar follows the sidebar edge.**
`#attribution` offsets use `var(--sidebar-width)` in both modes and `0` under `sidebar-collapsed`, replacing the fixed 250px, 340px, and 36px values.

## Risks / Trade-offs

- [Mermaid/chart blocks do not re-render on width change] → Blocks already size to container width via CSS; verify during implementation and trigger a resize-aware relayout only if a defect appears.
- [Divider hit target conflicts with `#sidebar-tree` scrollbar] → Divider is a sibling outside the sidebar; give it a 6px hit area with a 1px visible line.
- [Persisted width larger than a smaller window on next launch] → Clamp on init and on `window` resize.
- [Theme styles that globally restyle elements (margins, widths) affect new elements] → Scope divider and tab styles by id and reset `margin`, `padding`, `max-width` like `#interactive-panel *`; verify in all 11 themes.
- [`Ctrl+B` conflicts with a theme or OS binding] → No existing binding in `menu.rs` or `main.js`; menu accelerator is the single source of truth for display.
