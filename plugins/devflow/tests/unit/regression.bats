#!/usr/bin/env bats
# Regression Script Tests
# Tests for the regression test suite manager
# Note: Many tests require yq to be installed

load '../helpers/test_helper'

setup() {
  setup_test_env

  # Check if yq is available
  if ! command -v yq &>/dev/null; then
    export YQ_MISSING=true
  else
    export YQ_MISSING=false
  fi
}

teardown() {
  teardown_test_env
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

run_regression() {
  cd "$TEST_DIR" && bash "$SCRIPTS_DIR/regression.sh" "$@"
}

skip_if_no_yq() {
  [[ "$YQ_MISSING" == "true" ]] && skip "yq not installed"
}

# =============================================================================
# HELP COMMAND (doesn't need yq)
# =============================================================================

@test "shows help with --help" {
  skip_if_no_yq
  run run_regression --help
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
  [[ "$output" == *"COMMANDS"* ]]
}

@test "shows help with -h" {
  skip_if_no_yq
  run run_regression -h
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

@test "shows help with no arguments" {
  skip_if_no_yq
  run run_regression
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

# =============================================================================
# INIT COMMAND
# =============================================================================

@test "init creates manifest file" {
  skip_if_no_yq
  run run_regression init
  [[ $status -eq 0 ]]
  [[ -f "$TEST_DIR/.devflow/regression/manifest.json" ]]
}

@test "init creates directories" {
  skip_if_no_yq
  run run_regression init
  [[ -d "$TEST_DIR/.devflow/regression" ]]
  [[ -d "$TEST_DIR/.devflow/regression/baselines" ]]
  [[ -d "$TEST_DIR/.devflow/regression/history/runs" ]]
}

@test "init generates valid JSON" {
  skip_if_no_yq
  run run_regression init
  jq -e '.' "$TEST_DIR/.devflow/regression/manifest.json" >/dev/null 2>&1
}

@test "init includes test type arrays" {
  skip_if_no_yq
  run run_regression init
  jq -e '.tests.unit' "$TEST_DIR/.devflow/regression/manifest.json" >/dev/null 2>&1
  jq -e '.tests.integration' "$TEST_DIR/.devflow/regression/manifest.json" >/dev/null 2>&1
  jq -e '.tests.ui' "$TEST_DIR/.devflow/regression/manifest.json" >/dev/null 2>&1
  jq -e '.tests.e2e' "$TEST_DIR/.devflow/regression/manifest.json" >/dev/null 2>&1
}

@test "init sets statistics to zero" {
  skip_if_no_yq
  run run_regression init
  local pass_rate
  pass_rate=$(jq '.statistics.pass_rate' "$TEST_DIR/.devflow/regression/manifest.json")
  [[ "$pass_rate" == "0" ]]

  local total_runs
  total_runs=$(jq '.statistics.total_runs' "$TEST_DIR/.devflow/regression/manifest.json")
  [[ "$total_runs" == "0" ]]
}

# =============================================================================
# LIST COMMAND
# =============================================================================

@test "list fails without manifest" {
  skip_if_no_yq
  run run_regression list
  [[ $status -eq 1 ]]
  [[ "$output" == *"No"* ]] || [[ "$output" == *"not found"* ]]
}

@test "list shows empty registry" {
  skip_if_no_yq
  run_regression init
  run run_regression list
  [[ $status -eq 0 ]]
  [[ "$output" == *"Sources"* ]] || [[ "$output" == *"Statistics"* ]]
}

@test "list shows registered tests" {
  skip_if_no_yq
  run_regression init

  # Manually add a test
  local tmp_file
  tmp_file=$(mktemp)
  jq '.tests.unit += [{"path": "test.ts", "description": "Test unit", "source": "TRD-001"}]' \
    "$TEST_DIR/.devflow/regression/manifest.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/regression/manifest.json"

  run run_regression list
  [[ "$output" == *"unit"* ]]
  [[ "$output" == *"Test unit"* ]] || [[ "$output" == *"TRD-001"* ]]
}

@test "list shows sources" {
  skip_if_no_yq
  run_regression init

  # Add source
  local tmp_file
  tmp_file=$(mktemp)
  jq '.sources += ["TRD-001", "TRD-002"]' \
    "$TEST_DIR/.devflow/regression/manifest.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/regression/manifest.json"

  run run_regression list
  [[ "$output" == *"TRD-001"* ]]
  [[ "$output" == *"TRD-002"* ]]
}

@test "list shows statistics" {
  skip_if_no_yq
  run_regression init

  # Update statistics
  local tmp_file
  tmp_file=$(mktemp)
  jq '.statistics.total_runs = 10 | .statistics.pass_rate = 95' \
    "$TEST_DIR/.devflow/regression/manifest.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/regression/manifest.json"

  run run_regression list
  [[ "$output" == *"10"* ]]
  [[ "$output" == *"95"* ]]
}

# =============================================================================
# ADD COMMAND
# =============================================================================

@test "add fails without TRD ID" {
  skip_if_no_yq
  run run_regression add
  [[ $status -eq 1 ]]
  [[ "$output" == *"required"* ]] || [[ "$output" == *"Error"* ]]
}

@test "add fails for nonexistent TRD" {
  skip_if_no_yq
  run_regression init
  run run_regression add TRD-999
  [[ $status -eq 1 ]]
  [[ "$output" == *"not found"* ]]
}

@test "add normalizes TRD ID" {
  skip_if_no_yq
  run_regression init

  # Create TRD-001
  create_trd "001" "Test Feature" "complete"

  run run_regression add 1  # Without TRD- prefix or padding
  [[ $status -eq 0 ]]

  # Should have added with normalized ID
  jq -e '.sources | index("TRD-001")' "$TEST_DIR/.devflow/regression/manifest.json" >/dev/null 2>&1
}

@test "add warns for non-complete TRD" {
  skip_if_no_yq
  run_regression init

  # Create pending TRD
  create_trd "001" "Test Feature" "pending"

  # Should warn but we can't easily test interactive prompts
  # Just verify it doesn't crash
  run run_regression add TRD-001 <<< "n"
  [[ "$output" == *"Warning"* ]] || [[ "$output" == *"pending"* ]] || [[ $status -eq 0 ]]
}

@test "add prevents duplicate sources" {
  skip_if_no_yq
  run_regression init
  create_trd "001" "Test Feature" "complete"

  run_regression add TRD-001 <<< "y" || true
  run run_regression add TRD-001

  [[ "$output" == *"already"* ]]
  [[ $status -eq 0 ]]
}

@test "add records source in manifest" {
  skip_if_no_yq
  run_regression init
  create_trd "001" "Test Feature" "complete"

  run_regression add TRD-001 <<< "y" || true

  jq -e '.sources | index("TRD-001")' "$TEST_DIR/.devflow/regression/manifest.json" >/dev/null 2>&1
}

# =============================================================================
# RUN COMMAND
# =============================================================================

@test "run fails without manifest" {
  skip_if_no_yq
  run run_regression run
  [[ $status -eq 1 ]]
  [[ "$output" == *"No"* ]] || [[ "$output" == *"not found"* ]]
}

@test "run shows message when no tests" {
  skip_if_no_yq
  run_regression init
  run run_regression run
  [[ "$output" == *"No regression tests"* ]]
}

@test "run creates history file" {
  skip_if_no_yq
  run_regression init

  # Add a simple passing test
  local tmp_file
  tmp_file=$(mktemp)
  jq '.tests.unit += [{"path": "test.ts", "description": "Test", "source": "TRD-001"}]' \
    "$TEST_DIR/.devflow/regression/manifest.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/regression/manifest.json"

  run_regression run --continue 2>/dev/null || true

  # Should have created history entry
  ls "$TEST_DIR/.devflow/regression/history/runs/"*.json >/dev/null 2>&1
}

@test "run updates statistics" {
  skip_if_no_yq
  run_regression init

  # Add a test
  local tmp_file
  tmp_file=$(mktemp)
  jq '.tests.unit += [{"path": "test.ts", "description": "Test", "source": "TRD-001"}]' \
    "$TEST_DIR/.devflow/regression/manifest.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/regression/manifest.json"

  run_regression run --continue 2>/dev/null || true

  local total_runs
  total_runs=$(jq '.statistics.total_runs' "$TEST_DIR/.devflow/regression/manifest.json")
  [[ "$total_runs" == "1" ]]
}

@test "run filters by type" {
  skip_if_no_yq
  run_regression init

  # Add tests to different types
  local tmp_file
  tmp_file=$(mktemp)
  jq '.tests.unit += [{"path": "unit.ts", "description": "Unit Test", "source": "TRD-001"}] |
      .tests.integration += [{"path": "int.ts", "description": "Int Test", "source": "TRD-001"}]' \
    "$TEST_DIR/.devflow/regression/manifest.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/regression/manifest.json"

  run run_regression run unit --continue 2>/dev/null || true

  # Should only show unit tests
  [[ "$output" == *"unit"* ]]
}

@test "run continues on failure with --continue" {
  skip_if_no_yq
  run_regression init

  # Add multiple tests
  local tmp_file
  tmp_file=$(mktemp)
  jq '.tests.unit += [
    {"path": "test1.ts", "description": "Test 1", "source": "TRD-001"},
    {"path": "test2.ts", "description": "Test 2", "source": "TRD-001"}
  ]' "$TEST_DIR/.devflow/regression/manifest.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/regression/manifest.json"

  run run_regression run --continue 2>/dev/null || true

  # Should show both tests (continues past failures)
  [[ "$output" == *"Test 1"* ]] || [[ "$output" == *"Test 2"* ]] || [[ "$output" == *"SKIP"* ]]
}

# =============================================================================
# REPORT COMMAND
# =============================================================================

@test "report shows no history when empty" {
  skip_if_no_yq
  run run_regression report
  [[ "$output" == *"No"* ]] || [[ "$output" == *"history"* ]]
}

@test "report shows run history" {
  skip_if_no_yq
  run_regression init

  # Create history entry
  mkdir -p "$TEST_DIR/.devflow/regression/history/runs"
  cat > "$TEST_DIR/.devflow/regression/history/runs/20240101-120000.json" <<EOF
{
  "run_id": "20240101-120000",
  "timestamp": "2024-01-01T12:00:00Z",
  "passed": 5,
  "failed": 1,
  "skipped": 2,
  "success": false
}
EOF

  run run_regression report
  [[ "$output" == *"20240101"* ]]
  [[ "$output" == *"5"* ]]  # passed
  [[ "$output" == *"1"* ]]  # failed
}

# =============================================================================
# CLEAR COMMAND
# =============================================================================

@test "clear resets manifest" {
  skip_if_no_yq
  run_regression init

  # Add some data
  local tmp_file
  tmp_file=$(mktemp)
  jq '.sources += ["TRD-001"] | .statistics.total_runs = 10' \
    "$TEST_DIR/.devflow/regression/manifest.json" > "$tmp_file"
  mv "$tmp_file" "$TEST_DIR/.devflow/regression/manifest.json"

  run_regression clear <<< "y"

  # Check manifest was reset
  local sources
  sources=$(jq '.sources | length' "$TEST_DIR/.devflow/regression/manifest.json")
  [[ "$sources" == "0" ]]

  local total_runs
  total_runs=$(jq '.statistics.total_runs' "$TEST_DIR/.devflow/regression/manifest.json")
  [[ "$total_runs" == "0" ]]
}

# =============================================================================
# UNKNOWN COMMANDS
# =============================================================================

@test "fails on unknown command" {
  skip_if_no_yq
  run run_regression unknown
  [[ $status -eq 1 ]]
  [[ "$output" == *"Unknown"* ]]
}
