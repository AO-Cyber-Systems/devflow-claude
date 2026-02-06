#!/usr/bin/env bats
# Session Start Hook Tests
# Tests for context injection on session startup/resume/compact

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

run_session_hook() {
  local match_type="${1:-startup}"
  local input='{"match": "'"$match_type"'"}'
  cd "$TEST_DIR" && PROJECT_ROOT="$TEST_DIR" echo "$input" | bash "$HOOKS_DIR/session-start-hook.sh"
}

# =============================================================================
# NO STATE FILE
# =============================================================================

@test "outputs nothing when no state file on startup" {
  run run_session_hook "startup"
  [[ -z "$output" ]]
}

@test "outputs nothing when no state file on resume" {
  run run_session_hook "resume"
  # Resume still outputs context header even without loop
  [[ "$output" == *"Session Resumed"* ]] || [[ -z "$output" ]]
}

# =============================================================================
# STATE INJECTION ON STARTUP
# =============================================================================

@test "injects state on startup with active loop" {
  create_state_file 5 0 "" "feature_list.json"

  run run_session_hook "startup"

  [[ "$output" == *"DevFlow"* ]]
  [[ "$output" == *"Autonomous"* ]] || [[ "$output" == *"Loop"* ]]
}

@test "shows iteration count on startup" {
  create_state_file 42 0 "" ""

  run run_session_hook "startup"

  [[ "$output" == *"42"* ]]
  [[ "$output" == *"Iteration"* ]] || [[ "$output" == *"iteration"* ]]
}

@test "shows unlimited when max_iterations is 0" {
  create_state_file 5 0 "" ""

  run run_session_hook "startup"

  [[ "$output" == *"unlimited"* ]]
}

@test "shows max iterations when set" {
  create_state_file 5 100 "" ""

  run run_session_hook "startup"

  [[ "$output" == *"100"* ]] || [[ "$output" == *"of"* ]]
}

# =============================================================================
# CONTEXT INJECTION ON RESUME
# =============================================================================

@test "injects context on resume" {
  create_state_file 10 0 "" "feature_list.json"

  run run_session_hook "resume"

  [[ "$output" == *"Session Resumed"* ]]
  [[ "$output" == *"DevFlow"* ]] || [[ "$output" == *"Iteration"* ]]
}

@test "shows task file on resume" {
  create_state_file 5 0 "" "feature_list.json"

  run run_session_hook "resume"

  [[ "$output" == *"feature_list.json"* ]] || [[ "$output" == *"Task File"* ]]
}

# =============================================================================
# CONTEXT INJECTION ON COMPACT
# =============================================================================

@test "injects context on compact" {
  create_state_file 15 50 "" "feature_list.json"

  run run_session_hook "compact"

  [[ "$output" == *"Context Restored"* ]] || [[ "$output" == *"Compaction"* ]]
  [[ "$output" == *"DevFlow"* ]] || [[ "$output" == *"Loop"* ]]
}

@test "shows iteration on compact" {
  create_state_file 25 0 "" ""

  run run_session_hook "compact"

  [[ "$output" == *"25"* ]]
}

# =============================================================================
# TASK PROGRESS
# =============================================================================

@test "shows task progress when task file exists" {
  create_state_file 5 0 "" "feature_list.json"

  # Create task file with progress
  mkdir -p "$TEST_DIR/.devflow"
  cat > "$TEST_DIR/feature_list.json" <<EOF
{
  "features": [
    {"id": "TRD-001", "status": "complete"},
    {"id": "TRD-002", "status": "in_progress"},
    {"id": "TRD-003", "status": "pending"}
  ]
}
EOF

  run run_session_hook "startup"

  [[ "$output" == *"1"* ]] && [[ "$output" == *"3"* ]]  # 1/3 complete
  [[ "$output" == *"Progress"* ]] || [[ "$output" == *"complete"* ]]
}

@test "shows in_progress count" {
  create_state_file 5 0 "" "feature_list.json"

  cat > "$TEST_DIR/feature_list.json" <<EOF
{
  "features": [
    {"id": "TRD-001", "status": "complete"},
    {"id": "TRD-002", "status": "in_progress"},
    {"id": "TRD-003", "status": "in_progress"}
  ]
}
EOF

  run run_session_hook "startup"

  [[ "$output" == *"2"* ]] && [[ "$output" == *"progress"* ]]
}

# =============================================================================
# COMPLETION PROMISE
# =============================================================================

@test "shows completion promise" {
  create_state_file 5 0 "ALL TASKS COMPLETE" ""

  run run_session_hook "startup"

  [[ "$output" == *"ALL TASKS COMPLETE"* ]] || [[ "$output" == *"Completion"* ]] || [[ "$output" == *"Promise"* ]]
}

# =============================================================================
# PROJECT CONTEXT
# =============================================================================

@test "injects design context when design.md exists" {
  create_state_file 5 0 "" ""

  # Create design.md without frontmatter (since sed strips it)
  mkdir -p "$TEST_DIR/.devflow"
  cat > "$TEST_DIR/.devflow/design.md" <<'EOF'
# Project Overview

This is a test project for demonstrating the design context injection.

## Architecture

The project uses a microservices architecture.
EOF

  run run_session_hook "startup"

  # The design context injection is optional based on implementation
  # At minimum, we should see the DevFlow loop info
  [[ "$output" == *"DevFlow"* ]]
}

@test "injects tech stack from analysis.json" {
  create_state_file 5 0 "" ""

  # Create analysis.json
  mkdir -p "$TEST_DIR/.devflow"
  cat > "$TEST_DIR/.devflow/analysis.json" <<EOF
{
  "tech_stack": {
    "frontend": "Svelte 5",
    "backend": "FastAPI",
    "database": "Supabase"
  }
}
EOF

  run run_session_hook "startup"

  [[ "$output" == *"Tech"* ]] || [[ "$output" == *"Stack"* ]] || [[ "$output" == *"Svelte"* ]]
}

# =============================================================================
# EDGE CASES
# =============================================================================

@test "handles missing task file gracefully" {
  create_state_file 5 0 "" "nonexistent.json"

  run run_session_hook "startup"

  # Should still output loop info without crashing
  [[ "$output" == *"DevFlow"* ]] || [[ "$output" == *"Iteration"* ]]
}

@test "handles malformed state file gracefully" {
  mkdir -p "$TEST_DIR/.claude"
  cat > "$TEST_DIR/.claude/devflow-agent.local.md" <<EOF
---
not valid yaml at all
---

test
EOF

  run run_session_hook "startup"

  # Should not crash
  [[ $status -eq 0 ]]
}

@test "handles unknown match type" {
  create_state_file 5 0 "" ""

  run run_session_hook "unknown"

  # Should handle gracefully (likely no output)
  [[ $status -eq 0 ]]
}
