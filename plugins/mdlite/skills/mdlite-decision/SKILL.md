---
name: mdlite-decision
description: Present a major, context-heavy decision to the user as a rendered markdown document in mdlite and collect structured answers. Use when a choice needs comparison tables, diagrams, code samples, or several options with tradeoffs. Do not use for quick yes/no or single-line questions.
---

# mdlite decision

mdlite shows a markdown document beside a questions panel and returns the answers as JSON when the user submits.

**Use only** when the decision needs tables, diagrams, code, or more options than your built-in question tool
allows. Otherwise explain in chat and ask with the built-in tool; it is cheaper.

## Steps

1. Pick a folder: `<scratch>/mdlite/<slug>/`, where `<scratch>` is the session scratch directory, else the OS temp
   directory.
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
