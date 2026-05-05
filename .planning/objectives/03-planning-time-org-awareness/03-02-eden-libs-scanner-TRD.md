---
objective: 03-planning-time-org-awareness
trd: 03-02
title: eden-libs reuse scanner (lexical match heuristic)
type: tdd
confidence: high
wave: 2
depends_on: [03-01]
files_modified:
  - plugins/devflow/devflow/bin/lib/org-awareness.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
autonomous: true
requirements: [SC-3, SC-4]
verification_commands:
  - "npm test -- --grep 'scanLibs|eden-libs'"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/org-awareness.cjs\"); if(typeof a.scanLibs!==\"function\") throw new Error(\"scanLibs not exported\"); console.log(\"OK\");'"
  - "node -e 'const f=require(\"./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs\"); if(typeof f.buildEdenLibsTree!==\"function\") throw new Error(\"buildEdenLibsTree fixture not exported\"); console.log(\"OK\");'"
  - "node ./plugins/devflow/devflow/bin/df-tools.cjs org-awareness scan-libs 03 --raw 2>&1 | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); assert \"candidates\" in d; assert \"scanned\" in d; print(\"OK\")'"
  - "git log --oneline -- plugins/devflow/devflow/bin/lib/org-awareness.cjs | grep -E '^[a-f0-9]+ test\\(03-02' | head -1"

must_haves:
  truths:
    - "scanLibs(opts) reads eden-libs path (from opts.path or `awareness.eden_libs_path` config or DEFAULT_EDEN_LIBS_PATH), parses package.json + index.* + named export statements, tokenizes exported symbols, scores against current objective tokens, and returns top TOP_N (3) candidates"
    - "scanLibs returns `{ candidates: [...], warnings: [...], scanned: bool, path: string|null }` shape"
    - "When eden-libs path doesn't exist: returns `{ candidates: [], warnings: ['eden-libs not found at <path>'], scanned: false, path: <resolved>}` — does not throw"
    - "When eden-libs has no exported surface (empty repo per spike findings): returns `{ candidates: [], warnings: ['eden-libs has no exported surface'], scanned: true }`"
    - "Lexical match heuristic only — NO LLM scoring, NO embeddings, NO semantic similarity (per CONTEXT.md locked decision #2)"
    - "camelCase-aware tokenization on export symbol names: `parseStateMd` decomposes into `parse`, `state`, `md` for matching"
    - "Configurable via `awareness.eden_libs_path` in `.planning/config.json`; falls back to DEFAULT_EDEN_LIBS_PATH (`~/Source/eden-libs`)"
    - "scanLibs uses `_runFs` injection (from 03-01) for ALL filesystem reads — fully unit-testable with buildMockRunFs"
    - "Fixture: buildEdenLibsTree creates tmp dir with package.json (main + exports map) + index.cjs (named exports) for test consumption"
    - "df-tools org-awareness scan-libs <objective_id> CLI emits structured JSON to stdout"
    - "All new tests follow RED → GREEN: test commit precedes feat commit per TDD Playbook habit 3"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      provides: "scanLibs + helpers (`_parseExports`, `_camelSplit`, `_resolveEdenLibsPath`). Extends partial module.exports."
      exports: ["scanLibs"]
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs"
      provides: "Test groups L (scanLibs end-to-end), CS (camelSplit), PE (parseExports). Appended to existing file."
      contains: "scanLibs"
    - path: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs"
      provides: "cmdOrgAwarenessScanLibs implementation replacing the 03-01 placeholder stub."
      contains: "oa.scanLibs"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "buildEdenLibsTree factory: writes package.json + index.cjs to a tmpdir with configurable exports."
      exports: ["buildEdenLibsTree"]
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      to: "plugins/devflow/devflow/bin/lib/org-awareness.cjs::_runFs"
      via: "All eden-libs fs reads route through _runFs"
      pattern: "_runFs\\.readFileSync|_runFs\\.existsSync"
    - from: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs"
      to: "plugins/devflow/devflow/bin/lib/org-awareness.cjs::scanLibs"
      via: "Subcommand dispatch"
      pattern: "oa\\.scanLibs"
