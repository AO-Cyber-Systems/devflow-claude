#!/bin/bash
# DevFlow Security Hook - Bash Command Allowlist
# Based on: aocodex-v2, aosentry, aocyberweb tech stacks
# Plus: Essential CLI tools for exploration and lookup

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# =============================================================================
# ALLOWED COMMANDS - Based on actual project usage
# =============================================================================

# --- Node/Frontend (aocodex-v2, aocyberweb) ---
ALLOWED_NODE=(
  "^npm "
  "^npm$"
  "^pnpm "
  "^pnpm$"
  "^npx "
  "^node "
)

# --- Python (aosentry, aocodex-v2 backend) ---
ALLOWED_PYTHON=(
  "^python "
  "^python3 "
  "^pip "
  "^pip3 "
  "^poetry "
  "^poetry$"
  "^pytest"
  "^ruff "
  "^ruff$"
  "^black "
  "^mypy "
  "^uvicorn "
)

# --- Ruby ---
ALLOWED_RUBY=(
  "^ruby "
  "^ruby$"
  "^bundle "
  "^bundle$"
  "^bundler "
  "^gem "
  "^gem$"
  "^rake "
  "^rake$"
  "^rails "
  "^rails$"
  "^rspec"
  "^rubocop"
  "^erb "
  "^irb"
  "^solargraph"
)

# --- Build & Dev (from package.json scripts) ---
ALLOWED_BUILD=(
  "^vite"
  "^svelte-check"
  "^svelte-kit"
  "^tsc"
  "^eslint"
  "^prettier"
  "^vitest"
  "^playwright"
  "^tailwind"
)

# --- Make (aosentry) ---
ALLOWED_MAKE=(
  "^make$"
  "^make "
)

# --- Git ---
ALLOWED_GIT=(
  "^git "
  "^git$"
  "^gh "
)

# --- Docker ---
ALLOWED_DOCKER=(
  "^docker "
  "^docker$"
  "^docker-compose"
)

# --- Stripe (aocyberweb) ---
ALLOWED_STRIPE=(
  "^stripe "
)

# --- File Exploration (read-only operations) ---
ALLOWED_FILES_READ=(
  "^ls"
  "^cat "
  "^head "
  "^tail "
  "^less "
  "^more "
  "^grep "
  "^egrep "
  "^fgrep "
  "^find "
  "^wc "
  "^diff "
  "^tree "
  "^file "
  "^stat "
  "^pwd"
  "^cd "
  "^readlink "
  "^realpath "
  "^dirname "
  "^basename "
)

# --- File Modification (scoped to safe paths - no leading slash allowed) ---
# These patterns prevent operations on absolute paths outside project
ALLOWED_FILES_WRITE=(
  # mkdir - only relative paths or explicit ./ paths (no absolute paths starting with /)
  "^mkdir -p [^/]"
  "^mkdir -p \./"
  "^mkdir [^/-]"
  "^mkdir \./"
  # cp - only relative paths
  "^cp [^/]"
  "^cp -[a-zA-Z]+ [^/]"
  "^cp \./"
  # mv - only relative paths
  "^mv [^/]"
  "^mv \./"
  # touch - only relative paths
  "^touch [^/]"
  "^touch \./"
  # chmod - only relative paths (no absolute paths)
  "^chmod [0-7]+ [^/]"
  "^chmod [0-7]+ \./"
  "^chmod [+=-][rwx]+ [^/]"
  # ln - only relative paths for symlinks
  "^ln -s [^/]"
  "^ln -sf [^/]"
)

# --- Modern Search Tools (AI commonly uses these) ---
ALLOWED_SEARCH=(
  "^rg "
  "^ripgrep "
  "^fd "
  "^fdfind "
  "^ag "
  "^ack "
)

