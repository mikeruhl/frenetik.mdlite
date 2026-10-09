---
name: mdlite-decision
description: Present a major, context-heavy decision to the user as a rendered markdown document in mdlite and collect structured answers. Use when a choice needs comparison tables, diagrams, code samples, or several options with tradeoffs. Do not use for quick yes/no or single-line questions.
---

# mdlite decision

mdlite shows a markdown document beside a questions panel and returns the answers as JSON when the user submits.

**Use only** when the decision needs tables, diagrams, code, or more options than your built-in question tool
allows. Otherwise explain in chat and ask with the built-in tool; it is cheaper.

## Steps

1. Pick a folder: `<scratch>/mdlite/<slug>/` under the session scratch directory, else the OS temp directory.
2. In **one** background shell call (Claude Code: Bash with `run_in_background: true`), write both files with
   quoted heredocs and launch mdlite. Call `mdlite` from `PATH`; if it is missing, tell the user to install it.

   ```bash
   d="<dir>"; mkdir -p "$d"; rm -f "$d/answers.json"
   cat > "$d/decision.md" <<'EOF'
   ...summary and recommendation, then one section per option...
   EOF
   cat > "$d/questions.json" <<'EOF'
   {...}
   EOF
   mdlite "$d/decision.md" --interactive "$d/questions.json" --output "$d/answers.json"
   ```

   - `decision.md`: lead with a short summary and your recommendation. Put `<a id="some-id"></a>` on its own
     line before each section a question refers to.
   - `questions.json`: see the schema below. Each `anchor` must match an id in `decision.md`.

3. Tell the user the document is open, then wait for the process to exit.
4. Read the result. Exit code 1: use stdout (`answers.json` may be stale). Otherwise read `answers.json`, falling
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

- `type`: `single`, `multi`, or `text` (no `options`). `default`: a value, an array of values (`multi`), or a string.
- `id`, option `value`, `anchor`: `^[A-Za-z0-9_-]{1,64}$`, unique. 1-50 questions, 1-50 options each.
- Unknown fields are rejected. Full sample: `examples/` next to this file.

## Result

`{"version":1,"status":"submitted","document":"...","answers":{"cache":{"value":"redis"},"notes":{"text":"..."}}}`

Answers: `single` → `value` or `other`; `multi` → `values` plus optional `other`; `text` → `text`. Unanswered
optional questions are omitted; never assume them.

| status      | exit | Action                                     |
| ----------- | ---- | ------------------------------------------ |
| `submitted` | 0    | Restate the answers, then proceed.         |
| `cancelled` | 2    | Do not proceed. Ask how to continue.       |
| `error`     | 1    | Read `error`, fix the files, and relaunch. |

A missing result with a non-zero exit means `cancelled`. For follow-ups, use a new folder.
