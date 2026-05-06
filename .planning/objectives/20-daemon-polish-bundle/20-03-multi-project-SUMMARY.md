---
objective: 20-daemon-polish-bundle
trd: "03"
subsystem: daemon
tags: [multi-project, watching, atomic-mutation, tmp-rename, watcher-state]

requires:
  - objective: 19-pty-handoff-watcher
    provides: PID file with watching:[] schema (single-entry pre-20-03)
  - objective: 20-daemon-polish-bundle
    trd: "01"
    provides: Notifier deps forwarding through runLoop (same file)
provides:
  - lib/watcher-state.cjs addWatchedProject / removeWatchedProject (atomic tmp+rename)
  - lib/watcher-daemon.cjs runLoop iterates watching:[] each tick (re-reads PID file)
  - devflow-watch start --project p1,p2,p3 comma-list parsing
  - devflow-watch add-project / remove-project subcommands
  - cmdStatus emits projects:[], pending_counts:{}, done_counts:{} (back-compat scalars retained)
affects: [20-04 (status-line — depends on this PID schema)]

tech-stack:
  added: []  # no new deps; pure additions to existing modules
  patterns:
    - "Atomic PID-file mutation via tmp+rename (single writer = CLI; daemon read-only post-startup)"
    - "Re-read watching:[] every tick — lazy refresh, no IPC needed"
    - "Round-robin serial dispatch (NOT concurrent worker pool)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/watcher-state.cjs (addWatchedProject + removeWatchedProject + 2 new exports)
    - plugins/devflow/devflow/bin/lib/watcher-state.test.cjs (Group W 9 mutation tests + EX-1)
    - plugins/devflow/devflow/bin/lib/watcher-daemon.cjs (runLoop tick iterates watching:[])
    - plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs (Group D 8 multi-project tick tests)
    - plugins/devflow/devflow/bin/devflow-watch.cjs (cmdAddProject/cmdRemoveProject, comma-list, multi-project status)
    - plugins/devflow/devflow/bin/devflow-watch.test.cjs (Group C 8 multi-project CLI tests)
    - plugins/devflow/devflow/templates/config.json (daemon.multi_project flag)
    - docs/handoff-watcher-guide.md (Multi-project subsection + Subcommands extension)

key-decisions:
  - "PID file schema additive — single-project daemons (watching:[path]) unchanged shape; multi-entry just adds entries"
  - "Round-robin serial dispatch preserves 19-02 token-passing assumptions; no concurrency"
  - "add-project hard-fails (exit 2) when daemon dead — silent edit of stale PID file produces 'never picked up' mystery"
  - "remove-project idempotent (exit 0 when path absent OR daemon dead)"
  - "cmdStatus retains project (singular) + pending_count/done_count scalars for back-compat with external scripts"

patterns-established:
  - "Pattern: live-mutate PID file from CLI; daemon picks up changes on next tick (no SIGHUP/IPC)"
  - "Pattern: graceful in-flight dispatch on remove-project — don't abort, let it complete + write done record"

requirements-completed: [DAEMON-MULTI-PROJECT]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~40min
completed: 2026-05-06
---

# Objective 20 TRD 03: Multi-Project Watching Summary

**Single daemon watches multiple project dirs by iterating PID-file `watching:[]` array each tick; atomic tmp+rename mutations from `add-project` / `remove-project` CLI subcommands let users add/remove projects without restart; serial dispatch invariant preserved.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2 (RED + GREEN, bundled with 20-01 + 20-02 commits per shared-file conflict map)
- **Files modified:** 8 (watcher-state, watcher-state test, watcher-daemon, watcher-daemon test, devflow-watch, devflow-watch test, config, doc)
- **Commits:** 5cb5fe0 (Group D RED), bbb7b64 (runLoop iteration GREEN), 914299c (Group C RED), 192dfc9 (CLI GREEN)

## Accomplishments

