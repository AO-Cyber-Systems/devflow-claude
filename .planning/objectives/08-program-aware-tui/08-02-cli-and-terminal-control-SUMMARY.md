---
objective: 08-program-aware-tui
job: "08-02"
subsystem: tui
tags: [terminal, ansi, raw-mode, alt-screen, cli, signal-handlers, tty]

requires:
  - objective: 08-01
    provides: "lib/tui.cjs pure ANSI renderer with render() surface"

provides:
  - "lib/tui-cli.cjs: CLI router + raw-mode session + signal handlers + idempotent cleanup (231 lines)"
  - "df-tools tui: new subcommand routed to cmdTuiRoute"
  - "Group H (7 tests): _parseFlags coverage — --once, --raw implies --once, --no-color, --reset-only, unknown flags, positional ignore"
  - "Group I (4 tests): _loadData composition contract — shape, no-throw, warnings array, todos null"

affects:
  - "08-03-skill-and-export-lock (depends on cmdTuiRoute being stable)"

tech-stack:
  added: []
  patterns:
    - "Idempotent cleanup: _cleaned boolean guard; SIGINT during exit handler safe"
    - "Non-TTY auto-fallback: !process.stdout.isTTY || !process.stdin.isTTY → --once --raw, warning to stderr"
    - "Key dispatch: process.stdin 'data' event, single-byte ASCII, hand-rolled (no readline/keypress libs)"
    - "Reset-only hatch: --reset-only emits \\x1b[?25h\\x1b[?1049l\\x1b[0m for kill-9 recovery"

key-files:
  created:
    - "plugins/devflow/devflow/bin/lib/tui-cli.cjs"
  modified:
    - "plugins/devflow/devflow/bin/df-tools.cjs"
    - "plugins/devflow/devflow/bin/lib/tui.test.cjs"

key-decisions:
  - "Idempotent cleanup guard (_cleaned flag): multiple signals during exit are real; double-cleanup must not throw"
  - "Non-TTY auto-fallback forced when !process.stdout.isTTY || !process.stdin.isTTY; explicit warning to stderr"
  - "Hand-rolled key dispatch: no readline/keypress libraries (locked decision #1); process.stdin 'data' event + single-byte ASCII"
  - "process.exit(0) called after explicit cleanup(), not before; cleanup may still write to stdout"
  - "--raw implies --once in the flag parser (not a post-parse concern)"
  - "lib/tui.cjs was NOT modified (renderer surface stable from 08-01)"

patterns-established:
  - "cmdTuiRoute follows exact same shape as cmdCheckTodosRoute (cwd, args, raw parameter pattern)"
  - "_loadData returns 5-key shape: { awareness, initiatives, orgChain, todos, warnings }; todos=null reserved v1.2"
  - "cleanup registered on process.on('exit') so it runs regardless of how the process ends"

requirements-completed: [SC-4, SC-5]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

duration: 6min
completed: 2026-05-05
---

# Objective 08 TRD 02: CLI and Terminal Control Summary

**Hand-rolled interactive TUI session: alt-screen + raw stdin + r/q/Ctrl-C key dispatch + idempotent signal-handler cleanup; df-tools tui routes to cmdTuiRoute with non-TTY auto-fallback**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-05T21:38:17Z
- **Completed:** 2026-05-05T21:44:00Z
- **Tasks:** 2 automated + 1 checkpoint (human-verify)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `lib/tui-cli.cjs` (231 lines): cmdTuiRoute + _runInteractive + _runOneShot + _runResetOnly + _parseFlags + _loadData + _readCurrentRepo + idempotent _cleanup
- `df-tools tui` wired in df-tools.cjs main() switch; `df-tools tui --once --raw` renders live org/peer/initiatives data to stdout in ~89 lines of ANSI
- 11 new tests (Group H: 7 flag-parse + Group I: 4 composition); total suite: 1370 tests, 1345 pass, 1 pre-existing failure (E2E1, unrelated)
- Non-TTY auto-fallback confirmed: running under Bash tool (no TTY) emits warning and renders cleanly
- `--reset-only` recovery hatch emits `\x1b[?25h\x1b[?1049l\x1b[0m` and exits 0

## Test Count Added

