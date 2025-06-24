.PHONY: setup build build-vsix watch package clean test lint dev install-local install-devcontainer serve-vsix help validate dev-prepare dev-install uninstall-extension get-extension-id version-patch version-minor version-major sync-version sonar scan-secrets generate-icons prepare-marketplace

# Default target - show help
help:
	@echo "Claude Runner VS Code Extension - Build Commands"
	@echo "==============================================="
	@echo "  make setup         - Install dependencies"
	@echo "  make build         - Build extension (compile only)"
	@echo "  make build-vsix    - Build and package VSIX file"
	@echo "  make watch         - Watch for changes during development"
	@echo "  make dev           - Start development mode (alias for watch)"
	@echo "  make clean         - Remove build artifacts"
	@echo "  make test          - Run tests"
	@echo "  make test-main-window - Run main window load test only"
	@echo "  make test-unit     - Run unit tests only"
	@echo "  make test-e2e      - Run end-to-end tests only"
	@echo "  make test-integration - Run integration tests only"
	@echo "  make test-all-coverage - Run all tests with coverage"
	@echo "  make test-claude-detection - Run Claude CLI detection test"
	@echo "  make test-ci-without-claude - Run CI tests without Claude CLI"
	@echo "  make test-ci-with-claude - Run CI tests with Claude CLI"
	@echo "  make test-watch    - Run tests in watch mode"
	@echo "  make lint          - Run ESLint and fix issues"
	@echo "  make validate      - Run tests and linting"
	@echo "  make install-local - Build and install extension locally"
	@echo "  make install-devcontainer - Install in devcontainer environment"
	@echo "  make serve-vsix    - Serve VSIX file via HTTP for download"
	@echo "  make dev-prepare   - Step 1: Uninstall extension and build VSIX"
	@echo "  make dev-install   - Step 2: Install extension only (manual reload required)"
	@echo ""
	@echo "Version Management:"
	@echo "  make sync-version  - Sync version from VERSION file to package.json"
	@echo "  make version-patch - Bump patch version (0.2.3 → 0.2.4)"
	@echo "  make version-minor - Bump minor version (0.2.3 → 0.3.0)"
	@echo "  make version-major - Bump major version (0.2.3 → 1.0.0)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make sonar         - Run SonarQube analysis (requires .sonar config)"
	@echo "  make scan-secrets  - Scan for secrets in codebase"
	@echo ""
	@echo "Assets:"
	@echo "  make generate-icons    - Generate VSCode extension icons from logo"
	@echo "  make prepare-marketplace - Prepare assets and README for marketplace"

# Install dependencies
setup:
	@echo "📦 Installing dependencies..."
	@npm run sync-version
	@npm install
	@echo "🔧 Setting up git hooks..."
	@npx husky install || echo "⚠️  Husky install failed - hooks may not work"
	@echo "✅ Dependencies installed"

# Build the extension (compile only)
build:
	@echo "🔧 Compiling TypeScript..."
	@echo "Trying direct TypeScript compilation first..."
	@npx tsc --project tsconfig.json --outDir out || echo "Direct tsc failed, trying webpack..."
	@npm run compile || true
	@echo "✅ Extension compiled successfully"

# Build and package the VSIX file
build-vsix: clean build
	@echo "🔨 Building Claude Runner VS Code Extension..."
	@echo "============================================"
	@echo ""
	@echo "📦 Creating VSIX package..."
	@npm run package
	@echo "✅ VSIX package created successfully"
	@echo ""
	@echo "============================================"
	@echo "✅ Build completed successfully!"
	@echo ""
	@echo "📁 Build artifacts:"
	@echo "  Extension: dist/extension.js"
	@echo "  Webview: dist/webview.js"
	@echo "  VSIX Package: dist/claude-runner-$$(node -p "require('./package.json').version").vsix"
	@echo ""
	@echo "📊 File sizes:"
	@ls -lh dist/extension.js 2>/dev/null | awk '{print "  Extension: " $$5}' || echo "  Extension: Not found"
	@ls -lh dist/webview.js 2>/dev/null | awk '{print "  Webview: " $$5}' || echo "  Webview: Not found"
	@ls -lh dist/claude-runner-*.vsix 2>/dev/null | awk '{print "  VSIX Package: " $$5}' || echo "  VSIX Package: Not found"
	@echo ""
	@echo "📥 To install the extension locally, run:"
	@echo "   make install-local"