# --- Safe rm (build artifacts only - exact paths, no traversal) ---
# Using $ to anchor end or space to prevent path traversal attacks like "rm -rf node_modules/../.."
ALLOWED_RM=(
  "^rm -rf node_modules$"
  "^rm -rf node_modules/"
  "^rm -rf ./node_modules"
  "^rm -rf dist$"
  "^rm -rf ./dist"
  "^rm -rf build$"
  "^rm -rf ./build"
  "^rm -rf .svelte-kit$"
  "^rm -rf ./.svelte-kit"
  "^rm -rf .vite$"
  "^rm -rf ./.vite"
  "^rm -rf coverage$"
  "^rm -rf ./coverage"
  "^rm -rf __pycache__$"
  "^rm -rf ./__pycache__"
  "^rm -rf .pytest_cache$"
  "^rm -rf ./.pytest_cache"
  "^rm -rf .mypy_cache$"
  "^rm -rf ./.mypy_cache"
  "^rm -rf .ruff_cache$"
  "^rm -rf ./.ruff_cache"
  "^rm -rf htmlcov$"
  "^rm -rf ./htmlcov"
  "^rm -rf .coverage$"
  "^rm -rf test-results$"
  "^rm -rf ./test-results"
  "^rm -rf playwright-report$"
  "^rm -rf ./playwright-report"
  # Python bytecode - only .pyc/.pyo files, no path traversal
  "^rm -f [^/]*\.pyc$"
  "^rm -f [^/]*\.pyo$"
  "^rm [^/]*\.pyc$"
  "^rm [^/]*\.pyo$"
  # Allow rm on temp files in current dir
  "^rm -f \./[^/]*\.tmp$"
  "^rm -f [^/]*\.tmp$"
)

# --- Data Tools (for inspecting JSON/YAML) ---
ALLOWED_DATA=(
  "^jq"
  "^yq"
  "^cat .*\.json"
  "^cat .*\.yaml"
  "^cat .*\.yml"
)

# --- Text Processing ---
# Note: sed -e with 'e' flag can execute code, but blocking it breaks too many legitimate uses.
# The -i flag is restricted to relative paths only to prevent modifying system files.
ALLOWED_TEXT=(
  # sed - allow but restrict -i to relative paths (no absolute paths)
  "^sed -i[^ ]* [^/]"
  "^sed -i[^ ]* '.*' [^/]"
  "^sed -i[^ ]* \".*\" [^/]"
  "^sed [^-i]"
  "^sed -[^i]"
  "^sed -n "
  "^sed -e "
  "^sed 's/"
  "^sed '/"
  "^awk "
  "^sort "
  "^uniq "
  "^tr "
  "^cut "
  "^xargs "
  # tee - only relative paths
  "^tee [^/]"
  "^tee -a [^/]"
  "^tee \./"
  "^column "
)

# --- HTTP (API testing) ---
ALLOWED_HTTP=(
  "^curl "
  "^wget "
)

# --- Shell Utilities ---
# Note: export is restricted to safe variables only (no LD_PRELOAD, PATH, etc.)
ALLOWED_UTILS=(
  "^echo "
  "^printf "
  "^date"
  "^env$"
  "^env [A-Z_]+="  # Allow setting env vars inline
  # export - only safe variable names (no PATH, LD_*, PYTHON*, etc.)
  "^export NODE_ENV="
  "^export DEBUG="
  "^export CI="
  "^export VITE_"
  "^export SVELTE_"
  "^export DATABASE_URL="
  "^export PUBLIC_"
  "^export PRIVATE_"
  "^which "
  "^type "
  "^command "
  "^source "
  "^\. "
  "^sleep "
  "^true$"
  "^false$"
  "^test "
  "^\[ "
)

# --- mise (tool version manager) ---
ALLOWED_MISE=(
  "^mise "
  "^mise$"
)

