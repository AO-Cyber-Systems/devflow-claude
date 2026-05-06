---
objective: 15-phase-a-routing-keystone
job: "02"
subsystem: hooks
tags: [route-intent, regex, intent-map, hook, tdd, box-drawn-directive]

requires:
  - objective: 12-skill-consolidation
    provides: Phase G consolidated skill names (status/status resume/status pause/objective add)

provides:
  - Tightened INTENT_MAP with 10 imperative+article+noun rules (no bare-verb false positives)
  - Box-drawn OBLIGATORY directive with gate-edits.js DENY reference
  - Exported matchIntent/renderDirective/INTENT_MAP for unit testing
  - 10 fire + 5 no-fire fixture suite in intent-fixtures.cjs
  - 33 passing tests covering shape, fixtures, prefix exclusion, directive, e2e

affects: [15-03-gate-edits, 15-05-audit-log, classify-session]

tech-stack:
  added: []
  patterns:
    - "INTENT_MAP with {rx, skill, label} entries — exported pure function for testability"
    - "Q&A skip-rule: interrogative-prefix check before regex iteration"
    - "Article+noun anchoring: imperative + (the|a|an|this|that) + [optional adj] + noun"

key-files:
  created:
    - plugins/devflow/hooks/route-intent.test.js
  modified:
    - plugins/devflow/hooks/route-intent.js
    - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
    - .planning/.route-recommendation

key-decisions:
  - "Q&A skip-rule excludes 'what' from interrogative list — 'What's our progress?' is a legitimate fire prompt handled by the status INTENT_MAP rule"
  - "Debug regex uses {0,3} optional-adjective slot between article and bug-noun to handle 'Fix the login bug' (adjective before noun)"
  - "Plan regex uses alternation for 'the next objective' (article + adj + noun) rather than treating 'next' as article"
  - "Box-drawn directive uses single-line 'gate-edits.js will DENY' for substring testability"

patterns-established:
  - "route-intent.js pattern: require.main guard + module.exports at bottom for require()-safe hook"
  - "Fixture-driven test loops: for (const f of FIXTURES) { test(...) } per fixture"

requirements-completed: [A2]

verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 26min
completed: 2026-05-06
---

# Objective 15 TRD 02: route-intent.js tightening Summary

**INTENT_MAP tightened from 14 bare-verb rules to 10 imperative+article+noun rules with box-drawn OBLIGATORY directive, Q&A skip-rule, Phase G consolidated skill names, and 33 TDD-driven tests**

## Performance

- **Duration:** 26 min
- **Started:** 2026-05-06T04:50:41Z
- **Completed:** 2026-05-06T05:16:53Z
- **Tasks:** 1 (TDD: 3 commits — RED/GREEN/chore)
- **Files modified:** 4

## Accomplishments

- Tightened INTENT_MAP from 14 loose bare-verb rules to 10 imperative+article+noun rules that won't fire on Q&A prompts
- Replaced one-paragraph advisory injection with 15-line box-drawn OBLIGATORY directive mentioning `gate-edits.js will DENY`
- Added `require.main` guard + `module.exports` to enable unit testing without subprocess overhead
- Extended `intent-fixtures.cjs` with 10 fire + 5 no-fire hand-built fixtures (locked per TRD)
- Added `.planning/.route-recommendation` marker for 15-05's audit log

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: TDD INTENT_MAP regex tightening + fixture suite | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS |

## Task Commits

1. **RED: fixtures + failing tests** - `78a0c65` (test)
2. **GREEN: implementation** - `b24d229` (feat)
3. **marker file** - `1a1e5ff` (chore)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS |
| lint | `grep -E "/devflow:(progress|resume-work|pause-work|add-objective)" plugins/devflow/hooks/route-intent.js` | 1 (no matches) | PASS |
| shape | `node -e "const {INTENT_MAP,matchIntent}=require('./plugins/devflow/hooks/route-intent.js'); console.log(INTENT_MAP.length,matchIntent('Fix the login bug'))"` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node -e "require('./plugins/devflow/hooks/route-intent.test.js')"` | 1 | FAIL (correct) — 25 fail, 1 pass |
| GREEN | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS (correct) — 33/33 pass |
| REFACTOR | n/a | n/a | No refactor needed |

RED phase evidence: 25 tests failed (exports undefined, matchIntent not a function, renderDirective not a function). 1 test passed (non-devflow project silent subprocess test — works with original hook because no `.planning/` means silent exit regardless of exports).

GREEN phase evidence: all 33 tests pass including 10 fire fixtures, 5 no-fire fixtures, 4 INTENT_MAP shape tests, 7 renderDirective tests, 2 subprocess e2e tests, 4 skill-prefix exclusion tests, 1 null/undefined guard test.

## Post-TRD Verification

- **Auto-fix cycles used:** 2 (regex iteration to handle "Fix the login bug" adjective slot and "Plan the next objective" article+adj pattern)
- **Must-haves verified:** 8/8
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/hooks/route-intent.js` — Tightened INTENT_MAP (10 rules), box-drawn OBLIGATORY directive, exports, require.main guard
- `plugins/devflow/hooks/route-intent.test.js` — 33 tests: INTENT_MAP shape, 10 fire + 5 no-fire fixture loops, skill-prefix exclusion, renderDirective shape, 2 subprocess e2e
- `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` — Extended with FIRE_FIXTURES (10) + NO_FIRE_FIXTURES (5), existing exports preserved
- `.planning/.route-recommendation` — Marker for 15-05 audit log

