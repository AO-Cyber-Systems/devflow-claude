'use strict';

/**
 * Roadmap ↔ disk reconciliation engine.
 *
 * Walks <projectRoot>/.planning/ROADMAP.md and reconciles its checkbox state
 * against on-disk SUMMARY.md presence + Self-Check verdict.
 *
 * Iron Law: ROADMAP.md mutation is line-level regex; never YAML-parse the body.
 *
 * Module growth across waves:
 *   TRD 09-01: engine (reconcile, _walkTrdLines, _checkSummaryExists,        (THIS TRD)
 *              _checkSummaryFailed, _writeReconciledRoadmap, hooks)
 *   TRD 09-02: objective-level rollup (_rollupObjectiveStatus)
 *   TRD 09-03: module.exports finalization + integration tests
 */

const fs = require('fs');
const path = require('path');

// ─── TRD 09-01: Constants ─────────────────────────────────────────────────────

const ROADMAP_REL = path.join('.planning', 'ROADMAP.md');
const OBJECTIVES_REL = path.join('.planning', 'objectives');

// ─── TRD 09-01: Injection hooks ───────────────────────────────────────────────
// All production fs reads/writes route through _runFs.X() — never fs.X() directly.

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
  renameSync: (oldP, newP) => fs.renameSync(oldP, newP),
  unlinkSync: (p) => fs.unlinkSync(p),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── TRD 09-01: Regex constants ───────────────────────────────────────────────

const OBJECTIVE_RE = /^### Objective (\d+):/;
// TRD checkbox line: indent - [x] NN-NN-slug-TRD.md — description (optional: (failed))
// Groups: 1=indent, 2=x or ' ', 3=full filename, 4=NN-NN trd_id, 5=description, 6=' (failed)' or undefined
const TRD_LINE_RE = /^(\s*)- \[([x ])\] ((\d+-\d+)-[^.\s]+-TRD\.md)\s+—\s+(.+?)(\s+\(failed\))?\s*$/;

// ─── TRD 09-01: _walkTrdLines ─────────────────────────────────────────────────

/**
 * Parse ROADMAP.md content and return metadata for every TRD checkbox line.
 *
 * @param {string} roadmapContent - full text of ROADMAP.md
 * @returns {Array<{objective_num, trd_id, trd_filename, line_index, line, indent, checked, description, has_failed_annotation}>}
 */
function _walkTrdLines(roadmapContent) {
  const lines = roadmapContent.split('\n');
  const result = [];
  let currentObjectiveNum = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const objMatch = line.match(OBJECTIVE_RE);
    if (objMatch) {
      currentObjectiveNum = objMatch[1];
      continue;
    }

    const trdMatch = line.match(TRD_LINE_RE);
    if (trdMatch && currentObjectiveNum) {
      result.push({
        objective_num: currentObjectiveNum,
        trd_id: trdMatch[4],              // 'NN-NN'
        trd_filename: trdMatch[3],        // '01-01-foo-TRD.md'
        line_index: i,
        line: line,
        indent: trdMatch[1] || '',
        checked: trdMatch[2] === 'x',
        description: trdMatch[5],        // description without (failed) suffix
        has_failed_annotation: !!trdMatch[6],
      });
    }
  }

  return result;
}

// ─── TRD 09-01: _checkSummaryExists ───────────────────────────────────────────

/**
 * Return true if <objectiveDir>/<trdId>-*-SUMMARY.md exists on disk.
 * Uses readdirSync glob via filter: prefix `${trdId}-` + suffix `-SUMMARY.md`.
 *
 * @param {string} objectiveDir - absolute path to objective directory
 * @param {string} trdId - 'NN-NN' TRD identifier prefix
 * @returns {boolean}
 */
function _checkSummaryExists(objectiveDir, trdId) {
  if (!_runFs.existsSync(objectiveDir)) return false;
  let entries;
  try {
    entries = _runFs.readdirSync(objectiveDir);
  } catch {
    return false;
  }
  return entries.some(
    (e) => e.startsWith(`${trdId}-`) && e.endsWith('-SUMMARY.md'),
  );
}

// ─── TRD 09-01: _checkSummaryFailed ───────────────────────────────────────────

