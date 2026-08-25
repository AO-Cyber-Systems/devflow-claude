---
objective: 13-make-objective-skill-model-invocable-add
job: 13
type: standard
mode: quick
status: complete
completed: 2026-08-25
tasks_completed: 2
commits: 3
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/df-tools.test.cjs
    - plugins/devflow/skills/objective/SKILL.md
    - plugins/devflow/devflow/workflows/remove-objective.md
    - plugins/devflow/devflow/workflows/help.md
    - plugins/devflow/devflow/bin/lib/classifier.cjs
---

# Quick Job 13: Make the objective skill model-invocable, add a --confirm rail — Summary

`/devflow:objective` is now reachable by the model, and `objective remove` is dry-run
by default: it prints the complete delete + renumber plan and mutates nothing until an
explicit `--confirm`. The two halves shipped together because neither is safe alone.

## Commits

| Hash | Type | What |
|---|---|---|
| `b1e3227` | `test:` | RED — 10 new cases + `runGsdToolsStreams` (spawnSync) + 4 migrated call sites |
| `3b20ae2` | `feat:` | GREEN — `computeRemovalPlan()` + `--confirm` gate + CLI wiring |
| `ab83319` | `feat:` | Un-gate the skill, sync SKILL.md / remove-objective.md / help.md / classifier.cjs |

Task 2 is `feat:`, not `docs:`, deliberately: removing `disable-model-invocation` is a
user-visible behavioral change, and `lib/changelog.cjs` groups by conventional-commit
type — `docs:` would have hidden it from exactly the readers who need to see it.

## Test results

Full `npm test` (node --test), run in this worktree:

| | Baseline (before any edit) | Final | Delta |
|---|---|---|---|
| tests | 2839 | 2849 | +10 |
| pass | 2779 | 2789 | +10 |
| fail | 10 | 10 | 0 |
| skipped | 50 | 50 | 0 |

**No new failures.** The final failing set is name-for-name identical to the baseline
captured before the first edit: 3 devflow-watch foreground cases, 2 devflow-watch
multi-project cases, 4 handoff-e2e cases, 1 awareness `scanPeer` case. None are in the
`objective remove` block, and none are reachable from anything this job touched.

**Baseline discrepancy worth recording.** The plan states a baseline of 2839 / 2781 /
**8** failures. This worktree measured 2839 / 2779 / **10** before any edit was made.
The two extra failures (`awareness S1: scanPeer`, and one devflow-watch foreground
case) are worktree-environment artifacts — those suites inspect repo/branch layout and
spawn daemons, and this worktree is a detached checkout at `db3ea1b` with `node_modules`
symlinked in. They failed identically before and after. The bar applied was "no new
failures against the measured baseline", which is met exactly.

The `objective remove command` describe block is fully green: 14/14 (4 pre-existing,
10 new).

## The JSON `objective remove` now returns

**Dry run** (`objective remove 2`, no `--confirm`) — exit 0, stdout:

```json
{
  "removed": "2",
  "dry_run": true,
  "confirmed": false,
  "mutated": false,
  "directory_deleted": null,
  "target_directory": "02-b",
  "renamed_directories": [{ "from": "03-c", "to": "02-c" }],
  "renamed_files": [
    { "directory": "02-c", "from": "03-01-JOB.md", "to": "02-01-JOB.md" }
  ],
  "roadmap_updated": false,
  "state_updated": false,
  "hint": "Re-run with --confirm to execute this plan."
}
```

**Confirmed** (`objective remove 2 --confirm`) — exit 0, stdout:

```json
{
  "removed": "2",
  "dry_run": false,
  "confirmed": true,
  "mutated": true,
  "partial": false,
  "directory_deleted": "02-b",
  "target_directory": "02-b",
  "renamed_directories": [{ "from": "03-c", "to": "02-c" }],
  "renamed_files": [
    { "directory": "02-c", "from": "03-01-JOB.md", "to": "02-01-JOB.md" }
  ],
  "roadmap_updated": true,
  "state_updated": false
}
```

Every pre-existing key (`removed`, `directory_deleted`, `renamed_directories`,
`renamed_files`, `roadmap_updated`, `state_updated`) keeps its name and meaning.
Everything else is additive.

