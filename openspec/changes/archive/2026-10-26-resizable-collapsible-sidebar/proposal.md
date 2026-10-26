## Why

The folder-mode sidebar has a fixed 250px width. Long file names are truncated and users who want more room for the rendered markdown cannot reclaim the sidebar space. A draggable divider and a collapse control let users size the tree to their folder and get a full-width reading view on demand.

## What Changes

- Add a draggable divider on the right edge of the folder-mode sidebar. Dragging resizes the sidebar between a minimum and maximum width.
- Add a collapse/expand control for the folder-mode sidebar. Collapsing hides the sidebar entirely so the rendered markdown fills the window; expanding restores the previous width.
- Add keyboard support: the divider is focusable and adjusts with arrow keys; `Ctrl+B` / `Cmd+B` toggles collapse, also exposed as a View menu item.
- Persist sidebar width and collapsed state across launches.
- Double-clicking the divider resets the sidebar to the default width.
- Collapsed state keeps a small visible expand affordance so the sidebar can always be restored.
- Apply the same design to the interactive-mode questions panel: draggable divider, the same collapse icon, full collapse to an expand tab (replacing the 36px rail), and `Ctrl+B` / `Cmd+B`. The default panel width stays 340px.
- Replace the `◀` / `▶` glyphs with one inline SVG bar-and-arrow icon, mirrored for expand.
- The footer attribution bar follows the sidebar edge instead of using fixed offsets.

## Capabilities

### New Capabilities
- `sidebar-layout`: user-adjustable width and collapse/expand behavior of the folder-mode sidebar and the interactive-mode questions panel, including persistence and keyboard access.

### Modified Capabilities

None. `folder-navigation` requirements (tree contents and live updates) are unchanged.

## Impact

- `index.html`: divider element and collapse toggle in the sidebar.
- `src/sidebar-layout.js`: drag, keyboard, collapse, persistence logic for both modes.
- `src/interactive.js`: delegate collapse to the shared module; keep expanding the panel when jumping to a question.
- `src/styles.css`: divider, collapsed state, width via CSS custom property, all 11 bundled themes, dark-sidebar variants.
- `src/main.js` and `src-tauri/src/menu.rs`: `Ctrl/Cmd+B` shortcut and View menu item.
- Print output unchanged (sidebar is already hidden for print).
- No new dependencies.

## Non-goals

- Persisting the interactive panel's collapsed state (an agent decision window always opens with questions visible).
- Resizing the outline (TOC) panel.
- Per-folder remembered widths; one global width and collapsed state.
- Animated transitions beyond what CSS provides for free.
- Touch gesture support.
