---
title: "State and memory"
weight: 60
lede: "What survives a /clear, a reboot and a week away — and how to get it back."
---

DevFlow's durability claim is simple: the things worth remembering were never in
the context window, so losing the window loses nothing.

## What is remembered

| Thing | Where | Survives |
|---|---|---|
| Vision, constraints, `kind` | `PROJECT.md` | everything |
| Requirements with IDs | `REQUIREMENTS.md` | everything |
| Objectives and completion | `ROADMAP.md` | everything |
| Decisions and rationale | `STATE.md` | everything |
| Open blockers | `STATE.md` | everything |
| Position in the plan | `STATE.md` + `state.json` | everything |
| What each job did | `SUMMARY.md` | everything |
| Verification evidence | `VERIFICATION.md` | everything |
| Debug hypotheses and evidence | `debug/` | everything |
| The conversation | context window | nothing |

## Reading and writing state

State is manipulated through `df-tools` rather than by editing files, so the
markdown and its JSON mirror stay consistent.

```bash
df-tools state                  # load and print the full state
df-tools state get <key>
df-tools state patch --key value
df-tools state advance-job
df-tools state update-progress

df-tools state add-decision --objective 4 --summary "Chose Postgres" \
                            --rationale "Existing ops expertise; JSONB covers the flexible fields"
df-tools state add-blocker --text "Waiting on Stripe API key"
df-tools state resolve-blocker --text "Waiting on Stripe API key"

df-tools state record-metric --objective 4 --job 02 --duration 620 --tasks 3 --files 7
df-tools state record-session --stopped-at "mid objective 4" --resume-file .planning/SESSION_PICKUP.md
```

## Pausing and resuming

The intended rhythm is to `/clear` between major commands. That is safe *because*
of the state files, and it is how you keep the orchestrating session sharp.

```text
/devflow:status pause      # writes a resume file capturing where you stopped
/clear
/devflow:status resume     # restores position and next action
```

`pause` is optional — `resume` reconstructs position from the state files on its
own. `pause` just adds a note about what you were mid-thought on.

If you only want to know where things stand:

```text
/devflow:status            # progress + the next action
/devflow:status check      # integrity check across the planning files
```

## Integrity

Planning files can drift — a roadmap checkbox missed, a summary written for a job
whose state was never advanced. Two commands find and fix that:

```bash
df-tools validate consistency   # cross-file agreement
df-tools validate health        # add --repair to fix what it safely can
```

```text
/devflow:sync-roadmap --dry-run   # preview roadmap-vs-disk drift
/devflow:sync-roadmap             # apply
/devflow:sync-roadmap --interactive
```

## Agent memory

The `verifier` agent declares `memory: project`, which accumulates verification
patterns at `.claude/agent-memory/verifier/` across runs. It is the one agent that
deliberately carries knowledge between invocations — what a passing verification
looks like in *this* project is worth remembering, and re-deriving it every time
is waste.

## Archiving

Completed milestones move to `MILESTONES.md` and `.planning/milestones/`. Old
objective directories can be archived out of the way once their milestone is done:

```text
/devflow:cleanup
```

This is user-invoked only — Claude cannot fire it — because it moves files you
might still want in place.
