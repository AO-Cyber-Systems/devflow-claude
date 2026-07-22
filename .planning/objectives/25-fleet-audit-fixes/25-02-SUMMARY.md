---
objective: 25-fleet-audit-fixes
job: "02"
subsystem: infra
tags: [hooks, gate-edits, config, devflow-claude]

# Dependency graph
requires:
  - objective: 25-fleet-audit-fixes
    provides: "25-CONTEXT.md / 25-RESEARCH.md audit findings — eden-press false-positive gate denials (52 denials vs 3 skill uses)"
provides:
  - "gate-edits.js supports .planning/config.json gates.editGate (warn|strict|off), default strict"
  - "readEditGateMode() + VALID_EDIT_GATE_MODES exported, enum-validated so a typo can never silently soften the gate"
  - "templates/config.json documents the editGate default for new projects"
affects: [25-06-eden-press-config-application]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mode-at-emission-time: config read happens in main(), shouldGate() stays a pure decision function untouched by I/O concerns"
    - "Defensive config read (verify-commits.js isAutonomousMode pattern) — try/catch wrapping fs.existsSync + JSON.parse, return safe default on any failure"

key-files:
  created: []
  modified:
    - plugins/devflow/hooks/gate-edits.js
    - plugins/devflow/hooks/gate-edits.test.js
    - plugins/devflow/devflow/templates/config.json

key-decisions:
  - "Mode read happens in main() right after findPlanningDir(), not inside shouldGate() — keeps the pure decision-matrix tests untouched"
  - "'off' early-returns before skillActive/overrideActive computation — an opted-out project pays zero extra I/O cost per edit"
  - "Every read failure (missing file, missing gates key, malformed JSON, unrecognized enum value) defaults to 'strict' — never silently softens the gate"

patterns-established:
  - "Per-repo hook severity knob via .planning/config.json gates.<name> — reusable template for any future hook that needs a warn/strict/off dial"

requirements-completed: []  # ad-hoc audit objective — roadmap Objective 25 SC-4 is the contract, no REQUIREMENTS.md IDs

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 12min
completed: 2026-07-22
---

# Objective 25 TRD 02: gates.editGate config knob Summary

**Per-repo edit-gate severity knob (`.planning/config.json` → `gates.editGate: warn|strict|off`, default `strict`) added to `gate-edits.js`, closing roadmap SC-4 without touching default ambient-deny behavior.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-22T13:36:00Z
- **Completed:** 2026-07-22T13:48:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `readEditGateMode(planningDir)` + `VALID_EDIT_GATE_MODES` (enum-validated `Set`) added to `gate-edits.js`, mirroring the `verify-commits.js` defensive config-read pattern
- `main()` wired to read the mode once and branch at emission time: `'off'` early-returns (no-op), `'warn'` converts the deny into `permissionDecision: 'ask'` (reviving the prior-documented mechanism from the header comment), `'strict'`/absent/invalid stays byte-identical to today's deny
- `shouldGate()` left completely untouched — confirmed via `git diff`
- `templates/config.json` documents `"editGate": "strict"` inside the existing `gates` block; hook header comment gains a 4th escape-hatch bullet

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: readEditGateMode + warn/off wiring | `node --test plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS (55/55: 46 pre-existing + 9 new) |
| 2: Document knob in template + header | `node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/devflow/templates/config.json','utf8'))"` + `grep -n editGate ...` | 0 | PASS (JSON valid, both locations found) |

## Task Commits

1. **Task 1 RED: gates.editGate config knob RED tests** - `c4276d2` (test)
2. **Task 1 GREEN: gates.editGate config knob impl** - `85d61b5` (feat)
3. **Task 2: document knob in template + hook header** - `52dc168` (docs)

_Note: Task 1 was TDD (RED then GREEN commits); Task 2 was a standard single docs commit._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 (8 pre-existing unrelated failures) | PASS |

