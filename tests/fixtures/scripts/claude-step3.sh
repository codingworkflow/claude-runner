#!/bin/bash
# Simulate real Claude Code JSON output format - Step 3 with session continuation

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
  \"duration_ms\": 4100,
  \"duration_api_ms\": 2500,
  \"num_turns\": 3,
  \"result\": \"Step 3 completed successfully. Finalized the project implementation with comprehensive documentation, tests, and deployment configuration. All components are now production-ready.\",
  \"session_id\": \"$SESSION_ID\",
  \"total_cost_usd\": 0.0327195,
  \"usage\": {
    \"input_tokens\": 95,
    \"cache_creation_input_tokens\": 0,
    \"cache_read_input_tokens\": 2100,
    \"output_tokens\": 165,
    \"server_tool_use\": {
      \"web_search_requests\": 0
    },
    \"service_tier\": \"standard\"
  }
}"
exit 0