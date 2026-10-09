# cli-path-registration Specification

## Purpose

Define how the mdlite executable is made available on the user PATH so agents and shells can launch it by name.

## Requirements

### Requirement: Windows installer registers mdlite on the user PATH

The Windows NSIS installer SHALL append the install directory to the per-user `Path` environment variable when it
is not already present, and SHALL notify running processes of the environment change. The uninstaller SHALL
remove exactly that entry and leave all other entries unchanged. The installer SHALL NOT modify the system
`Path`.

#### Scenario: Fresh install

- **WHEN** mdlite is installed on Windows and a new terminal is opened
- **THEN** running `mdlite --help` resolves to the installed binary

#### Scenario: Reinstall does not duplicate

- **WHEN** mdlite is installed over an existing installation
- **THEN** the install directory appears exactly once in the user `Path`

#### Scenario: Uninstall cleans up

- **WHEN** mdlite is uninstalled
- **THEN** the install directory is removed from the user `Path` and every other entry is preserved in order

### Requirement: PATH setup documented for macOS and Linux

The README SHALL document the command that makes `mdlite` resolvable from `PATH` on macOS (symlink from the app
bundle binary into `/usr/local/bin`) and Linux (AppImage moved or symlinked into `~/.local/bin`), and SHALL note
that already-open terminals and agent sessions must be restarted to see PATH changes.

#### Scenario: macOS user follows README

- **WHEN** a macOS user runs the documented symlink command and opens a new terminal
- **THEN** `mdlite --help` resolves to the binary inside `mdlite.app`