/**
 * Return true if summaryContent contains a Self-Check: FAILED verdict.
 * Handles two formats observed in this repo:
 *   1. Single-line: '## Self-Check: PASSED' or '## Self-Check: FAILED'
 *   2. Section:     '## Self-Check\n\n- foo: FAILED\n- bar: PASSED'
 *
 * Defensive: returns false for any non-string or missing Self-Check section.
 *
 * @param {string} summaryContent - full text of a SUMMARY.md file
 * @returns {boolean}
 */
function _checkSummaryFailed(summaryContent) {
  if (typeof summaryContent !== 'string') return false;
  if (!summaryContent) return false;

  // Single-line: '## Self-Check: PASSED' or '## Self-Check: FAILED'
  const single = summaryContent.match(/^## Self-Check:\s+(PASSED|FAILED)\b/m);
  if (single) return single[1] === 'FAILED';

  // Section: '## Self-Check' header (no colon) + body until next ## or end
  const sectionStart = summaryContent.match(/^## Self-Check\s*$/m);
  if (sectionStart) {
    const after = summaryContent.slice(sectionStart.index);
    // Capture body = from header to next ## heading or end of string
    const bodyMatch = after.match(/^## Self-Check\s*\n([\s\S]*?)(?=^## |\s*$)/m);
    if (bodyMatch && /\bFAILED\b/.test(bodyMatch[1])) return true;
  }

  return false; // no Self-Check section → assume not failed (defensive)
}

// ─── TRD 09-01: _writeReconciledRoadmap ───────────────────────────────────────

/**
 * Atomically rewrite <projectRoot>/.planning/ROADMAP.md via tmp + rename.
 * Mirrors obj 5 TRD 05-02 _writeInitiativeFile pattern exactly.
 *
 * Tmp path: <projectRoot>/.planning/.ROADMAP.md.tmp.<pid>
 * On rename failure: unlinks tmp (best-effort) then rethrows.
 *
 * @param {string} projectRoot - absolute project root path
 * @param {string} content - full ROADMAP.md content to write
 */
function _writeReconciledRoadmap(projectRoot, content) {
  const dest = path.join(projectRoot, ROADMAP_REL);
  const planningDir = path.join(projectRoot, '.planning');
  if (!_runFs.existsSync(planningDir)) {
    _runFs.mkdirSync(planningDir, { recursive: true });
  }
  const tmpPath = path.join(planningDir, `.ROADMAP.md.tmp.${process.pid}`);
  _runFs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    _runFs.renameSync(tmpPath, dest);
  } catch (e) {
    try { _runFs.unlinkSync(tmpPath); } catch {}
    throw e;
  }
}

// ─── TRD 09-01: Internal helpers ──────────────────────────────────────────────

/**
 * Find the objective directory under objectivesDir matching `<objectiveNum>-*`.
 * Accepts both bare number and zero-padded number.
 *
 * @param {string} objectivesDir - absolute path to .planning/objectives/
 * @param {string} objectiveNum - from ROADMAP '### Objective N:' header (may be '1' or '01')
 * @returns {string|null} absolute path to matching directory, or null
 */
function _findObjectiveDir(objectivesDir, objectiveNum) {
  if (!_runFs.existsSync(objectivesDir)) return null;
  let entries;
  try {
    entries = _runFs.readdirSync(objectivesDir);
  } catch {
    return null;
  }
  const padded = String(objectiveNum).padStart(2, '0');
  const match = entries.find(
    (e) =>
      e === objectiveNum ||
      e === padded ||
      e.startsWith(`${objectiveNum}-`) ||
      e.startsWith(`${padded}-`),
  );
  return match ? path.join(objectivesDir, match) : null;
}

/**
 * Find the SUMMARY.md file for a given TRD id inside an objective directory.
 * Pattern: `<trdId>-*-SUMMARY.md` or `<trdId>-SUMMARY.md`.
 *
 * @param {string} objectiveDir - absolute path to objective directory
 * @param {string} trdId - 'NN-NN' TRD identifier prefix
 * @returns {string|null} absolute path to SUMMARY.md, or null
 */
function _findSummaryPath(objectiveDir, trdId) {
  let entries;
  try {
    entries = _runFs.readdirSync(objectiveDir);
  } catch {
    return null;
  }
  const found = entries.find(
    (e) => e.startsWith(`${trdId}-`) && e.endsWith('-SUMMARY.md'),
  );
  return found ? path.join(objectiveDir, found) : null;
}

/**
 * Return true if a TRD file for trdId exists in objectiveDir.
 * Pattern: `<trdId>-*-TRD.md`.
 *
 * @param {string} objectiveDir - absolute path to objective directory
 * @param {string} trdId - 'NN-NN' TRD identifier prefix
 * @returns {boolean}
 */
function _checkTrdFileExists(objectiveDir, trdId) {
  if (!_runFs.existsSync(objectiveDir)) return false;
  let entries;
  try {
    entries = _runFs.readdirSync(objectiveDir);
  } catch {
    return false;
  }
  return entries.some((e) => e.startsWith(`${trdId}-`) && e.endsWith('-TRD.md'));
}

// ─── TRD 09-02: _findObjectiveSections ───────────────────────────────────────

/**
 * Walk lines and return metadata for each '### Objective N:' block.
 *
 * @param {string[]} lines - ROADMAP.md content split by '\n'
 * @returns {Array<{num, startLine, endLine, statusLineIdx, trdCheckboxLines: Array<{idx, checked}>}>}
 */
function _findObjectiveSections(lines) {
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const objHeader = line.match(/^### Objective (\d+):/);
    if (objHeader) {
      if (current) {
        current.endLine = i - 1;
        sections.push(current);
      }
      current = {
        num: objHeader[1],
        startLine: i,
        endLine: -1,
        statusLineIdx: -1,
        trdCheckboxLines: [],
      };
      continue;
    }
    if (current) {
      // Status line — only the FIRST status line in the section counts
      if (current.statusLineIdx === -1 && /^\*\*Status:\*\*/.test(line)) {
        current.statusLineIdx = i;
      }
      // TRD checkbox line: '- [x] NN-NN-slug-TRD.md' or '- [ ] NN-NN-slug-TRD.md'
      const trdMatch = line.match(/^\s*- \[([x ])\] (\d+-\d+)-[^.\s]+-TRD\.md/);
      if (trdMatch) {
        current.trdCheckboxLines.push({ idx: i, checked: trdMatch[1] === 'x' });
      }
    }
  }
  if (current) {
    current.endLine = lines.length - 1;
    sections.push(current);
  }
  return sections;
}

// ─── TRD 09-02: _updateProgressTable ─────────────────────────────────────────

/**
 * Find '## Progress' section and update the row matching `objectiveNum`.
 * Best-effort: returns null if section absent or row not found or already 'complete'.
 *
 * Mutates `lines` in place.
 *
 * @param {string[]} lines - ROADMAP.md lines array (mutated in place)
 * @param {string} objectiveNum - objective number string (e.g., '1', '05')
 * @param {string} today - 'YYYY-MM-DD'
 * @returns {{ kind, objective_num, before, after }|null}
 */
function _updateProgressTable(lines, objectiveNum, today) {
  // Find '## Progress' header
  const headerIdx = lines.findIndex(l => /^## Progress\b/.test(l));
  if (headerIdx < 0) return null;

  // Walk forward from header until next ## section or end of file
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at next ## heading (but not the header line itself)
    if (/^## /.test(line)) break;

    // Match table row: starts with '|', contains objectiveNum as first cell
    // Accepts both bare number and zero-padded number
    const paddedNum = String(objectiveNum).padStart(2, '0');
    const objMatch = line.match(
      new RegExp(`^\\s*\\|\\s*(Objective\\s+${objectiveNum}|Objective\\s+${paddedNum}|${objectiveNum}|${paddedNum})\\s*\\|`, 'i'),
    );
    if (!objMatch) continue;

    // Need at least 4 pipe-separated cells to be a real table row
    const cells = line.split('|');
    if (cells.length < 4) continue;

    // Check if already 'complete' — skip to preserve idempotency
    // Check last non-empty cell before trailing '|'
    let alreadyComplete = false;
    for (let c = cells.length - 2; c > 0; c--) {
      const cellText = cells[c].trim();
      if (cellText.length === 0) continue;
      if (/^complete\b/i.test(cellText)) alreadyComplete = true;
      break;
    }
    if (alreadyComplete) return null;

    const before = line;
    // Update last non-empty cell with 'complete YYYY-MM-DD'
    let updated = false;
    for (let c = cells.length - 2; c > 0; c--) {
      const cellText = cells[c].trim();
      if (cellText.length === 0) continue;
      cells[c] = ` complete ${today} `;
      updated = true;
      break;
    }
    if (!updated) continue;
    const after = cells.join('|');
    lines[i] = after;
    return {
      kind: 'objective_rollup_progress',
      objective_num: objectiveNum,
      before,
      after,
    };
  }
  return null;
}

// ─── TRD 09-02: _rollupObjectiveStatus ───────────────────────────────────────

/**
 * Objective-level rollup: when ALL TRDs in an objective section are [x], update
 * the '**Status:**' line to 'complete YYYY-MM-DD' and (if present) update the
 * Progress table row.
 *
 * Contract: mutates `lines` array IN PLACE for efficiency. Callers must construct
 * `lines` as a fresh array per test case to avoid cross-test contamination.
 *
 * Rollup is FORWARD-ONLY (in-flight → complete). Reverting requires manual
 * user intervention — no auto-revert when a previously-complete objective
 * has a TRD that becomes [ ] again.
 *
 * @param {string[]} lines - ROADMAP.md lines array (mutated in place)
 * @param {string} today - 'YYYY-MM-DD' injected for testability; production passes new Date()
 * @returns {{ lines: string[], changes: Array }}
 */
function _rollupObjectiveStatus(lines, today) {
  const result = { lines, changes: [] };

  const objSections = _findObjectiveSections(lines);

  for (const section of objSections) {
    // Skip objectives with no TRD checkboxes
    if (section.trdCheckboxLines.length === 0) continue;
    // Skip objectives where not ALL TRDs are checked
    const allChecked = section.trdCheckboxLines.every(t => t.checked);
    if (!allChecked) continue;

    // Status line update
    if (section.statusLineIdx >= 0) {
      const cur = lines[section.statusLineIdx];
      // Skip if already 'complete' (idempotent)
      if (/^\*\*Status:\*\*\s+complete\b/i.test(cur)) {
        // Already complete — skip status, but still check progress table
      } else {
        const before = cur;
        const after = `**Status:** complete ${today}`;
        lines[section.statusLineIdx] = after;
        result.changes.push({
          kind: 'objective_rollup_status',
          objective_num: section.num,
          before,
          after,
        });
      }
    }
    // Progress table update (best-effort, returns null if absent/already-complete)
    const progressUpdate = _updateProgressTable(lines, section.num, today);
    if (progressUpdate) result.changes.push(progressUpdate);
  }

  return result;
}

// ─── TRD 09-01: reconcile ─────────────────────────────────────────────────────

/**
 * Reconcile ROADMAP.md checkbox state against on-disk SUMMARY.md presence + verdict.
 *
 * Three rule kinds:
 *   trd_summary_exists  — SUMMARY.md present + PASSED → mark [x]
 *   trd_summary_failed  — SUMMARY.md present + FAILED → mark [ ] (failed)
 *   trd_orphan_warning  — TRD listed but no TRD file on disk → warning only
 *
 * TRD 09-02: calls _rollupObjectiveStatus after the rule loop (before write).
 *
 * @param {object} opts
 * @param {string} opts.projectRoot - absolute project root path
 * @param {'write'|'dry-run'} [opts.mode='write'] - write mode rewrites ROADMAP.md; dry-run returns changes only
 * @param {string} [opts.today] - 'YYYY-MM-DD' injected for testability; defaults to UTC today
 * @returns {{ changes: Array, warnings: Array }}
 */
function reconcile({ projectRoot, mode = 'write', today } = {}) {
  const result = { changes: [], warnings: [] };
  const roadmapPath = path.join(projectRoot, ROADMAP_REL);

  if (!_runFs.existsSync(roadmapPath)) {
    result.warnings.push({ kind: 'roadmap_missing', path: roadmapPath });
    return result;
  }

  const content = _runFs.readFileSync(roadmapPath, 'utf-8');
  const trdEntries = _walkTrdLines(content);
  const lines = content.split('\n');
  const objectivesDir = path.join(projectRoot, OBJECTIVES_REL);

  for (const entry of trdEntries) {
    // Find objective directory for this TRD entry
    const objDirActual = _findObjectiveDir(objectivesDir, entry.objective_num);

    if (!objDirActual) {
      // No objective directory found at all — orphan warning
      if (!entry.checked) {
        result.warnings.push({
          kind: 'trd_orphan_warning',
          objective_num: entry.objective_num,
          trd_id: entry.trd_id,
          message: `ROADMAP lists ${entry.trd_filename} but no objective directory found for ${entry.objective_num}`,
        });
      }
      continue;
    }

    const summaryExists = _checkSummaryExists(objDirActual, entry.trd_id);
    const trdFileExists = _checkTrdFileExists(objDirActual, entry.trd_id);

    // Determine desired checkbox state + annotation
    let newChecked = entry.checked;
    let newAnnotation = entry.has_failed_annotation;
    let kind = null;

    if (summaryExists) {
      // Read summary to detect PASSED vs FAILED
      const summaryPath = _findSummaryPath(objDirActual, entry.trd_id);
      const summaryContent = _runFs.readFileSync(summaryPath, 'utf-8');
      const failed = _checkSummaryFailed(summaryContent);

      if (failed) {
        // Rule 2: trd_summary_failed → [ ] (failed)
        // Only emit change if not already in the correct failed state
        if (entry.checked || !entry.has_failed_annotation) {
          newChecked = false;
          newAnnotation = true;
          kind = 'trd_summary_failed';
        }
        // else already [ ] (failed) → no change
      } else {
        // Rule 1: trd_summary_exists → [x], no failed annotation
        // Only emit change if not already in the correct checked state
        if (!entry.checked || entry.has_failed_annotation) {
          newChecked = true;
          newAnnotation = false;
          kind = 'trd_summary_exists';
        }
        // else already [x] without failed annotation → no change
      }
    } else {
      // No SUMMARY → check for TRD file existence (orphan detection)
      if (!trdFileExists) {
        // Rule 3: trd_orphan_warning — leave checkbox alone, emit warning
        result.warnings.push({
          kind: 'trd_orphan_warning',
          objective_num: entry.objective_num,
          trd_id: entry.trd_id,
          message: `ROADMAP lists ${entry.trd_filename} but no TRD file found at ${objDirActual}`,
        });
      }
      // No checkbox flip when SUMMARY is absent (we don't auto-uncheck on missing)
    }

    if (kind) {
      const checkboxChar = newChecked ? 'x' : ' ';
      const annotationStr = newAnnotation ? ' (failed)' : '';
      // Strip any trailing (failed) from description before rewriting
      const cleanDesc = entry.description.replace(/\s+\(failed\)\s*$/, '');
      const newLine = `${entry.indent}- [${checkboxChar}] ${entry.trd_filename} — ${cleanDesc}${annotationStr}`;
      lines[entry.line_index] = newLine;
      result.changes.push({
        kind,
        path: roadmapPath,
        objective_num: entry.objective_num,
        trd_id: entry.trd_id,
        line_index: entry.line_index,  // TRD 09-03: needed for interactive apply
        before: entry.line,
        after: newLine,
      });
    }
  }

  // TRD 09-02: objective-level rollup — runs after rule loop, before write
  const todayStr = today || new Date().toISOString().slice(0, 10);
  const rollup = _rollupObjectiveStatus(lines, todayStr);
  for (const change of rollup.changes) {
    change.path = roadmapPath;
    result.changes.push(change);
  }

  // Write ROADMAP.md if in write mode and there are changes
  if (mode === 'write' && result.changes.length > 0) {
    _writeReconciledRoadmap(projectRoot, lines.join('\n'));
  }

  return result;
}

// ─── module.exports — LOCKED by TRD 09-03 (8-entry surface; SC-7) ────────────
// _findObjectiveSections + _updateProgressTable are intentionally NOT exported —
// they're internal helpers consumed only by _rollupObjectiveStatus.

module.exports = {
  reconcile,
  _walkTrdLines,
  _checkSummaryExists,
  _checkSummaryFailed,
  _writeReconciledRoadmap,
  _setRunFs,
  _resetMocks,
  _rollupObjectiveStatus,
};
