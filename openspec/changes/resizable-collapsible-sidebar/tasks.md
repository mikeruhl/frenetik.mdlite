## 1. Layout module (test first)

- [x] 1.1 Write failing unit tests in `src/sidebar-layout.test.js` for `clampWidth` (min 150, max `min(600, 60% viewport)`) and `parseStoredWidth` (missing, NaN, out of range, valid)
- [x] 1.2 Create `src/sidebar-layout.js` exporting `clampWidth`, `parseStoredWidth`, and `initSidebarLayout`; make 1.1 pass
- [x] 1.3 Implement guarded `localStorage` load and save for `mdlite-sidebar-width` and `mdlite-sidebar-collapsed` with default fallback
- [x] 1.4 Implement pointer drag (pointer capture, rAF updates, `sidebar-resizing` body class) setting `--sidebar-width`
- [x] 1.5 Implement divider keyboard handling (Left/Right 16px, Shift 64px, Home/End) and `aria-valuenow`/`aria-valuemin`/`aria-valuemax`
- [x] 1.6 Implement double-click reset to 250px
- [x] 1.7 Implement collapse/expand toggle via `sidebar-collapsed` body class, preserving the prior width, and re-clamp on window `resize`

## 2. Markup and styles

- [x] 2.1 Add `#sidebar-divider` between `#sidebar` and `#main-content`, a collapse button in `#sidebar-header`, and `#sidebar-expand` tab in `index.html`
- [x] 2.2 Change folder-mode `#sidebar` width to `var(--sidebar-width, 250px)`, scoped so interactive mode sizing is untouched
- [x] 2.3 Style divider (6px hit area, 1px line, hover and focus ring), collapse button, and expand tab; add `sidebar-collapsed` and `sidebar-resizing` rules
- [x] 2.4 Add dark-sidebar variants and reset margin/padding/max-width for new elements; hide all new controls under `body.interactive-mode` and in print CSS
- [x] 2.5 Confirm no tree state loss on collapse (no DOM teardown; CSS hide only)

## 3. Shortcut and menu

- [x] 3.1 Add View menu item "Toggle Sidebar" with `CmdOrCtrl+B` in `src-tauri/src/menu.rs`, following the outline toggle pattern
- [x] 3.2 Wire the menu event and a DOM `keydown` handler in `src/main.js` to the toggle, no-op outside folder mode
- [x] 3.3 Call `initSidebarLayout()` from `src/main.js` on startup and when entering folder mode

## 4. Verification

- [x] 4.1 Run `pnpm lint`, unit tests, and `cargo clippy -- -D warnings`; fix all findings
- [x] 4.2 Run the app in folder mode; verify drag min/max, double-click reset, keyboard resize, collapse/expand via button, tab, `Ctrl+B`, and menu
- [x] 4.3 Verify persistence across restart for width and collapsed state, and clamping after shrinking the window
- [x] 4.4 Verify rendering in all 11 bundled themes (divider, hover, focus, expand tab)
- [x] 4.5 Verify print output is unchanged; verify mermaid/chart blocks reflow after resize
- [x] 4.6 Verify live file watcher updates still add and remove tree entries while collapsed and after resizing
- [x] 4.7 Include a manual test plan in the PR description for the UI behavior not covered by unit tests

## 5. Interactive parity, icon, attribution

- [x] 5.1 Replace the `◀` / `▶` glyphs with the inline SVG bar-and-arrow icon (expand mirrored)
- [x] 5.2 Add a mode argument to `initSidebarLayout` (per-mode default width and storage key; interactive collapsed state not persisted) and extend `toggleSidebar` to interactive mode; add unit tests for the per-mode helpers
- [x] 5.3 Move `#interactive-collapse` onto the shared collapse button class and handler; drop the `interactive-collapsed` class, 36px rail, and header rules; keep `goToQuestion` expanding the panel
- [x] 5.4 Make the divider, expand tab, width variable, and collapsed rules apply in interactive mode; add the dark variants
- [x] 5.5 Make `#attribution` follow `--sidebar-width` and collapsed state in both modes
- [x] 5.6 Call `initSidebarLayout("interactive")` on interactive startup and `initSidebarLayout("folder")` for folder mode
- [x] 5.7 Run lint, unit tests, and `cargo clippy -- -D warnings`; verify an interactive session with the installed build (resize, collapse, expand, `Ctrl+B`, question jump while collapsed, themes)
