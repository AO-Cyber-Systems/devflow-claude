---
objective: 12-skill-consolidation
job: 02
subsystem: skills
tags: [skill-route, subcommand-dispatch, deprecation, milestone, df-tools, cli, tdd]

requires:
  - objective: [12-01]
    provides: "skill-route.cjs foundation with routeSkill, SKILL_ROUTES, DEPRECATION_MAP, 8-entry locked exports"
provides:
  - "SKILL_ROUTES.milestone: 4-subcommand dispatch (new|audit|complete|gaps) with correct workflow mappings"
  - "DEPRECATION_MAP: 4 new entries for milestone sibling skills"
  - "Consolidated /devflow:milestone skill with subcommand routing via df-tools skill-route"
  - "4 deprecation redirect SKILL.md files (new/audit/complete-milestone, plan-milestone-gaps)"
affects:
  - "12-03 (todo-and-status-skills) — extends SKILL_ROUTES with todo/status entries"
  - "12-04 (workstreams-extension) — extends SKILL_ROUTES with workstreams entry"
  - "v1.2 obj 6 (Phase A classify-session) — --list JSON now includes milestone in skills array"

tech-stack:
  added: []
  patterns:
    - "SKILL_ROUTES extension: add entry with subcommands[] + workflow_for() lookup table"
    - "DEPRECATION_MAP extension: Object.assign pattern (inline in TRD 12-02 uses direct mutation)"
    - "Consolidated SKILL.md: df-tools skill-route dispatch + residual args forwarding"
    - "Atomic SKILL swap: 5 files (consolidated + 4 redirects) in single commit"
    - "gaps subcommand maps to plan-milestone-gaps.md (not gaps-milestone.md)"

key-files:
  created:
    - plugins/devflow/skills/milestone/SKILL.md
  modified:
    - plugins/devflow/devflow/bin/lib/skill-route.cjs (SKILL_ROUTES.milestone + 4 DEPRECATION_MAP entries)
    - plugins/devflow/devflow/bin/lib/skill-route.test.cjs (Groups M/MD/ML/EX3 + SR4 update)
    - plugins/devflow/skills/new-milestone/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/audit-milestone/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/complete-milestone/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/plan-milestone-gaps/SKILL.md (deprecation redirect)

key-decisions:
  - "gaps subcommand maps to plan-milestone-gaps.md — the user-facing alias is cleaner but the workflow filename is plan-milestone-gaps"
  - "allowed-tools superset rule: milestone SKILL.md carries union of all 4 siblings [Read,Write,Bash,Task,AskUserQuestion,Glob,Grep]"
  - "SR4 test updated from 12-01 assertion to 12-02 assertion (objective+milestone keys); this is expected evolution, not a breakage"
  - "DEPRECATION_MAP extended inline (not Object.assign) to keep diffs readable and consistent with existing SKILL_ROUTES mutation style"

requirements-completed:
  - PHASE-G1
  - PHASE-G2

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-05-04
---

# Objective 12 TRD 02: Milestone Skill Summary

**SKILL_ROUTES.milestone with 4-subcommand dispatch (new|audit|complete|gaps), DEPRECATION_MAP extended with 4 milestone entries, consolidated /devflow:milestone skill + 4 deprecation redirects committed atomically**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-04
- **Completed:** 2026-05-04
- **Tasks:** 2 (Task 1: TDD SKILL_ROUTES+DEPRECATION_MAP, Task 2: atomic SKILL swap)
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- `SKILL_ROUTES.milestone` added: subcommands `['new','audit','complete','gaps']`, workflow_for lookup table with `gaps → plan-milestone-gaps.md` mapping
- `DEPRECATION_MAP` extended: 4 new entries for `new-milestone`, `audit-milestone`, `complete-milestone`, `plan-milestone-gaps`
- Consolidated `/devflow:milestone` skill with 4-subcommand dispatch via `df-tools skill-route`; allowed-tools superset `[Read,Write,Bash,Task,AskUserQuestion,Glob,Grep]`
- 4 deprecation redirect SKILL.md files; all 5 files in single atomic commit
- 14 new tests (Groups M1-M7, MD1-MD4, ML1-ML2, EX3); full suite 1434/1458 passing (up from 1420)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: TDD SKILL_ROUTES (RED) | `cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs` | 1 | FAIL (correct RED — 13 tests fail) |
| 1: TDD SKILL_ROUTES (GREEN) | `cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs` | 0 | PASS (42/42) |
| 2: Atomic SKILL swap — file count | `git diff --name-only HEAD~1 HEAD \| grep -c 'plugins/devflow/skills/.*milestone.*SKILL\.md'` | 0 | PASS (5 files) |
| 2: Atomic SKILL swap — dispatch | `node df-tools.cjs skill-route milestone gaps` | 0 | PASS (plan-milestone-gaps.md) |
| Final: validation gate | `npm test` | 0 | PASS (1434/1458, 0 fail) |

## Task Commits

1. **Task 1 RED: milestone routing tests** — `b38fb4f` (test)
2. **Task 1 GREEN: extend SKILL_ROUTES + DEPRECATION_MAP** — `bbd2923` (feat)
3. **Task 2: atomic SKILL swap (5 files)** — `d38ee7f` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1434/1458, 0 fail) |

## TDD Evidence

Task 1 — SKILL_ROUTES.milestone + DEPRECATION_MAP:

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs` | 1 | FAIL (correct — 13 new tests fail: M1-M7, MD1-MD4, ML1-ML2) |
| GREEN | `cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs` | 0 | PASS (42/42 tests) |

## Sample df-tools Output

`df-tools skill-route milestone gaps` (proves `gaps` → `plan-milestone-gaps.md` mapping):

```json
{
  "skill": "milestone",
  "subcommand": "gaps",
  "args": [],
  "workflow": "~/.claude/devflow/workflows/plan-milestone-gaps.md"
}
```

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6
- **Gate failures:** None

## Deviations from Plan

None — TRD executed exactly as written.

SR4 test in skill-route.test.cjs was intentionally updated from the 12-01 assertion (`['objective']` only) to the 12-02 assertion (`['objective','milestone']`). This was anticipated in the TRD and is expected plan evolution, not a deviation.

## Self-Check: PASSED

Files verified:
- FOUND: plugins/devflow/devflow/bin/lib/skill-route.cjs
- FOUND: plugins/devflow/devflow/bin/lib/skill-route.test.cjs
- FOUND: plugins/devflow/skills/milestone/SKILL.md
- FOUND: plugins/devflow/skills/new-milestone/SKILL.md
- FOUND: plugins/devflow/skills/audit-milestone/SKILL.md
- FOUND: plugins/devflow/skills/complete-milestone/SKILL.md
- FOUND: plugins/devflow/skills/plan-milestone-gaps/SKILL.md

Commits verified:
- FOUND: b38fb4f (test RED)
- FOUND: bbd2923 (feat GREEN)
- FOUND: d38ee7f (feat SKILL swap)

---
*Objective: 12-skill-consolidation*
*Completed: 2026-05-04*
