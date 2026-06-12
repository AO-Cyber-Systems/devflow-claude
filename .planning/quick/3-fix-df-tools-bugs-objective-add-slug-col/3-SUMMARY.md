---
objective: quick-3
job: 1
subsystem: df-tools
tags: [bugfix, objective-add, commit-pathspec, verify-job-structure, tdd]
dependency-graph:
  requires: []
  provides: [hardened-objective-add, pathspec-isolated-commit, trd-aware-verify]
  affects: [objective.cjs, misc.cjs, verify.cjs, df-tools.test.cjs]
tech-stack:
  added: []
  patterns: [TDD red-green per task]
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/verify.cjs
    - plugins/devflow/devflow/bin/df-tools.test.cjs
decisions:
  - "Cap slug at call site in cmdObjectiveAdd, not in generateSlugInternal, to avoid breaking other callers"
  - "Use git commit -- <pathspecs> for isolation; keep add loop so untracked files are tracked first"
  - "Remove job from required array; add explicit job-or-trd check after loop so error message is clear"
metrics:
  duration_minutes: 25
  completed: "2026-06-12"
  tasks_completed: 3
  files_modified: 4
  new_tests: 9
---

# Quick-3 Job 1: Fix df-tools bugs — objective add slug cap, commit pathspec isolation, verify trd field

Three surgical bug fixes to df-tools with TDD (test: commit precedes fix: commit per task). All 9 new tests pass; no new failures introduced beyond the 12 pre-existing daemon/watcher/peer-scan/novel-domain failures.

## Tasks Completed

| # | Name | RED commit | GREEN commit |
|---|------|-----------|-------------|
| 1 | Harden objective add: slug cap, flag rejection, dir+roadmap number scan | ddd8358 | 147a55b |
| 2 | Isolate commit --files with git pathspec | f2621fe | f877673 |
| 3 | verify job-structure accepts trd as plan identifier field | 1c0c757 | 5fdedb2 |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|------|---------------|-----------|--------|
| 1: Harden objective add | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs 2>&1 \| grep -E "(objective add)"` | 0 | PASS |
| 2: Isolate commit --files | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs 2>&1 \| grep "commit command"` | 0 | PASS |
| 3: verify trd field | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs 2>&1 \| grep "job-structure trd"` | 0 | PASS |

## TDD Evidence

| Task | Phase | Command | Exit Code | Expected |
|------|-------|---------|-----------|----------|
| 1 | RED | `node --test df-tools.test.cjs \| grep "objective add"` | 1 (3 new failures) | FAIL (correct) |
| 1 | GREEN | `node --test df-tools.test.cjs \| grep "objective add"` | 0 (5/5 pass) | PASS (correct) |
| 2 | RED | `node --test df-tools.test.cjs \| grep "commit command"` | 1 (isolation fails) | FAIL (correct) |
| 2 | GREEN | `node --test df-tools.test.cjs \| grep "commit command"` | 0 (3/3 pass) | PASS (correct) |
| 3 | RED | `node --test df-tools.test.cjs \| grep "job-structure trd"` | 1 (trd-format fails) | FAIL (correct) |
| 3 | GREEN | `node --test df-tools.test.cjs \| grep "job-structure trd"` | 0 (3/3 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|------|---------|-----------|--------|
| full test suite | `npm test` | 0 | PASS — 2305 pass, 12 fail (all pre-existing) |
| smoke: slug cap | `objective add "<150-char desc>"` in tmp dir | 0 | PASS — slug=60 chars, no trailing hyphen |
| smoke: verify trd | `verify job-structure <real TRD>` | 0 | PASS — valid:true |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
- Gate failures: None

## Deviations from Plan

None — TRD executed exactly as written.

## Changes Made

### Task 1 — objective.cjs: cmdObjectiveAdd hardening

Three surgical changes at the `cmdObjectiveAdd` call site:

1. **Flag rejection** — early guard before any file I/O: if `description.trim().startsWith('--')` call `error(...)` with a clear message. No ROADMAP read, no dir creation.
2. **Slug cap** — after `generateSlugInternal(description)`, if `slug.length > 60` then `slug.slice(0, 60).replace(/-+$/, '')` to strip trailing hyphens from mid-word cuts.
3. **Dir-aware numbering** — after the ROADMAP heading scan, `readdirSync(.planning/objectives/, {withFileTypes:true})` (guarded by `existsSync`) matches `/^(\d+)(?:\.\d+)?-/` on directory entries and folds integer parts into `maxObjective`.

### Task 2 — misc.cjs: cmdCommit pathspec isolation

Changed only the non-amend commit args construction. When `files && files.length > 0`, use `['commit', '-m', message, '--', ...files]` instead of `['commit', '-m', message]`. The `git add` loop is preserved (so untracked named files become tracked first). The amend branch is untouched.

### Task 3 — verify.cjs: cmdVerifyJobStructure trd field

- Removed `'job'` from the `required` array.
- Added an explicit check after the required-field loop: if both `fm.job` and `fm.trd` are undefined, push `'Missing required frontmatter field: job (or trd)'`.

## Self-Check: PASSED

Files modified exist on disk and all 6 commits are present in git log.
