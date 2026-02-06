#!/usr/bin/env bats
# Features Script Tests
# Tests for the feature list generator

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

run_features() {
  cd "$TEST_DIR" && bash "$SCRIPTS_DIR/features.sh" "$@"
}

# =============================================================================
# HELP COMMAND
# =============================================================================

@test "shows help with --help" {
  run run_features --help
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
  [[ "$output" == *"COMMANDS"* ]]
}

@test "shows help with -h" {
  run run_features -h
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

@test "shows help with no arguments" {
  run run_features
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

# =============================================================================
# INIT COMMAND
# =============================================================================

@test "init creates feature_list.json" {
  run run_features init
  [[ $status -eq 0 ]]
  [[ -f "$TEST_DIR/.devflow/feature_list.json" ]]
}

@test "init generates valid JSON" {
  run run_features init
  jq -e '.' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
}

@test "init creates empty features array" {
  run run_features init
  local count
  count=$(jq '.features | length' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$count" == "0" ]]
}

@test "init includes version and source" {
  run run_features init
  jq -e '.version' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
  jq -e '.source' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
}

@test "init fails if feature_list.json exists" {
  run_features init
  run run_features init
  [[ $status -eq 1 ]]
  [[ "$output" == *"already exists"* ]]
}

# =============================================================================
# SYNC COMMAND
# =============================================================================

@test "sync creates feature_list.json when no TRDs" {
  run run_features sync
  [[ -f "$TEST_DIR/.devflow/feature_list.json" ]]
  [[ "$output" == *"No TRDs"* ]] || [[ "$output" == *"empty"* ]]
}

@test "sync parses TRDs" {
  create_trd "001" "First Feature" "pending" "2" "small"
  create_trd "002" "Second Feature" "in_progress" "1" "large"

  run run_features sync

  [[ $status -eq 0 ]]
  [[ -f "$TEST_DIR/.devflow/feature_list.json" ]]

  # Verify features were parsed
  jq -e '.features[] | select(.id == "TRD-001")' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
  jq -e '.features[] | select(.id == "TRD-002")' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
}

@test "sync extracts name from TRD" {
  create_trd "001" "Test Feature Name" "pending"

  run_features sync

  local name
  name=$(jq -r '.features[0].name' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$name" == "Test Feature Name" ]]
}

@test "sync extracts status from TRD" {
  create_trd "001" "Feature" "in_progress"

  run_features sync

  local status
  status=$(jq -r '.features[0].status' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$status" == "in_progress" ]]
}

@test "sync extracts priority from TRD" {
  create_trd "001" "Feature" "pending" "1"

  run_features sync

  local priority
  priority=$(jq '.features[0].priority' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$priority" == "1" ]]
}

@test "sync extracts effort from TRD" {
  create_trd "001" "Feature" "pending" "3" "xlarge"

  run_features sync

  local effort
  effort=$(jq -r '.features[0].effort' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$effort" == "xlarge" ]]
}

@test "sync includes source_file path" {
  create_trd "001" "Feature" "pending"

  run_features sync

  jq -e '.features[0].source_file' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
}

@test "sync includes verification object" {
  create_trd "001" "Feature" "pending"

  run_features sync

  # Check verification object exists (not just truthy values)
  jq -e '.features[0].verification' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
  jq -e '.features[0].verification | has("criteria_met")' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
  jq -e '.features[0].verification | has("tests_pass")' "$TEST_DIR/.devflow/feature_list.json" >/dev/null 2>&1
}

@test "sync shows summary counts" {
  create_trd "001" "Feature One" "pending"
  create_trd "002" "Feature Two" "complete"
  create_trd "003" "Feature Three" "in_progress"

  run run_features sync

  [[ "$output" == *"Pending"* ]] && [[ "$output" == *"1"* ]]
  [[ "$output" == *"Complete"* ]] && [[ "$output" == *"1"* ]]
  [[ "$output" == *"In Progress"* ]] && [[ "$output" == *"1"* ]]
}

# =============================================================================
# LIST COMMAND
# =============================================================================

@test "list fails without feature_list.json" {
  run run_features list
  [[ $status -eq 1 ]]
  [[ "$output" == *"not found"* ]] || [[ "$output" == *"No"* ]]
}

@test "list shows features" {
  create_trd "001" "Test Feature" "pending"
  run_features sync

  run run_features list
  [[ $status -eq 0 ]]
  [[ "$output" == *"TRD-001"* ]]
  [[ "$output" == *"Test Feature"* ]]
}

@test "list shows status" {
  create_trd "001" "Test Feature" "in_progress"
  run_features sync

  run run_features list
  [[ "$output" == *"in_progress"* ]]
}

@test "list shows summary" {
  create_trd "001" "Feature One" "pending"
  create_trd "002" "Feature Two" "complete"
  run_features sync

  run run_features list
  [[ "$output" == *"Total"* ]] && [[ "$output" == *"2"* ]]
}

# =============================================================================
# STATUS COMMAND
# =============================================================================

@test "status fails without feature_list.json" {
  run run_features status TRD-001 complete
  [[ $status -eq 1 ]]
}

@test "status updates feature status" {
  create_trd "001" "Test Feature" "pending"
  run_features sync

  run run_features status TRD-001 complete
  [[ $status -eq 0 ]]

  local feature_status
  feature_status=$(jq -r '.features[] | select(.id == "TRD-001") | .status' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$feature_status" == "complete" ]]
}

@test "status normalizes ID" {
  create_trd "001" "Test Feature" "pending"
  run_features sync

  run run_features status 1 in_progress  # Without TRD- or padding
  [[ $status -eq 0 ]]

  local feature_status
  feature_status=$(jq -r '.features[] | select(.id == "TRD-001") | .status' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$feature_status" == "in_progress" ]]
}

@test "status updates TRD file too" {
  create_trd "001" "Test Feature" "pending"
  run_features sync

  run_features status TRD-001 complete

  local trd_file
  trd_file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Status | complete |" "$trd_file"
}

@test "status fails for nonexistent feature" {
  create_trd "001" "Test Feature" "pending"
  run_features sync

  run run_features status TRD-999 complete
  [[ $status -eq 1 ]]
  [[ "$output" == *"not found"* ]]
}

@test "status fails with invalid status" {
  create_trd "001" "Test Feature" "pending"
  run_features sync

  run run_features status TRD-001 invalid
  [[ $status -eq 1 ]]
  [[ "$output" == *"Invalid"* ]]
}

@test "status fails without arguments" {
  run run_features status
  [[ $status -ne 0 ]]
}

# =============================================================================
# GET COMMAND
# =============================================================================

@test "get fails without feature_list.json" {
  run run_features get TRD-001
  [[ $status -eq 1 ]]
}

@test "get returns feature as JSON" {
  create_trd "001" "Test Feature" "pending" "2" "small"
  run_features sync

  run run_features get TRD-001
  [[ $status -eq 0 ]]

  # Output should be valid JSON
  echo "$output" | jq -e '.' >/dev/null 2>&1
  echo "$output" | jq -e '.id == "TRD-001"' >/dev/null 2>&1
}

@test "get normalizes ID" {
  create_trd "001" "Test Feature" "pending"
  run_features sync

  run run_features get 1  # Without TRD- or padding
  [[ $status -eq 0 ]]
  echo "$output" | jq -e '.id == "TRD-001"' >/dev/null 2>&1
}

@test "get fails without ID" {
  run run_features get
  [[ $status -ne 0 ]]
}

# =============================================================================
# DEPENDENCIES
# =============================================================================

@test "sync extracts dependencies from Blocked By section" {
  # Create TRD with dependencies
  mkdir -p "$TEST_DIR/.devflow/trds"
  cat > "$TEST_DIR/.devflow/trds/TRD-001-test-feature.md" <<EOF
# TRD-001: Test Feature

## Metadata
| Field | Value |
|-------|-------|
| ID | TRD-001 |
| Status | pending |
| Priority | 3 |
| Effort | medium |
| Created | 2024-01-01 |
| Updated | 2024-01-01 |

## Description

Test

## Acceptance Criteria

- [ ] Test

## Dependencies

### Blocked By
- TRD-002
- TRD-003

### Blocks
- None

## Technical Approach

Test

## Verification Steps

### Unit Tests
Test

## Regression Tests to Add

Test
EOF

  create_trd "002" "Dependency One" "complete"
  create_trd "003" "Dependency Two" "in_progress"

  run_features sync

  # Check dependencies were extracted
  local deps
  deps=$(jq -r '.features[] | select(.id == "TRD-001") | .dependencies | join(",")' "$TEST_DIR/.devflow/feature_list.json")
  [[ "$deps" == *"TRD-002"* ]]
  [[ "$deps" == *"TRD-003"* ]]
}

# =============================================================================
# UNKNOWN COMMANDS
# =============================================================================

@test "fails on unknown command" {
  run run_features unknown
  [[ $status -eq 1 ]]
  [[ "$output" == *"Unknown"* ]]
}
