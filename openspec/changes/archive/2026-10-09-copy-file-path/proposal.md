## Why

Users frequently need the absolute path of the document they are previewing (to paste into a terminal, an editor, a
chat, or an agent prompt). mdlite shows the file but offers no way to grab its path, forcing a trip to a file explorer.
This applies equally in single-file mode and folder mode.

## What Changes

- Add a **File → Copy File Path** menu item that copies the absolute path of the currently open file to the system
  clipboard.
- Add a keyboard shortcut (**Shift+Alt+C**, matching VS Code's "Copy Path") that performs the same action.
- Works in both single-file mode and folder mode; in folder mode it copies the path of the file currently displayed, not
  the folder.
- The menu item is disabled when no file is open (empty/welcome state, folder mode with no file selected, startup
  error).
- Show a brief, non-blocking confirmation ("Path copied") in the content area after a successful copy; show an error
  message if the clipboard write fails.
- The copied path is the normalized display path (no `\\?\` verbatim prefix, native separators).
- Add the shortcut to the welcome screen's keyboard shortcut table.
- Add the official `tauri-plugin-clipboard-manager` dependency (Rust side only, no JS package). Justification: the
  menu-triggered path has no webview user gesture, so `navigator.clipboard.writeText` is not reliable; the official
  Tauri plugin is the smallest supported way to write the clipboard from the Rust side, where the authoritative file
  path already lives.

## Non-goals

- Copying paths of arbitrary sidebar entries (no sidebar context menu).
- Copying relative paths, folder paths, `file://` URIs, or forward-slash-normalized variants.
- Copying file contents or rendered HTML.
- Configurable shortcut.

## Capabilities

### New Capabilities

- `copy-file-path`: Copying the absolute path of the currently open file to the clipboard via menu and keyboard
  shortcut, in both single-file and folder modes, with enablement rules and user feedback.

### Modified Capabilities

<!-- None. Folder navigation behavior is unchanged; this capability only reads the current file. -->

## Impact

- `src-tauri/Cargo.toml`: add `tauri-plugin-clipboard-manager = "2"`.
- `src-tauri/src/lib.rs`: register the clipboard plugin; command/handler to copy the current file path.
- `src-tauri/src/menu.rs`: new File menu item labeled with Shift+Alt+C; enabled only when a file is open.
- `src-tauri/src/commands.rs`: `copy_file_path` command (used by the keyboard path and menu path).
- `src-tauri/capabilities/default.json`: unchanged (clipboard writes happen in Rust; the plugin's JS API is not
  exposed).
- `index.html`: single toast element.
- `src/main.js`: shortcut handler, confirmation toast, welcome table row.
- `src/styles.css`: toast styling using theme variables so it renders correctly in all 11 bundled themes.
