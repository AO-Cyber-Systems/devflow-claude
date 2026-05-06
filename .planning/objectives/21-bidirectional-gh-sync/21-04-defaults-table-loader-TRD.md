---
objective: 21-bidirectional-gh-sync
trd: 04
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/defaults-loader.cjs
  - plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/defaults-table-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/intent.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - DEFAULTS-LOADER
  - DEFAULTS-LOADER-MERGE
  - DEFAULTS-INIT-CLI

must_haves:
  truths:
    - "loadMergedDefaultsTable walks project (.planning/defaults-table.md) → org (~/.claude/devflow/defaults-table.md) → bundled (plugins/devflow/devflow/references/defaults-table.md) and merges cell-by-cell"
    - "Higher-tier values override lower-tier values for matching (kind, work, field) cells; cells absent in higher tier fall through to lower tier"
    - "Per-cell provenance map produced during merge: { 'api.feature.tdd': 'project_table', ... }"
    - "lib/intent.cjs loadDefaultsTable() seam now calls defaults-loader; bundled-only fallback preserved when neither override exists"
    - "df-tools defaults-table init --scope=org|project scaffolds an editable copy from the bundled file"
    - "df-tools defaults-table init refuses to overwrite existing files unless --force is passed"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/defaults-loader.cjs"
      provides: "loadMergedDefaultsTable, mergeDefaultsTables, scaffoldDefaultsTable, cmdDefaultsTableInit"
      exports: ["loadMergedDefaultsTable", "mergeDefaultsTables", "scaffoldDefaultsTable", "cmdDefaultsTableInit", "_resetCache"]
    - path: "plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs"
      provides: "tests covering 3-tier merge, init CLI, --force, cache invalidation"
      contains: "describe('loadMergedDefaultsTable"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/defaults-table-fixtures.cjs"
      provides: "buildPartialDefaultsTable, buildTempProjectWithDefaults helpers"
  key_links:
    - from: "lib/intent.cjs loadDefaultsTable"
      to: "lib/defaults-loader.cjs loadMergedDefaultsTable"
      via: "require — replace single-file loader with 3-tier loader"
      pattern: "loadMergedDefaultsTable\\("
    - from: "df-tools.cjs case 'defaults-table'"
      to: "lib/defaults-loader.cjs cmdDefaultsTableInit"
      via: "new case block"
      pattern: "case 'defaults-table'"
    - from: "lib/defaults-loader.cjs scaffoldDefaultsTable"
      to: "plugins/devflow/devflow/references/defaults-table.md (bundled source)"
      via: "fs.copyFileSync — exact copy of bundled file to target"
      pattern: "fs\\.copyFileSync"
---

<objective>
Replace the hardcoded single-file defaults-table load with a 3-tier resolver that lets orgs and projects override (kind, work) cells without forking the plugin. Three loader files in priority order: project (`.planning/defaults-table.md`) > org (`~/.claude/devflow/defaults-table.md`) > bundled (`plugins/devflow/devflow/references/defaults-table.md`). Cell-level merge: a project file with one cell override doesn't blank the other 41 cells — they fall through to org or bundled.

Purpose: Currently `lib/intent.cjs` `loadDefaultsTable()` loads a single hardcoded path. Orgs that want different `(api, foundation)` posture or different `fixture_strategy` for `(plugin, feature)` cells must fork the entire plugin. v1.2 exposes the override path while keeping the bundled defaults as a guaranteed fallback.

