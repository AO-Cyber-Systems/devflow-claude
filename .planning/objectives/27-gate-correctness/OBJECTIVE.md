---
objective: 27
slug: gate-correctness
work: bugfix
kind: plugin
status: in-progress
depends_on: []
source: Autonomy Blocker Audit (2026-08-18)
---

# Objective 27: Gate correctness

## Goal

Stop DevFlow's own gates from blocking DevFlow's own agents. Close the three
gate defects measured in the Autonomy Blocker Audit across 2,746 sessions:
1,048 edit-gate denials inside DevFlow subagents, 280 denials on paths outside
the repository, and a commit-gate false positive that fires on any command
merely *containing* the raw-commit phrase.

## Evidence base

| Finding | Measured | Mechanism |
|---|---|---|
| F-02 | 1,048 blocks (77.2% of edit-gate denials) hit sidechain subagents | marker invisible in worktrees |
| F-03 | 331 confirmed Bash-heredoc bypasses after denial | gate binds tool name, not action |
| F-04 | 446 commit-gate blocks; 30.7% used the escape hatch | substring match on whole command |
| F-01 | 1,552 git-less refusals | harness worktree guard — **not DevFlow code** |

## Root cause (verified in source, not inferred)

`gate-edits.js:174` resolves the marker with `findPlanningDir(process.cwd())`,
and `.planning/.skill-active` is gitignored at `.gitignore:44`.

A git worktree checks out all 437 tracked `.planning` files but **never the
marker**, because it is untracked. So `findPlanningDir()` inside a worktree
resolves to the *worktree's own* `.planning/`, which can never contain the
marker written by the main checkout. Every worktree subagent therefore fails
`hasSkillActiveMarker()` and is denied.

## Scope correction discovered during planning

Reading `gate-edits.js` revised two assumptions from the remediation plan:

- Line 129 **already allows** `.planning/**`, and line 132 allows all `.md`.
  The gate only ever denies non-markdown source. The plan's proposal to make
  `.planning/` *strict* would therefore invert deliberate existing behaviour —
  dropped.
- Once the marker resolves correctly, the gate stops firing on sanctioned
  agents at all, so the F-03 bypass pressure largely dissolves without changing
  the default posture. Posture change is deferred to a decision point rather
  than applied unilaterally (see TASKS 27-03).

## Must-haves

- [ ] A worktree-isolated agent sees the marker written by the main checkout
- [ ] Marker cannot outlive a crashed skill indefinitely (TTL)
- [ ] Writes to paths outside the project root are never gated
- [ ] `.planning/` writes without a marker still behave as before
- [ ] A heredoc whose body contains the raw-commit phrase is permitted
- [ ] `npm test` green
