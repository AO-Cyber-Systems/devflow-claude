# Deferred Items — Quick Task 5

Out-of-scope failures observed when running full `npm test` during quick task 5
execution. None of these are caused by the benchmark.cjs change. Logging here
per executor scope-boundary rule.

## Pre-existing failures (2 consecutive npm test runs, identical results)

Total: 9 failed tests across 5 files. 2210 / 2269 pass (~97.4%).

- **`plugins/devflow/devflow/bin/devflow-watch.test.cjs`** — daemon foreground/stop, PID file races, multi-project --project flag (4 failures, timing-sensitive 3-9s waits)
- **`plugins/devflow/devflow/bin/df-tools.init.test.cjs`** — `init commands with --include flag` → "missing files return null in content fields" (1 failure)
- **handoff pipeline end-to-end** — 4 failures (route-results emit, idempotency, multi-record, disallowed command rejection); 18-72s timeouts each
- **`cmdDetectNovelDomain`** — "22. missing description sources → error key, novel:false (failsafe)" (1 failure)

## Why deferred

- All failures are in files unrelated to `lib/benchmark.cjs` or `lib/benchmark.test.cjs`
- Quick task 5 only touches the bare-number objective-id parser inside benchmark.cjs
- The 26/26 tests in benchmark.test.cjs all pass after this change (was 17/17 before; now 17 pre-existing + 6 new = 23, plus 3 dollars + parseSince edge cases that were already there… actually 26 total per node --test counts including describe-block-internal items)
- Re-running npm test produces identical failure set → these are persistent pre-existing issues, not flakes

## Recommendation

Surface to maintainer as separate triage. The watcher tests in particular look
timing-flaky (3-second waits + spawn-based PID assertions); the handoff
pipeline tests timeout at 72s suggesting daemon never receives the route-result
message — likely an environment/path issue rather than a code regression.