Output: New `lib/defaults-loader.cjs` with `loadMergedDefaultsTable` (resolver) + `mergeDefaultsTables` (pure merge logic) + `cmdDefaultsTableInit` CLI. Refactor `intent.cjs` `loadDefaultsTable` to delegate. New `df-tools defaults-table init --scope=org|project [--force]` CLI subcommand.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                                              ← MODIFY (add `case 'defaults-table'` block)
├── lib/
│   ├── defaults-loader.cjs                                                   ← CREATE
│   ├── defaults-loader.test.cjs                                              ← CREATE
│   ├── intent.cjs                                                            ← MODIFY (loadDefaultsTable seam swap)
│   └── __fixtures__/
│       └── defaults-table-fixtures.cjs                                       ← CREATE
└── (references/defaults-table.md unchanged — it's the bundled fallback)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: existing defaults-table loader from `lib/intent.cjs`**

```javascript
// CURRENT — single-file load, cached by exact path:
const DEFAULTS_TABLE_PATH = path.join(__dirname, '../../references/defaults-table.md');

let _cachedTable = null;
function loadDefaultsTable(tablePath = DEFAULTS_TABLE_PATH) {
  if (_cachedTable && tablePath === DEFAULTS_TABLE_PATH) return _cachedTable;
  const content = fs.readFileSync(tablePath, 'utf-8');
  const match = content.match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`defaults-table.md missing yaml block (path: ${tablePath})`);
  const yaml = match[1];
  const table = parseDefaultsYaml(yaml);
  if (tablePath === DEFAULTS_TABLE_PATH) _cachedTable = table;
  return table;
}

// parseDefaultsYaml is the YAML parser tuned for the table's known structure
// (kind > work > {tdd, depth, model_profile, ...}). REUSE it; export it from intent.cjs.
```

**Pattern: 3-tier file resolution (analogous to CLAUDE.md absorption in `lib/claude-md.cjs`)**

```javascript
// claude-md.cjs walks ~/.claude/CLAUDE.md and ./CLAUDE.md and merges directives.
// SAME SHAPE: defaults-loader walks 3 paths and merges tables.
//
// Key insight: each file is INDEPENDENTLY parseable. The merge happens on the
// already-parsed JS objects, not on the markdown.
```

**Pattern: cmdDefaultsTableInit subcommand wiring (analogous to existing case blocks)**

```javascript
// In df-tools.cjs main switch:
case 'defaults-table': {
  const subcommand = args[1];
  if (subcommand === 'init') {
    const { cmdDefaultsTableInit } = require('./lib/defaults-loader.cjs');
    cmdDefaultsTableInit(cwd, args.slice(2), raw);
  } else {
    error('Unknown defaults-table subcommand. Available: init');
  }
  break;
}
```

</codebase_examples>

<anti_patterns>

- ❌ **Deep merge with array concat.** Cells are scalar fields; arrays don't exist at the cell level. Don't write deep-merge logic — flat field-level overlay is sufficient.
- ❌ **Mutating tier objects.** Each `parseDefaultsYaml` result is held by the caller; mutation leaks across tests. Always create a fresh merged object.
- ❌ **File-level merge.** "Project file wins entirely" is a foot-gun — copying all 42 cells to override one is bad UX. Cell-level merge is the design.
- ❌ **Caching keyed by exact paths.** `_cachedTable` keyed by `tablePath === DEFAULTS_TABLE_PATH` is brittle. New cache key includes (projectRoot, userHome) tuple.
- ❌ **Loading bundled file lazily.** Bundled file is always loaded (fallback for missing tier files). Cache it once at module load OR memoize on first call.

</anti_patterns>

<error_recovery>

**Failure: project defaults-table.md exists but malformed (no yaml block)**
- `loadMergedDefaultsTable` throws with: `Project defaults-table.md (.planning/defaults-table.md) is malformed: missing yaml block`
- Caller (intent.resolve) catches and falls back to org → bundled? **Decision:** strict fail. Malformed files should be fixed, not silently ignored.
- Test case: write a malformed project file; assert that `intent.resolve` throws with a clear error.

**Failure: org file doesn't exist (most common)**
- Silent skip. `~/.claude/devflow/defaults-table.md` not found → tier just isn't in the merge. No warning.

**Failure: bundled file missing (corrupt install)**
- Hard fail. The bundled file MUST exist; if it doesn't, the plugin is broken.
- Error: `Bundled defaults-table.md not found at <path>. Reinstall the devflow plugin.`

**Failure: `defaults-table init --scope=org` and target file already exists**
- Default: refuse, exit 1. Message: `~/.claude/devflow/defaults-table.md already exists. Use --force to overwrite (existing file will be backed up to .bak.<timestamp>).`
- With `--force`: `cp <existing> <existing>.bak.<ISO8601>` then write new content.

**Failure: `defaults-table init --scope=project` invoked outside a project (no .planning/)**
- Exit 1. Message: `No .planning/ directory found. Run \`df-tools init new-project\` first or run from a project root.`

**Failure: cache stale (test wrote a new file but loader returns cached)**
- `_resetCache()` exported for tests. Same pattern as `intent._resetCache()`.

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
@plugins/devflow/devflow/references/defaults-table.md
</context>

<research_context>

**3-tier merge algorithm (from 21-RESEARCH.md):**

```
Inputs:
  - bundledPath  (always present)
  - orgPath      (~/.claude/devflow/defaults-table.md, optional)
  - projectPath  (.planning/defaults-table.md, optional)

Algorithm:
  1. tiers = []
  2. Always: parse bundledPath → bundledTable; tiers.push({ table: bundledTable, name: 'bundled_table' })
  3. If exists(orgPath): parse → orgTable; tiers.push({ table: orgTable, name: 'org_table' })
  4. If exists(projectPath): parse → projectTable; tiers.push({ table: projectTable, name: 'project_table' })
  5. Merge in order (bundled first, then org overlay, then project overlay):
       merged = {}
       provenance = {}
       for each tier in tiers (in push order):
         for each kind in tier.table:
           merged[kind] = merged[kind] || {}
           for each work in tier.table[kind]:
             merged[kind][work] = merged[kind][work] || {}
             for each field in tier.table[kind][work]:
               merged[kind][work][field] = tier.table[kind][work][field]
               provenance[`${kind}.${work}.${field}`] = tier.name
  6. Return { table: merged, provenance }
```

**Cache key:**
- `${projectRoot || 'no-project'}|${userHome || 'no-home'}|${bundledPath}`
- Cleared on `_resetCache()` (test hook)

**Init CLI behavior:**
- `--scope=org` writes to `~/.claude/devflow/defaults-table.md`; creates dirs if missing
- `--scope=project` writes to `.planning/defaults-table.md`; requires `.planning/` to exist
- Bundled file's full content is copied via `fs.copyFileSync(bundledPath, target)`. Comment header preserved (the file already documents itself).

**Constraints block:**
- The bundled file's `constraints:` block is loaded by `lib/intent.cjs` `loadConstraints(tablePath)`. TRD 21-04 scope: only the `defaults:` block is merged. The `constraints:` list is NOT merged across tiers — it always comes from the bundled file.
- Rationale: constraints are resolver-level invariants (no LLM test data, no Gherkin), not per-cell defaults. Org overrides shouldn't be able to drop them.
- Test: a project tier with only `defaults:` block (no `constraints:`) → resolver still applies bundled constraints.

**Cache invalidation in `intent.cjs`:**

Existing `intent._resetCache()` clears `_cachedTable`. After this TRD:
- `intent._resetCache()` ALSO clears defaults-loader cache via `defaultsLoader._resetCache()`.
- Test pattern: existing tests call `intent._resetCache()` in `afterEach`; they continue to work without modification.

</research_context>

<gotchas>

- **`intent.cjs` already accepts an optional `tablePath` parameter.** TRD 21-04's seam swap: when `tablePath` is the default (`DEFAULTS_TABLE_PATH`), call `loadMergedDefaultsTable({ projectRoot, userHome })`. When tests pass an explicit `tablePath`, treat it as a single-file override (test-only path).
- **`parseDefaultsYaml` is currently a non-exported helper.** Export it from `intent.cjs` so `defaults-loader.cjs` can use the SAME parser (don't duplicate). Add to `module.exports` in a small commit.
- **Bundled file path resolution.** `__dirname` inside `defaults-loader.cjs` is `plugins/devflow/devflow/bin/lib/`. Bundled file is `plugins/devflow/devflow/references/defaults-table.md`. Relative path: `path.join(__dirname, '../../references/defaults-table.md')`.
- **Org file path uses `userHome`, not `os.homedir()` directly.** Tests inject userHome via fixture; production code falls back to `process.env.HOME` or `os.homedir()`.
- **`scaffoldDefaultsTable` always preserves the bundled file's full content** including comments, metadata, and `constraints:` block. Don't strip anything — the user wants an editable copy of the canonical table.
- **df-tools.cjs case-block insertion.** Place `case 'defaults-table':` alphabetically near `case 'changelog':` and before `case 'gh':`. Don't disrupt existing case ordering — it's not strictly alphabetical, but follow the existing surrounding pattern.

</gotchas>

<tasks>

<task type="auto" tdd="strict">
  <name>Task 1: Test list + fixtures + RED → GREEN — mergeDefaultsTables (M1-M6)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/defaults-table-fixtures.cjs, plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs, plugins/devflow/devflow/bin/lib/defaults-loader.cjs</files>
  <action>
**Test list (top-of-file comment in `defaults-loader.test.cjs`):**

```
// defaults-loader.test.cjs — Test list
//
// mergeDefaultsTables (pure logic, M group):
//   M1: bundled-only input → returns merged = bundled, provenance all = 'bundled_table'
//   M2: bundled + org with org overriding (api, feature, tdd) → merged.api.feature.tdd from org; provenance 'org_table' for that cell only
//   M3: bundled + project with project overriding (cli, port, depth) → merged.cli.port.depth from project; provenance 'project_table' for that cell only
//   M4: bundled + org + project where project overrides org's override → project wins; provenance 'project_table'
//   M5: project tier omits a cell (api.bugfix.tdd) → falls through to bundled; provenance 'bundled_table'
//   M6: project tier introduces NEW (kind, work) cell not in bundled → merged includes it; provenance 'project_table'
//
// loadMergedDefaultsTable (resolver, L group):
//   L1: only bundled present → result.provenance entirely 'bundled_table'
//   L2: bundled + org-fixture present → org overrides flow through
//   L3: bundled + org + project all present → project wins on shared cells
//   L4: malformed project file → throws with clear error
//   L5: missing org file → silent skip, no error
//   L6: cache hit returns same object reference (identity) on second call
//   L7: _resetCache clears cache; next call re-reads files
//
// scaffoldDefaultsTable + cmdDefaultsTableInit (CLI, C group):
//   C1: init --scope=org → writes ~/.claude/devflow/defaults-table.md = bundled file content
//   C2: init --scope=project → writes .planning/defaults-table.md = bundled file content
//   C3: init --scope=org when target exists → exit 1, refuse
//   C4: init --scope=org --force when target exists → backup to .bak.<ISO> + overwrite
//   C5: init --scope=project when no .planning/ → exit 1
//   C6: init --scope=foo → exit 1, invalid scope
//   C7: init --help → prints usage
```

**Fixtures (`defaults-table-fixtures.cjs`):**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Build a partial defaults-table markdown file with only specified (kind, work, field) cells.
// Useful for testing tier overrides without writing all 42 cells.
function buildPartialDefaultsTable({ cells = {}, includeConstraints = false } = {}) {
  // cells shape: { 'api.feature': { tdd: '...', depth: '...' }, 'cli.port': { ... } }
  const lines = ['---', 'fixture: true', '---', '', '# Partial defaults table (test fixture)', '', '```yaml', 'defaults:'];

  // Group cells by kind
  const byKind = {};
  for (const [pathKey, fields] of Object.entries(cells)) {
    const [kind, work] = pathKey.split('.');
    byKind[kind] = byKind[kind] || {};
    byKind[kind][work] = fields;
  }

  for (const [kind, works] of Object.entries(byKind)) {
    lines.push(`  ${kind}:`);
    for (const [work, fields] of Object.entries(works)) {
      lines.push(`    ${work}:`);
      for (const [field, value] of Object.entries(fields)) {
        const v = (typeof value === 'string') ? `"${value}"` : value;
        lines.push(`      ${field}: ${v}`);
      }
    }
  }

  if (includeConstraints) {
    lines.push('');
    lines.push('constraints:');
    lines.push('  - id: no_llm_test_data');
    lines.push('    description: "..."');
    lines.push('    opt_out_field: "frontmatter.allow_generated_test_data"');
  }

  lines.push('```', '');
  return lines.join('\n');
}

// Build a temp project + userHome with optional defaults-table files at each tier.
function buildTempProjectWithDefaults({ projectTable = null, orgTable = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-defaults-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (projectTable !== null) {
    fs.writeFileSync(path.join(root, '.planning', 'defaults-table.md'), projectTable, 'utf-8');
  }

  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-userhome-'));
  if (orgTable !== null) {
    fs.mkdirSync(path.join(userHome, '.claude', 'devflow'), { recursive: true });
    fs.writeFileSync(path.join(userHome, '.claude', 'devflow', 'defaults-table.md'), orgTable, 'utf-8');
  }

  return {
    root,
    userHome,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(userHome, { recursive: true, force: true });
    },
  };
}

module.exports = { buildPartialDefaultsTable, buildTempProjectWithDefaults };
```

**Implementation (`defaults-loader.cjs`)** — RED → GREEN cycle:

```javascript
'use strict';
const fs = require('fs');
const path = require('path');

// Reuse parseDefaultsYaml from intent.cjs (TRD 21-04 exports it; see Task 2)
const { parseDefaultsYaml } = require('./intent.cjs');

const BUNDLED_PATH = path.join(__dirname, '../../references/defaults-table.md');

function loadTable(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`defaults-table.md (${filePath}) is malformed: missing yaml block`);
  return parseDefaultsYaml(match[1]);
}

/**
 * mergeDefaultsTables(tiers) — pure logic merge.
 * tiers: [{ table, name }] in priority order LOW → HIGH (bundled, org, project)
 * Returns { table, provenance }
 *   table: { kind: { work: { field: value } } }
 *   provenance: { 'kind.work.field': tier_name }
 */
function mergeDefaultsTables(tiers) {
  const merged = {};
  const provenance = {};

  for (const tier of tiers) {
    if (!tier || !tier.table) continue;
    for (const [kind, works] of Object.entries(tier.table)) {
      merged[kind] = merged[kind] || {};
      for (const [work, fields] of Object.entries(works)) {
        merged[kind][work] = merged[kind][work] || {};
        for (const [field, value] of Object.entries(fields)) {
          merged[kind][work][field] = value;
          provenance[`${kind}.${work}.${field}`] = tier.name;
        }
      }
    }
  }

  return { table: merged, provenance };
}

let _cache = new Map();
function _resetCache() { _cache = new Map(); }

/**
 * loadMergedDefaultsTable({ projectRoot, userHome }) → { table, provenance }
 * Walks 3 tiers and merges. Cached by (projectRoot, userHome).
 */
function loadMergedDefaultsTable({ projectRoot = null, userHome = null } = {}) {
  const cacheKey = `${projectRoot || ''}|${userHome || ''}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const tiers = [];

  // Bundled — always present
  if (!fs.existsSync(BUNDLED_PATH)) {
    throw new Error(`Bundled defaults-table.md not found at ${BUNDLED_PATH}. Reinstall the devflow plugin.`);
  }
  tiers.push({ table: loadTable(BUNDLED_PATH), name: 'bundled_table' });

  // Org — optional
  if (userHome) {
    const orgPath = path.join(userHome, '.claude', 'devflow', 'defaults-table.md');
    if (fs.existsSync(orgPath)) {
      tiers.push({ table: loadTable(orgPath), name: 'org_table' });
    }
  }

  // Project — optional, highest priority
  if (projectRoot) {
    const projectPath = path.join(projectRoot, '.planning', 'defaults-table.md');
    if (fs.existsSync(projectPath)) {
      tiers.push({ table: loadTable(projectPath), name: 'project_table' });
    }
  }

  const result = mergeDefaultsTables(tiers);
  _cache.set(cacheKey, result);
  return result;
}

module.exports = { loadMergedDefaultsTable, mergeDefaultsTables, _resetCache, BUNDLED_PATH };
```

**Test pattern for M2 (org override):**

```javascript
test('M2: bundled + org with org overriding api.feature.tdd → org wins on that cell only', () => {
  const bundled = { api: { feature: { tdd: 'strict bundled', depth: 'comprehensive' }, port: { tdd: 'port bundled' } } };
  const org = { api: { feature: { tdd: 'org override' } } };

  const result = loader.mergeDefaultsTables([
    { table: bundled, name: 'bundled_table' },
    { table: org, name: 'org_table' },
  ]);

  assert.strictEqual(result.table.api.feature.tdd, 'org override');
  assert.strictEqual(result.table.api.feature.depth, 'comprehensive');  // bundled fallthrough
  assert.strictEqual(result.table.api.port.tdd, 'port bundled');         // bundled fallthrough
  assert.strictEqual(result.provenance['api.feature.tdd'], 'org_table');
  assert.strictEqual(result.provenance['api.feature.depth'], 'bundled_table');
});
```

# CRITICAL: Task 1 depends on `parseDefaultsYaml` being exported from `intent.cjs`. The first sub-task IS exporting it — small commit before implementing defaults-loader.cjs.
# GOTCHA: M5 (project omits a cell, falls through to bundled) is the most important test. It's the central UX promise: "you don't have to copy all 42 cells."
# PATTERN: Same `_resetCache` test hook pattern as `intent.cjs` for cache invalidation.
  </action>
  <verify>
```bash
# parseDefaultsYaml is exported from intent.cjs
node -e "console.log(typeof require('./plugins/devflow/devflow/bin/lib/intent.cjs').parseDefaultsYaml)"   # 'function'

# All M tests pass
node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs 2>&1 | grep -c "^ok"               # >=6 (M1-M6)
node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs 2>&1 | grep -c "^not ok"           # 0
```
  </verify>
  <done>M1-M6 pass. `defaults-loader.cjs` exports `mergeDefaultsTables`, `loadMergedDefaultsTable`, `_resetCache`, `BUNDLED_PATH`. `intent.cjs` exports `parseDefaultsYaml`. Fixtures committed. ~14 atomic commits (export + 6 RED/GREEN pairs).</done>
  <recovery>If `parseDefaultsYaml` export breaks intent.test.cjs: it shouldn't — exporting an additional function is additive. If it does, the test is asserting `module.exports` shape strictly; relax to spot-check exported keys.</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 2: RED → GREEN — loadMergedDefaultsTable resolver + cache + intent.cjs seam swap (L1-L7)</name>
  <files>plugins/devflow/devflow/bin/lib/defaults-loader.cjs, plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs, plugins/devflow/devflow/bin/lib/intent.cjs</files>
  <action>
RED → GREEN for L1-L7.

**L1-L7 tests** exercise the file-walking resolver with `buildTempProjectWithDefaults` fixture. Pattern:

```javascript
test('L3: bundled + org + project all present → project wins on shared cells', () => {
  const project = fx.buildTempProjectWithDefaults({
    orgTable: fx.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'org' } } }),
    projectTable: fx.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'project' } } }),
  });
  try {
    loader._resetCache();
    const r = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
    assert.strictEqual(r.table.api.feature.tdd, 'project');
    assert.strictEqual(r.provenance['api.feature.tdd'], 'project_table');
  } finally {
    project.cleanup();
  }
});
```

**Refactor `intent.cjs` `loadDefaultsTable`** to delegate when no explicit tablePath:

```javascript
// In intent.cjs — refactor loadDefaultsTable

const defaultsLoader = require('./defaults-loader.cjs');

function loadDefaultsTable(tablePath = null) {
  // Test/single-file path — when tablePath is explicit, load that file alone (no merge)
  if (tablePath !== null && tablePath !== DEFAULTS_TABLE_PATH) {
    if (_cachedTable_singleFile && _cachedTable_singleFile.path === tablePath) {
      return _cachedTable_singleFile.table;
    }
    const content = fs.readFileSync(tablePath, 'utf-8');
    const match = content.match(/```yaml\n([\s\S]*?)\n```/);
    if (!match) throw new Error(`defaults-table.md missing yaml block (path: ${tablePath})`);
    const table = parseDefaultsYaml(match[1]);
    _cachedTable_singleFile = { path: tablePath, table };
    return table;
  }

  // Production path — 3-tier resolution
  // (We need projectRoot + userHome — pass as second positional or extract from caller via globals)
  // PRAGMATIC: keep the function signature; resolve callers from intent.resolve which has projectRoot in scope.
  // For backwards compatibility, return just the table (not the provenance) here.
  const merged = defaultsLoader.loadMergedDefaultsTable({
    projectRoot: _currentResolveCtx.projectRoot,
    userHome: _currentResolveCtx.userHome,
  });
  return merged.table;
}

let _currentResolveCtx = { projectRoot: null, userHome: null };
let _cachedTable_singleFile = null;

// In intent.resolve(), set _currentResolveCtx before calling loadDefaultsTable:
function resolve({ projectRoot, objectiveId, trdPath, userHome, tablePath } = {}) {
  _currentResolveCtx = { projectRoot, userHome };
  // ... rest of resolve unchanged ...
  const table = loadDefaultsTable(tablePath);
  // ...
}

function _resetCache() {
  _cachedTable = null;
  _cachedTable_singleFile = null;
  defaultsLoader._resetCache();  // Cascade-clear the loader's cache
}
```

# CRITICAL: `_currentResolveCtx` is module-level state — only one resolve call at a time (sync code). Acceptable for a CLI tool. Document it.
# GOTCHA: existing `intent.test.cjs` may fail if it relies on `loadDefaultsTable` ignoring tablePath. Refactor preserves: when tablePath != DEFAULTS_TABLE_PATH (test path), single-file load (existing behavior). When tablePath == default OR null, 3-tier load (new behavior).
# GOTCHA: `intent._resetCache()` must cascade to defaultsLoader._resetCache(). Existing intent tests rely on this clearing all state between runs.
# PATTERN: Module-level state with explicit init (set in resolve()) is acceptable in tools. The alternative — passing context through every helper — is more invasive.
  </action>
  <verify>
```bash
# Loader L1-L7 pass
node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs 2>&1 | grep -c "^ok"               # >=13 (M+L)
node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs 2>&1 | grep -c "^not ok"           # 0

# Intent tests still green (refactor is shape-preserving for test path)
node --test plugins/devflow/devflow/bin/lib/intent.test.cjs 2>&1 | grep -c "^not ok"                    # 0

# Full suite
npm test 2>&1 | tail -3                                                                                  # 2053+ tests
```
  </verify>
  <done>L1-L7 pass. `intent.cjs` `loadDefaultsTable` refactored to delegate to `defaults-loader.cjs` for production path. Test path (explicit tablePath) preserved for back-compat. `_resetCache` cascades. ~14 atomic commits.</done>
  <recovery>If intent.test.cjs starts failing: the most likely cause is `_currentResolveCtx` not being set in some test path that calls `loadDefaultsTable` directly. Fix: ensure all callers go through `resolve()` OR initialize the ctx defensively at top of `loadDefaultsTable`. If L4 (malformed file) test fails: verify the `match()` returning `null` triggers the throw with the file path in the message.</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 3: RED → GREEN — scaffoldDefaultsTable + cmdDefaultsTableInit + df-tools wiring (C1-C7)</name>
  <files>plugins/devflow/devflow/bin/lib/defaults-loader.cjs, plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
RED → GREEN for C1-C7.

**Add to `defaults-loader.cjs`:**

```javascript
const { output } = require('./helpers.cjs');

/**
 * scaffoldDefaultsTable({ scope, force, cwd, userHome }) → { ok, target_path, action, error? }
 * Copies the bundled defaults-table.md to org or project location.
 * scope: 'org' | 'project'
 */
function scaffoldDefaultsTable({ scope, force = false, cwd = process.cwd(), userHome = null }) {
  if (!['org', 'project'].includes(scope)) {
    return { ok: false, error: `Invalid scope: ${scope}. Use --scope=org or --scope=project.` };
  }

  let target;
  if (scope === 'org') {
    const home = userHome || process.env.HOME || require('os').homedir();
    target = path.join(home, '.claude', 'devflow', 'defaults-table.md');
  } else {
    const planningDir = path.join(cwd, '.planning');
    if (!fs.existsSync(planningDir)) {
      return { ok: false, error: `No .planning/ directory found in ${cwd}. Run \`df-tools init new-project\` first or run from a project root.` };
    }
    target = path.join(planningDir, 'defaults-table.md');
  }

  if (fs.existsSync(target) && !force) {
    return {
      ok: false,
      error: `${target} already exists. Use --force to overwrite (existing file will be backed up to .bak.<timestamp>).`,
    };
  }

  // Backup existing if --force
  let backupPath = null;
  if (fs.existsSync(target) && force) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = `${target}.bak.${ts}`;
    fs.copyFileSync(target, backupPath);
  }

  // Ensure parent dir exists
  fs.mkdirSync(path.dirname(target), { recursive: true });

  // Copy bundled to target
  fs.copyFileSync(BUNDLED_PATH, target);

  return { ok: true, target_path: target, action: backupPath ? 'overwritten' : 'created', backup: backupPath };
}

