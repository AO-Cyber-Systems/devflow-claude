'use strict';

/**
 * classifier.test.cjs — Pure-logic unit tests for classifier.cjs
 *
 * Tests all branches of classifySession truth table + renderRoutingPreamble
 * shape assertions + CONSOLIDATED_SKILLS constant verification.
 *
 * Test framework: node:test + node:assert/strict
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySession,
  renderRoutingPreamble,
  CONSOLIDATED_SKILLS,
} = require('./classifier.cjs');

const {
  buildClassifyInput,
  SCENARIOS,
} = require('./__fixtures__/classifier-fixtures.cjs');

// ─── classifySession truth table ─────────────────────────────────────────────

describe('classifySession', () => {
  test('case 1: returns skip when hasDeclineMarker is true regardless of other inputs', () => {
    const input = buildClassifyInput({ planningDir: '/tmp/p/.planning', hasGitDir: true, hasDeclineMarker: true });
    assert.equal(classifySession(input), 'skip');
  });

  test('case 2: returns ambient when planningDir is non-null and no decline marker', () => {
    const input = buildClassifyInput({ planningDir: '/tmp/p/.planning', hasGitDir: true, hasDeclineMarker: false });
    assert.equal(classifySession(input), 'ambient');
  });

  test('case 3: returns init-offer when planningDir is null AND hasGitDir is true AND no decline marker', () => {
    const input = buildClassifyInput({ planningDir: null, hasGitDir: true, hasDeclineMarker: false });
    assert.equal(classifySession(input), 'init-offer');
  });

  test('case 4: returns skip when planningDir is null AND hasGitDir is false AND no decline marker (scratch dir)', () => {
    const input = buildClassifyInput({ planningDir: null, hasGitDir: false, hasDeclineMarker: false });
    assert.equal(classifySession(input), 'skip');
  });

  test('case 5: decline marker takes precedence over ambient (planningDir set + decline marker → skip)', () => {
    const input = buildClassifyInput({ planningDir: '/some/.planning', hasGitDir: false, hasDeclineMarker: true });
    assert.equal(classifySession(input), 'skip');
  });

  test('case 6a: SCENARIOS.ambient fixture → ambient', () => {
    assert.equal(classifySession(SCENARIOS.ambient()), 'ambient');
  });

  test('case 6b: SCENARIOS.initOffer fixture → init-offer', () => {
    assert.equal(classifySession(SCENARIOS.initOffer()), 'init-offer');
  });

  test('case 6c: SCENARIOS.scratchDir fixture → skip', () => {
    assert.equal(classifySession(SCENARIOS.scratchDir()), 'skip');
  });

  test('case 6d: SCENARIOS.noGitDir fixture → skip', () => {
    assert.equal(classifySession(SCENARIOS.noGitDir()), 'skip');
  });

  test('case 6e: SCENARIOS.declineMarker fixture → skip', () => {
    assert.equal(classifySession(SCENARIOS.declineMarker()), 'skip');
  });

  test('case 6f: truth table exhaustive — all combinations of 3 booleans return one of {ambient, init-offer, skip}', () => {
    const VALID = new Set(['ambient', 'init-offer', 'skip']);
    const bools = [true, false];
    for (const planningDir of ['/tmp/p/.planning', null]) {
      for (const hasGitDir of bools) {
        for (const hasDeclineMarker of bools) {
          const result = classifySession({ planningDir, hasGitDir, hasDeclineMarker });
          assert.ok(VALID.has(result), `Expected one of {ambient, init-offer, skip}, got: ${result} for ${JSON.stringify({ planningDir, hasGitDir, hasDeclineMarker })}`);
        }
      }
    }
  });
});

// ─── renderRoutingPreamble ────────────────────────────────────────────────────

describe('renderRoutingPreamble', () => {
  test('case 7: mode ambient returns non-empty string containing DEVFLOW PROJECT DETECTED', () => {
    const result = renderRoutingPreamble({ mode: 'ambient' });
    assert.ok(typeof result === 'string' && result.length > 0, 'should return non-empty string');
    assert.ok(result.includes('DEVFLOW PROJECT DETECTED'), 'must contain DEVFLOW PROJECT DETECTED');
  });

  test('case 8: mode ambient contains /devflow:build (multi-file feature route)', () => {
    const result = renderRoutingPreamble({ mode: 'ambient' });
    assert.ok(result.includes('/devflow:build'), 'must contain /devflow:build');
  });

  test('case 9: mode ambient contains /devflow:micro and NO (in development parenthetical (Phase B shipped)', () => {
    const result = renderRoutingPreamble({ mode: 'ambient' });
    assert.ok(result.includes('/devflow:micro'), 'must contain /devflow:micro');
    assert.ok(!result.includes('(in development'), 'must NOT contain (in development — Phase B has shipped, parenthetical removed');
    assert.ok(result.includes('Sub-30-LOC'), 'must contain Sub-30-LOC qualifier (cutoff documentation)');
    assert.ok(result.includes('~2k token floor'), 'must contain ~2k token floor cost reference');
  });

  test('case 10: mode ambient contains /devflow:status resume (NOT /devflow:resume-work)', () => {
    const result = renderRoutingPreamble({ mode: 'ambient' });
    assert.ok(result.includes('/devflow:status resume'), 'must contain /devflow:status resume');
    assert.ok(!result.includes('/devflow:resume-work'), 'must NOT contain old /devflow:resume-work (Phase G consolidated)');
  });

  test('case 11: mode ambient mentions all 5 consolidated skills by name', () => {
    const result = renderRoutingPreamble({ mode: 'ambient' });
    const skills = ['objective', 'milestone', 'workstreams', 'todo', 'status'];
    for (const skill of skills) {
      assert.ok(result.includes(skill), `must mention consolidated skill: ${skill}`);
    }
  });

  test('case 12: mode ambient mentions gate-edits DENY behavior and all 4 override phrases', () => {
    const result = renderRoutingPreamble({ mode: 'ambient' });
    assert.ok(result.includes('DENY'), 'must mention DENY behavior');
    const overrides = ['"skip devflow"', '"just edit"', '"bypass devflow"', '"force edit"'];
    for (const phrase of overrides) {
      assert.ok(result.includes(phrase), `must mention override phrase: ${phrase}`);
    }
  });

  test('case 13: mode init-offer returns non-empty string containing INIT OFFER', () => {
    const result = renderRoutingPreamble({ mode: 'init-offer' });
    assert.ok(typeof result === 'string' && result.length > 0, 'should return non-empty string');
    assert.ok(result.includes('INIT OFFER'), 'must contain INIT OFFER');
  });

  test('case 14: mode init-offer mentions /devflow:new-project', () => {
    const result = renderRoutingPreamble({ mode: 'init-offer' });
    assert.ok(result.includes('/devflow:new-project'), 'must contain /devflow:new-project');
  });

  test('case 15: mode skip returns empty string', () => {
    const result = renderRoutingPreamble({ mode: 'skip' });
    assert.equal(result, '');
  });

  test('case 16: unknown mode returns empty string', () => {
    const result = renderRoutingPreamble({ mode: 'banana' });
    assert.equal(result, '');
  });
});

// ─── CONSOLIDATED_SKILLS constant ────────────────────────────────────────────

describe('CONSOLIDATED_SKILLS', () => {
  test('case 17: exported and matches Phase G snapshot — 5 skills with exact names', () => {
    assert.ok(Array.isArray(CONSOLIDATED_SKILLS), 'should be an array');
    assert.equal(CONSOLIDATED_SKILLS.length, 5, 'must have exactly 5 skills');

    const names = CONSOLIDATED_SKILLS.map(s => s.name);
    assert.deepEqual(names, ['objective', 'milestone', 'workstreams', 'todo', 'status']);
  });

  test('case 17b: each skill has correct subcommands from 12-RESEARCH.md snapshot', () => {
    const expected = [
      { name: 'objective',   subcommands: ['add', 'remove'] },
      { name: 'milestone',   subcommands: ['new', 'audit', 'complete', 'gaps'] },
      { name: 'workstreams', subcommands: ['setup', 'status', 'merge', 'run'] },
      { name: 'todo',        subcommands: ['add', 'list'] },
      { name: 'status',      subcommands: [null, 'check', 'pause', 'resume'] },
    ];
    assert.deepEqual(CONSOLIDATED_SKILLS, expected);
  });

  test('case 18: status.subcommands[0] is null (default subcommand semantics from 12-03)', () => {
    const status = CONSOLIDATED_SKILLS.find(s => s.name === 'status');
    assert.ok(status, 'status skill must exist');
    assert.equal(status.subcommands[0], null, 'status.subcommands[0] must be null (default invoke)');
  });
});
