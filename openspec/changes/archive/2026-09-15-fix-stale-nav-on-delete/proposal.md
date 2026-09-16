## Why

In folder mode, deleting a file or folder on disk (outside the app, or via another process) sometimes leaves a
stale entry in the left navigation tree. Root cause: the folder watcher (`src-tauri/src/watcher.rs`) filters
filesystem events by markdown extension before reporting them, so directory-removal events (which have no
extension) are silently dropped and never reach the frontend as an `exists: false` change. The frontend
(`src/sidebar.js`) only prunes tree nodes it is explicitly told no longer exist, so it has no way to notice the
deletion.

## What Changes

- Folder watcher no longer discards non-markdown-extension events outright; directory removal events are
  detected and expanded into a removal for every tracked descendant path.
- The backend now keeps a small registry of markdown files known to exist under the open folder, so a deleted
  directory's own event (often the only one notify reports) can be resolved into per-file `folder-changed`
  entries without needing a fresh full rescan.
- `src/sidebar.js`'s existing per-file removal + empty-ancestor pruning handles those entries unchanged, since
  the backend now expands directory deletes into per-file entries before they reach the frontend.
- No visible change to markdown-file-level delete/create/rename handling, which already worked correctly.

## Capabilities

### New Capabilities

- `folder-navigation`: Live navigation tree behavior in folder mode, including staying in sync with the
  filesystem when files or folders are created/deleted while the app is open (no existing spec covers this yet).

### Modified Capabilities

(none)

## Non-goals

- Not addressing performance of large-folder initial scans.
- Not changing behavior for file renames/moves (already handled via separate remove+add events).
- Not adding a manual "refresh tree" button as a workaround; the fix targets the watcher/event pipeline directly.

## Impact

- `src-tauri/src/watcher.rs`: `start_folder_watcher` event filtering and `FolderChangeEntry` construction.
- `src-tauri/src/scan.rs`: new markdown-path registry population, shared with the watcher.
- `src-tauri/src/lib.rs`: `AppState.folder_files` registry field.
- `src/main.js`: `folder-changed` listener now accumulates payloads across its debounce window instead of
  discarding all but the latest (found during manual verification — a pre-existing defect this change's added
  watcher activity made easy to trigger).
- `src/sidebar.js`: unchanged — the backend expands directory deletes into per-file entries, so the existing
  per-file removal path handles them.
- No new dependencies, no API/schema changes visible outside the app.
