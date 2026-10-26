## Context

The macOS `.dmg` installs `mdlite.app`. The executable is `mdlite.app/Contents/MacOS/mdlite`, which is not on `PATH`.
Agents run `mdlite` by name. The README asks users to run `sudo ln -sf ... /usr/local/bin/mdlite`. The earlier
`add-agent-ask-mode` design deferred an in-app installer. This change delivers it, matching VS Code's
"Install 'code' command in PATH".

Existing patterns this change reuses:

- Menu items are built in `src-tauri/src/menu.rs` with `MenuItemBuilder::with_id`, platform items gated by `#[cfg]`
  (see the Windows-only `export-pdf`).
- Menu clicks are handled in the `on_menu_event` chain in `src-tauri/src/lib.rs`.
- Results reach the user by emitting a Tauri event that `src/main.js` turns into `showToast` (success) or
  `window.alert` (failure), as with `file-path-copied` and `file-path-copy-error`.

## Goals / Non-Goals

**Goals:**

- One click creates `/usr/local/bin/mdlite` pointing at the running app bundle binary, with an admin prompt.
- One click removes it.
- Clear success and failure feedback.
- Pure decision logic (what the link should point at, whether an existing link is ours) is unit-testable off macOS.

**Non-Goals:**

- Windows and Linux installers (covered elsewhere).
- Auto-install on first launch.
- User-scope install locations.

## Decisions

### Elevation via `osascript` `do shell script ... with administrator privileges`

The command runs `/bin/mkdir -p /usr/local/bin && /bin/ln -sf <target> /usr/local/bin/mdlite` through
`osascript -e 'do shell script "..." with administrator privileges'`. This shows the standard macOS password dialog,
needs no new crate, and is what VS Code's installer does.

Alternatives:

- `SMJobBless` privileged helper: requires code signing of a helper and an installer flow. Disproportionate.
- Writing to `~/.local/bin`: no elevation, but macOS does not put that directory on `PATH` by default, so agents
  would still fail.
- Ship a separate `.pkg`: replaces the `.dmg` distribution model.

Shell arguments are single-quoted and the target path is escaped before embedding in the AppleScript string, since
the bundle path may contain spaces or quotes.

### Link target is the running executable, not a hardcoded `/Applications` path

The target is `std::env::current_exe()` canonicalized. This works when the user keeps the app outside
`/Applications`. If the executable is not inside a `.app/Contents/MacOS/` directory (a dev build, for example), the
install fails with an explanatory error instead of linking a transient `target/` binary.

### Uninstall only removes a link that points into an mdlite bundle

Uninstall reads the link with `read_link`. It removes the path only when it is a symlink whose target ends in
`mdlite.app/Contents/MacOS/mdlite`. A regular file or a link to something else is reported as an error and left
untouched. If nothing exists at the path, the result is reported as "not installed", not an error.

### Two explicit items rather than one toggling item

**Install Command Line Tool** and **Uninstall Command Line Tool** are separate fixed-label items in the File menu,
macOS only, above Quit. Menus are rebuilt on state changes (`rebuild_menu`), but a toggling label would need a
filesystem check on every rebuild and would hide the uninstall action. Fixed labels are predictable and simpler.

### Feedback through the existing event pattern

Rust emits `cli-tool-installed`, `cli-tool-uninstalled`, or `cli-tool-error` with a message payload. `src/main.js`
shows `showToast` for success and `window.alert` for error. A user cancelling the password prompt (osascript exit
code with "User canceled", error -128) emits no event.

### Module layout

A new macOS-gated module `src-tauri/src/cli_install.rs` owns this feature:

- Pure functions: `is_bundle_executable(path)`, `link_is_ours(target)`, `build_install_script(target)`,
  `escape_applescript(s)`. Compiled on all platforms and unit-tested.
- macOS-only functions: `install(app)` and `uninstall(app)` that run `osascript` and emit events.

`menu.rs` and `lib.rs` only add the menu ids and dispatch.

## Risks / Trade-offs

- [`/usr/local/bin` missing on Apple Silicon] → `mkdir -p` runs in the same elevated command.
- [A different `mdlite` already occupies the path] → install uses `ln -sf` and replaces it, matching the documented
  manual command. Uninstall refuses to remove links that are not ours.
- [App moved after install leaves a dangling link] → rerunning **Install Command Line Tool** repoints it.
- [Command injection through the bundle path] → target is canonicalized and escaped for both shell and AppleScript
  layers, covered by unit tests with spaces and quotes.
- [Cannot be exercised on the Windows dev machine] → decision logic is tested everywhere. The `osascript` path needs
  a manual check on macOS before release.
