use std::path::Path;
use std::sync::Mutex;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

use crate::AppState;

pub(crate) struct MenuState {
    pub(crate) print_header: bool,
    pub(crate) show_hidden_files: bool,
    pub(crate) show_outline: bool,
    pub(crate) show_frontmatter: bool,
    pub(crate) has_frontmatter: bool,
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
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&view_menu)
        .item(&theme_sub.build()?)
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
        }
    };
    if let Ok(menu) = build_menu(app, recent, theme, &ms) {
        let _ = app.set_menu(menu);
    }
}
