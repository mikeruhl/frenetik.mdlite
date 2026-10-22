## Context

`src/main.js` has one document-level click handler for `a[href]`: `#…` scrolls in-page, `http…` calls the
frontend `openUrl` from `@tauri-apps/plugin-opener`, and anything else is not prevented, so the WebView attempts to
navigate the app window. Rendered HTML is sanitized by DOMPurify, so hrefs are attacker-influenced strings but not
script.

Rust owns the authoritative state: `AppState.file_path` (open document, canonical), `AppState.folder_path`
(canonical folder in folder mode, else `None`), and `AppState.mode`. `open_folder_file` already canonicalizes a path
and rejects files outside `folder_path`. The sidebar loads files through `loadFile` / `selectFolderFile` in
`src/sidebar.js`, which push history via `history.js`. The image allow-list is stored in the Tauri store
(`config.rs`), surfaced as a View submenu with per-entry remove items (`REMOVE_IMAGE_HOST_PREFIX` in `menu.rs`), and
normalized by `normalize_host`. User notices use `showToast` from `src/toast.js`; the only modal is the About
dialog in `index.html`. The Windows jump list starts new instances by running `current_exe()` with a path
argument; there is no single-instance lock.

## Goals / Non-Goals

**Goals:**

- One Rust function decides what every href means; the frontend only renders the decision.
- No prompt for the common case (relative link to a doc in the open folder).
- The user sees the real destination before anything leaves the current view.
- No document can cause a program to launch.

**Non-Goals:** see proposal.

## Decisions

### D1: Classification lives in Rust, keyed on the raw href

`#[tauri::command] resolve_link(href) -> LinkAction` resolves the href against the open document's directory and
the current state, and returns one of:

| Variant                                 | When                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `Navigate { path, fragment }`           | Folder mode, target is a markdown file inside `folder_path`                    |
| `ConfirmDocument { path }`              | Markdown file outside the folder, or any markdown file in single-file mode     |
| `ConfirmOpenFile { path }`              | Non-markdown file whose extension is on Safe File Types                        |
| `ConfirmReveal { path }`                | Any other existing file or directory                                           |
| `OpenUrl { url }`                       | `http`/`https` whose scheme + host is on Trusted Domains, or `mailto`          |
| `ConfirmUrl { url, origin, insecure }`  | `http`/`https` not trusted; `origin` is `scheme://host`; `insecure` for `http` |
| `ConfirmNetwork { path }`               | A file link to a network location not already in use (D2); not yet touched     |
| `NotFound { path }`                     | A file link whose target does not exist                                        |
| `Blocked { scheme }`                    | Any other scheme, protocol-relative `//`, and Windows device paths             |

`#[tauri::command] follow_link(href, trust_origin: bool)` performs the action for a confirmed link. It re-runs
`resolve_link` on the same href instead of trusting a path sent back from JS, so the frontend can never widen what
gets opened. `Navigate` is not routed through `follow_link`; the frontend handles it via the sidebar (D5). For
`ConfirmNetwork`, `follow_link` is the first point that touches the path: it canonicalizes, re-classifies with network
access allowed, and performs the resulting document, open, or reveal action (`Err("File not found: …")` if missing).
A network document always opens in a new instance, never via `Navigate`.

Both commands are `async` so file system access (slow disks, shares) runs off the main thread and cannot freeze the
window.

`mailto:` opens without a dialog (my call: it only pre-fills a draft the user must send). Revisit if reviewers
disagree.

### D2: Resolution rules

- Strip and keep `#fragment`; drop `?query`. Percent-decode the path.
- Relative paths resolve against the open document's parent directory. Absolute forms recognized: `C:\…`, `C:/…`,
  `\\server\share\…`, `/…` (on Unix), and `file:///…` URLs, hand-parsed (the `url` crate is only
  transitive; using it would add a direct dependency).
