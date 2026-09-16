## ADDED Requirements

### Requirement: Live nav tree updates survive scan and rescan cycles

While folder mode is open, live detection of file/folder creation and deletion in the navigation tree
(as covered by the folder-navigation capability's creation and deletion requirements) SHALL remain active
for the full duration of the folder session. It MUST NOT stop working after the folder's initial scan
completes, and MUST NOT stop working after the user triggers a manual rescan of the same folder.

#### Scenario: File created after the initial folder scan has finished

- **WHEN** a folder is opened, its initial scan completes and populates the navigation tree, and only then a
  new `.md` file is created inside that folder
- **THEN** the file still appears in the navigation tree without requiring the user to manually rescan or
  reopen the folder

#### Scenario: File created after a manual rescan of the same folder

- **WHEN** the user triggers a manual rescan of the currently open folder (e.g. via the rescan/refresh
  action), the rescan completes, and afterward a new `.md` file is created inside that folder
- **THEN** the file still appears in the navigation tree live, without requiring another manual rescan

#### Scenario: File deleted after the initial folder scan has finished

- **WHEN** a folder is opened, its initial scan completes, and only then a `.md` file shown in the
  navigation tree is deleted
- **THEN** the file's entry is still removed from the navigation tree live, without requiring a manual
  rescan

#### Scenario: Live updates keep working after switching folders

- **WHEN** the user switches from one open folder to another and back
- **THEN** live creation and deletion detection continues to work correctly in both folders after each
  switch
