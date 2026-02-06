#!/bin/bash
# DevFlow Anti-Regression Test Suite Manager
# Accumulates and runs regression tests from completed TRDs

set -euo pipefail

# =============================================================================
# DEPENDENCY CHECK
# =============================================================================
check_dependencies() {
  local missing=()

  if ! command -v jq &>/dev/null; then
    missing+=("jq")
  fi

  if ! command -v yq &>/dev/null; then
    missing+=("yq")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Error: Missing required dependencies: ${missing[*]}" >&2
    echo "Install with: brew install ${missing[*]}" >&2
    echo "Or run: /devflow-agent:install" >&2
    exit 1
  fi
}

check_dependencies

# =============================================================================
# CONSTANTS
# =============================================================================
DEVFLOW_DIR=".devflow"
TRD_DIR="$DEVFLOW_DIR/trds"
REGRESSION_DIR="$DEVFLOW_DIR/regression"
MANIFEST_FILE="$REGRESSION_DIR/manifest.json"
BASELINES_DIR="$REGRESSION_DIR/baselines"
HISTORY_DIR="$REGRESSION_DIR/history/runs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# =============================================================================
# HELP
# =============================================================================
show_help() {
  cat <<'HELP_EOF'
DevFlow Anti-Regression Test Suite Manager

USAGE:
  regression.sh <command> [args]

COMMANDS:
  add <trd-id>      Add tests from completed TRD to regression suite
  run [type]        Run all regression tests (or specific type)
  list              List registered regression tests
  report            Show run history and statistics
  init              Initialize regression manifest
  clear             Clear all regression tests (with confirmation)

TEST TYPES:
  unit, integration, ui, e2e

OPTIONS:
  --continue        Continue on failure
  --baseline        Capture new UI baselines (instead of comparing)
  -h, --help        Show this help

EXAMPLES:
  regression.sh add TRD-001        # Add tests from completed TRD
  regression.sh run                # Run all regression tests
  regression.sh run unit           # Run only unit tests
  regression.sh run ui --baseline  # Capture new UI baselines
  regression.sh report             # Show history

The regression suite accumulates tests from completed TRDs to prevent regressions.
HELP_EOF
  exit 0
}

# =============================================================================
# HELPERS
# =============================================================================
ensure_dirs() {
  mkdir -p "$REGRESSION_DIR"
  mkdir -p "$BASELINES_DIR"
  mkdir -p "$HISTORY_DIR"
}

init_manifest() {
  if [[ ! -f "$MANIFEST_FILE" ]]; then
    cat > "$MANIFEST_FILE" <<EOF
{
  "version": "1.0",
  "description": "DevFlow regression test registry",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tests": {
    "unit": [],
    "integration": [],
    "ui": [],
    "e2e": []
  },
  "sources": [],
  "statistics": {
    "total_runs": 0,
    "last_run": null,
    "pass_rate": 0
  }
}
EOF
  fi
}

# Extract regression tests from TRD YAML block
extract_regression_tests() {
  local trd_file=$1
  local trd_id=$2

  # Find the regression YAML block
  local in_block=false
  local yaml_content=""
  local fence_count=0

  while IFS= read -r line; do
    if [[ "$line" == '```yaml' ]] && [[ $fence_count -gt 0 ]]; then
      # We're in a code block after the regression section header
      in_block=true
      continue
    fi
    if [[ "$line" == '```' ]] && [[ "$in_block" == "true" ]]; then
      break
    fi
    if [[ "$line" == "## Regression Tests to Add" ]]; then
      fence_count=1
      continue
    fi
    if [[ "$in_block" == "true" ]]; then
      yaml_content="$yaml_content$line"$'\n'
    fi
  done < "$trd_file"

  echo "$yaml_content"
}

# =============================================================================
# COMMANDS
# =============================================================================

cmd_init() {
  ensure_dirs
  init_manifest
  echo -e "${GREEN}Initialized regression manifest:${NC} $MANIFEST_FILE"
}