---

<objective>
Add the eden-libs reuse scanner to `lib/org-awareness.cjs`. This is the second of three signal sources for the `## Cross-Repo Considerations` section: surfaces top-3 eden-libs candidates whose exported symbols match the current objective's domain.

Purpose: Prevents reinvention. When the planner is about to write a new utility, the eden-libs scan flags whether eden-libs already exports something matching. Lexical match on objective title tokens + `files_modified` extensions vs eden-libs's `package.json` / `index.*` exported symbols. Hand-built; no LLM scoring per CONTEXT.md locked decision #2.

Output:
1. `scanLibs(opts)` function in `lib/org-awareness.cjs` (region: scanLibs)
2. Test cases per Test list (Groups L + CS + PE)
3. CLI wiring: `cmdOrgAwarenessScanLibs` replaces the 03-01 stub
4. Fixture builder: `buildEdenLibsTree` in `awareness-fixtures.cjs`
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── org-awareness.cjs                  ← MODIFY  (add scanLibs region)
├── org-awareness.test.cjs             ← MODIFY  (add Groups L + CS + PE)
├── org-awareness-cli.cjs              ← MODIFY  (replace scan-libs stub)
└── __fixtures__/
    └── awareness-fixtures.cjs         ← MODIFY  (add buildEdenLibsTree)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing region-comment style** — `lib/awareness.cjs` uses banner-comment regions, e.g.:

```js
// ─── TRD 02-04: cache layer ───────────────────────────────────────────────────
```

Mirror this:

```js
// ─── TRD 03-02: scanLibs (eden-libs reuse scanner) ────────────────────────────
```

**Tokenize helper from 03-01** — `lib/org-awareness.cjs::_tokenize` already exists and IS REUSED for objective tokens. For symbol-name decomposition, this TRD adds `_camelSplit` which splits CamelCase / camelCase identifiers:

```js
function _camelSplit(name) {
  if (!name || typeof name !== 'string') return [];
  // 'parseStateMd' → ['parse', 'State', 'Md'] → tokens after lowercase + length filter
  return name.replace(/([A-Z]+)/g, ' $1').trim().split(/\s+/);
}
```

Then `_tokenize(name)` (existing) further normalizes (lowercase, length ≥ 3, stop-word filter, dedupe).

**eden-libs file shapes to scan** — based on standard CommonJS / package.json conventions:

```json
// package.json
{
  "name": "eden-libs",
  "main": "index.cjs",
  "exports": {
    ".": "./index.cjs",
    "./gh": "./lib/gh.cjs"
  }
}
```

```js
// index.cjs (CommonJS named exports)
module.exports = {
  parseStateMd: require('./lib/state-md.cjs').parseStateMd,
  resolveChain: require('./lib/gh.cjs').resolveChain,
};
```

**Export-name extraction patterns** — match these regexes against `index.*` source:
- `module.exports\.(\w+)` — `module.exports.parseStateMd = ...`
- `exports\.(\w+)` — `exports.resolveChain = ...`
- `module\.exports\s*=\s*\{([^}]*)\}` — extract names from object literal (commas-separated `key:` or shorthand `key`)
- ES Modules: `export\s+(?:function|const|class|let|var)\s+(\w+)` — `export function foo()...`
- ES Modules: `export\s+\{([^}]*)\}` — `export { foo, bar };`

Hand-rolled regex parsers are sufficient — eden-libs's surface is small (the spike found `eden-libs` empty with 0 issues), so we don't need a full AST parser. If parsing fails for some input, we degrade to using `package.json` `main` filename tokens only.

</codebase_examples>

<anti_patterns>

