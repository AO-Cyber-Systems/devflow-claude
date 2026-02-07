#!/bin/bash
# DevFlow Agent Test Runner
# Runs BATS tests for the devflow plugin

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TESTS_DIR="$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# =============================================================================
# HELP
# =============================================================================

show_help() {
  cat <<'HELP_EOF'
DevFlow Agent Test Runner

USAGE:
  run-tests.sh [category] [options]

CATEGORIES:
  all           Run all tests (default)
  unit          Run unit tests only
  integration   Run integration tests only
  config        Run configuration validation tests only

OPTIONS:
  --verbose, -v   Verbose output (show test details)
  --tap           Output in TAP format
  --jobs, -j <n>  Run tests in parallel (n jobs)
  --filter <pat>  Only run tests matching pattern
  --help, -h      Show this help

EXAMPLES:
  ./run-tests.sh                    # Run all tests
  ./run-tests.sh unit               # Run unit tests
  ./run-tests.sh unit --verbose     # Verbose unit tests
  ./run-tests.sh --filter security  # Only security tests
  ./run-tests.sh -j 4               # Run with 4 parallel jobs

HELP_EOF
  exit 0
}

# =============================================================================
# DEPENDENCY CHECK
# =============================================================================

check_bats() {
  # Check for local bats first
  if [[ -x "$PLUGIN_ROOT/node_modules/.bin/bats" ]]; then
    BATS_CMD="$PLUGIN_ROOT/node_modules/.bin/bats"
    return
  fi
  # Fall back to global bats
  if command -v bats &>/dev/null; then
    BATS_CMD="bats"
    return
  fi
  echo -e "${RED}Error: BATS not installed${NC}"
  echo ""
  echo "Install BATS with one of:"
  echo "  npm install --save-dev bats bats-support bats-assert bats-file"
  echo "  brew install bats-core"
  echo ""
  exit 1
}

# =============================================================================
# MAIN
# =============================================================================

main() {
  local category="all"
  local verbose=""
  local tap=""
  local jobs=""
  local filter=""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      all|unit|integration|config)
        category="$1"
        shift
        ;;
      --verbose|-v)
        verbose="--verbose-run"
        shift
        ;;
      --tap)
        tap="--tap"
        shift
        ;;
      --jobs|-j)
        jobs="--jobs $2"
        shift 2
        ;;
      --filter)
        filter="$2"
        shift 2
        ;;
      --help|-h)
        show_help
        ;;
      *)
        echo -e "${RED}Unknown option: $1${NC}" >&2
        exit 1
        ;;
    esac
  done

  check_bats

  echo -e "${BLUE}DevFlow Agent Test Suite${NC}"
  echo -e "${BLUE}========================${NC}"
  echo ""

  # Build list of test files
  local test_files=()

  case "$category" in
    all)
      test_files+=("$TESTS_DIR"/unit/*.bats)
      test_files+=("$TESTS_DIR"/integration/*.bats)
      test_files+=("$TESTS_DIR"/config/*.bats)
      ;;
    unit)
      test_files+=("$TESTS_DIR"/unit/*.bats)
      ;;
    integration)
      test_files+=("$TESTS_DIR"/integration/*.bats)
      ;;
    config)
      test_files+=("$TESTS_DIR"/config/*.bats)
      ;;
  esac

  # Filter test files if pattern specified
  if [[ -n "$filter" ]]; then
    local filtered=()
    for file in "${test_files[@]}"; do
      if [[ -f "$file" ]] && [[ "$file" == *"$filter"* ]]; then
        filtered+=("$file")
      fi
    done
    test_files=("${filtered[@]}")
  fi

  # Remove non-existent files
  local existing_files=()
  for file in "${test_files[@]}"; do
    if [[ -f "$file" ]]; then
      existing_files+=("$file")
    fi
  done

  if [[ ${#existing_files[@]} -eq 0 ]]; then
    echo -e "${YELLOW}No test files found for category: $category${NC}"
    exit 0
  fi

  echo "Running ${#existing_files[@]} test file(s)..."
  echo ""

  # Build bats command using detected BATS_CMD
  local bats_args=""
  [[ -n "$verbose" ]] && bats_args="$bats_args $verbose"
  [[ -n "$tap" ]] && bats_args="$bats_args $tap"
  [[ -n "$jobs" ]] && bats_args="$bats_args $jobs"

  # Run tests
  if $BATS_CMD $bats_args "${existing_files[@]}"; then
    echo ""
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  else
    echo ""
    echo -e "${RED}Some tests failed${NC}"
    exit 1
  fi
}

main "$@"
