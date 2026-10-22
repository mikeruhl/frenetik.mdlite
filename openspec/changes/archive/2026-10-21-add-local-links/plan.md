# Local Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a link in a rendered document navigates in-folder docs directly and routes every other link
through a classified, confirmed, non-launching open path.

**Architecture:** Rust owns resolution and classification (`links.rs`, pure functions plus two commands) and all
opening (opener plugin from Rust). The frontend intercepts clicks, asks Rust what the href means, and renders the
answer: navigate via the sidebar, show a confirmation dialog, or show a toast. Trust lists live in the Tauri store and
surface as View submenus, following the Allowed Image Hosts pattern.

**Tech Stack:** Tauri 2, Rust (`tauri-plugin-opener`, `tauri-plugin-store`, `serde`), vanilla JS, Vitest (jsdom).

**Spec:** `openspec/changes/add-local-links/` (`proposal.md`, `design.md`, `specs/local-links/spec.md`,
`test-plan.md`). Read `design.md` before any task; decision numbers (D1 to D7) below refer to it.

## Global Constraints

- No new dependencies (Rust or JS). Hand-parse `file:///` URLs and percent-decoding.
- Rust compiles with zero warnings under `cargo clippy -- -D warnings`.
- JS passes `pnpm lint` with no suppressions.
- UI renders correctly in all 11 bundled themes; dialogs hidden in print.
- User-facing strings set with `textContent`, never `innerHTML`.
- Error states use the existing `showToast` (`src/toast.js`) or dialog patterns; no silent failures.
- Commit messages: conventional commits; no `Co-Authored-By` lines.
- Rust tests: `cd src-tauri && cargo test`. JS tests: `pnpm test`.

## Review Focus

1. **Percent-encoded and spaced paths** (`my%20doc.md`, `<my doc.md>`) must resolve to the real file. Test in Task 2.
2. **Case mismatch on Windows** (`Docs/A.MD` for `docs\a.md`) must count as inside the folder and return the path in
   on-disk case so the sidebar highlights it. Test in Task 2 (`#[cfg(windows)]`).
3. **Directory links** (`../services/`) must reveal the folder, not try to open it as a document. Test in Task 2.
4. **Protocol-relative `//host/x`** must be blocked, while UNC `\\server\share\x.md` is treated as an absolute file.
   Test in Task 2.
5. **Double-click or rapid clicks** must not open two dialogs or spawn two instances. Test in Task 5.

---

### Task 1: Trust lists in the store

**Files:**

- Modify: `src-tauri/src/config.rs` (next to the image allow-list accessors, ~line 145-215)
- Test: `src-tauri/src/config.rs` `#[cfg(test)] mod tests`

**Interfaces:**

- Produces:
  - `pub(crate) fn normalize_origin(origin: &str) -> Option<String>`: accepts `http`/`https` URLs or origins, returns
    `"{scheme}://{host}"` with scheme lowercased, host via `normalize_host`, port and path dropped; `None` otherwise.
  - `pub(crate) fn store_get_trusted_origins(app: &tauri::AppHandle) -> Vec<String>` (store key
    `trusted_link_domains`)
  - `pub(crate) fn store_add_trusted_origin(app: &tauri::AppHandle, origin: &str) -> Result<Vec<String>, String>`
  - `pub(crate) fn store_remove_trusted_origin(app: &tauri::AppHandle, origin: &str) -> Vec<String>`
  - `pub(crate) const DEFAULT_SAFE_FILE_TYPES: &[&str]` = `png jpg jpeg gif webp bmp svg pdf txt csv json yaml yml
    log mp3 wav mp4 webm mov docx xlsx pptx`
  - `pub(crate) const EXECUTABLE_EXTENSIONS: &[&str]` = `exe com bat cmd ps1 psm1 vbs vbe js jse wsf wsh hta msi msp
    lnk scr cpl jar reg url appref-ms sh app command`
  - `pub(crate) fn normalize_extension(ext: &str) -> Option<String>`: trim, strip leading dots, lowercase; `None` if
    empty or contains anything but ASCII alphanumerics and `-`.
  - `pub(crate) fn add_file_type_to_list(list: &mut Vec<String>, ext: &str) -> Result<bool, String>`
  - `pub(crate) fn store_get_safe_file_types(app) -> Vec<String>` (key `safe_file_types`; absent key returns the
    defaults)
  - `pub(crate) fn store_add_safe_file_type(app, ext: &str) -> Result<Vec<String>, String>`
  - `pub(crate) fn store_remove_safe_file_type(app, ext: &str) -> Vec<String>`
  - `pub(crate) fn store_reset_safe_file_types(app) -> Vec<String>` (deletes the key)

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn normalize_origin_keeps_scheme_and_host() {
    assert_eq!(normalize_origin("HTTPS://Docs.Example.com:8443/a?b"), Some("https://docs.example.com".into()));
    assert_eq!(normalize_origin("http://example.com"), Some("http://example.com".into()));
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
        assert!(err.starts_with("Executable file types can't be opened directly"), "{err}");
    }
    assert!(list.is_empty());
}

