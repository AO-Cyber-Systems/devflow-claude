# TRD 01-04: Interactive Shell Session

type: tdd
status: pending

## Behaviour list

1. `ShellSession.spawn({ shell: 'bash' })` spawns `bash -i` and is ready for `dispatch`.
2. `dispatch(id, cmd)` returns `{ stdout, stderr, exit_code }` after the sentinel parses.
3. Sentinel format: stdout begins after `__DFW_BEGIN_<id>__\n` and ends at `__DFW_END_<id>__:<code>\n`.
4. Exit code is parsed correctly for success (0) and failure (non-zero — test with `false`).
5. `dispatch` for `echo hello` returns `stdout: "hello\n"`, `exit_code: 0`.
6. `dispatch` for `echo err >&2` returns `stderr: "err\n"`, `exit_code: 0`.
7. `dispatch` honours `timeout_ms` — kills child on timeout, returns `{ status: 'timeout', exit_code: -1 }`.
8. Two sequential dispatches in the same session preserve env (set FOO=bar; echo $FOO returns bar).
9. `kill()` sends SIGTERM to the shell.
10. After `kill()` further `dispatch` rejects with `ShellSessionClosed`.
11. Crash recovery: if the shell process dies, `dispatch` rejects current promise; the daemon spawns a replacement on next dispatch.

## Fixtures

- `withSession(opts, fn)` test helper: spawns, awaits ready, runs fn, kills.
- All tests use `bash -i` (more portable than zsh in CI). On macOS we test zsh via a single integration smoke test.

## Files

- src: `plugins/devflow/devflow/bin/lib/watcher-shell.cjs`
- test: `plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs`
