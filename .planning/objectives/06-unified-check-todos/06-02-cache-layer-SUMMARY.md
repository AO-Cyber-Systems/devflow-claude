---
objective: 06-unified-check-todos
trd: 06-02
subsystem: check-todos
tags: [cache, tdd, per-source-ttl, merge-semantics, injection-hooks]
dependency_graph:
  requires: [check-todos.cjs (06-01), awareness.cjs cache pattern (02-04)]
  provides: [readCheckTodosCache, writeCheckTodosCache, isCheckTodosCacheStale, aggregate cache-or-fetch wiring]
  affects: [check-todos.cjs aggregate, .gitignore]
tech_stack:
  added: []
  patterns: [per-source-TTL, cache-merge-semantics, clock-skew-tolerance, non-fatal-write-failure]
key_files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/check-todos.cjs
    - plugins/devflow/devflow/bin/lib/check-todos.test.cjs
    - .gitignore
decisions:
  - "readCheckTodosCache routes through _runFs (not bare fs) — consistent with obj 4/5 injection hook pattern"
  - "writeCheckTodosCache uses single writeFileSync (no tmp+rename) — cache is non-load-bearing, re-fetch on next run is cheap"
  - "cached:true ONLY when zero sources re-fetched — truthful user-facing signal for all-5-from-cache"
  - "A1 test mock updated with writeFileSync/mkdirSync noops + .planning existsSync:true to prevent spurious cache_write_error warnings"
  - "realFs extended in-place (not redeclared) — mirrors obj 4 TRD 04-02 deviation pattern"
metrics:
  duration: "8m 30s"
  completed: "2026-05-04"
  tasks_completed: 2
  files_created: 0
  files_modified: 3
  tests_before: 1228
  tests_after: 1254
  tests_delta: 26
---

# Objective 06 TRD 02: Cache Layer Summary

**One-liner:** 10-minute TTL cache layer with per-source staleness, merge-semantic writes, and clock-skew-tolerant `isCheckTodosCacheStale` — wired into aggregate() as cache-or-fetch with non-fatal write failure handling.

## What Was Built

Extended `lib/check-todos.cjs` with:

- `readCheckTodosCache(cwd)` — reads `.planning/.check-todos-cache.json` via `_runFs`; returns null on missing/empty/malformed JSON; never throws.
- `writeCheckTodosCache(cwd, sections)` — merge semantics via `Object.assign({}, existing, sections)`; lazy-creates `.planning/` if missing; writes pretty-printed JSON + trailing newline. Single `writeFileSync` call (no tmp+rename per locked decision).
- `isCheckTodosCacheStale(fetched_at, ttl_minutes)` — exact mirror of obj 2 `isStale`: null/invalid → true, non-string → true, zero-TTL → true, expired → true, future timestamp → false (clock-skew tolerance), default TTL = `CHECK_TODOS_TTL_MINUTES` (10 min).
- `realFs` extended in-place with `writeFileSync` + `mkdirSync` methods — `_runFs` injection hook picks them up automatically (mirrors obj 4 TRD 04-02 pattern).
- `aggregate()` rewired with 5-source cache-or-fetch logic: reads cache at top (null if `refresh: true`), per-source staleness check, accumulates `sectionsToWrite`, writes merged cache on miss/partial-miss, `cached: true` only when zero sources re-fetched.
- 3 new exports added: `readCheckTodosCache`, `writeCheckTodosCache`, `isCheckTodosCacheStale`.
- `.gitignore` updated with `.planning/.check-todos-cache.json` line near existing awareness/dup-detect entries.

## Commits

