'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const migrate = require('./migrate.cjs');
const intent = require('./intent.cjs');
const fixtures = require('./__fixtures__/intent-fixtures.cjs');

// Repo root for real-disk tests (migrate.test.cjs is at plugins/devflow/devflow/bin/lib/)
// Level counts: lib(1) → bin(2) → devflow(3) → devflow(4) → plugins(5) → repo-root = 5 levels up
// Defensive: verify by checking for .planning directory at the resolved path
const REPO_ROOT = path.resolve(__dirname, '../../../../../');

describe('migrate.plan', () => {
  let project;
  afterEach(() => { if (project) project.cleanup(); project = null; });

  test('PROJECT.md without kind → needsKind=true', () => {
    project = fixtures.buildProject({
      projectFrontmatter: {},
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const p = migrate.plan({ projectRoot: project.root });
    assert.strictEqual(p.project.needsKind, true);
    assert.strictEqual(p.alreadyMigrated, false);
  });

  test('PROJECT.md with kind and all objectives have work → alreadyMigrated=true', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [
        { id: '01-foo', work: 'feature' },
        { id: '02-bar', work: 'port' },
      ],
    });
    const p = migrate.plan({ projectRoot: project.root });
    assert.strictEqual(p.alreadyMigrated, true);
    assert.strictEqual(p.project.needsKind, false);
  });

  test('OBJECTIVE.md files without work are flagged', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [
        { id: '01-foo' },
        { id: '02-bar', work: 'port' },
      ],
    });
    const p = migrate.plan({ projectRoot: project.root });
    const foo = p.objectives.find((o) => o.id === '01-foo');
    const bar = p.objectives.find((o) => o.id === '02-bar');
    assert.strictEqual(foo.needsWork, true);
    assert.strictEqual(bar.needsWork, false);
    assert.strictEqual(p.alreadyMigrated, false);
  });

  test('No PROJECT.md → returns errors', () => {
    project = fixtures.buildProject({ projectFrontmatter: false });
    const p = migrate.plan({ projectRoot: project.root });
    assert.ok(p.errors.length > 0);
    assert.match(p.errors[0], /No PROJECT.md/);
  });
});

