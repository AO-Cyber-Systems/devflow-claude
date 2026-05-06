---
objective: 21-bidirectional-gh-sync
trd: 05
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/intent.cjs
  - plugins/devflow/devflow/bin/lib/intent.test.cjs
autonomous: true
requirements:
  - PROVENANCE-CELL
  - PROVENANCE-VOCAB

must_haves:
  truths:
    - "intent.resolve() output includes a `cell_provenance` map reporting which table tier supplied each (kind, work) cell value"
    - "Provenance vocabulary extends to: project_table | org_table | bundled_table | user_playbook | objective_override | trd_override"
    - "When override layers (CLAUDE.md, OBJECTIVE.md, TRD frontmatter) override a field, existing `provenance` field reports the override source unchanged"
    - "`cell_provenance` reports the table tier that WOULD HAVE supplied the field if not for the override (debugging aid)"
    - "df-tools intent resolve --raw output includes both `provenance` (effective) and `cell_provenance` (table-tier origin)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/intent.cjs"
      provides: "extended resolve() with cell_provenance"
      contains: "cell_provenance"
    - path: "plugins/devflow/devflow/bin/lib/intent.test.cjs"
      provides: "tests covering cell_provenance for all tier combinations"
      contains: "describe.*cell_provenance"
  key_links:
    - from: "lib/intent.cjs resolve()"
      to: "lib/defaults-loader.cjs loadMergedDefaultsTable"
      via: "consume the provenance map returned alongside the merged table"
      pattern: "merged\\.provenance"
    - from: "lib/intent.cjs resolve() output"
      to: "df-tools intent resolve CLI consumers"
      via: "cell_provenance field in JSON output"
      pattern: "cell_provenance"
---

<objective>
Surface per-cell defaults-table provenance in `intent.resolve()` output. The 3-tier loader from TRD 21-04 already computes which tier supplied each (kind, work, field) cell. This TRD propagates that information through `resolve()` into the resolver's output object so users can answer: "would my project's defaults-table.md have changed this value if not for the OBJECTIVE.md override?"

Purpose: TRD 21-04 builds the merge logic. TRD 21-05 makes the result visible. Without provenance surfacing, users have no way to verify their override file is being read correctly. Debugging hook + transparency feature.

Output: Extended `intent.cjs` `resolve()` populating a new `cell_provenance` field in the result object. Vocabulary extension: `project_table | org_table | bundled_table` (joins existing `user_playbook | objective_override | trd_override`). Tests covering all tier combinations.
</objective>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: existing `provenance` map in `intent.cjs` resolve() output**

```javascript
// CURRENT shape of result:
{
  kind, work, workSource, workInherited,
  config: { tdd, depth, model_profile, verification, security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy, outside_in },
  sources: { tdd: 'defaults table (api, feature)', depth: 'defaults table (api, feature)', ... },
  provenance: { tdd: 'table', depth: 'table', model_profile: 'table', ... },  // normalized vocabulary
  constraints: [...],
  warnings: [...],
}

// EXTEND with:
{
  ...,
  cell_provenance: {
    tdd: 'bundled_table',
    depth: 'project_table',
    model_profile: 'org_table',
    // ... one entry per ALL_FIELDS
  },
}
```

**Pattern: existing `normalizeProvenance` enum mapper**

```javascript
function normalizeProvenance(sourceString) {
  if (!sourceString) return 'unknown';
  if (sourceString.startsWith('defaults table')) return 'table';
  if (sourceString === 'CLAUDE.md user playbook') return 'user_playbook';
  if (sourceString.startsWith('OBJECTIVE.md')) return 'objective_override';
  if (sourceString.startsWith('TRD frontmatter')) return 'trd_override';
  return 'unknown';
}

// EXISTING vocabulary stays UNCHANGED for `provenance` field.
// `cell_provenance` is a SEPARATE field with its own vocabulary: { project_table, org_table, bundled_table }.
```

**Pattern: existing test for provenance (from `intent.test.cjs`)**

