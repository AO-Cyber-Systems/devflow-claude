#!/usr/bin/env bats
# TRD Script Tests
# Tests for the TRD management script

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

run_trd() {
  cd "$TEST_DIR" && bash "$SCRIPTS_DIR/trd.sh" "$@"
}

# =============================================================================
# HELP COMMAND
# =============================================================================

@test "shows help with --help" {
  run run_trd --help
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
  [[ "$output" == *"COMMANDS"* ]]
}

@test "shows help with -h" {
  run run_trd -h
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

@test "shows help with no arguments" {
  run run_trd
  [[ $status -eq 0 ]]
  [[ "$output" == *"USAGE"* ]]
}

# =============================================================================
# CREATE COMMAND
# =============================================================================

@test "create generates TRD file" {
  run run_trd create "Test Feature"
  [[ $status -eq 0 ]]
  ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md >/dev/null 2>&1
}

@test "create uses auto-incremented ID" {
  run_trd create "First Feature"
  run_trd create "Second Feature"
  run_trd create "Third Feature"

  ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md >/dev/null 2>&1
  ls "$TEST_DIR/.devflow/trds/TRD-002-"*.md >/dev/null 2>&1
  ls "$TEST_DIR/.devflow/trds/TRD-003-"*.md >/dev/null 2>&1
}

@test "create generates slug from name" {
  run run_trd create "User Authentication Flow"
  ls "$TEST_DIR/.devflow/trds/TRD-001-user-authentication-flow.md" >/dev/null 2>&1
}

@test "create sanitizes special characters in slug" {
  run run_trd create "Test: Feature (v2)!"
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  # Should not contain special chars
  [[ "$file" != *":"* ]]
  [[ "$file" != *"("* ]]
  [[ "$file" != *"!"* ]]
}

@test "create sets default priority to 3" {
  run run_trd create "Test Feature"
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Priority | 3 |" "$file"
}

@test "create sets priority with --priority" {
  run run_trd create "Critical Feature" --priority 1
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Priority | 1 |" "$file"
}

@test "create sets priority with -p" {
  run run_trd create "High Priority" -p 2
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Priority | 2 |" "$file"
}

@test "create sets default effort to medium" {
  run run_trd create "Test Feature"
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Effort | medium |" "$file"
}

@test "create sets effort with --effort" {
  run run_trd create "Large Feature" --effort large
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Effort | large |" "$file"
}

@test "create sets status to pending" {
  run run_trd create "Test Feature"
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Status | pending |" "$file"
}

@test "create includes date in Created field" {
  run run_trd create "Test Feature"
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  local today
  today=$(date +%Y-%m-%d)
  grep -q "| Created | $today |" "$file"
}

@test "create fails without name" {
  run run_trd create
  [[ $status -eq 1 ]]
  [[ "$output" == *"required"* ]] || [[ "$output" == *"Error"* ]]
}

@test "create generates complete template" {
  run run_trd create "Test Feature"
  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)

  # Check for key sections
  grep -q "## Description" "$file"
  grep -q "## Acceptance Criteria" "$file"
  grep -q "## Dependencies" "$file"
  grep -q "## Technical Approach" "$file"
  grep -q "## Verification Steps" "$file"
  grep -q "## Regression Tests to Add" "$file"
}

# =============================================================================
# LIST COMMAND
# =============================================================================

@test "list shows no TRDs message when empty" {
  run run_trd list
  [[ "$output" == *"No TRDs"* ]]
}

@test "list shows TRDs" {
  run_trd create "Feature One"
  run_trd create "Feature Two"

  run run_trd list
  [[ "$output" == *"TRD-001"* ]]
  [[ "$output" == *"TRD-002"* ]]
  [[ "$output" == *"Feature One"* ]]
  [[ "$output" == *"Feature Two"* ]]
}

@test "list shows status" {
  run_trd create "Test Feature"

  run run_trd list
  [[ "$output" == *"pending"* ]]
}

@test "list shows summary counts" {
  run_trd create "Feature One"
  run_trd create "Feature Two"
  run_trd status 001 in_progress

  run run_trd list
  [[ "$output" == *"Pending"* ]] && [[ "$output" == *"1"* ]]
  [[ "$output" == *"In Progress"* ]] && [[ "$output" == *"1"* ]]
}

