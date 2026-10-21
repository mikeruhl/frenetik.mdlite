# Rich content is declarative; author script runs only in Live Blocks on an isolated origin

Every Document is untrusted, yet authors want d3-grade charts. Diagrams and Charts are Rich Blocks rendered by bundled
engines (Mermaid, Vega-Lite) from declarative specs, so the main document never executes author code and its CSP stays
`script-src 'self'`. Author script is allowed only in Live Blocks, which run after per-Document consent inside a
sandboxed iframe served from a dedicated custom URI scheme with its own CSP and no network.

## Considered Options

- **Allow `<script>` in Documents**: rejected; any opened file gains full access to the app and Tauri IPC.
- **Same-origin sandboxed iframe or `srcdoc`**: rejected; running author code there requires `'unsafe-inline'` or
  `'unsafe-eval'` in the app-wide CSP, since such frames inherit or share the main policy.
- **Observable Plot / Chart.js for Charts**: Plot specs are JavaScript, not data; Chart.js has a narrower grammar and
  renders to canvas only.

## Consequences

- On Windows, wry injects Tauri IPC globals into every frame, including sandboxed iframes. Isolation therefore depends
  on Tauri's origin/capability check rejecting the Live Block origin, not on the globals being absent. An automated test
  must prove a Live Block cannot invoke any command; if it cannot pass, Live Blocks are not shipped.
- Vega must evaluate expressions without `new Function` (the CSP-safe interpreter), because the main CSP forbids
  `'unsafe-eval'`.
- Charts and Live Blocks use inline data only until local asset loading exists.
