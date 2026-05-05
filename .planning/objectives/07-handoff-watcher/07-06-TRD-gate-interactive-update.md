# TRD 01-06: gate-interactive.js Daemon-aware + Shell-flow Patterns

type: tdd
status: pending

## Behaviour list

### Existing 41 tests must still pass (regression guard)

The existing test file already exercises Approach A. After this TRD, those tests must still pass. The deny-message format changes only when watcher is live.

### New behaviour

1. When PID file is absent (watcher not live), deny reason is unchanged from today (mentions `! cmd`).
2. When PID file exists with live PID (`process.kill(pid, 0)` succeeds), deny reason mentions "queued for daemon" and does NOT instruct paste.
3. Stale PID file (process dead) is treated as not-live → Approach A reason.
4. Malformed PID file → not-live → Approach A reason.
5. Pending record format gets new fields: `source: 'hook'`, `shell` from PID file, `timeout_ms` default.
6. New shell-flow patterns trigger detection (when at command position):
   - `nvm use 18`
   - `nvm install 18`
   - `pyenv shell 3.11`
   - `conda activate myenv`
   - `direnv exec . cmd`, `direnv allow`
   - `mise use node@20`, `mise install`
   - `asdf shell ruby 3.2`
   - `rbenv shell 3.2`
   - `aws sso login`
7. Existing skipIf guards continue to work.
8. Existing quoted-string guard continues to work for new patterns (e.g. `echo "nvm use 18"` does NOT trigger).
9. `INTERACTIVE_PATTERNS.length` jumps from 9 to a known number (assert exact count for regression).
10. `DEVFLOW_HANDOFF_PID_FILE` env var overrides the PID file path (for tests).

## Fixtures

- Already have `runHook(payload, env, cwd)` from existing test
- New: `withFakePidFile({ alive: true|false }, fn)` — writes a PID file pointing at an alive or dead PID and runs fn

## Files

- src: `plugins/devflow/hooks/gate-interactive.js` (UPDATE)
- test: `plugins/devflow/hooks/gate-interactive.test.js` (EXTEND)
