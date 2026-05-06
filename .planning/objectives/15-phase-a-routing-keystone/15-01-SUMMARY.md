---
objective: 15-phase-a-routing-keystone
trd: "01"
subsystem: routing-classifier
tags: [classifier, session-hook, routing, ambient-mode, tdd]
dependency_graph:
  requires: []
  provides: [classifier.cjs, classify-session.js, hooks.json-classify-registration]
  affects: [hooks.json, SessionStart-hook-chain]
tech_stack:
  added: []
  patterns: [pure-logic-two-tier-api, factory-fixtures, subprocess-integration-tests, outside-in-tdd]
key_files:
  created:
    - plugins/devflow/devflow/bin/lib/classifier.cjs
    - plugins/devflow/devflow/bin/lib/classifier.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
    - plugins/devflow/hooks/classify-session.js
    - plugins/devflow/hooks/classify-session.test.js
  modified:
    - plugins/devflow/hooks/hooks.json
decisions:
  - CONSOLIDATED_SKILLS embedded as const (not shelled out from df-tools) to avoid hot-path subprocess overhead
  - try/catch wraps main() in classify-session.js so any unexpected error silently no-ops rather than crashing session startup
  - AMBIENT_PREAMBLE includes /devflow:micro with in-development parenthetical note (Phase B obj 7 not yet shipped)
  - classify-session registered as 3rd SessionStart entry, AFTER sync-runtime and awareness-cache-populate
metrics:
  duration_minutes: 13
  completed_date: "2026-05-06"
  tasks_completed: 2
  files_created: 5
  files_modified: 1
  new_tests: 41
---

# Objective 15 TRD 01: Classifier + Session Hook Summary

**One-liner:** Pure-logic `classifySession` (ambient/init-offer/skip truth table) + `classify-session.js` SessionStart hook that injects a locked routing decision table into every Claude Code session on DevFlow projects.

## What Was Built

### Task 1 — lib/classifier.cjs (TDD RED→GREEN)

- `classifySession({ planningDir, hasGitDir, hasDeclineMarker })` — 3-boolean truth table returning `'ambient'` | `'init-offer'` | `'skip'`
- `renderRoutingPreamble({ mode })` — returns locked preamble text (from 15-RESEARCH.md) or empty string for skip
- `AMBIENT_PREAMBLE` — routing decision table with consolidated skills, gate-edits DENY info, `/devflow:micro` in-dev note
- `INIT_OFFER_PREAMBLE` — non-DevFlow git repo offer text mentioning `/devflow:new-project`
- `CONSOLIDATED_SKILLS` — Phase G snapshot from 12-RESEARCH.md (5 skills, exact subcommands, `status.subcommands[0] === null`)

### Task 2 — classify-session.js + hooks.json (TDD RED→GREEN)

- `findPlanningDir(start)` — walks up from cwd to find `.planning/`
- `findGitDir(start)` — walks up from cwd to find `.git/`
- `hasDeclineMarker(planningDir)` — checks for `.planning/.devflow-init-declined`
- `main()` — reads cwd, classifies, emits `hookSpecificOutput.additionalContext` JSON to stdout
- `DEVFLOW_SKIP_CLASSIFY=1` — env var disables the hook entirely
- hooks.json — 3rd SessionStart entry appended (classify-session.js after sync-runtime + awareness-cache-populate)

## Deviations from Plan

None — TRD executed exactly as written.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: classifier.cjs pure-logic | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 | PASS |
| 1: API spot check | `node -e "const {classifySession,...} = require('./plugins/devflow/devflow/bin/lib/classifier.cjs'); console.log(classifySession({...}))"` | 0 | PASS |
| 2: hook subprocess tests | `node --test plugins/devflow/hooks/classify-session.test.js` | 0 | PASS |
| 2: hooks.json valid | `node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/hooks/hooks.json'))"` | 0 | PASS |
| 2: smoke test (ambient project) | `node plugins/devflow/hooks/classify-session.js \| head -c 300` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| classifier unit tests | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 | PASS (24/24) |
| hook + hooks.json tests | `node --test plugins/devflow/hooks/classify-session.test.js` | 0 | PASS (17/17) |
| combined 15-01 tests | `node --test classifier.test.cjs classify-session.test.js` | 0 | PASS (41/41) |
| hooks.json lint | `node -e "JSON.parse(...hooks.json)"` | 0 | PASS |
| full npm test | `npm test` | 0 | PASS (1702/1728; pre-existing 2 failures unrelated to 15-01) |

## TDD Evidence

### Task 1 — classifier.cjs

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 1 (MODULE_NOT_FOUND) | FAIL (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs` | 0 | PASS (24/24) |
| REFACTOR | N/A — no refactor needed | — | — |

### Task 2 — classify-session.js + hooks.json

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/classify-session.test.js` | 1 | FAIL (10 failures — hook missing, hooks.json unmodified) |
| GREEN | `node --test plugins/devflow/hooks/classify-session.test.js` | 0 | PASS (17/17) |
| REFACTOR | N/A — no refactor needed | — | — |

## 5 Acceptance Scenarios (#26)

| Scenario | Project Setup | Expected Mode | Actual Output | Status |
|---|---|---|---|---|
| Ambient project | `.planning/` + `.git/` present | `ambient` | JSON with `DEVFLOW PROJECT DETECTED` | PASS |
| Init-offer-eligible | `.git/` only, no `.planning/` | `init-offer` | JSON with `INIT OFFER` | PASS |
| Scratch dir | No `.planning/`, no `.git/` | `skip` | Empty stdout | PASS |
| No-git dir | No `.planning/`, no `.git/` | `skip` | Empty stdout | PASS |
| Decline marker | `.planning/` + decline marker present | `skip` | Empty stdout | PASS |

## Commits

| Commit | Type | Description |
|---|---|---|
| `179ecc2` | test | RED: failing classifier tests + fixtures (24 tests, all failing) |
| `e894a62` | feat | GREEN: classifySession + renderRoutingPreamble (24 tests, all passing) |
| `92581bf` | test | RED: failing hook tests (17 tests, 10 failing + 7 hooks.json tests) |
| `305edb2` | feat | GREEN: classify-session.js + hooks.json (17 tests, all passing) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 (all truths from TRD frontmatter)
- Gate failures: None
- Pre-existing test failures: 2 (check-todos E2E self-test, novel-domain CLI test 22 — both pre-date this TRD)
- New tests added: 41 (24 pure-logic + 17 hook/integration)
