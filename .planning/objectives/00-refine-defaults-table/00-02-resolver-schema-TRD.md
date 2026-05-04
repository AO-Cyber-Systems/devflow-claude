---
objective: 00-refine-defaults-table
trd: 0.2
title: Extend intent.cjs resolver — emit 5 new fields + 3 anti-pattern constraints with provenance
type: tdd
confidence: high
wave: 2
depends_on: [0.1]
files_modified:
  - plugins/devflow/devflow/bin/lib/intent.cjs
  - plugins/devflow/devflow/bin/lib/intent.test.cjs
  - plugins/devflow/devflow/bin/lib/intent-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
autonomous: true
requirements: [SC-2, SC-9, SC-10]
must_haves:
  truths:
    - "resolve() returns config with all 5 new fields (security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy) populated for every (kind, work) cell"
    - "result.constraints array contains exactly the 3 anti-pattern entries from the table when no TRD opt-out is set"
    - "result.sources reports per-field provenance string for all 5 new fields (default value: 'defaults table (kind, work)')"
    - "When CLAUDE.md TDD Playbook is detected (via claude-md.absorb), security_isolation, tdd_default, test_list_first, fixture_strategy promote per the rules in CONTEXT.md §3"
    - "When TRD frontmatter sets allow_generated_test_data / use_property_based / use_gherkin to true, the matching constraint drops out of result.constraints"
    - "The multi_tenant_required path triggers a verification_required entry in result.config.verification_commands (or an equivalent explicit field) with a wrong-tenant assertion sentinel"
    - "All existing intent.test.cjs and intent-cli.test.cjs tests still pass"
    - "All new tests have test: commits before feat: commits"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/intent.cjs"
      provides: "Extended resolver emitting 5 new fields + constraints array + per-field provenance"
      exports: ["resolve", "loadDefaultsTable", "parseDefaultsYaml", "loadConstraints"]
    - path: "plugins/devflow/devflow/bin/lib/intent.test.cjs"
      provides: "Behavior cases + regression tests for new fields, provenance, and constraint opt-out"
      contains: "describe('new fields"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs"
      provides: "Extended fixture builders supporting new frontmatter fields and the 6-kind × 7-work matrix"
      contains: "function buildMatrixProject"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/intent.cjs::resolve"
      to: "plugins/devflow/devflow/references/defaults-table.md::constraints block"
      via: "loadConstraints() reads the second top-level YAML key"
      pattern: "constraints:"
    - from: "plugins/devflow/devflow/bin/lib/intent.cjs::resolve"
      to: "plugins/devflow/devflow/bin/lib/claude-md.cjs::deriveOverrides"
      via: "claudeOverrides applied in precedence order, with multi_tenant_required promoted on api kind"
      pattern: "claudeOverrides\\.(security_isolation|tdd_default|test_list_first|fixture_strategy)"
verification_commands:
  - "npm test"
  - "node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 01-matrix-feat 2>&1 | node -e \"let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const r=JSON.parse(s);for(const f of ['security_isolation','back_compat','tdd_default','test_list_first','fixture_strategy']) if(!(f in r.config)) throw new Error('missing '+f); if(!Array.isArray(r.constraints)) throw new Error('constraints not array'); console.log('OK');});\""
  - "git log --oneline feature/v1.1 -- plugins/devflow/devflow/bin/lib/intent.cjs plugins/devflow/devflow/bin/lib/intent.test.cjs | grep -E '^[a-f0-9]+ test\\(' | head -1"
  - "node -e 'const i=require(\"./plugins/devflow/devflow/bin/lib/intent.cjs\"); const fx=require(\"./plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs\"); const p=fx.buildMatrixProject(); try { const r=i.resolve({projectRoot:p.root, objectiveId:\"01-api-feature\", userHome:\"/nonexistent\"}); if(r.config.security_isolation!==\"multi_tenant_required\") throw new Error(\"expected multi_tenant_required, got \"+r.config.security_isolation); console.log(\"multi_tenant_required round-trip OK\"); } finally { p.cleanup(); }'"
---

<objective>
Extend `plugins/devflow/devflow/bin/lib/intent.cjs` to emit the 5 new structured fields and 3 anti-pattern constraints from the refined defaults table, with per-field provenance metadata. Apply CLAUDE.md TDD Playbook directives as resolver-level promotions per CONTEXT.md §3. Hard-enforce the multi-tenancy verification requirement (CONTEXT.md §4): when `security_isolation == multi_tenant_required`, the resolver MUST inject a wrong-tenant-assertion entry into the verification output that the planner cannot opt out of without an explicit TRD frontmatter override.

