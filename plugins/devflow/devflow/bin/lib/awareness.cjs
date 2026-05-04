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

// ─── module.exports (TRD 02-01 partial — later TRDs append) ──────────────────

module.exports = {
  parseStateMd,
  aggregateOrgByProductQuarter,
  DEFAULT_TTL_MINUTES,
  DEFAULT_STALE_DAYS,
  DEFAULT_BRANCH_PATTERNS,
  AWARENESS_CACHE_REL,
};
