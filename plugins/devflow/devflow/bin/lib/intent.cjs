'use strict';

// Intent resolution — maps (kind, work) plus override sources to a resolved
// configuration the planner uses to drive TDD posture, depth, model profile,
// and verification rigor.
//
// Precedence (highest wins):
//   1. TRD frontmatter explicit override
//   2. OBJECTIVE.md `overrides` block
//   3. CLAUDE.md user playbook directives (via claude-md.absorb)
//   4. (kind, work) defaults table
//   5. Built-in fallback

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const claudeMd = require('./claude-md.cjs');

const VALID_KINDS = ['api', 'app', 'library', 'ui-lib', 'cli', 'plugin'];
const VALID_WORKS = ['feature', 'port', 'refactor', 'foundation', 'bugfix', 'prototype', 'spike'];

const DEFAULTS_TABLE_PATH = path.join(__dirname, '../../references/defaults-table.md');

let _cachedTable = null;
function loadDefaultsTable(tablePath = DEFAULTS_TABLE_PATH) {
  if (_cachedTable && tablePath === DEFAULTS_TABLE_PATH) return _cachedTable;

  const content = fs.readFileSync(tablePath, 'utf-8');
  const match = content.match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) {
    throw new Error(`defaults-table.md missing yaml block (path: ${tablePath})`);
  }
  const yaml = match[1];
  const table = parseDefaultsYaml(yaml);
  if (tablePath === DEFAULTS_TABLE_PATH) _cachedTable = table;
  return table;
}

// Minimal YAML parser tuned for the defaults table's known structure.
// Format: defaults > <kind> > <work> > {tdd, depth, model_profile, verification}
function parseDefaultsYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let currentKind = null;
  let currentWork = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    if (raw === 'defaults:') continue;

    const indent = raw.match(/^(\s*)/)[1].length;
    const trimmed = raw.trim();

    if (indent === 2 && trimmed.endsWith(':')) {
      // Kind level
      currentKind = trimmed.slice(0, -1);
      result[currentKind] = result[currentKind] || {};
      currentWork = null;
    } else if (indent === 4 && trimmed.endsWith(':')) {
      // Work level
      if (!currentKind) {
        throw new Error(`defaults-table parse error: work key '${trimmed}' at line ${i + 1} has no parent kind`);
      }
      currentWork = trimmed.slice(0, -1);
      result[currentKind][currentWork] = {};
    } else if (indent === 6) {
      // Field level (tdd: "...", depth: ..., etc.)
      const m = trimmed.match(/^([a-z_]+):\s*(.+)$/);
      if (!m) {
        throw new Error(`defaults-table parse error: malformed field at line ${i + 1}: ${raw}`);
      }
      if (!currentKind || !currentWork) {
        throw new Error(`defaults-table parse error: field '${m[1]}' at line ${i + 1} outside kind/work scope`);
      }
      let value = m[2].trim();
      if ((value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[currentKind][currentWork][m[1]] = value;
    }
  }

  return result;
}

function readProjectMd(projectRoot) {
  const projectPath = path.join(projectRoot, '.planning', 'PROJECT.md');
  if (!fs.existsSync(projectPath)) {
    throw new Error(`No PROJECT.md found at ${projectPath}`);
  }
  const content = fs.readFileSync(projectPath, 'utf-8');
  return extractFrontmatter(content) || {};
}

function readObjectiveMd(projectRoot, objectiveId) {
  const objPath = path.join(projectRoot, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) return null;
  const content = fs.readFileSync(objPath, 'utf-8');
  return extractFrontmatter(content) || {};
}

function readTrdFrontmatter(trdPath) {
  if (!fs.existsSync(trdPath)) return null;
  const content = fs.readFileSync(trdPath, 'utf-8');
  return extractFrontmatter(content) || {};
}

function validateKind(kind) {
  if (!VALID_KINDS.includes(kind)) {
    throw new Error(`Invalid kind: '${kind}'. Valid values: ${VALID_KINDS.join(', ')}`);
  }
}

function validateWork(work) {
  if (!VALID_WORKS.includes(work)) {
    throw new Error(`Invalid work: '${work}'. Valid values: ${VALID_WORKS.join(', ')}`);
  }
}

