---
objective: 06-unified-check-todos
trd: 06-01
subsystem: check-todos
tags: [aggregator, fetchers, lane-assignment, fixtures, tdd]
dependency_graph:
  requires: [awareness.cjs, gh.cjs, initiatives.cjs, dup-detect.cjs, frontmatter.cjs]
  provides: [check-todos.cjs aggregate, 5 _fetch* helpers, _assignLane, buildCheckTodosFixtures]
  affects: [df-tools.cjs, awareness-fixtures.cjs, gh.cjs]
tech_stack:
  added: []
  patterns: [injection-hooks, iron-law-no-throw-aggregate, per-source-try-catch, pure-lane-assignment]
key_files:
  created:
    - plugins/devflow/devflow/bin/lib/check-todos.cjs
    - plugins/devflow/devflow/bin/lib/check-todos.test.cjs
    - plugins/devflow/devflow/bin/lib/check-todos-cli.cjs
    - plugins/devflow/devflow/bin/lib/check-todos-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/gh.cjs
decisions:
  - "_fetchDupDetectLog propagates readFileSync errors (not swallows) so aggregate can route to warnings[]"
  - "gh._runGh exported as wrapper function (not value) so injection hook works from external modules"
  - "buildCheckTodosFixtures auth mock puts Token scopes in stdout (not stderr) to match parseScopes behavior"
metrics:
  duration: "9m 38s"
  completed: "2026-05-04"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
  tests_before: 1166
  tests_after: 1228
  tests_delta: 62
---

# Objective 06 TRD 01: Aggregator and Fixtures Summary

**One-liner:** check-todos.cjs foundation with aggregate(), 5 _fetch* helpers, deterministic _assignLane, buildCheckTodosFixtures composer, and df-tools case arm — all TDD'd with 62 new tests.

## What Was Built

Created the core `lib/check-todos.cjs` module with:

- `aggregate({ projectRoot, refresh })` — orchestrates 5 sources, routes entries through `_assignLane` into 4 urgency lanes, returns `{ blocked, now, soon, ideas, warnings, cached }`. Iron Law: never throws; source failures → `warnings[]`.
- `_fetchLocalTodos(cwd, opts)` — walks `.planning/todos/pending/*.md`, mirrors `cmdListTodos` regex/fault-tolerance, routes through `_runFs`, emits `source: 'local'`.
- `_fetchGhIssues(opts)` — 3 sequential gh queries (assigned/mentions/review-requested), dedupes via `repo#number` Set, filters to single org, normalizes labels `[{name}]` → `['name']`.
- `_fetchPeerSessions(opts)` — delegates to `_runPeer` injection seam (wraps `aw.scanPeer`).
- `_fetchInitiativeQuestions(opts)` — `loadInitiatives({ home })` + `matchByRepo` + flat-map open_questions.
- `_fetchDupDetectLog(cwd, opts)` — JSONL line-walk with malformed-line skip; propagates readFileSync errors.
- `_assignLane(entry, currentUser, currentRepo)` — pure deterministic function; 17 enumerated cases.
- 3 injection hooks: `_setRunFs`, `_setRunPeer`, `_setRunGh` (re-export from gh.cjs), `_resetMocks`.
- 5 constants: `LANE_NAMES`, `CHECK_TODOS_CACHE_REL`, `CHECK_TODOS_TTL_MINUTES`, `MAX_CHECK_TODOS_OUTPUT_CHARS`, `DEFAULT_LANE_TRUNCATE`.

Also created:
- `lib/check-todos-cli.cjs` — `cmdCheckTodosRoute` scaffold; raw JSON output only; `--lane` validation; full flag wiring deferred to TRD 06-04.
- Extended `awareness-fixtures.cjs` with `buildCheckTodosFixtures` — one-stop composer for all 5 sources with tmpdir cleanup.
- Wired `df-tools.cjs` `case 'check-todos'` arm.

## Commits

