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

// ─── TRD 03-02: scanLibs (eden-libs reuse scanner) ────────────────────────────

/**
 * Split a camelCase or PascalCase identifier into its component parts.
 *
 * 'parseStateMd' → ['parse', 'State', 'Md']
 * 'GH' → ['GH']
 * '' → []
 *
 * Downstream callers pass each part to _tokenize for lowercase + stop-word + length filter.
 *
 * @param {string} name
 * @returns {string[]}
 */
function _camelSplit(name) {
  if (!name || typeof name !== 'string') return [];
  return name.replace(/([A-Z]+)/g, ' $1').trim().split(/\s+/).filter(Boolean);
}

/**
 * Extract exported symbol names from source text using regex-based parsing.
 *
 * Handles:
 *   - CommonJS: module.exports.foo = ...
 *   - CommonJS: exports.bar = ...
 *   - CommonJS object literal: module.exports = { a, b: x, c };
 *   - ES Modules: export function foo() / export const bar / export class Baz
 *   - ES Modules: export { foo, bar }
 *
 * Skips export default (no useful symbol name for lexical matching).
 * Best-effort — does not strip comments (PE10: accepted behavior).
 *
 * @param {string} source
 * @returns {string[]}
 */
function _parseExports(source) {
  if (!source || typeof source !== 'string') return [];
  const names = new Set();

  let m;

  // CommonJS: module.exports.foo = ... OR exports.foo = ...
  // Use the full prefix match to avoid double-matching module.exports.foo
  const reCjsAssignModule = /module\.exports\.(\w+)\s*=/g;
  while ((m = reCjsAssignModule.exec(source)) !== null) {
    names.add(m[1]);
  }
  const reCjsAssignExports = /(?:^|[\s;])exports\.(\w+)\s*=/gm;
  while ((m = reCjsAssignExports.exec(source)) !== null) {
    names.add(m[1]);
  }

  // CommonJS object literal: module.exports = { a, b: x, c };
  // Match only the FIRST occurrence; tolerant of newlines inside braces.
  const reCjsObj = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?/;
  m = source.match(reCjsObj);
  if (m) {
    const inside = m[1];
    // Split on commas — this is good-enough for flat export objects
    const parts = inside.split(/,(?![^{[]*[}\]])/);
    for (const p of parts) {
      const trimmed = p.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('...')) continue;
      const km = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (km) names.add(km[1]);
    }
  }

  // ES Modules: export function foo() / export const bar / export class Baz / export let / export var
  // Must NOT match 'export default function foo()' — check there's no 'default' between 'export' and keyword
  const reEsmDecl = /export\s+(?!default\s+)(function|const|let|var|class)\s+(\w+)/g;
  while ((m = reEsmDecl.exec(source)) !== null) {
    names.add(m[2]);
  }

  // ES Modules: export { foo, bar } or export { foo as bar }
  // Match only named (non-default) re-exports
  const reEsmList = /export\s+\{([^}]*)\}/g;
  while ((m = reEsmList.exec(source)) !== null) {
    const parts = m[1].split(',');
    for (const p of parts) {
      const trimmed = p.trim();
      // 'foo' or 'foo as bar' — use local name (before 'as')
      const km = trimmed.match(/^(\w+)(?:\s+as\s+\w+)?$/);
      if (km && km[1] !== 'default') names.add(km[1]);
    }
  }

  return Array.from(names);
}

/**
 * Resolve the eden-libs filesystem path.
 *
 * Priority (highest wins):
 *   1. opts.path (explicit override)
 *   2. awareness.eden_libs_path in .planning/config.json
 *   3. DEFAULT_EDEN_LIBS_PATH (~/ Source/eden-libs)
 *
 * All paths are home-expanded via _expandHome.
 *
 * @param {object} opts
 * @param {string} [cwd]
 * @returns {string}
 */
function _resolveEdenLibsPath(opts = {}, cwd = process.cwd()) {
  if (opts.path) return _expandHome(opts.path);

  // Check .planning/config.json
  const configPath = path.join(cwd, '.planning', 'config.json');
  if (_runFs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(_runFs.readFileSync(configPath, 'utf-8'));
      if (cfg && cfg.awareness && cfg.awareness.eden_libs_path) {
        return _expandHome(cfg.awareness.eden_libs_path);
      }
    } catch {
      // Ignore malformed config; fall through to default
    }
  }

  return _expandHome(DEFAULT_EDEN_LIBS_PATH);
}

