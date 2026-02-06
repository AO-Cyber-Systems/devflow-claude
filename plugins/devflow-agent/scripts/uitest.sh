#!/bin/bash
# DevFlow UI Test Coordinator
# Manages Playwright MCP-based UI tests from TRDs

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
BASELINES_DIR="$REGRESSION_DIR/baselines"
UITEST_DIR="$DEVFLOW_DIR/uitests"

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
DevFlow UI Test Coordinator (Playwright MCP)

USAGE:
  uitest.sh <command> [args]

COMMANDS:
  list              List UI test scenarios from TRDs
  extract <trd-id>  Extract UI test scenarios from TRD to JSON
  run <scenario>    Output Playwright MCP instructions for a scenario
  baseline <trd-id> Output baseline capture instructions
  compare <trd-id>  Output comparison instructions

OPTIONS:
  --trd <id>        Specify TRD for scenario
  -h, --help        Show this help

EXAMPLES:
  uitest.sh list                    # List all UI test scenarios
  uitest.sh extract TRD-001         # Extract scenarios to JSON
  uitest.sh run "Login flow"        # Get Playwright MCP instructions
  uitest.sh baseline TRD-001        # Capture baselines for TRD
  uitest.sh compare TRD-001         # Compare against baselines

NOTE:
  This script generates instructions for Playwright MCP tools.
  The actual UI testing is performed by Claude using the Playwright MCP.
HELP_EOF
  exit 0
}

# =============================================================================
# HELPERS
# =============================================================================
ensure_dirs() {
  mkdir -p "$UITEST_DIR"
  mkdir -p "$BASELINES_DIR"
}

