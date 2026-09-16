use serde::Serialize;
use std::collections::VecDeque;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

use crate::{display_path, AppState};

#[cfg(unix)]
fn is_hidden(entry: &std::fs::DirEntry) -> bool {
    entry.file_name().to_string_lossy().starts_with('.')
}

#[cfg(windows)]
fn is_hidden(entry: &std::fs::DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    entry
        .metadata()
        .map(|m| m.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0)
        .unwrap_or(false)
}

#[derive(Serialize, Clone)]
pub(crate) struct FolderEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) is_folder: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) children: Option<Vec<FolderEntry>>,
}

#[derive(Serialize, Clone)]
pub(crate) struct DirAncestor {
    name: String,
    path: String,
}

#[derive(Serialize, Clone)]
struct FolderScanFiles {
    path_chain: Vec<DirAncestor>,
    files: Vec<FolderEntry>,
}

/// Gates progressive-scan staleness only (aborting/discarding results from a scan superseded by a
/// newer one for the same folder). Bumped by `run_progressive_scan` on every scan start and by
/// `cancel_folder_scan`. Must NOT be used to gate folder-watcher liveness - use `FOLDER_GEN` for
/// that, since a scan restart (initial scan, manual rescan) is not a folder/file switch and must
/// not invalidate an already-running watcher.
pub(crate) static SCAN_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Identifies the current watched folder/file target. Bumped only when that target itself changes:
/// `switch_to_folder`, `switch_file`, and the app-startup watcher wiring. The folder watcher's
/// per-batch guard compares against the value captured at its creation, so a scan restart for the
/// same folder (which only bumps `SCAN_GENERATION`) never trips it - only an actual folder/file
/// switch does.
pub(crate) static FOLDER_GEN: AtomicU64 = AtomicU64::new(0);

pub(crate) fn compute_path_chain(root: &Path, file: &Path) -> Vec<DirAncestor> {
    let parent = match file.parent() {
        Some(p) => p,
        None => return vec![],
    };
    let relative = match parent.strip_prefix(root) {
        Ok(r) => r,
        Err(_) => return vec![],
    };
    let mut chain = Vec::new();
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let name = component.as_os_str().to_string_lossy().to_string();
        current = current.join(&name);
        chain.push(DirAncestor {
            name,
            path: crate::display_path(&current),
        });
    }
    chain
}

pub(crate) fn is_markdown_ext(ext: &std::ffi::OsStr) -> bool {
    let s = ext.to_string_lossy().to_lowercase();
    s == "md" || s == "markdown" || s == "mdx"
}

#[cfg(test)]
pub(crate) fn scan_folder(dir: &Path) -> Vec<FolderEntry> {
    scan_folder_with_opts(dir, false)
}

