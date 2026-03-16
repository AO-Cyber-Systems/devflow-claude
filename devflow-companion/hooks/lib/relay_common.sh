#!/bin/bash
# Shared functions for devflow-companion relay hooks.
# Sourced by all hook scripts for consistent API access and error handling.
#
# Environment variables:
#   DEVFLOW_RELAY_URL     - Base URL (default: http://localhost:3100)
#   DEVFLOW_RELAY_TOKEN   - Bearer token for authenticated access
#   DEVFLOW_RELAY_VERBOSE - Set to "1" to enable debug logging

RELAY_BASE_URL="${DEVFLOW_RELAY_URL:-http://localhost:3100}"
RELAY_API_URL="${RELAY_BASE_URL}/api/v1"
RELAY_TOKEN="${DEVFLOW_RELAY_TOKEN:-}"
RELAY_VERBOSE="${DEVFLOW_RELAY_VERBOSE:-}"

# Log to file when verbose mode is enabled
relay_log() {
  [ -n "$RELAY_VERBOSE" ] && echo "[devflow $(date -u +%H:%M:%S)] $*" >> /tmp/devflow_relay_hooks.log
  return 0
}

# Check if the relay server is running (health check)
relay_up() {
  curl -sf "${RELAY_BASE_URL}/up" > /dev/null 2>&1
}

# Build the Authorization header (or a no-op header if no token)
relay_auth_header() {
  if [ -n "$RELAY_TOKEN" ]; then
    echo "Authorization: Bearer ${RELAY_TOKEN}"
  else
    echo "X-No-Auth: true"
  fi
}

# POST JSON to a relay API endpoint. Returns response body or empty string on failure.
relay_post() {
  local endpoint="$1" body="$2"
  curl -sf -X POST "${RELAY_API_URL}/${endpoint}" \
    -H "Content-Type: application/json" \
    -H "$(relay_auth_header)" \
    -d "$body" 2>/dev/null || echo ""
}

# GET from a relay API endpoint. Returns response body or empty string on failure.
relay_get() {
  local endpoint="$1"
  curl -sf "${RELAY_API_URL}/${endpoint}" \
    -H "$(relay_auth_header)" 2>/dev/null || echo ""
}

# PATCH JSON to a relay API endpoint. Returns response body or empty string on failure.
relay_patch() {
  local endpoint="$1" body="$2"
  curl -sf -X PATCH "${RELAY_API_URL}/${endpoint}" \
    -H "Content-Type: application/json" \
    -H "$(relay_auth_header)" \
    -d "$body" 2>/dev/null || echo ""
}

# Parse a JSON value using ruby. Usage: parse_json "$json_string" '["key"]'
parse_json() {
  echo "$1" | ruby -rjson -e "puts JSON.parse(STDIN.read)$2 rescue ''" 2>/dev/null
}

# Detect the IDE from TERM_PROGRAM environment variable
detect_ide() {
  case "$TERM_PROGRAM" in
    vscode) echo "VS Code" ;;
    cursor) echo "Cursor" ;;
    *) echo "Terminal" ;;
  esac
}

# Get the current git branch for a directory
detect_branch() {
  local dir="${1:-$PWD}"
  cd "$dir" 2>/dev/null && git branch --show-current 2>/dev/null || echo ""
}

# Build session registration JSON for lazy registration.
# Used by hooks that may fire before SessionStart (or when SessionStart didn't fire).
build_session_json() {
  local session_id="$1" cwd="$2"
  local ide
  local branch
  local project
  ide=$(detect_ide)
  branch=$(detect_branch "$cwd")
  project=$(basename "${cwd:-unknown}")

  ruby -rjson -e '
    puts JSON.generate({
      claude_session_id: ARGV[0],
      ide: ARGV[1],
      project_name: ARGV[2],
      branch: ARGV[3],
      cwd: ARGV[4],
      agent: "claude-code"
    })
  ' "$session_id" "$ide" "$project" "$branch" "$cwd"
}
