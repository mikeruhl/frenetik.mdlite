## Why

On macOS the mdlite binary lives inside the app bundle, so `mdlite` is not on `PATH` after installing the `.dmg`.
Agents (see `skills/mdlite-decision`) call `mdlite` by name, so a missing link breaks them. The README currently asks
users to run `sudo ln -sf ...` by hand. Issue #97.

## What Changes

- Add macOS-only menu items **Install Command Line Tool** and **Uninstall Command Line Tool** that create and remove
  the `/usr/local/bin/mdlite` symlink, using the native macOS admin password prompt.
- Report success or failure to the user with the existing frontend notification pattern (toast on success,
  `window.alert` on error).
- Replace the macOS row of the README command line table with a pointer to the menu item.
- Update the `cli-path-registration` requirement so macOS is documented as the menu item rather than a manual command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-path-registration`: the macOS PATH setup requirement changes from "README documents a symlink command" to
  "the app provides a menu item that installs and removes the symlink, and the README points to it".

## Impact

- `src-tauri/src/menu.rs`: two macOS-gated menu items.
- `src-tauri/src/lib.rs`: menu event handling for the new ids.
- New Rust module for symlink install/uninstall logic (macOS-gated, unit-testable path and decision logic).
- `src/main.js`: listeners for the result events.
- `README.md`: macOS row of the command line table.
- No new dependencies. Elevation uses `osascript` (ships with macOS).
- Windows and Linux builds are unaffected.
- All 11 bundled themes: no new themed UI. Feedback reuses the existing toast and native alert.

## Non-goals

- Linux or Windows equivalents. Windows already registers `PATH` in the NSIS installer. Linux stays documented.
- Installing to a user-writable directory such as `~/.local/bin` (would require shell profile edits).
- Automatically installing the link on first launch or on update.
- A shell-script wrapper in place of the symlink.
- Removing links that were not created by mdlite.
