'use strict';

/**
 * Initiative context layer — disk projection of GitHub Epics for planner-time strategic context.
 *
 * Disk projection at ~/.claude/devflow/initiatives/<slug>.md (global, NOT per-repo).
 * Plan-time reader is offline — never calls gh. Sync-time writer (TRD 05-02) is the SINGLE writer.
 *
 * Module growth across waves:
 *   TRD 05-01: skeleton + reader (loadInitiatives, matchByRepo, formatInitiativeForPlanner)
 *              + token-budget primitives + injection hooks + CLI list/show     (THIS TRD)
 *   TRD 05-02: writer (syncInitiatives, _writeInitiativeFile, qualification, sync CLI)
 *   TRD 05-03: stale-deletion (_detectStaleInitiatives, _deleteStaleFile, --force)
 *   TRD 05-05: module.exports finalization + integration tests + token-budget enforcement
 *
 * Iron Law: reader path NEVER calls gh; NEVER throws on missing home.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractFrontmatter } = require('./frontmatter.cjs');
const gh = require('./gh.cjs');

// ─── TRD 05-01: Constants ─────────────────────────────────────────────────────

const INITIATIVES_HOME_REL = path.join('.claude', 'devflow', 'initiatives');
const MAX_WHY_CHARS = 1500;
const MAX_QUESTIONS_BULLETS = 7;
const MAX_SUBISSUES_LINES = 15;
const MAX_FORMATTED_PLANNER_CHARS = 1500;
const MAX_PLANNER_FORMAT_WHY = 500;    // narrower than MAX_WHY_CHARS for planner format
const MAX_PLANNER_FORMAT_SUBISSUES = 5;

function defaultInitiativesHome() {
  const home = os.homedir();
  if (!home) return null;
  return path.join(home, INITIATIVES_HOME_REL);
}

// ─── TRD 05-01: Injection hooks ───────────────────────────────────────────────
// All production fs reads route through _runFs.X() — never fs.X() directly.
// Write methods added by TRD 05-02; readline added by TRD 05-03.

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }

// Re-export gh._setRunGh as a function alias so obj 5 tests can mock walkProject
// transitively. Reader path doesn't use it; included for SC-8 surface lock.
function _setRunGh(fn) { return gh._setRunGh(fn); }

function _resetMocks() {
  _runFs = realFs;
  gh._setRunGh(null);
  _runReadline = _defaultConfirmDeleteStale;
}

// ─── TRD 05-01: _truncateWhy + helpers ────────────────────────────────────────

function _truncateWhy(text, max) {
  if (max === undefined) max = MAX_WHY_CHARS;
  if (typeof text !== 'string') return '';
  if (text.length <= max) return text;
  // Try paragraph break first
  const truncated = text.slice(0, max);
  const lastBreak = truncated.lastIndexOf('\n\n');
  if (lastBreak > max * 0.5) {
    return truncated.slice(0, lastBreak).trimEnd() + '\n\n…';
  }
  return truncated.trimEnd() + '…';
}

// ─── TRD 05-01: _parseInitiativeFile ──────────────────────────────────────────

function _extractBody(content) {
  // Frontmatter is bounded by --- ... ---; body is everything after the second ---.
  const parts = content.split(/^---\s*$/m);
  if (parts.length < 3) return '';
  return parts.slice(2).join('---').replace(/^\n+/, '');
}

function _extractSection(body, header) {
  // Extract ## Header section — captures all lines until the next "^## " or end of body.
  // Split on ## boundaries to avoid multiline-mode end-of-line $ ambiguity.
  const sections = body.split(/(?=^## )/m);
  for (const section of sections) {
    const headerMatch = section.match(/^## (.+)/);
    if (headerMatch && headerMatch[1].trim() === header) {
      // Return everything after the ## header line
      const content = section.replace(/^## .+\n/, '');
      return content.trim();
    }
  }
  return '';
}

function _parseSubIssuesSection(text) {
  // Lines like: "- AO-Cyber-Systems/devflow-claude#9 — DevFlow Coordination Layer (OPEN)"
  // Or: "- [ ] AO-Cyber-Systems/devflow-claude#9 — Title (OPEN)"
  // Or: "- [x] AO-Cyber-Systems/devflow-claude#9 — Title (CLOSED)"
  const out = [];
  if (!text) return out;
  const lines = text.split('\n');
  // Match: optional checkbox, then ref (owner/repo#NN), then em-dash/hyphen separator, then title (STATE)
  const re = /^[-*]\s+(?:\[[ xX]\]\s+)?([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+#\d+)\s*[—\-–]\s*(.+?)\s*\(([A-Z]+)\)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) out.push({ ref: m[1], title: m[2].trim(), state: m[3] });
  }
  return out;
}

function _parseQuestionsSection(text) {
  if (!text) return [];
  const out = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^[-*]\s+(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

function _parseInitiativeFile(content) {
  if (typeof content !== 'string' || content.trim().length < 10) return null;
  const fm = extractFrontmatter(content);
  if (!fm || !fm.slug) return null;
  const body = _extractBody(content);
  return {
    slug: fm.slug,
    github_issue: fm.github_issue || null,
    parent_project: fm.parent_project || null,
    key_repos: Array.isArray(fm.key_repos) ? fm.key_repos : [],
    updated_at: fm.updated_at || null,
    body,
    why: _extractSection(body, 'Why'),
    open_questions: _parseQuestionsSection(_extractSection(body, 'Open Questions')),
    sub_issues: _parseSubIssuesSection(_extractSection(body, 'Linked Sub-issues')),
    status: _extractSection(body, 'Status'),
  };
}

// ─── TRD 05-01: loadInitiatives ───────────────────────────────────────────────

function loadInitiatives({ home } = {}) {
  const resolved = home || defaultInitiativesHome();
  if (!resolved || !_runFs.existsSync(resolved)) return [];
  let entries;
  try {
    entries = _runFs.readdirSync(resolved);
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(resolved, entry);
    let content;
    try {
      content = _runFs.readFileSync(filePath, 'utf-8');
    } catch {
      process.stderr.write(`initiatives: skipping unreadable file: ${entry}\n`);
      continue;
    }
    const parsed = _parseInitiativeFile(content);
    if (!parsed) {
      process.stderr.write(`initiatives: skipping malformed initiative file: ${entry}\n`);
      continue;
    }
    out.push(parsed);
  }
  return out;
}

// ─── TRD 05-01: matchByRepo ───────────────────────────────────────────────────

function matchByRepo(initiatives, github_repo) {
  if (!Array.isArray(initiatives) || initiatives.length === 0) return [];
  if (!github_repo || typeof github_repo !== 'string') return [];
  return initiatives.filter(i => Array.isArray(i.key_repos) && i.key_repos.includes(github_repo));
}

// ─── TRD 05-01: formatInitiativeForPlanner ───────────────────────────────────

function formatInitiativeForPlanner(initiative) {
  if (!initiative) return '';
  const lines = [];
  lines.push(`### ${initiative.slug}`);
  if (initiative.github_issue) lines.push(`*Tracks: ${initiative.github_issue}*`);
  lines.push('');

  if (initiative.why) {
    lines.push('**Why:**');
    // First paragraph only, truncated to MAX_PLANNER_FORMAT_WHY
    const firstPara = initiative.why.split('\n\n')[0] || '';
    lines.push(_truncateWhy(firstPara, MAX_PLANNER_FORMAT_WHY));
    lines.push('');
  }

  if (initiative.open_questions && initiative.open_questions.length > 0) {
    lines.push('**Open questions:**');
    for (const q of initiative.open_questions.slice(0, MAX_QUESTIONS_BULLETS)) {
      lines.push(`- ${q}`);
    }
    lines.push('');
  }

  if (initiative.sub_issues && initiative.sub_issues.length > 0) {
    lines.push('**Linked sub-issues:**');
    const shown = initiative.sub_issues.slice(0, MAX_PLANNER_FORMAT_SUBISSUES);
    for (const si of shown) {
      lines.push(`- ${si.ref} — ${si.title} (${si.state})`);
    }
    const more = initiative.sub_issues.length - shown.length;
    if (more > 0) lines.push(`- …and ${more} more`);
  }

  let result = lines.join('\n').trim();
  // Hard-cap at MAX_FORMATTED_PLANNER_CHARS
  if (result.length > MAX_FORMATTED_PLANNER_CHARS) {
    result = result.slice(0, MAX_FORMATTED_PLANNER_CHARS - 1) + '…';
  }
  return result;
}

// ─── TRD 05-02: Extended realFs (write methods) ──────────────────────────────
// Augment realFs in-place. unlinkSync is needed here for tmp-cleanup-on-rename-fail.
// TRD 05-03 will reuse the unlinkSync entry.
realFs.writeFileSync = (p, data, opts) => fs.writeFileSync(p, data, opts);
realFs.mkdirSync = (p, opts) => fs.mkdirSync(p, opts);
realFs.renameSync = (oldP, newP) => fs.renameSync(oldP, newP);
realFs.unlinkSync = (p) => fs.unlinkSync(p);

// ─── TRD 05-02: _slugifyInitiativeTitle ──────────────────────────────────────

function _slugifyInitiativeTitle(title) {
  if (typeof title !== 'string') return null;
  // Strip [Epic] / [Roadmap] / similar bracketed prefix
  let t = title.replace(/^\[[^\]]+\]\s*/, '');
  // NFKD normalize + strip diacritics (Unicode combining chars U+0300–U+036F)
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Lowercase + replace non-alphanumeric with hyphen
  t = t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // Collapse multiple hyphens, strip leading/trailing
  t = t.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return t.length > 0 ? t : null;
}

