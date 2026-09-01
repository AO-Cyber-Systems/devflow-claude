---
title: "Waves and checkpoints"
weight: 50
lede: "How independent jobs run in parallel, and the four ways execution can legitimately stop."
---

## Wave-based parallelism

The planner records a dependency position on each job. At execution time, jobs are
grouped into waves: everything in a wave is independent of everything else in that
wave, so it can run concurrently.

```text
Wave 1:  job 4-01   job 4-02   job 4-03      ← no dependencies, run together
             │          │          │
             └──────────┴──────────┘
Wave 2:            job 4-04                  ← depends on wave 1 output
```

Each job goes to its own `executor` subagent with a fresh context window. This is
not just a speed optimisation — it is the mechanism from
[context rot](/docs/concepts/context-rot/). Three jobs in a wave means three clean
windows rather than one window carrying all three jobs' reconnaissance.

### Worktree isolation

The `executor` agent declares `isolation: worktree`. Each parallel executor gets
its own git worktree, so concurrent jobs cannot collide on the working tree.

{{< callout title="The worktree guard is not a DevFlow hook" type="warn" >}}
Claude Code's harness has its own worktree-isolation guard that refuses compound
Bash commands it cannot statically verify — including commands with no git in them.
No `DEVFLOW_*` escape hatch applies to it, because it is not DevFlow's. Executors
mitigate it by emitting one plain command per Bash call.
{{< /callout >}}

### Tuning it

```json
{
  "parallelization": {
    "enabled": true,
    "job_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_jobs_for_parallel": 2
  }
}
```

`job_level` parallelism is the useful one and is on by default. `task_level` is
off: tasks within a job usually share files, and the coordination cost exceeds the
gain.

`max_concurrent_agents: 3` is a deliberate default rather than a limit of the
system — more concurrent agents means more simultaneous model calls, and past
three the wall-clock gain flattens while cost keeps climbing.

## Checkpoints

A checkpoint is a formalised stop in an execution plan. The governing principle is
narrow: **if Claude can run it, Claude runs it.** Checkpoints are for human
judgement, never for manual labour.

The golden rules the executor works to:

1. Never ask you to run a CLI command, start a server or run a build.
2. Claude sets up the verification environment itself — starts the dev server,
   seeds the database, sets env vars.
3. You only do what needs human judgement: does this look right, does this feel
   right.
4. Secrets come from you; the automation that uses them comes from Claude.

### The three types

**`checkpoint:human-verify`** — about 90% of checkpoints. Claude built and deployed
something; you confirm it works. Visual UI checks, click-through flows, animation
smoothness, accessibility.

**`checkpoint:decision`** — a fork the agent should not pick unilaterally. Which
library, which schema shape, which trade-off.

**`checkpoint:human-action`** — something only you can do. An auth flow, a
credential, a dashboard toggle. **This always stops, in every mode** — auth gates
cannot be automated away.

### Mode changes what a checkpoint does

| Mode | `human-verify` | `decision` | `human-action` |
|---|---|---|---|
| **interactive** (default) | presents to you | presents to you | stops |
| **yolo** (`auto_advance: true`) | auto-approves | auto-picks the first option | stops |
| **autonomous** (`mode: "autonomous"`) | delegated to the verifier, approved **only** on green machine evidence | parked in the decision queue | stops |

The distinction between yolo and autonomous matters. Yolo is legacy convenience —
it approves without evidence. Autonomous is stricter than interactive in one
respect: a human-verify checkpoint passes only when the verifier reports
`status: passed`, which is a higher bar than a human glancing at a screen and
saying "looks fine".

### The decision queue

In autonomous mode, a `checkpoint:decision` is parked rather than guessed. A
`DECISION-NNN.md` file lands in `.planning/decisions/pending/` and execution
continues with other work.

Resolve it when you get to it:

```text
/devflow:decide DECISION-003 option-b
```

Execution resumes from where it parked. Enable the queue with
`workflow.decision_queue: true`.
