'use strict';

// ─── module.exports — LOCKED by TRD 12-05 (5-entry surface; SC-I3)
//     DO NOT MODIFY exports without updating EX1 export-lock test atomically.

const fs = require('fs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { output, error } = require('./helpers.cjs');

// ─── FS injection (test hook) ─────────────────────────────────────────────────

const _realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  existsSync: (p) => fs.existsSync(p),
};
let _runFs = _realFs;

/** @param {object|null} fn — pass null to reset to real fs */
function _setRunFs(fn) { _runFs = (fn != null) ? fn : _realFs; }
function _resetMocks() { _runFs = _realFs; }

// ─── _parseAttrs ──────────────────────────────────────────────────────────────

/**
 * Parse XML-like attribute string into key→value map.
 * Supports: key="value", key='value', key=value (unquoted).
 */
function _parseAttrs(attrStr) {
  const attrs = {};
  // Match: key="value" OR key='value' OR key=value (unquoted non-whitespace)
  const re = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    // Group 2: double-quoted, Group 3: single-quoted, Group 4: unquoted
    attrs[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
  }
  return attrs;
}

// ─── parseTrdTasks ────────────────────────────────────────────────────────────

/**
 * Parse a TRD file's content and return its frontmatter + task list with tdd attrs.
 *
 * @param {string} trdContent
 * @returns {{ frontmatter: object, tasks: Array<{name, type, tdd_attr}> }}
 *
 * Handles:
 * - type:tdd TRDs (legacy back-compat)
 * - Task-level tdd="true"|"false"|unquoted attrs
 * - Malformed tags (graceful skip)
 */
function parseTrdTasks(trdContent) {
  const fm = extractFrontmatter(trdContent) || {};
  const tasks = [];

  // Match both <task ...>...</task> (legacy) and <TASK-EX ...>...</TASK-EX> (new) forms.
  // Uses non-greedy body capture. Handles any closing tag variant.
  const taskRegex = /<(?:TASK-EX|task)\s+([^>]+?)>([\s\S]*?)<\/(?:TASK-EX|task)>/gi;
  let m;
  while ((m = taskRegex.exec(trdContent)) !== null) {
    try {
      const attrs = _parseAttrs(m[1]);
      const body = m[2];

      // Parse name from <name> element
      const nameMatch = body.match(/<name>\s*([^<]+?)\s*<\/name>/i);
      const name = nameMatch ? nameMatch[1].trim() : '(unnamed)';

      // Parse tdd attribute: "true" → true, "false" → false, absent → null
      let tddVal = null;
      if (attrs.tdd === 'true') tddVal = true;
      else if (attrs.tdd === 'false') tddVal = false;

      tasks.push({
        name,
        type: attrs.type || 'auto',
        tdd_attr: tddVal,
      });
    } catch (_) {
      // Graceful skip on malformed task — continue with what was parsed
    }
  }

  return { frontmatter: fm, tasks };
}

// ─── resolveEffectiveTddFlag ──────────────────────────────────────────────────

/**
 * Resolve the effective TDD flag for a single task.
 *
 * Resolution precedence (highest wins):
 * 1. Task-level tdd_attr === true  → TRUE
 * 2. Task-level tdd_attr === false → FALSE
 * 3. TRD-level frontmatter type === 'tdd' → TRUE (back-compat)
 * 4. Default → FALSE
 *
 * @param {string|undefined} frontmatterType — value of TRD frontmatter `type` field
 * @param {boolean|null} taskTddAttr — parsed tdd attribute from task XML (true/false/null)
 * @returns {boolean}
 */
function resolveEffectiveTddFlag(frontmatterType, taskTddAttr) {
  // Explicit task-level override wins
  if (taskTddAttr === true) return true;
  if (taskTddAttr === false) return false;
  // TRD-level back-compat: type: tdd → all tasks default to TDD unless overridden
  if (frontmatterType === 'tdd') return true;
  return false;
}

// ─── cmdTrdTddInspect ─────────────────────────────────────────────────────────

/**
 * CLI inspector: parses a TRD file and returns per-task effective TDD flag resolution.
 *
 * Usage: df-tools trd-tdd inspect <trd-path> [--raw]
 *
 * Output JSON:
 * {
 *   frontmatter: { type, trd, objective, ... },
 *   tasks: [{ name, type, tdd_attr, tdd_effective }, ...]
 * }
 *
 * Exit codes:
 *   0 — success
 *   1 — file not found or no path provided
 */
function cmdTrdTddInspect(cwd, trdPath, raw) {
  if (!trdPath) {
    error('Usage: df-tools trd-tdd inspect <trd-path>');
    return;
  }

  if (!_runFs.existsSync(trdPath)) {
    // Write error JSON to stdout before exit(1). Cannot use output() here —
    // output() calls process.exit(0) internally, which overrides our exit(1).
    process.stdout.write(JSON.stringify({ error: 'TRD file not found', path: trdPath }, null, 2));
    process.exit(1);
    return;
  }

  const content = _runFs.readFileSync(trdPath, 'utf-8');
  const { frontmatter, tasks } = parseTrdTasks(content);

  const inspected = tasks.map(t => ({
    name: t.name,
    type: t.type,
    tdd_attr: t.tdd_attr,
    tdd_effective: resolveEffectiveTddFlag(frontmatter.type, t.tdd_attr),
  }));

  output({ frontmatter, tasks: inspected }, raw);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  parseTrdTasks,
  resolveEffectiveTddFlag,
  cmdTrdTddInspect,
  _setRunFs,
  _resetMocks,
};