// ─── TRD 05-02: _qualifiesAsInitiative ───────────────────────────────────────

function _qualifiesAsInitiative(item) {
  if (!item || typeof item !== 'object') return false;
  // Path 1: has tracked sub-issues (short-circuit)
  if (Array.isArray(item.sub_issues) && item.sub_issues.length > 0) return true;
  // Path 2: title-prefix [Epic] (case-sensitive per CONTEXT.md decision #5b)
  if (typeof item.title === 'string' && /^\[Epic\]/.test(item.title)) return true;
  // Path 3: body marker **Type:** epic
  if (typeof item.body === 'string' && /\*\*Type:\*\*\s+epic/i.test(item.body)) return true;
  // Path 4: draft + In Progress
  if (item.item_type === 'draft' && item.status === 'In Progress') return true;
  return false;
}

// ─── TRD 05-02: _renderInitiativeMarkdown ────────────────────────────────────

function _renderInitiativeMarkdown(data) {
  // data: { slug, github_issue, parent_project, key_repos, updated_at,
  //         title, why, open_questions, sub_issues, status, project_status, quarter }
  const lines = [];
  // Frontmatter — locked field order: slug, github_issue, parent_project, key_repos, updated_at
  lines.push('---');
  lines.push(`slug: ${data.slug}`);
  lines.push(`github_issue: ${data.github_issue || ''}`);
  lines.push(`parent_project: ${data.parent_project || ''}`);
  lines.push('key_repos:');
  for (const r of (data.key_repos || [])) lines.push(`  - ${r}`);
  lines.push(`updated_at: ${data.updated_at}`);
  lines.push('---');
  lines.push('');
  // Body — locked section order: # Title, ## Why, ## Open Questions, ## Linked Sub-issues, ## Status
  lines.push(`# ${data.title || data.slug}`);
  lines.push('');
  lines.push('## Why');
  lines.push('');
  lines.push(_truncateWhy(data.why || '', MAX_WHY_CHARS));
  lines.push('');
  lines.push('## Open Questions');
  lines.push('');
  const questions = (data.open_questions || []).slice(0, MAX_QUESTIONS_BULLETS);
  for (const q of questions) lines.push(`- ${q}`);
  if (questions.length === 0) lines.push('');
  lines.push('');
  lines.push('## Linked Sub-issues');
  lines.push('');
  const subs = (data.sub_issues || []).slice(0, MAX_SUBISSUES_LINES);
  for (const si of subs) lines.push(`- ${si.ref} — ${si.title} (${si.state})`);
  if (subs.length === 0) lines.push('');
  lines.push('');
  lines.push('## Status');
  lines.push('');
  lines.push(`- **GitHub:** ${data.status || 'OPEN'}`);
  if (data.project_status) lines.push(`- **Project status:** ${data.project_status}`);
  if (data.quarter) lines.push(`- **Quarter:** ${data.quarter}`);
  lines.push(`- **Updated:** ${data.updated_at}`);
  lines.push('');
  return lines.join('\n');
}

