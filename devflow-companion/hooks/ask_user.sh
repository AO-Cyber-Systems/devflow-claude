#!/bin/bash
# Claude Code Hook: AskUserQuestion (via PreToolUse matcher)
# Sends questions to the event API and long-polls for the user's answer from their phone.
#
# When the user answers on their phone, this hook blocks the AskUserQuestion tool
# (exit 2) with the answer as the reason. Claude reads the reason and proceeds
# without showing the question dialog in the IDE.
#
# If the server is down or times out, exit 0 lets Claude show the dialog normally.
#
# Receives JSON on stdin: { session_id, hook_event_name, tool_name, tool_input, cwd }
# tool_input.questions[]: { question, options[{ label, description }] }

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/relay_common.sh"

INPUT=$(cat)
relay_up || exit 0

SESSION_ID=$(parse_json "$INPUT" '["session_id"]')
CWD=$(parse_json "$INPUT" '["cwd"]')
POLL_TIMEOUT="${DEVFLOW_RELAY_TIMEOUT:-300}"

relay_log "ask_user session=$SESSION_ID"

# Parse question details from AskUserQuestion tool_input
EVENT_JSON=$(echo "$INPUT" | ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  tool_input = data["tool_input"] || {}
  questions = tool_input["questions"] || []

  if questions.any?
    q = questions.first
    question_text = q["question"] || "Question from Claude Code"
    opts = q["options"] || []

    action_data = {
      question: question_text,
      options: opts.map { |o| o["label"] },
      option_descriptions: opts.map { |o| o["description"] || "" },
      request_type: opts.any? ? "selection" : "custom"
    }
  else
    action_data = {
      question: "Question from Claude Code",
      request_type: "custom"
    }
  end

  puts JSON.generate({
    event_type: "question",
    agent: "claude-code",
    tool_name: "AskUserQuestion",
    claude_session_id: data["session_id"],
    cwd: data["cwd"],
    action_data: action_data
  })
' 2>/dev/null)

[ -z "$EVENT_JSON" ] && exit 0

# Create the question event
RESPONSE=$(relay_post "events" "$EVENT_JSON")
EVENT_ID=$(parse_json "$RESPONSE" '["event_id"]')

[ -z "$EVENT_ID" ] && exit 0

relay_log "question event created event=$EVENT_ID, polling..."

# Long-poll for user response
DEADLINE=$(($(date +%s) + POLL_TIMEOUT))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  POLL=$(relay_get "events/${EVENT_ID}")
  POLL_DECISION=$(parse_json "$POLL" '["decision"]')

  if [ "$POLL_DECISION" = "block" ]; then
    # User answered the question -- format response for Claude
    ANSWER=$(echo "$POLL" | ruby -rjson -e '
      data = JSON.parse(STDIN.read)
      resp = data["response_data"] || {}
      action = data["action_data"] || {}
      request_type = action["request_type"]

      parts = ["The user answered this question via their phone."]

      case request_type
      when "selection"
        value = resp["value"]
        options = action["options"] || []
        if resp["other"]
          parts << "They chose \"Other\" and provided: \"#{value}\""
          parts << "Available options were: #{options.map.with_index(1) { |o, i| "#{i}. #{o}" }.join(", ")}"
          parts << ""
          parts << "Please proceed with \"#{value}\" without showing this question again."
        else
          parts << "They selected: \"#{value}\""
          parts << ""
          parts << "Please proceed with \"#{value}\" without showing this question again."
        end
      else
        value = resp["value"]
        parts << "They responded: \"#{value}\""
        parts << ""
        parts << "Please proceed with this response without asking again."
      end

      puts parts.join("\n")
    ' 2>/dev/null)

    if [ -n "$ANSWER" ]; then
      ruby -rjson -e 'puts JSON.generate({ decision: "block", reason: STDIN.read.strip })' <<< "$ANSWER"
      exit 2
    fi
  fi

  sleep 0.5
done

# Timeout -- let Claude show the question in the IDE
relay_log "timeout waiting for answer on event=$EVENT_ID"
exit 0
