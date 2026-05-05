---
objective: 00-refine-defaults-table
trd: "0.3"
title: "Update planner agent — read 5 new fields + emit corresponding TRD sections + consult testing-strategy.md"
subsystem: planner-agent
tags: [planner, intent-resolution, testing-strategy, constraints, tdd-posture, multi-tenancy]
one_liner: "Extended planner agent prompt to consume 5 resolver fields (test_list_first, fixture_strategy, security_isolation, outside_in, back_compat) and emit field-driven TRD sections with testing-strategy.md stack routing and 3 anti-pattern constraint enforcement"

# Dependency graph
requires:
  - objective: 00-refine-defaults-table/00-02
    provides: "resolve() emitting 5 new fields + constraints array"
  - objective: 00-refine-defaults-table/00-06
    provides: "testing-strategy.md at plugins/devflow/devflow/references/testing-strategy.md"
provides:
  - "Planner agent reads all 5 new resolver fields and emits TRD sections driven by them"
  - "Planner consults testing-strategy.md for stack-aware verification routing"
  - "Planner honors 3 anti-pattern constraints from result.constraints"
  - "Planner prints all 9 resolved fields in Step 2 output (grouped by category)"
  - "Planner emits wrong-tenant assertion injection when security_isolation=multi_tenant_required"
affects:
  - "Every planning session using /devflow:plan-objective — all new objectives get field-driven TRD sections"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Field-driven TRD section emission: planner reads resolver output fields, not re-derives from heuristics"
    - "Conditional reference load: testing-strategy.md loaded if it exists, fallback to stack-agnostic text"
    - "Anti-pattern constraint enforcement: planner reads result.constraints and applies to task generation"

key-files:
  created: []
  modified:
    - plugins/devflow/agents/planner.md

key-decisions:
  - "Merged TRDs 03 and 07 (both edit same file — planner.md; interleaving diffs made splitting wasteful)"
  - "Step 3 fully replaced (not extended) — old type-selection heuristic replaced by field-driven emission table"
  - "New <constraints> block placed after <user_preferences> near top of agent (before <philosophy>)"
  - "testing-strategy.md reference is conditional — 'if it exists' prevents breaking planner if file not yet synced"
  - "Old Step 4 renumbered to Step 6 with updated note that structured fields handle most playbook content"

requirements-completed: [SC-3, SC-6]

# Verification evidence
verification:
  gates_defined: 6
  gates_passed: 6
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 3min
completed: 2026-05-04
---

# Objective 0 TRD 3: Planner Agent Update Summary

**Extended planner agent prompt to consume 5 resolver fields (test_list_first, fixture_strategy, security_isolation, outside_in, back_compat) and emit field-driven TRD sections with testing-strategy.md stack routing and 3 anti-pattern constraint enforcement**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-04T15:21:54Z
- **Completed:** 2026-05-04T15:25:32Z
- **Tasks:** 2 (Task 1 surgical edit + Task 2 smoke test)
- **Files modified:** 1 (`plugins/devflow/agents/planner.md`)

## Accomplishments

- Added `<constraints>` block near top of agent (after `<user_preferences>`, before `<philosophy>`) documenting the 3 anti-pattern constraints the resolver emits
- Updated Step 1 JSON example to include all 5 new resolver fields (`security_isolation`, `back_compat`, `tdd_default`, `test_list_first`, `fixture_strategy`, `outside_in`) plus the `constraints` array and `verification_commands`
- Updated Step 2 print format in both explicit-work and inherited-work variants to display all 9 fields grouped by category
- Replaced Step 3 ("Map resolved tdd posture to TRD type") with comprehensive field-driven TRD shape emission rules covering all 5 new fields + `back_compat` branching
- Added Step 4: conditional load and consult of `~/.claude/devflow/references/testing-strategy.md` for stack-aware verification routing
- Added Step 5: honor `result.constraints` array (3 anti-pattern constraints) with opt-out field references
- Renumbered old Step 4 ("Apply CLAUDE.md absorbed directives") to Step 6 with updated note
- Updated closing rationale paragraph to mention field-driven emission replacing freeform-only playbook absorption
- Smoke test confirmed `(api, feature)` resolution exhibits all 5 expected fields + constraints array of 3 entries

## Literal text added per TRD action items

### 1. `<constraints>` block (added after `</user_preferences>`)

```xml
<constraints>
The resolver emits anti-pattern constraints in `result.constraints`. The planner MUST honor them when generating TRDs:
- `no_llm_test_data` — Use hand-built fixture builders. No LLM-generated sample data.
- `no_property_based_default` — No property-based testing libraries unless explicit TRD opt-in.
- `no_gherkin_layer` — No .feature files or Cucumber scaffolds.

These constraints are dropped from the array when a TRD opts out via frontmatter (`allow_generated_test_data: true`, `use_property_based: true`, `use_gherkin: true`). The planner reads the array at resolve time and applies it during task generation.
</constraints>
```