## Decisions Made

- **Q&A skip-rule excludes "what":** "What's our progress?" is a legitimate fire prompt for the status rule, so only `why|how|can|could|would|should|is|are|does|did|do` are in the interrogative skip list
- **Debug regex allows optional adjectives:** `(?:\w+\s+){0,3}` slot between article and bug-noun enables "Fix the login bug" (adj=login) to fire correctly
- **Plan regex uses two alternations:** `plan + (the|this|an|a) + (next)? + objective` and `plan + next + objective` to handle "Plan the next objective" without matching bare interrogatives
- **Box-drawn directive keeps gate-edits mention on single line:** `gate-edits.js will DENY` on one line for reliable substring assertion in tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Debug regex didn't handle adjectives between article and bug-noun**
- **Found during:** Task 1 GREEN phase, fixture testing
- **Issue:** "Fix the login bug" returned `[]` because regex required article immediately adjacent to bug-noun (`the bug`), but the fixture has `the login bug` (adjective in between)
- **Fix:** Added `(?:\w+\s+){0,3}` slot: `fix + (the|this|that|a|an) + [0-3 words] + (bug|error|crash|...)`
- **Files modified:** `plugins/devflow/hooks/route-intent.js`
- **Committed in:** b24d229

**2. [Rule 1 - Bug] Plan regex didn't handle "the next objective" (article + adj + noun)**
- **Found during:** Task 1 GREEN phase, fixture testing
- **Issue:** "Plan the next objective" returned `[]`. Original regex `plan + (the|this|an|a|next) + noun` treated "next" as an article replacement, but the fixture has `the next` (article + adj)
- **Fix:** Changed to `plan + (the|this|an|a) + (next)? + noun` with secondary alternation for bare `plan next noun`
- **Files modified:** `plugins/devflow/hooks/route-intent.js`
- **Committed in:** b24d229

---

**Total deviations:** 2 auto-fixed (2 Rule 1 regex bugs)
**Impact on plan:** Both fixes required for fixtures to pass. No scope creep. Both discovered by RED-phase test failures as designed.

## Issues Encountered

**File reversion issue:** The `Write` tool was being reverted between invocations because a background `git stash` command (from an inadvertent background process) stashed the in-progress changes before they were committed. The implementation was written using Python `subprocess` to avoid tool interaction issues, then immediately committed. Post-commit the file has been stable.

**Pre-existing test failures:** 2 failures pre-existed this TRD on the branch:
- `check-todos E2E1` (unrelated check-todos test)
- `novel-domain test 22` (unrelated novel-domain test)
- `verify-completion.test.js` tests (from TRD 15-05 in-progress work, untracked file)
None of these are caused by 15-02 changes.

## Next Objective Readiness

- `matchIntent` and `renderDirective` are exported and tested — ready for 15-03's gate-edits integration
- `.planning/.route-recommendation` marker written for 15-05's audit log
- All 10 Phase G consolidated skill names present in INTENT_MAP — ready for classify-session (15-01) to reference

## Self-Check: PASSED

All created files verified present on disk. All 3 commits verified in git log:
- `78a0c65` test(15-02): add 10 fire / 5 no-fire intent fixtures + failing route-intent tests
- `b24d229` feat(15-02): tighten route-intent regex + box-drawn directive + exports
- `1a1e5ff` chore(15-02): add .route-recommendation marker for 15-05 audit log

SUMMARY.md committed in: `d8c208a` (bundled with 15-05 commit — file is tracked)

---
*Objective: 15-phase-a-routing-keystone*
*Completed: 2026-05-06*
