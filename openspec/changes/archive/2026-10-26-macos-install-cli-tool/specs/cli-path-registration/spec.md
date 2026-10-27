## ADDED Requirements

### Requirement: macOS menu items install and remove the command line link

On macOS the system SHALL provide **File → Install Command Line Tool** and **File → Uninstall Command Line Tool**
menu items. Install SHALL create the symlink `/usr/local/bin/mdlite` pointing at the running app bundle executable
(`<bundle>.app/Contents/MacOS/mdlite`), creating `/usr/local/bin` if it does not exist, after obtaining
administrator authorization through the native macOS password prompt. Uninstall SHALL remove `/usr/local/bin/mdlite`
only when it is a symlink pointing into an mdlite app bundle. These items SHALL NOT appear on Windows or Linux.

#### Scenario: Install succeeds

- **WHEN** a macOS user selects **File → Install Command Line Tool** and authorizes the password prompt
- **THEN** `/usr/local/bin/mdlite` is a symlink to the app bundle executable and the user sees a success
  notification

#### Scenario: Install repoints an existing link

- **WHEN** `/usr/local/bin/mdlite` already exists and the user selects **File → Install Command Line Tool**
- **THEN** the link is replaced so it points at the running app bundle executable

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

#### Scenario: Uninstall when not installed

- **WHEN** nothing exists at `/usr/local/bin/mdlite`
- **THEN** the user is told the command line tool is not installed and nothing changes

#### Scenario: Failure is reported

- **WHEN** the elevated command fails for any reason other than user cancellation
- **THEN** the user sees an error containing the failure message

## MODIFIED Requirements

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
