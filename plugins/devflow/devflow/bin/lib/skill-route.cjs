'use strict';

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// ─── fs injection (for deprecation logger testability) ────────────────────────

const realFs = {
  existsSync: fs.existsSync,
  mkdirSync: (...a) => fs.mkdirSync(...a),
  appendFileSync: (...a) => fs.appendFileSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── SKILL_ROUTES ─────────────────────────────────────────────────────────────
// Only `objective` populated in TRD 12-01; 12-02/03/04 add the rest.

const SKILL_ROUTES = {
  // Note: 'insert' subcommand removed in TRD 12-06 (I2 survey: 0% decimal usage across 16 projects).
  objective: {
    subcommands: ['add', 'remove'],
    workflow_for(subcommand) {
      const map = {
        add: '~/.claude/devflow/workflows/add-objective.md',
        remove: '~/.claude/devflow/workflows/remove-objective.md',
      };
      return map[subcommand] || null;
    },
  },
  // Added in TRD 12-02: milestone subcommand dispatch.
  // Note: 'gaps' maps to 'plan-milestone-gaps.md' (not 'gaps-milestone.md').
  milestone: {
    subcommands: ['new', 'audit', 'complete', 'gaps'],
    workflow_for(subcommand) {
      const map = {
        'new': '~/.claude/devflow/workflows/new-milestone.md',
        'audit': '~/.claude/devflow/workflows/audit-milestone.md',
        'complete': '~/.claude/devflow/workflows/complete-milestone.md',
        'gaps': '~/.claude/devflow/workflows/plan-milestone-gaps.md',
      };
      return map[subcommand] || null;
    },
  },
};

// ─── DEPRECATION_MAP ──────────────────────────────────────────────────────────
// Only objective-related entries in TRD 12-01.

const DEPRECATION_MAP = {
  'add-objective': 'objective add',
  // insert-objective: deprecated in TRD 12-06 (decimal objectives dropped, I2 survey: 0% usage).
  // Redirects to objective add as the functional equivalent for urgent work.
  'insert-objective': 'objective add',
  'remove-objective': 'objective remove',
  // Added in TRD 12-02: milestone siblings replaced by consolidated /devflow:milestone.
  'new-milestone': 'milestone new',
  'audit-milestone': 'milestone audit',
  'complete-milestone': 'milestone complete',
  'plan-milestone-gaps': 'milestone gaps',
};

// ─── Argument validation ──────────────────────────────────────────────────────

/**
 * Validate skill and args before skill lookup.
 * RE4/RE5: null checks run BEFORE skill lookup so they don't hit 'unknown skill'.
 * @returns {object|null} error object or null if valid
 */
function _validateArgs(skill, args) {
  if (skill == null) {
    return { error: 'skill must not be null', got: skill };
  }
  if (args == null || !Array.isArray(args)) {
    return { error: 'args must be an array', got: args };
  }
  return null;
}

// ─── routeSkill ───────────────────────────────────────────────────────────────

/**
 * Pure dispatch function — no fs, no process.exit, no console output.
 * Resolves (skill, args) → { skill, subcommand, args, workflow } or error object.
 *
 * @param {string}   skill - skill name (e.g., 'objective')
 * @param {string[]} args  - subcommand + residual args (e.g., ['add', 'fix bug'])
 * @returns {object} success or error shape
 */
function routeSkill(skill, args) {
  // RE4/RE5: argument validation runs BEFORE skill lookup
  const argErr = _validateArgs(skill, args);
  if (argErr) return argErr;

  const route = SKILL_ROUTES[skill];
  if (!route) {
    return {
      error: 'unknown skill',
      got: skill,
      valid_skills: Object.keys(SKILL_ROUTES),
    };
  }

  const [subcommand, ...residual] = args;

  if (!subcommand) {
    return {
      error: 'missing subcommand',
      usage: `${skill} <${route.subcommands.join('|')}>`,
      valid_subcommands: route.subcommands,
    };
  }

  if (!route.subcommands.includes(subcommand)) {
    return {
      error: 'unknown subcommand',
      got: subcommand,
      valid_subcommands: route.subcommands,
    };
  }

  const workflow = route.workflow_for(subcommand);

  return {
    skill,
    subcommand,
    args: residual,
    workflow,
  };
}

// ─── cmdSkillRoute ────────────────────────────────────────────────────────────

/**
 * CLI handler for `df-tools skill-route <skill> [subcommand] [args...]`.
 * Calls routeSkill, writes JSON result. Exits 1 on error, 0 on success.
 */
function cmdSkillRoute(cwd, args, raw) {
  const [skill, ...rest] = args;

  if (!skill) {
    process.stderr.write(JSON.stringify({
      error: 'missing skill',
      usage: 'df-tools skill-route <skill> <subcommand> [args...]',
      valid_skills: Object.keys(SKILL_ROUTES),
    }, null, 2));
    process.exit(1);
  }

  const result = routeSkill(skill, rest);

  if (result.error) {
    process.stderr.write(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  output(result, raw);
}

// ─── cmdSkillRouteList ────────────────────────────────────────────────────────

/**
 * CLI handler for `df-tools skill-route --list`.
 * Emits machine-readable consolidated skill catalog.
 * Phase A (v1.2 obj 6) consumes this output.
 */
function cmdSkillRouteList(cwd, raw) {
  const skills = Object.entries(SKILL_ROUTES).map(([name, route]) => ({
    name,
    subcommands: route.subcommands,
  }));

  const result = {
    skills,
    deprecated: { ...DEPRECATION_MAP },
  };

  output(result, raw);
}

// ─── cmdDeprecationLog ────────────────────────────────────────────────────────

/**
 * CLI handler for `df-tools deprecation log <old-name>`.
 * Appends a JSONL entry to .planning/.deprecation-log.jsonl.
 * Returns { logged, old_name, new_form } or { error, got }.
 *
 * @param {string}  cwd      - project root directory
 * @param {string}  oldName  - deprecated skill name (e.g., 'add-objective')
 * @param {boolean} raw      - raw output mode
 * @returns {object} result object (also written to stdout via output())
 */
function cmdDeprecationLog(cwd, oldName, raw) {
  const newForm = DEPRECATION_MAP[oldName];

  if (!newForm) {
    const errResult = {
      error: 'unknown deprecated skill',
      got: oldName,
      valid_deprecated: Object.keys(DEPRECATION_MAP),
    };
    return errResult;
  }

  const logDir = path.join(cwd, '.planning');
  const logPath = path.join(logDir, '.deprecation-log.jsonl');

  // Ensure .planning dir exists
  if (!_runFs.existsSync(logDir)) {
    _runFs.mkdirSync(logDir, { recursive: true });
  }

  const entry = {
    ts: new Date().toISOString(),
    old_name: oldName,
    new_form: newForm,
    project_root: cwd,
  };

  _runFs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');

  const result = {
    logged: true,
    old_name: oldName,
    new_form: newForm,
  };

  return result;
}

// ─── module.exports — LOCKED by TRD 12-01 (8-entry surface; SC-G1, SC-G2) ────
//     DO NOT MODIFY without updating EX1 export-lock test atomically.
module.exports = {
  routeSkill,
  cmdSkillRoute,
  cmdSkillRouteList,
  cmdDeprecationLog,
  SKILL_ROUTES,
  DEPRECATION_MAP,
  _setRunFs,
  _resetMocks,
};
