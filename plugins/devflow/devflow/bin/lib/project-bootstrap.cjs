'use strict';

/**
 * Self-healing bootstrap for PROJECT.md frontmatter.
 *
 * Runs at devflow entry points (init plan-objective / init execute-objective /
 * init research-objective). When the current repo has a PROJECT.md missing the
 * `org` and/or `github_repo` fields AND the git remote points at a GitHub repo,
 * derives both fields from the remote URL and writes them to disk.
 *
 * Does NOT auto-commit — the user folds the change into their next commit.
 *
 * Idempotent: a second invocation with the fields already present returns
 * { applied: false, reason: 'already bootstrapped' } and leaves the file untouched.
 *
 * Returns:
 *   {
 *     applied: boolean,            // true if file was written
 *     added_fields: string[],      // names of fields added (empty when applied=false)
 *     path: string|null,           // path to PROJECT.md (null when not found)
 *     reason: string|null,         // why applied=false (null when applied=true)
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

module.exports = {
  bootstrapProjectMd,
  _parseGithubRemote,
};