// Main entry point. Returns a resolved configuration object plus
// metadata about which precedence level supplied each field.
//
// Options:
//   projectRoot — required. Project root containing .planning/ and optionally CLAUDE.md.
//   objectiveId — optional. If set, reads OBJECTIVE.md from objectives/<id>/.
//   trdPath — optional. If set, reads TRD frontmatter for explicit overrides.
//   userHome — optional. Override $HOME for CLAUDE.md absorption (test hook).
//   tablePath — optional. Override defaults-table.md path (test hook).
function resolve({ projectRoot, objectiveId, trdPath, userHome, tablePath } = {}) {
  if (!projectRoot) {
    throw new Error('resolve: projectRoot is required');
  }

  // Read sources in order
  const projectFm = readProjectMd(projectRoot);
  const objectiveFm = objectiveId ? readObjectiveMd(projectRoot, objectiveId) : null;
  const trdFm = trdPath ? readTrdFrontmatter(trdPath) : null;
  const directives = claudeMd.absorb({ userHome, projectRoot });
  const claudeOverrides = claudeMd.deriveOverrides(directives);
  const table = loadDefaultsTable(tablePath);

  // Resolve kind
  const warnings = [];
  let kind = projectFm.kind;
  if (!kind) {
    warnings.push("PROJECT.md missing 'kind' — defaulting to 'api'. Run /devflow:health --migrate to set it.");
    kind = 'api';
  }
  validateKind(kind);

  // Resolve work — precedence: trd > objective > project default > fallback
  let work, workSource;
  if (trdFm && trdFm.work) {
    work = trdFm.work;
    workSource = 'TRD';
  } else if (objectiveFm && objectiveFm.work) {
    work = objectiveFm.work;
    workSource = 'OBJECTIVE.md';
  } else if (projectFm.default_work) {
    work = projectFm.default_work;
    workSource = 'PROJECT.md default_work';
  } else {
    work = 'feature';
    workSource = 'fallback';
  }
  validateWork(work);

  // Look up base defaults from table
  if (!table[kind] || !table[kind][work]) {
    throw new Error(`No defaults entry for (${kind}, ${work}). Defaults table may be incomplete.`);
  }
  const tableDefaults = { ...table[kind][work] };

  // Build resolved config + provenance
  const sources = {};
  const config = {};
  for (const field of ['tdd', 'depth', 'model_profile', 'verification']) {
    config[field] = tableDefaults[field];
    sources[field] = `defaults table (${kind}, ${work})`;
  }

  // Apply CLAUDE.md absorption (level 3)
  if (claudeOverrides.tdd && config.tdd !== claudeOverrides.tdd) {
    config.tdd = claudeOverrides.tdd;
    sources.tdd = 'CLAUDE.md user playbook';
  }

  // Apply OBJECTIVE.md overrides (level 2)
  if (objectiveFm && objectiveFm.overrides) {
    for (const field of ['tdd', 'depth', 'model_profile']) {
      if (objectiveFm.overrides[field]) {
        config[field] = objectiveFm.overrides[field];
        sources[field] = 'OBJECTIVE.md overrides';
      }
    }
  }

  // Apply TRD frontmatter (level 1)
  if (trdFm) {
    if (trdFm.type === 'tdd') {
      config.tdd = config.tdd === 'skip' || config.tdd === 'none' ? 'strict' : config.tdd;
      sources.tdd = 'TRD frontmatter type:tdd';
    } else if (trdFm.type === 'standard') {
      config.tdd = 'standard';
      sources.tdd = 'TRD frontmatter type:standard';
    }
    if (trdFm.confidence) {
      config.confidence = trdFm.confidence;
      sources.confidence = 'TRD frontmatter';
    }
  }

  return {
    kind,
    work,
    workSource,
    workInherited: workSource !== 'OBJECTIVE.md' && workSource !== 'TRD',
    config,
    sources,
    directives: directives._sources || [],
    warnings,
  };
}

// Reset cache — for tests
function _resetCache() {
  _cachedTable = null;
}

module.exports = {
  resolve,
  loadDefaultsTable,
  parseDefaultsYaml,
  validateKind,
  validateWork,
  VALID_KINDS,
  VALID_WORKS,
  _resetCache,
};
