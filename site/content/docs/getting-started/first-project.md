---
title: "Your first project"
weight: 30
lede: "A closer look at what new-project produces, and how to steer it before it commits to a plan."
---

`/devflow:new-project` is the only command that creates `.planning/` from nothing.
Everything downstream reads what it writes, so it is worth understanding what
comes out.

## The interview

DevFlow asks what you're building. Answer in prose — a paragraph is plenty. It
uses your answer to decide how much research it needs and what `kind` the project
is.

You can skip the interview entirely with `--auto`, which makes reasonable
assumptions and moves straight to research. Use it when you already know exactly
what you want and would rather correct a draft than answer questions.

```text
/devflow:new-project --auto
```

### Starting from a document

If you already have a spec, PRD or design doc, point at it in your answer. The
`project-researcher` agent reads it rather than re-deriving requirements from a
one-line description.

## What gets produced

### PROJECT.md

Vision and context. This file is loaded on essentially every DevFlow operation, so
it stays short. It carries the project's `kind` on its frontmatter:

{{< intent >}}

`kind` is the first half of the [intent model](/docs/concepts/intent-model/) — it,
plus each objective's `work` type, determines TDD posture, planning depth, model
profile and verification rigor.

### REQUIREMENTS.md

Scoped requirements with stable IDs, split into v1 (this milestone) and v2 (later).
IDs matter: the roadmap references them, and `/devflow:milestone audit` checks that
each v1 requirement was actually delivered.

### ROADMAP.md

Objectives in dependency order, each with success criteria. This is the file you
will look at most. Objectives are numbered; those numbers are what you pass to
`/devflow:build`.

### STATE.md

Living project memory: current position, decisions with rationale, open blockers,
session history. This is what makes DevFlow survive a `/clear` or a week off — the
state was never in the context window, so losing the window costs nothing.

### research/

Domain research from the `project-researcher` and `research-synthesizer` agents:
stack options, architecture patterns, common pitfalls. Read once, referenced by
the roadmapper.

## Steering before you commit

Three commands let you correct course before any code is written. All three are
cheap relative to rebuilding.

### Discuss an objective

```text
/devflow:discuss-objective 3
```

Captures your implementation preferences into `CONTEXT.md` for that objective
*before* research and planning run. Most bad plans come from the planner making an
assumption you would have corrected in ten seconds. This is where you correct it.

### See the assumptions first

```text
/devflow:list-objective-assumptions 3
```

Shows what Claude intends to do without creating any files. Read it, and if it is
wrong, run `discuss-objective`.

### Research first

```text
/devflow:research-objective 3
```

Runs the `objective-researcher` against the objective's domain and writes
`RESEARCH.md`. `/devflow:build` does this automatically unless you pass
`--skip-research`.

## Confirmation gates

By default DevFlow stops for your confirmation at several points. They are all
toggleable in `.planning/config.json`:

```json
{
  "gates": {
    "confirm_project": true,
    "confirm_objectives": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_job": true,
    "execute_next_job": true,
    "issues_review": true,
    "confirm_transition": true
  }
}
```

Turn them off once you trust the loop on a given project. See
[gates and enforcement](/docs/configuration/gates/).

## Keeping planning private

For client or sensitive work, keep planning artifacts out of git:

```json
{ "planning": { "commit_docs": false } }
```

Then add `.planning/` to `.gitignore`. Planning stays local; only code is
committed.
