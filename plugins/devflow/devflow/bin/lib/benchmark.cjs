'use strict';

/**
 * Per-objective token cost benchmarking — pure Node, zero LLM cost.
 *
 * Walks ~/.claude/projects/<project>/<session>/subagents/*.jsonl files,
 * attributes each agent invocation to a DevFlow objective via prompt regex,
 * computes weighted dollar cost using Anthropic prompt-cache pricing, and
 * emits a per-objective rollup joined with LOC + TRD counts.
 *
 * CLI:
 *   df-tools benchmark per-objective [--since 7d] [--model opus|sonnet] [--raw]
 *   df-tools benchmark summary       [--since 7d] [--raw]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// ─── Pricing ($/M tokens) ────────────────────────────────────────────────────

const PRICING = {
  opus: {
    input: 15.0,
    cache_write: 18.75, // 1.25× base
    cache_read: 1.50,   // 0.1× base
    output: 75.0,       // 5× base
  },
  sonnet: {
    input: 3.0,
    cache_write: 3.75,
    cache_read: 0.30,
    output: 15.0,
  },
};

function dollars(usage, model = 'opus') {
  const p = PRICING[model] || PRICING.opus;
  return (
    (usage.uncached * p.input +
     usage.cache_create * p.cache_write +
     usage.cache_read * p.cache_read +
     usage.output * p.output) / 1e6
  );
}

// ─── Pure helpers (testable) ──────────────────────────────────────────────────

function parseSince(s) {
  if (!s) return null;
  const m = /^(\d+)([dh])$/.exec(s);
  if (!m) return null;
  const ms = m[2] === 'd' ? 86400000 : 3600000;
  return new Date(Date.now() - parseInt(m[1], 10) * ms);
}

/**
 * Extract a DevFlow objective_id from an agent prompt or description.
 * Recognized patterns:
 *   - "objective 19-pty-handoff-watcher" → "19-pty-handoff-watcher"
 *   - "19-pty-handoff-watcher wave 2"   → "19-pty-handoff-watcher"
 *   - "v1.2 obj 10"                      → "v1.2-obj-10"
 *   - "TRD 19-01"                        → "obj-19"
 *   - "Phase E"                          → "v1.1-phase-E"
 *   - otherwise                          → "untagged"
 */
function extractObjectiveId(prompt, description) {
  const text = (prompt || '') + ' ' + (description || '');
  let m;
  m = text.match(/objective\s+(\d{1,3}-[a-z][a-z0-9-]+)/i);
  if (m) return m[1];
  m = text.match(/(\d{1,3}-[a-z][a-z0-9-]+)\s+wave/i);
  if (m) return m[1];
  m = text.match(/v1\.(\d+)\s+obj\s+(\d{1,3})\b/i);
  if (m) return `v1.${m[1]}-obj-${m[2]}`;
  m = text.match(/TRD\s+(\d{1,3})-\d{2}/i);
  if (m) return `obj-${m[1]}`;
  m = text.match(/Phase\s+([A-Z])/i);
  if (m) return `v1.1-phase-${m[1].toUpperCase()}`;
  return 'untagged';
}

/**
 * Canonicalize an objective_id to its short form (`obj-N`) when possible.
 * Maps planning dir prefix (`19-...`) → `obj-N` via numeric prefix.
 * Maps `v1.2-obj-N` → `obj-N` (collapses milestone prefix).
 */
function canonicalize(id, dirToObjMap = {}) {
  let m;
  m = id.match(/^v1\.\d+-obj-(\d+)$/);
  if (m) return `obj-${m[1]}`;
  m = id.match(/^obj-(\d+)$/);
  if (m) return `obj-${m[1]}`;
  m = id.match(/^(\d+)-/);
  if (m && dirToObjMap[m[1]]) return dirToObjMap[m[1]];
  return id;
}

// ─── JSONL walker ────────────────────────────────────────────────────────────