#[cfg(test)]
fn scan_folder_with_opts(dir: &Path, show_hidden_files: bool) -> Vec<FolderEntry> {
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

        if !show_hidden_files && is_hidden(&entry) {
            continue;
        }

        if path.is_dir() {
            let children = scan_folder_with_opts(&path, show_hidden_files);
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

/// Recursively collects every markdown file path beneath `root`. A synchronous
/// reference implementation used only by tests; production code populates the
/// same registry incrementally inside `run_progressive_scan`'s existing walk
/// instead of performing a second full traversal.
#[cfg(test)]
fn collect_markdown_files(root: &Path, show_hidden_files: bool) -> std::collections::HashSet<std::path::PathBuf> {
    let mut result = std::collections::HashSet::new();
    let mut queue: VecDeque<std::path::PathBuf> = VecDeque::new();
    queue.push_back(root.to_path_buf());

    while let Some(dir) = queue.pop_front() {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in rd.flatten() {
            let path = entry.path();
            if !show_hidden_files && is_hidden(&entry) {
                continue;
            }
            if path.is_dir() {
                queue.push_back(path);
            } else if path.is_file() {
                if let Some(ext) = path.extension() {
                    if is_markdown_ext(ext) {
                        result.insert(path);
                    }
                }
            }
        }
    }

    result
}

pub(crate) fn find_default_file(dir: &Path) -> Option<std::path::PathBuf> {
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
            .filter(|e| e.path().is_file() && e.path().extension().is_some_and(is_markdown_ext))
            .collect();
        md_files.sort_by_key(|e| e.file_name());
        return md_files.first().map(|e| e.path());
    }
    None
}

struct DirScanResult {
    /// Subdirectories to recurse into: (name, path).
    subdirs: Vec<(String, std::path::PathBuf)>,
    /// Markdown files found directly in this directory: (name, path).
    markdown_files: Vec<(String, std::path::PathBuf)>,
}

/// Scans a single directory (non-recursive) for subdirectories and markdown
/// files. Pure and side-effect-free so it can be exercised directly by tests,
/// unlike `run_progressive_scan` which needs a live Tauri app/state to run.
/// This is the actual production file-discovery logic - `run_progressive_scan`
/// calls it directly, it isn't a separate test-only reference implementation.
fn scan_directory_entries(dir: &Path, show_hidden_files: bool) -> DirScanResult {
    let mut subdirs = Vec::new();
    let mut markdown_files = Vec::new();

    let Ok(rd) = std::fs::read_dir(dir) else {
        return DirScanResult {
            subdirs,
            markdown_files,
        };
    };
    let mut items: Vec<_> = rd.flatten().collect();
    items.sort_by_key(|e| e.file_name());

    for entry in items {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if !show_hidden_files && is_hidden(&entry) {
            continue;
        }
        if path.is_dir() {
            subdirs.push((name, path));
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                if is_markdown_ext(ext) {
                    markdown_files.push((name, path));
                }
            }
        }
    }

    DirScanResult {
        subdirs,
        markdown_files,
    }
}

