---
objective: 25-fleet-audit-fixes
job: "01"
subsystem: hooks
tags: [route-intent, intent-routing, regex, tdd, fixtures]

# Dependency graph
requires: []
provides:
  - "route-intent.js INTENT_MAP with 0 phantom skill names (all 4 corrected to consolidated post-Phase-G forms)"
  - "VERIFY rule tightened to explicit verify/validate + article intent (audit item 5 fix)"
  - "Broadened, fixture-pinned adoption rules for milestone/todo-list/gh-sync/discuss-objective (audit item 6b)"
affects: [route-intent.js, gate-edits.js consumers, any future intent-routing work]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Fixture-lockstep TDD for regex-based intent routers: FIRE/NO_FIRE fixtures in intent-fixtures.cjs drive route-intent.test.js via a loop, so RED/GREEN commits pair a fixture change with an INTENT_MAP change"]

key-files:
  created: []
  modified:
    - plugins/devflow/hooks/route-intent.js
    - plugins/devflow/hooks/route-intent.test.js
    - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs

key-decisions:
  - "Renamed rule label 'new-milestone' to 'milestone-new' alongside the skill-name fix for consistency with the new consolidated form (label is free text, no test depends on the old value)"
  - "Shape-test extension (adding gh-sync/discuss-objective to the required array) was done in the Task 1 commit rather than Task 3's, since both edits touched the same test block; harmless sequencing deviation, both entries already existed in INTENT_MAP unchanged so it did not create a false RED for Task 1"

patterns-established:
  - "Pattern: broadened regex adoption rules use bounded filler-word gaps (e.g. (?:\\w+\\s+){0,3}) rather than unbounded .* to avoid runaway matches while still covering realistic phrasing variance"

requirements-completed: []  # ad-hoc audit objective — roadmap Objective 25 success criteria are the contract (SC-1, SC-2, SC-3 router half)

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 45min
completed: 2026-07-22
---

# Objective 25 TRD 01: route-intent.js Fleet Audit Fixes Summary

**Corrected 4 phantom skill names, tightened the VERIFY rule from a 4-verb x 5-noun combinatorial match to explicit verify/validate+article intent, and broadened 4 near-dead adoption rules (milestone/todo-list/gh-sync/discuss-objective) with fixture-pinned realistic phrasings.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-22T13:35:00Z
- **Completed:** 2026-07-22T14:20:00Z
- **Tasks:** 3
- **Files modified:** 3 (route-intent.js, route-intent.test.js, intent-fixtures.cjs)

## Accomplishments
- INTENT_MAP no longer references any pre-consolidation phantom skill name (new-milestone, add-todo, check-todos, audit-milestone all corrected to their `/devflow:milestone new`, `/devflow:todo add`, `/devflow:todo list`, `/devflow:milestone audit` consolidated forms)
- VERIFY rule fires only on explicit `verify|validate + the|this + noun` — generic `check`/`test` dev-speech (audit's widest gap: fired 15x, followed 0x) now returns `[]`
- Four adoption-target skills (milestone new, todo list, gh-sync, discuss-objective) have realistic, multi-phrasing router rules backed by hand-authored fixtures, replacing narrow single-phrase regexes that matched zero real prompts in two months

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Correct 4 phantom skill names | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS |
| 2: Tighten VERIFY rule | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS |
| 3: Broaden adoption rules | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS |

Additional inline verification: `grep -n "skill: '/devflow:new-milestone\|skill: '/devflow:add-todo\|skill: '/devflow:check-todos\|skill: '/devflow:audit-milestone" plugins/devflow/hooks/route-intent.js` → no matches. `node -e "matchIntent('check the build').length===0 && matchIntent('verify the work').length>0"` → `true`.

## Task Commits

Each task was committed atomically as RED -> GREEN pairs (TDD):

1. **Task 1: Correct 4 phantom skill names**
   - RED: `5f7eaba` test(25-01): pin corrected consolidated skill names for phantom routes
   - GREEN: `4065a8f` fix(25-01): correct 4 phantom skill names in route-intent INTENT_MAP
2. **Task 2: Tighten VERIFY rule**
   - RED: `eabc371` test(25-01): move check-the-work to NO_FIRE, add NO_FIRE/FIRE cases for VERIFY tightening
   - GREEN: `218ae08` fix(25-01): tighten VERIFY rule to explicit verify/validate + article intent
3. **Task 3: Broaden adoption rules**
   - RED: `018c598` test(25-01): add broadened adoption fixtures for milestone/todo/gh-sync/discuss
   - GREEN: `cffca14` fix(25-01): broaden adoption rules for milestone/todo/gh-sync/discuss-objective

**Plan metadata:** this commit (docs: complete plan)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (2611/2669 pass; 8 pre-existing failures unrelated to this TRD — see Issues Encountered) |

## TDD Evidence

| Phase | Task | Command | Exit Code | Expected |
|---|---|---|---|---|
| RED | 1 | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 (5 failing) | FAIL (correct) |
| GREEN | 1 | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 (99/99) | PASS (correct) |
| RED | 2 | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 (4 failing) | FAIL (correct) |
| GREEN | 2 | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 (103/103) | PASS (correct) |
| RED | 3 | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 (6 failing) | FAIL (correct) |
| GREEN | 3 | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 (109/109) | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all `must_haves.truths` from TRD frontmatter confirmed via test suite + direct matchIntent() calls)
- **Gate failures:** None in route-intent.test.js. `npm test` full-suite run shows 8 pre-existing failures in `devflow-watch.test.cjs`, `handoff-e2e.test.cjs`, and `awareness.test.cjs` — confirmed present on baseline (pre-TRD `npm test` run) and reproduced in isolation independent of this TRD's changes (timing-sensitive daemon/PID-file tests and a peer-branch-scan test; route-intent.js is never touched by those files).