async function parseSubagentJsonl(filepath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filepath),
    crlfDelay: Infinity,
  });
  const rec = {
    firstPrompt: null,
    apiCalls: 0,
    inputUncached: 0,
    inputCacheCreate: 0,
    inputCacheRead: 0,
    outputTokens: 0,
  };
  const seenInput = new Set();
  const outputByReq = new Map();

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type === 'user' && rec.firstPrompt === null) {
      const c = entry.message && entry.message.content;
      if (typeof c === 'string') rec.firstPrompt = c;
      else if (Array.isArray(c) && c[0] && c[0].text) rec.firstPrompt = c[0].text;
    }

    if (entry.type === 'assistant' && entry.message && entry.message.usage) {
      const u = entry.message.usage;
      const reqId = entry.requestId || (entry.message && entry.message.id) || `__${rec.apiCalls}`;
      if (!seenInput.has(reqId)) {
        seenInput.add(reqId);
        rec.apiCalls++;
        rec.inputUncached += u.input_tokens || 0;
        rec.inputCacheCreate += u.cache_creation_input_tokens || 0;
        rec.inputCacheRead += u.cache_read_input_tokens || 0;
      }
      const o = u.output_tokens || 0;
      outputByReq.set(reqId, Math.max(outputByReq.get(reqId) || 0, o));
    }
  }
  for (const v of outputByReq.values()) rec.outputTokens += v;
  return rec;
}

async function walkSubagents({ projectDir, since }) {
  const records = [];
  if (!fs.existsSync(projectDir)) return records;

  const sessionDirs = fs.readdirSync(projectDir, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);

  for (const sd of sessionDirs) {
    const subDir = path.join(projectDir, sd, 'subagents');
    if (!fs.existsSync(subDir)) continue;
    const files = fs.readdirSync(subDir).filter(f => f.endsWith('.jsonl'));

    for (const f of files) {
      const jsonlPath = path.join(subDir, f);
      const stat = fs.statSync(jsonlPath);
      if (since && stat.mtime < since) continue;

      const metaPath = jsonlPath.replace(/\.jsonl$/, '.meta.json');
      let meta = {};
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch { /* tolerate malformed meta */ }
      }

      const rec = await parseSubagentJsonl(jsonlPath);
      rec.agentType = meta.agentType || 'unknown';
      rec.description = meta.description || '';
      rec.session = sd;
      rec.path = jsonlPath;
      records.push(rec);
    }
  }
  return records;
}

// ─── Repo metrics (LOC + TRD count via git/fs) ───────────────────────────────

/**
 * Auto-detect v1.X-obj-N planning directories ↔ merge commits.
 *
 * Strategy: walk ALL commits whose subject contains a PR ref (#NN), inspect
 * which `.planning/objectives/<dir>/` paths each touches, and build:
 *   - dir → { pr, obj_num, sha, loc, files }
 *   - prefix → 'obj-N' lookup table for the prompt-tagger
 *
 * Falls back to grepping the dir slug for older repos that don't follow the
 * 'v1.X obj N' commit-subject convention.
 */
