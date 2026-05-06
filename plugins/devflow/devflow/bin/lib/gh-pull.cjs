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
const { readSyncState, recordSync, hashFrontmatter, getLastSync } = require('./sync-state.cjs');

// Local emitter — bypasses helpers.output() because that helper always exits 0
// and inverts raw semantics (raw=true→prose). cmdGhPull contract: raw=true→JSON,
// raw=false→prose, exit code per outcome.
function _emit(payload, prose, raw, exitCode) {
  if (raw) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    process.stdout.write(prose);
  }
  if (exitCode !== 0) process.exit(exitCode);
}

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

// ─── applyDrift ──────────────────────────────────────────────────────────────

/**
 * applyDrift({ projectRoot, objectiveId, drift, ghIssue, hasLastSync })
 *
 * Writes drifted fields into OBJECTIVE.md frontmatter. Refuses if conflict_suspected
 * or if there's no last_sync baseline and not a first-time sync.
 *
 * Returns { ok, applied?, error? }
 *
 * Frontmatter rewrite is line-based: locates `<field>: ...` lines and replaces
 * them in place. New fields (absent from disk) are appended. Other lines stay
 * untouched, preserving order/comments.
 */
function applyDrift({ projectRoot, objectiveId, drift, ghIssue, hasLastSync = true }) {
  if (drift.conflict_suspected) {
    return {
      ok: false,
      error: 'Conflict suspected — both sides changed. Re-run with --resolve=disk|gh|merge (see TRD 21-03).',
    };
  }
  if (!hasLastSync && !drift.first_sync) {
    return {
      ok: false,
      error: 'No prior sync state. Run `df-tools gh sync <objective>` first to establish baseline.',
    };
  }

  const objPath = path.join(projectRoot, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    return { ok: false, error: `OBJECTIVE.md not found: ${objPath}` };
  }

  const content = fs.readFileSync(objPath, 'utf-8');
  const ghNorm = normalizeGhIssue(ghIssue);

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return { ok: false, error: 'OBJECTIVE.md missing frontmatter block' };

  let yamlBlock = fmMatch[1];
  const applied = {};

  for (const field of Object.keys(drift.fields)) {
    const ghVal = ghNorm[field];
    const serialized = serializeYamlValue(ghVal);
    const lineRe = new RegExp(`^${field}:.*$`, 'm');
    if (lineRe.test(yamlBlock)) {
      yamlBlock = yamlBlock.replace(lineRe, `${field}: ${serialized}`);
    } else {
      yamlBlock = yamlBlock + `\n${field}: ${serialized}`;
    }
    applied[field] = ghVal;
  }

  const newContent = content.replace(fmMatch[0], `---\n${yamlBlock}\n---\n`);
  fs.writeFileSync(objPath, newContent, 'utf-8');
  return { ok: true, applied };
}

function serializeYamlValue(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
  if (typeof v === 'string') return v;
  return String(v);
}

// ─── cmdGhPull (CLI orchestrator) ────────────────────────────────────────────

/**
 * cmdGhPull(cwd, args, raw) — CLI entry point.
 * Usage: df-tools gh pull <objective> [--apply] [--raw]
 */