| Group | Description | Cases |
|---|---|---|
| H | CLI flag parsing (_parseFlags) | 7 |
| I | _loadData composition contract | 4 |
| **Total new** | | **11** |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Create lib/tui-cli.cjs | `node -e "const c = require('./plugins/devflow/devflow/bin/lib/tui-cli.cjs'); console.log(Object.keys(c).sort());"` | 0 | PASS |
| 1: _parseFlags --raw implies --once | `node -e "const c = require(...); console.log(c._parseFlags(['--raw']));"` | 0 | PASS |
| 1: _loadData shape + no-throw | `node -e "const c = require(...); const d = c._loadData(process.cwd()); console.log(Object.keys(d).sort());"` | 0 | PASS |
| 2: Test count +11 | `npm test 2>&1 \| grep -E 'tests\|pass\|fail'` | 0 | PASS (1370/1345/1) |
| 2: CLI smoke test --once --raw | `node plugins/.../df-tools.cjs tui --once --raw 2>&1 \| head -10` | 0 | PASS |
| 2: Non-TTY fallback | `node plugins/.../df-tools.cjs tui 2>&1 \| head -3` | 0 | PASS (warning + render) |
| 2: Reset-only | `node plugins/.../df-tools.cjs tui --reset-only; echo $?` | 0 | PASS |
| 2: Pipe-friendly | `node plugins/.../df-tools.cjs tui --once --raw \| wc -l` | 0 | PASS (89 lines) |
| 3: Interactive mode | Manual terminal verification | — | PENDING checkpoint |

## Task Commits

1. **Task 1: Create lib/tui-cli.cjs** — `208553a` (feat)
2. **Task 2: Wire df-tools.cjs + Group H/I tests** — `e5891c1` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1370 tests, 1345 pass, 1 pre-existing fail: E2E1) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 7/8 (7 automated + 1 pending manual interactive-mode checkpoint)
  - `df-tools tui` opens alt-screen raw-mode session: PASS (code verified; manual checkpoint pending)
  - `r` keypress re-renders without leaving alt-screen: PASS (code verified; manual checkpoint pending)
  - `q` keypress exits cleanly (cursor restored, alt-screen released, raw mode released, exit 0): PASS (code verified)
  - SIGINT (Ctrl-C) exits with cleanup + exit 130: PASS (code verified)
  - EOF on stdin exits with cleanup + exit 0: PASS (code verified; `process.stdin.on('end')`)
  - Non-TTY auto-switches to --once --raw: PASS (verified under Bash tool)
  - `df-tools tui --once` renders once + exits: PASS (verified)
  - `df-tools tui --raw` writes ANSI to stdout (pipe-friendly): PASS (89 lines, no hang)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/tui-cli.cjs` — CLI router (cmdTuiRoute), interactive session (_runInteractive), one-shot mode (_runOneShot), reset-only hatch, flag parser (_parseFlags), data loader (_loadData), idempotent cleanup (_cleanup); 231 lines
- `plugins/devflow/devflow/bin/df-tools.cjs` — Added `const { cmdTuiRoute } = require('./lib/tui-cli.cjs')` import + `case 'tui':` arm in main() switch
- `plugins/devflow/devflow/bin/lib/tui.test.cjs` — Added Group H (7 tests) + Group I (4 tests); 73 lines added

## Renderer Surface Stability

`lib/tui.cjs` was NOT modified. The renderer surface established in TRD 08-01 (render, _renderOrgPanel, _renderPeerPanel, _renderInitiativesPanel, _layoutPanels, _setRunStdout, _resetMocks — 7 exports, 287 lines) is unchanged. All 44 snapshot tests still pass.

## Decisions Made

- Idempotent cleanup via `_cleaned` boolean guard — SIGINT during the exit handler fires multiple cleanup invocations; the guard ensures writes to stdout happen exactly once
- Non-TTY auto-fallback triggers on `!process.stdout.isTTY || !process.stdin.isTTY`; no guard for explicit `--interactive` override in v1.1 (out of scope)
- `--raw` implies `--once` in the parser itself (not a post-parse derivation), so `_parseFlags(['--raw'])` returns `{ once: true, raw: true }`
- Hand-rolled key dispatch over process.stdin 'data' event with `setEncoding('utf8')` so chunks arrive as strings; multi-byte input (arrow keys, paste) iterated char-by-char; non-r/q chars silently ignored

## Deviations from Plan

None — TRD executed exactly as written. The implementation follows the TRD's prescribed code structure verbatim.

## Issues Encountered

None — all verifications passed on first attempt. The pre-existing E2E1 failure (roadmap self-test drift) was present in baseline (1334/1359) and is unchanged.

## Next Objective Readiness

- `lib/tui-cli.cjs` cmdTuiRoute is stable and wired; TRD 08-03 can proceed with skill-and-export-lock work
- Interactive mode human-verify checkpoint (Task 3) is pending — orchestrator must resume with "approved" or failure description after manual terminal test
- `lib/tui.cjs` surface is unchanged from 08-01; 08-03 export-lock banner can be applied without conflict

---
*Objective: 08-program-aware-tui*
*Completed: 2026-05-05*
