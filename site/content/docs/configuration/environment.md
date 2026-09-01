---
title: "Environment variables"
weight: 40
lede: "Every DEVFLOW_ variable, what it changes, and the Claude Code variables worth leaving alone."
---

## Escape hatches

Prefer one-off use over exporting. An exported escape hatch is a removed gate.

```bash
DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "..."
```

| Variable | Effect |
|---|---|
| `DEVFLOW_ALLOW_RAW_COMMIT=1` | Allow raw `git commit`, bypassing `gate-commits` |
| `DEVFLOW_SKIP_EDIT_GATE=1` | Disable `gate-edits` entirely |
| `DEVFLOW_SKIP_CHANGELOG_GATE=1` | Allow `git tag -a` without a changelog entry |
| `DEVFLOW_SKIP_PROGRESS_GUARD=1` | Disable the repeated-call guard |
| `DEVFLOW_SKIP_INTERACTIVE_GATE=1` | Disable interactive-command interception |

## Session behaviour

| Variable | Effect |
|---|---|
| `DEVFLOW_SKIP_CLASSIFY=1` | Skip session classification and the routing preamble |
| `DEVFLOW_SKIP_AWARENESS_POPULATE=1` | Skip the background awareness cache warm |
| `DEVFLOW_SKIP_ORG_CONTEXT=1` | Skip org-context injection at planning time |
| `DEVFLOW_SKIP_HANDOFF_INJECT=1` | Skip handoff result injection |
| `DEVFLOW_SKIP_HANDOFF_RESULTS=1` | Skip handoff result routing |

## Paths and overrides

| Variable | Effect |
|---|---|
| `DEVFLOW_HOME` | Override the runtime mirror location (default `~/.claude/devflow`) |
| `DEVFLOW_AUDIT_LOG_PATH` | Where the Stop-hook audit log is written |
| `DEVFLOW_MODEL_PROFILE` | Force a model profile for the session |
| `DEVFLOW_OWNED` | Marks a path as DevFlow-managed |

## Handoff daemon

| Variable | Effect |
|---|---|
| `DEVFLOW_HANDOFF_PID_FILE` | Override the daemon PID file location |
| `DEVFLOW_WATCH_ALLOW_FILE` | Path to a custom allowlist |
| `DEVFLOW_HANDOFF_RESULT_TTL_MS` | How long an unconsumed result stays valid |

## Deprecated

| Variable | Status |
|---|---|
| `DEVFLOW_STRICT_EDITS=1` | No longer needed — strict is the default. Use `gates.editGate` to *relax* it. |

## Claude Code variables

Two are worth an explicit position, because tuning them looks helpful and is not.

{{< callout title="Leave these alone" >}}
**`MAX_MCP_OUTPUT_TOKENS`** (25K, warns at 10K) and **`BASH_MAX_OUTPUT_LENGTH`**
(50K) are not binding. The largest single tool result measured across ~93M tokens
of transcripts was 26K, and p99 is around 6K. Tightening them buys no context and
breaks legitimate large results.

**`ENABLE_TOOL_SEARCH`** should stay on its default so MCP tool schemas remain
deferred and out of the window.

The lever on context is behaviour, not configuration — see
[context discipline](/docs/concepts/context-discipline/).
{{< /callout >}}