describe('migrate.apply', () => {
  let project;
  afterEach(() => { if (project) project.cleanup(); project = null; });

  test('Adds kind to PROJECT.md frontmatter', () => {
    project = fixtures.buildProject({
      projectFrontmatter: {},
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const result = migrate.apply({ projectRoot: project.root, kind: 'api' });

    assert.strictEqual(result.applied, true);
    const projectMd = fs.readFileSync(path.join(project.root, '.planning', 'PROJECT.md'), 'utf-8');
    assert.match(projectMd, /^kind:\s+api/m);
  });

  test('Adds default_work to PROJECT.md frontmatter when provided', () => {
    project = fixtures.buildProject({
      projectFrontmatter: {},
      objectives: [{ id: '01-foo', work: 'port' }],
    });
    const result = migrate.apply({
      projectRoot: project.root,
      kind: 'api',
      defaultWork: 'port',
    });

    assert.strictEqual(result.applied, true);
    const projectMd = fs.readFileSync(path.join(project.root, '.planning', 'PROJECT.md'), 'utf-8');
    assert.match(projectMd, /^default_work:\s+port/m);
  });

  test('Adds work to OBJECTIVE.md files via workChoices', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [
        { id: '01-foo' },
        { id: '02-bar' },
      ],
    });
    const result = migrate.apply({
      projectRoot: project.root,
      workChoices: { '01-foo': 'feature', '02-bar': 'port' },
    });

    assert.strictEqual(result.applied, true);
    const fooMd = fs.readFileSync(
      path.join(project.root, '.planning', 'objectives', '01-foo', 'OBJECTIVE.md'),
      'utf-8'
    );
    const barMd = fs.readFileSync(
      path.join(project.root, '.planning', 'objectives', '02-bar', 'OBJECTIVE.md'),
      'utf-8'
    );
    assert.match(fooMd, /^work:\s+feature/m);
    assert.match(barMd, /^work:\s+port/m);
  });

  test('Already-migrated project is a no-op', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const result = migrate.apply({ projectRoot: project.root, kind: 'api' });
    assert.strictEqual(result.applied, false);
    assert.strictEqual(result.reason, 'already migrated');
  });

  test('Backup directory created before any write', () => {
    project = fixtures.buildProject({
      projectFrontmatter: {},
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const result = migrate.apply({ projectRoot: project.root, kind: 'api' });
    assert.ok(result.backupDir);
    assert.ok(fs.existsSync(result.backupDir));
    assert.ok(fs.existsSync(path.join(result.backupDir, 'PROJECT.md')));
  });

  test('Dry-run returns changes without writing', () => {
    project = fixtures.buildProject({
      projectFrontmatter: {},
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const projectMdBefore = fs.readFileSync(
      path.join(project.root, '.planning', 'PROJECT.md'),
      'utf-8'
    );

    const result = migrate.apply({
      projectRoot: project.root,
      kind: 'api',
      dryRun: true,
    });

    assert.strictEqual(result.applied, false);
    assert.strictEqual(result.reason, 'dry-run');
    assert.ok(result.changes.length > 0);

    const projectMdAfter = fs.readFileSync(
      path.join(project.root, '.planning', 'PROJECT.md'),
      'utf-8'
    );
    assert.strictEqual(projectMdBefore, projectMdAfter);
  });

  test('Idempotent: applying twice on a migrated project is a no-op the second time', () => {
    project = fixtures.buildProject({
      projectFrontmatter: {},
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const first = migrate.apply({ projectRoot: project.root, kind: 'api' });
    assert.strictEqual(first.applied, true);

    const second = migrate.apply({ projectRoot: project.root, kind: 'api' });
    assert.strictEqual(second.applied, false);
    assert.strictEqual(second.reason, 'already migrated');
  });

  test('Invalid kind throws with helpful error', () => {
    project = fixtures.buildProject({
      projectFrontmatter: {},
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    assert.throws(
      () => migrate.apply({ projectRoot: project.root, kind: 'bogus' }),
      /Invalid kind.*api.*app/s
    );
  });

  test('Invalid work in workChoices throws', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo' }],
    });
    assert.throws(
      () => migrate.apply({
        projectRoot: project.root,
        workChoices: { '01-foo': 'invalid' },
      }),
      /Invalid work for objective 01-foo/
    );
  });
});

// ---------------------------------------------------------------------------
// Group C — migration validation: 07-handoff-watcher regression
//
// Uses the REAL disk at REPO_ROOT — not a synthetic fixture.
// These tests verify that pre-existing project state (07-handoff-watcher)
// round-trips through the extended resolver without breakage.
// The 5 new fields are additive; the objective has no explicit overrides for them.
// ---------------------------------------------------------------------------

describe('migration — 07-handoff-watcher regression', () => {
  afterEach(() => {
    intent._resetCache();
  });

  test('C1: 07-handoff-watcher objective resolves cleanly — kind=plugin, work set, all 9 config fields populated', () => {
    // Verify the objective directory exists on disk (fails loudly if not)
    const objDir = path.join(REPO_ROOT, '.planning', 'objectives', '07-handoff-watcher');
    assert.ok(
      fs.existsSync(objDir),
      `07-handoff-watcher directory missing at ${objDir} — objective must be present on this branch`
    );

    let result;
    try {
      result = intent.resolve({
        projectRoot: REPO_ROOT,
        objectiveId: '07-handoff-watcher',
        userHome: '/nonexistent',
      });
    } catch (e) {
      throw new Error(`07-handoff-watcher resolution failed: ${e.message} (projectRoot: ${REPO_ROOT})`);
    }

    assert.ok(result, 'resolve must return a result');
    assert.strictEqual(result.kind, 'plugin',
      `expected kind=plugin (devflow-claude PROJECT.md), got: ${result.kind}`);
    assert.ok(result.work,
      'work must be set (fallback to feature from PROJECT.md default_work or table)');

    // All 9 scalar fields must be populated in config
    const SCALAR_FIELDS = ['tdd', 'depth', 'model_profile', 'verification',
      'security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy'];
    for (const f of SCALAR_FIELDS) {
      assert.ok(result.config[f] !== undefined,
        `07-handoff-watcher config.${f} is undefined — 5 new fields must apply cleanly`);
    }
  });

  test('C2: 07-handoff-watcher resolution produces no new warnings from the 5 new fields', () => {
    let result;
    try {
      result = intent.resolve({
        projectRoot: REPO_ROOT,
        objectiveId: '07-handoff-watcher',
        userHome: '/nonexistent',
      });
    } catch (e) {
      throw new Error(`07-handoff-watcher resolution failed: ${e.message}`);
    }

    // Allow only the pre-existing 'kind missing' warning (which should NOT appear for plugin kind)
    // or an empty warnings array. The 5 new fields are additive and must not generate warnings.
    const unexpectedWarnings = (result.warnings || []).filter(
      (w) => !w.includes("kind missing") && !w.includes("'kind'")
    );
    assert.strictEqual(unexpectedWarnings.length, 0,
      `07-handoff-watcher resolution produced unexpected warnings: ${JSON.stringify(unexpectedWarnings)}`);
  });

  test('C3: each TRD file under 07-handoff-watcher resolves without error (config fields populated)', () => {
    // The TRD files use informal frontmatter (no --- delimiters) — extractFrontmatter returns null.
    // The resolver handles this gracefully (trdFm will be null/empty).
    const objDir = path.join(REPO_ROOT, '.planning', 'objectives', '07-handoff-watcher');
    const trdFiles = fs.readdirSync(objDir)
      .filter((f) => f.match(/^\d{2}-\d{2}-TRD.*\.md$/) || f.match(/^01-\d{2}-TRD/));

    assert.ok(trdFiles.length > 0,
      `No TRD files found under ${objDir}`);

    for (const trdFile of trdFiles) {
      const trdPath = path.join(objDir, trdFile);
      intent._resetCache();

      let result;
      try {
        result = intent.resolve({
          projectRoot: REPO_ROOT,
          objectiveId: '07-handoff-watcher',
          trdPath,
          userHome: '/nonexistent',
        });
      } catch (e) {
        throw new Error(`07-handoff-watcher/${trdFile} resolution failed: ${e.message}`);
      }

      assert.ok(result, `resolve must return result for ${trdFile}`);
      assert.ok(result.config, `config must be populated for ${trdFile}`);
      // kind and work must resolve correctly
      assert.strictEqual(result.kind, 'plugin', `kind must be plugin for ${trdFile}`);
    }
  });
});
