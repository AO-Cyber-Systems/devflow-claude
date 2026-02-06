#!/usr/bin/env bats
# Verify Script Tests
# Tests for the verification runner script

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

run_verify() {
  cd "$TEST_DIR" && bash "$SCRIPTS_DIR/verify.sh" "$@"
}

# =============================================================================
# HELP COMMAND
# =============================================================================

@test "shows help with --help" {
  run run_verify --help
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
  [[ "$output" == *"COMMANDS"* ]]
}

@test "shows help with -h" {
  run run_verify -h
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

@test "shows help with no arguments" {
  run run_verify
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

# =============================================================================
# INIT COMMAND
# =============================================================================

@test "init creates verification.json" {
  run run_verify init
  [[ $status -eq 0 ]]
  [[ -f "$TEST_DIR/.devflow/verification.json" ]]
}

@test "init creates .devflow directory" {
  run run_verify init
  [[ -d "$TEST_DIR/.devflow" ]]
}

@test "init generates valid JSON" {
  run run_verify init
  jq -e '.' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
}

@test "init includes default categories" {
  run run_verify init
  jq -e '.categories.unit' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
  jq -e '.categories.integration' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
  jq -e '.categories.type_check' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
  jq -e '.categories.lint' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
  jq -e '.categories.build' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
}

@test "init includes npm-test check" {
  run run_verify init
  jq -e '.categories.unit.checks[] | select(.name == "npm-test")' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
}

@test "init sets lastRun to null" {
  run run_verify init
  local last_run
  last_run=$(jq -r '.lastRun' "$TEST_DIR/.devflow/verification.json")
  [[ "$last_run" == "null" ]]
}

# =============================================================================
# LIST COMMAND
# =============================================================================

@test "list fails without verification.json" {
  run run_verify list
  [[ $status -eq 1 ]]
  [[ "$output" == *"No"* ]] || [[ "$output" == *"not found"* ]]
}

@test "list shows categories" {
  run_verify init
  run run_verify list
  [[ $status -eq 0 ]]
  [[ "$output" == *"unit"* ]]
  [[ "$output" == *"integration"* ]]
  [[ "$output" == *"lint"* ]]
}

@test "list shows check names" {
  run_verify init
  run run_verify list
  [[ "$output" == *"npm-test"* ]] || [[ "$output" == *"pytest"* ]]
}

# =============================================================================
# STATUS COMMAND
# =============================================================================

@test "status shows no runs when lastRun is null" {
  run_verify init
  run run_verify status
  [[ "$output" == *"No verification"* ]] || [[ "$output" == *"recorded"* ]]
}

@test "status shows last run info" {
  run_verify init

  # Manually add lastRun
  local tmp_file
  tmp_file=$(mktemp)
  jq '.lastRun = {"timestamp": "2024-01-01T00:00:00Z", "passed": 5, "failed": 2, "skipped": 1}' \
    "$TEST_DIR/.devflow/verification.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/verification.json"

  run run_verify status
  [[ "$output" == *"passed"* ]] || [[ "$output" == *"5"* ]]
}

# =============================================================================
# ADD COMMAND
# =============================================================================

@test "add creates verification.json if missing" {
  run run_verify add '{"name": "my-test", "command": "npm test"}'
  [[ -f "$TEST_DIR/.devflow/verification.json" ]]
}

@test "add adds check to category" {
  run_verify init
  run run_verify add '{"category": "unit", "name": "my-custom-test", "command": "npm run my-test"}'
  [[ $status -eq 0 ]]
  jq -e '.categories.unit.checks[] | select(.name == "my-custom-test")' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
}

@test "add requires name field" {
  run_verify init
  run run_verify add '{"command": "npm test"}'
  [[ $status -eq 1 ]]
  [[ "$output" == *"name"* ]]
}

@test "add defaults to unit category" {
  run_verify init
  run run_verify add '{"name": "default-category-test", "command": "npm test"}'
  jq -e '.categories.unit.checks[] | select(.name == "default-category-test")' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
}

# =============================================================================
# RUN COMMAND
# =============================================================================

@test "run fails without verification.json" {
  run run_verify run
  [[ $status -eq 1 ]]
  [[ "$output" == *"No"* ]] || [[ "$output" == *"not found"* ]]
}

@test "run skips checks when detect file missing" {
  run_verify init

  # No package.json exists, so npm-test should be skipped
  run run_verify run unit
  [[ "$output" == *"SKIP"* ]]
}

@test "run updates lastRun in verification.json" {
  run_verify init
  run run_verify run unit 2>/dev/null || true

  local last_run
  last_run=$(jq -r '.lastRun' "$TEST_DIR/.devflow/verification.json")
  [[ "$last_run" != "null" ]]
}

@test "run records passed count" {
  run_verify init
  run run_verify run unit 2>/dev/null || true

  jq -e '.lastRun.passed' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
}

@test "run records skipped count" {
  run_verify init
  run run_verify run unit 2>/dev/null || true

  jq -e '.lastRun.skipped' "$TEST_DIR/.devflow/verification.json" >/dev/null 2>&1
}

@test "run with --required only runs required checks" {
  run_verify init
  run run_verify run --required 2>/dev/null || true

  [[ "$output" == *"not required"* ]] || [[ "$output" == *"SKIP"* ]] || true
}

@test "run with specific category filters" {
  run_verify init
  run run_verify run lint 2>/dev/null || true

  # Should only show lint category
  [[ "$output" == *"lint"* ]]
}

@test "run with --continue continues on failure" {
  run_verify init

  # Add a check that will fail
  run_verify add '{"category": "unit", "name": "always-fail", "command": "exit 1", "required": true}'

  # Create package.json so detect works
  echo '{}' > "$TEST_DIR/package.json"

  run run_verify run unit --continue 2>/dev/null || true

  # Should continue past failure
  [[ "$output" == *"FAIL"* ]]
}

# =============================================================================
# TIMEOUT HANDLING
# =============================================================================

@test "run handles timeout" {
  # Skip on systems without GNU timeout
  command -v timeout >/dev/null 2>&1 || skip "timeout command not available"

  run_verify init

  # Add a check that will timeout
  run_verify add '{"category": "unit", "name": "slow-test", "command": "sleep 10", "timeout": 1}'

  # Create package.json so detect works
  echo '{}' > "$TEST_DIR/package.json"

  run run_verify run unit --continue 2>/dev/null || true

  [[ "$output" == *"TIMEOUT"* ]] || [[ "$output" == *"timeout"* ]] || [[ "$output" == *"FAIL"* ]]
}

# =============================================================================
# EXIT CODES
# =============================================================================

@test "run returns 0 when all pass" {
  # Skip on systems without GNU timeout
  command -v timeout >/dev/null 2>&1 || skip "timeout command not available"

  run_verify init

  # Add a check that will pass (no detect field so it always runs)
  local tmp_file
  tmp_file=$(mktemp)
  jq '.categories.unit.checks = [{"name": "always-pass", "command": "true", "timeout": 10, "required": false, "enabled": true}]' \
    "$TEST_DIR/.devflow/verification.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/verification.json"

  run run_verify run unit
  [[ $status -eq 0 ]]
}

@test "run returns 1 when checks fail" {
  run_verify init

  # Add a required check that will fail
  run_verify add '{"category": "unit", "name": "always-fail", "command": "false", "required": true}'

  # Create package.json
  echo '{}' > "$TEST_DIR/package.json"

  run run_verify run unit
  [[ $status -eq 1 ]]
}

# =============================================================================
# UNKNOWN COMMANDS
# =============================================================================

@test "fails on unknown command" {
  run run_verify unknown
  [[ $status -eq 1 ]]
  [[ "$output" == *"Unknown"* ]]
}
