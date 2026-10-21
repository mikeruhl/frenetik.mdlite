use std::path::Path;
use std::sync::Mutex;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

use crate::commands::current_file_display_path;
use crate::config::{
    store_get_image_allowlist, store_get_recent, store_get_safe_file_types, store_get_trusted_origins,
};
use crate::AppState;

pub(crate) const REMOVE_IMAGE_HOST_PREFIX: &str = "remove-image-host-";
pub(crate) const REMOVE_TRUSTED_ORIGIN_PREFIX: &str = "remove-trusted-origin-";
pub(crate) const REMOVE_SAFE_TYPE_PREFIX: &str = "remove-safe-type-";
pub(crate) const ADD_SAFE_FILE_TYPE_ID: &str = "add-safe-file-type";
pub(crate) const RESET_SAFE_FILE_TYPES_ID: &str = "reset-safe-file-types";
pub(crate) const PROMPT_ADD_FILE_TYPE_EVENT: &str = "prompt-add-file-type";

pub(crate) fn parse_indexed_id(id: &str, prefix: &str) -> Option<usize> {
    id.strip_prefix(prefix)?.parse().ok()
}

pub(crate) struct MenuState {
    pub(crate) print_header: bool,
    pub(crate) show_hidden_files: bool,
    pub(crate) show_outline: bool,
    pub(crate) show_frontmatter: bool,
    pub(crate) has_frontmatter: bool,
    pub(crate) has_file: bool,
    pub(crate) image_hosts: Vec<String>,
    pub(crate) trusted_origins: Vec<String>,
    pub(crate) safe_file_types: Vec<String>,
}

