<!--
  Sync Impact Report
  ==================
  Version change: 0.0.0 → 1.0.0 (initial ratification)

  Modified principles: N/A (initial creation)

  Added sections:
    - Principle I: Code Quality
    - Principle II: Testing Standards
    - Principle III: User Experience Consistency
    - Principle IV: Performance Requirements
    - Section: Technology Constraints
    - Section: Development Workflow
    - Governance

  Removed sections: None

  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ compatible (Constitution Check section generic)
    - .specify/templates/spec-template.md ✅ compatible (success criteria align with performance principle)
    - .specify/templates/tasks-template.md ✅ compatible (phase structure supports principles)
    - .specify/templates/checklist-template.md ✅ compatible (category structure is generic)

  Follow-up TODOs: None
-->

# mdlite Constitution

## Core Principles

### I. Code Quality

All code MUST be clear, maintainable, and self-documenting.

- Functions and modules MUST have a single, well-defined responsibility.
- Dead code, unused imports, and commented-out blocks MUST be removed.
- Rust code MUST compile with zero warnings (`cargo clippy -- -D warnings`).
- JavaScript MUST pass ESLint with the project configuration; no lint
  suppressions without inline justification.
- Dependencies MUST be kept minimal. Every new dependency requires
  justification: the problem it solves and why a smaller or built-in
  alternative is insufficient.
- All user-facing strings MUST be sanitized (DOMPurify for HTML,
  path validation for file system access).

### II. Testing Standards

Every user-visible behavior MUST be verifiable through automated or
structured manual testing.

- Rust backend changes MUST include unit tests for new public functions
  and integration tests for Tauri command handlers.
- Frontend changes MUST be validated in the running application before
  being considered complete. Type-checking and linting verify code
  correctness, not feature correctness.
- Regressions in existing features MUST be checked when modifying
  shared modules (`main.js`, `lib.rs`, `commands.rs`).
- CI pipelines (`ci.yml`, `security.yml`, CodeQL) MUST pass on every
  PR. Failures block merge.
- Manual test plans MUST be included in PR descriptions for UI changes
  that cannot be covered by automated tests.

### III. User Experience Consistency

The application MUST behave predictably across platforms and themes.

- UI additions MUST render correctly in all 11 bundled themes (light,
  dark, dimmed, high-contrast, auto, colorblind variants, Splendor,
  Retro, Air, Modest).
- Keyboard shortcuts MUST follow platform conventions: `Ctrl` on
  Windows/Linux, `Cmd` on macOS.
- New UI elements MUST match existing visual patterns (spacing, font
  sizes, icon style) rather than introducing novel chrome.
- Error states MUST be surfaced to the user via the existing
  notification or dialog patterns, not silent failures or raw console
  output.
- File watcher and live-reload behavior MUST remain unaffected by
  unrelated feature changes. Startup-to-render latency MUST NOT
  regress.

### IV. Performance Requirements

mdlite MUST remain lightweight and start fast.

- Application binary size MUST stay under 15 MB (release build).
- Cold startup to first render MUST complete in under 2 seconds on
  supported platforms.
- Markdown rendering for files up to 10,000 lines MUST complete in
  under 500 ms.
- Memory usage MUST remain under 150 MB for typical single-file
  viewing.
- Mermaid diagram rendering MAY be deferred or lazy-loaded but MUST
  NOT block initial markdown display.
- New frontend dependencies MUST be evaluated for bundle-size impact.
  Additions that increase the Vite bundle by more than 50 KB require
  explicit justification.

## Technology Constraints

- **Runtime**: Tauri 2.x (Rust backend) + Vite (frontend bundler).
  No Electron.
- **Frontend**: Vanilla JavaScript. No framework (React, Vue, etc.)
  unless a future constitution amendment approves one.
- **Markdown**: `marked` library with extensions (highlight.js, KaTeX,
  mermaid, marked-alert, marked-emoji, marked-footnote).
- **Sanitization**: DOMPurify for all rendered HTML.
- **Package manager**: pnpm. No npm or yarn lock files.
- **Node**: >=20.17 as specified in `package.json` engines.
- **Rust**: Stable toolchain. No nightly-only features.

## Development Workflow

- All changes MUST go through pull requests. Direct pushes to `main`
  are prohibited.
- PRs MUST pass CI (lint, build, security scan, CodeQL) before merge.
- Commit messages MUST use conventional format: `type: description`
  (e.g., `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- Husky pre-commit hooks and lint-staged MUST NOT be bypassed
  (`--no-verify` is prohibited without explicit authorization).
- Cross-platform builds (Windows, macOS, Linux) MUST be validated
  via the release workflow before tagging a release.
- CHANGELOG or release notes MUST accompany version bumps.

## Governance

This constitution supersedes conflicting guidance in other project
documents. Amendments follow this process:

1. Propose the change in a PR modifying this file.
2. Document the rationale in the PR description.
3. Version the constitution using semantic versioning:
   - MAJOR: principle removal or redefinition.
   - MINOR: new principle or material expansion.
   - PATCH: wording clarification or typo fix.
4. Update dependent templates if the amendment changes mandatory
   sections or constraints (see Sync Impact Report).

All PRs and code reviews MUST verify compliance with these principles.
Complexity or principle deviations MUST be justified in the plan's
Complexity Tracking table.

**Version**: 1.0.0 | **Ratified**: 2026-04-26 | **Last Amended**: 2026-04-26
