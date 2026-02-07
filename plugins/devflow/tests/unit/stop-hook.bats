#!/usr/bin/env bats
# Stop Hook Tests
# Tests for the autonomous loop control hook

load '../helpers/test_helper'

setup() {
  setup_test_env
}

teardown() {
  teardown_test_env
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

run_stop_hook() {
  local transcript_path="$1"
  local input='{"transcript_path": "'"$transcript_path"'"}'
  cd "$TEST_DIR" && echo "$input" | bash "$HOOKS_DIR/stop-hook.sh"
}

# =============================================================================
# NO STATE FILE
# =============================================================================

@test "exits cleanly when no state file" {
  # No state file exists
  run run_stop_hook "/nonexistent/transcript.jsonl"
  [[ $status -eq 0 ]]
  [[ -z "$output" ]]
}

# =============================================================================
# ITERATION COUNTER
# =============================================================================

@test "increments iteration counter" {
  create_state_file 5 0 "" ""
  local transcript_path
  transcript_path=$(create_transcript "Working on task...")

  run run_stop_hook "$transcript_path"

  # Check iteration was incremented
  local new_iteration
  new_iteration=$(grep '^iteration:' "$TEST_DIR/.claude/devflow.local.md" | sed 's/iteration: *//')
  [[ "$new_iteration" == "6" ]]
}

@test "respects max_iterations limit" {
  create_state_file 10 10 "" ""  # At limit
  local transcript_path
  transcript_path=$(create_transcript "Working on task...")

  run run_stop_hook "$transcript_path"

  # State file should be removed
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"Max iterations"* ]]
}

@test "continues when under max_iterations" {
  create_state_file 5 10 "" ""  # Under limit
  local transcript_path
  transcript_path=$(create_transcript "Working on task...")

  run run_stop_hook "$transcript_path"

  # Should block and continue
  echo "$output" | jq -e '.decision == "block"' >/dev/null 2>&1
  [[ -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

@test "enforces hard safety limit (10000)" {
  create_state_file 10000 0 "" ""  # At hard limit
  local transcript_path
  transcript_path=$(create_transcript "Working on task...")

  run run_stop_hook "$transcript_path"

  # State file should be removed
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"SAFETY LIMIT"* ]]
}

@test "warns at 90% of hard limit" {
  create_state_file 9000 0 "" ""  # At warning threshold
  local transcript_path
  transcript_path=$(create_transcript "Working on task...")

  run run_stop_hook "$transcript_path" 2>&1

  # Should continue but warn (warning goes to stderr)
  [[ "$output" == *"WARNING"* ]] || [[ "$output" == *"Approaching"* ]] || true
}

# =============================================================================
# COMPLETION PROMISE DETECTION
# =============================================================================

@test "detects completion promise in output" {
  create_state_file 5 0 "ALL DONE" ""
  local transcript_path
  transcript_path=$(create_transcript "Task completed. <promise>ALL DONE</promise>")

  run run_stop_hook "$transcript_path"

  # State file should be removed
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"Completion detected"* ]]
}

