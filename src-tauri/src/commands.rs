use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::config::store_get_recent;
use crate::interactive::{finish_session, Answer, InteractiveResult, InteractiveSession};
use crate::menu::rebuild_menu;
use crate::scan::{run_progressive_scan, SCAN_GENERATION};
use crate::{display_path, AppMode, AppState};

#[tauri::command]
pub(crate) fn read_file(state: tauri::State<'_, Mutex<AppState>>) -> Result<String, String> {
    let state = state.lock().unwrap();
    if state.file_path.as_os_str().is_empty() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&state.file_path)
        .map_err(|e| format!("Failed to read {}: {}", state.file_path.display(), e))
}

#[tauri::command]
pub(crate) fn get_mode(state: tauri::State<'_, Mutex<AppState>>) -> serde_json::Value {
    let state = state.lock().unwrap();
    match state.mode {
        AppMode::Empty => serde_json::json!({ "mode": "empty" }),
        AppMode::File => serde_json::json!({ "mode": "file" }),
        AppMode::Folder => {
            let mut val = serde_json::json!({ "mode": "folder" });
            if !state.file_path.as_os_str().is_empty() {
                val["current_file"] = serde_json::json!(display_path(&state.file_path));
            }
            if let Some(ref fp) = state.folder_path {
                val["folder_path"] = serde_json::json!(display_path(fp));
                val["folder_name"] =
                    serde_json::json!(fp.file_name().unwrap_or_default().to_string_lossy().to_string());
            }
            val
        }
    }
}

#[tauri::command]
pub(crate) fn get_startup_error(state: tauri::State<'_, Mutex<AppState>>) -> Option<String> {
    state.lock().unwrap().startup_error.clone()
}

#[tauri::command]
pub(crate) fn cancel_folder_scan() {
    SCAN_GENERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
pub(crate) fn start_folder_scan(state: tauri::State<'_, Mutex<AppState>>, app: tauri::AppHandle) -> Result<(), String> {
    let (folder_path, show_hidden_files) = {
        let s = state.lock().unwrap();
        (s.folder_path.clone(), s.show_hidden_files)
    };
    match folder_path {
        Some(root) => {
            run_progressive_scan(root, app, show_hidden_files);
            Ok(())
        }
        None => Err("Not in folder mode".to_string()),
    }
}

#[tauri::command]
pub(crate) fn notify_outline_closed(state: tauri::State<'_, Mutex<AppState>>, app: tauri::AppHandle) {
    let theme = {
        let mut s = state.lock().unwrap();
        s.show_outline = false;
        s.current_theme.clone()
    };
    let recent = store_get_recent(&app);
    rebuild_menu(&app, &recent, &theme);
}

#[tauri::command]
pub(crate) fn set_outline_visible(visible: bool, state: tauri::State<'_, Mutex<AppState>>, app: tauri::AppHandle) {
    let theme = {
        let mut s = state.lock().unwrap();
        s.show_outline = visible;
        s.current_theme.clone()
    };
    let recent = store_get_recent(&app);
    rebuild_menu(&app, &recent, &theme);
}

#[tauri::command]
pub(crate) fn notify_has_frontmatter(has: bool, state: tauri::State<'_, Mutex<AppState>>, app: tauri::AppHandle) {
    let theme = {
        let mut s = state.lock().unwrap();
        s.has_frontmatter = has;
        s.current_theme.clone()
    };
    let recent = store_get_recent(&app);
    rebuild_menu(&app, &recent, &theme);
}

#[tauri::command]
pub(crate) fn open_folder_file(
    path: String,
    state: tauri::State<'_, Mutex<AppState>>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let file_path = std::fs::canonicalize(&path).map_err(|e| format!("Invalid path {}: {}", path, e))?;

    {
        let s = state.lock().unwrap();
        if let Some(ref folder) = s.folder_path {
            if !file_path.starts_with(folder) {
                return Err("File is outside the folder".to_string());
            }
        }
    }

    let content = std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read {}: {}", path, e))?;

    let (folder_name, had_file, theme) = {
        let mut s = state.lock().unwrap();
        let had_file = current_file_display_path(&s).is_some();
        s.file_path = file_path.clone();
        let folder_name = s
            .folder_path
            .as_ref()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        (folder_name, had_file, s.current_theme.clone())
    };
    if !had_file {
        rebuild_menu(&app, &store_get_recent(&app), &theme);
    }
    let name = file_path.file_name().unwrap_or_default().to_string_lossy();
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&format!("mdlite — {} — {}", folder_name, name));
    }

    Ok(content)
}

