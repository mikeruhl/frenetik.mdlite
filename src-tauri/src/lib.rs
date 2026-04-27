mod commands;
mod config;
mod export;
mod jumplist;
mod menu;
mod scan;
mod watcher;

use notify::RecommendedWatcher;
use notify_debouncer_mini::Debouncer;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_cli::CliExt;
use tauri_plugin_dialog::DialogExt;

use commands::*;
use config::*;
use menu::*;
use scan::find_default_file;
use watcher::*;

#[derive(Clone, PartialEq)]
pub(crate) enum AppMode {
    Empty,
    File,
    Folder,
}

pub(crate) struct AppState {
    pub(crate) mode: AppMode,
    pub(crate) file_path: PathBuf,
    pub(crate) folder_path: Option<PathBuf>,
    pub(crate) current_theme: String,
    pub(crate) print_header: bool,
    pub(crate) show_hidden_files: bool,
    pub(crate) show_outline: bool,
    pub(crate) debouncer: Option<Debouncer<RecommendedWatcher>>,
    pub(crate) folder_debouncer: Option<Debouncer<RecommendedWatcher>>,
    pub(crate) startup_error: Option<String>,
}

pub(crate) fn display_path(p: &Path) -> String {
    let s = p.to_string_lossy().to_string();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

pub(crate) fn switch_file(app: &tauri::AppHandle, new_path_str: &str) {
    let new_path = PathBuf::from(new_path_str);
    if !new_path.exists() {
        let recent = store_prune_recent(app);
        let recent_folders = store_prune_recent_folders(app);
        jumplist::update_jump_list(&recent, &recent_folders);
        let theme = app.state::<Mutex<AppState>>().lock().unwrap().current_theme.clone();
        rebuild_menu(app, &recent, &theme);
        return;
    }

    let (needs_new_watcher, was_not_file) = {
        let state = app.state::<Mutex<AppState>>();
        let mut s = state.lock().unwrap();
        let old_dir = s.file_path.parent().map(|p| p.to_path_buf());
        let new_dir = new_path.parent().map(|p| p.to_path_buf());
        let was_other = s.mode != AppMode::File;
        s.file_path = new_path.clone();
        s.mode = AppMode::File;
        s.folder_path = None;
        s.folder_debouncer = None;
        s.startup_error = None;
        (old_dir != new_dir || was_other, was_other)
    };

    if was_not_file {
        let _ = app.emit("enter-file-mode", ());
    }

    if needs_new_watcher {
        let watch_dir = new_path.parent().unwrap_or(&new_path).to_path_buf();
        app.state::<Mutex<AppState>>().lock().unwrap().debouncer = start_watcher(&watch_dir, app.clone());
    }

    let name = new_path.file_name().unwrap_or_default().to_string_lossy();
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&format!("mdlite — {}", name));
    }

    if let Ok(content) = std::fs::read_to_string(&new_path) {
        let _ = app.emit("file-changed", content);
    }

    let recent = store_add_recent(app, &new_path);
    jumplist::notify_recent_doc(&new_path);
    let recent_folders = store_get_recent_folders(app);
    jumplist::update_jump_list(&recent, &recent_folders);
    let theme = app.state::<Mutex<AppState>>().lock().unwrap().current_theme.clone();
    rebuild_menu(app, &recent, &theme);
}