### `renamed_files` element shape, per mode

Both modes emit **`{ directory, from, to }`** — verified by an explicit
`Object.keys(f).sort()` assertion in case 4, not just by inspection.

`directory` is the **new** directory name, i.e. where the file lives once its parent
rename lands, so the executor can `path.join(objectivesDir, e.directory, e.from)`
without re-deriving anything. This is an additive key on what used to be `{ from, to }`
on the executed path only; no consumer reads these elements (the sole repo-wide
reference was the key name in `remove-objective.md`).

Case 4 asserts the dry run's `renamed_directories` **and** `renamed_files` deep-equal
the executed run's — same elements, same shape, same order.

## Gate ordering

**No deviation.** Implemented exactly as planned:

1. arg validation → 2. ROADMAP.md exists → 3. resolve `targetDir` →
4. **executed-jobs rail (exit 1)** → 5. `computeRemovalPlan()` →
6. **`--confirm` gate (exit 0, no mutation)** → 7. execute the plan → 8. output.

The rail sits ahead of the dry-run short-circuit, so the untouched regression test at
`df-tools.test.cjs:1616` still exits non-zero. `--force` and `--confirm` stayed
orthogonal and both are proven independently: `--confirm` alone still refuses (case 6),
`--force` alone only dry-runs (case 7), both together succeed (case 8).

Execution **consumes** the plan object. Inside `cmdObjectiveRemove` the
readdir/regex/sort sequence now appears exactly once, in the planner. (The ROADMAP.md
*text* renumber loop further down is untouched — it walks heading/checkbox/table
strings and is a separate concern.)

`computeRemovalPlan` runs before `rmSync`, which is safe because the rename filter is
strictly `dirInt > removedInt` and the target sits at `=== removedInt`.

## `renderPlanText` output format

Settled on, written to **stderr** only:

```
DRY RUN — nothing has been modified.
Plan for: objective remove 2

Directory to delete: 02-b

Directories to rename (1):
  03-c -> 02-c

Files to rename (1):
  [02-c] 03-01-JOB.md -> 02-01-JOB.md

ROADMAP.md and STATE.md would also be renumbered.
Re-run with --confirm to execute.
```

**Test case 11's asserted substring did NOT need reconciling.** The plan flagged this
as a likely one-iteration fixup, because plan elements now carry `directory` and a
rendering like `02-features/03-01-JOB.md -> 02-features/02-01-JOB.md` would not contain
the asserted `03-01-JOB.md -> 02-01-JOB.md`. Putting the directory in a leading
`[02-features]` tag instead of inside the path keeps the bare `old -> new` pair intact,
so the substring matched on the first GREEN run. All 14 cases passed on the first pass
with no test edits after the RED commit.

stdout stays pure JSON — case 11 `JSON.parse`s stdout on the same successful run that
asserts the stderr banner, which is what proves the two streams are not interleaved.

## Deviations

### Rule 3 (blocking) — `classifier.cjs` `userOnly` mirror

**Not in the plan's `<files>` list. Surfaced by the test suite, approved by the
coordinator.**

`plugins/devflow/devflow/bin/lib/classifier.cjs` carries `CONSOLIDATED_SKILLS`, whose
`userOnly` field mirrors `disable-model-invocation: true` in each skill's frontmatter.
`classifier.test.cjs` (TRD 30-02) asserts the two stay in sync. Removing the flag from
`SKILL.md` alone therefore did two bad things:

1. Turned `objective: userOnly=true matches its frontmatter` red — a genuine new failure.
2. More importantly, left the ambient routing preamble still printing
   `/devflow:objective` under **"USER-TYPED ONLY — you CANNOT invoke these via the Skill
   tool"**. The frontmatter would have said the model may invoke it while the text
   injected into every session said it may not. The job's headline truth would have been
   false in the only place the model actually reads.

Fixed by flipping `objective` to `userOnly: false` and moving its line out of the
USER-TYPED ONLY block into CONSOLIDATED SKILLS, annotated with the `--confirm` default.
The rationale comment above the table specifically cited *"`objective remove`
cascade-renumbers every objective above it"* as the justification for the flag; that
sentence was rewritten rather than deleted, so the original reasoning is preserved
alongside a note on why it is now obsolete — the cascade is gated by `--confirm`, not by
keeping the skill out of the model's reach.