### 2. Step 1 JSON example update

Extended with: `security_isolation`, `back_compat`, `tdd_default`, `test_list_first`, `fixture_strategy`, `outside_in`, `verification_commands` array (with `wrong_tenant_assertion` entry), `constraints` array (3 entries), `sources` extended.

### 3. Step 2 print format update

Both explicit-work and inherited-work variants now display:
```
Defaults (from defaults-table):
  tdd=<tdd>, depth=<depth>, model=<model_profile>
  security_isolation=<security_isolation>, outside_in=<outside_in>
  test_list_first=<test_list_first>, fixture_strategy=<fixture_strategy>
  back_compat=<back_compat>, tdd_default=<tdd_default>
```

### 4. Step 3 replacement

New field-driven section emission table covering TRD type selection and per-field section emission rules for all 5 new fields plus `back_compat` branching (api_parity/behavioral path vs visual_parity path).

### 5. Step 4 (new): testing-strategy.md consultation

Conditional load instruction with fallback. Reference: `@~/.claude/devflow/references/testing-strategy.md`.

### 6. Step 5 (new): constraint enforcement

Three constraints with opt-out fields documented. Constraint resolution note (resolver handles opt-out automatically).

### 7. Step 6 (renumbered from Step 4): directives

Updated note that most playbook content now surfaces through structured fields (Steps 3-5); only genuinely freeform directives go in TRD `<context>` blocks.

### 8. Updated rationale paragraph

Added: "structured fields drive section emission and verification routing automatically — no more silent TDD detection heuristic, no more freeform-only playbook absorption."

## Diff stat

```
plugins/devflow/agents/planner.md | 77 ++++++++++++++++++++++++++++++++++-----
1 file changed, 67 insertions(+), 10 deletions(-)
```

## Smoke test results

Fixture project: `kind: api`, `work: feature` (resolved with user CLAUDE.md playbook active)

```json
{
  "config": {
    "security_isolation": "multi_tenant_required",
    "outside_in": true,
    "test_list_first": "required",
    "fixture_strategy": "generators",
    "verification_commands": [{ "id": "wrong_tenant_assertion", ... }]
  },
  "constraints": [
    { "id": "no_llm_test_data" },
    { "id": "no_property_based_default" },
    { "id": "no_gherkin_layer" }
  ]
}
```

All 5 expected fields present. `constraints` array contains 3 entries. Note: `fixture_strategy` promoted `inline` → `generators` by CLAUDE.md playbook (correct CLAUDE.md absorption behavior from TRD 0.2).

A human reader of the planner prompt's Step 3 can unambiguously map each resolver field to a TRD section:
- `security_isolation: multi_tenant_required` → inject wrong-tenant assertion in TRD verification_commands
- `outside_in: true` → order TRDs system → integration → unit; consult testing-strategy.md platform routing
- `test_list_first: required` → emit `## Test list` section BEFORE test code prescription
- `fixture_strategy: generators` → emit fixture-builder Task 1 with hand-built factory requirement
- `constraints[*]` → do not emit property-based, gherkin, or LLM-generated data scaffolds

No prompt-clarity refinements needed.

## Merge note: original-TRD-03 + original-TRD-07

Content provenance:
- **From original-TRD-03 (planner new-field consumption):** Steps 1 JSON extension, Step 2 print format extension, Step 3 field-driven emission rules, Step 5 constraint enforcement, `<constraints>` block, Step 6 renumbering
- **From original-TRD-07 (testing-strategy.md consultation):** Step 4 conditional load of testing-strategy.md, `@~/.claude/devflow/references/testing-strategy.md` reference

