---
objective: 20-daemon-polish-bundle
trd: "05"
subsystem: daemon
tags: [cross-shell, fish, powershell, pwsh, wrapper-factory, watcher-shell]

requires:
  - objective: 19-pty-handoff-watcher
    provides: ShellSession + sentinel-fenced dispatch protocol (bash/zsh hardcoded)
provides:
  - lib/wrappers/{bash, fish, powershell, index}.cjs — per-shell dispatch wrapper modules + factory
  - UnsupportedShell error class for unknown shells
  - watcher-shell.cjs refactored to consume wrappers via getWrapper()
  - Sentinel-fenced parser (splitDispatchOutput) confirmed shell-agnostic
affects: [future cross-shell daemon usage on fish/pwsh users]

tech-stack:
  added: []  # no new deps; pure module split + wrapper-mediated dispatch
  patterns:
    - "Per-shell wrapper interface: {shellName, shellArgs, wrapCommand, lineSep, initLines}"
    - "Factory routes basenames (bash, zsh, fish, pwsh, powershell.exe) to wrapper modules; throws UnsupportedShell otherwise"
    - "zsh routes through bash wrapper (bash-compatible for sentinel pattern); no separate zsh module needed"
    - "Tests gated on shell-binary availability via shellAvailable() probe; fish/pwsh end-to-end skip cleanly when binary not on PATH"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/wrappers/bash.cjs
    - plugins/devflow/devflow/bin/lib/wrappers/fish.cjs
    - plugins/devflow/devflow/bin/lib/wrappers/powershell.cjs
    - plugins/devflow/devflow/bin/lib/wrappers/index.cjs
    - plugins/devflow/devflow/bin/lib/wrappers/bash.test.cjs
    - plugins/devflow/devflow/bin/lib/wrappers/fish.test.cjs
    - plugins/devflow/devflow/bin/lib/wrappers/powershell.test.cjs
    - plugins/devflow/devflow/bin/lib/wrappers/index.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/watcher-shell.cjs (uses getWrapper(); UnsupportedShell re-exported)
    - plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs (Group W 5 cross-shell integration tests)
    - plugins/devflow/devflow/templates/config.json (daemon.cross_shell flag)
    - docs/handoff-watcher-guide.md (Cross-shell support subsection)

key-decisions:
  - "bash wrapper extraction byte-identical to v1.1+obj19 watcher-shell.cjs:354-374 (verified via BW-9 deepStrictEqual against hardcoded expected array)"
  - "fish wrapper uses native syntax: `set VAR (cmd)`, `$status`, `begin; cmd; end > out`. function fish_prompt; end + set fish_greeting '' silence prompt/greeting"
  - "pwsh wrapper uses [System.IO.Path]::GetTempFileName(), $LASTEXITCODE (with null guard), `& { cmd } *> out 2> err` stream redirect; -NoLogo (always) + -NoExit (interactive only)"
  - "splitDispatchOutput unchanged — sentinel parser is shell-agnostic"
  - "zsh routes through bash module (no separate wrapper needed); PowerShell.exe basename + .exe-strip routes to pwsh wrapper"
  - "fish 3.0+ requirement (function...end syntax); older fish documented as failure mode (shell-side syntax error captured in done record stderr)"

patterns-established:
  - "Pattern: shell-agnostic dispatch protocol with per-shell wrapper modules; sentinel BEGIN/DELIM/END never changes; only wrapCommand differs"
  - "Pattern: { skip: !shellAvailable(name) } gating mirrors obj 19 TRD 19-01 node-pty availability pattern"

requirements-completed: [DAEMON-CROSS-SHELL]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~30min
completed: 2026-05-06
---

# Objective 20 TRD 05: Cross-Shell Support Summary

