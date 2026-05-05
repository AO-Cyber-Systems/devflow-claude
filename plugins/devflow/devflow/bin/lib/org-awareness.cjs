'use strict';

/**
 * Planning-time org-awareness scanner.
 *
 * Surfaces three signals into CONTEXT.md's `## Cross-Repo Considerations` section:
 *   1. Sibling repos in ~/Source/    (this TRD: scanSiblings)
 *   2. eden-libs reuse candidates    (TRD 03-02: scanLibs)
 *   3. Org Project overlap           (TRD 03-03: scanOrgOverlap)
 * Markdown rendering: TRD 03-04 (formatConsiderations).
 *
 * Module growth across waves:
 *   TRD 03-01: skeleton + scanSiblings + tokenize + _setRunFs   (THIS TRD)
 *   TRD 03-02: scanLibs
 *   TRD 03-03: scanOrgOverlap + misfiling detection
 *   TRD 03-04: formatConsiderations
 *   TRD 03-07: module.exports finalization + integration tests
 *
 * Iron Law: All filesystem operations route through `_runFs.X(...)` so test
 * injection via `_setRunFs(mock)` is reliable. Production code NEVER calls
 * fs.X() directly — always _runFs.X().
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractFrontmatter } = require('./frontmatter.cjs');

// ─── TRD 03-01: Constants ─────────────────────────────────────────────────────

const TOP_N = 3;
const SUMMARY_RECENCY_DAYS = 90;
const DEFAULT_SIBLING_GLOB = '~/Source/*/';
const DEFAULT_EDEN_LIBS_PATH = '~/Source/eden-libs';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'in', 'on', 'with', 'to', 'from', 'by', 'at',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
]);

// ─── TRD 03-01: Filesystem injection hook ────────────────────────────────────
//
// Mirror of _setRunGit / _setRunGh pattern from awareness.cjs and gh.cjs.
// All production fs calls go through _runFs.X() — never fs.X() directly.

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};

let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetFsMock() { _runFs = realFs; }

// ─── TRD 03-01: Tokenization helper ──────────────────────────────────────────

/**
 * Tokenize text for keyword overlap scoring.
 *
 * Algorithm (locked per CONTEXT.md §"Token extraction"):
 *   1. Lowercase
 *   2. Strip non-alphanumeric (except spaces, hyphens, underscores, slashes)
 *   3. Split on whitespace + hyphen + underscore + slash
 *   4. Filter tokens with length < 3
 *   5. Remove stop-words
 *   6. Deduplicate (return as Set)
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function _tokenize(text) {
  if (!text || typeof text !== 'string') return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/]/g, ' ')   // strip non-alphanumeric except separators
    .split(/[\s\-_/]+/)                   // split on whitespace + separators
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

// ─── TRD 03-01: Scoring formula ──────────────────────────────────────────────

/**
 * Compute Jaccard-like token intersection score.
 *
 * Formula: |a ∩ b| / max(|a|, |b|) → [0, 1]
 * Avoids divide-by-zero when either set is empty (returns 0).
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
function _score(a, b) {
  if (!a || !b || a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  return intersection / Math.max(a.size, b.size);
}

// ─── TRD 03-01: Path helpers ──────────────────────────────────────────────────

function _expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (p === '~') return os.homedir();
  return p;
}

// ─── TRD 03-01: Sibling repo discovery ───────────────────────────────────────

/**
 * Discover candidate sibling repo paths.
 *
 * Returns { paths: string[], warnings: string[] }.
 *
 * Default: walks ~/Source/ (glob: star-slash) for dirs with both .git and .planning.
 * Configured: awareness.sibling_repos in config.json replaces default entirely.
 *
 * The current repo (cwd) is always excluded.
 *
 * @param {object} opts
 * @param {string}   opts.cwd             - current repo path (excluded from results)
 * @param {string[]|null} opts.config_paths - configured sibling paths (null = use default)
 * @returns {{ paths: string[], warnings: string[] }}
 */