Purpose: Closes objective-0 success criterion 2 + 9. The resolver becomes the **enforcement mechanism** for the user's CLAUDE.md TDD Playbook — habits 1, 2, 4, 6 become structured fields the planner can act on rather than freeform text. This is the soak-period TRD: it ships ALONE in Wave 2 so the resolver schema can stabilize before TRDs 03, 04, 05 lock onto it.

Output: Extended resolver library + new tests + extended fixture builders. No CLI surface changes — the existing `df-tools intent resolve` subcommand keeps its shape; only the JSON structure of its output grows.

Why TDD: pure-logic structured-input/output transformation. Matches CLAUDE.md TDD Playbook habits 2 (test list first) and 4 (fixture builders).
</objective>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

## Test list

Per CLAUDE.md TDD Playbook habit 2 — write the behavior-cases checklist before any test code. Each bullet is a planned test case in `intent.test.cjs` (existing file, append new `describe('new fields...')` blocks). Order corresponds to the RED-GREEN-REFACTOR sequence below.

**Group A — table parsing extension (`describe('new fields — table parse')`)**
- A1 happy path: `loadDefaultsTable()` returns a cell with all 9 fields populated for `(api, feature)` after Wave 1 ships the new table.
- A2 happy path: `loadConstraints()` returns an array of 3 entries: `no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer`.
- A3 edge: when the YAML has `defaults:` but no `constraints:` block (legacy table format), `loadConstraints()` returns an empty array and does not throw.
- A4 failure: when a cell is missing one of the 5 new fields (synthetic fixture table), `loadDefaultsTable()` parses but the field is `undefined` on that cell — propagation behavior is the resolver's concern, not the parser's.

**Group B — resolve() emits new fields with provenance (`describe('new fields — resolve provenance')`)**
- B1 happy path: For an `(api, feature)` fixture project with no CLAUDE.md, `resolve()` returns:
  - `result.config.security_isolation === 'multi_tenant_required'`
  - `result.config.outside_in === true`
  - `result.config.back_compat === 'none'`
  - `result.config.tdd_default === 'strict'`
  - `result.config.test_list_first === 'required'`
  - `result.config.fixture_strategy === 'inline'`
  - `result.sources.security_isolation` matches `/defaults table \(api, feature\)/`
- B2 happy path: For a `(plugin, feature)` fixture project, `result.config.fixture_strategy === 'generators'` and provenance is `defaults table (plugin, feature)`.
- B3 happy path: For a `(api, prototype)` fixture project, `result.config.security_isolation === 'n/a'` and `result.config.tdd_default === 'skip'`.

**Group C — CLAUDE.md TDD Playbook promotion (`describe('new fields — CLAUDE.md absorption')`)**
- C1: When CLAUDE.md absorbs a "TDD Playbook" section with playbook habits 1+6, `(api, prototype)` resolves to `tdd_default: auto` (skip→auto) AND `security_isolation: multi_tenant_required` (override from `n/a`); both provenances become `'CLAUDE.md user playbook'`.
- C2: When the same playbook is present, `(api, feature)` (which already has `tdd_default: strict`) stays at `strict` (strict is the ceiling); provenance stays `'defaults table'` because the value was unchanged.
- C3: When CLAUDE.md absorbs a "Test list first" mention, `test_list_first: optional` cells (any prototype/spike) promote to `required`. Provenance: `'CLAUDE.md user playbook'`.
- C4: When CLAUDE.md absorbs a "fixture builders" mention, `fixture_strategy: inline` cells (foundation/refactor/bugfix on any kind) promote to `generators`. Provenance: `'CLAUDE.md user playbook'`.

**Group D — anti-pattern constraints (`describe('new fields — constraints')`)**
- D1 default: `result.constraints` is an array of 3 entries (`no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer`) for any TRD that does not opt out.
- D2 opt-out via TRD frontmatter: a TRD with frontmatter `allow_generated_test_data: true` produces `result.constraints` of length 2 (no `no_llm_test_data`).
- D3 opt-out via TRD frontmatter: a TRD with frontmatter `use_property_based: true` produces `result.constraints` excluding `no_property_based_default`.
- D4 opt-out: TRD with `use_gherkin: true` excludes `no_gherkin_layer`.
- D5 multiple opt-outs: TRD with all three set to true produces `result.constraints == []`.

