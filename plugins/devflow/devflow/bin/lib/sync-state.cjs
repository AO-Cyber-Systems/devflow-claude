'use strict';

// sync-state.cjs (TRD 21-02) — typed `.planning/.gh-sync-state.json` persistence.
//
// Single source of truth for "what was on GH the last time we successfully synced
// each objective." Used by:
//   - lib/gh-pull.cjs detectDrift  — compares GH-now vs gh_updated_at to detect drift
//   - lib/conflict.cjs detectConflict (TRD 21-03) — 3-way diff of disk vs GH vs last_sync
//   - lib/gh.cjs cmdGhSyncObjectives (push) — records sync state after successful push
//
// Schema v1 — locked. Future migrations branch on parsed.version.
//
// {
//   "version": 1,
//   "objectives": {
//     "<objectiveId>": {
//       "issue_ref":             "owner/repo#NN",
//       "etag":                  "W/\"...\"" | null,
//       "gh_updated_at":         "ISO8601",
//       "label_set":             ["devflow:objective", ...],
//       "assignees":             ["login", ...],
//       "milestone":             "v1.0" | null,
//       "status":                "open" | "done",
//       "last_synced_at":        "ISO8601",
//       "last_synced_disk_hash": "sha256:..."
//     }
//   }
// }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── readSyncState ────────────────────────────────────────────────────────────

/**
 * Read .planning/.gh-sync-state.json from `cwd`.
 * Always returns shape { version: 1, objectives: {...} }.
 *
 * - Missing file        → empty default
 * - Malformed JSON      → empty default + warning to stderr
 * - Unknown schema ver  → empty default (defensive; no spurious migrations)
 */
function readSyncState(cwd) {
  const p = path.join(cwd, '.planning', '.gh-sync-state.json');
  if (!fs.existsSync(p)) return { version: 1, objectives: {} };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (_) {
    process.stderr.write('Warning: .gh-sync-state.json malformed; treating as empty.\n');
    return { version: 1, objectives: {} };
  }

  if (!parsed.version || parsed.version === 1) {
    return { version: 1, objectives: parsed.objectives || {} };
  }

  // Unknown version — defensive
  return { version: 1, objectives: {} };
}

// ─── writeSyncState ───────────────────────────────────────────────────────────

/**
 * Write `state` (any shape with `.objectives`) to .planning/.gh-sync-state.json.
 * ALWAYS emits version: 1 in the on-disk file regardless of caller-passed value.
 * Atomic via tmp + rename to avoid half-written files on process kill.
 */
function writeSyncState(cwd, state) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });

  const filePath = path.join(planningDir, '.gh-sync-state.json');
  const payload = { version: 1, objectives: (state && state.objectives) || {} };
  const content = JSON.stringify(payload, null, 2) + '\n';
  atomicWrite(filePath, content);
}

// ─── atomicWrite ──────────────────────────────────────────────────────────────

/**
 * Atomic write: write to a same-directory tmp file, then rename. POSIX rename
 * is atomic on the same filesystem (and on macOS APFS). If process is killed
 * mid-write, the target file remains the previous good content.
 */
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
  );
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);
}

// ─── hashFrontmatter ──────────────────────────────────────────────────────────

/**
 * Deterministic hash of disk frontmatter for change detection.
 *
 * Process:
 *   1. Strip _-prefix keys (internal-use markers).
 *   2. Recursively canonicalize: sort object keys; arrays preserve order.
 *   3. JSON.stringify the canonical form.
 *   4. sha256 hash; return as 'sha256:<hex>'.
 *
 * Same input → same output across process invocations and JS engines.
 *
 * Throws on null/non-object input — masking that with a known-empty hash hides bugs.
 */
function hashFrontmatter(fm) {
  if (fm == null || typeof fm !== 'object' || Array.isArray(fm)) {
    throw new Error('hashFrontmatter: input must be an object');
  }

  // Step 1: filter internal _-keys
  const filtered = {};
  for (const [k, v] of Object.entries(fm)) {
    if (k.startsWith('_')) continue;
    filtered[k] = v;
  }

  // Step 2: recursively canonicalize — sorted keys for objects, preserved order for arrays
  function canonical(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(canonical);
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
      return out;
    }
    return v;
  }

  let canonStr;
  try {
    canonStr = JSON.stringify(canonical(filtered));
  } catch (e) {
    throw new Error(`hashFrontmatter: cannot serialize input — ${e.message}`);
  }

  return 'sha256:' + crypto.createHash('sha256').update(canonStr).digest('hex');
}

// ─── recordSync ───────────────────────────────────────────────────────────────

/**
 * Upsert an objective entry into sync state and persist to disk.
 *
 * Deep-clones the input record before storing so callers retain the original
 * object reference unmutated. Non-target objectives in the file are preserved.
 *
 * Returns the updated state object.
 */
function recordSync(cwd, objectiveId, record) {
  const current = readSyncState(cwd);
  // Deep clone via JSON round-trip — input record + state are decoupled from disk
  const clonedRecord = JSON.parse(JSON.stringify(record));
  const next = {
    version: 1,
    objectives: { ...current.objectives, [objectiveId]: clonedRecord },
  };
  writeSyncState(cwd, next);
  return next;
}

// ─── getLastSync ──────────────────────────────────────────────────────────────

/**
 * Convenience reader for a single objective's last-sync record.
 * Returns the record (copied via readSyncState's parse) or null if absent.
 */
function getLastSync(cwd, objectiveId) {
  const state = readSyncState(cwd);
  return state.objectives[objectiveId] || null;
}

module.exports = {
  readSyncState,
  writeSyncState,
  recordSync,
  hashFrontmatter,
  getLastSync,
  // Internal helpers exposed for unit tests
  atomicWrite,
};