- **DO NOT add a full JS AST parser dependency (acorn / babel / esprima)** for v1.1. Hand-rolled regex is sufficient. eden-libs is empty per spike findings; we just need the structural seam.
- **DO NOT call `require()` to load eden-libs at scan time.** That would execute the module, which could have side effects. Read source as text and parse exported names lexically.
- **DO NOT add a `--refresh` flag.** The scan is cheap and runs at plan time only.
- **DO NOT throw on a missing `package.json` field.** `main` may be absent; in that case fall back to scanning `index.cjs` / `index.js` / `index.mjs` if present at the repo root.
- **DO NOT couple to obj 2's `lib/awareness.cjs`** — eden-libs scanning has no overlap with org/peer scanning.

</anti_patterns>

<error_recovery>

- **eden-libs path doesn't exist** → `{ candidates: [], warnings: ['eden-libs not found at <resolved>'], scanned: false, path: <resolved> }`. Not an error.
- **package.json missing** → continue with index.* scanning if present; if also missing, return empty candidates with warning `'no package.json or index.* found at <path>'`.
- **package.json malformed JSON** → log warning, fall back to index.* scan.
- **index.* file unreadable** → log warning, return empty candidates.
- **Zero exports found** (parsing succeeds but no patterns match) → return `{ candidates: [], warnings: ['eden-libs has no exported surface'], scanned: true }`.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/03-planning-time-org-awareness/03-CONTEXT.md
@.planning/objectives/03-planning-time-org-awareness/03-RESEARCH.md
@.planning/objectives/03-planning-time-org-awareness/03-01-sibling-scanner-and-fixtures-TRD.md

# Existing module to extend:
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
</context>

<research_context>

From parent research (`.planning/research/github-coordination-layer.md` §"Where org-awareness shows up"):

> Scan eden-libs / shared SDK locations for reusable capabilities

eden-libs spike findings (2026-04-29): `eden-libs` repo currently has 0 issues and 0 PRs — it's a stub. The scanner must handle "empty eden-libs" gracefully (locked decision #8: skip silently when no exports).

</research_context>

<gotchas>

