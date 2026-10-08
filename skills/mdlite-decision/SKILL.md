---
name: mdlite-decision
description: Present a major, context-heavy decision to the user as a rendered markdown document in mdlite and collect structured answers. Use when a choice needs comparison tables, diagrams, code samples, or several options with tradeoffs. Do not use for quick yes/no or single-line questions.
---

# mdlite decision

mdlite opens a markdown document beside a questions panel. The user reads, answers, and clicks Submit. mdlite
exits and returns the answers as JSON.

## When to use

- Use for decisions with substantial context: multiple options with tradeoffs, comparison tables, mermaid
  diagrams, code samples, or anything longer than a few lines.
- Do not use for short questions. Ask in chat or with the AskUserQuestion tool instead.

## Steps

1. **Create a working folder** under the session scratch directory (the scratchpad path provided in your system
   prompt): `<scratch>/mdlite/<slug>/`, where `<slug>` is a short kebab-case name for the decision. Use the OS
   temp directory only when no scratch directory is provided. Write all three files there.
2. **Write `decision.md`**: the full context. Lead with a one-paragraph summary and your recommendation, then one
   section per option. Put `<a id="some-id"></a>` on its own line before each section a question refers to.
3. **Write `questions.json`** (schema below). Set a question's `anchor` to the id of the section it concerns.
   Only reference anchor ids you wrote into `decision.md`.
4. **Launch mdlite in the background** so tool timeouts do not apply (Bash tool with `run_in_background: true`):

   ```bash
   mdlite "<dir>/decision.md" --interactive "<dir>/questions.json" --output "<dir>/answers.json"
   ```

   Call `mdlite` by name from `PATH`. Do not search the filesystem for it. If the command is not found, stop and
   tell the user mdlite must be installed and on `PATH` (see the "Command line" section of the mdlite README).

5. **Tell the user** the decision document is open in mdlite and wait. You are notified when the process exits.
6. **Read `answers.json`**. If it is missing or empty, parse the captured stdout instead (one JSON line).

## Questions schema (version 1)

```json
{
  "version": 1,
  "title": "Choose a caching strategy",
  "submitLabel": "Submit",
  "questions": [
    {
      "id": "strategy",
      "type": "single",
      "prompt": "Which strategy should we use?",
      "description": "Optional **markdown**.",
      "required": true,
      "allowOther": true,
      "default": "redis",
      "anchor": "caching-options",
      "options": [
        { "value": "redis", "label": "Redis", "description": "Optional markdown." },
        { "value": "memory", "label": "In-process LRU" }
      ]
    },
    {
      "id": "risks",
      "type": "multi",
      "prompt": "Which risks matter?",
      "options": [{ "value": "latency", "label": "Latency" }]
    },
    { "id": "notes", "type": "text", "prompt": "Anything else?", "multiline": true, "placeholder": "Optional" }
  ]
}
```

Rules (mdlite rejects violations with `status: "error"`):

- `type` is `single` (radio), `multi` (checkboxes), or `text`.
- `id`, option `value`, and `anchor` match `^[A-Za-z0-9_-]{1,64}$`; ids and option values are unique.
- 1 to 50 questions; choice questions have 1 to 50 options; text questions have none.
- `default` is an option value (`single`), an array of option values (`multi`), or a string (`text`).
- Unknown fields are rejected. The file must be at most 256 KB.

## Result

One JSON object, written to `--output` and printed on stdout:

```json
{
  "version": 1,
  "status": "submitted",
  "document": "C:\\...\\decision.md",
  "answers": {
    "strategy": { "value": "redis" },
    "risks": { "values": ["latency"], "other": "cold start" },
    "notes": { "text": "Ship behind a flag." }
  }
}
```

- `single`: `{ "value": "..." }` or `{ "other": "..." }`. `multi`: `{ "values": [...] }` plus optional `"other"`.
  `text`: `{ "text": "..." }`. Unanswered optional questions are omitted.

| status      | exit code | Action                                                            |
| ----------- | --------- | ----------------------------------------------------------------- |
| `submitted` | 0         | Restate the chosen answers to the user, then proceed accordingly. |
| `cancelled` | 2         | Do not proceed with any option. Ask the user how to continue.     |
| `error`     | 1         | Read `error`, fix the files, and relaunch.                        |

- A missing or empty result with a non-zero exit code means `cancelled`.
- Act only on answers present in the payload. Never assume an omitted answer.
- For follow-up questions, write a new decision folder and launch mdlite again.
