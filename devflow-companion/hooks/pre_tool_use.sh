#!/bin/bash
# Claude Code Hook: PreToolUse
# Sends tool actions to the event API and acts on the classification.
#
# Exit codes:
#   0 = approve (tool runs normally)
#   2 = block  (tool is prevented, JSON reason on stdout)
#
# Receives JSON on stdin: { session_id, hook_event_name, tool_name, tool_input, cwd }

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/relay_common.sh"

INPUT=$(cat)
relay_up || exit 0

TOOL_NAME=$(parse_json "$INPUT" '["tool_name"]')
SESSION_ID=$(parse_json "$INPUT" '["session_id"]')
CWD=$(parse_json "$INPUT" '["cwd"]')
POLL_TIMEOUT="${DEVFLOW_RELAY_TIMEOUT:-300}"

relay_log "pre_tool_use tool=$TOOL_NAME session=$SESSION_ID"

# Build event payload with tool details
EVENT_JSON=$(echo "$INPUT" | ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  tool_input = data["tool_input"] || {}

  # Extract command for Bash tools
  command = nil
  if data["tool_name"] == "Bash"
    command = tool_input["command"] || tool_input["cmd"] || ""
  end

  # Extract files for file tools
  files = []
  files << tool_input["file_path"] if tool_input["file_path"]
  files << tool_input["path"] if tool_input["path"]
  files += (tool_input["paths"] || [])

  event = {
    event_type: "action_request",
    agent: "claude-code",
    tool_name: data["tool_name"],
    command: command,
    claude_session_id: data["session_id"],
    cwd: data["cwd"],
    action_data: {
      tool_input: tool_input,
      files_affected: files,
      project_dir: data["cwd"]
    }
  }

  puts JSON.generate(event)
' 2>/dev/null)

[ -z "$EVENT_JSON" ] && exit 0

# Post event to API
RESPONSE=$(relay_post "events" "$EVENT_JSON")
[ -z "$RESPONSE" ] && exit 0

DECISION=$(parse_json "$RESPONSE" '["decision"]')
REASON=$(parse_json "$RESPONSE" '["reason"]')
EVENT_ID=$(parse_json "$RESPONSE" '["event_id"]')

relay_log "decision=$DECISION reason=$REASON event=$EVENT_ID"

case "$DECISION" in
  approve)
    # Auto-approved (safe or scoped tool)
    exit 0
    ;;
  block)
    # Blocked (destructive or denied by user)
    ruby -rjson -e 'puts JSON.generate({ decision: "block", reason: ARGV[0] })' \
      "${REASON:-Action blocked by remote relay}"
    exit 2
    ;;
  pending)
    # Needs human decision -- long-poll for response
    DEADLINE=$(($(date +%s) + POLL_TIMEOUT))
    while [ "$(date +%s)" -lt "$DEADLINE" ]; do
      POLL=$(relay_get "events/${EVENT_ID}")
      POLL_DECISION=$(parse_json "$POLL" '["decision"]')

      if [ "$POLL_DECISION" = "approve" ]; then
        exit 0
      elif [ "$POLL_DECISION" = "block" ]; then
        POLL_REASON=$(parse_json "$POLL" '["decision_reason"]')
        ruby -rjson -e 'puts JSON.generate({ decision: "block", reason: ARGV[0] })' \
          "${POLL_REASON:-Action blocked by user}"
        exit 2
      fi

      sleep 1
    done

    # Timeout -- allow the action (fail-open)
    relay_log "timeout waiting for decision on event=$EVENT_ID"
    exit 0
    ;;
  *)
    # Unknown decision -- fail-open
    exit 0
    ;;
esac