- **`package.json` `exports` map** can be a string OR an object with conditional exports. Handle both: if string, treat as the only entrypoint; if object, recursively pull values matching `*.cjs|*.js|*.mjs|*.ts`.
- **`module.exports = { foo, bar };` shorthand** — match the inside of the braces with a tolerant regex; split on `,`; strip `key:value` to just `key`. Example: `'foo, bar: x, baz'` → `['foo', 'bar', 'baz']`.
- **`export default function foo()`** in ESM — `default` is the export name. Skip when extracting candidate names (a default export doesn't give us a useful symbol name to match).
- **Reading symlinks in `~/Source/eden-libs`** — if `eden-libs` is a worktree or symlink, `existsSync` follows the link. That's correct behavior; nothing to handle.
- **Path resolution** — `_resolveEdenLibsPath()` should handle:
  1. `opts.path` (explicit override; takes precedence)
  2. `awareness.eden_libs_path` from `.planning/config.json`
  3. `DEFAULT_EDEN_LIBS_PATH` (~/Source/eden-libs)
  All paths home-expanded via `_expandHome` (already in 03-01 module).

</gotchas>

## Test list

Per CLAUDE.md TDD Playbook habit 2.

### Group CS (camelSplit helper — pure logic)
- CS1: empty string → []
- CS2: simple lowercase ('foo') → ['foo']
- CS3: camelCase ('parseStateMd') → ['parse', 'State', 'Md']
- CS4: PascalCase ('ParseStateMd') → ['Parse', 'State', 'Md']
- CS5: SNAKE_CASE handled by upstream tokenize (CS just does word splitting)
- CS6: ALLCAPS ('GH') → ['GH'] (treated as single chunk; tokenize then drops len < 3)

### Group PE (parseExports helper — regex-based)
- PE1: `module.exports.foo = ...` extracts `foo`
- PE2: `exports.bar = ...` extracts `bar`
- PE3: `module.exports = { a, b: x, c };` extracts `['a', 'b', 'c']`
- PE4: `export function foo()` extracts `foo`
- PE5: `export const bar = ...` extracts `bar`
- PE6: `export { foo, bar }` extracts `['foo', 'bar']`
- PE7: `export default function foo()` extracts nothing for `foo` (default exports skipped)
- PE8: empty string → []
- PE9: malformed input (unclosed brace) → returns whatever parsed so far, no throw
- PE10: ignores commented-out exports (`// module.exports.skip = ...`) — accept this is best-effort; the regex doesn't strip comments and that's acceptable

### Group RP (resolveEdenLibsPath helper)
- RP1: explicit `opts.path` wins over config
- RP2: config `awareness.eden_libs_path` wins over default
- RP3: default DEFAULT_EDEN_LIBS_PATH used when neither set
- RP4: `~/Source/eden-libs` home-expanded correctly

### Group L (scanLibs end-to-end)
- L1: happy path — eden-libs tree with 3 exports, current objective tokens overlap with 2 → returns top-2 (or top-3 with score=0 sentinel? — locked: top-3 candidates total, sorted by score desc; 0-score candidates may appear if total < 3)
- L2: eden-libs path doesn't exist → `{ candidates: [], warnings: ['eden-libs not found at ...'], scanned: false }`
- L3: eden-libs exists but no package.json AND no index.* → `{ candidates: [], warnings: ['no package.json or index.* found ...'], scanned: true }`
- L4: package.json malformed JSON → falls back to index.* scan; warning emitted
- L5: package.json `exports` map (string form) → resolves entrypoint
- L6: package.json `exports` map (object form with multiple subpaths) → all entrypoints scanned
- L7: zero exports parsed (file is empty or all comments) → `{ candidates: [], warnings: ['eden-libs has no exported surface'], scanned: true }`
- L8: ranking — current objective tokens `['parse', 'state']` against exports `['parseStateMd', 'unrelated']` → parseStateMd wins
- L9: tokens-matched count exposed in candidate object (for the renderer to use)
- L10: `opts.path` override is honored

### Group CLI2 (CLI wiring)
- CLI2-1: `df-tools org-awareness scan-libs 03 --raw` returns parseable JSON with `candidates` array and `scanned` boolean
- CLI2-2: `df-tools org-awareness scan-libs` (no objective_id) prints usage + exit 1

### Group F2 (fixture sanity)
- F2-1: `buildEdenLibsTree({ tmpdir, exports: ['parseStateMd', 'resolveChain'] })` creates package.json + index.cjs with exactly those 2 named exports
- F2-2: `buildEdenLibsTree` with `omit_package_json: true` skips package.json (for L4 test variation)
- F2-3: `buildEdenLibsTree` with `package_json_main: 'lib/main.cjs'` writes `main` field correctly

<tasks>

<task type="auto">
  <name>Task 1: RED — failing tests for camelSplit, parseExports, scanLibs, fixture</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
**FIXTURE-FIRST + RED PHASE PER TDD PLAYBOOK HABITS 3 + 4.**

**Part 1: Add `buildEdenLibsTree` to `__fixtures__/awareness-fixtures.cjs`** (extend; preserve all existing builders).

```js
function buildEdenLibsTree({
  tmpdir,
  name = 'eden-libs',
  omit_package_json = false,
  package_json_main = 'index.cjs',
  package_json_exports = null,  // null | string | object
  index_filename = 'index.cjs',
  exports: exportNames = ['parseStateMd', 'resolveChain'],
  index_content_override = null,
} = {}) {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(tmpdir, name);
  fs.mkdirSync(root, { recursive: true });

  if (!omit_package_json) {
    const pkg = {
      name: 'eden-libs',
      version: '0.0.1',
      main: package_json_main,
    };
    if (package_json_exports != null) pkg.exports = package_json_exports;
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2));
  }

  const indexPath = path.join(root, index_filename);
  // Ensure parent dir exists (for cases where index_filename has nested path like 'lib/main.cjs')
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  let indexContent = index_content_override;
  if (indexContent == null) {
    const lines = [];
    lines.push("'use strict';");
    lines.push('');
    lines.push('module.exports = {');
    for (const sym of exportNames) {
      lines.push(`  ${sym}: function ${sym}() { return null; },`);
    }
    lines.push('};');
    indexContent = lines.join('\n') + '\n';
  }
  fs.writeFileSync(indexPath, indexContent);

  return { root, index_path: indexPath, package_json_path: omit_package_json ? null : path.join(root, 'package.json') };
}
```

Add to module.exports of awareness-fixtures.cjs.

**Part 2: Append test groups CS, PE, RP, L, CLI2, F2 to `org-awareness.test.cjs`.**

```js
// ─── TRD 03-02 tests ─────────────────────────────────────────────────────────

const fs2 = require('fs');
const path2 = require('path');
const os2 = require('os');

// Group CS — camelSplit
test('CS1 — camelSplit empty string returns []', () => {
  // _camelSplit may be exported or internal; for now expect via internal access pattern
  const split = oa._camelSplit ? oa._camelSplit('') : [];
  assert.deepStrictEqual(split, []);
});

test('CS3 — parseStateMd splits to [parse, State, Md]', () => {
  const split = oa._camelSplit('parseStateMd');
  assert.deepStrictEqual(split, ['parse', 'State', 'Md']);
});
// ... CS2, CS4, CS5, CS6

// Group PE — parseExports
test('PE1 — module.exports.foo = ... extracts foo', () => {
  const names = oa._parseExports('module.exports.foo = function() {};');
  assert.ok(names.includes('foo'));
});

test('PE3 — module.exports = { a, b: x, c }; extracts [a,b,c]', () => {
  const names = oa._parseExports('module.exports = { a, b: x, c };');
  assert.deepStrictEqual(names.sort(), ['a', 'b', 'c']);
});
// ... PE2, PE4-PE10

// Group RP — resolveEdenLibsPath
// Use _setRunFs mock to control existsSync
test('RP1 — opts.path takes precedence', () => {
  const resolved = oa._resolveEdenLibsPath({ path: '/explicit/path' }, '/some/cwd');
  assert.strictEqual(resolved, '/explicit/path');
});
// ... RP2-RP4

// Group L — scanLibs end-to-end
test('L1 — happy path: eden-libs with parseStateMd matches token "parse"', () => {
  const tmp = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'eden-'));
  try {
    const tree = fix.buildEdenLibsTree({ tmpdir: tmp, exports: ['parseStateMd', 'unrelated'] });
    const r = oa.scanLibs({ path: tree.root, current_tokens: new Set(['parse', 'state']) });
    assert.strictEqual(r.scanned, true);
    assert.ok(r.candidates.length > 0);
    assert.strictEqual(r.candidates[0].symbol, 'parseStateMd');
  } finally {
    fs2.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L2 — missing path returns scanned:false', () => {
  const r = oa.scanLibs({ path: '/nonexistent-zzz-path' });
  assert.strictEqual(r.scanned, false);
  assert.ok(r.warnings.some(w => /not found/.test(w)));
});
// ... L3-L10

// Group CLI2 (subprocess)
test('CLI2-1 — df-tools org-awareness scan-libs returns JSON', () => {
  const dfTools = path2.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync('node', [dfTools, 'org-awareness', 'scan-libs', '03', '--raw'], { encoding: 'utf-8' });
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.ok('candidates' in parsed);
  assert.ok('scanned' in parsed);
});
// ... CLI2-2

// Group F2 (fixture sanity)
test('F2-1 — buildEdenLibsTree creates package.json + index.cjs', () => {
  const tmp = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'edenfix-'));
  try {
    const tree = fix.buildEdenLibsTree({ tmpdir: tmp, exports: ['foo', 'bar'] });
    assert.ok(fs2.existsSync(tree.package_json_path));
    assert.ok(fs2.existsSync(tree.index_path));
    const idx = fs2.readFileSync(tree.index_path, 'utf-8');
    assert.match(idx, /foo:/);
    assert.match(idx, /bar:/);
  } finally {
    fs2.rmSync(tmp, { recursive: true, force: true });
  }
});
// ... F2-2, F2-3
```

# CRITICAL: Tests for L1+ depend on scanLibs not yet existing → MUST FAIL with TypeError on call. That's the RED signal.
# GOTCHA: Some tests use `_setRunFs` to inject mocks; others (L1, F2) use real tmpdir + real fs. Both are valid.

**Commit RED:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
git commit -m "test(03-02): add failing tests for scanLibs + camelSplit + parseExports + buildEdenLibsTree

RED phase: scanLibs/_camelSplit/_parseExports not yet implemented.
Fixture buildEdenLibsTree added per TDD Playbook habit 4 ahead of behavior tests."
```
  </action>
  <verify>
- `npm test 2>&1 | grep -E 'CS\\d|PE\\d|RP\\d|L\\d|CLI2|F2-'` shows all new groups; CS/PE/RP/L groups should fail (functions undefined); F2 should pass (fixture builder exists).
- buildEdenLibsTree loadable: `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); const os=require("os"); const t=f.buildEdenLibsTree({tmpdir:os.tmpdir()}); require("fs").rmSync(t.root,{recursive:true,force:true}); console.log("OK");'`
  </verify>
  <done>