function getRepoMetrics({ repo }) {
  const result = {};
  const dirToObj = {};
  const objectivesDir = path.join(repo, '.planning', 'objectives');
  if (!fs.existsSync(objectivesDir)) return { result, dirToObj };

  const dirs = fs.readdirSync(objectivesDir, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort();

  // ── Pass 1: enumerate PR-merge commits, build dir → commit map ─────────
  const dirToCommit = {}; // dir → { sha, pr, objNum }
  let prCommitsRaw = '';
  try {
    prCommitsRaw = execSync(
      `git log --all --format="%H|%s" --grep="(#[0-9]\\+)"`,
      { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch { /* tolerate empty git history */ }

  for (const line of prCommitsRaw.split('\n')) {
    if (!line) continue;
    const [sha, subject] = line.split('|', 2);
    if (!sha || !subject) continue;
    const prMatch = subject.match(/#(\d+)/);
    if (!prMatch) continue;
    const pr = parseInt(prMatch[1], 10);
    const objMatch = subject.match(/v1\.\d+\s+obj\s+(\d+)/i);
    const objNum = objMatch ? parseInt(objMatch[1], 10) : null;

    let touchedFiles = '';
    try {
      touchedFiles = execSync(
        `git diff-tree --no-commit-id --name-only -r ${sha}`,
        { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
    } catch { continue; }

    const touchedDirs = new Set();
    for (const f of touchedFiles.split('\n')) {
      const m = f.match(/^\.planning\/objectives\/([^/]+)\//);
      if (m) touchedDirs.add(m[1]);
    }

    for (const dir of touchedDirs) {
      // Prefer commits with explicit "v1.X obj N" pattern (canonical objective PR)
      // over later touch-up PRs that incidentally modify files in the same dir.
      const existing = dirToCommit[dir];
      const isCanonical = objNum != null;
      const existingIsCanonical = existing && existing.objNum != null;
      if (!existing || (isCanonical && !existingIsCanonical)) {
        dirToCommit[dir] = { sha, pr, objNum };
      }
    }
  }

  // ── Pass 2: build per-directory metrics ──────────────────────────────────
  for (const dir of dirs) {
    let trdCount = 0;
    try {
      trdCount = fs.readdirSync(path.join(objectivesDir, dir))
        .filter(f => /-TRD\.md$/.test(f)).length;
    } catch { /* dir vanished */ }

    const commit = dirToCommit[dir];
    let locAdded = 0, locRemoved = 0, files = 0;
    if (commit && commit.sha) {
      try {
        const stat = execSync(
          `git diff --shortstat ${commit.sha}^1 ${commit.sha} -- .`,
          { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
        const fm = stat.match(/(\d+) files? changed/);
        const am = stat.match(/(\d+) insertions/);
        const rm = stat.match(/(\d+) deletions/);
        files = fm ? parseInt(fm[1], 10) : 0;
        locAdded = am ? parseInt(am[1], 10) : 0;
        locRemoved = rm ? parseInt(rm[1], 10) : 0;
      } catch { /* cannot diff */ }
    }

    const numericPrefix = (dir.match(/^(\d+)-/) || [])[1];
    const objNum = commit ? commit.objNum : null;
    const pr = commit ? commit.pr : null;

    if (numericPrefix && objNum != null) {
      dirToObj[numericPrefix] = `obj-${objNum}`;
    }

    const id = objNum != null ? `obj-${objNum}` : dir;
    result[id] = {
      planning_dir: dir,
      pr,
      trd_count: trdCount,
      loc_added: locAdded,
      loc_removed: locRemoved,
      loc_total: locAdded + locRemoved,
      files_touched: files,
    };
  }
  return { result, dirToObj };
}

// ─── Aggregator ──────────────────────────────────────────────────────────────

async function buildPerObjective({ projectDir, repo, since, model }) {
  const records = await walkSubagents({ projectDir, since });
  const repoData = getRepoMetrics({ repo });
  const { result: repoMetrics, dirToObj } = repoData;

  for (const r of records) {
    const raw = extractObjectiveId(r.firstPrompt, r.description);
    r.objective_id = canonicalize(raw, dirToObj);
    r.activeWork = r.inputUncached + r.inputCacheCreate + r.outputTokens;
    r.cost = dollars(
      { uncached: r.inputUncached, cache_create: r.inputCacheCreate, cache_read: r.inputCacheRead, output: r.outputTokens },
      model
    );
  }

  const byObj = {};
  for (const r of records) {
    const id = r.objective_id;
    if (!byObj[id]) {
      byObj[id] = {
        agent_calls: 0,
        by_agent: {},
        uncached: 0,
        cache_create: 0,
        cache_read: 0,
        total_input: 0,
        total_output: 0,
        active_work: 0,
        cost: 0,
        executor_calls: 0,
        executor_active: 0,
        executor_cost: 0,
      };
    }
    const o = byObj[id];
    o.agent_calls++;
    o.by_agent[r.agentType] = (o.by_agent[r.agentType] || 0) + 1;
    o.uncached += r.inputUncached;
    o.cache_create += r.inputCacheCreate;
    o.cache_read += r.inputCacheRead;
    o.total_input += r.inputUncached + r.inputCacheCreate + r.inputCacheRead;
    o.total_output += r.outputTokens;
    o.active_work += r.activeWork;
    o.cost += r.cost;
    if (r.agentType === 'df-executor') {
      o.executor_calls++;
      o.executor_active += r.activeWork;
      o.executor_cost += r.cost;
    }
  }

  // Join with repo metrics
  for (const [objId, repo] of Object.entries(repoMetrics)) {
    if (!byObj[objId]) {
      byObj[objId] = {
        agent_calls: 0, by_agent: {}, uncached: 0, cache_create: 0, cache_read: 0,
        total_input: 0, total_output: 0, active_work: 0, cost: 0,
        executor_calls: 0, executor_active: 0, executor_cost: 0,
      };
    }
    Object.assign(byObj[objId], repo);
  }

  // Compute per-objective derived metrics
  for (const [, o] of Object.entries(byObj)) {
    o.cost_per_loc = o.loc_total ? +(o.cost / o.loc_total).toFixed(4) : null;
    o.cost_per_trd = o.trd_count ? +(o.cost / o.trd_count).toFixed(2) : null;
    o.active_per_loc = o.loc_total ? Math.round(o.active_work / o.loc_total) : null;
    o.avg_executor_active = o.executor_calls ? Math.round(o.executor_active / o.executor_calls) : null;
    o.cache_pct = o.total_input ? +(100 * o.cache_read / o.total_input).toFixed(1) : null;
  }

  return byObj;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmt(n, decimals = 1) {
  if (n == null) return '-';
  if (n >= 1e6) return (n / 1e6).toFixed(decimals) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(decimals) + 'k';
  return String(Math.round(n));
}

function $$(n) {
  return n == null ? '-' : '$' + n.toFixed(2);
}

function renderPerObjectiveTable(byObj, model, since) {
  const rows = Object.entries(byObj)
    .filter(([, v]) => v.planning_dir)
    .sort((a, b) => {
      const an = (a[0].match(/obj-(\d+)/) || [0, 999])[1];
      const bn = (b[0].match(/obj-(\d+)/) || [0, 999])[1];
      return parseInt(an, 10) - parseInt(bn, 10);
    });

  const lines = [];
  lines.push(`# Per-objective benchmark — ${model} pricing, last ${since || 'all'}\n`);
  lines.push('| Obj | PR | Dir | TRDs | LOC | Files | Agents | Cost | Active | Active/LOC | $/LOC | $/TRD | Cache% |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [id, o] of rows) {
    lines.push(
      `| ${id} | ${o.pr ? '#' + o.pr : '-'} | ${o.planning_dir} | ${o.trd_count} | ${o.loc_total} | ${o.files_touched} | ${o.agent_calls} | ${$$(o.cost)} | ${fmt(o.active_work)} | ${fmt(o.active_per_loc, 0)} | ${o.cost_per_loc != null ? '$' + o.cost_per_loc.toFixed(3) : '-'} | ${$$(o.cost_per_trd)} | ${o.cache_pct != null ? o.cache_pct + '%' : '-'} |`
    );
  }
  const totalCost = rows.reduce((s, [, o]) => s + (o.cost || 0), 0);
  const totalActive = rows.reduce((s, [, o]) => s + (o.active_work || 0), 0);
  const totalLOC = rows.reduce((s, [, o]) => s + (o.loc_total || 0), 0);
  lines.push(`\n**Totals:** ${$$(totalCost)} • ${fmt(totalActive)} active tokens • ${totalLOC} LOC • ${totalLOC ? '$' + (totalCost/totalLOC).toFixed(4) + '/LOC' : 'no LOC data'}`);

  if (byObj['untagged']) {
    const o = byObj['untagged'];
    lines.push(`\n_Untagged (orchestrator + cross-objective work): ${o.agent_calls} agent calls, ${$$(o.cost)}_`);
  }

  // Median active/LOC outlier check
  const activePerLoc = rows.map(([, o]) => o.active_per_loc).filter(v => v != null && v > 0).sort((a, b) => a - b);
  if (activePerLoc.length >= 3) {
    const median = activePerLoc[Math.floor(activePerLoc.length / 2)];
    lines.push('\n## Outlier check (active-work-per-LOC vs median)\n');
    lines.push(`Median active/LOC: ${median} tokens\n`);
    for (const [id, o] of rows) {
      if (!o.active_per_loc) continue;
      const ratio = o.active_per_loc / median;
      const verdict = ratio > 1.5 ? 'active-work outlier — examine TRD decomposition' :
                      ratio > 1.2 ? 'above median' : 'efficient';
      lines.push(`- **${id}**: ${o.active_per_loc} tok/LOC (${ratio.toFixed(1)}× median) — ${verdict}`);
    }
  }
  return lines.join('\n');
}

// ─── CLI entries ─────────────────────────────────────────────────────────────

async function cmdBenchmarkPerObjective(cwd, args, raw) {
  const sinceArg = (args.find(a => a.startsWith('--since=')) || '--since=7d').split('=')[1];
  const modelArg = ((args.find(a => a.startsWith('--model=')) || '--model=opus').split('=')[1] || 'opus').toLowerCase();
  if (!PRICING[modelArg]) {
    process.stderr.write(`Unknown model: ${modelArg}. Available: ${Object.keys(PRICING).join(', ')}\n`);
    process.exit(1);
    return;
  }
  const projectSlug = cwd.replace(/^\//, '').replace(/\//g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', '-' + projectSlug);

  // Best-effort fall back: if exact slug missing, use the parent directory name
  let resolvedDir = projectDir;
  if (!fs.existsSync(resolvedDir)) {
    // Take leading path segments until we find one that exists
    const parts = cwd.replace(/^\//, '').split('/');
    while (parts.length > 1) {
      parts.pop();
      const candidate = path.join(os.homedir(), '.claude', 'projects', '-' + parts.join('-'));
      if (fs.existsSync(candidate)) { resolvedDir = candidate; break; }
    }
  }

  const since = parseSince(sinceArg);
  const byObj = await buildPerObjective({
    projectDir: resolvedDir,
    repo: cwd,
    since,
    model: modelArg,
  });

  if (raw) {
    process.stdout.write(JSON.stringify({ ok: true, model: modelArg, since: sinceArg, project_dir: resolvedDir, objectives: byObj }, null, 2) + '\n');
  } else {
    process.stdout.write(renderPerObjectiveTable(byObj, modelArg, sinceArg) + '\n');
  }
  process.exit(0);
}

async function cmdBenchmarkSummary(cwd, args, raw) {
  // Top-level totals across all objectives in window
  const sinceArg = (args.find(a => a.startsWith('--since=')) || '--since=7d').split('=')[1];
  const modelArg = ((args.find(a => a.startsWith('--model=')) || '--model=opus').split('=')[1] || 'opus').toLowerCase();
  const projectSlug = cwd.replace(/^\//, '').replace(/\//g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', '-' + projectSlug);
  let resolvedDir = projectDir;
  if (!fs.existsSync(resolvedDir)) {
    const parts = cwd.replace(/^\//, '').split('/');
    while (parts.length > 1) {
      parts.pop();
      const candidate = path.join(os.homedir(), '.claude', 'projects', '-' + parts.join('-'));
      if (fs.existsSync(candidate)) { resolvedDir = candidate; break; }
    }
  }

  const since = parseSince(sinceArg);
  const records = await walkSubagents({ projectDir: resolvedDir, since });
  const byAgent = {};
  let totalCost = 0;
  for (const r of records) {
    r.cost = dollars(
      { uncached: r.inputUncached, cache_create: r.inputCacheCreate, cache_read: r.inputCacheRead, output: r.outputTokens },
      modelArg
    );
    totalCost += r.cost;
    const t = r.agentType;
    if (!byAgent[t]) byAgent[t] = { calls: 0, cost: 0, active: 0, total: 0 };
    byAgent[t].calls++;
    byAgent[t].cost += r.cost;
    byAgent[t].active += r.inputUncached + r.inputCacheCreate + r.outputTokens;
    byAgent[t].total += r.inputUncached + r.inputCacheCreate + r.inputCacheRead + r.outputTokens;
  }

  if (raw) {
    process.stdout.write(JSON.stringify({ ok: true, model: modelArg, since: sinceArg, total_cost: totalCost, by_agent: byAgent }, null, 2) + '\n');
    process.exit(0);
    return;
  }

  const lines = [];
  lines.push(`# Benchmark summary — ${modelArg} pricing, last ${sinceArg}\n`);
  lines.push(`**Total agent cost:** ${$$(totalCost)} across ${records.length} subagent invocations\n`);
  lines.push('| Agent | Calls | Total cost | Avg/call | Active tokens | Total tokens |');
  lines.push('|---|---|---|---|---|---|');
  const sorted = Object.entries(byAgent).sort((a, b) => b[1].cost - a[1].cost);
  for (const [t, v] of sorted) {
    lines.push(`| ${t} | ${v.calls} | ${$$(v.cost)} | ${$$(v.cost/v.calls)} | ${fmt(v.active)} | ${fmt(v.total)} |`);
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

function cmdBenchmarkRoute(cwd, args, raw) {
  const sub = args[0];
  if (sub === 'per-objective') return cmdBenchmarkPerObjective(cwd, args.slice(1), raw);
  if (sub === 'summary') return cmdBenchmarkSummary(cwd, args.slice(1), raw);
  process.stderr.write(
    'Usage: df-tools benchmark <subcommand> [options]\n' +
    '  per-objective   Per-objective cost rollup with LOC/TRD denominators\n' +
    '  summary         Per-agent-type cost breakdown\n' +
    '\n' +
    'Options (both subcommands):\n' +
    '  --since=<N>(d|h)   Time window (default: 7d)\n' +
    '  --model=opus|sonnet  Pricing model (default: opus)\n' +
    '  --raw              Emit JSON instead of markdown\n'
  );
  process.exit(sub ? 1 : 0);
}

module.exports = {
  // CLI entries
  cmdBenchmarkRoute,
  cmdBenchmarkPerObjective,
  cmdBenchmarkSummary,
  // Pure helpers (testable)
  extractObjectiveId,
  canonicalize,
  dollars,
  parseSince,
  buildPerObjective,
  PRICING,
};
