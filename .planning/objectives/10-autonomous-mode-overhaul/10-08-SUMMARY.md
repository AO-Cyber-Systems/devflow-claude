---
objective: 10-autonomous-mode-overhaul
trd: 08
subsystem: config
tags: [config, dead-code, autonomous, batching, de-stamping]
dependency_graph:
  requires: [10-01]
  provides: [clean-config-shape, autonomous-de-stamping, batched-onboarding]
  affects: [new-project-workflow, transition-workflow, complete-milestone-workflow]
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, dead-key-removal, AskUserQuestion-batching]
key_files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/config.cjs
    - plugins/devflow/devflow/bin/lib/config.test.cjs
    - plugins/devflow/devflow/templates/config.json
    - plugins/devflow/devflow/references/auto-behaviors.md
    - plugins/devflow/devflow/workflows/new-project.md
    - plugins/devflow/devflow/workflows/transition.md
    - plugins/devflow/devflow/workflows/complete-milestone.md
decisions:
  - "require_verification and require_tests removed (not wired): dead-ness confirmed via grep — zero readers outside config.cjs itself, template, and docs"
  - "Step 3.5 kind + default_work questions batched into single AskUserQuestion call"
  - "Step 5 interactive block extended from 3 to 4 questions by adding Research question 4"
  - "Step 6 Research ask skipped when coming from Step 5 interactive path (answer already collected)"
  - "All three transition.md yolo pure-stamp sites extended to yolo OR autonomous"
  - "complete-milestone.md scope-verification stamp extended to yolo OR autonomous"
  - "The ~line 85 gap decision (Proceed anyway / Run audit / Abort) left interactive — real judgment required"
metrics:
  duration: ~20 minutes
  completed: "2026-06-12"
  tasks_completed: 3
  files_modified: 7
---

# Objective 10 TRD 08: Config Integrity + De-stamping Summary

Config integrity and de-stamping (locked work item 5). Removed two dead config gates, batched onboarding questions, and extended yolo's auto-continue behavior to autonomous mode in transition and complete-milestone workflows.

## What Was Done

**Dead config gates removed:** `require_verification` and `require_tests` were written by new-project and documented in auto-behaviors.md but read by zero agents, workflows, or hooks. Re-verified with grep before deletion — confirmed dead. Removed from loadConfig defaults, loadConfig return, templates/config.json, auto-behaviors.md, and new-project.md's written config block. Auto-behaviors.md sections rewrote to reflect the actual enforcement model (TDD posture from kind/work defaults; verification always enforced).

**AskUserQuestion batching:** Step 3.5 in new-project.md had two sequential independent questions (Project kind + Default work type) that are now batched into a single 2-question AskUserQuestion call. The Step 5 interactive block's 3-question call was extended to 4 questions by absorbing the Step 6 Research question — Step 6 now skips the standalone ask when the interactive path was used. Per-category requirement loops remain sequential with an explanatory comment (content-dependent: each question depends on categories discovered from prior answers).

**Autonomous de-stamping:** Three `<if mode="yolo">` pure-stamp auto-continue sites in transition.md and one in complete-milestone.md were extended to `<if mode="yolo" OR="autonomous">`. All extended sites were confirmed as pure stamps (no information exchanged, no scope adjustment). The ~line 85 gap decision in complete-milestone.md (Proceed anyway / Run audit / Abort) was left interactive — real judgment is required.

## Deviations from Plan

None — TRD executed exactly as written. Error recovery grep confirmed dead-ness before deletion. All four TRD test cases pass.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED: assert dead config gates removed | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` | 1 (expected) | PASS (correctly failing) |
| 1 GREEN: remove dead require_verification/require_tests gates | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` | 0 | PASS |
| 1 GREEN: dead keys grep | `grep -rn "require_verification\|require_tests" plugins/ (excluding test file)` | 0 matches | PASS |
| 1 GREEN: templates/config.json valid | `node -e "JSON.parse(...config.json)"` | 0 | PASS |
| 1 GREEN: npm test no regressions | `npm test` | 13 pre-existing failures only | PASS |
| 2: batch new-project questions | Step 5 interactive block has 4 questions; Step 3.5 batched to 1 call | manual verify | PASS |
| 2: no port 8080 | `grep -c 8080 new-project.md` | 0 | PASS |
| 2: npm test no regressions | `npm test` | 13 pre-existing failures only | PASS |
| 3: transition.md OR=autonomous | `grep -n 'OR="autonomous"' transition.md` | 3 lines | PASS |
| 3: complete-milestone.md OR=autonomous | `grep -n 'OR="autonomous"' complete-milestone.md` | 1 line | PASS |
| 3: always_confirm_destructive intact | `grep -n 'always_confirm_destructive' transition.md complete-milestone.md` | present in transition.md | PASS |
| 3: npm test no regressions | `npm test` | 13 pre-existing failures only | PASS |

## TDD Evidence

Task 1 used TDD (config.cjs portion):

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` | 1 | FAIL (correct — 5 new assertions failing) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` | 0 | PASS (all 13 pass) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - require_verification/require_tests absent from all non-test plugin files
  - loadConfig ignores dead keys gracefully (legacy configs load without crash)
  - New-project interactive block batched to 4 questions per call
  - transition.md and complete-milestone.md fire for mode autonomous as well as yolo (pure-stamp only)
  - Safety stops (always_confirm_destructive, scope adjustment) untouched
- Gate failures: None

## Commits

| Hash | Message |
|---|---|
| c2a27db | test(10-08): assert dead config gates removed from loadConfig |
| 4caceda | feat(10-08): remove dead require_verification/require_tests gates |
| e2b9773 | feat(10-08): batch new-project config questions (<=4 per AskUserQuestion call) |
| 0b52176 | feat(10-08): autonomous mode skips pure-stamp confirmations |

## Self-Check: PASSED

All 7 modified files confirmed present. All 4 commits confirmed in git history.