/**
 * Resolve entrypoint file paths from package.json `main` and `exports` fields.
 *
 * Handles:
 *   - pkg.main: string → single entrypoint
 *   - pkg.exports: string → single entrypoint
 *   - pkg.exports: object → walk all values, collect .cjs/.js/.mjs/.ts paths
 *
 * @param {string} repoRoot
 * @param {object} pkg
 * @returns {string[]}
 */
function _entrypointsFromPackageJson(repoRoot, pkg) {
  const out = [];

  if (typeof pkg.main === 'string') {
    out.push(path.join(repoRoot, pkg.main));
  }

  if (pkg.exports) {
    if (typeof pkg.exports === 'string') {
      out.push(path.join(repoRoot, pkg.exports));
    } else if (typeof pkg.exports === 'object' && pkg.exports !== null) {
      const walk = (node) => {
        if (typeof node === 'string') {
          if (/\.(cjs|mjs|js|ts)$/.test(node)) {
            out.push(path.join(repoRoot, node));
          }
        } else if (typeof node === 'object' && node !== null) {
          for (const k of Object.keys(node)) walk(node[k]);
        }
      };
      walk(pkg.exports);
    }
  }

  // Deduplicate
  return Array.from(new Set(out));
}

/**
 * Scan eden-libs for exported symbols matching the current objective's tokens.
 *
 * Returns:
 *   {
 *     candidates: Array<{
 *       symbol: string,
 *       entrypoint: string,
 *       tokens_matched: number,
 *       symbol_tokens: string[],
 *     }>,
 *     warnings: string[],
 *     scanned: boolean,
 *     path: string|null,
 *   }
 *
 * Top-N by tokens_matched desc (up to TOP_N = 3).
 * Empty-eden-libs: returns { candidates: [], warnings: ['eden-libs has no exported surface'], scanned: true }.
 * Missing path:    returns { candidates: [], warnings: ['eden-libs not found at ...'], scanned: false }.
 *
 * Lexical match only — no LLM, no embeddings (per CONTEXT.md locked decision #2).
 *
 * @param {object} opts
 * @param {string}      [opts.path]           - explicit eden-libs path (overrides config + default)
 * @param {Set<string>} [opts.current_tokens] - tokens from the current objective
 * @param {string}      [opts.cwd]            - working directory for config resolution
 * @returns {object}
 */
function scanLibs({ path: optPath, current_tokens, cwd = process.cwd() } = {}) {
  const out = { candidates: [], warnings: [], scanned: false, path: null };
  const resolved = _resolveEdenLibsPath({ path: optPath }, cwd);
  out.path = resolved;

  if (!_runFs.existsSync(resolved)) {
    out.warnings.push(`eden-libs not found at ${resolved}`);
    return out;
  }

  out.scanned = true;

  // Resolve entrypoints from package.json
  const pkgPath = path.join(resolved, 'package.json');
  let entrypoints = [];

  if (_runFs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(_runFs.readFileSync(pkgPath, 'utf-8'));
      entrypoints = _entrypointsFromPackageJson(resolved, pkg);
    } catch (e) {
      out.warnings.push(`malformed package.json: ${e.message}`);
    }
  }

  // Fallback to index.* at root if no entrypoints from package.json
  if (entrypoints.length === 0) {
    for (const fname of ['index.cjs', 'index.js', 'index.mjs', 'index.ts']) {
      const p = path.join(resolved, fname);
      if (_runFs.existsSync(p)) entrypoints.push(p);
    }
  }

  if (entrypoints.length === 0) {
    out.warnings.push(`no package.json or index.* found at ${resolved}`);
    return out;
  }

  // Parse exports from all entrypoints
  const allExports = new Map(); // symbol → entrypoint path (first occurrence wins)
  for (const ep of entrypoints) {
    let src;
    try {
      src = _runFs.readFileSync(ep, 'utf-8');
    } catch (e) {
      out.warnings.push(`read ${ep} failed: ${e.message}`);
      continue;
    }
    for (const sym of _parseExports(src)) {
      if (!allExports.has(sym)) allExports.set(sym, ep);
    }
  }

  if (allExports.size === 0) {
    out.warnings.push('eden-libs has no exported surface');
    return out;
  }

  // Score each symbol against current_tokens using camelSplit decomposition
  const tokens = current_tokens instanceof Set ? current_tokens : new Set();
  const scored = [];

  for (const [sym, ep] of allExports.entries()) {
    // Decompose symbol with camelSplit, then tokenize each part
    const symTokens = new Set();
    for (const part of _camelSplit(sym)) {
      const lc = part.toLowerCase();
      if (lc.length >= 3 && !STOP_WORDS.has(lc)) symTokens.add(lc);
    }

    let matchCount = 0;
    for (const t of tokens) {
      if (symTokens.has(t)) matchCount++;
    }

    scored.push({
      symbol: sym,
      entrypoint: ep,
      tokens_matched: matchCount,
      symbol_tokens: Array.from(symTokens),
    });
  }

  // Sort by tokens_matched desc, tie-break alphabetically
  scored.sort((a, b) => (b.tokens_matched - a.tokens_matched) || a.symbol.localeCompare(b.symbol));

  out.candidates = scored.slice(0, TOP_N);
  return out;
}

