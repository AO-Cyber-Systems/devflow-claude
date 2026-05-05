'use strict';

/**
 * Unified check-todos aggregator.
 *
 * Read-only consumer of:
 *   - .planning/todos/pending/ (local todos)
 *   - gh issue list (assigned/mentioned/review-requested)
 *   - awareness.scanPeer (active peer sessions)
 *   - initiatives.loadInitiatives (initiative open questions)
 *   - .planning/.dup-detect-log.jsonl (dup-detect resolutions)
 *
 * Module growth across waves:
 *   TRD 06-01: aggregate, 5 _fetch* helpers, _assignLane, injection hooks  (THIS TRD)
 *   TRD 06-02: readCheckTodosCache, writeCheckTodosCache, isCheckTodosCacheStale
 *   TRD 06-03: formatCheckTodosMarkdown + 4 lane sub-renderers
 *   TRD 06-04: module.exports finalization + integration tests
 *
 * Iron Law: aggregate NEVER throws. Source failures → warnings[] entry; aggregate continues.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const aw = require('./awareness.cjs');
const initiatives = require('./initiatives.cjs');
const gh = require('./gh.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { DUP_DETECT_LOG_REL } = require('./dup-detect.cjs');

// ─── TRD 06-01: Constants ─────────────────────────────────────────────────────

const CHECK_TODOS_CACHE_REL = '.planning/.check-todos-cache.json';
const CHECK_TODOS_TTL_MINUTES = 10;
const MAX_CHECK_TODOS_OUTPUT_CHARS = 8000;
const DEFAULT_LANE_TRUNCATE = 5;
const LANE_NAMES = ['blocked', 'now', 'soon', 'ideas'];

// ─── TRD 06-01: Injection hooks ───────────────────────────────────────────────

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};
let _runFs = realFs;
let _runPeer = (opts) => aw.scanPeer(opts);

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _setRunPeer(fn) { _runPeer = (fn != null) ? fn : ((opts) => aw.scanPeer(opts)); }
function _setRunGh(fn) { return gh._setRunGh(fn); }  // re-export — mirrors obj 5

function _resetMocks() {
  _runFs = realFs;
  _runPeer = (opts) => aw.scanPeer(opts);
  gh._setRunGh(null);
}

// ─── TRD 06-01: Private helpers ───────────────────────────────────────────────

/**
 * Detect the current user from git config.
 * Falls back to process.env.USER; returns null on both fail.
 * @param {{ cwd?: string }} opts
 * @returns {string|null}
 */