```javascript
// Existing tests in intent.test.cjs assert specific source strings:
assert.match(result.sources.tdd, /TRD frontmatter/);
assert.strictEqual(result.provenance.tdd, 'trd_override');

// NEW tests for cell_provenance follow the SAME PATTERN:
assert.strictEqual(result.cell_provenance.tdd, 'project_table');
```

</codebase_examples>

<anti_patterns>

- ❌ **Conflating `provenance` and `cell_provenance`.** They answer different questions:
  - `provenance.tdd` = where the EFFECTIVE value came from (after all overrides) — values: `table | user_playbook | objective_override | trd_override`
  - `cell_provenance.tdd` = which TIER would have supplied this cell from the table merge — values: `project_table | org_table | bundled_table`
  Don't merge these into one field — different vocabularies, different semantics.
- ❌ **Letting `cell_provenance` reflect override layers.** If TRD frontmatter overrides `tdd`, `provenance.tdd === 'trd_override'`. But `cell_provenance.tdd` STILL reports the table-tier origin (e.g., `project_table`) — because that's what the table WOULD have said. The two fields together let users see "the project table said X but my TRD overrode to Y."
- ❌ **Computing cell_provenance lazily.** Compute it once in `resolve()` from the loader's `provenance` map; don't recompute downstream.
- ❌ **Adding cell_provenance to `sources`.** `sources` is human-readable freeform strings; `cell_provenance` is enum. Keep them separate.
- ❌ **Filtering out fields with override.** All ALL_FIELDS get a `cell_provenance` entry, regardless of whether they were overridden. The full table-tier picture is the value.

</anti_patterns>

<error_recovery>

**Failure: defaults-loader's provenance map missing a `kind.work.field` key**
- Possible if TRD 21-04 introduces a NEW field via project_table that's not in bundled. `cell_provenance[field]` defaults to `undefined`.
- Defensive: in `resolve()`, set `cell_provenance[field] = 'unknown'` for any ALL_FIELDS entry not present in the loader's provenance.

**Failure: kind/work pair has no entry in merged table (resolver throws upstream)**
- This already throws in `resolve()` ("No defaults entry for (kind, work)"). cell_provenance never reaches the user in that path. No change.

**Failure: legacy `intent.resolve()` callers expect specific result keys**
- `cell_provenance` is ADDITIVE. Existing callers ignore unknown keys.
- If a caller does `JSON.stringify(result)` and asserts byte-for-byte stability — break. Document as a minor breaking change in the SUMMARY (none of the in-tree callers do this; verify via grep).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/21-bidirectional-gh-sync/OBJECTIVE.md
@.planning/objectives/21-bidirectional-gh-sync/21-CONTEXT.md
@.planning/objectives/21-bidirectional-gh-sync/21-RESEARCH.md
@plugins/devflow/devflow/bin/lib/intent.cjs
@plugins/devflow/devflow/bin/lib/intent.test.cjs
</context>

<research_context>

**Where in `resolve()` to populate `cell_provenance`:**

After loading the merged table (around line 218 of current intent.cjs):

```javascript
const table = loadDefaultsTable(tablePath);
// New: also retrieve the provenance map
const cellProvenance = computeCellProvenance({ kind, work, projectRoot, userHome, tablePath });
// ...
return {
  kind, work, workSource, workInherited,
  config, sources, provenance,
  cell_provenance: cellProvenance,           // NEW
  constraints, directives, warnings,
};
```

**`computeCellProvenance` helper:**

```javascript
function computeCellProvenance({ kind, work, projectRoot, userHome, tablePath }) {
  // Test-path: explicit single-file table → all cells from the same source ('table_explicit')
  if (tablePath !== null && tablePath !== DEFAULTS_TABLE_PATH) {
    const provenance = {};
    for (const field of ALL_FIELDS) provenance[field] = 'table_explicit';
    return provenance;
  }

  // Production path: query defaults-loader for merged provenance
  const merged = defaultsLoader.loadMergedDefaultsTable({ projectRoot, userHome });
  const provenance = {};
  for (const field of ALL_FIELDS) {
    const key = `${kind}.${work}.${field}`;
    provenance[field] = merged.provenance[key] || 'unknown';
  }
  return provenance;
}
```

