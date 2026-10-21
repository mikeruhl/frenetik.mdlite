# mdlite

A desktop previewer that renders markdown Documents, including diagrams, charts, and Atlassian-style formatting, safely
and offline.

## Content

**Document**: A markdown file opened in mdlite. Always treated as untrusted, regardless of who wrote it. _Avoid_: Page,
note, file (when meaning the rendered content)

**Raw HTML**: HTML written inline in a Document, rendered only after unsafe tags and attributes are removed. _Avoid_:
Embedded HTML, custom HTML

**Image Allow-list**: The reader-maintained set of remote hostnames permitted to supply images to any Document. Empty by
default. _Avoid_: Whitelist, trusted domains, safe hosts

## Rendered constructs

**Rich Block**: A fenced code block whose language selects a built-in declarative renderer. It never runs code written
by the Document's author. A Mermaid diagram is a Rich Block. _Avoid_: Widget, embed, plugin block

**Chart**: A Rich Block that draws a data visualization from a declarative specification. _Avoid_: Graph, plot,
visualization (as the construct name)

**Live Block**: A fenced code block containing author-written script, run only in isolation from mdlite and only after
the reader consents. _Avoid_: Script block, interactive block, sandbox

**Panel**: A colored callout box conveying a tone: info, note, success, warning, or error. _Avoid_: Admonition, callout
box, banner

**Status Lozenge**: A short inline colored label conveying state, such as DONE or BLOCKED. _Avoid_: Badge, tag, chip,
pill
