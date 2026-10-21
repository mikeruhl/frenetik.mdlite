## Context

Each theme supplies its own content width: GitHub themes cap `.markdown-body` at 980px via `GITHUB_WRAP_CSS`; Retro,
Air, and Modest cap `#content` at 48rem via `contentCss` (`src/themes.js`). Splendor sets no cap. Settings persist in
`settings.json` through `tauri-plugin-store` with per-key accessors in `config.rs`, mirrored in `AppState`, and toggled
from `CheckMenuItem`s in `menu.rs` that emit events to the frontend.

## Decisions

- **Body class override.** Full Width toggles a `full-width` class on `body`. A rule in `src/styles.css` sets
  `max-width: none` on `.markdown-body` and `#content` under that class. Theme CSS is untouched, so every theme
  (including future ones) inherits the behavior.
- **Minimum gutter.** Air, Retro, and Modest have 0 to 0.25rem of side padding, which puts text against the window
  edge once the width cap is gone. Non-GitHub themes get `padding-inline: 2rem` under Full Width; GitHub themes keep
  their 45px.
- **Same pattern as Show Frontmatter.** Store key `full_width` (default `false`), `AppState.full_width`, menu ID
  `toggle-full-width` in the View menu after Show Outline, event `set-full-width` carrying a boolean. The frontend
  reads `full_width` from the store at startup and applies the class before first render to avoid a layout jump.
- **Screen only.** Print CSS already forces full printable width, so no print changes are needed.

## Risks

- Very long lines on ultra-wide windows reduce readability. Accepted: the reader opts in.