function _detectCurrentUser({ cwd } = {}) {
  try {
    const r = spawnSync('git', ['config', 'user.name'], {
      encoding: 'utf-8',
      cwd: cwd || process.cwd(),
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      return r.stdout.trim();
    }
  } catch {}
  return process.env.USER || null;
}

/**
 * Detect current repo from .planning/PROJECT.md frontmatter.
 * Returns null on any failure.
 * @param {{ cwd?: string }} opts
 * @returns {string|null}
 */
function _detectCurrentRepo({ cwd } = {}) {
  try {
    const projectPath = path.join(cwd || process.cwd(), '.planning', 'PROJECT.md');
    if (!_runFs.existsSync(projectPath)) return null;
    const content = _runFs.readFileSync(projectPath, 'utf-8');
    const fm = extractFrontmatter(content);
    return (fm && fm.github_repo) ? fm.github_repo : null;
  } catch {
    return null;
  }
}

/**
 * Helper: returns true if timestamp is within N days of now.
 * Future timestamps → true (clock skew tolerance).
 * NaN parse → false.
 * @param {string} timestamp - ISO 8601 string
 * @param {number} days
 * @returns {boolean}
 */
function _isRecent(timestamp, days) {
  const parsed = Date.parse(timestamp);
  if (isNaN(parsed)) return false;
  const now = Date.now();
  const diff = now - parsed;
  // Future timestamp: diff negative → still recent (clock skew tolerance)
  if (diff < 0) return true;
  return diff < days * 86400000;
}

/**
 * Helper: append a GH issue to the out array, deduping via seen Set.
 * Normalizes labels from [{name:...}] to ['...'].
 * @param {object[]} out - accumulator
 * @param {Set} seen - repo#number refs already added
 * @param {object} issue - raw gh JSON issue
 * @param {object} flags - { assigned?, mentioned?, review_requested? }
 * @param {string|null} org - org filter (null = no filter)
 */
function _appendGhIssue(out, seen, issue, flags, org) {
  const repo = (issue.repository && issue.repository.nameWithOwner)
    ? issue.repository.nameWithOwner
    : null;
  // Single-org filter
  if (org && repo) {
    const issueOrg = repo.split('/')[0];
    if (issueOrg !== org) return;
  }
  const number = issue.number;
  const ref = repo ? `${repo}#${number}` : `#${number}`;
  if (seen.has(ref)) {
    // Merge flags onto existing entry
    const existing = out.find(e => e.ref === ref);
    if (existing) {
      if (flags.assigned) existing.assigned = true;
      if (flags.mentioned) existing.mentioned = true;
      if (flags.review_requested) existing.review_requested = true;
    }
    return;
  }
  seen.add(ref);
  // Normalize labels: [{name:'x'}] → ['x']
  const rawLabels = Array.isArray(issue.labels) ? issue.labels : [];
  const labels = rawLabels.map(l => (typeof l === 'string' ? l : (l && l.name) ? l.name : String(l)));
  out.push({
    ref,
    repo,
    number,
    title: issue.title || '',
    labels,
    assignees: Array.isArray(issue.assignees) ? issue.assignees : [],
    assigned: !!flags.assigned,
    mentioned: !!flags.mentioned,
    review_requested: !!flags.review_requested,
    state: 'open',
    source: 'gh',
  });
}

// ─── TRD 06-01: _fetchLocalTodos ──────────────────────────────────────────────

/**
 * Walk .planning/todos/pending/*.md and return entries in unified shape.
 *
 * Mirrors existing cmdListTodos data extraction (lib/misc.cjs:44) but exposes
 * the array shape directly instead of the {count, todos} wrapper.
 *
 * @param {string} cwd - project root
 * @param {{ area?: string }} [opts]
 * @returns {Array<{ file, created, title, area, path, source: 'local' }>}
 */
function _fetchLocalTodos(cwd, opts = {}) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  if (!_runFs.existsSync(pendingDir)) return [];
  const out = [];
  let files;
  try {
    files = _runFs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
  for (const file of files) {
    try {
      const content = _runFs.readFileSync(path.join(pendingDir, file), 'utf-8');
      const createdMatch = content.match(/^created:\s*(.+)$/m);
      const titleMatch = content.match(/^title:\s*(.+)$/m);
      const areaMatch = content.match(/^area:\s*(.+)$/m);
      const todoArea = areaMatch ? areaMatch[1].trim() : 'general';
      if (opts.area && todoArea !== opts.area) continue;
      out.push({
        file,
        created: createdMatch ? createdMatch[1].trim() : 'unknown',
        title: titleMatch ? titleMatch[1].trim() : 'Untitled',
        area: todoArea,
        path: path.join('.planning', 'todos', 'pending', file),
        source: 'local',
      });
    } catch { /* silently skip unreadable */ }
  }
  return out;
}

// ─── TRD 06-01: _fetchGhIssues ────────────────────────────────────────────────

/**
 * Query gh for assigned/mentioned/review-requested issues.
 * Hard-fails on auth (throws GhAuthError); caller (aggregate) catches.
 *
 * Three sequential queries:
 *   1. assigned to @me
 *   2. mentions @me
 *   3. review-requested @me
 *
 * Filters to single-org scope (opts.org).
 *
 * @param {{ org?: string }} [opts]
 * @returns {Array<{ ref, repo, number, title, labels, assignees, assigned, mentioned,
 *                    review_requested, state, source: 'gh' }>}
 */
function _fetchGhIssues(opts = {}) {
  gh.requireGhAuth(['repo']);  // throws GhAuthError on failure

  const out = [];
  const seen = new Set();  // dedupe by ref across the 3 queries

  // Query 1: assigned to @me
  const assignedR = gh._runGh([
    'issue', 'list',
    '--assignee', '@me',
    '--state', 'open',
    '--json', 'number,title,labels,assignees,repository',
    '--limit', '50',
  ]);
  if (assignedR.ok) {
    let arr = [];
    try { arr = JSON.parse(assignedR.stdout); } catch {}
    for (const issue of (Array.isArray(arr) ? arr : [])) {
      _appendGhIssue(out, seen, issue, { assigned: true }, opts.org);
    }
  }

  // Query 2: mentions @me
  const mentionedR = gh._runGh([
    'search', 'issues',
    'mentions:@me', 'is:open',
    '--json', 'number,title,labels,repository',
    '--limit', '50',
  ]);
  if (mentionedR.ok) {
    let arr = [];
    try { arr = JSON.parse(mentionedR.stdout); } catch {}
    for (const issue of (Array.isArray(arr) ? arr : [])) {
      _appendGhIssue(out, seen, issue, { mentioned: true }, opts.org);
    }
  }

  // Query 3: review-requested @me
  const reviewR = gh._runGh([
    'search', 'issues',
    'review-requested:@me', 'is:open', 'is:pr',
    '--json', 'number,title,labels,repository',
    '--limit', '25',
  ]);
  if (reviewR.ok) {
    let arr = [];
    try { arr = JSON.parse(reviewR.stdout); } catch {}
    for (const issue of (Array.isArray(arr) ? arr : [])) {
      _appendGhIssue(out, seen, issue, { review_requested: true }, opts.org);
    }
  }

  return out;
}

// ─── TRD 06-01: _fetchPeerSessions ────────────────────────────────────────────

/**
 * Fetch active peer sessions via awareness.scanPeer (injected via _runPeer).
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Array<{ branch, objective, trd, last_commit, state, github_issue, source: 'peer' }>}
 */
function _fetchPeerSessions(opts = {}) {
  const result = _runPeer({ cwd: opts.cwd });
  const branches = (result && Array.isArray(result.branches)) ? result.branches : [];
  return branches.map(b => ({
    branch: b.branch || null,
    objective: b.objective || null,
    trd: b.trd || null,
    last_commit: b.last_commit || null,
    state: b.state || null,
    github_issue: b.github_issue || null,
    source: 'peer',
  }));
}

// ─── TRD 06-01: _fetchInitiativeQuestions ─────────────────────────────────────

/**
 * Fetch open questions from initiatives matched to the current repo.
 *
 * @param {{ githubRepo?: string, home?: string }} [opts]
 * @returns {Array<{ initiative_slug, github_issue, question, source: 'initiative' }>}
 */
function _fetchInitiativeQuestions(opts = {}) {
  if (!opts.githubRepo) return [];
  const home = opts.home || undefined;
  const all = initiatives.loadInitiatives({ home });
  const matched = initiatives.matchByRepo(all, opts.githubRepo);
  const out = [];
  for (const init of matched) {
    const questions = Array.isArray(init.open_questions) ? init.open_questions : [];
    for (const q of questions) {
      out.push({
        initiative_slug: init.slug,
        github_issue: init.github_issue || null,
        question: q,
        source: 'initiative',
      });
    }
  }
  return out;
}

// ─── TRD 06-01: _fetchDupDetectLog ────────────────────────────────────────────

/**
 * Read .planning/.dup-detect-log.jsonl and return entries.
 * Malformed lines are silently skipped.
 *
 * @param {string} cwd - project root
 * @param {object} [opts]
 * @returns {Array<{ timestamp, objective_id, mode, blocking, top_match, resolution, source: 'dup-detect' }>}
 */
function _fetchDupDetectLog(cwd, opts = {}) {
  const logPath = path.join(cwd, DUP_DETECT_LOG_REL);
  if (!_runFs.existsSync(logPath)) return [];
  // Let readFileSync throw — aggregate wraps this in try/catch and routes to warnings[]
  const content = _runFs.readFileSync(logPath, 'utf-8');
  const out = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      out.push({
        timestamp: entry.timestamp || null,
        objective_id: entry.objective_id || null,
        mode: entry.mode || null,
        blocking: entry.blocking || false,
        top_match: entry.top_match || null,
        resolution: entry.resolution || null,
        source: 'dup-detect',
      });
    } catch { /* silently skip malformed */ }
  }
  return out;
}

