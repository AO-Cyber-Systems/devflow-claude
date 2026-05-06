'use strict';

// Hand-built fixture builders for sync-state tests (TRD 21-02).
// Per TDD playbook habit 4: factory functions, not LLM-generated test data.

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Build a single sync-state record (per-objective entry).
 */
function buildSyncStateRecord({
  issue_ref = 'AO-Cyber-Systems/devflow-claude#10',
  etag = 'W/"abc123"',
  gh_updated_at = '2026-05-01T00:00:00Z',
  label_set = ['devflow:objective'],
  assignees = [],
  milestone = null,
  status = 'open',
  last_synced_at = '2026-05-01T00:00:00Z',
  last_synced_disk_hash = 'sha256:def456',
} = {}) {
  return {
    issue_ref,
    etag,
    gh_updated_at,
    label_set,
    assignees,
    milestone,
    status,
    last_synced_at,
    last_synced_disk_hash,
  };
}

/**
 * Build a serialized .gh-sync-state.json file body (string).
 */
function buildSyncStateFile({ objectives = {} } = {}) {
  return JSON.stringify({ version: 1, objectives }, null, 2) + '\n';
}

/**
 * Build a temp project root with an optional pre-seeded .gh-sync-state.json.
 * Returns { root, cleanup }.
 *
 * - syncState === null  → no file created
 * - syncState === {...} → JSON.stringify(syncState) is written verbatim
 * - syncState === 'string' → string is written verbatim (use to inject malformed JSON)
 */
function buildTempProjectWithSyncState({ syncState = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-syncstate-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (syncState !== null) {
    const filePath = path.join(root, '.planning', '.gh-sync-state.json');
    if (typeof syncState === 'string') {
      fs.writeFileSync(filePath, syncState, 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(syncState, null, 2), 'utf-8');
    }
  }
  return {
    root,
    cleanup: () => {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    },
  };
}

/**
 * Build a temp project with .planning/objectives/<id>/OBJECTIVE.md present.
 * Mirrors gh-pull-fixtures.buildTempProject but adds optional sync state.
 */
function buildTempProjectWithObjective({
  objectiveId = '21-bidirectional-gh-sync',
  frontmatter = {},
  syncState = null,
  mapping = null,
  projectFm = null,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-syncstate-obj-'));
  const objDir = path.join(root, '.planning', 'objectives', objectiveId);
  fs.mkdirSync(objDir, { recursive: true });

  const fmLines = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (Array.isArray(v)) fmLines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
    else if (v === null) fmLines.push(`${k}: null`);
    else fmLines.push(`${k}: ${v}`);
  }
  fmLines.push('---', '', '# Test Objective', '');
  fs.writeFileSync(path.join(objDir, 'OBJECTIVE.md'), fmLines.join('\n'), 'utf-8');

  if (projectFm !== null) {
    const projLines = ['---'];
    for (const [k, v] of Object.entries(projectFm)) {
      projLines.push(`${k}: ${v}`);
    }
    projLines.push('---', '', '# Test Project', '');
    fs.writeFileSync(path.join(root, '.planning', 'PROJECT.md'), projLines.join('\n'), 'utf-8');
  }

  if (mapping !== null) {
    fs.writeFileSync(path.join(root, '.planning', '.gh-mapping.json'), JSON.stringify(mapping), 'utf-8');
  }

  if (syncState !== null) {
    fs.writeFileSync(path.join(root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState, null, 2), 'utf-8');
  }

  return {
    root,
    objectiveId,
    cleanup: () => {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    },
  };
}

module.exports = {
  buildSyncStateRecord,
  buildSyncStateFile,
  buildTempProjectWithSyncState,
  buildTempProjectWithObjective,
};