test commit lands. RED tests for CS/PE/RP/L/CLI2 fail with expected errors (function not exported / TypeError). F2 fixture-sanity tests pass.
  </done>
  <recovery>
If buildEdenLibsTree breaks because of nested `package_json_main`: ensure `mkdirSync(dirname, { recursive: true })` is called before writeFileSync.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement scanLibs + helpers + CLI wiring</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.cjs
    plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
  </files>
  <action>
**GREEN PHASE — minimal code to pass RED tests.**

**Part 1: Add scanLibs region to `lib/org-awareness.cjs`** (insert AFTER scanSiblings region, BEFORE module.exports).

```js
// ─── TRD 03-02: scanLibs (eden-libs reuse scanner) ────────────────────────────

function _camelSplit(name) {
  if (!name || typeof name !== 'string') return [];
  return name.replace(/([A-Z]+)/g, ' $1').trim().split(/\s+/).filter(Boolean);
}

function _parseExports(source) {
  if (!source || typeof source !== 'string') return [];
  const names = new Set();

  // CommonJS: module.exports.foo = ...
  let m;
  const reCjsAssign = /(?:^|\s)(?:module\.exports|exports)\.(\w+)\s*=/g;
  while ((m = reCjsAssign.exec(source)) !== null) {
    names.add(m[1]);
  }

  // CommonJS object literal: module.exports = { a, b: x, c };
  // Match the FIRST module.exports = { ... } block; tolerant of newlines.
  const reCjsObj = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?/;
  m = source.match(reCjsObj);
  if (m) {
    const inside = m[1];
    // Split on commas at top level (good enough — exports rarely have nested object values in this style)
    const parts = inside.split(/,(?![^{]*\})/);
    for (const p of parts) {
      // Each part: 'foo' or 'bar: value' or '...spread'
      const trimmed = p.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('...')) continue;
      const km = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (km) names.add(km[1]);
    }
  }

  // ES Modules: export function foo() / export const bar / export class Baz
  const reEsmDecl = /export\s+(?:function|const|let|var|class)\s+(\w+)/g;
  while ((m = reEsmDecl.exec(source)) !== null) {
    names.add(m[1]);
  }

  // ES Modules: export { foo, bar }
  const reEsmList = /export\s+\{([^}]*)\}/g;
  while ((m = reEsmList.exec(source)) !== null) {
    const parts = m[1].split(',');
    for (const p of parts) {
      const km = p.trim().match(/^(\w+)(?:\s+as\s+\w+)?$/);
      if (km) names.add(km[1]);
    }
  }

  // Skip ES default exports (no useful symbol name for token matching)

  return Array.from(names);
}

function _resolveEdenLibsPath(opts = {}, cwd = process.cwd()) {
  if (opts.path) return _expandHome(opts.path);
  // Read .planning/config.json
  const configPath = path.join(cwd, '.planning', 'config.json');
  if (_runFs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(_runFs.readFileSync(configPath, 'utf-8'));
      if (cfg.awareness && cfg.awareness.eden_libs_path) {
        return _expandHome(cfg.awareness.eden_libs_path);
      }
    } catch { /* ignore malformed config */ }
  }
  return _expandHome(DEFAULT_EDEN_LIBS_PATH);
}

function _entrypointsFromPackageJson(repoRoot, pkg) {
  const out = [];
  if (typeof pkg.main === 'string') out.push(path.join(repoRoot, pkg.main));
  if (pkg.exports) {
    if (typeof pkg.exports === 'string') {
      out.push(path.join(repoRoot, pkg.exports));
    } else if (typeof pkg.exports === 'object') {
      // Walk values recursively, collect string paths ending in .cjs/.js/.mjs/.ts
      const walk = (node) => {
        if (typeof node === 'string') {
          if (/\.(cjs|mjs|js|ts)$/.test(node)) out.push(path.join(repoRoot, node));
        } else if (typeof node === 'object' && node != null) {
          for (const k of Object.keys(node)) walk(node[k]);
        }
      };
      walk(pkg.exports);
    }
  }
  return Array.from(new Set(out));
}

function scanLibs({ path: optPath, current_tokens, cwd = process.cwd() } = {}) {
  const out = { candidates: [], warnings: [], scanned: false, path: null };
  const resolved = _resolveEdenLibsPath({ path: optPath }, cwd);
  out.path = resolved;

  if (!_runFs.existsSync(resolved)) {
    out.warnings.push(`eden-libs not found at ${resolved}`);
    return out;
  }

  out.scanned = true;

  // Resolve entrypoints
  const pkgPath = path.join(resolved, 'package.json');
  let entrypoints = [];
  if (_runFs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(_runFs.readFileSync(pkgPath, 'utf-8'));
      entrypoints = _entrypointsFromPackageJson(resolved, pkg);
    } catch (e) {
      out.warnings.push(`malformed package.json: ${e.message}`);
    }
  }
  if (entrypoints.length === 0) {
    // Fallback to index.* at root
    for (const fname of ['index.cjs', 'index.js', 'index.mjs', 'index.ts']) {
      const p = path.join(resolved, fname);
      if (_runFs.existsSync(p)) entrypoints.push(p);
    }
  }
  if (entrypoints.length === 0) {
    out.warnings.push('no package.json or index.* found at ' + resolved);
    return out;
  }

  // Parse exports across entrypoints
  const allExports = new Map(); // symbol -> entrypoint path
  for (const ep of entrypoints) {
    let src;
    try { src = _runFs.readFileSync(ep, 'utf-8'); } catch (e) {
      out.warnings.push(`read ${ep} failed: ${e.message}`);
      continue;
    }
    for (const sym of _parseExports(src)) {
      if (!allExports.has(sym)) allExports.set(sym, ep);
    }
  }

  if (allExports.size === 0) {
    out.warnings.push('eden-libs has no exported surface');
    return out;
  }

  // Score
  const tokens = current_tokens instanceof Set ? current_tokens : new Set();
  const scored = [];
  for (const [sym, ep] of allExports.entries()) {
    const symTokens = new Set();
    for (const part of _camelSplit(sym)) {
      const lc = part.toLowerCase();
      if (lc.length >= 3 && !STOP_WORDS.has(lc)) symTokens.add(lc);
    }
    let matchCount = 0;
    for (const t of tokens) if (symTokens.has(t)) matchCount++;
    scored.push({
      symbol: sym,
      entrypoint: ep,
      tokens_matched: matchCount,
      symbol_tokens: Array.from(symTokens),
    });
  }
  scored.sort((a, b) => (b.tokens_matched - a.tokens_matched) || a.symbol.localeCompare(b.symbol));
  out.candidates = scored.slice(0, TOP_N);

  return out;
}
```