pub(crate) fn switch_to_folder(app: &tauri::AppHandle, folder_path: PathBuf) {
    let folder_path = std::fs::canonicalize(&folder_path).unwrap_or(folder_path);
    let default_file = find_default_file(&folder_path);
    let file_path = default_file.clone().unwrap_or_default();

    {
        let state = app.state::<Mutex<AppState>>();
        let mut s = state.lock().unwrap();
        s.mode = AppMode::Folder;
        s.folder_path = Some(folder_path.clone());
        s.file_path = file_path.clone();
        s.startup_error = None;
    }

    let folder_name = folder_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    if let Some(w) = app.get_webview_window("main") {
        if let Some(ref df) = default_file {
            let file_name = df.file_name().unwrap_or_default().to_string_lossy();
            let _ = w.set_title(&format!("mdlite — {} — {}", folder_name, file_name));
        } else {
            let _ = w.set_title(&format!("mdlite — {}", folder_name));
        }
        let _ = w.set_size(tauri::LogicalSize::new(1100.0, 700.0));
    }

    {
        let state = app.state::<Mutex<AppState>>();
        let mut s = state.lock().unwrap();
        s.debouncer = None;
        s.folder_debouncer = start_folder_watcher(&folder_path, app.clone());
    }

    let recent_folders = store_add_recent_folder(app, &folder_path);
    let recent_files = store_get_recent(app);
    jumplist::update_jump_list(&recent_files, &recent_folders);

    let _ = app.emit("enter-folder-mode", ());

    if let Some(ref df) = default_file {
        if let Ok(content) = std::fs::read_to_string(df) {
            let _ = app.emit("file-changed", content);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_file,
            get_mode,
            get_startup_error,
            open_folder_file,
            start_folder_scan,
            cancel_folder_scan,
            notify_outline_closed,
            export::export_pdf
        ])
        .setup(|app| {
            migrate_legacy_config(app.handle());
            migrate_store_keys(app.handle());

            let matches = app.cli().matches().expect("Failed to parse CLI arguments");
            let path_arg = matches
                .args
                .get("path")
                .and_then(|a| a.value.as_str())
                .filter(|s| !s.is_empty());

            let (mode, file_path, folder_path, startup_error) = if let Some(arg) = path_arg {
                match std::fs::canonicalize(arg) {
                    Ok(input_path) => {
                        if input_path.is_dir() {
                            let default_file = find_default_file(&input_path);
                            (
                                AppMode::Folder,
                                default_file.unwrap_or_default(),
                                Some(input_path),
                                None,
                            )
                        } else {
                            (AppMode::File, input_path, None, None)
                        }
                    }
                    Err(_) => {
                        let msg = format!("File not found: {}", arg);
                        eprintln!("{}", msg);
                        (AppMode::Empty, PathBuf::new(), None, Some(msg))
                    }
                }
            } else {
                (AppMode::Empty, PathBuf::new(), None, None)
            };

            if let Some(w) = app.get_webview_window("main") {
                match mode {
                    AppMode::Folder => {
                        let folder_name = folder_path
                            .as_ref()
                            .and_then(|p| p.file_name())
                            .unwrap_or_default()
                            .to_string_lossy();
                        if !file_path.as_os_str().is_empty() {
                            let file_name = file_path.file_name().unwrap_or_default().to_string_lossy();
                            let _ = w.set_title(&format!("mdlite — {} — {}", folder_name, file_name));
                        } else {
                            let _ = w.set_title(&format!("mdlite — {}", folder_name));
                        }
                        let _ = w.set_size(tauri::LogicalSize::new(1100.0, 700.0));
                    }
                    AppMode::File => {
                        let filename = file_path.file_name().unwrap_or_default().to_string_lossy();
                        let _ = w.set_title(&format!("mdlite — {}", filename));
                    }
                    AppMode::Empty => {}
                }
            }

            let theme = store_get_theme(app.handle());
            let print_header = store_get_print_header(app.handle());
            let show_hidden_files = store_get_show_hidden_files(app.handle());
            let recent = if mode == AppMode::File {
                store_prune_recent(app.handle());
                store_add_recent(app.handle(), &file_path)
            } else {
                store_prune_recent(app.handle())
            };
            let recent_folders = if mode == AppMode::Folder {
                store_prune_recent_folders(app.handle());
                store_add_recent_folder(app.handle(), folder_path.as_ref().unwrap())
            } else {
                store_prune_recent_folders(app.handle())
            };

            jumplist::init_platform(app.handle());

            if mode == AppMode::File {
                jumplist::notify_recent_doc(&file_path);
            }
            jumplist::update_jump_list(&recent, &recent_folders);

            let show_outline = false;
            let menu = build_menu(
                app.handle(),
                &recent,
                &theme,
                print_header,
                show_hidden_files,
                show_outline,
            )?;
            app.set_menu(menu)?;

            let folder_path_for_watch = folder_path.clone();
            app.manage(Mutex::new(AppState {
                mode: mode.clone(),
                file_path: file_path.clone(),
                folder_path,
                current_theme: theme,
                print_header,
                show_hidden_files,
                show_outline,
                debouncer: None,
                folder_debouncer: None,
                startup_error,
            }));

            if mode == AppMode::Folder {
                if let Some(ref fp) = folder_path_for_watch {
                    app.state::<Mutex<AppState>>().lock().unwrap().folder_debouncer =
                        start_folder_watcher(fp, app.handle().clone());
                }
            } else if !file_path.as_os_str().is_empty() {
                let watch_dir = file_path.parent().unwrap_or(&file_path).to_path_buf();
                app.state::<Mutex<AppState>>().lock().unwrap().debouncer =
                    start_watcher(&watch_dir, app.handle().clone());
            }

            app.on_menu_event(|handle, event| {
                let id: &str = &event.id().0;
                if id == "open-file" {
                    let handle = handle.clone();
                    handle
                        .dialog()
                        .file()
                        .add_filter("Markdown", &["md", "markdown", "mdx", "txt"])
                        .pick_file(move |picked| {
                            if let Some(fp) = picked {
                                if let Ok(p) = fp.into_path() {
                                    let path_str = p.to_string_lossy().to_string();
                                    switch_file(&handle, &path_str);
                                }
                            }
                        });
                } else if id == "open-folder" {
                    let handle = handle.clone();
                    handle.dialog().file().pick_folder(move |picked| {
                        if let Some(fp) = picked {
                            if let Ok(p) = fp.into_path() {
                                switch_to_folder(&handle, p);
                            }
                        }
                    });
                } else if id == "clear-recent" {
                    store_set_recent(handle, &[]);
                    store_set_recent_folders(handle, &[]);
                    jumplist::update_jump_list(&[], &[]);
                    let theme = handle.state::<Mutex<AppState>>().lock().unwrap().current_theme.clone();
                    rebuild_menu(handle, &[], &theme);
                } else if let Some(idx_str) = id.strip_prefix("recent-") {
                    if let Ok(idx) = idx_str.parse::<usize>() {
                        let recent = store_get_recent(handle);
                        if let Some(path) = recent.get(idx).cloned() {
                            switch_file(handle, &path);
                        }
                    }
                } else if id == "zoom-in" || id == "zoom-out" || id == "zoom-reset" {
                    let current = store_get_zoom(handle);
                    let new_zoom = match id {
                        "zoom-in" => (current + ZOOM_STEP).min(MAX_ZOOM),
                        "zoom-out" => current.saturating_sub(ZOOM_STEP).max(MIN_ZOOM),
                        _ => DEFAULT_ZOOM,
                    };
                    store_set_zoom(handle, new_zoom);
                    let _ = handle.emit("set-zoom", new_zoom);
                } else if id == "navigate-back" {
                    let _ = handle.emit("navigate-back", ());
                } else if id == "navigate-forward" {
                    let _ = handle.emit("navigate-forward", ());
                } else if id == "print" {
                    let _ = handle.emit("print", ());
                } else if id == "export-pdf" {
                    export::show_export_dialog(handle);
                } else if id == "find" {
                    let _ = handle.emit("open-search", ());
                } else if id == "toggle-outline" {
                    {
                        let state = handle.state::<Mutex<AppState>>();
                        let mut s = state.lock().unwrap();
                        s.show_outline = !s.show_outline;
                    }
                    let _ = handle.emit("toggle-outline", ());
                } else if id == "toggle-print-header" {
                    let new_val = {
                        let state = handle.state::<Mutex<AppState>>();
                        let mut s = state.lock().unwrap();
                        s.print_header = !s.print_header;
                        s.print_header
                    };
                    store_set_print_header(handle, new_val);
                    let _ = handle.emit("set-print-header", new_val);
                } else if id == "toggle-show-hidden-files" {
                    let (new_val, in_folder_mode) = {
                        let state = handle.state::<Mutex<AppState>>();
                        let mut s = state.lock().unwrap();
                        s.show_hidden_files = !s.show_hidden_files;
                        (s.show_hidden_files, s.mode == AppMode::Folder)
                    };
                    store_set_show_hidden_files(handle, new_val);
                    let _ = handle.emit("set-show-hidden-files", new_val);
                    if in_folder_mode {
                        let _ = handle.emit("rescan-folder", ());
                    }
                } else if let Some(theme_id) = id.strip_prefix("theme-") {
                    store_set_theme(handle, theme_id);
                    handle.state::<Mutex<AppState>>().lock().unwrap().current_theme = theme_id.to_string();
                    let recent = store_get_recent(handle);
                    rebuild_menu(handle, &recent, theme_id);
                    let _ = handle.emit("set-theme", theme_id);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
