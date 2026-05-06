'use strict';

// conflict.test.cjs — Test list (TRD 21-03)
//
// detectConflict (D group):
//   D1: all fields unchanged → { conflict: false, conflicting_fields: {}, non_conflicting_fields: [] }
//   D2: disk changed labels, GH unchanged → non-conflicting drift on labels
//   D3: GH changed status, disk unchanged → non-conflicting drift on status
//   D4: both changed status to SAME value → non-conflicting drift on status
//   D5: disk and GH both changed status to DIFFERENT values → conflict on status
//   D6: 2 conflicting fields (status + labels) + 1 disk-only field
//   D7: last_sync missing field (legacy record) → fallback to disk as baseline
//   D8: arrays compared by sorted-set semantics — labels [A,B] vs [B,A] → equal
//
// formatThreeWayDiff (F group):
//   F1: 1 conflict field → 3 indented lines (disk:/gh:/last:) under field header
//   F2: 0 conflict fields → header + resolution-options block, no field stanzas
//   F3: array values render as JSON arrays
//
// resolveDisk / resolveGh / resolveMerge (R group — Task 2):
//   R1: resolveDisk calls cmdGhSyncObjective; success → recordSync + clear pending_resolution
//   R2: resolveDisk gh push fails → { ok: false, error }; sync state untouched
//   R3: resolveGh calls applyDrift; success → recordSync + clear pending_resolution
//   R4: resolveGh applyDrift fails → { ok: false, error }; sync state untouched
//   R5: resolveMerge with unchanged disk hash → { ok: false, error: /unchanged/ }
//   R6: resolveMerge with edited disk → recordSync + clear pending_resolution
//
// cmdGhPull integration (W group — Task 3):
//   W1: conflict surfaced (no --resolve) → exits 1 with 3-way diff + records pending
//   W2: --resolve=disk on conflict → calls resolveDisk; exits 0 on success
//   W3: --resolve=gh on conflict → calls resolveGh; exits 0 on success
//   W4: --resolve=merge --resolved with unchanged disk → exits 1 with /unchanged/
//   W5: --resolve=merge --resolved with edited disk → exits 0; records merge

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const conflict = require('./conflict.cjs');
const fx = require('./__fixtures__/conflict-fixtures.cjs');

