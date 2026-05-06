'use strict';

/**
 * micro.cjs — df-tools micro CLI subcommand
 *
 * Implements the `df-tools micro start|commit|abort` surface for atomic
 * micro-task tracking. Wraps the skill-active marker lifecycle and drives
 * a single git commit per micro task with a `chore(micro): {description}`
 * message. STATE.md "Quick Tasks Completed" table is updated on each commit.
 *
 * CLI surface:
 *   df-tools micro start <description>           write .planning/.skill-active, allocate task slot
 *   df-tools micro commit [--files <path>...]    atomic commit + STATE.md row + remove marker
 *   df-tools micro abort                         remove marker without committing (idempotent)
 *
 * Imports marker logic from skill-active.cjs — does NOT duplicate it.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output, error, generateSlugInternal } = require('./helpers.cjs');
const { findPlanningDir, startSkill, endSkill, statusSkill, markerPath } = require('./skill-active.cjs');

// ─── fs injection (for testability) ──────────────────────────────────────────

const realFs = {
  existsSync: (...a) => fs.existsSync(...a),
  mkdirSync: (...a) => fs.mkdirSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  unlinkSync: (...a) => fs.unlinkSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
  readdirSync: (...a) => fs.readdirSync(...a),
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── Internal: quick task numbering ──────────────────────────────────────────

/**
 * Compute the next sequential number for a quick task slot.
 * Mirrors the pattern used in `cmdInitQuick` (init.cjs:362-371).
 *
 * @param {string} planningDir - absolute path to .planning/
 * @returns {number}
 */
function _nextQuickNum(planningDir) {
  const quickDir = path.join(planningDir, 'quick');
  let nextNum = 1;
  try {
    const existing = fs.readdirSync(quickDir)
      .filter(f => /^\d+-/.test(f))
      .map(f => parseInt(f.split('-')[0], 10))
      .filter(n => !isNaN(n));
    if (existing.length > 0) nextNum = Math.max(...existing) + 1;
  } catch {
    // quick/ dir doesn't exist yet — start at 1
  }
  return nextNum;
}

// ─── Internal: STATE.md quick task row append ─────────────────────────────────

/**
 * Parse the Quick Tasks Completed table header to detect column count.
 * Returns 5 (no Status column) or 6 (Status column present).
 *
 * @param {string} headerLine
 * @returns {5|6}
 */
function _detectColumnCount(headerLine) {
  // Count pipe separators to determine column count
  const cols = headerLine.split('|').filter(s => s.trim().length > 0);
  return cols.some(c => c.trim().toLowerCase() === 'status') ? 6 : 5;
}

/**
 * Append a row to the "Quick Tasks Completed" section of STATE.md.
 * Matches existing column shape (5 or 6 columns). Creates section if absent.
 *
 * 5-col shape: | # | Description | Date | Commit | Directory |
 * 6-col shape: | # | Description | Date | Commit | Directory | Status |
 *
 * @param {string} stateMdPath - absolute path to STATE.md
 * @param {{ num: number, description: string, date: string, commitHash: string, directory: string }} row
 */
