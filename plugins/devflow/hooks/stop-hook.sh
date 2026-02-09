#!/bin/bash
# DevFlow Autonomous Agent Stop Hook
# Prevents session exit when an autonomous loop is active
# Designed for UNLIMITED loops by default - only stops on completion promise
# Enhanced with verification and regression checks

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# State file location
STATE_FILE=".claude/devflow.local.md"
DEVFLOW_DIR=".devflow"
VERIFY_FILE="$DEVFLOW_DIR/verification.json"
MANIFEST_FILE="$DEVFLOW_DIR/regression/manifest.json"
FEATURE_FILE="$DEVFLOW_DIR/feature_list.json"

# Exit early if no active loop
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# Parse YAML frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")

# Extract fields
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//' || echo "1")
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//' || echo "0")
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | grep '^completion_promise:' | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
TASK_FILE=$(echo "$FRONTMATTER" | grep '^task_file:' | sed 's/task_file: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
CURRENT_PHASE=$(echo "$FRONTMATTER" | grep '^current_phase:' | sed 's/current_phase: *//' || echo "")

# Validate iteration is numeric
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "Warning: State file corrupted (iteration: '$ITERATION'). Cleaning up." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Validate max_iterations is numeric
if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  MAX_ITERATIONS=0
fi

# Hard safety limit - even "unlimited" has a ceiling to prevent runaway loops
HARD_LIMIT=10000
WARN_THRESHOLD=$((HARD_LIMIT * 9 / 10))  # 90% = 9000

# Check hard limit first (applies even when unlimited)
if [[ $ITERATION -ge $HARD_LIMIT ]]; then
  echo "DevFlow: SAFETY LIMIT reached ($HARD_LIMIT iterations)."
  echo "This is a hard ceiling to prevent runaway loops."
  echo "If you need more iterations, restart the loop manually."
  rm "$STATE_FILE"
  exit 0
fi

# Warn when approaching limit
if [[ $ITERATION -ge $WARN_THRESHOLD ]]; then
  echo "WARNING: Approaching safety limit ($ITERATION/$HARD_LIMIT iterations)" >&2
fi

# Check user-specified max iterations (0 = unlimited up to hard limit)
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "DevFlow: Max iterations ($MAX_ITERATIONS) reached."
  rm "$STATE_FILE"
  exit 0
fi

# Get transcript path
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty')

if [[ -z "$TRANSCRIPT_PATH" ]] || [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  echo "Warning: Transcript not found. Stopping loop." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Extract last assistant message text
if ! grep -q '"role":"assistant"' "$TRANSCRIPT_PATH" 2>/dev/null; then
  echo "Warning: No assistant messages in transcript." >&2
  rm "$STATE_FILE"
  exit 0
fi

LAST_OUTPUT=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1 | jq -r '
  .message.content // [] |
  map(select(.type == "text")) |
  map(.text // "") |
  join("\n")
' 2>/dev/null || echo "")

# Check for completion promise
if [[ -n "$COMPLETION_PROMISE" ]] && [[ "$COMPLETION_PROMISE" != "null" ]]; then
  # Extract text from <promise> tags
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/\1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")

  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
    echo "DevFlow: Completion detected - <promise>$COMPLETION_PROMISE</promise>"
    rm "$STATE_FILE"
    exit 0
  fi
fi

# Check task file for completion (if specified)
if [[ -n "$TASK_FILE" ]] && [[ -f "$TASK_FILE" ]]; then

  # ==========================================================================
  # PHASE-AWARE COMPLETION CHECK
  # ==========================================================================
  if [[ -n "$CURRENT_PHASE" ]] && [[ "$CURRENT_PHASE" =~ ^[0-9]+$ ]]; then
    # Count incomplete tasks in CURRENT phase only
    PHASE_INCOMPLETE=$(jq --arg phase "$CURRENT_PHASE" \
      '[(.features // .tasks // .stories // [])[] | select((.phase // .priority | tostring) == $phase) | select(.status != "complete" and .status != "done")] | length' \
      "$TASK_FILE" 2>/dev/null || echo "?")

    if [[ "$PHASE_INCOMPLETE" == "0" ]]; then
      # Current phase done — check if more phases exist
      NEXT_PHASE=$((CURRENT_PHASE + 1))
      NEXT_PHASE_COUNT=$(jq --arg phase "$NEXT_PHASE" \
        '[(.features // .tasks // .stories // [])[] | select((.phase // .priority | tostring) == $phase)] | length' \
        "$TASK_FILE" 2>/dev/null || echo "0")

      if [[ "$NEXT_PHASE_COUNT" -gt 0 ]]; then
        # ADVANCE PHASE — update state file and continue loop
        TEMP_PHASE=$(mktemp)
        if sed "s/^current_phase: .*/current_phase: $NEXT_PHASE/" "$STATE_FILE" > "$TEMP_PHASE"; then
          mv "$TEMP_PHASE" "$STATE_FILE"
        else
          rm -f "$TEMP_PHASE"
        fi
        CURRENT_PHASE="$NEXT_PHASE"
        echo "DevFlow: Phase $((NEXT_PHASE - 1)) complete! Advancing to Phase $NEXT_PHASE ($NEXT_PHASE_COUNT tasks)" >&2
        # Fall through to "continue loop" logic below
      else
        # ALL phases done — run the verification gate
        INCOMPLETE=0
        ALL_PHASES_DONE=true
      fi
    fi
  else
    # No current_phase set — fall back to existing flat check for backwards compatibility
    INCOMPLETE=$(jq '[(.features // .tasks // .stories // [])[] | select(.status != "complete" and .status != "done")] | length' "$TASK_FILE" 2>/dev/null || echo "?")
  fi

  # ==========================================================================
  # VERIFICATION GATE — only when all phases/tasks are done
  # ==========================================================================
  if [[ "${ALL_PHASES_DONE:-}" == "true" ]] || [[ "${INCOMPLETE:-}" == "0" ]]; then
    VERIFICATION_PASSED=true
    VERIFICATION_MSG=""

    # Check if verification.json exists and run required checks
    if [[ -f "$VERIFY_FILE" ]]; then
      LAST_RUN=$(jq -r '.lastRun // empty' "$VERIFY_FILE" 2>/dev/null)
      if [[ -n "$LAST_RUN" ]] && [[ "$LAST_RUN" != "null" ]]; then
        VERIFY_FAILED=$(echo "$LAST_RUN" | jq -r '.failed // 0')
        if [[ "$VERIFY_FAILED" -gt 0 ]]; then
          VERIFICATION_PASSED=false
          VERIFICATION_MSG="Verification failed ($VERIFY_FAILED checks). Run /devflow:verify run"
        fi
      else
        # No verification run recorded - suggest running
        VERIFICATION_MSG="Run /devflow:verify run before completion"
      fi
    fi

    # Check regression tests if manifest exists
    if [[ -f "$MANIFEST_FILE" ]]; then
      TOTAL_TESTS=$(jq '[.tests.unit, .tests.integration, .tests.ui, .tests.e2e | length] | add' "$MANIFEST_FILE" 2>/dev/null || echo "0")
      if [[ "$TOTAL_TESTS" -gt 0 ]]; then
        LAST_REGRESSION=$(jq -r '.statistics.last_run // empty' "$MANIFEST_FILE" 2>/dev/null)
        PASS_RATE=$(jq -r '.statistics.pass_rate // 0' "$MANIFEST_FILE" 2>/dev/null)

        # Check if pass rate is 100%
        if [[ -n "$PASS_RATE" ]] && [[ "$PASS_RATE" != "100" ]] && [[ "$PASS_RATE" != "0" ]]; then
          VERIFICATION_PASSED=false
          VERIFICATION_MSG="${VERIFICATION_MSG:+$VERIFICATION_MSG | }Regression pass rate: ${PASS_RATE}%. Run /devflow:regression run"
        fi
      fi
    fi

    # If verification passed, allow completion
    if [[ "$VERIFICATION_PASSED" == "true" ]]; then
      echo "DevFlow: All tasks in $TASK_FILE are complete!"

      # Update feature_list.json verification flags if it exists
      if [[ -f "$FEATURE_FILE" ]]; then
        TMP_FEATURE=$(mktemp)
        if jq '(.features[] | select(.status == "complete")).verification.tests_pass = true' "$FEATURE_FILE" > "$TMP_FEATURE" 2>/dev/null; then
          mv "$TMP_FEATURE" "$FEATURE_FILE"
        else
          rm -f "$TMP_FEATURE"
          echo "Warning: Failed to update feature verification flags" >&2
        fi
      fi

      rm "$STATE_FILE"
      exit 0
    else
      # Block completion - verification/regression not passing
      echo "DevFlow: Tasks complete but verification gate failed" >&2
      echo "$VERIFICATION_MSG" >&2
    fi
  fi
fi

# Continue loop - increment iteration
NEXT_ITERATION=$((ITERATION + 1))

# Extract original prompt (everything after closing ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "Warning: No prompt text found in state file. Stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Update iteration counter atomically using mktemp for safer temp file
TEMP_FILE=$(mktemp)
if sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$STATE_FILE" > "$TEMP_FILE"; then
  mv "$TEMP_FILE" "$STATE_FILE"
else
  rm -f "$TEMP_FILE"
  echo "Error: Failed to update iteration counter" >&2
  exit 1
fi

# Build status message
if [[ -n "$TASK_FILE" ]] && [[ -f "$TASK_FILE" ]]; then
  TOTAL=$(jq '[(.features // .tasks // .stories // [])[] ] | length' "$TASK_FILE" 2>/dev/null || echo "?")
  COMPLETE=$(jq '[(.features // .tasks // .stories // [])[] | select(.status == "complete" or .status == "done")] | length' "$TASK_FILE" 2>/dev/null || echo "?")
  PROGRESS_MSG=" | Progress: $COMPLETE/$TOTAL tasks"

  # Add verification status if applicable
  if [[ -f "$VERIFY_FILE" ]]; then
    VERIFY_STATUS=$(jq -r '.lastRun | if . then "V:\(.passed)/\(.passed + .failed)" else "V:?" end' "$VERIFY_FILE" 2>/dev/null || echo "")
    if [[ -n "$VERIFY_STATUS" ]]; then
      PROGRESS_MSG="$PROGRESS_MSG | $VERIFY_STATUS"
    fi
  fi
else
  PROGRESS_MSG=""
fi

if [[ -n "$COMPLETION_PROMISE" ]] && [[ "$COMPLETION_PROMISE" != "null" ]]; then
  STOP_MSG="Output <promise>$COMPLETION_PROMISE</promise> when genuinely complete"
else
  STOP_MSG="Loop runs until task file shows all complete"
fi

# Build iteration display
if [[ $MAX_ITERATIONS -gt 0 ]]; then
  ITER_DISPLAY="$NEXT_ITERATION/$MAX_ITERATIONS"
else
  ITER_DISPLAY="$NEXT_ITERATION (max: $HARD_LIMIT)"
fi

if [[ -n "$CURRENT_PHASE" ]] && [[ "$CURRENT_PHASE" =~ ^[0-9]+$ ]]; then
  PHASE_MSG=" | Phase $CURRENT_PHASE"
else
  PHASE_MSG=""
fi
SYSTEM_MSG="DevFlow iteration $ITER_DISPLAY$PROGRESS_MSG$PHASE_MSG | $STOP_MSG"

# Output JSON to block stop and feed prompt back
jq -n \
  --arg prompt "$PROMPT_TEXT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0
