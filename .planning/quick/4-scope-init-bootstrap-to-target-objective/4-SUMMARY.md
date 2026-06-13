---
type: quick
slug: 4-scope-init-bootstrap-to-target-objective
tasks: 2
completed: 2
status: complete
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/init.cjs
    - plugins/devflow/devflow/bin/lib/init.test.cjs
commits:
  - 505619c
  - 02022f0
date: 2026-05-08
---

# Quick Task 4: Scope `init` Bootstrap to Target Objective — Summary

## One-Liner

Replaced unscoped `backfillAllObjectives(cwd)` calls in `cmdInitExecuteObjective` and `cmdInitPlanObjective` with scoped `bootstrapObjectiveMd(cwd, <id>)` calls so a single `init plan-objective <id>` invocation touches only the target objective directory instead of stamping stub OBJECTIVE.md files into every objective dir under `.planning/objectives/`.

## What Was Built

### Behavior change

**Before:** Running `df-tools init plan-objective 1` in a project with N objective dirs walked all N dirs and scaffolded OBJECTIVE.md into every one missing it. A single invocation was observed to drop 18 untracked OBJECTIVE.md stubs into unrelated dirs in one session (item 5 from `~/.claude/devflow-efficiency-handoff.md`).

**After:** The same invocation calls `bootstrapObjectiveMd(cwd, '01-foo')` once for the target only. The synthesized `bootstrap_objectives` shape — `{ scanned: 1, applied: 0|1, skipped: 0|1, errors: [] }` — preserves the legacy contract for downstream skills/agents.

### Files modified

- **`plugins/devflow/devflow/bin/lib/init.cjs`** (commit `505619c`)
  - Line 10: destructure now imports `bootstrapObjectiveMd` alongside `bootstrapProjectMd` and `backfillAllObjectives`
  - `cmdInitExecuteObjective` (~line 407): replaced `backfillAllObjectives(cwd)` call with scoped `bootstrapObjectiveMd` call + synthesis
  - `cmdInitPlanObjective` (~line 528): same scoped replacement
  - Canonical id resolution: prefers `path.basename(objectiveInfo.directory)` (handles `'1'` vs `'01-foo'`); falls back to raw `objective` arg for graceful no-op when objective dir is missing
  - `cmdInitNewProject` untouched (correctly never called `backfillAllObjectives`)
  - `backfillAllObjectives` still imported and still exported from `project-bootstrap.cjs` for future explicit bulk-backfill callers — only the production call sites in these two paths were removed

- **`plugins/devflow/devflow/bin/lib/init.test.cjs`** (commit `02022f0`)
  - FIX-1 test at line 222: renamed; tightened from `applied >= 2` to `applied === 1` + `scanned === 1`; added regression guard asserting `02-bar/OBJECTIVE.md` must NOT exist after `init execute-objective 1` (the original bug-item-5 vector)
  - FIX-1 test at line 255: renamed; tightened from `applied >= 1` to `applied === 1` + `scanned === 1`
  - Both tests retain the `FIX-1:` prefix so external test filters keep finding them
  - Hand-built `makeFixture` factory preserved per user TDD playbook habit 4

## Tasks

