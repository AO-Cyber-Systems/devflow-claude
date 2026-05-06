---
objective: 12-skill-consolidation
job: 03
subsystem: skills
tags: [skill-route, subcommand-dispatch, deprecation, df-tools, tdd, flag-normalization, default-subcommand]

requires:
  - objective: ["12-01"]
    provides: "lib/skill-route.cjs dispatch foundation (routeSkill, SKILL_ROUTES, DEPRECATION_MAP)"
provides:
  - "SKILL_ROUTES.todo: [add, list] → add-todo.md | check-todos.md"
  - "SKILL_ROUTES.status: [null, check, pause, resume] with default-subcommand + flag normalization"
  - "_normalizeStatusSubcommand private helper (--check → check, --pause → pause, --resume → resume)"
  - "6 DEPRECATION_MAP entries: add-todo, check-todos, pause-work, resume-work, progress, health"
  - "Consolidated /devflow:todo skill (2-subcommand dispatch)"
  - "Consolidated /devflow:status skill (default + 3-subcommand dispatch, flag-style)"
  - "6 deprecation redirect SKILL.md files"
affects:
  - "12-04 (workstreams-extension) — extends SKILL_ROUTES with workstreams entry"
  - "v1.2 obj 6 (Phase A classify-session) — df-tools skill-route --list now includes todo + status"

tech-stack:
  added: []
  patterns:
    - "Default-subcommand pattern: null in subcommands[] enables no-arg routing (progress.md)"
    - "Flag normalization: _normalizeStatusSubcommand strips '--' prefix before dispatch"
    - "Atomic SKILL swap: consolidated + redirects committed together (3+5 files)"
    - "Test SR4 evolution: update SKILL_ROUTES structure test as each TRD adds keys"
    - "E2E test evolution: update SKILL.md content assertions when skills become deprecation redirects"

key-files:
  created:
    - plugins/devflow/skills/todo/SKILL.md
    - plugins/devflow/skills/status/SKILL.md
  modified:
    - plugins/devflow/devflow/bin/lib/skill-route.cjs (added _normalizeStatusSubcommand, SKILL_ROUTES.todo, SKILL_ROUTES.status, 6 DEPRECATION_MAP entries, updated routeSkill for default-subcommand + flag normalization)
    - plugins/devflow/devflow/bin/lib/skill-route.test.cjs (added 28 tests: T/TD/S/SD/SN/LL/EX4 groups; updated SR4)
    - plugins/devflow/skills/add-todo/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/check-todos/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/pause-work/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/resume-work/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/progress/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/health/SKILL.md (deprecation redirect)
    - plugins/devflow/devflow/bin/lib/check-todos.test.cjs (E2E3 updated for deprecation redirect)

key-decisions:
  - "Default subcommand via null in subcommands[]: status with no arg → null → progress.md (not error)"
  - "_normalizeStatusSubcommand is PRIVATE — not exported; export-lock stays at 8 entries (EX4 test enforces)"
  - "resume maps to resume-project.md (not resume-work.md) — different workflow filename from skill name"
  - "SR4 test updated to include todo+status in SKILL_ROUTES key assertion"
  - "E2E3 in check-todos.test.cjs updated to match deprecation-redirect content (df-tools check-todos no longer called directly)"
  - "Both atomic commits include check-todos.test.cjs fix bundled with status swap for clean test pass"

requirements-completed:
  - PHASE-G1
  - PHASE-G2

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-05-06
---

# Objective 12 TRD 03: Todo and Status Skills Summary

**todo + status consolidated skills via SKILL_ROUTES extension: default-subcommand (null→progress.md) + --flag normalization (--check≡check), 6 DEPRECATION_MAP entries, 8 SKILL.md files swapped atomically in 2 commits**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-06T02:14:23Z
- **Completed:** 2026-05-06T02:21:19Z
- **Tasks:** 3 (Task 1: TDD core, Task 2: atomic SKILL swap A, Task 3: atomic SKILL swap B)
- **Files modified:** 11

## Accomplishments