# Extract UI test scenarios from TRD YAML block
extract_ui_tests() {
  local trd_file=$1

  # Find the UI Test Scenarios YAML block
  local in_block=false
  local yaml_content=""
  local found_section=false

  while IFS= read -r line; do
    if [[ "$line" == "## UI Test Scenarios" ]]; then
      found_section=true
      continue
    fi
    if [[ "$found_section" == "true" ]] && [[ "$line" == '```yaml' ]]; then
      in_block=true
      continue
    fi
    if [[ "$line" == '```' ]] && [[ "$in_block" == "true" ]]; then
      break
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

cmd_list() {
  echo -e "${BLUE}UI Test Scenarios${NC}"
  echo -e "${BLUE}=================${NC}"
  echo ""

  if ! ls "$TRD_DIR"/TRD-*.md &>/dev/null; then
    echo -e "${YELLOW}No TRDs found${NC}"
    exit 0
  fi

  local total=0

  for file in "$TRD_DIR"/TRD-*.md; do
    if [[ -f "$file" ]]; then
      local trd_id
      trd_id=$(basename "$file" | grep -o 'TRD-[0-9]*')

      local yaml_content
      yaml_content=$(extract_ui_tests "$file")

      if [[ -n "$yaml_content" ]]; then
        # Parse scenarios
        local scenarios
        scenarios=$(echo "$yaml_content" | yq -o json '.ui_tests // []' 2>/dev/null || echo "[]")

        if [[ "$scenarios" != "[]" ]] && [[ "$scenarios" != "null" ]]; then
          local count
          count=$(echo "$scenarios" | jq 'length')

          if [[ "$count" -gt 0 ]]; then
            echo -e "${CYAN}$trd_id${NC} ($count scenarios)"
            echo "$scenarios" | jq -r '.[] | "  - \(.name): \(.description // "no description")"'
            echo ""
            total=$((total + count))
          fi
        fi
      fi
    fi
  done

  if [[ $total -eq 0 ]]; then
    echo -e "${YELLOW}No UI test scenarios found in TRDs${NC}"
    echo "Add scenarios to TRDs in the '## UI Test Scenarios' section"
  else
    echo "Total: $total scenarios"
  fi
}

cmd_extract() {
  local trd_id=$1

  if [[ -z "$trd_id" ]]; then
    echo -e "${RED}Error: TRD ID required${NC}" >&2
    exit 1
  fi

  # Normalize ID
  trd_id=$(echo "$trd_id" | sed 's/^TRD-//')
  trd_id=$(printf "%03d" "${trd_id#0}")
  local full_id="TRD-$trd_id"

  local trd_file
  trd_file=$(ls "$TRD_DIR"/TRD-"${trd_id}"-*.md 2>/dev/null | head -1 || true)

  if [[ -z "$trd_file" ]] || [[ ! -f "$trd_file" ]]; then
    echo -e "${RED}Error: $full_id not found${NC}" >&2
    exit 1
  fi

  local yaml_content
  yaml_content=$(extract_ui_tests "$trd_file")

  if [[ -z "$yaml_content" ]]; then
    echo -e "${YELLOW}No UI test scenarios in $full_id${NC}"
    exit 0
  fi

  ensure_dirs

  # Convert to JSON and save
  local output_file="$UITEST_DIR/${full_id}-scenarios.json"
  echo "$yaml_content" | yq -o json '.' > "$output_file"

  echo -e "${GREEN}Extracted to:${NC} $output_file"
  cat "$output_file"
}

cmd_run() {
  local scenario_name=$1
  local trd_filter=""

  # Parse args
  shift || true
  while [[ $# -gt 0 ]]; do
    case $1 in
      --trd)
        trd_filter="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done

  if [[ -z "$scenario_name" ]]; then
    echo -e "${RED}Error: Scenario name required${NC}" >&2
    echo "Usage: uitest.sh run <scenario-name> [--trd <id>]" >&2
    exit 1
  fi

  # Find the scenario
  local found=false
  local scenario_json=""

  for file in "$TRD_DIR"/TRD-*.md; do
    if [[ -f "$file" ]]; then
      local trd_id
      trd_id=$(basename "$file" | grep -o 'TRD-[0-9]*')

      # Skip if trd_filter set and doesn't match
      if [[ -n "$trd_filter" ]] && [[ "$trd_id" != "TRD-$trd_filter" ]] && [[ "$trd_id" != "$trd_filter" ]]; then
        continue
      fi

      local yaml_content
      yaml_content=$(extract_ui_tests "$file")

      if [[ -n "$yaml_content" ]]; then
        local scenarios
        scenarios=$(echo "$yaml_content" | yq -o json '.ui_tests // []' 2>/dev/null || echo "[]")

        # Find matching scenario
        local match
        match=$(echo "$scenarios" | jq --arg name "$scenario_name" '.[] | select(.name == $name)')

        if [[ -n "$match" ]] && [[ "$match" != "null" ]]; then
          scenario_json="$match"
          found=true
          break
        fi
      fi
    fi
  done

  if [[ "$found" != "true" ]]; then
    echo -e "${RED}Scenario '$scenario_name' not found${NC}" >&2
    exit 1
  fi

  # Generate Playwright MCP instructions
  echo -e "${BLUE}Playwright MCP Instructions for: $scenario_name${NC}"
  echo -e "${BLUE}============================================${NC}"
  echo ""
  echo "Execute the following Playwright MCP tool calls in sequence:"
  echo ""

  local steps
  steps=$(echo "$scenario_json" | jq -c '.steps[]?')

  local step_num=1
  while IFS= read -r step; do
    if [[ -z "$step" ]]; then continue; fi

    local action
    action=$(echo "$step" | jq -r '.action')

    echo -e "${CYAN}Step $step_num: $action${NC}"

    case "$action" in
      navigate)
        local url
        url=$(echo "$step" | jq -r '.url')
        echo "  Tool: mcp__plugin_playwright_playwright__browser_navigate"
        echo "  Parameters: {\"url\": \"$url\"}"
        ;;
      snapshot)
        local name
        name=$(echo "$step" | jq -r '.name // "snapshot"')
        echo "  Tool: mcp__plugin_playwright_playwright__browser_snapshot"
        echo "  Save as: $name"
        ;;
      click)
        local element ref
        element=$(echo "$step" | jq -r '.description // .element // "element"')
        ref=$(echo "$step" | jq -r '.element // .ref // ""')
        echo "  Tool: mcp__plugin_playwright_playwright__browser_click"
        echo "  Parameters: {\"ref\": \"<from snapshot>\", \"element\": \"$element\"}"
        echo "  Note: Get ref from previous snapshot for element: $ref"
        ;;
      type)
        local text ref
        text=$(echo "$step" | jq -r '.text // ""')
        ref=$(echo "$step" | jq -r '.element // .ref // ""')
        echo "  Tool: mcp__plugin_playwright_playwright__browser_type"
        echo "  Parameters: {\"ref\": \"<from snapshot>\", \"text\": \"$text\"}"
        ;;
      wait_for)
        local text time
        text=$(echo "$step" | jq -r '.text // empty')
        time=$(echo "$step" | jq -r '.time // empty')
        echo "  Tool: mcp__plugin_playwright_playwright__browser_wait_for"
        if [[ -n "$text" ]]; then
          echo "  Parameters: {\"text\": \"$text\"}"
        elif [[ -n "$time" ]]; then
          echo "  Parameters: {\"time\": $time}"
        fi
        ;;
      screenshot)
        local filename
        filename=$(echo "$step" | jq -r '.filename // "screenshot.png"')
        echo "  Tool: mcp__plugin_playwright_playwright__browser_take_screenshot"
        echo "  Parameters: {\"type\": \"png\", \"filename\": \"$filename\"}"
        ;;
      fill_form)
        echo "  Tool: mcp__plugin_playwright_playwright__browser_fill_form"
        local fields
        fields=$(echo "$step" | jq '.fields')
        echo "  Parameters: {\"fields\": $fields}"
        ;;
      evaluate)
        local func
        func=$(echo "$step" | jq -r '.function // ""')
        echo "  Tool: mcp__plugin_playwright_playwright__browser_evaluate"
        echo "  Parameters: {\"function\": \"$func\"}"
        ;;
      *)
        echo "  Unknown action: $action"
        echo "  Raw step: $step"
        ;;
    esac

    echo ""
    step_num=$((step_num + 1))
  done <<< "$steps"

  echo -e "${YELLOW}Note:${NC} Execute these steps using the Playwright MCP tools."
  echo "Get element refs from browser_snapshot output before clicking/typing."
}

