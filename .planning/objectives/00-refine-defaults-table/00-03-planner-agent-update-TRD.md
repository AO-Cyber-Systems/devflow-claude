---
objective: 00-refine-defaults-table
trd: 0.3
title: Update planner agent — read 5 new fields + emit corresponding TRD sections + consult testing-strategy.md
type: standard
confidence: medium
wave: 3
depends_on: [0.2, 0.6]
merged_from: [original-TRD-03, original-TRD-07]
files_modified:
  - plugins/devflow/agents/planner.md
autonomous: true
requirements: [SC-3, SC-6]
must_haves:
  truths:
    - "Planner agent prompt instructs the agent to read all 5 new resolver fields after `df-tools intent resolve`"
    - "Planner agent emits a `## Test list` section in every type:tdd TRD it produces (driven by `result.config.test_list_first === 'required'`)"
    - "Planner agent emits a fixture-builder task ahead of the first behavior test when `result.config.fixture_strategy ∈ {'generators','cassettes'}`"
    - "Planner agent emits a wrong-tenant assertion in verification_commands of any TRD whose resolved config carries security_isolation: multi_tenant_required"
    - "Planner agent emits outside-in TRD ordering when `result.config.outside_in === true` (outermost-layer TRD first, then inward)"
    - "Planner agent loads `~/.claude/devflow/references/testing-strategy.md` after resolver returns and routes verification commands to stack-appropriate tools"
    - "Planner agent prints the new resolved fields in its 'Print resolved configuration to user' step (extending the existing block)"
    - "Planner agent honors the 3 anti-pattern constraints (no_llm_test_data, no_property_based_default, no_gherkin_layer) when generating tasks"
  artifacts:
    - path: "plugins/devflow/agents/planner.md"
      provides: "Updated planner agent prompt with 5-new-field consumption + testing-strategy.md routing + constraint enforcement"
      contains: "result.config.test_list_first"
      contains_also: "testing-strategy.md"
  key_links:
    - from: "plugins/devflow/agents/planner.md::Step 1 (resolve intent)"
      to: "plugins/devflow/devflow/bin/lib/intent.cjs::resolve"
      via: "df-tools intent resolve --objective <id> CLI"
      pattern: "df-tools intent resolve"
    - from: "plugins/devflow/agents/planner.md::Step 5 (consult testing-strategy)"
      to: "plugins/devflow/devflow/references/testing-strategy.md"
      via: "@~/.claude/devflow/references/testing-strategy.md path reference"
      pattern: "testing-strategy\\.md"
verification_commands:
  - "grep -E 'test_list_first|fixture_strategy|security_isolation|back_compat|outside_in' plugins/devflow/agents/planner.md | wc -l | awk '$1 < 5 { exit 1 }'"
  - "grep -E 'testing-strategy\\.md' plugins/devflow/agents/planner.md | wc -l | awk '$1 < 1 { exit 1 }'"
  - "grep -E 'wrong-tenant|wrong_tenant_assertion' plugins/devflow/agents/planner.md | wc -l | awk '$1 < 1 { exit 1 }'"
  - "grep -E 'no_llm_test_data|no_property_based_default|no_gherkin_layer' plugins/devflow/agents/planner.md | wc -l | awk '$1 < 3 { exit 1 }'"
  - "grep -E '## Test list|test list|behavior cases checklist' plugins/devflow/agents/planner.md | wc -l | awk '$1 < 1 { exit 1 }'"
  - "node plugins/devflow/devflow/bin/df-tools.cjs --help 2>&1 | head -1"
---

<objective>
Update the planner agent prompt at `plugins/devflow/agents/planner.md` to consume the 5 new resolver fields landed by TRD 0.2 and emit corresponding TRD sections. Merges what would otherwise be two separate TRDs (one for new-field consumption, one for testing-strategy.md consultation) — the merge is appropriate because both edits target the same file (the planner prompt) and the diffs interleave structurally; splitting them would force sequential single-file edits with re-read overhead.

