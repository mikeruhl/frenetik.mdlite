## Why

Documents render inside a theme-defined maximum width that mirrors a printed page. On wide monitors, wide tables, code
blocks, and diagrams are cramped while most of the window is empty. Readers need to choose between the paper-like
layout and one that uses the full window.

## What Changes

- A **Full Width** check item in the View menu removes the theme's maximum content width so the Document fills the
  window, keeping a side margin of at least 2rem.
- The setting is persisted and restored on startup. Default is off (current paper-like layout).
- Print and PDF export are unaffected; they already use the full printable width.

## Capabilities

### New Capabilities

- `reading-layout`: Full Width setting, persistence, and its effect on screen rendering.

## Non-goals

- A keyboard shortcut for the toggle.
- Custom or user-entered widths, or more than two layout modes.
- Letting wide elements break out of the paper width while in paper layout.
- Adding a maximum width to the Splendor theme, which has none today; the toggle has no visible effect there.
- Any change to print or PDF layout.