- Canonicalize with `std::fs::canonicalize`; failure → `NotFound`. The inside-folder test is
  `canonical.starts_with(folder_path)` on canonical paths, so `..`, symlinks, and junctions cannot escape.
- **Network locations are not touched before confirmation (Windows).** A target is a network location when its
  lexical, joined path is UNC (`\\server\share\…`, including `file://server/…`). Opening such a path makes Windows
  connect and send the user's NTLM credentials to that server, and an unreachable share can block for tens of seconds.
  Unless the target is on the same `\\server\share` as the open document or the open folder (a connection the user
  already made), classification is lexical only and returns `ConfirmNetwork`; no `canonicalize`, `exists`, or
  metadata call is made. Mapped drive letters are local paths for this rule.
- Device namespace hrefs (`\\?\…`, `\\.\…`) are `Blocked { scheme: "device" }`.
- Markdown = `scan.rs::is_markdown_ext` (`md`, `markdown`, `mdx`); reuse it, do not duplicate the list.
- Hidden files count as inside the folder. A link to `.github/CONTRIBUTING.md` or a file with the Windows hidden
  attribute returns `Navigate` even when Show Hidden Files is off; visibility only affects the sidebar tree.
- The empty document state (no file open) resolves relative links to `NotFound`.

### D3: Opening actions use the opener plugin from Rust

- Document: `std::process::Command::new(std::env::current_exe()?).arg("--").arg(path).spawn()`. Same mechanism as
  the jump list; the new instance starts in single-file mode. The `--` keeps any path from being parsed as a CLI
  flag; confirm the CLI plugin config accepts it and adjust if the positional argument is declared differently.
- Safe file: `app.opener().open_path(path, None)`.
- Reveal: `app.opener().reveal_item_in_dir(path)`.
- URL / mailto: `app.opener().open_url(url, None)`.

The frontend stops importing `@tauri-apps/plugin-opener`; `opener:default` is removed from
`capabilities/default.json` so page script has no direct route to the opener. The About dialog's update link
(`src/main.js`, `openUrl(result.release_url)`) moves to a dedicated `open_release_page` command that opens only the
release URL Rust fetched in `check_for_updates` (kept in Rust state). My call: the app's own update link should not
hit the link dialog, and page script must not choose the URL.

### D4: Safe File Types and Trusted Domains in the store

- `safe_file_types`: list of lowercase extensions without dots. Absent key means the default set:
  `png jpg jpeg gif webp bmp svg pdf txt csv json yaml yml log mp3 wav mp4 webm mov docx xlsx pptx`.
- `trusted_link_domains`: list of origins `scheme://host` (`https://docs.example.com`), scheme lowercased and host
  normalized with the existing `normalize_host`; ports are dropped. Matching is exact scheme and exact host: trusting
  `https://docs.example.com` does not trust `http://docs.example.com` or `https://api.docs.example.com`. Your call:
  trust covers scheme with host, so an unencrypted link to a trusted host still shows the dialog and warning.
- A hard backstop denylist (`exe com bat cmd ps1 psm1 vbs vbe js jse wsf wsh hta msi msp lnk scr cpl jar reg url
  appref-ms sh app command`) can never be added to Safe File Types; the add attempt shows a toast. My call: the
  list is user-editable, but a typo or bad advice must not turn a click into a launch.
- Accessors mirror `store_get_image_allowlist` / `store_add_image_host` / `store_remove_image_host`.

### D5: Frontend click flow (`src/links.js`)

One delegated click handler on the document replaces the inline one in `main.js`:

1. `#…` → in-page scroll (existing behavior, moved here).
2. Any other `a[href]` inside rendered content → `preventDefault()`, then `invoke("resolve_link", { href })`.
3. Dispatch on the variant: `Navigate` → `navigateToFolderLink(path, fragment)`, new in `sidebar.js`: calls
   `pushNavigation()` itself (`loadFile` does not), then `loadFile`, then scrolls to the fragment or top (unlike
   `selectFolderFile`, which restores a saved scroll position). `Navigate.path` is in `display_path` form (no
   verbatim `\\?\` prefix) because the sidebar highlights by exact match on `dataset.path`; `OpenUrl` → `invoke("follow_link", …)`;
   `Confirm*` → show the dialog, on Open call `follow_link`; `NotFound` / `Blocked` → `showToast`.

Clicks are only acted on for real user clicks (`event.isTrusted`). The handler listens to both `click` and
`auxclick` (middle-click fires only `auxclick`), so middle-click and Ctrl+click follow the same flow and never reach
the WebView's default handling.
Links in the sidebar, TOC, and app chrome keep their own handlers.

`navigateToFolderLink` also expands collapsed parent folders in the sidebar tree and scrolls the file's row into
view. When the target has no tree row (hidden file), the document still displays with nothing highlighted.
`handleScanComplete` currently blanks the view when the current file has no tree row; change it to blank only when
the file no longer exists on disk (ask Rust via a small `file_exists(path) -> bool` command), so a rescan does not
discard a hidden file the user navigated to.

### D8: Navigation guard (backstop)

The click handler is not the only way a WebView navigates: the default context menu's "Open link in new window",
dragging a link onto the window, and future regressions all bypass it. The main window's builder gets:

- `on_navigation`: allow only the app's own origin (`tauri://localhost`, `http://tauri.localhost`, and the Vite dev
  server URL in debug builds) and the `mdlive://` Live Block frames; deny everything else.
- `on_new_window` (or the platform equivalent in Tauri 2): deny all.

The right-click menu stays so Copy keeps working. My call on the exact origin list; verify it against the dev and
release builds and the Live Block frame.

### D6: Confirmation dialog

A second modal in `index.html`, built from the About dialog's structure and classes (`role="dialog"`,
`aria-modal="true"`, overlay click and Escape cancel). Content:

- Title by kind: "Open document in a new window?", "Open file?", "Show file in folder?", "Open web link?",
  "Open network location?" (`ConfirmNetwork`, with the line "This file is on another computer. mdlite will connect
  to it only if you choose Open.").
- The destination in a monospace, selectable, wrapping block: full path, or full URL with the host in bold.
- For `insecure` URLs, a line: "This link is not encrypted (http)."
- For URLs, a checkbox "Always trust `<scheme>://<host>`".
- Buttons **Cancel** (initial focus) and **Open** / **Show in Folder**.

The destination text is set with `textContent`, never `innerHTML`.

### D7: Menu

View menu, after **Allowed Image Hosts**: **Trusted Domains** (one "Remove `<scheme>://<host>`" item per entry, or
"(No Trusted Domains)") and **Safe File Types** ("Remove .ext" per entry, plus **Add File Type…** and **Reset to
Defaults**). **Add File Type…** opens a small input modal reusing the D6 dialog shell. Both submenus rebuild via
`rebuild_menu` after a change, like image hosts.

## Risks / Trade-offs

- [Link text says one thing, href another] → The dialog always shows the resolved destination, not the link text.
- [Prompt fatigue on doc-heavy sites] → Trusted Domains; in-folder links never prompt.
- [Office files with macros opened from local disk run without Protected View] → Default set includes only
  macro-free formats (`docx xlsx pptx`); macro formats fall through to Reveal.
- [Default app for an allowlisted type has its own vulnerabilities] → Accepted; same exposure as double-clicking
  the file in Explorer, and the user confirmed the path.
- [Spawning a new process per outside link] → Only after explicit confirmation; no rate concern.
- [Case-insensitive file systems] → `starts_with` on canonical paths; Windows canonicalize normalizes case.
- [Credential leak to a network host from merely resolving a link] → D2: no file system access to new network
  locations before confirmation.
- [Navigation that bypasses the click handler] → D8 guard.

## Migration Plan

Additive. Existing `http` links gain a dialog for untrusted hosts. Removing `opener:default` is part of the same
PR. Rollback by reverting the PR.

## Open Questions

- None blocking.