// ─── TRD 05-02: _writeInitiativeFile ─────────────────────────────────────────

function _writeInitiativeFile(home, data, opts) {
  if (opts === undefined) opts = {};
  if (!_runFs.existsSync(home)) {
    _runFs.mkdirSync(home, { recursive: true });
  }
  const slug = data.slug;
  const dest = path.join(home, `${slug}.md`);
  const tmpSuffix = opts._tmpSuffix || `tmp.${process.pid}`;
  const tmpPath = path.join(home, `.${slug}.md.${tmpSuffix}`);
  const content = _renderInitiativeMarkdown(data);
  _runFs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    _runFs.renameSync(tmpPath, dest);
  } catch (e) {
    // Cleanup tmp on rename failure (best-effort; ignore unlink errors)
    try { _runFs.unlinkSync(tmpPath); } catch {}
    throw e;
  }
  return { slug, path: dest };
}

// ─── TRD 05-02: private body-extraction helpers ──────────────────────────────

function _deriveKeyRepos(item) {
  // Primary: repo of the issue itself
  const repos = new Set();
  if (item.issue_ref) {
    const repo = item.issue_ref.split('#')[0];
    if (repo) repos.add(repo);
  }
  // Plus: every distinct repo referenced in sub_issues
  for (const si of (item.sub_issues || [])) {
    if (si.ref) {
      const repo = si.ref.split('#')[0];
      if (repo) repos.add(repo);
    }
  }
  return Array.from(repos);
}

