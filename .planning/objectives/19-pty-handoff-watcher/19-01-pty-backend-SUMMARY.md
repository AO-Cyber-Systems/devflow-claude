---
objective: 19-pty-handoff-watcher
trd: "01"
subsystem: watcher-shell
type: tdd
tags: [pty, node-pty, watcher, dispatch, sentinel-protocol]
dependency_graph:
  requires:
    - watcher-shell.cjs (pre-existing pipe-mode dispatch)
    - sentinel protocol (BEGIN/DELIM/END)
  provides:
    - dual-mode ShellSession (PTY + pipe)
    - node-pty 1.1.0 dependency
    - PTY-mode test suite (12 tests)
  affects:
    - daemon production path (interactive:true now uses real TTY)
    - npm install (node-pty native binary fetched)
tech_stack:
  added:
    - node-pty 1.1.0 (regular dependency, exact pinned version)
  patterns:
    - lazy require for native dep (no module-load failure when binary absent)
    - byte-identical pipe-mode preservation
    - PTY/pipe transport branching via `_isPTY` flag
    - sentinel-fenced output protocol shared across transports
key_files:
  created:
    - package-lock.json (first lockfile in repo)
  modified:
    - package.json (add dep + postinstall chmod)
    - plugins/devflow/devflow/bin/lib/watcher-shell.cjs (dual-mode spawn/dispatch/kill)
    - plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs (12 PTY tests added; 2 lifecycle tests pinned to interactive:false)
decisions:
  - "node-pty 1.1.0 pinned exact version; postinstall chmods spawn-helper for darwin-arm64 prebuilt"
  - "stty -echo + 100ms drain in PTY init prelude — without it cooked-mode echo breaks sentinel matching"
  - "PTY mode normalizes \\r\\n to \\n in stdout/stderr so result shape is byte-identical to pipe mode"
  - "kill() and dispatch-timeout BOTH call proc.destroy() on PTY to release socket FD (event loop cleanup)"
  - "Lifecycle tests in watcher-shell.test.cjs pinned to interactive:false (class default flipped to PTY)"
metrics:
  duration_minutes: 35
  completed_date: 2026-05-06
  task_count: 3
  file_count: 4
  test_delta: +12
requirements:
  - PTY-BACKEND
---

# Objective 19 TRD 01: PTY Backend Summary

PTY backend (node-pty 1.1.0) for the watcher-shell daemon, gated on `interactive:true`. Pipe-mode (interactive:false) preserved byte-identical for tests; production daemon now uses real PTY for TTY-required commands (`gh auth login`, `doctl auth init`, `gpg --decrypt`).

## What Shipped

**Dual-mode `ShellSession`** in `plugins/devflow/devflow/bin/lib/watcher-shell.cjs`:

- `interactive: true` → `node-pty.spawn('bash', ['-i'], { name: 'xterm-color', cols: 80, rows: 24 })` with `stty -echo` prelude + 100ms drain
- `interactive: false` → `child_process.spawn('bash', [])` with stdio:pipe (existing v1.1 behavior verbatim)
- `_isPTY` flag controls transport branching in `_writeRaw`, `dispatch`, `kill`
- `kill()` calls `proc.destroy()` on PTY (releases socket FD); same in dispatch timeout path
- PTY mode normalizes `\r\n` → `\n` in stdout/stderr so consumer-visible result shape is byte-identical across transports

**12 new PTY-mode tests** + 11 pre-existing pipe-mode tests + 2 lifecycle tests (now explicitly pinned to interactive:false). Total: 23 tests in `watcher-shell.test.cjs`, all passing.

**`postinstall` script** in `package.json`: chmods the `node-pty` `spawn-helper` binary on darwin-arm64 / linux platforms because `npm`'s prebuild-install download doesn't preserve the executable bit.

## TDD Evidence

