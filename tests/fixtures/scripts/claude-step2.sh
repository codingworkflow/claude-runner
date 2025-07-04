#!/bin/bash
# Simulate real Claude Code JSON output format - Step 2 with session continuation

# Parse -r parameter for session resumption (simulates claude -r session_id)
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

# Claude Code behavior: If no resume session provided, create NEW session (breaks continuity!)
if [[ -z "$RESUME_SESSION" ]]; then
  # NEW session - this breaks session continuity and should be detected in tests
  SESSION_ID="claude-session-$(date +%s)-$(openssl rand -hex 4)"
else
  # RESUME session - maintains session continuity (this is what we want)
  SESSION_ID="$RESUME_SESSION"
fi

# Return the session ID (either resumed or new) - simulates real Claude Code behavior
echo "{
  \"type\": \"result\",
  \"subtype\": \"success\",
  \"is_error\": false,
  \"duration_ms\": 3200,
  \"duration_api_ms\": 1800,
  \"num_turns\": 2,
  \"result\": \"Step 2 completed successfully. Built upon the previous setup and implemented core features including main.py and feature.py with proper integration to existing config.json.\",
  \"session_id\": \"$SESSION_ID\",
  \"total_cost_usd\": 0.0245647,
  \"usage\": {
    \"input_tokens\": 78,
    \"cache_creation_input_tokens\": 0, 
    \"cache_read_input_tokens\": 1250,
    \"output_tokens\": 120,
    \"server_tool_use\": {
      \"web_search_requests\": 0
    },
    \"service_tier\": \"standard\"
  }
}"
exit 0