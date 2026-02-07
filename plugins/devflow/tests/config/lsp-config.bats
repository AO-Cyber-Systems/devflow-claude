#!/usr/bin/env bats
# LSP Configuration Tests
# Tests for the LSP server configuration

load '../helpers/test_helper'

# =============================================================================
# LSP CONFIG FILE
# =============================================================================

@test "LSP config file exists" {
  [[ -f "$PLUGIN_ROOT/lsp/claude-lsp-config.json" ]]
}

@test "LSP config is valid JSON" {
  jq -e '.' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

# =============================================================================
# SERVER DEFINITIONS
# =============================================================================

@test "typescript server is configured" {
  jq -e '.servers.typescript' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "typescript server has correct command" {
  local cmd
  cmd=$(jq -r '.servers.typescript.command' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$cmd" == "typescript-language-server" ]]
}

@test "typescript server has --stdio arg" {
  jq -e '.servers.typescript.args | index("--stdio")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "svelte server is configured" {
  jq -e '.servers.svelte' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "svelte server has correct command" {
  local cmd
  cmd=$(jq -r '.servers.svelte.command' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$cmd" == "svelte-language-server" ]]
}

@test "python server is configured" {
  jq -e '.servers.python' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "python server uses pyright" {
  local cmd
  cmd=$(jq -r '.servers.python.command' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$cmd" == "pyright" ]]
}

@test "ruby server is configured" {
  jq -e '.servers.ruby' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "ruby server uses solargraph" {
  local cmd
  cmd=$(jq -r '.servers.ruby.command' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$cmd" == "solargraph" ]]
}

@test "rust server is configured" {
  jq -e '.servers.rust' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "rust server uses rust-analyzer" {
  local cmd
  cmd=$(jq -r '.servers.rust.command' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$cmd" == "rust-analyzer" ]]
}

@test "go server is configured" {
  jq -e '.servers.go' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "go server uses gopls" {
  local cmd
  cmd=$(jq -r '.servers.go.command' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$cmd" == "gopls" ]]
}

@test "tailwind server is configured" {
  jq -e '.servers.tailwind' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "json server is configured" {
  jq -e '.servers.json' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "yaml server is configured" {
  jq -e '.servers.yaml' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

# =============================================================================
# LANGUAGE SUPPORT
# =============================================================================

@test "typescript server supports typescript language" {
  jq -e '.servers.typescript.languages | index("typescript")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "typescript server supports javascript language" {
  jq -e '.servers.typescript.languages | index("javascript")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "svelte server supports svelte language" {
  jq -e '.servers.svelte.languages | index("svelte")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "python server supports python language" {
  jq -e '.servers.python.languages | index("python")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "ruby server supports ruby language" {
  jq -e '.servers.ruby.languages | index("ruby")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

# =============================================================================
# ROOT PATTERNS
# =============================================================================

@test "typescript server has tsconfig.json root pattern" {
  jq -e '.servers.typescript.rootPatterns | index("tsconfig.json")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "svelte server has svelte.config.js root pattern" {
  jq -e '.servers.svelte.rootPatterns | index("svelte.config.js")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "python server has pyproject.toml root pattern" {
  jq -e '.servers.python.rootPatterns | index("pyproject.toml")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "ruby server has Gemfile root pattern" {
  jq -e '.servers.ruby.rootPatterns | index("Gemfile")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "rust server has Cargo.toml root pattern" {
  jq -e '.servers.rust.rootPatterns | index("Cargo.toml")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

@test "go server has go.mod root pattern" {
  jq -e '.servers.go.rootPatterns | index("go.mod")' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
}

# =============================================================================
# LANGUAGE ASSOCIATIONS
# =============================================================================

@test "*.ts maps to typescript" {
  local lang
  lang=$(jq -r '.languageAssociations["*.ts"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "typescript" ]]
}

@test "*.tsx maps to typescriptreact" {
  local lang
  lang=$(jq -r '.languageAssociations["*.tsx"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "typescriptreact" ]]
}

@test "*.js maps to javascript" {
  local lang
  lang=$(jq -r '.languageAssociations["*.js"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "javascript" ]]
}

@test "*.svelte maps to svelte" {
  local lang
  lang=$(jq -r '.languageAssociations["*.svelte"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "svelte" ]]
}

@test "*.py maps to python" {
  local lang
  lang=$(jq -r '.languageAssociations["*.py"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "python" ]]
}

@test "*.rb maps to ruby" {
  local lang
  lang=$(jq -r '.languageAssociations["*.rb"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "ruby" ]]
}

@test "*.rs maps to rust" {
  local lang
  lang=$(jq -r '.languageAssociations["*.rs"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "rust" ]]
}

@test "*.go maps to go" {
  local lang
  lang=$(jq -r '.languageAssociations["*.go"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "go" ]]
}

@test "*.json maps to json" {
  local lang
  lang=$(jq -r '.languageAssociations["*.json"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "json" ]]
}

@test "*.yaml maps to yaml" {
  local lang
  lang=$(jq -r '.languageAssociations["*.yaml"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "yaml" ]]
}

@test "Gemfile maps to ruby" {
  local lang
  lang=$(jq -r '.languageAssociations["Gemfile"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "ruby" ]]
}

@test "Rakefile maps to ruby" {
  local lang
  lang=$(jq -r '.languageAssociations["Rakefile"]' "$PLUGIN_ROOT/lsp/claude-lsp-config.json")
  [[ "$lang" == "ruby" ]]
}

# =============================================================================
# BUNDLED SERVERS MATCH PLUGIN.JSON
# =============================================================================

@test "all bundled LSP servers are configured" {
  local bundled
  bundled=$(jq -r '.bundled."lsp-servers"[]' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)

  if [[ -z "$bundled" ]]; then
    skip "No LSP servers listed in plugin.json"
  fi

  for server in $bundled; do
    # Check that each bundled server has a matching config
    # Server names might not match exactly, but should be present conceptually
    case "$server" in
      "typescript-language-server")
        jq -e '.servers.typescript' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
      "svelte-language-server")
        jq -e '.servers.svelte' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
      "pyright")
        jq -e '.servers.python' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
      "solargraph")
        jq -e '.servers.ruby' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
      "rust-analyzer")
        jq -e '.servers.rust' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
      "gopls")
        jq -e '.servers.go' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
      "@tailwindcss/language-server")
        jq -e '.servers.tailwind' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
      "yaml-language-server")
        jq -e '.servers.yaml' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
      "vscode-json-languageserver")
        jq -e '.servers.json' "$PLUGIN_ROOT/lsp/claude-lsp-config.json" >/dev/null 2>&1
        ;;
    esac
  done
}