/**
 * cmdDefaultsTableInit(cwd, args, raw) — CLI entry point.
 * Usage: df-tools defaults-table init --scope=org|project [--force]
 */
function cmdDefaultsTableInit(cwd, args, raw) {
  const scopeFlag = args.find(a => a.startsWith('--scope='));
  const scope = scopeFlag ? scopeFlag.split('=')[1] : null;
  const force = args.includes('--force');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    process.stdout.write(`Usage: df-tools defaults-table init --scope=org|project [--force]\n  Scaffold an editable copy of the (kind, work) defaults table.\n\n  --scope=org      Write to ~/.claude/devflow/defaults-table.md (org-level overrides)\n  --scope=project  Write to .planning/defaults-table.md (project-level overrides)\n  --force          Overwrite existing file (backed up to .bak.<timestamp>)\n`);
    return;
  }

  if (!scope) {
    output({ ok: false, error: 'Missing required flag: --scope=org or --scope=project' }, raw, '');
    process.exit(1);
    return;
  }

  const result = scaffoldDefaultsTable({ scope, force, cwd });
  if (!result.ok) {
    output(result, raw, '');
    process.exit(1);
    return;
  }

  output(result, raw, `Wrote ${result.target_path} (action: ${result.action})${result.backup ? ` — backup at ${result.backup}` : ''}`);
}

