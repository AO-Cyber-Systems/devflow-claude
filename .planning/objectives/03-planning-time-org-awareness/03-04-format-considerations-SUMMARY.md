---
objective: 03-planning-time-org-awareness
job: "04"
subsystem: org-awareness
tags: [markdown-renderer, formatter, org-awareness, cli]

# Dependency graph
requires:
  - objective: 03-planning-time-org-awareness/03-01
    provides: scanSiblings + _tokenize + _setRunFs injection hook
  - objective: 03-planning-time-org-awareness/03-02
    provides: scanLibs + eden-libs export scanner
  - objective: 03-planning-time-org-awareness/03-03
    provides: scanOrgOverlap + misfiling detection + graceful auth degradation
provides:
  - formatConsiderations(scans) — pure Markdown renderer for Cross-Repo Considerations section body
  - _renderSiblingsSection / _renderLibsSection / _renderOrgSection — sub-renderers
  - cmdOrgAwarenessConsiderations — CLI orchestrator: runs all 3 scanners + formats output
affects:
  - 03-05-research-skill-integration (consumes formatConsiderations via considerations CLI)
  - 03-06-plan-skill-integration (reads CONTEXT.md section written by 03-05)
  - 03-07-library-export-and-dogfood (verifies full module.exports surface)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pure formatter pattern: renderer takes pre-computed scans object, no fs/network side effects
    - Independent scanner orchestration: each scanner wrapped in try/catch so auth failure on one doesn't block others
    - Defensive slice(0, TOP_N): renderer re-enforces TOP_N cap even though scanners already truncate

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/org-awareness.cjs
    - plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
    - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs

key-decisions:
  - "formatConsiderations output is section BODY only — no leading '## Cross-Repo Considerations' header; caller wraps it"
  - "Skipped org_overlap (auth unavailable) renders placeholder and OMITS misfiling line to avoid confusing partial output"
  - "Misfiling line is always present when org scan ran (null → 'no mismatch detected.' affirmation; object → warning message)"
  - "CLI considerations command: independent try/catch around each of 3 scanners; auth failure on org path is graceful (skipped:true), not fatal"
  - "sibling_repos for chain-match boost derived from sibling matches' PROJECT.md github_repo fields (best-effort, silently skip on missing)"

patterns-established:
  - "Renderer pattern (TRD 03-04): formatConsiderations mirrors awareness-cli.cjs::renderMarkdown — sections.join('\\n\\n'), sentinel lines for empty/skipped"
  - "CLI considerations orchestration order: scanSiblings (no auth) → scanLibs (no auth) → scanOrgOverlap (auth optional) — least-auth first"

requirements-completed: [SC-7]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 4min
completed: 2026-05-05
---

# Objective 03 TRD 04: formatConsiderations markdown renderer + considerations CLI Summary

**Pure Markdown formatter for the Cross-Repo Considerations section body: 3 fixed subsections (sibling repos, eden-libs candidates, org project overlap), bounded to TOP_N=3 one-line entries each, with graceful auth-skip placeholder and advisory misfiling line**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-05T01:36:53Z
- **Completed:** 2026-05-05T01:41:02Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 3

## Accomplishments

- `formatConsiderations(scans)` pure renderer added to `lib/org-awareness.cjs` — sections joined with blank-line separator, no leading `##` header, output bounded under 2000 chars (F5 regression guard)
- `_renderSiblingsSection`, `_renderLibsSection`, `_renderOrgSection` sub-renderers cover all empty/full/skipped/misfiling cases per TRD spec
- `cmdOrgAwarenessConsiderations` in `org-awareness-cli.cjs` replaced stub: orchestrates all 3 scanners independently, emits Markdown to stdout or `--raw` JSON
- 26 new TDD tests (RS1-5, RL1-4, RO1-6, F1-7, CLI4-1-4) all pass; 839/854 total (15 GIT/GH integration-gated skips, 0 fail)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — failing tests | `npm test 2>&1 \| grep -E 'ℹ (pass\|fail)'` → 813 pass, 26 fail | 1 (expected) | PASS (RED confirmed) |
| 2: GREEN — implement renderer + CLI | `npm test 2>&1 \| grep -E 'ℹ (pass\|fail)'` → 839 pass, 0 fail | 0 | PASS |

## Task Commits

1. **Task 1: RED — failing tests** - `352f507` (test:)
2. **Task 2: GREEN — formatConsiderations + CLI** - `55c5b86` (feat:)

**Plan metadata:** (docs commit below)

_Note: TDD tasks committed test: → feat: per TDD Playbook_

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` (26 new tests failing, 813 pre-existing pass) | 1 | FAIL (correct) |
| GREEN | `npm test` (839 pass, 0 fail) | 0 | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 9/9 (all must_haves from TRD frontmatter confirmed)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/org-awareness.cjs` — Added `formatConsiderations` region with `_renderSiblingsSection`, `_renderLibsSection`, `_renderOrgSection`; updated `module.exports` with 4 new entries
- `plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs` — Replaced `cmdOrgAwarenessConsiderations` stub with full implementation (scanner orchestration + Markdown/JSON output)
- `plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` — Added 338 lines of test code (Groups RS, RL, RO, F, CLI4 — 26 tests)

## Decisions Made

- Skipped misfiling line when `org_overlap.skipped === true` — matches TRD spec and avoids confusing "no mismatch detected" when org scan never ran
- `_renderLibsSection` uses `path.basename(c.entrypoint)` for length budget (avoids long absolute paths in Markdown output)
- CLI4-4 tested via in-process `formatConsiderations` call rather than subprocess mock — cleaner and avoids complexity of subprocess GhAuthError injection; subprocess exit-0 behavior covered by CLI4-1/CLI4-2

## Deviations from Plan

None — TRD executed exactly as written.

## Issues Encountered

None.

## Next Objective Readiness

- `formatConsiderations` is ready for consumption by TRD 03-05 (`/df:research-objective` skill integration)
- CLI `df-tools org-awareness considerations <id>` is fully wired and tested
- `lib/org-awareness.cjs` now exports all 4 public functions needed by TRD 03-07 export-lock test
- TRD 03-05 and 03-06 can run in parallel (Wave 5 per CONTEXT.md wave table)

---
*Objective: 03-planning-time-org-awareness*
*Completed: 2026-05-05*
