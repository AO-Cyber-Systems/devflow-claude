'use strict';
// Tests for flutter-ui-eval-resolve.cjs (objective 33-01 — one lookup, in code).
//
// resolveUIEvalTarget(cwd, arg) answers two questions the current handler cannot answer
// at all: "is this objective even a Flutter UI objective?" and "where is its manifest,
// and if there isn't one, is that absence or breakage?" — returning four distinguishable
// statuses: not_applicable | absent | invalid | resolved.
//
// Hand-built fixtures only (fixture_strategy: generators) — every case builds its own
// hermetic temp tree with fs.mkdtempSync. Nothing reads the real .planning/.
//
// RED (task 1): this import fails until flutter-ui-eval-resolve.cjs is created.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveUIEvalTarget } = require('./flutter-ui-eval-resolve.cjs');

// ─── Fixture builder (hand-built factory, CLAUDE.md habit 4 — no generated data) ──────
//
// makeObjectiveTree({ id, slug, trds: [{ name, frontmatter }], manifest, repoManifest })
//   -> { cwd, objectiveDir }   built under fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-resolve-'))
//
// Writes a real <tmp>/.planning/objectives/<id>-<slug>/<name>-TRD.md for each entry, with a
// real `---` frontmatter block, because findObjectiveInternal + extractFrontmatter both
// read from disk.

const TMP_DIRS = [];

function frontmatterBlock(fm) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push('---', '', `# TRD`, '');
  return lines.join('\n');
}

// Minimal valid manifest — loadManifest only requires a `states` array.
function validManifestJSON(note) {
  return JSON.stringify({ objective: note || 'fixture', samples: 1, flakeBudget: 0, states: [] });
}

function makeObjectiveTree({
  id = '33',
  slug = 'test-objective',
  trds = [],
  // tier2ManifestJSON / tier2ManifestRaw: write <objective_dir>/evidence/ui_eval/manifest.json
  tier2ManifestJSON = undefined,
  tier2ManifestRaw = undefined,
  tier2YamlOnly = false,
  // tier3Files: [{ name: 'web.manifest.json', content: '...' , prefix: '' | 'flutter' }]
  tier3Files = [],
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-resolve-'));
  TMP_DIRS.push(tmp);

  const objectiveDirName = `${id}-${slug}`;
  const objectiveDir = path.join(tmp, '.planning', 'objectives', objectiveDirName);
  fs.mkdirSync(objectiveDir, { recursive: true });

  for (const trd of trds) {
    const trdPath = path.join(objectiveDir, `${trd.name}-TRD.md`);
    fs.writeFileSync(trdPath, frontmatterBlock(trd.frontmatter), 'utf-8');
  }

  if (tier2ManifestJSON !== undefined || tier2ManifestRaw !== undefined) {
    const tier2Dir = path.join(objectiveDir, 'evidence', 'ui_eval');
    fs.mkdirSync(tier2Dir, { recursive: true });
    const content = tier2ManifestRaw !== undefined ? tier2ManifestRaw : tier2ManifestJSON;
    fs.writeFileSync(path.join(tier2Dir, 'manifest.json'), content, 'utf-8');
  }

  if (tier2YamlOnly) {
    const tier2Dir = path.join(objectiveDir, 'evidence', 'ui_eval');
    fs.mkdirSync(tier2Dir, { recursive: true });
    fs.writeFileSync(path.join(tier2Dir, 'manifest.yaml'), 'states: []\n', 'utf-8');
  }

  for (const f of tier3Files) {
    const dir = f.prefix
      ? path.join(tmp, f.prefix, 'ui_eval', 'manifests')
      : path.join(tmp, 'ui_eval', 'manifests');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, f.name), f.content, 'utf-8');
  }

  return { cwd: tmp, objectiveDir, objectiveDirName };
}

test.after(() => {
  for (const tmp of TMP_DIRS) {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Applicability (write these FIRST — not_applicable short-circuits the rest) ──────

test('Case A1 — two non-UI TRDs -> resolution: not_applicable', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'two-standard-trds',
    trds: [
      { name: '33-01', frontmatter: { objective: '33-two-standard-trds', trd: '"01"', type: 'standard' } },
      { name: '33-02', frontmatter: { objective: '33-two-standard-trds', trd: '"02"', type: 'standard' } },
    ],
  });

  const result = resolveUIEvalTarget(cwd, '33');
  assert.strictEqual(result.resolution, 'not_applicable');
});