module.exports = { loadMergedDefaultsTable, mergeDefaultsTables, scaffoldDefaultsTable, cmdDefaultsTableInit, _resetCache, BUNDLED_PATH };
```

**Wire into `df-tools.cjs`** — add a new `case 'defaults-table':` block. Find a good location (near `case 'gh':` or `case 'changelog':`) and insert:

```javascript
case 'defaults-table': {
  const subcommand = args[1];
  if (subcommand === 'init') {
    const { cmdDefaultsTableInit } = require('./lib/defaults-loader.cjs');
    cmdDefaultsTableInit(cwd, args.slice(2), raw);
  } else {
    error('Unknown defaults-table subcommand. Available: init');
  }
  break;
}
```

**Test pattern for C4 (--force):**

```javascript
test('C4: init --scope=org --force when target exists → backup + overwrite', () => {
  const fxh = fx.buildTempProjectWithDefaults({
    orgTable: fx.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'pre-existing' } } }),
  });
  try {
    const r = loader.scaffoldDefaultsTable({ scope: 'org', force: true, cwd: fxh.root, userHome: fxh.userHome });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.action, 'overwritten');
    assert.ok(r.backup);
    assert.ok(fs.existsSync(r.backup));
    // Backup contains pre-existing content
    assert.match(fs.readFileSync(r.backup, 'utf-8'), /pre-existing/);
    // Target now contains bundled content (which has 42 cells, not 1)
    const targetContent = fs.readFileSync(r.target_path, 'utf-8');
    assert.match(targetContent, /constraints:/);  // bundled file has constraints block
  } finally {
    fxh.cleanup();
  }
});
```

# CRITICAL: cmdDefaultsTableInit exits non-zero on missing --scope or invalid scope. CI scripts may invoke it.
# GOTCHA: The test for C5 (no .planning/) requires `cwd` to point somewhere WITHOUT .planning/. Use `os.tmpdir()` directly (a fresh tmp dir is empty).
# GOTCHA: Backup filename uses ISO8601 with `:` and `.` replaced by `-` (filesystem-safe). Test that the backup file actually exists at the returned path.
# PATTERN: Match the existing CLI subcommand structure of `df-tools <noun> <verb> --flag=value`. Don't introduce different flag styles.
  </action>
  <verify>
```bash
# All C tests pass
node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs 2>&1 | grep -c "^ok"               # >=20 (M+L+C = 6+7+7)
node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs 2>&1 | grep -c "^not ok"           # 0

