---
objective: 12-skill-consolidation
trd: "06"
subsystem: df-tools/lib/decimal-survey + df-tools/lib/templates + skills/objective
tags:
  - cleanup
  - i2-decimal-survey
  - i4-template-canonicalization
  - decimal-deprecation
provides:
  - df-tools survey decimal-objectives CLI
  - templates/summary.md as single canonical summary template
  - decimal-objective deprecation (objective insert + next-decimal)
affects:
  - lib/decimal-survey.cjs (created)
  - lib/decimal-survey.test.cjs (created)
  - lib/templates.cjs (cmdTemplateSelect simplified)
  - lib/templates.test.cjs (created)
  - lib/objective.cjs (decimal code deprecated)
  - lib/skill-route.cjs (insert removed from SKILL_ROUTES)
  - lib/skill-route.test.cjs (tests updated)
  - skills/objective/SKILL.md (insert removed)
  - skills/insert-objective/SKILL.md (redirect updated)
  - templates/summary-minimal.md (deleted)
  - templates/summary-standard.md (deleted)
  - templates/summary-complex.md (deleted)
  - .planning/objectives/12-skill-consolidation/12-RESEARCH.md (I2 disposition populated)
tech-stack:
  added: []
  patterns:
    - Injectable fs (_setRunFs/_resetMocks) for survey walker testability
    - spawnSync CLI tests for end-to-end survey verification
    - Deprecation-via-exit-1 pattern for removed commands
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/decimal-survey.cjs
    - plugins/devflow/devflow/bin/lib/decimal-survey.test.cjs
    - plugins/devflow/devflow/bin/lib/templates.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/templates.cjs
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/lib/skill-route.cjs
    - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/df-tools.test.cjs
    - plugins/devflow/skills/objective/SKILL.md
    - plugins/devflow/skills/insert-objective/SKILL.md
    - .planning/objectives/12-skill-consolidation/12-RESEARCH.md
key-decisions:
  - "I2 survey recommendation=drop: 0 decimal objectives across 16 projects / 120 total (0%) — below 5% threshold"
  - "cmdObjectiveInsert + cmdObjectiveNextDecimal replaced with deprecation stubs (exit 1, error JSON)"
  - "Decimal renumber branch removed from cmdObjectiveRemove; integer path preserved"
  - "SKILL_ROUTES.objective subcommands changed from [add,insert,remove] to [add,remove]"
  - "DEPRECATION_MAP insert-objective now redirects to objective add (insert permanently deprecated)"
  - "summary template canonicalized to templates/summary.md; 3 variant files deleted (148 lines removed)"
patterns-established:
  - "Deprecation-via-exit-1: deprecated commands return {error, removed_in, recommendation} JSON + exit 1"
  - "Survey CLI pattern: walker + _setRunFs injection + threshold recommendation"
duration: 14min
completed: "2026-05-04"
---

# Objective 12 TRD 06: I2+I4 Cleanup Summary

**Decimal-objective survey shipped (0% usage → drop); summary template canonicalized to single file; insert/next-decimal commands deprecated with exit-1 stubs.**

## Performance

- **Duration:** 14 minutes
- **Tasks:** 3/3 completed (Task 3 executed — survey returned `drop`)
- **Files modified:** 12 modified, 3 created, 3 deleted

## Accomplishments

- **I2 (Decimal survey):** `df-tools survey decimal-objectives` CLI built with injectable fs, 11 tests (SU1-6, CLI1-3, EX1-2), live survey run: 16 projects, 120 objectives, 0 decimal (0%) → recommendation `drop`
- **I2 (Disposition):** `12-RESEARCH.md § I2 disposition` populated with real survey output; action taken documented
- **I4 (Template canonicalization):** `cmdTemplateSelect` simplified — always returns `templates/summary.md`; heuristic (minimal/standard/complex) removed; 148 lines deleted
- **Task 3 (Decimal drop):** `cmdObjectiveInsert` + `cmdObjectiveNextDecimal` replaced with deprecation stubs; decimal renumber branch removed from `cmdObjectiveRemove`; `SKILL_ROUTES.objective` updated to `[add, remove]`; redirect skill updated

## Task Commits

1. **Task 1: Survey CLI + I2 disposition** — `e74b653`
   - `lib/decimal-survey.cjs` + `lib/decimal-survey.test.cjs` + `df-tools.cjs` survey arm + `12-RESEARCH.md`
