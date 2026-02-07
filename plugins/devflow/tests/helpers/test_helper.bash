#!/bin/bash
# DevFlow Agent Test Helper
# Shared utilities for BATS tests

# =============================================================================
# BATS EXTENSIONS
# =============================================================================

# Get the plugin root directory
_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_PLUGIN_ROOT="$(cd "$_HELPER_DIR/../.." && pwd)"

# Try to load BATS extensions from common locations
load_bats_support() {
  # Try local node_modules first (plugin-level)
  if [[ -f "$_PLUGIN_ROOT/node_modules/bats-support/load.bash" ]]; then
    load "$_PLUGIN_ROOT/node_modules/bats-support/load.bash"
    return
  fi
  # Try npm global
  if [[ -f "/usr/local/lib/node_modules/bats-support/load.bash" ]]; then
    load '/usr/local/lib/node_modules/bats-support/load.bash'
  elif [[ -f "${HOME}/.npm-global/lib/node_modules/bats-support/load.bash" ]]; then
    load "${HOME}/.npm-global/lib/node_modules/bats-support/load.bash"
  elif [[ -f "./node_modules/bats-support/load.bash" ]]; then
    load './node_modules/bats-support/load.bash'
  # Try Homebrew paths
  elif [[ -f "/opt/homebrew/lib/bats-support/load.bash" ]]; then
    load '/opt/homebrew/lib/bats-support/load.bash'
  elif [[ -f "/usr/local/lib/bats-support/load.bash" ]]; then
    load '/usr/local/lib/bats-support/load.bash'
  # Try system paths (Linux)
  elif [[ -f "/usr/lib/bats-support/load.bash" ]]; then
    load '/usr/lib/bats-support/load.bash'
  fi
}

load_bats_assert() {
  # Try local node_modules first (plugin-level)
  if [[ -f "$_PLUGIN_ROOT/node_modules/bats-assert/load.bash" ]]; then
    load "$_PLUGIN_ROOT/node_modules/bats-assert/load.bash"
    return
  fi
  if [[ -f "/usr/local/lib/node_modules/bats-assert/load.bash" ]]; then
    load '/usr/local/lib/node_modules/bats-assert/load.bash'
  elif [[ -f "${HOME}/.npm-global/lib/node_modules/bats-assert/load.bash" ]]; then
    load "${HOME}/.npm-global/lib/node_modules/bats-assert/load.bash"
  elif [[ -f "./node_modules/bats-assert/load.bash" ]]; then
    load './node_modules/bats-assert/load.bash'
  elif [[ -f "/opt/homebrew/lib/bats-assert/load.bash" ]]; then
    load '/opt/homebrew/lib/bats-assert/load.bash'
  elif [[ -f "/usr/local/lib/bats-assert/load.bash" ]]; then
    load '/usr/local/lib/bats-assert/load.bash'
  elif [[ -f "/usr/lib/bats-assert/load.bash" ]]; then
    load '/usr/lib/bats-assert/load.bash'
  fi
}

load_bats_file() {
  # Try local node_modules first (plugin-level)
  if [[ -f "$_PLUGIN_ROOT/node_modules/bats-file/load.bash" ]]; then
    load "$_PLUGIN_ROOT/node_modules/bats-file/load.bash"
    return
  fi
  if [[ -f "/usr/local/lib/node_modules/bats-file/load.bash" ]]; then
    load '/usr/local/lib/node_modules/bats-file/load.bash'
  elif [[ -f "${HOME}/.npm-global/lib/node_modules/bats-file/load.bash" ]]; then
    load "${HOME}/.npm-global/lib/node_modules/bats-file/load.bash"
  elif [[ -f "./node_modules/bats-file/load.bash" ]]; then
    load './node_modules/bats-file/load.bash'
  elif [[ -f "/opt/homebrew/lib/bats-file/load.bash" ]]; then
    load '/opt/homebrew/lib/bats-file/load.bash'
  elif [[ -f "/usr/local/lib/bats-file/load.bash" ]]; then
    load '/usr/local/lib/bats-file/load.bash'
  elif [[ -f "/usr/lib/bats-file/load.bash" ]]; then
    load '/usr/lib/bats-file/load.bash'
  fi
}

