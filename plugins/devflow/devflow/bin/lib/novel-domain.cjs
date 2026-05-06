'use strict';

/**
 * novel-domain.cjs — Novel-domain detector
 *
 * Implements `df-tools detect novel-domain <objective>`:
 * - Pure logic, no LLM, no network
 * - Signals: NEW_DEP, MISSING_PATTERNS, COMPARISON_KEYWORD
 * - Failsafe-permissive: errors return { novel: false, error: "..." }
 *
 * Output shape (from 14-RESEARCH.md):
 * {
 *   novel: boolean,
 *   signals: {
 *     new_dep: { fired: boolean, candidates: string[] },
 *     missing_patterns: { fired: boolean },
 *     comparison_keyword: { fired: boolean, matched: string[] }
 *   },
 *   recommendation: "spawn objective-researcher" | null
 * }
 */

const fs = require('fs');
const path = require('path');
const { output, error, safeReadFile } = require('./helpers.cjs');
const { findObjectiveInternal } = require('./objective.cjs');

// ─── detectComparisonKeyword ──────────────────────────────────────────────────

/**
 * Regex: matches evaluate, compare, choose between, select between, vs. (with period).
 * Word-boundary anchored and case-insensitive.
 * NOTE: `vs\.` uses literal period to avoid matching "VS Code" (no trailing \b since . is non-word char).
 * GOTCHA from TRD: `vs\.` with explicit period → fires on "Postgres vs. SQLite", NOT on "VS Code"
 *
 * Implementation: two separate regexes to handle vs. separately (trailing \b fails after `.`).
 */
const COMPARISON_VERB_RE = /\b(evaluate|compare|choose between|select between)\b/gi;
const COMPARISON_VS_RE = /\bvs\./gi;

/**
 * Pure function — detects comparison keywords in description text.
 *
 * @param {string} description
 * @returns {{ fired: boolean, matched: string[] }}
 */
function detectComparisonKeyword(description) {
  if (!description || typeof description !== 'string') {
    return { fired: false, matched: [] };
  }

  const matched = [];
  let m;

  // Match evaluate, compare, choose between, select between (word-boundary on both sides)
  COMPARISON_VERB_RE.lastIndex = 0;
  while ((m = COMPARISON_VERB_RE.exec(description)) !== null) {
    matched.push(m[0]);
  }

  // Match vs. (literal period — no trailing \b since . is a non-word char)
  // This fires on "vs." but not "VS Code" (no period after "VS" in "VS Code")
  COMPARISON_VS_RE.lastIndex = 0;
  while ((m = COMPARISON_VS_RE.exec(description)) !== null) {
    matched.push(m[0]);
  }

  return { fired: matched.length > 0, matched };
}

// ─── detectNewDep ─────────────────────────────────────────────────────────────

/**
 * Package name regex: matches @scope/name or name patterns.
 * Per GOTCHA: only extract tokens that appear in backticks, code blocks, or
 * after npm install / yarn add keywords (not arbitrary English words).
 *
 * Extraction approach:
 * 1. Backtick-wrapped tokens: `package-name`
 * 2. npm install / yarn add arguments
 * 3. Scoped packages explicitly: @scope/name even without backticks
 */
const PKG_IN_BACKTICKS_RE = /`(@?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?)`/g;
const PKG_AFTER_INSTALL_RE = /(?:npm install|npm i|yarn add)\s+(@?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?)/g;
const SCOPED_PKG_RE = /@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*/g;

/**
 * Extract package-name-shaped tokens from description text.
 * Only considers tokens in backticks, after npm/yarn install keywords, or scoped packages.
 *
 * @param {string} description
 * @returns {string[]} unique package name tokens
 */
function extractPackageTokens(description) {
  if (!description || typeof description !== 'string') return [];

  const found = new Set();

  // Pattern 1: `package-name` in backticks
  PKG_IN_BACKTICKS_RE.lastIndex = 0;
  let m;
  while ((m = PKG_IN_BACKTICKS_RE.exec(description)) !== null) {
    found.add(m[1]);
  }

  // Pattern 2: after npm install / yarn add
  PKG_AFTER_INSTALL_RE.lastIndex = 0;
  while ((m = PKG_AFTER_INSTALL_RE.exec(description)) !== null) {
    found.add(m[1]);
  }

  // Pattern 3: @scope/name (scoped packages) even without backticks — distinctive shape
  SCOPED_PKG_RE.lastIndex = 0;
  while ((m = SCOPED_PKG_RE.exec(description)) !== null) {
    found.add(m[0]);
  }

  return Array.from(found);
}

