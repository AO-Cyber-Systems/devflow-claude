#!/bin/bash
# DevFlow Feature List Generator
# Parses TRDs and generates feature_list.json for autonomous loop tracking

set -euo pipefail

# =============================================================================
# CONSTANTS
# =============================================================================
DEVFLOW_DIR=".devflow"
TRD_DIR="$DEVFLOW_DIR/trds"
FEATURE_FILE="$DEVFLOW_DIR/feature_list.json"

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
DevFlow Feature List Generator

USAGE:
  features.sh <command> [args]

COMMANDS:
  sync              Parse TRDs and regenerate feature_list.json
  list              List features with status
  status <id> <s>   Update feature status manually
  get <id>          Get feature details as JSON
  init              Initialize empty feature_list.json

OPTIONS:
  -h, --help        Show this help

EXAMPLES:
  features.sh sync             # Regenerate from TRDs
  features.sh list             # Show all features
  features.sh status TRD-001 complete
  features.sh get TRD-001

The feature_list.json is used by the autonomous loop to track progress.
HELP_EOF
  exit 0
}

# =============================================================================
# HELPERS
# =============================================================================
ensure_dirs() {
  mkdir -p "$DEVFLOW_DIR"
  mkdir -p "$TRD_DIR"
}

# Extract value from TRD metadata table
extract_metadata() {
  local file=$1
  local field=$2
  grep "| $field |" "$file" 2>/dev/null | sed "s/.*| $field | //" | sed 's/ |.*//' | head -1
}

# Extract blocked_by from TRD
extract_blocked_by() {
  local file=$1
  # Look in Dependencies > Blocked By section
  local in_section=false
  local deps=""
  while IFS= read -r line; do
    if [[ "$line" == "### Blocked By" ]]; then
      in_section=true
      continue
    fi
    if [[ "$line" == "### "* ]] && [[ "$in_section" == "true" ]]; then
      break
    fi
    if [[ "$in_section" == "true" ]] && [[ "$line" == "- TRD-"* ]]; then
      local dep_id
      dep_id=$(echo "$line" | grep -o 'TRD-[0-9]*' | head -1)
      if [[ -n "$dep_id" ]]; then
        if [[ -n "$deps" ]]; then
          deps="$deps,$dep_id"
        else
          deps="$dep_id"
        fi
      fi
    fi
  done < "$file"
  echo "$deps"
}

# =============================================================================
# COMMANDS
# =============================================================================