| Hash | Message |
|---|---|
| `7e7d1cf` | `test(06-01): add failing tests for unified check-todos aggregator + 5 fetchers + lane assignment + fixture builder` |
| `1f108d3` | `feat(06-01): implement unified check-todos aggregator + 5 fetchers + lane assignment` |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — test list + fixture builder + scaffolds | `node --test plugins/devflow/devflow/bin/lib/check-todos.test.cjs` | 0 | PASS |
| 2: GREEN — implement aggregator + fetchers + lane assignment | `npm test` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| module-loads | `node -e "require('./...check-todos.cjs')"` | 0 | PASS |
| aggregate-shape | `node -e "...aggregate({ projectRoot })...Object.keys(r)"` | 0 | PASS |
| cli-dispatch | `node df-tools.cjs check-todos --raw` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test lib/check-todos.test.cjs` (with stubs) | 1 | FAIL (correct) |
| GREEN | `node --test lib/check-todos.test.cjs` (with implementation) | 0 | PASS (correct) |
| FULL SUITE | `npm test` | 0 | PASS (1228/1228) |

## Post-TRD Verification

- Auto-fix cycles used: 2 (auth mock stdout/stderr fix; _fetchDupDetectLog propagate vs swallow)
- Must-haves verified: 7/7
- Gate failures: None

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] gh._runGh not exported from gh.cjs**
- **Found during:** Task 2 (smoke test showed `gh._runGh is not a function`)
- **Issue:** The TRD's codebase example calls `gh._runGh(args)` directly, but gh.cjs's `_runGh` was a module-scoped variable only exported via `_setRunGh` setter.
- **Fix:** Added `_runGh: (...args) => _runGh(...args)` wrapper to gh.cjs module.exports — acts as a getter proxy so the injection hook always delegates to the current mock value.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh.cjs`
- **Commit:** `1f108d3`

**2. [Rule 1 - Bug] _fetchDupDetectLog swallowed readFileSync errors**
- **Found during:** Task 1 test A7 (dup-detect warning not generated)
- **Issue:** Original implementation had `try { content = readFileSync(...) } catch { return []; }` — this swallowed the error so aggregate never saw a throw to route into warnings[].
- **Fix:** Removed try/catch around readFileSync in `_fetchDupDetectLog` — errors propagate to `aggregate` which wraps each fetcher in try/catch and routes to `warnings[]`.
- **Files modified:** `plugins/devflow/devflow/bin/lib/check-todos.cjs`
- **Commit:** `1f108d3`

**3. [Rule 1 - Bug] buildCheckTodosFixtures auth mock had Token scopes in stderr not stdout**
- **Found during:** Task 1 test L2, L3, L4, L5, L6, L7 (GhAuthError: missing scopes)
- **Issue:** Mock put `Token scopes:` line in `stderr`; `parseScopes()` in gh.cjs reads from `r.stdout`. Auth check failed with `missing scopes: repo` for all L-group tests.
- **Fix:** Moved `Token scopes:` line to `stdout` in `_buildCheckTodosMockGh` to match `parseScopes` input expectations.
- **Files modified:** `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs`
- **Commit:** `7e7d1cf` (was already in the test commit since it's part of the fixture builder)

## Manual Smoke Test

`df-tools check-todos --raw` against this repo (devflow-claude-v1.1, feature/v1.1-obj-6-check-todos):

```json
{
  "blocked": 108,  // dup-detect log entries with resolution:coordinate from prior test runs
  "now": 0,
  "soon": 0,
  "ideas": 1,      // local todo: seamless-interactive-command-handoff.md
  "warnings": 0,
  "cached": false
}
```

GH issues fetch succeeded (repo has live gh auth). Peer sessions: no active branches (scanner running on this branch). Initiative questions: matched to AO-Cyber-Systems/devflow-claude.

## Success Criteria Verification

- [x] SC-1: `aggregate({ projectRoot, refresh })` returns `{ blocked, now, soon, ideas, warnings, cached }` — verified by Group A tests + smoke test
- [x] SC-2: 5 `_fetch*` helpers with `_setRunFs`/`_setRunGh`/`_setRunPeer` injection seams — verified by Groups F/L/P/I/D
- [x] SC-3: `_assignLane` is deterministic — 17 enumerated cases in Group AS all pass

## Self-Check: PASSED

All created files verified on disk. Both commits verified in git log. Fixture builder and df-tools case arm verified. Test counts: 1228 pass / 0 fail.
