## 1. Sanitizer tightening

- [x] 1.1 Add failing tests in `src/markdown.test.js` for forbidden tags (`style`, `form`, `input`, `button`, `select`,
      `textarea`, `option`), dropped chrome classes, preserved renderer classes (alert, hljs, katex, footnote, task
      list), and preserved anchor ids
- [x] 1.2 Add `FORBID_TAGS`, remove `button` from `ADD_TAGS`, add the class-allowlist hook in `src/markdown.js`
- [x] 1.3 Move Mermaid "Open" button creation into `renderMermaidBlocks` (post-insertion `createElement`); confirm copy
      buttons already attach post-insertion
- [x] 1.4 Run vitest and ESLint; verify Mermaid Open and copy buttons work in the running app

## 2. Image Allow-list backend

- [x] 2.1 Add `store_get_image_allowlist`, `store_add_image_host`, `store_remove_image_host` to `config.rs` with unit
      tests (lowercasing, dedupe)
- [x] 2.2 Create `src-tauri/src/images.rs`: host/URL allow decision function with unit tests (exact host, subdomain
      rejected, session URL allowance, non-http schemes rejected)
- [x] 2.3 Implement proxied fetch with `reqwest`: manual redirect policy re-checking each hop, 10 s timeout, 10 MB cap,
      `image/*` content-type check; unit tests with a local test server
- [x] 2.4 Register the `mdimg` asynchronous URI scheme protocol in `lib.rs`; manage session allowance state
- [x] 2.5 Add commands `get_image_allowlist`, `allow_image_once`, `allow_image_host`, `remove_image_host` with
      integration tests
- [x] 2.6 Update CSP `img-src` in `tauri.conf.json` to `'self' data: blob: mdimg: http://mdimg.localhost`
- [x] 2.7 `cargo clippy -- -D warnings` and `cargo test` pass

## 3. Image Allow-list frontend

- [x] 3.1 Add a proxy-URL helper matching Tauri's per-platform custom scheme form, with unit test
- [x] 3.2 Add the image rewrite hook: allowed host → proxy URL; otherwise placeholder with `data-remote-src`, alt text,
      host; remove remote SVG `<image href>`; tests in `markdown.test.js`
- [x] 3.3 Fetch the allow-list once per render and pass it to the hook
- [x] 3.4 Attach Load once / Always allow actions in `main.js`; Always allow re-renders the current Document
- [x] 3.5 Style the placeholder with theme variables; verify in all 11 themes
- [x] 3.6 Resolve the allow-list removal Open Question (Settings submenu or defer) and implement the chosen option
      (View > Allowed Image Hosts submenu)

## 4. Print readiness

- [x] 4.1 Track the latest Rich Block render promise in `main.js`
- [x] 4.2 Add `awaitRichRender(timeoutMs)` and call it before `window.print()` (menu and Ctrl+P) and
      `invoke("export_pdf")`
- [x] 4.3 Show the existing toast on timeout and proceed
- [x] 4.4 Verify in the running app: open a Mermaid-heavy Document, print and export PDF immediately, confirm diagrams
      present

## 5. Documentation and verification

- [x] 5.1 Correct `SECURITY.md`: updater and allow-listed image requests, settings writes, Mermaid output sanitization
      (not sandboxing), Image Allow-list behavior
- [x] 5.2 Add a "Rendering restrictions" section to both `mdlite-decision` and `mdlite-preview` SKILL.md: remote images
      need an allowed host so always write meaningful alt text; `<style>`, `style` attributes, form controls, and custom
      classes are stripped; never make an image or diagram the only carrier of essential information
- [x] 5.3 Regression check: file watcher live reload, question anchors and interactive mode, KaTeX, footnotes, alerts,
      emoji
- [x] 5.4 Write the manual test plan for the PR (placeholder actions, themes, print/PDF timing, breaking-change note for
      remote images)
