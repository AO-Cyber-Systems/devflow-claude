---
title: "The .planning directory"
weight: 30
lede: "Every file DevFlow creates, who writes it, and who reads it back."
---

`.planning/` is the project's memory. It is the reason DevFlow survives context
resets: nothing important lives in the conversation.

```text
.planning/
  PROJECT.md              vision, context, `kind` — loaded on nearly every operation
  REQUIREMENTS.md         scoped v1/v2 requirements with stable IDs
  ROADMAP.md              objectives in dependency order, with checkboxes
  STATE.md                decisions, blockers, position, session memory
  MILESTONES.md           archive of completed milestones
  config.json             workflow configuration
  state.json              machine-readable position mirror

  research/               domain research from new-project
  codebase/               brownfield mapping from map-codebase
  todos/
    pending/              captured ideas awaiting work
    done/
  debug/                  active debug sessions
    resolved/
  decisions/
    pending/              parked DECISION-NNN.md awaiting your answer
  milestones/             archived milestone directories

  objectives/
    NN-objective-name/
      OBJECTIVE.md        goal, success criteria, `work` type
      CONTEXT.md          your implementation preferences (discuss-objective)
      RESEARCH.md         ecosystem research (research-objective)
      NN-YY-JOB.md        atomic execution plan, one per job
      NN-YY-SUMMARY.md    execution outcome, decisions, evidence
      VERIFICATION.md     post-execution verification results
      UAT.md              user acceptance walkthrough
      verification/       Maestro YAML flows, capture manifests
```

## The files you will actually read

### PROJECT.md

Short by design — it is loaded on nearly every operation, so every line costs
context on every command. Vision, constraints, key decisions, and the project
`kind` on frontmatter.

### ROADMAP.md

Objectives, ordered, with success criteria and completion checkboxes. The numbers
here are what you pass to `/devflow:build`.

Checkbox state can drift from reality if work happened outside DevFlow.
`/devflow:sync-roadmap` reconciles it against on-disk `SUMMARY.md` presence.

### STATE.md

The living memory. Current position, decisions with rationale, open blockers,
session history. Written by `df-tools state` subcommands rather than by hand:

```bash
df-tools state add-decision --objective 4 --summary "Chose X" --rationale "because Y"
df-tools state add-blocker --text "Waiting on API key"
df-tools state resolve-blocker --text "Waiting on API key"
```

### SUMMARY.md

One per job. Written by the executor when a job finishes: what it did, what it
decided, what evidence exists that it worked. The `verify-completion` Stop hook
checks the most recent one for task evidence and failure markers.

`SUMMARY.md` files are also what `/devflow:sync-roadmap` and
`df-tools gh sync-release` read — presence of a summary is the on-disk signal that
a job actually ran.

## Who writes what

| File | Written by | Read by |
|---|---|---|
| `PROJECT.md` | `new-project` | almost everything |
| `REQUIREMENTS.md` | `roadmapper` | `milestone audit` |
| `ROADMAP.md` | `roadmapper`, `objective` ops | `build`, `status`, `gh-sync` |
| `STATE.md` | `df-tools state`, executor | `status`, `resume` |
| `CONTEXT.md` | `discuss-objective` | `planner` |
| `RESEARCH.md` | `objective-researcher` | `planner` |
| `JOB.md` | `planner` | `executor`, `job-checker` |
| `SUMMARY.md` | `executor` | `verifier`, `sync-roadmap`, `gh sync-release` |
| `VERIFICATION.md` | `verifier` | `gh comment`, `milestone audit` |

## Markers and caches

A handful of dotfiles coordinate the hooks. You will rarely touch them, but they
explain otherwise-mysterious behaviour:

| File | Purpose |
|---|---|
| `.skill-active` | Written by `df-tools skill-active --start`. Its presence is what lets the edit gate allow edits. Carries an `expires_at` (8h default). |
| `.edit-override` | Written by `route-intent` when your prompt contains an override phrase. Single-turn, consumed by the edit gate. |
| `.gh-mapping.json` | Objective number → GitHub issue number. Commit this. |

## Should .planning be committed?

By default, yes — `planning.commit_docs` is `true`. Planning artifacts are project
documentation, and committing them means the roadmap and decisions are visible in
review and survive a fresh clone.

For client or sensitive work, set `commit_docs: false` and add `.planning/` to
`.gitignore`. Planning stays local; only code is committed.
