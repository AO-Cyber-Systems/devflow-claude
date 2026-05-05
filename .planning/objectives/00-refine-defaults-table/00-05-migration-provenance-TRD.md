---
objective: 00-refine-defaults-table
trd: 0.5
title: Migration validation + per-field provenance integration test
type: tdd
confidence: medium
wave: 4
depends_on: [0.1, 0.2, 0.3, 0.4]
files_modified:
  - plugins/devflow/devflow/bin/lib/intent.cjs
  - plugins/devflow/devflow/bin/lib/intent-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/migrate.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
autonomous: true
requirements: [SC-2, SC-7, SC-9]
must_haves:
  truths:
    - "Existing 01-handoff-watcher objective directory parses and resolves cleanly under the new resolver schema (no breakage)"
    - "df-tools intent resolve --objective <fixture> round-trips successfully on a 6-kind × 7-work matrix project (42 cells)"
    - "result.provenance.<field> reports the correct source string per field (table | user_playbook | objective_override | trd_override) for ALL 9 fields, not just the 4 original"
    - "Pre-existing PROJECT.md / OBJECTIVE.md files (without the 5 new fields in their override blocks) parse without warnings beyond the existing 'kind missing' fallback"
    - "The wrong-tenant verification entry surfaces correctly on every (api, *) cell that should have it (5 cells: feature, port, refactor, foundation, bugfix)"
    - "When an OBJECTIVE.md adds an explicit `overrides.security_isolation: single_tenant` block, the resolver respects it and the wrong-tenant entry drops out"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/intent.cjs"
      provides: "Final touches to provenance reporting — promote sources object to result.provenance for clarity"
    - path: "plugins/devflow/devflow/bin/lib/intent-cli.test.cjs"
      provides: "End-to-end migration + provenance integration tests"
      contains: "describe('migration"
      contains_also: "describe('provenance"
    - path: "plugins/devflow/devflow/bin/lib/migrate.test.cjs"
      provides: "Regression test for 01-handoff-watcher migration validation"
      contains: "01-handoff-watcher"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/intent.cjs::resolve"
      to: ".planning/objectives/01-handoff-watcher/01-00-OBJECTIVE.md"
      via: "Real-objective round-trip through the resolver"
      pattern: "01-handoff-watcher"
verification_commands:
  - "npm test"
  - "node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 01-handoff-watcher 2>&1 | node -e \"let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const r=JSON.parse(s);if(!r.config.tdd) throw new Error('01-handoff-watcher resolution missing tdd field — migration broke'); if(!r.kind) throw new Error('missing kind'); console.log('01-handoff-watcher resolves OK: kind='+r.kind+' work='+r.work);});\""
  - "git log --oneline feature/v1.1 -- plugins/devflow/devflow/bin/lib/intent.cjs plugins/devflow/devflow/bin/lib/intent-cli.test.cjs plugins/devflow/devflow/bin/lib/migrate.test.cjs | grep -E '^[a-f0-9]+ test\\(' | head -1"
  - "node -e 'const i=require(\"./plugins/devflow/devflow/bin/lib/intent.cjs\"); const fx=require(\"./plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs\"); const k=fx.buildMatrixProject({kind:\"api\"}); try { for (const id of k.objectiveIds) { const r=i.resolve({projectRoot:k.root, objectiveId:id, userHome:\"/nonexistent\"}); if(!r.provenance) throw new Error(\"no provenance object on \"+id); for (const f of [\"tdd\",\"depth\",\"model_profile\",\"verification\",\"security_isolation\",\"back_compat\",\"tdd_default\",\"test_list_first\",\"fixture_strategy\"]) { if(!r.provenance[f]) throw new Error(\"missing provenance for field \"+f+\" on \"+id); } } console.log(\"all 7 api cells × 9 fields have provenance\"); } finally { k.cleanup(); }'"
---

<objective>
Final integration TRD for objective 0. Two purposes:

1. **Migration validation:** Confirm pre-existing project state (specifically the `01-handoff-watcher` objective directory shipped on this branch) round-trips through the extended resolver without breaking. The 5 new fields are additive and the `01-handoff-watcher` objective doesn't carry overrides for them — so the cell defaults must apply cleanly.

