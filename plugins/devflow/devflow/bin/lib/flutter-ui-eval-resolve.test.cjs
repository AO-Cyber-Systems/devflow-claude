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

function makeObjectiveTree({ id = '33', slug = 'test-objective', trds = [] } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-resolve-'));
  TMP_DIRS.push(tmp);

  const objectiveDirName = `${id}-${slug}`;
  const objectiveDir = path.join(tmp, '.planning', 'objectives', objectiveDirName);
  fs.mkdirSync(objectiveDir, { recursive: true });

  for (const trd of trds) {
    const trdPath = path.join(objectiveDir, `${trd.name}-TRD.md`);
    fs.writeFileSync(trdPath, frontmatterBlock(trd.frontmatter), 'utf-8');
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
