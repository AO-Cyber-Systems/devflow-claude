'use strict';

// Hand-built fixture builders for skill-route module tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.

// ─── buildSkillRouteCall ──────────────────────────────────────────────────────

/**
 * Build a canonical skill-route call shape.
 * Represents the (skill, args) pair passed to routeSkill().
 *
 * @param {object} opts
 * @param {string}   [opts.skill]  - skill name (default: 'objective')
 * @param {string[]} [opts.args]   - args array (default: ['add', 'fix login bug'])
 * @returns {{ skill: string, args: string[] }}
 */
function buildSkillRouteCall({
  skill = 'objective',
  args = ['add', 'fix login bug'],
} = {}) {
  return { skill, args };
}

// ─── buildSkillRouteResponse ──────────────────────────────────────────────────

/**
 * Build a canonical skill-route response shape.
 * Represents the object returned by routeSkill() on success.
 *
 * @param {object} opts
 * @param {string}   [opts.skill]      - skill name (default: 'objective')
 * @param {string}   [opts.subcommand] - resolved subcommand (default: 'add')
 * @param {string[]} [opts.args]       - residual args after subcommand (default: ['fix login bug'])
 * @param {string}   [opts.workflow]   - resolved workflow path (default: add-objective.md path)
 * @returns {{ skill: string, subcommand: string, args: string[], workflow: string }}
 */
function buildSkillRouteResponse({
  skill = 'objective',
  subcommand = 'add',
  args = ['fix login bug'],
  workflow = '~/.claude/devflow/workflows/add-objective.md',
} = {}) {
  return { skill, subcommand, args, workflow };
}

// ─── buildDeprecationLogEntry ─────────────────────────────────────────────────

/**
 * Build a canonical deprecation log entry shape.
 * Represents a single line in .planning/.deprecation-log.jsonl.
 *
 * @param {object} opts
 * @param {string} [opts.old_name]      - deprecated skill name (default: 'add-objective')
 * @param {string} [opts.new_form]      - recommended replacement (default: 'objective add')
 * @param {string} [opts.project_root]  - project root path (default: '/tmp/test')
 * @param {string} [opts.ts]            - ISO timestamp (default: current time)
 * @returns {{ ts: string, old_name: string, new_form: string, project_root: string }}
 */
function buildDeprecationLogEntry({
  old_name = 'add-objective',
  new_form = 'objective add',
  project_root = '/tmp/test',
  ts = new Date().toISOString(),
} = {}) {
  return { ts, old_name, new_form, project_root };
}

// ─── buildSkillRoutesStructure ────────────────────────────────────────────────

/**
 * Build a canonical SKILL_ROUTES entry for the objective skill.
 * Represents the shape of a single entry in SKILL_ROUTES constant.
 *
 * @returns {object} SKILL_ROUTES.objective shape
 */
function buildObjectiveSkillRouteEntry() {
  return {
    subcommands: ['add', 'insert', 'remove'],
    workflow_for: {
      add: '~/.claude/devflow/workflows/add-objective.md',
      insert: '~/.claude/devflow/workflows/insert-objective.md',
      remove: '~/.claude/devflow/workflows/remove-objective.md',
    },
  };
}

// ─── buildDeprecationMapEntry ─────────────────────────────────────────────────

/**
 * Build a canonical DEPRECATION_MAP entry.
 * Maps old skill name → new consolidated form.
 *
 * @param {object} opts
 * @param {string} [opts.old_name] - deprecated skill name (default: 'add-objective')
 * @param {string} [opts.new_form] - new consolidated form (default: 'objective add')
 * @returns {{ [old_name]: new_form }}
 */
function buildDeprecationMapEntry({
  old_name = 'add-objective',
  new_form = 'objective add',
} = {}) {
  return { [old_name]: new_form };
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildSkillRouteCall,
  buildSkillRouteResponse,
  buildDeprecationLogEntry,
  buildObjectiveSkillRouteEntry,
  buildDeprecationMapEntry,
};
