---
name: df:aosentry-setup
description: |
  Configure AOSentry MCP servers (media + management) in the current project.
  Connects Claude Code to a remote AOSentry instance for AI media generation, vision analysis,
  TTS, transcription, and full admin management (spend, keys, guardrails, models, users, teams, orgs, budgets, config, credentials, health).
  Triggers on: "setup aosentry", "connect aosentry", "add aosentry mcp", "configure aosentry"
argument-hint: "[--url <aosentry-url>] [--key <api-key>] [--media-only | --management-only]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---
<objective>
Configure AOSentry MCP servers in the current project's `.mcp.json` so Claude Code can interact with a remote AOSentry instance.

Two MCP servers are available (installed by DevFlow at `~/.claude/mcp_servers/`):
- **aosentry-media** — image generation, image editing, vision analysis, text-to-speech, audio transcription, audio translation
- **aosentry-management** — spend analytics, API key management, guardrails, models, users, teams, organizations, budgets, config, credentials, health

Both servers connect to AOSentry's HTTP API via the `aosentry` Ruby gem, so all guardrails, budget enforcement, spend tracking, and audit logging apply automatically.

Requires: Ruby, Bundler.
</objective>

<process>

## Step 1: Gather configuration

Ask the user for any values not provided as arguments:

1. **AOSentry URL** — The remote AOSentry instance URL (e.g., `https://aosentry.aocodex.ai`). No trailing slash.
2. **API Key** — An AOSentry API key with appropriate permissions. Management tools that modify guardrails, config, or credentials require a master key.
3. **Which servers** — Both (default), `--media-only`, or `--management-only`.

## Step 2: Locate MCP servers

The MCP servers are installed by DevFlow at `~/.claude/mcp_servers/`. Verify:

```bash
test -f ~/.claude/mcp_servers/media/server.rb && echo "media: ok" || echo "media: missing"
test -f ~/.claude/mcp_servers/management/server.rb && echo "management: ok" || echo "management: missing"
```

If missing, tell the user to reinstall DevFlow: `npx @ao-cyber-systems/devflow-cc --global`

## Step 3: Ensure dependencies are installed

Run `bundle install` in each selected MCP server directory if `Gemfile.lock` is missing:

```bash
cd ~/.claude/mcp_servers/media && (bundle check 2>/dev/null || bundle install)
cd ~/.claude/mcp_servers/management && (bundle check 2>/dev/null || bundle install)
```

Note: The `aosentry` gem is published on GitHub Packages. If `bundle install` fails with auth errors, the user needs:
```bash
bundle config set --global rubygems.pkg.github.com <GITHUB_USERNAME>:<GITHUB_TOKEN>
```

## Step 4: Write .mcp.json

Read the existing `.mcp.json` in the current project root (if any) and merge the AOSentry server entries. Do not overwrite other existing MCP server configurations.

For each selected server, add an entry using absolute paths:

```json
{
  "mcpServers": {
    "aosentry-media": {
      "command": "bundle",
      "args": ["exec", "ruby", "<HOME>/.claude/mcp_servers/media/server.rb"],
      "env": {
        "AOSENTRY_URL": "<user-provided-url>",
        "AOSENTRY_API_KEY": "<user-provided-key>",
        "BUNDLE_GEMFILE": "<HOME>/.claude/mcp_servers/media/Gemfile"
      }
    },
    "aosentry-management": {
      "command": "bundle",
      "args": ["exec", "ruby", "<HOME>/.claude/mcp_servers/management/server.rb"],
      "env": {
        "AOSENTRY_URL": "<user-provided-url>",
        "AOSENTRY_API_KEY": "<user-provided-key>",
        "BUNDLE_GEMFILE": "<HOME>/.claude/mcp_servers/management/Gemfile"
      }
    }
  }
}
```

If the AOSentry URL uses a self-signed certificate (e.g., `https://*.test`), add `"AOSENTRY_SSL_VERIFY": "false"` to the env.

## Step 5: Verify

Tell the user to restart Claude Code (or run `/mcp`) to pick up the new MCP servers. List the tools that will be available:

**Media tools (6):** `generate_image`, `edit_image`, `analyze_image`, `text_to_speech`, `transcribe_audio`, `translate_audio`

**Management tools (39):** `get_spend_summary`, `get_spend_by_keys`, `get_spend_by_models`, `get_spend_by_provider`, `get_spend_logs`, `list_keys`, `generate_key`, `get_key_info`, `rotate_key`, `block_key`, `unblock_key`, `delete_key`, `list_guardrails`, `get_guardrail`, `create_guardrail`, `update_guardrail`, `delete_guardrail`, `get_guardrail_logs`, `get_guardrail_stats`, `list_models`, `get_model_info`, `list_users`, `create_user`, `update_user`, `delete_user`, `list_teams`, `create_team`, `update_team`, `delete_team`, `add_team_member`, `remove_team_member`, `list_orgs`, `create_org`, `update_org`, `delete_org`, `list_budgets`, `create_budget`, `update_budget`, `delete_budget`, `get_budget_info`, `list_configs`, `update_config`, `list_credentials`, `create_credential`, `update_credential`, `delete_credential`, `get_health_status`

</process>
