#!/bin/bash
# Simulate real Claude Code JSON output format - Step 1 (creates new session)

# Step 1 always creates a new session ID (no -r parameter expected)
SESSION_ID="claude-session-$(date +%s)-$(openssl rand -hex 4)"

echo "{
  \"type\": \"result\",
  \"subtype\": \"success\", 
  \"is_error\": false,
  \"duration_ms\": 2850,
  \"duration_api_ms\": 1200,
  \"num_turns\": 1,
  \"result\": \"Step 1 completed successfully. Created initial project setup and configuration files including config.json and setup.md with proper documentation structure.\",
  \"session_id\": \"$SESSION_ID\",
  \"total_cost_usd\": 0.0163098,
  \"usage\": {
    \"input_tokens\": 45,
    \"cache_creation_input_tokens\": 0,
    \"cache_read_input_tokens\": 0,
    \"output_tokens\": 85,
    \"server_tool_use\": {
      \"web_search_requests\": 0
    },
    \"service_tier\": \"standard\"
  }
}"
exit 0