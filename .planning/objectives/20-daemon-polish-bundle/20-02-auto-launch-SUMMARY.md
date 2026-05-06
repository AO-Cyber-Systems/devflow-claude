---
objective: 20-daemon-polish-bundle
trd: "02"
subsystem: daemon
tags: [auto-launch, launchd, systemd, plist, service-installer]

requires:
  - objective: 19-pty-handoff-watcher
    provides: devflow-watch CLI with start/stop subcommands
provides:
  - lib/service-installer.cjs — cross-platform user-domain service file generator
  - launchd plist (~/Library/LaunchAgents) + systemd-user unit (~/.config/systemd/user)
  - devflow-watch install-service / uninstall-service subcommands
  - --install-service flag chains on `start`; --uninstall-service chains on `stop`
affects: [20-03, 20-04, 20-05]

tech-stack:
  added: [child_process.execFile (launchctl, systemctl), template-string XML/INI generation]
  patterns:
    - "Atomic service-file write via tmp+rename (mirrors writeDoneRecord)"
    - "Idempotent install: try-unload-then-load on darwin, daemon-reload+enable+start on linux"
    - "User-domain only (no privilege elevation): ~/Library/LaunchAgents + ~/.config/systemd/user"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/service-installer.cjs
    - plugins/devflow/devflow/bin/lib/service-installer.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/launchctl-shim.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/systemctl-shim.cjs
  modified:
    - plugins/devflow/devflow/bin/devflow-watch.cjs (cmdInstallService/cmdUninstallService)
    - plugins/devflow/devflow/bin/devflow-watch.test.cjs (Group C 5 install-service tests)
    - plugins/devflow/devflow/templates/config.json (daemon.auto_launch flag)
    - docs/handoff-watcher-guide.md (Auto-launch subsection + Subcommands extension)

key-decisions:
  - "user-domain only — no /Library/LaunchDaemons or /etc/systemd/system; opt-in privilege elevation deferred to v1.3+"
  - "/usr/bin/env node ... in ProgramArguments / ExecStart for portability across nvm/asdf/system Node"
  - "Reverse-DNS Label = com.aocyber.devflow-watch (locked per CONTEXT decision)"
  - "Render templates via plain template strings — no plist/ini library deps; xmlEscape for plist values; systemd unit needs no escape semantics"

patterns-established:
  - "Pattern: render(...) -> install(...) -> uninstall(...) module shape with atomic tmp+rename writes and shim-injected execFile for unit tests"

requirements-completed: [DAEMON-AUTO-LAUNCH]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~35min
completed: 2026-05-06
---

# Objective 20 TRD 02: Auto-Launch Summary

**Cross-platform user-domain service installer (launchd plist on macOS, systemd-user unit on Linux) with atomic tmp+rename writes and idempotent install/uninstall via injected `_runExec` for shim-based testing.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 (RED + GREEN)
- **Files created:** 4 (service-installer.cjs + .test + 2 shims)
- **Files modified:** 4 (devflow-watch, devflow-watch test, config, doc)
- **Commits:** 914299c (RED includes 20-02+20-03 CLI tests), 192dfc9 (GREEN)

## Accomplishments

- `installService({platform, projectRoot, devflowWatchPath})` writes plist (darwin) or unit (linux), then orchestrates launchctl unload-then-load (darwin) / systemctl daemon-reload+enable+start (linux).
- `uninstallService({platform})` is idempotent — tolerates missing files, unloaded services, missing systemctl. Always returns success.
- `renderLaunchdPlist` + `renderSystemdUnit` are pure functions with full unit-test coverage; no I/O during render.
- `xmlEscape` covers all 5 entities (`& < > ' "`) — projectRoot with special chars renders safely.
- CLI: `install-service` / `uninstall-service` subcommands; `--install-service` flag chains on `start`; `--uninstall-service` chains on `stop`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED: failing tests + shim fixtures | `node --test plugins/devflow/devflow/bin/lib/service-installer.test.cjs` | 1 | FAIL (correct — module not found) |
| 2 GREEN: service-installer + CLI + config + doc | `node --test plugins/devflow/devflow/bin/lib/service-installer.test.cjs plugins/devflow/devflow/bin/devflow-watch.test.cjs` | 0 | PASS (48/48) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (service-installer) | `node --test ... service-installer.test.cjs` | 1 | FAIL (correct, MODULE_NOT_FOUND) |
| GREEN (service-installer) | `node --test ... service-installer.test.cjs` | 0 | PASS (correct, 26 tests) |
| RED (CLI Group C) | `node --test ... devflow-watch.test.cjs` | 1 | FAIL (correct, install-service subcommand routes don't exist) |
| GREEN (CLI Group C) | `node --test ... devflow-watch.test.cjs` | 0 | PASS (correct, 22 tests, +13 from baseline) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 (with 2 pre-existing failures unchanged) | PASS |

## Deviations from Plan

None — TRD executed exactly as written. Implementation matches the embedded code samples in the TRD's `<embedded_context>` section verbatim.

## Self-Check: PASSED

- service-installer.cjs exists with locked export surface: yes
- service-installer.test.cjs 26/26 pass: yes
- devflow-watch.test.cjs Group C 5 install-service tests pass: yes
- daemon.auto_launch config flag present: yes
- "Auto-launch (launchd / systemd)" subsection in handoff-watcher-guide.md: yes
- Commits 914299c + 192dfc9 in git log: yes
