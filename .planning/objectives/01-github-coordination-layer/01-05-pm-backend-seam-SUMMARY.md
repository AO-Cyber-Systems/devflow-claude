---
objective: 01-github-coordination-layer
job: "05"
subsystem: github-integration
tags: [pm-backend, dispatch-seam, abstraction, scaffold, structural]

requires:
  - objective: 01-github-coordination-layer
    provides: Full lib/gh.cjs surface (resolveChain, syncObjective, requireGhAuth, etc.) — TRDs 01-02 through 01-04

provides:
  - "lib/pm-backend.cjs: getBackend(projectConfig) dispatch seam — returns lib/gh.cjs when pm.backend='github' or unset"
  - "VALID_BACKENDS=['github'] constant — extends to ['github','linear','jira'] in v1.2+"
  - "Throws with v1.2+ guidance for linear/jira; throws with backend name for unknown values"
  - "7-test suite in pm-backend.test.cjs covering all three dispatch paths"

affects:
  - 01-06 (dogfood/integration — can optionally call getBackend for round-trip test)

tech-stack:
  added: []
  patterns:
    - "PM backend dispatch via switch on projectConfig?.pm?.backend with optional-chaining default"
    - "Scaffold-only seam: default: arm throws (not stubs) so unknown backends fail loud"
    - "VALID_BACKENDS array constant mirrors VALID_KINDS pattern from intent.cjs"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/pm-backend.cjs
    - plugins/devflow/devflow/bin/lib/pm-backend.test.cjs
  modified: []

key-decisions:
  - "Return require('./gh.cjs') directly (not a facade wrapper) — simplest correct approach; v1.2 can narrow surface when Linear ships"
  - "linear and jira get explicit case arms (not default:) so their error message can include v1.2+ guidance; truly unknown backends fall through to the generic Unknown error"
  - "df-tools.cjs call sites left unchanged per CONTEXT.md §6 — seam created but not wired in v1.1; v1.2 wires it"
  - "Optional chaining (projectConfig?.pm?.backend) avoids null/undefined shape validation — getBackend(null) and getBackend({}) both default to 'github'"

patterns-established:
  - "Scaffold seam: create the abstraction boundary first, wire call sites in next-milestone TRD"
  - "Named-backend error with upgrade path: throw with 'v1.2+ work' in message so users see the roadmap"

requirements-completed: [SC-6]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: ~5min
completed: 2026-05-04
---

# Objective 01 TRD 05: PM-backend seam Summary

**Thin getBackend(projectConfig) dispatch seam scaffolded in lib/pm-backend.cjs — single-impl (github via lib/gh.cjs), throws with v1.2+ guidance for linear/jira, leaves call sites unchanged per CONTEXT.md §6**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-05-04
- **Tasks:** 1 (single atomic commit — standard type, scaffold)
- **Files modified:** 2 created

## Accomplishments

- `lib/pm-backend.cjs` created: `getBackend(projectConfig)` returns `lib/gh.cjs` module on github/unset; throws with v1.2+ guidance for linear/jira; throws with backend name for truly unknown values
- `VALID_BACKENDS = ['github']` constant exported — mirrors `VALID_KINDS` pattern from `intent.cjs`
- 7 tests in `pm-backend.test.cjs`: null config, empty config, explicit github, linear throw, jira throw, unknown throw, VALID_BACKENDS shape
- 541/541 total tests pass (534 pre-existing + 7 new); df-tools.cjs unchanged

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Create pm-backend.cjs + tests | `npm test` | 0 | PASS (541/541) |
| Exports check | `node -e 'const pm=require(...); const b=pm.getBackend({}); if(typeof b.resolveChain!=="function") throw new Error(...); console.log("OK");'` | 0 | PASS |
| Unknown backend throws | `node -e 'const pm=require(...); try { pm.getBackend({pm:{backend:"linear"}}); throw new Error("should have thrown"); } catch(e) { if(!e.message.includes("linear")) throw; console.log("OK"); }'` | 0 | PASS |
| v1.2 in error message | `node -e '...' 2>&1 \| grep -q 'v1.2'` | 0 | PASS |
| df-tools.cjs unchanged | `git diff plugins/devflow/devflow/bin/df-tools.cjs` | — | Empty (no changes) |
| git log | `git log --oneline feature/v1.1 -- plugins/.../pm-backend.cjs \| head -1` | 0 | Shows 7616e6a |

## Task Commits

1. **Task 1: Create pm-backend.cjs dispatch seam + pm-backend.test.cjs** — `7616e6a` (feat(01-05))

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (541/541) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all TRD truths met)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/pm-backend.cjs` — Dispatch seam: `getBackend(projectConfig)` + `VALID_BACKENDS`; ~50 lines with JSDoc documenting v1.2+ config field
- `plugins/devflow/devflow/bin/lib/pm-backend.test.cjs` — 7 tests covering all dispatch paths

## Decisions Made

- **Return require('./gh.cjs') directly** — no facade wrapper in v1.1. Simplest correct approach; v1.2 can introduce a narrowed surface when Linear ships if needed.
- **Explicit case arms for linear and jira** — gives those backends a better error message ("v1.2+ work") vs the generic "Unknown pm.backend" from the default arm. Truly unknown values (e.g., 'gitlab') still name the backend in the error.
- **df-tools.cjs call sites left unchanged** — CONTEXT.md §6 is explicit: seam exists, wiring is v1.2+ work. Verified with `git diff`.
- **Optional chaining style** — `(projectConfig && projectConfig.pm && projectConfig.pm.backend)` (explicit form for CJS compat) rather than `projectConfig?.pm?.backend` to avoid any edge case with older Node versions in CI.

## Deviations from Plan

None — TRD executed exactly as written.

## Issues Encountered

None.

## Next Objective Readiness

- TRD 01-06 (dogfood + integration): full lib/gh.cjs surface stable, pm-backend.cjs seam available. Frontmatter backfill + integration test can proceed immediately.
- SC-6 fully addressed: module structure leaves room for sibling backends without rewriting call sites

---
*Objective: 01-github-coordination-layer*
*Completed: 2026-05-04*
