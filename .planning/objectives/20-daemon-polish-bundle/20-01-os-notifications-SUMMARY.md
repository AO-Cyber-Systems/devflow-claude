---
objective: 20-daemon-polish-bundle
trd: "01"
subsystem: daemon
tags: [notifications, osascript, notify-send, subprocess, daemon-watch]

requires:
  - objective: 19-pty-handoff-watcher
    provides: ShellSession + watcher-daemon.processOnce dispatch hook
provides:
  - lib/notifier.cjs — async OS notification dispatcher (osascript + notify-send)
  - watcher-daemon.cjs processOnce hook for dispatch-start/dispatch-complete
  - templates/config.json daemon.notifications block (off by default)
  - docs/handoff-watcher-guide.md OS notifications subsection
affects: [20-02, 20-03, 20-04, 20-05]

tech-stack:
  added: [child_process.execFile (no new npm deps)]
  patterns:
    - "subprocess shim with marker-file capture for unit tests"
    - "_runExec injection seam mirroring gh.cjs _setRunGh pattern"
    - "Module-level _notifierDisabled state with _resetMocks() escape hatch"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/notifier.cjs
    - plugins/devflow/devflow/bin/lib/notifier.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/osascript-shim.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/notify-send-shim.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/watcher-daemon.cjs (notifier hook in processOnce)
    - plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs (Group I 7 tests)
    - plugins/devflow/devflow/bin/devflow-watch.cjs (config-driven notifier wire-up)
    - plugins/devflow/devflow/templates/config.json (daemon block)
    - docs/handoff-watcher-guide.md (OS notifications subsection)

key-decisions:
  - "subprocess shim approach (osascript/notify-send) chosen over node-notifier npm dep"
  - "ENOENT first-call disables notifier for session, single warning, no per-dispatch spam"
  - "NOTIFIER_DISABLE=1 env var as opt-out independent of config (per-process bypass)"
  - "execFile + array argv (NOT exec + shell-string) prevents shell injection from pending.cmd"

patterns-established:
  - "Pattern: notifier opt-in via .planning/config.json daemon.{notifications,notify_on_start,notify_on_complete}"
  - "Pattern: dispatch hook errors caught + ignored; never block dispatch or done-record"

requirements-completed: [DAEMON-NOTIFICATIONS]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~30min
completed: 2026-05-06
---

# Objective 20 TRD 01: OS Notifications Summary

**OS desktop notifications via osascript (macOS) / notify-send (Linux) subprocess dispatcher, daemon-hook-injected at dispatch-start/dispatch-complete, off by default, executable-shim test fixtures avoid real OS notifications during CI.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2 (RED + GREEN)
- **Files created:** 5 (notifier.cjs + .test + 3 fixtures)
- **Files modified:** 5 (watcher-daemon, devflow-watch, config, doc, daemon-test)
- **Commits:** 5cb5fe0 (RED) + bbb7b64 (GREEN)

## Accomplishments

- Async `notify({title, body, urgency?, log?})` with platform routing (darwin/linux/no-op).
- Module-level `_notifierDisabled` state with one-warning-per-session ENOENT semantics.
- `_runExec` injection seam mirrors gh.cjs `_setRunGh` pattern for testability.
- watcher-daemon `processOnce` wires notifier on dispatch-start AND dispatch-complete via `deps.notifier`. Notifier errors caught + swallowed — dispatch and done-record write never blocked.
- Executable shim fixtures (osascript-shim.cjs / notify-send-shim.cjs) drop JSONL marker files; tests prepend a per-test bin dir to PATH; no real OS notifications during test runs.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED: failing tests + shim fixtures | `node --test plugins/devflow/devflow/bin/lib/notifier.test.cjs` | 1 | FAIL (correct — module not found) |
| 2 GREEN: notifier.cjs + processOnce hook + config + doc | `node --test plugins/devflow/devflow/bin/lib/notifier.test.cjs plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs` | 0 | PASS (52/52) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (notifier) | `node --test ... notifier.test.cjs` | 1 | FAIL (correct) |
| GREEN (notifier) | `node --test ... notifier.test.cjs` | 0 | PASS (correct, 14 tests) |
| RED (daemon Group I) | `node --test ... watcher-daemon.test.cjs` | 1 | FAIL (correct, 7 new tests fail because deps.notifier hook not wired) |
| GREEN (daemon Group I) | `node --test ... watcher-daemon.test.cjs` | 0 | PASS (correct, 7 new tests pass; 38 total) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 (with 2 pre-existing failures unchanged) | PASS |

## Deviations from Plan

**1. [Rule 3 - Blocking] Bundled 20-03 RED+GREEN partial into 20-01 commits**
- **Found during:** Task 2 (GREEN) — runLoop multi-project iteration touches the SAME `runLoop` function as the notifier deps forwarding; can't cleanly split per-TRD without re-writing watcher-daemon.cjs twice.
- **Issue:** 20-01 GREEN commit (bbb7b64) includes runLoop multi-project tick changes (TRD 20-03 lib-side work) because Group D tests for 20-03 live in the same watcher-daemon.test.cjs file and their RED commit was bundled with 20-01's RED. The change set is logically coherent (single-file edits to watcher-daemon.cjs) but spans two TRDs.
- **Fix:** 20-02+20-03 GREEN commit (192dfc9) carries the CLI side of 20-03 (cmdAddProject / cmdRemoveProject / status JSON multi-project shape / start --project comma-list).
- **Files affected:** plugins/devflow/devflow/bin/lib/watcher-daemon.cjs, watcher-state.cjs
- **Commits:** 5cb5fe0 (RED includes 20-03 D tests), bbb7b64 (GREEN includes runLoop iteration), 192dfc9 (CLI surface)
- **Outcome:** 4 commits total cover both 20-01 + 20-03 work; commit messages honestly disclose dual-TRD scope.

## Self-Check: PASSED

- notifier.cjs exists: yes
- notifier.test.cjs 14/14 tests pass: yes
- watcher-daemon.test.cjs 38/38 tests pass: yes
- daemon.notifications config block in templates/config.json: yes
- "OS notifications" subsection in handoff-watcher-guide.md: yes
- Commits 5cb5fe0 + bbb7b64 in git log: yes
