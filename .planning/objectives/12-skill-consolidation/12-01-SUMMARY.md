---
objective: 12-skill-consolidation
job: 01
subsystem: skills
tags: [skill-route, subcommand-dispatch, deprecation, df-tools, cli]

requires:
  - objective: []
    provides: "Foundation TRD — no upstream dependencies"
provides:
  - "lib/skill-route.cjs with routeSkill pure fn, SKILL_ROUTES, DEPRECATION_MAP, 8-entry locked export surface"
  - "df-tools skill-route CLI subcommand (JSON dispatch contract for Phase A / v1.2 obj 6)"
  - "df-tools deprecation log CLI subcommand (JSONL append audit trail)"
  - "Consolidated /devflow:objective skill with subcommand dispatch (add|insert|remove)"
  - "3 deprecation redirect SKILL.md files (add-objective, insert-objective, remove-objective)"
affects:
  - "12-02 (milestone-skill) — mirrors same TDD+fixture+CLI pattern"
  - "12-03 (todo-and-status-skills) — extends SKILL_ROUTES with todo/status entries"
  - "12-04 (workstreams-extension) — extends SKILL_ROUTES with workstreams entry"
  - "v1.2 obj 6 (Phase A classify-session) — consumes df-tools skill-route --list JSON contract"

tech-stack:
  added: []
  patterns:
    - "routeSkill pure fn pattern: (skill, args) → {skill, subcommand, args, workflow} | error"
    - "_setRunFs/_resetMocks injection for fs-touching functions (deprecation logger)"
    - "SKILL_ROUTES structure: { [skill]: { subcommands[], workflow_for(sub) } }"
    - "DEPRECATION_MAP: { [old_name]: new_consolidated_form }"
    - "Export-lock banner comment (LOCKED by TRD XX-YY, 8-entry)"
    - "Deprecation SKILL.md: DEPRECATED frontmatter description + df-tools deprecation log + SlashCommand forward"
    - "Consolidated SKILL.md: df-tools skill-route dispatch + residual args forwarding"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/skill-route.cjs
    - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/skill-route-fixtures.cjs
    - plugins/devflow/skills/objective/SKILL.md
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs (case 'skill-route' + case 'deprecation')
    - plugins/devflow/skills/add-objective/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/insert-objective/SKILL.md (deprecation redirect)
    - plugins/devflow/skills/remove-objective/SKILL.md (deprecation redirect)
    - .gitignore (.planning/.deprecation-log.jsonl added)

key-decisions:
  - "routeSkill is PURE — no fs, no process.exit, no console. Returns object. CLI wrappers handle side effects."
  - "workflow paths use literal ~/.claude/devflow/workflows/<name>.md — not $HOME expansion (matches @path reference convention)"
  - "Argument validation (RE4/RE5 null checks) runs BEFORE skill lookup to avoid spurious 'unknown skill' errors"
  - "Export-lock banner at 8 entries; future TRDs adding entries must update EX1 test atomically"
  - "Deprecation JSONL is append-only via appendFileSync; gitignored; not planning state"
  - "All 4 SKILL files (consolidated + 3 redirects) committed in single atomic commit to prevent routing gaps"

patterns-established:
  - "routeSkill pure fn: canonical pattern for 12-02/03/04 to mirror"
  - "skill-route-fixtures.cjs: buildSkillRouteCall, buildSkillRouteResponse, buildDeprecationLogEntry factory builders"
  - "Export-lock: 8-entry module.exports with LOCKED banner — prevents accidental surface expansion"
  - "Atomic SKILL swap: consolidated + redirects in same commit — prevents ambient mode gaps"

requirements-completed:
  - PHASE-G1
  - PHASE-G2
  - PHASE-A-HANDOFF

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-05-06
---

# Objective 12 TRD 01: Skill-Route and Objective Skill Summary

**skill-route.cjs dispatch foundation: routeSkill pure fn + SKILL_ROUTES + DEPRECATION_MAP with 8-entry locked exports, df-tools CLI wired, consolidated /devflow:objective skill + 3 deprecation redirects committed atomically**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-06T01:50:10Z
- **Completed:** 2026-05-06T02:00:00Z
- **Tasks:** 3 (Task 1: TDD core, Task 2: TDD deprecation+CLI, Task 3: atomic SKILL swap)
- **Files modified:** 9

## Accomplishments

- `lib/skill-route.cjs` with `routeSkill` pure fn, `SKILL_ROUTES` (objective only), `DEPRECATION_MAP` (3 entries), `_setRunFs`/`_resetMocks` injection hooks, 8-entry locked export surface
- `df-tools skill-route` and `df-tools deprecation log` CLI subcommands wired; JSON contracts locked for Phase A consumption
- Consolidated `/devflow:objective` skill with subcommand dispatch via df-tools skill-route; 3 deprecation redirect SKILL.md files emitting warnings and forwarding; all 4 files committed atomically
- 28 new tests (Groups R/RE/SR/F/D/C/EX); full suite 1428 passing, 0 failing (up from 1359)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: TDD skill-route core | `node --test lib/skill-route.test.cjs` (RED phase) | 1 | FAIL (correct RED) |
| 1: TDD skill-route core | `node --test lib/skill-route.test.cjs` (GREEN phase) | 0 | PASS |
| 2: TDD deprecation+CLI | `node --test lib/skill-route.test.cjs` (all groups) | 0 | PASS |
| 2: TDD full suite | `npm test` | 0 | PASS (1428/1452, 0 fail) |
| 3: Atomic SKILL swap | `git diff --name-only HEAD~1 HEAD \| grep -c 'objective.*SKILL'` | 0 | PASS (4 files) |

