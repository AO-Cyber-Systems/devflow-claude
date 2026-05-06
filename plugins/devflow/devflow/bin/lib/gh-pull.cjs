'use strict';

// gh-pull.cjs (TRD 21-01) — `df-tools gh pull <objective>` inbound bidirectional sync.
//
// Reads GitHub issue state for a tracked objective, detects drift versus disk
// frontmatter, and (with --apply) writes changed fields back to OBJECTIVE.md.
//
// v1.2 scope: drift DETECTION only. Full conflict resolution lives in TRD 21-03.
//
// Tracked fields (sync-eligible):
//   state      → status   (OPEN→don't overwrite; CLOSED→done)
//   labels     → labels   (string[])
//   assignees  → assignees (login[])
//   milestone  → milestone (title|null)
//
// Authoritative-from-disk fields (NOT pulled): kind, work, parent_issue,
//   org_initiative, org_project, goal, requirements, success_criteria.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { output } = require('./helpers.cjs');

// ─── Test injection seam (mirrors lib/gh.cjs pattern) ────────────────────────

function _defaultRunGh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf-8', timeout: 30000 });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}
let _runGh = _defaultRunGh;
function _setRunGh(fn) { _runGh = (fn != null) ? fn : _defaultRunGh; }

// Tracked fields — v1.2 scope only
const TRACKED_FIELDS = ['status', 'labels', 'assignees', 'milestone'];

// ─── fetchGhIssue ────────────────────────────────────────────────────────────

/**
 * fetchGhIssue(issueRef) — returns parsed issue JSON or null if not found.
 * issueRef shape: 'owner/repo#NN'
 *
 * Returns:
 *   { state, labels: [{name,color}], assignees: [{login}], milestone: {title}|null, updatedAt }
 *   null                       — issue does not exist on GH
 *   { error, _ok: false }      — gh failed for other reason (rate limit, bad JSON, etc.)
 */
function fetchGhIssue(issueRef) {
  const m = issueRef && issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return null;
  const [, owner, repo, num] = m;

  const r = _runGh(['issue', 'view', String(num), '--repo', `${owner}/${repo}`, '--json', 'state,labels,assignees,milestone,updatedAt']);

  if (!r.ok) {
    if (/Could not resolve to an Issue/i.test(r.stderr)) return null;
    return { error: r.stderr || 'gh issue view failed', _ok: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (_) {
    return { error: 'invalid JSON from gh', _ok: false };
  }
  return parsed;
}

// ─── normalizeGhIssue ────────────────────────────────────────────────────────

/**
 * Normalize gh issue JSON to a flat dict matching disk frontmatter shape.
 * gh:   { state: "OPEN", labels: [{name,color}], assignees: [{login}], milestone: {title}|null, updatedAt }
 * disk: { status, labels: string[], assignees: string[], milestone: string|null, updatedAt }
 *
 * Mapping:
 *   state OPEN  → 'open'
 *   state CLOSED → 'done'
 *
 * (Mapping rationale: in_progress is NOT a GH-trackable signal — GH only knows OPEN/CLOSED.
 *  When GH says OPEN, callers can decide whether to keep disk's 'in_progress' or downgrade
 *  to 'open'. detectDrift compares normalized values, so a disk 'in_progress' vs GH 'open'
 *  WILL drift. Callers handle this via the apply layer.)
 */
function normalizeGhIssue(ghIssue) {
  return {
    status: ghIssue.state === 'CLOSED' ? 'done' : 'open',
    labels: (ghIssue.labels || []).map((l) => l.name),
    assignees: (ghIssue.assignees || []).map((a) => a.login),
    milestone: ghIssue.milestone ? ghIssue.milestone.title : null,
    updatedAt: ghIssue.updatedAt,
  };
}

// ─── detectDrift ─────────────────────────────────────────────────────────────

/**
 * Pure-logic drift detection. No IO.
 *
 * Inputs:
 *   disk_fm         — disk frontmatter dict { status, labels, assignees, milestone, ... }
 *   gh_state        — gh issue JSON (raw, before normalization)
 *   last_sync_state — null OR { etag, gh_updated_at, label_set, last_synced_at, last_synced_disk_hash }
 *
 * Returns:
 *   { drift: bool, fields: { field: { disk, gh } }, first_sync: bool, conflict_suspected: bool }
 *
 * Logic:
 *   - last_sync_state is null → first-time pull, treat as drift (any GH state is "new")
 *   - GH updatedAt unchanged from last_sync.gh_updated_at → no drift
 *   - GH changed → diff each tracked field; report fields that differ between disk and GH
 *
 * conflict_suspected stays FALSE in 21-01. TRD 21-03 implements 3-way diff for full conflict logic.
 */
function detectDrift({ disk_fm, gh_state, last_sync_state }) {
  const ghNorm = normalizeGhIssue(gh_state);

  // First-time pull: no baseline
  if (!last_sync_state) {
    const fields = {};
    for (const f of TRACKED_FIELDS) {
      const diskVal = disk_fm[f];
      const ghVal = ghNorm[f];
      if (!shallowEqual(diskVal, ghVal)) {
        fields[f] = { disk: diskVal, gh: ghVal };
      }
    }
    return { drift: true, first_sync: true, fields, conflict_suspected: false };
  }

  // GH unchanged → no drift
  if (gh_state.updatedAt === last_sync_state.gh_updated_at) {
    return { drift: false, first_sync: false, fields: {}, conflict_suspected: false };
  }

  // GH changed; diff each field
  const fields = {};
  for (const f of TRACKED_FIELDS) {
    const diskVal = disk_fm[f];
    const ghVal = ghNorm[f];
    if (!shallowEqual(diskVal, ghVal)) {
      fields[f] = { disk: diskVal, gh: ghVal };
    }
  }

  return {
    drift: Object.keys(fields).length > 0,
    first_sync: false,
    fields,
    conflict_suspected: false, // TRD 21-03 layers full conflict logic
  };
}

/**
 * Shallow equality for primitives + arrays-of-primitives. Null-safe.
 */
function shallowEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((x, i) => x === sb[i]);
  }
  return false;
}

module.exports = {
  fetchGhIssue,
  detectDrift,
  normalizeGhIssue,
  shallowEqual,
  _setRunGh,
  TRACKED_FIELDS,
};
