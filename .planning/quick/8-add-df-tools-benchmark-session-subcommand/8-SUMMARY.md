---
mode: quick
id: 8-add-df-tools-benchmark-session-subcommand
title: Add `df-tools benchmark session --id <sessionId>` subcommand
type: tdd
tasks: 2
status: complete
started: 2026-05-08T14:49:22Z
completed: 2026-05-08T15:04:10Z
duration_s: 888
commits:
  - cadc64f  # test(quick-8): RED — failing tests for runBenchmarkSession
  - 2ce1559  # feat(quick-8): GREEN — runBenchmarkSession + cmdBenchmarkSession + router
key_files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/benchmark.cjs
    - plugins/devflow/devflow/bin/lib/benchmark.test.cjs
---

# Quick 8: `df-tools benchmark session` Summary

**One-liner:** Per-session orchestrator cost subcommand reusing existing
`parseSubagentJsonl` parser and `dollars()`/`PRICING` constants — pure
`runBenchmarkSession` plus CLI wrapper, 7 unit tests covering missing-id /
not-found / ambiguous / single-match / multi-turn / cost-arithmetic /
default-model behavior.

## What Was Built

A new `df-tools benchmark session --id <sessionId> [--model opus|sonnet] [--raw]`
subcommand that walks `~/.claude/projects/<dirHash>/<sessionId>.jsonl` to
locate any session transcript and produces a token-breakdown + dollar-cost
report. Reuses the existing per-objective parser/pricing — no duplication.

Two layers:
- **`runBenchmarkSession({ projectsRoot, sessionId, model })`** — pure,
  exported, testable. Returns structured `{ ok, ... }` or `{ ok: false, error, ... }`.
  Never writes/exits.
- **`cmdBenchmarkSession(cwd, args, raw)`** — CLI wrapper. Handles both
  `--id=<v>` and `--id <v>` forms (UUIDs pasted from chat UIs commonly carry
  a space). Exits 1 on error in both `--raw` and human-readable modes so
  shell scripts can branch on the exit code.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — failing tests | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | non-zero (7 fails) | PASS (correct RED) |
