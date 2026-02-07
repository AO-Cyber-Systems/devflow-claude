#!/bin/bash
# DevFlow TRD (Task Requirement Document) Manager
# Create, list, view, and update TRDs with auto-incremented IDs

set -euo pipefail

# =============================================================================
# CONSTANTS
# =============================================================================
DEVFLOW_DIR=".devflow"
TRD_DIR="$DEVFLOW_DIR/trds"

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
DevFlow TRD Manager - Task Requirement Documents

USAGE:
  trd.sh <command> [args] [options]

COMMANDS:
  create <name>     Create new TRD with auto-incremented ID
  list              List all TRDs with status
  view <id>         View TRD content
  status <id> <s>   Update TRD status (pending/in_progress/complete/blocked)
  template          Show TRD template

OPTIONS:
  -p, --priority <n>   Set priority (1=critical, 2=high, 3=medium, 4=low)
  -e, --effort <s>     Set effort estimate (small/medium/large/xlarge)
  -h, --help           Show this help

EXAMPLES:
  trd.sh create "User authentication flow"
  trd.sh create "API rate limiting" --priority 2 --effort medium
  trd.sh list
  trd.sh view 001
  trd.sh status 001 complete

TRD IDs are auto-incremented: TRD-001, TRD-002, etc.
HELP_EOF
  exit 0
}

# =============================================================================
# HELPERS
# =============================================================================
ensure_dirs() {
  mkdir -p "$TRD_DIR"
}

get_next_id() {
  local max_id=0
  if [[ -d "$TRD_DIR" ]]; then
    for file in "$TRD_DIR"/TRD-*.md; do
      if [[ -f "$file" ]]; then
        local id_num
        id_num=$(basename "$file" | sed 's/TRD-\([0-9]*\)-.*/\1/' | sed 's/^0*//')
        if [[ -n "$id_num" ]] && [[ "$id_num" =~ ^[0-9]+$ ]]; then
          if [[ $id_num -gt $max_id ]]; then
            max_id=$id_num
          fi
        fi
      fi
    done
  fi
  printf "%03d" $((max_id + 1))
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//'
}