// ─── TRD 03-03: scanOrgOverlap + misfiling detection ─────────────────────────

const aw = require('./awareness.cjs');
const gh = require('./gh.cjs');

/**
 * Extract the owner/repo portion from a GitHub issue ref.
 *
 * Examples:
 *   'AO-Cyber-Systems/devflow-claude#9'     → 'AO-Cyber-Systems/devflow-claude'
 *   'https://github.com/Owner/repo#12'      → 'Owner/repo'
 *   '#9'  (shorthand — no repo portion)     → null
 *   null / non-string                        → null
 *
 * @param {string|null} ref
 * @returns {string|null}
 */
function _extractRepoFromRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  // Strip leading https://github.com/ prefix if present
  const cleaned = ref.replace(/^https?:\/\/github\.com\//, '');
  const idx = cleaned.indexOf('#');
  // idx <= 0 means no # found (idx === -1) or # is the first char (shorthand like '#9')
  if (idx <= 0) return null;
  return cleaned.slice(0, idx);
}

/**
 * Detect whether the current objective may be misfiled.
 *
 * Advisory only — returns null on any condition that cannot be compared cleanly.
 * Per CONTEXT.md locked decision #7: no AskUserQuestion, no hard fail, no checkpoint.
 *
 * @param {object} chain     - resolveChain output (may be partial/empty)
 * @param {object} projectCtx - current PROJECT.md parsed frontmatter
 * @returns {{ current_repo: string, resolved_repo: string, message: string } | null}
 */
function _detectMisfiling(chain, projectCtx) {
  if (!projectCtx || !projectCtx.github_repo) return null;
  if (!chain || !chain.roadmap_issue) return null;
  const resolvedRepo = _extractRepoFromRef(chain.roadmap_issue);
  if (!resolvedRepo) return null;
  if (resolvedRepo === projectCtx.github_repo) return null;
  return {
    current_repo: projectCtx.github_repo,
    resolved_repo: resolvedRepo,
    message: `this objective's resolved [Roadmap] is in '${resolvedRepo}' but current repo is '${projectCtx.github_repo}'. Possible misfile — consider whether this objective belongs in '${resolvedRepo}' instead.`,
  };
}

/**
 * Score a single org item against the current objective.
 *
 * Algorithm (per CONTEXT.md §"Org-overlap scanner"):
 *   +10 if any sub-issue ref's repo matches a sibling repo (chain-match boost)
 *   +1 per shared keyword between (item title + body) tokens and currentTokens
 *
 * @param {object}      item           - org scan item (title, body, sub_issues)
 * @param {Set<string>} currentTokens  - tokenized current objective
 * @param {string[]}    siblingRepos   - sibling repo refs (owner/repo form)
 * @returns {{ total: number, chain_match: boolean, matched_keywords: string[] }}
 */
function _scoreOrgItem(item, currentTokens, siblingRepos) {
  const out = { total: 0, chain_match: false, matched_keywords: [] };
  const subs = Array.isArray(item.sub_issues) ? item.sub_issues : [];

  // Chain-match boost: +10 if any sub-issue's repo is in siblingRepos
  for (const s of subs) {
    const repo = _extractRepoFromRef(s.ref);
    if (repo && Array.isArray(siblingRepos) && siblingRepos.includes(repo)) {
      out.chain_match = true;
      out.total += 10;
      break; // one chain-match per item is enough for the +10
    }
  }

  // Keyword overlap: +1 per shared token between currentTokens and item title+body tokens
  if (currentTokens && currentTokens.size > 0) {
    const itemText = [item.title || '', item.body || ''].join(' ');
    const itemTokens = _tokenize(itemText);
    for (const t of currentTokens) {
      if (itemTokens.has(t)) {
        out.total += 1;
        out.matched_keywords.push(t);
      }
    }
  }

  return out;
}

