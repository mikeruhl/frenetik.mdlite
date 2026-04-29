use std::path::Path;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

pub(crate) const MAX_RECENT: usize = 10;
pub(crate) const DEFAULT_ZOOM: u32 = 100;
pub(crate) const MIN_ZOOM: u32 = 50;
pub(crate) const MAX_ZOOM: u32 = 200;
pub(crate) const ZOOM_STEP: u32 = 10;

pub(crate) const STORE_FILE: &str = "settings.json";

pub(crate) fn add_to_recent_list(path: &Path, list: &mut Vec<String>) {
    let s = path.to_string_lossy().to_string();
    list.retain(|p| p != &s);
    list.insert(0, s);
    list.truncate(MAX_RECENT);
}

pub(crate) fn prune_recent_list(list: Vec<String>) -> Vec<String> {
    list.into_iter().filter(|p| Path::new(p).exists()).collect()
}

pub(crate) fn store_get_theme(app: &tauri::AppHandle) -> String {
    let store = app.store(STORE_FILE).expect("store");
    store
        .get("theme")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "github".to_string())
}

pub(crate) fn store_set_theme(app: &tauri::AppHandle, theme: &str) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("theme", serde_json::json!(theme));
    let _ = store.save();
}

pub(crate) fn store_get_zoom(app: &tauri::AppHandle) -> u32 {
    let store = app.store(STORE_FILE).expect("store");
    store
        .get("zoom")
        .and_then(|v| v.as_u64())
        .map(|z| z.clamp(MIN_ZOOM as u64, MAX_ZOOM as u64) as u32)
        .unwrap_or(DEFAULT_ZOOM)
}

pub(crate) fn store_set_zoom(app: &tauri::AppHandle, zoom: u32) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("zoom", serde_json::json!(zoom));
    let _ = store.save();
}

pub(crate) fn store_get_recent(app: &tauri::AppHandle) -> Vec<String> {
    let store = app.store(STORE_FILE).expect("store");
    store
        .get("recent_files")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

pub(crate) fn store_set_recent(app: &tauri::AppHandle, files: &[String]) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("recent_files", serde_json::json!(files));
    let _ = store.save();
}

pub(crate) fn store_get_print_header(app: &tauri::AppHandle) -> bool {
    let store = app.store(STORE_FILE).expect("store");
    store.get("print_header").and_then(|v| v.as_bool()).unwrap_or(true)
}

pub(crate) fn store_set_print_header(app: &tauri::AppHandle, enabled: bool) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("print_header", serde_json::json!(enabled));
    let _ = store.save();
}

pub(crate) fn store_add_recent(app: &tauri::AppHandle, path: &Path) -> Vec<String> {
    let mut list = store_get_recent(app);
    add_to_recent_list(path, &mut list);
    store_set_recent(app, &list);
    list
}

pub(crate) fn store_prune_recent(app: &tauri::AppHandle) -> Vec<String> {
    let list = store_get_recent(app);
    let valid = prune_recent_list(list);
    store_set_recent(app, &valid);
    valid
}

pub(crate) fn store_get_recent_folders(app: &tauri::AppHandle) -> Vec<String> {
    let store = app.store(STORE_FILE).expect("store");
    store
        .get("recent_folders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

pub(crate) fn store_set_recent_folders(app: &tauri::AppHandle, folders: &[String]) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("recent_folders", serde_json::json!(folders));
    let _ = store.save();
}

pub(crate) fn store_add_recent_folder(app: &tauri::AppHandle, path: &Path) -> Vec<String> {
    let mut list = store_get_recent_folders(app);
    add_to_recent_list(path, &mut list);
    store_set_recent_folders(app, &list);
    list
}

pub(crate) fn store_get_show_hidden_files(app: &tauri::AppHandle) -> bool {
    let store = app.store(STORE_FILE).expect("store");
    store
        .get("show_hidden_files")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub(crate) fn store_set_show_hidden_files(app: &tauri::AppHandle, enabled: bool) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("show_hidden_files", serde_json::json!(enabled));
    let _ = store.save();
}

pub(crate) fn store_get_show_frontmatter(app: &tauri::AppHandle) -> bool {
    let store = app.store(STORE_FILE).expect("store");
    store.get("show_frontmatter").and_then(|v| v.as_bool()).unwrap_or(false)
}

pub(crate) fn store_set_show_frontmatter(app: &tauri::AppHandle, enabled: bool) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("show_frontmatter", serde_json::json!(enabled));
    let _ = store.save();
}

pub(crate) fn store_prune_recent_folders(app: &tauri::AppHandle) -> Vec<String> {
    let list = store_get_recent_folders(app);
    let valid = prune_recent_list(list);
    store_set_recent_folders(app, &valid);
    valid
}

pub(crate) fn migrate_store_keys(app: &tauri::AppHandle) {
    let store = app.store(STORE_FILE).expect("store");
    if let Some(val) = store.get("show_dot_files") {
        if store.get("show_hidden_files").is_none() {
            store.set("show_hidden_files", val.clone());
        }
        store.delete("show_dot_files");
        let _ = store.save();
    }
}

pub(crate) fn migrate_legacy_config(app: &tauri::AppHandle) {
    let dir = app.path().app_config_dir().expect("Failed to resolve app config dir");
    let old_path = dir.join("config.json");
    if !old_path.exists() {
        return;
    }

    let data = match std::fs::read_to_string(&old_path) {
        Ok(d) => d,
        Err(_) => return,
    };
    let old: serde_json::Value = match serde_json::from_str(&data) {
        Ok(v) => v,
        Err(_) => return,
    };

    let store = app.store(STORE_FILE).expect("store");

    if let Some(theme) = old.get("theme").and_then(|v| v.as_str()) {
        store.set("theme", serde_json::json!(theme));
    }
    if let Some(zoom) = old.get("zoom").and_then(|v| v.as_u64()) {
        store.set("zoom", serde_json::json!(zoom));
    }
    if let Some(recent) = old.get("recent_files") {
        store.set("recent_files", recent.clone());
    }

    let _ = store.save();
    let _ = std::fs::remove_file(&old_path);
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let mut list: Vec<String> = (0..MAX_RECENT).map(|i| format!("{}.md", i)).collect();
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

    #[test]
    fn prune_removes_nonexistent_paths() {
        let tmp = tempfile::TempDir::new().unwrap();
        let real = tmp.path().join("exists.md");
        std::fs::write(&real, "# exists").unwrap();

        let list = vec![real.to_string_lossy().to_string(), "/no/such/file.md".to_string()];

        let pruned = prune_recent_list(list);
        assert_eq!(pruned.len(), 1);
        assert_eq!(pruned[0], real.to_string_lossy().to_string());
    }

    #[test]
    fn prune_all_invalid_returns_empty() {
        let list = vec!["/fake/path/a.md".to_string(), "/fake/path/b.md".to_string()];
        let pruned = prune_recent_list(list);
        assert!(pruned.is_empty());
    }

    #[test]
    fn prune_empty_list_returns_empty() {
        let pruned = prune_recent_list(vec![]);
        assert!(pruned.is_empty());
    }
}
