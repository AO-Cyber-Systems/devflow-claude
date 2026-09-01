---
title: "Gates and enforcement"
weight: 30
lede: "Which gates block, which merely ask, how to tune each, and how to log an override rather than hiding it."
---

DevFlow has two kinds of gate and they are easy to confuse.

**Confirmation gates** are workflow pauses configured in `config.json` — points
where DevFlow asks you before proceeding.

**Enforcement gates** are hooks that block tool calls outright. They are not
configurable per-decision; they are on or off.

## Confirmation gates

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

| Gate | Fires when |
|---|---|
| `confirm_project` | after `PROJECT.md` is drafted |
| `confirm_objectives` | after objectives are proposed |
| `confirm_roadmap` | after the roadmap is assembled |
| `confirm_breakdown` | after an objective is broken into jobs |
| `confirm_job` | before each job executes |
| `execute_next_job` | between jobs |
| `issues_review` | when verification finds gaps |
| `confirm_transition` | at milestone transitions |

Turn them off as you build trust on a project. `confirm_roadmap` is the one worth
keeping longest — a wrong roadmap costs the most to discover late.

## Enforcement gates

These are hooks. Full detail on [the hooks page](/docs/architecture/hooks/).

| Gate | Blocks | Escape |
|---|---|---|
| `gate-edits` | `Edit`/`Write`/`MultiEdit` in ambient mode | skill marker, override phrase, `DEVFLOW_SKIP_EDIT_GATE=1`, or `gates.editGate` |
| `gate-commits` | raw `git commit` | `DEVFLOW_ALLOW_RAW_COMMIT=1` |
| `changelog-on-tag` | `git tag -a vX.Y.Z` without a changelog entry or with mismatched versions | `DEVFLOW_SKIP_CHANGELOG_GATE=1` |
| `gate-interactive` | TTY-requiring commands | `DEVFLOW_SKIP_INTERACTIVE_GATE=1` |
| `guard-no-progress` | escalates to `ask` at 5 identical calls | `DEVFLOW_SKIP_PROGRESS_GUARD=1` |

### Per-project severity

Only `gate-edits` has a severity dial:

```json
{ "gates": { "editGate": "strict" } }   // strict | warn | off
```

Use `warn` on a repository where you frequently work outside DevFlow but still
want the reminder. Use `off` for a repository that has `.planning/` for historical
reasons but is not actively driven by DevFlow.

## Logging an override

A one-off escape hatch is fine. A permanently exported one is a gate you removed.
When you need to bypass for a real reason, record it:

```bash
df-tools override --gate gate-edits --reason "hand-fixing a generated file the executor cannot parse"
df-tools override --list --limit 20
```

This writes a structured log entry. The value is measurement: a gate that gets
overridden constantly is a gate that is wrong, and the log is the evidence that
makes the case.

## What the gates are actually for

Each enforcement gate corresponds to a specific failure mode that DevFlow has
observed:

- **`gate-edits`** — ad-hoc edits that leave no plan, no summary and no atomic
  commits, so the work cannot be reviewed, reverted or resumed.
- **`gate-commits`** — commits that lose objective scope and task IDs, so
  `git log` stops being a map of the roadmap.
- **`changelog-on-tag`** — releases shipped without documentation, and the
  three-file version drift that follows.
- **`guard-no-progress`** — an agent burning budget on the same failing call.
- **`gate-interactive`** — an agent hanging forever on a prompt nobody can answer.

None of them exist to make you ask permission. They exist because the thing they
block produced a specific, repeated mess.
