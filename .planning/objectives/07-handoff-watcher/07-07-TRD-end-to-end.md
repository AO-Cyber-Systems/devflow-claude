# TRD 01-07: End-to-end Integration

type: tdd
status: pending

## Behaviour list

1. **Pipeline test**: spawn daemon → write a pending record for `echo hello` → assert done record appears within 5s → simulate UserPromptSubmit → assert injected context contains `hello`.
2. **Allowlist rejection**: write a pending record for `rm -rf /tmp/x` → daemon writes `done/<id>.json` with `status: rejected`.
3. **Watcher off (fallback)**: with no PID file, gate-interactive.js emits Approach A message; existing tests continue to pass.
4. **Watcher on**: with PID file present and alive, gate-interactive.js emits "queued for daemon" message.
5. **Idempotency**: same UserPromptSubmit run twice yields injection on first, silence on second (consumed flag works).
6. **Multi-record**: queue 3 commands while daemon is running, all complete, all 3 appear in single injection.

## Fixtures

- `withDaemon(opts, fn)` — spawn daemon, run fn, kill daemon
- `seedPending(projectDir, { cmd })` — write a pending record using df-tools handoff create

## Files

- test: `plugins/devflow/devflow/bin/handoff-e2e.test.cjs`
