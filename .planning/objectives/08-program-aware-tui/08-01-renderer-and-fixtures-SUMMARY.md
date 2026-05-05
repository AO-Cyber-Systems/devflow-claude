---
objective: 08-program-aware-tui
job: "08-01"
subsystem: tui
tags: [ansi, terminal, render, snapshot, tdd, pure-function]

requires: []

provides:
  - "lib/tui.cjs: pure ANSI renderer with render() + 3 sub-renderers + _layoutPanels + ANSI helpers (287 lines)"
  - "lib/tui.test.cjs: 44-test suite across 8 groups (A-G + X) with 9 snapshot assertions"
  - "lib/__fixtures__/tui-fixtures.cjs: 9 hand-built fixture builders"
  - "lib/__fixtures__/tui-snapshots/*.txt: 9 committed ANSI snapshot files (967–1917 bytes each)"

affects:
  - "08-02-cli-and-terminal-control (imports render() from tui.cjs)"
  - "08-03-skill-and-export-lock (finalizes tui.cjs export surface)"

tech-stack:
  added: []
  patterns:
    - "Pure renderer pattern: render(input) → string, no I/O, no Date.now, no env reads"
    - "Snapshot test discipline: hand-written snapshots committed before RED; never auto-regenerated on mismatch"
    - "ANSI sanitization: _sanitize() replaces ESC bytes in user-supplied data with '?' (injection prevention)"
    - "Code-point-safe truncation: _truncate() uses [...str] spread (emoji/CJK safe)"
    - "no_color contract: strips \\x1b[3{0..7}m FG sequences only; BOLD/DIM/RESET survive"
    - "Narrow-terminal reflow: cols < 80 → single-column stacked layout; cols >= 80 → box-drawing frame"

key-files:
  created:
    - "plugins/devflow/devflow/bin/lib/tui.cjs"
    - "plugins/devflow/devflow/bin/lib/tui.test.cjs"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/default-80x24.txt"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/narrow-60x24.txt"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-org.txt"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-initiatives.txt"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-peer.txt"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/all-empty.txt"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/no-color.txt"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/tall-data.txt"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/unicode-text.txt"
  modified: []

key-decisions:
  - "Snapshots written manually after inspecting actual output; never auto-regenerated (mirrors cassette discipline from obj 1)"
  - "_sanitize() replaces ESC byte with '?' to prevent ANSI injection from adversarial branch names / org titles"
  - "no_color contract: only FG color codes stripped (\\x1b[3xm); structural escapes (BOLD, DIM, RESET) preserved"
  - "_truncate() uses [...str].length for code-point-safe emoji/CJK width measurement"
  - "opts.cols < 80 threshold for narrow-terminal single-column layout (matches CONTEXT.md decision #5)"
  - "ORG_TRUNCATE_LIMIT=3 for both org items/quarter and initiatives; PANEL_TRUNCATE_LIMIT=5 for peer branches"

patterns-established:
  - "TUI fixture builders follow same hand-built factory pattern as awareness-fixtures.cjs"
  - "Snapshot RED: empty files committed; GREEN: actual output inspected, then written to file; no auto-write"

requirements-completed: [SC-1, SC-2, SC-3, SC-7, SC-8]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 6min
completed: 2026-05-05
---

# Objective 08 TRD 01: Renderer and Fixtures Summary

**Hand-rolled ANSI TUI renderer (render() + 3 sub-renderers + _layoutPanels) with 44 snapshot tests proving determinism, resilience, no_color contract, and narrow-terminal reflow**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-05T21:28:11Z
- **Completed:** 2026-05-05T21:34:11Z
- **Tasks:** 3 (fixture builders → RED tests → GREEN implementation)
- **Files created:** 13 (1 renderer, 1 test file, 1 fixtures module, 9 snapshot files, 1 snapshots dir)

## Accomplishments

- `lib/tui.cjs` (287 lines): pure `render()` + `_renderOrgPanel` + `_renderPeerPanel` + `_renderInitiativesPanel` + `_layoutPanels` + ANSI helpers; 7 exports locked per SC-9 surface
- 9 hand-built fixture builders in `tui-fixtures.cjs`; all data hand-written or bounded `repeat()` — no LLM-generated test data
- 44 passing tests across 8 groups (A-G + X); Groups A-F and X all passed at first GREEN; Group G (snapshots) required manual snapshot generation
- Zero regressions: 1291 pre-existing tests still pass (1335 total after adding 44 new tests)

## Test Count by Group

| Group | Description | Cases |
|---|---|---|
| A | render() public contract | 6 |
| B | _renderOrgPanel | 5 |
| C | _renderPeerPanel | 6 |
| D | _renderInitiativesPanel | 6 |
| E | _layoutPanels combinator | 5 |
| F | opts.no_color contract | 3 |
| G | Snapshot tests | 9 |
| X | Fixture builder smoke tests | 4 |
| **Total** | | **44** |

