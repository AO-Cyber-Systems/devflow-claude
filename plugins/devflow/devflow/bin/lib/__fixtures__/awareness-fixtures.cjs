'use strict';

// Hand-built fixture builders for awareness module tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// ─── buildStateMd ─────────────────────────────────────────────────────────────

/**
 * Build realistic STATE.md content from explicit fields.
 * All params optional — output contains ONLY lines for params that are passed.
 * The header (`# DevFlow State`) and `## Current Position` section are always present.
 *
 * @param {object} opts
 * @param {string}   [opts.objective]           - "2 — Cross-worktree session telemetry"
 * @param {string}   [opts.trd]                 - "02-01"
 * @param {string}   [opts.branch]              - "feature/v1.1-obj-2-heartbeat"
 * @param {string}   [opts.github_issue]        - "AO-Cyber-Systems/devflow-claude#11"
 * @param {string[]} [opts.objective_complete]  - array of completed objective strings
 * @returns {string}
 */
function buildStateMd({
  objective,
  trd,
  branch,
  github_issue,
  objective_complete = [],
} = {}) {
  const lines = ['# DevFlow State', ''];

  // Completed objectives first (they appear before in-flight in real STATE.md)
  for (const c of objective_complete) {
    lines.push(`**Objective complete:** ${c}`);
  }

  lines.push('## Current Position', '');

  if (objective !== undefined) {
    lines.push(`**Objective in flight:** ${objective}`);
  }
  if (trd !== undefined) {
    lines.push(`**Current TRD:** ${trd}`);
  }
  if (branch !== undefined) {
    lines.push(`**Branch:** \`${branch}\``);
  }
  if (github_issue !== undefined) {
    lines.push(`github_issue: ${github_issue}`);
  }

  return lines.join('\n') + '\n';
}

// ─── buildOrgItem ─────────────────────────────────────────────────────────────

/**
 * Build a minimal valid org-scan item.
 * Shape matches what walkProject (TRD 02-03) emits and aggregateOrgByProductQuarter consumes.
 *
 * @param {object} opts
 * @param {string}   [opts.issue_ref]   - "AO-Cyber-Systems/test#1"
 * @param {string}   [opts.title]       - "Test item"
 * @param {string}   [opts.body]        - ""
 * @param {string}   [opts.product]     - null
 * @param {string}   [opts.quarter]     - null
 * @param {string}   [opts.status]      - null
 * @param {object[]} [opts.sub_issues]  - []
 * @returns {object}
 */
function buildOrgItem({
  issue_ref = 'AO-Cyber-Systems/test#1',
  title = 'Test item',
  body = '',
  product = null,
  quarter = null,
  status = null,
  sub_issues = [],
} = {}) {
  return {
    item_type: 'issue',
    issue_ref,
    title,
    body,
    product,
    quarter,
    status,
    sub_issues,
  };
}

// ─── buildSubIssue ────────────────────────────────────────────────────────────

/**
 * Build a sub-issue object for use inside buildOrgItem's sub_issues array.
 *
 * @param {object} opts
 * @param {string} [opts.ref]   - "AO-Cyber-Systems/test#2"
 * @param {string} [opts.title] - "Test sub-issue"
 * @param {string} [opts.state] - "OPEN"
 * @returns {object}
 */
function buildSubIssue({
  ref = 'AO-Cyber-Systems/test#2',
  title = 'Test sub-issue',
  state = 'OPEN',
} = {}) {
  return { ref, title, state };
}

// ─── buildOrgScanResult ───────────────────────────────────────────────────────

/**
 * Build the shape that scanOrg (TRD 02-03) emits.
 * Compatible with aggregateOrgByProductQuarter's expected input.
 *
 * @param {object}   opts
 * @param {object[]} [opts.items]       - array of buildOrgItem results
 * @param {string}   [opts.fetched_at]  - ISO timestamp
 * @param {string}   [opts.project_id]  - "PVT_test"
 * @param {string[]} [opts.warnings]    - []
 * @returns {object}
 */
