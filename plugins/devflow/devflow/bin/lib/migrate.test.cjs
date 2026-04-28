'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const migrate = require('./migrate.cjs');
const fixtures = require('./__fixtures__/intent-fixtures.cjs');

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
