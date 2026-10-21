## Context

After `harden-document-rendering`, Raw HTML is restricted, remote images go through the Image Allow-list proxy, and
print/PDF await a render-completion promise. Mermaid is the only Rich Block: fenced language detection in the `code`
renderer emits a base64 `data-*` container, and a lazily imported engine renders after insertion. Main CSP is
`script-src 'self'`. On Windows, wry injects Tauri IPC globals into every frame, so a frame's isolation rests on Tauri's
origin/capability check (ADR 0001).

## Goals / Non-Goals

**Goals:**

- Atlassian-style formatting that degrades to readable markdown on GitHub.
- Declarative Charts with zero author code execution in the main document.
- An opt-in escape hatch for author d3 code that provably cannot reach app commands, the filesystem, or the network.

**Non-Goals:** see proposal.

## Decisions

### D1. Panels, Lozenges, Expands are CSS over existing markup

`marked-alert` already emits `markdown-alert-{type}`; theme CSS restyles these as Panels. Lozenges allow `data-status`
on `mark` (value validated against the six tones; others dropped) and add `mark[data-status]` styles.
`details`/`summary` get Expand styles. No parser changes; nothing new appears in markdown that GitHub cannot show.

### D2. Rich Block renderer registry

Generalize the Mermaid path into a small registry keyed by fence language: `{ mermaid, "vega-lite", "html-live" }`. Each
entry provides a container emitter (pre-sanitize, data in a base64 attribute) and an async `render(container)`; the
orchestrator runs them after insertion and resolves the render-completion promise when all finish. Theme changes call
each renderer's `rerender`. Panel-mode (interactive descriptions) disables all Rich Blocks, as it does Mermaid today.

### D3. Charts: Vega-Lite rendered into the DOM by Vega

- Lazy `import()` of `vega`, `vega-lite`, `vega-interpreter` only when a `vega-lite` block exists.
- Compile with Vega-Lite, then construct a Vega `View` with
  `{ renderer: "svg", expr: expressionInterpreter, ast: true }` so expressions never use `new Function` (main CSP
  forbids `'unsafe-eval'`).
- Custom loader: every `load`/`sanitize` call rejects, so `data.url`, image marks, and remote fonts never fetch; `href`
  encodings are dropped.
- View renders directly into the container (no string round-trip), preserving tooltips and selections. Text marks are
  DOM text nodes, not HTML.
- Theme: a Vega config built from the active theme's computed CSS variables (foreground, background, font family, muted
  gridlines); `rerender` rebuilds the view.
- Errors render as a `pre.rich-block-error`, matching the Mermaid error pattern.

_Dependency justification:_ Vega-Lite is the only mainstream JSON grammar with the breadth of d3-style charts that
agents reliably author. Chart.js covers fewer chart types and renders canvas only; Observable Plot specs are JavaScript.
Cost is ~800 KB, paid only by Documents containing a Chart. `vega-embed` is not used (adds an actions menu and extra
weight).

_Measured (vega 6.4.0, vega-lite 6.5.0, vega-interpreter 2.3.2):_ lazy chunks `vega` 447.5 kB (161.3 kB gzip),
`vega-lite` 253.6 kB, `vega-interpreter` 5.0 kB. The main chunk gains only the renderer and `import()` references.

### D4. Live Blocks: isolated origin via `mdlive` URI scheme

- `live.rs` registers an asynchronous URI scheme `mdlive` that serves only three bundled assets (`live-frame.html`,
  `live-frame.js`, `d3`) resolved through the app asset resolver, and 404s everything else. Responses carry a dedicated
  header CSP:

  ```text
  default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'
  ```

- The block mounts `<iframe sandbox="allow-scripts" src="mdlive://localhost/live-frame.html">` (platform form via the
  same scheme helper as `mdimg`). No `allow-same-origin`, `allow-popups`, `allow-top-navigation`, `allow-forms`, or
  `allow-modals`. The frame's origin is opaque; it is not listed in any capability, so the Tauri ACL rejects any IPC
  request even though Windows injects the globals.
- Main CSP adds `frame-src mdlive: http://mdlive.localhost`.
- Protocol: parent posts `{ type: "run", source, theme }` once the frame signals `ready`; the frame inserts the source
  as HTML and executes its scripts (frame CSP permits inline script). Frame posts `{ type: "size", height }` and, after
  a settle period, `{ type: "snapshot", svg | png }`. Parent accepts messages only when
  `event.source === iframe.contentWindow`, validates shape and size (snapshot cap 2 MB), and sanitizes snapshot SVG with
  the shared renderer-SVG sanitizer before use.
- `d3` is loaded by `live-frame.html` as a bundled script and exposed as `window.d3`.
- Theme: parent sends resolved CSS variables; frame applies them to `:root`; theme change re-sends.

_Alternatives:_ same-origin sandboxed page (requires `'unsafe-eval'` or `'unsafe-inline'` in the app-wide CSP);
`srcdoc`/`blob:` frames (inherit main CSP); separate `WebviewWindow` (heavier, still needs isolation, poor inline
layout).

### D5. Consent

Unrun Live Blocks render highlighted source and a **Run** button. Consent is stored in the settings store as
`(path, sha256(documentContent))` pairs (capped at 200 entries, LRU). On open, a matching hash auto-runs that Document's
Live Blocks; any content change invalidates it. Hashing is done in Rust by `live_consent_check` and
`live_consent_grant`, which take only the content: the path comes from the backend's open-file state, because the
frontend knows the current path only in folder mode, and a caller cannot name an arbitrary path.

### D6. Print and PDF

Charts are DOM SVG and print natively. For Live Blocks, before print/PDF the orchestrator swaps each run frame for its
latest snapshot (or its source if unrun or no snapshot), then restores after `afterprint` / export completion.

### D8. Mermaid follows the page background

The Mermaid container paints `--theme-bg` instead of white, and the Mermaid theme is chosen from the resolved
background's luminance rather than from the theme id. Retro is a dark page whose id lacks "dark"; id matching gave it
light diagrams, and the white container put dark diagrams on a white box in every dark theme.

### D7. Agent skill guidance

`mdlite-decision` and `mdlite-preview` skills gain a short section listing Panels, Lozenges, Expands, and
` ```vega-lite ` with one example each, preferring Charts over Live Blocks.

## Risks / Trade-offs

- [Windows frame IPC injection makes isolation depend on the ACL check] → Mandatory automated test (task 4.x) that runs
  a Live Block calling `__TAURI_INTERNALS__.invoke` for every registered command and asserts rejection. If it fails,
  Live Blocks are removed from the change and Charts ship alone.
- [Vega bundle size] → Lazy chunk; Documents without Charts pay nothing; tracked in PR bundle report.
- [Vega expression interpreter is slower than compiled expressions] → Acceptable for document-scale charts.
- [Infinite loops in Live Blocks hang the frame] → Frame is sandboxed but shares the renderer process on WebView2; add a
  Stop button that removes the iframe.
- [Snapshot fidelity for canvas-based d3] → Frame serializes canvas via `toDataURL`; fallback to source.

## Open Questions

- ~~Live Block fence name.~~ Resolved: ` ```html-live `.
- ~~Consent persistence across restarts vs session-only.~~ Resolved: persisted in the settings store as in D5.
