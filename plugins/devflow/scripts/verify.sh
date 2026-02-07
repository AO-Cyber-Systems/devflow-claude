#!/bin/bash
# DevFlow Build Verification Runner
# Runs verification checks from .devflow/verification.json

set -euo pipefail

# =============================================================================
# DEPENDENCY CHECK
# =============================================================================
check_dependencies() {
  local missing=()

  if ! command -v jq &>/dev/null; then
    missing+=("jq")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Error: Missing required dependencies: ${missing[*]}" >&2
    echo "Install with: brew install ${missing[*]}" >&2
    echo "Or run: /devflow:install" >&2
    exit 1
  fi
}

check_dependencies

# =============================================================================
# CONSTANTS
# =============================================================================
DEVFLOW_DIR=".devflow"
VERIFY_FILE="$DEVFLOW_DIR/verification.json"

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
DevFlow Build Verification Runner

USAGE:
  verify.sh <command> [args]

COMMANDS:
  run [category]    Run all checks (or specific category)
  init              Initialize verification.json with defaults
  list              List configured checks
  add <json>        Add a check (JSON format)
  status            Show last run status

CATEGORIES:
  unit, integration, type_check, lint, build

OPTIONS:
  --required        Only run required checks
  --continue        Continue on failure (don't exit on first error)
  -h, --help        Show this help

EXAMPLES:
  verify.sh run                    # Run all checks
  verify.sh run unit               # Run unit tests only
  verify.sh run --required         # Only required checks
  verify.sh init                   # Create verification.json
  verify.sh list                   # Show configured checks

EXIT CODES:
  0 - All checks passed
  1 - One or more checks failed
HELP_EOF
  exit 0
}

# =============================================================================
# HELPERS
# =============================================================================
ensure_dirs() {
  mkdir -p "$DEVFLOW_DIR"
}

# =============================================================================
# DEFAULT VERIFICATION CONFIG
# =============================================================================
generate_default_config() {
  cat <<'EOF'
{
  "version": "1.0",
  "description": "DevFlow verification checks",
  "categories": {
    "unit": {
      "description": "Unit tests",
      "checks": [
        {
          "name": "npm-test",
          "command": "npm run test",
          "timeout": 120,
          "required": true,
          "working_dir": ".",
          "enabled": true,
          "detect": "package.json"
        },
        {
          "name": "pytest",
          "command": "poetry run pytest -x",
          "timeout": 120,
          "required": true,
          "working_dir": ".",
          "enabled": true,
          "detect": "pyproject.toml"
        }
      ]
    },
    "integration": {
      "description": "Integration tests",
      "checks": [
        {
          "name": "npm-test-integration",
          "command": "npm run test:integration",
          "timeout": 300,
          "required": false,
          "working_dir": ".",
          "enabled": true,
          "detect": "package.json"
        }
      ]
    },
    "type_check": {
      "description": "Type checking",
      "checks": [
        {
          "name": "svelte-check",
          "command": "npm run check",
          "timeout": 60,
          "required": true,
          "working_dir": ".",
          "enabled": true,
          "detect": "svelte.config.js"
        },
        {
          "name": "tsc",
          "command": "npx tsc --noEmit",
          "timeout": 60,
          "required": true,
          "working_dir": ".",
          "enabled": true,
          "detect": "tsconfig.json"
        },
        {
          "name": "mypy",
          "command": "poetry run mypy .",
          "timeout": 60,
          "required": false,
          "working_dir": ".",
          "enabled": true,
          "detect": "pyproject.toml"
        }
      ]
    },
    "lint": {
      "description": "Linting",
      "checks": [
        {
          "name": "eslint",
          "command": "npm run lint",
          "timeout": 60,
          "required": true,
          "working_dir": ".",
          "enabled": true,
          "detect": ".eslintrc"
        },
        {
          "name": "ruff",
          "command": "poetry run ruff check .",
          "timeout": 30,
          "required": true,
          "working_dir": ".",
          "enabled": true,
          "detect": "pyproject.toml"
        }
      ]
    },
    "build": {
      "description": "Build verification",
      "checks": [
        {
          "name": "npm-build",
          "command": "npm run build",
          "timeout": 180,
          "required": true,
          "working_dir": ".",
          "enabled": true,
          "detect": "package.json"
        }
      ]
    }
  },
  "lastRun": null
}
EOF
}

# =============================================================================
# COMMANDS
# =============================================================================

