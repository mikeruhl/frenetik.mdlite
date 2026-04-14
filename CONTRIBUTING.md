# Contributing to mdlite

Thank you for your interest in contributing to mdlite.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/mdlite.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Install dependencies: `pnpm install`
5. Make your changes
6. Test your changes: `pnpm tauri dev -- -- path/to/test.md`
7. Commit and push
8. Open a pull request

## Development Environment

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [pnpm](https://pnpm.io)
- [Rust](https://rustup.rs) stable
- Platform-specific dependencies:
  - **Linux:** `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
  - **Windows:** Visual Studio Build Tools with C++ workload
  - **macOS:** Xcode Command Line Tools

### Running the dev server

```bash
pnpm tauri dev -- -- path/to/file.md
```

### Running tests

```bash
cd src-tauri
cargo test
```

### Building

```bash
pnpm tauri build
```

## Code Standards

### Rust (Backend)

- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Run `cargo fmt` before committing
- Ensure `cargo clippy` passes with no warnings
- Add tests for new functionality

### JavaScript (Frontend)

- Use ES6+ modern syntax
- Keep functions small and focused
- Add comments for complex logic only
- Run `pnpm lint` and fix any issues
- Run `pnpm format` before committing
- Test changes manually in the dev server

### Formatting

Before committing, ensure all code is properly formatted:

```bash
# Format Rust code
cd src-tauri && cargo fmt

# Lint JavaScript
pnpm lint

# Lint Markdown
pnpm lint:md

# Format all files (JS, JSON, YAML, Markdown)
pnpm format
```

The project uses:

- **EditorConfig** for consistent indentation across editors
- **cargo fmt** for Rust formatting
- **ESLint** for JavaScript linting
- **markdownlint** for Markdown consistency
- **Prettier** for JS/JSON/YAML/MD formatting

### Commits

- Use clear, descriptive commit messages
- Reference issue numbers when applicable: `Fix #123: Description`
- Keep commits focused on a single change

## Pull Request Process

1. Update README.md if you add features or change functionality
2. Ensure all CI checks pass (build, test, security, CodeQL)
3. Request review from maintainers
4. Address review feedback promptly
5. Squash commits if requested

### PR Checklist

- [ ] Code builds without errors
- [ ] Tests pass locally
- [ ] `cargo fmt` applied to Rust code
- [ ] No new clippy warnings
- [ ] `pnpm lint` passes (ESLint)
- [ ] `pnpm lint:md` passes (markdownlint)
- [ ] `pnpm format` applied to all files
- [ ] Functionality tested manually
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated (if applicable)

## Reporting Bugs

Use the [Bug Report](../../issues/new?template=bug_report.yml) template. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, mdlite version)
- Relevant logs or screenshots

## Requesting Features

Use the [Feature Request](../../issues/new?template=feature_request.yml) template. Describe:

- The problem you're trying to solve
- Your proposed solution
- Alternative solutions considered
- Additional context

## Questions

For usage questions or general discussion, [open a discussion](../../discussions/new).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