function _extractWhyFromBody(body) {
  if (!body || typeof body !== 'string') return '';
  // First, try explicit ## Why section
  const why = _extractSection(body, 'Why');
  if (why) return why;
  // Else: first paragraph of body (everything before first ## heading)
  const firstHeader = body.search(/^##\s/m);
  const before = (firstHeader >= 0 ? body.slice(0, firstHeader) : body).trim();
  return before;
}

function _extractQuestionsFromBody(body) {
  if (!body || typeof body !== 'string') return [];
  const section = _extractSection(body, 'Open Questions') || _extractSection(body, 'Questions') || '';
  return _parseQuestionsSection(section);
}

// ─── TRD 05-03: Stale-deletion region ────────────────────────────────────────

const readline = require('node:readline');

/**
 * Default real-readline confirmation prompt.
 * On non-TTY stdin, returns false (skip deletion, caller logs warning).
 *
 * @param {string} slug - initiative slug to prompt about
 * @returns {Promise<boolean>}
 */
function _defaultConfirmDeleteStale(slug) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Delete ${slug}.md? [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test((answer || '').trim()));
    });
  });
}

let _runReadline = _defaultConfirmDeleteStale;
function _setRunReadline(fn) { _runReadline = (fn != null) ? fn : _defaultConfirmDeleteStale; }

/**
 * Confirm deletion of a stale initiative file.
 * Routes through _runReadline injection hook for test determinism.
 *
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
function _confirmDeleteStale(slug) {
  return Promise.resolve(_runReadline(slug));
}

/**
 * Detect initiative files whose source GitHub issue is CLOSED AND not present
 * in the fresh walkProject items.
 *
 * @param {object} opts
 * @param {string} opts.home        - initiatives home dir
 * @param {object[]} opts.fresh_items - walkProject items from current sync
 * @returns {{ stale: Array<{slug, github_issue, reason}>, warnings: string[] }}
 */
