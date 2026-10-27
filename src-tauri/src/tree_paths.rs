use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::scan::{compute_path_chain, DirAncestor};
use crate::{display_path, AppState};

const NOT_IN_FOLDER_MODE: &str = "Not in folder mode";
const OUTSIDE_FOLDER: &str = "Path is outside the opened folder";

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PathKind {
    Full,
    Relative,
}

#[derive(Debug, PartialEq, Serialize)]
pub(crate) struct Breadcrumb {
    root: DirAncestor,
    folders: Vec<DirAncestor>,
    file: DirAncestor,
}

fn normalized(path: &Path) -> PathBuf {
    PathBuf::from(display_path(path))
}

pub(crate) fn relative_to_root(root: &Path, path: &Path) -> Option<PathBuf> {
    let relative = normalized(path).strip_prefix(normalized(root)).ok()?.to_path_buf();
    (!relative.as_os_str().is_empty()).then_some(relative)
}

fn tree_path_text(root: Option<&Path>, path: &str, kind: PathKind) -> Result<String, String> {
    let root = root.ok_or(NOT_IN_FOLDER_MODE)?;
    let relative = relative_to_root(root, Path::new(path)).ok_or(OUTSIDE_FOLDER)?;
    Ok(match kind {
        PathKind::Full => display_path(Path::new(path)),
        PathKind::Relative => relative.to_string_lossy().to_string(),
    })
}

fn copy_tree_path_with(
    root: Option<&Path>,
    path: &str,
    kind: PathKind,
    write: impl FnOnce(String) -> Result<(), String>,
) -> Result<String, String> {
    let text = tree_path_text(root, path, kind)?;
    write(text.clone())?;
    Ok(text)
}

fn crumb(name: &Path, path: &Path) -> DirAncestor {
    let display = display_path(path);
    let name = name
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| display.clone());
    DirAncestor { name, path: display }
}

pub(crate) fn build_breadcrumb(root: &Path, file: &Path) -> Option<Breadcrumb> {
    let (root, file) = (normalized(root), normalized(file));
    relative_to_root(&root, &file)?;
    Some(Breadcrumb {
        folders: compute_path_chain(&root, &file),
        root: crumb(&root, &root),
        file: crumb(&file, &file),
    })
}