| Hash | Message |
|---|---|
| `f2ad36f` | `test(06-02): add failing tests for check-todos cache primitives + aggregate cache integration` |
| `6c14638` | `feat(06-02): add cache layer + per-source TTL granularity to check-todos aggregate` |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — cache test list + .gitignore | `npm test 2>&1 \| grep -E "^ℹ (pass\|fail)"` | 0 | PASS (22 new failures in Groups C/SC/AC, 1228 baseline still pass) |
| 2: GREEN — cache primitives + aggregate wiring | `npm test 2>&1 \| grep -E "^ℹ (pass\|fail)"` | 0 | PASS (1254/1254, 0 fail) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1254/1254) |
| cache-functions-exported | `grep -c "readCheckTodosCache" check-todos.cjs` | 0 | PASS (5 occurrences) |
| gitignore | `grep ".planning/.check-todos-cache.json" .gitignore` | 0 | PASS |
| smoke-run1-cached-false | `df-tools check-todos --raw \| grep cached` | 0 | PASS (`"cached": false`) |
| smoke-run2-cached-true | `df-tools check-todos --raw \| grep cached` | 0 | PASS (`"cached": true`) |
| cache-file-gitignored | `git status --short \| grep check-todos-cache` | 0 | PASS (no output — file is gitignored) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` (after test: commit) | 0 overall | PASS — 22 new failures in Groups C/SC/AC; 1228 baseline pass |
| GREEN | `npm test` (after feat: commit) | 0 | PASS — 1254/1254; 0 fail |

## Post-TRD Verification

- Auto-fix cycles used: 1 (A1 test mock missing writeFileSync/mkdirSync)
- Must-haves verified: 6/6
- Gate failures: None

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A1 test mock missing write methods caused spurious cache_write_error warning**
- **Found during:** Task 2 (GREEN phase — 1 existing test failed: A1)
- **Issue:** A1's `_setRunFs` mock only included read methods (existsSync, readFileSync, readdirSync, statSync). After aggregate gained cache-write logic, `writeCheckTodosCache` called `_runFs.mkdirSync` which was undefined. The `cache_write_error` warning leaked into `result.warnings`, causing `assert.deepStrictEqual(result.warnings, [])` to fail.
- **Fix:** Added `writeFileSync: () => {}` and `mkdirSync: () => {}` noops to A1's mock. Also added `.check-todos-cache.json` to existsSync falsy conditions and `endsWith('.planning')` → true so the cache-write path is exercised without error.
- **Files modified:** `plugins/devflow/devflow/bin/lib/check-todos.test.cjs`
- **Commit:** `6c14638`

## Manual Smoke Test

Two consecutive `df-tools check-todos --raw` invocations against this repo (devflow-claude-v1.1, feature/v1.1-obj-6-check-todos):

**Invocation 1 (cold — no cache):**
```json
{ "cached": false }
```
Cache file `.planning/.check-todos-cache.json` written (74 KB, all 5 sections).

**Invocation 2 (warm — cache hit):**
```json
{ "cached": true }
```
All 5 sections fresh (fetched_at within 10-min TTL) → all served from cache.

## Success Criteria Verification

- [x] SC-4 satisfied: `.planning/.check-todos-cache.json` gitignored; namespaced sections (local_todos, gh_issues, peer_sessions, initiative_questions, dup_detect_log); 10-min TTL; `refresh: true` forces re-fetch
- [x] All cache primitives mirror obj 2 TRD 02-04 contracts (null on missing/malformed, merge semantics, future-timestamp tolerance, zero-TTL = always stale)
- [x] `cached` flag truthful: true ONLY when zero sources re-fetched (AC2 + AC3 verify this rigorously)
- [x] No regression in baseline tests (1228 → 1254, 0 failures)

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/check-todos.cjs` — FOUND (contains readCheckTodosCache, writeCheckTodosCache, isCheckTodosCacheStale)
- `plugins/devflow/devflow/bin/lib/check-todos.test.cjs` — FOUND (Groups C/SC/AC added)
- `.gitignore` — FOUND (`.planning/.check-todos-cache.json` present)
- Commit `f2ad36f` — FOUND (test: RED)
- Commit `6c14638` — FOUND (feat: GREEN)
- Test count: 1254 pass / 0 fail (verified via npm test)