cmd_sync() {
  ensure_dirs

  if ! ls "$TRD_DIR"/TRD-*.md &>/dev/null; then
    echo -e "${YELLOW}No TRDs found in $TRD_DIR${NC}"
    echo "Create TRDs with: /devflow:trd create <name>"

    # Create empty feature list
    cat > "$FEATURE_FILE" <<EOF
{
  "version": "1.0",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "$TRD_DIR",
  "features": []
}
EOF
    echo -e "${GREEN}Created empty:${NC} $FEATURE_FILE"
    exit 0
  fi

  echo -e "${BLUE}Syncing features from TRDs...${NC}"
  echo ""

  # Build features array
  local features_json="["
  local first=true

  for file in "$TRD_DIR"/TRD-*.md; do
    if [[ -f "$file" ]]; then
      local id name status priority effort blocked_by

      # Extract ID from filename
      id=$(basename "$file" | grep -o 'TRD-[0-9]*')

      # Extract from metadata
      name=$(grep "^# TRD-" "$file" | sed 's/^# TRD-[0-9]*: //' | head -1)
      status=$(extract_metadata "$file" "Status")
      priority=$(extract_metadata "$file" "Priority")
      effort=$(extract_metadata "$file" "Effort")
      blocked_by=$(extract_blocked_by "$file")

      # Convert status for task tracking
      local track_status="$status"
      if [[ "$status" == "complete" ]]; then
        track_status="complete"
      elif [[ "$status" == "blocked" ]]; then
        track_status="blocked"
      elif [[ "$status" == "in_progress" ]]; then
        track_status="in_progress"
      else
        track_status="pending"
      fi

      # Check verification status (look for checked boxes in acceptance criteria)
      local total_criteria checked_criteria verified
      total_criteria=$(grep -c '^\- \[' "$file" 2>/dev/null | tr -d '\n' || echo "0")
      checked_criteria=$(grep -c '^\- \[x\]' "$file" 2>/dev/null | tr -d '\n' || echo "0")
      if [[ "$total_criteria" -gt 0 ]] && [[ "$checked_criteria" -eq "$total_criteria" ]]; then
        verified="true"
      else
        verified="false"
      fi

      # Build dependencies array
      local deps_json="[]"
      if [[ -n "$blocked_by" ]]; then
        deps_json=$(echo "$blocked_by" | tr ',' '\n' | jq -R . | jq -s .)
      fi

      # Build feature JSON
      local feature_json
      feature_json=$(jq -n \
        --arg id "$id" \
        --arg name "$name" \
        --arg status "$track_status" \
        --arg priority "$priority" \
        --arg effort "$effort" \
        --argjson verified "$verified" \
        --argjson deps "$deps_json" \
        --arg file "$file" \
        '{
          id: $id,
          name: $name,
          status: $status,
          priority: ($priority | tonumber? // 3),
          effort: $effort,
          dependencies: $deps,
          verification: {
            criteria_met: $verified,
            tests_pass: false,
            regression_added: false
          },
          source_file: $file
        }')

      if [[ "$first" == "true" ]]; then
        features_json="$features_json$feature_json"
        first=false
      else
        features_json="$features_json,$feature_json"
      fi

      # Color status for display
      local status_color
      case "$track_status" in
        complete) status_color="${GREEN}$track_status${NC}" ;;
        in_progress) status_color="${CYAN}$track_status${NC}" ;;
        blocked) status_color="${RED}$track_status${NC}" ;;
        *) status_color="${YELLOW}$track_status${NC}" ;;
      esac

      echo -e "  $id: $name [${status_color}]"
    fi
  done

  features_json="$features_json]"

  # Write feature_list.json
  jq -n \
    --arg version "1.0" \
    --arg generated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg source "$TRD_DIR" \
    --argjson features "$features_json" \
    '{
      version: $version,
      generated_at: $generated,
      source: $source,
      features: $features
    }' > "$FEATURE_FILE"

  echo ""
  echo -e "${GREEN}Generated:${NC} $FEATURE_FILE"

  # Summary
  local total pending in_progress complete blocked
  total=$(echo "$features_json" | jq 'length')
  pending=$(echo "$features_json" | jq '[.[] | select(.status == "pending")] | length')
  in_progress=$(echo "$features_json" | jq '[.[] | select(.status == "in_progress")] | length')
  complete=$(echo "$features_json" | jq '[.[] | select(.status == "complete")] | length')
  blocked=$(echo "$features_json" | jq '[.[] | select(.status == "blocked")] | length')

  echo ""
  echo -e "Total: $total | ${YELLOW}Pending: $pending${NC} | ${CYAN}In Progress: $in_progress${NC} | ${GREEN}Complete: $complete${NC} | ${RED}Blocked: $blocked${NC}"
}

cmd_list() {
  if [[ ! -f "$FEATURE_FILE" ]]; then
    echo -e "${YELLOW}No feature_list.json found${NC}"
    echo "Run: features.sh sync"
    exit 1
  fi

  echo -e "${BLUE}Feature List${NC}"
  echo -e "${BLUE}============${NC}"
  echo ""

  printf "%-10s %-40s %-12s %-4s %-8s\n" "ID" "NAME" "STATUS" "PRI" "VERIFIED"
  printf "%-10s %-40s %-12s %-4s %-8s\n" "----------" "----------------------------------------" "------------" "----" "--------"

  jq -r '.features[] | [.id, .name, .status, (.priority | tostring), (if .verification.criteria_met then "yes" else "no" end)] | @tsv' "$FEATURE_FILE" | \
  while IFS=$'\t' read -r id name status priority verified; do
    # Truncate name
    if [[ ${#name} -gt 38 ]]; then
      name="${name:0:35}..."
    fi

    # Color status (need to print without -e for alignment)
    case "$status" in
      complete) status="${GREEN}$status${NC}" ;;
      in_progress) status="${CYAN}$status${NC}" ;;
      blocked) status="${RED}$status${NC}" ;;
      *) status="${YELLOW}$status${NC}" ;;
    esac

    printf "%-10s %-40s " "$id" "$name"
    echo -e "$status"
  done

  echo ""

  # Summary from file
  local total pending in_progress complete blocked
  total=$(jq '.features | length' "$FEATURE_FILE")
  pending=$(jq '[.features[] | select(.status == "pending")] | length' "$FEATURE_FILE")
  in_progress=$(jq '[.features[] | select(.status == "in_progress")] | length' "$FEATURE_FILE")
  complete=$(jq '[.features[] | select(.status == "complete")] | length' "$FEATURE_FILE")
  blocked=$(jq '[.features[] | select(.status == "blocked")] | length' "$FEATURE_FILE")

  echo -e "Total: $total | ${YELLOW}Pending: $pending${NC} | ${CYAN}In Progress: $in_progress${NC} | ${GREEN}Complete: $complete${NC} | ${RED}Blocked: $blocked${NC}"
}