cmd_add() {
  local trd_id=$1

  if [[ -z "$trd_id" ]]; then
    echo -e "${RED}Error: TRD ID required${NC}" >&2
    echo "Usage: regression.sh add <trd-id>" >&2
    exit 1
  fi

  # Normalize TRD ID
  trd_id=$(echo "$trd_id" | sed 's/^TRD-//')
  trd_id=$(printf "%03d" "${trd_id#0}")
  local full_id="TRD-$trd_id"

  # Find TRD file
  local trd_file
  trd_file=$(ls "$TRD_DIR"/TRD-"${trd_id}"-*.md 2>/dev/null | head -1 || true)

  if [[ -z "$trd_file" ]] || [[ ! -f "$trd_file" ]]; then
    echo -e "${RED}Error: $full_id not found${NC}" >&2
    exit 1
  fi

  # Check TRD status
  local status
  status=$(grep "| Status |" "$trd_file" | sed 's/.*| Status | //' | sed 's/ |.*//' | head -1)

  if [[ "$status" != "complete" ]]; then
    echo -e "${YELLOW}Warning: $full_id status is '$status', not 'complete'${NC}"
    read -p "Add tests anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 0
    fi
  fi

  ensure_dirs
  init_manifest

  # Check if already added
  if jq -e ".sources | index(\"$full_id\")" "$MANIFEST_FILE" >/dev/null 2>&1; then
    echo -e "${YELLOW}$full_id already in regression suite${NC}"
    exit 0
  fi

  echo -e "${BLUE}Adding tests from $full_id...${NC}"

  # Parse regression section from TRD
  local yaml_content
  yaml_content=$(extract_regression_tests "$trd_file" "$full_id")

  local added_unit=0 added_integration=0 added_ui=0 added_e2e=0
  local tmp_file="${MANIFEST_FILE}.tmp"

  # Parse unit tests
  if echo "$yaml_content" | grep -q "unit:"; then
    local unit_tests
    unit_tests=$(echo "$yaml_content" | yq -o json '.regression.unit // []' 2>/dev/null || echo "[]")
    if [[ "$unit_tests" != "[]" ]] && [[ "$unit_tests" != "null" ]]; then
      # Add source TRD to each test
      unit_tests=$(echo "$unit_tests" | jq --arg src "$full_id" '[.[] | . + {source: $src}]')
      jq --argjson tests "$unit_tests" '.tests.unit += $tests' "$MANIFEST_FILE" > "$tmp_file"
      mv "$tmp_file" "$MANIFEST_FILE"
      added_unit=$(echo "$unit_tests" | jq 'length')
    fi
  fi

  # Parse integration tests
  if echo "$yaml_content" | grep -q "integration:"; then
    local int_tests
    int_tests=$(echo "$yaml_content" | yq -o json '.regression.integration // []' 2>/dev/null || echo "[]")
    if [[ "$int_tests" != "[]" ]] && [[ "$int_tests" != "null" ]]; then
      int_tests=$(echo "$int_tests" | jq --arg src "$full_id" '[.[] | . + {source: $src}]')
      jq --argjson tests "$int_tests" '.tests.integration += $tests' "$MANIFEST_FILE" > "$tmp_file"
      mv "$tmp_file" "$MANIFEST_FILE"
      added_integration=$(echo "$int_tests" | jq 'length')
    fi
  fi

  # Parse UI tests
  if echo "$yaml_content" | grep -q "ui:"; then
    local ui_tests
    ui_tests=$(echo "$yaml_content" | yq -o json '.regression.ui // []' 2>/dev/null || echo "[]")
    if [[ "$ui_tests" != "[]" ]] && [[ "$ui_tests" != "null" ]]; then
      ui_tests=$(echo "$ui_tests" | jq --arg src "$full_id" '[.[] | . + {source: $src}]')
      jq --argjson tests "$ui_tests" '.tests.ui += $tests' "$MANIFEST_FILE" > "$tmp_file"
      mv "$tmp_file" "$MANIFEST_FILE"
      added_ui=$(echo "$ui_tests" | jq 'length')

      # Create baseline directory
      mkdir -p "$BASELINES_DIR/$full_id"
    fi
  fi

  # Parse e2e tests
  if echo "$yaml_content" | grep -q "e2e:"; then
    local e2e_tests
    e2e_tests=$(echo "$yaml_content" | yq -o json '.regression.e2e // []' 2>/dev/null || echo "[]")
    if [[ "$e2e_tests" != "[]" ]] && [[ "$e2e_tests" != "null" ]]; then
      e2e_tests=$(echo "$e2e_tests" | jq --arg src "$full_id" '[.[] | . + {source: $src}]')
      jq --argjson tests "$e2e_tests" '.tests.e2e += $tests' "$MANIFEST_FILE" > "$tmp_file"
      mv "$tmp_file" "$MANIFEST_FILE"
      added_e2e=$(echo "$e2e_tests" | jq 'length')
    fi
  fi

  # Add to sources
  jq --arg src "$full_id" '.sources += [$src]' "$MANIFEST_FILE" > "$tmp_file"
  mv "$tmp_file" "$MANIFEST_FILE"

  # Summary
  local total=$((added_unit + added_integration + added_ui + added_e2e))
  echo ""
  echo -e "${GREEN}Added $total tests from $full_id:${NC}"
  [[ $added_unit -gt 0 ]] && echo "  Unit: $added_unit"
  [[ $added_integration -gt 0 ]] && echo "  Integration: $added_integration"
  [[ $added_ui -gt 0 ]] && echo "  UI: $added_ui"
  [[ $added_e2e -gt 0 ]] && echo "  E2E: $added_e2e"

  if [[ $added_ui -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}Note:${NC} UI tests added. Run with --baseline to capture initial baselines:"
    echo "  regression.sh run ui --baseline"
  fi
}

cmd_run() {
  local type_filter=""
  local continue_on_fail=false
  local capture_baseline=false

  # Parse args
  while [[ $# -gt 0 ]]; do
    case $1 in
      --continue)
        continue_on_fail=true
        shift
        ;;
      --baseline)
        capture_baseline=true
        shift
        ;;
      *)
        type_filter="$1"
        shift
        ;;
    esac
  done

  if [[ ! -f "$MANIFEST_FILE" ]]; then
    echo -e "${YELLOW}No regression manifest found${NC}"
    echo "Run: regression.sh init"
    exit 1
  fi

  local total_tests
  total_tests=$(jq '[.tests.unit, .tests.integration, .tests.ui, .tests.e2e | length] | add' "$MANIFEST_FILE")

  if [[ "$total_tests" -eq 0 ]]; then
    echo -e "${YELLOW}No regression tests registered${NC}"
    echo "Add tests with: regression.sh add <trd-id>"
    exit 0
  fi

  echo -e "${BLUE}Running Regression Tests${NC}"
  echo -e "${BLUE}========================${NC}"
  echo ""

  local passed=0 failed=0 skipped=0
  local failed_tests=""
  local run_id
  run_id=$(date +%Y%m%d-%H%M%S)

  # Determine types to run
  local types
  if [[ -n "$type_filter" ]]; then
    types="$type_filter"
  else
    types="unit integration ui e2e"
  fi

  for test_type in $types; do
    local tests
    tests=$(jq -c ".tests.$test_type[]?" "$MANIFEST_FILE")

    if [[ -z "$tests" ]]; then
      continue
    fi

    echo -e "${CYAN}[$test_type]${NC}"

    while IFS= read -r test; do
      local path description source command

      path=$(echo "$test" | jq -r '.path // empty')
      description=$(echo "$test" | jq -r '.description // "test"')
      source=$(echo "$test" | jq -r '.source // "unknown"')
      scenario=$(echo "$test" | jq -r '.scenario // empty')
      baseline_path=$(echo "$test" | jq -r '.baseline_path // empty')

      if [[ "$test_type" == "ui" ]]; then
        # UI tests handled differently - via Playwright MCP
        if [[ "$capture_baseline" == "true" ]]; then
          echo -e "  ${YELLOW}BASELINE${NC} $scenario (from $source)"
          echo "    Run: /devflow-agent:uitest run $scenario --baseline"
          skipped=$((skipped + 1))
        else
          echo -e "  ${YELLOW}UI TEST${NC} $scenario (from $source)"
          echo "    Run: /devflow-agent:uitest run $scenario"
          skipped=$((skipped + 1))
        fi
        continue
      fi

      # For unit/integration/e2e, check if path exists
      if [[ -n "$path" ]] && [[ ! -f "$path" ]]; then
        echo -e "  ${YELLOW}SKIP${NC} $path (file not found)"
        skipped=$((skipped + 1))
        continue
      fi

      # Build command based on type
      case "$test_type" in
        unit)
          if [[ -f "package.json" ]]; then
            command="npm run test -- --grep \"$path\""
          elif [[ -f "pyproject.toml" ]]; then
            command="poetry run pytest \"$path\" -v"
          else
            command="echo 'No test runner detected'"
          fi
          ;;
        integration)
          if [[ -f "package.json" ]]; then
            command="npm run test:integration -- --grep \"$path\""
          else
            command="poetry run pytest \"$path\" -v -m integration"
          fi
          ;;
        e2e)
          if [[ -f "playwright.config.ts" ]] || [[ -f "playwright.config.js" ]]; then
            command="npx playwright test \"$path\""
          else
            command="npm run test:e2e -- \"$path\""
          fi
          ;;
      esac

      echo -n "  $description... "

      set +e
      timeout 120 bash -c "$command" >/dev/null 2>&1
      local exit_code=$?
      set -e

      if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}PASS${NC}"
        passed=$((passed + 1))
      elif [[ $exit_code -eq 124 ]]; then
        echo -e "${RED}TIMEOUT${NC}"
        failed=$((failed + 1))
        failed_tests="$failed_tests  - $description (timeout)\n"
        if [[ "$continue_on_fail" != "true" ]]; then
          break 2
        fi
      else
        echo -e "${RED}FAIL${NC}"
        failed=$((failed + 1))
        failed_tests="$failed_tests  - $description ($source)\n"
        if [[ "$continue_on_fail" != "true" ]]; then
          break 2
        fi
      fi
    done <<< "$tests"

    echo ""
  done

  # Save run to history
  local history_file="$HISTORY_DIR/$run_id.json"
  jq -n \
    --arg id "$run_id" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson passed "$passed" \
    --argjson failed "$failed" \
    --argjson skipped "$skipped" \
    '{
      run_id: $id,
      timestamp: $ts,
      passed: $passed,
      failed: $failed,
      skipped: $skipped,
      success: ($failed == 0)
    }' > "$history_file"

  # Update statistics
  local total_runs pass_rate
  total_runs=$(jq '.statistics.total_runs + 1' "$MANIFEST_FILE")
  if [[ $((passed + failed)) -gt 0 ]]; then
    pass_rate=$(echo "scale=2; $passed / ($passed + $failed) * 100" | bc)
  else
    pass_rate=0
  fi

  local tmp_file="${MANIFEST_FILE}.tmp"
  jq --argjson runs "$total_runs" \
     --arg last "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --argjson rate "$pass_rate" \
     '.statistics.total_runs = $runs | .statistics.last_run = $last | .statistics.pass_rate = $rate' \
     "$MANIFEST_FILE" > "$tmp_file"
  mv "$tmp_file" "$MANIFEST_FILE"

  # Summary
  echo -e "${BLUE}Summary${NC}"
  echo -e "${BLUE}-------${NC}"
  echo -e "  ${GREEN}Passed: $passed${NC} | ${RED}Failed: $failed${NC} | ${YELLOW}Skipped: $skipped${NC}"

  if [[ $failed -gt 0 ]]; then
    echo ""
    echo -e "${RED}Failed tests:${NC}"
    echo -e "$failed_tests"
    exit 1
  fi

  echo ""
  echo -e "${GREEN}All regression tests passed!${NC}"
  exit 0
}