# =============================================================================
# TRD TEMPLATE
# =============================================================================
generate_template() {
  local id=$1
  local name=$2
  local priority=${3:-3}
  local effort=${4:-medium}
  local slug
  slug=$(slugify "$name")

  cat <<EOF
# TRD-$id: $name

## Metadata
| Field | Value |
|-------|-------|
| ID | TRD-$id |
| Status | pending |
| Priority | $priority |
| Effort | $effort |
| Created | $(date +%Y-%m-%d) |
| Updated | $(date +%Y-%m-%d) |

## Description

<!-- Describe the feature/task in detail -->

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Dependencies

### Blocked By
<!-- TRDs that must be completed first -->
- None

### Blocks
<!-- TRDs that depend on this one -->
- None

## Technical Approach

### Overview
<!-- High-level technical approach -->

### Files to Create/Modify
<!-- List of files that will be affected -->

### Implementation Steps
1. Step 1
2. Step 2
3. Step 3

## Verification Steps

### Unit Tests
\`\`\`yaml
tests:
  - name: "Test case 1"
    command: "npm run test -- --grep 'test pattern'"
    expected: "pass"
\`\`\`

### Integration Tests
\`\`\`yaml
tests:
  - name: "Integration test 1"
    command: "npm run test:integration"
    expected: "pass"
\`\`\`

### Manual Verification
1. Step 1
2. Step 2
3. Verify expected outcome

## UI Test Scenarios

\`\`\`yaml
ui_tests:
  - name: "Scenario name"
    description: "What this test verifies"
    steps:
      - action: navigate
        url: "http://localhost:5173/page"
      - action: snapshot
        name: "initial-state"
      - action: click
        element: "button[name='submit']"
        description: "Submit button"
      - action: wait_for
        text: "Success message"
      - action: snapshot
        name: "after-submit"
    baseline_path: "baselines/TRD-$id/$slug"
\`\`\`

## Regression Tests to Add

\`\`\`yaml
regression:
  unit:
    - path: "src/__tests__/feature.test.ts"
      description: "Unit tests for this feature"
  integration:
    - path: "tests/integration/feature.test.ts"
      description: "Integration tests"
  ui:
    - scenario: "Scenario name"
      baseline_path: "baselines/TRD-$id/$slug"
  e2e:
    - path: "tests/e2e/feature.spec.ts"
      description: "End-to-end tests"
\`\`\`

## Notes

<!-- Additional notes, considerations, edge cases -->
EOF
}

# =============================================================================
# COMMANDS
# =============================================================================

cmd_create() {
  local name=""
  local priority=3
  local effort="medium"

  # Parse args
  while [[ $# -gt 0 ]]; do
    case $1 in
      -p|--priority)
        priority="$2"
        shift 2
        ;;
      -e|--effort)
        effort="$2"
        shift 2
        ;;
      *)
        if [[ -z "$name" ]]; then
          name="$1"
        else
          name="$name $1"
        fi
        shift
        ;;
    esac
  done

  if [[ -z "$name" ]]; then
    echo -e "${RED}Error: TRD name required${NC}" >&2
    echo "Usage: trd.sh create <name> [--priority <n>] [--effort <size>]" >&2
    exit 1
  fi

  ensure_dirs

  local id
  id=$(get_next_id)
  local slug
  slug=$(slugify "$name")
  local filename="TRD-${id}-${slug}.md"
  local filepath="$TRD_DIR/$filename"

  generate_template "$id" "$name" "$priority" "$effort" > "$filepath"

  echo -e "${GREEN}Created:${NC} $filepath"
  echo -e "${CYAN}ID:${NC} TRD-$id"
  echo -e "${CYAN}Name:${NC} $name"
  echo -e "${CYAN}Priority:${NC} $priority"
  echo -e "${CYAN}Effort:${NC} $effort"
  echo ""
  echo -e "Edit the TRD to fill in details, then run:"
  echo -e "  ${BLUE}/devflow:features sync${NC} to update feature_list.json"
}

cmd_list() {
  ensure_dirs

  if ! ls "$TRD_DIR"/TRD-*.md &>/dev/null; then
    echo -e "${YELLOW}No TRDs found${NC}"
    echo "Create one with: trd.sh create <name>"
    exit 0
  fi

  echo -e "${BLUE}TRD List${NC}"
  echo -e "${BLUE}========${NC}"
  echo ""

  printf "%-10s %-40s %-12s %-8s %-8s\n" "ID" "NAME" "STATUS" "PRI" "EFFORT"
  printf "%-10s %-40s %-12s %-8s %-8s\n" "----------" "----------------------------------------" "------------" "--------" "--------"

  for file in "$TRD_DIR"/TRD-*.md; do
    if [[ -f "$file" ]]; then
      local id name status priority effort
      id=$(basename "$file" | sed 's/TRD-\([0-9]*\)-.*/TRD-\1/')

      # Extract from metadata table
      name=$(grep "^# TRD-" "$file" | sed 's/^# TRD-[0-9]*: //' | head -1)
      status=$(grep "| Status |" "$file" | sed 's/.*| Status | //' | sed 's/ |.*//' | head -1)
      priority=$(grep "| Priority |" "$file" | sed 's/.*| Priority | //' | sed 's/ |.*//' | head -1)
      effort=$(grep "| Effort |" "$file" | sed 's/.*| Effort | //' | sed 's/ |.*//' | head -1)

      # Truncate name if too long
      if [[ ${#name} -gt 38 ]]; then
        name="${name:0:35}..."
      fi

      # Color status
      local status_color
      case "$status" in
        complete) status_color="${GREEN}$status${NC}" ;;
        in_progress) status_color="${CYAN}$status${NC}" ;;
        blocked) status_color="${RED}$status${NC}" ;;
        *) status_color="${YELLOW}$status${NC}" ;;
      esac

      printf "%-10s %-40s " "$id" "$name"
      echo -e "${status_color} ${priority}        ${effort}"
    fi
  done
  echo ""

  # Summary
  local total pending in_progress complete blocked
  total=$(find "$TRD_DIR" -name "TRD-*.md" 2>/dev/null | wc -l | tr -d ' \n')
  pending=$(grep -l "| Status | pending |" "$TRD_DIR"/TRD-*.md 2>/dev/null | wc -l | tr -d ' \n') || pending=0
  in_progress=$(grep -l "| Status | in_progress |" "$TRD_DIR"/TRD-*.md 2>/dev/null | wc -l | tr -d ' \n') || in_progress=0
  complete=$(grep -l "| Status | complete |" "$TRD_DIR"/TRD-*.md 2>/dev/null | wc -l | tr -d ' \n') || complete=0
  blocked=$(grep -l "| Status | blocked |" "$TRD_DIR"/TRD-*.md 2>/dev/null | wc -l | tr -d ' \n') || blocked=0

  echo -e "Total: $total | ${YELLOW}Pending: $pending${NC} | ${CYAN}In Progress: $in_progress${NC} | ${GREEN}Complete: $complete${NC} | ${RED}Blocked: $blocked${NC}"
}

cmd_view() {
  local id=$1

  if [[ -z "$id" ]]; then
    echo -e "${RED}Error: TRD ID required${NC}" >&2
    echo "Usage: trd.sh view <id>" >&2
    exit 1
  fi

  # Normalize ID format
  id=$(echo "$id" | sed 's/^TRD-//' | sed 's/^0*//')
  id=$(printf "%03d" "$id")

  local file
  file=$(ls "$TRD_DIR"/TRD-"${id}"-*.md 2>/dev/null | head -1)

  if [[ -z "$file" ]] || [[ ! -f "$file" ]]; then
    echo -e "${RED}Error: TRD-$id not found${NC}" >&2
    exit 1
  fi

  cat "$file"
}

cmd_status() {
  local id=$1
  local new_status=$2

  if [[ -z "$id" ]] || [[ -z "$new_status" ]]; then
    echo -e "${RED}Error: ID and status required${NC}" >&2
    echo "Usage: trd.sh status <id> <pending|in_progress|complete|blocked>" >&2
    exit 1
  fi

  # Validate status
  case "$new_status" in
    pending|in_progress|complete|blocked) ;;
    *)
      echo -e "${RED}Error: Invalid status '$new_status'${NC}" >&2
      echo "Valid statuses: pending, in_progress, complete, blocked" >&2
      exit 1
      ;;
  esac

  # Normalize ID
  id=$(echo "$id" | sed 's/^TRD-//' | sed 's/^0*//')
  id=$(printf "%03d" "$id")

  local file
  file=$(ls "$TRD_DIR"/TRD-"${id}"-*.md 2>/dev/null | head -1)

  if [[ -z "$file" ]] || [[ ! -f "$file" ]]; then
    echo -e "${RED}Error: TRD-$id not found${NC}" >&2
    exit 1
  fi

  # Update status in metadata table (portable sed -i for both GNU and BSD/macOS)
  # Note: new_status is validated above, but we escape it defensively
  local escaped_status
  escaped_status=$(printf '%s\n' "$new_status" | sed 's/[&/\]/\\&/g')
  local current_date
  current_date=$(date +%Y-%m-%d)

  # Create temp file for portable in-place edit
  local tmp_file
  tmp_file=$(mktemp)
  sed "s/| Status | [a-z_]* |/| Status | $escaped_status |/" "$file" > "$tmp_file" && mv "$tmp_file" "$file"

  tmp_file=$(mktemp)
  sed "s/| Updated | [0-9-]* |/| Updated | $current_date |/" "$file" > "$tmp_file" && mv "$tmp_file" "$file"

  echo -e "${GREEN}Updated TRD-$id status to: $new_status${NC}"

  # If completing, remind about regression tests
  if [[ "$new_status" == "complete" ]]; then
    echo ""
    echo -e "${YELLOW}Reminder:${NC} Run these commands to finalize:"
    echo "  /devflow:features sync   # Update feature_list.json"
    echo "  /devflow:regression add TRD-$id  # Add tests to regression suite"
  fi
}

cmd_template() {
  generate_template "XXX" "Feature Name" 3 "medium"
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
  create)
    cmd_create "$@"
    ;;
  list)
    cmd_list
    ;;
  view)
    cmd_view "$@"
    ;;
  status)
    cmd_status "$@"
    ;;
  template)
    cmd_template
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}" >&2
    echo "Run 'trd.sh --help' for usage" >&2
    exit 1
    ;;
esac