`AMBIENT_PREAMBLE` is marked "LOCKED TEXT — update only in a dedicated TRD". The edit
was made anyway because the test suite requires it and the alternative is a preamble
that contradicts the shipped behavior. Flagging it here for review.

The other 7 skills carrying `disable-model-invocation: true` (cleanup, flow,
list-objective-assumptions, set-profile, settings, workstreams, milestone) are
untouched, as is their `userOnly: true` in the same table.

### No other deviations

Gate ordering, the `--force` rail's semantics, decimal short-circuit behavior, exit
codes, and ROADMAP-on-rename-failure behavior are all unchanged from the plan and from
pre-existing behavior.

## Preserved failure semantics (G9)

The rename loop keeps its `try {} catch {}`. On a `renameSync` failure the cascade still
aborts at the failing rename, earlier renames stay applied, ROADMAP.md is still
rewritten, and the exit code stays 0 — all exactly as before. The one thing added: the
failure is no longer silent. The catch writes a warning to stderr naming the specific
plan element that failed and how many renames were applied, and sets `partial: true` on
the result JSON. Making the cascade atomic was explicitly out of scope; no rollback was
added.

`partial: true` has no automated test — forcing a `renameSync` failure needs
chmod/permission tricks that are flaky and platform-dependent. Verified by inspection,
as the plan directed.

## SC-10 — unrelated in-flight files never touched

`plugins/devflow/agents/integration-checker.md`, `plugins/devflow/agents/verifier.md`
and `plugins/devflow/skills/verify-work/SKILL.md` were **never read, staged, reverted,
stashed, or cleaned**.

This job ran in an isolated worktree (`agent-a03a42baaef3c2030`, branched from
`db3ea1b`), where those three files are clean — the user's in-flight edits live only in
the main working tree, which the worktree-isolation guard blocks all git access to. The
plan's verify step expects `git status --porcelain` to show three ` M` lines; in the
worktree it correctly shows none, because the dirty copies are not in this checkout.

Confirmed untouched in the main checkout by mtime, which is a plain filesystem read
rather than a git operation:

```
integration-checker.md   Jul 31 11:13
verifier.md              Aug 19 07:47
verify-work/SKILL.md     Jul 31 11:14
```

All predate this session (Aug 25). No `git add -A`, no `git add .`, no `git checkout --
.`, no `git stash`, no `git clean` was run at any point. Every commit staged files
explicitly by path via `df-tools commit --files`.

## Note for whoever picks this up

This worktree has no `node_modules`. It was symlinked to the main checkout's for the
test runs and removed afterwards, so `git status` is clean. To re-run the suite:

```bash
ln -s /Users/justin/dev/devflow-claude/node_modules \
      /Users/justin/dev/devflow-claude/.claude/worktrees/agent-a03a42baaef3c2030/node_modules
```

(`node-pty` is needed by the devflow-watch and handoff suites; without it those fail for
a different and louder reason than the 10 baseline failures.)

## Success criteria

- [x] SC-1 — flag removed from `skills/objective/SKILL.md`; exactly 7 other flagged skills, none named `objective`
- [x] SC-2 — no-`--confirm` exits 0 having mutated nothing (ROADMAP.md and STATE.md asserted byte-identical, case 1)
- [x] SC-3 — full plan printed to stderr, asserted by an automated test via `spawnSync` (case 11), not only by the JSON
- [x] SC-4 — `--confirm` performs exactly the printed plan; execution consumes `computeRemovalPlan`'s return value
- [x] SC-5 — executed-jobs rail and `--force` unchanged; `--force` and `--confirm` independent, both required together
- [x] SC-6 — cases (a)(b)(c)(d) covered, parity on both keys, G6 proven by an untouched `07-later/`
- [x] SC-7 — no new failures (2849 / 2789 / 10, identical failure set to baseline)
- [x] SC-8 — SKILL.md, remove-objective.md, help.md all describe dry-run-by-default and `--confirm`
- [x] SC-9 — all four call sites migrated (1558/1607/1625/1652 pre-edit); 1602 byte-identical; 1607 now asserts the directory is gone
- [x] SC-10 — three unrelated dirty files never touched
