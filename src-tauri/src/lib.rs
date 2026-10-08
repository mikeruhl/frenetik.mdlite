mod commands;
mod config;
mod export;
mod interactive;
mod jumplist;
mod menu;
mod scan;
mod updater;
mod watcher;

use notify::RecommendedWatcher;
use notify_debouncer_mini::Debouncer;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_cli::CliExt;
use tauri_plugin_dialog::DialogExt;

use commands::*;
use config::*;
use interactive::{InteractiveResult, InteractiveSession, RESULT_GATE};
use menu::*;
use scan::{find_default_file, FOLDER_GEN, SCAN_GENERATION};
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
    pub(crate) folder_files: HashSet<PathBuf>,
    pub(crate) current_theme: String,
    pub(crate) print_header: bool,
    pub(crate) show_hidden_files: bool,
    pub(crate) show_outline: bool,
    pub(crate) show_frontmatter: bool,
    pub(crate) has_frontmatter: bool,
    pub(crate) debouncer: Option<Debouncer<RecommendedWatcher>>,
    pub(crate) folder_debouncer: Option<Debouncer<RecommendedWatcher>>,
    pub(crate) startup_error: Option<String>,
    pub(crate) interactive: Option<InteractiveSession>,
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
        // Bump the generation before clearing so any in-flight folder scan or folder
        // watcher (still tagged with the old generation) stops touching this state.
        SCAN_GENERATION.fetch_add(1, Ordering::Relaxed);
        FOLDER_GEN.fetch_add(1, Ordering::Relaxed);
        s.file_path = new_path.clone();
        s.mode = AppMode::File;
        s.folder_path = None;
        s.folder_files.clear();
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

    let folder_gen = {
        let state = app.state::<Mutex<AppState>>();
        let mut s = state.lock().unwrap();
        // Bump the generation before clearing so any in-flight scan or watcher from
        // the previous folder (still tagged with the old generation) stops touching
        // this state instead of repopulating it after the switch.
        SCAN_GENERATION.fetch_add(1, Ordering::Relaxed);
        // FOLDER_GEN identifies the watched target itself; the watcher created below is
        // tagged with this value so a later scan restart (which only bumps
        // SCAN_GENERATION) doesn't invalidate it - only a real folder/file switch does.
        let folder_gen = FOLDER_GEN.fetch_add(1, Ordering::Relaxed) + 1;
        s.mode = AppMode::Folder;
        s.folder_path = Some(folder_path.clone());
        s.folder_files.clear();
        s.file_path = file_path.clone();
        s.startup_error = None;
        folder_gen
    };

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
        s.folder_debouncer = start_folder_watcher(&folder_path, app.clone(), folder_gen);
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

/// Output path of the active interactive session, or `None` when not in interactive mode.
fn interactive_output(app: &tauri::AppHandle) -> Option<Option<PathBuf>> {
    let state = app.try_state::<Mutex<AppState>>()?;
    let s = state.lock().unwrap();
    s.interactive.as_ref().map(|i| i.output.clone())
}

fn parse_interactive_args(
    path_arg: Option<&str>,
    questions_arg: &str,
    output_arg: Option<&str>,
) -> Result<InteractiveSession, String> {
    let output = output_arg.map(PathBuf::from);
    if let Some(ref out) = output {
        interactive::check_output_path(out)?;
    }
    let doc_arg = path_arg.ok_or("--interactive requires a markdown document path")?;
    let document = std::fs::canonicalize(doc_arg).map_err(|_| format!("File not found: {doc_arg}"))?;
    if !document.is_file() {
        return Err(format!("--interactive requires a file, not a folder: {doc_arg}"));
    }
    let questions = interactive::load_questions(Path::new(questions_arg))?;
    Ok(InteractiveSession {
        document,
        questions,
        output,
        dirty: false,
    })
}

