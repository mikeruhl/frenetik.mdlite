## 1. Spike

- [x] 1.1 Verify `tauri-plugin-clipboard-manager` `write_html` with a plain text alternative pastes formatted into Word and Outlook on Windows and into Pages or Mail on macOS; record the result in design.md Risks

## 2. Menu and Rust backend

- [x] 2.1 Add `copy-document-markdown` and `copy-document-rich` items in `menu.rs` beside `copy-file-path`, built with `.enabled(has_file)`, grouped between the same separators
- [x] 2.2 Add Rust command(s) that write markdown text and rich HTML plus plain text alternative through `ClipboardExt`, using a writer-closure helper like `copy_path_with`
- [x] 2.3 Register the command(s) in `lib.rs` and handle the two new menu ids by emitting events to the frontend
- [x] 2.4 Unit tests: writer helper writes expected content, propagates clipboard errors, and does not write on empty input
- [x] 2.5 Confirm items stay disabled for welcome screen, folder mode with no file, and startup error, and enable on file open

## 3. Copy as Markdown (frontend)

- [x] 3.1 Listen for `copy-document-markdown` in `main.js`; send `lastRawMarkdown` verbatim (frontmatter included) to the Rust command
- [x] 3.2 Show "Markdown copied" toast on success; route failures through `reportCopyError`
- [x] 3.3 Unit test: payload equals source exactly, including frontmatter and trailing newline state

## 4. Copy as Rich Text (frontend)

- [x] 4.1 Create `src/rich-copy.js` that clones `contentEl` and strips code copy buttons, search highlight marks, interactive controls, and heading anchors
- [x] 4.2 Replace mermaid and chart SVG with PNG data URI images using `cloneSvgForSnapshot` and canvas rasterization; on per-block failure substitute source text and record the omission
- [x] 4.3 Replace blocked image placeholders and non-embeddable local images with alt text; embed loaded local images under a size cap; record omissions
- [x] 4.4 Inline a fixed light style per element (typography, tables, code, blockquote, highlight.js token colors, alerts) with no theme variable references
- [x] 4.5 Sanitize the result with DOMPurify and derive the plain text alternative from the clone
- [x] 4.6 Await `trackRichRender` before building the payload so diagrams are complete
- [x] 4.7 Listen for `copy-document-rich` in `main.js`; send payload to the Rust command; toast "Rich text copied" or the omitted-content variant; route failures through `reportCopyError`
- [x] 4.8 Unit tests in `rich-copy.test.js`: chrome removal, SVG to image, image fallbacks, no theme variables in output, sanitization, plain text alternative, omission reporting

## 5. Specs and docs

- [x] 5.1 Update the Purpose of `openspec/specs/copy-file-path/spec.md` to mention the sibling document copy items
- [x] 5.2 Ensure the archived `copy-document-content` spec has a Purpose section when the change is archived
- [x] 5.3 Mention the new File menu items in the README feature list or help if Copy File Path is listed there

## 6. Verification

- [x] 6.1 `cargo clippy -- -D warnings`, `cargo test`, ESLint, and the frontend test suite pass
- [x] 6.2 Manual: paste rich text into Word and Outlook from a document with headings, lists, tables, code, an alert, a mermaid diagram, and a local image
- [x] 6.3 Manual: paste markdown into a GitHub comment and confirm it renders identically to the source
- [x] 6.4 Manual: copy under each of the 11 themes and confirm identical rich text output (text styling identical; diagram and chart images follow the renderer, accepted)
- [ ] 6.5 Manual: single-file mode, folder mode, no-file state, live reload, and standard selection copy unchanged
- [ ] 6.6 Include the manual test plan in the PR description