# Watch for changes
watch:
	@echo "👀 Watching for changes..."
	@npm run watch

# Development mode (alias for watch)
dev: setup watch

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf dist/
	@rm -rf out/
	@rm -f *.vsix
	@rm -rf .vscode-test/
	@rm -f *.log
	@rm -rf coverage/
	@rm -f *.tsbuildinfo
	@find . -name "*.js.map" -type f -delete 2>/dev/null || true
	@find . -name "*.tmp" -type f -delete 2>/dev/null || true
	@find . -name "*.temp" -type f -delete 2>/dev/null || true
	@find . -name ".DS_Store" -type f -delete 2>/dev/null || true
	@echo "✅ Clean complete"

# Run tests
test:
	@echo "Running tests..."
	@npm run test:unit

# Run main window load test only
test-main-window:
	@echo "🧪 Running main window load test..."
	@npm run test:main-window

# Run unit tests only
test-unit:
	@echo "🧪 Running unit tests..."
	@npm run test:unit

# Run end-to-end tests only
test-e2e:
	@echo "🧪 Running end-to-end tests..."
	@npm run test:e2e

# Run integration tests only
test-integration:
	@echo "🧪 Running integration tests..."
	@npm run test:integration

# Run all Jest tests with coverage
test-all-coverage:
	@echo "🧪 Running all tests with coverage..."
	@npm run test:all:coverage

# Run Claude CLI detection test
test-claude-detection:
	@echo "🔍 Running Claude CLI detection test..."
	@npm run test:claude-detection

# Run CI tests without Claude CLI
test-ci-without-claude:
	@echo "Running CI tests without Claude CLI..."
	@npm run test:ci:without-claude

# Run CI tests with Claude CLI
test-ci-with-claude:
	@echo "Running CI tests with Claude CLI..."
	@npm run test:ci:with-claude

# Install system dependencies for CI
setup-ci:
	@echo "Installing CI system dependencies..."
	@sudo apt-get update
	@sudo apt-get install -y xvfb make

# Setup test environment for CI
setup-test-env:
	@echo "Setting up test environment..."
	@export DISPLAY=:99; Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 & sleep 2

# Install Claude CLI for testing
install-claude-cli:
	@echo "Installing Claude CLI..."
	@npm install -g @anthropic-ai/claude-code

# Setup Claude CLI configuration for testing
setup-claude-config:
	@echo "Setting up Claude CLI configuration..."
	@mkdir -p ~/.claude
	@echo '{"api_key": "test-key-for-ci", "default_model": "claude-sonnet-4-20250514"}' > ~/.claude/config.json

# Run tests in watch mode
test-watch:
	@echo "🧪 Running tests in watch mode..."
	@npm run test:watch

# Run linting and fix issues
lint:
	@echo "🔍 Running ESLint with auto-fix..."
	@npm run lint -- --fix
	@echo "✅ Linting complete"

# Run all validation
validate: test lint
	@echo "✅ All validation checks passed"

# Create VSIX package (alias for build-vsix)
package: build-vsix

# Install VSIX locally
install-local: build-vsix
	@echo "📥 Installing extension locally..."
	@if [ -n "$$REMOTE_CONTAINERS" ] || [ -n "$$CODESPACES" ] || [ -f /.dockerenv ]; then \
		echo "🐳 Detected devcontainer/Docker environment"; \
		echo ""; \
		echo "⚠️  Cannot install extension directly in devcontainer"; \
		echo ""; \
		echo "To install this extension in your devcontainer:"; \
		echo "1. Use the Command Palette (Ctrl/Cmd+Shift+P)"; \
		echo "2. Run: 'Extensions: Install from VSIX...'"; \
		echo "3. Navigate to /workspaces/vsix/claude-runner/dist/"; \
		echo "4. Select: claude-runner-$$(node -p "require('./package.json').version").vsix"; \
		echo ""; \
		echo "Or run: make install-devcontainer"; \
	else \
		code --install-extension dist/claude-runner-$$(node -p "require('./package.json').version").vsix; \
		echo "✅ Extension installed successfully"; \
		echo ""; \
		echo "🔄 Please reload VS Code to activate the extension"; \
	fi