/**
 * Parse package.json string or object into a set of installed package names.
 * Handles null/undefined/malformed JSON gracefully.
 *
 * @param {string|object|null} packageJson
 * @returns {Set<string>}
 */
function parseInstalledPackages(packageJson) {
  if (!packageJson) return new Set();

  let parsed;
  if (typeof packageJson === 'string') {
    try {
      parsed = JSON.parse(packageJson);
    } catch {
      // Malformed JSON → treat as empty
      return new Set();
    }
  } else if (typeof packageJson === 'object') {
    parsed = packageJson;
  } else {
    return new Set();
  }

  const installed = new Set();
  const deps = parsed.dependencies || {};
  const devDeps = parsed.devDependencies || {};

  for (const name of Object.keys(deps)) installed.add(name);
  for (const name of Object.keys(devDeps)) installed.add(name);

  return installed;
}

/**
 * Pure function — detects new (uninstalled) dependency mentions.
 *
 * @param {string} description
 * @param {string|object|null} packageJson - raw JSON string, object, or null
 * @returns {{ fired: boolean, candidates: string[] }}
 */
function detectNewDep(description, packageJson) {
  const tokens = extractPackageTokens(description);
  if (tokens.length === 0) return { fired: false, candidates: [] };

  const installed = parseInstalledPackages(packageJson);

  const candidates = tokens.filter(t => !installed.has(t));

  return { fired: candidates.length > 0, candidates };
}

// ─── detectMissingPatterns ────────────────────────────────────────────────────

/**
 * Tokenize text: lowercase, split on whitespace + punctuation, keep tokens length >= 4.
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[\s\-_/\\,.;:!?()[\]{}'"<>@#$%^&*+=|~`]+/)
    .filter(t => t.length >= 4);
}

/**
 * Extract heading texts from PATTERNS.md.
 * Matches lines starting with ## or ### and extracts the heading text.
 *
 * @param {string} patternsMd
 * @returns {string[]}
 */