pub(crate) fn current_file_display_path(state: &AppState) -> Option<String> {
    if state.file_path.as_os_str().is_empty() || state.startup_error.is_some() {
        return None;
    }
    Some(display_path(&state.file_path))
}

fn copy_path_with(
    path: Option<String>,
    write: impl FnOnce(String) -> Result<(), String>,
) -> Result<Option<String>, String> {
    let Some(path) = path else {
        return Ok(None);
    };
    write(path.clone())?;
    Ok(Some(path))
}

pub(crate) fn copy_current_file_path(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = current_file_display_path(&app.state::<Mutex<AppState>>().lock().unwrap());
    copy_path_with(path, |p| app.clipboard().write_text(p).map_err(|e| e.to_string()))
}

#[tauri::command]
pub(crate) fn copy_file_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    copy_current_file_path(&app)
}

pub(crate) fn session_view(session: &InteractiveSession) -> serde_json::Value {
    let mut view = serde_json::to_value(&session.questions).unwrap_or_default();
    view["document"] = serde_json::json!(display_path(&session.document));
    view
}

pub(crate) fn prepare_submission(
    session: &InteractiveSession,
    answers: &HashMap<String, Answer>,
) -> Result<InteractiveResult, String> {
    let normalized = crate::interactive::validate_answers(&session.questions, answers)?;
    Ok(InteractiveResult::submitted(
        display_path(&session.document),
        normalized,
    ))
}

#[tauri::command]
pub(crate) fn get_interactive_session(state: tauri::State<'_, Mutex<AppState>>) -> Option<serde_json::Value> {
    state.lock().unwrap().interactive.as_ref().map(session_view)
}

#[tauri::command]
pub(crate) fn submit_answers(
    answers: HashMap<String, Answer>,
    state: tauri::State<'_, Mutex<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let (result, output) = {
        let s = state.lock().unwrap();
        let session = s.interactive.as_ref().ok_or("Not in interactive mode")?;
        (prepare_submission(session, &answers)?, session.output.clone())
    };
    finish_session(&app, &result, output.as_deref());
    Ok(())
}

#[tauri::command]
pub(crate) fn cancel_interactive(
    state: tauri::State<'_, Mutex<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let output = {
        let s = state.lock().unwrap();
        s.interactive.as_ref().ok_or("Not in interactive mode")?.output.clone()
    };
    finish_session(&app, &InteractiveResult::cancelled(), output.as_deref());
    Ok(())
}

