# agent-preview-skill Specification

## Purpose

Define the plugin-shipped agent skill that opens agent-written markdown in mdlite so the user can review it, including
grouping several temporary files into one folder view.

## Requirements

### Requirement: Preview skill ships in the plugin

The repository SHALL contain an Agent Skills format skill at `plugins/mdlite/skills/mdlite-preview/SKILL.md` with
valid frontmatter (`name`, `description`), shipped in the same `mdlite` Claude Code plugin and `skills` CLI
package as `mdlite-decision`.

#### Scenario: Installed with the plugin

- **WHEN** the user installs the `mdlite` plugin from the marketplace
- **THEN** both `mdlite-decision` and `mdlite-preview` are available to the agent

### Requirement: Skill opens markdown written for the user

The skill SHALL instruct the agent to open in mdlite each new markdown file it writes for the user to read
(reports, plans, reviews, summaries, notes, scratch output), launched in the background without waiting, while
still giving the path in its reply. It SHALL NOT open edits to existing repository files the project maintains,
files the user edits themselves, non-markdown files, or a file or folder already opened in the session.

#### Scenario: Report written

- **WHEN** the agent writes a new review report for the user
- **THEN** it launches `mdlite "<path>"` in the background and tells the user the path and that it is open

#### Scenario: Repository doc edited

- **WHEN** the agent edits `README.md` or `CHANGELOG.md`
- **THEN** it does not open the file

#### Scenario: File updated after opening

- **WHEN** the agent rewrites a file it already opened this session
- **THEN** it does not launch mdlite again, because live reload shows the change, and it tells the user to review
  the changes in the open window rather than to refresh or reopen it

### Requirement: Several temporary files open as one folder

When the agent writes several temporary markdown files at once, the skill SHALL instruct it to write them into
one new folder `<scratch>/mdlite/<slug>/` (the session scratch directory, else the OS temp directory) and open
that folder once. Files that must live elsewhere SHALL be opened through their shared folder when they have one,
otherwise only the main file is opened.

#### Scenario: Multiple reports

- **WHEN** the agent produces three temporary review files
- **THEN** they are written under one `<scratch>/mdlite/<slug>/` folder and mdlite is launched once on that folder

### Requirement: Gating and failure handling

The skill SHALL skip auto-opening when the user's agent instructions (for example `CLAUDE.md`) say not to. It
SHALL NOT check for mdlite before launching. On the first launch that fails with command not found (exit 127),
the agent SHALL tell the user once how to install mdlite and put it on `PATH`, and stop auto-opening for the rest
of the session. Window-close exit notifications SHALL otherwise be ignored.

#### Scenario: User opted out

- **WHEN** `CLAUDE.md` says not to auto-open markdown in mdlite
- **THEN** the agent only gives the path

#### Scenario: mdlite missing

- **WHEN** the first launch exits with 127
- **THEN** the agent reports the setup and install links once and does not attempt further launches that session

### Requirement: Skill states rendering restrictions

The skill SHALL tell agents that remote images are blocked until the reader allows their host and that `<style>`, form
controls, inline `style` attributes, and arbitrary classes are stripped.

#### Scenario: Agent writes a report with a remote image

- **WHEN** an agent embeds a remote image in a report Document
- **THEN** the skill has directed it to provide meaningful alt text so the placeholder is informative

### Requirement: Skill teaches rich Document authoring

The skill SHALL include the same authoring section as the decision skill, covering Panels, Status Lozenges, Expands, and
Charts with one minimal example each and guidance on when to use each.

#### Scenario: Report with metrics

- **WHEN** an agent writes a report Document containing a metric trend over time
- **THEN** the skill directs it to present the trend as a `vega-lite` line Chart with inline data

#### Scenario: Sections stay identical

- **WHEN** the authoring section in either skill is changed
- **THEN** an automated check fails until both skills contain identical authoring sections

### Requirement: Skill prefers Charts over Live Blocks

The skill SHALL direct agents to use Charts for data visualization and a Live Block only when a Chart cannot express the
visualization.

#### Scenario: Custom network diagram

- **WHEN** an agent needs a force-directed graph that Vega-Lite cannot express
- **THEN** the skill permits a Live Block using `d3` and tells the agent the reader must click Run

### Requirement: Skill handles older mdlite versions

The skill SHALL state the minimum mdlite version for rich constructs and direct agents to fall back to tables and plain
alerts on older versions.

#### Scenario: Older mdlite installed

- **WHEN** the installed mdlite version is below the stated minimum
- **THEN** the agent writes the report without `vega-lite` blocks or Status Lozenges

### Requirement: Skill recommends relative links between related files

The preview skill SHALL tell agents that when they write several related markdown files into one folder, they SHOULD
link them with relative links, because mdlite opens those links directly in folder view.

#### Scenario: Multi-file guidance

- **WHEN** an agent reads the skill's guidance for several files
- **THEN** it finds a line recommending relative links between files in the same folder