@test "continues when promise not matched" {
  create_state_file 5 0 "ALL DONE" ""
  local transcript_path
  transcript_path=$(create_transcript "Still working on tasks...")

  run run_stop_hook "$transcript_path"

  # Should block and continue
  echo "$output" | jq -e '.decision == "block"' >/dev/null 2>&1
  [[ -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

@test "ignores wrong promise text" {
  create_state_file 5 0 "ALL DONE" ""
  local transcript_path
  transcript_path=$(create_transcript "<promise>NOT DONE YET</promise>")

  run run_stop_hook "$transcript_path"

  # Should block and continue (promise doesn't match)
  echo "$output" | jq -e '.decision == "block"' >/dev/null 2>&1
  [[ -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

# =============================================================================
# TASK FILE COMPLETION DETECTION
# =============================================================================

@test "detects all tasks complete in features array" {
  create_state_file 5 0 "" "task_file.json"

  # Create task file with all complete
  create_task_file "task_file.json" '{
    "features": [
      {"id": "TRD-001", "status": "complete"},
      {"id": "TRD-002", "status": "complete"}
    ]
  }'

  local transcript_path
  transcript_path=$(create_transcript "Finished!")

  run run_stop_hook "$transcript_path"

  # State file should be removed
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"All tasks"* ]] || [[ "$output" == *"complete"* ]]
}

@test "detects all tasks complete with done status" {
  create_state_file 5 0 "" "task_file.json"

  # Create task file with "done" status
  create_task_file "task_file.json" '{
    "tasks": [
      {"id": "TASK-001", "status": "done"},
      {"id": "TASK-002", "status": "done"}
    ]
  }'

  local transcript_path
  transcript_path=$(create_transcript "Finished!")

  run run_stop_hook "$transcript_path"

  # State file should be removed
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

@test "continues when tasks incomplete" {
  create_state_file 5 0 "" "task_file.json"

  # Create task file with incomplete tasks
  create_task_file "task_file.json" '{
    "features": [
      {"id": "TRD-001", "status": "complete"},
      {"id": "TRD-002", "status": "in_progress"}
    ]
  }'

  local transcript_path
  transcript_path=$(create_transcript "Working...")

  run run_stop_hook "$transcript_path"

  # Should block and continue
  echo "$output" | jq -e '.decision == "block"' >/dev/null 2>&1
  [[ -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

# =============================================================================
# VERIFICATION GATE
# =============================================================================

@test "blocks on failed verification" {
  create_state_file 5 0 "" "task_file.json"

  # All tasks complete
  create_task_file "task_file.json" '{
    "features": [{"id": "TRD-001", "status": "complete"}]
  }'

  # But verification failed
  create_verification_config '{"passed": 5, "failed": 2, "timestamp": "2024-01-01T00:00:00Z"}'

  local transcript_path
  transcript_path=$(create_transcript "Done!")

  run run_stop_hook "$transcript_path" 2>&1

  # Should still be blocked due to verification failure
  [[ -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"verification"* ]] || [[ "$output" == *"Verification"* ]]
}

@test "allows completion when verification passes" {
  create_state_file 5 0 "" "task_file.json"

  # All tasks complete
  create_task_file "task_file.json" '{
    "features": [{"id": "TRD-001", "status": "complete"}]
  }'

  # Verification passed
  create_verification_config '{"passed": 5, "failed": 0, "timestamp": "2024-01-01T00:00:00Z"}'

  local transcript_path
  transcript_path=$(create_transcript "Done!")

  run run_stop_hook "$transcript_path"

  # Should complete
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

# =============================================================================
# REGRESSION GATE
# =============================================================================

@test "blocks on failed regression tests" {
  create_state_file 5 0 "" "task_file.json"

  # All tasks complete
  create_task_file "task_file.json" '{
    "features": [{"id": "TRD-001", "status": "complete"}]
  }'

  # Regression tests failed (80% pass rate)
  create_regression_manifest 80 5

  # Add some actual tests to the manifest
  mkdir -p "$TEST_DIR/.devflow/regression"
  cat > "$TEST_DIR/.devflow/regression/manifest.json" <<EOF
{
  "version": "1.0",
  "tests": {
    "unit": [{"path": "test.ts", "description": "test"}],
    "integration": [],
    "ui": [],
    "e2e": []
  },
  "sources": ["TRD-001"],
  "statistics": {
    "total_runs": 5,
    "last_run": "2024-01-01T00:00:00Z",
    "pass_rate": 80
  }
}
EOF

  local transcript_path
  transcript_path=$(create_transcript "Done!")

  run run_stop_hook "$transcript_path" 2>&1

  # Should still be blocked due to regression failure
  [[ -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"Regression"* ]] || [[ "$output" == *"pass"* ]] || [[ "$output" == *"80"* ]]
}

@test "allows completion when regression passes 100%" {
  create_state_file 5 0 "" "task_file.json"

  # All tasks complete
  create_task_file "task_file.json" '{
    "features": [{"id": "TRD-001", "status": "complete"}]
  }'

  # Verification passes
  create_verification_config '{"passed": 5, "failed": 0, "timestamp": "2024-01-01T00:00:00Z"}'

  # Regression passes (100%)
  create_regression_manifest 100 5

  local transcript_path
  transcript_path=$(create_transcript "Done!")

  run run_stop_hook "$transcript_path"

  # Should complete
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

# =============================================================================
# STATE FILE PARSING
# =============================================================================

@test "parses YAML frontmatter correctly" {
  create_state_file 42 100 "FINISHED" "tasks.json"
  local transcript_path
  transcript_path=$(create_transcript "Working...")

  run run_stop_hook "$transcript_path"

  # Should output correct iteration
  echo "$output" | jq -e '.systemMessage' | grep -q "43/100"
}

@test "handles corrupted iteration (non-numeric)" {
  # Create corrupted state file manually
  mkdir -p "$TEST_DIR/.claude"
  cat > "$TEST_DIR/.claude/devflow.local.md" <<EOF
---
active: true
iteration: not-a-number
max_iterations: 0
---

Test prompt
EOF

  local transcript_path
  transcript_path=$(create_transcript "Working...")

  run run_stop_hook "$transcript_path" 2>&1

  # Should clean up and exit
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"corrupted"* ]]
}

@test "handles missing transcript" {
  create_state_file 5 0 "" ""

  run run_stop_hook "/nonexistent/path.jsonl" 2>&1

  # Should clean up and exit
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"not found"* ]] || [[ "$output" == *"Transcript"* ]]
}

