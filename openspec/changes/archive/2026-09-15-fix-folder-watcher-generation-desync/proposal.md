## Why

PR #87 fixed deleted files/folders sticking in the nav tree, but introduced a regression: new files and
folders created after a folder is opened often never appear in the nav tree until the user manually
rescans. Root cause: the folder watcher and the progressive folder scan share one atomic generation
counter (`SCAN_GENERATION`). `switch_to_folder` captures the counter's value as the watcher's `folder_gen`
guard, then immediately (via the `enter-folder-mode` -> `start_folder_scan` round trip) the scan bumps that
same counter again at its own start. The watcher's guard (`SCAN_GENERATION != folder_gen`) mismatches from
that point on and never resyncs, so the watcher silently drops every later filesystem event - both adds and
deletes - for the rest of that folder session. Only a full rescan (which rebuilds the tree from disk
directly, bypassing the watcher) reveals any change, which is why the delete fix appeared to work in manual
testing while live add detection quietly broke.

## What Changes

- Split the single `SCAN_GENERATION` counter into two: one that continues to gate progressive-scan
  cancellation/staleness (unchanged behavior), and a separate folder-session generation that only changes
  when the watched folder/file target itself changes (folder switch, file switch, app startup).
- Re-point the folder watcher's liveness guard at the folder-session generation instead of the scan
  generation, so starting or restarting a progressive scan (initial scan on open, or a manual rescan) no
  longer invalidates the live watcher.
- Add a regression test asserting the watcher's guard survives a scan-generation bump for the same folder
  session, and only trips on an actual folder/file switch.

## Capabilities

### New Capabilities

- `folder-navigation`: adds a requirement that live add/delete detection in the nav tree keeps working for
  the full lifetime of a folder session, including after the initial scan completes and after any manual
  rescan - not just in the brief window before the first scan starts. (Note: this capability's other
  requirements - creation/deletion detection themselves - are still pending archive from the earlier
  `fix-stale-nav-on-delete` change, which is why this is filed as an added requirement rather than a
  modification; once that change archives, consider folding this requirement into the base creation/
  deletion requirements instead of keeping it separate.)

## Impact

- `src-tauri/src/scan.rs`: introduce the folder-session generation atomic; `run_progressive_scan` keeps
  bumping only the scan generation.
- `src-tauri/src/watcher.rs`: `start_folder_watcher`'s per-batch guard reads the folder-session generation.
- `src-tauri/src/lib.rs`: `switch_to_folder`, `switch_file`, and the startup watcher wiring bump/read the
  folder-session generation when creating a watcher.
- No frontend changes required; `src/main.js` and `src/sidebar.js` event handling is unaffected.
- No new dependencies. No breaking changes to any command or event payload shape.
