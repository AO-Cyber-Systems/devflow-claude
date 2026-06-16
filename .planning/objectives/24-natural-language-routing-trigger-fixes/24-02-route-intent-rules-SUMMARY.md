---
objective: 24-natural-language-routing-trigger-fixes
job: 02
subsystem: hooks
tags: [route-intent, intent-routing, UserPromptSubmit, gate-edits, edit-override, regex, TDD]

requires:
  - objective: 24-01-edit-override-marker
    provides: "edit-override.js with OVERRIDE_PHRASES, hasOverridePhrase, writeEditOverrideMarker, consumeEditOverrideMarker"

provides:
  - "EXECUTE rule: execute/run + objective → /devflow:execute-objective"
  - "TODO rule: add/create + todo → /devflow:todo add"
  - "QUICK rule: make/take/do a quick pass | small change → /devflow:quick"
  - "BUILD rule extended: bare objective, this/that, let's build, start building"
  - "BUILD suppression post-filter: todo-add/quick/objective-add wins over build"
  - "Override phrase suppression in matchIntent (hasOverridePhrase)"
  - "matchIntent opts.skillActive pure option (no fs)"
  - "main() wiring: override marker write BEFORE early-return, skillActive fs check"
  - "Cross-hook e2e proof: route-intent writes → gate-edits consumes → marker deleted"

affects:
  - 24-03-skill-trigger-disambiguation
  - gate-edits.js
  - route-intent.js consumers

tech-stack:
  added: []
  patterns:
    - "BUILD suppression post-filter: apply suppressBuild before Set/map (option c — smallest diff, multi-intent semantics preserved)"
    - "matchIntent pure second-arg opts pattern: fs I/O stays in main(), matchIntent stays pure"
    - "Cross-hook e2e with spawnSync: synchronous, no race conditions on marker file"
    - "Override marker written BEFORE early-return: ensures gate bypass even when no directive emitted"

key-files:
  created: []
  modified:
    - plugins/devflow/hooks/route-intent.js
    - plugins/devflow/hooks/route-intent.test.js
    - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs

key-decisions:
  - "BUILD suppression via post-filter on matched labels (not first-match-wins) — preserves multi-intent semantics for all other rules"
  - "matchIntent opts.skillActive is a pure option (no fs) — fs read stays in main() only"
  - "Override marker write happens in main() BEFORE matchIntent check — override prompts return [] by design but MUST arm gate bypass (decisions 1+4)"
  - "hasOverridePhrase called in BOTH matchIntent (pure suppression) AND main() (marker write) — the two paths serve different consumers"
  - "Cross-hook e2e uses spawnSync for synchronous execution — no race conditions on marker file assertions"

requirements-completed: [CTX24-D1, CTX24-D2, CTX24-D3, CTX24-D4, CTX24-D5, CTX24-D7, CTX24-D8]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 13min
completed: 2026-06-12
---

# Objective 24 TRD 02: Route-Intent Rules Summary

**EXECUTE/TODO/QUICK rules + BUILD extension + BUILD suppression post-filter + override/skill-active suppression + cross-hook e2e proof that route-intent's marker write is consumed by gate-edits**

## Performance

- **Duration:** 13 min
- **Started:** 2026-06-12T23:39:50Z
- **Completed:** 2026-06-12T23:52:23Z
- **Tasks:** 2 (4 commits: 2 RED + 2 GREEN)
- **Files modified:** 3

## Accomplishments

- 11 new FIRE fixtures and 2 new NO_FIRE fixtures in intent-fixtures.cjs covering all locked phrases
- route-intent.js: 3 new INTENT_MAP rules (EXECUTE, TODO, QUICK) + BUILD rule extended with 4 new alternatives
- BUILD suppression post-filter drops `/devflow:build` when todo-add/quick/objective-add is in the match set
- matchIntent extended with `opts.skillActive` pure option (no fs I/O) and hasOverridePhrase suppression
- main() wired with marker write before early-return, skillActive fs check, and { skillActive } passed to matchIntent
- Cross-hook e2e test proves the full decision-1 loop: route-intent writes `.edit-override` → gate-edits consumes it (allow + deleted)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: INTENT_MAP rules + suppression | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS |
| 2: main() wiring + cross-hook e2e | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS |

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1 RED: failing tests** - `07fd699` (test)
2. **Task 1 GREEN: implementation** - `f93b333` (feat)
3. **Task 2 RED: failing main() e2e tests** - `623861a` (test)
4. **Task 2 GREEN: main() wiring** - `18e643d` (feat)

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 | FAIL (18 failures — correct) |
| Task 1 GREEN | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS (55/55 — correct) |
| Task 2 RED | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 | FAIL (3 failures — correct) |
| Task 2 GREEN | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS (59/59 — correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (2357/2420 pass; 13 pre-existing failures, 0 new) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 7/7 (all locked decisions CTX24-D1 through D8 except D6 which is TRD 24-03 scope)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/hooks/route-intent.js` — EXECUTE/TODO/QUICK rules, BUILD extension, BUILD suppression post-filter, override+skillActive suppression, main() wiring with marker write and skillActive fs check
- `plugins/devflow/hooks/route-intent.test.js` — Updated skill-set assertion (added execute-objective/todo add/quick), exclusivity describe-block (3 deep-equal assertions), skillActive option tests, realistic UserPromptSubmit e2e (3 cases), cross-hook e2e (1 case)
- `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` — 11 new FIRE fixtures, 2 new NO_FIRE fixtures, moved 'Tackle this small change' from NO_FIRE to FIRE

## Decisions Made

- **BUILD suppression post-filter (option c):** Apply suppressBuild on matched-entries list BEFORE Set/map. This is the smallest diff — multi-intent semantics preserved for all other rule combinations; only build is suppressed when a higher-priority intent fires.
- **matchIntent pure opts pattern:** `opts.skillActive` carries the flag from main() into matchIntent without any fs calls inside matchIntent. This mirrors gate-edits.js's `shouldGate` pure function design.
- **Override in matchIntent AND main():** `hasOverridePhrase` in matchIntent returns `[]` (ensures pure tests pass); the marker write is in main() before the call. Both uses are intentional — pure suppression for unit tests, side-effect (marker write) in the entry point only.
- **Marker write before early-return:** Critical ordering — `if (hasOverridePhrase) { writeMarker(); return; }` ensures the gate bypass is armed even though no directive is emitted for override prompts.

## Deviations from Plan

None - TRD executed exactly as written.

## Issues Encountered

Gate-edits hook blocked raw `git commit` calls — used `df-tools commit` as required. Gate-edits hook also blocked Edit tool initially until `.skill-active` marker was written.

## Next Objective Readiness

- TRD 24-03 (skill-trigger disambiguation) can now rely on correct routing for execute-objective, todo, and quick
- Cross-hook proof is committed — TRD 24-01 + 24-02 together close decision-1 end-to-end

## Self-Check

- route-intent.js: FOUND
- route-intent.test.js: FOUND
- intent-fixtures.cjs: FOUND
- Commits 07fd699, f93b333, 623861a, 18e643d: all present in git log

## Self-Check: PASSED

---
*Objective: 24-natural-language-routing-trigger-fixes*
*Completed: 2026-06-12*
