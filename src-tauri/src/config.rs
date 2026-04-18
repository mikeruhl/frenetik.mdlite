use std::path::Path;

pub(crate) const MAX_RECENT: usize = 10;
pub(crate) const DEFAULT_ZOOM: u32 = 100;
pub(crate) const MIN_ZOOM: u32 = 50;
pub(crate) const MAX_ZOOM: u32 = 200;
pub(crate) const ZOOM_STEP: u32 = 10;

pub(crate) fn load_config_from(path: &Path) -> serde_json::Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or(serde_json::json!({}))
}

pub(crate) fn save_config_to(path: &Path, config: &serde_json::Value) {
    if let Ok(json) = serde_json::to_string_pretty(config) {
        std::fs::write(path, json).ok();
    }
}

pub(crate) fn load_recent_from(config_path: &Path) -> Vec<String> {
    let config = load_config_from(config_path);
    serde_json::from_value(config["recent_files"].clone()).unwrap_or_default()
}

pub(crate) fn save_recent_to(config_path: &Path, files: &[String]) {
    let mut config = load_config_from(config_path);
    config["recent_files"] = serde_json::json!(files);
    save_config_to(config_path, &config);
}

pub(crate) fn load_theme_from(config_path: &Path) -> String {
    let config = load_config_from(config_path);
    config["theme"].as_str().unwrap_or("github").to_string()
}

pub(crate) fn save_theme_to(config_path: &Path, theme: &str) {
    let mut config = load_config_from(config_path);
    config["theme"] = serde_json::json!(theme);
    save_config_to(config_path, &config);
}

pub(crate) fn load_zoom_from(config_path: &Path) -> u32 {
    let config = load_config_from(config_path);
    config["zoom"]
        .as_u64()
        .map(|z| (z as u32).clamp(MIN_ZOOM, MAX_ZOOM))
        .unwrap_or(DEFAULT_ZOOM)
}

pub(crate) fn save_zoom_to(config_path: &Path, zoom: u32) {
    let mut config = load_config_from(config_path);
    config["zoom"] = serde_json::json!(zoom);
    save_config_to(config_path, &config);
}

pub(crate) fn add_to_recent_list(path: &Path, list: &mut Vec<String>) {
    let s = path.to_string_lossy().to_string();
    list.retain(|p| p != &s);
    list.insert(0, s);
    list.truncate(MAX_RECENT);
}

pub(crate) fn prune_recent_list(list: Vec<String>) -> Vec<String> {
    list.into_iter().filter(|p| Path::new(p).exists()).collect()
}

pub(crate) fn config_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    use tauri::Manager;
    let dir = app.path().app_config_dir().expect("Failed to resolve app config dir");
    std::fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

pub(crate) fn load_recent(app: &tauri::AppHandle) -> Vec<String> {
    load_recent_from(&config_path(app))
}

pub(crate) fn save_recent(app: &tauri::AppHandle, files: &[String]) {
    save_recent_to(&config_path(app), files);
}

pub(crate) fn load_theme_config(app: &tauri::AppHandle) -> String {
    load_theme_from(&config_path(app))
}

pub(crate) fn save_theme_config(app: &tauri::AppHandle, theme: &str) {
    save_theme_to(&config_path(app), theme);
}

pub(crate) fn load_zoom_config(app: &tauri::AppHandle) -> u32 {
    load_zoom_from(&config_path(app))
}

pub(crate) fn save_zoom_config(app: &tauri::AppHandle, zoom: u32) {
    save_zoom_to(&config_path(app), zoom);
}

pub(crate) fn add_to_recent(app: &tauri::AppHandle, path: &Path) -> Vec<String> {
    let cp = config_path(app);
    let mut list = load_recent_from(&cp);
    add_to_recent_list(path, &mut list);
    save_recent_to(&cp, &list);
    list
}

pub(crate) fn prune_recent(app: &tauri::AppHandle) -> Vec<String> {
    let cp = config_path(app);
    let list = load_recent_from(&cp);
    let valid = prune_recent_list(list);
    save_recent_to(&cp, &valid);
    valid
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

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

    #[test]
    fn zoom_save_and_load() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");

        save_zoom_to(&cp, 150);
        assert_eq!(load_zoom_from(&cp), 150);
    }

    #[test]
    fn zoom_default_is_100() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");
        assert_eq!(load_zoom_from(&cp), DEFAULT_ZOOM);
    }

    #[test]
    fn zoom_clamps_to_range() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");

        let mut config = serde_json::json!({ "zoom": 10 });
        save_config_to(&cp, &config);
        assert_eq!(load_zoom_from(&cp), MIN_ZOOM);

        config["zoom"] = serde_json::json!(500);
        save_config_to(&cp, &config);
        assert_eq!(load_zoom_from(&cp), MAX_ZOOM);
    }

    #[test]
    fn zoom_preserves_other_config() {
        let tmp = TempDir::new().unwrap();
        let cp = tmp.path().join("config.json");

        save_theme_to(&cp, "retro");
        save_zoom_to(&cp, 120);

        assert_eq!(load_theme_from(&cp), "retro");
        assert_eq!(load_zoom_from(&cp), 120);
    }

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
        let tmp = TempDir::new().unwrap();
        let real = tmp.path().join("exists.md");
        fs::write(&real, "# exists").unwrap();

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
