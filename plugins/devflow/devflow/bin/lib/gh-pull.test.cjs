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

describe('applyDrift', () => {
  test('A1: writes new status to frontmatter, preserves other keys', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress', kind: 'plugin', work: 'feature', labels: ['devflow:objective'] },
    });
    try {
      const ghCassette = fx.loadCassette('objective-closed-on-gh');
      const ghIssue = JSON.parse(ghCassette.response.stdout);
      const drift = {
        drift: true,
        first_sync: false,
        conflict_suspected: false,
        fields: { status: { disk: 'in_progress', gh: 'done' } },
      };

      const r = ghPull.applyDrift({
        projectRoot: project.root,
        objectiveId: project.objectiveId,
        drift,
        ghIssue,
        hasLastSync: true,
      });

      assert.strictEqual(r.ok, true);
      assert.deepStrictEqual(r.applied, { status: 'done' });
      // Verify file content updated + other keys preserved
      const content = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      assert.match(content, /status: done/);
      assert.match(content, /kind: plugin/);
      assert.match(content, /work: feature/);
    } finally { project.cleanup(); }
  });

  test('A2: writes new labels array to frontmatter', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open', labels: ['devflow:objective'] },
    });
    try {
      const ghCassette = fx.loadCassette('objective-relabeled-on-gh');
      const ghIssue = JSON.parse(ghCassette.response.stdout);
      const drift = {
        drift: true, first_sync: false, conflict_suspected: false,
        fields: { labels: { disk: ['devflow:objective'], gh: ['devflow:objective', 'devflow:in-progress'] } },
      };

      const r = ghPull.applyDrift({
        projectRoot: project.root,
        objectiveId: project.objectiveId,
        drift,
        ghIssue,
        hasLastSync: true,
      });

      assert.strictEqual(r.ok, true);
      const content = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      assert.match(content, /devflow:in-progress/);
    } finally { project.cleanup(); }
  });

  test('A3: refuses to apply when conflict_suspected: true', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress' },
    });
    try {
      const ghCassette = fx.loadCassette('objective-closed-on-gh');
      const ghIssue = JSON.parse(ghCassette.response.stdout);
      const drift = {
        drift: true, first_sync: false, conflict_suspected: true,
        fields: { status: { disk: 'in_progress', gh: 'done' } },
      };

      const r = ghPull.applyDrift({
        projectRoot: project.root,
        objectiveId: project.objectiveId,
        drift,
        ghIssue,
        hasLastSync: true,
      });

      assert.strictEqual(r.ok, false);
      assert.match(r.error, /Conflict suspected/);
    } finally { project.cleanup(); }
  });

  test('A4: refuses to apply when no last_sync state and not first_sync', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress' },
    });
    try {
      const ghCassette = fx.loadCassette('objective-closed-on-gh');
      const ghIssue = JSON.parse(ghCassette.response.stdout);
      const drift = {
        drift: true, first_sync: false, conflict_suspected: false,
        fields: { status: { disk: 'in_progress', gh: 'done' } },
      };

      const r = ghPull.applyDrift({
        projectRoot: project.root,
        objectiveId: project.objectiveId,
        drift,
        ghIssue,
        hasLastSync: false,
      });

      assert.strictEqual(r.ok, false);
      assert.match(r.error, /No prior sync state/);
    } finally { project.cleanup(); }
  });
});

describe('cmdGhPull (CLI orchestrator)', () => {
  // Capture stdout/stderr + process.exit for CLI tests
  function captureRun(fn) {
    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit;
    let stdout = '', stderr = '', exitCode = null;
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
    try {
      try { fn(); } catch (e) { if (e.message !== '__exit__') throw e; }
    } finally {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
    return { stdout, stderr, exitCode };
  }

  test('C1: no objective → exits 1 with usage message', () => {
    const project = fx.buildTempProject({ objectiveId: '01-foo' });
    try {
      const r = captureRun(() => ghPull.cmdGhPull(project.root, [], false));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.stderr, /Usage:/);
    } finally { project.cleanup(); }
  });

  test('C2: objective has no mapping → exits 1 with hint to run gh sync-objectives', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open' },
      mapping: { milestone_id: 0, objectives: {} }, // no entry for this objective
      projectFm: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    try {
      // Stub _runGh so requireGhAuth passes
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { ok: true, status: 0, stdout: "github.com\n  - Logged in to github.com as fake-user\n  - Token scopes: 'repo'", stderr: '' };
        }
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });
      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /no GitHub issue|sync-objectives/i);
    } finally { project.cleanup(); }
  });

  test('C3: GH unchanged → exits 0 with no-drift message', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open', labels: ['devflow:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 10, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    try {
      // Write a sync-state baseline matching the cassette's updatedAt
      const syncState = { version: 1, objectives: { '21-bidirectional-gh-sync': { gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['devflow:objective'] } } };
      fs.writeFileSync(path.join(project.root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState), 'utf-8');

      const cassette = fx.loadCassette('objective-open-no-drift');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        }
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      assert.strictEqual(r.exitCode, null, 'exit not called for no-drift');
      assert.match(r.stdout, /No drift/i);
    } finally { project.cleanup(); }
  });

  test('C4: GH changed, no --apply → reports drift, exits 0 (does NOT write)', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress', labels: ['devflow:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 11, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    try {
      const syncState = { version: 1, objectives: { '21-bidirectional-gh-sync': { gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['devflow:objective'] } } };
      fs.writeFileSync(path.join(project.root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState), 'utf-8');

      const cassette = fx.loadCassette('objective-closed-on-gh');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const before = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      assert.strictEqual(r.exitCode, null);
      assert.match(r.stdout, /Drift detected|drift/i);
      // OBJECTIVE.md NOT modified
      const after = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      assert.strictEqual(before, after);
    } finally { project.cleanup(); }
  });

  test('C5: GH changed, --apply, no conflict → writes OBJECTIVE.md', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'in_progress', labels: ['devflow:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 11, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    try {
      const syncState = { version: 1, objectives: { '21-bidirectional-gh-sync': { gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['devflow:objective'] } } };
      fs.writeFileSync(path.join(project.root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState), 'utf-8');

      const cassette = fx.loadCassette('objective-closed-on-gh');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync', '--apply'], false));
      assert.strictEqual(r.exitCode, null);
      const after = fs.readFileSync(path.join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'), 'utf-8');
      assert.match(after, /status: done/);
    } finally { project.cleanup(); }
  });

  test('C6: GH issue not found (404) → exits 1', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open' },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 99999, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    try {
      const cassette = fx.loadCassette('objective-not-found');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      assert.strictEqual(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /not found/i);
    } finally { project.cleanup(); }
  });

  test('C7: --raw flag emits JSON output', () => {
    const project = fx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open', labels: ['devflow:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 10, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    try {
      const syncState = { version: 1, objectives: { '21-bidirectional-gh-sync': { gh_updated_at: '2026-05-01T00:00:00Z', label_set: ['devflow:objective'] } } };
      fs.writeFileSync(path.join(project.root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState), 'utf-8');

      const cassette = fx.loadCassette('objective-open-no-drift');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      const r = captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], true));
      // --raw should produce JSON-parseable stdout
      const trimmed = r.stdout.trim();
      assert.ok(trimmed.startsWith('{'), `expected JSON, got: ${trimmed}`);
      const parsed = JSON.parse(trimmed);
      assert.strictEqual(parsed.ok, true);
    } finally { project.cleanup(); }
  });
});