cmd_list() {
  if [[ ! -f "$MANIFEST_FILE" ]]; then
    echo -e "${YELLOW}No regression manifest found${NC}"
    exit 1
  fi

  echo -e "${BLUE}Regression Test Registry${NC}"
  echo -e "${BLUE}========================${NC}"
  echo ""

  for test_type in unit integration ui e2e; do
    local count
    count=$(jq ".tests.$test_type | length" "$MANIFEST_FILE")

    if [[ "$count" -gt 0 ]]; then
      echo -e "${CYAN}$test_type ($count tests)${NC}"
      jq -r ".tests.$test_type[] | \"  - \(.description // .path // .scenario) [\(.source)]\"" "$MANIFEST_FILE"
      echo ""
    fi
  done

  # Sources
  echo -e "${BLUE}Sources${NC}"
  jq -r '.sources[] | "  - \(.)"' "$MANIFEST_FILE"

  # Statistics
  echo ""
  echo -e "${BLUE}Statistics${NC}"
  jq -r '"  Total runs: \(.statistics.total_runs)\n  Last run: \(.statistics.last_run // "never")\n  Pass rate: \(.statistics.pass_rate)%"' "$MANIFEST_FILE"
}

cmd_report() {
  if [[ ! -d "$HISTORY_DIR" ]]; then
    echo -e "${YELLOW}No run history found${NC}"
    exit 0
  fi

  echo -e "${BLUE}Regression Test History${NC}"
  echo -e "${BLUE}=======================${NC}"
  echo ""

  printf "%-20s %-8s %-8s %-8s %-8s\n" "RUN ID" "PASSED" "FAILED" "SKIPPED" "STATUS"
  printf "%-20s %-8s %-8s %-8s %-8s\n" "--------------------" "--------" "--------" "--------" "--------"

  for file in "$HISTORY_DIR"/*.json; do
    if [[ -f "$file" ]]; then
      local run_id passed failed skipped success
      run_id=$(jq -r '.run_id' "$file")
      passed=$(jq -r '.passed' "$file")
      failed=$(jq -r '.failed' "$file")
      skipped=$(jq -r '.skipped' "$file")
      success=$(jq -r '.success' "$file")

      local status_color
      if [[ "$success" == "true" ]]; then
        status_color="${GREEN}PASS${NC}"
      else
        status_color="${RED}FAIL${NC}"
      fi

      printf "%-20s %-8s %-8s %-8s " "$run_id" "$passed" "$failed" "$skipped"
      echo -e "$status_color"
    fi
  done | tail -20  # Show last 20 runs

  echo ""
  echo "Showing last 20 runs. Full history in: $HISTORY_DIR"
}

cmd_clear() {
  if [[ ! -f "$MANIFEST_FILE" ]]; then
    echo -e "${YELLOW}No regression manifest found${NC}"
    exit 0
  fi

  echo -e "${RED}This will clear all regression tests!${NC}"
  read -p "Are you sure? [y/N] " -n 1 -r
  echo

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
  fi

  # Reset manifest
  cat > "$MANIFEST_FILE" <<EOF
{
  "version": "1.0",
  "description": "DevFlow regression test registry",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tests": {
    "unit": [],
    "integration": [],
    "ui": [],
    "e2e": []
  },
  "sources": [],
  "statistics": {
    "total_runs": 0,
    "last_run": null,
    "pass_rate": 0
  }
}
EOF

  echo -e "${GREEN}Regression suite cleared${NC}"
}

# =============================================================================
# MAIN
# =============================================================================

if [[ $# -eq 0 ]]; then
  show_help
fi

COMMAND=$1
shift

case $COMMAND in
  add)
    cmd_add "$@"
    ;;
  run)
    cmd_run "$@"
    ;;
  list)
    cmd_list
    ;;
  report)
    cmd_report
    ;;
  init)
    cmd_init
    ;;
  clear)
    cmd_clear
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}" >&2
    exit 1
    ;;
esac
