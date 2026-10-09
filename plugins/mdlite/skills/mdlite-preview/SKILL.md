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