// ─── TRD 06-01: _assignLane ───────────────────────────────────────────────────

/**
 * Assign an entry to exactly one of 4 urgency lanes.
 * Pure function — no I/O, no global state.
 *
 * Lane rules (per CONTEXT.md decision #2):
 *   - blocked: peer.state === 'blocked_on_user' OR dup-detect resolve='coordinate' (recent)
 *   - now:     gh.assigned + priority label OR peer.state === 'active'
 *   - soon:    gh.mentioned (not assigned) OR gh.review_requested OR initiative open question
 *   - ideas:   local todo OR gh.assigned without priority
 *
 * @param {object} entry        - source-emitted entry with `source` field
 * @param {string} currentUser  - git config user.name OR gh authed user
 * @param {string} currentRepo  - PROJECT.md github_repo
 * @returns {'blocked'|'now'|'soon'|'ideas'|null}  // null = skipped
 */
function _assignLane(entry, currentUser, currentRepo) {
  if (!entry || !entry.source) return null;

  switch (entry.source) {
    case 'local':
      return 'ideas';

    case 'initiative':
      return 'soon';

    case 'dup-detect': {
      const recent = _isRecent(entry.timestamp, 7);  // 7-day window
      if (!recent) return null;  // stale — skip
      if (entry.resolution === 'coordinate') return 'blocked';
      if (entry.mode === 'execute' && entry.blocking) return 'blocked';
      return null;  // resolved cleanly — skip
    }

    case 'peer': {
      if (entry.state === 'blocked_on_user') return 'blocked';
      if (entry.state === 'active') return 'now';
      return null;  // paused / done / unknown → skip
    }

    case 'gh': {
      // Tie-breakers: assigned > mentioned > review_requested
      if (entry.assigned) {
        const labels = Array.isArray(entry.labels) ? entry.labels : [];
        const isPriority = labels.some(l =>
          /^priority:high$/i.test(l) || /^P[01]$/i.test(l),
        );
        return isPriority ? 'now' : 'ideas';
      }
      if (entry.mentioned) return 'soon';
      if (entry.review_requested) return 'soon';
      return null;  // none of the flags → skip
    }

    default:
      return null;
  }
}

