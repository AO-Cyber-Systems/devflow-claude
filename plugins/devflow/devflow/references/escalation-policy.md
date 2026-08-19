# Escalation policy

How DevFlow decides to spend a more capable model, and when to stop.

> Evidence base: Autonomy Blocker Audit, 2026-08-18 — 2,746 sessions, 438,941
> assistant turns. Figures below are measured from that corpus unless noted.

## The one rule that matters

**Never escalate on a raw tool error.**

The corpus tool-error rate is **3.6–4.3% at every model tier** — Opus 5 4.36%,
Sonnet 5 4.33%, Opus 4.8 3.94% on like-for-like subagent work. Much of it is
environment friction: gate false positives, worktree-guard refusals, wrong CWD.
A larger model cannot fix a mis-scoped guard. An escalation policy wired to tool
errors would have spent the entire budget on Opus responding to one.

Escalate on **verified failure to make progress**, not on friction.

## Triggers

| Trigger | Source | Action |
|---|---|---|
| Tests still red after **2** cheap reflect/replan attempts | executor's own verification | escalate one rung |
| Verifier returns `gaps_found` / fail | `df-verifier` | escalate one rung |
| No-progress guard reports `stuck` | `guard-no-progress.js` (TRD 28-04) | escalate one rung |
| `checkpoint:decision` reached | TRD checkpoint | escalate to the **human**, not a model |
| Authority or judgement call | executor deviation rules | escalate to the **human** |
| Single tool error | — | **do not escalate** — retry or vary the approach |

Two cheap attempts before escalating is deliberate. In an executable environment
a failed attempt returns *actionable feedback* — a stack trace, a failing
assertion — not merely a wrong answer, so cheap reflection often beats paying
for a bigger model. This is the coding-agent correction to the naive cascade.

## Rungs

| Rung | Agents | Start at |
|---|---|---|
| 0 — mechanical | `codebase-mapper`, `research-synthesizer` | haiku |
| 1 — bounded | `executor`, `verifier`, `job-checker`, `integration-checker` | sonnet |
| 2 — judgement | `planner`, `debugger`, `security-auditor` | opus |
| 3 — human | — | — |

Rungs map onto the `budget` / `balanced` / `quality` profiles rather than being a
separate mechanism; see `model-profiles.md`.

## Bounded burst, then de-escalate

Escalation is a **burst**, not a mode change.

- Cap consecutive escalated steps per escalation. One hard task must not pin the
  whole run to the top tier.
- **De-escalate to the starting rung as soon as a task completes cleanly.**
- More escalation budget is not monotonically better: under uncertainty it
  amplifies flailing rather than fixing it. If a run is dead-ending, the problem
  is usually the plan, not the model.

## Mechanism

An agent cannot change its own model — `Task()` fixes it at spawn. So:

1. The agent **requests** escalation by returning the structured block below and
   stopping. It does not keep trying at its current tier.
2. The **orchestrator** re-spawns the same TRD one rung up, passing the prior
   attempt's evidence so the escalated agent does not start cold.

```
## ESCALATION REQUESTED

**TRD:** {objective}-{trd}
**Current rung:** {rung} ({model})
**Trigger:** tests-red-after-2 | verifier-fail | no-progress-stuck
**Attempts:** {n}

### What was tried
{one line per attempt — what changed, what the result was}

### Why it is not converging
{the specific blocker, with the failing output}

### What a higher rung should do differently
{concrete — not "think harder"}
```

The last section is the point. An escalation that cannot say what the higher
rung should do differently is usually a planning gap, and re-running it on a
bigger model will fail the same way.

## The validator is the correctness boundary

The verifier is the escalation gate, so **verifier quality bounds the whole
system**. A weak gate either false-accepts (bad code ships) or false-rejects
(everything escalates and the cascade costs more than no cascade). Two
consequences:

- The verifier never sits on rung 0.
- Calibrate its threshold against known-good TRDs before trusting it as a gate.

## Acceptance

Judge a cascade on **cost per resolved task**, with verifier pass rate held —
never on escalation count. A run that escalates less but resolves less is not an
improvement.
