## ADDED Requirements

### Requirement: Skill recommends relative links between related files

The preview skill SHALL tell agents that when they write several related markdown files into one folder, they SHOULD
link them with relative links, because mdlite opens those links directly in folder view.

#### Scenario: Multi-file guidance

- **WHEN** an agent reads the skill's guidance for several files
- **THEN** it finds a line recommending relative links between files in the same folder
