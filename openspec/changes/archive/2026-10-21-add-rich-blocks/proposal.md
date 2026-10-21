## Why

Documents, especially agent-generated decision and report Documents, need richer presentation than plain markdown:
Atlassian-style panels and status labels, data charts, and occasionally bespoke d3 visualizations. mdlite must deliver
this without letting an untrusted Document run code in the app (ADR 0001) and without adopting React/Atlaskit (ADR
0002). Depends on `harden-document-rendering`.

## What Changes

- **Panels**: the five GitHub alert types render as Atlassian-style Panels (NOTE→info, TIP→success, IMPORTANT→note,
  WARNING→warning, CAUTION→error). No new syntax.
- **Status Lozenges**: `<mark data-status="neutral|info|success|warning|error|note">TEXT</mark>` renders as a colored
  inline label.
- **Expands**: `<details><summary>` styled to match.
- **Charts**: ` ```vega-lite ` fenced blocks render as interactive SVG charts via a lazily loaded Vega-Lite engine, with
  inline data only and no network access.
- **Live Blocks**: ` ```html-live ` fenced blocks show their source and a **Run** button. On consent, the block runs in
  a sandboxed iframe served from an isolated `mdlive` origin with its own CSP, no network, and a bundled `d3` global.
  Consent is remembered per Document path until its content changes.
- Charts and Live Blocks follow the active theme and re-render on theme change.
- In print and PDF, a Live Block that has run is replaced by a snapshot; one that has not run prints its source.

## Capabilities

### New Capabilities

- `atlassian-styling`: Panels, Status Lozenges, and Expands.
- `charts`: Vega-Lite Chart rendering, isolation from network and script, theming.
- `live-blocks`: consent, isolation guarantees, d3 availability, theming, print behavior.

### Modified Capabilities

- `agent-decision-skill`: teaches when and how to use Panels, Status Lozenges, Expands, and Charts; prefers Charts over
  Live Blocks; falls back on older mdlite versions.
- `agent-preview-skill`: same authoring guidance, kept identical to the decision skill by an automated check.

## Non-goals

- Rendering Atlassian Document Format (ADF) JSON.
- Shipping React or any Atlaskit package.
- Allowing `<script>` in Documents outside Live Blocks.
- Loading chart or Live Block data from sibling files or the network.
- Libraries in Live Blocks other than d3.
- A global "always run Live Blocks" setting.

## Impact

- Dependencies (all lazy-loaded, justified in design): `vega`, `vega-lite`, `vega-interpreter` for Charts (main
  document); `d3` served only to the Live Block frame.
- `src/markdown.js`: fence handling for `vega-lite` and `html-live`, sanitizer allowance for `data-status` on `mark`,
  renderer orchestration feeding the render-completion promise.
- New `src/charts.js`, `src/live-blocks.js`, `live-frame.html` + `src/live-frame.js` (separate Vite entry).
- `src-tauri/src/lib.rs` and new `src-tauri/src/live.rs`: `mdlive` URI scheme serving frame assets with a dedicated CSP;
  consent persistence in `config.rs`.
- `src-tauri/tauri.conf.json`: `frame-src` for the `mdlive` origin.
- Theme CSS for Panels, Lozenges, Expands in all 11 themes.
- Agent skills (`mdlite-decision`, `mdlite-preview`): document the new constructs so agents use them.