/**
 * Scan the org's Product Roadmap for items overlapping with the current objective.
 *
 * Composes obj 2's `scanOrg` and obj 1's `resolveChain` for misfiling detection.
 *
 * CRITICAL: this function MUST NOT propagate GhAuthError — it catches it and
 * returns `{ items: [], warnings: [...], skipped: true, misfiling: null }`.
 * Plan-time consultation is advisory; missing auth means one signal source is
 * absent, not a planning failure (CONTEXT.md locked decision #8).
 *
 * Non-auth errors ARE propagated so true bugs surface.
 *
 * @param {object}      [opts]
 * @param {string}      [opts.objective_id]    - current objective ID (for logging)
 * @param {Set<string>} [opts.current_tokens]  - tokenized current objective tokens
 * @param {string[]}    [opts.sibling_repos]   - sibling repo refs for chain-match scoring
 * @param {object}      [opts.frontmatter]     - current objective frontmatter (for resolveChain)
 * @param {object}      [opts.projectCtx]      - current PROJECT.md context (for misfiling check)
 * @returns {{ items: object[], warnings: string[], skipped: boolean, misfiling: object|null }}
 */
function scanOrgOverlap({
  objective_id,
  current_tokens = new Set(),
  sibling_repos = [],
  frontmatter = {},
  projectCtx = {},
} = {}) {
  const out = {
    items: [],
    warnings: [],
    skipped: false,
    misfiling: null,
  };

  // 1. Run org scan — with GhAuthError graceful degradation guard
  let scanResult = null;
  try {
    scanResult = aw.scanOrg();
  } catch (e) {
    if (e && e.name === 'GhAuthError') {
      // GRACEFUL DEGRADATION: return skipped shape per locked decision #8
      out.skipped = true;
      out.warnings.push(
        `org-overlap unavailable: ${e.message}. Run: ${e.remediation || 'gh auth refresh -h github.com -s project,read:project,repo'}`,
      );
      return out; // misfiling stays null
    }
    // Non-auth errors re-thrown so true bugs surface
    throw e;
  }

  // 2. Propagate any warnings from scanOrg
  if (Array.isArray(scanResult.warnings)) {
    out.warnings.push(...scanResult.warnings);
  }

  // 3. Score each item
  const scored = (scanResult.items || []).map(item => {
    const s = _scoreOrgItem(item, current_tokens, sibling_repos);
    return {
      issue_ref: item.issue_ref || null,
      title: item.title || '',
      score: s.total,
      matched_keywords: s.matched_keywords,
      chain_match: s.chain_match,
    };
  });

  // Sort: score desc, tie-break alphabetically by title
  scored.sort((a, b) => (b.score - a.score) || (a.title || '').localeCompare(b.title || ''));

  // Truncate to TOP_N
  out.items = scored.slice(0, TOP_N);

  // 4. Misfiling check — with its own independent try/catch (resolveChain may also throw)
  try {
    const chain = gh.resolveChain(frontmatter, projectCtx);
    out.misfiling = _detectMisfiling(chain, projectCtx);
    // Surface any warnings from resolveChain
    if (Array.isArray(chain && chain.warnings)) {
      out.warnings.push(...chain.warnings);
    }
  } catch (e) {
    out.warnings.push(`misfiling check skipped: ${e.message}`);
    out.misfiling = null;
  }

  return out;
}

// ─── TRD 03-04: formatConsiderations Markdown renderer ────────────────────────
//
// Pure formatter — no fs/network side effects.
// Input: { siblings, libs, org_overlap } (pre-computed scan results)
// Output: Markdown string — 3 fixed subsections in fixed order, no leading ## header.
//
// Section length bounded: TOP_N=3 entries per subsection, one-line entries,
// total output comfortably under 2000 chars (F5 regression guard).

/**
 * Render the `### Sibling repos` subsection.
 *
 * @param {object} scans - { siblings: { matches: [...] } }
 * @returns {string}
 */
function _renderSiblingsSection(scans) {
  const lines = ['### Sibling repos'];
  const matches = ((scans && scans.siblings && scans.siblings.matches) || []).slice(0, TOP_N);
  if (matches.length === 0) {
    lines.push('_(no matches)_');
    return lines.join('\n');
  }
  for (const m of matches) {
    const objPart = m.best_objective ? `(objective ${m.best_objective})` : '';
    const scoreStr = (typeof m.score === 'number') ? m.score.toFixed(2) : 'N/A';
    const summaryPart = (typeof m.summary_count === 'number') ? `(${m.summary_count} recent summaries)` : '';
    const parts = [
      `\`${m.repo}\``,
      objPart,
      `— score ${scoreStr}`,
      summaryPart,
    ].filter(Boolean);
    lines.push(`- ${parts.join(' ')}`);
  }
  return lines.join('\n');
}