function buildOrgScanResult({
  items = [],
  fetched_at = new Date().toISOString(),
  project_id = 'PVT_test',
  warnings = [],
} = {}) {
  return { items, fetched_at, project_id, warnings };
}

// ─── buildGitFixtureRepo ──────────────────────────────────────────────────────

/**
 * Create a tmp git repo with N branches each carrying a STATE.md at .planning/STATE.md.
 * Used by TRD 02-02 and 02-07 for integration tests gated on GIT_INTEGRATION=1.
 *
 * Spawns: tmp dir → `git init` → initial commit on main → per branch:
 *   `git checkout -b <name>` → write state_md → `git add` → `git commit`
 * Then checks back out to main.
 *
 * IMPORTANT: spawnSync'd with timeout 5000ms. If git is not installed, throws
 * with a message callers can catch and t.skip() on.
 *
 * Signatures LOCKED — TRDs 02-02 / 02-07 call these params as-is.
 *
 * @param {object}   opts
 * @param {object[]} [opts.branches]   - [{ name: 'feature/foo', state_md: '...' }, ...]
 * @param {string}   [opts.dev_name]   - git user.name for commits (default 'test-dev')
 * @returns {{ root: string, cleanup: () => void, ranGit: object[] }}
 */
function buildGitFixtureRepo({
  branches = [],
  dev_name = 'test-dev',
} = {}) {
  function git(...args) {
    const result = spawnSync('git', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
      cwd: root,
    });
    ranGit.push({ args, status: result.status, stdout: result.stdout, stderr: result.stderr });
    if (result.error) {
      throw new Error(`git not available: ${result.error.message}`);
    }
    return result;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-git-fixture-'));
  const ranGit = [];

  try {
    // Init repo
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', dev_name);

    // Initial commit on main with a README so we have a base
    fs.writeFileSync(path.join(root, 'README.md'), '# test repo\n', 'utf-8');
    git('add', 'README.md');
    git('commit', '-m', 'chore: initial commit');

    // Create each branch with its STATE.md
    for (const br of branches) {
      git('checkout', '-b', br.name);

      const planningDir = path.join(root, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), br.state_md || '', 'utf-8');

      git('add', path.join('.planning', 'STATE.md'));
      git('commit', '-m', 'test: branch state');

      // Return to main so we can branch from main again
      git('checkout', 'main');
    }
  } catch (err) {
    // cleanup on setup failure
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    throw err;
  }

  function cleanup() {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }

  return { root, cleanup, ranGit };
}

// ─── TRD 02-02: peer scanner mocks ──────────────────────────────────────────

/**
 * Mirror of buildMockRunGh from gh-fixtures.cjs — for git invocations.
 * `responses` is a Map<string, { ok, stdout, stderr }> keyed by joined args.
 * Exact match first, then prefix match (longest prefix wins).
 */
function buildMockRunGit(responses = new Map()) {
  let callCount = 0;
  const calls = [];

  function mockRunGit(args, opts) {
    callCount++;
    const key = args.join(' ');
    calls.push({ args, opts, key });
    if (responses.has(key)) return responses.get(key);
    let bestKey = null, bestLen = -1;
    for (const [k] of responses.entries()) {
      if (key.startsWith(k) && k.length > bestLen) { bestKey = k; bestLen = k.length; }
    }
    if (bestKey !== null) return responses.get(bestKey);
    return { ok: false, status: 1, stdout: '', stderr: `[mock] no match for: ${key}` };
  }

  mockRunGit.callCount = () => callCount;
  mockRunGit.calls = () => [...calls];
  return mockRunGit;
}

/**
 * Canned response for `git for-each-ref refs/remotes/origin/ --format='%(refname:short)'`.
 * `branches` is an array of short ref names (e.g., 'origin/feature/v1.1').
 */
function buildGitForEachRefOutput({ branches = [] } = {}) {
  return {
    ok: true, status: 0,
    stdout: branches.map(b => b.startsWith('origin/') ? b : `origin/${b}`).join('\n'),
    stderr: '',
  };
}

