## 1. Rust: resolution and classification

- [x] 1.1 Add `src-tauri/src/links.rs` with a serializable `LinkAction` enum (D1 variants)
- [x] 1.2 Pure `parse_href(href) -> ParsedHref` (scheme, path, fragment; percent-decode; drop query; recognize
      `C:\`, `C:/`, UNC, `/`, `file:///`)
- [x] 1.3 Pure `classify(parsed, doc_dir, folder, safe_types, trusted_origins, exists/canonicalize fn)` returning
      `LinkAction`; reuse the folder scan's markdown extension constant
- [x] 1.4 Unit tests for 1.2 and 1.3: relative in/out of folder, `..` escape, symlink/junction escape (temp dir),
      fragment, single-file mode, missing file, safe vs unsafe extension, case-insensitive extension, trusted vs
      untrusted origin, same host with a different scheme, `http` insecure flag, `mailto`, blocked schemes (`javascript`, `ms-msdt`, `vscode`, `data`),
      no document open
- [x] 1.4a Network classification without file system access (`ConfirmNetwork`, same-share exception, device paths
      blocked) and hidden files navigate; tests with a panicking canonicalize closure
- [x] 1.5 `#[tauri::command] resolve_link(href)` reading `AppState` and the store; register in the invoke handler

## 2. Rust: actions and settings

- [x] 2.1 `config.rs`: `store_get/add/remove` for `trusted_link_domains` (origins `scheme://host`, host via `normalize_host`) and
      `safe_file_types` (default set when absent, reset, executable denylist rejection)
- [x] 2.2 Unit tests for 2.1, including executable rejection with dots and mixed case
- [x] 2.3 `#[tauri::command] follow_link(href, trust_origin)` re-resolving and performing D3 actions; refuses
      `Navigate`, `NotFound`, `Blocked`
- [x] 2.4 Integration test for `follow_link` refusing a path that classifies differently than the dialog showed
      (re-resolution), using an injectable opener
- [x] 2.5 Add `open_release_page` command (opens the release URL stored by `check_for_updates`); switch the About
      dialog to it
- [x] 2.5a Make `resolve_link`/`follow_link` async; `follow_link` handles confirmed network targets; add
      `file_exists`
- [x] 2.5b New-instance launch passes `--` before the path; verify CLI parsing
- [x] 2.5c Navigation guard: deny non-app navigations and new windows on the main window (`is_app_navigation` + test)
- [x] 2.6 Remove `opener:default` from `capabilities/default.json`

## 3. Menu

- [x] 3.1 View submenus **Trusted Domains** and **Safe File Types** after **Allowed Image Hosts**, with remove-item id
      prefixes, empty-state items, **Add File Type…**, **Reset to Defaults**
- [x] 3.2 Handle the new menu ids in `on_menu_event`; rebuild the menu after each change
- [x] 3.3 **Add File Type…** emits an event the frontend answers with the input modal; result goes to a command that
      validates and stores it

## 4. Frontend

- [x] 4.1 `src/links.js`: delegated click handler (D5), replacing the inline handler in `main.js`; drop the
      `plugin-opener` import
- [x] 4.2 `sidebar.js`: export `navigateToFolderLink(path, fragment)` (`pushNavigation()`, `loadFile`, scroll to
      fragment or top); verify sidebar highlight with `display_path`-form paths
- [x] 4.2a `revealInTree` expands collapsed ancestors; `handleScanComplete` blanks only when `file_exists` is false
- [x] 4.3 Confirmation dialog (including the network-location variant) markup in `index.html` based on the About dialog; `textContent` only; Cancel has
      initial focus; Escape and overlay cancel
- [x] 4.4 Input modal for **Add File Type…** using the same shell
- [x] 4.5 Styles in `styles.css` using theme variables; verify all 11 themes; hidden in print
- [x] 4.6 Vitest tests for `links.js` dispatch (mock `invoke`): each variant routes to the right handler; `#` links
      scroll; `preventDefault` called for every non-fragment link

## 5. Verification

- [x] 5.1 `cargo clippy -- -D warnings`, `cargo test`, `pnpm lint`, `pnpm test` pass
- [x] 5.2 Run the manual test plan (`test-plan.md`) in a built app
- [x] 5.3 Regression: sidebar navigation, Back/Forward, TOC links, footnote links, image placeholders, live reload
- [x] 5.3a One line each in mdlite-preview and mdlite-decision SKILL.md about relative links; extend
      `skill-sections.test.js`
- [x] 5.4 Add a "Links" section to `docs/` sample or README describing trust rules and settings
