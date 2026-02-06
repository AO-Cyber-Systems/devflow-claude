#!/usr/bin/env bash
#
# pre-commit-hook.sh — Auto-sync marketplace.json when plugin.json files change
#
# Detects staged plugin.json changes and runs sync-marketplace.sh to ensure
# marketplace.json stays in sync within the same commit.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_SCRIPT="$REPO_ROOT/scripts/sync-marketplace.sh"

# Check if any plugin.json files are staged
STAGED_PLUGINS="$(git diff --cached --name-only -- 'plugins/*/.claude-plugin/plugin.json' 2>/dev/null || true)"

if [[ -z "$STAGED_PLUGINS" ]]; then
  exit 0
fi

echo "🔄 Plugin changes detected, syncing marketplace.json..."

# Run the sync script
if ! "$SYNC_SCRIPT" --quiet; then
  echo "❌ Failed to sync marketplace.json" >&2
  exit 1
fi

# Stage the updated marketplace.json if it changed
if ! git diff --quiet -- .claude-plugin/marketplace.json 2>/dev/null; then
  git add .claude-plugin/marketplace.json
  echo "✔  marketplace.json synced and staged"
fi