#[test]
fn add_file_type_dedupes_and_rejects_invalid() {
    let mut list = vec!["png".to_string()];
    assert_eq!(add_file_type_to_list(&mut list, ".PNG"), Ok(false));
    assert_eq!(add_file_type_to_list(&mut list, "heic"), Ok(true));
    assert_eq!(add_file_type_to_list(&mut list, "a b").unwrap_err(), "Invalid file type: a b");
}

#[test]
fn defaults_contain_no_executables() {
    assert!(DEFAULT_SAFE_FILE_TYPES.iter().all(|e| !EXECUTABLE_EXTENSIONS.contains(e)));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test config::tests`
Expected: FAIL, unresolved names `normalize_origin`, `normalize_extension`, `add_file_type_to_list`.

- [ ] **Step 3: Implement the functions listed in Interfaces**

`normalize_origin`: parse with `reqwest::Url` (already used by `normalize_host`). Error strings exactly:
`"Executable file types can't be opened directly: .{ext}"`, `"Invalid file type: {input}"`,
`"Invalid origin: {input}"`. Store accessors mirror `store_get_image_allowlist` / `store_set_image_allowlist`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test config::tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(links): store trusted origins and safe file types"
```

---

### Task 2: Href parsing and classification

**Files:**

- Create: `src-tauri/src/links.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod links;`)
- Test: `src-tauri/src/links.rs` `#[cfg(test)] mod tests` (use `tempfile`, already in `[dev-dependencies]`)

**Interfaces:**

- Consumes: `normalize_origin`, `normalize_extension` (Task 1); `crate::display_path`; `scan::is_markdown_ext`.
- Produces:

```rust
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum LinkAction {
    Navigate { path: String, fragment: Option<String> },
    ConfirmDocument { path: String },
    ConfirmOpenFile { path: String },
    ConfirmReveal { path: String },
    OpenUrl { url: String },
    ConfirmUrl { url: String, origin: String, insecure: bool },
    ConfirmNetwork { path: String },
    NotFound { path: String },
    Blocked { scheme: String },
}

#[derive(Debug, PartialEq)]
pub(crate) enum ParsedHref {
    File { path: PathBuf, fragment: Option<String> }, // path may be relative
    Web { url: String, origin: String, insecure: bool },
    Mailto { url: String },
    Blocked { scheme: String },
}

pub(crate) struct LinkContext<'a> {
    pub doc_dir: Option<&'a Path>,     // parent of the open document; None when no document
    pub folder: Option<&'a Path>,      // canonical folder in folder mode
    pub safe_types: &'a [String],
    pub trusted_origins: &'a [String],
    pub allow_network: bool,           // false in resolve_link; true only in follow_link after confirmation
}

pub(crate) fn unc_share(p: &Path) -> Option<String>; // lowercase "\\server\share" for UNC (incl. verbatim UNC), else None

pub(crate) fn parse_href(href: &str) -> ParsedHref;
pub(crate) fn classify(
    parsed: ParsedHref,
    ctx: &LinkContext,
    canonicalize: impl Fn(&Path) -> Option<PathBuf>,
) -> (LinkAction, Option<PathBuf>); // second value: canonical target for file actions
```

Paths inside `LinkAction` are `display_path` form. `NotFound.path` is the joined, non-canonical path in display form.

- [ ] **Step 1: Write the failing parse tests**