| # | Name | Type | Commit | Status |
|---|------|------|--------|--------|
| 1 | Scope bootstrap to target objective in init.cjs | auto | `505619c` | PASS |
| 2 | Update FIX-1 tests to pin scoped bootstrap behavior | auto+tdd | `02022f0` | PASS |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|------|----------------|-----------|--------|
| 1 | `node --check plugins/devflow/devflow/bin/lib/init.cjs` | 0 | PASS |
| 1 | `grep -c 'bootstrapObjectiveMd' plugins/devflow/devflow/bin/lib/init.cjs` (expect 3 — 1 require + 2 calls) | 0 (3 hits) | PASS |
| 1 | `grep -c 'backfillAllObjectives' plugins/devflow/devflow/bin/lib/init.cjs` (expect 1 — require only) | 0 (1 hit) | PASS |
| 2 | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` (full file) | 0 | PASS (34/34) |
| 2 | FIX-1 test (execute-objective scoped) | 0 | PASS |
| 2 | FIX-1 test (plan-objective scoped) | 0 | PASS |

## TDD Evidence (Task 2)

Task 2 was a TDD update: new behavior was already implemented in Task 1 (Task 1 is a fix, Task 2 pins the contract). RED state was confirmed pre-edit by running the original FIX-1 tests against post-Task-1 code.

| Phase | Command | Exit Code | Expected |
|-------|---------|-----------|----------|
| RED (pre-edit) | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` (test #1: applied >= 2) | non-zero | FAIL (correct — old assertion no longer matches new scoped behavior) |
| GREEN (post-edit) | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` (FIX-1 tests) | 0 | PASS (correct — new assertions match new scoped behavior) |
| REFACTOR | n/a (test-only changes, no implementation refactor) | — | — |

## Final Acceptance Verification

Per JOB.md `<verification>` section:

1. **Unit:** `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` → 34/34 pass.
2. **Behavioral:** Manual fixture with three objective dirs (`01-foo`, `02-bar`, `03-baz`) + `init plan-objective 1` → only `01-foo/OBJECTIVE.md` created; `02-bar` and `03-baz` untouched. `bootstrap_objectives` returned `{scanned:1, applied:1, skipped:0, errors:[]}`.
3. **Shape preserved:** JSON output of init still has `bootstrap_objectives: { scanned, applied, skipped, errors }` keys — verified via behavioral fixture.
4. **No regressions:** `cmdInitNewProject` body unchanged; `backfillAllObjectives` still defined and still exported from `lib/project-bootstrap.cjs` (line 223 — `backfillAllObjectives, // NEW (TRD 18-01)`).

## Success Criteria Checklist

- [x] init.cjs:10 requires `bootstrapObjectiveMd`
- [x] init.cjs:407 (cmdInitExecuteObjective) calls `bootstrapObjectiveMd(cwd, <id>)` and synthesizes legacy shape
- [x] init.cjs:528 (cmdInitPlanObjective) calls `bootstrapObjectiveMd(cwd, <id>)` and synthesizes legacy shape
- [x] FIX-1 test at line 222 asserts `applied === 1` AND `02-bar/OBJECTIVE.md` does NOT exist
- [x] FIX-1 test at line 255 asserts `applied === 1`
- [x] `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` passes (34/34)
- [x] `cmdInitNewProject` unchanged
- [x] `backfillAllObjectives` still exported from `project-bootstrap.cjs`

Note on full `npm test`: 10 pre-existing failures in unrelated subsystems (devflow-watch daemon, handoff-e2e, novel-domain CLI, and 1 init.cjs test that depends on TRD-22-01 STATE.md branch resolution unrelated to this fix). Verified by `git stash` + re-running prior to my changes — same 10 failures present pre-edit. Out of scope per the executor scope-boundary rule.

## Deviations from Plan

None — JOB.md executed exactly as written. The two-task structure, file scope, edit shapes, verification commands, and assertion edits all matched the plan.

The DevFlow ambient-mode edit gate fired on the first Edit call (expected — quick task workflow ran outside a registered skill marker). Resolved per gate guidance by calling `df-tools skill-active --start execute-quick`. No semantic deviation; documenting here so the trail is complete.

## Self-Check: PASSED

- File `plugins/devflow/devflow/bin/lib/init.cjs` modified — verified via `grep -n bootstrapObjectiveMd` (3 hits at lines 10, 414, 548).
- File `plugins/devflow/devflow/bin/lib/init.test.cjs` modified — verified via `grep -n 'scoped to the target'` (2 hits at lines 222 and 269).
- Commit `505619c` exists — verified via `git log --oneline -2`.
- Commit `02022f0` exists — verified via `git log --oneline -2`.
- All success-criteria checkboxes ticked above based on direct command evidence captured during execution.