## Snapshot File Sizes

| File | Bytes | Scenario |
|---|---|---|
| `default-80x24.txt` | 1553 | Happy-path 80×24 render |
| `narrow-60x24.txt` | 742 | Narrow (< 80 col) single-column reflow |
| `empty-org.txt` | 1402 | null orgChain → "(no org context)" |
| `empty-initiatives.txt` | 1265 | initiatives: [] → "(no initiatives)" |
| `empty-peer.txt` | 1406 | awareness.branches: [] → "(no peer sessions)" |
| `all-empty.txt` | 967 | All 3 sources empty/null |
| `no-color.txt` | 1543 | FG colors stripped; BOLD/DIM/RESET preserved |
| `tall-data.txt` | 1917 | 12 branches + 10 initiatives → per-panel truncation |
| `unicode-text.txt` | 1307 | Emoji + CJK + 2000-char why + embedded ESC sanitized |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builders | `node -e "const f=require('./plugins/.../tui-fixtures.cjs'); const a=f.buildTuiAggregate({}); console.log(Object.keys(a));"` | 0 | PASS |
| 2: RED test suite | `npm test 2>&1 \| grep -E 'fail'` | 1 | FAIL (correct RED) |
| 3: GREEN implementation | `npm test 2>&1 \| tail -8` | 0 | PASS |

## Task Commits

1. **Task 1: Hand-built fixture builders** — `432f958` (chore)
2. **Task 2: RED — failing test list + empty snapshots** — `d92b239` (test)
3. **Task 3: GREEN — tui.cjs + filled snapshots** — `68b65ff` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1335/1335, 0 fail) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test 2>&1 \| tail -8` (before tui.cjs) | 1 | FAIL — MODULE_NOT_FOUND (correct) |
| GREEN | `npm test 2>&1 \| tail -8` (after tui.cjs + snapshots) | 0 | PASS — 1335/1335 (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 7/7 (all TRD truths confirmed)
  - render() deterministic: `a === b` for same input — PASS
  - render() never throws on null/empty: `render(null)`, `render({})` — PASS
  - render() reflows cols < 80 → single-column: E3 test + narrow snapshot — PASS
  - Sub-renderers return string for any input shape: Groups B/C/D — PASS
  - no_color strips FG colors only: F1/F2/F3 tests + no-color snapshot — PASS
  - 9 snapshot tests byte-equal: Group G — PASS
  - Exports surface is 7 entries: `Object.keys(module.exports).length === 7` — PASS
- **Gate failures:** None

## Files Created

- `plugins/devflow/devflow/bin/lib/tui.cjs` — Pure renderer; exports: render, _renderOrgPanel, _renderPeerPanel, _renderInitiativesPanel, _layoutPanels, _setRunStdout, _resetMocks (287 lines)
- `plugins/devflow/devflow/bin/lib/tui.test.cjs` — 44-test suite (419 lines)
- `plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs` — 9 fixture builders (340 lines)
- `plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/*.txt` — 9 committed snapshots

## Decisions Made

- Snapshot files written manually after visual inspection of actual ANSI output — prevents silent regression capture on first run (mirrors obj 1 cassette discipline)
- `_sanitize()` replaces ESC byte (0x1b) with `?` in all user-supplied text — prevents ANSI injection from adversarial branch names/org titles (unicode-text snapshot pins this)
- no_color contract: `\x1b[3{0..7}m` FG sequences stripped; `\x1b[1m` BOLD, `\x1b[2m` DIM, `\x1b[0m` RESET preserved (structural vs. decorative distinction)
- `_truncate()` uses `[...str].length` (code-point iteration, not `.length`) for emoji/CJK width safety
- `ORG_TRUNCATE_LIMIT=3` for both org items and initiatives per panel; `PANEL_TRUNCATE_LIMIT=5` for peer branches (wider but still bounded)

## Deviations from Plan

None — TRD executed exactly as written. No auto-fixes, no Rule 4 stops. Snapshot generation followed the TRD's documented procedure (run → inspect → write → verify).

## Next Objective Readiness

- `lib/tui.cjs` is stable and ready for TRD 08-02 to import: `render()` surface is complete; only the export-lock banner comment remains for 08-03
- The 7-export surface (`render, _renderOrgPanel, _renderPeerPanel, _renderInitiativesPanel, _layoutPanels, _setRunStdout, _resetMocks`) is fully functional and tested
- Snapshot tests will catch any inadvertent changes to render output in TRD 08-02/08-03 (regression guard)

---
*Objective: 08-program-aware-tui*
*Completed: 2026-05-05*
