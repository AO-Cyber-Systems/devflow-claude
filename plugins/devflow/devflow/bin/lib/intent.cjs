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

// Module-scoped resolve context. Set by resolve() before calling loadDefaultsTable
// so the 3-tier loader (TRD 21-04) can see projectRoot + userHome without changing
// the loadDefaultsTable signature (callers like loadConstraints stay back-compat).
let _currentResolveCtx = { projectRoot: null, userHome: null };

let _cachedTable = null;
function loadDefaultsTable(tablePath = DEFAULTS_TABLE_PATH) {
  // Test-only path: explicit single-file tablePath (not the bundled default).
  // Preserves back-compat with existing intent.test.cjs that passes a fixture path.
  if (tablePath !== null && tablePath !== undefined && tablePath !== DEFAULTS_TABLE_PATH) {
    const content = fs.readFileSync(tablePath, 'utf-8');
    const match = content.match(/```yaml\n([\s\S]*?)\n```/);
    if (!match) {
      throw new Error(`defaults-table.md missing yaml block (path: ${tablePath})`);
    }
    return parseDefaultsYaml(match[1]);
  }

  // Production path: 3-tier resolution via defaults-loader.cjs (TRD 21-04).
  // Cache here is bypassed in favor of defaults-loader's per-(projectRoot, userHome)
  // cache; intent._resetCache() cascades to defaultsLoader._resetCache().
  if (_cachedTable && _currentResolveCtx.projectRoot === null && _currentResolveCtx.userHome === null) {
    return _cachedTable;
  }

  const defaultsLoader = require('./defaults-loader.cjs');
  const merged = defaultsLoader.loadMergedDefaultsTable({
    projectRoot: _currentResolveCtx.projectRoot,
    userHome: _currentResolveCtx.userHome,
  });
  if (_currentResolveCtx.projectRoot === null && _currentResolveCtx.userHome === null) {
    _cachedTable = merged.table;
  }
  return merged.table;
}

// Minimal YAML parser tuned for the defaults table's known structure.
// Format: defaults > <kind> > <work> > {tdd, depth, model_profile, verification, ...}
// Also handles a top-level `constraints:` list block after the `defaults:` block.
function parseDefaultsYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let currentKind = null;
  let currentWork = null;
  let inDefaults = true;  // stop parsing kind/work when we leave the defaults block

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    if (raw === 'defaults:') { inDefaults = true; continue; }

    // Top-level keys (zero-indent, ending in colon) that are NOT 'defaults:' end the defaults block
    if (/^\S+:/.test(raw) && !raw.startsWith(' ')) {
      inDefaults = false;
      continue;
    }

    if (!inDefaults) continue;

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
      // Coerce boolean fields: outside_in uses bare true/false in YAML
      if (m[1] === 'outside_in') {
        value = (value === 'true' || value === true);
      }
      result[currentKind][currentWork][m[1]] = value;
    }
  }

  return result;
}

