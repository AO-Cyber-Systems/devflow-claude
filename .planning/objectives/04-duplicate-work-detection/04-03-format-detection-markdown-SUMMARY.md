---
objective: 04-duplicate-work-detection
job: "04-03"
subsystem: dup-detect
tags: [markdown, renderer, pure-function, tdd, formatter]

# Dependency graph
requires:
  - objective: 04-duplicate-work-detection TRD 04-01
    provides: detectDuplicates result shape (blocking, matches, advisory, warnings, mode, timestamp)
  - objective: 04-duplicate-work-detection TRD 04-02
    provides: applyResolution dispatcher and Coordination Note writer
provides:
  - formatDetectionMarkdown(detection, { purpose }) pure markdown renderer in lib/dup-detect.cjs
  - Human-readable AskUserQuestion display output (purpose=askuser) with 4-option resolution section
  - Coordination Note body text (purpose=context) without resolution section
affects: [04-04-plan-skill-integration, 04-05-execute-skill-integration, 04-06-library-export-and-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure renderer pattern: sub-renderers per section (_renderMatchEntry, _renderAdvisoryEntry, _renderWarnings, _renderResolutionOptions) composed by top-level function"
    - "_sanitize helper: backtick→single-quote escape + newline→space for all user-facing string fields"
    - "Section ordering lock: title → matches → advisory (plan-only) → warnings → resolution options (askuser only)"
    - "opts defaults pattern: unknown purpose falls back to more-verbose askuser variant"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/dup-detect.cjs
    - plugins/devflow/devflow/bin/lib/dup-detect.test.cjs

key-decisions:
  - "formatDetectionMarkdown is pure (no fs/network/process side effects) — all inputs come via the detection parameter; deterministic for fixed input"
  - "Empty detection (no matches, no advisory, no warnings) short-circuits to single placeholder line without rendering any sections"
  - "purpose='askuser' includes 4-option Resolution options section; purpose='context' omits it — Coordination Note body doesn't need options already chosen"
  - "Execute-mode uses 'Recheck' title and never renders advisory section (advisory already filtered upstream by detectDuplicates)"
  - "Warnings rendered as '> **Note:** <text>' blockquotes after matches/advisory but before resolution options"
  - "Unknown opts.purpose falls back to 'askuser' (more verbose; safer default)"

patterns-established:
  - "Sub-renderer per output section: mirrors org-awareness.cjs formatConsiderations pattern"
  - "_sanitize applied to all string fields before interpolation: prevents markdown breakage from backticks or embedded newlines in user data"

requirements-completed: [SC-5, SC-6]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 3min
completed: 2026-05-04
---

# Objective 04 TRD 03: formatDetectionMarkdown — pure renderer Summary

**Pure markdown renderer for detectDuplicates output: purpose=askuser variant adds 4-option resolution section for AskUserQuestion display; purpose=context omits it for Coordination Note embedding**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-04T08:12:23Z
- **Completed:** 2026-05-04T08:15:43Z
- **Tasks:** 2 (RED phase + GREEN phase)
- **Files modified:** 2

## Accomplishments

- Added `formatDetectionMarkdown(detection, opts)` pure renderer to `lib/dup-detect.cjs` (TRD 04-03 region)
- Implemented 4 internal sub-renderers: `_renderMatchEntry`, `_renderAdvisoryEntry`, `_renderWarnings`, `_renderResolutionOptions`
- Added `_sanitize` and `_formatScore` helpers — all string interpolation sanitized (backtick escape, newline collapse, NaN → N/A)
- All 14 Group FD tests (FD1-FD14) pass; 0 regressions in prior 944 tests (958 total passing)
- Module now exports 19 symbols (14 from 04-01 + 4 from 04-02 + 1 from 04-03)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — failing tests | `npm test 2>&1 \| grep -E 'FD\d+' \| head -20` (all 14 fail) | 1 | FAIL (correct RED) |
| 2: GREEN — implement formatDetectionMarkdown | `npm test 2>&1 \| grep -E 'FD\d+' \| head -20` (all 14 pass) | 0 | PASS |

## Task Commits

1. **Task 1: RED phase (failing tests)** — `ad7ec68` (test(04-03): add failing tests for formatDetectionMarkdown)
2. **Task 2: GREEN phase (implementation)** — `07b3a09` (feat(04-03): implement formatDetectionMarkdown pure renderer)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| export check | `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/dup-detect.cjs"); if(typeof a.formatDetectionMarkdown!=="function") throw new Error("not exported"); console.log("OK");'` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test 2>&1 \| grep -E 'FD\d+'` (14 failing FD lines) | non-zero | FAIL (correct) |
| GREEN | `npm test 2>&1 \| grep -E 'FD\d+'` (14 passing FD lines) | 0 | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 7/7 (pure, no side effects; empty placeholder; warning blockquotes; mode-specific title/advisory; purpose variants; bounded output; deterministic)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/dup-detect.cjs` — Extended with TRD 04-03 region: `formatDetectionMarkdown` + 4 sub-renderers (`_renderMatchEntry`, `_renderAdvisoryEntry`, `_renderWarnings`, `_renderResolutionOptions`) + 2 helpers (`_sanitize`, `_formatScore`); `module.exports` extended with `formatDetectionMarkdown`
- `plugins/devflow/devflow/bin/lib/dup-detect.test.cjs` — Extended with Group FD (FD1-FD14): 14 test cases covering all formatter behaviors

## Decisions Made

- Used `opts = {}` default for `opts` param (no default destructuring) to keep the purpose-guard explicit: `(opts && (opts.purpose === 'context' || opts.purpose === 'askuser')) ? opts.purpose : 'askuser'` — handles null/undefined opts and unknown purpose strings in a single expression
- Section join uses `sections.join('\n\n')` for single blank-line separation between markdown sections (matches org-awareness.cjs formatConsiderations pattern)
- Score rendered as `Math.round(score)` rather than `.toFixed(2)` — integers are cleaner for narrow-terminal readability per gotcha constraint

## Deviations from Plan

None — TRD executed exactly as written. The implementation from the TRD's embedded code blocks was used verbatim; the only minor variation was using `opts` without a default destructuring (per the `<gotchas>` guidance: "opts is optional — default to { purpose: 'askuser' }") which is semantically equivalent.

## Issues Encountered

None.

## Next Objective Readiness

- `formatDetectionMarkdown` is ready for consumption by TRD 04-04 (plan-objective skill integration) and TRD 04-05 (execute-objective skill integration)
- TRD 04-06 (library export lock) will add the final `Object.keys().sort()` deepStrictEqual integration test asserting all 19+ exports present

## Self-Check

- `plugins/devflow/devflow/bin/lib/dup-detect.cjs` — confirmed modified (114 lines added)
- `plugins/devflow/devflow/bin/lib/dup-detect.test.cjs` — confirmed modified (156 lines added)
- Commit `ad7ec68` (RED) — confirmed present
- Commit `07b3a09` (GREEN) — confirmed present
- Export count 19 — confirmed via node -e

## Self-Check: PASSED

---
*Objective: 04-duplicate-work-detection*
*Completed: 2026-05-04*
