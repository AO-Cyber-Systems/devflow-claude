---
objective: 05-initiative-context-layer
trd: 05-03
subsystem: initiatives
tags: [stale-deletion, readline, force-flag, async, gh-integration]
dependency_graph:
  requires: [05-02]
  provides: [stale-deletion region, gh.readIssueState]
  affects: [initiatives.cjs, initiatives-cli.cjs, gh.cjs]
tech_stack:
  added: [node:readline (TTY confirmation)]
  patterns: [readline injection hook, async syncInitiatives, _runReadline swap]
key_files:
  modified:
    - plugins/devflow/devflow/bin/lib/initiatives.cjs
    - plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
    - plugins/devflow/devflow/bin/lib/initiatives.test.cjs
    - plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
decisions:
  - "gh.readIssueState added to gh.cjs as a thin _runGh wrapper; test injection via existing _setRunGh"
  - "syncInitiatives promoted to async for readline support; all S-group + IM tests updated to async/await"
  - "Non-TTY guard uses _runReadline === _defaultConfirmDeleteStale identity check for cleaner separation from injection"
  - "buildMockRunGhForInitiatives extended with opts.issueStates map (default OPEN) for DS/SF tests"
metrics:
  duration: "12 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  tests_added: 28
  files_modified: 6
requirements: [SC-7]
---

# Objective 05 TRD 03: Stale Deletion + Force Flag + Readline Confirmation Summary

**One-liner:** Stale initiative detection via gh issue view, per-file TTY readline confirmation, --force bypass, and non-TTY skip with warning.

## What Was Built

### `_detectStaleInitiatives({ home, fresh_items })`

Scans `home/*.md` files. For each file: parses frontmatter, checks `github_issue` field, skips if the ref is in `fresh_items` (project still claims it), calls `gh.readIssueState(ref)` to verify CLOSED state. Returns `{ stale: [{ slug, github_issue, reason }], warnings: [] }`.

Key behaviors:
- Malformed frontmatter: silently skipped
- Missing `github_issue`: warning + skip
- `gh issue view` failure: warning + treat as not-stale (conservative)
- CLOSED but still in `fresh_items`: NOT stale (data inconsistency — project claims it)

### `_confirmDeleteStale(slug)`

Routes through `_runReadline` injection hook. Default implementation (`_defaultConfirmDeleteStale`) gates on `process.stdin.isTTY` — returns `false` immediately on non-TTY. On TTY, opens a readline interface and prompts `Delete <slug>.md? [y/N] `. Returns `Promise<boolean>`.

`_setRunReadline(fn)` allows tests to inject a synchronous or async function without opening real stdin. `_resetMocks()` now resets `_runReadline` back to `_defaultConfirmDeleteStale`.

### `_deleteStaleFile(home, slug)`

Calls `_runFs.unlinkSync(home/<slug>.md)`. Returns `{ deleted: true, slug, reason: 'closed_and_removed' }` on success, or `{ deleted: false, slug, reason: 'unlink_failed: <msg>' }` on error — never throws.

### `_runStaleDeletionLoop({ home, stale_entries, force })`

Async loop over stale entries. With `force=true`: deletes unconditionally. With `force=false`: awaits `_runReadline(slug)` per file. Catches prompt errors, logs to warnings, skips that file.

### `syncInitiatives` (now `async`)

Writer loop runs FIRST (unchanged from TRD 05-02), then stale-deletion:
1. Calls `_detectStaleInitiatives({ home, fresh_items: items })` (using the walk result)
2. Non-TTY + no-force + default readline: logs single warning, skips deletion loop
3. Otherwise: awaits `_runStaleDeletionLoop`

Single-initiative mode (`opts.initiative` set): stale-deletion is bypassed entirely (no detection, no prompt, `deleted` stays `[]`).

### `gh.readIssueState(issueRef)`

Thin wrapper: `_runGh(['issue', 'view', issueRef, '--json', 'state,closed'])`. Routes through `_setRunGh` injection so tests mock it at the gh.cjs layer without any new hooks.

### `initiatives-cli.cjs`: `cmdInitiativesSync` (now `async`)

`await init.syncInitiatives(...)` + passes `force: flags.force === true`. The `cmdInitiativesRoute` caller (`df-tools.cjs`) is a fire-and-forget call — Node's event loop handles the outstanding Promise naturally.

### `buildMockRunGhForInitiatives` fixture extension

Added handler for `args[0] === 'issue' && args[1] === 'view'`: looks up `opts.issueStates[ref]` (defaults to `'OPEN'`). DS/SF tests that need CLOSED responses override `_setRunGh` directly for full control.

## Decisions Made

1. **gh.readIssueState via gh.cjs** — Instead of a new `_ghReadIssueState` indirection in initiatives.cjs, adding a thin `readIssueState` export to gh.cjs keeps test injection unified at the existing `_setRunGh` layer. No new injection hook needed.

2. **syncInitiatives async** — Promoted from sync to async function. All 12 S-group tests + 2 IM tests updated to `async () =>` + `await`. S2 changed from `assert.throws` to `assert.rejects`. Impact is additive only — awaiting an async function in previously-sync call sites is backwards-compatible.

3. **Non-TTY guard** — Uses `_runReadline === _defaultConfirmDeleteStale` identity check alongside `!process.stdin.isTTY` to correctly skip when using the real readline but skip to the loop when tests have injected a mock readline. This avoids a TTY check inside injection-aware code paths.

4. **buildMockRunGhForInitiatives extended** — Added `opts.issueStates` map parameter. DS/SF tests that need fine-grained per-ref control override `_setRunGh` directly rather than using the helper.

## Where TRD 05-04 Picks Up

TRD 05-04 does NOT touch `initiatives.cjs` or `initiatives-cli.cjs`. It only edits skill markdown files (`/devflow:initiatives` SKILL.md + `/df:plan-objective` workflow integration) and agents/planner.md. The stale-deletion region, async syncInitiatives, and all 28 tests from this TRD are the final state for this functionality.

## Deviations from Plan

None. TRD executed exactly as specified with the executor-recommended approach (gh.readIssueState via gh.cjs, unified _setRunGh injection).

Minor implementation note: The TRD draft included a verbose `_ghReadIssueState` indirection with a mock function pointer approach. The final implementation used the simpler path (gh.readIssueState directly) per the TRD's own executor-discretion note.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Add failing tests (RED) | `npm test -- --test-name-pattern="DS\|CF\|DD\|SF\|CLI3"` | non-zero (25 fail) | FAIL (correct RED) |
| 2: Implement stale-deletion (GREEN) | `npm test` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` (with new tests, no implementation) | 1 (25 fail) | FAIL (correct) |
| GREEN | `npm test` (after implementation) | 0 | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
  - syncInitiatives detects CLOSED+not-in-project files
  - Without --force: TTY readline prompt per file
  - With --force: unconditional delete + result.deleted populated
  - Non-TTY: skip with warning
  - Single-initiative mode: no stale detection at all
  - Stale detection AFTER writer loop
- Gate failures: None

## Self-Check: PASSED

Files verified:
- `/Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/lib/initiatives.cjs` — FOUND
- `/Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/lib/gh.cjs` — FOUND (readIssueState exported)
- Commits: `574d35d` (test), `67b7425` (feat) — both in git log

Final test counts: 1083 pass, 20 skip, 0 fail (28 new tests added)