# Load all extensions
load_bats_support
load_bats_assert
load_bats_file

# =============================================================================
# PATH SETUP
# =============================================================================

# Get plugin root (relative to this helper file)
BATS_TEST_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PLUGIN_ROOT="$(cd "$BATS_TEST_HELPER_DIR/../.." && pwd)"
export HOOKS_DIR="$PLUGIN_ROOT/hooks"
export SCRIPTS_DIR="$PLUGIN_ROOT/scripts"
export FIXTURES_DIR="$BATS_TEST_HELPER_DIR/../fixtures"

# =============================================================================
# TEST ENVIRONMENT SETUP
# =============================================================================

# Create isolated test environment
setup_test_env() {
  export TEST_DIR=$(mktemp -d)
  export PROJECT_ROOT="$TEST_DIR"
  export ORIGINAL_PWD="$(pwd)"

  # Create standard directories
  mkdir -p "$TEST_DIR/.claude"
  mkdir -p "$TEST_DIR/.devflow/trds"
  mkdir -p "$TEST_DIR/.devflow/regression"

  cd "$TEST_DIR"
}

# Cleanup test environment
teardown_test_env() {
  cd "$ORIGINAL_PWD"
  if [[ -n "$TEST_DIR" ]] && [[ -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
}

# =============================================================================
# HOOK HELPERS
# =============================================================================

# Run a hook with JSON input
run_hook() {
  local hook="$1"
  local input="$2"
  echo "$input" | bash "$HOOKS_DIR/$hook"
}

# Run a hook and capture both stdout and stderr
run_hook_full() {
  local hook="$1"
  local input="$2"
  echo "$input" | bash "$HOOKS_DIR/$hook" 2>&1
}

# Run security hook with a command
run_security_hook() {
  local command="$1"
  local input='{"tool_input": {"command": "'"$command"'"}}'
  run_hook "security-hook.sh" "$input"
}

# =============================================================================
# SCRIPT HELPERS
# =============================================================================

# Run a script from the scripts directory
run_script() {
  local script="$1"
  shift
  bash "$SCRIPTS_DIR/$script" "$@"
}

# =============================================================================
# ASSERTION HELPERS
# =============================================================================

# Assert JSON field equals value
assert_json_field() {
  local json="$1"
  local field="$2"
  local expected="$3"

  local actual
  actual=$(echo "$json" | jq -r "$field")

  if [[ "$actual" != "$expected" ]]; then
    echo "JSON field $field: expected '$expected', got '$actual'"
    return 1
  fi
}

# Assert output contains string
assert_contains() {
  local haystack="$1"
  local needle="$2"

  if [[ "$haystack" != *"$needle"* ]]; then
    echo "Expected to find '$needle' in output"
    echo "Actual output: $haystack"
    return 1
  fi
}

# Assert command is allowed by security hook
assert_command_allowed() {
  local command="$1"
  run run_security_hook "$command"

  # Empty output means allowed (exit 0, no JSON)
  if [[ -n "$output" ]]; then
    # Check if it's a deny response
    if echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then
      echo "Expected command to be allowed: $command"
      echo "Got deny response: $output"
      return 1
    fi
  fi
}

# Assert command is blocked by security hook
assert_command_blocked() {
  local command="$1"
  local expected_reason="${2:-}"

  run run_security_hook "$command"

  # Should have JSON output with deny decision
  if ! echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then
    echo "Expected command to be blocked: $command"
    echo "Got output: $output"
    return 1
  fi

  # Optionally check reason
  if [[ -n "$expected_reason" ]]; then
    local actual_reason
    actual_reason=$(echo "$output" | jq -r '.hookSpecificOutput.permissionDecisionReason')
    if [[ "$actual_reason" != *"$expected_reason"* ]]; then
      echo "Expected reason to contain: $expected_reason"
      echo "Got reason: $actual_reason"
      return 1
    fi
  fi
}

# =============================================================================
# FIXTURE HELPERS
# =============================================================================

# Load a fixture file
load_fixture() {
  local fixture_path="$1"
  cat "$FIXTURES_DIR/$fixture_path"
}

# Copy fixture to test directory
copy_fixture() {
  local fixture_path="$1"
  local dest_path="$2"

  mkdir -p "$(dirname "$TEST_DIR/$dest_path")"
  cp "$FIXTURES_DIR/$fixture_path" "$TEST_DIR/$dest_path"
}

# =============================================================================
# STATE FILE HELPERS
# =============================================================================

# Create a state file for testing stop hook
create_state_file() {
  local iteration="${1:-1}"
  local max_iterations="${2:-0}"
  local completion_promise="${3:-}"
  local task_file="${4:-}"
  local prompt="${5:-Test prompt}"

  mkdir -p "$TEST_DIR/.claude"

  cat > "$TEST_DIR/.claude/devflow.local.md" <<EOF
---
active: true
iteration: $iteration
max_iterations: $max_iterations
completion_promise: "$completion_promise"
task_file: "$task_file"
---

$prompt
EOF
}

# Create a task file for testing
create_task_file() {
  local filename="$1"
  local content="$2"

  echo "$content" > "$TEST_DIR/$filename"
}

# Create a simple feature list with specified statuses
create_feature_list() {
  local features="$1"  # JSON array of features

  cat > "$TEST_DIR/.devflow/feature_list.json" <<EOF
{
  "version": "1.0",
  "features": $features
}
EOF
}

# =============================================================================
# TRD HELPERS
# =============================================================================

# Create a sample TRD file
create_trd() {
  local id="$1"
  local name="$2"
  local status="${3:-pending}"
  local priority="${4:-3}"
  local effort="${5:-medium}"

  local slug
  slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g')

  mkdir -p "$TEST_DIR/.devflow/trds"

  cat > "$TEST_DIR/.devflow/trds/TRD-${id}-${slug}.md" <<EOF
# TRD-$id: $name

## Metadata
| Field | Value |
|-------|-------|
| ID | TRD-$id |
| Status | $status |
| Priority | $priority |
| Effort | $effort |
| Created | 2024-01-01 |
| Updated | 2024-01-01 |

## Description

Test TRD for $name

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Dependencies

### Blocked By
- None

### Blocks
- None

## Technical Approach

### Overview
Test approach

## Verification Steps

### Unit Tests
\`\`\`yaml
tests:
  - name: "Test case 1"
    command: "npm run test"
    expected: "pass"
\`\`\`

## Regression Tests to Add

\`\`\`yaml
regression:
  unit:
    - path: "src/__tests__/feature.test.ts"
      description: "Unit tests for this feature"
\`\`\`
EOF
}

# =============================================================================
# VERIFICATION HELPERS
# =============================================================================

# Create a verification.json file
create_verification_config() {
  local last_run="${1:-}"

  mkdir -p "$TEST_DIR/.devflow"

  if [[ -n "$last_run" ]]; then
    cat > "$TEST_DIR/.devflow/verification.json" <<EOF
{
  "version": "1.0",
  "categories": {},
  "lastRun": $last_run
}
EOF
  else
    cat > "$TEST_DIR/.devflow/verification.json" <<EOF
{
  "version": "1.0",
  "categories": {},
  "lastRun": null
}
EOF
  fi
}

# Create a regression manifest file
create_regression_manifest() {
  local pass_rate="${1:-100}"
  local total_runs="${2:-1}"

  mkdir -p "$TEST_DIR/.devflow/regression"

  cat > "$TEST_DIR/.devflow/regression/manifest.json" <<EOF
{
  "version": "1.0",
  "tests": {
    "unit": [],
    "integration": [],
    "ui": [],
    "e2e": []
  },
  "sources": [],
  "statistics": {
    "total_runs": $total_runs,
    "last_run": "2024-01-01T00:00:00Z",
    "pass_rate": $pass_rate
  }
}
EOF
}

# =============================================================================
# TRANSCRIPT HELPERS
# =============================================================================

# Create a mock transcript file
create_transcript() {
  local last_message="$1"
  local transcript_path="${2:-$TEST_DIR/transcript.jsonl}"

  cat > "$transcript_path" <<EOF
{"role":"assistant","message":{"content":[{"type":"text","text":"$last_message"}]}}
EOF

  echo "$transcript_path"
}