2. **Task 2: Canonicalize summary template** — `f0e9616`
   - `templates.cjs` simplified + `templates.test.cjs` + 3 template deletions
3. **Task 3: Remove decimal-objective code** — `8c5783f`
   - `objective.cjs` + `df-tools.test.cjs` + `skill-route.cjs` + `skill-route.test.cjs` + `skills/objective/SKILL.md` + `skills/insert-objective/SKILL.md`

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/decimal-survey.cjs` — Survey walker with injectable fs (4-entry locked exports)
- `plugins/devflow/devflow/bin/lib/decimal-survey.test.cjs` — 11 tests (SU1-6, CLI1-3, EX1-2)
- `plugins/devflow/devflow/bin/lib/templates.cjs` — cmdTemplateSelect canonicalized (heuristic removed)
- `plugins/devflow/devflow/bin/lib/templates.test.cjs` — New: TS1-4, EX1 (5 tests)
- `plugins/devflow/devflow/bin/lib/objective.cjs` — Decimal commands deprecated (~80 LOC removed)
- `plugins/devflow/devflow/bin/lib/skill-route.cjs` — insert removed from SKILL_ROUTES, DEPRECATION_MAP updated
- `plugins/devflow/devflow/bin/lib/skill-route.test.cjs` — Tests updated to reflect [add,remove]
- `plugins/devflow/devflow/bin/df-tools.cjs` — survey case arm wired
- `plugins/devflow/devflow/bin/df-tools.test.cjs` — next-decimal/insert test blocks replaced
- `plugins/devflow/skills/objective/SKILL.md` — insert removed from argument-hint + process
- `plugins/devflow/skills/insert-objective/SKILL.md` — redirect updated (no longer forwards to deprecated cmd)
- `.planning/objectives/12-skill-consolidation/12-RESEARCH.md` — I2 disposition populated
- `DELETED: templates/summary-minimal.md, summary-standard.md, summary-complex.md`

## I2 Disposition

- **Survey ran:** 2026-05-04 against `/Users/markemerson/Source`
- **Projects scanned:** 16
- **Total objectives:** 120
- **Decimal objectives:** 0 (0%)
- **Threshold:** 5.0%
- **Recommendation:** `drop`
- **Action taken:** Task 3 executed — decimal handling removed from `objective.cjs`, `insert` removed from SKILL_ROUTES, deprecation stubs return exit 1 with error JSON

## I4 Confirmation

- 3 template files deleted: `summary-minimal.md` (41 lines), `summary-standard.md` (48 lines), `summary-complex.md` (59 lines) = 148 lines total
- `cmdTemplateSelect` returns `templates/summary.md` unconditionally (with `canonicalized_by: 'TRD 12-06'`)
- No production code references to deleted templates

## Deviations from Plan

### Auto-fixed Issues

None — TRD executed exactly as written.

### Conditional Task Executed (Task 3)

Per survey result `recommendation: drop`, Task 3 was executed (not a no-op).

Additional scope beyond TRD task 3 description:
- [Rule 3 - Blocking] `skill-route.test.cjs` updated to match new SKILL_ROUTES (test failures would have blocked npm test)
- [Rule 3 - Blocking] `skills/insert-objective/SKILL.md` redirect updated (old redirect forwarded to now-broken `objective insert`)
- Both fixes applied inline to keep test suite green.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Survey CLI + disposition | `node --test lib/decimal-survey.test.cjs` | 0 | PASS |
| 1: Live survey | `node df-tools.cjs survey decimal-objectives --root /Users/markemerson/Source --raw` | 0 | PASS |
| 2: Templates canonicalized | `node --test lib/templates.test.cjs` | 0 | PASS |
| 2: No broken references | `grep -rn 'summary-minimal\|summary-standard\|summary-complex' plugins/` | 0 matches | PASS |
| 3: Deprecation returns exit 1 | `node df-tools.cjs objective insert 5 test` | 1 | PASS |
| 3: decimal code removed | `grep -q 'decimalPattern' objective.cjs` | 1 (not found) | PASS |
| All | `npm test` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1420/1444 pass, 24 skipped) |

## Post-TRD Verification

- Auto-fix cycles used: 1 (skill-route tests + insert-objective redirect — Rule 3)
- Must-haves verified: 5/5
- Gate failures: None
