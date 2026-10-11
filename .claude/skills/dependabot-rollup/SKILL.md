---
name: dependabot-rollup
description: Use when rolling up multiple open dependabot PRs into a single chore PR. Triggered by phrases like "roll up dependabot", "combine dependabot PRs", "merge all dependabot updates", or "dependabot rollup".
---

# Dependabot Rollup

Combine all open dependabot PRs into one chore branch, verify build/lint/test pass, open a consolidated PR, then close the originals.

Repo: `mikeruhl/frenetik.mdlite` — single Tauri app, no sub-packages. Two lockfiles can conflict: `pnpm-lock.yaml` (root) and `src-tauri/Cargo.lock`.

## Ecosystems (see `.github/dependabot.yml`)

- `npm` (root `/`) — grouped as `npm-dependencies`, but older individual PRs may still exist
- `cargo` (`/src-tauri`) — grouped as `rust-dependencies`
- `github-actions` (`/`) — grouped as `actions`

## Steps

### 1. Gather Open Dependabot PRs

```bash
gh pr list --repo mikeruhl/frenetik.mdlite --author app/dependabot --state open \
  --json number,title,headRefName,body
```

Save the list. If none found, tell user and stop.

### 2. Create Rollup Branch

```bash
git checkout main && git pull
git checkout -b chore/dependabot-rollup-$(date +%Y-%m-%d)
```

### 3. Merge Each Dependabot Branch

Work through them one at a time; lockfile conflicts are expected.

```bash
git fetch origin
git merge origin/<headRefName> --no-edit
```

**`pnpm-lock.yaml` conflict** (root):

```bash
rm pnpm-lock.yaml
pnpm install
git add pnpm-lock.yaml
git merge --continue
```

**`src-tauri/Cargo.lock` conflict**:

```bash
cd src-tauri
git checkout --ours Cargo.lock   # or theirs — then regenerate
cargo update --workspace
cd ..
git add src-tauri/Cargo.lock
git merge --continue
```

If `cargo update --workspace` pulls in more than the merged PR intended, prefer resolving the conflict markers by hand against both PR diffs instead.

### 4. Lint, Build, Test

Run the same checks CI runs (`.github/workflows/ci.yml`), skipping the full platform `tauri build` (slow, not needed to validate dependency bumps):

```bash
# Rust formatting
cd src-tauri && cargo fmt --check && cd ..

# JS lint/format
pnpm install
pnpm lint
pnpm lint:md
pnpm format:check

# JS tests
pnpm test

# Rust build + tests
cd src-tauri
cargo build
cargo test
cd ..

# Frontend build sanity check
pnpm build
```

**Stop and report if anything fails.** Do not open the PR until all pass. If a rust-dependencies bump needs `cargo clippy` clean too (CONTRIBUTING.md asks for it), run `cd src-tauri && cargo clippy` and fix/report warnings introduced by the bump.

### 5. Push Branch and Open PR

```bash
git push -u origin HEAD
```

```bash
gh pr create --repo mikeruhl/frenetik.mdlite \
  --title "build(deps): dependabot rollup $(date +%Y-%m-%d)" \
  --body "$(cat <<'EOF'
## Dependabot Rollup

Combines the following dependabot PRs:

<!-- list goes here -->

Lint, build, and tests pass locally (see CI for full matrix).
EOF
)"
```

Capture the new PR URL from the output.

### 6. Close Dependabot PRs

For each original dependabot PR, comment with the new PR URL, then close:

```bash
gh pr comment <number> --repo mikeruhl/frenetik.mdlite --body "Closed in favor of consolidated PR: <new-pr-url>"
gh pr close <number> --repo mikeruhl/frenetik.mdlite
```

## Quick Reference

| Step | Command |
|------|---------|
| List dependabot PRs | `gh pr list --repo mikeruhl/frenetik.mdlite --author app/dependabot --state open` |
| Create branch | `git checkout -b chore/dependabot-rollup-YYYY-MM-DD` |
| Merge branch | `git merge origin/<branch> --no-edit` |
| Fix pnpm lockfile conflict | `rm pnpm-lock.yaml && pnpm install` |
| Fix Cargo.lock conflict | `cd src-tauri && cargo update --workspace` |
| Rust fmt check | `cd src-tauri && cargo fmt --check` |
| Rust build/test | `cd src-tauri && cargo build && cargo test` |
| JS lint | `pnpm lint && pnpm lint:md && pnpm format:check` |
| JS test | `pnpm test` |
| Frontend build | `pnpm build` |
| Close PR with comment | `gh pr comment <n> --body "..."` then `gh pr close <n>` |

## Common Mistakes

- **Forgetting `--no-edit`** on merge → drops you into editor
- **Opening PR before checks pass** → don't; fix failures first
- **Closing PRs before new PR exists** → always get the new PR URL first
- **Running full `pnpm tauri build`** → unnecessarily slow for a dependency-only validation; `cargo build` + `pnpm build` is enough
- **Resolving `Cargo.lock` conflicts by hand** → regenerate with `cargo update --workspace` instead