cmd_init() {
  ensure_dirs

  if [[ -f "$VERIFY_FILE" ]]; then
    echo -e "${YELLOW}$VERIFY_FILE already exists${NC}"
    read -p "Overwrite? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 0
    fi
  fi

  generate_default_config > "$VERIFY_FILE"
  echo -e "${GREEN}Created:${NC} $VERIFY_FILE"
  echo ""
  echo "Edit to customize checks for your project."
  echo "Checks with 'detect' field auto-enable based on file presence."
}

cmd_list() {
  if [[ ! -f "$VERIFY_FILE" ]]; then
    echo -e "${YELLOW}No $VERIFY_FILE found${NC}"
    echo "Run: verify.sh init"
    exit 1
  fi

  echo -e "${BLUE}Verification Checks${NC}"
  echo -e "${BLUE}===================${NC}"
  echo ""

  for category in unit integration type_check lint build; do
    local desc
    desc=$(jq -r ".categories.$category.description // \"$category\"" "$VERIFY_FILE")
    echo -e "${CYAN}$category${NC} - $desc"

    jq -r ".categories.$category.checks[]? | \"  [\(if .enabled then \"x\" else \" \" end)] \(.name) \(if .required then \"(required)\" else \"\" end)\"" "$VERIFY_FILE"
    echo ""
  done

  # Last run info
  local last_run
  last_run=$(jq -r '.lastRun // empty' "$VERIFY_FILE")
  if [[ -n "$last_run" ]] && [[ "$last_run" != "null" ]]; then
    echo -e "${BLUE}Last Run${NC}"
    local run_time passed failed
    run_time=$(echo "$last_run" | jq -r '.timestamp')
    passed=$(echo "$last_run" | jq -r '.passed')
    failed=$(echo "$last_run" | jq -r '.failed')
    echo "  Time: $run_time"
    echo -e "  ${GREEN}Passed: $passed${NC} | ${RED}Failed: $failed${NC}"
  fi
}

cmd_run() {
  local category_filter=""
  local required_only=false
  local continue_on_fail=false

  # Parse args
  while [[ $# -gt 0 ]]; do
    case $1 in
      --required)
        required_only=true
        shift
        ;;
      --continue)
        continue_on_fail=true
        shift
        ;;
      *)
        category_filter="$1"
        shift
        ;;
    esac
  done

  if [[ ! -f "$VERIFY_FILE" ]]; then
    echo -e "${YELLOW}No $VERIFY_FILE found${NC}"
    echo "Run: verify.sh init"
    exit 1
  fi

  echo -e "${BLUE}Running Verification Checks${NC}"
  echo -e "${BLUE}============================${NC}"
  echo ""

  local total=0
  local passed=0
  local failed=0
  local skipped=0
  local failed_checks=""

  # Determine categories to run
  local categories
  if [[ -n "$category_filter" ]]; then
    categories="$category_filter"
  else
    categories="unit integration type_check lint build"
  fi

  for category in $categories; do
    # Check if category exists
    if ! jq -e ".categories.$category" "$VERIFY_FILE" >/dev/null 2>&1; then
      echo -e "${YELLOW}Category '$category' not found, skipping${NC}"
      continue
    fi

    local cat_desc
    cat_desc=$(jq -r ".categories.$category.description // \"$category\"" "$VERIFY_FILE")
    echo -e "${CYAN}[$category] $cat_desc${NC}"

    # Get checks for this category
    local checks
    checks=$(jq -c ".categories.$category.checks[]?" "$VERIFY_FILE")

    if [[ -z "$checks" ]]; then
      echo "  (no checks configured)"
      echo ""
      continue
    fi

    while IFS= read -r check; do
      local name command timeout required enabled detect working_dir

      name=$(echo "$check" | jq -r '.name')
      command=$(echo "$check" | jq -r '.command')
      timeout=$(echo "$check" | jq -r '.timeout // 60')
      required=$(echo "$check" | jq -r '.required // false')
      enabled=$(echo "$check" | jq -r '.enabled // true')
      detect=$(echo "$check" | jq -r '.detect // empty')
      working_dir=$(echo "$check" | jq -r '.working_dir // "."')

      total=$((total + 1))

      # Skip if not enabled
      if [[ "$enabled" != "true" ]]; then
        echo -e "  ${YELLOW}SKIP${NC} $name (disabled)"
        skipped=$((skipped + 1))
        continue
      fi

      # Skip if required_only and not required
      if [[ "$required_only" == "true" ]] && [[ "$required" != "true" ]]; then
        echo -e "  ${YELLOW}SKIP${NC} $name (not required)"
        skipped=$((skipped + 1))
        continue
      fi

      # Skip if detect file doesn't exist
      if [[ -n "$detect" ]] && [[ ! -e "$detect" ]]; then
        echo -e "  ${YELLOW}SKIP${NC} $name ($detect not found)"
        skipped=$((skipped + 1))
        continue
      fi

      # Run the check
      echo -n "  Running $name... "

      local start_time exit_code
      start_time=$(date +%s)

      # Run with timeout
      set +e
      if [[ "$working_dir" != "." ]]; then
        timeout "$timeout" bash -c "cd \"$working_dir\" && $command" >/dev/null 2>&1
      else
        timeout "$timeout" bash -c "$command" >/dev/null 2>&1
      fi
      exit_code=$?
      set -e

      local end_time duration
      end_time=$(date +%s)
      duration=$((end_time - start_time))

      if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}PASS${NC} (${duration}s)"
        passed=$((passed + 1))
      elif [[ $exit_code -eq 124 ]]; then
        echo -e "${RED}TIMEOUT${NC} (>${timeout}s)"
        failed=$((failed + 1))
        failed_checks="$failed_checks  - $name (timeout)\n"
        if [[ "$continue_on_fail" != "true" ]] && [[ "$required" == "true" ]]; then
          break 2
        fi
      else
        echo -e "${RED}FAIL${NC} (${duration}s)"
        failed=$((failed + 1))
        failed_checks="$failed_checks  - $name (exit $exit_code)\n"
        if [[ "$continue_on_fail" != "true" ]] && [[ "$required" == "true" ]]; then
          break 2
        fi
      fi
    done <<< "$checks"

    echo ""
  done

  # Update lastRun in verification.json
  local tmp_file="${VERIFY_FILE}.tmp"
  jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --argjson passed "$passed" \
     --argjson failed "$failed" \
     --argjson skipped "$skipped" \
     '.lastRun = {timestamp: $ts, passed: $passed, failed: $failed, skipped: $skipped}' \
     "$VERIFY_FILE" > "$tmp_file"
  mv "$tmp_file" "$VERIFY_FILE"

  # Summary
  echo -e "${BLUE}Summary${NC}"
  echo -e "${BLUE}-------${NC}"
  echo -e "  Total: $total | ${GREEN}Passed: $passed${NC} | ${RED}Failed: $failed${NC} | ${YELLOW}Skipped: $skipped${NC}"

  if [[ $failed -gt 0 ]]; then
    echo ""
    echo -e "${RED}Failed checks:${NC}"
    echo -e "$failed_checks"
    exit 1
  fi

  echo ""
  echo -e "${GREEN}All checks passed!${NC}"
  exit 0
}

