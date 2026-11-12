## Context

`copy-file-path` added **File → Copy File Path**: a Rust menu handler emits an event, the frontend shows a toast.
The frontend already holds the displayed document's source in `lastRawMarkdown` (`src/main.js`) and the rendered DOM
in `contentEl`. `src/svg-snapshot.js` already turns live SVG (mermaid, charts) into self-contained clones for print.
`tauri-plugin-clipboard-manager` is already registered and used for plain text writes in `commands.rs` and
`tree_paths.rs`.

Users want the displayed document on the clipboard as rich text (Word, Outlook) or as markdown source (GitHub
comments).

## Goals / Non-Goals

**Goals:**
- Two File menu items, Copy as Rich Text and Copy as Markdown, working in single-file and folder mode.
- Rich text that pastes legibly into Word and email clients independent of the active theme.
- Reuse the existing toast and alert feedback.

**Non-Goals:**
- Copying a selection as markdown (decision 5).
- Shortcuts, context menu entries, new dependencies.

## Decisions

### 1. Frontend builds the payload; Rust writes the clipboard

The menu handler in `lib.rs` emits `copy-document-markdown` or `copy-document-rich`. `main.js` listens, builds the
payload, then calls a Rust command that writes through `ClipboardExt` (`write_text` for markdown, `write_html` with a
plain text alternative for rich text).

- Alternative: `navigator.clipboard.write` with a `ClipboardItem`. Rejected: a menu event is not a user gesture in
  the webview, so transient activation and focus rules can reject the write, and behavior differs between WebView2
  and WKWebView.
- Alternative: Rust reads the file from disk. Rejected for markdown: the displayed text (`lastRawMarkdown`) is the
  source of truth for what the user sees, including live reload and interactive mode. Rejected for rich text:
  the HTML pipeline, sanitizer, and diagram renderers live in the frontend.

The write goes through a small testable function that takes a writer closure, matching `copy_path_with`.

### 2. Copy as Markdown copies `lastRawMarkdown` verbatim

No normalization, no frontmatter stripping, no trailing newline changes. "Pre-formatting" means the exact source.

### 3. Rich text is built from a sanitized clone of the rendered DOM

A new module (`src/rich-copy.js`) clones `contentEl`, then:

1. Removes UI chrome that is not content: code copy buttons, heading anchors, search highlight marks, interactive
   mode controls, image placeholders (replaced by their alt text).
2. Replaces mermaid and chart SVG with `<img src="data:image/png...">` built from `cloneSvgForSnapshot`, rasterized
   through a canvas, because Word and Outlook drop inline SVG.
3. Inlines a fixed light, print-like style per element (font family, sizes, table borders, code background,
   blockquote rule, highlight.js token colors from a fixed light palette). Theme variables are never referenced, so
   the output is identical under all 11 themes.
4. Passes the result through DOMPurify before it is handed to Rust.
5. Produces the plain text alternative from the same clone's text content with block separators, not from markdown.

Local images are embedded as data URIs only if already loaded and under a size cap; otherwise the image is replaced
by its alt text so pasted content never contains `file://` or `asset:` URLs that break elsewhere. Remote images keep
their URL only if they were already allowed under the existing remote image rules; blocked placeholders become alt
text.

- Alternative: copy `contentEl.innerHTML` as is. Rejected: it depends on theme CSS that does not travel with the
  clipboard, so the paste is unstyled or dark-on-dark.
- Alternative: convert markdown to HTML again with `marked` outside the DOM. Rejected: loses rendered features
  (KaTeX, alerts, diagrams, footnotes) and creates a second render path to keep in sync.

### 4. Enablement mirrors Copy File Path

Both items are built with `.enabled(has_file)` beside `copy-file-path` and toggled at the same call sites. Folder
mode with no file selected and the startup error state keep them disabled.

### 5. Selection copy as markdown is deferred

