---
name: mdlite-decision
description: Present a major, context-heavy decision to the user as a rendered markdown document in mdlite and collect structured answers. Use when a choice needs comparison tables, diagrams, code samples, or several options with tradeoffs. Do not use for quick yes/no or single-line questions.
---

# mdlite decision

mdlite shows a markdown document beside a questions panel and returns the answers as JSON when the user submits.

**Use only** when the decision needs tables, diagrams, code, or more options than your built-in question tool
allows. Otherwise explain in chat and ask with the built-in tool; it is cheaper.

## Steps

1. Pick a folder `<dir>`: `<scratch>/mdlite/<slug>/`, where `<scratch>` is the session scratch directory, else the OS temp
   directory. Create the folder if your file-write tool does not create parent directories.
   Use one absolute path form for every tool call. On Windows, use a drive letter with forward slashes
   (`C:/Users/.../mdlite/<slug>`); file tools, Git Bash, and mdlite all accept it.
2. Write both files with your file-write tool, not the shell:
   - `decision.md`: lead with a short summary and your recommendation. Put `<a id="some-id"></a>` on its own
     line before each section a question refers to.
   - `questions.json`: see the schema below. Each `anchor` must match an id in `decision.md`.
3. Launch mdlite with a shell tool that runs a long-lived command in the background and notifies you when it
   exits (Claude Code: Bash with `run_in_background: true`):

   ```bash
   d="<dir>"; rm -f "$d/answers.json"
   mdlite "$d/decision.md" --interactive "$d/questions.json" --output "$d/answers.json"
   ```

   Call `mdlite` from `PATH` only. Do not check for it beforehand (`which`, `command -v`, `mdlite --help`) or
   search the filesystem; the launch itself reports a missing binary. If it is not found (exit 127), stop and
   tell the user:
   - mdlite is not on `PATH`. If it is installed, add it to `PATH` (setup per OS:
     <https://github.com/mikeruhl/frenetik.mdlite#command-line>), then restart the agent session, which does
     not see `PATH` changes made after it started. They can confirm with `mdlite --help`.
   - Otherwise install it from <https://github.com/mikeruhl/frenetik.mdlite/releases>.

4. Tell the user the document is open, then wait for the process to exit.
5. Read the result. Exit code 1: use stdout (`answers.json` may be stale). Otherwise read `answers.json`, falling
   back to stdout.

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

mdlite treats the document as untrusted:

- Remote images are blocked until the user allows their host; a placeholder shows the alt text instead. Write
  meaningful alt text for every image.
- `<style>`, `style` attributes, form controls (`<form>`, `<input>`, `<button>`, `<select>`, `<textarea>`), and
  custom classes are stripped. Use markdown emphasis, tables, alerts, and headings instead.
- Never make an image or diagram the only carrier of essential information. State the key facts in text too.
- Relative links to sibling markdown files open in a new mdlite window after the user confirms, so long supporting
  detail can live in a linked file.

## Questions schema

```json
{
  "version": 1,
  "title": "Choose a cache",
  "submitLabel": "Submit",
  "questions": [
    {
      "id": "cache",
      "type": "single",
      "prompt": "Which cache?",
      "description": "Optional markdown.",
      "required": true,
      "allowOther": true,
      "default": "redis",
      "anchor": "options",
      "options": [{ "value": "redis", "label": "Redis", "description": "Optional markdown." }]
    },
    { "id": "notes", "type": "text", "prompt": "Anything else?", "multiline": true, "placeholder": "Optional" }
  ]
}
```

- `type`: `single` or `multi` (1-50 `options`), or `text` (no `options`).
- `default`: `single` takes one declared option `value`; `multi` takes an array of declared option `value`s; `text`
  takes any string. Unknown values are rejected.
- `id`, option `value`, `anchor`: `^[A-Za-z0-9_-]{1,64}$`. Question `id`s are unique; option `value`s are unique
  within a question; questions may share an `anchor`. 1-50 questions.
- `questions.json` must not exceed 256 KB. Unknown fields are rejected. Full sample: `examples/` next to this file.

## Result

`{"version":1,"status":"submitted","document":"...","answers":{"cache":{"value":"redis"},"notes":{"text":"..."}}}`

Answers: `single` → `value` or `other`; `multi` → `values` plus optional `other`; `text` → `text`. Unanswered
optional questions are omitted; never assume them.

| status      | exit | Action                                     |
| ----------- | ---- | ------------------------------------------ |
| `submitted` | 0    | Restate the answers, then proceed.         |
| `cancelled` | 2    | Do not proceed. Ask how to continue.       |
| `error`     | 1    | Read `error`, fix the files, and relaunch. |

A missing or empty result with any other non-zero exit means `cancelled`. For follow-ups, use a new folder.
