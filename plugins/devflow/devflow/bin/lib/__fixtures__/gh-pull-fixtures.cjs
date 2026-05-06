'use strict';

// Hand-built fixture builders for gh-pull tests (TRD 21-01).
// Per TDD playbook habit 4: factory functions, not LLM-generated test data.
// Cassettes are committed JSON files captured from real `gh issue view` calls.

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Build a mock _runGh function. Same pattern as lib/__fixtures__/gh-fixtures.cjs.
 * Exact match first, then prefix match (longest wins).
 */
function buildMockRunGh(responses /* Map<string, response> */) {
  function mockRunGh(args) {
    const key = args.join(' ');
    if (responses.has(key)) return responses.get(key);
    let bestKey = null, bestLen = -1;
    for (const [k] of responses.entries()) {
      if (key.startsWith(k) && k.length > bestLen) { bestKey = k; bestLen = k.length; }
    }
    if (bestKey !== null) return responses.get(bestKey);
    return { ok: false, status: 1, stdout: '', stderr: `[mock] no match: ${key}` };
  }
  return mockRunGh;
}

/**
 * Load a cassette by name (name = filename without .json).
 * Cassette format: { args: [...], response: { ok, status, stdout, stderr } }
 */
function loadCassette(name) {
  const p = path.join(__dirname, 'gh-pull-cassettes', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/**
 * Build a fake disk frontmatter dict (use in detectDrift / applyDrift tests).
 */
function buildDiskFrontmatter({
  status = 'in_progress',
  labels = ['devflow:objective'],
  assignees = [],
  milestone = null,
  ...extra
} = {}) {
  return { status, labels, assignees, milestone, ...extra };
}

/**
 * Build a fake last-sync-state record (matches sync-state.cjs schema; TRD 21-02 owns full schema).
 */
function buildLastSyncState({
  etag = 'W/"abc"',
  gh_updated_at = '2026-05-01T00:00:00Z',
  label_set = ['devflow:objective'],
  last_synced_at = '2026-05-01T00:00:00Z',
  last_synced_disk_hash = 'sha256:def',
} = {}) {
  return { etag, gh_updated_at, label_set, last_synced_at, last_synced_disk_hash };
}

/**
 * Build a temp project root with .planning/objectives/<id>/OBJECTIVE.md present.
 * Returns { root, objectiveId, cleanup }.
 */
function buildTempProject({ objectiveId = '21-bidirectional-gh-sync', frontmatter = {}, mapping = null, projectFm = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-ghpull-'));
  const objDir = path.join(root, '.planning', 'objectives', objectiveId);
  fs.mkdirSync(objDir, { recursive: true });

  // Write OBJECTIVE.md
  const fmLines = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (Array.isArray(v)) fmLines.push(`${k}: [${v.map(x => JSON.stringify(x)).join(', ')}]`);
    else if (v === null) fmLines.push(`${k}: null`);
    else fmLines.push(`${k}: ${v}`);
  }
  fmLines.push('---', '', '# Test Objective', '');
  fs.writeFileSync(path.join(objDir, 'OBJECTIVE.md'), fmLines.join('\n'), 'utf-8');

  // Optionally write PROJECT.md
  if (projectFm !== null) {
    const projLines = ['---'];
    for (const [k, v] of Object.entries(projectFm)) {
      projLines.push(`${k}: ${v}`);
    }
    projLines.push('---', '', '# Test Project', '');
    fs.writeFileSync(path.join(root, '.planning', 'PROJECT.md'), projLines.join('\n'), 'utf-8');
  }

  // Optionally write .gh-mapping.json
  if (mapping !== null) {
    fs.writeFileSync(path.join(root, '.planning', '.gh-mapping.json'), JSON.stringify(mapping), 'utf-8');
  }

  return {
    root,
    objectiveId,
    cleanup: () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} },
  };
}

module.exports = {
  buildMockRunGh,
  loadCassette,
  buildDiskFrontmatter,
  buildLastSyncState,
  buildTempProject,
};