describe('detectConflict (D1-D8)', () => {
  test('D1: all fields unchanged → no conflict, no drift', () => {
    const s = fx.buildThreeWayScenario(); // defaults all match
    const r = conflict.detectConflict(s);
    assert.strictEqual(r.conflict, false);
    assert.deepStrictEqual(r.conflicting_fields, {});
    assert.deepStrictEqual(r.non_conflicting_fields, []);
  });

  test('D2: disk changed labels, GH unchanged → non-conflicting drift on labels', () => {
    const s = fx.buildThreeWayScenario({
      disk: { status: 'open', labels: ['devflow:objective', 'devflow:in-progress'], assignees: [], milestone: null },
    });
    const r = conflict.detectConflict(s);
    assert.strictEqual(r.conflict, false);
    assert.deepStrictEqual(r.non_conflicting_fields, ['labels']);
  });

  test('D3: GH changed status, disk unchanged → non-conflicting drift on status', () => {
    const s = fx.buildThreeWayScenario({
      gh: { status: 'done', labels: ['devflow:objective'], assignees: [], milestone: null },
    });
    const r = conflict.detectConflict(s);
    assert.strictEqual(r.conflict, false);
    assert.deepStrictEqual(r.non_conflicting_fields, ['status']);
  });

  test('D4: disk and GH both changed status to the SAME value → non-conflicting drift on status', () => {
    const s = fx.buildThreeWayScenario({
      disk: { status: 'done', labels: ['devflow:objective'], assignees: [], milestone: null },
      gh:   { status: 'done', labels: ['devflow:objective'], assignees: [], milestone: null },
    });
    const r = conflict.detectConflict(s);
    assert.strictEqual(r.conflict, false);
    assert.deepStrictEqual(r.non_conflicting_fields, ['status']);
  });

  test('D5: disk and GH both changed status to DIFFERENT values → conflict on status', () => {
    const s = fx.buildThreeWayScenario({
      disk: { status: 'done', labels: ['devflow:objective'], assignees: [], milestone: null },
      gh:   { status: 'in_progress', labels: ['devflow:objective'], assignees: [], milestone: null },
    });
    const r = conflict.detectConflict(s);
    assert.strictEqual(r.conflict, true);
    assert.deepStrictEqual(r.conflicting_fields, {
      status: { disk: 'done', gh: 'in_progress', last: 'open' },
    });
  });

  test('D6: 2 conflicting fields (status + labels) + 1 disk-only field', () => {
    const s = fx.buildThreeWayScenario({
      disk: { status: 'done', labels: ['devflow:objective', 'extra-label-disk'], assignees: ['mark'], milestone: null },
      gh:   { status: 'in_progress', labels: ['devflow:objective', 'extra-label-gh'], assignees: [], milestone: null },
    });
    const r = conflict.detectConflict(s);
    assert.strictEqual(r.conflict, true);
    assert.strictEqual(Object.keys(r.conflicting_fields).length, 2);
    assert.ok(r.conflicting_fields.status, 'status conflicting');
    assert.ok(r.conflicting_fields.labels, 'labels conflicting');
    // assignees changed only on disk → non-conflicting
    assert.deepStrictEqual(r.non_conflicting_fields, ['assignees']);
  });

  test('D7: last_sync missing field (legacy record) → field uses disk as baseline (no false conflict)', () => {
    const s = fx.buildThreeWayScenario({
      disk: { status: 'open', labels: ['devflow:objective'], assignees: ['mark'], milestone: null },
      gh:   { status: 'open', labels: ['devflow:objective'], assignees: ['mark', 'sam'], milestone: null },
      last: {
        issue_ref: 'TestOrg/TestRepo#1',
        gh_updated_at: '2026-05-01T00:00:00Z',
        status: 'open',
        label_set: ['devflow:objective'],
        // assignees omitted — legacy record
        milestone: null,
        last_synced_at: '2026-05-01T00:00:00Z',
        last_synced_disk_hash: 'sha256:initial',
      },
    });
    const r = conflict.detectConflict(s);
    // assignees: disk=['mark'], gh=['mark', 'sam'], last=undefined → fallback to disk
    // diskEqLast=true (disk vs disk-fallback), ghEqLast=false → case 3 (GH-only) → non-conflicting
    assert.strictEqual(r.conflict, false);
    assert.ok(r.non_conflicting_fields.includes('assignees'));
  });

  test('D8: arrays compared by sorted-set semantics — labels [A,B] vs [B,A] → equal', () => {
    const s = fx.buildThreeWayScenario({
      disk: { status: 'open', labels: ['devflow:in-progress', 'devflow:objective'], assignees: [], milestone: null },
      gh:   { status: 'open', labels: ['devflow:objective', 'devflow:in-progress'], assignees: [], milestone: null },
      last: {
        issue_ref: 'x', gh_updated_at: '2026-05-01T00:00:00Z',
        status: 'open',
        label_set: ['devflow:objective', 'devflow:in-progress'],
        assignees: [], milestone: null,
        last_synced_at: '2026-05-01T00:00:00Z', last_synced_disk_hash: 'sha256:x',
      },
    });
    const r = conflict.detectConflict(s);
    assert.strictEqual(r.conflict, false);
    assert.deepStrictEqual(r.non_conflicting_fields, []);
  });
});

