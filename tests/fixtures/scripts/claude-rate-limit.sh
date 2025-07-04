#!/bin/bash

# Mock Claude CLI script that simulates rate limiting
# Usage: ./claude-rate-limit.sh [seconds_to_wait]

# Parse -r parameter for session resumption (but still rate limit)
RESUME_SESSION=""
while [[ $# -gt 0 ]]; do
  case $1 in
    -r)
      RESUME_SESSION="$2"
      shift 2
      ;;
    *)
      WAIT_SECONDS="$1"
      shift
      ;;
  esac
done

# Default to 5 seconds if no argument provided
WAIT_SECONDS=${WAIT_SECONDS:-5}

# If resuming a session, use that session ID; otherwise create new one
if [[ -n "$RESUME_SESSION" ]]; then
  SESSION_ID="$RESUME_SESSION"
else
  SESSION_ID="claude-session-$(date +%s)-$(openssl rand -hex 4)"
fi

# Calculate reset time (current time + wait seconds)
RESET_TIME=$(($(date +%s) + WAIT_SECONDS))

# Output rate limit message in the exact format Claude CLI uses
# CRITICAL: This is NOT JSON - it's message|timestamp format
echo "Claude AI usage limit reached|$RESET_TIME" >&2

# Exit with error code like Claude CLI does when rate limited
exit 1