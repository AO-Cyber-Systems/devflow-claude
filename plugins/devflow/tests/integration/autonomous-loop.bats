#!/usr/bin/env bats
# Autonomous Loop Integration Tests
# Tests for the full autonomous loop workflow

load '../helpers/test_helper'

setup() {
  setup_test_env
  # Set CLAUDE_PLUGIN_ROOT for setup-autonomous.sh
  export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
}

teardown() {
  teardown_test_env
}

# =============================================================================
# FULL WORKFLOW: Setup -> Loop -> Complete
# =============================================================================

@test "setup creates state, stop hook blocks, completion removes state" {
  # Step 1: Setup autonomous loop
  cd "$TEST_DIR"
  bash "$SCRIPTS_DIR/setup-autonomous.sh" "Test workflow" --max-iterations 5

  # Verify state file created
  [[ -f "$TEST_DIR/.claude/devflow.local.md" ]]
  grep -q "^iteration: 1$" "$TEST_DIR/.claude/devflow.local.md"

  # Step 2: Stop hook should block and increment
  local transcript_path
  transcript_path=$(create_transcript "Working on task...")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  local output
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh")

  # Should block
  echo "$output" | jq -e '.decision == "block"' >/dev/null 2>&1

  # Iteration should be incremented
  grep -q "^iteration: 2$" "$TEST_DIR/.claude/devflow.local.md"

  # Step 3: Simulate reaching max iterations
  # Update iteration to max
  sed -i.bak 's/^iteration: 2$/iteration: 5/' "$TEST_DIR/.claude/devflow.local.md"

  # Stop hook should allow exit
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh")

  # State file should be removed
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

@test "task file completion triggers loop exit" {
  # Setup with task file
  cat > "$TEST_DIR/tasks.json" <<EOF
{
  "features": [
    {"id": "TRD-001", "status": "in_progress"}
  ]
}
EOF

  cd "$TEST_DIR"
  bash "$SCRIPTS_DIR/setup-autonomous.sh" --task-file tasks.json "Complete tasks"

  # Stop hook should block while tasks incomplete
  local transcript_path
  transcript_path=$(create_transcript "Working...")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  local output
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh")
  echo "$output" | jq -e '.decision == "block"' >/dev/null 2>&1

  # Mark task complete
  cat > "$TEST_DIR/tasks.json" <<EOF
{
  "features": [
    {"id": "TRD-001", "status": "complete"}
  ]
}
EOF

  # Stop hook should allow exit
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh")
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

@test "completion promise triggers loop exit" {
  cd "$TEST_DIR"
  bash "$SCRIPTS_DIR/setup-autonomous.sh" --completion-promise "ALL DONE" "Work until done"

  # Stop hook blocks without promise
  local transcript_path
  transcript_path=$(create_transcript "Still working...")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  local output
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh")
  echo "$output" | jq -e '.decision == "block"' >/dev/null 2>&1

  # Update transcript with promise
  transcript_path=$(create_transcript "Completed! <promise>ALL DONE</promise>")
  input='{"transcript_path": "'"$transcript_path"'"}'

  # Stop hook should allow exit
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh")
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

# =============================================================================
# SESSION START INTEGRATION
# =============================================================================

@test "session start injects context after setup" {
  cd "$TEST_DIR"
  bash "$SCRIPTS_DIR/setup-autonomous.sh" "Test prompt" --max-iterations 10

  # Session start should inject context
  local input='{"match": "startup"}'
  local output
  output=$(PROJECT_ROOT="$TEST_DIR" echo "$input" | bash "$HOOKS_DIR/session-start-hook.sh")

  [[ "$output" == *"DevFlow"* ]]
  [[ "$output" == *"Iteration"* ]] || [[ "$output" == *"iteration"* ]]
}

@test "session start shows progress after resume" {
  cd "$TEST_DIR"
  cat > "$TEST_DIR/tasks.json" <<EOF
{
  "features": [
    {"id": "TRD-001", "status": "complete"},
    {"id": "TRD-002", "status": "in_progress"},
    {"id": "TRD-003", "status": "pending"}
  ]
}
EOF

  bash "$SCRIPTS_DIR/setup-autonomous.sh" --task-file tasks.json "Complete features"

  # Simulate some iterations
  sed -i.bak 's/^iteration: 1$/iteration: 10/' "$TEST_DIR/.claude/devflow.local.md"

  # Resume should show progress
  local input='{"match": "resume"}'
  local output
  output=$(PROJECT_ROOT="$TEST_DIR" echo "$input" | bash "$HOOKS_DIR/session-start-hook.sh")

  [[ "$output" == *"1"* ]] && [[ "$output" == *"3"* ]]  # 1/3 progress
}

# =============================================================================
# VERIFICATION GATE INTEGRATION
# =============================================================================

@test "verification failure blocks completion" {
  cd "$TEST_DIR"
  cat > "$TEST_DIR/tasks.json" <<EOF
{"features": [{"id": "TRD-001", "status": "complete"}]}
EOF

  bash "$SCRIPTS_DIR/setup-autonomous.sh" --task-file tasks.json "Complete tasks"

  # Create verification with failures
  mkdir -p "$TEST_DIR/.devflow"
  cat > "$TEST_DIR/.devflow/verification.json" <<EOF
{
  "version": "1.0",
  "categories": {},
  "lastRun": {"passed": 3, "failed": 2, "timestamp": "2024-01-01T00:00:00Z"}
}
EOF

  local transcript_path
  transcript_path=$(create_transcript "Done!")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  local output
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh" 2>&1)

  # Should still be blocked
  [[ -f "$TEST_DIR/.claude/devflow.local.md" ]]
  [[ "$output" == *"verification"* ]] || [[ "$output" == *"Verification"* ]] || [[ "$output" == *"failed"* ]]
}

@test "passing verification allows completion" {
  cd "$TEST_DIR"
  cat > "$TEST_DIR/tasks.json" <<EOF
{"features": [{"id": "TRD-001", "status": "complete"}]}
EOF

  bash "$SCRIPTS_DIR/setup-autonomous.sh" --task-file tasks.json "Complete tasks"

  # Create passing verification
  mkdir -p "$TEST_DIR/.devflow"
  cat > "$TEST_DIR/.devflow/verification.json" <<EOF
{
  "version": "1.0",
  "categories": {},
  "lastRun": {"passed": 5, "failed": 0, "timestamp": "2024-01-01T00:00:00Z"}
}
EOF

  local transcript_path
  transcript_path=$(create_transcript "Done!")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  bash "$HOOKS_DIR/stop-hook.sh" <<< "$input"

  # Should allow completion
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
}

# =============================================================================
# TRD WORKFLOW INTEGRATION
# =============================================================================

@test "TRD workflow: create -> status update -> features sync" {
  cd "$TEST_DIR"

  # Create TRD
  bash "$SCRIPTS_DIR/trd.sh" create "User Authentication"

  # Verify TRD created
  ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md >/dev/null 2>&1

  # Update status
  bash "$SCRIPTS_DIR/trd.sh" status 001 in_progress

  # Sync features
  bash "$SCRIPTS_DIR/features.sh" sync

  # Verify feature list
  [[ -f "$TEST_DIR/.devflow/feature_list.json" ]]
  local status
  status=$(jq -r '.features[0].status' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$status" == "in_progress" ]]

  # Complete TRD
  bash "$SCRIPTS_DIR/trd.sh" status 001 complete
  bash "$SCRIPTS_DIR/features.sh" sync

  status=$(jq -r '.features[0].status' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$status" == "complete" ]]
}

@test "features status updates TRD file" {
  cd "$TEST_DIR"

  bash "$SCRIPTS_DIR/trd.sh" create "Test Feature"
  bash "$SCRIPTS_DIR/features.sh" sync
  bash "$SCRIPTS_DIR/features.sh" status TRD-001 complete

  # Both files should be updated
  local feature_status
  feature_status=$(jq -r '.features[0].status' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$feature_status" == "complete" ]]

  local trd_file
  trd_file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Status | complete |" "$trd_file"
}

# =============================================================================
# LOOP ITERATION TRACKING
# =============================================================================

@test "stop hook maintains iteration count across calls" {
  cd "$TEST_DIR"
  bash "$SCRIPTS_DIR/setup-autonomous.sh" "Test iterations" --max-iterations 100

  local transcript_path
  transcript_path=$(create_transcript "Working...")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  # Call stop hook multiple times
  for i in {1..5}; do
    echo "$input" | bash "$HOOKS_DIR/stop-hook.sh" >/dev/null
  done

  # Should be at iteration 6
  grep -q "^iteration: 6$" "$TEST_DIR/.claude/devflow.local.md"
}

@test "stop hook preserves prompt across iterations" {
  cd "$TEST_DIR"
  bash "$SCRIPTS_DIR/setup-autonomous.sh" "My custom prompt for testing"

  local transcript_path
  transcript_path=$(create_transcript "Working...")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  # Multiple iterations
  for i in {1..3}; do
    echo "$input" | bash "$HOOKS_DIR/stop-hook.sh" >/dev/null
  done

  # Prompt should still be there
  grep -q "My custom prompt for testing" "$TEST_DIR/.claude/devflow.local.md"
}

# =============================================================================
# ERROR RECOVERY
# =============================================================================

@test "handles missing state file gracefully" {
  cd "$TEST_DIR"

  # No setup - just run stop hook
  local transcript_path
  transcript_path=$(create_transcript "Working...")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  local output
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh")

  # Should exit cleanly with no output (no state file = no loop)
  [[ -z "$output" ]]
}

@test "handles corrupt state file" {
  cd "$TEST_DIR"
  mkdir -p "$TEST_DIR/.claude"

  # Create corrupt state file
  cat > "$TEST_DIR/.claude/devflow.local.md" <<EOF
---
iteration: not-a-number
---
prompt
EOF

  local transcript_path
  transcript_path=$(create_transcript "Working...")
  local input='{"transcript_path": "'"$transcript_path"'"}'

  local output
  output=$(echo "$input" | bash "$HOOKS_DIR/stop-hook.sh" 2>&1)

  # Should clean up corrupt file
  [[ ! -f "$TEST_DIR/.claude/devflow.local.md" ]]
}
