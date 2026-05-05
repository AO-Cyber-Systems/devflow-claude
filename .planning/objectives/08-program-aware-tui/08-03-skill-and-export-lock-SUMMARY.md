---
objective: 08-program-aware-tui
trd: "08-03"
subsystem: tui
tags: [tui, skill, export-lock, e2e, tdd, v1.1-final]
dependency_graph:
  requires: ["08-01", "08-02"]
  provides: ["/devflow:tui skill", "lib/tui.cjs locked surface (SC-9)", "e2e self-test gate (SC-10)"]
  affects: ["lib/tui.cjs", "lib/tui.test.cjs", "plugins/devflow/skills/tui/SKILL.md"]
tech_stack:
  added: []
  patterns: ["export-lock banner comment", "EX1 deepStrictEqual gate", "execSync e2e subprocess test", "SKILL.md thin orchestrator"]
key_files:
  created:
    - plugins/devflow/skills/tui/SKILL.md
  modified:
    - plugins/devflow/devflow/bin/lib/tui.cjs
    - plugins/devflow/devflow/bin/lib/tui.test.cjs
decisions:
  - "EX1 passed at RED because TRD 08-01/08-02 already produced exactly the 7-entry surface; EX3 (banner absent) was the true RED gate"
  - "SKILL_PATH corrected: TRD said '4 ups' from lib/ to reach skills/, but actual path is 3 ups (plugins/devflow/devflow/bin/lib → ../../.. → plugins/devflow/); correct relative path is ../../../skills/tui/SKILL.md"
  - "J4 added in Task 1 (RED) per TRD structure — soft integration gate that accepts placeholder-only output without failing; logs diagnostic hint to stderr"
  - "J1-J4 all passed at RED: TRD 08-02 wiring was solid, auto-fallback to --once --raw works correctly for non-TTY stdout"
  - "E2E timing: 87ms measured — well under 2s threshold"
metrics:
  duration: "226s (~3.75 min)"
  completed: "2026-05-05"
  tasks_completed: 3
  files_changed: 3
  commits: 2
---

# Objective 8 TRD 03: Skill and Export Lock Summary

**One-liner:** LOCKED banner on lib/tui.cjs (7-entry surface, SC-9) + /devflow:tui SKILL.md thin orchestrator (SC-6) + EX1/J1-J4/K1-K3 test gates (SC-10). Final TRD of v1.1.

## What Was Built

Three deliverables closing the final three SCs of Objective 8:

1. **lib/tui.cjs LOCKED surface (SC-9):** Added banner comment `LOCKED by TRD 08-03 (7-entry surface; SC-9)` preceding `module.exports`. Banner includes surface recount (1+3+1+2=7), DO-NOT-MODIFY guidance, and EX1 test reference. Surface itself was unchanged — TRD 08-01/08-02 had already produced exactly the intended 7 exports.

2. **/devflow:tui SKILL.md (SC-6):** Created `plugins/devflow/skills/tui/SKILL.md` as a thin orchestrator over `df-tools tui $ARGUMENTS`. Covers all modes (--once, --raw, --no-color, --reset-only), auto-fallback behavior, and guidance for the "terminal stuck" recovery case. Follows the check-todos/initiatives SKILL.md structural pattern exactly.

3. **Test gates (SC-10):** Added 10 new test cases across 3 groups:
   - Group EX (3): EX1 deepStrictEqual surface lock, EX2 render-is-function, EX3 banner text
   - Group J (4): J1 exit-0, J2 panel framing, J3 non-TTY no-hang, J4 integration sanity
   - Group K (3): K1 file exists, K2 frontmatter `name: tui`, K3 `df-tools tui` invocation

## Test Count by Group (all 3 TRDs)

| Group | TRD | Count | Description |
|---|---|---|---|
| A | 08-01 | 6 | render() public contract |
| B | 08-01 | 5 | _renderOrgPanel |
| C | 08-01 | 6 | _renderPeerPanel |
| D | 08-01 | 6 | _renderInitiativesPanel |
| E | 08-01 | 5 | _layoutPanels |
| F | 08-01 | 3 | opts.no_color contract |
| G | 08-01 | 9 | snapshot tests |
| X | 08-01 | 4 | fixture builder smoke tests |
| H | 08-02 | 7 | CLI flag parsing |
| I | 08-02 | 4 | _loadData composition contract |
| EX | 08-03 | 3 | export surface lock |
| J | 08-03 | 4 | E2E self-test |
| K | 08-03 | 3 | skill structural |
| **Total obj 8** | | **65** | |

