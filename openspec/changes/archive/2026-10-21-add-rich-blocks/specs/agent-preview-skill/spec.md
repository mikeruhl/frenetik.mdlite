## ADDED Requirements

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
