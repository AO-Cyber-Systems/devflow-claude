'use strict';

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const orgaw = require('./org-awareness.cjs');

function scanForMisfiled({ cwd = process.cwd() } = {}) {
  const result = {
    ok: true,
    project_repo: null,
    project_archived: false,
    objectives_scanned: 0,
    misfiled: [],
    no_link: [],
    errors: [],
    skipped: false,
    warnings: [],
  };

  const projectMdPath = path.join(cwd, '.planning', 'PROJECT.md');
  let projectCtx = {};
  if (fs.existsSync(projectMdPath)) {
    try {
      projectCtx = extractFrontmatter(fs.readFileSync(projectMdPath, 'utf-8')) || {};
    } catch (e) {
      result.warnings.push(`PROJECT.md frontmatter parse failed: ${e.message}`);
    }
  }
  result.project_repo = projectCtx.github_repo || null;
  result.project_archived = projectCtx.archived === true || projectCtx.archived === 'true';

  if (!result.project_repo) {
    result.reason = 'github_repo absent in PROJECT.md';
    return result;
  }

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  let dirs;
  try {
    dirs = fs.readdirSync(objectivesDir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch (e) {
    if (e.code === 'ENOENT') {
      result.warnings.push('.planning/objectives/ not found');
      return result;
    }
    throw e;
  }

  for (const dirName of dirs) {
    result.objectives_scanned++;
    const objMdPath = path.join(objectivesDir, dirName, 'OBJECTIVE.md');
    if (!fs.existsSync(objMdPath)) {
      result.no_link.push({
        objective: dirName,
        directory: path.join('.planning', 'objectives', dirName),
        reason: 'OBJECTIVE.md not found',
      });
      continue;
    }

    let frontmatter;
    try {
      frontmatter = extractFrontmatter(fs.readFileSync(objMdPath, 'utf-8')) || {};
    } catch (e) {
      result.errors.push({ objective: dirName, error: `frontmatter parse failed: ${e.message}` });
      continue;
    }

    const flagged = _checkObjectiveRefs(dirName, frontmatter, result.project_repo);
    if (flagged === 'no_link') {
      result.no_link.push({
        objective: dirName,
        directory: path.join('.planning', 'objectives', dirName),
        reason: 'no parent_issue or github_issue in frontmatter (or only shorthand refs)',
      });
    } else if (flagged) {
      result.misfiled.push({
        objective: dirName,
        directory: path.join('.planning', 'objectives', dirName),
        current_repo: result.project_repo,
        ...flagged,
      });
    }
  }

  return result;
}

function _checkObjectiveRefs(objectiveName, frontmatter, projectRepo) {
  const candidates = [
    { field: 'parent_issue', value: frontmatter.parent_issue },
    { field: 'github_issue', value: frontmatter.github_issue },
  ];

  for (const { field, value } of candidates) {
    if (!value || typeof value !== 'string') continue;
    const repo = orgaw._extractRepoFromRef(value);
    if (!repo) continue;
    if (repo === projectRepo) return null;
    return { resolved_repo: repo, via: field, ref: value };
  }

  return 'no_link';
}

function cmdProjectHygieneCheck(cwd, raw) {
  const result = scanForMisfiled({ cwd });
  process.stdout.write(JSON.stringify(result, null, raw ? 0 : 2));
  process.stdout.write('\n');
  process.exit(0);
}

module.exports = {
  scanForMisfiled,
  cmdProjectHygieneCheck,
  _checkObjectiveRefs,
};
