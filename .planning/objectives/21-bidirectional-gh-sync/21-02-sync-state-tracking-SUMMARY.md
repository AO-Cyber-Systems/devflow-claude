---
objective: 21-bidirectional-gh-sync
trd: 02
subsystem: gh-integration
tags: [persistence, sync-state, hashing, atomic-write, push-pull-wiring]
dependency-graph:
  requires: ["21-01"]
  provides: ["sync-state.cjs", "hashFrontmatter", "recordSync", "getLastSync"]
  affects: ["lib/gh-pull.cjs", "lib/gh.cjs"]
tech-stack:
  added: ["sha256 (node:crypto) for deterministic frontmatter hashing"]
  patterns: ["atomic tmp+rename write", "deep-clone via JSON round-trip", "_runGh test-injection seam"]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/sync-state.cjs
    - plugins/devflow/devflow/bin/lib/sync-state.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/sync-state-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-pull.cjs
    - plugins/devflow/devflow/bin/lib/gh.cjs
key-decisions:
  - "Schema locked at v1: { version: 1, objectives: { <id>: { issue_ref, etag, gh_updated_at, label_set, assignees, milestone, status, last_synced_at, last_synced_disk_hash } } }"
  - "Atomic write: tmp file (pid+timestamp+random suffix) + fs.renameSync — POSIX-atomic on same fs"
  - "hashFrontmatter strips _-prefix keys, sorts object keys recursively, preserves array order, throws on null/non-object"
  - "recordSync deep-clones input to avoid caller mutation leaking to disk state"
  - "cmdGhSyncObjectives switched from runGh→_runGh internally (back-compat preserved by _runGh=runGh default; gains testability for sync-state wiring)"
metrics:
  duration: ~30min
  tasks: 3
  files: 5
  tests-added: 22
  completed: 2026-05-06
---

# Objective 21 TRD 02: Sync-State Tracking Summary

Build the persistence layer for bidirectional GH sync — `.planning/.gh-sync-state.json` records the last-known-good GH state per objective with sha256-deterministic frontmatter hashing for change detection. Wired into both push (`gh sync-objectives`) and pull-apply (`gh pull --apply`) success paths so subsequent pulls have a baseline to detect drift against.

## Implementation

`lib/sync-state.cjs` exports:

- `readSyncState(cwd)` — returns `{ version: 1, objectives: {...} }`. Defaults to empty on missing file, malformed JSON (with stderr warning), or unknown schema version (defensive — no spurious migrations).
- `writeSyncState(cwd, state)` — atomic write (tmp file in same dir + `fs.renameSync`); always emits `version: 1` regardless of caller-passed value; auto-creates `.planning/` if absent.
- `hashFrontmatter(fm)` — `'sha256:<hex>'`. Strips `_`-prefix keys, recursive sorted-key canonicalization, arrays preserve order, throws on null/non-object.
- `recordSync(cwd, objId, record)` — read-clone-mutate-write atomic upsert; deep-clones the record so caller mutation can't leak to disk.
- `getLastSync(cwd, objId)` — convenience reader returning the per-objective record or `null`.

`lib/gh-pull.cjs` refactor:

- Removed local `_readSyncStateRaw` stub (TRD 21-01 placeholder). Now imports `readSyncState`, `recordSync`, `hashFrontmatter`, `getLastSync` from `sync-state.cjs`.
- `cmdGhPull --apply` success branch calls `recordSync` after `applyDrift` writes — capturing the post-write disk-fm hash so subsequent pulls can detect "did anything change since this sync."

`lib/gh.cjs` push-side wiring:

- `cmdGhSyncObjectives` calls `recordSync` for every objective whose `gh issue create/edit` succeeded, persisting `issue_ref`, `gh_updated_at` (now-iso, approximate), `label_set` (just-applied label), `milestone`, and `last_synced_disk_hash` (sha256 of disk frontmatter at push time).
- Helper `_findObjectiveDir` resolves objective-number → slug-prefixed dir (`'1' → '01-test-objective'`) via padded/non-padded prefix match — best-effort; skips gracefully if no match.
- Switched internal `runGh(...)` calls to `_runGh(...)` for testability. Default `_runGh = runGh` preserves back-compat for production callers; tests inject mocks via `_setRunGh(fn)`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixtures + S1-S6 RED | `node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs` (RED) | non-zero (file failed) | PASS |
| 2: GREEN sync-state implementation (S+H+R+G, 19 tests) | `node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs` | 0 (19/19 pass) | PASS |
| 3: Wire recordSync (W1-W3 integration) | `node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs` | 0 (22/22 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs` | non-zero (file fails to load — module missing) | FAIL (correct) |
| GREEN (S+H+R+G) | `node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs` | 0 (19 tests pass) | PASS (correct) |
| GREEN (W1-W3) | `node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs` | 0 (22 tests pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| sync-state | `node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs` | 0 (22 pass) | PASS |
| gh-pull (regression) | `node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs` | 0 (19 pass) | PASS |
| gh.cjs (regression) | `node --test plugins/devflow/devflow/bin/lib/gh.test.cjs` | 0 (114 pass, 4 skipped) | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] cmdGhSyncObjectives used `runGh` directly, blocking testability for W2**

- **Found during:** Task 3 (W2 integration test)
- **Issue:** `cmdGhSyncObjectives` and `ghStatus` called `runGh(...)` (the live spawnSync path) directly, not the test seam `_runGh`. This made W2 untestable without invoking real `gh` CLI against real GitHub.
- **Fix:** Replaced internal `runGh(...)` calls in `cmdGhSyncObjectives` (4 sites) and `ghStatus` (1 site) with `_runGh(...)`. Default `_runGh = runGh` preserves all existing behavior; only test-injected mocks differ.
- **Files modified:** plugins/devflow/devflow/bin/lib/gh.cjs
- **Verification:** All 114 existing gh.cjs tests still pass; new W2 test now exercises the push path with a mocked gh CLI.

**2. [Rule 3 - Blocking issue] node:test runner silently truncates test counts when subject under test calls `process.exit`**

- **Found during:** Task 3 W2 test development
- **Issue:** `helpers.output()` (called inside `cmdGhSyncObjectives`) calls `process.exit(0)`, terminating the test process before subsequent test bodies can register, masking failures as "1 test passed."
- **Fix:** W2 test body wraps `cmdGhSyncObjectives` invocation in a try/catch that intercepts `process.exit` (rethrown as `__exit_${code}__` and swallowed by an inner catch). Mirrors `captureRun` pattern from `gh-pull.test.cjs`.
- **Files modified:** plugins/devflow/devflow/bin/lib/sync-state.test.cjs
- **Commit:** 20937bc

**3. [Rule 3 - Blocking issue] ROADMAP.md regex parses `### Objective N: Name` not `### N. Name`**

- **Found during:** Task 3 W2 test fixture
- **Issue:** First-pass test fixture used `### 1. Test Objective` (numbered list style) but `listObjectives` regex expects `Objective\s+([\d.]+):\s*([^\n]+)`.
- **Fix:** Updated test ROADMAP.md template to `### Objective 1: Test Objective`.
- **Files modified:** plugins/devflow/devflow/bin/lib/sync-state.test.cjs
- **Commit:** 20937bc

### Combined-task commits

Tasks 1 and 2 (S+H+R+G groups) were committed as a single GREEN commit rather than two separate ones. The plan envisioned `~12 atomic commits (test:/feat: pairs)` per task, but the test file and module were small enough (~190 lines + ~250 lines) that splitting on group boundaries (S vs H vs R vs G) created artificial commit churn without isolating risk. Result: 3 commits for the TRD instead of ~36, but each commit is self-contained and reversible.

## Post-TRD Verification

- Auto-fix cycles used: 3 (all Rule 3 blocking issues resolved inline)
- Must-haves verified: 5/5
  - `.gh-sync-state.json` records all required fields ✓
  - Both push and pull update sync state atomically after success ✓
  - `hashFrontmatter` deterministic across runs ✓
  - `atomicWrite` tmp+rename pattern ✓
  - Sync state consulted by `detectDrift` (TRD 21-01 callsite) and ready for TRD 21-03 ✓
- Gate failures: None
- Auth gates: None encountered

## Self-Check: PASSED

- `lib/sync-state.cjs` exists ✓
- `lib/sync-state.test.cjs` exists ✓
- `lib/__fixtures__/sync-state-fixtures.cjs` exists ✓
- `_readSyncStateRaw` removed from `gh-pull.cjs` ✓
- 3 commits exist: 369dd4a (RED), 2545dfc (GREEN core), 20937bc (wiring) ✓
- All 22 sync-state tests + 19 gh-pull tests + 114 gh.cjs tests pass ✓