```rust
#[test] fn parses_relative_with_fragment_and_query() {
    assert_eq!(parse_href("../a/b.md?x=1#Install"),
        ParsedHref::File { path: PathBuf::from("../a/b.md"), fragment: Some("Install".into()) });
}
#[test] fn percent_decodes_path_and_fragment() {
    assert_eq!(parse_href("my%20doc.md#a%20b"),
        ParsedHref::File { path: PathBuf::from("my doc.md"), fragment: Some("a b".into()) });
}
#[test] fn windows_drive_is_a_path_not_a_scheme() {
    assert!(matches!(parse_href("C:/x/y.md"), ParsedHref::File { .. }));
    assert!(matches!(parse_href(r"C:\x\y.md"), ParsedHref::File { .. }));
}
#[test] fn unc_is_a_file_protocol_relative_is_blocked() {
    assert!(matches!(parse_href(r"\\server\share\x.md"), ParsedHref::File { .. }));
    assert_eq!(parse_href("//evil.example/x"), ParsedHref::Blocked { scheme: "//".into() });
}
#[test] fn file_urls_become_paths() {
    #[cfg(windows)]
    assert_eq!(parse_href("file:///C:/docs/a%20b.md"),
        ParsedHref::File { path: PathBuf::from(r"C:\docs\a b.md"), fragment: None });
    #[cfg(windows)]
    assert_eq!(parse_href("file://server/share/a.md"),
        ParsedHref::File { path: PathBuf::from(r"\\server\share\a.md"), fragment: None });
    #[cfg(not(windows))]
    assert_eq!(parse_href("file:///tmp/a.md"), ParsedHref::File { path: PathBuf::from("/tmp/a.md"), fragment: None });
}
#[test] fn web_and_mailto() {
    assert_eq!(parse_href("HTTP://Example.com/x"), ParsedHref::Web {
        url: "HTTP://Example.com/x".into(), origin: "http://example.com".into(), insecure: true });
    assert!(matches!(parse_href("mailto:a@b.c"), ParsedHref::Mailto { .. }));
}
#[test] fn fragment_only_is_blocked() {
    assert_eq!(parse_href("#install"), ParsedHref::Blocked { scheme: "#".into() });
}
#[test] fn device_paths_blocked() {
    assert_eq!(parse_href(r"\\?\C:\x.md"), ParsedHref::Blocked { scheme: "device".into() });
    assert_eq!(parse_href(r"\\.\pipe\x"), ParsedHref::Blocked { scheme: "device".into() });
}
#[test] fn unc_share_extracts_server_and_share() {
    assert_eq!(unc_share(Path::new(r"\\Srv\Docs\a\b.md")), Some(r"\\srv\docs".into()));
    assert_eq!(unc_share(Path::new(r"\\?\UNC\srv\docs\a.md")), Some(r"\\srv\docs".into()));
    assert_eq!(unc_share(Path::new(r"C:\x")), None);
}
#[test] fn other_schemes_blocked() {
    for (href, scheme) in [("javascript:alert(1)", "javascript"), ("ms-msdt:/id x", "ms-msdt"),
                           ("vscode://file/x", "vscode"), ("data:text/html,x", "data")] {
        assert_eq!(parse_href(href), ParsedHref::Blocked { scheme: scheme.into() });
    }
}
```

- [ ] **Step 2: Write the failing classify tests** using a temp dir fixture `root/folder/{a.md, sub/b.md, img.png,
      run.ps1, report.docm, dir/}` and `root/outside/notes.md`, with `ctx` built from canonical paths and
      `canonicalize = |p| std::fs::canonicalize(p).ok()`.