#[tauri::command]
pub(crate) fn register_interactive_ready(state: tauri::State<'_, Mutex<AppState>>) {
    if let Some(session) = state.lock().unwrap().interactive.as_mut() {
        session.frontend_ready = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interactive::parse_questions;
    use std::path::PathBuf;

    fn session() -> InteractiveSession {
        let questions = parse_questions(
            r#"{"version":1,"title":"T","questions":[
                {"id":"pick","type":"single","prompt":"P","required":true,
                 "options":[{"value":"a","label":"A"}]}]}"#,
        )
        .unwrap();
        InteractiveSession {
            document: PathBuf::from("doc.md"),
            questions,
            output: None,
            frontend_ready: false,
        }
    }

    #[test]
    fn session_view_includes_document_and_questions() {
        let view = session_view(&session());
        assert_eq!(view["document"], "doc.md");
        assert_eq!(view["title"], "T");
        assert_eq!(view["questions"][0]["id"], "pick");
    }

    #[test]
    fn valid_submission_produces_submitted_result() {
        let answers = HashMap::from([(
            "pick".to_string(),
            Answer {
                value: Some("a".into()),
                ..Answer::default()
            },
        )]);
        let result = prepare_submission(&session(), &answers).unwrap();
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["status"], "submitted");
        assert_eq!(json["document"], "doc.md");
        assert_eq!(json["answers"]["pick"]["value"], "a");
    }

    #[test]
    fn rejected_submission_returns_error() {
        assert!(prepare_submission(&session(), &HashMap::new()).is_err());
    }

    fn app_state(mode: AppMode, file_path: &str, folder: Option<&str>, startup_error: Option<&str>) -> AppState {
        AppState {
            mode,
            file_path: PathBuf::from(file_path),
            folder_path: folder.map(PathBuf::from),
            folder_files: Default::default(),
            current_theme: String::new(),
            print_header: false,
            show_hidden_files: false,
            show_outline: false,
            show_frontmatter: false,
            has_frontmatter: false,
            debouncer: None,
            folder_debouncer: None,
            startup_error: startup_error.map(str::to_string),
            interactive: None,
        }
    }

    #[test]
    fn no_path_in_empty_mode() {
        assert_eq!(
            current_file_display_path(&app_state(AppMode::Empty, "", None, None)),
            None
        );
    }

    #[test]
    fn no_path_in_folder_mode_without_file() {
        let state = app_state(AppMode::Folder, "", Some(r"C:\docs"), None);
        assert_eq!(current_file_display_path(&state), None);
    }

    #[test]
    fn folder_mode_returns_displayed_file() {
        let state = app_state(AppMode::Folder, r"C:\docs\a.md", Some(r"C:\docs"), None);
        assert_eq!(current_file_display_path(&state).as_deref(), Some(r"C:\docs\a.md"));
    }

    #[test]
    fn file_mode_returns_file() {
        let state = app_state(AppMode::File, r"C:\docs\readme.md", None, None);
        assert_eq!(current_file_display_path(&state).as_deref(), Some(r"C:\docs\readme.md"));
    }

    #[test]
    fn no_path_on_startup_error() {
        let state = app_state(AppMode::Empty, "", None, Some("File not found: x.md"));
        assert_eq!(current_file_display_path(&state), None);
    }

    #[test]
    fn verbatim_prefix_stripped() {
        let state = app_state(AppMode::File, r"\\?\C:\docs\readme.md", None, None);
        assert_eq!(current_file_display_path(&state).as_deref(), Some(r"C:\docs\readme.md"));
    }

    #[test]
    fn verbatim_unc_normalized() {
        let state = app_state(AppMode::File, r"\\?\UNC\server\share\doc.md", None, None);
        assert_eq!(
            current_file_display_path(&state).as_deref(),
            Some(r"\\server\share\doc.md")
        );
    }

    #[test]
    fn copy_without_file_skips_clipboard() {
        let result = copy_path_with(None, |_| panic!("clipboard must not be written"));
        assert_eq!(result, Ok(None));
    }

    #[test]
    fn copy_writes_path_and_returns_it() {
        let mut written = None;
        let result = copy_path_with(Some(r"C:\a.md".into()), |p| {
            written = Some(p);
            Ok(())
        });
        assert_eq!(result, Ok(Some(r"C:\a.md".to_string())));
        assert_eq!(written.as_deref(), Some(r"C:\a.md"));
    }

    #[test]
    fn copy_propagates_clipboard_error() {
        let result = copy_path_with(Some(r"C:\a.md".into()), |_| Err("busy".into()));
        assert_eq!(result, Err("busy".to_string()));
    }
}
