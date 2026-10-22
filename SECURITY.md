# Security Policy

## Supported Versions

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| < Latest | :x:                |

Only the latest release receives security updates. Update to the newest version before reporting issues.

## Reporting a Vulnerability

**Do not open public issues for security vulnerabilities.**

Send reports to: [your-email@example.com]

Include:

- Vulnerability description
- Steps to reproduce
- Impact assessment
- Suggested fix (optional)

**Response timeline:**

- Acknowledgment: 48 hours
- Triage: 5 business days
- Fix target: 30 days for critical issues

Accepted reports receive credit in release notes unless you request anonymity.

## Security Considerations

mdlite treats every markdown document as untrusted input.

### File Access

mdlite reads local markdown files with the user's OS permissions. It never modifies the documents it opens and
does not execute code from markdown content. It writes only:

- `settings.json` in the app config directory: theme, zoom, recent files and folders, the Image Allow-list, and
  Live Block consent (document path and a SHA-256 of its content, at most 200 entries).
  A legacy `config.json` is migrated into it once and then deleted.
- A PDF at the path the user chooses in the export dialog.
- The answers file passed to `--output` in interactive mode. It must not be the document or questions file.
- OS recent-document and jump list entries (Windows).

### Network Access

mdlite makes network requests in two cases only:

1. **Update check**: when the user selects Check for Updates, mdlite queries the GitHub Releases API for the
   latest version. It never downloads or installs updates.
2. **Allow-listed remote images**: see below. No other request is made on behalf of a document.

Links in documents open in the system browser, not in mdlite.

### Remote Images

- The webview content security policy blocks remote images. Every remote image request goes through the
  `mdimg` proxy in the Rust backend.
- The proxy fetches an image only when its hostname exactly matches an entry in the **Image Allow-list**, or
  when the user chose **Load once** for that exact URL in the current session. Subdomains are not implied.
- The Image Allow-list is empty by default. A blocked image shows a placeholder with its alt text, host,
  **Load once**, and **Always allow `<host>`**. Remove hosts with **View > Allowed Image Hosts**.
- Only `http` and `https` URLs are fetched. Each redirect hop is re-checked against the same rule (at most
  5 hops). Requests time out after 10 seconds, bodies are capped at 10 MB, and non-`image/*` responses are
  rejected.
- Load once allowances are held in memory and end when the app exits.

### Content Rendering

- Rendered markdown and raw HTML are sanitized with DOMPurify.
- `<style>`, `<form>`, `<input>`, `<button>`, `<select>`, `<textarea>`, and `<option>` are removed. The only
  input kept is a disabled task list checkbox.
- Author `style` attributes are removed outside KaTeX output. `class` is limited to an allowlist of renderer
  classes so documents cannot restyle or impersonate mdlite controls.
- Mermaid diagrams are not sandboxed. Mermaid renders in the main webview, and its SVG output is sanitized
  before insertion: scripts, embedded frames, event handler attributes, `javascript:`/`data:`/`vbscript:`
  links, and remote image references are removed.
- Code syntax highlighting uses highlight.js.

### Charts

`vega-lite` blocks render in the main window from a JSON specification; no author code runs.

- Expressions are evaluated by Vega's AST interpreter, so the main window's CSP keeps `script-src 'self'` with no
  `'unsafe-eval'`.
- The Vega loader refuses every request: `data.url`, image marks, and other external references never fetch. A
  specification that names a URL shows an error instead of a Chart.
- `href` encodings are removed, so Chart marks are never links.

### Live Blocks

`html-live` blocks are the only place author script runs.

- A Live Block shows its source and a **Run** control. Nothing executes until the reader clicks Run. Consent is
  remembered for that document path until its content changes.
- The block runs in an `<iframe sandbox="allow-scripts">` loaded from the `mdlive` URI scheme. The frame has an opaque
  origin and no `allow-same-origin`, `allow-popups`, `allow-top-navigation`, `allow-forms`, or `allow-modals`.
- The `mdlive` scheme serves only the frame page and the bundled assets it references (including `d3`), with its
  own CSP: no network (`connect-src 'none'`), no nested frames, no form targets, and scripts only from `mdlive` or
  inline.
- On Windows, WebView2 injects the Tauri IPC globals into every frame. Commands invoked from a Live Block are never
  answered and no command handler runs; `e2e/live-isolation` verifies this for every registered command, along with
  parent document access, network requests, popups, and navigation.
- The parent accepts only size and snapshot messages from its own frame. Snapshot SVG is sanitized before it is
  inserted for printing, and snapshots are capped at 2 MB.

### Dependencies

- Automated dependency scanning via GitHub Dependabot
- Security audits run on every PR (see `.github/workflows/security.yml`)
- Rust and npm dependencies updated regularly

### Build Integrity

- Release binaries built via GitHub Actions (reproducible builds)
- Unsigned binaries: verify checksums from release page
- Code signing planned for future releases

## Known Limitations

1. **Malicious markdown**: Crafted markdown with excessive nesting or large embedded images may cause
   performance degradation or crashes
2. **Untrusted files**: Do not open markdown files from untrusted sources without inspecting content first
3. **System resources**: Large file trees may exhaust memory when using folder view

## Security Best Practices

- Keep mdlite updated to the latest version
- Review markdown files before opening if from untrusted sources
- Report suspicious behavior immediately
- Use OS-level sandboxing when previewing untrusted content

## Disclosure Policy

Security fixes are disclosed in release notes after patches are available. We follow coordinated disclosure:

1. Private notification to maintainers
2. Fix development and testing
3. Release with patch
4. Public disclosure in release notes

Critical vulnerabilities may receive expedited releases outside the normal schedule.
