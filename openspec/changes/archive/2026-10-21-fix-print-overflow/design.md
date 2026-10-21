## Context

`github-markdown-css` styles `.markdown-body table` as `display: block; width: max-content; max-width: 100%; overflow:
auto`, which makes wide tables scroll boxes. Retro, Modest, and Splendor give `pre` `overflow-x: scroll`. The
`@media print` block in `src/styles.css` resets overflow on containers but not on tables or code blocks.

## Decisions

- **Override in the shared print block.** Rules in `src/styles.css` `@media print` use `!important` so they win over
  every theme's table and `pre` rules without editing theme CSS.
- **Wrap, do not scale.** Tables become `display: table` with `max-width: 100%` and cells get `overflow-wrap: anywhere`,
  so auto layout shrinks columns by wrapping. Font scaling would need JS measurement before print.
