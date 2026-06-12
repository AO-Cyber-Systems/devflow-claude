'use strict';

/**
 * decision-queue — park and resolve checkpoint:decision events.
 *
 * TRD 10-03: addDecision, listDecisions, resolveDecision, computeBlockedSet,
 * renderDecisionMarkdown, nextDecisionId, cmdDecisionQueueRoute.
 *
 * Filesystem injection: _setRunFs / _resetMocks (locked pattern from TRD 03-01).
 * All fs access routes through _runFs.X().
 */

const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');
const { extractFrontmatter, spliceFrontmatter } = require('./frontmatter.cjs');
const { notify } = require('./notifier.cjs');

// ─── FS injection (locked pattern from TRD 03-01) ─────────────────────────────

const realFs = {
  readFileSync: fs.readFileSync,
  readdirSync: fs.readdirSync,
  existsSync: fs.existsSync,
  writeFileSync: fs.writeFileSync,
  mkdirSync: fs.mkdirSync,
  renameSync: fs.renameSync,
  statSync: fs.statSync,
  unlinkSync: fs.unlinkSync,
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DECISIONS_DIR = '.planning/decisions';
const PENDING_DIR = 'pending';
const RESOLVED_DIR = 'resolved';

function pendingDir(cwd) {
  return path.join(cwd, DECISIONS_DIR, PENDING_DIR);
}

function resolvedDir(cwd) {
  return path.join(cwd, DECISIONS_DIR, RESOLVED_DIR);
}

/**
 * Extract the numeric part from a DECISION-NNN filename or id.
 * Returns the number, or 0 if not parseable.
 */
function parseDecisionNum(name) {
  const m = name.match(/DECISION-(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── nextDecisionId ───────────────────────────────────────────────────────────

/**
 * Scan both pending/ and resolved/ dirs for the highest DECISION-NNN number,
 * return DECISION-(N+1) zero-padded to 3 digits.
 */
function nextDecisionId(cwd) {
  const dirs = [pendingDir(cwd), resolvedDir(cwd)];
  let max = 0;
  for (const dir of dirs) {
    let entries;
    try {
      entries = _runFs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const n = parseDecisionNum(entry);
      if (n > max) max = n;
    }
  }
  return `DECISION-${String(max + 1).padStart(3, '0')}`;
}

// ─── renderDecisionMarkdown (pure) ────────────────────────────────────────────

/**
 * Render the full decision file content (frontmatter + body).
 * Pure function — no fs side effects.
 *
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.objective
 * @param {string|number} opts.wave
 * @param {string} opts.trd
 * @param {string} [opts.type]
 * @param {string} opts.created
 * @param {string} opts.status
 * @param {string[]} opts.blocks
 * @param {string[]} opts.independent
 * @param {string} opts.recommendation
 * @param {string} opts.title
 * @param {string} opts.context
 * @param {Array<{name:string, label:string, pros:string, cons:string}>} opts.options
 */
function renderDecisionMarkdown(opts) {
  const {
    id,
    objective,
    wave,
    trd,
    type = 'checkpoint:decision',
    created,
    status = 'pending',
    blocks = [],
    independent = [],
    recommendation,
    title,
    context,
    options = [],
  } = opts;

  const blocksStr = blocks.length > 0 ? `[${blocks.join(', ')}]` : '[]';
  const independentStr = independent.length > 0 ? `[${independent.join(', ')}]` : '[]';

  const frontmatter = [
    '---',
    `id: ${id}`,
    `objective: ${objective}`,
    `wave: ${wave}`,
    `trd: ${trd}`,
    `type: ${type}`,
    `created: ${created}`,
    `status: ${status}`,
    `blocks: ${blocksStr}`,
    `independent: ${independentStr}`,
    `recommendation: ${recommendation}`,
    '---',
  ].join('\n');

  const optionLines = options.map((opt, i) => {
    const label = opt.label || opt.name;
    return [
      `\n${i + 1}. **${opt.name}** — ${label}`,
      `   - Pros: ${opt.pros || '—'}`,
      `   - Cons: ${opt.cons || '—'}`,
    ].join('\n');
  }).join('\n');

  const body = [
    '',
    `## Decision: ${title}`,
    '',
    `**Context:** ${context}`,
    '',
    '**Options:**',
    optionLines,
    '',
    '## To Resolve',
    '',
    `Reply: \`/devflow:decide ${id} ${recommendation}\``,
    '',
  ].join('\n');

  return frontmatter + '\n' + body;
}

// ─── addDecision ──────────────────────────────────────────────────────────────

/**
 * Park a new decision. Creates dirs, writes the file, fires a notification.
 * Async — notification is fire-and-forget (never throws).
 *
 * @param {string} cwd
 * @param {object} opts — see renderDecisionMarkdown opts + title/context/options
 * @returns {Promise<{id: string, path: string}>}
 */
async function addDecision(cwd, opts) {
  const id = nextDecisionId(cwd);
  const created = opts.created || new Date().toISOString();

  // Ensure both dirs exist
  const pDir = pendingDir(cwd);
  const rDir = resolvedDir(cwd);
  _runFs.mkdirSync(pDir, { recursive: true });
  _runFs.mkdirSync(rDir, { recursive: true });

  const content = renderDecisionMarkdown({
    id,
    objective: String(opts.objective),
    wave: opts.wave != null ? opts.wave : 1,
    trd: String(opts.trd),
    type: opts.type || 'checkpoint:decision',
    created,
    status: 'pending',
    blocks: opts.blocks || [],
    independent: opts.independent || [],
    recommendation: String(opts.recommendation),
    title: String(opts.title),
    context: String(opts.context),
    options: opts.options || [],
  });

  const filePath = path.join(pDir, `${id}.md`);
  _runFs.writeFileSync(filePath, content, 'utf-8');

  // Fire-and-forget notification (never throws)
  notify({
    title: 'DevFlow: Decision Required',
    body: `${id}: ${opts.title} — run /devflow:decide ${id} <choice>`,
  }).catch(() => {});

  return { id, path: filePath };
}

// ─── listDecisions ────────────────────────────────────────────────────────────

/**
 * Return parsed decision records from pending/ (default) or resolved/ dir.
 * Graceful-empty (returns [] on missing dir). Warn + skip on malformed files.
 *
 * @param {string} cwd
 * @param {object} opts
 * @param {string} [opts.status] — 'pending' (default) | 'resolved'
 * @returns {Array<object>} parsed frontmatter objects, sorted by id
 */
function listDecisions(cwd, opts = {}) {
  const status = opts.status === 'resolved' ? 'resolved' : 'pending';
  const dir = status === 'resolved' ? resolvedDir(cwd) : pendingDir(cwd);

  let entries;
  try {
    entries = _runFs.readdirSync(dir);
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md') || !entry.startsWith('DECISION-')) continue;
    const filePath = path.join(dir, entry);
    let content;
    try {
      content = _runFs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      process.stderr.write(`[decision-queue] warn: could not read ${entry}: ${e.message}\n`);
      continue;
    }
    const fm = extractFrontmatter(content);
    if (!fm || !fm.id) {
      process.stderr.write(`[decision-queue] warn: malformed frontmatter in ${entry}, skipping\n`);
      continue;
    }
    results.push(fm);
  }

  return results.sort((a, b) => {
    const na = parseDecisionNum(a.id || '');
    const nb = parseDecisionNum(b.id || '');
    return na - nb;
  });
}

// ─── resolveDecision ──────────────────────────────────────────────────────────

/**
 * Move a decision from pending/ to resolved/, recording resolution + resolved_at.
 * Throws if id is not found in pending/.
 * Resolves with any choice string (freeform answers are legitimate — warns if
 * choice is not in the options list).
 *
 * @param {string} cwd
 * @param {string} id — e.g. 'DECISION-001'
 * @param {string} choice — the chosen option
 */
function resolveDecision(cwd, id, choice) {
  const pDir = pendingDir(cwd);
  const rDir = resolvedDir(cwd);

  const pendingPath = path.join(pDir, `${id}.md`);
  let exists = false;
  try {
    _runFs.statSync(pendingPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (!exists) {
    // Collect current pending ids for the error message
    let pendingIds = [];
    try {
      const entries = _runFs.readdirSync(pDir);
      pendingIds = entries.filter(e => e.startsWith('DECISION-') && e.endsWith('.md'))
        .map(e => e.replace('.md', ''));
    } catch {
      // empty — dir might not exist
    }
    throw new Error(
      `Decision not found in pending: ${id}. Pending ids: [${pendingIds.join(', ')}]`
    );
  }

  const content = _runFs.readFileSync(pendingPath, 'utf-8');
  const fm = extractFrontmatter(content);

  // Warn if choice not in options (freeform is still valid)
  const optionNames = Array.isArray(fm.options) ? fm.options : [];
  if (optionNames.length > 0 && !optionNames.includes(choice)) {
    process.stderr.write(
      `[decision-queue] warn: choice "${choice}" not in declared options [${optionNames.join(', ')}] — resolving anyway\n`
    );
  }

  // Update frontmatter
  fm.status = 'resolved';
  fm.resolution = choice;
  fm.resolved_at = new Date().toISOString();

  const newContent = spliceFrontmatter(content, fm);

  // Ensure resolved dir exists
  _runFs.mkdirSync(rDir, { recursive: true });

  // Write updated content to resolved/, then delete the pending file
  const resolvedPath = path.join(rDir, `${id}.md`);
  _runFs.writeFileSync(resolvedPath, newContent, 'utf-8');
  _runFs.unlinkSync(pendingPath);
}

// ─── computeBlockedSet ────────────────────────────────────────────────────────

/**
 * Read TRD frontmatter files in objectiveDir and compute blocked/independent sets.
 *
 * Blocked = TRDs with a matching decision_gate + closure over depends_on.
 * Independent = all TRDs not in blocked set.
 *
 * @param {string} objectiveDir — directory containing *-TRD.md files
 * @param {string} decisionId — e.g. 'DECISION-001'
 * @returns {{ blocked: string[], independent: string[] }}
 */
function computeBlockedSet(objectiveDir, decisionId) {
  let entries;
  try {
    entries = _runFs.readdirSync(objectiveDir);
  } catch {
    return { blocked: [], independent: [] };
  }

  const trdFiles = entries.filter(f => f.endsWith('-TRD.md') || f === 'TRD.md');

  // Build map: trdId → { depends_on: [], decision_gate?: string }
  const trdMap = {};
  for (const file of trdFiles) {
    const filePath = path.join(objectiveDir, file);
    let content;
    try {
      content = _runFs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const fm = extractFrontmatter(content);
    if (!fm) continue;
    const id = fm.trd || file.replace(/-TRD\.md$/, '');
    const dependsOn = Array.isArray(fm.depends_on)
      ? fm.depends_on
      : (fm.depends_on ? [String(fm.depends_on)] : []);
    trdMap[id] = {
      depends_on: dependsOn,
      decision_gate: fm.decision_gate || null,
    };
  }

  const allIds = Object.keys(trdMap);

  // Seed: TRDs directly gated by this decision
  const blocked = new Set(
    allIds.filter(id => trdMap[id].decision_gate === decisionId)
  );

  // Transitive closure over depends_on
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of allIds) {
      if (blocked.has(id)) continue;
      const deps = trdMap[id].depends_on;
      if (deps.some(dep => blocked.has(dep))) {
        blocked.add(id);
        changed = true;
      }
    }
  }

  const independent = allIds.filter(id => !blocked.has(id));

  return {
    blocked: [...blocked].sort(),
    independent: independent.sort(),
  };
}

// ─── CLI subcommand router ─────────────────────────────────────────────────────

function _parseFlags(argv) {
  const flags = {};
  const positional = [];
  let i = 0;
  const KEY_VALUE_FLAGS = [
    '--objective', '--trd', '--wave', '--title', '--context',
    '--options', '--recommendation', '--blocks', '--independent',
    '--status',
  ];
  while (i < argv.length) {
    const a = argv[i];
    if (KEY_VALUE_FLAGS.includes(a)) {
      flags[a.slice(2)] = argv[i + 1];
      i += 2;
    } else if (a === '--raw') {
      flags.raw = true;
      i++;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
      i++;
    } else {
      positional.push(a);
      i++;
    }
  }
  return { flags, positional };
}

function cmdDecisionQueueAdd(cwd, argv) {
  const { flags } = _parseFlags(argv);

  const objective = flags.objective;
  const trd = flags.trd;
  const wave = flags.wave != null ? Number(flags.wave) : 1;
  const title = flags.title;
  const context = flags.context;
  const optionsRaw = flags.options;
  const recommendation = flags.recommendation;
  const blocksRaw = flags.blocks;
  const independentRaw = flags.independent;
  const raw = flags.raw === true;

  if (!objective || !trd || !title || !context || !optionsRaw || !recommendation) {
    process.stderr.write(JSON.stringify({
      error: 'Usage: decision-queue add --objective <id> --trd <id> --title <t> --context <c> --options <a,b> --recommendation <a>',
    }) + '\n');
    process.exit(1);
    return;
  }

  const optionNames = optionsRaw.split(',').map(s => s.trim());
  const options = optionNames.map(name => ({ name, label: name, pros: '', cons: '' }));
  const blocks = blocksRaw ? blocksRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const independent = independentRaw ? independentRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  addDecision(cwd, {
    objective,
    trd,
    wave,
    title,
    context,
    options,
    recommendation,
    blocks,
    independent,
  }).then(result => {
    output(result, raw, JSON.stringify(result));
  }).catch(e => {
    process.stderr.write(JSON.stringify({ error: e.message }) + '\n');
    process.exit(1);
  });
}

function cmdDecisionQueueList(cwd, argv) {
  const { flags } = _parseFlags(argv);
  const raw = flags.raw === true;
  const status = flags.status;

  const results = listDecisions(cwd, { status });
  output(results, raw, JSON.stringify(results, null, 2));
}

function cmdDecisionQueueResolve(cwd, argv) {
  const { flags, positional } = _parseFlags(argv);
  const raw = flags.raw === true;

  const id = positional[0];
  const choice = positional[1];
  if (!id || !choice) {
    process.stderr.write(JSON.stringify({
      error: 'Usage: decision-queue resolve <DECISION-NNN> <choice>',
    }) + '\n');
    process.exit(1);
    return;
  }

  try {
    resolveDecision(cwd, id, choice);
    const result = { resolved: true, id, choice };
    output(result, raw, JSON.stringify(result));
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: e.message }) + '\n');
    process.exit(1);
  }
}

function cmdDecisionQueueNotify(cwd, argv) {
  const { flags, positional } = _parseFlags(argv);
  const raw = flags.raw === true;

  const id = positional[0];
  if (!id) {
    process.stderr.write(JSON.stringify({
      error: 'Usage: decision-queue notify <DECISION-NNN>',
    }) + '\n');
    process.exit(1);
    return;
  }

  // Load the pending decision and re-fire its notification
  const pDir = pendingDir(cwd);
  const filePath = path.join(pDir, `${id}.md`);
  let fm;
  try {
    const content = _runFs.readFileSync(filePath, 'utf-8');
    fm = extractFrontmatter(content);
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: `Decision not found: ${id}`, detail: e.message }) + '\n');
    process.exit(1);
    return;
  }

  notify({
    title: 'DevFlow: Decision Required',
    body: `${id}: ${fm.title || '(no title)'} — run /devflow:decide ${id} <choice>`,
  }).then(() => {
    const result = { notified: true, id };
    output(result, raw, JSON.stringify(result));
  }).catch(e => {
    process.stderr.write(JSON.stringify({ error: e.message }) + '\n');
    process.exit(1);
  });
}

