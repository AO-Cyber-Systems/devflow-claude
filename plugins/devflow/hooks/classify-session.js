#!/usr/bin/env node

/**
 * classify-session.js — SessionStart hook: classify project + inject routing preamble
 *
 * Runs at Claude Code session start. Probes the filesystem from process.cwd()
 * to classify the project as 'ambient', 'init-offer', or 'skip', then emits
 * a routing decision table as additionalContext JSON.
 *
 * Skips entirely when:
 *   - DEVFLOW_SKIP_CLASSIFY=1 env var is set
 *   - mode resolves to 'skip' (no .planning/, no git, or decline marker present)
 *
 * Output shape (when non-skip):
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "SessionStart",
 *       "additionalContext": "<preamble text>"
 *     }
 *   }
 *
 * ANTI-PATTERN: Never crash. Errors are caught and silently no-op (stderr diagnostic only).
 * ANTI-PATTERN: Never call process.exit(). Let the process terminate naturally.
 * PATH-LOCKED: require path assumes plugins/devflow/{hooks,devflow/bin/lib}/ layout.
 *              If the plugin tree layout changes, update this require path.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// PATH-LOCKED: relative path from plugins/devflow/hooks/ → plugins/devflow/devflow/bin/lib/
const { classifySession, renderRoutingPreamble } = require('../devflow/bin/lib/classifier.cjs');

// ─── Filesystem probes ────────────────────────────────────────────────────────

/**
 * Walk up the directory tree from start, returning the path of the first
 * ancestor directory containing a .planning/ subdirectory.
 *
 * @param {string} start - absolute path to begin walking from
 * @returns {string|null} path to .planning/ dir, or null if not found
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
 * Walk up the directory tree from start, returning the path of the first
 * ancestor directory containing a .git/ subdirectory.
 *
 * @param {string} start - absolute path to begin walking from
 * @returns {string|null} path to .git/ dir, or null if not found
 */
function findGitDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return path.join(dir, '.git');
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Check whether the decline marker file exists at .planning/.devflow-init-declined.
 *
 * @param {string|null} planningDir - path to .planning/ dir, or null
 * @returns {boolean}
 */
function hasDeclineMarker(planningDir) {
  if (!planningDir) return false;
  return fs.existsSync(path.join(planningDir, '.devflow-init-declined'));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (process.env.DEVFLOW_SKIP_CLASSIFY === '1') return;

  const cwd = process.cwd();
  const planningDir = findPlanningDir(cwd);
  const hasGit = !!findGitDir(cwd);
  const declineMarker = hasDeclineMarker(planningDir);

  const mode = classifySession({
    planningDir,
    hasGitDir: hasGit,
    hasDeclineMarker: declineMarker,
  });

  if (mode === 'skip') return;

  const preamble = renderRoutingPreamble({ mode });
  if (!preamble) return;

  const out = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: preamble,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    // Silent no-op on unexpected errors — never crash session startup
    process.stderr.write(`[classify-session] error: ${err.message}\n`);
  }
}

module.exports = { findPlanningDir, findGitDir, hasDeclineMarker };