function _appendQuickTaskRow(stateMdPath, row) {
  const content = fs.readFileSync(stateMdPath, 'utf8');
  const SECTION_HEADER = '## Quick Tasks Completed';
  const TABLE_HEADER_5 = '| # | Description | Date | Commit | Directory |';
  const TABLE_SEP_5 = '|---|---|---|---|---|';
  const TABLE_HEADER_6 = '| # | Description | Date | Commit | Directory | Status |';
  const TABLE_SEP_6 = '|---|---|---|---|---|---|';

  const sectionIdx = content.indexOf(SECTION_HEADER);
  const dateStr = row.date ? row.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
  const hash = row.commitHash || '';
  const dir = row.directory || '.';

  if (sectionIdx === -1) {
    // Section absent — create it in 5-col shape
    const newSection = [
      '',
      SECTION_HEADER,
      '',
      TABLE_HEADER_5,
      TABLE_SEP_5,
      `| ${row.num} | ${row.description} | ${dateStr} | ${hash} | ${dir} |`,
      '',
    ].join('\n');
    fs.writeFileSync(stateMdPath, content.trimEnd() + '\n' + newSection, 'utf8');
    return;
  }

  // Section exists — find the header line to detect column count
  const afterSection = content.substring(sectionIdx);
  const lines = afterSection.split('\n');

  let colCount = 5;
  for (const line of lines) {
    if (line.startsWith('|') && !line.match(/^\|[-\s|]+\|$/)) {
      // This is a data row or header row (not a separator)
      colCount = _detectColumnCount(line);
      break;
    }
  }

  // Find insertion point — end of the section (before next ##, or end of file)
  const insertionPattern = /\n(?=##\s|\z)/;
  const sectionMatch = content.indexOf('\n## ', sectionIdx + SECTION_HEADER.length);
  const insertAt = sectionMatch === -1 ? content.length : sectionMatch;

  let newRow;
  if (colCount === 6) {
    newRow = `| ${row.num} | ${row.description} | ${dateStr} | ${hash} | ${dir} | Atomic |`;
  } else {
    newRow = `| ${row.num} | ${row.description} | ${dateStr} | ${hash} | ${dir} |`;
  }

  const before = content.substring(0, insertAt).trimEnd();
  const after = content.substring(insertAt);
  fs.writeFileSync(stateMdPath, before + '\n' + newRow + '\n' + after, 'utf8');
}

// ─── Internal: default git runner ────────────────────────────────────────────

/**
 * Default git runner — stages and commits via child_process.spawnSync.
 * Sets DEVFLOW_ALLOW_RAW_COMMIT=1 in the subprocess env so gate-commits.js
 * does not block the internal commit.
 *
 * @param {string} cwd
 * @param {{ message: string, files: string[]|null }} opts
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function _defaultGitRunner(cwd, opts) {
  const safeEnv = { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' };

  // Stage files
  const filesToStage = opts.files && opts.files.length > 0 ? opts.files : ['.'];
  for (const f of filesToStage) {
    const addResult = spawnSync('git', ['add', f], { cwd, encoding: 'utf8', env: safeEnv });
    if (addResult.status !== 0) {
      return { exitCode: addResult.status ?? 1, stdout: '', stderr: addResult.stderr || '' };
    }
  }

  // Commit
  const commitResult = spawnSync('git', ['commit', '-m', opts.message], {
    cwd,
    encoding: 'utf8',
    env: safeEnv,
  });
  return {
    exitCode: commitResult.status ?? 1,
    stdout: (commitResult.stdout || '').trim(),
    stderr: (commitResult.stderr || '').trim(),
  };
}

// ─── startMicro ──────────────────────────────────────────────────────────────

/**
 * Allocates a new micro task slot and writes the .skill-active marker.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .planning/
 * @param {string} opts.description - user-supplied task description
 * @param {number} opts.pid - PID (df-tools subprocess PID)
 * @param {string} opts.now - ISO8601 timestamp
 * @returns {{ ok: boolean, next_num?: number, slug?: string, task_dir?: string, marker?: object, reason?: string, message?: string }}
 */
function startMicro({ planningDir, description, pid, now }) {
  if (!planningDir) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: 'No .planning/ directory found in cwd or ancestors',
    };
  }

  if (!description || typeof description !== 'string' || !description.trim()) {
    return {
      ok: false,
      reason: 'missing-description',
      message: 'micro start requires a <description> argument',
    };
  }

  const trimmedDesc = description.trim();
  const slug = generateSlugInternal(trimmedDesc)?.substring(0, 40) || 'task';
  const nextNum = _nextQuickNum(planningDir);
  const taskDir = path.join('.planning', 'quick', `${nextNum}-${slug}`);

  // Write the skill-active marker (last-write-wins: startSkill overwrites)
  const skillResult = startSkill({ planningDir, skillName: 'micro', pid, now });
  if (!skillResult.ok) {
    return skillResult;
  }

  // Persist description to .micro-description so `cmdMicro commit` can retrieve it
  // (the skill-active marker format does not include a description field)
  try {
    fs.writeFileSync(path.join(planningDir, '.micro-description'), trimmedDesc, 'utf8');
  } catch {
    // Non-fatal — description file write failure; CLI commit path will need --description
  }

  return {
    ok: true,
    next_num: nextNum,
    slug,
    task_dir: taskDir,
    marker: skillResult.marker,
  };
}

// ─── commitMicro ─────────────────────────────────────────────────────────────

/**
 * Produces an atomic git commit with message `chore(micro): {description}`,
 * appends a row to STATE.md "Quick Tasks Completed", and removes the marker.
 * Marker is NOT removed if the commit fails — caller can retry.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .planning/
 * @param {string} opts.description - task description (used in commit message)
 * @param {string[]|null} opts.files - files to stage (null = stage everything)
 * @param {string} opts.now - ISO8601 timestamp (for STATE.md date)
 * @param {Function|null} opts.gitRunner - injection for tests; null = real git
 * @returns {{ ok: boolean, commit_hash?: string, removed_marker?: boolean, reason?: string, message?: string, stderr?: string }}
 */
