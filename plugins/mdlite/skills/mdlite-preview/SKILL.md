---
name: mdlite-preview
description: Open markdown files you create for the user to read (reports, plans, reviews, summaries, notes) in the mdlite previewer, right after writing them, instead of only printing the path. Do not use for edits to existing repository docs or source files, or for decisions that need answers (use mdlite-decision).
---

# mdlite preview

mdlite renders markdown in its own window and live-reloads when the file changes. Opening a file you generated
saves the user a step.

## When to open

Open a new `.md` file that you, or a skill you ran, wrote for the user to read: a report, plan, review, summary,
notes, or scratch output.

Do not open:

- Edits to existing repository files the project maintains (`README.md`, `CHANGELOG.md`, docs, specs).
- Files the user said they will edit themselves, or non-markdown files.
- A file or folder already opened this session. Live reload shows later edits, and new files in an open folder
  appear in its tree.

Skip auto-opening entirely when the user's instructions (for example `CLAUDE.md`) say not to, or when an earlier
launch this session failed with not found.

## Several files at once

mdlite opens a folder with a file tree, so one window can hold every file:

- **Temporary files** (reports, reviews, scratch output): write them all into one new folder,
  `<scratch>/mdlite/<slug>/`, where `<scratch>` is the session scratch directory, else the OS temp directory.
  Create the folder if your file-write tool does not create parent directories. Open that folder once.
- **Files that must live elsewhere** (for example plans inside the repository): open their shared folder if they
  have one; otherwise open only the main file.
- Link related files to each other with relative links; mdlite opens them directly in folder view.

## Rich Document authoring

mdlite renders more than CommonMark. Prefer these constructs to prose or ASCII art when they fit. They work in
every mdlite version:

| Construct | Use for                                          | Syntax                                                                     |
| --------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Diagram   | Flows, sequences, states, architecture           | A fenced `mermaid` block                                                   |
| Math      | Formulas                                         | `$E = mc^2$` inline; `$$` on its own line before and after a block formula |
| Footnote  | Sources and asides that would interrupt the text | `claim[^1]` in the text, `[^1]: source` at the end                         |
| Task list | Checklists and next steps                        | `- [ ] todo` and `- [x] done`; rendered read-only                          |
| Emoji     | Sparing status signals, such as in table cells   | GitHub shortcodes such as `:warning:`                                      |

These constructs need mdlite 0.4.0 or later. Run `mdlite --version` once per session; when it fails or prints an
older version, write tables and plain alerts instead.

| Construct      | Use for                                                                                             | Syntax                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Panel          | Recommendations (`[!TIP]`), risks (`[!WARNING]`, `[!CAUTION]`), context (`[!NOTE]`, `[!IMPORTANT]`) | `> [!TIP]` on its own line, then `> text`                                                        |
| Status Lozenge | State of an option or item                                                                          | `<mark data-status="success">CHOSEN</mark>`; tones: neutral, info, success, warning, error, note |
| Expand         | Detail a reader may skip                                                                            | `<details><summary>Benchmarks</summary>`, a blank line, the body, `</details>`                   |
| Chart          | Quantitative comparisons and trends                                                                 | A fenced `vega-lite` block with inline `data.values`                                             |

```vega-lite
{
  "data": { "values": [{ "option": "Redis", "p99": 2 }, { "option": "Postgres", "p99": 9 }] },
  "mark": "bar",
  "encoding": {
    "x": { "field": "option", "type": "nominal" },
    "y": { "field": "p99", "type": "quantitative", "title": "p99 latency (ms)" }
  }
}
```

Draw bar, line, scatter, area, and heatmap visuals as Charts. Reach for an `html-live` Live Block (HTML with
`<script>`, `d3` available as a global) only for visuals Vega-Lite cannot express, such as a force-directed graph. The
reader must click Run before a Live Block executes, so state its findings in text too.

## Rendering restrictions

mdlite treats the file as untrusted:

- Remote images are blocked until the user allows their host; a placeholder shows the alt text instead. Write
  meaningful alt text for every image.
- `<style>`, `style` attributes, form controls (`<form>`, `<input>`, `<button>`, `<select>`, `<textarea>`), and
  custom classes are stripped. Use markdown emphasis, tables, alerts, and headings instead.
- Never make an image or diagram the only carrier of essential information. State the key facts in text too.

## How to open

Launch in the background and do not wait for it (Claude Code: Bash with `run_in_background: true`):

```bash
mdlite "<absolute path to file or folder>"
```

- Do not check for mdlite beforehand (`which`, `command -v`, `mdlite --help`); the launch reports a missing
  binary.
- On Windows, use a drive letter with forward slashes (`C:/Users/...`).
- Still give the path in your reply, and say it is open in mdlite.
- After you update a file that is already open, tell the user to review the changes in the open window. mdlite
  reloads on its own; never ask them to refresh or reopen.
- The process exits when the user closes the window. Ignore that notification unless the exit code is 127.
- Exit 127: tell the user once that mdlite is not on `PATH` (setup:
  <https://github.com/mikeruhl/frenetik.mdlite#command-line>, install:
  <https://github.com/mikeruhl/frenetik.mdlite/releases>), then stop auto-opening for the rest of the session.
