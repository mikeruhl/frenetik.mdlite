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

### File Access

mdlite reads local markdown files with the user's OS permissions. It does not:

- Access files outside specified paths
- Write to the filesystem (read-only)
- Make network requests
- Execute arbitrary code from markdown content

### Content Rendering

- Markdown is sanitized via DOMPurify before rendering
- Code syntax highlighting uses highlight.js (safe by default)
- Mermaid diagrams render in sandboxed contexts
- XSS protections are enabled in the webview

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