cmd_status() {
  if [[ ! -f "$VERIFY_FILE" ]]; then
    echo -e "${YELLOW}No $VERIFY_FILE found${NC}"
    exit 1
  fi

  local last_run
  last_run=$(jq -r '.lastRun // empty' "$VERIFY_FILE")

  if [[ -z "$last_run" ]] || [[ "$last_run" == "null" ]]; then
    echo "No verification runs recorded"
    exit 0
  fi

  echo -e "${BLUE}Last Verification Run${NC}"
  echo ""
  jq '.lastRun' "$VERIFY_FILE"
}

cmd_add() {
  local check_json=$1

  if [[ -z "$check_json" ]]; then
    echo -e "${RED}Error: Check JSON required${NC}" >&2
    echo "Usage: verify.sh add '{\"category\": \"unit\", \"name\": \"my-test\", \"command\": \"npm test\", ...}'" >&2
    exit 1
  fi

  if [[ ! -f "$VERIFY_FILE" ]]; then
    echo -e "${YELLOW}No $VERIFY_FILE found, initializing...${NC}"
    cmd_init
  fi

  # Parse the check JSON
  local category name
  category=$(echo "$check_json" | jq -r '.category // "unit"')
  name=$(echo "$check_json" | jq -r '.name')

  if [[ -z "$name" ]] || [[ "$name" == "null" ]]; then
    echo -e "${RED}Error: Check must have a name${NC}" >&2
    exit 1
  fi

  # Remove category from check object (it's used to place the check)
  local check_obj
  check_obj=$(echo "$check_json" | jq 'del(.category)')

  # Add to verification.json
  local tmp_file="${VERIFY_FILE}.tmp"
  jq --arg cat "$category" --argjson check "$check_obj" \
    '.categories[$cat].checks += [$check]' "$VERIFY_FILE" > "$tmp_file"
  mv "$tmp_file" "$VERIFY_FILE"

  echo -e "${GREEN}Added check '$name' to category '$category'${NC}"
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
  run)
    cmd_run "$@"
    ;;
  init)
    cmd_init
    ;;
  list)
    cmd_list
    ;;
  add)
    cmd_add "$@"
    ;;
  status)
    cmd_status
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}" >&2
    exit 1
    ;;
esac
