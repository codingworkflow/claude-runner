#!/bin/bash

# Mock Claude CLI script that simulates long-term rate limiting (>6:01 hours)
# This represents the scenario where the wait time exceeds the Go CLI threshold

# Parse -r parameter for session resumption
RESUME_SESSION=""
while [[ $# -gt 0 ]]; do
  case $1 in
    -r)
      RESUME_SESSION="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# If resuming a session, use that session ID; otherwise create new one
if [[ -n "$RESUME_SESSION" ]]; then
  SESSION_ID="$RESUME_SESSION"
else
  SESSION_ID="claude-session-$(date +%s)-$(openssl rand -hex 4)"
fi

# Calculate reset time for long-term rate limit (7 hours from now)
# This exceeds the Go CLI 6:01 hour threshold, so it becomes a timeout scenario
WAIT_HOURS=7
RESET_TIME=$(($(date +%s) + (WAIT_HOURS * 3600)))

# Output long-term rate limit in the exact format Claude CLI uses
echo "Claude AI usage limit reached|$RESET_TIME" >&2

# Exit with error code like Claude CLI does when rate limited
exit 1