# Links sample

Open `docs/links-sample/folder` as the folder under test. Each link is keyed to a row in
`openspec/changes/add-local-links/test-plan.md`.

## In-folder (section 1)

- [b](sub/b.md)
- [install](sub/b.md#install)
- [missing](sub/nope.md)
- [c](.github/c.md)

## Leaving the folder (section 2)

- [notes](../outside/notes.md)

## Non-markdown files (section 3)

- [diagram](diagram.png)
- [run](run.ps1)
- [report](report.docm)

## Web links (section 4)

- [good](https://evil.example/x)
- [plain http](http://example.com/page)
- [trusted candidate](https://example.com/page)
- [subdomain](https://api.example.com/v1)
- [mail](mailto:someone@example.com)

## Blocked and hostile (section 5)

- [msdt](ms-msdt:/id PCWDiagnostic)
- [vscode](vscode://file/C:/x)
- [js](javascript:alert(1))
- [network share](\\\\nonexistent.example\\share\\x.md)