test('Case A2 — one TRD with type:ui + stack:flutter -> NOT not_applicable', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'one-flutter-ui-trd',
    trds: [
      { name: '33-01', frontmatter: { objective: '33-one-flutter-ui-trd', trd: '"01"', type: 'ui', stack: 'flutter' } },
    ],
  });

  const result = resolveUIEvalTarget(cwd, '33');
  // No manifest exists in this tree, so once implemented this will be 'absent' — assert
  // the negative here so the case survives 33-02 without needing to know the manifest tier.
  assert.notStrictEqual(result.resolution, 'not_applicable');
  assert.ok(
    ['absent', 'invalid', 'resolved'].includes(result.resolution),
    `expected absent|invalid|resolved, got ${result.resolution}`
  );
});

test('Case A3 — type:ui with stack:react (or stack absent) -> not_applicable', () => {
  const reactTree = makeObjectiveTree({
    id: '33',
    slug: 'react-ui-trd',
    trds: [
      { name: '33-01', frontmatter: { objective: '33-react-ui-trd', trd: '"01"', type: 'ui', stack: 'react' } },
    ],
  });
  const reactResult = resolveUIEvalTarget(reactTree.cwd, '33');
  assert.strictEqual(reactResult.resolution, 'not_applicable');

  const noStackTree = makeObjectiveTree({
    id: '33',
    slug: 'no-stack-ui-trd',
    trds: [
      { name: '33-01', frontmatter: { objective: '33-no-stack-ui-trd', trd: '"01"', type: 'ui' } },
    ],
  });
  const noStackResult = resolveUIEvalTarget(noStackTree.cwd, '33');
  assert.strictEqual(noStackResult.resolution, 'not_applicable');
});

test('Case A4 — unknown objective id -> not_applicable with a reason, and it does not throw', () => {
  const { cwd } = makeObjectiveTree({ id: '33', slug: 'placeholder', trds: [] });

  let result;
  assert.doesNotThrow(() => {
    result = resolveUIEvalTarget(cwd, 'no-such-objective');
  });
  assert.strictEqual(result.resolution, 'not_applicable');
  assert.ok(
    typeof result.reason === 'string' && result.reason.includes('no-such-objective'),
    `expected reason to mention the unknown objective id, got ${JSON.stringify(result.reason)}`
  );
});

// ─── Manifest lookup (only reached when applicable) ──────────────────────────

test('Case M1 — argument is an existing file path -> resolved, no objective lookup', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-resolve-'));
  TMP_DIRS.push(tmp);
  const manifestPath = path.join(tmp, 'some-captured.manifest.json');
  fs.writeFileSync(manifestPath, validManifestJSON('M1'), 'utf-8');

  // No .planning/objectives tree at all in this tmp — an objective lookup would fail.
  const result = resolveUIEvalTarget(tmp, manifestPath);
  assert.strictEqual(result.resolution, 'resolved');
  assert.strictEqual(result.manifest_path, manifestPath);
  assert.ok(Array.isArray(result.manifest.states), 'manifest.states must be an array');
  assert.strictEqual(result.source, 'explicit-path');
});

test('Case M1b — explicit relative path resolved against cwd (path.isAbsolute discriminator)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-resolve-'));
  TMP_DIRS.push(tmp);
  fs.writeFileSync(path.join(tmp, 'rel.manifest.json'), validManifestJSON('M1b'), 'utf-8');

  const result = resolveUIEvalTarget(tmp, 'rel.manifest.json');
  assert.strictEqual(result.resolution, 'resolved');
  assert.strictEqual(result.manifest_path, path.join(tmp, 'rel.manifest.json'));
});

test('Case M2 — objective-evidence manifest.json exists -> resolved, manifest.states an array', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'tier2-hit',
    trds: [{ name: '33-01', frontmatter: { objective: '33-tier2-hit', trd: '"01"', type: 'ui', stack: 'flutter' } }],
    tier2ManifestJSON: validManifestJSON('M2'),
  });

  const result = resolveUIEvalTarget(cwd, '33');
  assert.strictEqual(result.resolution, 'resolved');
  assert.ok(result.manifest_path.endsWith(path.join('evidence', 'ui_eval', 'manifest.json')));
  assert.ok(Array.isArray(result.manifest.states));
  assert.strictEqual(result.source, 'objective-evidence');
});

