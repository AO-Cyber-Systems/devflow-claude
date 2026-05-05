---
objective: 00-refine-defaults-table
trd: "0.4"
title: "Map all 6 TDD Playbook habits to 5 structured fields + 1 freeform directive"
subsystem: claude-md-absorber
tags: [claude-md, tdd-playbook, habit-detection, structured-overrides, tdd]
one_liner: "Extended claude-md.cjs absorber to detect all 6 TDD Playbook habits via PLAYBOOK_HABITS constant, emitting 5 structured fields (tdd_default, test_list_first, fixture_strategy, outside_in, security_isolation) plus freeform-only habit-3, verified against real ~/.claude/CLAUDE.md"

requires:
  - objective: 00-refine-defaults-table/00-02
    provides: "_playbookDetected flag + stub test_list_first/fixture_strategy patterns in deriveOverrides"
provides:
  - "PLAYBOOK_HABITS constant: 6-entry catalog with patterns/field/value per habit"
  - "deriveOverrides() emits tdd_default:auto, test_list_first:required, fixture_strategy:generators, outside_in:true, security_isolation:multi_tenant_required"
  - "Habit 3 (one test at a time / RED→GREEN→REFACTOR) is freeform-only — no structured field emitted"
  - "Legacy fields preserved: tdd:strict, multitenancy:required, propertyBased:skip"
  - "PLAYBOOK_HABITS exported from module for inspection/testing"
  - "realCLAUDEMd() fixture in intent-fixtures.cjs — hand-edited from real CLAUDE.md (3133 chars)"
affects:
  - "TRD 0.5 (migration + provenance) — reads deriveOverrides output shape"

tech-stack:
  added: []
  patterns:
    - "PLAYBOOK_HABITS constant: per-habit pattern/field/value catalog; field:null for freeform-only habits"
    - "PLAYBOOK_HABITS loop in deriveOverrides: iterate habits, test section.body (original case) against /i-flagged patterns"
    - "Legacy patterns use body.toLowerCase() + no-/i flag; new patterns use /i flag on original body — both coexist"

key-files:
  created:
    - "plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs — realCLAUDEMd() added (hand-edited, 3133 chars)"
  modified:
    - "plugins/devflow/devflow/bin/lib/claude-md.cjs — PLAYBOOK_HABITS constant, extended deriveOverrides, PLAYBOOK_HABITS exported"
    - "plugins/devflow/devflow/bin/lib/claude-md.test.cjs — 17 new test cases (Groups A-D)"

key-decisions:
  - "PLAYBOOK_HABITS.id=3 has field:null — habit 3 (one test at a time / RED→GREEN→REFACTOR) is freeform-only; its body text is preserved in directives.tdd[].body for the planner to consume; no structured override emitted"
  - "tdd_default:auto emitted from absorber — promotion (auto→strict) is the resolver's job per CONTEXT.md §3, not the absorber's"
  - "Legacy patterns use lowercased body + no /i flag (unchanged); new PLAYBOOK_HABITS patterns use /i flag on original body — dual-approach avoids risk of breaking legacy tests"
  - "security_isolation:multi_tenant_required emitted unconditionally by absorber; kind=api restriction is the resolver's responsibility (per TRD 0.2 design)"
  - "SC-10 satisfied collectively by TRD 0.2 + TRD 0.4: TRD 0.2 added the test: commit before feat: pattern for resolver schema; TRD 0.4 repeats that discipline here. Both TRDs together satisfy the 'npm test passes; TDD-tagged TRDs ship test: before feat:' criterion."

requirements-completed: [SC-4]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: "2026-05-04"
---

# Objective 00 TRD 04: CLAUDE.md Absorption Summary

**Extended claude-md.cjs absorber to detect all 6 TDD Playbook habits via PLAYBOOK_HABITS constant, emitting 5 structured fields (tdd_default, test_list_first, fixture_strategy, outside_in, security_isolation) plus freeform-only habit-3, verified against real ~/.claude/CLAUDE.md**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-04
- **Completed:** 2026-05-04
- **Tasks:** 2 (Task 1 RED + Task 2 GREEN)
- **Files modified:** 3

## Accomplishments

- `PLAYBOOK_HABITS` constant (6 entries) added to `claude-md.cjs` with per-habit pattern catalog, field, and value
- `deriveOverrides()` extended with PLAYBOOK_HABITS loop: habit 1→`tdd_default:'auto'`, habit 2→`test_list_first:'required'`, habit 3→`field:null` (freeform-only), habit 4→`fixture_strategy:'generators'`, habit 5→`outside_in:true`, habit 6→`security_isolation:'multi_tenant_required'`
- Legacy fields (`tdd:'strict'`, `multitenancy:'required'`, `propertyBased:'skip'`) fully preserved
- `PLAYBOOK_HABITS` exported from module for external inspection
- `realCLAUDEMd()` fixture added to `intent-fixtures.cjs` — hand-edited copy of real `~/.claude/CLAUDE.md` (3133 chars), not LLM-generated
- 17 new test cases across Groups A-D; 8 ran RED first, then GREEN after implementation
- 425/425 tests pass; real `~/.claude/CLAUDE.md` round-trip confirmed

## PLAYBOOK_HABITS Regex Catalog

