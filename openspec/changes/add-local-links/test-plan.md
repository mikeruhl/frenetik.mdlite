# Manual test plan: add-local-links

Fixture: a folder `links-fixture/` with `docs/a.md`, `docs/sub/b.md` (has an `## Install` heading),
`docs/diagram.png`, `docs/run.ps1`, `docs/report.docm`, and `a.md` containing the links below. A second file
`outside/notes.md` lives next to `links-fixture/`.

## 1. In-folder navigation (open `links-fixture/` as a folder)

| #   | Step                                    | Expected                                                    |
| --- | --------------------------------------- | ----------------------------------------------------------- |
| 1.1 | Click `[b](sub/b.md)`.                  | `b.md` shows, no dialog, sidebar highlights it.             |
| 1.2 | Press Alt+Left.                         | Back to `a.md` at its previous scroll position.             |
| 1.3 | Click `[install](sub/b.md#install)`.    | `b.md` scrolled to Install.                                 |
| 1.4 | Click `[missing](sub/nope.md)`.         | "File not found:" notice with the resolved path.            |
| 1.5 | Show Hidden Files off; click `[c](.github/c.md)`; touch another file to trigger a rescan. | `c.md` shows, nothing highlighted, stays shown after rescan. |
| 1.6 | Collapse `sub/` in the sidebar; click `[b](sub/b.md)`. | `sub/` expands; `b.md` row visible and highlighted. |

## 2. Leaving the folder

| #   | Step                                         | Expected                                                         |
| --- | -------------------------------------------- | ---------------------------------------------------------------- |
| 2.1 | Click `[notes](../../outside/notes.md)`.     | Dialog shows the absolute path; Cancel has focus.                |
| 2.2 | Press Escape.                                | Dialog closes, nothing opens.                                    |
| 2.3 | Repeat 2.1, choose Open.                     | New mdlite window shows `notes.md`; original window unchanged.   |
| 2.4 | Open `a.md` alone (single-file), click 1.1's link. | Dialog appears; Open launches a new instance.              |

## 3. Non-markdown files

| #   | Step                              | Expected                                              |
| --- | --------------------------------- | ----------------------------------------------------- |
| 3.1 | Click `diagram.png`, Open.        | Opens in the default image viewer.                    |
| 3.2 | Click `run.ps1`, Show in Folder.  | Explorer opens with `run.ps1` selected; nothing runs. |
| 3.3 | Click `report.docm`.              | Dialog offers Show in Folder only.                    |
| 3.4 | View > Safe File Types > Remove .png, repeat 3.1. | Revealed instead of opened.           |
| 3.5 | Add File Type… `EXE`.             | Rejected with a notice; list unchanged.               |
| 3.6 | Reset to Defaults.                | `png` back in the list.                               |

## 4. Web links

| #   | Step                                                   | Expected                                                     |
| --- | ------------------------------------------------------ | ------------------------------------------------------------ |
| 4.1 | Click `[good](https://evil.example/x)`.                | Dialog shows `https://evil.example/x`, host bold.            |
| 4.2 | Click an `http://` link.                               | Dialog notes the link is not encrypted.                      |
| 4.3 | Check "Always trust https://example.com", Open; click again. | Second click opens with no dialog.                     |
| 4.4 | Click a link to `https://api.example.com`.             | Dialog shown.                                                |
| 4.5 | Click a link to `http://example.com`.                  | Dialog shown with the not-encrypted warning.                 |
| 4.6 | View > Trusted Domains > Remove https://example.com; repeat 4.3. | Dialog shown again.                                |
| 4.7 | Click a `mailto:` link.                                | Mail client opens, no dialog.                                |

## 5. Blocked and hostile links

| #   | Step                                         | Expected                                     |
| --- | -------------------------------------------- | -------------------------------------------- |
| 5.1 | Click `[x](ms-msdt:/id PCWDiagnostic)`.      | "Link type not supported" notice; no launch. |
| 5.2 | Click `[x](vscode://file/C:/x)`.             | Same notice.                                 |
| 5.3 | Create a junction in the folder to `outside/`, click a link through it. | Dialog shown (treated as outside). |
| 5.4 | Click `[n](\nonexistent.example\share\x.md)`; watch Process Monitor or `netstat` for SMB (445). | "Open network location?" dialog; no SMB connection before Open; Cancel leaves none. |
| 5.5 | Repeat 5.4 and choose Open. | Window stays responsive; "Could not open link" notice after timeout. |
| 5.6 | Right-click a link > "Open link in new window"; drag a link onto the window. | Nothing opens; app page stays loaded. |
| 5.7 | Double-click an outside link quickly. | One dialog; at most one new window. |

## 6. Themes and print

| #   | Step                                  | Expected                                       |
| --- | ------------------------------------- | ---------------------------------------------- |
| 6.1 | Open each dialog in all 11 themes.    | Legible; matches About dialog styling.         |
| 6.2 | Print with a dialog open.             | Dialog absent from output.                     |
