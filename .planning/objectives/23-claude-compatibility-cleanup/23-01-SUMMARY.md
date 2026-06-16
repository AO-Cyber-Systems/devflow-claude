---
objective: 23-claude-compatibility-cleanup
trd: "01"
subsystem: hooks/sync-runtime
tags: [atomicity, exclusions, self-heal, tdd, session-start]
dependency_graph:
  requires: []
  provides: [atomic-mirror-sync]
  affects: [session-start, devflow-runtime-mirror]
tech_stack:
  added: []
  patterns: [atomic-rename-swap, exclusion-filter, content-sentinel, stale-sweep]
key_files:
  created:
    - plugins/devflow/hooks/sync-runtime.test.js
  modified:
    - plugins/devflow/hooks/sync-runtime.js
decisions:
  - "Per-subdir temp+rename atomic swap chosen over whole-tree swap per research — each subdir independently atomic, failure in one does not affect already-completed subdirs"
  - "Content sentinel (bin/df-tools.cjs) added to early-exit check — version marker alone is not proof of intact mirror (confirmed corruption on 2026-06-12)"
  - "MIRROR_EXCLUDE = [/\\.test\\.cjs$/, /\\.test\\.js$/, /(^|\\/)__fixtures__(\\/|$)/] — excludes ~2.4MB of test code per install without touching references/*.md"
  - ".plugin-version written only after all four subdir swaps succeed — failed sync never leaves a current-looking marker"
  - "Stale devflow-tmp-* sweep runs before sync loop — crashed prior runs do not block subsequent sessions"
metrics:
  duration_minutes: 6
  completed_date: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Objective 23 TRD 01: Sync-Runtime Atomic Swap Summary

**One-liner:** Rewrote sync-runtime SessionStart hook to use per-subdir temp+renameSync atomic swaps with test-code exclusions (~2.4MB saved), content sentinel self-heal, and stale-tmp sweep.

## What Was Built

`plugins/devflow/hooks/sync-runtime.js` was rewritten to fix a confirmed corruption mode where `.plugin-version` claimed current but 28 of 39 workflows were missing. The destroy-then-copy loop has been replaced with an atomic temp+rename approach.

`plugins/devflow/hooks/sync-runtime.test.js` is a new test file with 13 tests covering all TRD-specified behaviors.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Write sync-runtime.test.js (RED) | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 1 | PASS (5 expected failures for not-yet-impl behaviors) |
| 2: Implement atomic swap + exclusions + sentinel (GREEN) | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 0 | PASS (13/13) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 1 | FAIL for tests 4-7 + stale-sweep (correct — not yet implemented) |
| GREEN | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 0 | PASS 13/13 (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| sync-runtime tests | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 0 | PASS |
| full suite no new failures | `npm test` | 1 | PASS (same pre-existing failures, no new ones) |
| renameSync present | `grep -n "renameSync" sync-runtime.js` | 0 | PASS |
| sentinel present | `grep -n "df-tools.cjs" sync-runtime.js` | 0 | PASS |
| exclusions safe | `node -e "const p=[...]; console.log(p.some(r=>r.test('references/deviation-rules.md')))"` | 0 | PASS (false) |

## Verification Results

- `node --test plugins/devflow/hooks/sync-runtime.test.js` — 13/13 pass
- `grep -n "renameSync" plugins/devflow/hooks/sync-runtime.js` — line 156 (atomic swap)
- `grep -n "df-tools.cjs" plugins/devflow/hooks/sync-runtime.js` — line 44 (sentinel)
- Exclusion regexes do NOT match `references/deviation-rules.md` — `false` confirmed
- `npm test` — zero new failures beyond pre-existing set

## Implementation Details

### Key changes to sync-runtime.js

1. **MIRROR_EXCLUDE constant** — Three regexes: `\.test\.cjs$`, `\.test\.js$`, `/(^|\/)__fixtures__(\/|$)/`. Matched against both entry name and accumulated relative path in `copyDir`.

2. **shouldExclude(entryName, relPath)** — Tests both dimensions so patterns like `__fixtures__` match as directory names anywhere in the path tree.

3. **copyDir extended with relBase param** — Third argument accumulates the relative path as recursion descends, enabling path-based exclusion checks.

4. **Content sentinel** — Early-exit condition changed from `fs.existsSync(targetDir)` to `fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs'))`. Version marker present but sentinel absent → full re-sync.

5. **sweepStaleTmpDirs()** — Reads `targetDir` entries, removes any starting with `devflow-tmp-`. Called before the swap loop.

6. **Atomic swap loop** — For each of `['workflows', 'references', 'templates', 'bin']`: copy source into `devflow-tmp-{sub}-{pid}` inside `targetDir`, then `removeDir(target)` then `renameSync(tmpPath, target)`. Version marker written after all four succeed.

7. **Error recovery** — `tmpDirsCreated` tracking array used to clean up mid-loop failures without touching the version marker.

## Deviations from Plan

None — TRD executed exactly as written.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4
  - Atomic per-subdir swap: confirmed (renameSync at line 156)
  - .plugin-version written only on success: confirmed (after loop, in try block)
  - Test-code exclusion: 13/13 tests confirm *.test.cjs, *.test.js, __fixtures__/ excluded
  - Corruption mode self-heals: test 7 confirms sentinel check forces re-sync
- Gate failures: None

## Commits

| Hash | Message |
|---|---|
| adb87a5 | test(23-01): add failing tests for atomic sync, exclusions, self-heal |
| 3544206 | feat(23-01): atomic mirror swap, test-code exclusions, content sentinel |

## Self-Check: PASSED

- `plugins/devflow/hooks/sync-runtime.test.js` exists: FOUND
- `plugins/devflow/hooks/sync-runtime.js` modified: FOUND
- Commit adb87a5 exists: FOUND
- Commit 3544206 exists: FOUND