function commitMicro({ planningDir, description, files, now, gitRunner }) {
  if (!planningDir) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: 'No .planning/ directory found in cwd or ancestors',
    };
  }

  // Check that an active micro marker exists
  const status = statusSkill({ planningDir });
  if (!status.active || !status.marker || status.marker.skill !== 'micro') {
    return {
      ok: false,
      reason: 'no-active-micro',
      message: 'No active micro task found. Run `df-tools micro start <description>` first.',
    };
  }

  // Derive description from argument, falling back to marker (for CLI path where
  // cmdMicro reads it from the marker)
  const commitDesc = (description && description.trim()) ? description.trim() : (status.marker.description || 'micro task');

  // Check STATE.md exists (do NOT auto-create)
  const stateMdPath = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(stateMdPath)) {
    return {
      ok: false,
      reason: 'no-state-file',
      message: 'STATE.md not found. Project may not be fully initialized.',
    };
  }

  // Commit via runner
  const message = `chore(micro): ${commitDesc}`;
  const runner = gitRunner || ((cwd, opts) => _defaultGitRunner(cwd, opts));

  // Derive project root from planningDir (parent of .planning/)
  const projectRoot = path.dirname(planningDir);

  const commitResult = runner(projectRoot, { message, files });

  if (commitResult.exitCode !== 0) {
    return {
      ok: false,
      reason: 'commit-failed',
      message: `git commit failed: ${commitResult.stderr}`,
      stderr: commitResult.stderr,
      removed_marker: false,
    };
  }

  // Get short hash after successful commit
  let commitHash = null;
  const hashResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' },
  });
  if (hashResult.status === 0) {
    commitHash = hashResult.stdout.trim();
  }

  // When the runner is a mock (test injection), it may return a hash directly
  if (!commitHash && commitResult.stdout) {
    commitHash = commitResult.stdout.trim().substring(0, 7);
  }

  // Determine next_num for STATE.md row
  const nextNum = _nextQuickNum(planningDir);

  // Append STATE.md row
  try {
    _appendQuickTaskRow(stateMdPath, {
      num: nextNum,
      description: commitDesc,
      date: now || new Date().toISOString(),
      commitHash: commitHash || '',
      directory: path.basename(projectRoot),
    });
  } catch (e) {
    // Non-fatal: STATE.md write failed but commit succeeded
    // Fall through — still remove marker and return ok
  }

  // Remove the marker — only after successful commit
  endSkill({ planningDir });

  return {
    ok: true,
    commit_hash: commitHash,
    removed_marker: true,
  };
}

// ─── abortMicro ──────────────────────────────────────────────────────────────

/**
 * Removes the skill-active marker without committing. Idempotent.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .planning/
 * @returns {{ ok: boolean, removed?: boolean, reason?: string, message?: string }}
 */
function abortMicro({ planningDir }) {
  if (!planningDir) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: 'No .planning/ directory found in cwd or ancestors',
    };
  }

  const result = endSkill({ planningDir });
  return result;
}

// ─── cmdMicro ─────────────────────────────────────────────────────────────────

/**
 * CLI entry point for `df-tools micro`.
 *
 * @param {string} cwd - current working directory (for findPlanningDir)
 * @param {string[]} args - args after the 'micro' keyword
 * @param {boolean} raw - --raw flag (true = JSON-only output)
 */
function cmdMicro(cwd, args, raw) {
  const planningDir = findPlanningDir(cwd);
  const op = args[0];

  if (op === 'start') {
    const description = args.slice(1).join(' ').trim();
    const result = startMicro({
      planningDir,
      description,
      pid: process.pid,
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      error(result.message || result.reason);
      return;
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  if (op === 'commit') {
    // Parse --files flag
    const filesIndex = args.indexOf('--files');
    const files = filesIndex !== -1
      ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--'))
      : null;

    // Read description from active marker (set during `start`)
    const status = statusSkill({ planningDir });
    const description = (status.active && status.marker && status.marker.description)
      ? status.marker.description
      : null;

    // If marker has a description field, use it; otherwise description stays null
    // and commitMicro will derive from the marker.skill context
    // NOTE: The marker format from startSkill is {skill, started_at, pid} — no description field.
    // We need to store the description when starting. For now, cmdMicro passes the description
    // via a workaround: re-read from a task-description file if present, or require --description.
    // Simpler approach: store description in marker (extend startSkill payload via micro.cjs).
    // Since we can't modify skill-active.cjs (READ-ONLY), we store description separately.
    const descFile = planningDir ? path.join(planningDir, '.micro-description') : null;
    let commitDescription = null;
    if (descFile && fs.existsSync(descFile)) {
      commitDescription = fs.readFileSync(descFile, 'utf8').trim();
    }
    if (!commitDescription) {
      error('No micro description found. Was `df-tools micro start <description>` run?');
      return;
    }

    const result = commitMicro({
      planningDir,
      description: commitDescription,
      files: files && files.length > 0 ? files : null,
      now: new Date().toISOString(),
      gitRunner: null,
    });
    if (!result.ok) {
      error(result.message || result.reason);
      return;
    }
    // Clean up description file on success
    if (descFile && fs.existsSync(descFile)) {
      try { fs.unlinkSync(descFile); } catch {}
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  if (op === 'abort') {
    // Clean up description file too
    if (planningDir) {
      const descFile = path.join(planningDir, '.micro-description');
      if (fs.existsSync(descFile)) {
        try { fs.unlinkSync(descFile); } catch {}
      }
    }
    const result = abortMicro({ planningDir });
    if (!result.ok) {
      error(result.message || result.reason);
      return;
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  error(`Unknown micro subcommand: "${op}". Available: start <description>, commit [--files <path>...], abort`);
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  cmdMicro,
  startMicro,
  commitMicro,
  abortMicro,
  _setRunFs,
  _resetMocks,
};
