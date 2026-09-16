## Context

See proposal.md - Why for the root cause narrative. In short: `src-tauri/src/scan.rs` defines a single
`static SCAN_GENERATION: AtomicU64`. Three call sites bump it: `switch_to_folder`/`switch_file` (folder or
file target changes), `cancel_folder_scan` (leaving folder mode), and `run_progressive_scan` itself (every
scan start, including the initial scan right after a folder opens and every manual rescan). Two consumers
read it: `run_progressive_scan`'s own loop (to abort a stale scan) and `start_folder_watcher`'s per-batch
guard (to stop a stale watcher from touching state after its folder has been replaced).

`switch_to_folder` captures `folder_gen` from `SCAN_GENERATION` and hands it to `start_folder_watcher`
_before_ the frontend's `enter-folder-mode` handler asynchronously invokes `start_folder_scan`, which calls
`run_progressive_scan`, which immediately bumps the counter again. The watcher's captured `folder_gen` is
never updated after that, so its guard (`SCAN_GENERATION.load() != folder_gen`) trips within moments of
every folder open and stays tripped for the rest of that session - the watcher thread keeps running and
receiving events, but every batch is discarded via `continue`.

## Goals / Non-Goals

**Goals:**

- Make the folder watcher's liveness independent of how many times a scan has run for the same folder.
- Preserve the existing scan-cancellation behavior exactly as-is (a new scan for the same folder must still
  abort a still-running previous scan; a folder/file switch must still abort any in-flight scan for the old
  target).
- Keep the fix small and localized to generation bookkeeping - no change to the watcher's event
  classification logic (add/remove/registry expansion) added in #87.

**Non-Goals:**

- Not reworking how `folder_files` registry population happens during scans.
- Not changing the debounce windows or event payload shapes.
- Not addressing unrelated notify-crate limitations (e.g. a deeply nested directory tree created and
  populated in a single burst before the recursive watch can register on the new subdirectories) - out of
  scope for this fix, which targets the generation-counter regression specifically.

## Decisions

**Introduce a second atomic, `FOLDER_GEN`, dedicated to folder/file target identity.**

- `SCAN_GENERATION` keeps its current meaning and all current bump sites/semantics for scan cancellation.
- `FOLDER_GEN` bumps only where the watched target itself changes: `switch_to_folder`, `switch_file`, and
  the app-startup folder wiring in `lib.rs::run()`. `cancel_folder_scan` and `run_progressive_scan` do not
  touch it.
- `start_folder_watcher` takes a `folder_gen` value read from `FOLDER_GEN` (instead of `SCAN_GENERATION`) at
  creation time, and its per-batch guard checks `FOLDER_GEN.load() != folder_gen`.

Alternative considered: have the watcher re-read a _shared, mutable_ "current generation" cell each batch
instead of comparing against a captured snapshot, and have `switch_to_folder` update that cell when
replacing the watcher. Rejected - it's equivalent in effect to the two-atomic approach but requires
threading a `&AtomicU64`/interior-mutability handle through `AppState` instead of a plain `u64` capture,
adding complexity without a behavioral difference.

Alternative considered: don't bump `SCAN_GENERATION` inside `run_progressive_scan` at all, and instead have
callers (`start_folder_scan` command, `switch_to_folder`) bump it explicitly before invoking the scan.
Rejected - `run_progressive_scan` bumping its own generation at the top is what lets it detect and discard
results from an _overlapping_ previous scan of the same folder (e.g. two rapid rescans); moving that
responsibility to callers is a larger change with no benefit for this bug.

**Placement:** define `FOLDER_GEN` alongside `SCAN_GENERATION` in `scan.rs` (both are scan/watcher
bookkeeping primitives used across `lib.rs` and `watcher.rs`) and export it the same way.

## Risks / Trade-offs

- [Risk] Two similarly-named atomics (`SCAN_GENERATION`, `FOLDER_GEN`) could be confused by future
  contributors and bumped at the wrong site, reintroducing a similar bug. → Mitigation: doc comments on
  each atomic stating exactly what it gates and which call sites are allowed to bump it; the regression
  test in tasks.md pins the current watcher/scan-restart behavior so a future misuse fails CI.
- [Risk] A currently-open folder's watcher was already permanently dead before this fix ships (for any user
  session started before the fix). → Mitigation: none needed - the fix takes effect on next folder open,
  which already happens naturally (users don't keep the app running indefinitely across updates), and there
  is no persisted state to migrate.

## Migration Plan

No data migration. This is an in-process bookkeeping fix confined to `src-tauri`. Roll out via normal
release; rollback is a plain revert since no schema, config, or on-disk format changes.