/// Closing an interactive window cancels directly when nothing was entered, so a frontend that failed
/// to load can never trap the window open. With answers entered, the frontend asks for confirmation.
fn handle_interactive_close(window: &tauri::Window, api: &tauri::CloseRequestApi) {
    let session = window.app_handle().try_state::<Mutex<AppState>>().and_then(|state| {
        state
            .lock()
            .unwrap()
            .interactive
            .as_ref()
            .map(|i| (i.output.clone(), i.dirty))
    });
    let Some((output, dirty)) = session else {
        return;
    };
    if RESULT_GATE.is_claimed() {
        return;
    }
    api.prevent_close();
    if dirty {
        let _ = window.emit("interactive-close-requested", ());
    } else {
        interactive::finish_session(window.app_handle(), &InteractiveResult::cancelled(), output.as_deref());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let exit_code = tauri::Builder::default()
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
            set_outline_visible,
            notify_has_frontmatter,
            export::export_pdf,
            updater::check_for_updates,
            get_interactive_session,
            submit_answers,
            cancel_interactive,
            set_interactive_dirty
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    handle_interactive_close(window, api);
                }
            }
        })
        .setup(|app| {
            migrate_legacy_config(app.handle());
            migrate_store_keys(app.handle());

            let matches = app.cli().matches().expect("Failed to parse CLI arguments");
            if let Some(help) = matches.args.get("help").and_then(|a| a.value.as_str()) {
                println!("{help}");
                std::process::exit(0);
            }
            let arg_str = |name: &str| {
                matches
                    .args
                    .get(name)
                    .and_then(|a| a.value.as_str())
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
            };
            let path_arg = arg_str("path");
            let path_arg = path_arg.as_deref();
            let output_arg = arg_str("output");

            let interactive_session = arg_str("interactive").map(|questions_arg| {
                parse_interactive_args(path_arg, &questions_arg, output_arg.as_deref())
                    .unwrap_or_else(|msg| interactive::fail_startup(msg, output_arg.as_deref().map(Path::new)))
            });
            let is_interactive = interactive_session.is_some();

            let (mode, file_path, folder_path, startup_error) = if let Some(ref session) = interactive_session {
                (AppMode::File, session.document.clone(), None, None)
            } else if let Some(arg) = path_arg {
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
                        if let Some(ref session) = interactive_session {
                            let title = session.questions.title.clone().unwrap_or_else(|| {
                                file_path.file_name().unwrap_or_default().to_string_lossy().to_string()
                            });
                            let _ = w.set_title(&format!("mdlite — {} — awaiting answers", title));
                            let _ = w.set_size(tauri::LogicalSize::new(1200.0, 800.0));
                            let _ = w.set_focus();
                        } else {
                            let filename = file_path.file_name().unwrap_or_default().to_string_lossy();
                            let _ = w.set_title(&format!("mdlite — {}", filename));
                        }
                    }
                    AppMode::Empty => {}
                }
            }

            let theme = store_get_theme(app.handle());
            let print_header = store_get_print_header(app.handle());
            let show_hidden_files = store_get_show_hidden_files(app.handle());
            let show_frontmatter = store_get_show_frontmatter(app.handle());
            let recent = if is_interactive {
                store_get_recent(app.handle())
            } else if mode == AppMode::File {
                store_prune_recent(app.handle());
                store_add_recent(app.handle(), &file_path)
            } else {
                store_prune_recent(app.handle())
            };
            let recent_folders = if is_interactive {
                store_get_recent_folders(app.handle())
            } else if mode == AppMode::Folder {
                store_prune_recent_folders(app.handle());
                store_add_recent_folder(app.handle(), folder_path.as_ref().unwrap())
            } else {
                store_prune_recent_folders(app.handle())
            };

            jumplist::init_platform(app.handle());

            if !is_interactive {
                if mode == AppMode::File {
                    jumplist::notify_recent_doc(&file_path);
                }
                jumplist::update_jump_list(&recent, &recent_folders);
            }

            let show_outline = false;
            let menu_state = MenuState {
                print_header,
                show_hidden_files,
                show_outline,
                show_frontmatter,
                has_frontmatter: false,
            };
            let menu = build_menu(app.handle(), &recent, &theme, &menu_state)?;
            app.set_menu(menu)?;

            let folder_path_for_watch = folder_path.clone();
            app.manage(Mutex::new(AppState {
                mode: mode.clone(),
                file_path: file_path.clone(),
                folder_path,
                folder_files: HashSet::new(),
                current_theme: theme,
                print_header,
                show_hidden_files,
                show_outline,
                show_frontmatter,
                has_frontmatter: false,
                debouncer: None,
                folder_debouncer: None,
                startup_error,
                interactive: interactive_session,
            }));

            if mode == AppMode::Folder {
                if let Some(ref fp) = folder_path_for_watch {
                    let folder_gen = FOLDER_GEN.load(Ordering::Relaxed);
                    app.state::<Mutex<AppState>>().lock().unwrap().folder_debouncer =
                        start_folder_watcher(fp, app.handle().clone(), folder_gen);
                }
            } else if !file_path.as_os_str().is_empty() {
                let watch_dir = file_path.parent().unwrap_or(&file_path).to_path_buf();
                app.state::<Mutex<AppState>>().lock().unwrap().debouncer =
                    start_watcher(&watch_dir, app.handle().clone());
            }

            app.on_menu_event(|handle, event| {
                let id: &str = &event.id().0;
                let switches_document = id == "open-file" || id == "open-folder" || id.starts_with("recent-");
                if switches_document && interactive_output(handle).is_some() {
                    return;
                }
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
                    if in_folder_mode {
                        let _ = handle.emit("rescan-folder", ());
                    }
                } else if id == "toggle-show-frontmatter" {
                    let new_val = {
                        let state = handle.state::<Mutex<AppState>>();
                        let mut s = state.lock().unwrap();
                        s.show_frontmatter = !s.show_frontmatter;
                        s.show_frontmatter
                    };
                    store_set_show_frontmatter(handle, new_val);
                    let _ = handle.emit("set-frontmatter", new_val);
                } else if id == "about" {
                    let _ = handle.emit("show-about", ());
                } else if id == "check-updates" {
                    let _ = handle.emit("show-update-check", ());
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run_return(|app, event| {
            if let RunEvent::ExitRequested { code: None, .. } = event {
                if let Some(output) = interactive_output(app) {
                    interactive::emit_once(&InteractiveResult::cancelled(), output.as_deref());
                }
            }
        });
    std::process::exit(RESULT_GATE.exit_code().unwrap_or(exit_code));
}