// Parse the constraints: block from the defaults table YAML.
// Returns an array of { id, description, opt_out_field } objects.
// Returns [] if no constraints block is present (legacy table format).
// Does NOT cache — each call re-reads to avoid shared-reference mutations.
function loadConstraints(tablePath = DEFAULTS_TABLE_PATH) {
  const content = fs.readFileSync(tablePath, 'utf-8');
  const match = content.match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) return [];

  const yaml = match[1];
  const lines = yaml.split('\n');
  const constraints = [];

  let inConstraints = false;
  let currentEntry = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;

    // Detect `constraints:` top-level key
    if (raw === 'constraints:') {
      inConstraints = true;
      continue;
    }

    // If we hit another top-level key, stop
    if (/^\S+:/.test(raw) && !raw.startsWith(' ')) {
      if (inConstraints) break;
      continue;
    }

    if (!inConstraints) continue;

    const trimmed = raw.trim();

    // Each constraint entry starts with `- id: ...`
    if (trimmed.startsWith('- id:')) {
      if (currentEntry) constraints.push(currentEntry);
      currentEntry = { id: trimmed.replace(/^- id:\s*/, ''), description: '', opt_out_field: '' };
    } else if (currentEntry && trimmed.startsWith('description:')) {
      let desc = trimmed.replace(/^description:\s*/, '');
      if ((desc.startsWith('"') && desc.endsWith('"'))
          || (desc.startsWith("'") && desc.endsWith("'"))) {
        desc = desc.slice(1, -1);
      }
      currentEntry.description = desc;
    } else if (currentEntry && trimmed.startsWith('opt_out_field:')) {
      let field = trimmed.replace(/^opt_out_field:\s*/, '');
      if ((field.startsWith('"') && field.endsWith('"'))
          || (field.startsWith("'") && field.endsWith("'"))) {
        field = field.slice(1, -1);
      }
      currentEntry.opt_out_field = field;
    }
  }

  if (currentEntry) constraints.push(currentEntry);

  return constraints;
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

  // Set ctx for 3-tier loader (consumed inside loadDefaultsTable when tablePath
  // is not an explicit single-file override). Reset after use to avoid stale state.
  _currentResolveCtx = { projectRoot, userHome: userHome || null };

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

  // Build resolved config + provenance.
  const sources = {};
  const config = {};

  // Level 4: Seed from table defaults — all fields with provenance
  const ALL_FIELDS = ['tdd', 'depth', 'model_profile', 'verification',
    'security_isolation', 'back_compat', 'tdd_default', 'test_list_first',
    'fixture_strategy', 'outside_in'];
  for (const field of ALL_FIELDS) {
    if (tableDefaults[field] !== undefined) {
      config[field] = tableDefaults[field];
      sources[field] = `defaults table (${kind}, ${work})`;
    }
  }

  // Load constraints (fresh each call — no caching per anti-pattern)
  let constraints = loadConstraints(tablePath || DEFAULTS_TABLE_PATH);

  // Level 3: Apply CLAUDE.md absorption promotions
  //   Promotion tables (one-step only, per CONTEXT.md §3):
  const tddDefaultPromotion = { skip: 'auto', auto: 'strict', strict: 'strict' };
  const testListPromotion   = { optional: 'required', required: 'required' };
  const fixturePromotion    = { inline: 'generators', cassettes: 'cassettes', generators: 'generators', 'n/a': 'n/a' };

  if (claudeOverrides._playbookDetected) {
    // tdd (existing field) — unchanged logic
    if (claudeOverrides.tdd && config.tdd !== claudeOverrides.tdd) {
      config.tdd = claudeOverrides.tdd;
      sources.tdd = 'CLAUDE.md user playbook';
    }

    // tdd_default — one-step promotion
    if (config.tdd_default !== undefined) {
      const promoted = tddDefaultPromotion[config.tdd_default];
      if (promoted && promoted !== config.tdd_default) {
        config.tdd_default = promoted;
        sources.tdd_default = 'CLAUDE.md user playbook';
      }
    }

    // test_list_first — promote optional → required if playbook detected test_list_first hint
    if (claudeOverrides.test_list_first && config.test_list_first !== undefined) {
      const promoted = testListPromotion[config.test_list_first];
      if (promoted && promoted !== config.test_list_first) {
        config.test_list_first = promoted;
        sources.test_list_first = 'CLAUDE.md user playbook';
      }
    }

    // fixture_strategy — promote inline → generators if playbook detected fixture hint
    if (claudeOverrides.fixture_strategy && config.fixture_strategy !== undefined) {
      const promoted = fixturePromotion[config.fixture_strategy];
      if (promoted && promoted !== config.fixture_strategy) {
        config.fixture_strategy = promoted;
        sources.fixture_strategy = 'CLAUDE.md user playbook';
      }
    }

    // security_isolation — promote n/a → multi_tenant_required ONLY for api kind
    if (kind === 'api' && config.security_isolation === 'n/a') {
      config.security_isolation = 'multi_tenant_required';
      sources.security_isolation = 'CLAUDE.md user playbook';
    }
  } else {
    // Backward-compat: old-style tdd override (non-playbook path)
    if (claudeOverrides.tdd && config.tdd !== claudeOverrides.tdd) {
      config.tdd = claudeOverrides.tdd;
      sources.tdd = 'CLAUDE.md user playbook';
    }
  }

  // Level 2: Apply OBJECTIVE.md overrides
  // Original 3 fields + 6 new structured fields (including outside_in)
  if (objectiveFm && objectiveFm.overrides) {
    for (const field of ['tdd', 'depth', 'model_profile']) {
      if (objectiveFm.overrides[field]) {
        config[field] = objectiveFm.overrides[field];
        sources[field] = 'OBJECTIVE.md overrides';
      }
    }
    // New structured fields — apply if present in overrides block
    const NEW_FIELDS = ['security_isolation', 'back_compat', 'tdd_default',
      'test_list_first', 'fixture_strategy', 'outside_in'];
    for (const field of NEW_FIELDS) {
      if (objectiveFm.overrides[field] !== undefined) {
        let val = objectiveFm.overrides[field];
        // Bool-coerce outside_in if it arrives as a string from YAML
        if (field === 'outside_in') {
          val = (val === 'true' || val === true);
        }
        config[field] = val;
        sources[field] = 'OBJECTIVE.md overrides';
      }
    }
  }

  // Level 1: Apply TRD frontmatter (highest precedence)
  if (trdFm) {
    if (trdFm.type === 'tdd') {
      config.tdd = config.tdd === 'skip' || config.tdd === 'none' ? 'strict' : config.tdd;
      sources.tdd = 'TRD frontmatter type:tdd';
    } else if (trdFm.type === 'standard') {
      config.tdd = 'standard';
      sources.tdd = 'TRD frontmatter type:standard';
    }
    // F5: confidence scoring removed (issue #31). Per-task `caution` attribute replaces TRD-level confidence.
    // Back-compat: parse the field if present, but do NOT surface it in resolved config.
    // Old TRDs with `confidence:` continue to load without error; the value is ignored.
    if (trdFm.confidence !== undefined) {
      // intentionally ignored — see Phase F (issue #31 F5)
    }

    // New structured fields — apply TRD frontmatter overrides for the 5+1 new fields
    // outside_in requires bool-coercion (YAML parser may return string "false" per verifier briefing #2)
    const NEW_FIELDS = ['security_isolation', 'back_compat', 'tdd_default',
      'test_list_first', 'fixture_strategy', 'outside_in'];
    for (const field of NEW_FIELDS) {
      if (trdFm[field] !== undefined) {
        let val = trdFm[field];
        // Bool-coerce outside_in to handle string "true"/"false" from YAML parsers
        if (field === 'outside_in') {
          if (val === 'true' || val === true) val = true;
          else if (val === 'false' || val === false) val = false;
        }
        config[field] = val;
        sources[field] = `TRD frontmatter ${field}`;
      }
    }

    // TRD constraint opt-outs (per-TRD only — not project-wide)
    const optOutMap = {
      allow_generated_test_data: 'no_llm_test_data',
      use_property_based: 'no_property_based_default',
      use_gherkin: 'no_gherkin_layer',
    };
    for (const [trdField, constraintId] of Object.entries(optOutMap)) {
      if (trdFm[trdField] === true || trdFm[trdField] === 'true') {
        constraints = constraints.filter((c) => c.id !== constraintId);
      }
    }
  }

  // Multi-tenancy hard-enforcement (CONTEXT.md §4)
  // When security_isolation === multi_tenant_required, inject wrong-tenant
  // assertion entry into verification_commands. Cannot be opted out without
  // explicit skip_multi_tenant_check TRD frontmatter (which adds a warning).
  config.verification_commands = config.verification_commands || [];
  if (config.security_isolation === 'multi_tenant_required') {
    const skipCheck = trdFm && (trdFm.skip_multi_tenant_check === true || trdFm.skip_multi_tenant_check === 'true');
    if (skipCheck) {
      warnings.push('multi-tenancy check explicitly skipped via TRD frontmatter skip_multi_tenant_check');
    } else {
      config.verification_commands.push({
        id: 'wrong_tenant_assertion',
        description: "Test must include an assertion that requests scoped to one tenant cannot access another tenant's data.",
        pattern: 'wrong-tenant|cross-tenant|tenant-isolation',
        enforcement: 'required',
      });
    }
  }

  // Strip internal flags from config that must not leak to consumers
  delete config._playbookDetected;

  // Build provenance map — enum-normalized parallel of sources
  // normalizeProvenance maps freeform source strings to a locked vocabulary
  const provenance = {};
  for (const field of Object.keys(sources)) {
    provenance[field] = normalizeProvenance(sources[field]);
  }

  return {
    kind,
    work,
    workSource,
    workInherited: workSource !== 'OBJECTIVE.md' && workSource !== 'TRD',
    config,
    sources,
    provenance,
    constraints,
    directives: directives._sources || [],
    warnings,
  };
}