# CLI invocation works
node plugins/devflow/devflow/bin/df-tools.cjs defaults-table init 2>&1 | grep -E "Missing required"     # missing --scope
node plugins/devflow/devflow/bin/df-tools.cjs defaults-table init --help 2>&1 | grep -E "Usage"          # help works

# Full suite
npm test 2>&1 | tail -3                                                                                  # 2053+ tests + 20 new
```
  </verify>
  <done>C1-C7 pass. `defaults-loader.cjs` exports `scaffoldDefaultsTable`, `cmdDefaultsTableInit`. `df-tools.cjs` has `case 'defaults-table':` block. CLI usable: `df-tools defaults-table init --scope=org`. ~14 atomic commits (test:/feat: pairs).</done>
  <recovery>If df-tools.cjs case-block conflict with parallel TRD 21-01 (which adds `gh pull` branch): both edits target DIFFERENT case blocks (`case 'gh':` vs new `case 'defaults-table':`). No textual overlap if executor uses Edit tool with disjoint anchors. If executors use Write (overwrite), serialize via wave sub-sequencing. If C5 (no .planning/) test fails: verify `fs.existsSync(planningDir)` returns false for the temp dir; create the temp dir fresh in the test, don't reuse a shared tmp.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<lint>(none)</lint>
<build>(none)</build>
</validation_gates>

<verification>
1. **Files exist:** `lib/defaults-loader.cjs`, `lib/defaults-loader.test.cjs`, `lib/__fixtures__/defaults-table-fixtures.cjs`
2. **Pure merge logic:** mergeDefaultsTables tested in isolation (M1-M6); cell-level overlay; provenance tracked
3. **3-tier resolver:** L1-L7 cover all combinations of present/absent tier files; cache works; cache invalidation works
4. **Init CLI:** C1-C7 cover scope=org, scope=project, --force, missing --scope, missing .planning/, --help
5. **`intent.cjs` integration:** existing `intent.test.cjs` still green; `parseDefaultsYaml` now exported; `loadDefaultsTable` refactored to delegate
6. **CLI wired:** `df-tools defaults-table init --help` works; usage message printable
7. **Bundled fallback:** `loadMergedDefaultsTable({})` (no projectRoot, no userHome) returns the bundled table with all-bundled provenance
8. **Atomic commits:** ~42 total across 3 tasks (test:/feat: pairs + export-helper commits + wiring)
</verification>

<success_criteria>
- [ ] 3-tier merge: project (.planning/defaults-table.md) > org (~/.claude/devflow/defaults-table.md) > bundled
- [ ] Cell-level merge: project file with 1 cell override doesn't blank other 41 cells
- [ ] Per-cell provenance map: `{ 'kind.work.field': 'project_table' | 'org_table' | 'bundled_table' }`
- [ ] `df-tools defaults-table init --scope=org|project` scaffolds editable copy from bundled
- [ ] `--force` flag backs up existing then overwrites
- [ ] `intent.cjs` `loadDefaultsTable` delegates to defaults-loader for production path; test-path back-compat preserved
- [ ] All ~20 tests passing; existing intent tests still green; 2053 baseline still passing
</success_criteria>

<output>
After completion, create `.planning/objectives/21-bidirectional-gh-sync/21-04-defaults-table-loader-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`.
</output>