The merge was correct — both edits target the `## Intent Resolution` section. Splitting them would have required two sequential reads and edits of the same 50-line section with re-read overhead.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Extend planner.md — 5 fields | `grep -E 'test_list_first\|fixture_strategy\|security_isolation\|back_compat\|outside_in' ... \| wc -l \| awk '$1 < 5 { exit 1 }'` | 0 | PASS (18 hits) |
| 1: Extend planner.md — testing-strategy.md | `grep -E 'testing-strategy\.md' ... \| wc -l \| awk '$1 < 1 { exit 1 }'` | 0 | PASS (3 hits) |
| 1: Extend planner.md — wrong-tenant | `grep -E 'wrong-tenant\|wrong_tenant_assertion' ... \| wc -l \| awk '$1 < 1 { exit 1 }'` | 0 | PASS (3 hits) |
| 1: Extend planner.md — 3 constraints | `grep -E 'no_llm_test_data\|no_property_based_default\|no_gherkin_layer' ... \| wc -l \| awk '$1 < 3 { exit 1 }'` | 0 | PASS (10 hits) |
| 1: Extend planner.md — Test list | `grep -E '## Test list\|test list\|behavior cases checklist' ... \| wc -l \| awk '$1 < 1 { exit 1 }'` | 0 | PASS (2 hits) |
| 1: Frontmatter intact | `head -10 plugins/devflow/agents/planner.md` | 0 | PASS (name/description/tools/color all present) |
| 1: Structural sections | `head -220 ... \| grep -c '<role>\|<philosophy>\|<discovery_levels>'` | 0 | PASS (3 sections) |
| 2: Smoke test — security_isolation | `df-tools intent resolve (api, feature) \| config.security_isolation` | 0 | PASS (multi_tenant_required) |
| 2: Smoke test — outside_in | `df-tools intent resolve (api, feature) \| config.outside_in` | 0 | PASS (true) |
| 2: Smoke test — test_list_first | `df-tools intent resolve (api, feature) \| config.test_list_first` | 0 | PASS (required) |
| 2: Smoke test — verification_commands | `df-tools intent resolve (api, feature) \| config.verification_commands[0]` | 0 | PASS (wrong_tenant_assertion present) |
| 2: Smoke test — constraints | `df-tools intent resolve (api, feature) \| constraints.length` | 0 | PASS (3 entries) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| V1 | `grep -E 'test_list_first\|...' planner.md \| wc -l \| awk '$1 < 5 { exit 1 }'` | 0 | PASS (18 hits) |
| V2 | `grep -E 'testing-strategy\.md' planner.md \| wc -l \| awk '$1 < 1 { exit 1 }'` | 0 | PASS (3 hits) |
| V3 | `grep -E 'wrong-tenant\|wrong_tenant_assertion' planner.md \| wc -l \| awk '$1 < 1 { exit 1 }'` | 0 | PASS (3 hits) |
| V4 | `grep -E 'no_llm_test_data\|...' planner.md \| wc -l \| awk '$1 < 3 { exit 1 }'` | 0 | PASS (10 hits) |
| V5 | `grep -E '## Test list\|...' planner.md \| wc -l \| awk '$1 < 1 { exit 1 }'` | 0 | PASS (2 hits) |
| V6 | `node df-tools.cjs --help 2>&1 \| head -1` | N/A | PASS (returns output) |

Note: `npm test` shows 8 failing tests from TRD 0.4 RED phase tests already in working tree (`claude-md.test.cjs` groups A-D). These are pre-existing failures not caused by this TRD — TRD 0.3 modifies only `planner.md` (markdown, not parsed by test runner). Confirmed by stash test: 408/408 pass on last commit.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 8/8 (all truths confirmed — all 5 fields referenced, testing-strategy.md conditional load, wrong-tenant injection, 3 constraints documented, Test list emission rule, Step 2 print format updated for both formats, rationale updated)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/agents/planner.md` — 67 insertions, 10 deletions; surgical edits to `## Intent Resolution` section + new `<constraints>` block near top

## Decisions Made

- Used `<constraints>` block placement after `</user_preferences>` (before `<philosophy>`) so the agent sees behavioral constraints before reasoning framework
- Step 3 fully replaced (not extended) because the old single-type heuristic was incompatible with the new multi-field emission table
- testing-strategy.md load made conditional ("if it exists") — file exists post-Wave-1, but fresh installs or timing edge cases shouldn't break the planner
- Smoke test with CLAUDE.md playbook active (not isolated) — confirmed playbook promotions coexist correctly with new fields

## Deviations from Plan

None — TRD executed exactly as written. All 8 numbered action items applied as specified. The `<constraints>` block placement matches TRD spec (after `<user_preferences>`). Rationale paragraph updated with the exact wording from TRD research_context.

## Task Commits

1. **Task 1 + Task 2: Extend planner agent with 5-field consumption + testing-strategy routing + constraints** — `21e150d` (`feat(00-03):`)

(Task 2 was read-only smoke test — no separate commit needed per TRD design: "This task is NOT a test of the planner agent's execution... It is a prompt-clarity smoke test.")

## Issues Encountered

None.

## Ambiguities remaining (candidate gaps for --gaps)

None identified. The Step 3 emission rules are explicit and unambiguous. A human reader can map each resolver field value to a specific TRD section with no interpretation required.

## Next Objective Readiness

- Wave 3 is now 1/2 complete (TRD 0.3 done). TRD 0.4 (CLAUDE.md absorption) can proceed.
- TRD 0.4's RED tests are already in the working tree (seen as 8 failing `claude-md.test.cjs` tests). TRD 0.4 executor should start at GREEN phase.
- Wave 4 (TRD 0.5 migration + provenance) remains after Wave 3 completes.

---
*Objective: 00-refine-defaults-table*
*TRD: 0.3*
*Completed: 2026-05-04*
