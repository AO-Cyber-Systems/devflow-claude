'use strict';

// conflict.cjs (TRD 21-03) — 3-way conflict detection + resolvers for bidirectional GH sync.
//
// detectConflict: pure logic — given disk_fm, gh_norm, last_sync, returns per-field
//   classification into 5 cases:
//     case 1: unchanged everywhere → SKIP
//     case 2: disk changed only      → non-conflicting drift
//     case 3: GH changed only        → non-conflicting drift
//     case 4: both changed to SAME   → non-conflicting drift
//     case 5: both changed DIFFERENT → CONFLICT
//
// formatThreeWayDiff: renders { objectiveId, issueRef, conflicting_fields } as a
//   human-readable stanza with resolution-options footer.
//
// resolveDisk/resolveGh/resolveMerge: orchestrators that delegate to existing push
//   (lib/gh.cjs cmdGhSyncObjective) and pull-apply (lib/gh-pull.cjs applyDrift)
//   primitives, then update sync state.

const fs = require('fs');
const path = require('path');

const { recordSync, hashFrontmatter, getLastSync } = require('./sync-state.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// Tracked fields (must match lib/gh-pull.cjs TRACKED_FIELDS)
const TRACKED_FIELDS = ['status', 'labels', 'assignees', 'milestone'];

// Map disk-fm field name → last_sync record field name
const LAST_SYNC_FIELD_MAP = {
  status: 'status',
  labels: 'label_set',
  assignees: 'assignees',
  milestone: 'milestone',
};

// ─── detectConflict ───────────────────────────────────────────────────────────

/**
 * Pure 3-way diff. No IO.
 *
 * Inputs:
 *   disk_fm   — disk frontmatter dict
 *   gh_norm   — normalized GH issue dict (from gh-pull.normalizeGhIssue)
 *   last_sync — sync-state record (per-objective) or null
 *
 * Output:
 *   { conflict, conflicting_fields, non_conflicting_fields }
 *
 * conflicting_fields[field] = { disk, gh, last } for each case-5 field.
 * non_conflicting_fields = list of case-2/3/4 field names (still drifted but resolvable unilaterally).
 */
function detectConflict({ disk_fm, gh_norm, last_sync }) {
  if (!last_sync) {
    // No baseline → can't detect conflict (TRD 21-01's first_sync path handles this)
    return { conflict: false, conflicting_fields: {}, non_conflicting_fields: [] };
  }

  const conflicting_fields = {};
  const non_conflicting_fields = [];

  for (const field of TRACKED_FIELDS) {
    const diskVal = disk_fm[field];
    const ghVal = gh_norm[field];
    const lastKey = LAST_SYNC_FIELD_MAP[field];
    // D7 legacy fallback: undefined last → use disk as baseline (avoids false-positive conflicts)
    const lastVal = (last_sync[lastKey] !== undefined) ? last_sync[lastKey] : disk_fm[field];

    const diskEqLast = setsEqual(diskVal, lastVal);
    const ghEqLast = setsEqual(ghVal, lastVal);
    const diskEqGh = setsEqual(diskVal, ghVal);

    if (diskEqLast && ghEqLast) continue;            // case 1: unchanged everywhere
    if (diskEqLast && !ghEqLast) {                   // case 3: GH only
      non_conflicting_fields.push(field);
      continue;
    }
    if (!diskEqLast && ghEqLast) {                   // case 2: disk only
      non_conflicting_fields.push(field);
      continue;
    }
    if (!diskEqLast && !ghEqLast && diskEqGh) {      // case 4: same change
      non_conflicting_fields.push(field);
      continue;
    }
    // case 5: real conflict (both sides differ from last AND from each other)
    conflicting_fields[field] = { disk: diskVal, gh: ghVal, last: lastVal };
  }

  return {
    conflict: Object.keys(conflicting_fields).length > 0,
    conflicting_fields,
    non_conflicting_fields,
  };
}

/**
 * Set-equality for arrays (order-independent), strict-equal for scalars, null-safe.
 * Mirrors lib/gh-pull.cjs shallowEqual but renamed for clarity.
 */
function setsEqual(a, b) {
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

// ─── formatThreeWayDiff ───────────────────────────────────────────────────────

/**
 * Render conflicting_fields as a human-readable 3-way diff with resolution options.
 *
 * Stanza format scales to any field count + any terminal width.
 */
function formatThreeWayDiff({ objectiveId, issueRef, conflicting_fields }) {
  const lines = [];
  lines.push(`Conflict in objective ${objectiveId} (issue ${issueRef}):`);
  lines.push('');

  for (const [field, vals] of Object.entries(conflicting_fields)) {
    lines.push(`  ${field}:`);
    lines.push(`    disk:  ${JSON.stringify(vals.disk)}`);
    lines.push(`    gh:    ${JSON.stringify(vals.gh)}`);
    lines.push(`    last:  ${JSON.stringify(vals.last)}`);
    lines.push('');
  }

  lines.push('Resolution:');
  lines.push('  --resolve=disk    Push disk values to GH (overwrites GH state)');
  lines.push('  --resolve=gh      Apply GH values to disk (overwrites disk state)');
  lines.push('  --resolve=merge   Manually edit OBJECTIVE.md, then re-run with --resolve=merge --resolved');

  return lines.join('\n');
}

// ─── resolveDisk ──────────────────────────────────────────────────────────────

/**
 * resolveDisk — user chose to keep disk values; push them to GH via existing push path.
 *
 * Calls cmdGhSyncObjective (singular) from lib/gh.cjs which writes to GH and
 * already updates the mapping. Then we update sync state to clear pending_resolution
 * and record the new authoritative state.
 *
 * Returns: { ok, action, error? }
 */
function resolveDisk({ cwd, objectiveId, issueRef, ghIssue, currentDiskFm }) {
  // Live require lookup (NOT destructure) so test monkey-patching of gh.cmdGhSyncObjective
  // takes effect.
  const gh = require('./gh.cjs');
  try {
    // cmdGhSyncObjective uses helpers.output() which calls process.exit; capture it.
    const origExit = process.exit;
    const origStdout = process.stdout.write.bind(process.stdout);
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error('__resolve_disk_exit__'); };
    process.stdout.write = () => true;
    try {
      try { gh.cmdGhSyncObjective(cwd, objectiveId, true); }
      catch (e) { if (e.message !== '__resolve_disk_exit__') throw e; }
    } finally {
      process.exit = origExit;
      process.stdout.write = origStdout;
    }
    if (exitCode !== null && exitCode !== 0) {
      return { ok: false, error: `cmdGhSyncObjective exited with code ${exitCode}` };
    }

    // Clear pending_resolution from sync state — the push succeeded so disk is
    // now authoritative on GH. cmdGhSyncObjective itself does NOT call recordSync
    // (it pre-dates TRD 21-02); we record it here.
    const last = getLastSync(cwd, objectiveId) || {};
    const cleared = { ...last };
    delete cleared.pending_resolution;
    cleared.last_synced_at = new Date().toISOString();
    cleared.last_synced_disk_hash = hashFrontmatter(currentDiskFm);
    // Update field snapshots to reflect the just-pushed state
    cleared.status = currentDiskFm.status;
    cleared.label_set = currentDiskFm.labels || [];
    cleared.assignees = currentDiskFm.assignees || [];
    cleared.milestone = currentDiskFm.milestone || null;
    cleared.issue_ref = issueRef;
    recordSync(cwd, objectiveId, cleared);

    return { ok: true, action: 'pushed' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── resolveGh ────────────────────────────────────────────────────────────────

/**
 * resolveGh — user chose to accept GH values; overwrite disk via applyDrift.
 *
 * Returns: { ok, action, applied?, error? }
 */
function resolveGh({ cwd, objectiveId, issueRef, ghIssue, currentDiskFm }) {
  const ghPull = require('./gh-pull.cjs');

  const ghNorm = ghPull.normalizeGhIssue(ghIssue);

  // Build synthetic drift covering every tracked field where disk differs from GH.
  // Force conflict_suspected=false since user has explicitly chosen GH side.
  const fields = {};
  for (const f of TRACKED_FIELDS) {
    const diskVal = currentDiskFm[f];
    const ghVal = ghNorm[f];
    if (!setsEqual(diskVal, ghVal)) {
      fields[f] = { disk: diskVal, gh: ghVal };
    }
  }
  const drift = { drift: true, fields, first_sync: false, conflict_suspected: false };

  const r = ghPull.applyDrift({
    projectRoot: cwd,
    objectiveId,
    drift,
    ghIssue,
    hasLastSync: true,
  });
  if (!r.ok) return { ok: false, error: r.error };

  // applyDrift wrote disk; now record the new sync state and clear pending_resolution.
  const objPath = path.join(cwd, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  const updatedDiskFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
  const last = getLastSync(cwd, objectiveId) || {};
  const cleared = { ...last };
  delete cleared.pending_resolution;
  cleared.issue_ref = issueRef;
  cleared.gh_updated_at = ghIssue.updatedAt;
  cleared.label_set = ghNorm.labels;
  cleared.assignees = ghNorm.assignees;
  cleared.milestone = ghNorm.milestone;
  cleared.status = ghNorm.status;
  cleared.last_synced_at = new Date().toISOString();
  cleared.last_synced_disk_hash = hashFrontmatter(updatedDiskFm);
  recordSync(cwd, objectiveId, cleared);

  return { ok: true, action: 'pulled', applied: r.applied };
}

// ─── resolveMerge ─────────────────────────────────────────────────────────────

/**
 * resolveMerge — user manually edited OBJECTIVE.md; verify hash changed and record.
 *
 * Inputs:
 *   cwd, objectiveId, currentDiskFm (post-edit frontmatter)
 *
 * Compares current disk hash vs pending_resolution.disk_hash_at_conflict (recorded
 * when conflict was first surfaced). If unchanged → user didn't edit yet → exit 1.
 * If changed → record the merge as authoritative; user runs `df-tools gh sync` to push.
 */
function resolveMerge({ cwd, objectiveId, currentDiskFm }) {
  const last = getLastSync(cwd, objectiveId);
  if (!last || !last.pending_resolution) {
    return {
      ok: false,
      error: 'No pending conflict resolution. Run `df-tools gh pull <objective>` first to surface conflicts.',
    };
  }

  const conflictTimeHash = last.pending_resolution.disk_hash_at_conflict;
  const currentHash = hashFrontmatter(currentDiskFm);

  if (currentHash === conflictTimeHash) {
    return {
      ok: false,
      error: 'OBJECTIVE.md unchanged since conflict was surfaced. Edit it, then re-run with --resolve=merge --resolved.',
    };
  }

  // User edited — record their merge as the new authoritative disk state.
  // Note: We do NOT auto-push to GH from here. User runs `df-tools gh sync <obj>` afterward.
  const cleared = { ...last };
  delete cleared.pending_resolution;
  cleared.last_synced_disk_hash = currentHash;
  cleared.last_synced_at = new Date().toISOString();
  cleared.status = currentDiskFm.status;
  cleared.label_set = currentDiskFm.labels || cleared.label_set;
  cleared.assignees = currentDiskFm.assignees || cleared.assignees;
  cleared.milestone = currentDiskFm.milestone !== undefined ? currentDiskFm.milestone : cleared.milestone;
  recordSync(cwd, objectiveId, cleared);

  return {
    ok: true,
    action: 'merged',
    message: 'Manual merge recorded. Run `df-tools gh sync <objective>` to push merged state to GitHub.',
  };
}

module.exports = {
  detectConflict,
  formatThreeWayDiff,
  resolveDisk,
  resolveGh,
  resolveMerge,
  TRACKED_FIELDS,
  // Internal exposed for tests
  setsEqual,
};
