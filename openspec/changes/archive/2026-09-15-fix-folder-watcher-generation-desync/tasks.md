## 1. Add the folder-session generation counter

- [x] 1.1 In `src-tauri/src/scan.rs`, add `pub(crate) static FOLDER_GEN: AtomicU64` next to
      `SCAN_GENERATION`, with a doc comment stating it gates only folder/file _target_ identity (bumped by
      `switch_to_folder`, `switch_file`, and startup watcher wiring) and is distinct from `SCAN_GENERATION`
      (which gates scan-thread staleness); verify the crate still compiles (`cargo build`).
- [x] 1.2 Add a matching doc comment to the existing `SCAN_GENERATION` clarifying it must not be used to
      gate watcher liveness, so the distinction is documented at both definitions.

## 2. Re-point folder/file switch and startup wiring at FOLDER_GEN

- [x] 2.1 In `src-tauri/src/lib.rs::switch_to_folder`, bump `FOLDER_GEN` (in addition to the existing
      `SCAN_GENERATION` bump) and pass the resulting `FOLDER_GEN` value as `folder_gen` to
      `start_folder_watcher`, instead of the `SCAN_GENERATION`-derived value.
- [x] 2.2 In `src-tauri/src/lib.rs::switch_file`, bump `FOLDER_GEN` alongside the existing
      `SCAN_GENERATION` bump (switching to a single file must also invalidate any live folder watcher).
- [x] 2.3 In `src-tauri/src/lib.rs::run()`'s startup folder-watcher wiring, read `FOLDER_GEN` (not
      `SCAN_GENERATION`) as the initial `folder_gen` passed to `start_folder_watcher`.
- [x] 2.4 Verify with `cargo build` that all `start_folder_watcher` call sites compile against the new
      `folder_gen` source.

## 3. Re-point the watcher guard at FOLDER_GEN

- [x] 3.1 In `src-tauri/src/watcher.rs::start_folder_watcher`, change the per-batch guard from
      `SCAN_GENERATION.load(Ordering::Relaxed) != folder_gen` to `FOLDER_GEN.load(Ordering::Relaxed) !=
folder_gen`, updating the import from `crate::scan::SCAN_GENERATION` to `crate::scan::FOLDER_GEN`.
      Verify `cargo build` succeeds.
- [x] 3.2 Confirm (read-through, no code change expected) that `run_progressive_scan`'s own generation
      checks in `src-tauri/src/scan.rs` still reference `SCAN_GENERATION` only, so scan cancellation/staleness
      behavior is unchanged.

## 4. Regression tests

- [x] 4.1 Add a unit test in `src-tauri/src/watcher.rs`'s `#[cfg(test)] mod tests` asserting that bumping
      `SCAN_GENERATION` (simulating a scan start/rescan) does not trip the watcher's staleness guard for a
      `folder_gen` captured before the bump - i.e. the watcher is NOT gated by `SCAN_GENERATION` bumps. Verify
      with `cargo test`.
      Scope note: the watcher's guard was extracted into a small pure predicate,
      `folder_watcher_is_stale(folder_gen)`, and tested directly against the real `FOLDER_GEN`/
      `SCAN_GENERATION` statics rather than spinning up a full `start_folder_watcher` thread with a live
      `tauri::AppHandle` - this crate has no `tauri::test` mock-app harness today, and building one is out of
      scope for this fix. The predicate is exactly the condition the watcher thread evaluates per batch, so
      this still pins the real regression.
- [x] 4.2 Add a unit test asserting the inverse: bumping `FOLDER_GEN` past the watcher's captured value
      causes `folder_watcher_is_stale` to return true (watcher correctly treats a real folder switch as stale).
      Verify with `cargo test`.
- [x] 4.3 Run the full existing test suite (`cargo test`) and confirm all prior watcher/scan tests
      (including the #87 delete-expansion and directory-named-`.md` tests) still pass unmodified. Result: 50/50
      passed.

## 5. Manual verification

- [x] 5.1 Run the app (`pnpm tauri dev` or equivalent), open a folder, let the initial scan finish, then
      create a new `.md` file (and a new `.md` file inside a brand-new subfolder) via Explorer/another editor;
      confirm both appear in the nav tree live without a manual rescan.
- [x] 5.2 With the same folder still open, trigger a manual rescan (refresh action), let it finish, then
      create another new `.md` file; confirm it still appears live (this is the scenario that was broken).
- [x] 5.3 With the same folder still open, delete a `.md` file and delete a folder containing tracked `.md`
      files; confirm both removals still reflect live in the nav tree (no regression on the #87 fix).
- [x] 5.4 Switch to a different folder, then back to the first folder; confirm live add/delete detection
      still works in both folders after switching (validates the `FOLDER_GEN` bump on `switch_to_folder`
      correctly invalidates the old watcher without breaking the new one).

## 6. Cleanup and CI

- [x] 6.1 Run `cargo clippy -- -D warnings` and fix any new warnings introduced by this change. Result:
      zero warnings.
- [ ] 6.2 Confirm CI (`ci.yml`, `security.yml`, CodeQL) passes on the PR.