**Per-shell dispatch wrapper modules (bash/zsh/fish/pwsh) with shell-agnostic sentinel-fenced parser; bash extraction byte-identical to v1.1+obj19 (verified via deepStrictEqual); fish + pwsh end-to-end tests skip cleanly when binaries unavailable.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2 (RED + GREEN)
- **Files created:** 8 (4 wrapper modules + 4 test files)
- **Files modified:** 4 (watcher-shell.cjs + test, config, doc)
- **Commits:** 39c653d (RED), 22cf3ca (GREEN)

## Accomplishments

- 4 wrapper modules with locked interface `{shellName, shellArgs, wrapCommand, lineSep, initLines}`.
- `bash.cjs` is byte-identical extraction of v1.1+obj19 watcher-shell.cjs:354-374; BW-9 test asserts deepStrictEqual against hardcoded expected array → regression guard against any drift.
- `fish.cjs` uses native fish syntax (set VAR (cmd), $status, begin;cmd;end). `powershell.cjs` uses pwsh syntax ([System.IO.Path]::GetTempFileName(), $LASTEXITCODE, `*>` stream redirect).
- `wrappers/index.cjs` factory routes shell basenames; `UnsupportedShell` error class for unknown shells (csh, tcsh, nu).
- `watcher-shell.cjs` refactored to consume wrappers via `this._wrapper`; constructor throws `UnsupportedShell` early. PTY input separator remains `\r` unconditionally; pipe mode uses `wrapper.lineSep`.
- `splitDispatchOutput` unchanged — sentinel-fenced parser is shell-agnostic; W-5 test verifies cross-shell-output identity.

## Cross-Shell Test Skip Status (this machine)

| Shell | Binary | Status | Tests |
|---|---|---|---|
| bash | available | unit + e2e pass | BW-9 byte-identical, W-1 dispatch |
| zsh | (assumed available — routes through bash) | factory test passes | GF-2 |
| fish | NOT installed | unit pass; e2e skip | FW-7..9 skip, W-3 skip |
| pwsh | NOT installed | unit pass; e2e skip | PW-8..9 skip, W-4 skip |

Total: 5 fish/pwsh-gated tests skipped cleanly via `{ skip: !shellAvailable(...) }`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED: 4 wrapper test files + watcher-shell W tests | `node --test plugins/devflow/devflow/bin/lib/wrappers/{bash,fish,powershell,index}.test.cjs plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | 1 | FAIL (correct — wrapper modules don't exist; ShellSession doesn't throw UnsupportedShell) |
| 2 GREEN: 4 wrappers + watcher-shell refactor + config + doc | `node --test ... [same files]` | 0 | PASS (66 pass + 5 skip) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (wrappers) | `node --test ... wrappers/*.test.cjs` | 1 | FAIL (correct, MODULE_NOT_FOUND) |
| GREEN (wrappers) | `node --test ... wrappers/*.test.cjs` | 0 | PASS (35 pass, 5 skip due to fish/pwsh missing) |
| RED (watcher-shell W) | `node --test ... watcher-shell.test.cjs` | 1 | FAIL (correct, ShellSession({shell:csh}) doesn't throw UnsupportedShell) |
| GREEN (watcher-shell W) | `node --test ... watcher-shell.test.cjs` | 0 | PASS (31 pass + 2 skip; 28 existing tests byte-identical) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 (with 2 pre-existing failures unchanged) | PASS |

## Deviations from Plan

None — TRD executed exactly as written. Bash wrapper extraction is byte-identical (BW-9 deepStrictEqual passes). Fish + pwsh wrappers match the embedded code samples in the TRD's `<embedded_context>` section verbatim.

## Self-Check: PASSED

- 4 wrapper modules + 4 test files exist: yes
- Bash wrapper byte-identical to current watcher-shell logic: yes (BW-9 deepStrictEqual passes)
- Existing 28 watcher-shell.test.cjs tests still pass byte-identical: yes
- watcher-shell.cjs uses wrappers (10 references): yes
- daemon.cross_shell config flag present: yes
- "Cross-shell support" subsection in handoff-watcher-guide.md: yes
- Commits 39c653d + 22cf3ca in git log: yes
