#!/bin/bash
# Simulate Claude Code failure with exit code error for real-execution-failure.yml test

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

# Debug: log to stderr so it doesn't interfere with JSON output
echo "DEBUG: claude-failing-exit-code.sh starting, resume_session='$RESUME_SESSION', session_id='$SESSION_ID'" >&2

# Simulate detailed failure - output failure error matching the test expectations
echo "DEBUG: claude-failing-exit-code.sh outputting detailed failure error and exiting 1" >&2

# Output to stdout (not stderr) even on failure - this is how Claude Code behaves
echo "{
  \"type\": \"error\",
  \"subtype\": \"failure\",
  \"is_error\": true,
  \"error\": \"ERROR: Something went wrong during execution\",
  \"details\": \"Failed to complete the task\",
  \"session_id\": \"$SESSION_ID\",
  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",
  \"request_id\": \"req_$(openssl rand -hex 8)\"
}"

# Exit with code 1 to indicate failure
exit 1