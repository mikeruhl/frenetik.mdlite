## 1. Atlassian styling

- [x] 1.1 Add tests: `mark[data-status]` keeps valid tones, drops others; alerts and `details` survive sanitization
- [x] 1.2 Allow and validate `data-status` on `mark` in the sanitizer hook
- [x] 1.3 Add Panel, Status Lozenge, and Expand styles using theme variables
- [x] 1.4 Verify all three constructs in all 11 themes in the running app

## 2. Rich Block registry

- [x] 2.1 Extract the Mermaid fence/render path into a renderer registry keyed by fence language; keep Mermaid behavior
      identical (tests)
- [x] 2.2 Orchestrator resolves the render-completion promise when all renderers finish; theme change calls each
      renderer's rerender
- [x] 2.3 Extract the Mermaid SVG sanitizer into a shared renderer-SVG sanitizer
- [x] 2.4 Regression check: Mermaid render, Open viewer, theme re-render, panel mode, print readiness

## 3. Charts

- [x] 3.1 Add `vega`, `vega-lite`, `vega-interpreter` with pnpm; record bundle sizes and confirm a separate lazy chunk
- [x] 3.2 Implement `src/charts.js`: compile, View with expression interpreter, rejecting loader, href dropped, error
      display
- [x] 3.3 Build Vega config from active theme CSS variables; rerender on theme change
- [x] 3.4 Tests: valid spec renders SVG; remote `data.url` errors with no request; invalid JSON shows error; engine not
      imported for Documents without Charts
- [x] 3.5 Verify CSP compliance in the running app (no `unsafe-eval` violations in devtools) and theme behavior across
      11 themes

## 4. Live Block isolation (gate)

- [x] 4.1 Add `live-frame.html` and `src/live-frame.js` as a separate Vite entry; bundle d3 for the frame only
- [x] 4.2 Implement `live.rs`: `mdlive` scheme serving only the frame assets with the dedicated CSP header; unit tests
      for allowed paths and 404s
- [x] 4.3 Add `frame-src` for the `mdlive` origin to the main CSP
- [x] 4.4 Write the isolation test: a Live Block attempts `__TAURI_INTERNALS__.invoke` for every registered command,
      `window.parent.document`, `fetch`, remote image, `window.open`, top navigation; assert all fail and no handler
      runs. Run on Windows
- [x] 4.5 Decision point: if 4.4 fails, remove Live Blocks from this change and continue with sections 6 to 7 for Charts
      only

## 5. Live Blocks

- [x] 5.1 Implement `src/live-blocks.js`: source view, Run and Stop controls, sandboxed iframe mount, message protocol
      with source and shape validation
- [x] 5.2 Theme variables sent to frame on run and theme change
- [x] 5.3 Consent commands in Rust (sha256 per path, 200-entry LRU in settings store) with unit and integration tests
- [x] 5.4 Snapshot capture in frame (SVG serialize or canvas `toDataURL`), 2 MB cap, sanitized on receipt
- [x] 5.5 Print/PDF swap: snapshot or source before print, restore after
- [x] 5.6 Verify in running app: d3 example renders, consent persistence and invalidation on file change, Stop, print
      and PDF output

## 6. Agent skills and docs

- [x] 6.1 Confirm `mdlite --version` (or equivalent) reports the version from the CLI; add it if missing, with test
- [x] 6.2 Write the "Rich Document authoring" section: one minimal example each of Panel, Status Lozenge, Expand,
      `vega-lite` Chart; when-to-use rules (Panels for risks and recommendations, Lozenges for option/item state,
      Expands for skippable detail, Charts for quantitative comparisons and trends); Charts over Live Blocks; Live
      Blocks need reader consent; minimum mdlite version and fallback to tables and plain alerts
- [x] 6.3 Add the identical section to both `mdlite-decision` and `mdlite-preview` SKILL.md, keeping each SKILL.md
      concise (follow the writing-for-agents guidance)
- [x] 6.4 Add a vitest check that the authoring sections in both SKILL.md files are byte-identical
- [x] 6.5 Update `plugins/mdlite/skills/mdlite-decision/examples/decision.md` to use a recommendation Panel, option
      Status Lozenges, and a comparison Chart
- [x] 6.6 Update `SECURITY.md` with Chart and Live Block isolation model
- [x] 6.7 Add a sample Document under `docs/` exercising every construct
- [x] 6.8 Verify by having an agent with the installed plugin write a decision Document and a report; confirm it uses
      the constructs and they render

## 7. Verification

- [x] 7.1 `cargo clippy -- -D warnings`, `cargo test`, vitest, ESLint pass
- [x] 7.2 Regression check: file watcher live reload, interactive mode, question anchors, KaTeX, footnotes, emoji
- [x] 7.3 Performance check: 10k-line Document without Charts still renders under 500 ms; cold start unaffected. Result:
      not met on `main` either (~1.7 s busy, ~0.96 s in marked `walkTokens`); pre-existing, tracked in #114
- [x] 7.4 Manual test plan in PR description
- [x] 7.5 Mermaid container and theme follow the page background (luminance, not theme id); tests in
      `mermaid-block.test.js` and `markdown.test.js`
