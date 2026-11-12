## Why

Users read a markdown file in mdlite and then want its content elsewhere: pasted into Word or an email as formatted
text, or pasted into a GitHub comment as markdown source. Today the only option is selecting rendered text and
copying it, which yields partially formatted output, and there is no way to get the original markdown without
opening the file in another editor.

## What Changes

- Add **File → Copy as Rich Text** which puts the rendered document on the clipboard as `text/html` with a plain
  text fallback, so it pastes with formatting into Word, Outlook, and similar programs.
- Add **File → Copy as Markdown** which puts the file's markdown source on the clipboard as plain text, so it
  pastes verbatim into GitHub comments and other markdown-aware inputs.
- Both items sit next to **Copy File Path**, operate on the currently displayed file in single-file and folder
  mode, are disabled when no file is displayed, and reuse the existing "copied" toast and error alert.
- Both items apply to the whole displayed document. Frontmatter is included in Copy as Markdown (it is part of the
  source) and excluded from Copy as Rich Text unless the frontmatter panel is shown.
- Rich text output is sanitized and made self-contained: styling is inlined, code highlighting survives, local and
  remote images are handled per the existing image rules, and diagram and chart blocks are embedded as images.
- Selection copy is unchanged. The webview already places the selection on the clipboard as HTML plus text, which
  covers the Word use case. A "copy selection as markdown" action is deferred (see Non-goals and design.md).

## Non-goals

- Copying a text selection as markdown. It needs either a source map from rendered DOM back to source lines or an
  HTML-to-markdown dependency, and neither is justified until whole-document copy has been used.
- Editing markdown or round-tripping rich text back into markdown.
- Keyboard shortcuts for the new items in this change. Menu access only; shortcuts can follow if requested.
- Right-click context menu entries in the rendered content area.
- Changing how printing, PDF export, or the existing Copy File Path behave.
- New runtime dependencies. Both formats use the existing `marked` and DOMPurify pipeline and the already bundled
  clipboard plugin or the webview's own clipboard API.

## Capabilities

### New Capabilities

- `copy-document-content`: Copy the displayed file as markdown source or as rich text from the File menu, including
  enablement rules, content fidelity rules for rich text, and user feedback.

### Modified Capabilities

- `copy-file-path`: The File menu group that holds Copy File Path now also holds the two new copy items. The
  Purpose text and the shared toast feedback wording need to cover them. No existing requirement changes.

## Impact

- `src-tauri/src/menu.rs`: two new menu items beside `copy-file-path`, enabled by `has_file`; enablement updates in
  the same place that updates Copy File Path.
- `src-tauri/src/lib.rs`: menu event handlers that emit events to the frontend.
- `src/main.js`: listeners for the new events; clipboard write; reuses `lastRawMarkdown` and `showToast`.
- New frontend module for building the rich text payload (clone rendered DOM, inline styles, replace SVG blocks
  with images) with unit tests.
- `openspec/specs/copy-file-path/spec.md` Purpose text and a new `copy-document-content` spec.
- Rich text output must look acceptable regardless of which of the 11 bundled themes is active, so it uses a fixed
  light, print-like palette rather than theme variables.
- No new dependencies.
