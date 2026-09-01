---
title: "The loop"
weight: 20
lede: "Six phases, each writing files the next one reads. What each phase produces and when to skip it."
---

DevFlow's lifecycle is a loop you can enter and leave at any point. Each phase
produces artifacts on disk; the next phase reads them. Nothing is passed through
the conversation.

```text
new-project → discuss-objective → plan-objective → execute-objective → verify-work → milestone complete
     │                                                                                       │
     └───────────────────────────────── next milestone ──────────────────────────────────────┘
```

## 1. new-project

**Command:** `/devflow:new-project` · **Agents:** `project-researcher`, `research-synthesizer`, `roadmapper`

Interviews you, researches the domain in parallel, scopes requirements into v1/v2,
and orders objectives into a roadmap.

**Produces:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`,
`config.json`, `research/`

**Run once per project.** For a new milestone inside an existing project, use
`/devflow:milestone new`.

## 2. discuss-objective

**Command:** `/devflow:discuss-objective <n>` · **Agents:** none

Asks you how you want this objective built — libraries, patterns, trade-offs you
care about — and records the answers.

**Produces:** `objectives/NN-name/CONTEXT.md`

**Optional, and the highest-leverage optional step there is.** Most plan quality
problems are the planner making an assumption you would have corrected in ten
seconds. This is where you correct it.

## 3. plan-objective

**Command:** `/devflow:plan-objective <n>` · **Agents:** `objective-researcher`, `planner`, `job-checker`

Researches the objective's domain, then breaks it into atomic jobs. Each job gets
tasks, success criteria and a dependency position. The `job-checker` then reviews
the plan *before* it runs and asks the only question that matters: would executing
this actually achieve the objective's goal?

**Produces:** `objectives/NN-name/RESEARCH.md`, `NN-YY-JOB.md` files

**Plans should be small.** Two to three tasks per job. A job larger than one
context window will produce stubs, not code.

## 4. execute-objective

**Command:** `/devflow:execute-objective <n>` · **Agents:** `executor` (parallel)

Groups jobs into [waves](/docs/concepts/waves/) by dependency and dispatches each
job to an `executor` subagent in a fresh window. Every task produces one atomic
commit.

**Produces:** code, commits, `NN-YY-SUMMARY.md` per job

Executors run with `isolation: worktree` — each gets its own git worktree, so
parallel jobs cannot collide on the working tree.

## 5. verify-work

**Command:** `/devflow:verify-work <n>` · **Agents:** `verifier`, `integration-checker`, optionally `ui-evaluator`

Tests what was built against the objective's *goal*, not against the task list. A
plan whose tasks all completed but which does not achieve the objective is a
failure, and this is the phase that catches it.

**Produces:** `objectives/NN-name/VERIFICATION.md`, `UAT.md`

Verification is backend-aware: web surfaces are driven through Playwright, Flutter
through Maestro, and deployment verification runs conditionally based on whether
the objective actually deployed anything.

If gaps are found, the objective's status becomes `gaps_found` and you can plan
gap-closure work with `/devflow:plan-objective <n> --gaps`.

## 6. milestone complete

**Commands:** `/devflow:milestone audit`, `/devflow:milestone complete`

`audit` checks each v1 requirement was genuinely delivered and reports gaps —
`/devflow:milestone gaps` turns those into objectives. `complete` archives the
milestone into `MILESTONES.md` and opens the next.

## The one-command version

```text
/devflow:build <n>
```

`/devflow:build` chains plan → execute → verify with the gates in between. It is
the command most people use most of the time. Flags let you shape it:

| Flag | Effect |
|---|---|
| `--pause` | Stop after planning for review |
| `--skip-research` | Skip the research agent (familiar domain) |
| `--work TYPE` | Override the objective's work type |
| `--tdd POSTURE` | Override TDD posture |
| `--depth LEVEL` | `quick` / `standard` / `comprehensive` |
| `--model PROFILE` | `quality` / `balanced` / `budget` for this run |

## Entering the loop partway

You do not have to start at the beginning.

- **Existing codebase?** `/devflow:map-codebase` then `/devflow:new-project`.
- **Roadmap already exists, one objective to build?** `/devflow:build <n>`.
- **Something broke?** `/devflow:debug "description"` — a different loop entirely,
  with its own persistent state.
- **Lost the thread?** `/devflow:status` reads everything and tells you where you
  are.