test('Case M3 — no objective-local manifest, repo-root ui_eval/manifests/*.manifest.json hit', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'tier3-hit',
    trds: [{ name: '33-01', frontmatter: { objective: '33-tier3-hit', trd: '"01"', type: 'ui', stack: 'flutter' } }],
    tier3Files: [{ name: 'web.manifest.json', content: validManifestJSON('M3'), prefix: '' }],
  });

  const result = resolveUIEvalTarget(cwd, '33');
  assert.strictEqual(result.resolution, 'resolved');
  assert.ok(result.manifest_path.endsWith(path.join('ui_eval', 'manifests', 'web.manifest.json')));
  assert.ok(Array.isArray(result.manifest.states));
  assert.strictEqual(result.source, 'repo-manifests');
});

test('Case M3b — tier 3 also searches flutter/ui_eval/manifests/*.manifest.json', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'tier3-flutter-prefix',
    trds: [{ name: '33-01', frontmatter: { objective: '33-tier3-flutter-prefix', trd: '"01"', type: 'ui', stack: 'flutter' } }],
    tier3Files: [{ name: 'web.manifest.json', content: validManifestJSON('M3b'), prefix: 'flutter' }],
  });

  const result = resolveUIEvalTarget(cwd, '33');
  assert.strictEqual(result.resolution, 'resolved');
  assert.ok(result.manifest_path.endsWith(path.join('flutter', 'ui_eval', 'manifests', 'web.manifest.json')));
});

test('Case M4 — precedence: tier 2 AND tier 3 both exist -> tier 2 wins, tier 3 in additional_candidates', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'precedence',
    trds: [{ name: '33-01', frontmatter: { objective: '33-precedence', trd: '"01"', type: 'ui', stack: 'flutter' } }],
    tier2ManifestJSON: validManifestJSON('M4-tier2'),
    tier3Files: [{ name: 'web.manifest.json', content: validManifestJSON('M4-tier3'), prefix: '' }],
  });

  const result = resolveUIEvalTarget(cwd, '33');
  assert.strictEqual(result.resolution, 'resolved');
  assert.ok(result.manifest_path.endsWith(path.join('evidence', 'ui_eval', 'manifest.json')));
  assert.strictEqual(result.manifest.objective, 'M4-tier2', 'manifest must be tier 2 content, not tier 3');
  assert.ok(Array.isArray(result.additional_candidates) && result.additional_candidates.length === 1);
  assert.ok(result.additional_candidates[0].endsWith(path.join('ui_eval', 'manifests', 'web.manifest.json')));
});

test('Case M5 — applicable objective, no manifest anywhere -> absent, searched[] lists every location', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'nothing-here',
    trds: [{ name: '33-01', frontmatter: { objective: '33-nothing-here', trd: '"01"', type: 'ui', stack: 'flutter' } }],
  });

  const result = resolveUIEvalTarget(cwd, '33');
  assert.strictEqual(result.resolution, 'absent');
  assert.ok(Array.isArray(result.searched) && result.searched.length > 0, 'searched[] must be non-empty');
  // Must name at least the tier-2 objective-evidence location and both tier-3 prefixes.
  assert.ok(result.searched.some(s => s.endsWith(path.join('evidence', 'ui_eval', 'manifest.json'))));
  assert.ok(result.searched.some(s => s.includes(path.join('ui_eval', 'manifests'))));
  assert.ok(result.searched.some(s => s.includes(path.join('flutter', 'ui_eval', 'manifests'))));
});

test('Case M6 — manifest.json exists but is unparseable -> invalid, distinguishable from absent by resolution', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'broken-json',
    trds: [{ name: '33-01', frontmatter: { objective: '33-broken-json', trd: '"01"', type: 'ui', stack: 'flutter' } }],
    tier2ManifestRaw: '{ not json',
  });

  const result = resolveUIEvalTarget(cwd, '33');
  assert.strictEqual(result.resolution, 'invalid');
  assert.notStrictEqual(result.resolution, 'absent');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

