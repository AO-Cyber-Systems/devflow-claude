---
type: quick
slug: 5-loosen-benchmark-cjs-objective-id-parser
duration_sec: 316
completed: 2026-05-08T14:06:59Z
tasks_completed: 2
commits: [32329e4, e4e8412]
key_files:
  modified:
    - plugins/devflow/devflow/bin/lib/benchmark.cjs
    - plugins/devflow/devflow/bin/lib/benchmark.test.cjs
test_delta:
  before: 17 tests in benchmark.test.cjs
  after: 23 tests in benchmark.test.cjs (+6 new)
---

# Quick Task 5: Loosen benchmark.cjs Objective-ID Parser Summary

One-liner: Added bare-number fallback (`/objective\s+(\d{1,3})\b/i`) to `extractObjectiveId` and matching `^(\d+)$` case to `canonicalize` so workflow-template-substituted prompts like "Plan Objective 18" attribute to the right objective bucket instead of "Untagged".

## What Changed

**`benchmark.cjs:69-86` — `extractObjectiveId`**

- Added new fallback regex `/objective\s+(\d{1,3})\b/i` placed AFTER the Phase pattern (line 81-82) and BEFORE `return 'untagged'` (line 85). Returns the bare number string (e.g. `'18'`).
- JSDoc updated to list the new `"Plan Objective 18" → "18"` example.
- Order preserved: slug, wave, v1.x, TRD, Phase patterns still match first when present.

**`benchmark.cjs:90-103` — `canonicalize`**

- Added new bare-number case `/^(\d+)$/` placed AFTER the dir-prefix `^(\d+)-` case (line 99) and BEFORE `return id` (line 103).
- When `dirToObjMap[m[1]]` is missing, falls through to `return id` — emits the raw bare number rather than dropping to "untagged".

**`benchmark.test.cjs` — added 6 new tests (4 in extractObjectiveId, 2 in canonicalize)**

- bare "Objective N" form
- bare-number with trailing word (word-boundary regression guard)
- bare-number in description field
- slug form still wins (ordering regression guard)
- bare-number id with dirToObjMap entry → mapped value
- bare-number id without dirToObjMap entry → raw passthrough

All 17 pre-existing tests unmodified and still pass.

## Why

Workflow prompt templates substitute `{objective}` with the bare number (e.g. real Task() spawns produce prompts like "Plan Objective 18" or "Execute Objective 18 wave 2"). The existing regex on line 73 requires `<num>-<slug>` form, which never matches those prompts. Result before fix: per-objective rollups showed $0 / "Untagged" for active objectives despite real spend. After fix: those calls bucket as `obj-18` (when `dirToObjMap` has the dir entry) or as raw `18` (passthrough — still better than dropping attribution entirely).

Item 1 from `~/.claude/devflow-efficiency-handoff.md`.

## Tasks Executed (TDD pattern: RED → GREEN)

| # | Task | Commit | Status |
|---|---|---|---|
| 1 (RED) | Add 6 failing tests pinning bare-number recognition | `32329e4` | DONE |
| 2 (GREEN) | Loosen extractObjectiveId + canonicalize to make tests pass | `e4e8412` | DONE |

Note: TDD-Playbook ordering inverts the JOB.md task ordering — JOB lists "Task 1: implementation, Task 2: tests" but executor followed strict RED-GREEN per the user's explicit TDD habit 1+3 (CLAUDE.md). Same end state, evidence-driven phase boundaries.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED) | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | 1 | FAIL (correct — 4 of 6 new tests red, 2 pass coincidentally) |
| 2a (syntax) | `node --check plugins/devflow/devflow/bin/lib/benchmark.cjs` | 0 | PASS |
| 2b (grep — bare-number regex in extractObjectiveId) | `grep -n 'objective\\s+(\\d{1,3})\\b' …` | — | 1 hit on line 83 |
| 2c (grep — `^(\d+)$` in canonicalize) | `grep -Fn '/^(\d+)$/' …` | — | 1 hit on line 101 |
| 2d (grep — slug form preserved) | `grep -n 'objective\\s+(\\d{1,3}-' …` | — | 1 hit on line 73 |
| 2 (GREEN) | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | 0 | PASS (26/26) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | 1 | FAIL (correct) — 26 tests, 22 pass, 4 fail |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | 0 | PASS (correct) — 26 tests, 26 pass, 0 fail |
| REFACTOR | (skipped — implementation is already minimal: 2-line insert in each helper) | — | — |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Targeted tests | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | 0 | PASS (26/26) |
| Syntactic check | `node --check plugins/devflow/devflow/bin/lib/benchmark.cjs` | 0 | PASS |
| Full test suite | `npm test` | 1 | FAIL — 9 pre-existing unrelated failures, 2210/2269 pass; 0 benchmark failures (see deferred-items.md). Re-ran twice; identical failure set both runs. Persistent, not caused by this change. |

## Deviations from Plan

### TDD ordering (followed user's TDD Playbook habit 1+3)

JOB.md listed Task 1 as implementation and Task 2 as tests. Strict RED-GREEN-REFACTOR per user's CLAUDE.md TDD Playbook habit 3 ("One test at a time through RED → GREEN → REFACTOR") inverted the order: tests added first, then implementation. Two atomic commits (`test:` → `feat:`) match the DevFlow TDD pattern. End state is identical to JOB-as-written.

### Out-of-scope failures logged

`npm test` exits 1 due to 9 pre-existing failures in unrelated files (`devflow-watch.test.cjs`, `df-tools.init.test.cjs`, handoff pipeline, `cmdDetectNovelDomain`). All persistent (identical across 2 runs). Logged in `deferred-items.md`. Per executor scope boundary rule, not fixed in this quick task.

## Auth Gates

None encountered.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 success criteria met (both helpers loosened, JSDoc updated, all 6 new tests added in correct describe blocks, all 17 pre-existing tests still pass, `node --check` exits 0)
- Gate failures: 1 (`npm test` — pre-existing 9 unrelated failures, deferred to maintainer)

## Behavioral Verification (manual sanity check)

Before this fix, `df-tools benchmark per-objective` would attribute Task() spawns whose prompts were generated from `{objective}`-substituted templates to the "Untagged" bucket. After this fix, those same spawns will attribute to `obj-N` (when planning dir mapping is present) or to bare `N` (passthrough — still informative). Real CLI run not executed against this branch in this quick task — recommended next step for the user is `df-tools benchmark per-objective --since=1d` to confirm "Untagged" line item shrinks.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/benchmark.cjs (modified)
- FOUND: plugins/devflow/devflow/bin/lib/benchmark.test.cjs (modified)
- FOUND: .planning/quick/5-loosen-benchmark-cjs-objective-id-parser/deferred-items.md
- FOUND: commit 32329e4 (test:)
- FOUND: commit e4e8412 (feat:)
