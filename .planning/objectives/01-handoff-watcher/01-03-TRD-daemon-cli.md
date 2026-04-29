# TRD 01-03: devflow-watch Daemon CLI

type: tdd
status: pending

## Behaviour list

1. `devflow-watch start --foreground` writes PID file, prints "started" line, runs until SIGTERM.
2. `devflow-watch start` (background-detached) returns immediately, child writes PID file before parent exits.
3. `devflow-watch start` refuses to start if PID file exists AND process is alive.
4. `devflow-watch start` cleans up stale PID file (file present, process dead) and starts.
5. `devflow-watch stop` sends SIGTERM, waits up to 5s for clean exit, removes PID file.
6. `devflow-watch stop` with no daemon running prints "not running" exit 0 (idempotent).
7. `devflow-watch status` prints JSON with `{ running, pid, version, uptime_ms, pending_count, done_count }`.
8. `devflow-watch status` returns `running: false` when PID file is stale.
9. `devflow-watch logs --tail N` reads last N lines of `~/.devflow/devflow-watch.log`.
10. SIGTERM handler removes PID file, drains in-flight commands, exits 0.

## Fixtures

- `tmpHome()` from TRD 01-01
- `tmpProject()` creates a tmp project dir with `.devflow-handoff/pending`
- daemon spawns the binary out-of-process; tests assert via PID file + log + done/ shape

## Files

- src: `plugins/devflow/devflow/bin/devflow-watch.cjs` (CLI entry)
- src: `plugins/devflow/devflow/bin/lib/watcher-daemon.cjs` (core loop)
- test: `plugins/devflow/devflow/bin/devflow-watch.test.cjs`

## Notes

- The CLI sub-process tests are slow (spawn). Limit to ~5 covering start/stop/status/idempotency. Unit-level coverage of the loop happens in 01-04.
