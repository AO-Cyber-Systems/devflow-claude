#!/usr/bin/env node

/**
 * DevFlow Edit Gate (PreToolUse, Edit|Write|MultiEdit)
 *
 * Strict DENY by default in ambient mode (DevFlow project detected, no skill running).
 *
 * Three escape hatches:
 *   1. .planning/.skill-active marker file — written by `df-tools skill-active --start`,
 *      removed by `--end`. Indicates an executor/skill is actively running.
 *   2. Override phrase in user prompt — "skip devflow", "just edit",
 *      "bypass devflow", "force edit" (case-insensitive, single-turn scope).
 *   3. DEVFLOW_SKIP_EDIT_GATE=1 env var — debugging / manual escape hatch.
 *
 * Permits edits to:
 *   - .planning/**        (planning artifacts are edited directly)
 *   - *.md docs           (documentation always allowed)
 *
 * Non-modifying tools (Read, Grep, Glob, etc.) never fire this hook — the
 * hooks.json matcher is `Edit|Write|MultiEdit`. Defensive guard inside handles
 * future matcher changes.
 *
 * Non-DevFlow projects (no .planning/) — hook no-ops.
 *
 * Prior behavior: `permissionDecision: 'ask'` warn-only + `DEVFLOW_STRICT_EDITS=1`
 * hard-deny. The new default IS strict deny. Migrate env var references:
 *   Old: DEVFLOW_STRICT_EDITS=1 (opt-in strict)
 *   New: DEVFLOW_SKIP_EDIT_GATE=1 (opt-out from strict)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Override phrases (locked from 15-RESEARCH.md)
// ---------------------------------------------------------------------------

const OVERRIDE_PHRASES = [
  'skip devflow',
  'just edit',
  'bypass devflow',
  'force edit',
];

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable without side effects)
// ---------------------------------------------------------------------------

/**
 * Walk up from `start` to find the nearest `.planning` directory.
 * Returns the full path to `.planning` or null if not found.
 */
function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Returns true if `<planningDir>/.skill-active` exists.
 * Only checks existence — does not parse the JSON content.
 *
 * @param {string|null} planningDir
 * @returns {boolean}
 */
function hasSkillActiveMarker(planningDir) {
  if (!planningDir) return false;
  return fs.existsSync(path.join(planningDir, '.skill-active'));
}

/**
 * Returns true if `userMessage` contains any override phrase (case-insensitive).
 * Override phrase scope is single-turn — PreToolUse fires per-call with the
 * current turn's prompt, so no persistence is needed.
 *
 * @param {string|null|undefined} userMessage
 * @returns {boolean}
 */
function hasOverridePhrase(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const lower = userMessage.toLowerCase();
  return OVERRIDE_PHRASES.some(p => lower.includes(p));
}

/**
 * Core gate decision — pure function, no I/O.
 *
 * @param {object} opts
 * @param {string} opts.tool         - Tool name (e.g. 'Edit', 'Write', 'Read')
 * @param {string} opts.filePath     - Target file path (tool_input.file_path)
 * @param {string|null} opts.planningDir  - Ancestor .planning dir or null
 * @param {boolean} opts.skillActive - True if .skill-active marker exists
 * @param {boolean} opts.overrideActive  - True if user prompt has override phrase
 * @returns {{ decision: 'deny'|'allow'|'noop', reason?: string }}
 */
function shouldGate({ tool, filePath, planningDir, skillActive, overrideActive }) {
  // Only gate Edit/Write/MultiEdit — defensive check for future matcher changes
  if (!/^(Edit|Write|MultiEdit)$/.test(tool)) return { decision: 'noop' };

  if (!filePath) return { decision: 'noop' };

  // Always allow planning artifacts (planning docs are edited directly)
  if (/\/\.planning\//.test(filePath)) return { decision: 'allow', reason: 'planning artifact' };

  // Always allow markdown documentation
  if (/\.md$/i.test(filePath)) return { decision: 'allow', reason: 'markdown doc' };

  // Non-DevFlow project — gate doesn't apply
  if (!planningDir) return { decision: 'noop' };

  // Escape hatch: active skill marker
  if (skillActive) return { decision: 'allow', reason: 'skill-active marker present' };

  // Escape hatch: user override phrase
  if (overrideActive) return { decision: 'allow', reason: 'user override phrase detected' };

  // Default: DENY in ambient mode
  return {
    decision: 'deny',
    reason: [
      'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.',
      'Route through a /devflow: skill so atomic commits + state tracking + verification fire correctly.',
      'For a tiny ad-hoc fix, prefer /devflow:quick.',
      'To bypass this gate explicitly, include "skip devflow" or "just edit" in your prompt.',
      'Skills mark themselves active via df-tools skill-active --start <name> / --end.',
    ].join(' '),
  };
}

// ---------------------------------------------------------------------------
// Entry point (run as hook)
// ---------------------------------------------------------------------------

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function main() {
  // Env var escape hatch — disable the gate entirely for debugging
  if (process.env.DEVFLOW_SKIP_EDIT_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }

  const tool = input.tool_name;
  const filePath = (input.tool_input && input.tool_input.file_path) || '';

  // Defensive: try both field names for the user's prompt
  // Empirical order: user_message first, prompt fallback, then empty string
  const userMessage = input.user_message || input.prompt || '';

  const planningDir = findPlanningDir(process.cwd());
  const skillActive = hasSkillActiveMarker(planningDir);
  const overrideActive = hasOverridePhrase(userMessage);

  const result = shouldGate({ tool, filePath, planningDir, skillActive, overrideActive });

  if (result.decision === 'noop' || result.decision === 'allow') return;

  // DENY — emit the structured hook output
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: result.reason,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) main();

// ---------------------------------------------------------------------------
// Exports (for unit tests)
// ---------------------------------------------------------------------------

module.exports = {
  OVERRIDE_PHRASES,
  hasSkillActiveMarker,
  hasOverridePhrase,
  shouldGate,
  findPlanningDir,
};