# Install extension in devcontainer environment
install-devcontainer: build-vsix
	@echo "🐳 Installing extension in devcontainer..."
	@echo ""
	@if [ -n "$$REMOTE_CONTAINERS" ] || [ -n "$$CODESPACES" ] || [ -f /.dockerenv ]; then \
		echo "📦 VSIX file created:"; \
		echo "   dist/claude-runner-$$(node -p "require('./package.json').version").vsix"; \
		echo ""; \
		echo "📋 Installation options:"; \
		echo ""; \
		echo "Option 1: Use VS Code Command Palette"; \
		echo "  1. Press Ctrl/Cmd+Shift+P"; \
		echo "  2. Type: Extensions: Install from VSIX..."; \
		echo "  3. Navigate to /workspaces/vsix/claude-runner/dist/"; \
		echo "  4. Select: claude-runner-$$(node -p "require('./package.json').version").vsix"; \
		echo ""; \
		echo "Option 2: Download via web server"; \
		echo "  Run: make serve-vsix"; \
		echo "  Then download from the provided URL"; \
		echo ""; \
		echo "Option 3: Copy to host and install"; \
		echo "  Use VS Code's Explorer to download the VSIX file"; \
		echo "  Then install it in your local VS Code"; \
	else \
		echo "❌ Not in a devcontainer environment"; \
		echo "Use 'make install-local' instead"; \
	fi

# Serve VSIX file via HTTP for easy download
serve-vsix: build-vsix
	@echo "🌐 Starting HTTP server to serve VSIX file..."
	@echo ""
	@echo "📦 VSIX file available at:"
	@echo "   http://localhost:8080/claude-runner-$$(node -p "require('./package.json').version").vsix"
	@echo ""
	@echo "🔗 If running in devcontainer/Codespaces, use the forwarded port URL"
	@echo ""
	@echo "Press Ctrl+C to stop the server"
	@cd dist && python3 -m http.server 8080 || python -m SimpleHTTPServer 8080

# Get extension ID for uninstall
get-extension-id:
	@node -pe "require('./package.json').publisher + '.' + require('./package.json').name"

# Uninstall the extension from VS Code
uninstall-extension:
	@EXTENSION_ID=$$(node -pe "require('./package.json').publisher + '.' + require('./package.json').name"); \
	echo "🗑️  Uninstalling extension: $$EXTENSION_ID"; \
	IPC_SOCKET=""; \
	if [ -S "$$VSCODE_IPC_HOOK_CLI" ]; then \
		IPC_SOCKET="$$VSCODE_IPC_HOOK_CLI"; \
	else \
		IPC_SOCKET=$$(find /tmp -name "vscode-ipc-*.sock" -type s 2>/dev/null | head -1); \
		if [ -n "$$IPC_SOCKET" ]; then \
			export VSCODE_IPC_HOOK_CLI=$$IPC_SOCKET; \
		fi; \
	fi; \
	code --uninstall-extension $$EXTENSION_ID 2>/dev/null || echo "⚠️  Extension not currently installed"

# Development step 1: uninstall and build
dev-prepare: 
	@echo "🛠️  Development Step 1: Prepare new build..."
	@echo "==========================================="
	@$(MAKE) -s uninstall-extension
	@echo ""
	@$(MAKE) -s build-vsix
	@echo ""
	@echo "✅ Extension uninstalled and VSIX built."
	@echo "📝 Next step: Run 'make dev-install' to install the new version"

