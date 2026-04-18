use std::path::Path;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

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
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let mut recent_sub = SubmenuBuilder::new(app, "Recent Files");
    if recent.is_empty() {
        let item = MenuItemBuilder::with_id("no-recent", "(No Recent Files)")
            .enabled(false)
            .build(app)?;
        recent_sub = recent_sub.item(&item);
    } else {
        for (i, path) in recent.iter().enumerate() {
            let label = Path::new(path).file_name().unwrap_or_default().to_string_lossy();
            recent_sub = recent_sub.text(format!("recent-{}", i), label.as_ref());
        }
        recent_sub = recent_sub.separator().text("clear-recent", "Clear Recent Files");
    }

    let find_item = MenuItemBuilder::with_id("find", "Find...")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .text("open-file", "Open...")
        .text("open-folder", "Open Folder...")
        .item(&recent_sub.build()?)
        .separator()
        .item(&find_item)
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
    let toggle_outline = MenuItemBuilder::with_id("toggle-outline", "Toggle Outline")
        .accelerator("CmdOrCtrl+Shift+O")
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
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&view_menu)
        .item(&theme_sub.build()?)
        .build()
}

pub(crate) fn rebuild_menu(app: &tauri::AppHandle, recent: &[String], theme: &str) {
    if let Ok(menu) = build_menu(app, recent, theme) {
        let _ = app.set_menu(menu);
    }
}
