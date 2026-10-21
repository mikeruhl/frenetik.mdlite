## Why

Every Document is untrusted (see `GLOSSARY.md`), but today a Document can beacon to any remote host through images
(`img-src *`), inject document-wide CSS through `<style>`, borrow mdlite chrome classes, and render fake forms. Print
and PDF capture the live DOM without waiting for Mermaid, so diagrams can print blank. Upcoming Charts and Live Blocks
(see `live-blocks` spec) build on this baseline, so it must be tightened first.

## What Changes

- Remote images load only through a Rust proxy that enforces the **Image Allow-list**. The list is empty by default;
  matching is by exact hostname.
- A blocked remote image renders as a placeholder showing alt text and host, with **Load once** and **Always allow
  `<host>`** actions.
- CSP `img-src` tightens from `*` to local sources plus the proxy scheme. **BREAKING**: remote images in existing
  Documents no longer load until their host is allowed.
- Raw HTML sanitization forbids `<style>`, `<form>`, `<input>`, `<button>`, `<select>`, `<textarea>`, and restricts
  `class` to a fixed allowlist of renderer classes. Anchor `id` passthrough for question anchors is unchanged.
  **BREAKING** for Documents relying on those tags.
- Renderer controls (Mermaid "Open", copy buttons) are attached after sanitization instead of passing through it.
- Print and PDF export wait for all Rich Blocks to finish rendering, with a timeout and a toast if it expires.
- `SECURITY.md` is corrected to describe actual network behavior, settings writes, and Mermaid output handling.

## Capabilities

### New Capabilities

- `remote-images`: Image Allow-list, proxy enforcement, blocked-image placeholder and its actions.
- `html-sanitization`: tags, attributes, and classes permitted in Raw HTML and renderer output.
- `print-readiness`: print and PDF export wait for Rich Block rendering.

### Modified Capabilities

- `agent-decision-skill`: states rendering restrictions (blocked remote images, stripped styles and form controls).
- `agent-preview-skill`: same restrictions.

## Non-goals

- Charts, Live Blocks, Panel and Status Lozenge styling (separate change).
- Loading local relative images or sibling data files.
- Wildcard or pattern-based host matching.
- Blocking remote links; links already open in the system browser.

## Impact

- `src/markdown.js`: sanitizer config and hooks, image rewriting, post-sanitize control attachment, render-completion
  promise.
- `src/main.js`: print and PDF entry points await render completion; placeholder actions.
- `src-tauri/src/lib.rs`: register the image proxy URI scheme and new commands.
- New `src-tauri/src/images.rs`: allow-list checks, session allowances, proxied fetch. Reuses existing `reqwest`; no new
  dependency.
- `src-tauri/src/config.rs`: persist the Image Allow-list in the existing settings store.
- `src-tauri/tauri.conf.json`: CSP `img-src`.
- `public/mermaid-viewer.html`: unaffected; it receives already-sanitized SVG.
- Placeholder UI must render correctly in all 11 bundled themes.
- `SECURITY.md`.
- `plugins/mdlite/skills/mdlite-decision/SKILL.md`, `plugins/mdlite/skills/mdlite-preview/SKILL.md`.