#[tauri::command]
pub(crate) fn copy_tree_path(
    path: String,
    kind: PathKind,
    state: tauri::State<'_, Mutex<AppState>>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let root = state.lock().unwrap().folder_path.clone();
    copy_tree_path_with(root.as_deref(), &path, kind, |text| {
        app.clipboard().write_text(text).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub(crate) fn get_breadcrumb(path: String, state: tauri::State<'_, Mutex<AppState>>) -> Result<Breadcrumb, String> {
    let root = state.lock().unwrap().folder_path.clone().ok_or(NOT_IN_FOLDER_MODE)?;
    build_breadcrumb(&root, Path::new(&path)).ok_or_else(|| OUTSIDE_FOLDER.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sep(s: &str) -> String {
        s.replace('/', std::path::MAIN_SEPARATOR_STR)
    }

    fn root() -> PathBuf {
        PathBuf::from(sep(if cfg!(windows) { "C:/docs" } else { "/docs" }))
    }

    fn under_root(rel: &str) -> String {
        root().join(sep(rel)).to_string_lossy().to_string()
    }

    #[test]
    fn relative_of_nested_file() {
        let rel = relative_to_root(&root(), Path::new(&under_root("guide/setup.md")));
        assert_eq!(rel, Some(PathBuf::from(sep("guide/setup.md"))));
    }

    #[test]
    fn relative_of_folder() {
        let rel = relative_to_root(&root(), Path::new(&under_root("guide")));
        assert_eq!(rel, Some(PathBuf::from("guide")));
    }

    #[test]
    fn root_itself_has_no_relative_path() {
        assert_eq!(relative_to_root(&root(), &root()), None);
    }

    #[test]
    fn path_outside_root_has_no_relative_path() {
        let other = PathBuf::from(sep(if cfg!(windows) { "C:/other/a.md" } else { "/other/a.md" }));
        assert_eq!(relative_to_root(&root(), &other), None);
    }

    #[test]
    fn sibling_with_shared_name_prefix_is_outside() {
        let sibling = PathBuf::from(sep(if cfg!(windows) {
            "C:/docs-old/a.md"
        } else {
            "/docs-old/a.md"
        }));
        assert_eq!(relative_to_root(&root(), &sibling), None);
    }

    #[cfg(windows)]
    #[test]
    fn verbatim_root_matches_display_path() {
        let rel = relative_to_root(Path::new(r"\\?\C:\docs"), Path::new(r"C:\docs\a\b.md"));
        assert_eq!(rel, Some(PathBuf::from(r"a\b.md")));
    }

    #[cfg(windows)]
    #[test]
    fn verbatim_path_matches_display_root() {
        let rel = relative_to_root(Path::new(r"C:\docs"), Path::new(r"\\?\C:\docs\a\b.md"));
        assert_eq!(rel, Some(PathBuf::from(r"a\b.md")));
    }

    #[cfg(windows)]
    #[test]
    fn verbatim_unc_root_matches_display_path() {
        let rel = relative_to_root(Path::new(r"\\?\UNC\server\share"), Path::new(r"\\server\share\doc.md"));
        assert_eq!(rel, Some(PathBuf::from("doc.md")));
    }

    #[test]
    fn full_kind_returns_display_path() {
        let path = under_root("guide/setup.md");
        assert_eq!(tree_path_text(Some(&root()), &path, PathKind::Full), Ok(path));
    }

    #[cfg(windows)]
    #[test]
    fn full_kind_strips_verbatim_prefix() {
        let text = tree_path_text(Some(Path::new(r"\\?\C:\docs")), r"\\?\C:\docs\a.md", PathKind::Full);
        assert_eq!(text, Ok(r"C:\docs\a.md".to_string()));
    }

    #[test]
    fn relative_kind_returns_relative_text() {
        let text = tree_path_text(Some(&root()), &under_root("a/b.md"), PathKind::Relative);
        assert_eq!(text, Ok(sep("a/b.md")));
    }

    #[test]
    fn outside_root_is_an_error_for_both_kinds() {
        let outside = if cfg!(windows) { r"D:\x\a.md" } else { "/x/a.md" };
        for kind in [PathKind::Full, PathKind::Relative] {
            assert_eq!(
                tree_path_text(Some(&root()), outside, kind),
                Err(OUTSIDE_FOLDER.to_string())
            );
        }
    }

    #[test]
    fn no_root_is_an_error() {
        assert_eq!(
            tree_path_text(None, "a.md", PathKind::Full),
            Err(NOT_IN_FOLDER_MODE.to_string())
        );
    }

    #[test]
    fn copy_writes_the_returned_text() {
        let mut written = None;
        let result = copy_tree_path_with(Some(&root()), &under_root("a.md"), PathKind::Relative, |t| {
            written = Some(t);
            Ok(())
        });
        assert_eq!(result, Ok("a.md".to_string()));
        assert_eq!(written.as_deref(), Some("a.md"));
    }

    #[test]
    fn copy_does_not_write_when_outside_root() {
        let outside = if cfg!(windows) { r"D:\x\a.md" } else { "/x/a.md" };
        let result = copy_tree_path_with(Some(&root()), outside, PathKind::Full, |_| {
            panic!("clipboard must not be written")
        });
        assert!(result.is_err());
    }

    #[test]
    fn copy_surfaces_clipboard_failure() {
        let result = copy_tree_path_with(Some(&root()), &under_root("a.md"), PathKind::Full, |_| {
            Err("busy".into())
        });
        assert_eq!(result, Err("busy".to_string()));
    }

    #[test]
    fn breadcrumb_for_nested_file() {
        let file = root().join(sep("guide/setup/install.md"));
        let crumbs = build_breadcrumb(&root(), &file).unwrap();
        assert_eq!(crumbs.root.name, "docs");
        assert_eq!(crumbs.root.path, display_path(&root()));
        let folders: Vec<_> = crumbs.folders.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(folders, ["guide", "setup"]);
        assert_eq!(crumbs.folders[1].path, display_path(&root().join(sep("guide/setup"))));
        assert_eq!(crumbs.file.name, "install.md");
    }

    #[test]
    fn breadcrumb_for_root_file_has_no_folders() {
        let crumbs = build_breadcrumb(&root(), &root().join("a.md")).unwrap();
        assert!(crumbs.folders.is_empty());
        assert_eq!(crumbs.file.name, "a.md");
    }

    #[cfg(windows)]
    #[test]
    fn breadcrumb_folder_paths_are_display_form_for_verbatim_inputs() {
        let crumbs = build_breadcrumb(Path::new(r"\\?\C:\docs"), Path::new(r"\\?\C:\docs\a\b.md")).unwrap();
        assert_eq!(crumbs.root.path, r"C:\docs");
        assert_eq!(crumbs.folders[0].path, r"C:\docs\a");
    }

    #[test]
    fn breadcrumb_outside_root_is_none() {
        let outside = if cfg!(windows) { r"D:\x\a.md" } else { "/x/a.md" };
        assert_eq!(build_breadcrumb(&root(), Path::new(outside)), None);
    }
}