Update `module.exports` block at end of file:
```js
module.exports = {
  scanSiblings,
  scanLibs,         // NEW (TRD 03-02)
  _setRunFs,
  _resetFsMock,
  _tokenize,
  _score,
  _camelSplit,      // NEW
  _parseExports,    // NEW
  _resolveEdenLibsPath,  // NEW
  TOP_N,
  SUMMARY_RECENCY_DAYS,
  DEFAULT_SIBLING_GLOB,
  DEFAULT_EDEN_LIBS_PATH,
};
```

**Part 2: Replace stub in `lib/org-awareness-cli.cjs`**:

```js
function cmdOrgAwarenessScanLibs(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness scan-libs <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }
  // Tokenize objective_id as best-effort current_tokens (richer extraction in TRD 03-04+)
  const current_tokens = oa._tokenize ? oa._tokenize(objective_id) : new Set();
  const result = oa.scanLibs({ current_tokens, cwd });
  output(result, raw);
}
```

**Run tests until green:**
```bash
npm test 2>&1 | grep -E 'CS|PE|RP|L\d|CLI2|F2' | head -30
```

**Commit GREEN:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.cjs plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
git commit -m "feat(03-02): implement scanLibs + camelSplit + parseExports + CLI wiring

GREEN phase: lib/org-awareness.cjs gains scanLibs (lexical match against
eden-libs exported symbols) plus _camelSplit / _parseExports / _resolveEdenLibsPath
helpers. CLI scan-libs subcommand replaces the 03-01 stub.