pub(crate) const THEMES: &[(&str, &str)] = &[
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

pub(crate) fn build_menu(
    app: &tauri::AppHandle,
    recent: &[String],
    current_theme: &str,
    state: &MenuState,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let MenuState {
        print_header,
        show_hidden_files,
        show_outline,
        show_frontmatter,
        has_frontmatter,
        has_file,
        ref image_hosts,
        ref trusted_origins,
        ref safe_file_types,
    } = *state;
    let mut recent_sub = SubmenuBuilder::new(app, "Recent Files");
    if recent.is_empty() {
        let item = MenuItemBuilder::with_id("no-recent", "(No Recent Files)")
            .enabled(false)
            .build(app)?;
        recent_sub = recent_sub.item(&item);
    } else {
        for (i, path) in recent.iter().enumerate() {
            let p = Path::new(path);
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            let label = match p.parent().and_then(|d| d.file_name()) {
                Some(dir) => format!("{} — {}", name, dir.to_string_lossy()),
                None => name.to_string(),
            };
            recent_sub = recent_sub.text(format!("recent-{}", i), &label);
        }
        recent_sub = recent_sub.separator().text("clear-recent", "Clear Recent Files");
    }

    let copy_path_item = MenuItemBuilder::with_id("copy-file-path", "Copy File Path\tShift+Alt+C")
        .enabled(has_file)
        .build(app)?;

    let find_item = MenuItemBuilder::with_id("find", "Find...")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;

    let print_item = MenuItemBuilder::with_id("print", "Print...\tCtrl+P").build(app)?;
    let print_header_item = CheckMenuItemBuilder::with_id("toggle-print-header", "Print Header (filename & date)")
        .checked(print_header)
        .build(app)?;

    #[allow(unused_mut)]
    let mut file_menu = SubmenuBuilder::new(app, "File")
        .text("open-file", "Open...")
        .text("open-folder", "Open Folder...")
        .item(&recent_sub.build()?)
        .separator()
        .item(&copy_path_item)
        .separator()
        .item(&find_item)
        .separator()
        .item(&print_item);

    #[cfg(target_os = "windows")]
    {
        let export_pdf_item = MenuItemBuilder::with_id("export-pdf", "Export to PDF...\tCtrl+Shift+E").build(app)?;
        file_menu = file_menu.item(&export_pdf_item);
    }

    let file_menu = file_menu
        .item(&print_header_item)
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

    let nav_back = MenuItemBuilder::with_id("navigate-back", "Back\tAlt+\u{2190}").build(app)?;
    let nav_forward = MenuItemBuilder::with_id("navigate-forward", "Forward\tAlt+\u{2192}").build(app)?;
    let zoom_in = MenuItemBuilder::with_id("zoom-in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(app)?;
    let zoom_out = MenuItemBuilder::with_id("zoom-out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?;
    let zoom_reset = MenuItemBuilder::with_id("zoom-reset", "Reset Zoom")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;
    let toggle_outline = CheckMenuItemBuilder::with_id("toggle-outline", "Show Outline")
        .accelerator("CmdOrCtrl+Shift+O")
        .checked(show_outline)
        .build(app)?;
    let show_hidden_files_item = CheckMenuItemBuilder::with_id("toggle-show-hidden-files", "Show Hidden Files")
        .checked(show_hidden_files)
        .build(app)?;
    let show_frontmatter_item = CheckMenuItemBuilder::with_id("toggle-show-frontmatter", "Show Frontmatter")
        .checked(show_frontmatter)
        .enabled(has_frontmatter)
        .build(app)?;
    let mut image_hosts_sub = SubmenuBuilder::new(app, "Allowed Image Hosts");
    if image_hosts.is_empty() {
        let item = MenuItemBuilder::with_id("no-image-hosts", "(No Allowed Hosts)")
            .enabled(false)
            .build(app)?;
        image_hosts_sub = image_hosts_sub.item(&item);
    } else {
        for (i, host) in image_hosts.iter().enumerate() {
            image_hosts_sub = image_hosts_sub.text(format!("{REMOVE_IMAGE_HOST_PREFIX}{i}"), format!("Remove {host}"));
        }
    }

    let mut trusted_sub = SubmenuBuilder::new(app, "Trusted Domains");
    if trusted_origins.is_empty() {
        let item = MenuItemBuilder::with_id("no-trusted-origins", "(No Trusted Domains)")
            .enabled(false)
            .build(app)?;
        trusted_sub = trusted_sub.item(&item);
    } else {
        for (i, origin) in trusted_origins.iter().enumerate() {
            trusted_sub = trusted_sub.text(format!("{REMOVE_TRUSTED_ORIGIN_PREFIX}{i}"), format!("Remove {origin}"));
        }
    }

    let mut safe_types_sub = SubmenuBuilder::new(app, "Safe File Types");
    for (i, ext) in safe_file_types.iter().enumerate() {
        safe_types_sub = safe_types_sub.text(format!("{REMOVE_SAFE_TYPE_PREFIX}{i}"), format!("Remove .{ext}"));
    }
    if !safe_file_types.is_empty() {
        safe_types_sub = safe_types_sub.separator();
    }
    safe_types_sub = safe_types_sub
        .text(ADD_SAFE_FILE_TYPE_ID, "Add File Type…")
        .text(RESET_SAFE_FILE_TYPES_ID, "Reset to Defaults");

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&nav_back)
        .item(&nav_forward)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .separator()
        .item(&zoom_reset)
        .separator()
        .item(&toggle_outline)
        .item(&show_hidden_files_item)
        .item(&show_frontmatter_item)
        .separator()
        .item(&image_hosts_sub.build()?)
        .item(&trusted_sub.build()?)
        .item(&safe_types_sub.build()?)
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .text("check-updates", "Check for Updates...")
        .separator()
        .text("about", "About mdlite")
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&view_menu)
        .item(&theme_sub.build()?)
        .item(&help_menu)
        .build()
}

pub(crate) fn rebuild_menu(app: &tauri::AppHandle, recent: &[String], theme: &str) {
    let ms = {
        let state = app.state::<Mutex<AppState>>();
        let s = state.lock().unwrap();
        MenuState {
            print_header: s.print_header,
            show_hidden_files: s.show_hidden_files,
            show_outline: s.show_outline,
            show_frontmatter: s.show_frontmatter,
            has_frontmatter: s.has_frontmatter,
            has_file: current_file_display_path(&s).is_some(),
            image_hosts: store_get_image_allowlist(app),
            trusted_origins: store_get_trusted_origins(app),
            safe_file_types: store_get_safe_file_types(app),
        }
    };
    if let Ok(menu) = build_menu(app, recent, theme, &ms) {
        let _ = app.set_menu(menu);
    }
}

pub(crate) fn refresh_menu(app: &tauri::AppHandle) {
    let theme = app.state::<Mutex<AppState>>().lock().unwrap().current_theme.clone();
    rebuild_menu(app, &store_get_recent(app), &theme);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_index_ids_round_trip() {
        assert_eq!(parse_indexed_id("remove-safe-type-3", REMOVE_SAFE_TYPE_PREFIX), Some(3));
        assert_eq!(parse_indexed_id("remove-safe-type-x", REMOVE_SAFE_TYPE_PREFIX), None);
        assert_eq!(
            parse_indexed_id("remove-trusted-origin-0", REMOVE_TRUSTED_ORIGIN_PREFIX),
            Some(0)
        );
    }
}
