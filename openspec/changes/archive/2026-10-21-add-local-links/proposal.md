## Why

Docs in a repo link to each other with relative paths (`[deployment](../services/deployment.md)`). mdlite ignores
them: the click handler only knows `#anchor` and `http*` links, so a relative link falls through to the WebView,
which tries to navigate the app window to that path. Users browsing a folder of docs cannot follow the links the
docs were written with.

At the same time, `http*` links open in the system browser with no confirmation, and a link's visible text can
differ from its destination. Following links must not become a way for a document to launch programs or send the
user somewhere they did not intend.

## What Changes

- **Trusted local navigation:** in folder mode, a relative link that resolves to a markdown file inside the open
  folder opens in the current window with no prompt, joins Back/Forward history, and honors a `#fragment`.
- **Link confirmation dialog:** every other link that leaves the current view (outside the open folder, absolute
  paths, `file://`, web links, and any link in single-file mode) shows a modal with the full resolved destination
  for the user to verify before anything happens.
- **Markdown outside the folder:** after confirmation, opens in a new mdlite instance; the current window is
  untouched.
- **Non-markdown files:** after confirmation, files whose extension is on the **Safe File Types** list open in the
  OS default app; all other files (including all executables) are revealed in the OS file manager, never launched.
- **Trusted Domains:** the dialog for `http`/`https` links offers "Always trust" for that scheme and host (`https://docs.example.com`);
  trusting `https` does not trust `http` for the same host; links to trusted
  domains open in the system browser without the dialog.
- **Blocked schemes:** any scheme other than `http`, `https`, `mailto`, and file links is refused with a notice.
- **Settings:** View menu gains **Trusted Domains** and **Safe File Types** submenus, alongside the existing
  **Allowed Image Hosts**. Safe File Types is user-editable and pre-filled with a default set.
- **Missing targets:** a link to a file that does not exist shows a "file not found" notice.
- **Network locations:** links to UNC shares not already in use are confirmed before mdlite touches them, so merely
  clicking (or rendering) a link cannot send Windows credentials to a remote host.
- **Hidden files:** in-folder links to hidden files navigate in place; a rescan no longer blanks them.
- **Navigation guard:** the main window refuses any navigation away from the app and any new-window request, as a
  backstop for context-menu and drag-and-drop paths that bypass the click handler.
- **Agent skills:** mdlite-preview and mdlite-decision mention relative links between related files.

No new dependencies. `tauri-plugin-opener` is already installed; its Rust API replaces the frontend `openUrl` call.

## Non-goals

- Editing or creating linked files.
- Link previews on hover.
- Following links inside Live Block frames or charts.
- Opening non-markdown files inside mdlite (images, PDFs).
- Folder links (a link to a directory) beyond revealing it in the file manager.
- Per-document or per-folder trust settings.
- Wiki-style links (`[[page]]`).

## Capabilities

### New Capabilities

- `local-links`: Resolving, classifying, confirming, and opening links in rendered documents, including trusted
  in-folder navigation, the confirmation dialog, new-instance opening, Safe File Types, Trusted Domains, and blocked
  schemes.

### Modified Capabilities

- `agent-preview-skill`: recommends relative links between related files in one folder.
- `agent-decision-skill`: explains that relative links to sibling files open after confirmation.

## Impact

- `src-tauri/src/links.rs` (new): link resolution, classification, and the open actions.
- `src-tauri/src/config.rs`: store accessors for `trusted_link_domains` and `safe_file_types`.
- `src-tauri/src/menu.rs`, `src-tauri/src/lib.rs`: two new View submenus, menu event handling, command registration.
- `src-tauri/capabilities/default.json`: drop `opener:default` once the frontend no longer calls the opener.
- `src/links.js` (new): click interception and the confirmation dialog.
- `src/main.js`: replace the inline `a[href]` click handler with `links.js`.
- `src/sidebar.js`: export a history-pushing navigation entry point for in-folder links.
- `index.html`, `src/styles.css`: dialog markup and theme-derived styling (all 11 themes).
- `src-tauri/src/lib.rs` window setup: navigation and new-window guard.
- `plugins/mdlite/skills/mdlite-preview/SKILL.md`, `plugins/mdlite/skills/mdlite-decision/SKILL.md`: one line each.
