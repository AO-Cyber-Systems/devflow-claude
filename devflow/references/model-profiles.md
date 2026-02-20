# Model Profiles

Model profiles control which Claude model each DevFlow agent uses. This allows balancing quality vs token spend.

## Profile Definitions

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| df-planner | opus | opus | sonnet |
| df-roadmapper | opus | sonnet | sonnet |
| df-executor | opus | sonnet | sonnet |
| df-objective-researcher | opus | sonnet | haiku |
| df-project-researcher | opus | sonnet | haiku |
| df-research-synthesizer | sonnet | sonnet | haiku |
| df-debugger | opus | sonnet | sonnet |
| df-codebase-mapper | sonnet | haiku | haiku |
| df-verifier | sonnet | sonnet | haiku |
| df-job-checker | sonnet | sonnet | haiku |
| df-integration-checker | sonnet | sonnet | haiku |

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

Override specific agents without changing the entire profile:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "df-executor": "opus",
    "df-planner": "haiku"
  }
}
```

Overrides take precedence over the profile. Valid values: `opus`, `sonnet`, `haiku`.

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