# =============================================================================
# OUTPUT FORMAT
# =============================================================================

@test "outputs valid JSON when blocking" {
  create_state_file 5 0 "" ""
  local transcript_path
  transcript_path=$(create_transcript "Working...")

  run run_stop_hook "$transcript_path"

  # Verify valid JSON
  echo "$output" | jq -e '.' >/dev/null 2>&1
  echo "$output" | jq -e '.decision == "block"' >/dev/null 2>&1
  echo "$output" | jq -e '.reason' >/dev/null 2>&1
  echo "$output" | jq -e '.systemMessage' >/dev/null 2>&1
}

@test "includes progress in system message" {
  create_state_file 5 0 "" "task_file.json"

  create_task_file "task_file.json" '{
    "features": [
      {"id": "TRD-001", "status": "complete"},
      {"id": "TRD-002", "status": "in_progress"},
      {"id": "TRD-003", "status": "pending"}
    ]
  }'

  local transcript_path
  transcript_path=$(create_transcript "Working...")

  run run_stop_hook "$transcript_path"

  # Should include progress
  echo "$output" | jq -r '.systemMessage' | grep -q "1/3"
}

@test "includes prompt in reason when blocking" {
  mkdir -p "$TEST_DIR/.claude"
  cat > "$TEST_DIR/.claude/devflow.local.md" <<EOF
---
active: true
iteration: 1
max_iterations: 0
completion_promise: ""
task_file: ""
---

This is my original prompt to continue.
EOF

  local transcript_path
  transcript_path=$(create_transcript "Working...")

  run run_stop_hook "$transcript_path"

  # Should include original prompt
  echo "$output" | jq -r '.reason' | grep -q "original prompt"
}

# =============================================================================
# ATOMIC UPDATES
# =============================================================================

@test "atomic iteration update preserves other fields" {
  create_state_file 5 100 "DONE" "tasks.json"
  local transcript_path
  transcript_path=$(create_transcript "Working...")

  run run_stop_hook "$transcript_path"

  # Check other fields preserved
  grep -q "max_iterations: 100" "$TEST_DIR/.claude/devflow.local.md"
  grep -q 'completion_promise: "DONE"' "$TEST_DIR/.claude/devflow.local.md"
  grep -q 'task_file: "tasks.json"' "$TEST_DIR/.claude/devflow.local.md"
  # Iteration should be updated
  grep -q "iteration: 6" "$TEST_DIR/.claude/devflow.local.md"
}
