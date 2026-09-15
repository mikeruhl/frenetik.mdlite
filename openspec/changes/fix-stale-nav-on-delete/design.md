## Context

Folder mode watches the opened directory recursively via `notify_debouncer_mini`
(`src-tauri/src/watcher.rs::start_folder_watcher`). Every ~300ms it batches raw filesystem events and, for each
event whose path has a markdown extension, emits a `FolderChangeEntry { path, name, exists, path_chain }` over
`folder-changed`. The frontend (`src/sidebar.js::applyFolderChanges`) walks these entries and adds/removes
single `.tree-file` DOM nodes, pruning now-empty ancestor `.tree-folder` nodes via `pruneEmptyAncestors`.

The gap: `event.path.extension().is_some_and(is_markdown_ext)` (watcher.rs:98) is checked before deciding
`exists`. A deleted directory's path has no extension, so its event is dropped unconditionally — the backend
never tells the frontend anything happened. If the OS/notify backend also fails to emit a synthetic per-file
remove event for every markdown file that lived under that directory (common on Windows when a whole subtree
is removed in one filesystem op), none of those files get removed from the tree either, since the frontend has
no independent notion of "this directory disappeared" — it only reacts to explicit per-path `exists:false`
entries.

There is no in-memory record on the Rust side today of what was scanned (`scan.rs` streams results straight to
the frontend during `start_folder_scan` and keeps no server-side tree). Rebuilding one is the crux of the fix.

## Goals / Non-Goals

**Goals:**

- When a directory under the watched root is deleted, every markdown file the frontend currently shows under
  that directory gets removed from the nav tree, plus the (now-empty) folder node itself.
- Works even when notify only reports the top-level directory removal and no per-child events.
- No full folder rescan required to recover (rescans remain available as a fallback / on next
  `enterFolderMode`).

**Non-Goals:**

- Tracking non-markdown files/directories in the tree (unchanged: sidebar only ever shows markdown files).
- Changing rename/move semantics.
- Building a persistent server-side cache beyond what's needed to resolve a directory-delete into its
  descendant file paths.

## Decisions

**Decision: Maintain a lightweight scanned-path registry in Rust (`AppState`), keyed by directory → set of
markdown file paths beneath it, populated during `start_folder_scan` and kept updated by the watcher itself.**
Alternative considered: have the frontend own this (it already has `folderNodeMap` and the DOM tree) and simply
do prefix-matching removal client-side whenever it receives _any_ `exists:false` entry, including for the
deleted directory's own path. Rejected as the primary fix because the backend currently drops directory-delete
events before the frontend ever sees them — the extension filter runs first. Fixing the filter (see next
decision) is necessary regardless; but the backend, not just the frontend, needs to resolve "this directory's
contents" since notify does not guarantee child events survive a bulk directory delete. The registry is small
(paths only, no content) and already mirrors data the frontend independently rebuilds — acceptable duplication
for correctness.

**Decision: Stop filtering out non-markdown-extension events outright.** Instead, for each raw event, check
`event.path.extension()`: if markdown, handle as before; if the path has no extension (or a non-markdown one)
and does not exist on disk, treat it as a possible directory removal and expand it via the registry into one
`FolderChangeEntry` per previously-known descendant file, all with `exists: false`.
Alternative considered: switch `RecursiveMode` handling or poll `fs::metadata` per event to distinguish
file-vs-directory pre-deletion. Rejected — by the time the debounced event fires, the path is already gone, so
there is no way to `stat` it to confirm it _was_ a directory; expanding via the registry sidesteps needing that
distinction entirely (if the registry has no entries under that prefix, it's a no-op, same as today for
irrelevant paths like `.git/`).

**Decision: Registry updates piggyback on the same event loop** — on any markdown-file `exists:false`, remove
it from the registry; on `exists:true`, insert it; on a resolved directory removal, remove all matched entries.
No separate maintenance pass.

**Decision: Frontend keeps its current single-file removal path for `applyFolderChanges` unchanged.** Since
the backend now expands a directory delete into one entry per descendant file, the existing per-file removal +
`pruneEmptyAncestors` logic already produces the correct final tree with no DOM-handling changes needed. This
was originally scoped as a frontend change in the proposal's impact list but the backend-side expansion makes
it unnecessary — simpler and lower risk than teaching the DOM code prefix-based subtree removal.

**Correction found during manual verification: `main.js`'s `folder-changed` listener needed a fix after all —
not to `applyFolderChanges`, but to how its caller batches events.** It debounced with `clearTimeout` +
`setTimeout(() => applyFolderChanges(event.payload), 500)`, which _replaces_ the pending payload on every new
event instead of accumulating it. A directory delete that (now correctly) expands into several
`FolderChangeEntry` values can arrive as multiple separate `folder-changed` emits (the Rust-side debouncer's
own 300ms window doesn't guarantee one batch); when two emits land within the JS-side 500ms window, only the
later payload was ever applied — earlier entries (e.g. root-level file creates from the initial scan racing a
watcher event) were silently dropped, permanently (nothing re-triggers them). Fixed by accumulating all
payloads received during the window into a queue and applying the union once the timer fires, instead of
replacing. This is a pre-existing defect in `main.js`, not new code from this change, but this change's added
watcher activity made it much more likely to trigger.

## Risks / Trade-offs

- [Risk] Registry drifts from actual disk/DOM state over time (e.g., missed event) → Mitigation:
  `resetSidebarForRescan` / re-entering folder mode already does a full rescan which repopulates both the DOM
  and the registry from scratch; drift is self-healing on next scan, matching existing behavior for other edge
  cases.
- [Risk] Large folders make the registry non-trivial memory (paths only, one `HashSet<PathBuf>` per root) →
  Mitigation: same order of magnitude as what the frontend already holds in `folderNodeMap`/DOM; markdown-only
  files, not full tree metadata.
- [Risk] A non-directory, non-markdown file delete (e.g. `.png`) could now be misinterpreted as a "directory
  removal" attempt → Mitigation: expansion is a no-op when no registry entries match that path prefix, so it's
  harmless; still correctly ignored as before.

## Migration Plan

No data migration. Ship as a single PR touching `watcher.rs` (+ `AppState`/`lib.rs` for the new registry field)
and `scan.rs` (populate registry during scan), plus the `main.js` debounce fix found during manual testing.
Rollback is a plain revert; no persisted state format changes.

## Open Questions

None — scope is narrow enough to resolve during implementation.