/**
 * Render the `### eden-libs candidates` subsection.
 *
 * @param {object} scans - { libs: { candidates: [...], scanned: boolean } }
 * @returns {string}
 */
function _renderLibsSection(scans) {
  const lines = ['### eden-libs candidates'];
  const candidates = ((scans && scans.libs && scans.libs.candidates) || []).slice(0, TOP_N);
  if (candidates.length === 0) {
    lines.push('_(no matches)_');
    return lines.join('\n');
  }
  for (const c of candidates) {
    const tokensPart = (typeof c.tokens_matched === 'number' && c.tokens_matched > 0)
      ? ` (${c.tokens_matched} token match${c.tokens_matched > 1 ? 'es' : ''})`
      : '';
    const entrypoint = c.entrypoint ? path.basename(c.entrypoint) : 'unknown';
    lines.push(`- \`${c.symbol}\`${tokensPart} — exported from \`${entrypoint}\``);
  }
  return lines.join('\n');
}

/**
 * Render the `### Org Project overlap` subsection.
 *
 * When skipped (auth unavailable): renders placeholder and OMITS misfiling line.
 * When not skipped: renders items (capped at TOP_N) + misfiling line (always).
 *
 * @param {object} scans - { org_overlap: { items, warnings, skipped, misfiling } }
 * @returns {string}
 */
function _renderOrgSection(scans) {
  const lines = ['### Org Project overlap'];
  const oo = (scans && scans.org_overlap) || {};

  if (oo.skipped) {
    lines.push('_(skipped: gh auth not available — run `gh auth refresh -h github.com -s project,read:project,repo` to enable)_');
    return lines.join('\n');
  }

  const items = (oo.items || []).slice(0, TOP_N);
  if (items.length === 0) {
    lines.push('_(no matches)_');
  } else {
    for (const it of items) {
      const chainTag = it.chain_match ? ' **[chain match]**' : '';
      const kwPart = (Array.isArray(it.matched_keywords) && it.matched_keywords.length > 0)
        ? ` (matched: ${it.matched_keywords.join(', ')})`
        : '';
      const issueRef = it.issue_ref || '(no ref)';
      lines.push(`- \`${issueRef}\` — ${it.title}${chainTag} — score ${it.score}${kwPart}`);
    }
  }

  // Misfiling line — always rendered when not skipped (blank line separator before)
  lines.push('');
  if (oo.misfiling) {
    lines.push(`_Misfiling check: ${oo.misfiling.message || `resolved ${oo.misfiling.resolved_repo} differs from current ${oo.misfiling.current_repo}`}_`);
  } else {
    lines.push('_Misfiling check: no mismatch detected._');
  }

  return lines.join('\n');
}

/**
 * Format all three scan results into the `## Cross-Repo Considerations` section body.
 *
 * IMPORTANT: output does NOT include the `## Cross-Repo Considerations` header —
 * the caller (skill or test) adds it. This function outputs the section BODY only
 * (the three subsections with blank line separators).
 *
 * @param {object} scans - { siblings, libs, org_overlap }
 * @returns {string}
 */
function formatConsiderations(scans) {
  const sections = [
    _renderSiblingsSection(scans),
    _renderLibsSection(scans),
    _renderOrgSection(scans),
  ];
  return sections.join('\n\n');
}

// ─── TRD 03-01 → TRD 03-04: Partial exports ──────────────────────────────────
//
// This export block is the AUTHORITATIVE surface FOR THIS WAVE only.
// TRD 03-07 finalizes it (asserts the full export surface via Object.keys deepStrictEqual).

module.exports = {
  scanSiblings,
  scanLibs,               // TRD 03-02
  scanOrgOverlap,         // TRD 03-03
  formatConsiderations,   // TRD 03-04
  _renderSiblingsSection, // TRD 03-04
  _renderLibsSection,     // TRD 03-04
  _renderOrgSection,      // TRD 03-04
  _setRunFs,
  _resetFsMock,
  _tokenize,              // exported for tests; internal callers use directly
  _score,                 // exported for tests
  _camelSplit,            // TRD 03-02
  _parseExports,          // TRD 03-02
  _resolveEdenLibsPath,   // TRD 03-02
  _detectMisfiling,       // TRD 03-03
  _scoreOrgItem,          // TRD 03-03
  _extractRepoFromRef,    // TRD 03-03
  TOP_N,
  SUMMARY_RECENCY_DAYS,
  DEFAULT_SIBLING_GLOB,
  DEFAULT_EDEN_LIBS_PATH,
};