pub(crate) fn run_progressive_scan(root: std::path::PathBuf, app: tauri::AppHandle, show_hidden_files: bool) {
    let gen = SCAN_GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        {
            // The generation check must happen while holding the lock: otherwise a
            // newer scan (or folder switch) can bump SCAN_GENERATION and clear+start
            // repopulating in the gap between this check and acquiring the lock,
            // and this now-stale clear would wipe out its work.
            let state = app.state::<Mutex<AppState>>();
            let mut state = state.lock().unwrap();
            if SCAN_GENERATION.load(Ordering::Relaxed) == gen {
                state.folder_files.clear();
            }
        }

        let mut queue: VecDeque<(std::path::PathBuf, Vec<DirAncestor>)> = VecDeque::new();
        queue.push_back((root, Vec::new()));

        while let Some((dir, chain)) = queue.pop_front() {
            if SCAN_GENERATION.load(Ordering::Relaxed) != gen {
                return;
            }

            let scanned = scan_directory_entries(&dir, show_hidden_files);

            for (name, path) in scanned.subdirs {
                let mut child_chain = chain.clone();
                child_chain.push(DirAncestor {
                    name,
                    path: display_path(&path),
                });
                queue.push_back((path, child_chain));
            }

            let mut files = Vec::with_capacity(scanned.markdown_files.len());
            let mut file_paths = Vec::with_capacity(scanned.markdown_files.len());
            for (name, path) in scanned.markdown_files {
                files.push(FolderEntry {
                    name,
                    path: display_path(&path),
                    is_folder: false,
                    children: None,
                });
                file_paths.push(path);
            }

            if !files.is_empty() && SCAN_GENERATION.load(Ordering::Relaxed) == gen {
                // Re-verify each path still exists right before registering/emitting it,
                // shrinking (though not eliminating) the window for a concurrent delete
                // between read_dir and here to leave a stale registry/DOM entry behind.
                let mut still_present_files = Vec::with_capacity(files.len());
                let mut still_present_paths = Vec::with_capacity(file_paths.len());
                for (file, path) in files.into_iter().zip(file_paths) {
                    if path.is_file() {
                        still_present_paths.push(path);
                        still_present_files.push(file);
                    }
                }

                if !still_present_files.is_empty() {
                    // The generation check, the registry insert, and the emit must all
                    // happen under one lock: a newer scan's clear (also lock-guarded)
                    // otherwise could land between the insert and the emit, letting this
                    // now-stale batch reach the frontend after the registry moved on.
                    let state = app.state::<Mutex<AppState>>();
                    let mut state = state.lock().unwrap();
                    if SCAN_GENERATION.load(Ordering::Relaxed) == gen {
                        for path in still_present_paths {
                            state.folder_files.insert(path);
                        }
                        let _ = app.emit(
                            "folder-scan-files",
                            FolderScanFiles {
                                path_chain: chain,
                                files: still_present_files,
                            },
                        );
                    }
                }
            }
        }

        if SCAN_GENERATION.load(Ordering::Relaxed) == gen {
            let _ = app.emit("folder-scan-complete", ());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn create_file(dir: &Path, name: &str) {
        fs::write(dir.join(name), "# test").unwrap();
    }

    fn create_subdir(dir: &Path, name: &str) -> PathBuf {
        let sub = dir.join(name);
        fs::create_dir(&sub).unwrap();
        sub
    }

    fn create_hidden_subdir(dir: &Path, name: &str) -> PathBuf {
        let sub = create_subdir(dir, name);
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("attrib")
                .args(["+H", &sub.to_string_lossy()])
                .status();
        }
        sub
    }

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
    fn scan_folder_skips_hidden_directories() {
        let tmp = TempDir::new().unwrap();
        let hidden = create_hidden_subdir(tmp.path(), ".git");
        create_file(&hidden, "HEAD.md");
        create_file(tmp.path(), "visible.md");

        let entries = scan_folder(tmp.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "visible.md");
    }

    #[test]
    fn scan_folder_shows_hidden_directories_when_enabled() {
        let tmp = TempDir::new().unwrap();
        let hidden = create_hidden_subdir(tmp.path(), ".hidden");
        create_file(&hidden, "secret.md");
        create_file(tmp.path(), "visible.md");

        let entries = scan_folder_with_opts(tmp.path(), true);
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&".hidden"));
        assert!(names.contains(&"visible.md"));
    }

    #[test]
    #[cfg(windows)]
    fn scan_folder_skips_windows_hidden_non_dot_directories() {
        let tmp = TempDir::new().unwrap();
        let hidden = create_hidden_subdir(tmp.path(), "hidden_dir");
        create_file(&hidden, "secret.md");
        create_file(tmp.path(), "visible.md");

        let entries = scan_folder(tmp.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "visible.md");
    }

    #[test]
    #[cfg(windows)]
    fn scan_folder_shows_windows_hidden_non_dot_directories_when_enabled() {
        let tmp = TempDir::new().unwrap();
        let hidden = create_hidden_subdir(tmp.path(), "hidden_dir");
        create_file(&hidden, "secret.md");
        create_file(tmp.path(), "visible.md");

        let entries = scan_folder_with_opts(tmp.path(), true);
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"hidden_dir"));
        assert!(names.contains(&"visible.md"));
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

    #[test]
    fn compute_path_chain_nested() {
        let tmp = TempDir::new().unwrap();
        let sub1 = create_subdir(tmp.path(), "sub1");
        let sub2 = create_subdir(&sub1, "sub2");
        create_file(&sub2, "readme.md");
        let file = sub2.join("readme.md");

        let chain = compute_path_chain(tmp.path(), &file);
        assert_eq!(chain.len(), 2);
        assert_eq!(chain[0].name, "sub1");
        assert_eq!(chain[0].path, display_path(&sub1));
        assert_eq!(chain[1].name, "sub2");
        assert_eq!(chain[1].path, display_path(&sub2));
    }

    #[test]
    fn compute_path_chain_root_file() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "readme.md");
        let file = tmp.path().join("readme.md");

        let chain = compute_path_chain(tmp.path(), &file);
        assert!(chain.is_empty());
    }

    #[test]
    fn collect_markdown_files_nested_structure() {
        let tmp = TempDir::new().unwrap();
        let docs = create_subdir(tmp.path(), "docs");
        let deep = create_subdir(&docs, "api");
        create_file(&deep, "reference.md");
        create_file(tmp.path(), "README.md");
        create_file(tmp.path(), "image.png");

        let files = collect_markdown_files(tmp.path(), false);
        assert_eq!(files.len(), 2);
        assert!(files.contains(&tmp.path().join("README.md")));
        assert!(files.contains(&deep.join("reference.md")));
    }

    #[test]
    fn collect_markdown_files_skips_hidden_directories() {
        let tmp = TempDir::new().unwrap();
        let hidden = create_hidden_subdir(tmp.path(), ".git");
        create_file(&hidden, "HEAD.md");
        create_file(tmp.path(), "visible.md");

        let files = collect_markdown_files(tmp.path(), false);
        assert_eq!(files.len(), 1);
        assert!(files.contains(&tmp.path().join("visible.md")));
    }

    #[test]
    fn collect_markdown_files_includes_hidden_when_enabled() {
        let tmp = TempDir::new().unwrap();
        let hidden = create_hidden_subdir(tmp.path(), ".hidden");
        create_file(&hidden, "secret.md");
        create_file(tmp.path(), "visible.md");

        let files = collect_markdown_files(tmp.path(), true);
        assert_eq!(files.len(), 2);
        assert!(files.contains(&hidden.join("secret.md")));
    }

    #[test]
    fn collect_markdown_files_empty_dir_returns_empty_set() {
        let tmp = TempDir::new().unwrap();
        let files = collect_markdown_files(tmp.path(), false);
        assert!(files.is_empty());
    }

    // scan_directory_entries is the actual production file-discovery logic
    // run_progressive_scan calls - unlike collect_markdown_files above, these
    // tests exercise the real code path used for registry population.

    #[test]
    fn scan_directory_entries_finds_markdown_files_and_subdirs() {
        let tmp = TempDir::new().unwrap();
        create_file(tmp.path(), "readme.md");
        create_file(tmp.path(), "image.png");
        let sub = create_subdir(tmp.path(), "docs");

        let result = scan_directory_entries(tmp.path(), false);

        assert_eq!(result.markdown_files.len(), 1);
        assert_eq!(result.markdown_files[0].0, "readme.md");
        assert_eq!(result.markdown_files[0].1, tmp.path().join("readme.md"));

        assert_eq!(result.subdirs.len(), 1);
        assert_eq!(result.subdirs[0].0, "docs");
        assert_eq!(result.subdirs[0].1, sub);
    }

    #[test]
    fn scan_directory_entries_is_not_recursive() {
        let tmp = TempDir::new().unwrap();
        let sub = create_subdir(tmp.path(), "docs");
        create_file(&sub, "nested.md");

        let result = scan_directory_entries(tmp.path(), false);

        assert!(result.markdown_files.is_empty());
        assert_eq!(result.subdirs.len(), 1);
    }

    #[test]
    fn scan_directory_entries_skips_hidden_unless_enabled() {
        let tmp = TempDir::new().unwrap();
        let hidden = create_hidden_subdir(tmp.path(), ".git");
        create_file(&hidden, "HEAD.md");
        create_file(tmp.path(), "visible.md");

        let result = scan_directory_entries(tmp.path(), false);
        assert_eq!(result.subdirs.len(), 0);
        assert_eq!(result.markdown_files.len(), 1);

        let result_shown = scan_directory_entries(tmp.path(), true);
        assert_eq!(result_shown.subdirs.len(), 1);
    }

    #[test]
    fn scan_directory_entries_nonexistent_dir_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let missing = tmp.path().join("does-not-exist");

        let result = scan_directory_entries(&missing, false);
        assert!(result.subdirs.is_empty());
        assert!(result.markdown_files.is_empty());
    }

    #[test]
    fn compute_path_chain_outside_root() {
        let tmp1 = TempDir::new().unwrap();
        let tmp2 = TempDir::new().unwrap();
        create_file(tmp2.path(), "readme.md");
        let file = tmp2.path().join("readme.md");

        let chain = compute_path_chain(tmp1.path(), &file);
        assert!(chain.is_empty());
    }
}