test('Case M7 — only manifest.yaml exists (no .json sibling) -> invalid, reason: yaml-manifest-unsupported', () => {
  const { cwd } = makeObjectiveTree({
    id: '33',
    slug: 'yaml-only',
    trds: [{ name: '33-01', frontmatter: { objective: '33-yaml-only', trd: '"01"', type: 'ui', stack: 'flutter' } }],
    tier2YamlOnly: true,
  });

  const result = resolveUIEvalTarget(cwd, '33');
  assert.strictEqual(result.resolution, 'invalid');
  assert.notStrictEqual(result.resolution, 'absent');
  assert.strictEqual(result.reason, 'yaml-manifest-unsupported');
  assert.ok(result.manifest_path.endsWith('manifest.yaml'), 'manifest_path must name the yaml file found');
});

test('Case M8 — manifest is present on every resolved result and undefined on every non-resolved one', () => {
  // resolved (M1 explicit-path)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-resolve-'));
  TMP_DIRS.push(tmp);
  const manifestPath = path.join(tmp, 'explicit.manifest.json');
  fs.writeFileSync(manifestPath, validManifestJSON('M8-explicit'), 'utf-8');
  const resolvedExplicit = resolveUIEvalTarget(tmp, manifestPath);
  assert.strictEqual(resolvedExplicit.resolution, 'resolved');
  assert.ok(resolvedExplicit.manifest !== undefined, 'explicit-path resolved result must carry manifest');
  assert.ok(Array.isArray(resolvedExplicit.manifest.states));

  // resolved (M2 tier 2)
  const tier2Tree = makeObjectiveTree({
    id: '33',
    slug: 'm8-tier2',
    trds: [{ name: '33-01', frontmatter: { objective: '33-m8-tier2', trd: '"01"', type: 'ui', stack: 'flutter' } }],
    tier2ManifestJSON: validManifestJSON('M8-tier2'),
  });
  const resolvedTier2 = resolveUIEvalTarget(tier2Tree.cwd, '33');
  assert.strictEqual(resolvedTier2.resolution, 'resolved');
  assert.ok(resolvedTier2.manifest !== undefined);

  // absent
  const absentTree = makeObjectiveTree({
    id: '33',
    slug: 'm8-absent',
    trds: [{ name: '33-01', frontmatter: { objective: '33-m8-absent', trd: '"01"', type: 'ui', stack: 'flutter' } }],
  });
  const absentResult = resolveUIEvalTarget(absentTree.cwd, '33');
  assert.strictEqual(absentResult.resolution, 'absent');
  assert.strictEqual(absentResult.manifest, undefined, 'absent must NOT carry a manifest field');

  // invalid
  const invalidTree = makeObjectiveTree({
    id: '33',
    slug: 'm8-invalid',
    trds: [{ name: '33-01', frontmatter: { objective: '33-m8-invalid', trd: '"01"', type: 'ui', stack: 'flutter' } }],
    tier2ManifestRaw: '{ not json',
  });
  const invalidResult = resolveUIEvalTarget(invalidTree.cwd, '33');
  assert.strictEqual(invalidResult.resolution, 'invalid');
  assert.strictEqual(invalidResult.manifest, undefined, 'invalid must NOT carry a manifest field');

  // not_applicable
  const naTree = makeObjectiveTree({
    id: '33',
    slug: 'm8-not-applicable',
    trds: [{ name: '33-01', frontmatter: { objective: '33-m8-not-applicable', trd: '"01"', type: 'standard' } }],
  });
  const naResult = resolveUIEvalTarget(naTree.cwd, '33');
  assert.strictEqual(naResult.resolution, 'not_applicable');
  assert.strictEqual(naResult.manifest, undefined, 'not_applicable must NOT carry a manifest field');
});

// ─── Regression guard (must stay green) ───────────────────────────────────────

test('Case R1 — module is require-able with zero side effects, adds no third-party dependency', () => {
  const mod = require('./flutter-ui-eval-resolve.cjs');
  assert.ok(Object.keys(mod).includes('resolveUIEvalTarget'));

  const src = fs.readFileSync(path.join(__dirname, 'flutter-ui-eval-resolve.cjs'), 'utf-8');
  const requireCalls = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
  assert.ok(requireCalls.length > 0, 'expected at least one require() call to inspect');

  const NODE_BUILTINS = new Set(['fs', 'path', 'os', 'assert', 'util', 'crypto']);
  for (const req of requireCalls) {
    const isBuiltin = req.startsWith('node:') || NODE_BUILTINS.has(req);
    const isLocal = req.startsWith('./') || req.startsWith('../');
    assert.ok(
      isBuiltin || isLocal,
      `require('${req}') is neither a node builtin nor a local module — third-party dependency detected`
    );
  }
});
