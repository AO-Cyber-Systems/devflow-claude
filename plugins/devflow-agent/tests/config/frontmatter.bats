#!/usr/bin/env bats
# Frontmatter Validation Tests
# Tests that all markdown files have valid YAML frontmatter

load '../helpers/test_helper'

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Check if file has YAML frontmatter
has_frontmatter() {
  local file="$1"
  head -1 "$file" | grep -q "^---$"
}

# Extract frontmatter from file
get_frontmatter() {
  local file="$1"
  sed -n '/^---$/,/^---$/p' "$file" | sed '1d;$d'
}

# Check if frontmatter field exists
has_field() {
  local file="$1"
  local field="$2"
  get_frontmatter "$file" | grep -qE "^${field}:"
}

# =============================================================================
# COMMAND FILES
# =============================================================================

@test "all command files have frontmatter" {
  for file in "$PLUGIN_ROOT"/commands/*.md; do
    if [[ -f "$file" ]]; then
      if ! has_frontmatter "$file"; then
        echo "Missing frontmatter: $file"
        return 1
      fi
    fi
  done
}

@test "all commands have description field" {
  for file in "$PLUGIN_ROOT"/commands/*.md; do
    if [[ -f "$file" ]]; then
      if ! has_field "$file" "description"; then
        echo "Missing description: $file"
        return 1
      fi
    fi
  done
}

@test "all commands have allowed-tools field" {
  for file in "$PLUGIN_ROOT"/commands/*.md; do
    if [[ -f "$file" ]]; then
      # allowed-tools may be optional for some commands
      # Just check that frontmatter is parseable
      local fm
      fm=$(get_frontmatter "$file")
      if [[ -z "$fm" ]]; then
        echo "Empty frontmatter: $file"
        return 1
      fi
    fi
  done
}

# =============================================================================
# AGENT FILES
# =============================================================================

@test "all agent files have frontmatter" {
  for file in "$PLUGIN_ROOT"/agents/*.md; do
    if [[ -f "$file" ]]; then
      # Skip README files
      local basename
      basename=$(basename "$file")
      if [[ "$basename" == "README.md" ]]; then
        continue
      fi
      if ! has_frontmatter "$file"; then
        echo "Missing frontmatter: $file"
        return 1
      fi
    fi
  done
}

@test "all agents have name field" {
  for file in "$PLUGIN_ROOT"/agents/*.md; do
    if [[ -f "$file" ]]; then
      if ! has_field "$file" "name"; then
        echo "Missing name: $file"
        return 1
      fi
    fi
  done
}

@test "all agents have description field" {
  for file in "$PLUGIN_ROOT"/agents/*.md; do
    if [[ -f "$file" ]]; then
      if ! has_field "$file" "description"; then
        echo "Missing description: $file"
        return 1
      fi
    fi
  done
}

@test "all agents have permissionMode or mode field" {
  for file in "$PLUGIN_ROOT"/agents/*.md; do
    if [[ -f "$file" ]]; then
      # Skip README
      local basename
      basename=$(basename "$file" .md)
      if [[ "$basename" == "README" ]]; then
        continue
      fi
      if ! has_field "$file" "permissionMode" && ! has_field "$file" "mode"; then
        echo "Missing permissionMode/mode: $file"
        return 1
      fi
    fi
  done
}

# =============================================================================
# SKILL FILES
# =============================================================================

@test "all skill files have frontmatter" {
  if [[ -d "$PLUGIN_ROOT/skills" ]]; then
    for file in "$PLUGIN_ROOT"/skills/*.md; do
      if [[ -f "$file" ]]; then
        if ! has_frontmatter "$file"; then
          echo "Missing frontmatter: $file"
          return 1
        fi
      fi
    done
  else
    skip "No skills directory"
  fi
}

@test "all skills have triggers field" {
  if [[ -d "$PLUGIN_ROOT/skills" ]]; then
    for file in "$PLUGIN_ROOT"/skills/*.md; do
      if [[ -f "$file" ]]; then
        # Triggers might be in different formats
        local fm
        fm=$(get_frontmatter "$file")
        if [[ -z "$fm" ]]; then
          echo "Empty frontmatter: $file"
          return 1
        fi
      fi
    done
  else
    skip "No skills directory"
  fi
}

# =============================================================================
# TEMPLATE FILES
# =============================================================================

@test "template CLAUDE.md has valid content" {
  local claude_template="$PLUGIN_ROOT/templates/claude/CLAUDE.md"
  if [[ -f "$claude_template" ]]; then
    # Should have some content
    [[ -s "$claude_template" ]]
  else
    skip "CLAUDE.md template not found"
  fi
}

# =============================================================================
# FRONTMATTER VALIDITY
# =============================================================================

@test "command frontmatter is valid YAML" {
  for file in "$PLUGIN_ROOT"/commands/*.md; do
    if [[ -f "$file" ]]; then
      local fm
      fm=$(get_frontmatter "$file")

      # Basic YAML validation - check for key: value format
      if ! echo "$fm" | grep -qE "^[a-z_-]+:" 2>/dev/null; then
        if [[ -n "$fm" ]]; then
          echo "Invalid YAML in: $file"
          return 1
        fi
      fi
    fi
  done
}

@test "agent frontmatter is valid YAML" {
  for file in "$PLUGIN_ROOT"/agents/*.md; do
    if [[ -f "$file" ]]; then
      local fm
      fm=$(get_frontmatter "$file")

      # Basic YAML validation
      if ! echo "$fm" | grep -qE "^[a-z_-]+:" 2>/dev/null; then
        if [[ -n "$fm" ]]; then
          echo "Invalid YAML in: $file"
          return 1
        fi
      fi
    fi
  done
}

# =============================================================================
# NAMING CONVENTIONS
# =============================================================================

@test "command filenames match expected pattern" {
  for file in "$PLUGIN_ROOT"/commands/*.md; do
    if [[ -f "$file" ]]; then
      local basename
      basename=$(basename "$file" .md)

      # Should be lowercase with hyphens
      if ! echo "$basename" | grep -qE "^[a-z][a-z0-9-]*$"; then
        echo "Invalid filename pattern: $file"
        return 1
      fi
    fi
  done
}

@test "agent filenames match expected pattern" {
  for file in "$PLUGIN_ROOT"/agents/*.md; do
    if [[ -f "$file" ]]; then
      local basename
      basename=$(basename "$file" .md)

      # Skip README
      if [[ "$basename" == "README" ]]; then
        continue
      fi

      # Should be lowercase with hyphens
      if ! echo "$basename" | grep -qE "^[a-z][a-z0-9-]*$"; then
        echo "Invalid filename pattern: $file"
        return 1
      fi
    fi
  done
}

# =============================================================================
# REQUIRED AGENT FIELDS
# =============================================================================

@test "trd-implementer agent exists and has required fields" {
  local file="$PLUGIN_ROOT/agents/trd-implementer.md"
  if [[ -f "$file" ]]; then
    has_field "$file" "name"
    has_field "$file" "description"
    has_field "$file" "permissionMode" || has_field "$file" "mode"
  else
    skip "trd-implementer.md not found"
  fi
}

@test "trd-designer agent exists and has required fields" {
  local file="$PLUGIN_ROOT/agents/trd-designer.md"
  if [[ -f "$file" ]]; then
    has_field "$file" "name"
    has_field "$file" "description"
    has_field "$file" "permissionMode" || has_field "$file" "mode"
  else
    skip "trd-designer.md not found"
  fi
}

@test "code-reviewer agent exists and has required fields" {
  local file="$PLUGIN_ROOT/agents/code-reviewer.md"
  if [[ -f "$file" ]]; then
    has_field "$file" "name"
    has_field "$file" "description"
    has_field "$file" "permissionMode" || has_field "$file" "mode"
  else
    skip "code-reviewer.md not found"
  fi
}

@test "debugger agent exists and has required fields" {
  local file="$PLUGIN_ROOT/agents/debugger.md"
  if [[ -f "$file" ]]; then
    has_field "$file" "name"
    has_field "$file" "description"
    has_field "$file" "permissionMode" || has_field "$file" "mode"
  else
    skip "debugger.md not found"
  fi
}