**`ALL_FIELDS` constant:**

Already defined in `intent.cjs` at line 257:

```javascript
const ALL_FIELDS = ['tdd', 'depth', 'model_profile', 'verification',
  'security_isolation', 'back_compat', 'tdd_default', 'test_list_first',
  'fixture_strategy', 'outside_in'];
```

10 fields per (kind, work) cell. cell_provenance has 10 entries.

**Vocabulary extension:**

Existing `provenance` enum (from `normalizeProvenance`):
- `table` — defaults table cell
- `user_playbook` — CLAUDE.md absorption
- `objective_override` — OBJECTIVE.md overrides block
- `trd_override` — TRD frontmatter
- `unknown` — defensive fallback

New `cell_provenance` enum (from defaults-loader):
- `project_table` — project tier supplied this cell
- `org_table` — org tier supplied this cell
- `bundled_table` — bundled fallback supplied this cell
- `table_explicit` — test path with explicit tablePath (single-file mode)
- `unknown` — defensive fallback (key missing from loader provenance)

Document both vocabularies in `references/defaults-table.md` precedence section.

</research_context>

<gotchas>

- **`cell_provenance` semantics are "what did the merge say BEFORE overrides".** If a user runs `df-tools intent resolve --objective NN` and sees `provenance.tdd === 'trd_override'` AND `cell_provenance.tdd === 'project_table'`, that means: "Your TRD overrode the value, but if it hadn't, your project's defaults-table would have supplied it (overriding org and bundled)."
- **Test path branch in `computeCellProvenance`.** Existing intent tests pass `tablePath: '/path/to/fixture/defaults-table.md'`. Those tests should NOT exercise the 3-tier loader. Branch on `tablePath !== DEFAULTS_TABLE_PATH` to detect test path.
- **defaults-loader cache must be aware of test cwds.** Tests passing different `projectRoot` and `userHome` values rely on cache key including both. TRD 21-04's cache is `${projectRoot || ''}|${userHome || ''}` — should already work.
- **No new CLI flags needed.** `df-tools intent resolve` already exists; this TRD just enriches its output. The output already pretty-prints via `JSON.stringify(result, null, 2)` — `cell_provenance` will appear automatically.
- **TRD 21-05 must run AFTER TRD 21-04 OR alongside it with sub-sequencing.** Both touch `intent.cjs`. The wave guidance says "Wave 1 = [21-01, 21-04, 21-05]"; intra-wave: 21-04 BEFORE 21-05 because 21-05 imports `defaults-loader.cjs` which 21-04 creates.
- **Backwards compatibility:** `result.cell_provenance` is additive. Existing callers (`df-tools intent resolve`, planner agents reading the result) are unaffected.

</gotchas>

<tasks>

<task type="auto" tdd="strict">
  <name>Task 1: Test list + RED → GREEN — extend intent.cjs resolve() with cell_provenance (P1-P8)</name>
  <files>plugins/devflow/devflow/bin/lib/intent.test.cjs, plugins/devflow/devflow/bin/lib/intent.cjs</files>
  <action>
**Test list (add to `intent.test.cjs` as a new describe block):**

```
// describe('cell_provenance', P group):
//   P1: bundled-only environment → all 10 fields per cell report 'bundled_table'
//   P2: org override on (api, feature, tdd) → cell_provenance.tdd = 'org_table'; other 9 fields = 'bundled_table'
//   P3: project override on (api, feature, depth) → cell_provenance.depth = 'project_table'; other 9 fields = 'bundled_table'
//   P4: project + org overrides on different fields → each field reports its supplying tier
//   P5: TRD frontmatter type:tdd overrides effective value → provenance.tdd = 'trd_override' BUT cell_provenance.tdd still reports the table tier (e.g., 'project_table' or 'bundled_table')
//   P6: OBJECTIVE.md overrides.tdd → provenance.tdd = 'objective_override' BUT cell_provenance.tdd still reports table tier
//   P7: explicit tablePath (test-only path) → cell_provenance for all fields = 'table_explicit'
//   P8: cell_provenance is included in --raw JSON output of `df-tools intent resolve`
```

