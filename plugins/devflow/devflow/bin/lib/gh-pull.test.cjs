'use strict';

// gh-pull.test.cjs — Test list (TRD 21-01)
//
// fetchGhIssue:
//   F1: returns parsed issue JSON when gh succeeds
//   F2: returns null when gh exits 1 with "Could not resolve to an Issue"
//   F3: returns error object when gh exits with other failure
//
// detectDrift (pure logic, no IO):
//   D1: GH unchanged (updatedAt matches last_sync) → { drift: false, fields: {} }
//   D2: GH state OPEN → CLOSED, disk unchanged → { drift: true, fields: { status } }
//   D3: GH labels added, disk unchanged → { drift: true, fields: { labels } }
//   D4: First-time pull (no last_sync entry) → { drift: true, first_sync: true }
//   D5: GH changed AND disk changed → { drift: true, conflict_suspected: false (deferred to TRD 21-03) }
//
// applyDrift (writes OBJECTIVE.md):
//   A1: writes new status to frontmatter, preserves other keys
//   A2: writes new labels array to frontmatter
//   A3: refuses to apply when conflict_suspected: true
//   A4: refuses to apply when no last_sync state and not first_sync
//
// cmdGhPull (CLI orchestrator):
//   C1: no objective → exits 1 with usage message
//   C2: objective has no mapping → exits 1 with hint to run `gh sync-objectives`
//   C3: GH unchanged → exits 0 with no-drift message
//   C4: GH changed, no --apply → prints diff, exits 0 (drift reported, not written)
//   C5: GH changed, --apply, no conflict → writes OBJECTIVE.md, exits 0
//   C6: GH issue not found (404) → exits 1
//   C7: --raw flag emits JSON output

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ghPull = require('./gh-pull.cjs');
const fx = require('./__fixtures__/gh-pull-fixtures.cjs');

beforeEach(() => { ghPull._setRunGh(null); });
afterEach(() => { ghPull._setRunGh(null); });

describe('fetchGhIssue', () => {
  test('F1: returns parsed issue JSON when gh succeeds', () => {
    const cassette = fx.loadCassette('objective-open-no-drift');
    const responses = new Map([[cassette.args.join(' '), cassette.response]]);
    ghPull._setRunGh(fx.buildMockRunGh(responses));

    const issue = ghPull.fetchGhIssue('AO-Cyber-Systems/devflow-claude#10');
    assert.strictEqual(issue.state, 'OPEN');
    assert.deepStrictEqual(issue.labels, [{ name: 'devflow:objective', color: '0e8a16' }]);
    assert.strictEqual(issue.updatedAt, '2026-05-01T00:00:00Z');
  });

  test('F2: returns null when gh exits 1 with "Could not resolve to an Issue"', () => {
    const cassette = fx.loadCassette('objective-not-found');
    const responses = new Map([[cassette.args.join(' '), cassette.response]]);
    ghPull._setRunGh(fx.buildMockRunGh(responses));

    const issue = ghPull.fetchGhIssue('AO-Cyber-Systems/devflow-claude#99999');
    assert.strictEqual(issue, null);
  });

  test('F3: returns error object when gh exits with other failure', () => {
    const responses = new Map([
      ['issue view 50 --repo AO-Cyber-Systems/devflow-claude --json state,labels,assignees,milestone,updatedAt',
        { ok: false, status: 1, stdout: '', stderr: 'rate limit exceeded' }],
    ]);
    ghPull._setRunGh(fx.buildMockRunGh(responses));

    const issue = ghPull.fetchGhIssue('AO-Cyber-Systems/devflow-claude#50');
    assert.strictEqual(issue._ok, false);
    assert.match(issue.error, /rate limit/);
  });
});

describe('detectDrift', () => {
  test('D1: GH unchanged (updatedAt matches last_sync) → { drift: false, fields: {} }', () => {
    const ghCassette = fx.loadCassette('objective-open-no-drift');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'open', labels: ['devflow:objective'] });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z', // SAME as cassette updatedAt
      label_set: ['devflow:objective'],
    });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.drift, false);
    assert.deepStrictEqual(r.fields, {});
    assert.strictEqual(r.first_sync, false);
  });

  test('D2: GH state OPEN → CLOSED, disk unchanged → { drift: true, fields: { status } }', () => {
    const ghCassette = fx.loadCassette('objective-closed-on-gh');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'in_progress', labels: ['devflow:objective'] });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z', // OLDER than cassette updatedAt
      label_set: ['devflow:objective'],
    });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.drift, true);
    assert.ok(r.fields.status, 'status drift expected');
    assert.strictEqual(r.fields.status.gh, 'done');
  });

  test('D3: GH labels added, disk unchanged → { drift: true, fields: { labels } }', () => {
    const ghCassette = fx.loadCassette('objective-relabeled-on-gh');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'open', labels: ['devflow:objective'] });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z', // OLDER than cassette
      label_set: ['devflow:objective'],
    });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.drift, true);
    assert.ok(r.fields.labels, 'labels drift expected');
    assert.deepStrictEqual(r.fields.labels.gh.sort(), ['devflow:in-progress', 'devflow:objective']);
  });

  test('D4: First-time pull (no last_sync entry) → { drift: true, first_sync: true }', () => {
    const ghCassette = fx.loadCassette('objective-open-no-drift');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'open', labels: ['devflow:objective'] });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state: null });
    assert.strictEqual(r.drift, true);
    assert.strictEqual(r.first_sync, true);
  });

  test('D5: GH changed → conflict_suspected stays false (deferred to TRD 21-03)', () => {
    const ghCassette = fx.loadCassette('objective-closed-on-gh');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'in_progress' });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z',
    });

    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.conflict_suspected, false);
  });
});
