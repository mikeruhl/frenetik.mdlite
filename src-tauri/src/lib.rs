use notify::RecursiveMode;
use notify::RecommendedWatcher;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{
    CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{Emitter, Manager};
use tauri_plugin_cli::CliExt;
use tauri_plugin_dialog::DialogExt;

const MAX_RECENT: usize = 10;

const THEMES: &[(&str, &str)] = &[
    ("github", "GitHub Light"),
    ("github-dark", "GitHub Dark"),
    ("github-dark-dimmed", "GitHub Dark Dimmed"),
    ("github-dark-hc", "GitHub Dark HC"),
    ("github-auto", "GitHub Auto"),
    ("github-light-cb", "GitHub Light (Colorblind)"),
    ("github-dark-cb", "GitHub Dark (Colorblind)"),
    ("splendor", "Splendor"),
    ("retro", "Retro"),
    ("air", "Air"),
    ("modest", "Modest"),
];

#[derive(Clone, PartialEq)]
enum AppMode {
    Empty,
    File,
    Folder,
}

#[derive(Serialize, Clone)]
struct FolderEntry {
    name: String,
    path: String,
    is_folder: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FolderEntry>>,
}

struct AppState {
    mode: AppMode,
    file_path: PathBuf,
    folder_path: Option<PathBuf>,
    current_theme: String,
    debouncer: Option<Debouncer<RecommendedWatcher>>,
}

fn display_path(p: &Path) -> String {
    let s = p.to_string_lossy().to_string();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

#[tauri::command]
fn read_file(state: tauri::State<'_, Mutex<AppState>>) -> Result<String, String> {
    let state = state.lock().unwrap();
    if state.file_path.as_os_str().is_empty() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&state.file_path)
        .map_err(|e| format!("Failed to read {}: {}", state.file_path.display(), e))
}

#[tauri::command]
fn get_theme(state: tauri::State<'_, Mutex<AppState>>) -> String {
    state.lock().unwrap().current_theme.clone()
}

#[tauri::command]
fn get_mode(state: tauri::State<'_, Mutex<AppState>>) -> serde_json::Value {
    let state = state.lock().unwrap();
    match state.mode {
        AppMode::Empty => serde_json::json!({ "mode": "empty" }),
        AppMode::File => serde_json::json!({ "mode": "file" }),
        AppMode::Folder => {
            let mut val = serde_json::json!({ "mode": "folder" });
            if !state.file_path.as_os_str().is_empty() {
                val["current_file"] =
                    serde_json::json!(display_path(&state.file_path));
            }
            if let Some(ref fp) = state.folder_path {
                val["folder_name"] = serde_json::json!(
                    fp.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                );
            }
            val
        }
    }
}

#[tauri::command]
fn list_folder(state: tauri::State<'_, Mutex<AppState>>) -> Result<Vec<FolderEntry>, String> {
    let state = state.lock().unwrap();
    match &state.folder_path {
        Some(path) => Ok(scan_folder(path)),
        None => Err("Not in folder mode".to_string()),
    }
}

#[tauri::command]
fn open_folder_file(
    path: String,
    state: tauri::State<'_, Mutex<AppState>>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let file_path =
        std::fs::canonicalize(&path).map_err(|e| format!("Invalid path {}: {}", path, e))?;

    {
        let s = state.lock().unwrap();
        if let Some(ref folder) = s.folder_path {
            if !file_path.starts_with(folder) {
                return Err("File is outside the folder".to_string());
            }
        }
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))?;

    let needs_new_watcher = {
        let mut s = state.lock().unwrap();
        let old_dir = s.file_path.parent().map(|p| p.to_path_buf());
        let new_dir = file_path.parent().map(|p| p.to_path_buf());
        s.file_path = file_path.clone();
        old_dir != new_dir
    };

    if needs_new_watcher {
        let watch_dir = file_path.parent().unwrap_or(&file_path).to_path_buf();
        let debouncer = start_watcher(&watch_dir, app.clone());
        state.lock().unwrap().debouncer = Some(debouncer);
    }

    let name = file_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    let folder_name = state
        .lock()
        .unwrap()
        .folder_path
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&format!("mdlite — {} — {}", folder_name, name));
    }

    Ok(content)
}

