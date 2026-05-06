---
objective: 21-bidirectional-gh-sync
trd: 03
subsystem: gh-integration
tags: [conflict-detection, three-way-diff, resolve-flag, exit-codes, cli]
dependency-graph:
  requires: ["21-01", "21-02"]
  provides: ["conflict.cjs", "detectConflict", "formatThreeWayDiff", "resolveDisk", "resolveGh", "resolveMerge"]
  affects: ["lib/gh-pull.cjs"]
tech-stack:
  added: []
  patterns: ["per-field 5-case classification", "stanza-format diff output", "live require lookup for test seam", "deliberate two-step --resolve=merge gate"]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/conflict.cjs
    - plugins/devflow/devflow/bin/lib/conflict.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/conflict-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-pull.cjs
    - plugins/devflow/devflow/bin/lib/sync-state.test.cjs
key-decisions:
  - "Per-field conflict detection: only fields where ALL THREE (disk, gh, last) differ AND disk!=gh flag as conflicts. Cases 2/3/4 (one-side change or same-side change) classified as non-conflicting drift."
  - "D7 legacy fallback: if last_sync record is missing a tracked field (older record from before TRD 21-02 strict schema), use disk value as baseline — avoids false-positive conflicts."
  - "D8 set-equality: arrays compared after sort — label order doesn't trigger drift."
  - "Stanza diff format (3 lines per field) instead of tabular — works at any terminal width, no color/width detection."
  - "--resolve=merge --resolved continuation path runs BEFORE conflict detection so user edits that resolved the conflict still honor merge intent."
  - "Strict --resolve= parsing (rejects space-separated --resolve disk) — avoids ambiguity with --apply being separate token."
  - "resolveMerge does NOT auto-push; user runs `df-tools gh sync` afterward — keeps user in control of WHEN merged state goes to GH."
  - "Pending resolution stored under sync state's transient pending_resolution field (cleared on any successful resolution)."
metrics:
  duration: ~45min
  tasks: 3
  files: 5
  tests-added: 25
  completed: 2026-05-06
---

# Objective 21 TRD 03: Conflict Resolution Summary

3-way conflict detection + `--resolve={disk,gh,merge}` flag wired into `df-tools gh pull`. When both disk and GH changed since last sync, surfaces per-field conflicts in human-readable stanza format and exits non-zero. Three resolution paths: keep disk (push), accept GH (pull-overwrite), manual merge (two-step gate via `--resolved`).

## Implementation

`lib/conflict.cjs` exports:

- `detectConflict({ disk_fm, gh_norm, last_sync })` — pure 5-case-per-field classification:
  - case 1: unchanged everywhere → SKIP
  - case 2: disk only → non-conflicting drift
  - case 3: GH only → non-conflicting drift
  - case 4: same change → non-conflicting drift
  - case 5: both changed differently → CONFLICT
  - Returns `{ conflict: bool, conflicting_fields: { field: { disk, gh, last } }, non_conflicting_fields: [...] }`
- `formatThreeWayDiff({ objectiveId, issueRef, conflicting_fields })` — stanza output (3 lines/field) + resolution-options footer
- `resolveDisk({ cwd, objectiveId, issueRef, ghIssue, currentDiskFm })` — delegates to `gh.cmdGhSyncObjective` (live require lookup so test stubs work) + `recordSync` to clear `pending_resolution` and persist disk-as-authoritative
- `resolveGh({ cwd, objectiveId, issueRef, ghIssue, currentDiskFm })` — builds synthetic drift covering all tracked-field deltas, calls `applyDrift` with `conflict_suspected: false` (forced — user accepted GH side), then `recordSync` to persist gh-as-authoritative
- `resolveMerge({ cwd, objectiveId, currentDiskFm })` — verifies current disk hash != `pending_resolution.disk_hash_at_conflict` (else exit with /unchanged/ error); on hash change, records the merged disk state as new authoritative (does NOT auto-push)

`lib/gh-pull.cjs` changes:

- Imports `conflictMod` (`require('./conflict.cjs')`)
- Top of `cmdGhPull`: parses `--resolve=` flag with strict `=` (rejects `--resolve disk`); validates value ∈ {disk, gh, merge}
- Dedicated `--resolve=merge --resolved` continuation branch runs BEFORE conflict detection so user-edited merges that no longer surface as conflicts still get processed via `resolveMerge`
- Conflict-detection branch (between auth/fetch and `detectDrift`) — fires when `last_sync_state` exists AND both `disk_changed_since_last_sync` AND `gh_changed_since_last_sync`. Calls `conflictMod.detectConflict`. If real per-field conflict found, dispatches:
  - `--resolve=disk` → resolveDisk → exit 0 / 1
  - `--resolve=gh` → resolveGh → exit 0 / 1
  - `--resolve=merge` (no --resolved) → records pending_resolution, surfaces 3-way diff + hint, exits 1
  - no flag → records pending_resolution, surfaces 3-way diff + generic hint, exits 1
