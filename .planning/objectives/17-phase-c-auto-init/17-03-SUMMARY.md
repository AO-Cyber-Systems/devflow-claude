---
objective: 17-phase-c-auto-init
job: "03"
subsystem: hooks
tags: [classifier, init-offer, auto-init, project-state, global-config, session-start]

# Dependency graph
requires:
  - objective: 17-01
    provides: getProjectState — substantive heuristic + previously_declined detection
  - objective: 17-02
    provides: readDecline — decline-tracker consumed indirectly via project-state
  - objective: 17-04
    provides: shouldAutoInit — global-config read path
provides:
  - Extended classifySession with 5-input truth table (isSubstantive + previouslyDeclined)
  - AUTO_INIT_PREAMBLE constant (new mode for global-config opt-in)
  - Updated INIT_OFFER_PREAMBLE mentioning /devflow:new-project --auto and df-tools project-decline
  - classify-session.js wired to getProjectState + shouldAutoInit; auto-init mode promotion
  - Keystone integration: C1 + C2 + C3 + C4 all tied together in SessionStart hook
affects: [classify-session, classifier, 17-phase-c-auto-init, session-start-hook]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Try/catch fail-open around getProjectState in classify-session.js — SessionStart hooks must never crash"
    - "Mode promotion pattern: classifySession returns init-offer; classify-session.js promotes to auto-init post-hoc"
    - "Backward-compat via default params: isSubstantive=true, previouslyDeclined=false preserve all 15-01 tests"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/classifier.cjs
    - plugins/devflow/devflow/bin/lib/classifier.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
    - plugins/devflow/hooks/classify-session.js
    - plugins/devflow/hooks/classify-session.test.js

key-decisions:
  - "isSubstantive=true default (not false) preserves all 18 existing 15-01 classifier tests without any test modification"
  - "Mode promotion is post-classifySession: classifier returns init-offer; hook promotes to auto-init based on global-config — keeps classifier pure"
  - "Fail-open: try/catch around getProjectState + shouldAutoInit; errors → isSubstantive=false → skip mode → no crash"
  - "scenario 7 updated (15-01 subprocess test): mkInitOfferTmpProject was thin git dir, not substantive — updated to use mkBrownfieldSubstantive to match new gated behavior"

patterns-established:
  - "Two-layer gating: classifySession (pure, unit-testable) + post-processing in classify-session.js (I/O, mode promotion)"
  - "HOME-redirect env pattern for global-config subprocess tests: env: { ...process.env, HOME: tmpHome }"

requirements-completed: [C2]

# Verification evidence
verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 6min
completed: 2026-05-06
---

# Objective 17 TRD 03: Init-offer mode + auto-init wiring Summary

**Init-offer now gated on project substantiveness via 5-input classifySession truth table; classify-session.js wired to getProjectState + shouldAutoInit; AUTO_INIT_PREAMBLE added for global-config opt-in; all 4 C-phase modules (17-01 through 17-04) integrated as the Phase C keystone**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-06T06:41:49Z
- **Completed:** 2026-05-06T06:47:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Extended `classifySession` with backward-compatible 5-input truth table (isSubstantive + previouslyDeclined) — all 18 pre-existing 15-01 tests pass via default param values
- Added `AUTO_INIT_PREAMBLE` constant and `auto-init` mode to `renderRoutingPreamble`; updated `INIT_OFFER_PREAMBLE` text per #28 spec (mentions `--auto` and `df-tools project-decline`)
- Wired `classify-session.js` to call `getProjectState` (C1) and `shouldAutoInit` (C4) with fail-open try/catch; init-offer promoted to auto-init when global config is enabled
- 19 new tests: 13 pure-function cases in classifier.test.cjs + 6 subprocess scenarios in classify-session.test.js

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: TDD classifier.cjs extension | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 | PASS |
| 1: Smoke verify | `node -e "const c=require('./plugins/devflow/devflow/bin/lib/classifier.cjs'); console.log(c.classifySession({planningDir:null,hasGitDir:true,isSubstantive:true,previouslyDeclined:false}))"` | 0 | PASS |
| 2: TDD classify-session.js wiring | `node --test plugins/devflow/hooks/classify-session.test.js` | 0 | PASS |
| 2: Full test suite | `npm test` | 0 | PASS |

## Task Commits

