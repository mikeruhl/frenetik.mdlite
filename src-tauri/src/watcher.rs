use notify::RecommendedWatcher;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;

use crate::scan::{compute_path_chain, is_markdown_ext, DirAncestor, FOLDER_GEN};
use crate::AppState;

#[derive(Serialize, Clone)]
pub(crate) struct FolderChangeEntry {
    path: String,
    name: String,
    exists: bool,
    path_chain: Vec<DirAncestor>,
}

/// Resolves a filesystem path that no longer exists (typically a deleted
/// directory) into removal entries for every markdown file the `registry`
/// previously tracked beneath it. Matched paths are removed from `registry`.
/// A no-op (empty result) when `removed_path` has no tracked descendants,
/// which also covers unrelated non-markdown deletes.
pub(crate) fn removed_folder_change_entries(
    removed_path: &Path,
    registry: &mut HashSet<PathBuf>,
) -> Vec<FolderChangeEntry> {
    let matches: Vec<PathBuf> = registry
        .iter()
        .filter(|p| p.starts_with(removed_path))
        .cloned()
        .collect();
    for m in &matches {
        registry.remove(m);
    }
    matches
        .into_iter()
        .map(|path| FolderChangeEntry {
            path: crate::display_path(&path),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            exists: false,
            path_chain: vec![],
        })
        .collect()
}

pub(crate) fn start_watcher(watch_dir: &Path, app: tauri::AppHandle) -> Option<Debouncer<RecommendedWatcher>> {
    let (tx, rx) = std::sync::mpsc::channel();
    let Ok(mut debouncer) = new_debouncer(Duration::from_millis(200), tx) else {
        eprintln!("Failed to create file watcher");
        return None;
    };
    if let Err(e) = debouncer.watcher().watch(watch_dir, RecursiveMode::NonRecursive) {
        eprintln!("Failed to watch {:?}: {:?}", watch_dir, e);
        return None;
    }

    std::thread::spawn(move || {
        for result in rx {
            match result {
                Ok(events) => {
                    let current = app.state::<Mutex<AppState>>().lock().unwrap().file_path.clone();
                    if events.iter().any(|e| e.path == current) {
                        if let Ok(content) = std::fs::read_to_string(&current) {
                            let _ = app.emit("file-changed", content);
                        }
                    }
                }
                Err(e) => eprintln!("Watch error: {:?}", e),
            }
        }
    });

    Some(debouncer)
}

/// Whether a folder watcher batch tagged with `folder_gen` should be discarded because the
/// watched target has moved on since the watcher was created. Only `FOLDER_GEN` (a real
/// folder/file switch) invalidates a watcher - a scan restart for the same folder only bumps
/// `SCAN_GENERATION`, which this deliberately ignores.
fn folder_watcher_is_stale(folder_gen: u64) -> bool {
    FOLDER_GEN.load(Ordering::Relaxed) != folder_gen
}

pub(crate) fn start_folder_watcher(
    folder_root: &Path,
    app: tauri::AppHandle,
    folder_gen: u64,
) -> Option<Debouncer<RecommendedWatcher>> {
    let (tx, rx) = std::sync::mpsc::channel();
    let Ok(mut debouncer) = new_debouncer(Duration::from_millis(300), tx) else {
        eprintln!("Failed to create folder watcher");
        return None;
    };
    if let Err(e) = debouncer.watcher().watch(folder_root, RecursiveMode::Recursive) {
        eprintln!("Failed to watch folder {:?}: {:?}", folder_root, e);
        return None;
    }

    std::thread::spawn(move || {
        for result in rx {
            match result {
                Ok(events) => {
                    // This watcher's root may have been superseded by a folder switch
                    // (switch_to_folder/switch_file bump FOLDER_GEN before replacing this
                    // debouncer). Events already queued before that replacement can still
                    // arrive here; discard the whole batch rather than let a stale watcher
                    // mutate the new folder's registry.
                    if folder_watcher_is_stale(folder_gen) {
                        continue;
                    }

                    let (current, folder_root) = {
                        let mutex = app.state::<Mutex<AppState>>();
                        let state = mutex.lock().unwrap();
                        (state.file_path.clone(), state.folder_path.clone())
                    };

                    let current_touched = events.iter().any(|e| e.path == current);
                    if current_touched {
                        if let Ok(content) = std::fs::read_to_string(&current) {
                            let _ = app.emit("file-changed", content);
                        }
                    }

                    let mut changes: Vec<FolderChangeEntry> = Vec::new();

                    if current_touched && !current.is_file() {
                        {
                            let mutex = app.state::<Mutex<AppState>>();
                            let mut state = mutex.lock().unwrap();
                            state.folder_files.remove(&current);
                        }
                        changes.push(FolderChangeEntry {
                            path: crate::display_path(&current),
                            name: current
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_default(),
                            exists: false,
                            path_chain: vec![],
                        });
                    }

                    for event in &events {
                        if event.path == current {
                            continue;
                        }

                        if event.path.is_file() && event.path.extension().is_some_and(is_markdown_ext) {
                            let path_chain = folder_root
                                .as_ref()
                                .map(|root| compute_path_chain(root, &event.path))
                                .unwrap_or_default();

                            {
                                let mutex = app.state::<Mutex<AppState>>();
                                let mut state = mutex.lock().unwrap();
                                state.folder_files.insert(event.path.clone());
                            }

                            changes.push(FolderChangeEntry {
                                path: crate::display_path(&event.path),
                                name: event
                                    .path
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default(),
                                exists: true,
                                path_chain,
                            });
                            continue;
                        }

                        // Not currently an existing file - a deleted markdown file, a deleted
                        // directory (including one with a markdown-looking name like `docs.md`),
                        // or an unrelated path that still exists. `removed_folder_change_entries`
                        // self-matches (a path is its own prefix), so a single deleted file is
                        // handled the same way as a deleted directory's tracked descendants; an
                        // existing, irrelevant path or one with no tracked descendants is a no-op.
                        if event.path.exists() {
                            continue;
                        }

                        let removed_changes = {
                            let mutex = app.state::<Mutex<AppState>>();
                            let mut state = mutex.lock().unwrap();
                            removed_folder_change_entries(&event.path, &mut state.folder_files)
                        };
                        changes.extend(removed_changes);

                        // Safety net: if the deleted path itself looks like a markdown file,
                        // always emit its own removal directly, even if the registry didn't
                        // have it tracked (e.g. deleted before the scan ever registered it).
                        // Deduped below against any matching entry the expansion already found.
                        if event.path.extension().is_some_and(is_markdown_ext) {
                            changes.push(FolderChangeEntry {
                                path: crate::display_path(&event.path),
                                name: event
                                    .path
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default(),
                                exists: false,
                                path_chain: vec![],
                            });
                        }
                    }

                    let mut seen = std::collections::HashSet::new();
                    changes.retain(|c| seen.insert(c.path.clone()));

                    if !changes.is_empty() {
                        let _ = app.emit("folder-changed", changes);
                    }
                }
                Err(e) => eprintln!("Folder watch error: {:?}", e),
            }
        }
    });

    Some(debouncer)
}