// Maps freeform source strings (from result.sources) to normalized enum values.
//
// Vocabulary:
//   'table'              — value came from defaults-table.md (kind, work) cell
//   'user_playbook'      — value promoted by CLAUDE.md TDD Playbook absorption
//   'objective_override' — value set in OBJECTIVE.md `overrides` block
//   'trd_override'       — value set in TRD frontmatter
//   'unknown'            — defensive fallback; should not appear in practice
//
// Per TRD 0.5 anti-patterns: never returns undefined; 'unknown' is the floor.
function normalizeProvenance(sourceString) {
  if (!sourceString) return 'unknown';
  if (sourceString.startsWith('defaults table')) return 'table';
  if (sourceString === 'CLAUDE.md user playbook') return 'user_playbook';
  if (sourceString.startsWith('OBJECTIVE.md')) return 'objective_override';
  if (sourceString.startsWith('TRD frontmatter')) return 'trd_override';
  return 'unknown';
}

// Reset cache — for tests. Cascades to defaults-loader to avoid stale-tier state.
function _resetCache() {
  _cachedTable = null;
  _currentResolveCtx = { projectRoot: null, userHome: null };
  try {
    const defaultsLoader = require('./defaults-loader.cjs');
    defaultsLoader._resetCache();
  } catch (_) {
    // defaults-loader may not be loadable in some test contexts; ignore
  }
}

module.exports = {
  resolve,
  loadDefaultsTable,
  parseDefaultsYaml,
  loadConstraints,
  normalizeProvenance,
  validateKind,
  validateWork,
  VALID_KINDS,
  VALID_WORKS,
  _resetCache,
};
