use notify::RecommendedWatcher;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;

use crate::scan::is_markdown_ext;
use crate::AppState;

pub(crate) fn start_watcher(watch_dir: &Path, app: tauri::AppHandle) -> Debouncer<RecommendedWatcher> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut debouncer = new_debouncer(Duration::from_millis(200), tx).expect("Failed to create watcher");
    debouncer
        .watcher()
        .watch(watch_dir, RecursiveMode::NonRecursive)
        .expect("Failed to watch directory");

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

    debouncer
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
                    let current = app.state::<Mutex<AppState>>().lock().unwrap().file_path.clone();
                    let current_touched = events.iter().any(|e| e.path == current);
                    let structure_changed = events
                        .iter()
                        .any(|e| e.path != current && e.path.extension().is_some_and(is_markdown_ext));
                    if current_touched {
                        match std::fs::read_to_string(&current) {
                            Ok(content) => {
                                let _ = app.emit("file-changed", content);
                            }
                            Err(_) => {
                                let _ = app.emit("folder-changed", ());
                            }
                        }
                    }
                    if structure_changed {
                        let _ = app.emit("folder-changed", ());
                    }
                }
                Err(e) => eprintln!("Folder watch error: {:?}", e),
            }
        }
    });

    Some(debouncer)
}
