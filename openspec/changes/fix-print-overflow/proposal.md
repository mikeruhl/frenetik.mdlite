## Why

Printed and PDF-exported Documents show scrollbars on tables wider than the page, and the columns past the right edge
are cut off. `github-markdown-css` makes every table a scroll box (`display: block; overflow: auto`), and the print
styles never undo it. Retro, Modest, and Splendor also give code blocks `overflow-x: scroll`, which draws a scrollbar
track in print even when nothing overflows.

## What Changes

- In print, tables lay out as real tables limited to the page width, and cell text wraps instead of being clipped.
- In print, code blocks never show scrollbars.

## Capabilities

### Modified Capabilities

- `print-readiness`: printed output contains no scrollbars and no clipped table columns.

## Non-goals

- Scaling down the font of very wide tables to fit the page.
- Landscape or custom page sizes.
- Any change to on-screen layout.