- `state.addWatchedProject(path)` / `state.removeWatchedProject(path)` mutate the live PID file atomically via tmp+rename; both throw `ENOPIDFILE` when daemon dead.
- `runLoop` tick re-reads `watching:[]` from PID file each cycle; iterates projects; first project with pending wins this tick (round-robin). Falls back to `opts.projectRoot` when PID file null (back-compat for unit tests).
- `cmdStart` parses `--project p1,p2,p3` comma-list. `--project` warns on non-existent paths (doesn't reject — daemon polls for files later when dirs created post-start).
- `cmdAddProject` hard-fails (exit 2) with `start it first` guidance when daemon dead.
- `cmdRemoveProject` is idempotent (exit 0 when path absent OR daemon dead).
- `cmdStatus` JSON: `projects:[...]` (plural) + `project` (back-compat singular = projects[0]); `pending_counts:{p:N}` + `done_counts:{p:N}` per-project; `pending_count`/`done_count` scalars (sum across projects) for back-compat with external scripts.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED: 30 failing tests across state, daemon, CLI | `node --test ... watcher-state.test.cjs ... watcher-daemon.test.cjs ... devflow-watch.test.cjs` | 1 | FAIL (correct — funcs/cmds not yet implemented) |
| 2 GREEN: addWatchedProject/removeWatchedProject + runLoop iter + CLI subcommands | `node --test ... [same files]` | 0 | PASS (90/90 in those 3 files) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Group W state) | `node --test ... watcher-state.test.cjs` | 1 | FAIL (correct, addWatchedProject undefined) |
| GREEN (Group W state) | `node --test ... watcher-state.test.cjs` | 0 | PASS (correct, 31 tests; +10 from baseline) |
| RED (Group D daemon) | `node --test ... watcher-daemon.test.cjs` | 1 | FAIL (correct, runLoop ignores watching:[]) |
| GREEN (Group D daemon) | `node --test ... watcher-daemon.test.cjs` | 0 | PASS (correct, 38 tests; +8 from 20-01 baseline) |
| RED (Group C CLI) | `node --test ... devflow-watch.test.cjs` | 1 | FAIL (correct, subcommands don't exist) |
| GREEN (Group C CLI) | `node --test ... devflow-watch.test.cjs` | 0 | PASS (correct, 22 tests; +8 from baseline) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 (with 2 pre-existing failures unchanged) | PASS |

## Deviations from Plan

**1. [Rule 3 - Blocking] runLoop multi-project iteration shipped in 20-01 GREEN commit**
- **Found during:** 20-01 Task 2 (notifier processOnce wiring) — runLoop function needed editing for both notifier deps forwarding (20-01) AND multi-project tick (20-03). Two TRDs touch the SAME `runLoop` function in lib/watcher-daemon.cjs.
- **Issue:** Strict per-TRD commit boundary would require editing watcher-daemon.cjs twice (once for 20-01, once for 20-03), adding noise + churn.
- **Fix:** Bundled 20-03 runLoop tick + watcher-state mutation helpers into the 20-01 GREEN commit (bbb7b64). Commit message discloses dual-TRD scope. The CLI side (cmdAddProject/cmdRemoveProject/comma-list/status JSON) shipped in 192dfc9 (20-02+20-03 GREEN).
- **Outcome:** Same line-count, fewer commits, honest commit messages. 20-03 work is split RED in 5cb5fe0 (Group D tests), GREEN in bbb7b64 (runLoop iter + state mutations) + 192dfc9 (CLI surface).

## Self-Check: PASSED

- watcher-state.cjs exports include addWatchedProject + removeWatchedProject (10 entries): yes
- watcher-daemon runLoop reads watching:[] from PID file each tick: yes (3 references)
- devflow-watch add-project / remove-project / status multi-project shape: yes
- daemon.multi_project config flag present: yes
- "Multi-project watching" subsection in handoff-watcher-guide.md: yes
- Commits in git log: yes
