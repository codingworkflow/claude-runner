# CLAUDE.md

This file provides guidance to Claude Code when working with the Claude Runner VSCode extension.

## Important Instructions

- Do NOT use icons, emojis, or visual decorations in documentation or code
- Keep responses concise and professional
- Avoid duplicate information - reference other docs instead
- Follow existing code style and patterns
- Don't create new reports after changes unless asked
- Don't add comments in code
- NEVER name file \_fixed , improvment. Only clear normal naming.
- Never create .backup or similar as we use git.

## Quick Reference

### Build Commands

```bash
make setup    # Install dependencies
make dev      # Development mode
make build    # Build extension
make test     # Run tests
make lint     # Code quality
```

For complete build documentation, see `docs/BUILD.md`.

### Testing

```bash
make test-ci-without-claude    # Test without Claude CLI
make test-ci-with-claude       # Test with Claude CLI
```

For complete testing documentation, see `docs/TESTING.md`.

## Project Structure

```
src/
├── extension.ts              # Main extension entry
├── providers/               # VSCode providers
├── services/               # Core business logic
├── components/             # React UI components
└── test/                   # Unit tests

tests/                      # Integration/E2E tests
docker/                     # Docker test setup
docs/                       # Documentation
```

## Key Services

- `ClaudeCodeService` - Claude CLI integration
- `ClaudeVersionService` - Version detection
- `ConfigurationService` - Settings management
- `TerminalService` - Terminal integration

## Development Notes

- Extension uses React webview for UI
- State management via ClaudeRunnerPanel.\_uiState
- All CLI commands are executed via ClaudeCodeService
- Shell detection supports zsh, bash, fish, sh

## Security

- Input sanitization before command execution
- No sensitive data in plain text
- Secrets scanning via pre-commit hooks
- Command injection prevention

## Architecture

Extension communicates with Claude CLI through subprocess execution. UI state flows unidirectionally from React webview to extension host and back.