/**
 * Canned response for `git log -1 --format='%H%x00%cI%x00%s' <branch>`.
 * Returns NUL-separated SHA, ISO timestamp, subject.
 */
function buildGitLogOutput({ sha = 'abc123def4567890', timestamp = '2026-05-04T08:31:00Z', subject = 'feat: test commit' } = {}) {
  return {
    ok: true, status: 0,
    stdout: `${sha}\x00${timestamp}\x00${subject}`,
    stderr: '',
  };
}

/**
 * Canned response for `git show <branch>:.planning/STATE.md`.
 * Pass either `state_md` (full content) or { objective, trd, ... } and
 * fixture builder calls buildStateMd internally.
 */
function buildGitShowStateMd({ state_md, objective, trd, branch, github_issue, objective_complete } = {}) {
  const content = state_md != null
    ? state_md
    : buildStateMd({ objective, trd, branch, github_issue, objective_complete });
  return { ok: true, status: 0, stdout: content, stderr: '' };
}

/**
 * Canned ENOENT response — STATE.md missing on branch.
 */
function buildGitShowMissingFile() {
  return { ok: false, status: 128, stdout: '', stderr: 'fatal: path does not exist in branch' };
}

/**
 * Canned response for `git fetch --all --prune`.
 */
function buildGitFetchSuccess() {
  return { ok: true, status: 0, stdout: '', stderr: '' };
}

function buildGitFetchFailure({ stderr = 'fatal: unable to access remote' } = {}) {
  return { ok: false, status: 128, stdout: '', stderr };
}

/**
 * Canned response for `git config user.name`.
 */
function buildGitConfigUserName({ name = 'mark' } = {}) {
  return { ok: true, status: 0, stdout: name, stderr: '' };
}

// ─── TRD 03-01: filesystem fixture builders ───────────────────────────────────

/**
 * Create a tmp filesystem fixture representing a sibling repo.
 * Mirrors buildGitFixtureRepo pattern but filesystem-only (no git).
 *
 * Directory structure created:
 *   ${tmpdir}/${name}/
 *     .git/               (empty marker — enough for existsSync('.git') check)
 *     .planning/
 *       STATE.md          (stub state)
 *       objectives/
 *         ${obj.id}/
 *           ${obj.id}-SUMMARY.md   (with obj.summary_content)
 *     PROJECT.md          (omitted if omit_project_md: true)
 *
 * IMPORTANT: caller is responsible for cleanup via fs.rmSync(root, { recursive: true, force: true }).
 * Use a mkdtemp'd parent tmpdir and pass it as `tmpdir`.
 *
 * @param {object}   opts
 * @param {string}   opts.tmpdir                      - parent tmp dir (required)
 * @param {string}   [opts.name]                      - repo dir name (default: 'sibling-repo')
 * @param {string}   [opts.org]                       - org field in PROJECT.md (default: 'AO-Cyber-Systems')
 * @param {boolean}  [opts.omit_project_md]           - if true, skip PROJECT.md (for D5 test)
 * @param {object[]} [opts.objectives]                - array of { id, summary_content }
 * @param {number}   [opts.summary_mtime_days_ago]    - backdate SUMMARY.md mtime (0 = now)
 * @returns {{ root: string, project_md_path: string|null, objective_paths: string[] }}
 */