2. **Per-field provenance reporting:** Promote the existing `result.sources` object to a more discoverable `result.provenance` field with a normalized vocabulary (`table` | `user_playbook` | `objective_override` | `trd_override`). The current `sources` object uses freeform strings (`'defaults table (api, feature)'`, `'CLAUDE.md user playbook'`, etc.) which is human-readable but tedious for downstream consumers (#12, #13) to parse. The `provenance` field carries enum-normalized values; `sources` stays for human-readable detail.

Purpose: Closes objective-0 success criteria 7 and consolidates 2 + 9 with end-to-end integration coverage. Without this TRD, the resolver schema changes are tested in isolation but no test verifies the full system against a real objective.

Output: Final intent.cjs touch (add `provenance` field with enum normalization), integration tests covering the 6×7 matrix + the real `01-handoff-watcher` objective, and migration regression coverage.

Why TDD: pure logic (enum normalization), structured input/output (resolver result), fits the RED→GREEN→REFACTOR shape.

Why Wave 4 (last): integrates everything from Waves 1-3. Catches any issues from upstream TRDs that didn't surface in their isolated test suites.
</objective>

## Test list

Per CLAUDE.md TDD Playbook habit 2 — write the behavior-cases checklist before any test code.

**Group A — provenance enum normalization (`describe('provenance — enum normalization')`)**
- A1: For an `(api, feature)` resolution with no overrides, `result.provenance.tdd === 'table'` AND `result.provenance.security_isolation === 'table'` AND `result.provenance.outside_in === 'table'`.
- A2: When CLAUDE.md absorbs a TDD Playbook section that promotes `tdd_default: skip → auto`, `result.provenance.tdd_default === 'user_playbook'`. The legacy `result.sources.tdd_default` is `'CLAUDE.md user playbook'` (preserved for human-readable use).
- A3: When OBJECTIVE.md sets `overrides.security_isolation: 'single_tenant'`, `result.provenance.security_isolation === 'objective_override'` and the wrong-tenant verification command drops from `result.config.verification_commands`.
- A4: When TRD frontmatter sets `type: tdd`, `result.provenance.tdd === 'trd_override'`.
- A5: All 9 fields on `result.provenance` are populated for every (kind, work) cell — `result.provenance` is a complete map, never partial. Covers: tdd, depth, model_profile, verification, security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy.

**Group B — full-matrix round-trip (`describe('matrix — 6 kinds × 7 works round-trip')`)**
- B1: For each kind ∈ {api, app, library, ui-lib, cli, plugin}, build a project with 7 objectives (one per work). Resolve all 7. Assert: every resolution has `result.config` populated with all 9 fields, `result.provenance` populated for all 9 fields, `result.kind` matches the project kind, `result.work` matches the objective work. Total: 42 resolutions per matrix run × 6 matrix runs = 42 unique (kind, work) cells, each verified once. (Implementation note: 6 separate `buildMatrixProject({ kind })` calls; assertions inside the loop.)
- B2: For the api kind specifically, verify the 5 cells that should carry the wrong-tenant entry (feature, port, refactor, foundation, bugfix) actually do, AND the 2 cells that should NOT carry it (prototype, spike) actually don't.
- B3: For the (plugin, feature) cell specifically, verify `result.config.fixture_strategy === 'generators'` (the only cell with this value in the table). Provenance: `'table'`.

**Group C — migration validation against 01-handoff-watcher (`describe('migration — 01-handoff-watcher regression')`)**
- C1: Read `.planning/objectives/01-handoff-watcher/01-00-OBJECTIVE.md` from the actual project disk. Resolve it via `intent.resolve({ projectRoot: <repo root>, objectiveId: '01-handoff-watcher' })`. Assert: no thrown error, `result.kind === 'plugin'` (devflow-claude's PROJECT.md sets this), `result.work` is whatever the OBJECTIVE.md declares (likely 'feature'), all 9 config fields populated.
- C2: For the same objective, assert `result.warnings` is empty OR contains only the pre-existing `kind missing` warning (which doesn't apply since devflow-claude has kind=plugin). The 5 new fields should not introduce any new warnings.
- C3: Read the 8 TRD files under `.planning/objectives/01-handoff-watcher/` and resolve each via `--trd <path>`. Assert: each resolution succeeds, `result.config` reflects TRD frontmatter overrides where present.

**Group D — explicit overrides cascade (`describe('overrides — multi-level cascade')`)**
- D1: An OBJECTIVE.md with `overrides.security_isolation: 'single_tenant'` overrides the table's `multi_tenant_required` for an (api, feature) cell. The wrong-tenant verification entry drops from `result.config.verification_commands`. `result.provenance.security_isolation === 'objective_override'`.
- D2: An OBJECTIVE.md with `overrides.fixture_strategy: 'cassettes'` overrides the table's `inline` default. `result.provenance.fixture_strategy === 'objective_override'`.
- D3: TRD frontmatter `outside_in: false` (boolean) overrides an OBJECTIVE.md `overrides.outside_in: true`. `result.provenance.outside_in === 'trd_override'`.

**Group E — CLI surface integration (`describe('CLI — full schema in JSON output')`)**
- E1: `df-tools intent resolve --objective <fixture-id>` returns JSON with `result.provenance` as a top-level field (not just `sources`). Backward-compat: `result.sources` remains for human-readable strings.
- E2: `--raw` flag produces compact JSON with both `provenance` and `sources` fields.

**Group F — back-compat and regressions (`describe('back-compat — existing functionality')`)**
- F1: All existing tests in intent.test.cjs, intent-cli.test.cjs, claude-md.test.cjs, migrate.test.cjs continue passing.
- F2: The deprecated `result.sources` field still has its existing freeform-string values (no one is reading from `provenance` yet; introducing a parallel field doesn't break callers reading `sources`).

The 17 enumerated cases close the integration loop and explicitly cover the multi_tenant_required round-trip on a real-project fixture (C1) AND a synthetic matrix fixture (B1, B2). Migration validation per success criterion 7 happens in Group C.

## RED → GREEN → REFACTOR plan

Two atomic commits:

1. `test(00-05): add migration + provenance integration tests` — Add the 17 test cases above to intent-cli.test.cjs (most), migrate.test.cjs (Group C), and a couple of cross-file scenarios. Confirm `npm test` reports them red.

2. `feat(00-05): add result.provenance enum normalization for resolver output` — Implement until all tests pass. Includes:
   - New helper `normalizeProvenance(sourceString) → 'table' | 'user_playbook' | 'objective_override' | 'trd_override'` mapping freeform `sources` strings to enum values
   - Wire `result.provenance` into the resolver output (mirror of `sources` with enum values)
   - Any small fixups discovered during integration testing (e.g., a Wave-1/2/3 TRD missed an edge case that this TRD's tests catch)

<embedded_context>

<codebase_examples>
Existing `sources` shape (intent.cjs lines 178-181):

```javascript
const sources = {};
for (const field of ['tdd', 'depth', 'model_profile', 'verification']) {
  sources[field] = `defaults table (${kind}, ${work})`;
}
```

Provenance normalization is a string-mapping pure function:

```javascript
function normalizeProvenance(sourceString) {
  if (!sourceString) return 'unknown';
  if (sourceString.startsWith('defaults table')) return 'table';
  if (sourceString === 'CLAUDE.md user playbook') return 'user_playbook';
  if (sourceString.startsWith('OBJECTIVE.md')) return 'objective_override';
  if (sourceString.startsWith('TRD frontmatter')) return 'trd_override';
  return 'unknown';
}
```

The resolver's return shape extends:

```javascript
const provenance = {};
for (const field of Object.keys(sources)) {
  provenance[field] = normalizeProvenance(sources[field]);
}
return { ...existing, provenance, sources, ...rest };
```

Existing `migrate.test.cjs` uses fixture builders for synthetic OBJECTIVE.md projects. For Group C (real-objective regression), use the actual disk path — devflow-claude's repo root is the cwd of the test runner. Construct the path as `path.resolve(__dirname, '../../../../../..')` (relative path from `plugins/devflow/devflow/bin/lib/` → repo root) or use `process.cwd()` if the test is run from repo root (which `npm test` does).

Existing real-disk-read example: none in the current test suite. New pattern, but low-risk: tests are `npm test`-run from the repo root, so `process.cwd()` is the right anchor.
</codebase_examples>

<anti_patterns>
- **Do NOT mutate `result.sources` in place when adding `provenance`.** Build a new `provenance` object alongside; preserve `sources` for back-compat.
- **Do NOT remove the legacy freeform-string `sources` values.** Existing tests assert on regex matches like `/defaults table/` (intent.test.cjs line 39); preserve that contract.
- **Do NOT make Group C tests skip when `01-handoff-watcher` is missing.** That objective IS shipped on this branch (verified — listed in `ls .planning/objectives/`); a missing-objective scenario is a real failure and should fail the test.
- **Do NOT hard-fail the suite if devflow-claude itself is missing CLAUDE.md.** The repo doesn't have `./CLAUDE.md` at repo root — only `~/.claude/CLAUDE.md` (user-level). The resolver handles this gracefully (`absorb` reads both, tolerates missing). Tests should run cleanly without a project-level CLAUDE.md.
- **Do NOT introduce a `result.provenance.<field> === undefined` case.** Group A5 explicitly tests that all 9 fields are populated. If a field is undefined on `sources`, normalizeProvenance returns `'unknown'` — never undefined.
- **Do NOT generate test fixtures via LLM.** The constraint `no_llm_test_data` applies to this very TRD. New fixtures use `buildMatrixProject` (from TRD 0.2) and hand-written project / OBJECTIVE.md content.
</anti_patterns>

<error_recovery>
- If Group C tests fail because `01-handoff-watcher` resolves with unexpected values: the issue is *not* this TRD's bug; it's surfaced by integration. Report which field has the unexpected value and which TRD likely caused it (table edits → TRD 0.1, schema changes → TRD 0.2, etc.). Open a gap closure in the planner-issue tracker and revise the relevant TRD's must_haves.
- If `process.cwd()`-anchored tests are flaky on different machines: switch to `path.resolve(__dirname, '../../../../../..')` (count: lib → bin → devflow → devflow → plugins → repo root). Verify by `console.log(path.resolve(__dirname, '../../../../../..'))` printing the repo root.
- If `result.provenance` introduces a regression in CLI raw output JSON parsing: the new field is additive; consumers reading `sources` continue to work. If a downstream consumer breaks, it's reading from `provenance` already (which doesn't exist yet) — that's a future TRD's concern.
- If matrix tests run slowly (42 cells × 6 matrix builds = 252 assertions): use parallel test execution where possible. Node's native test runner runs tests sequentially by default; for this TRD, sequential is fine — a 252-assertion test should complete in <1 second.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/00-refine-defaults-table/00-CONTEXT.md
@.planning/objectives/00-refine-defaults-table/00-RESEARCH.md
@plugins/devflow/devflow/bin/lib/intent.cjs
@plugins/devflow/devflow/bin/lib/intent.test.cjs
@plugins/devflow/devflow/bin/lib/intent-cli.test.cjs
@plugins/devflow/devflow/bin/lib/migrate.cjs
@plugins/devflow/devflow/bin/lib/migrate.test.cjs

# Real objective on disk for Group C tests:
@.planning/objectives/01-handoff-watcher/01-00-OBJECTIVE.md
@.planning/objectives/01-handoff-watcher/01-01-TRD-watcher-state-lib.md

# Prior TRD SUMMARYs for context:
@.planning/objectives/00-refine-defaults-table/00-01-defaults-table-update-SUMMARY.md
@.planning/objectives/00-refine-defaults-table/00-02-resolver-schema-SUMMARY.md
@.planning/objectives/00-refine-defaults-table/00-03-planner-agent-update-SUMMARY.md
@.planning/objectives/00-refine-defaults-table/00-04-claude-md-absorption-SUMMARY.md
</context>

<research_context>
The provenance enum vocabulary is locked from CONTEXT.md §3 (footnote in the structured-fields table) and ROADMAP.md success criterion 2:

| Enum value | Source string from `sources` |
|---|---|
| `table` | `'defaults table (kind, work)'` |
| `user_playbook` | `'CLAUDE.md user playbook'` |
| `objective_override` | `'OBJECTIVE.md overrides'` |
| `trd_override` | Anything starting with `'TRD frontmatter'` |
| `unknown` | (defensive fallback for unexpected source strings) |

The `unknown` case should never trigger in practice; if it does, it indicates a Wave-1/2/3 TRD introduced an unrecognized source-string format. The Group F2 test asserts `unknown` does not appear on any field for any matrix cell — so any drift is caught at integration time.

**The 01-handoff-watcher migration check is the canonical regression scenario.** That objective shipped on this branch (PR #19, recently merged). Its OBJECTIVE.md frontmatter has whatever fields were committed at that time; since this TRD's resolver changes are additive, the resolution must continue to produce a complete config without errors. The test reads the actual disk file, exercising the real migration path. If the existing OBJECTIVE.md has `work: feature` (it likely does), the resolver returns the (plugin, feature) cell defaults plus the 5 new field values from the table — including `fixture_strategy: generators` (the unique value for that cell).
</research_context>

<gotchas>
- **`result.provenance` is a NEW field.** Down-stream callers (the planner agent, dup-detect in #13) will read it eventually. For Wave 4, no consumer reads it; this TRD just establishes the contract.
- **Wave 4 is the LAST wave.** Any cross-cutting issues surfaced here are gap-closure candidates, not in-scope-for-this-TRD work. Document them in this TRD's SUMMARY for a possible follow-on `--gaps` planning round.
- **The matrix tests' 6 × 7 = 42 cells happen to be the same number as the table cells.** That's coincidence — the matrix builds 7 objectives per kind, but each matrix build only resolves 7 cells per kind (not all 42). Aggregate across kinds: 42 unique (kind, work) cells. Each is verified once per matrix build round. Total: 42 verifications per kind across 6 kinds × 7 works = the full table.
- **Real-disk reads for Group C use `process.cwd()`** which is the repo root when running `npm test`. If tests are run from a sub-directory, the path is wrong. Defensive: pin to `__dirname`-relative path resolution.
- **The migrate.test.cjs is ALREADY testing migration logic.** This TRD adds ONE new test to it (the 01-handoff-watcher regression) — the rest of Group C tests live in intent-cli.test.cjs since they exercise full resolver round-trips, not just migration scaffolding.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Add 17 failing integration tests, commit as test:</name>
  <files>plugins/devflow/devflow/bin/lib/intent-cli.test.cjs, plugins/devflow/devflow/bin/lib/migrate.test.cjs</files>
  <action>
Add tests grouped per the test list:

In `intent-cli.test.cjs`:
- `describe('provenance — enum normalization', ...)` — Group A (5 cases, A1-A5)
- `describe('matrix — 6 kinds × 7 works round-trip', ...)` — Group B (3 cases)
- `describe('overrides — multi-level cascade', ...)` — Group D (3 cases)
- `describe('CLI — full schema in JSON output', ...)` — Group E (2 cases)
- `describe('back-compat — existing functionality', ...)` — Group F (2 cases — F1 is a meta-assertion that the suite itself runs without regression; F2 specifically checks `result.sources` shape)

In `migrate.test.cjs`:
- `describe('migration — 01-handoff-watcher regression', ...)` — Group C (3 cases). Use `process.cwd()` or `path.resolve(__dirname, '../../../../../..')` for repo root anchoring.

Each test creates fixtures (Group A, B, D, E, F use `buildMatrixProject` or `buildProject` from intent-fixtures.cjs); Group C reads real disk (`.planning/objectives/01-handoff-watcher/`).

Group A tests assert on `result.provenance.<field>` — this field doesn't exist yet, so all Group A tests RED with `result.provenance is undefined`.

Group B tests use `buildMatrixProject({ kind })` for each kind; assert on result config + provenance shape.

Group C tests resolve `01-handoff-watcher` from real disk; assert on resolution success + complete config.

Group D tests build a synthetic project with overrides at OBJECTIVE.md and TRD level; assert on cascade.

Group E tests use `runTool` (existing helper in intent-cli.test.cjs) to invoke the CLI; assert on JSON output containing `provenance` field.

Group F tests are meta-checks: F1 is implicit (the suite runs); F2 explicitly checks that `result.sources.tdd` still matches the legacy regex `/defaults table/` for an unmodified resolution.

Run `npm test`. All 17 new tests RED (mostly because `result.provenance` doesn't exist; Group D tests may RED for different reasons depending on what TRD 0.2 actually did with override cascade for the new fields).

Commit with message: `test(00-05): add migration + provenance integration tests`

# CRITICAL: Group C tests read real disk. They must run cleanly even on a fresh check-out — verify by running `npm test` after `git stash` (no, don't actually stash; just sanity-check that the test only reads, doesn't write).
# CRITICAL: Group A5 asserts `result.provenance` has all 9 keys — this is the strictest test. Implementation in Task 2 must populate every field's provenance, not just the 4 originals.
# GOTCHA: When reading real disk for Group C, use try/catch around the resolve call and re-throw with a clearer error if it fails. Otherwise the test failure message is "ENOENT: no such file or directory" which obscures the real cause.
# PATTERN: Existing intent-cli.test.cjs uses `runTool([...args], cwd, opts)` for CLI tests. Use it for Group E. Use direct `intent.resolve(...)` calls for Groups A, B, D, F.
  </action>
  <verify>
1. `npm test 2>&1 | grep -c "fail\|FAIL"` returns approximately 17.
2. `git log --oneline -1` shows `test(00-05):` commit.
3. `git diff HEAD~1 -- plugins/devflow/devflow/bin/lib/intent.cjs` is empty.
4. The 17 RED tests fail with messages indicating "provenance is undefined" or "missing field" for Group A; "01-handoff-watcher resolves but missing X" for Group C; etc.
  </verify>
  <done>
- 17 failing tests written, named per the test list.
- Single test: commit on the branch.
- Existing tests still pass (the new tests are additive).
  </done>
  <recovery>
- If Group C fails because `01-handoff-watcher` doesn't exist on disk: verify `ls .planning/objectives/01-handoff-watcher/` returns files. The objective should be present per `ls .planning/objectives/` showing it.
- If `path.resolve(__dirname, '../../../../../..')` doesn't reach repo root: count directory levels manually from `plugins/devflow/devflow/bin/lib/` (5 levels up to plugins, then 1 more to repo root = 6). Adjust `..`-count accordingly.
- If a Group A test passes unexpectedly: the field shape might be inherited from `result.sources` somewhere — verify the test specifically asserts `result.provenance` (the new field) not `result.sources` (the legacy field).
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Add normalizeProvenance helper + result.provenance field, fix any integration gaps, commit as feat:</name>
  <files>plugins/devflow/devflow/bin/lib/intent.cjs</files>
  <action>
1. Add the `normalizeProvenance` helper at the bottom of `intent.cjs` (before module.exports):

   ```javascript
   function normalizeProvenance(sourceString) {
     if (!sourceString) return 'unknown';
     if (sourceString.startsWith('defaults table')) return 'table';
     if (sourceString === 'CLAUDE.md user playbook') return 'user_playbook';
     if (sourceString.startsWith('OBJECTIVE.md')) return 'objective_override';
     if (sourceString.startsWith('TRD frontmatter')) return 'trd_override';
     return 'unknown';
   }
   ```

2. In `resolve()`, just before the return statement (around line 215), build the provenance map:

   ```javascript
   const provenance = {};
   for (const field of Object.keys(sources)) {
     provenance[field] = normalizeProvenance(sources[field]);
   }
   ```

3. Update the return shape to include `provenance` alongside `sources`:

   ```javascript
   return {
     kind,
     work,
     workSource,
     workInherited: workSource !== 'OBJECTIVE.md' && workSource !== 'TRD',
     config,
     sources,
     provenance,        // NEW
     constraints,       // (from TRD 0.2)
     directives: directives._sources || [],
     warnings,
   };
   ```

4. Run `npm test`. Address any RED tests:
   - **Group A** should now pass: `provenance` exists with normalized enum values.
   - **Group B** should pass for fields that were correctly emitted in TRD 0.2; if any field is missing on `provenance` for a cell, the issue is upstream in TRD 0.2's coverage. Fix the upstream code (still in this TRD's commit) and add a note in the SUMMARY about which Wave-2 gap was closed.
   - **Group C** depends on TRD 0.1's table changes parsing cleanly + TRD 0.2's resolver handling the new fields. If `01-handoff-watcher` resolution returns an unexpected value, document it in the SUMMARY — this is the canonical migration test, and surprises here mean an upstream TRD missed a case.
   - **Group D** depends on TRD 0.2's override cascade for the 5 new fields. If TRD 0.2 didn't extend OBJECTIVE.md `overrides` consumption to the new fields (it may have only handled the 4 original), extend it here.
   - **Group E** is CLI integration; should pass automatically since the JSON shape just gained a new field.
   - **Group F** F2 verifies legacy regex matches; should pass since `sources` is preserved.

5. If Group D RED tests reveal that OBJECTIVE.md's `overrides` block doesn't handle the new fields, extend the resolver:

   ```javascript
   // After existing OBJECTIVE.md overrides loop (line 191-198 of intent.cjs):
   if (objectiveFm && objectiveFm.overrides) {
     const NEW_FIELDS = ['security_isolation', 'back_compat', 'tdd_default',
                         'test_list_first', 'fixture_strategy', 'outside_in'];
     for (const field of NEW_FIELDS) {
       if (objectiveFm.overrides[field] !== undefined) {
         config[field] = objectiveFm.overrides[field];
         sources[field] = 'OBJECTIVE.md overrides';
       }
     }
   }
   ```

6. If Group D's TRD-level override (D3 — `outside_in: false`) RED, extend the TRD frontmatter consumption block (line 200-213):

   ```javascript
   if (trdFm) {
     // Existing logic for type / confidence / multi-tenant skip ...

     // NEW: per-field overrides
     const NEW_FIELDS = ['security_isolation', 'back_compat', 'tdd_default',
                         'test_list_first', 'fixture_strategy', 'outside_in'];
     for (const field of NEW_FIELDS) {
       if (trdFm[field] !== undefined) {
         config[field] = trdFm[field];
         sources[field] = `TRD frontmatter ${field}`;
       }
     }
   }
   ```

7. If Group A's `verification_commands` field needs provenance normalization too: the field is an array of objects, not a single value. Decision: don't add provenance to array fields for Wave 4. Group A5 only requires provenance on the 9 scalar fields. Document this in the SUMMARY.

8. Export `normalizeProvenance` for testability.

Run `npm test`. All 17 new tests pass. All existing tests continue passing. Commit with message: `feat(00-05): add result.provenance enum normalization for resolver output`

# CRITICAL: This is Wave 4. Any unexpected failures in Group B, C, or D may indicate Wave 1, 2, or 3 missed an edge case. Document discoveries in the SUMMARY rather than tracing back through prior TRDs (the prior commits are already merged on the branch — fixes go in this commit).
# CRITICAL: The `provenance` field is additive. Existing consumers of `sources` continue to work. No back-compat break.
# GOTCHA: `verification_commands` array doesn't get its own provenance entry. The field's existence is implied by `security_isolation` provenance being `'table'` or `'objective_override'`. Group A5 explicitly tests scalar fields only.
# PATTERN: Add the new fields to existing override loops (steps 5 and 6 above) rather than creating new dispatch logic. Keep cyclomatic complexity low.
  </action>
  <verify>
1. `npm test` exits 0. All 17 new tests + all existing tests pass.
2. The CLI smoke command in this TRD's verification_commands frontmatter resolves `01-handoff-watcher` and prints kind=plugin, work=feature (or whatever the OBJECTIVE.md declares).
3. The matrix smoke command in verification_commands resolves all 7 api cells and asserts provenance for all 9 fields per cell.
4. `git log --oneline -2` shows `test(00-05)` then `feat(00-05)`.
5. `result.provenance` returned by the resolver has the 9 scalar fields populated for any (kind, work) cell.
  </verify>
  <done>
- All 17 tests GREEN. All existing tests still GREEN.
- `result.provenance` is a normalized enum map alongside the legacy `result.sources`.
- The 01-handoff-watcher migration regression test passes — confirming success criterion 7.
- The 6 × 7 matrix round-trip passes — confirming success criterion 9.
- Two atomic commits on this TRD's range: test(00-05) → feat(00-05).
- Any upstream gaps surfaced during integration are addressed within this commit (and documented in the SUMMARY).
  </done>
  <recovery>
- If `01-handoff-watcher` resolution throws ENOENT or similar disk-read errors: verify `process.cwd()` is the repo root when tests run. Add a `console.log(process.cwd())` at the top of the test file temporarily to diagnose.
- If Group D tests fail because OBJECTIVE.md `overrides` block doesn't override new fields: implement the cascade per step 5 above. This is a legitimate Wave-2 gap that this TRD closes.
- If a previously-passing test now fails: the most likely cause is the new override loops (steps 5/6) overwriting fields incorrectly. The legacy 4-field override loop runs first; extend AFTER it, not in place of it.
- If a regex pattern in tests doesn't match the new `provenance` enum string: verify the test asserts on `provenance.<field>` (enum) vs `sources.<field>` (string). Mixing them is an easy bug.
- If `verification_commands` provenance is unexpectedly assertable somewhere: it isn't supposed to be. Confirm the test asserts on scalar fields only.
- If overall coverage gaps emerge late: list them in the SUMMARY's "follow-on" section. They become inputs for `/df:plan-objective 0 --gaps` if anyone wants to close them.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `npm test` passes — 17 new integration tests + all existing tests green.
2. `01-handoff-watcher` migration regression test passes (Group C) — pre-existing project state survives the schema extension cleanly.
3. The 6×7 matrix round-trip succeeds for every (kind, work) cell with all 9 fields populated on `result.config` and `result.provenance`.
4. `result.provenance` enum values match the locked vocabulary (`table | user_playbook | objective_override | trd_override`).
5. CLI output (`df-tools intent resolve`) includes both `provenance` (new) and `sources` (legacy) fields.
6. The wrong-tenant verification command surfaces correctly on (api, feature/port/refactor/foundation/bugfix) cells; absent on (api, prototype) and (api, spike) cells.
7. OBJECTIVE.md and TRD frontmatter overrides for new fields cascade correctly (Group D).
8. Two atomic commits: test(00-05) → feat(00-05).
</verification>

<success_criteria>
Maps to ROADMAP.md objective 0:
- Criterion 2 (resolver emits 5 new fields + 3 constraints with provenance per field) — final-form coverage with the `provenance` enum normalization added in this TRD.
- Criterion 7 (existing PROJECT.md / OBJECTIVE.md / TRD.md don't break — migration validated against `01-handoff-watcher`) — full coverage via Group C tests.
- Criterion 9 (`df-tools intent resolve --objective <fixture>` round-trips on a fixture covering all 6 kinds × 7 work types and exercises `multi_tenant_required`) — full coverage via Group B tests.
- Criterion 10 (npm test passes; new TDD-tagged TRDs ship `test:` commits before `feat:` commits) — re-verified for this TRD specifically.

Closes the objective. After this TRD ships, all 10 success criteria are satisfied (criteria 1, 3, 4, 5, 6, 8 closed by TRDs 0.1, 0.3, 0.4, 0.6 respectively; criteria 2, 7, 9, 10 closed by this integration TRD).
</success_criteria>

<output>
After completion, create `.planning/objectives/00-refine-defaults-table/00-05-migration-provenance-SUMMARY.md` documenting:
- The final `result.provenance` shape (with example JSON)
- The 4-enum vocabulary mapping table
- 01-handoff-watcher migration outcome (resolved kind, work, config, any unexpected fields)
- Any upstream gaps surfaced during integration and addressed in this commit (e.g., "TRD 0.2 didn't handle OBJECTIVE.md overrides for the new fields; extended in TRD 0.5's commit")
- Follow-on candidates for `/df:plan-objective 0 --gaps` if integration discovered open issues
- Final per-objective status: all 10 success criteria satisfied
</output>
