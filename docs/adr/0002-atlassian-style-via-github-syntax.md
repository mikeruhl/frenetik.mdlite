# Atlassian-style rendering uses GitHub-compatible syntax, not Atlaskit

The goal was Atlaskit-quality formatting (panels, status lozenges, expands). Atlaskit is React-based and mdlite's
frontend is vanilla JavaScript with a 50 KB-per-addition budget, and Documents must degrade readably on GitHub. Panels
therefore reuse GitHub alert syntax (`> [!NOTE]` and its four siblings, mapped to the info, success, note, warning, and
error tones), Status Lozenges are `<mark data-status="...">`, and expands are `<details>`, all styled to resemble
Atlaskit. Atlaskit and React are not dependencies, and Atlassian Document Format rendering is deferred.