describe('formatThreeWayDiff (F1-F3)', () => {
  test('F1: 1 conflict field → 3 indented lines (disk/gh/last) under field header', () => {
    const out = conflict.formatThreeWayDiff({
      objectiveId: '21-foo',
      issueRef: 'TestOrg/TestRepo#1',
      conflicting_fields: {
        status: { disk: 'done', gh: 'in_progress', last: 'open' },
      },
    });
    assert.match(out, /Conflict in objective 21-foo \(issue TestOrg\/TestRepo#1\)/);
    assert.match(out, /status:/);
    assert.match(out, /disk:\s+"done"/);
    assert.match(out, /gh:\s+"in_progress"/);
    assert.match(out, /last:\s+"open"/);
    assert.match(out, /--resolve=disk/);
    assert.match(out, /--resolve=gh/);
    assert.match(out, /--resolve=merge/);
  });

  test('F2: 0 conflict fields → header + resolution block, no field stanzas', () => {
    const out = conflict.formatThreeWayDiff({
      objectiveId: '21-foo',
      issueRef: 'TestOrg/TestRepo#1',
      conflicting_fields: {},
    });
    assert.match(out, /Conflict in objective/);
    // No field stanzas: don't see `disk:` outside resolution block hint
    // (the resolution block uses --resolve=disk so we look for the field-stanza pattern)
    assert.doesNotMatch(out, /^\s+disk:\s+/m);
  });

  test('F3: array values render as JSON arrays, not [object Object]', () => {
    const out = conflict.formatThreeWayDiff({
      objectiveId: '21-foo',
      issueRef: 'TestOrg/TestRepo#1',
      conflicting_fields: {
        labels: { disk: ['devflow:objective', 'extra'], gh: ['devflow:objective'], last: ['devflow:objective'] },
      },
    });
    assert.match(out, /\["devflow:objective","extra"\]/);
    assert.doesNotMatch(out, /\[object Object\]/);
  });
});

// ─── Resolvers (R group) ─────────────────────────────────────────────────────

const ss = require('./sync-state.cjs');
const ssFx = require('./__fixtures__/sync-state-fixtures.cjs');
const ghPullFx = require('./__fixtures__/gh-pull-fixtures.cjs');

describe('resolveDisk (R1-R2)', () => {
  // resolveDisk delegates to gh.cmdGhSyncObjective — testing that path requires a
  // full PROJECT/OBJECTIVE/mapping setup AND mocked _runGh for issue edit + project fields.
  // Strategy: monkey-patch gh.cmdGhSyncObjective to assert it was called with correct args
  // and to simulate success (R1) or failure (R2).
  test('R1: calls cmdGhSyncObjective; success → recordSync clears pending_resolution + records new disk hash', () => {
    const gh = require('./gh.cjs');
    const origFn = gh.cmdGhSyncObjective;
    let calls = [];
    gh.cmdGhSyncObjective = (cwd, objectiveId, raw) => {
      calls.push({ cwd, objectiveId, raw });
      // Simulate success: cmdGhSyncObjective normally calls helpers.output (no exit on success).
      // No-op here. Note: we don't try to call process.exit(0) because that's covered by output(),
      // but the real production code DOES exit(0) — resolveDisk handles that via __resolve_disk_exit__.
    };

    const project = ssFx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const fm = { status: 'open', labels: ['devflow:objective'], assignees: [], milestone: null };
      ss.recordSync(project.root, '21-test', {
        issue_ref: 'TestOrg/TestRepo#1',
        gh_updated_at: '2026-05-01T00:00:00Z',
        status: 'open',
        label_set: ['devflow:objective'],
        assignees: [],
        milestone: null,
        last_synced_at: '2026-05-01T00:00:00Z',
        last_synced_disk_hash: 'sha256:initial',
        pending_resolution: { disk_hash_at_conflict: 'sha256:abc', surfaced_at: '2026-05-01T01:00:00Z' },
      });

      const r = conflict.resolveDisk({
        cwd: project.root,
        objectiveId: '21-test',
        issueRef: 'TestOrg/TestRepo#1',
        ghIssue: { state: 'OPEN', labels: [], assignees: [], milestone: null, updatedAt: '2026-05-01T00:00:00Z' },
        currentDiskFm: fm,
      });

      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.action, 'pushed');
      assert.strictEqual(calls.length, 1, 'cmdGhSyncObjective called once');
      assert.strictEqual(calls[0].objectiveId, '21-test');

      const last = ss.getLastSync(project.root, '21-test');
      assert.strictEqual(last.pending_resolution, undefined, 'pending_resolution cleared');
      assert.strictEqual(last.last_synced_disk_hash, ss.hashFrontmatter(fm));
    } finally {
      gh.cmdGhSyncObjective = origFn;
      project.cleanup();
    }
  });

  test('R2: cmdGhSyncObjective fails (exit code 1) → { ok: false }; sync state untouched', () => {
    const gh = require('./gh.cjs');
    const origFn = gh.cmdGhSyncObjective;
    gh.cmdGhSyncObjective = (cwd, objectiveId, raw) => {
      process.exit(1);
    };

    const project = ssFx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const fm = { status: 'open', labels: ['devflow:objective'], assignees: [], milestone: null };
      ss.recordSync(project.root, '21-test', {
        issue_ref: 'TestOrg/TestRepo#1',
        gh_updated_at: '2026-05-01T00:00:00Z',
        status: 'open',
        label_set: ['devflow:objective'],
        assignees: [],
        milestone: null,
        last_synced_at: '2026-05-01T00:00:00Z',
        last_synced_disk_hash: 'sha256:initial',
        pending_resolution: { disk_hash_at_conflict: 'sha256:abc', surfaced_at: '2026-05-01T01:00:00Z' },
      });
      const filePath = path.join(project.root, '.planning', '.gh-sync-state.json');
      const beforeContent = fs.readFileSync(filePath, 'utf-8');

      const r = conflict.resolveDisk({
        cwd: project.root,
        objectiveId: '21-test',
        issueRef: 'TestOrg/TestRepo#1',
        ghIssue: { state: 'OPEN', labels: [], assignees: [], milestone: null, updatedAt: '2026-05-01T00:00:00Z' },
        currentDiskFm: fm,
      });

      assert.strictEqual(r.ok, false);
      assert.match(r.error, /exited with code 1/i);
      // Sync state untouched
      const afterContent = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(afterContent, beforeContent);
      const last = ss.getLastSync(project.root, '21-test');
      assert.ok(last.pending_resolution, 'pending_resolution preserved');
    } finally {
      gh.cmdGhSyncObjective = origFn;
      project.cleanup();
    }
  });
});

