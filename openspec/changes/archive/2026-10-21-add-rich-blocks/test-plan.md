# Manual test plan: add-rich-blocks

Fixture: open `docs/rich-blocks-sample.md` in a build of this branch.

## 1. Panels, Status Lozenges, Expands

| #   | Step                                     | Expected                                                                                                           |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1.1 | View the Panels section.                 | Five tinted Panels: info (blue), success (green), note (purple), warning (orange), error (red), each with an icon. |
| 1.2 | View the Status Lozenges.                | Six uppercase pills, one per tone.                                                                                 |
| 1.3 | Add `<mark data-status="evil">X</mark>`. | Plain highlighted text, no tone.                                                                                   |
| 1.4 | Click **Methodology**.                   | The Expand opens; collapsed by default.                                                                            |
| 1.5 | Repeat 1.1 to 1.4 in all 11 themes.      | Legible in every theme, including Retro (dark page) and Splendor (icon left of the title).                         |
| 1.6 | Print or export PDF.                     | Panel and Lozenge colors are kept.                                                                                 |

## 2. Charts

| #   | Step                                                                | Expected                                                                         |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 2.1 | View the Charts section.                                            | A bar chart and a line chart render; hovering shows no errors.                   |
| 2.2 | Switch between a light and a dark theme.                            | Axis labels and titles follow the theme foreground.                              |
| 2.3 | Change one chart to `"data": {"url": "https://example.com/d.csv"}`. | "Chart error: Charts support inline data only..." and no request leaves the app. |
| 2.4 | Break the JSON of one chart.                                        | "Chart error: invalid JSON..."; the rest of the Document renders.                |
| 2.5 | Open a Document with no `vega-lite` block; check devtools Network.  | No `vega` chunk is loaded.                                                       |

## 3. Live Blocks

| #   | Step                                                                                              | Expected                                                             |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 3.1 | Open the sample for the first time.                                                               | The Live Block shows its source and a **Run** button; nothing runs.  |
| 3.2 | Click **Run**.                                                                                    | A force-directed graph draws; the button becomes **Stop**.           |
| 3.3 | Switch theme.                                                                                     | Graph links follow the new foreground color.                         |
| 3.4 | Click **Stop**.                                                                                   | The frame is removed and the source returns.                         |
| 3.5 | Click **Run**, restart mdlite, reopen the sample.                                                 | The block runs without asking.                                       |
| 3.6 | Edit any text in the sample and save.                                                             | The block reverts to source and **Run**.                             |
| 3.7 | Run the block, then print and export PDF.                                                         | Output shows a static image of the graph, not the toolbar or source. |
| 3.8 | Print with the block not run.                                                                     | Output shows the source code.                                        |
| 3.9 | Run `e2e/live-isolation/run.mjs` against a CDP build with `e2e/live-isolation/isolation.md` open. | "All isolation checks passed".                                       |

## 4. Agent skills

| #   | Step                                                                         | Expected                                                                                         |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 4.1 | With the updated plugin, ask an agent for a decision with numeric tradeoffs. | It uses a TIP Panel for the recommendation, Lozenges for option states, and a `vega-lite` Chart. |
| 4.2 | Run `mdlite --version`.                                                      | Prints `mdlite <version>` and exits 0.                                                           |

## 5. Regression

| #   | Area                                                            | Expected                                                          |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| 5.1 | Mermaid render, **Open** viewer, theme re-render.               | Unchanged from main.                                              |
| 5.2 | Live reload, interactive mode, question anchors.                | Unchanged.                                                        |
| 5.3 | KaTeX, footnotes, emoji, task lists.                            | Unchanged.                                                        |
| 5.4 | Print and PDF immediately after opening a Chart-heavy Document. | Every Chart is present (render-completion promise covers Charts). |