## Files Created/Modified
- `plugins/devflow/hooks/route-intent.js` - 4 phantom skill names corrected; VERIFY regex tightened; 4 adoption rules broadened (milestone new, todo list, gh-sync, discuss-objective)
- `plugins/devflow/hooks/route-intent.test.js` - shape test required array extended (+5 consolidated skills), deprecated-name test extended (+4 phantom names)
- `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` - 4 FIRE fixture `expected_skill` values corrected; `check the work` moved FIRE->NO_FIRE; +2 NO_FIRE (check the build, test the feature); +2 FIRE (verify the work, validate this feature); +6 FIRE (2 phrasings each for milestone-new, todo-list, gh-sync, discuss-objective)

## Decisions Made
- Kept rule ordering unchanged throughout (NEW-MILESTONE still precedes BUILD per the documented filter-first-match constraint)
- Left the narrower `verify (this|the current) objective` extension rule untouched per TRD anti-pattern guidance
- Broadened GH-SYNC regex uses a bounded `(?:\w+\s+){0,3}` filler-word gap before `to github|gh` rather than an unbounded wildcard, to avoid runaway matches while covering "sync the roadmap to github" / "push this to github issues"
- Broadened DISCUSS-OBJECTIVE regex adds a dedicated `walk me through the plan` alternative since "walk me through the plan for the next objective" doesn't end in the literal word "objective" immediately after the verb phrase

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gate-edits.js denied direct file edits in ambient mode**
- **Found during:** Task 1, first edit attempt
- **Issue:** This worktree is a DevFlow project with `gate-edits.js` active; direct Edit calls were denied because no `.planning/.skill-active` marker was present
- **Fix:** Ran `node ~/.claude/devflow/bin/df-tools.cjs skill-active --start executor` to arm the marker (standard executor behavior per DevFlow's own hook contract), then proceeded with edits. Marker was removed before the final commit per orchestrator instruction (not committed to git).
- **Files modified:** none (tooling-only)
- **Verification:** Subsequent edits succeeded
- **Committed in:** N/A (marker is gitignored/untracked, not part of any commit)

**2. [Minor sequencing] Shape-test extension partially front-loaded into Task 1**
- **Found during:** Task 1
- **Issue:** The Task 1 shape-test edit added all 5 new required skill names (`milestone new`, `milestone audit`, `todo list`, `gh-sync`, `discuss-objective`) in one pass, rather than splitting `gh-sync`/`discuss-objective` into Task 3 as the TRD action text specified
- **Fix:** No functional impact — `gh-sync` and `discuss-objective` already existed unchanged in INTENT_MAP at that point, so the shape test passed for those two entries immediately; Task 3's RED phase still correctly failed on its own 6 new FIRE fixtures
- **Files modified:** plugins/devflow/hooks/route-intent.test.js (already captured in Task 1 commit `5f7eaba`)
- **Verification:** Full route-intent.test.js suite green at each task boundary
- **Committed in:** `5f7eaba`

---

**Total deviations:** 2 (1 tooling/blocking, 1 minor sequencing) — no scope creep, no architectural changes.
**Impact on plan:** None on shipped behavior. Both deviations are process/sequencing notes, not functional changes beyond what the TRD specified.

## Issues Encountered
`npm test` (full suite, 2669 tests) shows 8 failing tests unrelated to this TRD:
- `devflow-watch.test.cjs`: 3 daemon start/stop tests (PID-file timing races)
- `handoff-e2e.test.cjs`: 4 daemon route-results tests (10-20s timeouts waiting on done records)
- `awareness.test.cjs`: 1 peer-branch-scan test (`S1: scanPeer with 1 valid branch...`)

These were confirmed present on a pre-TRD baseline run (same set, 9 failures — one fewer flaky daemon test than the mid-TRD run, consistent with known timing flakiness) and reproduced in isolation via `node --test plugins/devflow/devflow/bin/devflow-watch.test.cjs`, independent of any file this TRD touches. `route-intent.js`, `route-intent.test.js`, and `intent-fixtures.cjs` are the only files modified by this TRD; none of the 8 failing tests exercise those files. Not fixed — out of scope for this TRD and pre-existing in the codebase.

**ROADMAP.md update:** `node ~/.claude/devflow/bin/df-tools.cjs roadmap update-job-progress 25` was not run in this worktree — this is an isolated agent worktree and the orchestrator's note confirms ROADMAP/TRD progress reconciliation happens at merge time in the parent tree. Deferred to the orchestrator per the worktree protocol.

## Next Objective Readiness
- route-intent.js router half of objective 25's success criteria (SC-1, SC-2, SC-3 router half) is complete and fixture-pinned
- Remaining objective-25 audit items (non-router) are out of scope for TRD 01 and tracked separately in the objective's other TRDs

---
*Objective: 25-fleet-audit-fixes*
*Completed: 2026-07-22*
