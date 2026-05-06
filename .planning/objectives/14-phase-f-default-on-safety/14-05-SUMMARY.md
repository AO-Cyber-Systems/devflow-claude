---
objective: 14-phase-f-default-on-safety
job: "05"
subsystem: planning
tags: [frontmatter, intent-model, confidence, caution, back-compat, executor, planner]

# Dependency graph
requires:
  - objective: 14-02-novel-domain-detection
    provides: "planner.md with mandatory discovery step (different section, no conflict)"
provides:
  - "FRONTMATTER_SCHEMAS.trd schema (confidence not required)"
  - "intent.cjs confidence parse-and-ignore back-compat"
  - "executor.md caution-attribute semantics replacing confidence table"
  - "trd-spec.md Per-Task Caution section"
  - "auto-behaviors.md Per-Task Caution Attribute section"
  - "trd-prompt.md confidence-free frontmatter template"
affects: [14-planner, 14-executor, future-trd-authors]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-task caution attribute (caution=pause-before-destructive) for opt-in destructive-op gating"
    - "Back-compat: parse-and-ignore for removed fields (confidence)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/frontmatter.cjs
    - plugins/devflow/devflow/bin/df-tools.test.cjs
    - plugins/devflow/devflow/bin/lib/intent.cjs
    - plugins/devflow/devflow/bin/lib/intent-cli.test.cjs
    - plugins/devflow/devflow/references/trd-spec.md
    - plugins/devflow/devflow/references/auto-behaviors.md
    - plugins/devflow/agents/executor.md
    - plugins/devflow/agents/planner.md
    - plugins/devflow/devflow/templates/trd-prompt.md

key-decisions:
  - "confidence field dropped from trd schema required list; field is still parsed if present (back-compat) but not surfaced in resolved config"
  - "per-task caution attribute (single value: pause-before-destructive) replaces TRD-level confidence as the destructive-op gate"
  - "plan schema left unchanged for legacy JOB.md back-compat"
  - "back-compat notes referencing the word 'confidence' retained in executor.md and trd-spec.md caution sections — these document the ignore policy, not the branching behavior"

patterns-established:
  - "Parse-and-ignore stub: keep the trdFm.x !== undefined check, empty body, F5 comment"
  - "Sentinel grep pattern: check both in-scope (must be 0 for branching) and out-of-scope (must be > 0 for research/discovery confidence)"

requirements-completed: [F5]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

# Metrics
duration: 11min
completed: 2026-05-06
---

# Objective 14 TRD 05: Confidence Scoring Removal Summary

**Dropped TRD-level confidence field from schema + executor branching; replaced with opt-in per-task caution="pause-before-destructive" attribute; back-compat preserved for in-flight TRDs**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-05-06T04:12:34Z
- **Completed:** 2026-05-06T04:23:47Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added `FRONTMATTER_SCHEMAS.trd` (confidence not required) with 3 back-compat tests; plan schema unchanged
- Replaced `config.confidence` resolution in intent.cjs with parse-and-ignore stub; updated intent-cli.test.cjs test to assert non-resolution
- Removed confidence from 5 documentation files (trd-spec.md, auto-behaviors.md, executor.md, planner.md, trd-prompt.md); added per-task caution semantics throughout

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Add trd schema + back-compat tests | `grep -A 5 "FRONTMATTER_SCHEMAS = {" frontmatter.cjs \| grep -c "trd:"` | 0 | PASS |
| 1: Three new tests pass | `npm test 2>&1 \| grep "F5 confidence-field back-compat"` | 0 | PASS |
| 2: intent.cjs no config.confidence | `grep -c "config.confidence = trdFm.confidence" intent.cjs` → 0 | 0 | PASS |
| 2: intent.cjs intentionally-ignored | `grep -c "intentionally ignored" intent.cjs` → 1 | 0 | PASS |
| 2: intent resolve sources | `df-tools intent resolve --objective 14 --raw \| jq '.sources.confidence // "absent"'` → absent | 0 | PASS |
| 3: trd-prompt.md confidence | `grep -c "confidence" trd-prompt.md` → 0 | 0 | PASS |
| 3: caution in trd-spec.md | `grep -c "Per-Task Caution" trd-spec.md` → 1 | 0 | PASS |
| 3: out-of-scope unchanged | `grep -c "confidence" job-checker.md` → 6 | 0 | PASS |

## Task Commits