function _discoverSiblings({ cwd = process.cwd(), config_paths = null } = {}) {
  const out = { paths: [], warnings: [] };
  const currentRepoAbs = path.resolve(cwd);

  let candidatePaths = [];

  if (Array.isArray(config_paths) && config_paths.length > 0) {
    // Configured paths REPLACE default (no merge) — per locked decision #5
    for (const cp of config_paths) {
      const expanded = _expandHome(cp);
      if (!_runFs.existsSync(expanded)) {
        out.warnings.push(`configured sibling path not found: ${cp}`);
        continue;
      }
      candidatePaths.push(expanded);
    }
  } else {
    // Default: walk ~/Source/*/ — readdir the parent
    const sourceRoot = _expandHome('~/Source');
    if (!_runFs.existsSync(sourceRoot)) {
      out.warnings.push(`default sibling root not found: ${sourceRoot}`);
      return out;
    }
    let entries;
    try {
      entries = _runFs.readdirSync(sourceRoot);
    } catch (e) {
      out.warnings.push(`readdir failed for ${sourceRoot}: ${e.message}`);
      return out;
    }
    for (const name of entries) {
      candidatePaths.push(path.join(sourceRoot, name));
    }
  }

  for (const p of candidatePaths) {
    // Exclude current repo
    if (path.resolve(p) === currentRepoAbs) continue;

    // Must be a directory
    try {
      if (!_runFs.statSync(p).isDirectory()) continue;
    } catch {
      continue;
    }

    // Must have .git (is a git repo)
    if (!_runFs.existsSync(path.join(p, '.git'))) continue;

    // Must have .planning (is a DevFlow project)
    if (!_runFs.existsSync(path.join(p, '.planning'))) continue;

    out.paths.push(p);
  }

  return out;
}

// ─── TRD 03-01: PROJECT.md reader ────────────────────────────────────────────

/**
 * Read and parse PROJECT.md frontmatter for a repo.
 * Returns frontmatter object or null (silently) if absent or unreadable.
 *
 * @param {string} repoPath
 * @returns {object|null}
 */
function _readProjectMd(repoPath) {
  const p = path.join(repoPath, 'PROJECT.md');
  if (!_runFs.existsSync(p)) return null;
  try {
    const content = _runFs.readFileSync(p, 'utf-8');
    // extractFrontmatter returns the parsed frontmatter object directly (not { frontmatter, body })
    const frontmatter = extractFrontmatter(content);
    return frontmatter || {};
  } catch {
    return null;
  }
}

// ─── TRD 03-01: Recent SUMMARY.md reader ─────────────────────────────────────

/**
 * Walk a sibling's .planning/objectives/ and collect recent SUMMARY.md files.
 * "Recent" = mtime within the last SUMMARY_RECENCY_DAYS days.
 *
 * Returns { items: Array<{ obj, path, mtime, body }>, warnings: string[] }.
 *
 * @param {string} repoPath
 * @param {number} [recencyMs]
 * @returns {{ items: object[], warnings: string[] }}
 */
function _readRecentSummaries(repoPath, recencyMs = SUMMARY_RECENCY_DAYS * 86400000) {
  const out = { items: [], warnings: [] };
  const objDir = path.join(repoPath, '.planning', 'objectives');

  if (!_runFs.existsSync(objDir)) return out;

  let entries;
  try {
    entries = _runFs.readdirSync(objDir);
  } catch (e) {
    out.warnings.push(`readdir ${objDir} failed: ${e.message}`);
    return out;
  }

  const now = Date.now();

  for (const objName of entries) {
    const subDir = path.join(objDir, objName);
    let subEntries;
    try {
      subEntries = _runFs.readdirSync(subDir);
    } catch {
      continue;
    }

    for (const f of subEntries) {
      if (!/SUMMARY\.md$/.test(f)) continue;

      const filePath = path.join(subDir, f);
      let stat;
      try {
        stat = _runFs.statSync(filePath);
      } catch {
        continue;
      }

      // Recency filter — mtime-based (cheaper than git log per CONTEXT.md §Gotchas)
      if ((now - stat.mtimeMs) > recencyMs) continue;

      let body;
      try {
        body = _runFs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        out.warnings.push(`read ${filePath} failed: ${e.message}`);
        body = '';
      }

      out.items.push({ obj: objName, path: filePath, mtime: stat.mtimeMs, body });
    }
  }

  return out;
}

// ─── TRD 03-01: Current objective token extraction ───────────────────────────

/**
 * Extract tokens for the current objective being planned.
 *
 * Tries:
 *   1. OBJECTIVE.md frontmatter title + body (first 2000 chars)
 *   2. Falls back to objective_id slug tokens
 *
 * Per CONTEXT.md §"Gotchas": if OBJECTIVE.md absent, uses slug — does not throw.
 *
 * @param {string} objective_id
 * @param {string} cwd
 * @returns {Set<string>}
 */
function _readCurrentObjectiveTokens(objective_id, cwd) {
  const tokens = new Set();

  // Always include tokens from the objective_id slug
  for (const t of _tokenize(objective_id)) tokens.add(t);

  // Try to find the objective's directory
  const objsDir = path.join(cwd, '.planning', 'objectives');
  if (!_runFs.existsSync(objsDir)) return tokens;

  let objs;
  try {
    objs = _runFs.readdirSync(objsDir);
  } catch {
    return tokens;
  }

  // Find the matching objective directory
  const matching = objs.find(
    (n) => n.startsWith(`${objective_id}-`) || n === objective_id,
  );
  if (!matching) return tokens;

  // Try to read OBJECTIVE.md
  const objMdPath = path.join(objsDir, matching, 'OBJECTIVE.md');
  if (!_runFs.existsSync(objMdPath)) return tokens;

  try {
    const content = _runFs.readFileSync(objMdPath, 'utf-8');
    // extractFrontmatter returns the parsed frontmatter object directly
    const frontmatter = extractFrontmatter(content);
    if (frontmatter && frontmatter.title) {
      for (const t of _tokenize(frontmatter.title)) tokens.add(t);
    }
    // Extract body text: everything after the closing --- of frontmatter
    const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : content;
    if (body) {
      for (const t of _tokenize(body.slice(0, 2000))) tokens.add(t);
    }
  } catch {
    // swallow — fallback tokens from slug are sufficient
  }

  return tokens;
}