fn scan_folder(dir: &Path) -> Vec<FolderEntry> {
    let mut folders = Vec::new();
    let mut files = Vec::new();

    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut items: Vec<_> = entries.flatten().collect();
    items.sort_by_key(|e| e.file_name());

    for entry in items {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let children = scan_folder(&path);
            if !children.is_empty() {
                folders.push(FolderEntry {
                    name,
                    path: display_path(&path),
                    is_folder: true,
                    children: Some(children),
                });
            }
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                if is_markdown_ext(ext) {
                    files.push(FolderEntry {
                        name,
                        path: display_path(&path),
                        is_folder: false,
                        children: None,
                    });
                }
            }
        }
    }

    folders.extend(files);
    folders
}

fn is_markdown_ext(ext: &std::ffi::OsStr) -> bool {
    let s = ext.to_string_lossy().to_lowercase();
    s == "md" || s == "markdown" || s == "mdx"
}

fn find_default_file(dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name == "readme.md" {
                    return Some(entry.path());
                }
            }
        }
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut md_files: Vec<_> = entries
            .flatten()
            .filter(|e| {
                e.path().is_file()
                    && e.path()
                        .extension()
                        .is_some_and(is_markdown_ext)
            })
            .collect();
        md_files.sort_by_key(|e| e.file_name());
        return md_files.first().map(|e| e.path());
    }
    None
}

// --- Config helpers (path-based, testable) ---

fn load_config_from(path: &Path) -> serde_json::Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or(serde_json::json!({}))
}

fn save_config_to(path: &Path, config: &serde_json::Value) {
    if let Ok(json) = serde_json::to_string_pretty(config) {
        std::fs::write(path, json).ok();
    }
}

fn load_recent_from(config_path: &Path) -> Vec<String> {
    let config = load_config_from(config_path);
    serde_json::from_value(config["recent_files"].clone()).unwrap_or_default()
}

fn save_recent_to(config_path: &Path, files: &[String]) {
    let mut config = load_config_from(config_path);
    config["recent_files"] = serde_json::json!(files);
    save_config_to(config_path, &config);
}

fn load_theme_from(config_path: &Path) -> String {
    let config = load_config_from(config_path);
    config["theme"]
        .as_str()
        .unwrap_or("github")
        .to_string()
}

fn save_theme_to(config_path: &Path, theme: &str) {
    let mut config = load_config_from(config_path);
    config["theme"] = serde_json::json!(theme);
    save_config_to(config_path, &config);
}

fn add_to_recent_list(path: &Path, list: &mut Vec<String>) {
    let s = path.to_string_lossy().to_string();
    list.retain(|p| p != &s);
    list.insert(0, s);
    list.truncate(MAX_RECENT);
}

fn prune_recent_list(list: Vec<String>) -> Vec<String> {
    list.into_iter().filter(|p| Path::new(p).exists()).collect()
}

// --- Config wrappers (Tauri AppHandle) ---

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("Failed to resolve app config dir");
    std::fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

fn load_recent(app: &tauri::AppHandle) -> Vec<String> {
    load_recent_from(&config_path(app))
}

fn save_recent(app: &tauri::AppHandle, files: &[String]) {
    save_recent_to(&config_path(app), files);
}

fn load_theme_config(app: &tauri::AppHandle) -> String {
    load_theme_from(&config_path(app))
}

fn save_theme_config(app: &tauri::AppHandle, theme: &str) {
    save_theme_to(&config_path(app), theme);
}

fn add_to_recent(app: &tauri::AppHandle, path: &Path) -> Vec<String> {
    let cp = config_path(app);
    let mut list = load_recent_from(&cp);
    add_to_recent_list(path, &mut list);
    save_recent_to(&cp, &list);
    list
}

fn prune_recent(app: &tauri::AppHandle) -> Vec<String> {
    let cp = config_path(app);
    let list = load_recent_from(&cp);
    let valid = prune_recent_list(list);
    save_recent_to(&cp, &valid);
    valid
}

