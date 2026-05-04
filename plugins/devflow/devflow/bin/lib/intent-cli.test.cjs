'use strict';

// CLI integration + completeness tests for the kind/work intent model.
// Complements intent.test.cjs (library logic) with:
//   - df-tools intent resolve subcommand end-to-end
//   - 42-cell defaults table completeness check
//   - Full stacked precedence chain
//   - TRD type:standard + confidence passthrough
//   - Error paths through the CLI surface

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const intent = require('./intent.cjs');
const fixtures = require('./__fixtures__/intent-fixtures.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

// Always sandbox HOME so tests don't pick up the developer's ~/.claude/CLAUDE.md.
// Tests that need a CLAUDE.md present should use fixtures.buildProject with
// claudeMdUser: ... and pass that home dir to runTool via opts.home.
function runTool(args, cwd, opts = {}) {
  const sandboxHome = opts.home || cwd;
  try {
    const out = execFileSync('node', [TOOLS_PATH, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: sandboxHome },
    });
    return { ok: true, stdout: out, stderr: '' };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || e.message,
      code: e.status,
    };
  }
}

// ---------------------------------------------------------------------------
// Defaults table completeness — every (kind, work) cell exists and is well-formed
// ---------------------------------------------------------------------------

describe('defaults-table.md completeness', () => {
  let table;
  beforeEach(() => {
    intent._resetCache();
    table = intent.loadDefaultsTable();
  });

  test('all 6 kinds × 7 works = 42 cells are present', () => {
    let count = 0;
    for (const kind of intent.VALID_KINDS) {
      assert.ok(table[kind], `kind '${kind}' missing from defaults table`);
      for (const work of intent.VALID_WORKS) {
        assert.ok(table[kind][work],
          `cell (${kind}, ${work}) missing from defaults table`);
        count += 1;
      }
    }
    assert.strictEqual(count, 42, 'expected exactly 42 cells');
  });

  test('every cell has required fields (tdd, depth, model_profile, verification)', () => {
    for (const kind of intent.VALID_KINDS) {
      for (const work of intent.VALID_WORKS) {
        const cell = table[kind][work];
        for (const field of ['tdd', 'depth', 'model_profile', 'verification']) {
          assert.ok(cell[field],
            `(${kind}, ${work}) missing field '${field}'`);
        }
      }
    }
  });

  test('depth values are constrained to known set', () => {
    const valid = new Set(['quick', 'standard', 'comprehensive']);
    for (const kind of intent.VALID_KINDS) {
      for (const work of intent.VALID_WORKS) {
        assert.ok(valid.has(table[kind][work].depth),
          `(${kind}, ${work}) has invalid depth: ${table[kind][work].depth}`);
      }
    }
  });

  test('model_profile values are constrained to known set', () => {
    const valid = new Set(['quality', 'balanced', 'budget']);
    for (const kind of intent.VALID_KINDS) {
      for (const work of intent.VALID_WORKS) {
        assert.ok(valid.has(table[kind][work].model_profile),
          `(${kind}, ${work}) has invalid model_profile: ${table[kind][work].model_profile}`);
      }
    }
  });

  test('every cell resolves cleanly via intent.resolve (sample test)', () => {
    // Spot-check one cell per kind × one cell per work to confirm round-trip.
    // Doing all 42 would be 42x test setup overhead; this catches structural breaks.
    const project = fixtures.buildProject({
      projectFrontmatter: { kind: 'plugin' },
      objectives: intent.VALID_WORKS.map((work, i) => ({
        id: `${String(i + 1).padStart(2, '0')}-${work}`,
        work,
      })),
    });

    try {
      for (let i = 0; i < intent.VALID_WORKS.length; i++) {
        const work = intent.VALID_WORKS[i];
        const id = `${String(i + 1).padStart(2, '0')}-${work}`;
        const result = intent.resolve({
          projectRoot: project.root,
          objectiveId: id,
          userHome: '/nonexistent',
        });
        assert.strictEqual(result.kind, 'plugin');
        assert.strictEqual(result.work, work);
        assert.ok(result.config.tdd);
        assert.ok(result.config.depth);
        assert.ok(result.config.model_profile);
        assert.ok(result.config.verification);
      }
    } finally {
      project.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// CLI integration: df-tools intent resolve
// ---------------------------------------------------------------------------

describe('df-tools intent resolve (CLI)', () => {
  let project;
  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  test('returns resolved config as JSON with --objective', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'port' }],
    });

    const r = runTool(['intent', 'resolve', '--objective', '01-foo'], project.root);
    assert.ok(r.ok, `CLI failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);

    assert.strictEqual(out.kind, 'api');
    assert.strictEqual(out.work, 'port');
    assert.strictEqual(out.workSource, 'OBJECTIVE.md');
    assert.match(out.config.tdd, /build first.*verify API contract parity/);
    assert.strictEqual(out.config.depth, 'comprehensive');
  });

  test('--raw flag emits compact JSON (no pretty-print)', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const r = runTool(['--raw', 'intent', 'resolve', '--objective', '01-foo'], project.root);
    assert.ok(r.ok);
    // Pretty-printed output has newlines; raw should not.
    assert.ok(!r.stdout.includes('\n  '), 'raw output should not be pretty-printed');
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.kind, 'api');
  });

  test('passes --trd to resolve TRD-level overrides', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'prototype' }],
    });
    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ type: 'tdd' }), 'utf-8');

    const r = runTool(
      ['intent', 'resolve', '--objective', '01-foo', '--trd', trdPath],
      project.root,
    );
    assert.ok(r.ok, `CLI failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);

    // (api, prototype) defaults to tdd:skip; type:tdd TRD must promote to strict
    assert.strictEqual(out.config.tdd, 'strict');
    assert.match(out.sources.tdd, /TRD frontmatter/);
  });

  test('errors helpfully when PROJECT.md missing', () => {
    project = fixtures.buildProject({ projectFrontmatter: false });

    const r = runTool(['intent', 'resolve', '--objective', '01-foo'], project.root);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /No PROJECT\.md/);
  });

  test('errors on invalid kind', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'not-a-kind' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const r = runTool(['intent', 'resolve', '--objective', '01-foo'], project.root);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /Invalid kind/);
  });

  test('errors on unknown intent subcommand', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const r = runTool(['intent', 'bogus'], project.root);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /Unknown intent subcommand/);
  });

  test('resolves without --objective (project-level only)', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'library' },
      objectives: [],
    });

    const r = runTool(['intent', 'resolve'], project.root);
    assert.ok(r.ok, `CLI failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);

    assert.strictEqual(out.kind, 'library');
    assert.strictEqual(out.work, 'feature');         // fallback
    assert.strictEqual(out.workSource, 'fallback');
  });
});

// ---------------------------------------------------------------------------
// Full precedence chain — TRD > OBJECTIVE > CLAUDE.md > defaults
// ---------------------------------------------------------------------------

describe('precedence chain — fully stacked', () => {
  let project;
  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  test('TRD beats OBJECTIVE beats CLAUDE.md beats defaults table', () => {
    // Setup all 4 levels with conflicting tdd values:
    //   defaults table: (api, prototype) → tdd: skip
    //   CLAUDE.md user playbook: forces tdd: strict
    //   OBJECTIVE.md overrides.tdd: per-feature
    //   TRD type:tdd → keeps existing if non-skip, else strict
    //                  TRD wins → tdd should be 'per-feature' (existing non-skip preserved)
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{
        id: '01-foo',
        work: 'prototype',
        overrides: { tdd: 'per-feature' },
      }],
      claudeMdUser: fixtures.claudeMd({
        tddSection: {
          heading: 'TDD Playbook',
          body: 'Force TDD TRDs at planning time. All features default to TDD strict.',
        },
      }),
    });

    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ type: 'tdd' }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: project.userHome,
    });

    // TRD type:tdd preserves OBJECTIVE.md's non-skip 'per-feature' value
    // (it would only force 'strict' if the lower level was 'skip' or 'none')
    assert.strictEqual(result.config.tdd, 'per-feature');
    assert.match(result.sources.tdd, /TRD frontmatter/);
  });

  test('OBJECTIVE.md without TRD: OBJECTIVE wins over CLAUDE.md', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{
        id: '01-foo',
        work: 'feature',
        overrides: { depth: 'quick', model_profile: 'budget' },
      }],
      claudeMdUser: fixtures.claudeMd({
        tddSection: {
          heading: 'TDD Playbook',
          body: 'Force TDD TRDs at planning time. All features default to TDD strict.',
        },
      }),
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: project.userHome,
    });

    assert.strictEqual(result.config.depth, 'quick');
    assert.strictEqual(result.config.model_profile, 'budget');
    assert.match(result.sources.depth, /OBJECTIVE.md/);
    assert.match(result.sources.model_profile, /OBJECTIVE.md/);
  });

  test('CLAUDE.md absent: defaults table wins', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.match(result.sources.tdd, /defaults table/);
  });
});

// ---------------------------------------------------------------------------
// TRD-level fields: type:standard and confidence
// ---------------------------------------------------------------------------

describe('TRD frontmatter — type:standard and confidence', () => {
  let project;
  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  test('TRD type:standard forces tdd:standard', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ type: 'standard' }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.config.tdd, 'standard');
    assert.match(result.sources.tdd, /TRD frontmatter type:standard/);
  });

  test('TRD confidence is passed through', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ confidence: 'high' }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.config.confidence, 'high');
    assert.match(result.sources.confidence, /TRD frontmatter/);
  });

  test('TRD type:tdd preserves "skip" → "strict" promotion', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'spike' }],   // (api, spike) → tdd: none
    });

    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ type: 'tdd' }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    // (api, spike) base is 'none' — TRD type:tdd should promote to 'strict'
    assert.strictEqual(result.config.tdd, 'strict');
  });

  test('No TRD type set: skips override logic', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({}), 'utf-8'); // no type, no confidence

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    // tdd should still come from defaults table (or CLAUDE.md if matched)
    assert.match(result.sources.tdd, /defaults table/);
  });
});

// ---------------------------------------------------------------------------
// Group G — fixture builder for the 6×7 matrix
// ---------------------------------------------------------------------------

describe('intent-fixtures — buildMatrixProject', () => {
  test('G1: buildMatrixProject() creates a project with 7 objectives for all work types', () => {
    const matrix = fixtures.buildMatrixProject({ kind: 'api' });
    try {
      assert.ok(matrix.root, 'root must be set');
      assert.ok(typeof matrix.cleanup === 'function', 'cleanup must be function');
      assert.ok(Array.isArray(matrix.objectiveIds), 'objectiveIds must be array');
      assert.strictEqual(matrix.objectiveIds.length, 7, 'must have 7 objectives (one per work type)');

      // Verify all 7 work types are represented
      const works = ['feature', 'port', 'refactor', 'foundation', 'bugfix', 'prototype', 'spike'];
      for (const work of works) {
        const found = matrix.objectiveIds.some((id) => id.includes(work));
        assert.ok(found, `objectiveIds must include work: ${work}`);
      }
    } finally {
      matrix.cleanup();
    }
  });

  test('G2: each objective dir has valid OBJECTIVE.md with correct work frontmatter and a stub TRD', () => {
    const matrix = fixtures.buildMatrixProject({ kind: 'api' });
    try {
      for (const objectiveId of matrix.objectiveIds) {
        const objDir = path.join(matrix.root, '.planning', 'objectives', objectiveId);
        assert.ok(fs.existsSync(objDir), `objective dir missing: ${objectiveId}`);

        const objPath = path.join(objDir, 'OBJECTIVE.md');
        assert.ok(fs.existsSync(objPath), `OBJECTIVE.md missing for: ${objectiveId}`);
        const objContent = fs.readFileSync(objPath, 'utf-8');
        assert.ok(objContent.includes('work:'), `OBJECTIVE.md missing work field for: ${objectiveId}`);

        const trdPath = path.join(objDir, '01-01-TRD.md');
        assert.ok(fs.existsSync(trdPath), `stub TRD missing for: ${objectiveId}`);
        const trdContent = fs.readFileSync(trdPath, 'utf-8');
        assert.ok(trdContent.includes('---'), `stub TRD missing frontmatter for: ${objectiveId}`);
      }
    } finally {
      matrix.cleanup();
    }
  });

  test('G3: buildMatrixProject with kind:plugin resolves all 7 cells cleanly and intent.resolve round-trips', () => {
    const matrix = fixtures.buildMatrixProject({ kind: 'plugin' });
    intent._resetCache();
    try {
      for (const objectiveId of matrix.objectiveIds) {
        intent._resetCache();
        let result;
        assert.doesNotThrow(() => {
          result = intent.resolve({
            projectRoot: matrix.root,
            objectiveId,
            userHome: '/nonexistent',
          });
        }, `resolve threw for ${objectiveId}`);
        assert.strictEqual(result.kind, 'plugin');
        // All 5 new fields must be present
        for (const f of ['security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy']) {
          assert.ok(result.config[f] !== undefined,
            `(plugin, ${result.work}) missing config.${f} for ${objectiveId}`);
        }
        // constraints must be top-level array
        assert.ok(Array.isArray(result.constraints),
          `constraints must be array for ${objectiveId}`);
      }
    } finally {
      matrix.cleanup();
    }
  });
});