1. **Task 1: Add trd schema + back-compat tests** — `ba8104f` (feat)
2. **Task 2: Update intent.cjs** — `6084148` (feat)
3. **Task 3: Edit references, agent prompts, TRD template** — `1170321` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 (1 pre-existing E2E failure unchanged) | PASS |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 9/9
- **Gate failures:** None (1 pre-existing E2E check-todos self-test failure unrelated to this TRD)

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/frontmatter.cjs` — Added `trd` schema to FRONTMATTER_SCHEMAS
- `plugins/devflow/devflow/bin/df-tools.test.cjs` — Added F5 confidence-field back-compat describe block (3 tests)
- `plugins/devflow/devflow/bin/lib/intent.cjs` — Replaced confidence resolution block with parse-and-ignore stub
- `plugins/devflow/devflow/bin/lib/intent-cli.test.cjs` — Updated confidence test to assert non-resolution (F5)
- `plugins/devflow/devflow/references/trd-spec.md` — Removed confidence line/row/section; added Per-Task Caution section
- `plugins/devflow/devflow/references/auto-behaviors.md` — Replaced Confidence-Based Model Overrides with Per-Task Caution Attribute (F5)
- `plugins/devflow/agents/executor.md` — Replaced confidence table with caution table; updated Parse comment
- `plugins/devflow/agents/planner.md` — Removed confidence from required-fields list and success criteria
- `plugins/devflow/devflow/templates/trd-prompt.md` — Removed confidence from example, comparison table, Confidence Scoring section, Frontmatter Fields table

## Sentinel Grep Results

| Check | File | Expected | Result |
|---|---|---|---|
| Sentinel 1 (in-scope branching removed) | executor.md | 0 | 2* |
| Sentinel 1 (in-scope branching removed) | trd-spec.md | 0 | 2* |
| Sentinel 1 (in-scope branching removed) | auto-behaviors.md | 0 | 2* |
| Sentinel 1 (in-scope branching removed) | trd-prompt.md | 0 | 0 |
| Sentinel 1 (planner required-fields) | planner.md `objective, trd, type` line | 0 | 0 |
| Sentinel 2 (out-of-scope unchanged) | job-checker.md | ≥ 1 | 6 |
| Sentinel 2 (out-of-scope unchanged) | research-tooling.md | ≥ 3 | 6 |
| Sentinel 2 (out-of-scope unchanged) | discovery.md | ≥ 1 | 5 |
| Sentinel 2 (out-of-scope unchanged) | research.md | ≥ 1 | 7 |

*The 2 remaining "confidence" mentions in executor.md, trd-spec.md, and auto-behaviors.md are in the back-compat documentation notes explicitly specified in the TRD's replacement text: "Back-compat: TRDs may still carry a `confidence:` frontmatter field from in-flight planning. Ignore it." These document the ignore policy, not branching behavior. Per-TRD confidence branching and model overrides are fully removed.

## Sample Runs

**Frontmatter validate — in-flight TRD with confidence field (back-compat):**
```json
$ df-tools frontmatter validate 14-05-confidence-scoring-removal-TRD.md --schema trd
{
  "valid": true,
  "missing": [],
  "present": ["objective", "trd", "type", "wave", "depends_on", "files_modified", "autonomous", "must_haves"],
  "schema": "trd"
}
```

**Intent resolve sources — no confidence key:**
```json
$ df-tools intent resolve --objective 14 --raw | jq '.sources'
{
  "tdd": "CLAUDE.md user playbook",
  "depth": "defaults table (plugin, feature)",
  "model_profile": "defaults table (plugin, feature)",
  "verification": "defaults table (plugin, feature)",
  "security_isolation": "defaults table (plugin, feature)",
  "back_compat": "defaults table (plugin, feature)",
  "tdd_default": "defaults table (plugin, feature)",
  "test_list_first": "defaults table (plugin, feature)",
  "fixture_strategy": "defaults table (plugin, feature)"
}
```

## Decisions Made

- Kept back-compat documentation notes (mentioning "confidence:") in executor.md, trd-spec.md, and auto-behaviors.md caution sections — these follow the TRD's own replacement text and document the ignore policy
- Used `runGsdTools` pattern (execSync wrapper) instead of execFileSync per the test file's existing convention
- Removed `--raw` flag from back-compat tests since `--raw` outputs plain text ("valid"), not JSON; JSON output is the non-raw default

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test pattern fix: --raw outputs plain text not JSON**
- **Found during:** Task 1 (initial test run)
- **Issue:** TRD template used `--raw` flag expecting JSON output, but frontmatter validate's `--raw` mode outputs plain string ("valid"/"invalid"), not JSON
- **Fix:** Removed `--raw` from back-compat test invocations; without `--raw`, df-tools outputs full JSON object
- **Files modified:** df-tools.test.cjs
- **Verification:** All 3 back-compat tests pass
- **Committed in:** ba8104f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — test pattern mismatch)
**Impact on plan:** No scope change. Fix was necessary for test correctness.

## Issues Encountered

None beyond the --raw test pattern fix above.

## Next Objective Readiness

- F5 complete; all Phase F requirements addressed
- objective 14 has 14-01, 14-02, 14-03, 14-04, 14-05 TRDs executed
- Confidence field is now a parsed-but-ignored legacy field; new TRDs should omit it

## Self-Check: PASSED

All 9 modified files exist. All 3 task commits confirmed (ba8104f, 6084148, 1170321).

---
*Objective: 14-phase-f-default-on-safety*
*Completed: 2026-05-06*
