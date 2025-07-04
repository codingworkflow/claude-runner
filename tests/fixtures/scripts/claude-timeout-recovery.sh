#!/bin/bash
# Simulate Claude Code recovery after timeout - succeeds with same session ID

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

# Simulate successful completion after timeout recovery
echo "{
  \"type\": \"result\",
  \"subtype\": \"success\",
  \"is_error\": false,
  \"duration_ms\": 4200,
  \"duration_api_ms\": 2800,
  \"num_turns\": 1,
  \"result\": \"Task completed successfully after timeout recovery. The request was retried and completed without issues.\",
  \"session_id\": \"$SESSION_ID\",
  \"total_cost_usd\": 0.0189324,
  \"usage\": {
    \"input_tokens\": 65,
    \"cache_creation_input_tokens\": 0,
    \"cache_read_input_tokens\": 800,
    \"output_tokens\": 95,
    \"server_tool_use\": {
      \"web_search_requests\": 0
    },
    \"service_tier\": \"standard\"
  },
  \"retry_attempt\": 1,
  \"recovered_from\": \"timeout\"
}"

exit 0