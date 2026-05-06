use notify::RecommendedWatcher;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use serde::Serialize;
use std::path::Path;
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
                        if !event.path.extension().is_some_and(is_markdown_ext) {
                            continue;
                        }
                        let exists = event.path.is_file();
                        let path_chain = if exists {
                            folder_root
                                .as_ref()
                                .map(|root| compute_path_chain(root, &event.path))
                                .unwrap_or_default()
                        } else {
                            vec![]
                        };
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
