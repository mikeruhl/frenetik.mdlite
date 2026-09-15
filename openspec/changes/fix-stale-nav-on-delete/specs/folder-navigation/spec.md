## ADDED Requirements

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
