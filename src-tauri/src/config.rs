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

pub(crate) fn normalize_host(host: &str) -> Option<String> {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() {
        return None;
    }
    let parsed = reqwest::Url::parse(&format!("http://{host}/")).ok()?;
    (parsed.host_str() == Some(host.as_str())).then_some(host)
}

pub(crate) fn add_host_to_list(list: &mut Vec<String>, host: &str) -> bool {
    match normalize_host(host) {
        Some(h) if !list.contains(&h) => {
            list.push(h);
            true
        }
        _ => false,
    }
}

pub(crate) fn remove_host_from_list(list: &mut Vec<String>, host: &str) -> bool {
    let Some(h) = normalize_host(host) else {
        return false;
    };
    let before = list.len();
    list.retain(|entry| entry != &h);
    list.len() != before
}

pub(crate) fn store_get_image_allowlist(app: &tauri::AppHandle) -> Vec<String> {
    let store = app.store(STORE_FILE).expect("store");
    let raw: Vec<String> = store
        .get("image_allowlist")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let mut list = Vec::new();
    for host in &raw {
        add_host_to_list(&mut list, host);
    }
    list
}

fn store_set_image_allowlist(app: &tauri::AppHandle, list: &[String]) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("image_allowlist", serde_json::json!(list));
    let _ = store.save();
}

pub(crate) fn store_add_image_host(app: &tauri::AppHandle, host: &str) -> Result<Vec<String>, String> {
    let mut list = store_get_image_allowlist(app);
    if normalize_host(host).is_none() {
        return Err(format!("Invalid host: {host}"));
    }
    if add_host_to_list(&mut list, host) {
        store_set_image_allowlist(app, &list);
    }
    Ok(list)
}

pub(crate) fn store_remove_image_host(app: &tauri::AppHandle, host: &str) -> Vec<String> {
    let mut list = store_get_image_allowlist(app);
    if remove_host_from_list(&mut list, host) {
        store_set_image_allowlist(app, &list);
    }
    list
}

pub(crate) const DEFAULT_SAFE_FILE_TYPES: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "pdf", "txt", "csv", "json", "yaml", "yml", "log", "mp3", "wav",
    "mp4", "webm", "mov", "docx", "xlsx", "pptx",
];

pub(crate) const EXECUTABLE_EXTENSIONS: &[&str] = &[
    "exe",
    "com",
    "bat",
    "cmd",
    "ps1",
    "psm1",
    "vbs",
    "vbe",
    "js",
    "jse",
    "wsf",
    "wsh",
    "hta",
    "msi",
    "msp",
    "lnk",
    "scr",
    "cpl",
    "jar",
    "reg",
    "url",
    "appref-ms",
    "sh",
    "app",
    "command",
    "pif",
    "scf",
    "msc",
    "chm",
    "inf",
    "ws",
    "wsc",
    "psc1",
    "ps1xml",
    "application",
    "gadget",
    "settingcontent-ms",
    "library-ms",
    "search-ms",
    "diagcab",
    "appx",
    "msix",
    "appinstaller",
    "xll",
    "iqy",
    "slk",
    "vb",
];

pub(crate) fn normalize_origin(origin: &str) -> Option<String> {
    url_origin(&reqwest::Url::parse(origin.trim()).ok()?)
}

pub(crate) fn url_origin(url: &reqwest::Url) -> Option<String> {
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let host = normalize_host(url.host_str()?)?;
    Some(format!("{}://{host}", url.scheme()))
}

pub(crate) fn normalize_extension(ext: &str) -> Option<String> {
    let ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    let valid = !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    valid.then_some(ext)
}

pub(crate) fn add_file_type_to_list(list: &mut Vec<String>, ext: &str) -> Result<bool, String> {
    let Some(e) = normalize_extension(ext) else {
        return Err(format!("Invalid file type: {ext}"));
    };
    if EXECUTABLE_EXTENSIONS.contains(&e.as_str()) {
        return Err(format!("Executable file types can't be opened directly: .{e}"));
    }
    if list.contains(&e) {
        return Ok(false);
    }
    list.push(e);
    Ok(true)
}

pub(crate) fn store_get_trusted_origins(app: &tauri::AppHandle) -> Vec<String> {
    let store = app.store(STORE_FILE).expect("store");
    let raw: Vec<String> = store
        .get("trusted_link_domains")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let mut list = Vec::new();
    for origin in raw.iter().filter_map(|o| normalize_origin(o)) {
        if !list.contains(&origin) {
            list.push(origin);
        }
    }
    list
}

fn store_set_trusted_origins(app: &tauri::AppHandle, list: &[String]) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("trusted_link_domains", serde_json::json!(list));
    let _ = store.save();
}

pub(crate) fn store_add_trusted_origin(app: &tauri::AppHandle, origin: &str) -> Result<Vec<String>, String> {
    let Some(normalized) = normalize_origin(origin) else {
        return Err(format!("Invalid origin: {origin}"));
    };
    let mut list = store_get_trusted_origins(app);
    if !list.contains(&normalized) {
        list.push(normalized);
        store_set_trusted_origins(app, &list);
    }
    Ok(list)
}

pub(crate) fn store_remove_trusted_origin(app: &tauri::AppHandle, origin: &str) -> Vec<String> {
    let mut list = store_get_trusted_origins(app);
    if let Some(normalized) = normalize_origin(origin) {
        let before = list.len();
        list.retain(|entry| entry != &normalized);
        if list.len() != before {
            store_set_trusted_origins(app, &list);
        }
    }
    list
}