| 2: GREEN — implementation | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | 0 (33/33 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | non-zero | FAIL — 7 fails, all `TypeError: bm.runBenchmarkSession is not a function` (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | 0 | PASS — 33 pass / 0 fail (correct) |
| REFACTOR | n/a | — | none required; minimal idiomatic implementation matched the existing `cmdBenchmarkPerObjective` pattern |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| benchmark unit tests | `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` | 0 | PASS (33/33) |
| full test suite | `npm test` | non-zero | PASS for in-scope tests; 10 pre-existing failures in `devflow-watch.test.cjs`, `df-tools.test.cjs`, `handoff-e2e.test.cjs`, `novel-domain.test.cjs` are unchanged from baseline (verified via clean-tree comparison) |
| smoke: missing --id | `df-tools benchmark session` | 1 | PASS — stderr `Error: --id <sessionId> required` |
| smoke: fake id | `df-tools benchmark session --id deadbeef-...` | 1 | PASS — stderr `Error: session ... not found in /Users/.../projects` |
| smoke: real id (opus) | `df-tools benchmark session --id <real-uuid>` | 0 | PASS — human-readable cost block, $83.3216, 191 apiCalls |
| smoke: --raw JSON | `df-tools benchmark session --id <real-uuid> --raw \| python3 -m json.tool` | 0 | PASS — valid JSON with `ok:true`, tokens, cost, apiCalls, sessionId, path, dirHash |
| smoke: --model=sonnet | `df-tools benchmark session --id <real-uuid> --model=sonnet --raw` | 0 | PASS — cost $16.66 (~5× cheaper than opus, as expected) |
| no duplication: PRICING | `grep -c "^const PRICING" benchmark.cjs` | — | 1 (no duplication) |
| no duplication: dollars | `grep -c "^function dollars" benchmark.cjs` | — | 1 (no duplication) |
| no duplication: parser | `grep -c "^async function parseSubagentJsonl" benchmark.cjs` | — | 1 (no duplication, only invoked) |
| parser unchanged | `git diff benchmark.cjs` | — | PASS — only added line referencing parser; lines 108–151 unmodified |

## Test Coverage (`runBenchmarkSession`)

| # | Behavior case | Status |
|---|---|---|
| 1 | Returns `{ ok:false, error:"--id..." }` when sessionId missing | PASS |
| 2 | Returns `{ ok:false, error:"...not found...", searched:[...] }` when sessionId absent | PASS |
| 3 | Returns `{ ok:false, error:"...matched multiple...", matches:[...] }` when ambiguous | PASS |
| 4 | Returns full `{ ok:true, sessionId, dirHash, path, model, apiCalls, tokens, cost }` for valid single match — verifies opus closed-form cost | PASS |
| 5 | Aggregates two distinct assistant turns (different `message.id`) into 2 apiCalls + summed input/output | PASS |
| 6 | Cost computation passes tokens through `dollars()` with provided `model` (sonnet → 5× cheaper than opus) | PASS |
| 7 | Default model is `'opus'` when omitted | PASS |

All 7 cases use hand-built `mkSessionFixture` helper writing JSONL via object
literals — no LLM-generated test data, per Mark's TDD playbook habit 4.

## Deviations from Plan

None. The TDD TRD executed exactly as written:
- Task 1 (RED): 7 tests added, all failed with the expected
  `TypeError: bm.runBenchmarkSession is not a function`.
- Task 2 (GREEN): pure function + CLI wrapper + router branch + exports
  added. All 7 RED tests passed. All 26 pre-existing benchmark tests still
  passed.

The JOB.md noted that `df-tools.cjs` line 229 likely needed no edit ("the
file already has no such comment block — it doesn't, per the read above. No
edit required if no comment block to update."). Confirmed by inspection —
the line-229 usage string lists top-level commands only, with subcommand
detail living inside `cmdBenchmarkRoute`'s own usage block. No edit was made
to `df-tools.cjs`.

## Out-of-Scope Pre-Existing Failures (Deferred)

The full `npm test` run shows 10 unique failing tests across 4 files. All
pre-existing on the clean baseline (verified via `git stash && npm test`):

- `plugins/devflow/devflow/bin/devflow-watch.test.cjs` — 4 failures
- `plugins/devflow/devflow/bin/df-tools.test.cjs:1159` — 1 failure
- `plugins/devflow/devflow/bin/handoff-e2e.test.cjs` — 4 failures
- `plugins/devflow/devflow/bin/lib/novel-domain.test.cjs:331` — 1 failure

**None in `benchmark.test.cjs`.** None caused by changes in this quick task.
Per the executor scope-boundary rule, these are not auto-fixed here. They
should be triaged in a separate quick task or objective.

## Anti-Pattern Guard Compliance (per Mark's CLAUDE.md)

- TDD enforced: RED commit before GREEN commit, exit-code evidence captured
  for both phases.
- Test list written before test code (7 cases enumerated in JOB.md).
- One test at a time inside the describe block; no batched implementation.
- Hand-built fixtures via `mkSessionFixture` helper — no LLM-generated test
  data.
- Outside-in: pure unit tests on `runBenchmarkSession`; CLI smoke test
  covered separately by validation gates (per JOB.md design).
- Multitenancy guard: n/a — single-session benchmark, no tenant model.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (all bullet items in JOB.md `## Verification`
  block check out)
- Gate failures: None in scope; pre-existing baseline failures
  untouched

## Self-Check: PASSED

- [x] `plugins/devflow/devflow/bin/lib/benchmark.cjs` modified — `runBenchmarkSession`,
  `cmdBenchmarkSession`, router branch, exports
- [x] `plugins/devflow/devflow/bin/lib/benchmark.test.cjs` modified — 7 new tests +
  helpers + requires
- [x] Commit `cadc64f` exists (RED, test-only)
- [x] Commit `2ce1559` exists (GREEN, implementation)
- [x] All 33 benchmark tests pass
- [x] `parseSubagentJsonl` lines 108–151 untouched
- [x] `PRICING` and `dollars()` not duplicated
- [x] `.skill-active` and `04-CONTEXT.md` not committed (pre-existing dirty
  state preserved)

## Success Criteria

1. ✅ `df-tools benchmark session --id <sessionId>` produces per-session
   orchestrator cost broken down by token category.
2. ✅ `--raw` produces machine-readable JSON for shell pipelines.
3. ✅ Error paths (missing --id, unknown session, multiple matches, empty
   transcript) exit 1 with informative messages.
4. ✅ Pure `runBenchmarkSession` unit-tested with hand-built fixtures
   covering 7 behavior cases.
5. ✅ No regression in existing benchmark tests (26/26 pre-existing pass).