- Extended `lib/skill-route.cjs` with `_normalizeStatusSubcommand` private helper, `SKILL_ROUTES.todo` (add|list), `SKILL_ROUTES.status` (null|check|pause|resume), and 6 new `DEPRECATION_MAP` entries
- `routeSkill` extended with status-specific flag normalization (`--check` → `check`) and default-subcommand support (`null` in subcommands array)
- Consolidated `/devflow:todo` skill dispatching to `add-todo.md` or `check-todos.md` via df-tools skill-route
- Consolidated `/devflow:status` skill with default (progress.md) + 3 subcommands (check/pause/resume) — both `--flag` and bare forms accepted
- 6 deprecation redirect SKILL.md files committed in 2 atomic commits (3+5 files)
- 28 new tests (Groups T/TD/S/SD/SN/LL/EX4); full suite 1462/1486 passing (up from 1434)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 TDD: skill-route extension | `node --test lib/skill-route.test.cjs` (RED phase) | 1 | FAIL (correct RED, 26 new tests failing) |
| 1 TDD: skill-route extension | `node --test lib/skill-route.test.cjs` (GREEN phase) | 0 | PASS (70/70 tests) |
| 2: atomic skill swap A (todo) | `git diff --name-only HEAD~1 HEAD` | 0 | PASS (3 todo files) |
| 3: atomic skill swap B (status) | `npm test` | 0 | PASS (1462/1486, 0 fail) |

## Task Commits

1. **Task 1 RED: failing tests for todo + status routing** — `f0a267b` (test)
2. **Task 1 GREEN: extend SKILL_ROUTES + flag normalization + DEPRECATION_MAP** — `76b916e` (feat)
3. **Task 2: atomic skill swap A (todo + 2 redirects)** — `71824be` (feat)
4. **Task 3: atomic skill swap B (status + 4 redirects + test fix)** — `1cc1eb9` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1462/1486, 0 fail, 24 skip) |

## TDD Evidence