# =============================================================================
# VIEW COMMAND
# =============================================================================

@test "view shows TRD content" {
  run_trd create "Test Feature"

  run run_trd view 001
  [[ $status -eq 0 ]]
  [[ "$output" == *"TRD-001"* ]]
  [[ "$output" == *"Test Feature"* ]]
}

@test "view works with TRD- prefix" {
  run_trd create "Test Feature"

  run run_trd view TRD-001
  [[ $status -eq 0 ]]
  [[ "$output" == *"TRD-001"* ]]
}

@test "view works with leading zeros" {
  run_trd create "Test Feature"

  run run_trd view 1
  [[ $status -eq 0 ]]
  [[ "$output" == *"TRD-001"* ]]
}

@test "view fails for nonexistent TRD" {
  run run_trd view 999
  [[ $status -ne 0 ]]
}

@test "view fails without ID" {
  run run_trd view
  [[ $status -ne 0 ]]
}

# =============================================================================
# STATUS COMMAND
# =============================================================================

@test "status updates to in_progress" {
  run_trd create "Test Feature"

  run run_trd status 001 in_progress
  [[ $status -eq 0 ]]

  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Status | in_progress |" "$file"
}

@test "status updates to complete" {
  run_trd create "Test Feature"

  run run_trd status 001 complete
  [[ $status -eq 0 ]]

  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Status | complete |" "$file"
}

@test "status updates to blocked" {
  run_trd create "Test Feature"

  run run_trd status 001 blocked
  [[ $status -eq 0 ]]

  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  grep -q "| Status | blocked |" "$file"
}

@test "status updates Updated field" {
  run_trd create "Test Feature"

  # Update to change the Updated date
  sleep 1
  run_trd status 001 in_progress

  local file
  file=$(ls "$TEST_DIR/.devflow/trds/TRD-001-"*.md 2>/dev/null | head -1)
  local today
  today=$(date +%Y-%m-%d)
  grep -q "| Updated | $today |" "$file"
}

@test "status fails with invalid status" {
  run_trd create "Test Feature"

  run run_trd status 001 invalid
  [[ $status -eq 1 ]]
  [[ "$output" == *"Invalid"* ]]
}

@test "status fails without ID" {
  run run_trd status
  [[ $status -ne 0 ]]
}

@test "status fails without status argument" {
  run_trd create "Test Feature"

  run run_trd status 001
  [[ $status -ne 0 ]]
}

@test "status shows reminder on complete" {
  run_trd create "Test Feature"

  run run_trd status 001 complete
  [[ "$output" == *"Reminder"* ]] || [[ "$output" == *"regression"* ]] || [[ "$output" == *"features"* ]]
}

# =============================================================================
# TEMPLATE COMMAND
# =============================================================================

@test "template shows TRD template" {
  run run_trd template
  [[ $status -eq 0 ]]
  [[ "$output" == *"TRD-XXX"* ]]
  [[ "$output" == *"## Description"* ]]
  [[ "$output" == *"## Acceptance Criteria"* ]]
}

# =============================================================================
# ID AUTO-INCREMENT
# =============================================================================

@test "ID auto-increment handles gaps" {
  run_trd create "Feature One"
  run_trd create "Feature Two"

  # Delete TRD-002
  rm "$TEST_DIR/.devflow/trds/TRD-002-"*.md

  run_trd create "Feature Three"

  # Should continue from max ID present (001), so next is 002
  # Since we deleted 002, and 001 still exists, next would be 002 again
  ls "$TEST_DIR/.devflow/trds/TRD-002-"*.md >/dev/null 2>&1
}

@test "ID auto-increment pads with zeros" {
  for i in {1..11}; do
    run_trd create "Feature $i"
  done

  # Check TRD-011 exists with proper padding
  ls "$TEST_DIR/.devflow/trds/TRD-011-"*.md >/dev/null 2>&1
}

# =============================================================================
# UNKNOWN COMMANDS
# =============================================================================

@test "fails on unknown command" {
  run run_trd unknown
  [[ $status -eq 1 ]]
  [[ "$output" == *"Unknown"* ]]
}
