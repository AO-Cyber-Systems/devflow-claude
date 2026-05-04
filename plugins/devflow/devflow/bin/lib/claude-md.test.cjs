'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeMd = require('./claude-md.cjs');
const fixtures = require('./__fixtures__/intent-fixtures.cjs');

describe('claude-md.absorb', () => {
  let cleanupFns = [];

  afterEach(() => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
  });

  test('returns directives for CLAUDE.md with TDD section', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
    cleanupFns.push(() => fs.rmSync(home, { recursive: true, force: true }));
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'CLAUDE.md'),
      fixtures.claudeMd({
        tddSection: {
          heading: 'TDD Playbook',
          body: 'Force TDD TRDs at planning time. All features default to TDD.',
        },
      }),
      'utf-8'
    );

    const directives = claudeMd.absorb({ userHome: home });

    assert.strictEqual(directives.tdd.length, 1);
    assert.strictEqual(directives.tdd[0].source, 'user');
    assert.match(directives.tdd[0].body, /Force TDD/);
  });

  test('returns empty directives for CLAUDE.md without relevant sections', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
    cleanupFns.push(() => fs.rmSync(home, { recursive: true, force: true }));
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'CLAUDE.md'),
      '# CLAUDE.md\n\n## Architecture\n\nSome architecture notes.\n',
      'utf-8'
    );

    const directives = claudeMd.absorb({ userHome: home });

    assert.strictEqual(directives.tdd.length, 0);
    assert.strictEqual(directives.test.length, 0);
    assert.strictEqual(directives.quality.length, 0);
    assert.strictEqual(directives.scope.length, 0);
  });

  test('reads both user-level and project-level CLAUDE.md; project wins on conflict', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pr-'));
    cleanupFns.push(() => fs.rmSync(home, { recursive: true, force: true }));
    cleanupFns.push(() => fs.rmSync(proj, { recursive: true, force: true }));

    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'CLAUDE.md'),
      fixtures.claudeMd({
        tddSection: { heading: 'TDD Playbook', body: 'User-level TDD policy.' },
      }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(proj, 'CLAUDE.md'),
      fixtures.claudeMd({
        tddSection: { heading: 'TDD', body: 'Project-level TDD policy.' },
      }),
      'utf-8'
    );

    const directives = claudeMd.absorb({ userHome: home, projectRoot: proj });

    assert.strictEqual(directives.tdd.length, 2);
    const userEntry = directives.tdd.find((d) => d.source === 'user');
    const projectEntry = directives.tdd.find((d) => d.source === 'project');
    assert.ok(userEntry);
    assert.ok(projectEntry);
    assert.match(projectEntry.body, /Project-level/);
  });

  test('returns empty when no CLAUDE.md exists at either location', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
    cleanupFns.push(() => fs.rmSync(home, { recursive: true, force: true }));

    const directives = claudeMd.absorb({ userHome: home });

    assert.strictEqual(directives.tdd.length, 0);
    assert.strictEqual(directives._sources.length, 0);
  });
});

describe('claude-md.deriveOverrides', () => {
  test('extracts tdd:strict from "all features default to TDD" body', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD Playbook', body: 'All features default to TDD strict.' }],
      test: [],
      quality: [],
      scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.tdd, 'strict');
  });

  test('extracts tdd:strict from "Force TDD TRDs at planning time" body', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD Playbook', body: 'Force TDD TRDs at planning time when invoking the planner.' }],
      test: [],
      quality: [],
      scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.tdd, 'strict');
  });

  test('returns empty overrides for vague body without policy phrasing', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD', body: 'TDD is helpful sometimes.' }],
      test: [],
      quality: [],
      scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.tdd, undefined);
  });

  test('extracts multitenancy:required from playbook clause', () => {
    const directives = {
      tdd: [{
        source: 'user',
        heading: 'TDD Playbook',
        body: 'Multitenancy guard in every test (when applicable). Test the wrong-tenant isolation always.',
      }],
      test: [],
      quality: [],
      scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.multitenancy, 'required');
  });
});

describe('claude-md.isRelevantHeading', () => {
  test('matches H2 headings with TDD, Test, Quality, Scope keywords', () => {
    assert.ok(claudeMd.isRelevantHeading('## TDD Playbook'));
    assert.ok(claudeMd.isRelevantHeading('## Testing'));
    assert.ok(claudeMd.isRelevantHeading('## Test Strategy'));
    assert.ok(claudeMd.isRelevantHeading('## Quality Bar'));
    assert.ok(claudeMd.isRelevantHeading('## Scope'));
  });

  test('rejects unrelated H2 headings', () => {
    assert.ok(!claudeMd.isRelevantHeading('## Architecture'));
    assert.ok(!claudeMd.isRelevantHeading('## Commands'));
    assert.ok(!claudeMd.isRelevantHeading('## Conventions'));
  });

  test('rejects H1 and H3', () => {
    assert.ok(!claudeMd.isRelevantHeading('# TDD'));
    assert.ok(!claudeMd.isRelevantHeading('### TDD details'));
  });
});