Purpose: Closes objective-0 success criteria 3 and 6. The planner is the bridge between the resolver's structured output and the TRDs it generates. Until this lands, TRD 0.2's new fields are inert — emitted but not acted on.

Output: Single modified agent prompt. Adds:
- New step (extension of existing Step 1) instructing the agent to capture the 5 new fields from `df-tools intent resolve` JSON output.
- Extension of existing Step 2 ("Print resolved configuration to user") to print the 5 new fields with their provenance.
- Extension of existing Step 3 ("Map resolved tdd posture to TRD type") with field-driven section emission rules.
- New step (Step 5) instructing the agent to load `testing-strategy.md` after resolver returns and select stack-appropriate verification tools.
- New `<constraints>` section in the agent prompt body documenting the 3 anti-pattern constraints and the planner's responsibility to honor them.

Why standard, not TDD: the planner agent is a markdown prompt with no unit-testable surface. Verification is by inspection + a fixture-project dry run that confirms the agent emits the expected sections.
</objective>

<file_tree>
plugins/devflow/agents/
└── planner.md          ← MODIFY
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
The existing planner prompt structure (lines 199-250 of `plugins/devflow/agents/planner.md`) has a section `## Intent Resolution (replaces silent TDD heuristic)` with 4 numbered steps. New step 5 will live here, between current Step 4 ("Apply CLAUDE.md absorbed directives if present") and the closing `**Why this replaces the old heuristic:**` paragraph.

Existing Step 1 reads:
> Call `df-tools intent resolve --objective <id>` to load the resolved configuration. The resolver reads PROJECT.md `kind`, OBJECTIVE.md `work`, project + user CLAUDE.md playbooks, and the (kind, work) defaults table at `~/.claude/devflow/references/defaults-table.md`. Output is a JSON object: ...

Extend this by adding the 5 new fields to the example JSON and noting that `result.constraints`, `result.config.verification_commands`, and `result.warnings` are also consumed.

Existing Step 2 prints the resolved configuration in two formats (explicit work vs inherited work). Extend the "Defaults:" line to include the 5 new fields.

The existing TDD detection heuristic (lines 199-201 of the planner agent) has been replaced; new logic uses `result.config.test_list_first`, `result.config.fixture_strategy`, `result.config.outside_in`, `result.config.security_isolation` to drive TRD section emission.

Reference path conventions in the planner prompt use `@~/.claude/devflow/references/X.md` (line 752 references tdd.md this way). Add a similar reference for `testing-strategy.md` once TRD 0.6 ships.
</codebase_examples>

<anti_patterns>
- **Do NOT add the new logic in a new top-level section.** The existing `## Intent Resolution` section is the right home — extending it preserves agent-prompt cohesion. Splitting the new behavior into a sibling section makes the prompt harder for the agent to follow as a single decision flow.
- **Do NOT reference TRD 0.6's testing-strategy.md as if it always exists.** The reference must be conditional: "If `~/.claude/devflow/references/testing-strategy.md` exists, load it after the resolver returns." Until TRD 0.6 ships in Wave 1, the reference is a no-op.
- **Do NOT make the agent re-derive test-list / fixture-builder / outside-in section emission from heuristics.** The whole point of TRD 0.2 was to put the decision in `result.config`. The planner prompt should READ those fields, not re-decide based on `kind` / `work`.
- **Do NOT instruct the agent to mutate `result.constraints`.** Constraints are read-only from the agent's perspective. The agent honors them by not emitting forbidden patterns; opt-outs happen via TRD frontmatter, which the resolver already handles.
- **Do NOT remove the existing "Why this replaces the old heuristic" paragraph** — it explains the rationale and remains relevant.
- **Do NOT introduce conflicting guidance with the existing TDD section** of the agent (lines 199-251 in the existing file). The `<tdd_integration>` section later in the prompt should remain compatible with the new structured-field flow.
</anti_patterns>

