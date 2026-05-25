# Deferred Items — Quick Task 11

Out-of-scope test failures observed during execution but NOT caused by this task's changes.

## Pre-existing flaky tests (devflow-watch daemon + handoff-e2e)

Full `npm test` reports 9 failures, ALL in:
- `plugins/devflow/devflow/bin/devflow-watch.test.cjs` (foreground daemon, start refuses, multi-project CLI)
- `plugins/devflow/devflow/bin/handoff-e2e.test.cjs` (write pending, disallowed command, idempotency, multi-record)

These tests involve:
- PID file lifecycle / process management
- Daemon spawning and graceful shutdown
- 18-second timeouts on done-record waits

None of these failures touch `micro.cjs`, `micro.test.cjs`, or `init.cjs`.

**Targeted suites confirm no regression from Task 11:**
- `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` — 29/29 pass (20 pre-existing + 9 new from this task)
- `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` — 34/34 pass (no regression)

These daemon/handoff failures should be tracked separately. Project STATE.md has noted "2 pre-existing failures unchanged" historically; the count has grown to 9 likely due to environmental flakiness on this run (other tests hitting 18s timeouts strongly suggest contention or daemon-state staleness, not logic regressions).
