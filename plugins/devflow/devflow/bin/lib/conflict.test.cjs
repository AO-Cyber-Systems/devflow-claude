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
