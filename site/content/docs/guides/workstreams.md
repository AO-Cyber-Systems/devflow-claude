---
title: "Parallel workstreams"
weight: 20
lede: "Running whole objectives concurrently in git worktrees, then merging them back."
---

Wave parallelism runs independent *jobs* inside one objective. Workstreams run
independent *objectives* — each in its own git worktree and branch.

{{< callout title="User-typed only" type="warn" >}}
`/devflow:workstreams` carries `disable-model-invocation: true`. Claude cannot fire
it. Creating and merging concurrent worktrees is not something to trigger by
accident.
{{< /callout >}}

## The cycle

```text
/devflow:workstreams setup     # analyse independence, provision worktrees
/devflow:workstreams status    # what's running where
/devflow:workstreams run       # execute across streams
/devflow:workstreams merge     # merge completed streams back
```

## Setup analyses independence first

Not every pair of objectives can run concurrently. `setup` runs a dependency
analysis and excludes objectives that touch the same modules, because the merge
would conflict and you would spend more time resolving than you saved.

```bash
df-tools workstreams analyze     # which objectives are independent
df-tools workstreams provision   # create worktrees and branches
df-tools workstreams reconcile   # resolve planning state after merges
```

## Configuration

```json
{
  "workstreams": {
    "worktree_prefix": "../{project}-ws-",
    "branch_prefix": "df/ws-",
    "merge_strategy": "squash"
  }
}
```

| Field | Meaning |
|---|---|
| `worktree_prefix` | Where worktrees are created. `{project}` interpolates. Sibling directories keep the main checkout clean. |
| `branch_prefix` | Branch naming. Matching `awareness.branch_patterns` means workstream branches show up in peer awareness. |
| `merge_strategy` | `squash` keeps history readable — one commit per objective rather than every atomic task commit replayed onto main. |

{{< callout title="Squash does not undo atomic commits" >}}
Atomic commits exist inside the workstream branch while the objective is being
built, which is exactly when revert granularity matters. Once the objective is
verified and merging, one commit per objective is the more useful history on main.

If you want the atomic commits preserved on main, set a non-squash
`merge_strategy` — and expect a much noisier `git log`.
{{< /callout >}}

## When it is worth it

Workstreams add real coordination cost: multiple worktrees, multiple branches, a
merge step, and reconciliation of planning state afterwards.

They pay off when you have **three or more genuinely independent objectives** and
wall-clock time matters — a milestone where the frontend, the API and the
migration tooling do not touch each other.

They do not pay off for two objectives, or for objectives that share modules. Use
wave parallelism inside a single `/devflow:build` instead; you get most of the
concurrency with none of the merge overhead.

## After merging

```bash
df-tools workstreams reconcile
```

Planning state was updated inside each worktree. Reconcile merges those updates —
roadmap checkboxes, `STATE.md` decisions, summaries — back into the main
checkout's `.planning/`.

Follow it with a consistency check:

```text
/devflow:status check
/devflow:sync-roadmap --dry-run
```
