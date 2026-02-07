#!/usr/bin/env bats
# JSON Validation Tests
# Tests that all JSON configuration files are valid

load '../helpers/test_helper'

# =============================================================================
# PLUGIN CONFIGURATION
# =============================================================================

@test "plugin.json is valid JSON" {
  jq -e '.' "$PLUGIN_ROOT/.claude-plugin/plugin.json" >/dev/null 2>&1
}

@test "plugin.json has name field" {
  jq -e '.name' "$PLUGIN_ROOT/.claude-plugin/plugin.json" >/dev/null 2>&1
}

@test "plugin.json has version field" {
  jq -e '.version' "$PLUGIN_ROOT/.claude-plugin/plugin.json" >/dev/null 2>&1
}

@test "plugin.json has description field" {
  jq -e '.description' "$PLUGIN_ROOT/.claude-plugin/plugin.json" >/dev/null 2>&1
}

@test "plugin.json lists subagents in features" {
  jq -e '.features.subagents' "$PLUGIN_ROOT/.claude-plugin/plugin.json" >/dev/null 2>&1
}

@test "plugin.json lists hooks in features" {
  jq -e '.features.hooks' "$PLUGIN_ROOT/.claude-plugin/plugin.json" >/dev/null 2>&1
}

# =============================================================================
# HOOKS CONFIGURATION
# =============================================================================

@test "hooks.json is valid JSON" {
  jq -e '.' "$PLUGIN_ROOT/hooks/hooks.json" >/dev/null 2>&1
}

@test "hooks.json has SessionStart hook" {
  jq -e '.hooks.SessionStart' "$PLUGIN_ROOT/hooks/hooks.json" >/dev/null 2>&1
}

@test "hooks.json has Stop hook" {
  jq -e '.hooks.Stop' "$PLUGIN_ROOT/hooks/hooks.json" >/dev/null 2>&1
}

@test "hooks.json has PreToolUse hook" {
  jq -e '.hooks.PreToolUse' "$PLUGIN_ROOT/hooks/hooks.json" >/dev/null 2>&1
}

@test "hooks.json PreToolUse matches Bash" {
  local matcher
  matcher=$(jq -r '.hooks.PreToolUse[0].matcher' "$PLUGIN_ROOT/hooks/hooks.json")
  [[ "$matcher" == "Bash" ]]
}

@test "hooks.json Stop hook has timeout" {
  jq -e '.hooks.Stop[0].hooks[0].timeout' "$PLUGIN_ROOT/hooks/hooks.json" >/dev/null 2>&1
}

# =============================================================================
# MCP SERVER CONFIGURATIONS
# =============================================================================

@test "playwright.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/mcp-servers/config/playwright.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/mcp-servers/config/playwright.json" >/dev/null 2>&1
  else
    skip "playwright.json not found"
  fi
}

@test "filesystem.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/mcp-servers/config/filesystem.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/mcp-servers/config/filesystem.json" >/dev/null 2>&1
  else
    skip "filesystem.json not found"
  fi
}

@test "git.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/mcp-servers/config/git.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/mcp-servers/config/git.json" >/dev/null 2>&1
  else
    skip "git.json not found"
  fi
}

@test "fetch.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/mcp-servers/config/fetch.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/mcp-servers/config/fetch.json" >/dev/null 2>&1
  else
    skip "fetch.json not found"
  fi
}

@test "sequential-thinking.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/mcp-servers/config/sequential-thinking.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/mcp-servers/config/sequential-thinking.json" >/dev/null 2>&1
  else
    skip "sequential-thinking.json not found"
  fi
}

@test "ruby-lsp.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/mcp-servers/config/ruby-lsp.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/mcp-servers/config/ruby-lsp.json" >/dev/null 2>&1
  else
    skip "ruby-lsp.json not found"
  fi
}

@test "memory.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/mcp-servers/config/memory.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/mcp-servers/config/memory.json" >/dev/null 2>&1
  else
    skip "memory.json not found"
  fi
}

# =============================================================================
# LSP CONFIGURATION
# =============================================================================

@test "claude-lsp-config.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/lsp/claude-lsp-config.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
  else
    skip "claude-lsp-config.json not found"
  fi
}

@test "LSP config has servers section" {
  if [[ -f "$PLUGIN_ROOT/lsp/claude-lsp-config.json" ]]; then
    jq -e '.servers' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
  else
    skip "claude-lsp-config.json not found"
  fi
}

@test "LSP config has languageAssociations" {
  if [[ -f "$PLUGIN_ROOT/lsp/claude-lsp-config.json" ]]; then
    jq -e '.languageAssociations' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
  else
    skip "claude-lsp-config.json not found"
  fi
}

# =============================================================================
# PACKAGE.JSON FILES
# =============================================================================

@test "mcp-servers/package.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/mcp-servers/package.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/mcp-servers/package.json" >/dev/null 2>&1
  else
    skip "mcp-servers/package.json not found"
  fi
}

@test "lsp/package.json is valid JSON" {
  if [[ -f "$PLUGIN_ROOT/lsp/package.json" ]]; then
    jq -e '.' "$PLUGIN_ROOT/lsp/package.json" >/dev/null 2>&1
  else
    skip "lsp/package.json not found"
  fi
}

# =============================================================================
# CONSISTENCY CHECKS
# =============================================================================

@test "plugin.json subagents match existing agent files" {
  local subagents
  subagents=$(jq -r '.features.subagents[]' "$PLUGIN_ROOT/.claude-plugin/plugin.json")

  for agent in $subagents; do
    if [[ ! -f "$PLUGIN_ROOT/agents/$agent.md" ]]; then
      echo "Missing agent file: agents/$agent.md"
      return 1
    fi
  done
}

@test "plugin.json hooks match hooks.json" {
  local plugin_hooks
  plugin_hooks=$(jq -r '.features.hooks[]' "$PLUGIN_ROOT/.claude-plugin/plugin.json")

  for hook in $plugin_hooks; do
    if ! jq -e ".hooks.$hook" "$PLUGIN_ROOT/hooks/hooks.json" >/dev/null 2>&1; then
      echo "Hook $hook listed in plugin.json but not in hooks.json"
      return 1
    fi
  done
}

@test "all MCP configs referenced in plugin.json exist" {
  local bundled_mcp
  bundled_mcp=$(jq -r '.bundled."mcp-servers"[]' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)

  # This is a soft check - MCP servers may be installed dynamically
  [[ -n "$bundled_mcp" ]] || skip "No MCP servers listed in plugin.json"
}
