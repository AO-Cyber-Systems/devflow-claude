---
objective: 28
slug: model-tier-binding-and-escalation
status: complete
work: feature
completed: 2026-08-19
commits: [d469837, 55d1a82, c6c1a74, ac7dc89]
tests_added: 39
regressions: 0
---

# Objective 28: Model tier binding and escalation — SUMMARY

## What shipped

| TRD | Change | Commit |
|---|---|---|
| 28-01 | Model ids refreshed; `models{}` documented as live | `d469837` |
| 28-02 | Profile table actually binds; resolution auditable | `d469837` |
| 28-03 | `effort` declared per agent; reference regenerated | `55d1a82` |
| 28-04 | No-progress guard (lib + PreToolUse hook) | `c6c1a74` |
| 28-05 | Escalation policy + executor request protocol | `ac7dc89` |
| 28-06 | Haiku replay eval — **not done**, see below |

## The audit's finding was right but understated

F-07 reported "the pinned model ids are stale and never ran." True — but the
reason was worse than staleness.

Profile keys carried a `df-` prefix. Compound `init` commands passed
`df-planner`; the three skills that call `df-tools resolve-model` directly
(`research-objective`, `debug`, `audit-milestone`) passed `planner`. The miss
fell through to a hard-coded `'sonnet'` with `unknown_agent: true` — **silently,
for every agent, ignoring the configured profile**. Measured before the fix:

```
planner              sonnet (UNKNOWN)   |  df-planner          inherit
codebase-mapper      sonnet (UNKNOWN)   |  df-codebase-mapper  haiku
```

So the profile system was inert for those callers, and nothing ever said so.
That is also why the audit saw 90.8% of turns on Opus: the `opus` tier maps to
the Task alias `inherit`, so agents kept the session model.

**Correction to the audit:** `models{}` is *not* dead config. `flutter-ui-eval.cjs`
reads it and sends the id straight to the Messages API for the vision judge, so
`claude-opus-4-6` was a live runtime value, not documentation. Refreshing the
ids was a behaviour change, not a cosmetic one. The artifact should be updated.

## Constraint discovered during 28-03

`Task()` takes no effort argument — reasoning effort is declared in agent
frontmatter and therefore **cannot vary by profile**. Worse, **Haiku 4.5 rejects
`effort` outright**, so any agent reachable at the haiku tier in *any* profile
must not declare it. Only 6 of 13 qualify:

`planner` xhigh · `executor` xhigh · `debugger` xhigh · `security-auditor` xhigh
· `roadmapper` high · `ui-evaluator` high

`model-profiles.test.cjs` fails the build if a haiku-capable agent gains an
`effort` line. This is a real limit on effort as a cost lever — worth knowing
before planning around it.

## Tier assignments deliberately unchanged

R-11 recommended sonnet-first for bounded subagents. The `balanced` profile
already encoded exactly that. What was broken was **binding**, not the
assignments — so fixing 28-02 delivers R-11 without touching a single tier.

## Evidence

- **Suite: 2748 tests, 2689 pass, 9 fail** — the same pre-existing failures in
  `devflow-watch`, `handoff-e2e`, `awareness` (daemon/timing; they flake between
  9 and 10 across runs). Baseline before objective 27 was 2681/2621/10.
- **39 tests added, 0 regressions.**
  - `model-profiles.test.cjs` — 13 new; the mechanical guard against key drift
  - `progress-guard.test.cjs` — 16 new, incl. explicit proof that normal varied
    work never trips the guard
  - `guard-no-progress.test.js` — 10 new subprocess tests, incl. fail-open cases

## Not done — 28-06, Haiku replay eval

The corpus contains **63 Haiku turns**, which is no basis for placing anything on
rung 0. Settling it needs a replay harness: re-run N completed TRDs with
known-good verifier verdicts on haiku and measure (a) what fraction fits in the
200K window, (b) verifier pass rate, (c) escalation rate, (d) total cost
*including* the escalated retry.

Deferred rather than guessed. Note the prior finding stands: 22.4% of subagent
turns already exceed 200K, so rung 0 is capped at ~78% success by context alone
before quality enters.

## Also not done — orchestrator-side escalation

28-05 ships the policy and the executor's escalation *request*. The orchestrator
does not yet act on it (re-spawn one rung up with prior evidence). That is a
change to `execute-objective`'s wave loop and wants its own objective — it
touches live orchestration, and the trigger signal it consumes has not been
observed in the wild yet.

## Follow-ups

- 28-06 replay eval → decides rung 0.
- Orchestrator re-spawn loop → completes the cascade.
- Objective 31 telemetry will show whether the no-progress guard fires on real
  loops or on false positives; tune thresholds from that, not from intuition.
- Update the Autonomy Blocker Audit artifact with the `models{}`-is-live
  correction and the key-mismatch root cause.