fn build_menu(
    app: &tauri::AppHandle,
    recent: &[String],
    current_theme: &str,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let mut recent_sub = SubmenuBuilder::new(app, "Recent Files");
    if recent.is_empty() {
        let item = MenuItemBuilder::with_id("no-recent", "(No Recent Files)")
            .enabled(false)
            .build(app)?;
        recent_sub = recent_sub.item(&item);
    } else {
        for (i, path) in recent.iter().enumerate() {
            let label = Path::new(path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy();
            recent_sub = recent_sub.text(format!("recent-{}", i), label.as_ref());
        }
        recent_sub = recent_sub
            .separator()
            .text("clear-recent", "Clear Recent Files");
    }

    let find_item = MenuItemBuilder::with_id("find", "Find...")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .text("open-file", "Open...")
        .text("open-folder", "Open Folder...")
        .item(&recent_sub.build()?)
        .separator()
        .item(&find_item)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let mut theme_sub = SubmenuBuilder::new(app, "Theme");
    for (id, label) in THEMES {
        let item = CheckMenuItemBuilder::with_id(format!("theme-{}", id), *label)
            .checked(*id == current_theme)
            .build(app)?;
        theme_sub = theme_sub.item(&item);
    }

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&theme_sub.build()?)
        .build()
}

fn rebuild_menu(app: &tauri::AppHandle, recent: &[String], theme: &str) {
    if let Ok(menu) = build_menu(app, recent, theme) {
        let _ = app.set_menu(menu);
    }
}