describe('resolveGh (R3-R4)', () => {
  test('R3: applies GH state to disk + records sync state, clears pending_resolution', () => {
    const project = ghPullFx.buildTempProject({
      objectiveId: '21-test',
      frontmatter: { status: 'in_progress', labels: ['devflow:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-test': { issue_id: 11, state_comment_id: null } } },
      projectFm: { github_repo: 'TestOrg/TestRepo' },
    });
    try {
      // Pre-seed sync state with pending_resolution
      ss.recordSync(project.root, '21-test', ssFx.buildSyncStateRecord({
        gh_updated_at: '2026-05-01T00:00:00Z',
        label_set: ['devflow:objective'],
        last_synced_disk_hash: 'sha256:initial',
        pending_resolution: { disk_hash_at_conflict: 'sha256:abc', surfaced_at: '2026-05-01T01:00:00Z' },
      }));

      const cassette = ghPullFx.loadCassette('objective-closed-on-gh');
      const ghIssue = JSON.parse(cassette.response.stdout);

      const r = conflict.resolveGh({
        cwd: project.root,
        objectiveId: '21-test',
        issueRef: 'TestOrg/TestRepo#11',
        ghIssue,
        currentDiskFm: { status: 'in_progress', labels: ['devflow:objective'], assignees: [], milestone: null },
      });

      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.action, 'pulled');
      // Sync state updated; pending_resolution cleared
      const last = ss.getLastSync(project.root, '21-test');
      assert.ok(last);
      assert.strictEqual(last.pending_resolution, undefined);
      assert.strictEqual(last.gh_updated_at, ghIssue.updatedAt);
      assert.strictEqual(last.status, ghIssue.state === 'CLOSED' ? 'done' : 'open');
    } finally {
      project.cleanup();
    }
  });

  test('R4: applyDrift fails (missing OBJECTIVE.md) → { ok: false, error }; sync state untouched', () => {
    const project = ghPullFx.buildTempProject({
      objectiveId: '21-test',
      frontmatter: { status: 'in_progress' },
      mapping: { milestone_id: 0, objectives: { '21-test': { issue_id: 11, state_comment_id: null } } },
      projectFm: { github_repo: 'TestOrg/TestRepo' },
    });
    try {
      // Pre-seed sync state with pending_resolution
      const before = ssFx.buildSyncStateRecord({
        last_synced_disk_hash: 'sha256:initial',
        pending_resolution: { disk_hash_at_conflict: 'sha256:abc', surfaced_at: '2026-05-01T01:00:00Z' },
      });
      ss.recordSync(project.root, '21-test', before);
      const filePath = path.join(project.root, '.planning', '.gh-sync-state.json');
      const beforeContent = fs.readFileSync(filePath, 'utf-8');

      // Delete the OBJECTIVE.md so applyDrift fails
      fs.unlinkSync(path.join(project.root, '.planning', 'objectives', '21-test', 'OBJECTIVE.md'));

      const cassette = ghPullFx.loadCassette('objective-closed-on-gh');
      const ghIssue = JSON.parse(cassette.response.stdout);

      const r = conflict.resolveGh({
        cwd: project.root,
        objectiveId: '21-test',
        issueRef: 'TestOrg/TestRepo#11',
        ghIssue,
        currentDiskFm: { status: 'in_progress', labels: ['devflow:objective'], assignees: [], milestone: null },
      });

      assert.strictEqual(r.ok, false);
      assert.match(r.error, /not found|OBJECTIVE/i);
      // Sync state file unchanged
      const afterContent = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(afterContent, beforeContent);
      const last = ss.getLastSync(project.root, '21-test');
      assert.ok(last.pending_resolution, 'pending_resolution NOT cleared on failure');
    } finally {
      project.cleanup();
    }
  });
});