**Group E — multi-tenancy hard-enforcement (`describe('new fields — multi_tenant_required injection')`)** *(CRITICAL: this is the path the locked decisions in CONTEXT.md §4 hard-enforce; tests run against fixtures even though devflow-claude itself is plugin/multi-tenant-N/A)*
- E1: When `result.config.security_isolation === 'multi_tenant_required'`, `result.config.verification_commands` (new array field on config) contains an entry whose pattern includes `wrong-tenant` or `cross-tenant` or `tenant-isolation`.
- E2: When `result.config.security_isolation === 'single_tenant'` or `n/a`, `result.config.verification_commands` does NOT carry a wrong-tenant entry.
- E3: A TRD frontmatter `skip_multi_tenant_check: true` (escape hatch — only acceptable with explicit acknowledgement) drops the wrong-tenant entry. Provenance flag `result.warnings` MUST include a "multi-tenancy check explicitly skipped" message.
- E4: The existing intent-cli.test.cjs `every cell resolves cleanly` matrix test extends to assert that every (api, *) non-skip/non-spike cell receives the verification_commands entry.

**Group F — backward-compat and field-presence sanity (`describe('new fields — back-compat')`)**
- F1: All existing intent.test.cjs tests pass unchanged (the 4 original fields keep their behavior).
- F2: `result.directives` array shape is unchanged from current behavior.
- F3: `result.warnings` adds entries for new failure modes (missing field on cell, missing constraints block) but never throws.
- F4: `df-tools intent resolve` CLI output JSON has all 5 new fields under `config` and a top-level `constraints` array.

**Group G — fixture builder for the 6×7 matrix (`describe('intent-fixtures — buildMatrixProject')`)**
- G1: `buildMatrixProject()` creates a project with 42 objectives covering every (kind, work) combination, returning `{ root, cleanup, objectiveIds }`.
- G2: Each objective directory contains a valid OBJECTIVE.md with the correct work frontmatter and a stub TRD with the correct work frontmatter.
- G3: The matrix project supports per-cell projectFrontmatter override (kind selection per cell), with PROJECT.md kind set per "primary kind" decision (default: api; the matrix sub-objectives carry their own work, and one matrix variant exists per kind via `buildMatrixProject({ kind: '<kind>' })` calls — total of 6 builds × 7 objectives = 42 sample resolves in the round-trip test).

The 28 enumerated cases above cover happy paths (B1–B3, D1, F1), edge cases (A3, B3, C2, D5, E2), failure modes (A4, E3 with warning, F3), and the multi-tenancy hard-enforcement path (E1–E4). Cases B1, C1, E1 specifically exercise the multi_tenant_required round-trip per CONTEXT.md §8.

## RED → GREEN → REFACTOR plan

Three atomic commits per the user's TDD Playbook habit:

1. `test(00-02): add failing test list for resolver schema extension` — Add the 28 test cases above as failing tests. Confirm `npm test` reports them red, then commit. (Group A through G all red.)

2. `feat(00-02): extend resolver to emit 5 new fields + constraints with provenance` — Implement until all tests pass. Includes:
   - `loadConstraints()` helper that parses the second top-level YAML key
   - Extension of `parseDefaultsYaml()` to populate the 5 new fields onto each cell (or rely on the spread in line 174 — which already handles unknown fields, so likely just a parser tweak to handle `outside_in: true` boolean unquoted)
   - Extension of `resolve()` to populate provenance for new fields, apply CLAUDE.md absorption per CONTEXT.md §3, inject multi_tenant verification commands, and apply TRD opt-outs to constraints
   - Extension of `claude-md.cjs::deriveOverrides()` to emit `security_isolation`, `tdd_default`, `test_list_first`, `fixture_strategy` overrides where the playbook patterns match
   - Extension of `intent-fixtures.cjs` with `buildMatrixProject()` and the OBJECTIVE.md + TRD frontmatter fields needed by the new tests

3. `refactor(00-02): {if needed}` — Only if the GREEN implementation has clear cleanup opportunities. Skip if not.

<embedded_context>

<codebase_examples>
The existing `resolve()` function (intent.cjs lines 131-225) is the model. Key pattern for extending it:

```javascript
// EXISTING (lines 178-182):
const sources = {};
const config = {};
for (const field of ['tdd', 'depth', 'model_profile', 'verification']) {
  config[field] = tableDefaults[field];
  sources[field] = `defaults table (${kind}, ${work})`;
}

// EXTEND TO:
const NEW_FIELDS = ['security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy', 'outside_in'];
for (const field of NEW_FIELDS) {
  if (tableDefaults[field] !== undefined) {
    config[field] = tableDefaults[field];
    sources[field] = `defaults table (${kind}, ${work})`;
  }
}
```

Existing CLAUDE.md absorption pattern (lines 184-188) for `tdd`:

```javascript
// EXISTING:
if (claudeOverrides.tdd && config.tdd !== claudeOverrides.tdd) {
  config.tdd = claudeOverrides.tdd;
  sources.tdd = 'CLAUDE.md user playbook';
}

// EXTEND TO each new structured override:
for (const field of ['security_isolation', 'tdd_default', 'test_list_first', 'fixture_strategy']) {
  if (claudeOverrides[field] && config[field] !== claudeOverrides[field]) {
    config[field] = claudeOverrides[field];
    sources[field] = 'CLAUDE.md user playbook';
  }
}
```

Existing fixture-builder pattern (intent-fixtures.cjs lines 53-100). New `buildMatrixProject` follows the same `mkdtempSync + write OBJECTIVE.md per work` shape — extend with the 7-work loop already used in intent-cli.test.cjs lines 105-110.

Existing TRD frontmatter consumption pattern (intent.cjs lines 200-213) — read trdFm fields and apply, sources tagged 'TRD frontmatter'.
</codebase_examples>

<anti_patterns>
- **Do NOT add a YAML library dependency.** The minimal parser in `parseDefaultsYaml` is sufficient. If it can't handle a value, fix the value shape, not the parser.
- **Do NOT make `loadConstraints()` cache like `loadDefaultsTable()` does.** Cache invalidation is a known foot-gun in the existing code (the test file calls `_resetCache()` explicitly between tests). New caches add new invalidation paths.
- **Do NOT silently mutate `result.constraints` after construction.** The opt-out logic should build the array fresh in each resolve call, not mutate a shared reference.
- **Do NOT promote `tdd_default: skip` straight to `strict` when CLAUDE.md is detected.** The CONTEXT.md §3 rule is `skip → auto` and `auto → strict` — two-step promotion, not one-step. Tests in Group C verify this.
- **Do NOT inject the wrong-tenant verification entry as freeform text.** Use a structured object `{ id: 'wrong_tenant_assertion', description: ..., pattern: ... }` so TRD 03 can render it consistently in TRDs.
- **Do NOT generate test data with the LLM.** Per CLAUDE.md TDD Playbook habit 4 + the `no_llm_test_data` constraint enforced by this very TRD: `intent-fixtures.cjs` extensions must be hand-built factory functions. No `faker`, no AI-completed sample data.
</anti_patterns>

<error_recovery>
- If after step 2 the existing tests in `intent.test.cjs` fail (specifically: "OBJECTIVE.md overrides.tdd:skip overrides defaults table strict for (api, feature)"), the new precedence chain has likely overwritten the OBJECTIVE.md override path. Verify the precedence order is preserved: defaults table → CLAUDE.md → OBJECTIVE.md overrides → TRD frontmatter. The new fields go through the same chain.
- If `loadConstraints()` parsing breaks on edge YAML (lists with multi-word descriptions): the descriptions in the table use quoted strings, so the parser should handle them. If a description contains an unescaped quote, the rewriter (TRD 01) introduced a bad quote — fix the table content, not the parser.
- If `buildMatrixProject` tests run slowly: the test creates 42 OBJECTIVE.md files. Use `fs.mkdirSync(..., {recursive:true})` once per kind and batch-write the OBJECTIVE.md files. Prefer `fs.writeFileSync` over `fs.promises.writeFile` (this codebase is sync throughout — see CLAUDE.md §Conventions).
- If `npm test` reports a regression in `intent-cli.test.cjs::every cell resolves cleanly`: that test asserts the 4 ORIGINAL fields populate. The new fields are additive, so this test should keep passing. If it fails, a parser change accidentally dropped one of the original fields' values — revert that change.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/00-refine-defaults-table/00-CONTEXT.md
@.planning/objectives/00-refine-defaults-table/00-RESEARCH.md
@.planning/research/tdd-scope-refined-defaults.md
@plugins/devflow/devflow/bin/lib/intent.cjs
@plugins/devflow/devflow/bin/lib/intent.test.cjs
@plugins/devflow/devflow/bin/lib/intent-cli.test.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
@plugins/devflow/devflow/bin/lib/claude-md.cjs

# After TRD 0.1 ships:
@.planning/objectives/00-refine-defaults-table/00-01-defaults-table-update-SUMMARY.md
@plugins/devflow/devflow/references/defaults-table.md
</context>

<research_context>
The mapping rules for CLAUDE.md absorption come directly from `tdd-scope-refined-defaults.md` lines 70-83 (RQ3 table) and CONTEXT.md §3.

**Habit 1 → tdd_default promotion rules (CONTEXT.md §3):**
- Cell `tdd_default: skip` + playbook detected → resolver promotes to `auto`, provenance: `'CLAUDE.md user playbook'`
- Cell `tdd_default: auto` + playbook detected → resolver promotes to `strict`, provenance: `'CLAUDE.md user playbook'`
- Cell `tdd_default: strict` + playbook detected → unchanged (strict is ceiling)