// ─── TRD 06-01: aggregate ─────────────────────────────────────────────────────

/**
 * Aggregate todos across 5 sources, route into 4 urgency lanes.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot - cwd (for local todo file walks + dup-detect log)
 * @param {boolean} [opts.refresh]  - force re-fetch (TRD 06-02 will wire cache; TRD 06-01 ignores)
 * @returns {{ blocked: object[], now: object[], soon: object[], ideas: object[],
 *             warnings: object[], cached: boolean }}
 */
function aggregate({ projectRoot, refresh } = {}) {
  const result = {
    blocked: [],
    now: [],
    soon: [],
    ideas: [],
    warnings: [],
    cached: false, // TRD 06-02 will set true on cache hit
  };

  // Resolve current user + current repo for lane assignment
  const currentUser = _detectCurrentUser({ cwd: projectRoot });
  const currentRepo = _detectCurrentRepo({ cwd: projectRoot });

  // 1. Local todos
  let localEntries = [];
  try {
    localEntries = _fetchLocalTodos(projectRoot || process.cwd(), {});
  } catch (err) {
    result.warnings.push({ source: 'local', kind: 'fetch_error', message: err.message });
  }

  // 2. GH issues — catches GhAuthError specifically
  let ghEntries = [];
  try {
    const org = currentRepo ? currentRepo.split('/')[0] : null;
    ghEntries = _fetchGhIssues({ org });
  } catch (err) {
    if (err && err.name === 'GhAuthError') {
      result.warnings.push({
        source: 'gh',
        kind: 'gh_auth_failure',
        remediation: err.remediation || 'gh auth refresh -h github.com -s repo',
      });
    } else {
      result.warnings.push({ source: 'gh', kind: 'fetch_error', message: err.message });
    }
  }

  // 3. Peer sessions
  let peerEntries = [];
  try {
    peerEntries = _fetchPeerSessions({ cwd: projectRoot });
  } catch (err) {
    result.warnings.push({ source: 'peer', kind: 'fetch_error', message: err.message });
  }

  // 4. Initiative open questions
  let initEntries = [];
  try {
    initEntries = _fetchInitiativeQuestions({ githubRepo: currentRepo });
  } catch (err) {
    result.warnings.push({ source: 'initiative', kind: 'fetch_error', message: err.message });
  }

  // 5. Dup-detect log
  let dupEntries = [];
  try {
    dupEntries = _fetchDupDetectLog(projectRoot || process.cwd(), {});
  } catch (err) {
    result.warnings.push({ source: 'dup-detect', kind: 'fetch_error', message: err.message });
  }

  // Route each entry into its lane via _assignLane (pure)
  const allEntries = [...localEntries, ...ghEntries, ...peerEntries, ...initEntries, ...dupEntries];
  for (const entry of allEntries) {
    const lane = _assignLane(entry, currentUser, currentRepo);
    if (lane && result[lane]) {
      result[lane].push(entry);
    }
    // _assignLane returning null = entry skipped (e.g., closed issue snuck through)
  }

  return result;
}

// ─── TRD 06-01: module.exports ────────────────────────────────────────────────

module.exports = {
  // Public API:
  aggregate,

  // Source fetchers:
  _fetchLocalTodos,
  _fetchGhIssues,
  _fetchPeerSessions,
  _fetchInitiativeQuestions,
  _fetchDupDetectLog,

  // Lane assignment:
  _assignLane,

  // Test hooks:
  _setRunGh,
  _setRunFs,
  _setRunPeer,
  _resetMocks,

  // Constants:
  CHECK_TODOS_CACHE_REL,
  CHECK_TODOS_TTL_MINUTES,
  MAX_CHECK_TODOS_OUTPUT_CHARS,
  DEFAULT_LANE_TRUNCATE,
  LANE_NAMES,
};