# Development step 2: install only
dev-install:
	@echo "🛠️  Development Step 2: Install extension..."
	@echo "==========================================="
	@EXTENSION_ID=$$(node -pe "require('./package.json').publisher + '.' + require('./package.json').name"); \
	echo "📦 Extension ID: $$EXTENSION_ID"; \
	VSIX_FILE=$$(ls dist/claude-runner-*.vsix | head -1 2>/dev/null); \
	if [ -z "$$VSIX_FILE" ]; then \
		echo "❌ No VSIX file found. Run 'make dev-prepare' first."; \
		exit 1; \
	fi; \
	echo "📥 Installing: $$VSIX_FILE"; \
	IPC_SOCKET=""; \
	if [ -S "$$VSCODE_IPC_HOOK_CLI" ]; then \
		IPC_SOCKET="$$VSCODE_IPC_HOOK_CLI"; \
		echo "🔌 Using existing IPC socket: $$IPC_SOCKET"; \
	else \
		IPC_SOCKET=$$(find /tmp -name "vscode-ipc-*.sock" -type s 2>/dev/null | head -1); \
		if [ -n "$$IPC_SOCKET" ]; then \
			export VSCODE_IPC_HOOK_CLI=$$IPC_SOCKET; \
			echo "🔌 Found IPC socket: $$IPC_SOCKET"; \
		else \
			echo "⚠️  No VS Code IPC socket found - using default CLI behavior"; \
		fi; \
	fi; \
	code --install-extension $$VSIX_FILE --force; \
	echo ""; \
	echo "✅ Extension installed successfully"; \
	echo ""; \
	echo "🔄 IMPORTANT: Manually reload VS Code to activate changes:"; \
	echo "   - Press Ctrl/Cmd+Shift+P → 'Developer: Reload Window'"; \
	echo "   - Or use Ctrl/Cmd+R to reload the window"

# Version Management
sync-version:
	@echo "🔄 Syncing version from VERSION file to package.json..."
	@node scripts/sync-version.js

version-patch:
	@echo "📈 Bumping patch version..."
	@node scripts/bump-version.js patch
	@echo "✅ Patch version bumped successfully"

version-minor:
	@echo "📈 Bumping minor version..."
	@node scripts/bump-version.js minor
	@echo "✅ Minor version bumped successfully"

version-major:
	@echo "📈 Bumping major version..."
	@node scripts/bump-version.js major
	@echo "✅ Major version bumped successfully"

# SonarQube Analysis
sonar:
	@echo "🔍 Running SonarQube analysis..."
	@if [ ! -f .sonar ]; then \
		echo "❌ Error: .sonar configuration file not found"; \
		echo ""; \
		echo "Please create .sonar file with the following format:"; \
		echo "SONAR_HOST_URL=https://sonarqube.114.be.tn"; \
		echo "SONAR_LOGIN=your-sonar-token"; \
		echo ""; \
		echo "Example:"; \
		echo "  echo 'SONAR_HOST_URL=https://sonarqube.114.be.tn' > .sonar"; \
		echo "  echo 'SONAR_LOGIN=your-token-here' >> .sonar"; \
		echo ""; \
		exit 1; \
	fi
	@echo "📋 Loading SonarQube configuration..."
	@export $$(cat .sonar | xargs) && \
	sonar-scanner \
		-Dsonar.projectKey=claude-runner \
		-Dsonar.sources=. \
		-Dsonar.exclusions="node_modules/**,dist/**,out/**,coverage/**,.vscode/**,.husky/**,scripts/**" \
		-Dsonar.host.url=$$SONAR_HOST_URL \
		-Dsonar.login=$$SONAR_LOGIN
	@echo "✅ SonarQube analysis completed"

# Secrets Scanning
scan-secrets:
	@echo "🔍 Scanning for secrets in codebase..."
	@node scripts/scan-secrets.js --all
	@echo "✅ Secrets scan completed"

# Generate Extension Icons
generate-icons:
	@echo "🎨 Generating VSCode extension icons..."
	@node scripts/generate-icons.js
	@echo "✅ Icons generated successfully"

# Prepare Marketplace Assets
prepare-marketplace:
	@echo "📦 Preparing marketplace assets and README..."
	@node scripts/prepare-marketplace.js
	@echo "✅ Marketplace preparation completed"