**Refactor `resolve()` in `intent.cjs`:**

Find this block (around line 218):
```javascript
const table = loadDefaultsTable(tablePath);
```

Insert AFTER it:
```javascript
const cellProvenance = computeCellProvenance({ kind, work, projectRoot, userHome, tablePath });
```

Wait — at line 218, `kind` and `work` aren't resolved yet. Move the `computeCellProvenance` call to AFTER kind and work are computed (after line 244 `validateWork(work);`).

```javascript
// After kind + work are validated:
const cellProvenance = computeCellProvenance({ kind, work, projectRoot, userHome, tablePath });
```

Add `computeCellProvenance` helper:

```javascript
const defaultsLoader = require('./defaults-loader.cjs');

function computeCellProvenance({ kind, work, projectRoot, userHome, tablePath }) {
  // Test-only path: explicit single-file tablePath
  if (tablePath !== null && tablePath !== undefined && tablePath !== DEFAULTS_TABLE_PATH) {
    const out = {};
    for (const field of ALL_FIELDS) out[field] = 'table_explicit';
    return out;
  }

  // Production path: 3-tier loader
  let merged;
  try {
    merged = defaultsLoader.loadMergedDefaultsTable({ projectRoot, userHome });
  } catch (e) {
    // If loader fails, fall back to bundled-only-ish: report 'unknown' for all
    const out = {};
    for (const field of ALL_FIELDS) out[field] = 'unknown';
    return out;
  }

  const out = {};
  for (const field of ALL_FIELDS) {
    const key = `${kind}.${work}.${field}`;
    out[field] = merged.provenance[key] || 'unknown';
  }
  return out;
}
```

Add `cell_provenance` to the return object (around line 423):

```javascript
return {
  kind,
  work,
  workSource,
  workInherited: workSource !== 'OBJECTIVE.md' && workSource !== 'TRD',
  config,
  sources,
  provenance,
  cell_provenance: cellProvenance,        // NEW
  constraints,
  directives: directives._sources || [],
  warnings,
};
```