function extractHeadings(patternsMd) {
  if (!patternsMd) return [];
  const headings = [];
  const lines = patternsMd.split('\n');
  for (const line of lines) {
    const m = line.match(/^#{2,3}\s+(.+)$/);
    if (m) {
      headings.push(m[1].trim());
    }
  }
  return headings;
}

/**
 * Pure function — detects missing patterns coverage.
 * Fires when PATTERNS.md is missing (null) or when no heading token overlaps
 * with the objective description tokens.
 *
 * @param {string} description
 * @param {string|null} patternsMd
 * @returns {{ fired: boolean }}
 */
function detectMissingPatterns(description, patternsMd) {
  // Missing file → unconditionally fires
  if (patternsMd === null || patternsMd === undefined) {
    return { fired: true };
  }

  const headings = extractHeadings(patternsMd);
  if (headings.length === 0) {
    // No headings = no patterns = fires
    return { fired: true };
  }

  // Build token set from all heading texts
  const headingTokens = new Set();
  for (const h of headings) {
    for (const t of tokenize(h)) {
      headingTokens.add(t);
    }
  }

  // Tokenize description and check for intersection
  const descTokens = tokenize(description);
  const hasOverlap = descTokens.some(t => headingTokens.has(t));

  return { fired: !hasOverlap };
}

// ─── detectNovelDomain (pure aggregator) ──────────────────────────────────────

/**
 * Pure function — aggregates all three signals.
 *
 * @param {object} opts
 * @param {string} opts.description
 * @param {string|object|null} opts.packageJson
 * @param {string|null} opts.patternsMd
 * @returns {{
 *   novel: boolean,
 *   signals: {
 *     new_dep: { fired: boolean, candidates: string[] },
 *     missing_patterns: { fired: boolean },
 *     comparison_keyword: { fired: boolean, matched: string[] }
 *   },
 *   recommendation: string|null
 * }}
 */
function detectNovelDomain({ description, packageJson, patternsMd }) {
  const signals = {
    new_dep: detectNewDep(description, packageJson),
    missing_patterns: detectMissingPatterns(description, patternsMd),
    comparison_keyword: detectComparisonKeyword(description),
  };

  const novel = Object.values(signals).some(s => s.fired);

  return {
    novel,
    signals,
    recommendation: novel ? 'spawn objective-researcher' : null,
  };
}

// ─── cmdDetectNovelDomain (I/O wrapper) ───────────────────────────────────────

/**
 * Reads objective context from filesystem and calls detectNovelDomain.
 *
 * Description source priority:
 *   1. <NN>-CONTEXT.md in objective directory
 *   2. ROADMAP.md section for the objective (## or ### section)
 *   3. Objective directory name (kebab-case slug)
 *
 * If no description source is found, returns { novel: false, error: "no description source" }
 * (failsafe-permissive — better to miss research than deadlock planning).
 *
 * @param {string} cwd
 * @param {string} objective - objective identifier (number or slug)
 * @param {boolean} raw
 */
function cmdDetectNovelDomain(cwd, objective, raw) {
  if (!objective) {
    error('objective identifier required');
    return;
  }

  // 1. Resolve objective directory
  const objectiveInfo = findObjectiveInternal(cwd, objective);
  if (!objectiveInfo || !objectiveInfo.found) {
    error(`Objective not found: ${objective}`);
    return;
  }

  const objectiveDir = path.isAbsolute(objectiveInfo.directory)
    ? objectiveInfo.directory
    : path.join(cwd, objectiveInfo.directory);

  const objectiveNum = objectiveInfo.objective_number;

  // 2. Resolve description (priority: CONTEXT.md > ROADMAP section > slug)
  let description = null;

  // Priority 1: CONTEXT.md
  const contextPath = path.join(objectiveDir, `${objectiveNum}-CONTEXT.md`);
  const contextContent = safeReadFile(contextPath);
  if (contextContent) {
    description = contextContent;
  }

  // Priority 2: ROADMAP section
  if (!description) {
    const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
    const roadmapContent = safeReadFile(roadmapPath);
    if (roadmapContent) {
      // Find section for this objective number
      const numStr = String(objectiveNum);
      const escapedNum = numStr.replace(/\./g, '\\.');
      const headerRe = new RegExp(`^#{2,4}\\s+Objective\\s+${escapedNum}[:\\s]`, 'm');
      const headerMatch = roadmapContent.match(headerRe);
      if (headerMatch) {
        const start = headerMatch.index;
        const rest = roadmapContent.slice(start);
        const firstNewline = rest.indexOf('\n');
        const afterHeader = firstNewline >= 0 ? rest.slice(firstNewline + 1) : '';
        const nextHeaderMatch = afterHeader.match(/^#{2,4}\s+/m);
        const section = nextHeaderMatch
          ? rest.slice(0, firstNewline + 1 + nextHeaderMatch.index)
          : rest;
        description = section;
      }
    }
  }

  // Priority 3: objective directory name (kebab-case slug)
  if (!description && objectiveInfo.objective_name) {
    description = objectiveInfo.objective_name.replace(/-/g, ' ');
  }

  // Failsafe: no description source found
  if (!description) {
    const result = { novel: false, error: 'no description source' };
    output(result, raw, JSON.stringify(result));
    return;
  }

  // 3. Read package.json
  const packageJsonPath = path.join(cwd, 'package.json');
  let packageJson = null;
  const packageJsonContent = safeReadFile(packageJsonPath);
  if (packageJsonContent) {
    packageJson = packageJsonContent;
  }

  // 4. Read PATTERNS.md
  const patternsMdPath = path.join(cwd, '.planning', 'codebase', 'PATTERNS.md');
  const patternsMd = safeReadFile(patternsMdPath);

  // 5. Detect
  const result = detectNovelDomain({ description, packageJson, patternsMd });

  // 6. Output
  const summaryLine = result.novel
    ? `novel:true — ${Object.entries(result.signals).filter(([, s]) => s.fired).map(([k]) => k).join(', ')}`
    : 'novel:false — no novel signals detected';

  output(result, raw, JSON.stringify(result));
}

module.exports = { cmdDetectNovelDomain, detectNovelDomain };