Lexical match heuristic only — no LLM scoring per CONTEXT.md locked decision #2.
Closes SC-3, SC-4 (eden-libs scanner + match heuristic)."
```
  </action>
  <verify>
- `npm test 2>&1 | tail -10` shows full suite pass (731+ from before, plus all 03-01 tests, plus new 03-02 tests)
- `node plugins/devflow/devflow/bin/df-tools.cjs org-awareness scan-libs 03 --raw 2>&1 | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); assert "candidates" in d; assert "scanned" in d; print("OK")'`
- All Group L test cases pass (L1 through L10)
- Module exports include `scanLibs`
  </verify>
  <done>
feat commit lands. RED tests are GREEN. Module exports `scanLibs`. CLI subcommand scan-libs returns valid JSON. eden-libs missing case → graceful empty + warning. eden-libs empty case → graceful empty + warning. Lexical match heuristic verified by L1, L8, L9 cases.
  </done>
  <recovery>
If a regex captures escaped/commented content incorrectly: tighten the regex with anchored negative lookbehind. e.g. `(?<![/])exports\.foo` to skip `// exports.foo`. But best-effort is acceptable per Test list note PE10.
If `_resolveEdenLibsPath` fails on a Windows path: home-expand using `os.homedir()` only; do NOT use shell expansion. Already locked in 03-01 `_expandHome`.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
1. `npm test` passes (no regressions; new tests pass).
2. `lib/org-awareness.cjs` exports `scanLibs` AND retains all 03-01 exports.
3. `df-tools org-awareness scan-libs <id> --raw` returns parseable JSON.
4. eden-libs absent → graceful return with warning, scanned: false.
5. eden-libs present but empty → graceful return with warning, scanned: true.
6. Lexical match: `parseStateMd` symbol matches objective tokens `['parse', 'state']` (L1 + L8 cases).
7. NO LLM/embedding code introduced.
</verification>

<success_criteria>
- [ ] `lib/org-awareness.cjs` extended with scanLibs + _camelSplit + _parseExports + _resolveEdenLibsPath
- [ ] All Test list groups (CS, PE, RP, L, CLI2, F2) implemented and passing
- [ ] `lib/org-awareness-cli.cjs` scan-libs handler replaces 03-01 stub
- [ ] `__fixtures__/awareness-fixtures.cjs` extended with buildEdenLibsTree (obj 2 + 03-01 builders preserved)
- [ ] RED commit (test:) precedes GREEN commit (feat:)
- [ ] SC-3 (top-3 eden-libs candidates) verifiable via L1+L8
- [ ] SC-4 (lexical match heuristic, no LLM) verifiable via L1+L9 + grep absence of any LLM/embedding require
</success_criteria>

<output>
After completion, create `.planning/objectives/03-planning-time-org-awareness/03-02-eden-libs-scanner-SUMMARY.md`.
</output>