The webview already writes `text/html` and `text/plain` for a selection, so selecting and pasting into Word works
today. Producing markdown for a selection needs one of:

- a rendered-DOM-to-source map (every block records its source line range, selection maps to a range, partial
  inline selections are approximated), or
- an HTML-to-markdown converter dependency (new dependency, lossy for alerts, footnotes, KaTeX, and mermaid).

Both are larger than the whole-document feature and the value is unproven. Revisit after this ships. If pursued,
prefer the source-range approach since exact source fidelity is the point of Copy as Markdown.

### 6. Feedback

Success toasts: "Markdown copied" and "Rich text copied". Failure uses the existing alert pattern via the same
`reportCopyError` path as Copy File Path. Rendering in flight is awaited via the existing `trackRichRender` hook so
diagrams are complete before rasterization; if they cannot finish, the copy proceeds with those blocks as their
source text and the toast reads "Rich text copied (diagrams may be incomplete)" using the existing wording style.

### 7. Rich text content that cannot travel is replaced, not dropped

Decisions made while building `src/rich-copy.js`, all counted in the omitted total that drives the toast wording:

- **Formulas**: KaTeX output needs its stylesheet and fonts, so pasted markup would show the hidden MathML twice or
  as garbled spans. Each formula is replaced by its TeX source (from the MathML annotation) in an italic serif run.
- **Diagram background**: Diagram and chart images are rasterized on the page background color. They are drawn by the
  active theme's renderer, so a dark theme yields a dark image that stays legible on any paper. This is the one place
  theme can show in rich text; all text, table, code, and alert styling is fixed light.
- **Links**: Only `http`, `https`, and `mailto` links survive. Relative links, `file:` links, and in-page anchors
  (footnote references, heading links) become plain text because they resolve to nothing outside the app. `id`,
  `class`, and `data-*` attributes are removed after styling so the output carries no app hooks.
- **Allowed remote images**: Keep their original URL, recovered from the `mdimg` proxy URL, so the paste never contains
  an app-internal address. Local images are redrawn to PNG data URIs, capped at 2,000,000 characters per image and
  12,000,000 per document.
- **Task list checkboxes**: Replaced by ballot box characters because pasted form controls are dropped.
- **Live Blocks**: A running block contributes its snapshot image; the toolbar, frame, and source are omitted.
- **Plain text alternative**: Derived from the same sanitized-input clone, with blank lines between blocks, list
  markers, and tab separated table cells.

## Risks / Trade-offs

- [Word/Outlook paste fidelity varies] → Restrict to conservative HTML and inline CSS; verify manually in Word and
  Outlook before release; keep a plain text alternative.
- [`write_html` behavior differs per OS clipboard format (CF_HTML on Windows, NSPasteboard on macOS)] → Spike
  early in the tasks; fall back to a Rust-side CF_HTML builder only if the plugin output is rejected by Word.
  Spike status: `tauri-plugin-clipboard-manager` 2.4.2 `write_html(html, Some(plain))` delegates to arboard 3.6.1
  `set_html`, which writes HTML and a plain text alternative together. Manual paste of a document with headings,
  lists, tables, code, alerts, a diagram, a chart, and a local image was confirmed on Windows (2026-11-02); the
  plugin output is accepted, so no Rust-side CF_HTML builder is needed. macOS paste is not yet verified.
- [SVG-as-image rendering of `foreignObject` labels can taint the canvas in WKWebView] → Per-block failure falls back
  to the diagram source; verify mermaid diagrams on macOS before release.
- [Rasterizing SVG is async and can fail on tainted or foreign content] → Per-block failure falls back to the
  block's alt or source text; never fails the whole copy.
- [Large documents produce large clipboard payloads, especially with data URIs] → Cap embedded image size and
  total payload; drop images over the cap to alt text and mention nothing silently: toast notes omitted images.
- [Rich output must not diverge from rendered content] → Built from the live DOM, not a second pipeline.