- If `detectConflict.conflict === false` (or no last_sync), falls through to existing detectDrift path (unchanged from TRD 21-01)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixtures + D1-D8 + F1-F3 RED | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` (RED) | non-zero (file load fails) | PASS |
| 1: GREEN detectConflict + formatThreeWayDiff | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` | 0 (11/11 pass) | PASS |
| 2: GREEN R-group resolvers | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` | 0 (18/18 pass) | PASS |
| 3: W-group cmdGhPull integration | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` | 0 (25/25 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (D+F) | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` | non-zero (module missing) | FAIL (correct) |
| GREEN (D+F) | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` | 0 (11 pass) | PASS (correct) |
| GREEN (R) | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` | 0 (18 pass) | PASS (correct) |
| GREEN (W) | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` | 0 (25 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| conflict | `node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs` | 0 (25 pass) | PASS |
| sync-state (regression) | `node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs` | 0 (22 pass) | PASS |
| gh-pull (regression) | `node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs` | 0 (19 pass) | PASS |
| gh.cjs (regression) | `node --test plugins/devflow/devflow/bin/lib/gh.test.cjs` | 0 (114 pass, 4 skipped) | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sync-state W1 test was authored against TRD 21-01 behavior; broke when TRD 21-03 enabled real conflict detection**

- **Found during:** Task 3 (after wiring conflict detection)
- **Issue:** TRD 21-02's W1 test pre-seeded `last_synced_disk_hash: 'sha256:initial'` (a stub value, not matching actual disk). After TRD 21-03 enabled the conflict detector to run when both disk AND gh changed since last sync, this test fell into the conflict path (disk hash differed from seed) and exited 1 instead of going through `--apply`.
- **Fix:** Updated W1 test to compute the actual disk hash via `ss.hashFrontmatter(actualFm)` and pre-seed sync state with that. The test now correctly represents "disk unchanged since last sync; only GH changed" → falls through to non-conflicting drift → applyDrift writes → recordSync.
- **Files modified:** plugins/devflow/devflow/bin/lib/sync-state.test.cjs
- **Commit:** 52afcb2

**2. [Rule 1 - Bug] resolveDisk's destructured `cmdGhSyncObjective` import prevented test monkey-patching**

- **Found during:** Task 2 (R1 test)
- **Issue:** `const { cmdGhSyncObjective } = require('./gh.cjs')` captures the function reference; subsequent `gh.cmdGhSyncObjective = stubFn` doesn't affect the captured local.
- **Fix:** Switched to live module-property lookup: `const gh = require('./gh.cjs'); gh.cmdGhSyncObjective(cwd, objectiveId, true)`. Test stubs now take effect.
- **Files modified:** plugins/devflow/devflow/bin/lib/conflict.cjs
- **Commit:** 337eeba

**3. [Rule 1 - Bug] buildSyncStateRecord fixture silently dropped extra params (e.g., pending_resolution)**

- **Found during:** Task 2 (R4 test)
- **Issue:** The destructuring-with-defaults pattern in `buildSyncStateRecord` only returns the named fields. Tests passing `pending_resolution: {...}` got an output object that omitted it.
- **Fix:** Added `...extra` rest spread to fixture so callers can include arbitrary extra fields.
- **Files modified:** plugins/devflow/devflow/bin/lib/__fixtures__/sync-state-fixtures.cjs
- **Commit:** 337eeba

### Architectural choice: --resolve=merge continuation runs BEFORE conflict detection

When the user edits OBJECTIVE.md to resolve a conflict, their edits may make disk match GH (e.g., user adopted GH's `status: done`). At that point, the conflict detector returns `conflict: false` — but the user's `--resolve=merge --resolved` invocation still expresses intent to record the merge.

**Choice:** Run the merge-continuation path BEFORE conflict detection when `pending_resolution` exists in sync state. This honors the user's intent regardless of current conflict status.

**Tradeoff:** A user who runs `--resolve=merge --resolved` AFTER the pending_resolution was cleared (e.g., by a previous successful `--resolve=disk`) gets routed through normal drift logic. That's correct: there's nothing to merge.

This decision is consistent with the TRD's note: "—resolved after --resolve=merge is a deliberate two-step gate."

## Post-TRD Verification

- Auto-fix cycles used: 3 (all Rule 1 bugs surfaced + fixed during test-driven implementation)
- Must-haves verified: 6/6
  - Conflict detection: per-field, 5-case ✓
  - 3 resolve paths (disk/gh/merge) wired ✓
  - --resolve=merge → user must edit + re-run with --resolved ✓
  - 3-way diff is human-readable stanza format ✓
  - Per-field conflict detection: only case 5 flags as conflict ✓
  - Non-zero exit on unresolved conflict ✓
- Gate failures: None
- Auth gates: None encountered

## Self-Check: PASSED

- `lib/conflict.cjs` exists ✓
- `lib/conflict.test.cjs` exists ✓
- `lib/__fixtures__/conflict-fixtures.cjs` exists ✓
- 4 commits exist: 60c823c (RED D+F), 59e2c6a (GREEN D+F), 337eeba (R group), 52afcb2 (W group + integration) ✓
- All 25 conflict tests + 22 sync-state tests + 19 gh-pull tests + 114 gh.cjs tests pass ✓