**Habit 2 → test_list_first promotion:** Playbook detection promotes `optional` → `required` for any cell.

**Habit 4 → fixture_strategy promotion:** Playbook detection promotes `inline` → `generators` for any cell that doesn't already have `generators` or `cassettes`. (`n/a` cells stay `n/a`.)

**Habit 6 → security_isolation promotion:** Playbook detection promotes `n/a` → `multi_tenant_required` ONLY for `api` kind. Other kinds keep `n/a`.

**Detection signal in claude-md.cjs::deriveOverrides:** Extend the existing pattern-matching to recognize:
- "force tdd trds" / "all features default to tdd strict" → emits `tdd_default: auto` (or `strict` if existing override is already `auto`)
- "test list first" / "behavior cases checklist" → emits `test_list_first: required`
- "fixture builders" / "factory functions" / "no llm-generated test data" → emits `fixture_strategy: generators`
- "multitenancy guard" / "wrong-tenant" / "tenant isolation" → emits `multitenancy: 'required'` (existing) AND a hint that maps to `security_isolation: multi_tenant_required` for api kinds (resolver-side, not absorber-side, since absorber doesn't know the kind)
</research_context>

<gotchas>
- **`outside_in` is a boolean, not a string.** Unquoted `true`/`false` in the YAML. The minimal parser strips quotes from string values and leaves bare `true`/`false` as the strings `"true"`/`"false"`. The resolver must coerce: `config.outside_in = (tableDefaults.outside_in === 'true' || tableDefaults.outside_in === true)`.
- **`multi_tenant_required` for ports:** CONTEXT.md §3 specifies the field per-cell. The (api, port) cell carries `security_isolation: multi_tenant_required`. The verification_commands injection (Group E) applies to ports too — wrong-tenant assertions in port tests are still required.
- **Constraint opt-out fields are TRD-level only.** OBJECTIVE.md and PROJECT.md cannot opt out of constraints. This is by design — opt-out is a per-TRD concern, never project-wide. Tests in Group D create a TRD fixture to verify.
- **Provenance tag for table values:** Use the literal string `defaults table (${kind}, ${work})` for backward compatibility with existing assertions. Do not change the format.
- **Provenance tag for CLAUDE.md absorption:** Use `'CLAUDE.md user playbook'` for backward compat with existing tests (line 137 of intent.test.cjs).
- **Provenance tag for TRD opt-out:** Use `'TRD frontmatter <field>'` (e.g., `'TRD frontmatter allow_generated_test_data'`).
- **The existing `claudeOverrides.tdd` returns the literal string `'strict'`.** When extending deriveOverrides, mirror this style: emit the cell-value string the resolver should adopt, not a flag like `{promote: true}`.
- **`loadConstraints()` should fall back to a hardcoded array if the table lacks a constraints block.** Reason: backward-compat with TRD 0.1's "any field missing means it propagates as undefined" behavior. The hardcoded fallback list is the same 3 entries; if the table has them, those win. Tests in A3 verify the empty-block path returns []; the hardcoded fallback applies only when the resolver detects a clearly-broken parse, surfacing as `result.warnings`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write 28 failing test cases + extended fixture builder, commit as test:</name>
  <files>plugins/devflow/devflow/bin/lib/intent.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs, plugins/devflow/devflow/bin/lib/intent-cli.test.cjs</files>
  <action>
Following the test list in this TRD's Test list section above, append three new `describe(...)` blocks to `intent.test.cjs`:

1. `describe('new fields — table parse', ...)` — Group A (4 cases)
2. `describe('new fields — resolve provenance', ...)` — Group B (3 cases)
3. `describe('new fields — CLAUDE.md absorption', ...)` — Group C (4 cases)
4. `describe('new fields — constraints', ...)` — Group D (5 cases)
5. `describe('new fields — multi_tenant_required injection', ...)` — Group E (4 cases)
6. `describe('new fields — back-compat', ...)` — Group F (4 cases — F2 and F3 may be tiny `assert.ok(...)` smoke tests)

Append to `intent-cli.test.cjs`:
7. `describe('intent-fixtures — buildMatrixProject', ...)` — Group G (3 cases, exercising the matrix factory)

Extend `intent-fixtures.cjs` with:
- `function buildMatrixProject({ kind = 'api', overrides = {}, claudeMdUser = undefined } = {})` — creates a project with `kind` set on PROJECT.md and 7 objectives (one per work type), each with the correct OBJECTIVE.md frontmatter. Returns `{ root, userHome, cleanup, objectiveIds }` where objectiveIds is `['01-${kind}-feature', '02-${kind}-port', ..., '07-${kind}-spike']`. The function MUST be hand-built — no LLM-generated data, no faker, no random values.
- Extend `trdMd()` to support new frontmatter fields: `allow_generated_test_data`, `use_property_based`, `use_gherkin`, `skip_multi_tenant_check`. Each is an optional boolean flag.

For each test case:
- Use the test names listed in the Test list section literally (the planner's verification step will grep for them by name in TRD 03).
- Use `assert.strictEqual` / `assert.match` / `assert.deepStrictEqual` consistent with existing tests.
- Each test creates fixtures via `fixtures.buildProject()` or `fixtures.buildMatrixProject()`, runs `intent.resolve()`, and asserts on the result shape.

Run `npm test` to confirm all new tests fail (RED). Existing tests should still pass (no implementation changes yet).

Commit with message: `test(00-02): add failing test list for resolver schema extension`

# CRITICAL: Do NOT touch intent.cjs in this commit. Only test files + fixture extensions. The implementation comes in Task 2.
# CRITICAL: All 28 test cases must run RED. Do not skip cases that look "obvious" — habit 2 (test list first) requires the full list at RED stage.
# CRITICAL: The fixture builder must be hand-built. No `faker`, no `casual`, no LLM-generated sample data. The constraint `no_llm_test_data` (defined in this TRD) applies to this very TRD's tests.
# GOTCHA: When matching error messages with assert.match, use the existing test pattern of `/missing 'kind'/` etc. — keep regex literals on one line.
# PATTERN: Follow existing test patterns from intent.test.cjs lines 11-18 (describe + beforeEach/afterEach, project = fixtures.buildProject, cleanup in afterEach).
  </action>
  <verify>
1. `npm test 2>&1 | grep -c "fail\|FAIL"` returns approximately 28 (give or take a few collapsed cases).
2. Existing tests in intent.test.cjs and intent-cli.test.cjs continue passing — count failures only in the new describe blocks: `npm test 2>&1 | grep -E "fail" | grep -E "new fields|buildMatrixProject"` shows the new failures.
3. `git log --oneline -1` shows a `test(00-02):` commit message.
4. `git diff HEAD~1 -- plugins/devflow/devflow/bin/lib/intent.cjs` is empty (intent.cjs not touched).
  </verify>
  <done>
- All 28 test cases written, named per the Test list section, failing for the right reason (missing fields / missing implementation, not syntax errors).
- Fixture extensions (`buildMatrixProject`, extended `trdMd`) committed as part of this commit.
- `git log` shows a single test: commit. No feat: or refactor: yet.
- Existing tests still pass.
  </done>
  <recovery>
- If new tests fail with syntax errors instead of assertion failures: fix syntax, do not implement features yet.
- If new tests pass unexpectedly (because the existing resolver already handles the case via the spread on line 174): the test is too weak. Strengthen assertions: instead of asserting field presence, assert the exact value AND the provenance string AND the source-precedence behavior.
- If existing tests start failing: revert the fixture-builder changes — `buildMatrixProject` may be conflicting with `buildProject` somehow. Diff and reconcile.
- If commit fails on a hook (verify-commits.js, gate-commits.js): read the hook's error message; usually a missing scope in the commit message. Use the literal commit format `test(00-02): ...` per CLAUDE.md §Conventions.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement resolver schema extension to pass all 28 tests, commit as feat:</name>
  <files>plugins/devflow/devflow/bin/lib/intent.cjs, plugins/devflow/devflow/bin/lib/claude-md.cjs</files>
  <action>
Implement the minimum code needed to pass all 28 tests from Task 1.

Required changes to `intent.cjs`:

1. **Extend `parseDefaultsYaml`** to coerce booleans (`true`/`false`) on field values. The existing parser stores all values as strings; add a normalize step that converts `'true'`/`'false'` → bool for the `outside_in` field specifically. Other fields stay as strings.

2. **Add `loadConstraints(tablePath = DEFAULTS_TABLE_PATH)`** that:
   - Reads the same fenced ```yaml block as `loadDefaultsTable`
   - Locates a top-level `constraints:` key (zero indent)
   - Parses the list of `- id: ... description: ... opt_out_field: ...` entries
   - Returns `[]` if no constraints block (does not throw — Group A3 test verifies this)
   - Does NOT cache (per anti-pattern note above)

3. **Extend `resolve()`** with these additions in this order, preserving the existing precedence chain:

   ```
   // After line 175 (tableDefaults established):
   //
   // Step 1: populate the 5 new fields onto config + sources from tableDefaults
   const NEW_FIELDS = ['security_isolation', 'back_compat', 'tdd_default',
                       'test_list_first', 'fixture_strategy', 'outside_in'];
   for (const field of NEW_FIELDS) {
     if (tableDefaults[field] !== undefined) {
       config[field] = tableDefaults[field];
       sources[field] = `defaults table (${kind}, ${work})`;
     }
   }

   // Step 2: load constraints from table; apply TRD opt-outs from trdFm
   let constraints = loadConstraints(tablePath);
   if (trdFm) {
     const optOutMap = {
       'allow_generated_test_data': 'no_llm_test_data',
       'use_property_based': 'no_property_based_default',
       'use_gherkin': 'no_gherkin_layer',
     };
     for (const [trdField, constraintId] of Object.entries(optOutMap)) {
       if (trdFm[trdField] === true) {
         constraints = constraints.filter(c => c.id !== constraintId);
       }
     }
   }

   // Step 3: apply CLAUDE.md absorption to new fields per CONTEXT.md §3 promotion rules
   //         (existing absorbtion for tdd already runs at line 184; extend it)
   const promotion = {
     tdd_default: { skip: 'auto', auto: 'strict', strict: 'strict' },
     test_list_first: { optional: 'required', required: 'required' },
     fixture_strategy: { inline: 'generators', cassettes: 'cassettes', generators: 'generators', 'n/a': 'n/a' },
   };
   if (claudeOverrides._playbookDetected) {  // new flag from claude-md.cjs
     for (const field of ['tdd_default', 'test_list_first', 'fixture_strategy']) {
       if (config[field] !== undefined) {
         const promoted = promotion[field][config[field]];
         if (promoted && promoted !== config[field]) {
           config[field] = promoted;
           sources[field] = 'CLAUDE.md user playbook';
         }
       }
     }
     // security_isolation: only promote n/a → multi_tenant_required for api kind
     if (kind === 'api' && config.security_isolation === 'n/a') {
       config.security_isolation = 'multi_tenant_required';
       sources.security_isolation = 'CLAUDE.md user playbook';
     }
   }

   // Step 4: inject multi-tenancy verification entry per CONTEXT.md §4
   config.verification_commands = config.verification_commands || [];
   if (config.security_isolation === 'multi_tenant_required') {
     if (trdFm && trdFm.skip_multi_tenant_check === true) {
       warnings.push('multi-tenancy check explicitly skipped via TRD frontmatter skip_multi_tenant_check');
     } else {
       config.verification_commands.push({
         id: 'wrong_tenant_assertion',
         description: 'Test must include an assertion that requests scoped to one tenant cannot access another tenant\'s data.',
         pattern: 'wrong-tenant|cross-tenant|tenant-isolation',
         enforcement: 'required',
       });
     }
   }

   // Step 5: include constraints in the return shape
   // (modify the existing return at line 215 to include `constraints`)
   ```

4. **Update the return shape** at line 215-224 to add `constraints` as a top-level field:

   ```
   return {
     kind,
     work,
     workSource,
     workInherited: workSource !== 'OBJECTIVE.md' && workSource !== 'TRD',
     config,
     sources,
     constraints,
     directives: directives._sources || [],
     warnings,
   };
   ```

5. **Export `loadConstraints`** from the module's `module.exports` block.

Required changes to `claude-md.cjs::deriveOverrides`:

1. Set `overrides._playbookDetected = (tddSections.length > 0)` so the resolver knows when the user has any TDD playbook section at all.
2. Add pattern recognition for new directive shapes:
   - `/test list (first|of behaviors)/` → `overrides.test_list_first = 'required'`
   - `/fixture (builders|generators|factory)/` → `overrides.fixture_strategy = 'generators'`
   - `/no llm[\- ]generated test data/` → also sets `overrides.fixture_strategy = 'generators'`

Run `npm test`. All 28 new tests pass. All existing tests continue to pass. Commit with message: `feat(00-02): extend resolver to emit 5 new fields + constraints with provenance`

# CRITICAL: The verification_commands array on `config` is a NEW field. Tests in Group E reference it; do not name it differently.
# CRITICAL: The `_playbookDetected` flag is internal — its presence on `claudeOverrides` is fine, but it should NOT appear on the final `result.config` or `result.sources`. Strip it if it leaks.
# CRITICAL: Order of operations matters: TRD frontmatter (level 1) must remain the ULTIMATE override. The new field promotions from CLAUDE.md (level 3) must come BEFORE OBJECTIVE.md overrides (level 2) and TRD frontmatter (level 1). Re-read intent.cjs lines 184-213 — preserve that precedence for the new fields.
# GOTCHA: When a cell has a new field set explicitly (e.g., `security_isolation: multi_tenant_required` from the table), the CLAUDE.md absorption should NOT downgrade it. Only promote, never downgrade. The promotion table in step 3 above handles this correctly (`strict` stays `strict`, etc.).
# PATTERN: The existing `claudeOverrides.multitenancy === 'required'` flag is preserved for backward compat. The new `security_isolation` promotion is in addition to it, not a replacement.
  </action>
  <verify>
1. `npm test` exits 0. Specifically:
   - All 28 new test cases (Groups A–G) pass GREEN.
   - All ~30 existing tests in intent.test.cjs and intent-cli.test.cjs continue passing.
2. `node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective <fixture>` (after building a fixture project) returns JSON with: top-level `constraints` array of length 3 (or fewer if opt-out), `config.security_isolation`, `config.outside_in`, `config.verification_commands` array.
3. `git log --oneline -2` shows test:(00-02): commit followed by feat:(00-02): commit (in that order).
4. The multi_tenant_required round-trip command in this TRD's verification_commands frontmatter passes.
  </verify>
  <done>
- All 28 new tests GREEN. All existing tests still GREEN.
- `result.constraints` is the documented shape: `Array<{id, description, opt_out_field}>`.
- `result.config.verification_commands` carries the wrong-tenant entry whenever security_isolation === multi_tenant_required (and no skip_multi_tenant_check opt-out).
- Provenance is reported per new field with the literal source strings tested in Groups B and C.
- Two commits on the branch: test:(00-02) before feat:(00-02). git log verifies the order.
  </done>
  <recovery>
- If test C2 fails ("strict stays strict under playbook detection"): the promotion table inverted somewhere. Re-check the table — `strict: 'strict'` must be a self-map, not absent.
- If test E3 fails ("skip_multi_tenant_check produces warning"): warnings array is being shadowed somewhere. The function-scope `warnings` declared at line 145 must be the one pushed to throughout the function.
- If a regression test fails (existing tests breaking): the most likely cause is the parser's bool coercion eating a string value that should stay a string. Narrow the coercion to the `outside_in` field specifically.
- If `loadConstraints()` returns the wrong shape: verify the YAML constraints block is reproduced verbatim from `tdd-scope-refined-defaults.md` lines 478-490.
- If the fixture builder generates flaky tmp paths (race conditions): use `fs.mkdtempSync` per the existing pattern; never re-use directory names. Failure to clean up between tests appears as cross-test pollution.
- If GH issue #20 needs an update on completion: the orchestrator handles that, not this TRD.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `npm test` passes — all 28 new tests + all existing tests green.
2. `git log` shows a `test(00-02):` commit immediately preceding a `feat(00-02):` commit. (Per CLAUDE.md TDD Playbook habit: 2-3 atomic commits per TDD TRD.)
3. The multi_tenant_required round-trip verification command in this TRD's frontmatter exits 0.
4. `result.constraints` contains exactly the 3 entries when no TRD opt-out is set; correctly drops entries when TRD frontmatter opts out.
5. The `verification_commands` array on `result.config` contains a `wrong_tenant_assertion` entry for every (api, *) cell except prototype/spike (which have `security_isolation: n/a`).
6. The 5 new fields have per-field provenance entries in `result.sources`.
7. CLAUDE.md absorption promotes per the rules in CONTEXT.md §3, with provenance set to `'CLAUDE.md user playbook'`.
</verification>

<success_criteria>
Maps to ROADMAP.md objective 0:
- Criterion 2 (resolver emits 5 new fields + 3 constraints; provenance per field) — full coverage.
- Criterion 9 (round-trip on a fixture project covering 6 kinds × 7 work types and exercising multi_tenant_required) — `buildMatrixProject` + Group E tests cover this.
- Criterion 10 (npm test passes; new TDD-tagged TRDs ship test: commits before feat: commits) — verified by the commit-order assertion in this TRD's verification.
- Indirectly enables criterion 4 (CLAUDE.md absorption mapping — TRD 04 builds on the deriveOverrides extension landed here).

Does NOT enable criterion 7 (migration validated against 01-handoff-watcher) — that is TRD 05's concern.
</success_criteria>

<output>
After completion, create `.planning/objectives/00-refine-defaults-table/00-02-resolver-schema-SUMMARY.md` documenting:
- The final resolver output shape (JSON example with all 5 new fields + constraints + verification_commands)
- The CLAUDE.md absorption promotion table (cell value → playbook-promoted value)
- The TRD opt-out matrix (frontmatter field → constraint dropped)
- Any rough edges encountered (e.g., parser quirks for bool coercion)
- Commit hashes for the test: and feat: commits
</output>