#[cfg(test)]
mod tests {
    use super::*;

    // FOLDER_GEN and SCAN_GENERATION are process-global statics shared across the whole test
    // binary. No other test in this crate touches them, but the two tests below both do, and
    // cargo runs tests in parallel by default - so they share this lock to stay serialized
    // against each other and avoid a read-modify-read race on the same generation value.
    static GEN_TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn folder_watcher_guard_ignores_scan_generation_bumps() {
        let _guard = GEN_TEST_LOCK.lock().unwrap();
        let folder_gen = FOLDER_GEN.load(Ordering::Relaxed);
        assert!(!folder_watcher_is_stale(folder_gen));

        // A scan restart (initial scan, manual rescan) for the same folder only bumps
        // SCAN_GENERATION - this must not be mistaken for a folder/file switch.
        crate::scan::SCAN_GENERATION.fetch_add(1, Ordering::Relaxed);
        assert!(
            !folder_watcher_is_stale(folder_gen),
            "a scan restart must not invalidate the folder watcher"
        );
    }

    #[test]
    fn folder_watcher_guard_trips_on_folder_gen_bump() {
        let _guard = GEN_TEST_LOCK.lock().unwrap();
        let folder_gen = FOLDER_GEN.load(Ordering::Relaxed);
        FOLDER_GEN.fetch_add(1, Ordering::Relaxed);
        assert!(
            folder_watcher_is_stale(folder_gen),
            "a real folder/file switch must invalidate the folder watcher"
        );
    }

    #[test]
    fn removed_folder_change_entries_expands_tracked_descendants() {
        let root = PathBuf::from("root");
        let mut registry: HashSet<PathBuf> = HashSet::new();
        registry.insert(root.join("docs").join("a.md"));
        registry.insert(root.join("docs").join("sub").join("b.md"));
        registry.insert(root.join("other.md"));

        let removed_dir = root.join("docs");
        let mut entries = removed_folder_change_entries(&removed_dir, &mut registry);
        entries.sort_by(|a, b| a.path.cmp(&b.path));

        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|e| !e.exists));
        assert!(entries.iter().all(|e| e.path_chain.is_empty()));
        assert!(entries.iter().any(|e| e.path.ends_with("a.md")));
        assert!(entries.iter().any(|e| e.path.ends_with("b.md")));

        assert_eq!(registry.len(), 1);
        assert!(registry.contains(&root.join("other.md")));
    }

    #[test]
    fn removed_folder_change_entries_noop_when_no_descendants_tracked() {
        let root = PathBuf::from("root");
        let mut registry: HashSet<PathBuf> = HashSet::new();
        registry.insert(root.join("other.md"));

        let removed_dir = root.join("unrelated");
        let entries = removed_folder_change_entries(&removed_dir, &mut registry);

        assert!(entries.is_empty());
        assert_eq!(registry.len(), 1);
    }

    #[test]
    fn removed_folder_change_entries_does_not_match_sibling_with_shared_prefix() {
        let root = PathBuf::from("root");
        let mut registry: HashSet<PathBuf> = HashSet::new();
        registry.insert(root.join("docs-extra").join("c.md"));

        let removed_dir = root.join("docs");
        let entries = removed_folder_change_entries(&removed_dir, &mut registry);

        assert!(entries.is_empty());
        assert_eq!(registry.len(), 1);
    }

    #[test]
    fn directory_named_with_markdown_extension_is_not_a_file() {
        // Guards the precondition the watcher relies on: a directory literally
        // named `docs.md` must be routed through the descendant-expansion path
        // (event.path.is_file() == false), not treated as a single markdown file
        // just because its extension matches.
        let tmp = tempfile::TempDir::new().unwrap();
        let dir_with_md_name = tmp.path().join("docs.md");
        std::fs::create_dir(&dir_with_md_name).unwrap();

        assert!(dir_with_md_name.extension().is_some_and(is_markdown_ext));
        assert!(!dir_with_md_name.is_file());
        assert!(dir_with_md_name.is_dir());
    }
}
