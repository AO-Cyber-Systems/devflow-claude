'use strict';

/**
 * Cross-repo awareness scanner.
 *
 * Two-fold awareness layer: peer (git-branch state) + org (Product Roadmap project).
 * Storage: git is the source of truth for peer; obj 1's resolveChain primitives walk
 * org-side. No new shared store; pure read-side aggregation.
 *
 * Module growth across waves:
 *   TRD 02-01: parseStateMd, aggregateOrgByProductQuarter, constants  (THIS TRD)
 *   TRD 02-04: readCache, writeCache, isStale
 *   TRD 02-02: scanPeer, _setRunGit
 *   TRD 02-03: scanOrg (composes walkProject from gh.cjs)
 *   TRD 02-07: module.exports finalization + integration tests
 *
 * Iron Law: parseStateMd MUST be fault-tolerant — never throw on garbage input.
 */

const fs = require('fs');
const path = require('path');

// ─── TRD 02-01: constants ─────────────────────────────────────────────────────

const DEFAULT_TTL_MINUTES = 10;
const DEFAULT_STALE_DAYS = 30;
const DEFAULT_BRANCH_PATTERNS = ['feature/*', 'df/*', 'fix/*', 'proposal/*'];
const AWARENESS_CACHE_REL = path.join('.planning', '.awareness-cache.json');

// ─── TRD 02-01: parseStateMd ──────────────────────────────────────────────────

/**
 * Parse STATE.md content into a structured object.
 *
 * Fault-tolerant: never throws on garbage input. Returns null when no
 * recognizable fields are found (empty, whitespace-only, or content with no
 * known markers). The caller (scanner) skips branches that return null.
 *
 * Fields extracted:
 *   - objective: string | null  — from "**Objective in flight:**" or "**Objective:**"
 *   - trd: string | null        — from "**Current TRD:** NN-NN"
 *   - branch: string | null     — from "**Branch:** `name`" (backticks optional)
 *   - github_issue: string | null — from "github_issue: ref" anywhere in body
 *   - objective_complete: string[] — from all "**Objective complete:**" lines
 *
 * NOT extracted here: developer, last_commit (those are set by the scanner caller).
 *
 * @param {string} content - raw STATE.md text
 * @returns {{ objective: string|null, trd: string|null, branch: string|null,
 *             github_issue: string|null, objective_complete: string[] } | null}
 */