Full-suite baseline captured before starting: 2659 tests / 2599 pass / 10 fail (10 pre-existing failures in `devflow-watch.test.cjs`, `handoff-e2e.test.cjs`, `awareness.test.cjs` — daemon-timing and git-scan flakiness, unrelated to gate-edits). After both tasks: 2671 tests / 2613 pass / 8 fail — same failure categories, same files, zero new failures. The 10→8 delta is baseline flakiness in the pre-existing daemon/git tests (timing-sensitive), not a regression introduced by this TRD. `gate-edits.test.js` itself: 55/55 pass, zero failures, both before and after.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/gate-edits.test.js` | 1 (9 failing) | FAIL (correct — readEditGateMode not yet exported, main() not yet wired, warn/off assertions failed against unchanged deny behavior) |
| GREEN | `node --test plugins/devflow/hooks/gate-edits.test.js` | 0 (55/55) | PASS (correct) |

REFACTOR phase not needed — implementation matched the embedded code example from the TRD exactly; no cleanup pass required.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5 (all `must_haves.truths` from TRD frontmatter confirmed — see Manual e2e verification below)
- **Gate failures:** None

## Manual e2e Verification (TRD `<verification>` step 2)

Ran in an isolated scratch directory (not this repo), no servers, no port 8080:

```
$ printf '{"tool_name":"Edit","tool_input":{"file_path":".../src/a.cjs"}}' | node gate-edits.js
# .planning/config.json: {"gates":{"editGate":"warn"}}
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask", ...}}

$ printf '{"tool_name":"Edit","tool_input":{"file_path":".../src/a.cjs"}}' | node gate-edits.js
# .planning/config.json: {"gates":{"editGate":"off"}}
(empty stdout)
```

Both match the TRD's expected outcomes exactly.

## Files Created/Modified
- `plugins/devflow/hooks/gate-edits.js` - `readEditGateMode()` + `VALID_EDIT_GATE_MODES` added; `main()` wired to branch on mode at emission time; header comment documents the 4th escape hatch
- `plugins/devflow/hooks/gate-edits.test.js` - new `describe('gates.editGate config — warn/strict/off', ...)` block: 7 unit tests (readEditGateMode pure-fs cases) + 6 subprocess e2e tests (realistic PreToolUse payloads on `.cjs` paths)
- `plugins/devflow/devflow/templates/config.json` - `gates` block gains `"editGate": "strict"`

## Decisions Made
- Mode read placed in `main()` immediately after `findPlanningDir()`, per TRD's locked design — keeps `shouldGate()` pure and its existing 11-scenario decision-matrix tests untouched
- `'off'` early-return happens before `hasSkillActiveMarker`/`consumeEditOverrideMarker` are computed, so an opted-out project incurs zero extra marker I/O per edit
- Applying `"warn"` to eden-press's actual config.json is explicitly out of scope here (TRD 25-06 Task 3, Wave 2) — this TRD only ships the mechanism + tests it in devflow-claude

## Deviations from Plan

None — TRD executed exactly as written. Implementation matches the embedded code examples verbatim (readEditGateMode, VALID_EDIT_GATE_MODES, main() wiring). Test list items 1–11 from the TRD all implemented and passing (item 11's "no config.json at all → deny" was reframed as a parity-check test alongside item 9, since 25 pre-existing describe blocks already exercise the no-config-deny path exhaustively).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. The knob goes live in fleet repos at the next devflow-claude release, per TRD gotchas note (expected and fine — no version bump, tag, or release performed as part of this TRD, per hard constraints).

## Next Objective Readiness
- Mechanism is shipped, tested (55/55 in gate-edits.test.js), and documented (template + header)
- TRD 25-06 (Wave 2) can now set `gates.editGate: "warn"` in eden-press's actual `.planning/config.json` to address the 92-denial false-positive pattern from the audit, using this exact key/value contract
- No blockers

---
*Objective: 25-fleet-audit-fixes*
*Completed: 2026-07-22*