# --- Process (for dev servers - restricted to specific dev processes) ---
# Note: kill is restricted to signals and specific PIDs, no arbitrary killing
ALLOWED_PROCESS=(
  "^ps "
  "^ps$"
  "^lsof "
  "^lsof -i"
  # pkill - only specific dev server processes with exact patterns
  "^pkill -f 'vite'"
  "^pkill -f 'npm run dev'"
  "^pkill -f 'uvicorn'"
  "^pkill -f 'python.*manage.py'"
  "^pkill -f 'node.*server'"
  # kill - only with explicit signal and PID (no kill -9 -1 or kill 1)
  "^kill -TERM [0-9]+"
  "^kill -INT [0-9]+"
  "^kill -HUP [0-9]+"
  "^kill [0-9]+"
  # killall - only specific dev tools
  "^killall -TERM node$"
  "^killall -TERM python$"
)

# --- DevFlow Scripts (development lifecycle) ---
ALLOWED_DEVFLOW=(
  ".*/scripts/design\.sh"
  ".*/scripts/trd\.sh"
  ".*/scripts/features\.sh"
  ".*/scripts/verify\.sh"
  ".*/scripts/uitest\.sh"
  ".*/scripts/regression\.sh"
  ".*/scripts/setup-autonomous\.sh"
  ".*/scripts/doctor\.sh"
  ".*/scripts/install-deps\.sh"
)

# --- bc calculator (for pass rate calculations) ---
ALLOWED_CALC=(
  "^bc$"
  "^bc "
)

# --- Combine all ---
ALL_PATTERNS=(
  "${ALLOWED_NODE[@]}"
  "${ALLOWED_PYTHON[@]}"
  "${ALLOWED_RUBY[@]}"
  "${ALLOWED_BUILD[@]}"
  "${ALLOWED_MAKE[@]}"
  "${ALLOWED_GIT[@]}"
  "${ALLOWED_DOCKER[@]}"
  "${ALLOWED_STRIPE[@]}"
  "${ALLOWED_FILES_READ[@]}"
  "${ALLOWED_FILES_WRITE[@]}"
  "${ALLOWED_SEARCH[@]}"
  "${ALLOWED_RM[@]}"
  "${ALLOWED_DATA[@]}"
  "${ALLOWED_TEXT[@]}"
  "${ALLOWED_HTTP[@]}"
  "${ALLOWED_UTILS[@]}"
  "${ALLOWED_MISE[@]}"
  "${ALLOWED_PROCESS[@]}"
  "${ALLOWED_DEVFLOW[@]}"
  "${ALLOWED_CALC[@]}"
)

# =============================================================================
# SECURITY PRE-CHECKS
# =============================================================================

# Block path traversal attempts in any command
if echo "$COMMAND" | grep -qE '\.\./|/\.\.'; then
  jq -n --arg cmd "$COMMAND" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": ("Path traversal detected in command: " + $cmd)
    }
  }'
  exit 0
fi

# Block commands that start with absolute paths to system directories
if echo "$COMMAND" | grep -qE '(^|[ ;|&])/etc/|(^|[ ;|&])/usr/|(^|[ ;|&])/var/|(^|[ ;|&])/root/|(^|[ ;|&])/home/'; then
  jq -n --arg cmd "$COMMAND" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": ("Access to system directory not allowed: " + $cmd)
    }
  }'
  exit 0
fi

# =============================================================================
# CHECK COMMAND AGAINST ALLOWLIST
# =============================================================================

for pattern in "${ALL_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    exit 0
  fi
done

# =============================================================================
# DENY
# =============================================================================

jq -n --arg cmd "$COMMAND" '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": ("Command not allowed: " + $cmd + "\n\nAllowed: npm/pnpm, python/poetry/pytest/ruff/black/mypy, ruby/bundle/gem/rake/rails/rspec/rubocop, vite/vitest/playwright/eslint/prettier, git/gh, docker, stripe, make, file ops (ls/cat/grep/find/rg/fd), jq/yq, curl")
  }
}'
