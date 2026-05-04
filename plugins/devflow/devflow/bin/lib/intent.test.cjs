'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const intent = require('./intent.cjs');
const fixtures = require('./__fixtures__/intent-fixtures.cjs');

describe('intent.resolve', () => {
  let project;

  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  describe('happy path', () => {
    test('reads PROJECT.md kind and OBJECTIVE.md work, returns (api, port) defaults', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'port' }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.kind, 'api');
      assert.strictEqual(result.work, 'port');
      assert.strictEqual(result.workSource, 'OBJECTIVE.md');
      assert.strictEqual(result.workInherited, false);
      assert.match(result.config.tdd, /build first.*verify API contract parity/);
      assert.strictEqual(result.config.depth, 'comprehensive');
      assert.strictEqual(result.config.model_profile, 'quality');
    });

    test('OBJECTIVE.md missing work → falls back to PROJECT.md default_work', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api', default_work: 'port' },
        objectives: [{ id: '01-foo' }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.work, 'port');
      assert.strictEqual(result.workSource, 'PROJECT.md default_work');
      assert.strictEqual(result.workInherited, true);
    });

    test('PROJECT.md missing default_work → falls back to feature', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'app' },
        objectives: [{ id: '01-foo' }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.work, 'feature');
      assert.strictEqual(result.workSource, 'fallback');
      assert.strictEqual(result.workInherited, true);
    });
  });

  describe('precedence', () => {
    test('TRD frontmatter type:tdd overrides defaults table tdd:skip for (api, prototype)', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'prototype' }],
      });

      const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
      fs.writeFileSync(trdPath, fixtures.trdMd({ type: 'tdd' }), 'utf-8');

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        trdPath,
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.config.tdd, 'strict');
      assert.match(result.sources.tdd, /TRD frontmatter/);
    });

    test('OBJECTIVE.md overrides.tdd:skip overrides defaults table strict for (api, feature)', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{
          id: '01-foo',
          work: 'feature',
          overrides: { tdd: 'skip' },
        }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.config.tdd, 'skip');
      assert.match(result.sources.tdd, /OBJECTIVE.md/);
    });

    test('CLAUDE.md absorption overrides defaults table for (api, prototype)', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'prototype' }],
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

      assert.strictEqual(result.config.tdd, 'strict');
      assert.match(result.sources.tdd, /CLAUDE.md/);
    });

    test('OBJECTIVE.md override wins over CLAUDE.md absorption', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{
          id: '01-foo',
          work: 'prototype',
          overrides: { tdd: 'skip' },
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

      assert.strictEqual(result.config.tdd, 'skip');
      assert.match(result.sources.tdd, /OBJECTIVE.md/);
    });
  });

  describe('failure modes', () => {
    test('Unknown kind throws with helpful error listing valid values', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'invalid-kind' },
        objectives: [{ id: '01-foo', work: 'feature' }],
      });

      assert.throws(
        () => intent.resolve({
          projectRoot: project.root,
          objectiveId: '01-foo',
          userHome: '/nonexistent',
        }),
        /Invalid kind.*api.*app.*library.*ui-lib.*cli.*plugin/s
      );
    });

    test('Unknown work throws with helpful error', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'invalid-work' }],
      });

      assert.throws(
        () => intent.resolve({
          projectRoot: project.root,
          objectiveId: '01-foo',
          userHome: '/nonexistent',
        }),
        /Invalid work.*feature.*port.*refactor/s
      );
    });

    test('Missing PROJECT.md throws (no silent fallback)', () => {
      project = fixtures.buildProject({
        projectFrontmatter: false,
      });

      assert.throws(
        () => intent.resolve({
          projectRoot: project.root,
          userHome: '/nonexistent',
        }),
        /No PROJECT.md found/
      );
    });
  });

  describe('edge cases', () => {
    test('PROJECT.md present but missing kind → returns warning, defaults to api', () => {
      project = fixtures.buildProject({
        projectFrontmatter: {},
        objectives: [{ id: '01-foo', work: 'feature' }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.kind, 'api');
      assert.ok(result.warnings.length > 0);
      assert.match(result.warnings[0], /missing 'kind'/);
    });

    test('Resolution output is deterministic across calls', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'feature' }],
      });

      const r1 = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });
      const r2 = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.deepStrictEqual(r1, r2);
    });

    test('Malformed defaults-table.md throws with helpful error', () => {
      const badTable = fs.mkdtempSync(path.join(require('os').tmpdir(), 'df-bad-'));
      const badPath = path.join(badTable, 'bad-table.md');
      fs.writeFileSync(badPath, '# No yaml block here\n', 'utf-8');

      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'feature' }],
      });

      assert.throws(
        () => intent.resolve({
          projectRoot: project.root,
          objectiveId: '01-foo',
          userHome: '/nonexistent',
          tablePath: badPath,
        }),
        /missing yaml block/
      );

      fs.rmSync(badTable, { recursive: true, force: true });
    });
  });
});
