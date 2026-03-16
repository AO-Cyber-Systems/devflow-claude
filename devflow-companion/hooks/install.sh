#!/bin/bash
# DevFlow Companion: Hook Installer
# Registers all relay hooks in ~/.claude/settings.json
#
# Usage:
#   hooks/install.sh           -- install hooks
#   hooks/install.sh --remove  -- remove hooks

set -e

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS_FILE="$HOME/.claude/settings.json"

# Ensure settings file exists
mkdir -p "$(dirname "$SETTINGS_FILE")"
[ ! -f "$SETTINGS_FILE" ] && echo '{}' > "$SETTINGS_FILE"

if [ "$1" = "--remove" ]; then
  ruby -rjson -e '
    settings = JSON.parse(File.read(ARGV[0]))
    settings.delete("hooks")
    File.write(ARGV[0], JSON.pretty_generate(settings))
    puts "DevFlow relay hooks removed."
  ' "$SETTINGS_FILE"
  exit 0
fi

ruby -rjson -e '
  settings_path = ARGV[0]
  hooks_dir = ARGV[1]
  settings = JSON.parse(File.read(settings_path))

  settings["hooks"] = {
    "SessionStart" => [
      {
        "hooks" => [
          { "type" => "command", "command" => "#{hooks_dir}/session_lifecycle.sh" }
        ]
      }
    ],
    "SessionEnd" => [
      {
        "hooks" => [
          { "type" => "command", "command" => "#{hooks_dir}/session_lifecycle.sh" }
        ]
      }
    ],
    "Stop" => [
      {
        "hooks" => [
          { "type" => "command", "command" => "#{hooks_dir}/stop.sh" }
        ]
      }
    ],
    "PreToolUse" => [
      {
        "matcher" => "AskUserQuestion",
        "hooks" => [
          { "type" => "command", "command" => "#{hooks_dir}/ask_user.sh" }
        ]
      },
      {
        "matcher" => "Bash",
        "hooks" => [
          { "type" => "command", "command" => "#{hooks_dir}/pre_tool_use.sh" }
        ]
      }
    ]
  }

  File.write(settings_path, JSON.pretty_generate(settings))
  puts "DevFlow relay hooks installed!"
  puts ""
  puts "  SessionStart/End  -> session_lifecycle.sh"
  puts "  Stop              -> stop.sh (work summaries)"
  puts "  PreToolUse(Ask)   -> ask_user.sh (questions)"
  puts "  PreToolUse(Bash)  -> pre_tool_use.sh (tool approval)"
  puts ""
  puts "Set DEVFLOW_RELAY_TOKEN for authenticated access."
  puts "Restart Claude Code sessions for hooks to take effect."
' "$SETTINGS_FILE" "$HOOKS_DIR"