| Phase | Command | Exit Code | Expected | Status |
|---|---|---|---|---|
| RED | `node --test --test-timeout=30000 plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | non-zero | FAIL (correct — PTY-1 + PTY-7 fail before backend implemented) | PASS |
| GREEN | `node --test --test-timeout=15000 plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | 0 | PASS (all 23 tests) | PASS |
| REFACTOR | (skipped per TRD optional clause — code already clean) | n/a | n/a | SKIPPED |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Add node-pty + RED test list | `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | non-zero (PTY-1 + PTY-7 fail) | PASS (RED state correct) |
| 2: GREEN — PTY backend impl | `node --test --test-timeout=15000 plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | 0 | PASS |
| 3: REFACTOR | (skipped) | n/a | SKIPPED |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (per-file) | `node --test --test-timeout=15000 plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | 0 | PASS |
| test (npm full) | `npm test` | 1 | PASS conditional — 1864 pass + 2 pre-existing failures (E2E1 check-todos truncation, novel-domain test 22) — count matches expected baseline +12 PTY tests |

## Test Count Delta

- Pre-existing: 1852 pass + 2 known failures (per execution context)
- After 19-01: 1864 pass + 2 known failures
- Delta: **+12 tests** (exactly the 12 PTY-mode tests added)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] node-pty spawn-helper missing executable bit (darwin-arm64)**
- **Found during:** Task 2 (first GREEN attempt)
- **Issue:** `pty.spawn(...)` threw `Error: posix_spawnp failed.` because the prebuilt `spawn-helper` binary was downloaded without the `+x` bit
- **Fix:** Added `postinstall` script to `package.json` that chmods the helper for darwin-arm64 / darwin-x64 / linux-x64 / linux-arm64
- **Files modified:** `package.json`
- **Commit:** 310fdb4 (rolled into GREEN)

**2. [Rule 1 - Bug] PTY cooked-mode echo broke sentinel matching**
- **Found during:** Task 2 (PTY-2/4/5/6 failed with `stdout: 'hello\\r\\n'` and content drift)
- **Issue:** PTYs in cooked mode echo input back interleaved with output. The literal `__DFW_BEGIN_p-1__` token appears in echoed `echo __DFW_BEGIN_p-1__` line BEFORE bash's actual echo output, breaking `splitDispatchOutput`'s forward-scan
- **Fix:** Added `stty -echo 2>/dev/null` to the PTY init prelude + 100ms drain after spawn so subsequent dispatches see only program output (identical-shape to pipe mode)
- **Files modified:** `plugins/devflow/devflow/bin/lib/watcher-shell.cjs`
- **Commit:** 310fdb4 (rolled into GREEN)
- **Note:** TRD's claim that "echoed input is harmless prefix garbage" was incorrect for the actual sentinel layout used by this codebase. The fix is documented in the file's JSDoc.

**3. [Rule 1 - Bug] PTY \\r\\n line endings broke equality assertions**
- **Found during:** Task 2 (PTY-2 returned `stdout: 'hello\\r\\n'` instead of `'hello\\n'`)
- **Issue:** PTY cooked mode emits `\\r\\n` line endings; tests assert exact `\\n` shapes for transport-agnostic consumer compatibility
- **Fix:** Added `\\r\\n` → `\\n` normalization in `_tryComplete` (PTY mode only; pipe mode is a no-op)
- **Files modified:** `plugins/devflow/devflow/bin/lib/watcher-shell.cjs`
- **Commit:** 310fdb4 (rolled into GREEN)

**4. [Rule 1 - Bug] PTY socket FD leaked through dispatch-timeout path**
- **Found during:** Task 2 (test runner subprocess hung at exit after PTY-8 timeout test)
- **Issue:** `kill()` was updated to call `proc.destroy()` on PTY, BUT the dispatch-timeout path inside `dispatch()` set `_closed = true` without calling `destroy()`. Subsequent `withPTYSession` finally-block `kill()` returned early due to `_closed = true` guard, leaking the socket FD and holding the test runner subprocess alive forever
- **Fix:** Added `proc.destroy()` to the dispatch timeout setTimeout handler (PTY mode only)
- **Files modified:** `plugins/devflow/devflow/bin/lib/watcher-shell.cjs`
- **Commit:** 310fdb4 (rolled into GREEN)

**5. [Rule 3 - Blocking] Pre-existing lifecycle tests changed mode silently**
- **Found during:** Task 2 (test runner hangs traced to PTY mode)
- **Issue:** Existing tests at lines 95-110 of `watcher-shell.test.cjs` used `new ShellSession({ shell: SHELL })` without `interactive` option. Class default was `interactive: true`. Pre-PTY, `interactive: true` ran `bash -i` over pipes (no PTY). After our changes, `interactive: true` routes to PTY — silently changing test transport. TRD truth #3 says "All 11 existing tests pass unchanged with interactive:false" — the existing tests were never opted in to that mode explicitly
- **Fix:** Pinned both lifecycle tests to `interactive: false` explicitly so they stay pipe-mode (matching the TRD's intent)
- **Files modified:** `plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs`
- **Commit:** 310fdb4 (rolled into GREEN)

## Auth Gates

None.

## REFACTOR Pass

Skipped per TRD's optional clause. The implementation is already clean:

- Lazy `_loadPTY` keeps native dep out of module load
- `_writeRaw` private method is the single transport branch point
- Wrapped command builder is inline with dispatch (kept readable; not premature abstraction)
- JSDoc top-of-file already updated in GREEN commit to describe dual-mode design

## Pinned Versions

- `node-pty`: 1.1.0 (regular dependency, exact pin)

## Platform Install Issues Encountered (for 19-04 doc absorption)

1. **darwin-arm64 spawn-helper executable bit missing**: `npm install` prebuilt-install download didn't preserve `+x` on `node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper`. Symptom is `posix_spawnp failed.` from `pty.spawn(...)`. Fixed via `postinstall` script in `package.json`. **Documented in 19-04** under "macOS / Linux gotcha — spawn-helper executable bit".

## Commits

- `bf290ba` — `test(19-01): add failing PTY-mode test list for ShellSession` (RED)
- `310fdb4` — `feat(19-01): add PTY backend to ShellSession via node-pty` (GREEN)
- (REFACTOR skipped)

## Post-TRD Verification

- Auto-fix cycles used: 5 (all Rule 1/3, all in single GREEN attempt)
- Must-haves verified: 10/10 (all truths in frontmatter satisfied)
- Gate failures: 2 pre-existing (E2E1 check-todos 64KB truncation, novel-domain test 22) — confirmed not regressions vs. baseline 1852+2

## Self-Check: PASSED

- File `plugins/devflow/devflow/bin/lib/watcher-shell.cjs`: FOUND
- File `plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs`: FOUND
- File `package.json`: FOUND with `node-pty: 1.1.0`
- File `package-lock.json`: FOUND
- Commit `bf290ba`: FOUND
- Commit `310fdb4`: FOUND