function parseStateMd(content) {
  try {
    if (typeof content !== 'string') return null;
    if (content.trim().length < 10) return null;

    const result = {
      objective: null,
      trd: null,
      branch: null,
      github_issue: null,
      objective_complete: [],
    };

    // ── Objective (in-flight preferred; fall back to plain **Objective:**) ──
    let m = content.match(/\*\*Objective in flight:\*\*\s+([^\n]+)/i);
    if (!m) m = content.match(/\*\*Objective:\*\*\s+([^\n]+)/i);
    if (m) result.objective = m[1].trim();

    // ── TRD: accept NN-NN, N-N, NN-N, single-number, etc. ──
    // Pattern: match NN-NN forms first (greedy match on digits-dash-digits)
    m = content.match(/\*\*Current TRD:\*\*\s+(\d+(?:[-.]\d+)?)/i);
    if (m) result.trd = m[1];

    // ── Branch (backticks optional on either side) ──
    // Match: **Branch:** `name` or **Branch:** name (no backticks)
    // Branch name can contain /, -, ., alphanumeric
    m = content.match(/\*\*Branch:\*\*\s+`?([^`\n\r\s]+)`?/i);
    if (m) result.branch = m[1].trim();

    // ── github_issue — first occurrence anywhere in body ──
    m = content.match(/github_issue:\s*([^\s\n\r]+)/i);
    if (m) {
      // Strip surrounding quotes if present (YAML serialization artifact)
      let val = m[1].trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result.github_issue = val;
    }

    // ── Objective complete (multiple) — return ALL matches as array ──
    const completeRe = /\*\*Objective complete:\*\*\s+([^\n\r]+)/gi;
    let cm;
    while ((cm = completeRe.exec(content)) !== null) {
      result.objective_complete.push(cm[1].trim());
    }

    // ── Null guard: if NOTHING extracted, return null ──
    if (
      !result.objective &&
      !result.trd &&
      !result.branch &&
      !result.github_issue &&
      result.objective_complete.length === 0
    ) {
      return null;
    }

    return result;
  } catch {
    // Iron Law: never throw
    return null;
  }
}

// ─── TRD 02-01: aggregateOrgByProductQuarter ─────────────────────────────────

/**
 * Group org-scan items by Product × Quarter.
 *
 * Items missing `product` field go to the 'Unknown' product bucket.
 * Items missing `quarter` field go to the 'Unknown' quarter bucket.
 * Input order preserved within each bucket (stable grouping).
 *
 * Shape: { [Product: string]: { [Quarter: string]: items[] } }
 *
 * @param {object[]} items - array of org-scan item objects
 * @returns {object}
 */
function aggregateOrgByProductQuarter(items) {
  const out = {};
  for (const item of (items || [])) {
    const product = (item.product != null && item.product !== '') ? item.product : 'Unknown';
    const quarter = (item.quarter != null && item.quarter !== '') ? item.quarter : 'Unknown';
    if (!out[product]) out[product] = {};
    if (!out[product][quarter]) out[product][quarter] = [];
    out[product][quarter].push(item);
  }
  return out;
}

// ─── TRD 02-04: cache layer ───────────────────────────────────────────────────

/**
 * Read the awareness cache file.
 * Returns null on missing file, empty file, or malformed JSON.
 * Never throws.
 *
 * @param {string} cwd - working directory containing .planning/
 * @returns {{ peer?: object, org?: object } | null}
 */
function readCache(cwd) {
  const p = path.join(cwd, AWARENESS_CACHE_REL);
  if (!fs.existsSync(p)) return null;
  try {
    const content = fs.readFileSync(p, 'utf-8');
    if (!content.trim()) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write awareness cache file with MERGE semantics.
 *
 * Passing only `{ peer: X }` preserves existing `org` section if present.
 * Passing both replaces both. This is the contract that enables
 * `--refresh peer` / `--refresh org` flags (TRD 02-05) to work independently.
 *
 * Locked semantic: writeCache(cwd, { peer: NEW }) where existing has { peer: OLD, org: Y }
 *   → result is { peer: NEW, org: Y }.
 *
 * @param {string} cwd - working directory containing (or to contain) .planning/
 * @param {{ peer?: object, org?: object }} sections - sections to write/update
 */
function writeCache(cwd, sections) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });

  // Read existing for merge semantics
  const existing = readCache(cwd) || {};
  const merged = Object.assign({}, existing, sections || {});

  fs.writeFileSync(
    path.join(cwd, AWARENESS_CACHE_REL),
    JSON.stringify(merged, null, 2) + '\n'
  );
}

/**
 * Returns true when the given timestamp is stale relative to ttl_minutes.
 *
 * Staleness rules:
 * - fetched_at null/undefined → true (missing = stale)
 * - fetched_at not a valid ISO string → true (invalid = stale)
 * - ttl_minutes=0 → true (zero TTL = always stale; locked)
 * - ttl_minutes null/undefined → uses DEFAULT_TTL_MINUTES (10)
 * - fetched_at in future (clock skew) → false (treated as fresh)
 * - (now - fetched_at) > ttl_minutes * 60_000 ms → true
 *
 * @param {string|null|undefined} fetched_at - ISO 8601 timestamp string
 * @param {number|null|undefined} ttl_minutes - TTL in minutes
 * @returns {boolean}
 */
function isStale(fetched_at, ttl_minutes) {
  if (fetched_at == null) return true;
  if (typeof fetched_at !== 'string') return true;
  const ts = Date.parse(fetched_at);
  if (!Number.isFinite(ts)) return true;

  const ttl = (ttl_minutes != null) ? ttl_minutes : DEFAULT_TTL_MINUTES;
  if (ttl <= 0) return true;

  const age_ms = Date.now() - ts;
  if (age_ms < 0) return false; // future timestamp → treat as fresh (clock skew tolerance)
  return age_ms > (ttl * 60_000);
}

// ─── module.exports (TRD 02-01 + TRD 02-04) ──────────────────────────────────

module.exports = {
  parseStateMd,
  aggregateOrgByProductQuarter,
  readCache,
  writeCache,
  isStale,
  DEFAULT_TTL_MINUTES,
  DEFAULT_STALE_DAYS,
  DEFAULT_BRANCH_PATTERNS,
  AWARENESS_CACHE_REL,
};
