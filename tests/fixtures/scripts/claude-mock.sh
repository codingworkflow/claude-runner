#!/bin/bash
# Mock Claude CLI for testing chat functionality

if [[ "$*" == *"--output-format json"* ]]; then
  echo '{"type":"result","subtype":"success","is_error":false,"duration_ms":2887,"duration_api_ms":4882,"num_turns":1,"result":"This is a mock response for testing. The command was: '"$*"'","session_id":"mock-session-'$RANDOM'","total_cost_usd":0.0634276,"usage":{"input_tokens":4,"cache_creation_input_tokens":16592,"cache_read_input_tokens":0,"output_tokens":30,"server_tool_use":{"web_search_requests":0},"service_tier":"standard"}}'
else
  echo "Mock Claude response in text mode"
fi

exit 0
