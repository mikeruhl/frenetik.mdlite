use serde::Serialize;
use std::collections::VecDeque;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Emitter;

use crate::display_path;

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

pub(crate) static SCAN_GENERATION: AtomicU64 = AtomicU64::new(0);

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

pub(crate) fn run_progressive_scan(root: std::path::PathBuf, app: tauri::AppHandle, show_hidden_files: bool) {
    let gen = SCAN_GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        let mut queue: VecDeque<(std::path::PathBuf, Vec<DirAncestor>)> = VecDeque::new();
        queue.push_back((root, Vec::new()));

        while let Some((dir, chain)) = queue.pop_front() {
            if SCAN_GENERATION.load(Ordering::Relaxed) != gen {
                return;
            }

            let Ok(rd) = std::fs::read_dir(&dir) else {
                continue;
            };
            let mut items: Vec<_> = rd.flatten().collect();
            items.sort_by_key(|e| e.file_name());

            let mut files = Vec::new();
            for entry in items {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if !show_hidden_files && is_hidden(&entry) {
                    continue;
                }
                if path.is_dir() {
                    let mut child_chain = chain.clone();
                    child_chain.push(DirAncestor {
                        name: name.clone(),
                        path: display_path(&path),
                    });
                    queue.push_back((path, child_chain));
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

            if !files.is_empty() && SCAN_GENERATION.load(Ordering::Relaxed) == gen {
                let _ = app.emit(
                    "folder-scan-files",
                    FolderScanFiles {
                        path_chain: chain,
                        files,
                    },
                );
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
}
