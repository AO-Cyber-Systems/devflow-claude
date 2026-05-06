---
objective: 17-phase-c-auto-init
job: "04"
subsystem: config
tags: [global-config, cli, json, atomic-write, auto-init]

requires:
  - objective: 17-phase-c-auto-init/17-02
    provides: decline-tracker pattern for fs injection + _setConfigPath architecture

provides:
  - lib/global-config.cjs with readConfig/writeConfig/shouldAutoInit/cmdGlobalConfig
  - ~/.claude/devflow/global-config.json persistence for global user preferences
  - df-tools global-config get|set CLI surface
  - shouldAutoInit() helper ready for 17-03 (classify-session.js) consumption

affects:
  - 17-03-classify-session (consumes shouldAutoInit() from this TRD)
  - future v1.3+ TRDs that add keys to DEFAULT_CONFIG

tech-stack:
  added: []
  patterns:
    - "Global config pattern: ~/.claude/devflow/global-config.json with DEFAULT_CONFIG merge (forward-compat)"
    - "Atomic write via .tmp rename (same directory, no cross-fs risk)"
    - "Path injection via _setConfigPath for test isolation (no real ~/.claude/ touch)"
    - "Strict bool check (=== true) in shouldAutoInit to guard against string-bool config corruption"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/global-config.cjs
    - plugins/devflow/devflow/bin/lib/global-config.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/global-config-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "Forward-compat merge uses { ...DEFAULT_CONFIG, ...parsed } so user values override defaults AND unknown v1.3+ keys pass through unchanged"
  - "shouldAutoInit uses === true (strict), not truthy — string 'true' from corrupt config returns false"
  - "CLI set unknown keys emits stderr warning but writes anyway (forward-compat: v1.3 may use keys v1.2 doesnt know)"
  - "Value coercion: 'true'/'false' -> bool, digit strings -> number, else string — best-effort, no type validation"

patterns-established:
  - "Pattern: global config stored at ~/.claude/devflow/global-config.json, never in .planning/ (user-scope not project-scope)"
  - "Pattern: _setConfigPath + _setRunFs + _resetMocks triad for full test isolation"

requirements-completed:
  - C4

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-05-04
---

# Objective 17 TRD 04: Global Config Summary

**Persistent global config at ~/.claude/devflow/global-config.json with atomic read/write, forward-compat merge, CLI get/set surface, and shouldAutoInit() helper for 17-03 consumption**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-04T20:22:46Z
- **Completed:** 2026-05-04T20:27:52Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- lib/global-config.cjs ships readConfig/writeConfig/shouldAutoInit/cmdGlobalConfig with full fs injection for test isolation
- 25 new tests pass covering all 23 locked cases from 17-RESEARCH.md plus 2 bonus cases (mutation protection, non-object JSON root)
- Full subprocess round-trip verified: HOME-redirected set/get produce correct ~/.claude/devflow/global-config.json
- No regressions: pre-existing failures unchanged (check-todos E2E, novel-domain case 22 are pre-existing)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: readConfig/writeConfig/shouldAutoInit + fixtures | `node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs` | 0 | PASS |
| 2: CLI + df-tools wiring | `node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs` | 0 | PASS |

## Task Commits

Each task was committed atomically following TDD RED -> GREEN:

1. **Task 1 RED: fixtures + failing tests** - `c19f69e` (test)
2. **Task 1 GREEN: global-config.cjs implementation** - `6793ea7` (feat)
3. **Task 2 GREEN: df-tools.cjs wiring** - `9ec3d73` (feat)

_Note: Task 2 RED phase was implicit — cases 22-23 were already failing in the test file before df-tools.cjs was modified. No separate commit needed._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| global-config tests | `node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs` | 0 | PASS |
| full suite | `npm test` | partial (pre-existing failures only) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs` | 1 | FAIL (correct) — MODULE_NOT_FOUND |
| GREEN (Task 1) | `node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs` | 1 | PASS (23/25) — 2 subprocess tests still fail (df-tools not wired yet) |
| GREEN (Task 2) | `node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs` | 0 | PASS (25/25) |
| FULL SUITE | `npm test` | partial | 2026 pass, same pre-existing failures |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all truths covered)
- **Gate failures:** None (pre-existing failures in check-todos + novel-domain are not caused by this TRD)

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/global-config.cjs` (206 lines) — readConfig + writeConfig + shouldAutoInit + cmdGlobalConfig + _coerceValue + injection helpers
- `plugins/devflow/devflow/bin/lib/global-config.test.cjs` (444 lines) — 25 test cases across 6 describe groups
- `plugins/devflow/devflow/bin/lib/__fixtures__/global-config-fixtures.cjs` (113 lines) — mkTmpConfigPath() + SCENARIOS map
- `plugins/devflow/devflow/bin/df-tools.cjs` — +1 require import, +7 lines case arm

## Decisions Made

- Forward-compat merge uses `{ ...DEFAULT_CONFIG, ...parsed }` (not the other way) so user values override defaults AND unknown v1.3+ keys survive read
- `shouldAutoInit()` uses strict `=== true`, not truthy — a string `'true'` from a hand-edited corrupt config returns false
- CLI `set` on unknown keys: emit stderr warning but write anyway (caller decides to act on keys; binary that added them will use them)
- Value coercion is best-effort only: `'true'/'false'` to bool, digit strings to number — no type validation enforcement

## Deviations from Plan

None — TRD executed exactly as written. All 23 locked test cases covered plus 2 bonus (5b: mutation protection, corrupt_non_object).

## Issues Encountered

None. The subprocess tests (cases 22-23) failed in the GREEN phase for Task 1 as expected — they needed the df-tools case arm added in Task 2 to pass.

## Next Objective Readiness

- `shouldAutoInit()` is exported and ready for 17-03 (classify-session.js) to `require('./global-config.cjs')` and call it
- Global config path is `GLOBAL_CONFIG_PATH` export pointing to `~/.claude/devflow/global-config.json`
- Default is `false` (opt-in via `df-tools global-config set auto_init_substantive_projects true`)

---
*Objective: 17-phase-c-auto-init*
*Completed: 2026-05-04*
