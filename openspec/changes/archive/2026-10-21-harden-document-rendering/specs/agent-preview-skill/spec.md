## ADDED Requirements

### Requirement: Skill states rendering restrictions

The skill SHALL tell agents that remote images are blocked until the reader allows their host and that `<style>`, form
controls, inline `style` attributes, and arbitrary classes are stripped.

#### Scenario: Agent writes a report with a remote image

- **WHEN** an agent embeds a remote image in a report Document
- **THEN** the skill has directed it to provide meaningful alt text so the placeholder is informative
