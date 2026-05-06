'use strict';

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const orgaw = require('./org-awareness.cjs');

// _runFs injection seam (mirrors dup-detect.cjs pattern)
const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  cpSync: (src, dst, opts) => fs.cpSync(src, dst, opts),
  rmSync: (p, opts) => fs.rmSync(p, opts),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetFsMock() { _runFs = realFs; }

// _walkStats indirection (separate seam for verify-failure simulation)
let _walkStatsImpl;
function _setWalkStats(fn) { _walkStatsImpl = fn; }
function _resetWalkStats() { _walkStatsImpl = null; }
function _walkStats(dir) { return (_walkStatsImpl || _walkStatsReal)(dir); }

function _walkStatsReal(dir) {
  const acc = { files: 0, bytes: 0 };
  if (!_runFs.existsSync(dir)) return acc;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = _runFs.readdirSync(current, { withFileTypes: true });
    } catch { continue; }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        try {
          const st = _runFs.statSync(full);
          acc.files++;
          acc.bytes += st.size;
        } catch { /* skip unreadable */ }
      }
    }
  }
  return acc;
}

// ─── scanForMisfiled (22-02) ────────────────────────────────────────────────

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

// ─── moveObjective (22-03) ──────────────────────────────────────────────────

function moveObjective({ cwd = process.cwd(), objectiveId, targetRepoPath }) {
  const { findObjectiveInternal } = require('./objective.cjs');
  const result = {
    ok: false,
    source_path: null,
    target_path: null,
    files_copied: 0,
    bytes_copied: 0,
    source_removed: false,
    warnings: [],
    next_steps: [],
  };

  const objInfo = findObjectiveInternal(cwd, objectiveId);
  if (!objInfo) {
    result.error = `objective '${objectiveId}' not found in current repo's .planning/objectives/`;
    return result;
  }
  const srcDir = path.join(cwd, objInfo.directory);
  result.source_path = objInfo.directory;

  const absTarget = path.resolve(cwd, targetRepoPath);
  const targetPlanning = path.join(absTarget, '.planning', 'objectives');
  if (!_runFs.existsSync(targetPlanning)) {
    result.error = `target repo at '${targetRepoPath}' (resolved: ${absTarget}) has no .planning/objectives/ — is it a devflow project?`;
    return result;
  }

  const targetDir = path.join(targetPlanning, path.basename(srcDir));
  result.target_path = targetDir;

  if (_runFs.existsSync(targetDir)) {
    result.error = `destination already exists: ${targetDir}. Refusing to overwrite. Rename or delete the existing directory first.`;
    return result;
  }

  try {
    _runFs.cpSync(srcDir, targetDir, { recursive: true });
  } catch (e) {
    try { _runFs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
    result.error = `copy failed: ${e.message}`;
    return result;
  }

  const srcStats = _walkStats(srcDir);
  const dstStats = _walkStats(targetDir);
  if (srcStats.files !== dstStats.files || srcStats.bytes !== dstStats.bytes) {
    try { _runFs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* best effort */ }
    result.error = `verify failed: src ${srcStats.files}f/${srcStats.bytes}b vs dst ${dstStats.files}f/${dstStats.bytes}b. Source preserved.`;
    return result;
  }
  result.files_copied = dstStats.files;
  result.bytes_copied = dstStats.bytes;

  try {
    _runFs.rmSync(srcDir, { recursive: true, force: true });
    result.source_removed = true;
  } catch (e) {
    result.error = `move copy succeeded but source removal failed: ${e.message}. Manual cleanup needed: ${srcDir}`;
    return result;
  }

  result.ok = true;
  result.warnings.push('Remember to update ROADMAP.md in both repos to reflect the move');
  result.next_steps = [
    `cd ${absTarget} && git add .planning/objectives/${path.basename(srcDir)} && git commit -m 'chore: receive objective ${objectiveId}'`,
    `cd ${cwd} && git add -A && git commit -m 'chore: move objective ${objectiveId} to ${path.basename(absTarget)}'`,
  ];
  return result;
}

function cmdProjectHygieneMove(cwd, args, raw) {
  const objectiveId = args.find((a) => !a.startsWith('--'));
  const toFlag = args.find((a) => a.startsWith('--to='));
  const targetRepoPath = toFlag ? toFlag.slice(5) : null;

  if (!objectiveId) {
    process.stderr.write('objective-id required: df-tools project-hygiene move <objective-id> --to=<path>\n');
    process.exit(1);
    return;
  }
  if (!targetRepoPath) {
    process.stderr.write('--to=<target-repo-path> required for project-hygiene move\n');
    process.exit(1);
    return;
  }

  const result = moveObjective({ cwd, objectiveId, targetRepoPath });
  process.stdout.write(JSON.stringify(result, null, raw ? 0 : 2));
  process.stdout.write('\n');
  process.exit(result.ok ? 0 : 1);
}

// ─── archiveProject (22-04) ─────────────────────────────────────────────────

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function _readProjectFm(repoDir) {
  const projectMd = path.join(repoDir, '.planning', 'PROJECT.md');
  if (!_runFs.existsSync(projectMd)) return null;
  try {
    return extractFrontmatter(_runFs.readFileSync(projectMd, 'utf-8')) || {};
  } catch {
    return null;
  }
}

function _lastCommitTimestampMs(repoDir) {
  try {
    const { execSync } = require('child_process');
    const ts = execSync('git log -1 --format=%cI', { cwd: repoDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!ts) return null;
    return new Date(ts).getTime();
  } catch {
    return null;
  }
}

function detectArchiveCandidates({ workspaceDir = process.cwd(), now = Date.now() } = {}) {
  const result = {
    ok: true,
    workspace_dir: workspaceDir,
    candidates: [],
    scanned: 0,
    errors: [],
  };

  let entries;
  try {
    entries = _runFs.readdirSync(workspaceDir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch (e) {
    if (e.code === 'ENOENT') {
      result.errors.push({ workspace: workspaceDir, error: 'workspace dir not found' });
      return result;
    }
    throw e;
  }

  for (const name of entries) {
    if (name.startsWith('.') || name === 'archived-projects') continue;
    const repoDir = path.join(workspaceDir, name);
    const fm = _readProjectFm(repoDir);
    if (!fm) continue;
    result.scanned++;

    const archivedFlag = fm.archived === true || fm.archived === 'true';
    const lastCommitMs = _lastCommitTimestampMs(repoDir);
    const stale = lastCommitMs != null && (now - lastCommitMs) > SIX_MONTHS_MS;

    if (archivedFlag || stale) {
      result.candidates.push({
        name,
        repo_dir: repoDir,
        archived_flag: archivedFlag,
        stale_by_age: stale,
        last_commit_iso: lastCommitMs ? new Date(lastCommitMs).toISOString() : null,
        github_repo: fm.github_repo || null,
      });
    }
  }

  return result;
}

function applyArchive({ workspaceDir = process.cwd(), name }) {
  const result = {
    ok: false,
    name,
    moved_from: null,
    moved_to: null,
    gh_archive_command: null,
    warnings: [],
  };

  if (!name) {
    result.error = 'name required';
    return result;
  }

  // Self-archive safety: refuse if name matches workspace cwd basename
  const workspaceBase = path.basename(workspaceDir);
  if (name === workspaceBase) {
    result.error = `refusing to self-archive (workspace dir basename matches '${name}')`;
    return result;
  }

  const repoDir = path.join(workspaceDir, name);
  const sourcePlanning = path.join(repoDir, '.planning');
  if (!_runFs.existsSync(sourcePlanning)) {
    result.error = `repo '${name}' has no .planning/ to archive`;
    return result;
  }

  const archiveRoot = path.join(workspaceDir, 'archived-projects', name);
  const targetPlanning = path.join(archiveRoot, '.planning');
  if (_runFs.existsSync(targetPlanning)) {
    result.error = `archive destination already exists: ${targetPlanning}. Manual review required.`;
    return result;
  }

  try {
    _runFs.mkdirSync(archiveRoot, { recursive: true });
    _runFs.cpSync(sourcePlanning, targetPlanning, { recursive: true });
  } catch (e) {
    try { _runFs.rmSync(targetPlanning, { recursive: true, force: true }); } catch { /* best effort */ }
    result.error = `archive copy failed: ${e.message}`;
    return result;
  }

  try {
    _runFs.rmSync(sourcePlanning, { recursive: true, force: true });
  } catch (e) {
    result.error = `archive copy succeeded but source removal failed: ${e.message}. Manual cleanup: ${sourcePlanning}`;
    return result;
  }

  // Fetch github_repo to emit gh archive command
  const fm = _readProjectFm(path.join(workspaceDir, 'archived-projects', name)) || {};
  if (fm.github_repo) {
    result.gh_archive_command = `gh repo archive ${fm.github_repo}`;
  }

  result.ok = true;
  result.moved_from = sourcePlanning;
  result.moved_to = targetPlanning;
  result.warnings.push('Repo workspace dir preserved; only .planning/ archived. Run gh_archive_command separately to archive on GitHub.');
  return result;
}

function cmdProjectHygieneArchive(cwd, args, raw) {
  const applyIdx = args.indexOf('--apply');
  if (applyIdx === -1) {
    const result = detectArchiveCandidates({ workspaceDir: path.dirname(cwd) });
    process.stdout.write(JSON.stringify(result, null, raw ? 0 : 2));
    process.stdout.write('\n');
    process.exit(0);
    return;
  }

  const name = args[applyIdx + 1];
  if (!name) {
    process.stderr.write('--apply requires <repo-name>: df-tools project-hygiene archive --apply <name>\n');
    process.exit(1);
    return;
  }

  const result = applyArchive({ workspaceDir: path.dirname(cwd), name });
  process.stdout.write(JSON.stringify(result, null, raw ? 0 : 2));
  process.stdout.write('\n');
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  // 22-02
  scanForMisfiled,
  cmdProjectHygieneCheck,
  _checkObjectiveRefs,
  // 22-03
  moveObjective,
  cmdProjectHygieneMove,
  _walkStats,
  _walkStatsReal,
  _setRunFs,
  _resetFsMock,
  _setWalkStats,
  _resetWalkStats,
  // 22-04
  detectArchiveCandidates,
  applyArchive,
  cmdProjectHygieneArchive,
};