| Test                                   | Input (from `folder/a.md`)            | Expected action                                  |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| `in_folder_markdown_navigates`         | `sub/b.md#install`                    | `Navigate { path: display(b), fragment: Some("install") }` |
| `dotdot_escape_needs_confirmation`     | `../outside/notes.md`                 | `ConfirmDocument`                                |
| `symlink_escape_needs_confirmation`    | link `folder/esc` → `outside` (skip test if symlink creation fails) | `ConfirmDocument` for `esc/notes.md` |
| `single_file_mode_confirms_markdown`   | `sub/b.md`, `folder: None`            | `ConfirmDocument`                                |
| `safe_type_opens`                      | `img.png`, also `IMG.PNG` on Windows  | `ConfirmOpenFile`                                |
| `unsafe_type_reveals`                  | `run.ps1`, `report.docm`              | `ConfirmReveal`                                  |
| `directory_reveals`                    | `dir/`                                | `ConfirmReveal`                                  |
| `missing_file`                         | `nope.md`                             | `NotFound { path }` ending in `nope.md`          |
| `no_document_relative_is_not_found`    | `b.md`, `doc_dir: None`               | `NotFound`                                       |
| `trusted_origin_opens`                 | `https://docs.example.com/x`, trusted `https://docs.example.com` | `OpenUrl`             |
| `same_host_other_scheme_confirms`      | `http://docs.example.com/x`, same trust | `ConfirmUrl { insecure: true, origin: "http://docs.example.com" }` |
| `subdomain_not_trusted`                | `https://api.docs.example.com`        | `ConfirmUrl { insecure: false }`                 |
| `mailto_opens`                         | `mailto:a@b.c`                        | `OpenUrl`                                        |
| `case_mismatch_is_inside` (`cfg(windows)`) | `SUB/B.MD`                        | `Navigate` with path equal to `display(b)` in on-disk case |
| `hidden_file_navigates`                | `.github/c.md` (create it)            | `Navigate`                                       |
| `network_not_touched` (`cfg(windows)`) | `\\nonexistent.example\share\x.md`, canonicalize closure panics if called | `ConfirmNetwork { path }` |
| `network_file_url_not_touched` (`cfg(windows)`) | `file://nonexistent.example/s/x.md`, same panicking closure | `ConfirmNetwork` |
| `same_share_is_checked` (`cfg(windows)`) | doc_dir `\\srv\docs\a`, href `../b.md`, closure records the call and returns a path | closure called once; action classified normally |
| `network_allowed_after_confirm` (`cfg(windows)`) | `\\srv\s\x.md`, `allow_network: true`, closure returns a path | `ConfirmDocument` (never `Navigate`) |

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd src-tauri && cargo test links::`
Expected: FAIL, module items not defined.

- [ ] **Step 4: Implement `parse_href` and `classify`**

Scheme detection: `^[A-Za-z][A-Za-z0-9+.-]*:`; a single-letter scheme followed by `/` or `\` is a drive path.
`//` prefix (not `\\`) is `Blocked { scheme: "//" }`. An empty path after stripping fragment and query (`#x`,
`?q`, empty string) is `Blocked { scheme: "#" }`; the frontend handles fragments and never sends them. Percent-decode bytes then `String::from_utf8`; on invalid
UTF-8 keep the raw string. Classification order: join relative paths lexically; if `!allow_network` and `unc_share(joined)` is `Some` and differs
from both `unc_share(doc_dir)` and `unc_share(folder)` → `ConfirmNetwork` without calling `canonicalize`; otherwise
canonicalize (fail → `NotFound`), directory → `ConfirmReveal`,
markdown and inside `folder` and not (`allow_network` with a network target) → `Navigate`, markdown →
`ConfirmDocument`, extension in `safe_types` (compare via
`normalize_extension`) → `ConfirmOpenFile`, else `ConfirmReveal`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd src-tauri && cargo test links::`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/links.rs src-tauri/src/lib.rs
git commit -m "feat(links): parse and classify document links"
```

---

### Task 3: Link commands, opening, and opener lockdown

**Files:**

- Modify: `src-tauri/src/links.rs`
- Modify: `src-tauri/src/updater.rs`
- Modify: `src-tauri/src/lib.rs` (register commands in `invoke_handler`, ~line 290-310)
- Modify: `src-tauri/capabilities/default.json` (remove `"opener:default"`)
- Test: `src-tauri/src/links.rs`, `src-tauri/src/updater.rs`

**Interfaces:**

