'use strict';

// ─── Decimal-objective survey ─────────────────────────────────────────────────
//
// Walks a root directory (default ~/Source), scans each subdirectory for a
// .planning/objectives/ tree, and counts integer vs decimal objective
// directories. Returns a JSON report with a recommendation to keep or drop
// decimal-objective support based on a 5% usage threshold.
//
// CLI surface: df-tools survey decimal-objectives [--root <path>]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// ─── Injectable I/O (test seam) ───────────────────────────────────────────────

const realFs = {
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = fn != null ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── BANNER ───────────────────────────────────────────────────────────────────

const BANNER = 'DevFlow — df-tools survey decimal-objectives v1.0';

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Walk rootPath, scan each subdirectory for .planning/objectives/, and return
 * per-project counts of total vs decimal objective directories.
 *
 * @param {string} rootPath  Absolute path to the root directory to scan.
 * @returns {object}         Survey result JSON.
 */
function surveyDecimalObjectives(rootPath) {
  // Guard: root must be readable
  if (!_runFs.existsSync(rootPath)) {
    return {
      error: 'root path not accessible',
      root: rootPath,
      projects_scanned: 0,
      total_objectives: 0,
      decimal_objectives: 0,
      decimal_percentage: 0,
      threshold_percentage: 5.0,
      recommendation: 'no_data',
      by_project: [],
    };
  }

  let entries;
  try {
    entries = _runFs.readdirSync(rootPath, { withFileTypes: true });
  } catch (e) {
    return {
      error: `cannot read root: ${e.message}`,
      root: rootPath,
      projects_scanned: 0,
      total_objectives: 0,
      decimal_objectives: 0,
      decimal_percentage: 0,
      threshold_percentage: 5.0,
      recommendation: 'no_data',
      by_project: [],
    };
  }

  const projects = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;

    const planningDir = path.join(rootPath, e.name, '.planning', 'objectives');
    if (!_runFs.existsSync(planningDir)) continue;

    let objDirs;
    try {
      objDirs = _runFs.readdirSync(planningDir);
    } catch {
      continue;
    }

    // Count all objective dirs (integer or decimal prefix) and decimal-only
    const total = objDirs.filter(d => /^\d+(\.\d+)?-/.test(d) || /^\d+(\.\d+)?$/.test(d)).length;
    const decimal = objDirs.filter(d => /^\d+\.\d+/.test(d)).length;

    projects.push({ project: e.name, total, decimal });
  }

  if (projects.length === 0) {
    return {
      projects_scanned: 0,
      total_objectives: 0,
      decimal_objectives: 0,
      decimal_percentage: 0,
      threshold_percentage: 5.0,
      recommendation: 'no_data',
      by_project: [],
    };
  }

  const totalAll = projects.reduce((a, p) => a + p.total, 0);
  const decimalAll = projects.reduce((a, p) => a + p.decimal, 0);
  const pct = totalAll > 0 ? (decimalAll / totalAll) * 100 : 0;
  const recommendation = totalAll === 0 ? 'no_data' : pct < 5.0 ? 'drop' : 'keep';

  return {
    projects_scanned: projects.length,
    total_objectives: totalAll,
    decimal_objectives: decimalAll,
    decimal_percentage: Math.round(pct * 100) / 100,
    threshold_percentage: 5.0,
    recommendation,
    by_project: projects,
  };
}

// ─── CLI command ──────────────────────────────────────────────────────────────

/**
 * CLI entry point for `df-tools survey decimal-objectives [--root <path>]`.
 *
 * @param {string}   cwd   Current working directory (unused; root from --root flag).
 * @param {string[]} args  Remaining CLI args after 'decimal-objectives' subcommand.
 * @param {boolean}  raw   If true, emit raw JSON only (no banner).
 */
function cmdSurveyDecimalObjectives(cwd, args, raw) {
  const rootIdx = args.indexOf('--root');
  const rootPath = rootIdx !== -1 ? args[rootIdx + 1] : path.join(os.homedir(), 'Source');

  if (!rootPath) {
    error('--root requires a path argument');
    return;
  }

  const result = surveyDecimalObjectives(rootPath);

  if (result.error) {
    // Non-zero exit for inaccessible root
    if (!raw) {
      process.stderr.write(`${BANNER}\n`);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
    return;
  }

  output(result, raw, BANNER);
}

// ─── module.exports — LOCKED by TRD 12-06 (4-entry surface; SC-I2) ──────────
//     DO NOT MODIFY without updating EX1 export-lock test atomically.
module.exports = {
  surveyDecimalObjectives,
  cmdSurveyDecimalObjectives,
  _setRunFs,
  _resetMocks,
};