**Test pattern for P5 (TRD override doesn't reduce cell_provenance):**

```javascript
test('P5: TRD type:tdd overrides effective tdd value but cell_provenance.tdd still reports table tier', () => {
  const project = fixtures.buildProject({
    projectFrontmatter: { kind: 'api' },
    objectives: [{ id: '01-foo', work: 'feature' }],
  });
  // Add a project-tier defaults-table.md so cell_provenance has something to report
  fs.writeFileSync(
    path.join(project.root, '.planning', 'defaults-table.md'),
    fxDefaults.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'project tdd' } } }),
    'utf-8'
  );

  const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
  fs.writeFileSync(trdPath, fixtures.trdMd({ type: 'tdd' }), 'utf-8');

  const result = intent.resolve({
    projectRoot: project.root,
    objectiveId: '01-foo',
    trdPath,
    userHome: '/nonexistent',
  });

  // Effective provenance shows TRD override
  assert.strictEqual(result.provenance.tdd, 'trd_override');
  // But cell_provenance still reports what the table merge would have said
  assert.strictEqual(result.cell_provenance.tdd, 'project_table');
});
```

# CRITICAL: cell_provenance is computed ONCE per resolve() call. Don't make it lazy or memoize per field — the cost is sub-millisecond.
# GOTCHA: P7 (explicit tablePath = 'table_explicit') needs to be tested with a fixture file path that ISN'T the bundled DEFAULTS_TABLE_PATH. Existing intent tests use fixture paths from `intent-fixtures.cjs` — they hit this branch.
# GOTCHA: defaults-loader caches by (projectRoot, userHome). Tests changing projectRoot between cases avoid cache pollution; same-projectRoot tests should call `intent._resetCache()` (which cascades).
# PATTERN: cell_provenance is symmetric to existing provenance — same fields, different vocabulary. JSON output is naturally well-shaped.
  </action>
  <verify>
```bash
# All P tests pass
node --test plugins/devflow/devflow/bin/lib/intent.test.cjs 2>&1 | grep -c "^ok"               # >=existing+8 (P1-P8)
node --test plugins/devflow/devflow/bin/lib/intent.test.cjs 2>&1 | grep -c "^not ok"           # 0

# CLI output includes cell_provenance
node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --raw 2>&1 | grep -c "cell_provenance"   # >=1

# Full suite
npm test 2>&1 | tail -3                                                                          # 2053+ baseline + 8 new
```
  </verify>
  <done>P1-P8 pass. `intent.cjs` `resolve()` returns `cell_provenance` field. CLI output includes it. Existing intent tests still green (additive change). ~16 atomic commits (test:/feat: pairs).</done>
  <recovery>If existing intent tests fail: the cause is either (a) byte-for-byte JSON comparison in a test, or (b) the new defaults-loader.cjs require failing because TRD 21-04 hasn't shipped yet. (a) — relax the assertion to spot-check known fields. (b) — sub-sequence within Wave 1: 21-04 must complete before 21-05 starts (depends_on stays empty, but executor scheduler should run them in order; document in COMMIT message if executor doesn't sequence).</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 2: Document new vocabulary in defaults-table.md and verify CLI output (D1-D2)</name>
  <files>plugins/devflow/devflow/references/defaults-table.md, plugins/devflow/devflow/bin/lib/intent.test.cjs</files>
  <action>
**Test list (additional D group):**

```
// D1: references/defaults-table.md documents both provenance vocabularies
// D2: df-tools intent resolve human-readable (non-raw) output mentions cell_provenance section
```

**Update `plugins/devflow/devflow/references/defaults-table.md`** — find the "Precedence" section near the top of the file (around line 18-19) and append a Provenance subsection:

```markdown
## Provenance

`df-tools intent resolve` returns two parallel provenance maps:

**`provenance`** — *effective* source per field after all overrides:
- `table` — value came from the (kind, work) defaults cell
- `user_playbook` — promoted by CLAUDE.md TDD Playbook absorption
- `objective_override` — set in OBJECTIVE.md `overrides:` block
- `trd_override` — set in TRD frontmatter

**`cell_provenance`** — *table-tier* origin per field, regardless of overrides:
- `project_table` — `.planning/defaults-table.md` supplied this cell
- `org_table` — `~/.claude/devflow/defaults-table.md` supplied this cell
- `bundled_table` — bundled `references/defaults-table.md` supplied this cell
- `table_explicit` — test-only path (explicit `--table-path`)

**Reading the two together:** if `provenance.tdd === 'trd_override'` and `cell_provenance.tdd === 'project_table'`, your TRD frontmatter overrode the value, but if it hadn't, your project's `defaults-table.md` would have supplied it (overriding org and bundled).

To override (kind, work) cells:
- **Org-wide:** `df-tools defaults-table init --scope=org` then edit `~/.claude/devflow/defaults-table.md`
- **Per-project:** `df-tools defaults-table init --scope=project` then edit `.planning/defaults-table.md`

The 3-tier loader (project > org > bundled) merges cell-by-cell — your override file does NOT need to copy all 42 cells. Omitted cells fall through to the next tier.
```

**Update test for D1:**

```javascript
test('D1: references/defaults-table.md documents both provenance vocabularies', () => {
  const refPath = path.join(__dirname, '..', '..', 'references', 'defaults-table.md');
  const content = fs.readFileSync(refPath, 'utf-8');
  assert.match(content, /## Provenance/);
  assert.match(content, /project_table/);
  assert.match(content, /org_table/);
  assert.match(content, /bundled_table/);
  assert.match(content, /cell_provenance/);
});
```