- Consumes: Task 1 store accessors; Task 2 `parse_href`, `classify`, `LinkAction`; `menu::refresh_menu`.
- Produces:
  - `pub(crate) trait LinkOpener { fn open_document(&self, p: &Path) -> Result<(), String>; fn open_path(&self, p:
    &Path) -> Result<(), String>; fn reveal(&self, p: &Path) -> Result<(), String>; fn open_url(&self, url: &str) ->
    Result<(), String>; }`
  - `pub(crate) fn perform(action: &LinkAction, target: Option<&Path>, opener: &impl LinkOpener) -> Result<(),
    String>`: `ConfirmDocument` → `open_document`, `ConfirmOpenFile` → `open_path`, `ConfirmReveal` → `reveal`,
    `OpenUrl`/`ConfirmUrl` → `open_url`; `Navigate`/`NotFound`/`Blocked`/`ConfirmNetwork` → `Err("Link cannot be
    opened")`.
  - `#[tauri::command] pub(crate) async fn resolve_link(href: String, app: AppHandle) -> LinkAction` (reads
    `AppState` via `app.state()`; `allow_network: false`)
  - `#[tauri::command] pub(crate) async fn follow_link(href: String, trust_origin: bool, app: AppHandle) -> Result<(),
    String>`: re-resolves `href` with `allow_network: false`; if that yields `ConfirmNetwork`, re-classifies with
    `allow_network: true` and maps `NotFound` to `Err("File not found: {path}")`; if `trust_origin` and the action is
    `ConfirmUrl`, calls `store_add_trusted_origin(origin)` and `refresh_menu`; then `perform`.
  - `#[tauri::command] pub(crate) async fn file_exists(path: String) -> bool` (used by Task 5's rescan fix; returns
    false for network paths not on the open folder's share, without touching them)
  - `pub(crate) fn is_app_navigation(url: &tauri::Url) -> bool` in `lib.rs` (D8 allow-list).
  - `#[tauri::command] pub(crate) fn open_release_page(app: AppHandle) -> Result<(), String>` in `updater.rs`.

- [ ] **Step 1: Write the failing tests**

```rust
// links.rs: FakeOpener records calls in a RefCell<Vec<String>> like "doc:<path>", "open:", "reveal:", "url:"
#[test] fn perform_routes_each_action() { /* one assert per Confirm*/OpenUrl variant on recorded call */ }
#[test] fn perform_refuses_non_openable() {
    for a in [LinkAction::NotFound { path: "x".into() }, LinkAction::Blocked { scheme: "js".into() },
              LinkAction::Navigate { path: "x".into(), fragment: None }] {
        assert_eq!(perform(&a, None, &FakeOpener::default()), Err("Link cannot be opened".into()));
    }
}
#[test] fn document_launch_args_end_options() {
    assert_eq!(document_args(Path::new(r"C:\a\-x.md")), vec!["--".to_string(), r"C:\a\-x.md".to_string()]);
}
// lib.rs
#[test] fn navigation_guard_allows_only_app_origins() {
    for ok in ["tauri://localhost/index.html", "http://tauri.localhost/", "mdlive://localhost/live-frame.html"] {
        assert!(is_app_navigation(&ok.parse().unwrap()), "{ok}");
    }
    for bad in ["https://evil.example/", "file:///C:/x.md", "http://localhost:9999/"] {
        assert!(!is_app_navigation(&bad.parse().unwrap()), "{bad}");
    }
}
// updater.rs
#[test] fn release_url_must_be_project_release() {
    assert!(is_release_url("https://github.com/mikeruhl/frenetik.mdlite/releases/tag/v1.2.3"));
    assert!(!is_release_url("https://github.com/mikeruhl/frenetik.mdlite.evil/releases/x"));
    assert!(!is_release_url("http://github.com/mikeruhl/frenetik.mdlite/releases/x"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test links:: updater::`
Expected: FAIL, `perform` and `is_release_url` not defined.

- [ ] **Step 3: Implement**

- `TauriOpener(AppHandle)` implements `LinkOpener` with `OpenerExt` (`open_path(p, None::<&str>)`,
  `reveal_item_in_dir(p)`, `open_url(url, None::<&str>)`) and `open_document` via
  `Command::new(current_exe()?).args(document_args(p)).spawn()`, where `fn document_args(p: &Path) -> Vec<String>`
  returns `["--", display_path(p)]`. Verify the `tauri-plugin-cli` config still binds the path after `--`; if it does
  not, keep `--` and adjust the CLI arg definition, and add a startup test.
- D8 guard: on the main window builder (or `tauri.conf.json` window config plus a `.on_navigation` hook in setup),
  deny navigations where `!is_app_navigation(url)`, and deny new-window requests. In debug builds also allow the
  configured `devUrl` origin; the test above covers release origins.
- `resolve_link` builds `LinkContext` from `AppState.file_path.parent()` (None when `current_file_display_path` is
  None), `AppState.folder_path` (only when `mode` is folder), and the two store lists.
- `updater.rs`: `const RELEASES_PREFIX: &str = "https://github.com/mikeruhl/frenetik.mdlite/releases/"`,
  `fn is_release_url(u: &str) -> bool`, a `static LAST_RELEASE_URL: Mutex<Option<String>>` set by
  `check_for_updates` when an update is available; `open_release_page` opens it only if `is_release_url`, else
  `Err("No release page available")`.
- Register `links::resolve_link`, `links::follow_link`, `links::file_exists`, `updater::open_release_page`; remove
  `"opener:default"`.

- [ ] **Step 4: Run tests and clippy**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings`
Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/links.rs src-tauri/src/updater.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(links): resolve/follow commands and Rust-only opener"
```

---

### Task 4: View menus for Trusted Domains and Safe File Types

**Files:**

- Modify: `src-tauri/src/menu.rs` (`MenuState` ~line 12, `build_menu` View submenu ~line 137-165, `rebuild_menu` ~line
  180)
- Modify: `src-tauri/src/lib.rs` (`MenuState` construction ~line 471; `on_menu_event` chain ~line 520; register
  `add_safe_file_type`)
- Modify: `src-tauri/src/links.rs` (`add_safe_file_type` command)
- Test: `src-tauri/src/menu.rs` or `links.rs` unit test for prefix parsing

**Interfaces:**

- Consumes: Task 1 accessors.
- Produces:
  - `MenuState` gains `trusted_origins: Vec<String>` and `safe_file_types: Vec<String>` (both construction sites).
  - Menu ids: `REMOVE_TRUSTED_ORIGIN_PREFIX = "remove-trusted-origin-"`, `REMOVE_SAFE_TYPE_PREFIX =
    "remove-safe-type-"`, `"add-safe-file-type"`, `"reset-safe-file-types"`, `"no-trusted-origins"` (disabled).
  - Event `prompt-add-file-type` (no payload), emitted on `"add-safe-file-type"`.
  - `#[tauri::command] pub(crate) fn add_safe_file_type(app: AppHandle, ext: String) -> Result<Vec<String>, String>`
    (stores then `refresh_menu`).

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn menu_index_ids_round_trip() {
    assert_eq!(parse_indexed_id("remove-safe-type-3", REMOVE_SAFE_TYPE_PREFIX), Some(3));
    assert_eq!(parse_indexed_id("remove-safe-type-x", REMOVE_SAFE_TYPE_PREFIX), None);
    assert_eq!(parse_indexed_id("remove-trusted-origin-0", REMOVE_TRUSTED_ORIGIN_PREFIX), Some(0));
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test menu::`
Expected: FAIL, `parse_indexed_id` not defined.

- [ ] **Step 3: Implement**

`pub(crate) fn parse_indexed_id(id: &str, prefix: &str) -> Option<usize>` in `menu.rs`. Submenus after **Allowed
Image Hosts**: **Trusted Domains** ("Remove {origin}" per entry or "(No Trusted Domains)"), **Safe File Types**
("Remove .{ext}" per entry, separator, "Add File Type…", "Reset to Defaults"). Menu handlers call the store and
`refresh_menu`, mirroring the `REMOVE_IMAGE_HOST_PREFIX` branch.

- [ ] **Step 4: Run tests, clippy, and look at the menu**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings`, then `pnpm tauri dev` and open View.
Expected: PASS; both submenus present with defaults listed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/menu.rs src-tauri/src/lib.rs src-tauri/src/links.rs
git commit -m "feat(links): Trusted Domains and Safe File Types menus"
```

---

### Task 5: Frontend click routing and in-folder navigation

**Files:**

- Create: `src/links.js`
- Create: `src/links.test.js`
- Modify: `src/sidebar.js` (add `navigateToFolderLink`)
- Modify: `src/main.js` (remove the `document.addEventListener("click", …)` block at ~line 483-497 and the
  `openUrl` import; call `initLinks`)

**Interfaces:**

- Consumes: `resolve_link`, `follow_link` (Task 3); `showToast` (`src/toast.js`); `confirmLink` (Task 6, injected).
- Produces:
  - `export function initLinks(deps)` where `deps = { invoke, navigate, confirm, notify, scrollToFragment }`;
    attaches `click` and `auxclick` (button 1 only) listeners on `document`.
  - `export async function activateLink(href, deps)`: the dispatcher, exported for tests.
  - `sidebar.js`: `export async function navigateToFolderLink(path, fragment)`: `pushNavigation()`, `loadFile(path)`,
    `revealInTree(path)`, then `document.getElementById(fragment)?.scrollIntoView()` or `mainContentEl.scrollTop = 0`.
  - `sidebar.js`: `function revealInTree(path)`: expands every collapsed ancestor folder row of the matching
    `.tree-file` and calls `scrollIntoView({ block: "nearest" })`; no-op when there is no row (hidden file).
  - `sidebar.js` `handleScanComplete`: when the current file has no tree row, `await invoke("file_exists", { path })`
    and blank only if it returns false.

Behavior: `#…` hrefs call `scrollToFragment` (existing behavior, including `pushNavigation`). Every other `a[href]`
gets `preventDefault()`; only anchors inside `#content` are activated, others are ignored. Ignore events with
`!event.isTrusted`. While an activation is in flight (resolve pending or dialog open), further activations are
ignored. Toast copy: `"File not found: {path}"`, `"Link type not supported: {scheme}"`, `"Could not open link:
{err}"`.

- [ ] **Step 1: Write the failing tests** (mock `deps` with `vi.fn()`)

```js
test("navigate variant uses sidebar", async () => {
  deps.invoke.mockResolvedValueOnce({ kind: "navigate", path: "C:\\f\\b.md", fragment: "install" });
  await activateLink("b.md#install", deps);
  expect(deps.navigate).toHaveBeenCalledWith("C:\\f\\b.md", "install");
  expect(deps.confirm).not.toHaveBeenCalled();
});
test("confirm variant follows only on open", async () => {
  deps.invoke.mockResolvedValueOnce({ kind: "confirmUrl", url: "https://x.io", origin: "https://x.io", insecure: false });
  deps.confirm.mockResolvedValueOnce({ open: true, trustOrigin: true });
  await activateLink("https://x.io", deps);
  expect(deps.invoke).toHaveBeenLastCalledWith("follow_link", { href: "https://x.io", trustOrigin: true });
});
test("cancel does not follow", async () => { /* confirm resolves { open: false } → no follow_link call */ });
test("openUrl follows without dialog", async () => { /* kind openUrl → follow_link, trustOrigin false */ });
test("notFound and blocked toast", async () => {
  /* expects notify("File not found: C:\\x.md") and notify("Link type not supported: vscode") */
});
test("follow_link failure toasts", async () => { /* rejects "boom" → notify("Could not open link: boom") */ });
test("second activation while first pending is ignored", async () => {
  let release; deps.invoke.mockReturnValueOnce(new Promise((r) => (release = r)));
  const first = activateLink("a.md", deps); await activateLink("a.md", deps);
  release({ kind: "notFound", path: "a.md" }); await first;
  expect(deps.invoke).toHaveBeenCalledTimes(1);
});
test("confirmNetwork goes through the dialog before follow_link", async () => {
  /* kind confirmNetwork → confirm called with the action; follow_link only after { open: true } */
});
// sidebar.test.js (new or existing): revealInTree expands a collapsed ancestor; handleScanComplete keeps a hidden
// current file when file_exists resolves true and blanks it when false.
test("non-fragment click is prevented and outside-content links are not activated", () => {
  /* jsdom: build #content with <a href="x.md"> and a sibling <a href="y.md">; dispatch click; both defaultPrevented */
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/links.test.js`
Expected: FAIL, cannot import `./links.js`.

- [ ] **Step 3: Implement `links.js`, `navigateToFolderLink`, and wire `main.js`**

Note: jsdom-dispatched events have `isTrusted === false`; make the trust check injectable (`deps.isTrusted =
(e) => e.isTrusted`) so the DOM test can pass `() => true`.

- [ ] **Step 4: Run tests and lint**

Run: `pnpm test && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/links.js src/links.test.js src/sidebar.js src/main.js
git commit -m "feat(links): route link clicks through Rust classification"
```

---

### Task 6: Confirmation dialog, file-type prompt, and About link

**Files:**

- Create: `src/link-dialog.js`
- Create: `src/link-dialog.test.js`
- Modify: `index.html` (new overlay next to `#about-overlay`, ~line 60)
- Modify: `src/styles.css` (reuse About modal rules; add destination block and checkbox row; hide in `@media print`)
- Modify: `src/main.js` (pass `confirmLink` into `initLinks`; listen for `prompt-add-file-type` → `promptFileType()`
  → `invoke("add_safe_file_type", { ext })`, toast the error string; About "Download update" →
  `invoke("open_release_page")`)

**Interfaces:**

- Consumes: `LinkAction` JSON shape (Task 2); `add_safe_file_type`, `open_release_page` (Tasks 3, 4).
- Produces:
  - `export function confirmLink(action) -> Promise<{ open: boolean, trustOrigin: boolean }>`
  - `export function promptFileType() -> Promise<string | null>`

Copy (exact):

| `kind`            | Title                               | Primary button   |
| ----------------- | ----------------------------------- | ---------------- |
| `confirmDocument` | Open document in a new window?      | Open             |
| `confirmOpenFile` | Open file?                          | Open             |
| `confirmReveal`   | Show file in folder?                | Show in Folder   |
| `confirmUrl`      | Open web link?                      | Open             |
| `confirmNetwork`  | Open network location?              | Open             |

`confirmNetwork` adds the line "This file is on another computer. mdlite will connect to it only if you choose
Open."

`confirmUrl` adds "This link is not encrypted (http)." when `insecure`, and a checkbox labeled
`Always trust {origin}`. The destination shows `path` or `url`; for URLs the origin's host is wrapped in `<strong>`
built with `createElement`, rest via text nodes. Cancel gets focus on open. Escape, overlay click, and Cancel resolve
`{ open: false, trustOrigin: false }`. The file-type prompt has title "Add Safe File Type", one text input, Add /
Cancel.

- [ ] **Step 1: Write the failing tests** (jsdom; tests insert the overlay markup copied from `index.html`)

```js
test("destination is text, not HTML", async () => {
  const p = confirmLink({ kind: "confirmDocument", path: 'C:\\<img src=x onerror=alert(1)>.md' });
  expect(document.querySelector("#link-dialog-destination img")).toBeNull();
  expect(document.querySelector("#link-dialog-destination").textContent).toContain("<img");
  document.querySelector("#link-dialog-cancel").click();
  await expect(p).resolves.toEqual({ open: false, trustOrigin: false });
});
test("cancel has initial focus", () => { /* document.activeElement.id === "link-dialog-cancel" */ });
test("escape cancels", async () => { /* keydown Escape → { open: false } */ });
test("url dialog shows origin, warning, and trust checkbox", async () => {
  /* insecure: true → warning visible; label text "Always trust http://x.io"; check box + Open →
     { open: true, trustOrigin: true }; <strong> text is "x.io" */
});
test("reveal dialog uses Show in Folder", () => { /* primary button text */ });
test("promptFileType returns trimmed input or null on cancel", async () => {});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/link-dialog.test.js`
Expected: FAIL, cannot import `./link-dialog.js`.

- [ ] **Step 3: Implement dialog module, markup, styles, and `main.js` wiring**

- [ ] **Step 4: Run tests and lint**

Run: `pnpm test && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/link-dialog.js src/link-dialog.test.js index.html src/styles.css src/main.js
git commit -m "feat(links): confirmation dialog and safe file type prompt"
```

---

### Task 7: End-to-end verification and docs

**Files:**

- Create: `docs/links-sample/folder/` (`a.md` with every link from `test-plan.md`, `sub/b.md` with an `## Install`
  heading, `diagram.png`, `run.ps1` containing only a comment, `report.docm` empty placeholder) and
  `docs/links-sample/outside/notes.md`. Open `docs/links-sample/folder` as the folder under test.
- Modify: `openspec/changes/add-local-links/test-plan.md` (point the fixture paragraph at these paths)
- Add to the fixture: `docs/links-sample/folder/.github/c.md` and a link to it from `a.md`.
- Modify: `README.md` (short "Links" section: in-folder links open directly; others ask first; View menu lists)
- Modify: `plugins/mdlite/skills/mdlite-preview/SKILL.md` ("Several files at once" section): add "Link related
  files to each other with relative links; mdlite opens them directly in folder view."
- Modify: `plugins/mdlite/skills/mdlite-decision/SKILL.md` (authoring guidance): add "Relative links to sibling
  markdown files open in a new mdlite window after the user confirms, so long supporting detail can live in a linked
  file."
- Test: `src/skill-sections.test.js` already checks skill sections; add assertions that both lines are present.
- Modify: `openspec/changes/add-local-links/tasks.md` (check off items)

- [ ] **Step 1: Full automated suite**

Run: `pnpm lint && pnpm test && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test`
Expected: all PASS.

- [ ] **Step 2: Build and run the manual test plan**

Run: `pnpm tauri build` (or `pnpm tauri dev`), then execute every row of `test-plan.md`. Kill only the test
instance by PID; do not use synthetic input against other windows.
Expected: every row matches; record any deviation in the PR description.

- [ ] **Step 3: Regression pass**

Sidebar navigation, Alt+Left/Right, TOC links, footnote links (`#fn…`), image placeholders and Allowed Image Hosts,
live reload, About "Download update" opens the release page.
Expected: unchanged behavior.

- [ ] **Step 4: Commit**

```bash
git add docs/links-sample README.md plugins/mdlite/skills src/skill-sections.test.js \
  openspec/changes/add-local-links/tasks.md openspec/changes/add-local-links/test-plan.md
git commit -m "docs(links): sample fixture, README section, task checklist"
```