<error_recovery>
- If a verification grep returns 0 hits where it should have ≥1: the patch missed that bullet. Re-read the affected section and add the missing reference.
- If after edits the planner agent itself hits a syntax error (the prompt is markdown, but YAML frontmatter at the top must remain valid): use `head -10 plugins/devflow/agents/planner.md` to verify frontmatter integrity.
- If the prompt grows too large (the planner prompt is 1332 lines pre-edit): trim by removing duplicated content, never by removing required new content. The `<task_breakdown>` section's old TDD detection heuristic (intent-replaced) can be condensed to a single backreference paragraph since Step 1-4 already replaced it.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/00-refine-defaults-table/00-CONTEXT.md
@.planning/objectives/00-refine-defaults-table/00-RESEARCH.md
@plugins/devflow/agents/planner.md

# Reads from prior TRDs:
@.planning/objectives/00-refine-defaults-table/00-02-resolver-schema-SUMMARY.md  # Final resolver output shape
@.planning/objectives/00-refine-defaults-table/00-06-testing-strategy-doc-SUMMARY.md  # testing-strategy.md final structure
</context>

<research_context>
The 5 new fields drive these planner behaviors per CONTEXT.md §3:

| Field | Trigger Value | Planner Action |
|---|---|---|
| `test_list_first` | `required` | Emit `## Test list` section in TRD body before any test code prescription |
| `fixture_strategy` | `generators` or `cassettes` | Emit a fixture-builder task as Task 1 of the TRD, ahead of the first RED test task |
| `security_isolation` | `multi_tenant_required` | Inject the wrong-tenant verification entry from `result.config.verification_commands` into the TRD's `verification_commands` frontmatter (or `<verification>` section) |
| `outside_in` | `true` | Order TRDs from outermost layer inward; for type:tdd TRDs, order test cases from outermost (E2E / integration) to innermost (unit) within the test list |
| `back_compat` | `api_parity`, `ui_parity`, etc. | Reference the contract-list-first parity approach in the TRD; emit a "behavioral parity checklist" section listing source-behavior cases the new implementation must reproduce |
| `tdd_default` | `strict` (or promoted) | Set TRD `type: tdd`. Set `type: standard` only if `tdd_default === skip` AND no override |

The 3 constraints from `result.constraints` map to planner anti-patterns:
- `no_llm_test_data` → planner MUST emit fixture-builder task; MUST NOT instruct executor to use LLM-generated sample data
- `no_property_based_default` → planner MUST NOT include property-based testing scaffolds (rapid/gopter/hypothesis) in tasks unless TRD frontmatter opts in via `use_property_based: true`
- `no_gherkin_layer` → planner MUST NOT emit `.feature` files or Cucumber-shaped scaffolds; uses descriptive `t.Run(...)` / `testWidgets('...')` / `test('...')` names instead

Per CONTEXT.md §5, the testing-strategy.md doc lives at `plugins/devflow/devflow/references/testing-strategy.md` and provides a layer×tool×stack matrix. The planner consults it AFTER `df-tools intent resolve` returns, with a soft (no resolver coupling) bundle: the resolver outputs a stack-agnostic verification-commands array; testing-strategy.md tells the planner which specific tool to invoke for the project's stack at each layer.
</research_context>

