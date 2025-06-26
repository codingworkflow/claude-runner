# Changelog

All notable changes to the Claude Runner extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-06-26

- Improved UX, added sub panels, now Usage & Logs are not in main panel
- Added new Command panel to manage new /commands Global or per Project
- New detachable panels
- New icon in the side bar

## [0.1.1] - 2025-06-21

- Multiple bug fixes & UX improvements
- Support for Usage Report, 5 hours intervals
- Support for Conversation logs
- Improved tests & integration tests

## [0.1.0] - 2025-05-26

### Added

- Initial release of Claude Runner extension
- Model selection dropdown supporting all current Claude models:
  - Claude Opus 4 (most capable, highest cost, only in MAX)
  - Claude Sonnet 4 (balanced performance and cost)
  - Claude Sonnet 3.7 (good performance, moderate cost)
  - Claude Haiku 3.5 (fastest, lowest cost)
- Interactive mode: Launch Claude in terminal
- Task mode: Execute specific prompts and view results in new editor
- Tool permission control with safety settings
- Root path configuration with browse dialog (multiple projects)
- VS Code settings integration
- Status notifications and error handling
- Loading states and progress indicators