cmd_status() {
  local id=$1
  local new_status=$2

  if [[ -z "$id" ]] || [[ -z "$new_status" ]]; then
    echo -e "${RED}Error: ID and status required${NC}" >&2
    echo "Usage: features.sh status <id> <pending|in_progress|complete|blocked>" >&2
    exit 1
  fi

  # Validate status
  case "$new_status" in
    pending|in_progress|complete|blocked) ;;
    *)
      echo -e "${RED}Error: Invalid status '$new_status'${NC}" >&2
      exit 1
      ;;
  esac

  if [[ ! -f "$FEATURE_FILE" ]]; then
    echo -e "${RED}Error: $FEATURE_FILE not found${NC}" >&2
    exit 1
  fi

  # Normalize ID format
  if [[ ! "$id" == TRD-* ]]; then
    id="TRD-$(printf "%03d" "${id#0}")"
  fi

  # Check if feature exists
  if ! jq -e ".features[] | select(.id == \"$id\")" "$FEATURE_FILE" >/dev/null 2>&1; then
    echo -e "${RED}Error: Feature $id not found${NC}" >&2
    exit 1
  fi

  # Update status
  local tmp_file="${FEATURE_FILE}.tmp"
  jq --arg id "$id" --arg status "$new_status" \
    '(.features[] | select(.id == $id)).status = $status' "$FEATURE_FILE" > "$tmp_file"
  mv "$tmp_file" "$FEATURE_FILE"

  echo -e "${GREEN}Updated $id status to: $new_status${NC}"

  # Also update TRD if it exists (using portable sed pattern)
  local trd_file
  trd_file=$(ls "$TRD_DIR"/"${id}"-*.md 2>/dev/null | head -1 || true)
  if [[ -n "$trd_file" ]] && [[ -f "$trd_file" ]]; then
    local escaped_status current_date trd_tmp
    escaped_status=$(printf '%s\n' "$new_status" | sed 's/[&/\]/\\&/g')
    current_date=$(date +%Y-%m-%d)

    trd_tmp=$(mktemp)
    sed "s/| Status | [a-z_]* |/| Status | $escaped_status |/" "$trd_file" > "$trd_tmp" && mv "$trd_tmp" "$trd_file"

    trd_tmp=$(mktemp)
    sed "s/| Updated | [0-9-]* |/| Updated | $current_date |/" "$trd_file" > "$trd_tmp" && mv "$trd_tmp" "$trd_file"
    echo -e "${GREEN}Also updated TRD file${NC}"
  fi
}

cmd_get() {
  local id=$1

  if [[ -z "$id" ]]; then
    echo -e "${RED}Error: ID required${NC}" >&2
    exit 1
  fi

  if [[ ! -f "$FEATURE_FILE" ]]; then
    echo -e "${RED}Error: $FEATURE_FILE not found${NC}" >&2
    exit 1
  fi

  # Normalize ID format
  if [[ ! "$id" == TRD-* ]]; then
    id="TRD-$(printf "%03d" "${id#0}")"
  fi

  jq --arg id "$id" '.features[] | select(.id == $id)' "$FEATURE_FILE"
}

cmd_init() {
  ensure_dirs

  if [[ -f "$FEATURE_FILE" ]]; then
    echo -e "${YELLOW}$FEATURE_FILE already exists${NC}"
    echo "Use 'features.sh sync' to regenerate from TRDs"
    exit 1
  fi

  cat > "$FEATURE_FILE" <<EOF
{
  "version": "1.0",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "$TRD_DIR",
  "features": []
}
EOF

  echo -e "${GREEN}Created:${NC} $FEATURE_FILE"
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
  sync)
    cmd_sync
    ;;
  list)
    cmd_list
    ;;
  status)
    cmd_status "$@"
    ;;
  get)
    cmd_get "$@"
    ;;
  init)
    cmd_init
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}" >&2
    exit 1
    ;;
esac
