'use strict';

// 3-tier defaults-table loader (TRD 21-04).
//
// Walks (project → org → bundled) and merges cell-by-cell so override files
// only need to declare the cells they want to change. Lower tiers fill in
// the rest.
//
// Tiers in priority order (LOW → HIGH):
//   1. bundled  — plugins/devflow/devflow/references/defaults-table.md (always present)
//   2. org      — ~/.claude/devflow/defaults-table.md (optional)
//   3. project  — .planning/defaults-table.md (optional)
//
// Returned shape: { table, provenance }
//   table:      { kind: { work: { field: value } } }
//   provenance: { 'kind.work.field': 'project_table' | 'org_table' | 'bundled_table' }

const fs = require('fs');
const path = require('path');

// Reuse parseDefaultsYaml from intent.cjs (already exported)
const { parseDefaultsYaml } = require('./intent.cjs');

const BUNDLED_PATH = path.join(__dirname, '../../references/defaults-table.md');

function loadTable(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) {
    throw new Error(`defaults-table.md (${filePath}) is malformed: missing yaml block`);
  }
  return parseDefaultsYaml(match[1]);
}

/**
 * mergeDefaultsTables(tiers) — pure logic merge.
 * tiers: [{ table, name }] in priority order LOW → HIGH (bundled, org, project)
 * Returns { table, provenance }
 */
function mergeDefaultsTables(tiers) {
  const merged = {};
  const provenance = {};

  for (const tier of tiers) {
    if (!tier || !tier.table) continue;
    for (const [kind, works] of Object.entries(tier.table)) {
      merged[kind] = merged[kind] || {};
      for (const [work, fields] of Object.entries(works)) {
        merged[kind][work] = merged[kind][work] || {};
        for (const [field, value] of Object.entries(fields)) {
          merged[kind][work][field] = value;
          provenance[`${kind}.${work}.${field}`] = tier.name;
        }
      }
    }
  }

  return { table: merged, provenance };
}

let _cache = new Map();
function _resetCache() { _cache = new Map(); }

/**
 * loadMergedDefaultsTable({ projectRoot, userHome }) → { table, provenance }
 * Walks 3 tiers and merges. Cached by (projectRoot, userHome).
 */
function loadMergedDefaultsTable({ projectRoot = null, userHome = null } = {}) {
  const cacheKey = `${projectRoot || ''}|${userHome || ''}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const tiers = [];

  // Bundled — always present
  if (!fs.existsSync(BUNDLED_PATH)) {
    throw new Error(`Bundled defaults-table.md not found at ${BUNDLED_PATH}. Reinstall the devflow plugin.`);
  }
  tiers.push({ table: loadTable(BUNDLED_PATH), name: 'bundled_table' });

  // Org — optional
  if (userHome) {
    const orgPath = path.join(userHome, '.claude', 'devflow', 'defaults-table.md');
    if (fs.existsSync(orgPath)) {
      tiers.push({ table: loadTable(orgPath), name: 'org_table' });
    }
  }

  // Project — optional, highest priority
  if (projectRoot) {
    const projectPath = path.join(projectRoot, '.planning', 'defaults-table.md');
    if (fs.existsSync(projectPath)) {
      tiers.push({ table: loadTable(projectPath), name: 'project_table' });
    }
  }

  const result = mergeDefaultsTables(tiers);
  _cache.set(cacheKey, result);
  return result;
}

module.exports = {
  loadMergedDefaultsTable,
  mergeDefaultsTables,
  _resetCache,
  BUNDLED_PATH,
};