**Update test for D2:**

```javascript
test('D2: intent resolve --raw JSON output structure includes cell_provenance', () => {
  // Use existing test fixture; assert key presence
  const project = fixtures.buildProject({
    projectFrontmatter: { kind: 'api' },
    objectives: [{ id: '01-foo', work: 'feature' }],
  });

  const result = intent.resolve({ projectRoot: project.root, objectiveId: '01-foo', userHome: '/nonexistent' });

  assert.ok(result.cell_provenance, 'cell_provenance field expected');
  assert.strictEqual(typeof result.cell_provenance, 'object');
  // Has entries for all ALL_FIELDS
  for (const f of ['tdd', 'depth', 'model_profile', 'verification', 'security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy', 'outside_in']) {
    assert.ok(f in result.cell_provenance, `cell_provenance.${f} expected`);
  }

  project.cleanup();
});
```

# CRITICAL: defaults-table.md is a documentation file; the only test is the existence of the new section. Don't over-test the markdown.
# GOTCHA: D2 doesn't invoke the CLI subprocess — it asserts the in-process API result. Cheaper, equally informative.
# PATTERN: Documentation lives next to the source-of-truth file. defaults-table.md is the canonical reference; new vocabulary lives there.
  </action>
  <verify>
```bash
# D tests pass
node --test plugins/devflow/devflow/bin/lib/intent.test.cjs 2>&1 | grep -c "^ok"               # full suite + 2 D tests
node --test plugins/devflow/devflow/bin/lib/intent.test.cjs 2>&1 | grep -c "^not ok"           # 0

# Doc updated
grep -c "cell_provenance" plugins/devflow/devflow/references/defaults-table.md                 # >=2 (mention + heading or example)
grep -c "project_table\|org_table\|bundled_table" plugins/devflow/devflow/references/defaults-table.md   # >=3

# Full suite
npm test 2>&1 | tail -3                                                                          # 2053+ baseline + ~10 new (P + D)
```
  </verify>
  <done>D1-D2 pass. `references/defaults-table.md` has new Provenance section documenting both vocabularies and override workflow. ~4 atomic commits.</done>
  <recovery>If D1 fails because the section heading doesn't match the regex: adjust the regex or the heading. The test is intentionally loose — `## Provenance` (any case-sensitivity) is the contract.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<lint>(none)</lint>
<build>(none)</build>
</validation_gates>

<verification>
1. **`intent.resolve()` returns cell_provenance:** new field present in all return paths
2. **Vocabulary distinct:** `provenance` enum (existing) and `cell_provenance` enum (new) are non-overlapping; documented separately
3. **All ALL_FIELDS covered:** cell_provenance has 10 entries; missing keys default to `'unknown'`
4. **Override layers don't reduce cell_provenance:** P5, P6 confirm — `provenance.tdd === 'trd_override'` doesn't blank `cell_provenance.tdd`
5. **Test path preserved:** P7 confirms `tablePath !== DEFAULTS_TABLE_PATH` triggers `'table_explicit'` (existing intent tests stay green)
6. **Documentation updated:** `references/defaults-table.md` has Provenance section with both vocabularies + override workflow
7. **Backwards compatibility:** existing intent tests pass without modification (additive change)
8. **Atomic commits:** ~20 total across 2 tasks
</verification>

<success_criteria>
- [ ] `result.cell_provenance` populated with one entry per ALL_FIELDS
- [ ] Vocabulary: `project_table | org_table | bundled_table | table_explicit | unknown`
- [ ] Override layers don't blank cell_provenance — they're orthogonal
- [ ] Provenance section in `references/defaults-table.md` documents both vocabularies
- [ ] All existing `intent.test.cjs` tests still pass (additive change)
- [ ] All ~10 new tests passing; 2053 baseline still passing
</success_criteria>

<output>
After completion, create `.planning/objectives/21-bidirectional-gh-sync/21-05-intent-provenance-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`.
</output>
