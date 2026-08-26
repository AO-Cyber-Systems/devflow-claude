# Model Profiles

Model profiles control which Claude model each DevFlow agent uses. This allows balancing quality vs token spend.

> **Source of truth:** `devflow/references/model-profiles.json` — the table below is derived from that file. To add a new agent or change tier assignments, edit the JSON; do not change `df-tools.cjs`.

## Profile Definitions

| Agent | `quality` | `balanced` | `budget` | frontmatter `effort` |
|-------|-----------|------------|----------|----------------------|
| `planner` | opus | opus | sonnet | xhigh |
| `roadmapper` | opus | sonnet | sonnet | high |
| `executor` | opus | sonnet | sonnet | xhigh |
| `objective-researcher` | opus | sonnet | haiku | — |
| `project-researcher` | opus | sonnet | haiku | — |
| `research-synthesizer` | sonnet | sonnet | haiku | — |
| `debugger` | opus | sonnet | sonnet | xhigh |
| `codebase-mapper` | sonnet | haiku | haiku | — |
| `verifier` | sonnet | sonnet | haiku | — |
| `job-checker` | sonnet | sonnet | haiku | — |
| `integration-checker` | sonnet | sonnet | haiku | — |
| `security-auditor` | opus | sonnet | sonnet | xhigh |
| `ui-evaluator` | opus | sonnet | sonnet | high |

Agent keys are canonical **without** a `df-` prefix. `df-tools resolve-model`
normalises either spelling (TRD 28-02) — before that fix, un-prefixed callers
missed the table entirely and silently fell back to `sonnet`.

## Tier → model id

`models{}` is live, not documentation: `flutter-ui-eval.cjs` reads it and sends
the id to the Messages API for the vision judge. A stale id here is a runtime
defect, not a cosmetic one.

| Tier | Model id |
|------|----------|
| `opus` | `claude-opus-5` |
| `sonnet` | `claude-sonnet-5` |
| `haiku` | `claude-haiku-4-5` |

The `opus` tier resolves to the Task alias `inherit`, so the agent keeps the
session model rather than pinning one.

## Why `effort` lives in frontmatter, not this table

`Task()` takes no effort argument — reasoning effort is declared in each agent's
own frontmatter, so it cannot vary by profile.

**Haiku 4.5 rejects the `effort` parameter.** Any agent that can resolve to the
`haiku` tier in *any* profile therefore must not declare `effort`, or that run
fails. Only these six never reach haiku and can carry it: `planner`,
`roadmapper`, `executor`, `debugger`, `security-auditor`, `ui-evaluator`.
`model-profiles.test.cjs` enforces this.

## Profile Philosophy

**quality** - Maximum reasoning power
- Opus for all decision-making agents
- Sonnet for read-only verification
- Use when: quota available, critical architecture work

**balanced** (default) - Smart allocation
- Opus only for planning (where architecture decisions happen)
- Sonnet for execution and research (follows explicit instructions)
- Sonnet for verification (needs reasoning, not just pattern matching)
- Use when: normal development, good balance of quality and cost

**budget** - Minimal Opus usage
- Sonnet for anything that writes code
- Haiku for research and verification
- Use when: conserving quota, high-volume work, less critical objectives

## Resolution Logic

Orchestrators resolve model before spawning:

```
1. Read .planning/config.json
2. Check model_overrides for agent-specific override
3. If no override, look up agent in profile table
4. Pass model parameter to Task call
```

## Per-Agent Overrides

Override specific agents without changing the entire profile using `agent_models` in `.planning/config.json`. Partial overrides are supported — only specified agents/tiers are replaced:

```json
{
  "model_profile": "balanced",
  "agent_models": {
    "df-planner": { "quality": "sonnet" },
    "df-executor": { "balanced": "opus", "budget": "sonnet" }
  }
}
```

Overrides take precedence over the package defaults. Valid tier values: `opus`, `sonnet`, `haiku`.

> **Legacy:** `model_overrides` (flat string values) is still supported but `agent_models` is preferred as it supports per-tier granularity.

## Switching Profiles

Runtime: `/df:set-profile <profile>`

Per-project default: Set in `.planning/config.json`:
```json
{
  "model_profile": "balanced"
}
```

## Complexity-Based Overrides

Beyond static profiles, workflows can dynamically adjust model selection based on task complexity. These overrides augment — never replace — the profile system.

### When to Downgrade

| Scenario | From | To | Rationale |
|----------|------|----|-----------|
| Well-known domain research | profile model | haiku | Standard stack/feature research is pattern matching, not reasoning |
| Gap-closure planning (`--gaps`) | profile model | sonnet | Fixes are scoped and diagnosed — less architectural reasoning needed |
| Re-verification after fixes | profile model | sonnet | Checking known items against codebase, not open-ended analysis |
| Research synthesis (< 3000 words input) | profile model | haiku | Small input = simple aggregation task |

### When to Upgrade

| Scenario | From | To | Rationale |
|----------|------|----|-----------|
| 3rd revision attempt (job-checker loop) | profile model | opus | Repeated failures suggest subtlety that needs stronger reasoning |
| Complex debugging (3+ hypotheses failed) | profile model | opus | Deep investigation requires more capable model |
| Complex execution (> 5 tasks, > 8 files) | profile model | opus | Large plans benefit from stronger context management |

### Application Pattern

Orchestrators assess complexity before spawning agents:

```
1. Evaluate complexity indicators (task_count, files_modified, iteration_count, input_size)
2. Check override conditions from tables above
3. If override applies: pass adjusted model to Task() call
4. Log override: "Model override: {agent} {profile_model} → {override_model} (reason: {reason})"
```

### Safety Rules

- **Never downgrade df-executor below sonnet** — code-writing agents need sufficient reasoning
- **Never downgrade df-planner below sonnet** — architecture decisions require reasoning
- **Overrides are per-spawn, not persistent** — each spawn re-evaluates complexity
- **User model_overrides in config.json take precedence** over complexity-based overrides

## Design Rationale

**Why Opus for df-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why Sonnet for df-executor?**
Executors follow explicit JOB.md instructions. The plan already contains the reasoning; execution is implementation.

**Why Sonnet (not Haiku) for verifiers in balanced?**
Verification requires goal-backward reasoning - checking if code *delivers* what the objective promised, not just pattern matching. Sonnet handles this well; Haiku may miss subtle gaps.

**Why Haiku for df-codebase-mapper?**
Read-only exploration and pattern extraction. No reasoning required, just structured output from file contents.

**Why `inherit` instead of passing `opus` directly?**
Claude Code's `"opus"` alias maps to a specific model version. Organizations may block older opus versions while allowing newer ones. DevFlow returns `"inherit"` for opus-tier agents, causing them to use whatever opus version the user has configured in their session. This avoids version conflicts and silent fallbacks to Sonnet.