**Pre-obj-8 baseline:** 1291 tests (after obj 6 complete)
**Post-obj-8 total:** 1356 tests pass, 0 fail, 24 skip

## TDD Evidence

| Phase | What | Exit Code | Status |
|---|---|---|---|
| RED | Add Groups EX, J, K | 4 fail (EX3, K1, K2, K3) | FAIL (correct) |
| GREEN | Banner to tui.cjs + create SKILL.md | 0 fail | PASS (correct) |

**RED gate:** EX1 passed at RED (surface already matched — not surprising since 08-01 locked it). EX3 was the true RED gate (banner absent). K1/K2/K3 failed as expected.

**J tests at RED:** J1/J2/J3/J4 all passed at RED — TRD 08-02 wiring was already solid. Tests serve as regression gates going forward.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — write Groups EX/J/K | `npm test \| grep -E '(EX\|J\|K)' \| tail -20` | 4 fail (expected RED) | PASS |
| 2: GREEN — banner + SKILL | `npm test \| tail -10` | 0 | PASS |
| 3: Closeout verification | `time node df-tools.cjs tui --once --raw > /tmp/tui-output.txt` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| e2e timing | `df-tools tui --once --raw` | 0, 87ms | PASS |
| e2e size | `/tmp/tui-output.txt` | 3820 bytes, 89 lines | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
  - /devflow:tui skill invokes `df-tools tui $ARGUMENTS`: PASS (K3)
  - lib/tui.cjs exports exactly 7 entries: PASS (EX1)
  - EX1 deepStrictEqual test asserts locked surface: PASS
  - Banner comment `LOCKED by TRD 08-03`: PASS (EX3)
  - `df-tools tui --once --raw` exits 0 (e2e): PASS (J1/J2)
  - Non-TTY pipe no-hang: PASS (J3)
- Gate failures: None

## Module Surface (Locked)

```
Object.keys(require('./lib/tui.cjs')).sort()
→ ["_layoutPanels","_renderInitiativesPanel","_renderOrgPanel","_renderPeerPanel","_resetMocks","_setRunStdout","render"]
```

7 entries. Banner present at line 277 of tui.cjs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Path math correction] SKILL_PATH relative path**
- **Found during:** Task 1 (RED)
- **Issue:** TRD said "4 ups" from lib/ to reach skills/ (`../../../../skills/tui/SKILL.md`), but `plugins/devflow/devflow/bin/lib/` is only 3 levels inside `plugins/devflow/`; the correct path is `../../../skills/tui/SKILL.md`
- **Fix:** Used `../../../skills/tui/SKILL.md` in the K group tests — verified with `path.resolve()` before writing
- **Evidence:** `path.resolve('/Users/.../lib', '../../../skills/tui/SKILL.md')` → `/Users/.../plugins/devflow/skills/tui/SKILL.md` (correct)
- **Commits:** f02a7c6

## Commits

| Hash | Message |
|---|---|
| f02a7c6 | `test(08-03): add export-lock + e2e + skill structural tests (RED)` |
| b82773b | `feat(08-03): lock tui module surface + add /devflow:tui skill` |

## Objective 8 Closeout

**SC-1 through SC-10 all met.**

| SC | Description | Closed by | Status |
|---|---|---|---|
| SC-1 | Awareness cache has peer + org sections | TRD 08-01/02 | DONE |
| SC-2 | Fault-tolerant peer scan | TRD 08-01 | DONE |
| SC-3 | Pure render function | TRD 08-01 | DONE |
| SC-4 | Snapshot tests committed | TRD 08-01 | DONE |
| SC-5 | Narrow terminal reflow (< 80 cols) | TRD 08-01 | DONE |
| SC-6 | /devflow:tui skill exists + invokes CLI | TRD 08-03 | DONE |
| SC-7 | Interactive mode (raw keypress, q/r) | TRD 08-02 | DONE |
| SC-8 | SC-8 resilience (never crashes) | TRD 08-01/02 | DONE |
| SC-9 | lib/tui.cjs surface locked (EX1 gate) | TRD 08-03 | DONE |
| SC-10 | E2E self-test: --once --raw exits 0 | TRD 08-03 | DONE |

**v1.1 milestone is COMPLETE.**

All 8 objectives done. Total v1.1 test suite: 1356 pass, 0 fail, 24 skip.