// ─── TRD 03-01: scanSiblings ─────────────────────────────────────────────────

/**
 * Scan sibling repos for recent work overlapping with the current objective.
 *
 * Returns:
 *   {
 *     matches: Array<{
 *       repo: string,
 *       path: string,
 *       score: number,
 *       best_objective: string|null,
 *       best_summary_mtime: number|null,
 *       summary_count: number,
 *     }>,
 *     warnings: string[],
 *     scanned_repos: number,
 *   }
 *
 * Top-N by score desc, tie-break by best_summary_mtime desc.
 * Results truncated to TOP_N (3).
 *
 * @param {object} opts
 * @param {string}          opts.objective_id   - current objective ID (required)
 * @param {string}          [opts.cwd]          - current repo path (default: process.cwd())
 * @param {string[]|null}   [opts.config_paths] - overrides default ~/Source discovery
 * @returns {object}
 */
function scanSiblings({ objective_id, cwd = process.cwd(), config_paths = null } = {}) {
  if (!objective_id) throw new Error('scanSiblings: objective_id is required');

  const out = { matches: [], warnings: [], scanned_repos: 0 };

  // Get current objective tokens (for scoring against siblings)
  const currentTokens = _readCurrentObjectiveTokens(objective_id, cwd);

  // Get current repo's org (for filtering)
  const currentProject = _readProjectMd(cwd);
  const currentOrg = currentProject ? (currentProject.org || null) : null;

  // Discover sibling repos
  const disc = _discoverSiblings({ cwd, config_paths });
  out.warnings.push(...disc.warnings);

  if (disc.paths.length === 0 && disc.warnings.length === 0) {
    out.warnings.push('no sibling repos discovered');
  }

  for (const siblingPath of disc.paths) {
    const sibProj = _readProjectMd(siblingPath);

    // Per CONTEXT.md §"Error recovery": missing PROJECT.md → silently skip
    if (!sibProj) continue;

    // Org filtering (per locked decision #5):
    // - If current has org and sibling has org → must match
    // - If current has org and sibling lacks org → exclude
    // - If current lacks org → include all (fallback)
    if (currentOrg) {
      if (sibProj.org && sibProj.org !== currentOrg) continue;
      if (!sibProj.org) continue;
    }

    out.scanned_repos++;

    // Read recent SUMMARY.md files
    const recents = _readRecentSummaries(siblingPath);
    out.warnings.push(...recents.warnings);

    // Score: best token overlap across all recent summaries
    let bestScore = 0;
    let bestObj = null;
    let bestMtime = 0;

    for (const item of recents.items) {
      const tokens = _tokenize(item.body);
      const score = _score(currentTokens, tokens);
      if (score > bestScore || (score === bestScore && item.mtime > bestMtime)) {
        bestScore = score;
        bestObj = item.obj;
        bestMtime = item.mtime;
      }
    }

    out.matches.push({
      repo: path.basename(siblingPath),
      path: siblingPath,
      score: bestScore,
      best_objective: bestObj,
      best_summary_mtime: bestMtime || null,
      summary_count: recents.items.length,
    });
  }

  // Sort: score desc, then mtime desc (tie-break by recency)
  out.matches.sort(
    (a, b) =>
      b.score - a.score ||
      ((b.best_summary_mtime || 0) - (a.best_summary_mtime || 0)),
  );

  // Truncate to TOP_N
  out.matches = out.matches.slice(0, TOP_N);

  return out;
}

// ─── TRD 03-01: Partial exports ───────────────────────────────────────────────
//
// This export block is the AUTHORITATIVE surface FOR THIS WAVE only.
// TRDs 03-02, 03-03, 03-04 each extend this block. TRD 03-07 finalizes it
// (asserts the full export surface via Object.keys deepStrictEqual).

module.exports = {
  scanSiblings,
  _setRunFs,
  _resetFsMock,
  _tokenize,          // exported for tests; internal callers use directly
  _score,             // exported for tests
  TOP_N,
  SUMMARY_RECENCY_DAYS,
  DEFAULT_SIBLING_GLOB,
  DEFAULT_EDEN_LIBS_PATH,
};
