---
objective: 02-cross-repo-awareness-layer
job: 02-04
subsystem: awareness
tags: [cache, fs, ttl, merge-semantics, tdd]

# Dependency graph
requires:
  - objective: 02-01-state-md-parser-and-fixtures
    provides: "AWARENESS_CACHE_REL constant, DEFAULT_TTL_MINUTES, parseStateMd, aggregateOrgByProductQuarter"
provides:
  - "readCache(cwd) — reads .planning/.awareness-cache.json; returns null on missing/corrupt"
  - "writeCache(cwd, sections) — atomic merge-write; preserves unspecified namespace section"
  - "isStale(fetched_at, ttl_minutes) — TTL math with null/invalid/future handling"
  - ".gitignore updated with .planning/.awareness-cache.json"
  - "templates/config.json documents awareness.* config block"
affects:
  - 02-05-skill-and-cli
  - 02-06-lifecycle-integration
  - 02-07-library-export-and-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Namespaced JSON cache file with per-section merge semantics (preserve unwritten namespace)"
    - "isStale with null/undefined/invalid/future-timestamp guard chain"
    - "readCache returns null on all failure modes (never throws)"
    - "writeCache merge: Object.assign(existing, sections) — shallow merge at namespace level"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/awareness.cjs
    - plugins/devflow/devflow/bin/lib/awareness.test.cjs
    - .gitignore
    - plugins/devflow/devflow/templates/config.json

key-decisions:
  - "writeCache merge semantics: Object.assign(existing || {}, sections) — writing one namespace preserves the other; this is the prerequisite for --refresh peer / --refresh org independence in TRD 02-05"
  - "isStale zero-TTL behavior: ttl_minutes=0 returns true (always stale); locked for callers that need cache bypass"
  - "isStale future-timestamp behavior: age_ms < 0 returns false (clock skew tolerance — don't penalize skew)"
  - "readCache never throws: empty-string, malformed JSON, and missing-file all return null; regeneration on next scan is cheap"

patterns-established:
  - "Cache helpers match readMapping/writeMapping signature from gh.cjs: (cwd, ...) sync fs ops, try/catch JSON parse"
  - "tmp-dir helper (tempCwd + try/finally cleanup) mirrors gh.test.cjs buildSyncTargetProject pattern"
  - "TRD region divider format: // ─── TRD 02-04: cache layer ─── preserves for downstream TRDs"

requirements-completed: [SC-7]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 4min
completed: 2026-05-04
---

# Objective 2 TRD 04: Cache Layer Summary

**Namespaced awareness cache with merge-write semantics — readCache/writeCache/isStale helpers backed by `.planning/.awareness-cache.json`; writing `peer` section preserves existing `org` section and vice versa**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-04T21:38:37Z
- **Completed:** 2026-05-04T21:42:37Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 4

## Accomplishments

- Implemented `readCache`, `writeCache`, `isStale` in `lib/awareness.cjs` TRD 02-04 region
- Merge semantics: `writeCache(cwd, { peer: X })` preserves existing `org` section — prerequisite for TRD 02-05's `--refresh peer` / `--refresh org` flags
- `isStale` handles null/undefined/invalid/zero-TTL/future-timestamp edge cases per locked rules
- `.gitignore` updated; `templates/config.json` documents `awareness.*` block alongside `github`
- 23 new tests across Groups C/W/I/G/T; all 610 tests pass (no regressions)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — failing tests | `npm test 2>&1 \| grep "fail 23"` | 0 (23 failing as expected) | PASS (RED) |
| 2: GREEN — implementation | `npm test 2>&1 \| tail -5` (610 pass, 0 fail) | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — failing tests** - `2b6a999` (test(02-04))
2. **Task 2: GREEN — cache implementation** - `bf9593f` (feat(02-04))

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| exports | `node -e 'const a=require(...); ["readCache","writeCache","isStale"].forEach(k => { if (typeof a[k] !== "function") throw new Error(k); }); console.log("OK")'` | 0 | PASS |
| gitignore | `grep -q '.awareness-cache.json' .gitignore` | 0 | PASS |
| config | `node -e '...; if(!c.awareness) throw...'` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test 2>&1 \| grep "fail 23"` | 0 (23 new tests failing) | FAIL (correct) |
| GREEN | `npm test 2>&1 \| tail -5` | 0 (610 pass, 0 fail) | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (path correction for config.json test — `../../../` → `../../templates/config.json`)
- **Must-haves verified:** 12/12 (all truths in TRD must_haves)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/awareness.cjs` — Added TRD 02-04 region: `readCache`, `writeCache`, `isStale`; updated `module.exports`
- `plugins/devflow/devflow/bin/lib/awareness.test.cjs` — Added Groups C/W/I/G/T (23 tests)
- `.gitignore` — Added `.planning/.awareness-cache.json` line
- `plugins/devflow/devflow/templates/config.json` — Added `awareness` block (cache_ttl_minutes, peer_stale_days, branch_patterns, org_project_id)

## Decisions Made

- **writeCache merge via Object.assign**: `Object.assign({}, existing, sections)` is the simplest correct merge at namespace level; partial writes preserve unspecified sections
- **isStale zero-TTL → always stale**: `if (ttl <= 0) return true` handles both 0 and negative
- **readCache silent null on empty string**: `if (!content.trim()) return null` before JSON.parse prevents SyntaxError on empty files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed config.json test path resolution**
- **Found during:** Task 1 (RED phase test writing)
- **Issue:** TRD-provided path `../../../templates/config.json` from `plugins/devflow/devflow/bin/lib` resolves to `plugins/devflow/templates/config.json` (non-existent). Tests silently skipped via `if (!fs.existsSync()) return`.
- **Fix:** Corrected to `../../templates/config.json` — resolves to `plugins/devflow/devflow/templates/config.json` (correct)
- **Files modified:** `awareness.test.cjs`
- **Verification:** T1/T2/T3 tests now fail in RED (correct), pass in GREEN
- **Committed in:** `2b6a999` (part of RED commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — path bug in test code)
**Impact on plan:** Path error discovered during RED phase; corrected before RED commit. No scope creep. All 23 test cases now genuinely test the correct file.

## Issues Encountered

None beyond the path-resolution deviation above.

## Next Objective Readiness

- `readCache` / `writeCache` / `isStale` ready for TRD 02-05 (skill + CLI) and TRD 02-06 (lifecycle integration)
- Merge semantics tested and proven — `--refresh peer` / `--refresh org` independence is safe to implement
- TRD 02-04 region divider preserved in `awareness.cjs` for TRD 02-02 (scanPeer) to append below

---
*Objective: 02-cross-repo-awareness-layer*
*Completed: 2026-05-04*
