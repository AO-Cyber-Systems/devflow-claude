#!/bin/bash
# Claude Code Hook: SessionStart + SessionEnd
# Handles both lifecycle events via hook_event_name dispatch.
#
# SessionStart: Registers session with relay server, writes token to CLAUDE_ENV_FILE.
# SessionEnd: Posts session_end event to deregister.
#
# Receives JSON on stdin:
#   SessionStart: { session_id, cwd, transcript_path, hook_event_name }
#   SessionEnd:   { session_id, cwd, hook_event_name }

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/relay_common.sh"

INPUT=$(cat)
relay_up || exit 0

HOOK_EVENT=$(parse_json "$INPUT" '["hook_event_name"]')
SESSION_ID=$(parse_json "$INPUT" '["session_id"]')
CWD=$(parse_json "$INPUT" '["cwd"]')
CWD="${CWD:-$PWD}"

relay_log "$HOOK_EVENT session=$SESSION_ID cwd=$CWD"

case "$HOOK_EVENT" in
  SessionStart)
    SESSION_JSON=$(build_session_json "$SESSION_ID" "$CWD")
    RESPONSE=$(relay_post "events" "$(ruby -rjson -e '
      session = JSON.parse(ARGV[0])
      puts JSON.generate(session.merge({
        event_type: "session_start"
      }))
    ' "$SESSION_JSON")")

    # Write token to CLAUDE_ENV_FILE if available
    if [ -n "$CLAUDE_ENV_FILE" ]; then
      TOKEN=$(parse_json "$RESPONSE" '["relay_token"]')
      if [ -n "$TOKEN" ]; then
        echo "DEVFLOW_RELAY_TOKEN=${TOKEN}" >> "$CLAUDE_ENV_FILE" 2>/dev/null || true
      fi
    fi
    ;;

  SessionEnd)
    relay_post "events" "$(ruby -rjson -e '
      puts JSON.generate({
        event_type: "session_end",
        claude_session_id: ARGV[0],
        cwd: ARGV[1]
      })
    ' "$SESSION_ID" "$CWD")" > /dev/null 2>&1 || true
    ;;
esac

exit 0