function _detectStaleInitiatives({ home, fresh_items }) {
  const stale = [];
  const warnings = [];
  if (!_runFs.existsSync(home)) return { stale, warnings };

  // Build a set of issue refs present in fresh walkProject items
  const freshRefs = new Set();
  for (const it of (fresh_items || [])) {
    if (it.issue_ref) freshRefs.add(it.issue_ref);
  }

  let entries;
  try {
    entries = _runFs.readdirSync(home);
  } catch {
    return { stale, warnings };
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(home, entry);
    let content;
    try {
      content = _runFs.readFileSync(filePath, 'utf-8');
    } catch {
      continue; // unreadable — skip silently
    }
    const parsed = _parseInitiativeFile(content);
    if (!parsed) continue; // malformed frontmatter — skip silently

    if (!parsed.github_issue) {
      warnings.push(`${parsed.slug || entry}: no github_issue field`);
      continue;
    }

    // If still present in fresh project items, NOT stale (even if closed)
    if (freshRefs.has(parsed.github_issue)) continue;

    // Verify issue is CLOSED via gh issue view (routes through _runGh mock in tests)
    const viewR = gh.readIssueState(parsed.github_issue);
    if (!viewR.ok) {
      warnings.push(`${parsed.slug}: gh issue view failed: ${viewR.stderr}`);
      continue; // treat as not-stale (safer than deleting on network error)
    }
    let state;
    try {
      state = JSON.parse(viewR.stdout).state;
    } catch {
      warnings.push(`${parsed.slug}: gh issue view returned non-JSON`);
      continue;
    }
    if (state !== 'CLOSED') continue;

    stale.push({ slug: parsed.slug, github_issue: parsed.github_issue, reason: 'closed_and_removed' });
  }

  return { stale, warnings };
}

/**
 * Delete a stale initiative file from disk.
 *
 * @param {string} home - initiatives home dir
 * @param {string} slug - initiative slug (file is <home>/<slug>.md)
 * @returns {{ deleted: boolean, slug: string, reason: string }}
 */
function _deleteStaleFile(home, slug) {
  const filePath = path.join(home, `${slug}.md`);
  try {
    _runFs.unlinkSync(filePath);
    return { deleted: true, slug, reason: 'closed_and_removed' };
  } catch (e) {
    return { deleted: false, slug, reason: `unlink_failed: ${e.message}` };
  }
}

/**
 * Run the stale-deletion confirmation loop.
 * With force=true: delete unconditionally.
 * With force=false: prompt per file via _runReadline.
 *
 * @param {object} opts
 * @param {string} opts.home
 * @param {Array<{slug, github_issue, reason}>} opts.stale_entries
 * @param {boolean} opts.force
 * @returns {Promise<{ deleted: Array, warnings: string[] }>}
 */
async function _runStaleDeletionLoop({ home, stale_entries, force }) {
  const deleted = [];
  const warnings = [];

  for (const entry of stale_entries) {
    let proceed = false;
    if (force) {
      proceed = true;
    } else {
      try {
        proceed = await Promise.resolve(_runReadline(entry.slug));
      } catch (e) {
        warnings.push(`${entry.slug}: confirmation prompt failed: ${e.message}`);
        continue;
      }
    }
    if (!proceed) continue;
    const r = _deleteStaleFile(home, entry.slug);
    if (r.deleted) {
      deleted.push(r);
    } else {
      warnings.push(`${entry.slug}: ${r.reason}`);
    }
  }

  return { deleted, warnings };
}

// ─── TRD 05-02: syncInitiatives (now async for readline support) ──────────────

/**
 * Sync initiatives from org Product Roadmap to disk.
 *
 * @param {object} opts
 * @param {string} opts.home          - target dir; defaults to defaultInitiativesHome()
 * @param {string} opts.project_id    - project node id; defaults to PRODUCT_ROADMAP_FIELDS._project_id
 * @param {string} opts.initiative    - sync ONLY this slug (skips all others; skips stale-deletion)
 * @param {boolean} opts.force        - delete stale files without confirmation (TRD 05-03)
 * @returns {Promise<{ ok: bool, written: [], deleted: [], skipped: [], warnings: [] }>}
 */
