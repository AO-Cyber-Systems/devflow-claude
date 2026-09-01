---
title: "Hooks"
weight: 20
lede: "How DevFlow turns advisory rules into enforced ones — and every documented way out."
---

Hooks run in a separate process, receive the tool call as JSON on stdin, and can
inject context, warn, or block execution outright. They are the difference between
a convention and a rule.

All hooks are declared in `plugins/devflow/hooks/hooks.json` and registered
automatically when the plugin is enabled. Every command uses
`${CLAUDE_PLUGIN_ROOT}` for path resolution.

## Enforcement — these can block

{{< hooks group="Enforcement" >}}

### gate-edits is the one you will meet

In ambient mode — DevFlow project detected, no skill running — `gate-edits`
**denies** `Edit`, `Write` and `MultiEdit` by default. That is intentional: it is
what forces work through skills instead of ad-hoc edits that leave no plan, no
summary and no atomic commits.

Four ways through it:

1. **Run a skill.** Skills write `.planning/.skill-active` via
   `df-tools skill-active --start`, and the gate allows edits while that marker is
   live. Markers carry an `expires_at`, 8 hours by default.
2. **Use an override phrase** in your prompt: `skip devflow`, `just edit`,
   `bypass devflow`, `force edit`. The `route-intent` hook writes
   `.planning/.edit-override`, which this gate consumes — single-turn and
   TTL-bounded.
3. **Set the env escape:** `DEVFLOW_SKIP_EDIT_GATE=1`.
4. **Lower the severity per-project** in `.planning/config.json`:

```json
{ "gates": { "editGate": "strict" } }   // strict (default) | warn | off
```

Two refinements worth knowing, because both were bugs once:

- The marker is resolved from **both** the local `.planning/` and the main
  checkout's, so worktree-isolated agents are not denied by a gitignored marker
  they could never see.
- Targets **outside the project root** — the session scratchpad, `/private/tmp` —
  are never gated.

### gate-commits is invocation-aware

It blocks raw `git commit` and redirects to `df-tools commit`, which preserves
objective scope and task IDs and updates `STATE.md`.

Detection is not a substring test. Heredoc bodies and quoted arguments are stripped
before matching, so a command that merely *mentions* `git commit` — writing docs
about it, for instance — is not gated.

### guard-no-progress catches stuck loops

It fingerprints each tool call by name plus arguments. Three identical calls warn
on stderr; five escalate to an `ask` permission decision. Any variation in approach
resets the counter.

Step limits cannot do this. They fire only once the entire budget is spent, which
catches an infinite loop but never a stuck one.

{{< callout title="Deliberately not wired to tool errors" >}}
Tool errors run 3.6–4.3% at every model tier and are dominated by environment
friction, not by model confusion. Escalating on them would fire constantly and
mean nothing. The guard escalates on *repetition*, which is a real signal.
{{< /callout >}}

## Session context — these inject

{{< hooks group="Session context" >}}

## Runtime sync

{{< hooks group="Runtime sync" >}}

## Observability — warn only, never block

{{< hooks group="Observability" >}}

## Escape hatches, complete list

| Variable | Disables |
|---|---|
| `DEVFLOW_ALLOW_RAW_COMMIT=1` | the commit gate |
| `DEVFLOW_SKIP_EDIT_GATE=1` | the edit gate |
| `DEVFLOW_SKIP_CHANGELOG_GATE=1` | the tag/changelog gate |
| `DEVFLOW_SKIP_PROGRESS_GUARD=1` | the no-progress guard |
| `DEVFLOW_SKIP_INTERACTIVE_GATE=1` | the interactive-command gate |
| `DEVFLOW_SKIP_CLASSIFY=1` | session classification |
| `DEVFLOW_SKIP_AWARENESS_POPULATE=1` | the awareness cache warmer |
| `DEVFLOW_SKIP_ORG_CONTEXT=1` | org-context injection |
| `DEVFLOW_SKIP_HANDOFF_INJECT=1` | handoff result injection |
| `DEVFLOW_SKIP_HANDOFF_RESULTS=1` | handoff result routing |

Use them one-off rather than exporting them:

```bash
DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "..."
```

A gate you have permanently exported is a gate you have removed.

### Logging an override instead

When you need to bypass a gate for a real reason, record it rather than silently
escaping:

```bash
df-tools override --gate gate-edits --reason "hand-fixing generated file the executor cannot parse"
df-tools override --list --limit 20
```

Overrides are written to a structured log. That log is what makes gate friction
measurable — and a gate that is overridden constantly is a gate that is wrong.

## Not a DevFlow hook

The worktree-isolation guard — *"This agent is isolated in the worktree…"* — is a
**Claude Code harness guard**, not DevFlow's. It refuses compound Bash commands it
cannot statically verify, including ones with no git in them, and no `DEVFLOW_*`
variable affects it.

Agents work around it by emitting one plain command per Bash call.