Task 1 — skill-route todo + status extension:

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs` | 1 | FAIL (correct — 26 new tests failing, 44/70 pass) |
| GREEN | `cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs` | 0 | PASS (70/70 tests) |

Sample output proving `--check` ≡ `check` normalization:

```
=== status check ===
subcommand=check, workflow=~/.claude/devflow/workflows/health.md
=== status --check ===
subcommand=check, workflow=~/.claude/devflow/workflows/health.md
```

Sample output proving `status` (no arg) → progress.md:

```
=== status (no arg) ===
subcommand=None, workflow=~/.claude/devflow/workflows/progress.md
```

Sample output proving `resume` → `resume-project.md` (not `resume-work.md`):

```
=== status resume (must be resume-project.md, not resume-work.md) ===
subcommand=resume, workflow=~/.claude/devflow/workflows/resume-project.md
```

## Post-TRD Verification

- **Auto-fix cycles used:** 2
  1. Rule 1 — `SR4` test updated (SKILL_ROUTES now has 4 keys, not 2)
  2. Rule 1 — `check-todos.test.cjs` E2E3 updated (SKILL.md now a deprecation redirect, not direct df-tools invocation)
- **Must-haves verified:** 8/8 (all TRD truths confirmed)
- **Gate failures:** None

## Verification Checklist (from TRD)

1. `/devflow:todo add` → add-todo.md, `/devflow:todo list` → check-todos.md — PASS
2. `/devflow:status` → progress.md (null subcommand), `check`/`--check` → health.md, `pause`/`--pause` → pause-work.md, `resume`/`--resume` → resume-project.md — PASS
3. All 6 old skills contain DEPRECATED redirect — PASS (add-todo, check-todos, pause-work, resume-work, progress, health)
4. `--resume` and `resume` produce identical workflow path — PASS (both → resume-project.md)
5. `status` (no args) returns subcommand: null, workflow: progress.md — PASS
6. `--list` reflects both `todo` and `status` entries — PASS (LL1/LL2 tests)
7. EX4 export-lock test passes (8 exports unchanged) — PASS
8. Two atomic commits: 3 files (todo family) + 5 files (status family) — PASS
9. `npm test` passes — PASS (1462/1486)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Update] SR4 test updated to include todo + status in SKILL_ROUTES key assertion**

- **Found during:** Task 1 GREEN phase
- **Issue:** `SR4` asserted `SKILL_ROUTES` has only `['objective', 'milestone']` keys; after TRD 12-03 extension it has `['objective', 'milestone', 'todo', 'status']`
- **Fix:** Updated SR4 assertion to `['objective', 'milestone', 'todo', 'status']` with updated test name
- **Files modified:** `plugins/devflow/devflow/bin/lib/skill-route.test.cjs`
- **Commit:** `76b916e` (GREEN feat commit)

**2. [Rule 1 - Test Update] check-todos.test.cjs E2E3 updated for deprecation redirect pattern**

- **Found during:** Task 3 (npm test failure after check-todos/SKILL.md became a deprecation redirect)
- **Issue:** E2E3 asserted `check-todos/SKILL.md` contains `df-tools check-todos` — which was true for the old direct-invocation skill, but the new deprecation redirect calls `deprecation log check-todos` (not `df-tools check-todos`)
- **Fix:** Updated E2E3 to assert DEPRECATED notice + `deprecation log check-todos` invocation instead
- **Files modified:** `plugins/devflow/devflow/bin/lib/check-todos.test.cjs`
- **Commit:** `1cc1eb9` (status swap commit, bundled with SKILL files)

---

**Total deviations:** 2 auto-fixed (Rule 1 — test updates, not functional issues)
**Impact on plan:** Both fixes were expected consequences of this TRD's changes. No scope creep.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/skill-route.cjs` — added _normalizeStatusSubcommand, SKILL_ROUTES.todo, SKILL_ROUTES.status, 6 DEPRECATION_MAP entries, updated routeSkill
- `plugins/devflow/devflow/bin/lib/skill-route.test.cjs` — 28 new tests (T/TD/S/SD/SN/LL/EX4 groups), SR4 updated
- `plugins/devflow/skills/todo/SKILL.md` — new consolidated skill
- `plugins/devflow/skills/status/SKILL.md` — new consolidated skill
- `plugins/devflow/skills/add-todo/SKILL.md` — deprecation redirect → /devflow:todo add
- `plugins/devflow/skills/check-todos/SKILL.md` — deprecation redirect → /devflow:todo list
- `plugins/devflow/skills/pause-work/SKILL.md` — deprecation redirect → /devflow:status pause
- `plugins/devflow/skills/resume-work/SKILL.md` — deprecation redirect → /devflow:status resume
- `plugins/devflow/skills/progress/SKILL.md` — deprecation redirect → /devflow:status (default)
- `plugins/devflow/skills/health/SKILL.md` — deprecation redirect → /devflow:status check
- `plugins/devflow/devflow/bin/lib/check-todos.test.cjs` — E2E3 updated for redirect pattern

## Decisions Made

- Default-subcommand support via `null` in `subcommands[]` array: enables `status` with no arg to return progress.md workflow (not an error)
- `_normalizeStatusSubcommand` stays private: export-lock at 8 entries enforced; behavior tested indirectly via routing tests
- `resume` workflow is `resume-project.md` (not `resume-work.md`): skill name and workflow filename differ; S6 test locks this
- Both atomic commits include associated test fixes: cleaner commit history, always-green test suite

## Self-Check: PASSED

Files verified:
- FOUND: plugins/devflow/devflow/bin/lib/skill-route.cjs
- FOUND: plugins/devflow/devflow/bin/lib/skill-route.test.cjs
- FOUND: plugins/devflow/skills/todo/SKILL.md
- FOUND: plugins/devflow/skills/status/SKILL.md

Commits verified:
- FOUND: f0a267b (test RED)
- FOUND: 76b916e (feat GREEN)
- FOUND: 71824be (feat skill swap A)
- FOUND: 1cc1eb9 (feat skill swap B)

## Next Objective Readiness

- `SKILL_ROUTES` ready for 12-04 (workstreams) extension
- `DEPRECATION_MAP` now has 13 entries (3 objective + 4 milestone + 6 todo+status)
- `df-tools skill-route --list` now exposes todo + status to Phase A (v1.2 obj 6) consumer

---
*Objective: 12-skill-consolidation*
*Completed: 2026-05-06*
