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
    
    echo "Running Phase 2 tests with Claude CLI..."
    make test-ci-phase2
else
    echo "Running Phase 1 tests without Claude CLI..."
    make test-ci-phase1
fi

echo "Docker E2E tests completed"