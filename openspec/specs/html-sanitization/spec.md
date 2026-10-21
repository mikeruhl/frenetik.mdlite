# html-sanitization Specification

## Purpose

Defines which tags, attributes, and classes survive sanitization of Raw HTML and renderer output, so untrusted Documents
cannot restyle or impersonate mdlite.

## Requirements

### Requirement: Raw HTML cannot inject styles or form controls

The system SHALL remove `<style>`, `<form>`, `<input>`, `<button>`, `<select>`, `<textarea>`, and `<option>` elements
from Raw HTML, and SHALL remove all author `style` attributes outside KaTeX output. The only `<input>` kept is a
disabled checkbox, as emitted for task lists, reduced to its `type`, `disabled`, and `checked` attributes.

#### Scenario: Task list checkboxes kept

- **WHEN** a Document contains `- [x] done`
- **THEN** the rendered list item contains a disabled, checked checkbox with no other attributes

#### Scenario: Interactive input removed

- **WHEN** a Document contains `<input type="checkbox">` without `disabled`
- **THEN** the rendered output contains no `<input>` element

#### Scenario: Style element removed

- **WHEN** a Document contains `<style>body{display:none}</style>`
- **THEN** the rendered output contains no `<style>` element and the page layout is unaffected

#### Scenario: Fake form removed

- **WHEN** a Document contains `<form><input name="q"><button>Submit</button></form>`
- **THEN** the rendered output contains none of those elements

### Requirement: Class attribute restricted to renderer classes

The system SHALL keep only class names on a fixed allowlist of renderer classes and SHALL drop all other class names
from rendered output. Elements inside KaTeX output keep their classes, matching the existing KaTeX `style` exemption.
Restrictions apply only to Document rendering and SHALL NOT alter sanitization performed by renderers such as Mermaid.

#### Scenario: Mermaid diagrams keep their styling

- **WHEN** a Document contains a Mermaid block
- **THEN** the rendered SVG keeps Mermaid's classes and its nodes render with theme fills, not solid black

#### Scenario: Chrome class dropped

- **WHEN** a Document contains `<span class="question-badge">Q1</span>`
- **THEN** the rendered span has no `question-badge` class

#### Scenario: Renderer classes preserved

- **WHEN** a Document uses a GitHub alert, a highlighted code block, KaTeX math, a footnote, and a task list
- **THEN** the classes those renderers emit are present in the rendered output

### Requirement: Renderer controls survive sanitization

The system SHALL provide Mermaid "Open" and code-block copy controls even though `<button>` is forbidden in Raw HTML.

#### Scenario: Mermaid open control present

- **WHEN** a Document contains a Mermaid block
- **THEN** the rendered block shows its "Open" control and activating it opens the diagram viewer

### Requirement: Question anchor ids preserved

The system SHALL preserve `id` attributes on Raw HTML anchors.

#### Scenario: Anchor id kept

- **WHEN** a Document contains `<a id="q-scope"></a>`
- **THEN** the rendered anchor has `id="q-scope"`
