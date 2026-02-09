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
  trd.sh [options]              Auto-generate TRDs from design.md
  trd.sh <command> [args]       Run a specific command

COMMANDS:
  (default)           Generate TRDs from .devflow/design.md Implementation Plan
  create <name>       Create new TRD with auto-incremented ID
  list                List all TRDs with status
  view <id>           View TRD content
  status <id> <s>     Update TRD status (pending/in_progress/complete/blocked)
  template            Show TRD template

GENERATE OPTIONS:
  --dry-run            Preview TRDs without creating files
  --force              Regenerate even if TRDs already exist

CREATE OPTIONS:
  -p, --priority <n>   Set priority (1=critical, 2=high, 3=medium, 4=low)
  -e, --effort <s>     Set effort estimate (small/medium/large/xlarge)
  -h, --help           Show this help

EXAMPLES:
  trd.sh                     # Generate TRDs from design doc
  trd.sh --dry-run           # Preview what would be generated
  trd.sh --force             # Regenerate TRDs (overwrites)
  trd.sh create "Auth flow"  # Create a single TRD manually
  trd.sh list                # List all TRDs
  trd.sh view 001            # View TRD-001
  trd.sh status 001 complete # Mark TRD-001 complete

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
  local phase=${5:-$priority}
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
| Phase | $phase |
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

cmd_generate() {
  local dry_run=false
  local force=false

  # Parse flags
  while [[ $# -gt 0 ]]; do
    case $1 in
      --dry-run) dry_run=true; shift ;;
      --force)   force=true; shift ;;
      *)
        echo -e "${RED}Error: Unknown option '$1'${NC}" >&2
        echo "Usage: trd.sh [--dry-run] [--force]" >&2
        exit 1
        ;;
    esac
  done

  local design_file="$DEVFLOW_DIR/design.md"

  # Check design.md exists
  if [[ ! -f "$design_file" ]]; then
    echo -e "${RED}Error: $design_file not found${NC}" >&2
    echo "Create one first with: /devflow:design" >&2
    exit 1
  fi

  # Check if TRDs already exist (unless --force)
  if [[ "$force" != true ]] && ls "$TRD_DIR"/TRD-*.md &>/dev/null 2>&1; then
    echo -e "${YELLOW}TRDs already exist in $TRD_DIR/${NC}" >&2
    echo "Use --force to regenerate, or manage individually with 'create/status' commands." >&2
    exit 1
  fi

  # Parse Implementation Plan section
  local in_section=false
  local current_phase=0
  local phase_name=""
  local tasks=()       # task names
  local priorities=()  # mapped priorities
  local phases=()      # original phase numbers

  while IFS= read -r line; do
    # Detect start of Implementation Plan section
    if [[ "$line" == "## Implementation Plan" ]]; then
      in_section=true
      continue
    fi

    # Stop at next h2 section
    if [[ "$in_section" == true ]] && [[ "$line" =~ ^##\  ]] && [[ "$line" != "## Implementation Plan" ]]; then
      break
    fi

    if [[ "$in_section" != true ]]; then
      continue
    fi

    # Parse phase headers: ### Phase N: Name
    if [[ "$line" =~ ^###\ Phase\ ([0-9]+):\ *(.*) ]]; then
      current_phase="${BASH_REMATCH[1]}"
      phase_name="${BASH_REMATCH[2]}"
      continue
    fi
    # Also handle ### Phase N without colon (e.g. "### Phase 1")
    if [[ "$line" =~ ^###\ Phase\ ([0-9]+)$ ]]; then
      current_phase="${BASH_REMATCH[1]}"
      phase_name=""
      continue
    fi

    # Parse task lines: - [ ] Task name
    if [[ "$line" =~ ^-\ \[\ \]\ +(.*) ]]; then
      local task_name="${BASH_REMATCH[1]}"
      tasks+=("$task_name")
      phases+=("$current_phase")
      # Map phase to priority: 1→1, 2→2, 3→3, 4+→4
      local pri=$current_phase
      if [[ $pri -gt 4 ]]; then
        pri=4
      fi
      if [[ $pri -lt 1 ]]; then
        pri=3  # default if no phase header found
      fi
      priorities+=("$pri")
    fi
  done < "$design_file"

  if [[ ${#tasks[@]} -eq 0 ]]; then
    echo -e "${YELLOW}No tasks found in Implementation Plan section${NC}" >&2
    echo "Expected format in $design_file:" >&2
    echo "  ## Implementation Plan" >&2
    echo "  ### Phase 1: Foundation" >&2
    echo "  - [ ] Task name here" >&2
    exit 1
  fi

  # Dry-run: just print what would be created
  if [[ "$dry_run" == true ]]; then
    echo -e "${BLUE}Dry run — TRDs that would be created:${NC}"
    echo ""
    local preview_id
    # Start from next available ID
    local base_id
    base_id=$(get_next_id)
    base_id=$((10#$base_id))  # strip leading zeros for arithmetic

    for i in "${!tasks[@]}"; do
      preview_id=$(printf "%03d" $((base_id + i)))
      local slug
      slug=$(slugify "${tasks[$i]}")
      echo -e "  TRD-${preview_id}-${slug}.md  (priority=${priorities[$i]}, phase=${phases[$i]}, effort=medium)"
      echo -e "    ${CYAN}${tasks[$i]}${NC}"
    done
    echo ""
    echo -e "Total: ${#tasks[@]} TRDs"
    echo -e "Run without --dry-run to create them."
    return 0
  fi

  # Create TRDs
  ensure_dirs
  local created=0

  echo -e "${BLUE}Generating TRDs from design document...${NC}"
  echo ""

  for i in "${!tasks[@]}"; do
    local id
    id=$(get_next_id)
    local name="${tasks[$i]}"
    local pri="${priorities[$i]}"
    local slug
    slug=$(slugify "$name")
    local filename="TRD-${id}-${slug}.md"
    local filepath="$TRD_DIR/$filename"

    local phase="${phases[$i]}"
    if [[ "$phase" -lt 1 ]]; then
      phase=1
    fi
    generate_template "$id" "$name" "$pri" "medium" "$phase" > "$filepath"
    echo -e "  ${GREEN}Created${NC} $filepath  (priority=$pri, phase=$phase)"
    created=$((created + 1))
  done

  echo ""
  echo -e "${GREEN}Generated $created TRDs from design document${NC}"
  echo ""
  echo -e "Next steps:"
  echo -e "  1. Edit each TRD to fill in details"
  echo -e "  2. Run ${BLUE}/devflow:features sync${NC} to update feature_list.json"
}

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
  cmd_generate
  exit 0
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
  --dry-run|--force)
    # Flags for generate — re-parse all args
    cmd_generate "$COMMAND" "$@"
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
