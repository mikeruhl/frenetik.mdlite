# mdlite

[![CI](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/ci.yml/badge.svg)](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/ci.yml)
[![Security](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/security.yml/badge.svg)](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/security.yml)
[![CodeQL](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/codeql.yml/badge.svg)](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A lightweight desktop markdown previewer. Opens fast, renders GitHub-flavored markdown, and live-reloads when the file changes.

Built with [Tauri](https://tauri.app) + [marked](https://github.com/markedjs/marked). ~10MB binary, native webview, no Electron.

## Features

- **Live reload** — file watcher detects edits and re-renders automatically
- **Mermaid diagrams** — rendered inline with an option to open in a zoomable/pannable window
- **11 themes** — 7 GitHub variants (light, dark, dark dimmed, dark high contrast, auto, colorblind), Splendor, Retro, Air, Modest (persisted across sessions)
- **Fast startup** — native binary, no runtime dependencies
- **Cross-platform** — Windows, macOS, Linux

## Install

Download the latest release from the [Releases](../../releases) page.

| Platform | File |
|----------|------|
| Windows | `.msi` or `.exe` installer |
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Linux | `.deb` or `.AppImage` |

Or build from source (see below).

## Usage

```
mdlite <file>
```

```
mdlite README.md
mdlite docs/guide.md
mdlite ~/notes/todo.md
```

The window title shows the filename. Edit the file in any editor and the preview updates live.

### Theme selection

Use the dropdown in the top-right corner. Your choice persists via `localStorage`.

### Mermaid diagrams

Fenced code blocks with the `mermaid` language tag render as diagrams inline. Hover over a diagram and click **Open** to view it in a separate window with zoom and pan controls.

## Build from source

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [pnpm](https://pnpm.io)
- [Rust](https://rustup.rs) stable
- Platform-specific dependencies:
  - **Linux:** `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
  - **Windows:** Visual Studio Build Tools with C++ workload
  - **macOS:** Xcode Command Line Tools

### Steps

```bash
git clone https://github.com/<owner>/mdlite.git
cd mdlite
pnpm install
pnpm tauri build
```

The binary is at `src-tauri/target/release/mdlite` (or `mdlite.exe` on Windows).

### Development

```bash
pnpm tauri dev -- -- path/to/file.md
```

## Project structure

```
mdlite/
  index.html                  # App shell
  src/
    main.js                   # Frontend: render, themes, mermaid
    styles.css                # UI chrome (theme bar, mermaid blocks)
    themes/                   # Bundled CSS themes
  src-tauri/
    src/lib.rs                # Backend: CLI, file read, file watcher
    tauri.conf.json           # Tauri config, CLI args, window settings
    capabilities/default.json # Permissions
  public/
    mermaid-viewer.html       # Standalone mermaid zoom/pan viewer
  .github/workflows/
    release.yml               # CI: cross-platform release builds
```

## Themes

| Theme | Author | Source |
|-------|--------|--------|
| GitHub Light | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Dark | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Dark Dimmed | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Dark HC | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Auto | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Light (Colorblind) | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Dark (Colorblind) | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| Splendor | [John Otander](https://johnotander.com) | [markdowncss/splendor](https://github.com/markdowncss/splendor) |
| Retro | [John Otander](https://johnotander.com) | [markdowncss/retro](https://github.com/markdowncss/retro) |
| Air | [John Otander](https://johnotander.com) | [markdowncss/air](https://github.com/markdowncss/air) |
| Modest | [John Otander](https://johnotander.com) | [markdowncss/modest](https://github.com/markdowncss/modest) |

All themes are MIT licensed.

## Contributing

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a pull request

## License

MIT