function cmdGhPull(cwd, args, raw) {
  const objectiveId = args.find((a) => !a.startsWith('--'));
  const apply = args.includes('--apply');

  if (!objectiveId) {
    process.stderr.write('Usage: df-tools gh pull <objective> [--apply]\n');
    process.exit(1);
    return;
  }

  // Reuse auth from lib/gh.cjs
  const { requireGhAuth, _setRunGh: ghSetRunGh } = require('./gh.cjs');
  // Bridge the test injection: when gh-pull's _runGh is mocked, route gh.cjs through it too
  const runGhBridge = _runGh;
  ghSetRunGh(runGhBridge);
  try {
    requireGhAuth(['repo']);
  } catch (e) {
    if (e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({
        error: e.message,
        remediation: e.remediation,
        scopes_missing: e.scopes_missing,
      }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    throw e;
  }

  // Read mapping (lib/gh.cjs reuses readMappingV2 in production; we use it here too)
  const { readMappingV2 } = require('./gh.cjs');
  const mapping = readMappingV2(cwd);
  const entry = mapping.objectives[objectiveId];
  if (!entry || !entry.issue_id) {
    const msg = `Objective ${objectiveId} has no GitHub issue. Run \`df-tools gh sync-objectives\` to create one before pulling.`;
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }

  // Resolve issue ref: <repo>#<issue_id>
  const projectFm = (() => {
    const p = path.join(cwd, '.planning', 'PROJECT.md');
    if (!fs.existsSync(p)) return {};
    return extractFrontmatter(fs.readFileSync(p, 'utf-8')) || {};
  })();
  if (!projectFm.github_repo) {
    const msg = 'PROJECT.md missing github_repo; cannot construct issue ref.';
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }
  const issueRef = `${projectFm.github_repo}#${entry.issue_id}`;

  const ghIssue = fetchGhIssue(issueRef);
  if (ghIssue === null) {
    const msg = `Issue ${issueRef} not found on GitHub`;
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }
  if (ghIssue && ghIssue._ok === false) {
    _emit({ ok: false, error: ghIssue.error }, ghIssue.error + '\n', raw, 1);
    return;
  }

  // Read disk frontmatter
  const objPath = path.join(cwd, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    const msg = `OBJECTIVE.md not found: ${objPath}`;
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }
  const disk_fm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};

  // Read last sync state via sync-state.cjs (TRD 21-02)
  const last_sync_state = getLastSync(cwd, objectiveId);

  const drift = detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });

  if (!drift.drift) {
    _emit(
      { ok: true, drift: false, message: 'No drift; planning state matches GitHub.' },
      'No drift; planning state matches GitHub.\n',
      raw,
      0
    );
    return;
  }

  if (apply) {
    if (drift.conflict_suspected) {
      const msg = 'Both sides changed. Re-run with --resolve=disk|gh|merge (TRD 21-03).';
      _emit(
        { ok: false, drift: true, conflict_suspected: true, fields: drift.fields, hint: msg },
        msg + '\n',
        raw,
        1
      );
      return;
    }
    const applyResult = applyDrift({
      projectRoot: cwd,
      objectiveId,
      drift,
      ghIssue,
      hasLastSync: last_sync_state != null,
    });
    if (!applyResult.ok) {
      _emit({ ok: false, error: applyResult.error }, applyResult.error + '\n', raw, 1);
      return;
    }

    // After successful disk write, record the new sync state (TRD 21-02 wiring).
    // Hash MUST be computed AFTER applyDrift so disk_fm reflects the post-write state.
    const ghNorm = normalizeGhIssue(ghIssue);
    const updatedDiskFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
    recordSync(cwd, objectiveId, {
      issue_ref: issueRef,
      etag: null,
      gh_updated_at: ghIssue.updatedAt,
      label_set: ghNorm.labels,
      assignees: ghNorm.assignees,
      milestone: ghNorm.milestone,
      status: ghNorm.status,
      last_synced_at: new Date().toISOString(),
      last_synced_disk_hash: hashFrontmatter(updatedDiskFm),
    });

    _emit(
      { ok: true, drift: true, applied: applyResult.applied },
      `Applied ${Object.keys(applyResult.applied).length} field changes to OBJECTIVE.md.\n`,
      raw,
      0
    );
    return;
  }

  // Report-only mode
  _emit(
    {
      ok: true,
      drift: true,
      fields: drift.fields,
      first_sync: drift.first_sync,
      hint: 'Re-run with --apply to write changes.',
    },
    formatDriftPretty(drift),
    raw,
    0
  );
}

function formatDriftPretty(drift) {
  const lines = [];
  if (drift.first_sync) lines.push('First-time pull (no prior sync state):');
  else lines.push('Drift detected:');
  for (const [field, vals] of Object.entries(drift.fields)) {
    lines.push(`  ${field}:`);
    lines.push(`    disk: ${JSON.stringify(vals.disk)}`);
    lines.push(`    gh:   ${JSON.stringify(vals.gh)}`);
  }
  lines.push('');
  lines.push('Re-run with --apply to write changes to OBJECTIVE.md.');
  return lines.join('\n');
}

module.exports = {
  fetchGhIssue,
  detectDrift,
  applyDrift,
  cmdGhPull,
  normalizeGhIssue,
  shallowEqual,
  _setRunGh,
  TRACKED_FIELDS,
};