async function syncInitiatives(opts) {
  if (opts === undefined) opts = {};
  // 1. Hard-fail auth (throws GhAuthError if missing/insufficient)
  gh.requireGhAuth(['project', 'read:project', 'repo']);

  const home = opts.home || defaultInitiativesHome();
  const projectId = opts.project_id || (gh.PRODUCT_ROADMAP_FIELDS && gh.PRODUCT_ROADMAP_FIELDS._project_id) || null;
  const written = [];
  const deleted = [];
  const skipped = [];
  const warnings = [];

  if (!projectId) {
    return {
      ok: false,
      written, deleted, skipped,
      warnings: ['no project_id available; obj 1 cassette missing or PRODUCT_ROADMAP_FIELDS not initialized'],
    };
  }

  // 2. Walk project (catch non-auth errors)
  let walk;
  try {
    walk = gh.walkProject(projectId);
  } catch (e) {
    return { ok: false, written, deleted, skipped, warnings: [`walkProject failed: ${e.message}`] };
  }
  if (walk && Array.isArray(walk.warnings)) {
    warnings.push(...walk.warnings);
  }

  // 3. Filter + write (writer loop runs FIRST, per CONTEXT.md locked decision #4 step 4)
  const updatedAt = new Date().toISOString();
  const items = (walk && walk.items) || [];
  for (const item of items) {
    if (!_qualifiesAsInitiative(item)) {
      skipped.push({ title: item.title || '(untitled)', reason: 'does_not_qualify' });
      continue;
    }
    const slug = _slugifyInitiativeTitle(item.title);
    if (!slug) {
      skipped.push({ title: item.title || '(untitled)', reason: 'no_slug' });
      continue;
    }
    if (opts.initiative && opts.initiative !== slug) {
      // Single-initiative mode: skip non-matching items silently
      continue;
    }
    // Build initiative data shape
    const data = {
      slug,
      github_issue: item.issue_ref || '',
      parent_project: projectId,
      key_repos: _deriveKeyRepos(item),
      updated_at: updatedAt,
      title: (item.title || slug).replace(/^\[[^\]]+\]\s*/, ''),
      why: _extractWhyFromBody(item.body),
      open_questions: _extractQuestionsFromBody(item.body),
      sub_issues: item.sub_issues || [],
      status: item.item_type === 'draft' ? 'DRAFT' : 'OPEN',
      project_status: item.status,
      quarter: item.quarter,
    };
    try {
      const result = _writeInitiativeFile(home, data);
      written.push(result);
    } catch (e) {
      skipped.push({ title: item.title || slug, reason: `write_failed: ${e.message}` });
    }
  }

  // 4. Stale-deletion loop (TRD 05-03 — NEW)
  // Skipped entirely in single-initiative mode per CONTEXT.md decision #4 step 6.
  if (!opts.initiative) {
    const { stale, warnings: detectWarn } = _detectStaleInitiatives({ home, fresh_items: items });
    warnings.push(...detectWarn);

    if (stale.length > 0) {
      // Non-TTY skip when force=false AND using the real readline (not an injected mock)
      const usingDefaultReadline = _runReadline === _defaultConfirmDeleteStale;
      if (!opts.force && usingDefaultReadline && !process.stdin.isTTY) {
        warnings.push(`stale deletion skipped (non-interactive); ${stale.length} files would be deleted with --force`);
      } else {
        const loop = await _runStaleDeletionLoop({ home, stale_entries: stale, force: Boolean(opts.force) });
        deleted.push(...loop.deleted);
        warnings.push(...loop.warnings);
      }
    }
  }

  return { ok: true, written, deleted, skipped, warnings };
}

// ─── Partial exports — finalized in TRD 05-05 ─────────────────────────────────

module.exports = {
  // Reader (TRD 05-01):
  loadInitiatives,
  matchByRepo,
  formatInitiativeForPlanner,
  _parseInitiativeFile,
  _truncateWhy,

  // Writer (TRD 05-02):
  syncInitiatives,
  _writeInitiativeFile,
  _qualifiesAsInitiative,
  _slugifyInitiativeTitle,
  _renderInitiativeMarkdown,

  // Stale-deletion (TRD 05-03):
  _detectStaleInitiatives,
  _deleteStaleFile,
  _confirmDeleteStale,
  _setRunReadline,

  // Test hooks:
  _setRunFs,
  _setRunGh,
  _resetMocks,

  // Constants:
  INITIATIVES_HOME_REL,
  MAX_WHY_CHARS,
  MAX_QUESTIONS_BULLETS,
  MAX_SUBISSUES_LINES,
  MAX_FORMATTED_PLANNER_CHARS,
  defaultInitiativesHome,
};
