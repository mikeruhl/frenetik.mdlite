use notify::RecommendedWatcher;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;

use crate::scan::{compute_path_chain, is_markdown_ext, DirAncestor};
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

pub(crate) fn start_folder_watcher(folder_root: &Path, app: tauri::AppHandle) -> Option<Debouncer<RecommendedWatcher>> {
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

                        if event.path.extension().is_some_and(is_markdown_ext) {
                            let exists = event.path.is_file();
                            let path_chain = if exists {
                                folder_root
                                    .as_ref()
                                    .map(|root| compute_path_chain(root, &event.path))
                                    .unwrap_or_default()
                            } else {
                                vec![]
                            };

                            {
                                let mutex = app.state::<Mutex<AppState>>();
                                let mut state = mutex.lock().unwrap();
                                if exists {
                                    state.folder_files.insert(event.path.clone());
                                } else {
                                    state.folder_files.remove(&event.path);
                                }
                            }

                            changes.push(FolderChangeEntry {
                                path: crate::display_path(&event.path),
                                name: event
                                    .path
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default(),
                                exists,
                                path_chain,
                            });
                            continue;
                        }

                        // Non-markdown path (or one with no extension, like a directory).
                        // If it still exists, it's irrelevant to the nav tree. If it's
                        // gone, it may be a deleted directory - expand it into removals
                        // for every markdown file the registry tracked beneath it.
                        if event.path.exists() {
                            continue;
                        }

                        let removed_changes = {
                            let mutex = app.state::<Mutex<AppState>>();
                            let mut state = mutex.lock().unwrap();
                            removed_folder_change_entries(&event.path, &mut state.folder_files)
                        };
                        changes.extend(removed_changes);
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

    #[test]
    fn removed_folder_change_entries_expands_tracked_descendants() {
        let mut registry: HashSet<PathBuf> = HashSet::new();
        registry.insert(PathBuf::from(r"C:\root\docs\a.md"));
        registry.insert(PathBuf::from(r"C:\root\docs\sub\b.md"));
        registry.insert(PathBuf::from(r"C:\root\other.md"));

        let removed_dir = PathBuf::from(r"C:\root\docs");
        let mut entries = removed_folder_change_entries(&removed_dir, &mut registry);
        entries.sort_by(|a, b| a.path.cmp(&b.path));

        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|e| !e.exists));
        assert!(entries.iter().all(|e| e.path_chain.is_empty()));
        assert!(entries.iter().any(|e| e.path.ends_with("a.md")));
        assert!(entries.iter().any(|e| e.path.ends_with("b.md")));

        assert_eq!(registry.len(), 1);
        assert!(registry.contains(&PathBuf::from(r"C:\root\other.md")));
    }

    #[test]
    fn removed_folder_change_entries_noop_when_no_descendants_tracked() {
        let mut registry: HashSet<PathBuf> = HashSet::new();
        registry.insert(PathBuf::from(r"C:\root\other.md"));

        let removed_dir = PathBuf::from(r"C:\root\unrelated");
        let entries = removed_folder_change_entries(&removed_dir, &mut registry);

        assert!(entries.is_empty());
        assert_eq!(registry.len(), 1);
    }

    #[test]
    fn removed_folder_change_entries_does_not_match_sibling_with_shared_prefix() {
        let mut registry: HashSet<PathBuf> = HashSet::new();
        registry.insert(PathBuf::from(r"C:\root\docs-extra\c.md"));

        let removed_dir = PathBuf::from(r"C:\root\docs");
        let entries = removed_folder_change_entries(&removed_dir, &mut registry);

        assert!(entries.is_empty());
        assert_eq!(registry.len(), 1);
    }
}
