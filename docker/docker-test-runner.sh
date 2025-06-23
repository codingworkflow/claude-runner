#!/bin/bash
set -e

echo "Starting Docker E2E tests..."
echo "Phase: $TEST_PHASE"
echo "Install Claude: $INSTALL_CLAUDE"

make setup-test-env

if [ "$INSTALL_CLAUDE" = "true" ]; then
    echo "Installing Claude CLI..."
    make install-claude-cli
    make setup-claude-config
    
    echo "Running tests with Claude CLI installed..."
    make test-ci-with-claude
else
    echo "Running tests without Claude CLI installed..."
    make test-ci-without-claude
fi

echo "Docker E2E tests completed"