#!/usr/bin/env bats
# Security Hook Tests
# Tests for the command allowlist security hook

load '../helpers/test_helper'

setup() {
  setup_test_env
}

teardown() {
  teardown_test_env
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

run_security() {
  local cmd="$1"
  echo '{"tool_input": {"command": "'"$cmd"'"}}' | bash "$HOOKS_DIR/security-hook.sh"
}

is_allowed() {
  local cmd="$1"
  local output
  output=$(run_security "$cmd")
  # Empty output means allowed
  [[ -z "$output" ]] || ! echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1
}

is_blocked() {
  local cmd="$1"
  local output
  output=$(run_security "$cmd")
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1
}

# =============================================================================
# ALLOWED COMMANDS - Node/Frontend
# =============================================================================

@test "allows npm install" {
  run run_security "npm install"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows npm run build" {
  run run_security "npm run build"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows npx command" {
  run run_security "npx tsc --noEmit"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows pnpm install" {
  run run_security "pnpm install"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows node script" {
  run run_security "node script.js"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# ALLOWED COMMANDS - Python
# =============================================================================

@test "allows python command" {
  run run_security "python script.py"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows poetry run pytest" {
  run run_security "poetry run pytest -x"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows pip install" {
  run run_security "pip install requests"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows ruff check" {
  run run_security "ruff check ."
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows mypy" {
  run run_security "mypy src/"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# ALLOWED COMMANDS - Ruby
# =============================================================================

@test "allows ruby command" {
  run run_security "ruby script.rb"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows bundle install" {
  run run_security "bundle install"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows rails server" {
  run run_security "rails server"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows rspec" {
  run run_security "rspec spec/"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows rubocop" {
  run run_security "rubocop -a"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# ALLOWED COMMANDS - Git
# =============================================================================

@test "allows git status" {
  run run_security "git status"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows git commit" {
  run run_security "git commit -m 'test'"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows git push" {
  run run_security "git push origin main"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows gh pr create" {
  run run_security "gh pr create --title 'test'"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# ALLOWED COMMANDS - File Operations (Relative Paths)
# =============================================================================

@test "allows mkdir with relative path" {
  run run_security "mkdir -p src/components"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows mkdir with ./ path" {
  run run_security "mkdir -p ./src/components"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows ls" {
  run run_security "ls -la"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows cat with relative path" {
  run run_security "cat package.json"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows grep" {
  run run_security "grep -r 'pattern' src/"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows find" {
  run run_security "find . -name '*.ts'"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# ALLOWED COMMANDS - Safe rm (Build Artifacts)
# =============================================================================

@test "allows rm -rf node_modules" {
  run run_security "rm -rf node_modules"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows rm -rf dist" {
  run run_security "rm -rf dist"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows rm -rf .svelte-kit" {
  run run_security "rm -rf .svelte-kit"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows rm -rf __pycache__" {
  run run_security "rm -rf __pycache__"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows rm -rf coverage" {
  run run_security "rm -rf coverage"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# ALLOWED COMMANDS - DevFlow Scripts
# =============================================================================

@test "allows devflow verify script" {
  run run_security "$PLUGIN_ROOT/scripts/verify.sh run"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows devflow trd script" {
  run run_security "$PLUGIN_ROOT/scripts/trd.sh list"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows devflow regression script" {
  run run_security "$PLUGIN_ROOT/scripts/regression.sh run"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# ALLOWED COMMANDS - Other Tools
# =============================================================================

@test "allows docker commands" {
  run run_security "docker ps"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows make" {
  run run_security "make test"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows curl" {
  run run_security "curl -s https://example.com"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows jq" {
  run run_security "jq '.name' package.json"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows bc calculator" {
  run run_security "bc -l"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# BLOCKED COMMANDS - Dangerous rm
# =============================================================================

@test "blocks rm with absolute path" {
  run run_security "rm -rf /etc/passwd"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks rm with home directory" {
  run run_security "rm -rf /home/user"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks rm root" {
  run run_security "rm -rf /"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks rm with arbitrary path" {
  run run_security "rm -rf /var/log"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks rm node_modules with path traversal" {
  run run_security "rm -rf node_modules/../.."
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

# =============================================================================
# BLOCKED COMMANDS - Path Traversal
# =============================================================================

@test "blocks path traversal with ../" {
  run run_security "cat ../../../etc/passwd"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks path traversal with /.. in path" {
  run run_security "cat /etc/../etc/passwd"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks path traversal in mkdir" {
  run run_security "mkdir -p ../../../tmp/hack"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks path traversal in cp" {
  run run_security "cp malware.sh ../../../usr/bin/"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

# =============================================================================
# BLOCKED COMMANDS - System Directories
# =============================================================================

@test "blocks access to /etc" {
  run run_security "cat /etc/passwd"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks access to /usr" {
  run run_security "ls /usr/bin"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks access to /var" {
  run run_security "cat /var/log/syslog"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks access to /root directory" {
  run run_security "ls /root/"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks access to /home" {
  run run_security "ls /home/otheruser"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

# =============================================================================
# BLOCKED COMMANDS - Unrestricted Kill
# =============================================================================

@test "blocks kill -9 -1 (kill all)" {
  run run_security "kill -9 -1"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks killall without specific target" {
  run run_security "killall -9"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

# =============================================================================
# BLOCKED COMMANDS - Dangerous Exports
# =============================================================================

@test "blocks LD_PRELOAD export" {
  run run_security "export LD_PRELOAD=/tmp/malware.so"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks PATH export (unauthorized)" {
  run run_security "export PATH=/tmp/hack:\$PATH"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks PYTHONPATH export" {
  run run_security "export PYTHONPATH=/tmp/hack"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

# =============================================================================
# BLOCKED COMMANDS - sed -i with Absolute Paths
# =============================================================================

@test "blocks sed -i on absolute path" {
  run run_security "sed -i 's/foo/bar/' /etc/hosts"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "allows sed -i on relative path" {
  run run_security "sed -i 's/foo/bar/' config.json"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

# =============================================================================
# EDGE CASES
# =============================================================================

@test "handles empty command" {
  run run_security ""
  # Should exit cleanly with no output
  [[ $status -eq 0 ]]
}

@test "handles command with special characters" {
  run run_security "echo 'hello world'"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "handles very long command" {
  local long_cmd="npm run test -- $(printf 'a%.0s' {1..500})"
  run run_security "$long_cmd"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "outputs valid JSON on deny" {
  run run_security "rm -rf /etc"
  # Verify output is valid JSON
  echo "$output" | jq -e '.' >/dev/null 2>&1
  # Verify structure
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "PreToolUse"' >/dev/null 2>&1
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecisionReason' >/dev/null 2>&1
}

@test "blocks piped commands to system directories" {
  run run_security "cat file.txt | tee /etc/malware"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "blocks semicolon-chained commands to system directories" {
  run run_security "echo test; cat /etc/passwd"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

# =============================================================================
# ALLOWED SAFE EXPORTS
# =============================================================================

@test "allows NODE_ENV export" {
  run run_security "export NODE_ENV=production"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows DEBUG export" {
  run run_security "export DEBUG=true"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}

@test "allows VITE_ prefixed export" {
  run run_security "export VITE_API_URL=http://localhost:3000"
  [[ -z "$output" ]] || [[ $(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"') != "deny" ]]
}
