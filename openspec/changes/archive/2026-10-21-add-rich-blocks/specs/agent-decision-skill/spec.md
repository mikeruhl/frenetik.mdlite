## ADDED Requirements

### Requirement: Skill teaches rich Document authoring

The skill SHALL include an authoring section that shows one minimal example each of a Panel, a Status Lozenge, an
Expand, and a Chart, and states when to use each: Panels for risks and recommendations, Status Lozenges for option or
item state, Expands for detail a reader may skip, Charts for quantitative comparisons that a table conveys poorly.

#### Scenario: Comparing options with numbers

- **WHEN** an agent writes a decision Document comparing options on cost or latency figures
- **THEN** the skill directs it to present the figures as a `vega-lite` Chart with inline data, in addition to or
  instead of a table

#### Scenario: Recommending an option

- **WHEN** an agent states its recommended option
- **THEN** the skill directs it to use a Panel and to mark option states with Status Lozenges

### Requirement: Skill prefers Charts over Live Blocks

The skill SHALL direct agents to use Charts for data visualization and to use a Live Block only when a Chart cannot
express the visualization, noting that the reader must consent before a Live Block runs.

#### Scenario: Ordinary bar chart

- **WHEN** an agent needs a bar, line, scatter, or area chart
- **THEN** the skill directs it to a `vega-lite` Chart, not a Live Block

### Requirement: Skill handles older mdlite versions

The skill SHALL state the minimum mdlite version that renders Charts, Panels styling, and Status Lozenges, and SHALL
direct agents to fall back to tables and plain alerts when the installed version is older.

#### Scenario: Older mdlite installed

- **WHEN** the installed mdlite version is below the stated minimum
- **THEN** the agent writes the Document without `vega-lite` blocks or Status Lozenges
