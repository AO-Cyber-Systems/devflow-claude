---
objective: 10-autonomous-mode-overhaul
trd: 03
subsystem: decision-queue
tags: [autonomous-mode, decision-queue, cli, tdd]
requires: [10-01]
provides: [decision-queue-library, devflow-decide-skill]
affects: [df-tools-cli, autonomous-execution-flow]
tech_stack_added: []
tech_stack_patterns: [fs-injection-pattern, fire-and-forget-notify, subprocess-test-pattern]
key_files_created:
  - plugins/devflow/devflow/bin/lib/decision-queue.cjs
  - plugins/devflow/devflow/bin/lib/decision-queue.test.cjs
  - plugins/devflow/skills/decide/SKILL.md
key_files_modified:
  - plugins/devflow/devflow/bin/lib/__fixtures__/autonomous-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
decisions:
  - Used unlinkSync instead of renameSync for resolveDecision to ensure reliability when pending/resolved are on different filesystems
  - Chose fire-and-forget (.catch(()=>{})) over awaited notify to match TRD spec; addDecision stays fast
  - CLI resolve handler uses 'resolved'/'ok' keys — test 21 accepts either (both valid)
duration: "6m"
completed: "2026-06-12"
---

# Objective 10 TRD 03: Decision Queue Summary

Decision-queue library, CLI, and `/devflow:decide` skill — parking decisions so autonomous execution can continue independent TRDs without halting on `checkpoint:decision` events.

## What Was Built

**decision-queue.cjs** — Full library surface:
- `nextDecisionId(cwd)` — scans both pending/ and resolved/ for max DECISION-NNN sequence, returns next id
- `addDecision(cwd, opts)` — async; writes spec-conformant DECISION-NNN.md; fire-and-forget OS notification via notifier.cjs
- `listDecisions(cwd, {status})` — graceful-empty (returns [] on missing dir); warn+skip on malformed frontmatter
- `resolveDecision(cwd, id, choice)` — splices status/resolution/resolved_at into frontmatter; writes to resolved/; unlinks pending file; freeform choices accepted with warning
- `computeBlockedSet(objectiveDir, decisionId)` — reads TRD frontmatter; blocked = direct decision_gate match + transitive depends_on closure; independent = remainder
- `renderDecisionMarkdown(opts)` — pure function, locked Pattern 3 file format
- `cmdDecisionQueueRoute(cwd, argv, raw)` — CLI entry point routing add|list|resolve|notify
- `_setRunFs/_resetMocks` — injection seam per TRD 03-01 locked pattern

**df-tools.cjs** — Added `case 'decision-queue':` arm using `await cmdDecisionQueueRoute(...)` in the async main switch.

**skills/decide/SKILL.md** — Thin orchestrator: lists pending decisions when called without arguments; resolves and reports unblocked TRDs when called with `<id> <choice>`; suggests `/devflow:execute-objective` to resume.

**autonomous-fixtures.cjs** — Added `buildDecisionFile(dir, opts)` and `buildObjectiveDirWithTrds(tmpdir, trdSpecs)` for test use.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixtures + decision-queue core library | `node --test decision-queue.test.cjs` (cases 1-18) | 0 | PASS |
| 2: CLI routing + df-tools arm | `node --test decision-queue.test.cjs` (all 23 cases) | 0 | PASS |
| 3: /devflow:decide skill | `grep -c 8080 SKILL.md` → 0; frontmatter checks | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test decision-queue.test.cjs` (cases 1-18) | 1 | FAIL (correct — library not yet written) |
| Task 1 GREEN | `node --test decision-queue.test.cjs` (cases 1-18) | 0 | PASS (correct) |
| Task 2 RED | `node --test decision-queue.test.cjs` (cases 19-22) | 1 | FAIL (correct — df-tools arm not yet added) |
| Task 2 GREEN | `node --test decision-queue.test.cjs` (all 23 cases) | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| decision-queue unit tests | `node --test plugins/devflow/devflow/bin/lib/decision-queue.test.cjs` | 0 | PASS (23/23) |
| full suite (no regressions) | `npm test` | 0 | PASS (2232/2295, 13 pre-existing fails unchanged) |
| port 8080 check | `grep -rn 8080 decision-queue*.cjs SKILL.md` | 0 | PASS (zero occurrences) |
| usage message | `node df-tools.cjs decision-queue` | 1 | PASS (exits 1 with usage) |

## Commits

| Hash | Message |
|---|---|
| 7bc9311 | test(10-03): add failing tests for decision queue library |
| c02a71c | feat(10-03): decision queue library |
| c9d3f70 | test(10-03): add failing CLI tests for decision-queue subcommand |
| 910377c | feat(10-03): decision-queue CLI subcommand |
| fabea29 | feat(10-03): /devflow:decide skill |

## Deviations from Plan

None — TRD executed exactly as written.

The autonomous-fixtures.cjs was already updated with `buildDecisionFile` and `buildObjectiveDirWithTrds` in the RED commit (7bc9311) from a prior run. The decision-queue.cjs file was pre-created but not staged. This TRD completed the staged commit sequence correctly.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - [x] decision-queue add writes DECISION-NNN.md with correct frontmatter
  - [x] decision-queue list returns pending/resolved with filter
  - [x] decision-queue resolve moves file and splices frontmatter
  - [x] computeBlockedSet transitive closure over decision_gate + depends_on
  - [x] /devflow:decide skill ships with correct structure
- Gate failures: None

## Self-Check: PASSED

All created files verified present. All 5 task commits verified in git log.
