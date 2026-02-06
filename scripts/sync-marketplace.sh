#!/usr/bin/env bash
#
# sync-marketplace.sh — Sync marketplace.json from plugin source files
#
# Scans plugins/*/.claude-plugin/plugin.json and syncs name, version,
# description, author into .claude-plugin/marketplace.json.
# Preserves marketplace-only fields: source, category, homepage.
#
# Usage:
#   scripts/sync-marketplace.sh            # Sync marketplace.json
#   scripts/sync-marketplace.sh --check    # Dry-run, exit 1 if out of sync
#   scripts/sync-marketplace.sh --quiet    # Suppress non-error output
#   scripts/sync-marketplace.sh --help     # Show usage

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Config ---
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
PLUGINS_DIR="$REPO_ROOT/plugins"
GITHUB_REPO_URL="https://github.com/AO-Cyber-Systems/devflow-claude"

# --- Flags ---
CHECK=false
QUIET=false

# --- Functions ---
info()  { $QUIET || printf "${BLUE}ℹ${NC}  %s\n" "$1"; }
ok()    { $QUIET || printf "${GREEN}✔${NC}  %s\n" "$1"; }
warn()  { printf "${YELLOW}⚠${NC}  %s\n" "$1" >&2; }
err()   { printf "${RED}✖${NC}  %s\n" "$1" >&2; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Sync .claude-plugin/marketplace.json from plugin source files.

Options:
  --check   Dry-run mode. Exit 1 if marketplace.json is out of sync.
  --quiet   Suppress non-error output.
  --help    Show this help message.
EOF
}

# --- Parse args ---
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=true ;;
    --quiet) QUIET=true ;;
    --help)  usage; exit 0 ;;
    *)       err "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

# --- Dependency check ---
if ! command -v jq &>/dev/null; then
  err "jq is required but not installed. Install with: brew install jq"
  exit 1
fi

# --- Validate inputs ---
if [[ ! -f "$MARKETPLACE" ]]; then
  err "Marketplace manifest not found: $MARKETPLACE"
  exit 1
fi

if [[ ! -d "$PLUGINS_DIR" ]]; then
  err "Plugins directory not found: $PLUGINS_DIR"
  exit 1
fi

# --- Read current marketplace ---
CURRENT="$(cat "$MARKETPLACE")"

# --- Collect plugin directories ---
PLUGIN_DIRS=()
for plugin_json in "$PLUGINS_DIR"/*/.claude-plugin/plugin.json; do
  [[ -f "$plugin_json" ]] || continue
  PLUGIN_DIRS+=("$plugin_json")
done

if [[ ${#PLUGIN_DIRS[@]} -eq 0 ]]; then
  warn "No plugin.json files found in $PLUGINS_DIR/*/.claude-plugin/"
  exit 0
fi

# --- Build updated plugins array ---
UPDATED_PLUGINS="[]"

for plugin_json in "${PLUGIN_DIRS[@]}"; do
  # Extract plugin directory name (e.g., "devflow-agent")
  plugin_dir="$(basename "$(dirname "$(dirname "$plugin_json")")")"

  # Read source fields from plugin.json
  p_name="$(jq -r '.name' "$plugin_json")"
  p_version="$(jq -r '.version' "$plugin_json")"
  p_description="$(jq -r '.description' "$plugin_json")"
  p_author="$(jq '.author' "$plugin_json")"

  # Look up existing marketplace entry by name for preserved fields
  existing="$(echo "$CURRENT" | jq --arg name "$p_name" '.plugins[] | select(.name == $name)' 2>/dev/null || echo "")"

  if [[ -n "$existing" ]]; then
    # Preserve marketplace-only fields
    m_source="$(echo "$existing" | jq -r '.source')"
    m_category="$(echo "$existing" | jq -r '.category')"
    m_homepage="$(echo "$existing" | jq -r '.homepage')"
  else
    # Derive defaults for new plugins
    m_source="./plugins/$plugin_dir"
    m_category="development"
    m_homepage="$GITHUB_REPO_URL/tree/main/plugins/$plugin_dir"
    info "New plugin detected: $p_name"
  fi

  # Build the entry
  entry="$(jq -n \
    --arg name "$p_name" \
    --arg description "$p_description" \
    --arg version "$p_version" \
    --argjson author "$p_author" \
    --arg source "$m_source" \
    --arg category "$m_category" \
    --arg homepage "$m_homepage" \
    '{name: $name, description: $description, version: $version, author: $author, source: $source, category: $category, homepage: $homepage}'
  )"

  UPDATED_PLUGINS="$(echo "$UPDATED_PLUGINS" | jq --argjson entry "$entry" '. + [$entry]')"
done

# --- Detect removed plugins ---
CURRENT_NAMES="$(echo "$CURRENT" | jq -r '.plugins[].name' 2>/dev/null || echo "")"
FOUND_NAMES="$(echo "$UPDATED_PLUGINS" | jq -r '.[].name')"

while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  if ! echo "$FOUND_NAMES" | grep -qxF "$name"; then
    warn "Plugin removed: $name (no longer in plugins directory)"
  fi
done <<< "$CURRENT_NAMES"

# --- Build final manifest ---
UPDATED="$(echo "$CURRENT" | jq --argjson plugins "$UPDATED_PLUGINS" '.plugins = $plugins')"

# --- Compare ---
# Normalize both for comparison (consistent formatting)
CURRENT_NORM="$(echo "$CURRENT" | jq -S '.')"
UPDATED_NORM="$(echo "$UPDATED" | jq -S '.')"

if [[ "$CURRENT_NORM" == "$UPDATED_NORM" ]]; then
  ok "marketplace.json is already in sync"
  exit 0
fi

# --- Check mode ---
if $CHECK; then
  err "marketplace.json is out of sync with plugin sources"
  # Show diff for clarity
  if ! $QUIET; then
    diff <(echo "$CURRENT_NORM") <(echo "$UPDATED_NORM") || true
  fi
  exit 1
fi

# --- Write updated manifest ---
echo "$UPDATED" | jq '.' > "$MARKETPLACE"
ok "marketplace.json updated"

# Show what changed
if ! $QUIET; then
  diff <(echo "$CURRENT_NORM") <(echo "$UPDATED_NORM") || true
fi
