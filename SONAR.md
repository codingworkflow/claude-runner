# SonarQube Configuration

This document explains how to set up and use SonarQube analysis for the Claude Runner VSCode extension.

## Configuration

### 1. Environment Setup

Copy the example configuration file:

```bash
cp .sonar.example .sonar
```

Edit `.sonar` and replace with your actual values:

```bash
SONAR_HOST_URL=https://your-sonarqube-server.com
SONAR_TOKEN=your-sonar-token-here
```

### 2. Project Properties

The project includes a `sonar-project.properties` file with the following key settings:

- **Project Key**: `claude-runner`
- **Project Version**: Dynamically read from `VERSION` file during analysis
- **Sources**: `src/` directory
- **Tests**: `tests/` directory
- **Coverage Reports**: LCOV format from Jest
- **Exclusions**: Build artifacts, dependencies, and declaration files

## Running Analysis

### Quick Analysis

```bash
make sonar
```

This command will:

1. Run unit tests with coverage
2. Generate LCOV coverage report
3. Read current version from `VERSION` file
4. Upload code and coverage data to SonarQube with current version

### Manual Steps

```bash
# Run tests with coverage
make test-coverage

# Run SonarQube analysis
make sonar
```

## Coverage Requirements

- **Current Coverage**: ~51.8%
- **Target Coverage**: 70%+ (branches, functions, lines, statements)
- **Coverage Format**: LCOV (stored in `coverage/lcov.info`)

## Version Management

The SonarQube project version is automatically synchronized with the project version:

- **Source**: `VERSION` file (single source of truth)
- **Sync**: Automatically read during `make sonar`
- **Update**: Use version bump scripts to update all files

```bash
# Bump version and run SonarQube analysis
make version-patch  # Updates VERSION and package.json
make sonar         # Uses updated version automatically
```

## SonarQube Features Used

- **Code Quality**: Static analysis for TypeScript/JavaScript
- **Security**: Security hotspot detection
- **Coverage**: Unit test coverage tracking
- **Maintainability**: Code smell detection
- **Reliability**: Bug detection

## Troubleshooting

### Deprecated Login Warning

✅ **Fixed**: Updated to use `sonar.token` instead of deprecated `sonar.login`

### Missing Blame Information

✅ **Fixed**: Added proper git SCM configuration in `sonar-project.properties`
✅ **Fixed**: Committed all modified files to enable git blame tracking

**Issue**: SonarQube shows warnings like "Missing blame information for the following files"

**Cause**: Files are modified but not committed to git, so SonarQube can't track authorship

**Solution**:

```bash
# Check git status
git status

# Commit pending changes
git add .
git commit -m "Fix SonarQube blame information"

# Re-run analysis
make sonar
```

### Zero Coverage

✅ **Fixed**: Configured Jest to generate LCOV reports and proper SonarQube coverage paths

### Common Issues

1. **No coverage data found**

   ```bash
   # Re-run tests with coverage
   npm run test:unit:coverage
   ```

2. **SonarQube connection issues**

   - Verify `.sonar` file has correct URL and token
   - Check network connectivity to SonarQube server

3. **Git blame information missing**
   - Ensure you're in a git repository
   - Run `git status` to verify git is working
   - Commit any pending changes before running analysis

## Files Structure

```
├── .sonar                    # SonarQube credentials (gitignored)
├── .sonar.example           # Template for .sonar file
├── sonar-project.properties # SonarQube project configuration
├── coverage/
│   ├── lcov.info           # Coverage data for SonarQube
│   └── lcov-report/        # HTML coverage report
└── jest.config.js          # Jest configuration with coverage
```

## Security Notes

- The `.sonar` file is gitignored to prevent committing credentials
- Use SonarQube tokens, not passwords
- Tokens should have "Execute Analysis" permission minimum

## Recent Improvements

### Code Quality Enhancements

- ✅ **Eliminated 100% code duplication** between command panels
- ✅ **Added NOSONAR annotations** for false positive security warnings
- ✅ **Improved test organization** with proper structure in `tests/` directory
- ✅ **Enhanced error handling** with shared utility functions

### SonarQube Integration

- ✅ **Dynamic versioning** from `VERSION` file
- ✅ **Proper coverage reporting** with 51.8% current coverage
- ✅ **Git blame tracking** for all source files
- ✅ **Comprehensive exclusions** for build artifacts and dependencies
