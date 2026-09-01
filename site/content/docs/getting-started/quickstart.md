---
title: "Quickstart"
weight: 20
lede: "Ten minutes: initialise a project, plan one objective, build it, verify it."
---

This walks the shortest path that still exercises the whole loop. Use a scratch
directory — you are going to let agents write code.

## 1. Initialise

```bash
mkdir hello-devflow && cd hello-devflow && git init
claude --dangerously-skip-permissions
```

In the session:

```text
/devflow:new-project
```

DevFlow asks what you're building, researches the domain, scopes requirements into
v1 and v2, and writes a roadmap. You will be asked to confirm at three gates
(project, requirements, roadmap) — that is `gates.confirm_*` doing its job.

When it finishes, `.planning/` exists:

```text
.planning/
  PROJECT.md        what you're building and why
  REQUIREMENTS.md   scoped v1/v2 requirements with IDs
  ROADMAP.md        objectives, ordered, with success criteria
  STATE.md          decisions, blockers, session memory
  config.json       workflow configuration
```

{{< callout title="Already have a codebase?" >}}
Run [`/devflow:map-codebase`](/docs/getting-started/existing-codebase/) first. It
analyses stack, architecture, conventions and concerns so the roadmap is grounded
in what you actually have.
{{< /callout >}}

## 2. Build the first objective

The single command that does everything:

```text
/devflow:build 1
```

That chains three phases:

1. **Plan** — the `planner` agent breaks objective 1 into atomic jobs, each with
   success criteria and a dependency order. The `job-checker` reviews the plan
   *before* it runs and asks whether it would actually achieve the objective.
2. **Execute** — independent jobs are dispatched to `executor` subagents in
   parallel waves, each in a fresh context window. Every task produces one atomic
   commit.
3. **Verify** — the `verifier` agent tests the result against the objective's
   goal and writes `VERIFICATION.md`.

If you would rather drive each phase yourself:

```text
/devflow:plan-objective 1
/devflow:execute-objective 1
/devflow:verify-work 1
```

## 3. See where you are

```text
/devflow:status
```

Reads every state file and tells you your position and the next action. It is the
command to run when you have lost the thread.

## 4. Keep going

```text
/devflow:build 2
```

Repeat until the milestone's objectives are done, then:

```text
/devflow:milestone audit
/devflow:milestone complete
```

`audit` checks the milestone actually delivered its requirements and reports gaps.
`complete` archives it and opens the next.

## Choosing the right entry point

Not every change deserves the full loop. DevFlow has four tiers, and picking the
right one is the single biggest lever on cost.

| Change | Command | Cost |
|---|---|---|
| Typo, rename, import, dependency bump — sub-30 LOC, one file | `/devflow:micro` | ~2k tokens |
| Small feature or isolated fix — under 5 files, under 200 LOC, no new abstractions | `/devflow:quick` | one executor, no planner or verifier |
| Multi-file feature touching more than one subsystem | `/devflow:build` | full plan → execute → verify |
| Something is broken and you don't know why | `/devflow:debug` | structured investigation that survives context resets |

{{< callout title="When in doubt, go smaller" >}}
`/devflow:quick` that turns out to be too big will tell you so and suggest
`/devflow:build`. A `/devflow:build` on a one-line fix just burns tokens.
{{< /callout >}}

## What to read next

- [The loop](/docs/concepts/the-loop/) — what each phase actually produces.
- [The `.planning` directory](/docs/concepts/planning-directory/) — every file and who writes it.
- [Commands](/docs/commands/) — the full command surface.
