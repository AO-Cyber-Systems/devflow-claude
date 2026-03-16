#!/bin/bash
# Claude Code Hook: Stop
# Fires on every Claude response. Captures last_assistant_message as a work summary.
#
# This is fire-and-forget: no stdout, always exit 0.
# Stop hooks must NOT block Claude or return JSON decisions.
#
# Receives JSON on stdin: { session_id, cwd, stop_hook_active, last_assistant_message }

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/relay_common.sh"

INPUT=$(cat)
relay_up || exit 0

SESSION_ID=$(parse_json "$INPUT" '["session_id"]')
CWD=$(parse_json "$INPUT" '["cwd"]')
LAST_MESSAGE=$(parse_json "$INPUT" '["last_assistant_message"]')

# Nothing to summarize if there's no message
[ -z "$LAST_MESSAGE" ] && exit 0

relay_log "stop session=$SESSION_ID message_length=${#LAST_MESSAGE}"

# Post work summary (fire-and-forget, suppress all output)
relay_post "work_summaries" "$(ruby -rjson -e '
  content = ARGV[0]
  # Truncate to 10K chars for storage efficiency
  content = content[0..9999] if content.length > 10000
  puts JSON.generate({
    claude_session_id: ARGV[1],
    cwd: ARGV[2],
    work_summary: {
      content: content,
      summary_type: "stop"
    }
  })
' "$LAST_MESSAGE" "$SESSION_ID" "$CWD")" > /dev/null 2>&1

exit 0