<gotchas>
- **The planner runs sub-agents and reads files itself.** Reference `@~/.claude/devflow/references/testing-strategy.md` using the @-syntax convention from CLAUDE.md §Conventions ("file references use @path syntax").
- **Reading testing-strategy.md is conditional on its existence.** Phrase the new step defensively: "If `~/.claude/devflow/references/testing-strategy.md` exists at planning time, load it." This avoids breaking the planner if the file isn't yet synced (the sync-runtime hook mirrors it on session start, but TRD 0.6's commit lands in the same wave).
- **`outside_in: true` for `type: standard` TRDs:** the field still drives ordering of TRDs within the objective even when individual TRDs aren't TDD. Planner should order TRDs from outermost (system / E2E) to innermost (unit) when `outside_in === true`.
- **Wrong-tenant assertion is a verification command, not a test case:** the planner injects it into the TRD's `<verification>` section (or `verification_commands` frontmatter), not into the `<tasks>` body. The executor agent picks it up at run time.
- **`back_compat: visual_parity` (the (ui-lib, port) cell):** since visual-regression tooling doesn't exist in the org, this value is *aspirational*. The planner's behavior for visual_parity should produce a TRD that documents the parity target as a comment but skips the actual visual-diff verification step (mirroring the (ui-lib, *) text changes in TRD 0.1).
- **`fixture_strategy: cassettes` is rare** but applies when the TRD touches external APIs (recorded VCR-style fixtures). The planner should flag this in the fixture-builder task description (e.g., "Use recorded cassettes — see existing pattern in eden-cli/tests/cassettes if present").
- **The planner's existing `## Intent Resolution` section already prints provenance.** Extending the print line to include 5 new fields keeps the output readable; consider grouping by precedence-level rather than listing all 9 fields on one line. Sample format:
  ```
  Defaults (from defaults-table):
    tdd=strict, depth=comprehensive, model=quality
    security_isolation=multi_tenant_required, outside_in=true
    test_list_first=required, fixture_strategy=inline
  ```
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Extend the `## Intent Resolution` section of planner.md with new-field consumption + testing-strategy.md consultation</name>
  <files>plugins/devflow/agents/planner.md</files>
  <action>
Read the existing `## Intent Resolution` section (lines 199-251 of `plugins/devflow/agents/planner.md`). Extend it as follows:

1. **Update Step 1's example JSON** (line 203-219) to include the 5 new fields and the constraints array. Replace the example block with:

   ```json
   {
     "kind": "api",
     "work": "feature",
     "workSource": "OBJECTIVE.md",
     "workInherited": false,
     "config": {
       "tdd": "strict; outside-in (HTTP→handler→service); multi-tenant isolation",
       "depth": "comprehensive",
       "model_profile": "quality",
       "verification": "full integration + API contract + tenant-isolation assertions",
       "security_isolation": "multi_tenant_required",
       "back_compat": "none",
       "tdd_default": "strict",
       "test_list_first": "required",
       "fixture_strategy": "inline",
       "outside_in": true,
       "verification_commands": [
         {
           "id": "wrong_tenant_assertion",
           "description": "Test must include an assertion that requests scoped to one tenant cannot access another tenant's data.",
           "pattern": "wrong-tenant|cross-tenant|tenant-isolation",
           "enforcement": "required"
         }
       ]
     },
     "sources": { "tdd": "...", "depth": "...", "security_isolation": "...", ... },
     "constraints": [
       { "id": "no_llm_test_data", "description": "...", "opt_out_field": "..." },
       { "id": "no_property_based_default", "description": "...", "opt_out_field": "..." },
       { "id": "no_gherkin_layer", "description": "...", "opt_out_field": "..." }
     ],
     "directives": [...],
     "warnings": [...]
   }
   ```

2. **Update Step 2's "Print resolved configuration to user" block** to print the 5 new fields. Replace the existing single-line `Defaults:` output with the multi-line grouped format from the gotchas section above. Apply this update in both the explicit-work and inherited-work print formats.

