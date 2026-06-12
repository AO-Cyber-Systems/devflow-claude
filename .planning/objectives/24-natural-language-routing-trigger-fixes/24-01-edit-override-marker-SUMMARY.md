---
objective: 24-natural-language-routing-trigger-fixes
trd: "01"
subsystem: hooks/gate-edits
tags: [hooks, gate, override, marker, tdd]
dependency_graph:
  requires: []
  provides: [hooks/lib/edit-override.js, gate-edits marker handshake]
  affects: [gate-edits.js, gate-edits.test.js, route-intent.js (TRD 24-02 consumer)]
tech_stack:
  added: [plugins/devflow/hooks/lib/edit-override.js]
  patterns: [consume-on-read marker, TTL stale cleanup, shared-lib re-export for back-compat]
key_files:
  created:
    - plugins/devflow/hooks/lib/edit-override.js
    - plugins/devflow/hooks/lib/edit-override.test.js
  modified:
    - plugins/devflow/hooks/gate-edits.js
    - plugins/devflow/hooks/gate-edits.test.js
decisions:
  - "OVERRIDE_PHRASES lives in hooks/lib/edit-override.js (single source of truth); gate-edits.js re-exports for back-compat"
  - "consumeEditOverrideMarker deletes marker in BOTH fresh and stale cases (consume-on-read + stale cleanup)"
  - "TTL set to 5 minutes (EDIT_OVERRIDE_TTL_MS = 5 * 60 * 1000)"
  - "gate-edits.js main() calls consumeEditOverrideMarker(planningDir) unconditionally — idempotent for missing files"
  - "All subprocess e2e tests use realPreToolUsePayload helper (no user_message/prompt keys)"
metrics:
  duration: "~16 minutes"
  completed: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
  commits: 4
---

# Objective 24 TRD 01: Edit Override Marker Summary

Shared `edit-override` lib with marker lifecycle (phrases + TTL + consume-on-read), gate-edits rewired to consume the `.edit-override` marker instead of reading the dead `input.user_message` field, and realistic PreToolUse payload tests replacing the broken user_message-based e2e suite.

## One-liner

`hooks/lib/edit-override.js` — shared OVERRIDE_PHRASES + TTL-guarded marker write/consume lifecycle; gate-edits rewired to consume `.planning/.edit-override` marker (single-turn, consume-on-read); all e2e tests now use real PreToolUse payload shape.

## Tasks Completed

| # | Name | Commits | Status |
|---|------|---------|--------|
| 1 | Create shared edit-override lib (phrases + marker lifecycle with TTL) | ed230ad (test), 1e46289 (feat) | DONE |
| 2 | Rewire gate-edits to consume the marker; rewrite e2e tests with real PreToolUse payloads | dfa352c (test), 7806ec6 (feat) | DONE |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|------|---------------|-----------|--------|
| 1: Create shared edit-override lib | `node --test plugins/devflow/hooks/lib/edit-override.test.js` | 0 | PASS |
| 1: Full suite regression | `npm test` | 0 | PASS |
| 2: Rewire gate-edits | `node --test plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS |
| 2: Both test files together | `node --test plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/lib/edit-override.test.js` | 0 | PASS |
| 2: No user_message in live code | `grep -n "input\\.user_message\|input\\.prompt" plugins/devflow/hooks/gate-edits.js` | 1 (no matches) | PASS |
| 2: Full suite final | `npm test` | 0 | PASS |

## TDD Evidence

| Task | Phase | Command | Exit Code | Expected |
|------|-------|---------|-----------|---------|
| 1 | RED | `node --test plugins/devflow/hooks/lib/edit-override.test.js` | 1 (Cannot find module) | FAIL (correct) |
| 1 | GREEN | `node --test plugins/devflow/hooks/lib/edit-override.test.js` | 0 | PASS (correct) |
| 2 | RED | `node --test plugins/devflow/hooks/gate-edits.test.js` | 1 (2 failures: fresh marker ALLOW + stale marker DENY+delete) | FAIL (correct) |
| 2 | GREEN | `node --test plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|------|---------|-----------|--------|
| test | `npm test` | 0 | PASS |
| user_message grep | `grep -n "input.user_message" plugins/devflow/hooks/gate-edits.js plugins/devflow/hooks/gate-edits.test.js` | only comments/docstrings | PASS |
| manual smoke | DENY without marker + ALLOW + consumed with fresh marker | - | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (see locked decisions in TRD)
  - gate-edits no longer reads input.user_message or input.prompt: VERIFIED
  - fresh .edit-override marker causes ALLOW + file deleted: VERIFIED
  - stale .edit-override marker (mtime > TTL) causes DENY + file deleted: VERIFIED
  - all e2e tests use real PreToolUse payload shape (no user_message/prompt): VERIFIED
  - OVERRIDE_PHRASES single definition; gate-edits re-exports: VERIFIED
- Gate failures: None

## Deviations from Plan

None — TRD executed exactly as written.

## Decisions Made

1. `OVERRIDE_PHRASES` moved to `hooks/lib/edit-override.js` as the single source of truth. `gate-edits.js` removes its local definition and re-exports from the lib (back-compat for route-intent TRD 24-02 and existing tests).
2. `consumeEditOverrideMarker` deletes the marker in BOTH fresh and stale branches — locked decision 1 requires stale markers not linger to silently disable the gate.
3. TTL is 5 minutes (300,000 ms). This satisfies "a few minutes" per CONTEXT.md discretion area.
4. `gate-edits.js main()` calls `consumeEditOverrideMarker(planningDir)` once unconditionally. This is safe because the function returns false for null/missing (no-op semantics for non-DevFlow projects and normal ambient runs).

## Self-Check: PASSED

| Item | Check | Result |
|------|-------|--------|
| hooks/lib/edit-override.js | exists | FOUND |
| hooks/lib/edit-override.test.js | exists | FOUND |
| 24-01-edit-override-marker-SUMMARY.md | exists | FOUND |
| ed230ad (test RED) | git log | FOUND |
| 1e46289 (feat GREEN lib) | git log | FOUND |
| dfa352c (test RED gate-edits) | git log | FOUND |
| 7806ec6 (feat GREEN gate-edits) | git log | FOUND |