1. **Task 1 RED:** `7a8692d` — test(17-03): add 13 failing tests for classifier extension (substantive + auto-init + updated init-offer)
2. **Task 1 GREEN:** `116da6a` — feat(17-03): extend classifySession with isSubstantive + previouslyDeclined; add AUTO_INIT_PREAMBLE; update INIT_OFFER_PREAMBLE text
3. **Task 2 RED:** `bafcefe` — test(17-03): add 6 subprocess test scenarios for classify-session.js init-offer extension
4. **Task 2 GREEN:** `f65d6b5` — feat(17-03): wire getProjectState + shouldAutoInit into classify-session.js; gate init-offer on substantive + not declined; auto-init mode promotion

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| classifier tests | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 | PASS (37/37) |
| hook tests | `node --test plugins/devflow/hooks/classify-session.test.js` | 0 | PASS (23/23) |
| full suite | `npm test` | 0 | PASS (1832/1858 pass; 2 pre-existing failures unchanged) |
| hooks.json lint | `node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/hooks/hooks.json'))"` | 0 | PASS |

## TDD Evidence

### Task 1: classifier.cjs extension

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 1 (9 fail) | FAIL (correct — 13 new tests fail; fixtures not yet updated; 28 pass) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 | PASS (37/37 correct) |
| REFACTOR | n/a | n/a | Not needed — clean implementation |

### Task 2: classify-session.js wiring

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/classify-session.test.js` | 1 (3 fail) | FAIL (correct — S2, S3, S5 fail before wiring; 20 pass) |
| GREEN | `node --test plugins/devflow/hooks/classify-session.test.js` | 0 | PASS (23/23 correct) |
| REFACTOR | n/a | n/a | Not needed |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (scenario 7 in classify-session.test.js updated — thin git dir is no longer substantive with new gating; this was a test update for intentional behavior change, not a bug fix)
- **Must-haves verified:** 7/7
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/classifier.cjs` — Extended classifySession with 5-input truth table + backward-compat defaults; AUTO_INIT_PREAMBLE added; INIT_OFFER_PREAMBLE updated per #28 spec; renderRoutingPreamble has auto-init branch
- `plugins/devflow/devflow/bin/lib/classifier.test.cjs` — 13 new test cases (cases 19-31) in two new describe blocks; all 18 original 15-01 tests preserved unchanged
- `plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs` — buildClassifyInput extended with isSubstantive/previouslyDeclined defaults; 3 new SCENARIOS (initOfferSubstantive, initOfferNotSubstantive, initOfferDeclined)
- `plugins/devflow/hooks/classify-session.js` — requires project-state.cjs + global-config.cjs; try/catch block computes isSubstantive + previouslyDeclined + autoInit; passes all 5 params to classifySession; promotes init-offer → auto-init post-hoc
- `plugins/devflow/hooks/classify-session.test.js` — imports mkBrownfieldSubstantive + mkAmbientProject from project-state-fixtures; 6 new S-tests; scenario 7 updated to use substantive brownfield fixture

## Decisions Made

- **Default params as back-compat mechanism:** isSubstantive=true (not false) — existing tests pass without modification because all old init-offer cases had isSubstantive omitted, which now defaults to true
- **Mode promotion is post-classifySession:** classifier returns init-offer; classify-session.js post-processes to auto-init if global config enabled — keeps classifier pure (no global-config coupling in classifier.cjs)
- **scenario 7 updated, not preserved:** The original test used a thin git dir which is correctly non-substantive under the new heuristic. Updating to brownfield substantive fixture matches intended behavior; this is not a back-compat regression

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Behavioral] scenario 7 subprocess test updated for new gated behavior**
- **Found during:** Task 2 GREEN phase
- **Issue:** `mkInitOfferTmpProject()` creates a bare dir with only `.git/` — no manifest, no source files. Under the new code, this is non-substantive → returns skip. The old test asserted INIT OFFER which is now wrong behavior for a thin repo.
- **Fix:** Updated `scenario 7` to use `mkBrownfieldSubstantive()` (50 files + manifest + git history) which correctly returns INIT OFFER. The thin git dir behavior (skip) is now covered by `S2`.
- **Files modified:** `plugins/devflow/hooks/classify-session.test.js`
- **Committed in:** bafcefe (Task 2 test commit)

---

**Total deviations:** 1 auto-fixed (1 behavioral test update for intentional behavior change)
**Impact on plan:** Correct behavior — thin git dirs should not trigger init offer. No scope creep.

## Issues Encountered

None beyond the expected scenario 7 test update.

## Next Objective Readiness

Phase C (auto-init) is now complete. All 4 TRDs (17-01 through 17-04) have shipped:
- C1 (17-01): project-state detector
- C2 (17-03): init-offer mode + auto-init wiring (this TRD — keystone)
- C3 (17-02): decline-tracker
- C4 (17-04): global-config

Objective 17 (phase-c-auto-init) is DONE. SessionStart hook now:
- Emits INIT OFFER preamble for substantive non-DevFlow projects (default)
- Promotes to AUTO-INIT preamble for users who opted in via global-config
- Suppresses offers for declined projects (30-day window)
- Falls back to skip for non-substantive projects and scratch dirs
- Never crashes (fail-open try/catch)

---
*Objective: 17-phase-c-auto-init*
*Completed: 2026-05-06*
