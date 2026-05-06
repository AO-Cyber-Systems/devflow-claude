'use strict';

/**
 * Self-healing bootstrap helpers for PROJECT.md and OBJECTIVE.md frontmatter.
 *
 * bootstrapProjectMd(cwd):
 *   Runs at devflow entry points (init plan-objective / init execute-objective /
 *   init research-objective). When the current repo has a PROJECT.md missing the
 *   `org` and/or `github_repo` fields AND the git remote points at a GitHub repo,
 *   derives both fields from the remote URL and writes them to disk.
 *
 *   Does NOT auto-commit — the user folds the change into their next commit.
 *
 *   Idempotent: a second invocation with the fields already present returns
 *   { applied: false, reason: 'already bootstrapped' } and leaves the file untouched.
 *
 * bootstrapObjectiveMd(cwd, objectiveId):
 *   Creates a minimal OBJECTIVE.md stub when one is absent for a given objective
 *   directory. Reads PROJECT.md for default_work and ROADMAP.md for the goal line
 *   (both best-effort, graceful fallbacks on missing files). Pure file I/O — no
 *   shell-out, no git dependency.
 *
 *   Idempotent: returns { applied: false, reason: 'already exists' } when file exists.
 *
 * backfillAllObjectives(cwd):
 *   Walks .planning/objectives/ subdirectories and calls bootstrapObjectiveMd per dir.
 *   Returns { scanned, applied, skipped, errors }. Does NOT auto-commit.
 *
 * All functions return shape: { applied, added_fields, path, reason }
 * backfillAllObjectives returns: { scanned, applied, skipped, errors }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Internal helpers ───────────────────────────────────────────────────────

function _getRemoteUrl(cwd) {
  try {
    return execSync('git config --get remote.origin.url', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function _parseGithubRemote(url) {
  if (!url) return null;
  // Matches https://github.com/Owner/repo(.git) and git@github.com:Owner/repo(.git)
  const m = url.match(/github\.com[:/]([^/\s]+)\/([^/\s.]+?)(?:\.git)?(?:\s|$|\/)/);
  if (!m) return null;
  return { org: m[1], repo: m[2] };
}

// ─── bootstrapProjectMd ─────────────────────────────────────────────────────

function bootstrapProjectMd(cwd) {
  const projectMdPath = path.join(cwd, '.planning', 'PROJECT.md');

  if (!fs.existsSync(projectMdPath)) {
    return { applied: false, added_fields: [], path: null, reason: 'no PROJECT.md' };
  }

  const remoteUrl = _getRemoteUrl(cwd);
  if (!remoteUrl) {
    return { applied: false, added_fields: [], path: projectMdPath, reason: 'no git remote' };
  }

  const parsed = _parseGithubRemote(remoteUrl);
  if (!parsed) {
    return { applied: false, added_fields: [], path: projectMdPath, reason: 'remote URL not GitHub' };
  }

  const org = parsed.org;
  const githubRepo = `${parsed.org}/${parsed.repo}`;

  const content = fs.readFileSync(projectMdPath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

  const addedFields = [];
  let newContent;

  if (!fmMatch) {
    // No frontmatter at all — prepend a minimal one
    addedFields.push('org', 'github_repo');
    newContent = `---\norg: ${org}\ngithub_repo: ${githubRepo}\n---\n\n${content}`;
  } else {
    const fmBlock = fmMatch[1];
    let newFm = fmBlock;
    if (!/^org:/m.test(fmBlock)) {
      newFm = newFm + `\norg: ${org}`;
      addedFields.push('org');
    }
    if (!/^github_repo:/m.test(fmBlock)) {
      newFm = newFm + `\ngithub_repo: ${githubRepo}`;
      addedFields.push('github_repo');
    }
    if (addedFields.length === 0) {
      return { applied: false, added_fields: [], path: projectMdPath, reason: 'already bootstrapped' };
    }
    newContent = `---\n${newFm}\n---${content.slice(fmMatch[0].length)}`;
  }

  fs.writeFileSync(projectMdPath, newContent, 'utf-8');
  return { applied: true, added_fields: addedFields, path: projectMdPath, reason: null };
}

// ─── bootstrapObjectiveMd ───────────────────────────────────────────────────

/**
 * Creates a minimal OBJECTIVE.md stub for the given objective directory when
 * one does not already exist.
 *
 * @param {string} cwd - Project root (directory containing .planning/)
 * @param {string} objectiveId - Objective directory name, e.g. '09-roadmap-disk-reconciliation'
 * @returns {{ applied: boolean, added_fields: string[], path: string|null, reason: string|null }}
 */
