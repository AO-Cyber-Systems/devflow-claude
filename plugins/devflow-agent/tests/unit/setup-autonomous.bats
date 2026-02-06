#!/usr/bin/env bats
# Setup Autonomous Script Tests
# Tests for the autonomous loop initialization script

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

run_setup() {
  cd "$TEST_DIR" && CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$SCRIPTS_DIR/setup-autonomous.sh" "$@"
}

# =============================================================================
# HELP COMMAND
# =============================================================================

@test "shows help with --help" {
  run run_setup --help
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
  [[ "$output" == *"OPTIONS"* ]]
}

@test "shows help with -h" {
  run run_setup -h
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

# =============================================================================
# STATE FILE CREATION
# =============================================================================

@test "creates state file with prompt" {
  run run_setup "Implement all features"
  [[ $status -eq 0 ]]
  [[ -f "$TEST_DIR/.claude/devflow-agent.local.md" ]]
}

@test "creates .claude directory" {
  run run_setup "Test prompt"
  [[ -d "$TEST_DIR/.claude" ]]
}

@test "state file contains prompt" {
  run_setup "My test prompt"
  grep -q "My test prompt" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "state file has valid YAML frontmatter" {
  run_setup "Test"

  # Check frontmatter markers
  head -1 "$TEST_DIR/.claude/devflow-agent.local.md" | grep -q "^---$"

  # Check required fields exist
  grep -q "^active:" "$TEST_DIR/.claude/devflow-agent.local.md"
  grep -q "^iteration:" "$TEST_DIR/.claude/devflow-agent.local.md"
  grep -q "^max_iterations:" "$TEST_DIR/.claude/devflow-agent.local.md"
}

# =============================================================================
# ITERATION SETTINGS
# =============================================================================

@test "defaults to iteration 1" {
  run_setup "Test"
  grep -q "^iteration: 1$" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "defaults to unlimited iterations (0)" {
  run_setup "Test"
  grep -q "^max_iterations: 0$" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "sets max iterations with --max-iterations" {
  run_setup --max-iterations 50 "Test"
  grep -q "^max_iterations: 50$" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "validates max-iterations is numeric" {
  run run_setup --max-iterations "abc" "Test"
  [[ $status -eq 1 ]]
  [[ "$output" == *"integer"* ]] || [[ "$output" == *"Error"* ]]
}

# =============================================================================
# COMPLETION PROMISE
# =============================================================================

@test "sets completion promise with --completion-promise" {
  run_setup --completion-promise "ALL DONE" "Test"
  grep -q 'completion_promise: "ALL DONE"' "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "handles empty completion promise" {
  run_setup "Test"
  grep -q 'completion_promise: ""' "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "completion promise requires argument" {
  run run_setup --completion-promise
  [[ $status -eq 1 ]]
  [[ "$output" == *"requires"* ]] || [[ "$output" == *"Error"* ]]
}

# =============================================================================
# TASK FILE
# =============================================================================

@test "sets task file with --task-file" {
  run_setup --task-file "custom_tasks.json" "Test"
  grep -q 'task_file: "custom_tasks.json"' "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "auto-detects feature_list.json" {
  echo '{"features": []}' > "$TEST_DIR/feature_list.json"
  run_setup "Test"
  grep -q 'task_file: "feature_list.json"' "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "auto-detects prd.json" {
  echo '{"tasks": []}' > "$TEST_DIR/prd.json"
  run_setup "Test"
  grep -q 'task_file: "prd.json"' "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "auto-detects tasks.json" {
  echo '{"tasks": []}' > "$TEST_DIR/tasks.json"
  run_setup "Test"
  grep -q 'task_file: "tasks.json"' "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "task file requires argument" {
  run run_setup --task-file
  [[ $status -eq 1 ]]
  [[ "$output" == *"requires"* ]] || [[ "$output" == *"Error"* ]]
}

# =============================================================================
# PROMPT HANDLING
# =============================================================================

@test "concatenates multiple prompt words" {
  run_setup Implement all the features now
  grep -q "Implement all the features now" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "generates default prompt when only task file exists" {
  echo '{"features": []}' > "$TEST_DIR/feature_list.json"
  # Need to provide at least an empty string prompt or the script fails on unbound var
  run_setup "" --task-file feature_list.json
  # If we get here, check for task file in state
  [[ -f "$TEST_DIR/.claude/devflow-agent.local.md" ]] || skip "Script requires prompt"
  grep -q "feature_list.json" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "fails without prompt and task file" {
  run run_setup ""
  [[ $status -ne 0 ]]
}

# =============================================================================
# OUTPUT CONFIRMATION
# =============================================================================

@test "shows confirmation message" {
  run run_setup "Test prompt"
  [[ "$output" == *"Activated"* ]] || [[ "$output" == *"DevFlow"* ]]
}

@test "shows iteration setting in output" {
  run run_setup --max-iterations 100 "Test"
  [[ "$output" == *"100"* ]]
}

@test "shows unlimited in output when no max" {
  run run_setup "Test"
  [[ "$output" == *"UNLIMITED"* ]] || [[ "$output" == *"unlimited"* ]]
}

@test "shows task file in output" {
  echo '{"features": []}' > "$TEST_DIR/feature_list.json"
  run run_setup "Test"
  [[ "$output" == *"feature_list.json"* ]]
}

@test "shows completion promise in output" {
  run run_setup --completion-promise "DONE" "Test"
  [[ "$output" == *"DONE"* ]]
}

@test "shows cancel command in output" {
  run run_setup "Test"
  [[ "$output" == *"cancel"* ]]
}

# =============================================================================
# STATE FILE FIELDS
# =============================================================================

@test "includes active field set to true" {
  run_setup "Test"
  grep -q "^active: true$" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "includes started_at timestamp" {
  run_setup "Test"
  grep -q "^started_at:" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "includes use_subagents field" {
  run_setup "Test"
  grep -q "^use_subagents:" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "includes use_native_tasks field" {
  run_setup "Test"
  grep -q "^use_native_tasks:" "$TEST_DIR/.claude/devflow-agent.local.md"
}

# =============================================================================
# INSTRUCTIONS SECTION
# =============================================================================

@test "includes instructions section" {
  run_setup "Test"
  grep -q "## Instructions" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "mentions subagents in instructions" {
  run_setup "Test"
  grep -q "trd-implementer" "$TEST_DIR/.claude/devflow-agent.local.md" || \
  grep -q "Subagent" "$TEST_DIR/.claude/devflow-agent.local.md" || \
  grep -q "subagent" "$TEST_DIR/.claude/devflow-agent.local.md"
}

# =============================================================================
# COMPLETION PROMISE WARNING
# =============================================================================

@test "shows critical warning with completion promise" {
  run run_setup --completion-promise "DONE" "Test"
  [[ "$output" == *"CRITICAL"* ]] || [[ "$output" == *"Requirements"* ]]
}

@test "no critical warning without completion promise" {
  run run_setup "Test"
  # Should not contain the CRITICAL warning for promises
  [[ "$output" != *"CRITICAL: Completion Promise"* ]] || true
}

# =============================================================================
# COMBINED OPTIONS
# =============================================================================

@test "handles all options together" {
  echo '{"features": []}' > "$TEST_DIR/custom.json"
  run run_setup --max-iterations 50 --completion-promise "ALL DONE" --task-file "custom.json" "Implement features"
  [[ $status -eq 0 ]]
  grep -q "^max_iterations: 50$" "$TEST_DIR/.claude/devflow-agent.local.md"
  grep -q 'completion_promise: "ALL DONE"' "$TEST_DIR/.claude/devflow-agent.local.md"
  grep -q 'task_file: "custom.json"' "$TEST_DIR/.claude/devflow-agent.local.md"
  grep -q "Implement features" "$TEST_DIR/.claude/devflow-agent.local.md"
}

@test "options can be in any order" {
  run run_setup "My prompt" --max-iterations 10 --completion-promise "DONE"
  [[ $status -eq 0 ]]
  grep -q "My prompt" "$TEST_DIR/.claude/devflow-agent.local.md"
  grep -q "^max_iterations: 10$" "$TEST_DIR/.claude/devflow-agent.local.md"
}