## Task Commits

1. **Task 1 RED: skill-route tests + fixtures** — `62a19a2` (test)
2. **Task 1+2 GREEN: skill-route.cjs + df-tools wiring** — `b3f37ea` (feat)
3. **Task 3: atomic SKILL swap** — `1fff3db` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1428/1452, 0 fail) |

## TDD Evidence

Task 1 — skill-route core:

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs` | 1 | FAIL (correct — MODULE_NOT_FOUND) |
| GREEN | `cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs` | 0 | PASS (28/28 tests) |

Task 2 — deprecation logger + CLI integration: extended the same test file in GREEN commit alongside implementation. No separate RED commit needed as all new tests were added to the single test file created in Task 1 RED.

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (Rule 3 — `argv` reference in df-tools.cjs case arms should have been `args`; fixed inline during GREEN)
- **Must-haves verified:** 6/6
- **Gate failures:** None

## Phase A Handoff Data

Output of `df-tools skill-route --list` (consumed by v1.2 obj 6 `classify-session.js`):

```json
{
  "skills": [
    {
      "name": "objective",
      "subcommands": ["add", "insert", "remove"]
    }
  ],
  "deprecated": {
    "add-objective": "objective add",
    "insert-objective": "objective insert",
    "remove-objective": "objective remove"
  }
}
```

## Locked Exports (8-entry surface)

```javascript
module.exports = {
  routeSkill,          // pure dispatch fn
  cmdSkillRoute,       // CLI handler: df-tools skill-route <skill> [sub] [args]
  cmdSkillRouteList,   // CLI handler: df-tools skill-route --list
  cmdDeprecationLog,   // CLI handler: df-tools deprecation log <old-name>
  SKILL_ROUTES,        // { objective: { subcommands, workflow_for } }
  DEPRECATION_MAP,     // { 'add-objective': 'objective add', ... }
  _setRunFs,           // test injection
  _resetMocks,         // test teardown
};
```

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/skill-route.cjs` — core module (225 lines)
- `plugins/devflow/devflow/bin/lib/skill-route.test.cjs` — TDD test suite (377 lines, 28 tests)
- `plugins/devflow/devflow/bin/lib/__fixtures__/skill-route-fixtures.cjs` — factory builders (113 lines)
- `plugins/devflow/skills/objective/SKILL.md` — consolidated skill (new)
- `plugins/devflow/devflow/bin/df-tools.cjs` — added case 'skill-route' + case 'deprecation'
- `plugins/devflow/skills/add-objective/SKILL.md` — deprecation redirect
- `plugins/devflow/skills/insert-objective/SKILL.md` — deprecation redirect
- `plugins/devflow/skills/remove-objective/SKILL.md` — deprecation redirect
- `.gitignore` — .planning/.deprecation-log.jsonl added

## Decisions Made

- `routeSkill` is PURE — no fs, no process.exit, no console output; returns object. CLI wrappers handle side effects.
- workflow paths use literal `~/.claude/devflow/workflows/` paths (not $HOME) to match @path reference convention in skills
- Argument validation (null skill / null args) runs BEFORE skill lookup so RE4/RE5 don't emit spurious 'unknown skill'
- 8-entry export lock with banner comment; EX1 test enforces atomically

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `argv` should be `args` in df-tools.cjs case arms**

- **Found during:** Task 2 (CLI integration test C1 failure)
- **Issue:** Added case arms referenced `argv` variable but df-tools.cjs uses `args` (from `process.argv.slice(2)`). A pre-existing `survey` case also used `argv` but was not in scope to fix.
- **Fix:** Changed `argv.slice(1)` → `args.slice(1)`, `argv[1]` → `args[1]`, `argv.includes` → `args.includes`, `argv[2]` → `args[2]` in the two new case arms. Pre-existing `survey` case `argv` usage left untouched (out-of-scope pre-existing issue).
- **Files modified:** `plugins/devflow/devflow/bin/df-tools.cjs`
- **Verification:** C1/C3/C4 CLI integration tests passed after fix
- **Committed in:** `b3f37ea` (GREEN feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking variable name error)
**Impact on plan:** Necessary for CLI integration. No scope creep.

## Issues Encountered

- Pre-existing `survey` case in df-tools.cjs also uses `argv` (should be `args`). Deferred per scope boundary rule — not caused by this TRD's changes.

## Self-Check: PASSED

Files verified:
- FOUND: plugins/devflow/devflow/bin/lib/skill-route.cjs
- FOUND: plugins/devflow/devflow/bin/lib/skill-route.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/skill-route-fixtures.cjs
- FOUND: plugins/devflow/skills/objective/SKILL.md

Commits verified:
- FOUND: 62a19a2 (test RED)
- FOUND: b3f37ea (feat GREEN)
- FOUND: 1fff3db (feat SKILL swap)

## Next Objective Readiness

- `lib/skill-route.cjs` pattern ready for 12-02 (milestone) and 12-03 (todo/status) to mirror
- `SKILL_ROUTES` accepts additional entries — 12-02/03/04 extend it with milestone/todo/status/workstreams
- `DEPRECATION_MAP` accepts additional entries — 12-02/03/04 add their old skill names
- `df-tools skill-route --list` JSON contract locked and stable for Phase A (v1.2 obj 6)

---
*Objective: 12-skill-consolidation*
*Completed: 2026-05-06*
