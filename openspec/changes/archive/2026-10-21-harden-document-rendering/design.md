## Context

Rendering happens in the frontend: `marked` produces HTML, `DOMPurify.sanitize` cleans it (`src/markdown.js`), and
`main.js` assigns it to `#content`. Mermaid renders asynchronously afterwards and is not awaited. CSP is
`img-src * data: blob:`, so any remote image loads. DOMPurify defaults admit `<style>`, `<form>`, `<input>`, `<button>`,
and any `class`. The settings store (`tauri-plugin-store`, `settings.json`) already persists theme, zoom, and recent
files via `config.rs`. `reqwest` 0.13 is already a dependency (updater).

Decisions recorded in the `live-blocks` spec and the grilling session: Documents are untrusted; the Image Allow-list is empty
by default and matched by exact hostname; this change ships before Charts and Live Blocks.

## Goals / Non-Goals

**Goals:**

- One choke point for every remote image request, enforced outside the webview.
- Raw HTML cannot restyle or impersonate mdlite chrome.
- Print and PDF never capture half-rendered Rich Blocks.

**Non-Goals:**

- Charts, Live Blocks, Panel/Lozenge styling.
- Local relative image loading.
- An allow-list management screen beyond what is needed to remove a host (see Open Questions).

## Decisions

### D1. Image proxy via custom URI scheme `mdimg`

Register an asynchronous URI scheme protocol in `lib.rs`, handled by a new `images.rs` module. The frontend never emits
remote URLs into `src`; it emits `mdimg://localhost/?u=<encoded-url>` (resolved by Tauri as `http://mdimg.localhost/` on
Windows). The handler:

- rejects non-`https`/`http` URLs;
- allows the request only if the host is on the persisted Image Allow-list or the exact URL is in the in-memory session
  allowance set;
- fetches with `reqwest` using a manual redirect policy that re-checks every hop's host against the same rule;
- enforces a 10 s timeout and a 10 MB body cap;
- returns the body only when `Content-Type` starts with `image/`, otherwise 403.

CSP becomes `img-src 'self' data: blob: mdimg: http://mdimg.localhost`.

_Alternatives:_ sanitizer-only filtering with CSP left at `*` (rejected: any missed code path, such as an SVG `<image>`
from a renderer, beacons out with no backstop); per-session CSP rewriting (rejected: CSP is fixed at build time in
`tauri.conf.json`).

### D2. Placeholder and actions

A DOMPurify `afterSanitizeAttributes` hook replaces every `<img>` with a remote `src`:

- host allowed (known via a list fetched once per render with `get_image_allowlist`): rewrite `src` to the proxy URL;
- otherwise: replace with a placeholder element carrying `data-remote-src`, alt text, and the host as text content.

After insertion, `main.js` attaches **Load once** (invokes `allow_image_once(url)`, then swaps in the proxy URL) and
**Always allow `<host>`** (invokes `allow_image_host(host)`, then re-renders the Document). Placeholder styling uses
theme CSS variables only. SVG `<image href>` with a remote target is removed rather than placeheld.

### D3. Sanitizer tightening

- Hooks and config live on a private instance, `DOMPurify(window)`. Mermaid in strict mode sanitizes its whole SVG with
  the shared default instance; global hooks stripped its classes and every node rendered solid black.
- `FORBID_TAGS`: `style`, `form`, `button`, `select`, `textarea`, `option`.
- Remove `button` from `ADD_TAGS`.
- `<input>` is removed by hook unless it is a disabled checkbox; kept checkboxes are reduced to `type`, `disabled`,
  `checked`. `marked` emits task list items as bare `<input disabled type="checkbox">` with no class, so a blanket
  forbid would delete them.
- A hook filters `class` tokens against an allowlist of exact names and prefixes: `hljs`, `hljs-*`, `language-*`,
  `katex*`, `markdown-alert*`, `mermaid-*`, `octicon*` (alert icons), `footnotes`, `sr-only`, `data-footnote-backref`.
  `remote-image-placeholder` is added with the image placeholder. Unknown tokens are dropped; an empty `class` is
  removed.
- Elements inside `.katex` are exempt from class filtering, mirroring the `style` exemption. KaTeX inner classes
  (`mord`, `vlist-t`, `msupsub`, `mtight`, `sizeN`, ...) do not share a prefix, and enumerating them breaks on KaTeX
  upgrades. This adds no capability beyond the existing `style` exemption.
- Existing `style` stripping and anchor `id` passthrough are unchanged.

### D4. Renderer controls attached after sanitization

The Mermaid renderer emits the block container without its "Open" button; `renderMermaidBlocks` and `bindCopyButtons`
create buttons with `createElement` after insertion. This lets `button` be forbidden in Document HTML without losing
renderer controls.

### D5. Render completion promise

`renderMermaidBlocks` already returns a promise. `main.js` stores the latest render's promise as `richRenderDone`. Print
(menu and Ctrl+P) and PDF (Ctrl+Shift+E) call `awaitRichRender(timeoutMs = 10000)` before `window.print()` /
`invoke("export_pdf")`. On timeout, a toast states diagrams may be incomplete and printing proceeds. The design
generalizes to future Rich Blocks by having each renderer contribute to the same promise.

### D6. Allow-list persistence

`config.rs` gains `store_get_image_allowlist` / `store_add_image_host` / `store_remove_image_host` under key
`image_allowlist` (array of lowercase hostnames). Session allowances live in Rust managed state and are never persisted.
Hosts are normalized (trimmed, lowercased, trailing dot removed) and rejected unless they parse as a bare hostname. A
`remove_image_host` command exposes removal for whichever UI 3.6 selects.

## Risks / Trade-offs

- [Existing Documents lose remote images] → Placeholder makes the cause visible and the fix one click; release notes
  call it out.
- [Proxy adds latency and memory] → Body cap and timeout; images are fetched only for allowed hosts.
- [Class allowlist misses a renderer class and breaks styling] → Snapshot tests render a fixture using every extension
  and assert classes survive.
- [`mdimg` scheme URL differs per platform] → Build proxy URLs through one helper that mirrors Tauri's `convertFileSrc`
  scheme rules; covered by unit test.
- [Redirect to a disallowed host] → Manual redirect policy re-checks each hop.

## Open Questions

- ~~Removing a host from the allow-list.~~ Resolved: **View > Allowed Image Hosts** submenu lists each host as "Remove
  `<host>`"; clicking one removes it, rebuilds the menu, and emits `image-allowlist-changed` so the open Document
  re-renders.
