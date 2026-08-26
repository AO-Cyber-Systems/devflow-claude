'use strict';

/**
 * telemetry.test.cjs — TRD 31-01
 *
 * The advisories are the product here. Raw counts nobody reads are how the
 * original problems stayed invisible for three months; these tests pin that a
 * real signal produces a sentence telling someone what to do about it.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { collect } = require('./telemetry.cjs');
const { recordOverride } = require('./override.cjs');

let dir, pd;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-'));
  pd = path.join(dir, '.planning');
  fs.mkdirSync(pd);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('collect() — quiet when nothing is wrong', () => {
  test('a clean project reports nothing needing attention', () => {
    const r = collect({ planningDir: pd });
    assert.deepEqual(r.advisories, ['nothing needs attention']);
    assert.equal(r.overrides.total, 0);
    assert.equal(r.progress_guard.worst_streak, 0);
  });

  test('no planning dir is stated, not crashed', () => {
    const r = collect({ planningDir: null });
    assert.match(r.advisories[0], /not a DevFlow project/);
  });
});

describe('collect() — surfaces real signals as advice', () => {
  test('a repeatedly-overridden gate is called out as mis-scoped', () => {
    for (let i = 0; i < 5; i++) recordOverride({ planningDir: pd, gate: 'edits', reason: `r${i}` });
    const r = collect({ planningDir: pd });
    assert.equal(r.overrides.total, 5);
    assert.ok(r.advisories.some(a => /mis-scoped/.test(a)), 'expected a rescoping advisory');
  });

  test('a stuck loop surfaces from progress-guard state', () => {
    fs.writeFileSync(path.join(pd, '.progress-guard.json'), JSON.stringify({
      s1: { guard: { streak: 6, last: 'abc' }, updated: Date.now() },
    }));
    const r = collect({ planningDir: pd });
    assert.equal(r.progress_guard.worst_streak, 6);
    assert.ok(r.advisories.some(a => /stuck loop/.test(a)));
  });

  test('a streak below the warn threshold stays quiet', () => {
    fs.writeFileSync(path.join(pd, '.progress-guard.json'), JSON.stringify({
      s1: { guard: { streak: 2 }, updated: Date.now() },
    }));
    const r = collect({ planningDir: pd });
    assert.deepEqual(r.advisories, ['nothing needs attention']);
  });

  test('DevFlow-owned blocks are called out; harness blocks are not', () => {
    const withOwned = collect({
      planningDir: pd,
      sessionReport: { total_events: 10, devflow_owned_events: 4, sessions_with_blocks_pct: 20, by_category: { 'devflow-edit-gate': 4 } },
    });
    assert.ok(withOwned.advisories.some(a => /DevFlow-owned blocks/.test(a)));

    const harnessOnly = collect({
      planningDir: pd,
      sessionReport: { total_events: 10, devflow_owned_events: 0, sessions_with_blocks_pct: 20, by_category: { 'worktree-isolation': 10 } },
    });
    assert.deepEqual(harnessOnly.advisories, ['nothing needs attention'],
      'harness-owned blocks must not be reported as DevFlow debt');
  });

  test('block scanning is opt-in — omitted when no report is supplied', () => {
    assert.equal(collect({ planningDir: pd }).blocks, null);
  });

  test('a corrupt progress-guard file degrades to zeros', () => {
    fs.writeFileSync(path.join(pd, '.progress-guard.json'), '{{{ broken');
    const r = collect({ planningDir: pd });
    assert.equal(r.progress_guard.worst_streak, 0);
  });
});
