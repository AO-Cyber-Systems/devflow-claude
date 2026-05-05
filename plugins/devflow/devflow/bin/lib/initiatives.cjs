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

// ─── Partial exports — finalized in TRD 05-05 ─────────────────────────────────

module.exports = {
  // Reader (TRD 05-01):
  loadInitiatives,
  matchByRepo,
  formatInitiativeForPlanner,
  _parseInitiativeFile,
  _truncateWhy,

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