cmd_baseline() {
  local trd_id=$1

  if [[ -z "$trd_id" ]]; then
    echo -e "${RED}Error: TRD ID required${NC}" >&2
    exit 1
  fi

  # Normalize ID
  trd_id=$(echo "$trd_id" | sed 's/^TRD-//')
  trd_id=$(printf "%03d" "${trd_id#0}")
  local full_id="TRD-$trd_id"

  local trd_file
  trd_file=$(ls "$TRD_DIR"/TRD-"${trd_id}"-*.md 2>/dev/null | head -1 || true)

  if [[ -z "$trd_file" ]] || [[ ! -f "$trd_file" ]]; then
    echo -e "${RED}Error: $full_id not found${NC}" >&2
    exit 1
  fi

  local yaml_content
  yaml_content=$(extract_ui_tests "$trd_file")

  if [[ -z "$yaml_content" ]]; then
    echo -e "${YELLOW}No UI test scenarios in $full_id${NC}"
    exit 0
  fi

  ensure_dirs
  mkdir -p "$BASELINES_DIR/$full_id"

  echo -e "${BLUE}Baseline Capture Instructions for $full_id${NC}"
  echo -e "${BLUE}===========================================${NC}"
  echo ""
  echo "Capture baseline screenshots for each UI test scenario:"
  echo ""

  local scenarios
  scenarios=$(echo "$yaml_content" | yq -o json '.ui_tests // []' 2>/dev/null || echo "[]")

  echo "$scenarios" | jq -c '.[]' | while IFS= read -r scenario; do
    local name baseline_path
    name=$(echo "$scenario" | jq -r '.name')
    baseline_path=$(echo "$scenario" | jq -r '.baseline_path // empty')

    if [[ -z "$baseline_path" ]]; then
      baseline_path="$BASELINES_DIR/$full_id/$(echo "$name" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')"
    fi

    echo -e "${CYAN}Scenario: $name${NC}"
    echo "  Baseline path: $baseline_path"
    echo "  Steps:"

    echo "$scenario" | jq -c '.steps[]?' | while IFS= read -r step; do
      local action
      action=$(echo "$step" | jq -r '.action')
      if [[ "$action" == "snapshot" ]] || [[ "$action" == "screenshot" ]]; then
        local snap_name
        snap_name=$(echo "$step" | jq -r '.name // "snapshot"')
        echo "    - Capture: ${baseline_path}/${snap_name}.png"
      fi
    done

    echo ""
  done

  echo -e "${YELLOW}Instructions:${NC}"
  echo "1. Run each scenario's steps using Playwright MCP"
  echo "2. At each snapshot/screenshot step, save to the baseline path"
  echo "3. Baselines will be used for regression comparisons"
}

cmd_compare() {
  local trd_id=$1

  if [[ -z "$trd_id" ]]; then
    echo -e "${RED}Error: TRD ID required${NC}" >&2
    exit 1
  fi

  # Normalize ID
  trd_id=$(echo "$trd_id" | sed 's/^TRD-//')
  trd_id=$(printf "%03d" "${trd_id#0}")
  local full_id="TRD-$trd_id"

  local baseline_dir="$BASELINES_DIR/$full_id"

  if [[ ! -d "$baseline_dir" ]]; then
    echo -e "${YELLOW}No baselines found for $full_id${NC}"
    echo "Capture baselines first: uitest.sh baseline $full_id"
    exit 1
  fi

  echo -e "${BLUE}Comparison Instructions for $full_id${NC}"
  echo -e "${BLUE}=====================================${NC}"
  echo ""
  echo "Compare current screenshots against baselines:"
  echo ""
  echo "Baseline directory: $baseline_dir"
  echo ""

  # List baselines
  echo "Baselines to compare:"
  find "$baseline_dir" -name "*.png" -type f | while read -r baseline; do
    echo "  - $baseline"
  done

  echo ""
  echo -e "${YELLOW}Instructions:${NC}"
  echo "1. Run the UI test scenarios using Playwright MCP"
  echo "2. Save screenshots to a temp directory"
  echo "3. Compare each screenshot against its baseline"
  echo "4. Report any visual differences"
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
  list)
    cmd_list
    ;;
  extract)
    cmd_extract "$@"
    ;;
  run)
    cmd_run "$@"
    ;;
  baseline)
    cmd_baseline "$@"
    ;;
  compare)
    cmd_compare "$@"
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}" >&2
    exit 1
    ;;
esac