3. **Update Step 3** to drive TRD type AND section emission from the new fields. Replace the existing "Map resolved tdd posture to TRD type" body with:

   > **Step 3 — Map resolved fields to TRD shape.** The defaults table's structured fields drive both TRD `type` and TRD body sections:
   >
   > **TRD type selection:**
   > - `result.config.tdd_default === "skip"` AND no playbook detected → `type: standard` (with `<!-- TDD-EXCEPTION: prototype/spike or explicit-skip work -->` comment)
   > - All other values → `type: tdd`
   >
   > **TRD section emission (per resolved field):**
   > - `result.config.test_list_first === "required"` → emit a `## Test list` section in the TRD body, listing behavior cases (happy + edge + failure) BEFORE any test code prescription. Required for every type:tdd TRD by the user's CLAUDE.md TDD Playbook habit 2.
   > - `result.config.fixture_strategy ∈ {"generators", "cassettes"}` → emit a fixture-builder task as Task 1 of the TRD, ahead of the first RED test task. The task instruction must specify hand-built factory functions (no LLM-generated test data, per the `no_llm_test_data` constraint).
   > - `result.config.security_isolation === "multi_tenant_required"` → inject the wrong-tenant assertion entry from `result.config.verification_commands` into the TRD's `verification_commands` frontmatter (and reference it in the `<verification>` section).
   > - `result.config.outside_in === true` → order TRDs from outermost layer to innermost (system → integration → unit). For type:tdd TRDs, order test cases within the `## Test list` from outermost to innermost as well.
   > - `result.config.back_compat ∈ {"api_parity", "ui_parity", "library_parity", "io_parity", "contract_parity", "behavioral"}` → emit a behavioral parity checklist section in the TRD listing source-behavior cases the new implementation must reproduce. Reference the contract-list-first approach (read source code + tests as documentation, not transplantable fixtures).
   > - `result.config.back_compat === "visual_parity"` → emit a parity-target comment in the TRD; skip the actual visual-diff verification step until tooling lands (per the (ui-lib, *) cells' aspirational tagging).

4. **Insert new Step 4** (renumbering current Step 4 to Step 6) for testing-strategy.md consultation:

   > **Step 4 — Consult `testing-strategy.md` for stack-aware verification routing.** After the resolver returns, load `~/.claude/devflow/references/testing-strategy.md` if it exists. It supplies a layer×tool×stack matrix mapping abstract verification layers (unit, integration, system, AI exploratory, visual) to specific tools per stack (Rails: RSpec/Capybara; Go: testing/httpmock; Flutter: integration_test/widget; etc.). When emitting verification commands in the TRD, route the resolver's stack-agnostic verification text to the stack-appropriate tool from this matrix. The resolver's `kind` field anchors the project's stack family; PROJECT.md frontmatter or detected language extension refines it.
   >
   > Reference: @~/.claude/devflow/references/testing-strategy.md (loaded conditionally; if missing, fall back to the resolver's stack-agnostic verification text verbatim).

5. **Insert new Step 5** for honoring the 3 constraints:

   > **Step 5 — Honor anti-pattern constraints.** `result.constraints` is an array of resolver-level guardrails the planner must respect when generating tasks:
   > - `no_llm_test_data` (opt-out: TRD frontmatter `allow_generated_test_data: true`) — planner MUST instruct the executor to use hand-built fixture builders or recorded cassettes; MUST NOT permit LLM-generated test data.
   > - `no_property_based_default` (opt-out: TRD frontmatter `use_property_based: true`) — planner MUST NOT include property-based testing libraries (rapid/gopter/hypothesis) in tasks; descriptive named test cases instead.
   > - `no_gherkin_layer` (opt-out: TRD frontmatter `use_gherkin: true`) — planner MUST NOT emit `.feature` files or Cucumber-shaped scaffolds; descriptive `t.Run(...)` / `testWidgets('...')` / `test('...')` names carry the meaning.
   >
   > When a constraint is opted out via TRD frontmatter, it is dropped from `result.constraints` automatically (resolver handles this).

6. **Renumber the existing Step 4** ("Apply CLAUDE.md absorbed directives if present") to Step 6. Adjust its body slightly to acknowledge that the structured fields handle most of what was previously freeform text, and only genuinely freeform directives (e.g., habit 3 "one test at a time" — execution-time, not planning-time) get included in TRD `<context>` blocks now.

7. **Update the closing rationale paragraph** ("Why this replaces the old heuristic") to mention the new field-driven section emission as part of the rationale: "The new resolution is deterministic, transparent, and overridable at four levels; structured fields drive section emission and verification routing automatically — no more silent TDD detection heuristic, no more freeform-only playbook absorption."

8. **Add a new top-level `<constraints>` block** in the `<role>` section near the top of the agent prompt (around line 30, after `<user_preferences>`):

   ```xml
   <constraints>
   The resolver emits anti-pattern constraints in `result.constraints`. The planner MUST honor them when generating TRDs:
   - `no_llm_test_data` — Use hand-built fixture builders. No LLM-generated sample data.
   - `no_property_based_default` — No property-based testing libraries unless explicit TRD opt-in.
   - `no_gherkin_layer` — No .feature files or Cucumber scaffolds.

   These constraints are dropped from the array when a TRD opts out via frontmatter (`allow_generated_test_data: true`, `use_property_based: true`, `use_gherkin: true`). The planner reads the array at resolve time and applies it during task generation.
   </constraints>
   ```

# CRITICAL: Preserve all existing planner behavior unrelated to intent resolution. The planner has many other responsibilities (mandatory_discovery, codebase_patterns, etc.) — do not edit those sections.
# CRITICAL: The 8 numbered changes above are surgical edits to the `## Intent Resolution` section + one new section near the top. Do not rewrite the whole agent prompt.
# CRITICAL: The testing-strategy.md reference is conditional ("if exists") because Wave 1's TRD 0.6 commits the file, but the sync-runtime hook may not have mirrored it before the planner runs in a fresh session. The conditional load makes Wave 3 robust to that timing.
# GOTCHA: When extending Step 2's print format, double-check that both the explicit-work and inherited-work formats get updated. The current file has duplicated print blocks (lines 224-230 and 232-241).
# PATTERN: Follow existing planner-prompt section style — XML-tagged blocks, numbered steps, code fences with json/yaml/bash language tags. Do not invent new style conventions.
  </action>
  <verify>
1. `grep -E 'test_list_first|fixture_strategy|security_isolation|back_compat|outside_in' plugins/devflow/agents/planner.md` returns ≥ 5 matches (one per new field).
2. `grep -E 'testing-strategy\\.md' plugins/devflow/agents/planner.md` returns ≥ 1 match.
3. `grep -E 'wrong-tenant|wrong_tenant_assertion' plugins/devflow/agents/planner.md` returns ≥ 1 match.
4. `grep -E 'no_llm_test_data|no_property_based_default|no_gherkin_layer' plugins/devflow/agents/planner.md` returns ≥ 3 matches.
5. `grep -E '## Test list|test list|behavior cases checklist' plugins/devflow/agents/planner.md` returns ≥ 1 match (most likely the literal "## Test list" string in Step 3's body).
6. The frontmatter at the top of `planner.md` (lines 1-5) is unchanged — same `name:`, `description:`, `tools:`, `color:` fields.
7. `head -200 plugins/devflow/agents/planner.md | grep -c '<role>\|<philosophy>\|<discovery_levels>'` shows the existing structural sections are intact.
  </verify>
  <done>
- All 5 new resolver fields are referenced explicitly in the planner prompt with their TRD-emission rules documented.
- `testing-strategy.md` is referenced with a conditional-load instruction.
- The 3 anti-pattern constraints are documented as `<constraints>` block + Step 5.
- The wrong-tenant assertion is documented as a security_isolation-driven injection.
- The new steps preserve precedence (resolver fields → planner sections), with the rationale paragraph updated.
- All grep verifications return at least the threshold matches.
- No regression in existing planner behavior (frontmatter intact, other sections unchanged).
  </done>
  <recovery>
- If a grep returns 0 hits where it should: open the file, locate the section that should have the keyword, paste the missing content. Most common cause: the agent applied the patch in shorthand (`...`) without filling in the literal text.
- If frontmatter at the top is corrupted: `git checkout HEAD -- plugins/devflow/agents/planner.md` reverts only that file. Re-apply edits as 1-section-at-a-time.
- If the prompt becomes too long for the context budget: the existing "old TDD detection heuristic" paragraph (lines 199-201) becomes redundant once the new Step 3 is in place. Replace it with a one-line backreference.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Smoke-test planner agent against a fixture project (read-only — verifies prompt clarity, not execution)</name>
  <files>plugins/devflow/agents/planner.md</files>
  <action>
This task confirms the planner prompt's new instructions are unambiguous by running a manual dry-run check.

Build a fixture project that exercises a multi_tenant_required cell + a generators-fixture cell + an outside_in cell:

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/.planning/objectives/01-api-feature"
cat > "$TMP/.planning/PROJECT.md" <<'EOF'
---
kind: api
default_work: feature
---
EOF
cat > "$TMP/.planning/objectives/01-api-feature/OBJECTIVE.md" <<'EOF'
---
work: feature
---
EOF
```

Resolve the objective and capture the JSON:

```bash
RESOLVED=$(cd "$TMP" && node "$OLDPWD/plugins/devflow/devflow/bin/df-tools.cjs" intent resolve --objective 01-api-feature)
echo "$RESOLVED" | python3 -m json.tool
```

Manual inspection check (not automated): read the printed JSON. Verify the planner prompt's Step 3 instructions would unambiguously produce these TRD sections:

- `## Test list` section (from `test_list_first: required`)
- Wrong-tenant assertion in verification (from `security_isolation: multi_tenant_required`)
- Outside-in TRD ordering note (from `outside_in: true`)

If any of the resolver outputs is missing OR ambiguous when mapped to a TRD section: the planner prompt's Step 3 is under-specified. Refine the prompt — add concrete examples for each field's section emission.

Cleanup: `rm -rf "$TMP"`.

# NOTE: This task is NOT a test of the planner agent's execution (which requires invoking the agent). It is a prompt-clarity smoke test: given the resolved JSON, can a human reader unambiguously determine which TRD sections to emit? If yes, done. If no, refine the prompt.
# GOTCHA: The fixture project depends on TRD 0.2's resolver (Wave 2) being shipped. Wave 3 ships TRDs 0.3 + 0.4 in parallel; both depend on Wave 2.
  </action>
  <verify>
The resolved JSON for `(api, feature)` includes:
- `config.security_isolation: "multi_tenant_required"` — present
- `config.outside_in: true` — present
- `config.test_list_first: "required"` — present
- `config.verification_commands` array with the wrong-tenant entry — present
- `constraints` array of 3 entries — present

The planner prompt's Step 3 documents the section-emission rules for each of those values.
  </verify>
  <done>
- Smoke test JSON output captured and confirmed correct.
- A human reader of the planner prompt can unambiguously map every resolver field to a TRD section.
- No prompt-clarity refinements needed (or, if needed, applied).
  </done>
  <recovery>
- If the resolver doesn't output `verification_commands` (TRD 0.2 missed it): block on TRD 0.2's completion. Do not pre-write the planner prompt for fields that don't exist yet.
- If the planner prompt's instruction for a field is too vague (e.g., "emit appropriate section"): replace with the explicit literal-text instruction documented in this TRD's research_context table.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. All 6 verification grep commands in this TRD's frontmatter return ≥ threshold matches.
2. `head -10 plugins/devflow/agents/planner.md` shows YAML frontmatter intact.
3. The agent prompt structure (XML tags, numbered steps, code fences) is preserved — diff against pre-edit shows additive changes plus surgical edits to the `## Intent Resolution` section.
4. `npm test` continues to pass (the planner prompt is markdown — npm test does not parse it; this is a sanity check that no other file was inadvertently modified).
5. The fixture-project smoke test in Task 2 confirms the resolved JSON has all the new fields the prompt expects to consume.
</verification>

<success_criteria>
Maps to ROADMAP.md objective 0:
- Criterion 3 (Planner agent reads new fields and emits TRD sections — test-list checklist, fixture-builder task, wrong-tenant assertion, outside-in TRD ordering) — full coverage.
- Criterion 6 (Planner consults testing-strategy.md when emitting verification commands) — full coverage via the new Step 4.

Does NOT close criteria 4 (CLAUDE.md absorption — TRD 04), 5 (testing-strategy.md authoring — TRD 06), 7 (migration validated — TRD 05).
</success_criteria>

<output>
After completion, create `.planning/objectives/00-refine-defaults-table/00-03-planner-agent-update-SUMMARY.md` documenting:
- The literal text added under each new step (1-8 from Task 1's action)
- A diff stat against the pre-edit file (lines added/removed)
- Confirmation that the smoke test JSON exhibited all expected fields
- Note on the merge from original-TRD-03 + original-TRD-07 — what content came from each original
- Any places where the agent prompt's new instructions remain ambiguous and need follow-up (these become candidate gaps for /df:plan-objective --gaps)
</output>
