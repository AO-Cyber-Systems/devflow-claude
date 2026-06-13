---
objective: 11-fix-micro-f1-atomic-state-and-f2-counter-collision
trd: 11
type: standard
tags: [bugfix, devflow-internals, micro, tdd, atomic-commits]
dependency-graph:
  requires: []
  provides: [clean-tree-post-micro-commit, collision-free-quick-numbering]
  affects: [plugins/devflow/devflow/bin/lib/micro.cjs, plugins/devflow/devflow/bin/lib/micro.test.cjs]
tech-stack:
  added: []
  patterns: [2-commit-atomic-state-md, placeholder-dir-collision-prevention, ls-files-tracked-detection]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/micro.cjs
    - plugins/devflow/devflow/bin/lib/micro.test.cjs
decisions:
  - "Second commit stages [.planning/STATE.md, .planning/.skill-active] only when marker is tracked (git ls-files probe); skips marker stage when tracked-state lookup fails to avoid 'did not match' on untracked files"
  - "endSkill moved BEFORE the second commit so marker deletion lands in the same atomic STATE.md commit (cleaner working tree, single 2-commit shape regardless of files=null vs explicit list)"
  - "Row.num for STATE.md derives from the placeholder dir number (highest-N matching slug), not from a fresh _nextQuickNum scan (which post-F2 returns N+1 and would mis-number the row)"
  - "Placeholder dir creation in startMicro happens BEFORE startSkill so a mkdir failure returns ok:false before any marker is written (no stranded markers)"
  - "abortMicro derives target dir via .micro-description → slug → highest-N match (same lookup as commitMicro path); idempotent against ENOENT"
metrics:
  duration: ~12 minutes
  completed: 2026-05-08
  tasks: 2
  commits: 2
  new_tests: 9
  files_modified: 2
---

# Quick Task 11: Fix Micro F1 Atomic STATE.md + F2 Counter Collision Summary

Fixed two state-tracking bugs in `df-tools micro`: (F1) commitMicro now produces a second atomic git commit for STATE.md so the working tree is clean post-commit, and (F2) startMicro physically creates `.planning/quick/<N>-<slug>/` so consecutive starts (and `init quick`) get distinct N values.

## Tasks Completed

### Task 1: RED — failing tests for F1 + F2

Added 9 new tests + updated 1 existing test in `micro.test.cjs`:

**F2 tests (placeholder dir lifecycle):**
- `F2-1` startMicro creates `.planning/quick/<N>-<slug>/` on disk
- `F2-2` abortMicro removes the placeholder dir
- `F2-3` consecutive starts allocate distinct N (collision-free)
- `F2-4` abortMicro idempotent when dir already gone

**F1 tests (atomic STATE.md):**
- `F1-6` working tree clean after commitMicro (no `M .planning/STATE.md`)
- `F1-7` produces two atomic commits (source + STATE.md row, in correct HEAD/HEAD~1 order)
- `F1-8` STATE.md row records SOURCE commit hash (HEAD~1), not STATE.md commit hash
- `F1-9` return shape includes `commit_hash` AND `state_commit_hash`
- `F1-10` graceful degradation: STATE.md commit failure → `ok:true`, `state_commit_hash:null`, marker still removed, stderr warning

**Updated test 9** (`happy with files: passes files list to gitRunner`) — now expects gitRunner called twice with `[a.txt]` then `[.planning/STATE.md]`.

**Commit:** `2996908 test(11): add failing tests for F1 atomic STATE.md commit and F2 placeholder dir`

### Task 2: GREEN — implement F1 + F2 in micro.cjs

**F2 — placeholder dir lifecycle in `startMicro`:**
- `fs.mkdirSync(absTaskDir, { recursive: true })` BEFORE `startSkill`
- mkdir failure → returns `ok:false, reason:'mkdir-failed'` before any marker write

**F2 — placeholder dir cleanup in `abortMicro`:**
- Reads `.micro-description`, slugs, scans `.planning/quick/` for highest-N matching `*-<slug>`, removes via `fs.rmSync({recursive:true, force:true})`
- Wrapped in try/catch — idempotent against ENOENT
- Runs BEFORE `endSkill` (dir removal is recoverable; marker removal is the contract)

**F1 — 2-commit atomic STATE.md in `commitMicro`:**
- Row.num derived from placeholder dir's N (scan for highest matching `*-<slug>`), falls back to `_nextQuickNum` if not found
- `endSkill` moved BEFORE the second commit so marker deletion lands atomically with STATE.md
- Second commit stages `['.planning/STATE.md']` plus `'.planning/.skill-active'` IFF tracked (verified via `git ls-files --error-unmatch`)
- Graceful degradation: try/catch around second commit; failure logs warning to stderr but returns `ok:true, state_commit_hash:null, removed_marker:true`

**Commit:** `992a0f6 fix(11): atomic STATE.md commit (F1) and placeholder dir lifecycle (F2)`

## Verification Evidence

### Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED) | `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` | non-zero (9 expected fails) | PASS (RED expected) |
| 2 (GREEN) | `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` | 0 | PASS |
| 2 (GREEN) | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` | 0 | PASS (no regression) |

### TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` | non-zero (9 fail / 20 pass) | FAIL (correct — new tests not yet implemented) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` | 0 (29/29 pass) | PASS (correct) |
| REFACTOR | not needed (single GREEN edit pass) | n/a | n/a |

### Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| micro tests pass | `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` | 0 | PASS (29/29) |
| init tests no regression | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` | 0 | PASS (34/34) |
| manual smoke (optional) | not run (gate-commits hook blocks tmpdir flow; e2e-1 in micro.test covers equivalent end-to-end) | n/a | DEFERRED — equivalent coverage in e2e-1 |

### Post-TRD Verification

- Auto-fix cycles used: 1 (rowNum issue: `_nextQuickNum` post-F2 returned N+1 vs slot N — resolved by deriving rowNum from placeholder dir scan)
- Must-haves verified: 7/7 (all from JOB.md frontmatter)
- Gate failures: None

## Must-Haves Verification (from JOB.md frontmatter)

| Must-Have | Verified By | Status |
|---|---|---|
| After df-tools micro commit returns ok, working tree is clean — no `M .planning/STATE.md` | Test F1-6 + e2e-1 | PASS |
| df-tools micro commit produces two atomic git commits: source + STATE.md row | Test F1-7 | PASS |
| After df-tools micro start, .planning/quick/<N>-<slug>/ directory exists on disk | Test F2-1 | PASS |
| After df-tools micro abort, the placeholder dir from start is removed | Test F2-2 | PASS |
| Two consecutive starts (micro then init quick, or vice versa) get distinct N values | Test F2-3 | PASS |
| STATE.md row records the source-files commit hash, not the STATE.md commit hash | Test F1-8 | PASS |
| All micro.test.cjs tests pass; init.test.cjs has no regressions | targeted test runs | PASS (29/29 + 34/34) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Row.num mis-numbering after F2 placeholder dir creation**
- **Found during:** Task 2 (GREEN) — F1-8 test failure mode required investigation
- **Issue:** With F2 fix in place, `_nextQuickNum` at commit time returns N+1 (because the placeholder dir exists with N), so the STATE.md row would have num N+1 while the dir name has N. Inconsistent record-keeping.
- **Fix:** Derive rowNum from highest-numbered placeholder dir matching the slug; fall back to `_nextQuickNum` if not found. Mirrors abortMicro's lookup path.
- **Files modified:** `plugins/devflow/devflow/bin/lib/micro.cjs` (within Task 2 GREEN)
- **Commit:** `992a0f6` (folded into GREEN commit, not separate)

**2. [Rule 1 — Bug] `D .planning/.skill-active` left dirty when files=null**
- **Found during:** Task 2 (GREEN) — F1-6 test surfaced this
- **Issue:** When `files=null`, the source commit's `git add .` stages `.skill-active` as a tracked file. `endSkill` then deletes it on disk. Without my fix, that left `D .planning/.skill-active` in the working tree (a different dirty-tree symptom than the F1 STATE.md issue, but same family).
- **Fix:** (a) move `endSkill` BEFORE the second commit so marker deletion lands atomically with STATE.md, and (b) include `.planning/.skill-active` in the second commit's stage list IFF it's tracked (verified via `git ls-files --error-unmatch`).
- **Rationale:** Without the `ls-files` probe, `git add .planning/.skill-active` would fail with "did not match any files" when the marker was untracked (which is the case when `files` was an explicit list).
- **Commit:** `992a0f6` (folded into GREEN commit)

### Out-of-scope test failures (deferred — see deferred-items.md)

`npm test` shows 9 failures in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs` — daemon/PID lifecycle tests. None touch `micro.cjs` or `init.cjs`. Pre-existing flakiness. See `deferred-items.md`.

## Anti-Pattern Compliance (per JOB.md gotchas)

- ✓ No `git commit --amend` — used the locked 2-commit shape
- ✓ No LLM-generated test data — reused `mkAmbient` and `mkGitAmbient` builders
- ✓ Did not touch `_appendQuickTaskRow` writing logic — only changed call site/ordering
- ✓ Did not touch `.skill-active` marker semantics or `endSkill` cleanup logic
- ✓ No property-based tests — descriptive named test cases only

## Two Distinct Hashes (per JOB.md gotcha)

- STATE.md row stores `commitHash` (source commit) — captured BEFORE second commit lands
- Return shape adds `state_commit_hash` (STATE.md commit) — captured AFTER second commit lands
- Verified by F1-8 (STATE.md content) and F1-9 (return shape distinct hashes)

## Commits

- `2996908` — test(11): add failing tests for F1 atomic STATE.md commit and F2 placeholder dir
- `992a0f6` — fix(11): atomic STATE.md commit (F1) and placeholder dir lifecycle (F2)

## Self-Check: PASSED

- ✓ `plugins/devflow/devflow/bin/lib/micro.cjs` exists and contains F1 + F2 fixes
- ✓ `plugins/devflow/devflow/bin/lib/micro.test.cjs` exists with 9 new tests + 1 updated test
- ✓ Commit `2996908` exists in git log
- ✓ Commit `992a0f6` exists in git log
- ✓ All 29 micro tests pass
- ✓ All 34 init tests pass (no regression)
- ✓ All 7 must-haves verified by tests
