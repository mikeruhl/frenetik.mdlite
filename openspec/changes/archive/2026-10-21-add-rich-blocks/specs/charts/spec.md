## ADDED Requirements

### Requirement: Vega-Lite fenced blocks render as Charts

The system SHALL render a fenced code block with language `vega-lite` containing a valid Vega-Lite JSON specification as
an interactive Chart.

#### Scenario: Bar chart

- **WHEN** a Document contains a `vega-lite` block with inline `data.values` and a bar mark
- **THEN** a bar chart is displayed in place of the code block

#### Scenario: Invalid spec

- **WHEN** a `vega-lite` block contains invalid JSON or an invalid specification
- **THEN** an error message is displayed in place of the Chart and the rest of the Document renders normally

### Requirement: Charts make no network requests and run no author code

The system SHALL NOT fetch any resource referenced by a Chart specification and SHALL evaluate Chart expressions without
compiling them to executable code.

#### Scenario: Remote data URL

- **WHEN** a `vega-lite` block specifies `"data": {"url": "https://example.com/d.csv"}`
- **THEN** no request is made and an error message is displayed in place of the Chart

#### Scenario: Link encoding

- **WHEN** a specification encodes an `href` channel
- **THEN** chart marks are not clickable links

### Requirement: Chart engine loads only when needed

The system SHALL load the Chart engine only when the current Document contains a Chart, and SHALL display Document text
before Charts finish rendering.

#### Scenario: No chart

- **WHEN** a Document without `vega-lite` blocks is opened
- **THEN** the Chart engine is not loaded

### Requirement: Charts follow the theme

The system SHALL render Charts using the active theme's colors and fonts and re-render them when the theme changes.

#### Scenario: Theme switch

- **WHEN** the reader switches from a light theme to a dark theme
- **THEN** every Chart re-renders with the dark theme's foreground and background colors
