# TRD 01-01: Watcher State Library

type: tdd
status: pending

## Behaviour list (write tests in this order)

1. `pidFilePath()` returns `~/.devflow/devflow-watch.pid` (uses os.homedir or HOME override).
2. `writePidFile({ pid, version, watching, shell })` creates the parent dir and writes JSON.
3. `readPidFile()` returns parsed JSON or null on missing/malformed.
4. `removePidFile()` is idempotent (no error if absent).
5. `isWatcherLive()` returns false when PID file absent.
6. `isWatcherLive()` returns false when PID file present but process is dead (`process.kill(pid, 0)` throws ESRCH).
7. `isWatcherLive()` returns true when PID file present and `process.kill(pid, 0)` succeeds.
8. `isWatcherLive()` returns false on malformed PID file.
9. `makeDoneRecord(pending, { stdout, stderr, exit_code, status })` produces a record with `consumed: false`, `started_at`, `completed_at`.
10. `markConsumed(donePath)` flips `consumed: true` and rewrites the file atomically.
11. `listUnconsumed(doneDir)` returns records with `consumed === false`, sorted by `completed_at`.

## Fixtures

- `tmpHome()` creates a temp dir to use as $HOME, returns cleanup fn
- `fakeAlivePid()` returns `process.pid` (always alive in test)
- `fakeDeadPid()` spawns a sleep-0 child, captures pid, awaits exit, returns the now-dead pid

## Files

- src: `plugins/devflow/devflow/bin/lib/watcher-state.cjs`
- test: `plugins/devflow/devflow/bin/lib/watcher-state.test.cjs`