function buildSiblingRepoTree({
  tmpdir,
  name = 'sibling-repo',
  org = 'AO-Cyber-Systems',
  omit_project_md = false,
  objectives = [{ id: '01-foo', summary_content: 'sibling work on auth keys controller' }],
  summary_mtime_days_ago = 0,
} = {}) {
  if (!tmpdir) throw new Error('buildSiblingRepoTree: tmpdir is required');

  const root = path.join(tmpdir, name);
  fs.mkdirSync(root, { recursive: true });

  // .git marker (empty dir — enough for existsSync check)
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });

  // .planning/
  const planningDir = path.join(root, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  // .planning/STATE.md (stub)
  fs.writeFileSync(
    path.join(planningDir, 'STATE.md'),
    `# DevFlow State\n\n## Current Position\n\n**Branch:** \`feature/main\`\n`,
    'utf-8',
  );

  // PROJECT.md
  let project_md_path = null;
  if (!omit_project_md) {
    project_md_path = path.join(root, 'PROJECT.md');
    fs.writeFileSync(
      project_md_path,
      `---\norg: ${org}\nkind: api\n---\n# ${name}\n\nSibling repo fixture.\n`,
      'utf-8',
    );
  }

  // .planning/objectives/ tree
  const objectivePaths = [];
  const objsDir = path.join(planningDir, 'objectives');
  fs.mkdirSync(objsDir, { recursive: true });

  const nowMs = Date.now();
  for (const obj of objectives) {
    const objDir = path.join(objsDir, obj.id);
    fs.mkdirSync(objDir, { recursive: true });
    const summaryPath = path.join(objDir, `${obj.id}-SUMMARY.md`);
    fs.writeFileSync(summaryPath, obj.summary_content || '', 'utf-8');
    if (summary_mtime_days_ago > 0) {
      const backdatedMs = nowMs - summary_mtime_days_ago * 86400000;
      const backdatedSec = backdatedMs / 1000;
      fs.utimesSync(summaryPath, backdatedSec, backdatedSec);
    }
    objectivePaths.push(summaryPath);
  }

  return { root, project_md_path, objective_paths: objectivePaths };
}

/**
 * Build a canned-response filesystem mock object.
 * Mirrors buildMockRunGit pattern but for filesystem operations.
 *
 * - files:   map of absolute path → file content string
 * - dirs:    map of absolute path → array of entry names (strings or Dirent-like objects)
 * - missing: array of paths that existsSync returns false and readFileSync throws ENOENT
 * - mtimes:  map of absolute path → msSinceEpoch (overrides the default Date.now())
 *
 * readFileSync for unconfigured (non-missing) paths throws an informative error
 * so tests catch missing fixture setup early.
 *
 * @param {object}   opts
 * @param {object}   [opts.files]    - { [path]: content }
 * @param {object}   [opts.dirs]     - { [path]: string[] }
 * @param {string[]} [opts.missing]  - paths that don't exist
 * @param {object}   [opts.mtimes]   - { [path]: msSinceEpoch }
 * @returns {object} mock _runFs-compatible object
 */
function buildMockRunFs({ files = {}, dirs = {}, missing = [], mtimes = {} } = {}) {
  return {
    readFileSync(p, enc) {
      if (missing.includes(p)) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' });
      }
      if (files[p] != null) return files[p];
      throw new Error(`buildMockRunFs: no fixture for readFileSync path: ${p}`);
    },
    readdirSync(p, opts) {
      if (dirs[p] != null) return dirs[p];
      throw new Error(`buildMockRunFs: no fixture for readdirSync path: ${p}`);
    },
    existsSync(p) {
      if (missing.includes(p)) return false;
      return files[p] != null || dirs[p] != null;
    },
    statSync(p) {
      if (missing.includes(p)) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${p}'`), { code: 'ENOENT' });
      }
      const mtime = mtimes[p] != null ? mtimes[p] : Date.now();
      if (files[p] != null) return { isDirectory: () => false, isFile: () => true, mtimeMs: mtime };
      if (dirs[p] != null) return { isDirectory: () => true, isFile: () => false, mtimeMs: mtime };
      throw new Error(`buildMockRunFs: no fixture for statSync path: ${p}`);
    },
  };
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // TRD 02-01:
  buildStateMd,
  buildOrgItem,
  buildSubIssue,
  buildOrgScanResult,
  buildGitFixtureRepo,
  // TRD 02-02:
  buildMockRunGit,
  buildGitForEachRefOutput,
  buildGitLogOutput,
  buildGitShowStateMd,
  buildGitShowMissingFile,
  buildGitFetchSuccess,
  buildGitFetchFailure,
  buildGitConfigUserName,
  // TRD 03-01:
  buildSiblingRepoTree,
  buildMockRunFs,
};
