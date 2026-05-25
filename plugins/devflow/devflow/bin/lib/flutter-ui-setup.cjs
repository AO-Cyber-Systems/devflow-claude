'use strict';

/**
 * flutter-ui-setup.cjs — `df-tools flutter-ui setup` subcommand
 *
 * One-command adoption path for downstream Flutter projects:
 *   1. Detect missing system tools (jq, gh, chromedriver).
 *   2. Build a platform-aware install plan (darwin → brew, linux → apt).
 *   3. Dispatch installs via the devflow-watch handoff (when daemon is live)
 *      OR print copy-pasteable shell commands (when daemon is down — exit 1).
 *   4. Chain into flutter-ui-bootstrap.cjs to scaffold pubspec/dirs/marker.
 *   5. Idempotent — re-runs on a set-up project return status:'already-set-up'.
 *
 * Pure-logic CLI wrapper. Hand-built fixtures drive every test (TDD Playbook habit 4).
 *
 * Module exports:
 *   detectMissingTools, buildInstallPlan, dispatchInstalls, cmdFlutterUISetup
 */

const fs = require('fs');
const path = require('path');

// ───── detectMissingTools ────────────────────────────────────────────────────

const DEFAULT_REQUIRED_TOOLS = ['jq', 'gh', 'chromedriver'];

/**
 * Pure function: given a PATH dir and a list of required tools, return the
 * names of those that are NOT present in the dir (preserving input order).
 *
 * Tests pass a single dir for determinism; production callers can pass the
 * effective PATH (colon-joined) — see TODO note below if/when we extend.
 *
 * @param {object} opts
 * @param {string} opts.pathDir         — directory to probe (e.g. a $PATH entry)
 * @param {string[]} [opts.requiredTools]
 * @returns {string[]}                  — missing tool names, input-ordered
 */
function detectMissingTools(opts) {
  const o = opts || {};
  const dir = o.pathDir;
  const required = Array.isArray(o.requiredTools) ? o.requiredTools : DEFAULT_REQUIRED_TOOLS;
  if (!dir) return [...required]; // no PATH dir → nothing detectable, everything missing
  const missing = [];
  for (const tool of required) {
    const candidate = path.join(dir, tool);
    if (!fs.existsSync(candidate)) missing.push(tool);
  }
  return missing;
}

module.exports = {
  detectMissingTools,
};
