# cli-path-registration Specification

## Purpose

Define how the mdlite executable is made available on the user PATH so agents and shells can launch it by name.
Windows registers `PATH` in the installer. macOS cannot, because the binary lives inside a drag-installed app bundle,
so the app offers menu items that create and remove a `/usr/local/bin/mdlite` symlink through the native admin prompt
(`osascript`), keeping elevation out of the installer and out of README copy-paste commands.

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

The README SHALL direct macOS users to **File → Install Command Line Tool** for making `mdlite` resolvable from
`PATH`, and SHALL document the command that makes it resolvable on Linux (AppImage moved or symlinked into
`~/.local/bin`). The README SHALL note that already-open terminals and agent sessions must be restarted to see PATH
changes.

#### Scenario: macOS user follows README

- **WHEN** a macOS user runs **File → Install Command Line Tool** as the README directs and opens a new terminal
- **THEN** `mdlite --help` resolves to the binary inside `mdlite.app`

#### Scenario: Linux user follows README

- **WHEN** a Linux user runs the documented symlink command and opens a new terminal
- **THEN** `mdlite --help` resolves to the AppImage

### Requirement: macOS menu items install and remove the command line link

On macOS the system SHALL provide **File → Install Command Line Tool** and **File → Uninstall Command Line Tool**
menu items. Install SHALL create the symlink `/usr/local/bin/mdlite` pointing at the running app bundle executable
(`<bundle>.app/Contents/MacOS/mdlite`), creating `/usr/local/bin` if it does not exist, after obtaining
administrator authorization through the native macOS password prompt. Install SHALL replace an existing symlink at
that path without following it, and SHALL refuse when a directory is there. Uninstall SHALL remove
`/usr/local/bin/mdlite` only when it is a symlink pointing into an mdlite app bundle, and SHALL check this again after
authorization. These items SHALL NOT appear on Windows or Linux.

#### Scenario: Install succeeds

- **WHEN** a macOS user selects **File → Install Command Line Tool** and authorizes the password prompt
- **THEN** `/usr/local/bin/mdlite` is a symlink to the app bundle executable and the user sees a success
  notification

#### Scenario: Install repoints an existing link

- **WHEN** `/usr/local/bin/mdlite` already exists and the user selects **File → Install Command Line Tool**
- **THEN** the link is replaced so it points at the running app bundle executable

#### Scenario: Install does not write through a directory

- **WHEN** `/usr/local/bin/mdlite` is a directory, or a symlink to a directory, and the user installs
- **THEN** nothing is written inside that directory; a symlink is replaced with the new link, and a real directory is
  left unchanged with an error shown to the user

#### Scenario: Install refused for a non-bundle executable

- **WHEN** the running executable is not inside an `.app/Contents/MacOS/` directory
- **THEN** no link is created and the user sees an error explaining that the command line tool can only be
  installed from the installed app

#### Scenario: User cancels the password prompt

- **WHEN** the user dismisses the macOS administrator password prompt
- **THEN** no link is created or changed and no error is shown

#### Scenario: Uninstall removes the link

- **WHEN** `/usr/local/bin/mdlite` is a symlink into an mdlite app bundle and the user selects
  **File → Uninstall Command Line Tool** and authorizes the prompt
- **THEN** the symlink is removed and the user sees a success notification

#### Scenario: Uninstall leaves foreign files alone

- **WHEN** `/usr/local/bin/mdlite` is a regular file, or a symlink that does not point into an mdlite app bundle
- **THEN** nothing is removed and the user sees an error stating the file was not installed by mdlite

#### Scenario: Link changes while the password prompt is open

- **WHEN** `/usr/local/bin/mdlite` is replaced or repointed after the user selects **Uninstall Command Line Tool** and
  before they authorize
- **THEN** nothing is removed and the user sees an error stating the file changed and was left unchanged

#### Scenario: Uninstall when not installed

- **WHEN** nothing exists at `/usr/local/bin/mdlite`
- **THEN** the user is told the command line tool is not installed and nothing changes

#### Scenario: Failure is reported

- **WHEN** the elevated command fails for any reason other than user cancellation
- **THEN** the user sees an error containing the failure message