pub(crate) fn store_get_safe_file_types(app: &tauri::AppHandle) -> Vec<String> {
    let store = app.store(STORE_FILE).expect("store");
    let Some(raw) = store
        .get("safe_file_types")
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
    else {
        return DEFAULT_SAFE_FILE_TYPES.iter().map(|e| (*e).to_string()).collect();
    };
    let mut list = Vec::new();
    for ext in &raw {
        let _ = add_file_type_to_list(&mut list, ext);
    }
    list
}

fn store_set_safe_file_types(app: &tauri::AppHandle, list: &[String]) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("safe_file_types", serde_json::json!(list));
    let _ = store.save();
}

pub(crate) fn store_add_safe_file_type(app: &tauri::AppHandle, ext: &str) -> Result<Vec<String>, String> {
    let mut list = store_get_safe_file_types(app);
    if add_file_type_to_list(&mut list, ext)? {
        store_set_safe_file_types(app, &list);
    }
    Ok(list)
}

pub(crate) fn store_remove_safe_file_type(app: &tauri::AppHandle, ext: &str) -> Vec<String> {
    let mut list = store_get_safe_file_types(app);
    if let Some(e) = normalize_extension(ext) {
        let before = list.len();
        list.retain(|entry| entry != &e);
        if list.len() != before {
            store_set_safe_file_types(app, &list);
        }
    }
    list
}

pub(crate) fn store_reset_safe_file_types(app: &tauri::AppHandle) -> Vec<String> {
    let store = app.store(STORE_FILE).expect("store");
    store.delete("safe_file_types");
    let _ = store.save();
    store_get_safe_file_types(app)
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

/// Live Block consent as `(document path, content sha256)` pairs, most recently used first.
pub(crate) fn store_get_live_consent(app: &tauri::AppHandle) -> Vec<(String, String)> {
    let store = app.store(STORE_FILE).expect("store");
    store
        .get("live_consent")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

pub(crate) fn store_set_live_consent(app: &tauri::AppHandle, list: &[(String, String)]) {
    let store = app.store(STORE_FILE).expect("store");
    store.set("live_consent", serde_json::json!(list));
    let _ = store.save();
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

    #[test]
    fn normalize_host_lowercases_and_trims() {
        assert_eq!(normalize_host("  Example.COM. "), Some("example.com".to_string()));
    }

    #[test]
    fn normalize_host_rejects_non_hosts() {
        for bad in [
            "",
            "example.com/path",
            "user@example.com",
            "example.com:443",
            "http://example.com",
            "a b",
        ] {
            assert_eq!(normalize_host(bad), None, "{bad}");
        }
    }

    #[test]
    fn add_host_dedupes_case_insensitively() {
        let mut list = Vec::new();
        assert!(add_host_to_list(&mut list, "Example.com"));
        assert!(!add_host_to_list(&mut list, "EXAMPLE.COM"));
        assert_eq!(list, vec!["example.com"]);
    }

    #[test]
    fn add_host_rejects_invalid() {
        let mut list = Vec::new();
        assert!(!add_host_to_list(&mut list, "example.com/x"));
        assert!(list.is_empty());
    }

    #[test]
    fn remove_host_matches_normalized() {
        let mut list = vec!["example.com".to_string(), "other.org".to_string()];
        assert!(remove_host_from_list(&mut list, "EXAMPLE.com"));
        assert_eq!(list, vec!["other.org"]);
        assert!(!remove_host_from_list(&mut list, "missing.net"));
    }

    #[test]
    fn normalize_origin_keeps_scheme_and_host() {
        assert_eq!(
            normalize_origin("HTTPS://Docs.Example.com:8443/a?b"),
            Some("https://docs.example.com".into())
        );
        assert_eq!(
            normalize_origin("http://example.com"),
            Some("http://example.com".into())
        );
        assert_eq!(normalize_origin("ftp://example.com"), None);
        assert_eq!(normalize_origin("example.com"), None);
    }

    #[test]
    fn trusted_origin_scheme_is_part_of_identity() {
        assert_ne!(normalize_origin("https://a.com"), normalize_origin("http://a.com"));
    }

    #[test]
    fn normalize_extension_variants() {
        assert_eq!(normalize_extension(" .PNG "), Some("png".into()));
        assert_eq!(normalize_extension("..pdf"), Some("pdf".into()));
        assert_eq!(normalize_extension(""), None);
        assert_eq!(normalize_extension("a/b"), None);
    }

    #[test]
    fn executables_cannot_be_added() {
        let mut list = vec![];
        for ext in ["exe", ".BAT", "Ps1", "appref-ms"] {
            let err = add_file_type_to_list(&mut list, ext).unwrap_err();
            assert!(
                err.starts_with("Executable file types can't be opened directly"),
                "{err}"
            );
        }
        assert!(list.is_empty());
    }

    #[test]
    fn windows_code_running_types_cannot_be_added() {
        let mut list = vec![];
        for ext in [
            "pif",
            "msc",
            "settingcontent-ms",
            "search-ms",
            "appinstaller",
            "xll",
            "iqy",
            "ps1xml",
        ] {
            assert!(add_file_type_to_list(&mut list, ext).is_err(), "{ext}");
        }
        assert!(list.is_empty());
    }

    #[test]
    fn add_file_type_dedupes_and_rejects_invalid() {
        let mut list = vec!["png".to_string()];
        assert_eq!(add_file_type_to_list(&mut list, ".PNG"), Ok(false));
        assert_eq!(add_file_type_to_list(&mut list, "heic"), Ok(true));
        assert_eq!(
            add_file_type_to_list(&mut list, "a b").unwrap_err(),
            "Invalid file type: a b"
        );
    }

    #[test]
    fn defaults_contain_no_executables() {
        assert!(DEFAULT_SAFE_FILE_TYPES
            .iter()
            .all(|e| !EXECUTABLE_EXTENSIONS.contains(e)));
    }
}
