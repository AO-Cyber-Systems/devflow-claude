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

// ─── CLI scaffold: defaults-table init ──────────────────────────────────────

const { output } = require('./helpers.cjs');

/**
 * scaffoldDefaultsTable({ scope, force, cwd, userHome }) → { ok, target_path, action, error?, backup? }
 * Copies the bundled defaults-table.md to org or project location.
 * scope: 'org' | 'project'
 */
function scaffoldDefaultsTable({ scope, force = false, dryRun = false, cwd = process.cwd(), userHome = null }) {
  if (!['org', 'project'].includes(scope)) {
    return { ok: false, error: `Invalid scope: ${scope}. Use --scope=org or --scope=project.` };
  }

  let target;
  if (scope === 'org') {
    const home = userHome || process.env.HOME || require('os').homedir();
    target = path.join(home, '.claude', 'devflow', 'defaults-table.md');
  } else {
    const planningDir = path.join(cwd, '.planning');
    if (!fs.existsSync(planningDir)) {
      return { ok: false, error: `No .planning/ directory found in ${cwd}. Run \`df-tools init new-project\` first or run from a project root.` };
    }
    target = path.join(planningDir, 'defaults-table.md');
  }

  if (fs.existsSync(target) && !force) {
    return {
      ok: false,
      error: `${target} already exists. Use --force to overwrite (existing file will be backed up to .bak.<timestamp>).`,
    };
  }

  if (dryRun) {
    const wouldBackup = fs.existsSync(target) && force;
    return {
      ok: true,
      dry_run: true,
      target_path: target,
      action: wouldBackup ? 'would_overwrite' : 'would_create',
      backup: null,
    };
  }

  // Backup existing if --force
  let backupPath = null;
  if (fs.existsSync(target) && force) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = `${target}.bak.${ts}`;
    fs.copyFileSync(target, backupPath);
  }

  // Ensure parent dir exists
  fs.mkdirSync(path.dirname(target), { recursive: true });

  // Copy bundled to target
  fs.copyFileSync(BUNDLED_PATH, target);

  return {
    ok: true,
    target_path: target,
    action: backupPath ? 'overwritten' : 'created',
    backup: backupPath,
  };
}

/**
 * cmdDefaultsTableInit(cwd, args, raw) — CLI entry point.
 * Usage: df-tools defaults-table init --scope=org|project [--force]
 */
function cmdDefaultsTableInit(cwd, args, raw) {
  const scopeFlag = args.find((a) => a.startsWith('--scope='));
  const scope = scopeFlag ? scopeFlag.split('=')[1] : null;
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    process.stdout.write(
      'Usage: df-tools defaults-table init --scope=org|project [--force] [--dry-run]\n' +
      '  Scaffold an editable copy of the (kind, work) defaults table.\n' +
      '\n' +
      '  --scope=org      Write to ~/.claude/devflow/defaults-table.md (org-level overrides)\n' +
      '  --scope=project  Write to .planning/defaults-table.md (project-level overrides)\n' +
      '  --force          Overwrite existing file (backed up to .bak.<timestamp>)\n' +
      '  --dry-run        Report what would happen without writing\n'
    );
    return;
  }

  if (!scope) {
    output({ ok: false, error: 'Missing required flag: --scope=org or --scope=project' }, raw, '');
    process.exit(1);
    return;
  }

  const result = scaffoldDefaultsTable({ scope, force, dryRun, cwd });
  if (!result.ok) {
    output(result, raw, result.error || '');
    process.exit(1);
    return;
  }

  const verb = result.dry_run ? 'Would write' : 'Wrote';
  output(
    result,
    raw,
    `${verb} ${result.target_path} (action: ${result.action})${result.backup ? ` — backup at ${result.backup}` : ''}`
  );
}

module.exports = {
  loadMergedDefaultsTable,
  mergeDefaultsTables,
  scaffoldDefaultsTable,
  cmdDefaultsTableInit,
  _resetCache,
  BUNDLED_PATH,
};
