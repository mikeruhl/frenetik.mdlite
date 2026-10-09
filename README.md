# mdlite

[![CI](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/ci.yml/badge.svg)](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/ci.yml)
[![Security](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/security.yml/badge.svg)](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/security.yml)
[![CodeQL](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/mikeruhl/frenetik.mdlite/actions/workflows/github-code-scanning/codeql)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A lightweight desktop markdown previewer. Opens fast, renders GitHub-flavored markdown, and live-reloads when the file changes.

Built with [Tauri](https://tauri.app) + [marked](https://github.com/markedjs/marked). ~10MB binary, native webview, no Electron.

## Features

- **Live reload** — file watcher detects edits and re-renders automatically
- **Folder view** — open a directory and browse all markdown files in a sidebar tree
- **Search** — `Ctrl+F` find with regex and case-sensitivity toggles
- **Interactive mode** — agents present a decision document with questions and receive the answers as JSON
- **Mermaid diagrams** — rendered inline with an option to open in a zoomable/pannable window
- **Math/LaTeX** — inline (`$...$`) and block (`$$...$$`) math via KaTeX
- **11 themes** — 7 GitHub variants (light, dark, dark dimmed, dark high contrast, auto, colorblind),
  Splendor, Retro, Air, Modest (persisted across sessions)
- **Fast startup** — native binary, no runtime dependencies
- **Cross-platform** — Windows, macOS, Linux

## Install

Download the latest release from the [Releases](../../releases) page.

| Platform              | File             |
| --------------------- | ---------------- |
| Windows               | `.exe` installer |
| macOS (Apple Silicon) | `.dmg`           |
| macOS (Intel)         | `.dmg`           |
| Linux                 | `.AppImage`      |

Or build from source (see below).

### Command line

Agents and scripts run `mdlite` by name, so it must be on `PATH`.

| Platform | Setup                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Windows  | Automatic. The installer adds its folder to your user `PATH` and removes it on uninstall.                           |
| macOS    | `sudo ln -sf /Applications/mdlite.app/Contents/MacOS/mdlite /usr/local/bin/mdlite`                                  |
| Linux    | `chmod +x /path/to/mdlite.AppImage && mkdir -p ~/.local/bin && ln -sf /path/to/mdlite.AppImage ~/.local/bin/mdlite` |

Restart open terminals and agent sessions afterwards; they do not see `PATH` changes made after they started.
Check with `mdlite --help`.

## Usage

```bash
mdlite <file>
```

```bash
mdlite README.md
mdlite docs/guide.md
mdlite ~/notes/todo.md
```

The window title shows the filename. Edit the file in any editor and the preview updates live.

### Folder view

Open a folder to browse all markdown files in a sidebar tree.

```bash
mdlite docs/
mdlite ~/notes/
```

Or use **File → Open Folder...** from the menu. The sidebar shows a collapsible tree of all `.md`,
`.markdown`, and `.mdx` files. Click a file to preview it. Folders with no markdown descendants are
hidden. If the folder contains a `README.md`, it opens automatically.

### Search

Press `Ctrl+F` (or `Cmd+F` on macOS) or use **File → Find...** to open the search bar.

| Control       | Description             |
| ------------- | ----------------------- |
| `.*` button   | Toggle regex mode       |
| `Aa` button   | Toggle case sensitivity |
| `Enter`       | Jump to next match      |
| `Shift+Enter` | Jump to previous match  |
| `Escape`      | Close search bar        |

Matches are highlighted inline. The counter shows your position (e.g. "3 of 12").

### Theme selection

Use the **Theme** menu. Your choice persists across sessions.

### Mermaid diagrams

Fenced code blocks with the `mermaid` language tag render as diagrams inline. Hover over a diagram
and click **Open** to view it in a separate window with zoom and pan controls.

### Interactive mode (agent decisions)

An agent can open a decision document with questions beside it and read the answers when the window closes.

```bash
mdlite decision.md --interactive questions.json --output answers.json
```

- Questions appear in the left sidebar. Choose answers and click **Submit** (`Ctrl+Enter`, `Cmd+Enter` on macOS).
- A question with an `anchor` links to `<a id="..."></a>` in the document: `§` jumps to the section, the `Q1`
  badge in the document jumps back, and the question for the section you are reading is highlighted.
- Closing the window cancels. If answers were entered, mdlite asks before discarding them.
- Interactive sessions do not appear in recent files.

The result is one JSON line on stdout, also written to `--output` when given. Stdout carries nothing else;
diagnostics go to stderr.

| Status      | Exit code | Meaning                                       |
| ----------- | --------- | --------------------------------------------- |
| `submitted` | 0         | `answers` holds the responses                 |
| `error`     | 1         | Invalid arguments or questions file (`error`) |
| `cancelled` | 2         | Window closed without submitting              |

On Windows, stdout only reaches the caller when it is piped or redirected. Use `--output` for a reliable result.

The questions schema, answer format, and agent workflow are documented in the agent skill at
[`skills/mdlite-decision/SKILL.md`](skills/mdlite-decision/SKILL.md).

### Agent skill

**Claude Code.** Install the plugin from this repository's marketplace. Updates arrive through the plugin
manager whenever `main` changes.

```text
/plugin marketplace add mikeruhl/frenetik.mdlite
/plugin install mdlite@mdlite
```

Run `/plugin marketplace update mdlite` to pull updates on demand, or enable auto-update for the marketplace in
`/plugin`.

**Other agents.** The skill follows the open [Agent Skills](https://agentskills.io) format, which Codex, Gemini
CLI, GitHub Copilot, Cursor, and others read. Install it with the [`skills`](https://github.com/vercel-labs/skills)
CLI, which detects installed agents and places the skill in each one's skills directory:

```bash
npx skills add mikeruhl/frenetik.mdlite --skill mdlite-decision
```

Run the same command again to update. To install manually, copy the `skills/mdlite-decision` folder into your
agent's skills directory.

## Build from source

### Prerequisites

- [Node.js](https://nodejs.org) 20+
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

```text
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

| Theme                     | Author                                    | Source                                                                     |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| GitHub Light              | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Dark               | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Dark Dimmed        | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Dark HC            | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Auto               | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Light (Colorblind) | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| GitHub Dark (Colorblind)  | [Sindre Sorhus](https://sindresorhus.com) | [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) |
| Splendor                  | [John Otander](https://johnotander.com)   | [markdowncss/splendor](https://github.com/markdowncss/splendor)            |
| Retro                     | [John Otander](https://johnotander.com)   | [markdowncss/retro](https://github.com/markdowncss/retro)                  |
| Air                       | [John Otander](https://johnotander.com)   | [markdowncss/air](https://github.com/markdowncss/air)                      |
| Modest                    | [John Otander](https://johnotander.com)   | [markdowncss/modest](https://github.com/markdowncss/modest)                |

All themes are MIT licensed.

## Contributing

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a pull request

## License

MIT