fn start_watcher(watch_dir: &Path, app: tauri::AppHandle) -> Debouncer<RecommendedWatcher> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut debouncer =
        new_debouncer(Duration::from_millis(200), tx).expect("Failed to create watcher");
    debouncer
        .watcher()
        .watch(watch_dir, RecursiveMode::NonRecursive)
        .expect("Failed to watch directory");

    std::thread::spawn(move || {
        for result in rx {
            match result {
                Ok(events) => {
                    let current = app
                        .state::<Mutex<AppState>>()
                        .lock()
                        .unwrap()
                        .file_path
                        .clone();
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

fn switch_file(app: &tauri::AppHandle, new_path_str: &str) {
    let new_path = PathBuf::from(new_path_str);
    if !new_path.exists() {
        let recent = prune_recent(app);
        let theme = app
            .state::<Mutex<AppState>>()
            .lock()
            .unwrap()
            .current_theme
            .clone();
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
        (old_dir != new_dir || was_other, was_other)
    };

    if was_not_file {
        let _ = app.emit("enter-file-mode", ());
    }

    if needs_new_watcher {
        let watch_dir = new_path.parent().unwrap_or(&new_path).to_path_buf();
        let debouncer = start_watcher(&watch_dir, app.clone());
        app.state::<Mutex<AppState>>()
            .lock()
            .unwrap()
            .debouncer = Some(debouncer);
    }

    let name = new_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&format!("mdlite — {}", name));
    }

    if let Ok(content) = std::fs::read_to_string(&new_path) {
        let _ = app.emit("file-changed", content);
    }

    let recent = add_to_recent(app, &new_path);
    let theme = app
        .state::<Mutex<AppState>>()
        .lock()
        .unwrap()
        .current_theme
        .clone();
    rebuild_menu(app, &recent, &theme);
}

fn switch_to_folder(app: &tauri::AppHandle, folder_path: PathBuf) {
    let folder_path = std::fs::canonicalize(&folder_path).unwrap_or(folder_path);
    let default_file = find_default_file(&folder_path);
    let file_path = default_file.clone().unwrap_or_default();

    {
        let state = app.state::<Mutex<AppState>>();
        let mut s = state.lock().unwrap();
        s.mode = AppMode::Folder;
        s.folder_path = Some(folder_path.clone());
        s.file_path = file_path.clone();
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

    if !file_path.as_os_str().is_empty() {
        let watch_dir = file_path.parent().unwrap_or(&file_path).to_path_buf();
        let debouncer = start_watcher(&watch_dir, app.clone());
        app.state::<Mutex<AppState>>()
            .lock()
            .unwrap()
            .debouncer = Some(debouncer);
    }

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
        .invoke_handler(tauri::generate_handler![
            read_file,
            get_theme,
            get_mode,
            list_folder,
            open_folder_file
        ])
        .setup(|app| {
            let matches = app.cli().matches().expect("Failed to parse CLI arguments");
            let path_arg = matches
                .args
                .get("path")
                .and_then(|a| a.value.as_str())
                .filter(|s| !s.is_empty());

            let (mode, file_path, folder_path) = if let Some(arg) = path_arg {
                let input_path = std::fs::canonicalize(arg).unwrap_or_else(|_| {
                    eprintln!("Path not found: {}", arg);
                    std::process::exit(1);
                });
                if input_path.is_dir() {
                    let default_file = find_default_file(&input_path);
                    (
                        AppMode::Folder,
                        default_file.unwrap_or_default(),
                        Some(input_path),
                    )
                } else {
                    (AppMode::File, input_path, None)
                }
            } else {
                (AppMode::Empty, PathBuf::new(), None)
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
                            let file_name = file_path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy();
                            let _ = w.set_title(&format!(
                                "mdlite — {} — {}",
                                folder_name, file_name
                            ));
                        } else {
                            let _ = w.set_title(&format!("mdlite — {}", folder_name));
                        }
                        let _ = w.set_size(tauri::LogicalSize::new(1100.0, 700.0));
                    }
                    AppMode::File => {
                        let filename = file_path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy();
                        let _ = w.set_title(&format!("mdlite — {}", filename));
                    }
                    AppMode::Empty => {}
                }
            }

            let theme = load_theme_config(app.handle());
            let recent = if mode == AppMode::File {
                prune_recent(app.handle());
                add_to_recent(app.handle(), &file_path)
            } else {
                prune_recent(app.handle())
            };

            let menu = build_menu(app.handle(), &recent, &theme)?;
            app.set_menu(menu)?;

            app.manage(Mutex::new(AppState {
                mode: mode.clone(),
                file_path: file_path.clone(),
                folder_path,
                current_theme: theme,
                debouncer: None,
            }));

            if !file_path.as_os_str().is_empty() {
                let watch_dir = file_path.parent().unwrap_or(&file_path).to_path_buf();
                let debouncer = start_watcher(&watch_dir, app.handle().clone());
                app.state::<Mutex<AppState>>()
                    .lock()
                    .unwrap()
                    .debouncer = Some(debouncer);
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
                    save_recent(handle, &[]);
                    let theme = handle
                        .state::<Mutex<AppState>>()
                        .lock()
                        .unwrap()
                        .current_theme
                        .clone();
                    rebuild_menu(handle, &[], &theme);
                } else if let Some(idx_str) = id.strip_prefix("recent-") {
                    if let Ok(idx) = idx_str.parse::<usize>() {
                        let recent = load_recent(handle);
                        if let Some(path) = recent.get(idx).cloned() {
                            switch_file(handle, &path);
                        }
                    }
                } else if id == "find" {
                    let _ = handle.emit("open-search", ());
                } else if let Some(theme_id) = id.strip_prefix("theme-") {
                    save_theme_config(handle, theme_id);
                    handle
                        .state::<Mutex<AppState>>()
                        .lock()
                        .unwrap()
                        .current_theme = theme_id.to_string();
                    let recent = load_recent(handle);
                    rebuild_menu(handle, &recent, theme_id);
                    let _ = handle.emit("set-theme", theme_id);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_file(dir: &Path, name: &str) {
        fs::write(dir.join(name), "# test").unwrap();
    }

    fn create_subdir(dir: &Path, name: &str) -> PathBuf {
        let sub = dir.join(name);
        fs::create_dir(&sub).unwrap();
        sub
    }

    // --- display_path ---

    #[test]
    fn display_path_strips_unc_prefix() {
        let p = Path::new(r"\\?\C:\Users\test\file.md");
        assert_eq!(display_path(p), r"C:\Users\test\file.md");
    }

    #[test]
    fn display_path_passes_normal_path_through() {
        let p = Path::new(r"C:\Users\test\file.md");
        assert_eq!(display_path(p), r"C:\Users\test\file.md");
    }

    #[test]
    fn display_path_handles_unix_path() {
        let p = Path::new("/home/user/file.md");
        assert_eq!(display_path(p), "/home/user/file.md");
    }

    // --- scan_folder ---

    #[test]
    fn scan_folder_returns_only_md_files() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "readme.md");
        create_file(tmp.path(), "notes.markdown");
        create_file(tmp.path(), "doc.mdx");
        create_file(tmp.path(), "image.png");
        create_file(tmp.path(), "script.js");

        let entries = scan_folder(tmp.path());
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["doc.mdx", "notes.markdown", "readme.md"]);
        assert!(entries.iter().all(|e| !e.is_folder));
    }

    #[test]
    fn scan_folder_empty_dir_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let entries = scan_folder(tmp.path());
        assert!(entries.is_empty());
    }

    #[test]
    fn scan_folder_skips_dot_directories() {
        let tmp = TempDir::new().unwrap();
        let hidden = create_subdir(tmp.path(), ".git");
        create_file(&hidden, "HEAD.md");
        create_file(tmp.path(), "visible.md");

        let entries = scan_folder(tmp.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "visible.md");
    }

    #[test]
    fn scan_folder_prunes_folders_without_md_descendants() {
        let tmp = TempDir::new().unwrap();
        let empty_sub = create_subdir(tmp.path(), "empty");
        create_file(&empty_sub, "data.json");
        let has_md = create_subdir(tmp.path(), "docs");
        create_file(&has_md, "guide.md");

        let entries = scan_folder(tmp.path());
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["docs"]);
        assert!(entries[0].is_folder);
    }

    #[test]
    fn scan_folder_folders_sorted_before_files() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "aaa.md");
        let sub = create_subdir(tmp.path(), "zzz");
        create_file(&sub, "nested.md");

        let entries = scan_folder(tmp.path());
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_folder);
        assert_eq!(entries[0].name, "zzz");
        assert!(!entries[1].is_folder);
        assert_eq!(entries[1].name, "aaa.md");
    }

    #[test]
    fn scan_folder_nested_structure() {
        let tmp = TempDir::new().unwrap();
        let docs = create_subdir(tmp.path(), "docs");
        let deep = create_subdir(&docs, "api");
        create_file(&deep, "reference.md");
        create_file(tmp.path(), "README.md");

        let entries = scan_folder(tmp.path());
        assert_eq!(entries.len(), 2);

        let folder = &entries[0];
        assert!(folder.is_folder);
        assert_eq!(folder.name, "docs");

        let children = folder.children.as_ref().unwrap();
        assert_eq!(children.len(), 1);
        assert!(children[0].is_folder);
        assert_eq!(children[0].name, "api");

        let grandchildren = children[0].children.as_ref().unwrap();
        assert_eq!(grandchildren.len(), 1);
        assert_eq!(grandchildren[0].name, "reference.md");
    }

    #[test]
    fn scan_folder_deep_prune_no_md_anywhere() {
        let tmp = TempDir::new().unwrap();
        let a = create_subdir(tmp.path(), "a");
        let b = create_subdir(&a, "b");
        let c = create_subdir(&b, "c");
        create_file(&c, "data.txt");

        let entries = scan_folder(tmp.path());
        assert!(entries.is_empty());
    }

    #[test]
    fn scan_folder_deep_prune_md_at_leaf() {
        let tmp = TempDir::new().unwrap();
        let a = create_subdir(tmp.path(), "a");
        let b = create_subdir(&a, "b");
        create_file(&b, "deep.md");

        let entries = scan_folder(tmp.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "a");
        let b_entries = entries[0].children.as_ref().unwrap();
        assert_eq!(b_entries.len(), 1);
        assert_eq!(b_entries[0].name, "b");
        let md_files = b_entries[0].children.as_ref().unwrap();
        assert_eq!(md_files.len(), 1);
        assert_eq!(md_files[0].name, "deep.md");
    }

    #[test]
    fn scan_folder_case_insensitive_extension() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "upper.MD");
        create_file(tmp.path(), "mixed.Md");

        let entries = scan_folder(tmp.path());
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn scan_folder_entries_have_full_paths() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "test.md");

        let entries = scan_folder(tmp.path());
        assert!(entries[0].path.contains("test.md"));
        assert!(entries[0].path.len() > "test.md".len());
    }

    // --- find_default_file ---

    #[test]
    fn find_default_prefers_readme() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "aaa.md");
        create_file(tmp.path(), "README.md");
        create_file(tmp.path(), "zzz.md");

        let result = find_default_file(tmp.path()).unwrap();
        let name = result.file_name().unwrap().to_string_lossy().to_lowercase();
        assert_eq!(name, "readme.md");
    }

    #[test]
    fn find_default_falls_back_to_first_alphabetically() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "beta.md");
        create_file(tmp.path(), "alpha.md");

        let result = find_default_file(tmp.path()).unwrap();
        let name = result.file_name().unwrap().to_string_lossy().to_string();
        assert_eq!(name, "alpha.md");
    }

    #[test]
    fn find_default_returns_none_for_empty_dir() {
        let tmp = TempDir::new().unwrap();
        assert!(find_default_file(tmp.path()).is_none());
    }

    #[test]
    fn find_default_returns_none_when_no_md_files() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "image.png");
        create_file(tmp.path(), "data.json");

        assert!(find_default_file(tmp.path()).is_none());
    }

    #[test]
    fn find_default_ignores_subdirectory_files() {
        let tmp = TempDir::new().unwrap();
        let sub = create_subdir(tmp.path(), "docs");
        create_file(&sub, "README.md");

        assert!(find_default_file(tmp.path()).is_none());
    }

    #[test]
    fn find_default_only_matches_md_extension() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "readme.txt");
        create_file(tmp.path(), "readme.markdown");

        let result = find_default_file(tmp.path()).unwrap();
        let name = result.file_name().unwrap().to_string_lossy().to_string();
        assert_eq!(name, "readme.markdown");
    }

    // --- is_markdown_ext ---

    #[test]
    fn is_markdown_ext_accepts_md_variants() {
        assert!(is_markdown_ext(std::ffi::OsStr::new("md")));
        assert!(is_markdown_ext(std::ffi::OsStr::new("MD")));
        assert!(is_markdown_ext(std::ffi::OsStr::new("markdown")));
        assert!(is_markdown_ext(std::ffi::OsStr::new("MARKDOWN")));
        assert!(is_markdown_ext(std::ffi::OsStr::new("mdx")));
        assert!(is_markdown_ext(std::ffi::OsStr::new("Mdx")));
    }

    #[test]
    fn is_markdown_ext_rejects_non_md() {
        assert!(!is_markdown_ext(std::ffi::OsStr::new("txt")));
        assert!(!is_markdown_ext(std::ffi::OsStr::new("html")));
        assert!(!is_markdown_ext(std::ffi::OsStr::new("mdown")));
        assert!(!is_markdown_ext(std::ffi::OsStr::new("")));
    }

    // --- config round-trip ---

    #[test]
    fn config_round_trip() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");

        let config = serde_json::json!({ "theme": "retro", "extra": 42 });
        save_config_to(&cp, &config);

        let loaded = load_config_from(&cp);
        assert_eq!(loaded["theme"], "retro");
        assert_eq!(loaded["extra"], 42);
    }

    #[test]
    fn config_load_missing_file_returns_empty_object() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("nonexistent.json");
        let config = load_config_from(&cp);
        assert_eq!(config, serde_json::json!({}));
    }

    #[test]
    fn config_load_corrupt_file_returns_empty_object() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");
        fs::write(&cp, "not valid json {{{").unwrap();

        let config = load_config_from(&cp);
        assert_eq!(config, serde_json::json!({}));
    }

    // --- theme config ---

    #[test]
    fn theme_save_and_load() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");

        save_theme_to(&cp, "github-dark");
        assert_eq!(load_theme_from(&cp), "github-dark");
    }

    #[test]
    fn theme_default_is_github() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");
        assert_eq!(load_theme_from(&cp), "github");
    }

    #[test]
    fn theme_preserves_other_config() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");

        save_config_to(&cp, &serde_json::json!({ "recent_files": ["a.md"] }));
        save_theme_to(&cp, "retro");

        let config = load_config_from(&cp);
        assert_eq!(config["theme"], "retro");
        assert_eq!(config["recent_files"][0], "a.md");
    }

    // --- recent files ---

    #[test]
    fn recent_save_and_load() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");

        let files = vec!["a.md".to_string(), "b.md".to_string()];
        save_recent_to(&cp, &files);

        let loaded = load_recent_from(&cp);
        assert_eq!(loaded, files);
    }

    #[test]
    fn recent_empty_by_default() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");
        assert!(load_recent_from(&cp).is_empty());
    }

    #[test]
    fn recent_preserves_other_config() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");

        save_theme_to(&cp, "air");
        save_recent_to(&cp, &["x.md".to_string()]);

        assert_eq!(load_theme_from(&cp), "air");
        assert_eq!(load_recent_from(&cp), vec!["x.md"]);
    }

    // --- add_to_recent_list ---

    #[test]
    fn add_to_recent_inserts_at_front() {
        let mut list = vec!["old.md".to_string()];
        add_to_recent_list(Path::new("new.md"), &mut list);
        assert_eq!(list, vec!["new.md", "old.md"]);
    }

    #[test]
    fn add_to_recent_deduplicates() {
        let mut list = vec!["a.md".to_string(), "b.md".to_string(), "c.md".to_string()];
        add_to_recent_list(Path::new("b.md"), &mut list);
        assert_eq!(list, vec!["b.md", "a.md", "c.md"]);
    }

    #[test]
    fn add_to_recent_truncates_to_max() {
        let mut list: Vec<String> = (0..MAX_RECENT)
            .map(|i| format!("{}.md", i))
            .collect();
        assert_eq!(list.len(), MAX_RECENT);

        add_to_recent_list(Path::new("overflow.md"), &mut list);
        assert_eq!(list.len(), MAX_RECENT);
        assert_eq!(list[0], "overflow.md");
        assert!(!list.contains(&format!("{}.md", MAX_RECENT - 1)));
    }

    #[test]
    fn add_to_recent_duplicate_does_not_grow() {
        let mut list = vec!["a.md".to_string(), "b.md".to_string()];
        add_to_recent_list(Path::new("a.md"), &mut list);
        assert_eq!(list.len(), 2);
    }

    // --- prune_recent_list ---

    #[test]
    fn prune_removes_nonexistent_paths() {
        let tmp = TempDir::new().unwrap();
        let real = tmp.path().join("exists.md");
        fs::write(&real, "# exists").unwrap();

        let list = vec![
            real.to_string_lossy().to_string(),
            "/no/such/file.md".to_string(),
        ];

        let pruned = prune_recent_list(list);
        assert_eq!(pruned.len(), 1);
        assert_eq!(pruned[0], real.to_string_lossy().to_string());
    }

    #[test]
    fn prune_all_invalid_returns_empty() {
        let list = vec![
            "/fake/path/a.md".to_string(),
            "/fake/path/b.md".to_string(),
        ];
        let pruned = prune_recent_list(list);
        assert!(pruned.is_empty());
    }

    #[test]
    fn prune_empty_list_returns_empty() {
        let pruned = prune_recent_list(vec![]);
        assert!(pruned.is_empty());
    }

    // --- FolderEntry serialization ---

    #[test]
    fn folder_entry_file_omits_children_in_json() {
        let entry = FolderEntry {
            name: "test.md".to_string(),
            path: "/tmp/test.md".to_string(),
            is_folder: false,
            children: None,
        };
        let json = serde_json::to_value(&entry).unwrap();
        assert!(!json.as_object().unwrap().contains_key("children"));
    }

    #[test]
    fn folder_entry_folder_includes_children_in_json() {
        let entry = FolderEntry {
            name: "docs".to_string(),
            path: "/tmp/docs".to_string(),
            is_folder: true,
            children: Some(vec![FolderEntry {
                name: "readme.md".to_string(),
                path: "/tmp/docs/readme.md".to_string(),
                is_folder: false,
                children: None,
            }]),
        };
        let json = serde_json::to_value(&entry).unwrap();
        let children = json["children"].as_array().unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0]["name"], "readme.md");
    }
}
