## ADDED Requirements

### Requirement: Skill states rendering restrictions

The skill SHALL tell agents that remote images are blocked until the reader allows their host, that `<style>`, form
controls, inline `style` attributes, and arbitrary classes are stripped, and that diagrams and images must therefore not
be the only carrier of essential information.

#### Scenario: Agent wants to show an image

- **WHEN** an agent considers embedding a remote image in a decision Document
- **THEN** the skill directs it to give the image meaningful alt text and to state essential information in text as well

#### Scenario: Agent wants custom styling

- **WHEN** an agent considers using `<style>` or a `style` attribute for emphasis
- **THEN** the skill directs it to use supported markdown constructs instead