function bootstrapObjectiveMd(cwd, objectiveId) {
  const objectiveDir = path.join(cwd, '.planning', 'objectives', objectiveId);

  if (!fs.existsSync(objectiveDir)) {
    return { applied: false, added_fields: [], path: null, reason: 'objective dir not found' };
  }

  const objectiveMdPath = path.join(objectiveDir, 'OBJECTIVE.md');

  if (fs.existsSync(objectiveMdPath)) {
    return { applied: false, added_fields: [], path: objectiveMdPath, reason: 'already exists' };
  }

  // Read PROJECT.md to get default_work (best-effort, fallback: 'feature')
  const projectMdPath = path.join(cwd, '.planning', 'PROJECT.md');
  let defaultWork = 'feature';
  if (fs.existsSync(projectMdPath)) {
    const content = fs.readFileSync(projectMdPath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const dwMatch = fmMatch[1].match(/^default_work:\s*(\S+)/m);
      if (dwMatch) defaultWork = dwMatch[1];
    }
  }

  // Extract objective name + goal from ROADMAP.md (best-effort)
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  // Strip leading zeros from the numeric segment: '09-foo' → '9', '0' → '0'
  const objectiveNum = String(objectiveId).split('-')[0].replace(/^0+/, '') || '0';
  let goalLine = '_(extract from ROADMAP.md "### Objective N:" entry)_';
  let objectiveName = objectiveId;

  if (fs.existsSync(roadmapPath)) {
    const roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    // Match heading: ### Objective N: <name>
    const headingRe = new RegExp(`^### Objective ${objectiveNum}:\\s*(.+)$`, 'm');
    const headingMatch = roadmap.match(headingRe);
    if (headingMatch) objectiveName = headingMatch[1].trim();
    // Extract **Goal:** line following the heading
    const goalRe = new RegExp(`### Objective ${objectiveNum}:[\\s\\S]*?\\*\\*Goal:\\*\\*\\s*([^\\n]+)`, 'm');
    const goalMatch = roadmap.match(goalRe);
    if (goalMatch) goalLine = goalMatch[1].trim();
  }

  const today = new Date().toISOString().slice(0, 10);
  const stub = `---
work: ${defaultWork}
---

# ${objectiveName}

## Goal

${goalLine}

---
*Created: ${today} (auto-scaffold via bootstrapObjectiveMd)*
`;

  fs.writeFileSync(objectiveMdPath, stub, 'utf-8');
  return { applied: true, added_fields: ['work'], path: objectiveMdPath, reason: null };
}

// ─── backfillAllObjectives ──────────────────────────────────────────────────

/**
 * Walks .planning/objectives/ subdirectories and calls bootstrapObjectiveMd for each
 * objective directory that is missing an OBJECTIVE.md.
 *
 * @param {string} cwd - Project root
 * @returns {{ scanned: number, applied: number, skipped: number, errors: Array }}
 */
function backfillAllObjectives(cwd) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const result = { scanned: 0, applied: 0, skipped: 0, errors: [] };

  if (!fs.existsSync(objectivesDir)) return result;

  const entries = fs.readdirSync(objectivesDir).sort(); // sort for determinism
  for (const entry of entries) {
    const dir = path.join(objectivesDir, entry);
    try {
      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) continue;
      result.scanned++;
      const r = bootstrapObjectiveMd(cwd, entry);
      if (r.applied) result.applied++;
      else result.skipped++;
    } catch (e) {
      result.errors.push({ objective: entry, message: e.message });
    }
  }

  return result;
}

// ─── module.exports ─────────────────────────────────────────────────────────

module.exports = {
  bootstrapProjectMd,
  bootstrapObjectiveMd,     // NEW (TRD 18-01)
  backfillAllObjectives,    // NEW (TRD 18-01)
  _parseGithubRemote,
};