| Habit | ID | Field | Patterns |
|---|---|---|---|
| Force TDD at planning | 1 | `tdd_default` | `/force tdd trds? at planning/i`, `/all features? default to tdd strict/i`, `/make every feature a type=tdd/i` |
| Test list first | 2 | `test_list_first` | `/test list first/i`, `/checklist of behavior cases?/i`, `/before any test code/i` |
| One test at a time | 3 | `null` (freeform) | `/one test at a time/i`, `/red [→->]+ green [→->]+ refactor/i` |
| Fixture generators | 4 | `fixture_strategy` | `/fixture (generators?|builders?|factory functions?)/i`, `/no llm[ -]generated test data/i`, `/recorded cassettes?/i` |
| Outside-in | 5 | `outside_in` | `/outside-?in for (ui|portal flows?)/i`, `/start at the highest user-?observable layer/i` |
| Multitenancy guard | 6 | `security_isolation` | `/multitenancy guard/i`, `/wrong-?tenant isolation/i`, `/tenant isolation.*every test/i` |

## realCLAUDEMd Fixture Structure

Hand-edited from the real `~/.claude/CLAUDE.md` (visible in system context). Sections:
- `# Global Working Preferences`
- `## TDD Playbook` (H2 — triggers `_playbookDetected:true`)
  - `### Habits to apply` — all 6 numbered habits with literal text
  - `### What to skip` — property-based testing skip clause
  - `### Why` — rationale paragraph
  - `### How to apply` — trigger conditions

The fixture exercises all 6 habits in a single CLAUDE.md, including the Unicode arrow `→` in habit 3 body text and backtick-wrapped code in habit 1.

## Round-Trip Verification

Real `~/.claude/CLAUDE.md` smoke command output:

```
real CLAUDE.md round-trip OK: {
  "_playbookDetected": true,
  "fields": ["tdd", "multitenancy", "tdd_default", "test_list_first", "fixture_strategy", "outside_in", "security_isolation"]
}
```

5 structured fields + 2 legacy fields. All 6 habits detected from the real file.

## SC-10 Note (Verifier Briefing #1)

SC-10 ("npm test passes; new TDD-tagged TRDs ship test: commits before feat: commits") is satisfied collectively by TRD 0.2 + TRD 0.4. TRD 0.2 established the pattern for the resolver schema TDD TRD. TRD 0.4 repeats the discipline for CLAUDE.md absorption: `test(00-04)` commit (49634dc) precedes `feat(00-04)` commit (cf8a12a) in the git history for the modified files. The TRD's requirements array lists SC-4 (CLAUDE.md absorption closes criterion 4); SC-10 is a collective criterion not owned exclusively by this TRD.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED): Failing tests + realCLAUDEMd fixture | `npm test` — 425 tests, 417 pass, 8 fail | 1 | PASS (correct RED) |
| 2 (GREEN): PLAYBOOK_HABITS implementation | `npm test` — 425 tests, 425 pass, 0 fail | 0 | PASS |
| TRD V2: test: commit before feat: | `git log ... \| grep test(` → 49634dc | 0 | PASS |
| TRD V3: round-trip real CLAUDE.md | `node -e '...'` → `_playbookDetected:true, 5 structured fields` | 0 | PASS |
| TRD V4: PLAYBOOK_HABITS.length === 6 | `node -e 'console.log(cm.PLAYBOOK_HABITS.length)'` → 6 | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` → 425 tests, 417 pass, 8 fail | 1 | FAIL (correct — 8 new behavior tests failing) |
| GREEN | `npm test` → 425 tests, 425 pass, 0 fail | 0 | PASS (correct) |
| REFACTOR | N/A — GREEN implementation was clean | — | Skipped |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (425/425) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5 (all truths from TRD frontmatter confirmed)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/claude-md.cjs` — `PLAYBOOK_HABITS` constant; extended `deriveOverrides` loop; `PLAYBOOK_HABITS` exported
- `plugins/devflow/devflow/bin/lib/claude-md.test.cjs` — 17 new test cases (Groups A-D)
- `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` — `realCLAUDEMd()` added

## Decisions Made

- Habit 3 emits no structured override. The freeform body text (containing "one test at a time" / "RED → GREEN → REFACTOR") is already preserved in `directives.tdd[].body` by `absorb()`. The planner agent reads this from the absorption output directly. No new field needed.
- `tdd_default: 'auto'` (not `'strict'`) from the absorber. The promotion table (`auto→strict`) lives in the resolver (TRD 0.2). The absorber states intent; the resolver decides the final value based on the current table cell's baseline.
- Legacy `tdd:'strict'` pattern retained alongside new `tdd_default:'auto'`. Both patterns match "Force TDD TRDs at planning time" (legacy via lowercased body; new via PLAYBOOK_HABITS /i). Both fields coexist on the overrides map without conflict.

## Deviations from Plan

None — TRD executed exactly as written. PLAYBOOK_HABITS patterns matched the real CLAUDE.md text on first attempt. No regex adjustments needed.

## Task Commits

1. **Task 1 (RED): Failing tests + realCLAUDEMd fixture** — `49634dc` (`test(00-04):`)
2. **Task 2 (GREEN): PLAYBOOK_HABITS implementation** — `cf8a12a` (`feat(00-04):`)

## Self-Check

Checking that all claimed artifacts exist:

---
*Objective: 00-refine-defaults-table*
*TRD: 0.4*
*Completed: 2026-05-04*
