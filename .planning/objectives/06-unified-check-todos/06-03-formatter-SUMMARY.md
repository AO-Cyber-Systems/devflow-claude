---
objective: 06-unified-check-todos
job: "06-03"
subsystem: cli-formatter
tags: [markdown, formatter, urgency-lanes, emoji, per-source-attribution, token-budget]

requires:
  - objective: 06-02
    provides: "check-todos cache layer + aggregate function with 5 sources"

provides:
  - "formatCheckTodosMarkdown(aggregate, opts) pure markdown formatter"
  - "4 lane sub-renderers (_renderLane) with emoji urgency markers"
  - "Per-source attribution suffix (_entryTitle + _attributionSuffix) for gh/peer/initiative/dup-detect/local"
  - "Per-lane truncation (DEFAULT_LANE_TRUNCATE=5) with opts.all bypass"
  - "opts.lane single-lane filter (omits other lanes entirely)"
  - "Token bound warning footer when output > MAX_CHECK_TODOS_OUTPUT_CHARS (8000)"

affects: [06-04-cli-skill-and-integration]

tech-stack:
  added: []
  patterns:
    - "Pure formatter delegation pattern: top-level formatCheckTodosMarkdown delegates to private _renderLane, _renderEntry, _entryTitle, _attributionSuffix sub-renderers"
    - "opts.date injection for deterministic test output (production calls _todayDateString() once)"
    - "Token bound: warn-not-truncate — append footer when over limit, never slice string"
    - "Lane order locked in LANE_NAMES constant: blocked → now → soon → ideas"

key-files:
  created: []
  modified:
    - "plugins/devflow/devflow/bin/lib/check-todos.cjs"
    - "plugins/devflow/devflow/bin/lib/check-todos.test.cjs"

key-decisions:
  - "Empty lanes render _no entries_ placeholder UNLESS --lane filter omits the lane entirely (consistent shape for all-empty aggregates)"
  - "Token bound is warn-not-truncate: output > 8000 appends warning footer with --lane hint; string never sliced"
  - "Sub-renderers (_renderLane, _renderEntry, _entryTitle, _attributionSuffix) are private — only formatCheckTodosMarkdown exported"
  - "Attribution suffix uses two-space indent for continuation under bullet in Markdown renderers"
  - "FT1/FT2 test assertions use 'dev' area prefix (from buildTestEntry local shape) not 'general'"

patterns-established:
  - "buildTestEntry(source, i) local helper for FT large-array tests — deterministic by index, source-correct shape"
  - "FE tests verify sub-renderers via public formatCheckTodosMarkdown output + regex assertions"

requirements-completed: [SC-5]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 6min
completed: 2026-05-05
---

# Objective 06 TRD 03: Formatter Summary

**Pure markdown formatter for check-todos with 4 emoji urgency lanes, per-source attribution, per-lane truncation (default 5), --lane filter, and token-bound warning footer at 8000 chars**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-05T20:47:40Z
- **Completed:** 2026-05-05T20:53:25Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Added `formatCheckTodosMarkdown(aggregate, opts)` pure renderer — no I/O, no process.exit, deterministic via opts.date injection
- Implemented 4-lane sub-renderer with emoji headers (`🔥 Blocked-on-you / ⚡ Now / 📋 Soon / 💡 Ideas`), empty-lane placeholders, per-lane truncation footer
- Per-source attribution via `_entryTitle` + `_attributionSuffix` switch for all 5 sources (gh/peer/initiative/dup-detect/local/unknown)
- Token-bound warning appended (not truncating) when output exceeds 8000 chars
- 28 new tests GREEN (Groups FF/FE/FT) — all 1282 tests pass, 0 failures

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — formatter tests | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` | 0 (1254 pass, 28 fail) | PASS (expected RED) |
| 2: GREEN — formatter impl | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` | 0 (1282 pass, 0 fail) | PASS |
| 2: GREEN — smoke test | `node -e "const ct = require('./plugins/devflow/devflow/bin/lib/check-todos.cjs'); console.log(ct.formatCheckTodosMarkdown({...}, { date: '2026-05-05' }))"` | 0 | PASS |
| 2: GREEN — _LANE_META check | `grep "_LANE_META" plugins/devflow/devflow/bin/lib/check-todos.cjs` | 0 | PASS |

## Task Commits

1. **Task 1: RED — formatter tests** - `8a20897` (test:)
2. **Task 2: GREEN — formatter implementation** - `4181fb0` (feat:)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` | 0 (28 fail) | FAIL (correct) |
| GREEN | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` | 0 (0 fail) | PASS (correct) |

RED output: `tests 1305 / pass 1254 / fail 28` — all 28 failing with "ct.formatCheckTodosMarkdown is not a function"
GREEN output: `tests 1305 / pass 1282 / fail 0`

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (FT1/FT2 test assertion fix — wrong bullet regex)
- **Must-haves verified:** 5/5
- **Gate failures:** None

## Manual Smoke Output (compressed)

```
# 📋 DevFlow Standup — 2026-05-05

## 🔥 Blocked-on-you (0)
_no entries_

## ⚡ Now (0)
_no entries_

## 📋 Soon (0)
_no entries_

## 💡 Ideas (0)
_no entries_

_freshly fetched_
```

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/check-todos.cjs` — Added TRD 06-03 formatter region (formatCheckTodosMarkdown + 6 private helpers); extended module.exports with formatCheckTodosMarkdown
- `plugins/devflow/devflow/bin/lib/check-todos.test.cjs` — Added Groups FF/FE/FT (28 tests total); added buildTestEntry(source, i) local helper; updated test list comment block

## Decisions Made

- Sub-renderers stay private (not exported); only `formatCheckTodosMarkdown` added to module.exports — per TRD spec
- FT1/FT2 bullet regex matches `- **dev**` not `- **general**` since `buildTestEntry('local', i)` sets `area: 'dev'` — corrected during GREEN phase (Rule 1 auto-fix, inline)
- Empty lanes always show `_no entries_` unless a `--lane` filter omits that lane entirely — consistent shape

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed FT1/FT2 bullet count assertion regex**
- **Found during:** Task 2 (GREEN phase test run)
- **Issue:** FT1/FT2 used `/^- \*\*general\*\*/gm` regex but `buildTestEntry('local', i)` sets `area: 'dev'`, producing `- **dev** —` bullets. Regex matched 0 bullets.
- **Fix:** Updated regex to `/^- \*\*dev\*\*/gm` to match actual output shape.
- **Files modified:** `plugins/devflow/devflow/bin/lib/check-todos.test.cjs`
- **Committed in:** `4181fb0` (part of feat: commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test assertion)
**Impact on plan:** Test assertion matched wrong area string. Implementation was correct. Fix was inline, no scope creep.

## Issues Encountered

None beyond the FT1/FT2 regex fix documented above.

## Next Objective Readiness

- `formatCheckTodosMarkdown` is ready for TRD 06-04 CLI skill wiring
- All 5 must-haves verified: emoji lanes, truncation, attribution, token bound, pure renderer
- No blockers

---
*Objective: 06-unified-check-todos*
*Completed: 2026-05-05*
