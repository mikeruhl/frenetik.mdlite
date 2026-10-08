use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

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

    let folder_name = {
        let mut s = state.lock().unwrap();
        s.file_path = file_path.clone();
        s.folder_path
            .as_ref()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    };
    let name = file_path.file_name().unwrap_or_default().to_string_lossy();
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&format!("mdlite — {} — {}", folder_name, name));
    }

    Ok(content)
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
pub(crate) fn set_interactive_dirty(dirty: bool, state: tauri::State<'_, Mutex<AppState>>) {
    if let Some(session) = state.lock().unwrap().interactive.as_mut() {
        session.dirty = dirty;
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
            dirty: false,
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
}