/**
 * Route entry point for `df-tools decision-queue <subcommand>`.
 */
async function cmdDecisionQueueRoute(cwd, argv, raw) {
  const sub = argv[0];
  if (!sub) {
    process.stderr.write(JSON.stringify({
      error: 'Usage: decision-queue <add|list|resolve|notify>',
    }) + '\n');
    process.exit(1);
    return;
  }
  switch (sub) {
    case 'add':
      return cmdDecisionQueueAdd(cwd, argv.slice(1));
    case 'list':
      return cmdDecisionQueueList(cwd, argv.slice(1));
    case 'resolve':
      return cmdDecisionQueueResolve(cwd, argv.slice(1));
    case 'notify':
      return cmdDecisionQueueNotify(cwd, argv.slice(1));
    default:
      process.stderr.write(JSON.stringify({
        error: `Unknown decision-queue subcommand: ${sub}. Available: add, list, resolve, notify`,
      }) + '\n');
      process.exit(1);
  }
}

// ─── module.exports ───────────────────────────────────────────────────────────

module.exports = {
  nextDecisionId,
  addDecision,
  listDecisions,
  resolveDecision,
  computeBlockedSet,
  renderDecisionMarkdown,
  cmdDecisionQueueRoute,
  _setRunFs,
  _resetMocks,
};
