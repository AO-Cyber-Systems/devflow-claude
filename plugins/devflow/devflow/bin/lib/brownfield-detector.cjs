'use strict';

/**
 * brownfield-detector.cjs — Brownfield codebase map detector
 *
 * Implements `df-tools detect brownfield-map [<cwd>]`:
 * - Pure logic, no LLM, no network
 * - Detects when .planning/ exists, .planning/codebase/ is absent, AND substantial
 *   source code (>= 50 files) is present → offers /devflow:map-codebase
 *
 * Output shape (from 14-RESEARCH.md F3):
 * {
 *   should_offer_map: boolean,
 *   planning_exists: boolean,
 *   codebase_map_exists: boolean,
 *   source_file_count: number,
 *   threshold: number
 * }
 *
 * Phase A integration (deferred): classify-session.js will call this on first
 * session per project. This TRD ships the detector helper only.
 */

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// ─── countSourceFiles ─────────────────────────────────────────────────────────

/**
 * Directory names to exclude at every level of the walk.
 * Checked by exact name match (not full path) — per TRD GOTCHA:
 * "src/node_modules_demo/foo.ts" (legitimate name) still counts;
 * only the literal "node_modules" directory name is excluded.
 */
const EXCLUDE = new Set([
  'node_modules',
  '.git',
  '.planning',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
]);

/**
 * Source file extensions to count (dot-included per path.extname return value).
 */
const EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs',
  '.py', '.go', '.rs', '.rb', '.java',
]);

/**
 * Recursively count source files under root, excluding directories in EXCLUDE.
 * - ENOENT / EACCES on a subdirectory → skip that dir, continue walk (never crash).
 * - Symlinks: isDirectory() returns false → naturally skipped without following.
 *
 * @param {string} root - absolute path to walk
 * @returns {number}
 */
function countSourceFiles(root) {
  let count = 0;

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // ENOENT, EACCES, etc. — skip this directory, continue walk
      return;
    }

    for (const e of entries) {
      // Skip excluded directory names (by name, not full path)
      if (EXCLUDE.has(e.name)) continue;

      // Skip dotdirs (e.g. .vscode, .idea) — but don't skip plain files that
      // start with a dot (edge case: .eslintrc.cjs should count if extension matches)
      if (e.isDirectory() && e.name.startsWith('.')) continue;

      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && EXTS.has(path.extname(e.name))) {
        count++;
      }
      // Symlinks (isSymbolicLink()): isDirectory() returns false, isFile() returns false
      // → naturally ignored without following into potentially circular structures.
    }
  }

  walk(root);
  return count;
}

// ─── detectBrownfieldMap (pure function) ─────────────────────────────────────

/**
 * Pure function — determine whether to offer /devflow:map-codebase.
 * Takes already-evaluated inputs (no filesystem I/O).
 *
 * @param {object} opts
 * @param {boolean} opts.planningExists       - .planning/ directory is present
 * @param {boolean} opts.codebaseMapExists    - .planning/codebase/ directory is present
 * @param {number}  opts.sourceFileCount      - count of source files in project
 * @param {number}  [opts.threshold=50]       - minimum source file count for "substantial code"
 * @returns {{
 *   should_offer_map: boolean,
 *   planning_exists: boolean,
 *   codebase_map_exists: boolean,
 *   source_file_count: number,
 *   threshold: number
 * }}
 */
function detectBrownfieldMap({ planningExists, codebaseMapExists, sourceFileCount, threshold = 50 }) {
  const should_offer_map = planningExists && !codebaseMapExists && sourceFileCount >= threshold;

  return {
    should_offer_map,
    planning_exists: planningExists,
    codebase_map_exists: codebaseMapExists,
    source_file_count: sourceFileCount,
    threshold,
  };
}

// ─── cmdDetectBrownfieldMap (I/O wrapper) ────────────────────────────────────

/**
 * CLI entry point: reads filesystem state, calls detectBrownfieldMap, emits result.
 *
 * @param {string} cwd        - process working directory (default root for resolution)
 * @param {string} targetCwd  - optional override path to inspect (args[2] from CLI)
 * @param {boolean} raw       - if true, emit compact JSON; otherwise emit pretty JSON
 */
function cmdDetectBrownfieldMap(cwd, targetCwd, raw) {
  // Resolve root: targetCwd (if provided) wins over cwd
  const root = targetCwd ? path.resolve(targetCwd) : cwd;

  // Validate root exists
  if (!fs.existsSync(root)) {
    const result = { should_offer_map: false, error: `cwd not found: ${root}` };
    process.stderr.write(`Error: cwd not found: ${root}\n`);
    process.exit(1);
    return; // unreachable — process.exit throws in test harness
  }

  // 1. Check .planning/ existence
  const planningPath = path.join(root, '.planning');
  const planningExists = fs.existsSync(planningPath);

  // 2. Check .planning/codebase/ existence (only meaningful if planning exists)
  const codebaseMapPath = path.join(root, '.planning', 'codebase');
  const codebaseMapExists = planningExists && fs.existsSync(codebaseMapPath);

  // 3. Count source files
  const sourceFileCount = countSourceFiles(root);

  // 4. Run pure detector
  const result = detectBrownfieldMap({ planningExists, codebaseMapExists, sourceFileCount });

  // 5. Emit
  const summaryLine = result.should_offer_map
    ? `should_offer_map:true — planning exists, no codebase map, ${sourceFileCount} source files`
    : `should_offer_map:false`;

  output(result, raw, JSON.stringify(result));
}

module.exports = { cmdDetectBrownfieldMap, detectBrownfieldMap };
