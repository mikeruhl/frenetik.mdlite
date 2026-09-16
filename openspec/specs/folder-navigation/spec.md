# folder-navigation Specification

## Requirements

### Requirement: Navigation tree reflects file deletions

While folder mode is open, the system SHALL remove a markdown file's entry from the left navigation tree when
that file is deleted from disk, without requiring the user to manually refresh or re-open the folder.

#### Scenario: Single markdown file deleted externally

- **WHEN** a `.md` file currently shown in the navigation tree is deleted (e.g. via Explorer, another app, or a
  script) while the folder is open in folder mode
- **THEN** the file's entry is removed from the navigation tree within the normal watcher debounce window, and
  its parent folder entry is also removed if it becomes empty of files and subfolders

### Requirement: Navigation tree reflects folder deletions

While folder mode is open, the system SHALL remove a deleted directory and all markdown files previously shown
beneath it from the navigation tree, even when the underlying filesystem watcher reports only a single event
for the directory itself and no separate events for its contents.

#### Scenario: Folder containing markdown files deleted externally

- **WHEN** a folder that contains one or more `.md` files tracked in the navigation tree is deleted as a whole
  (its own remove event fires, but no remove events fire for the individual files it contained)
- **THEN** the folder's own tree node and every markdown file entry previously shown under it are removed from
  the navigation tree, and this removal happens without a full folder rescan

#### Scenario: Folder deleted while a file inside it is open

- **WHEN** the currently open file lives inside a folder that gets deleted
- **THEN** the navigation tree removes the folder and its contents, and the main content view clears (matching
  existing single-file-deleted-while-open behavior)

#### Scenario: Unrelated non-markdown path deleted

- **WHEN** a file or folder with no tracked markdown descendants is deleted (e.g. an image file, or an empty
  folder never shown in the tree)
- **THEN** the navigation tree is unaffected, and no spurious change entries are emitted

### Requirement: Navigation tree reflects file and folder creation

While folder mode is open, the system SHALL add new markdown files (and any newly needed ancestor folder
nodes) to the navigation tree when they appear on disk, in their correct sorted position.

#### Scenario: New markdown file created externally

- **WHEN** a new `.md` file is created inside the watched folder (directly or nested in a new subfolder)
- **THEN** the file appears in the navigation tree under the correct (newly created if needed) folder chain,
  sorted alphabetically among its siblings

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