describe('resolveMerge (R5-R6)', () => {
  test('R5: --resolved with unchanged disk hash → { ok: false, error: /unchanged/ }', () => {
    const project = ssFx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const fm = { status: 'open', labels: ['devflow:objective'], assignees: [], milestone: null };
      const conflictHash = ss.hashFrontmatter(fm);
      ss.recordSync(project.root, '21-test', {
        issue_ref: 'TestOrg/TestRepo#1',
        gh_updated_at: '2026-05-01T00:00:00Z',
        status: 'open',
        label_set: ['devflow:objective'],
        assignees: [],
        milestone: null,
        last_synced_at: '2026-05-01T00:00:00Z',
        last_synced_disk_hash: conflictHash,
        pending_resolution: { disk_hash_at_conflict: conflictHash, surfaced_at: '2026-05-01T01:00:00Z' },
      });

      // currentDiskFm matches conflict-time hash → user didn't edit
      const r = conflict.resolveMerge({
        cwd: project.root,
        objectiveId: '21-test',
        currentDiskFm: fm,
      });

      assert.strictEqual(r.ok, false);
      assert.match(r.error, /unchanged/i);
      // pending_resolution preserved
      const last = ss.getLastSync(project.root, '21-test');
      assert.ok(last.pending_resolution);
    } finally {
      project.cleanup();
    }
  });

  test('R6: --resolved with edited disk → records merge + clears pending_resolution', () => {
    const project = ssFx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const oldFm = { status: 'open', labels: ['devflow:objective'], assignees: [], milestone: null };
      const newFm = { status: 'done', labels: ['devflow:objective', 'devflow:done'], assignees: [], milestone: null };
      const conflictHash = ss.hashFrontmatter(oldFm);
      ss.recordSync(project.root, '21-test', {
        issue_ref: 'TestOrg/TestRepo#1',
        gh_updated_at: '2026-05-01T00:00:00Z',
        status: 'open',
        label_set: ['devflow:objective'],
        assignees: [],
        milestone: null,
        last_synced_at: '2026-05-01T00:00:00Z',
        last_synced_disk_hash: conflictHash,
        pending_resolution: { disk_hash_at_conflict: conflictHash, surfaced_at: '2026-05-01T01:00:00Z' },
      });

      const r = conflict.resolveMerge({
        cwd: project.root,
        objectiveId: '21-test',
        currentDiskFm: newFm,
      });

      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.action, 'merged');
      assert.match(r.message, /Run.*gh sync/);
      // pending_resolution cleared, new hash recorded
      const last = ss.getLastSync(project.root, '21-test');
      assert.strictEqual(last.pending_resolution, undefined);
      assert.strictEqual(last.last_synced_disk_hash, ss.hashFrontmatter(newFm));
      assert.strictEqual(last.status, 'done');
    } finally {
      project.cleanup();
    }
  });

  test('R5b: --resolved with no pending_resolution → returns helpful error', () => {
    const project = ssFx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const r = conflict.resolveMerge({
        cwd: project.root,
        objectiveId: '21-no-state',
        currentDiskFm: { status: 'open' },
      });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /No pending conflict resolution/i);
    } finally {
      project.cleanup();
    }
  });
});
