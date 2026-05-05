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

  // PROJECT.md (lives at .planning/PROJECT.md, not the repo root)
  let project_md_path = null;
  if (!omit_project_md) {
    project_md_path = path.join(planningDir, 'PROJECT.md');
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

// ─── TRD 03-02: eden-libs fixture builder ─────────────────────────────────────

/**
 * Create a tmp filesystem fixture representing an eden-libs repo.
 *
 * Directory structure created:
 *   ${tmpdir}/${name}/
 *     package.json       (unless omit_package_json: true)
 *     ${index_filename}  (named exports; or index_content_override if set)
 *
 * IMPORTANT: caller is responsible for cleanup via fs.rmSync(root, { recursive: true, force: true }).
 *
 * @param {object}   opts
 * @param {string}   opts.tmpdir                  - parent tmp dir (required)
 * @param {string}   [opts.name]                  - dir name (default: 'eden-libs')
 * @param {boolean}  [opts.omit_package_json]     - if true, skip package.json
 * @param {string}   [opts.package_json_main]     - main field (default: 'index.cjs')
 * @param {*}        [opts.package_json_exports]  - exports field (null | string | object)
 * @param {string}   [opts.index_filename]        - index file name (default: 'index.cjs')
 * @param {string[]} [opts.exports]               - export symbol names (default: ['parseStateMd', 'resolveChain'])
 * @param {string}   [opts.index_content_override] - override the generated index content
 * @returns {{ root: string, index_path: string, package_json_path: string|null }}
 */
function buildEdenLibsTree({
  tmpdir,
  name = 'eden-libs',
  omit_package_json = false,
  package_json_main = 'index.cjs',
  package_json_exports = null,
  index_filename = 'index.cjs',
  exports: exportNames = ['parseStateMd', 'resolveChain'],
  index_content_override = null,
} = {}) {
  if (!tmpdir) throw new Error('buildEdenLibsTree: tmpdir is required');

  const root = path.join(tmpdir, name);
  fs.mkdirSync(root, { recursive: true });

  let package_json_path = null;
  if (!omit_package_json) {
    const pkg = {
      name: 'eden-libs',
      version: '0.0.1',
      main: package_json_main,
    };
    if (package_json_exports != null) pkg.exports = package_json_exports;
    package_json_path = path.join(root, 'package.json');
    fs.writeFileSync(package_json_path, JSON.stringify(pkg, null, 2));
  }

  const indexPath = path.join(root, index_filename);
  // Ensure parent dir exists (for cases where index_filename has nested path like 'lib/main.cjs')
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });

  let indexContent = index_content_override;
  if (indexContent == null) {
    const lines = [];
    lines.push("'use strict';");
    lines.push('');
    lines.push('module.exports = {');
    for (const sym of exportNames) {
      lines.push(`  ${sym}: function ${sym}() { return null; },`);
    }
    lines.push('};');
    indexContent = lines.join('\n') + '\n';
  }
  fs.writeFileSync(indexPath, indexContent);

  return { root, index_path: indexPath, package_json_path };
}

// ─── TRD 03-03: org-overlap fixture builder ───────────────────────────────────

/**
 * Build a canned scanOrg-shaped result with controllable scoring inputs.
 *
 * Designed for testing scanOrgOverlap without hitting the network.
 * Each item in the result has:
 *   - An optional chain_match sub-issue (sub-issue ref in sibling_repos[0])
 *   - Optional matching keywords in title/body
 *
 * @param {object}   opts
 * @param {number}   [opts.items_count]                - number of items to generate (default: 3)
 * @param {string[]} [opts.sibling_repos]              - sibling repo refs for chain-match (default: ['AO-Cyber-Systems/aodex'])
 * @param {string[][]} [opts.matching_keywords_per_item] - per-item keyword arrays for title/body
 * @param {number[]} [opts.chain_matches]              - indices of items whose sub_issues contain sibling refs
 * @param {string}   [opts.project_id]                 - project ID (default: 'PVT_test')
 * @param {string[]} [opts.warnings]                   - warnings on the scanOrg result
 * @returns {object} scanOrg-shaped result
 */
function buildOrgOverlapFixture({
  items_count = 3,
  sibling_repos = ['AO-Cyber-Systems/aodex'],
  matching_keywords_per_item = [],
  chain_matches = [],
  project_id = 'PVT_test',
  warnings = [],
} = {}) {
  const items = [];
  for (let i = 0; i < items_count; i++) {
    const subs = [];
    if (chain_matches.includes(i) && sibling_repos.length > 0) {
      subs.push({
        ref: `${sibling_repos[0]}#${100 + i}`,
        title: `sub-issue for item ${i}`,
        state: 'OPEN',
      });
    }
    const kws = matching_keywords_per_item[i] || [];
    items.push({
      item_type: 'issue',
      issue_ref: `AO-Cyber-Systems/devflow-claude#${50 + i}`,
      title: kws.length > 0 ? `[Roadmap] ${kws.join(' ')}` : `[Roadmap] item ${i}`,
      body: kws.join(' '),
      product: 'DevFlow',
      quarter: 'Q2 2026',
      status: 'In Progress',
      sub_issues: subs,
      sub_issues_source: subs.length ? 'tracked_issues' : 'none',
    });
  }
  return {
    items,
    fetched_at: new Date().toISOString(),
    project_id,
    warnings,
  };
}

// ─── TRD 04-01: dup-detect fixture builders ───────────────────────────────────

/**
 * Build a single peer-scanner branch entry shape.
 * Mirrors the shape that awareness.scanPeer() returns per branch.
 *
 * @param {object} opts
 * @param {string}   [opts.branch]             - "feature/v1.1-obj-04-dup-detect"
 * @param {string}   [opts.objective]          - "04-duplicate-work-detection"
 * @param {string}   [opts.github_issue]       - "AO-Cyber-Systems/devflow-claude#13"
 * @param {string[]} [opts.files_modified]     - file paths from peer TRD frontmatter (pre-read)
 * @param {string}   [opts.last_commit_iso]    - ISO timestamp of last commit
 * @param {string}   [opts.trd]               - "04-01"
 * @param {string}   [opts.developer]         - "mark"
 * @returns {object}
 */
function buildPeerBranch({
  branch = 'feature/v1.1-obj-04-dup-detect',
  objective = '04-duplicate-work-detection',
  github_issue = null,
  files_modified = [],
  last_commit_iso = '2026-05-04T10:00:00Z',
  trd = '04-01',
  developer = 'mark',
} = {}) {
  return {
    branch,
    objective,
    trd,
    github_issue,
    files_modified,
    last_commit: last_commit_iso,
    developer,
  };
}

/**
 * Build a scanPeer()-shaped result (wraps branches array for mock returns).
 *
 * @param {object}   opts
 * @param {object[]} [opts.branches]        - array of buildPeerBranch results
 * @param {string}   [opts.current_branch]  - "feature/v1.1-obj-04-dup-detect"
 * @param {string}   [opts.fetched_at]      - ISO timestamp
 * @param {string[]} [opts.warnings]        - []
 * @returns {object}
 */
function buildPeerScanResult({
  branches = [],
  current_branch = 'feature/v1.1',
  fetched_at = new Date().toISOString(),
  warnings = [],
} = {}) {
  return { branches, current_branch, fetched_at, warnings };
}

/**
 * Build a single scanOrgOverlap items[] entry shape.
 * Mirrors the shape that scanOrgOverlap() returns per item.
 *
 * @param {object} opts
 * @param {string}   [opts.issue_ref]          - "AO-Cyber-Systems/devflow-claude#13"
 * @param {string}   [opts.title]              - "Duplicate work detection"
 * @param {number}   [opts.score]              - overlap score (0-1)
 * @param {boolean}  [opts.chain_match]        - true if matched via issue chain
 * @param {string[]} [opts.matched_keywords]   - ["duplicate", "detection"]
 * @returns {object}
 */
function buildOrgOverlapMatch({
  issue_ref = 'AO-Cyber-Systems/devflow-claude#13',
  title = 'Duplicate work detection',
  score = 0.5,
  chain_match = false,
  matched_keywords = [],
} = {}) {
  return {
    issue_ref,
    title,
    score,
    chain_match,
    matched_keywords,
  };
}

/**
 * Combined fixture helper returning paired peer + org-overlap fixtures
 * for end-to-end detection tests.
 *
 * Returns variants with hard/strong/weak signal variations:
 * - hard: peer with same github_issue as current
 * - strong_file: peer with >=2 overlapping files_modified
 * - strong_keyword: peer with >=3 overlapping keywords
 * - weak: peer with 1 overlapping keyword
 * - no_match: peer with no overlap
 * - org_hard: org-overlap item with chain_match: true + matching issue_ref
 *
 * @param {object} opts
 * @param {string}   [opts.current_issue]   - "AO-Cyber-Systems/devflow-claude#13"
 * @param {string[]} [opts.current_files]   - current objective's files_modified
 * @returns {object}
 */
function buildDupDetectFixtures({
  current_issue = 'AO-Cyber-Systems/devflow-claude#13',
  current_files = [
    'plugins/devflow/devflow/bin/lib/dup-detect.cjs',
    'plugins/devflow/devflow/bin/lib/dup-detect.test.cjs',
    'plugins/devflow/devflow/bin/df-tools.cjs',
  ],
} = {}) {
  const hardPeer = buildPeerBranch({
    branch: 'feature/v1.1-peer-hard-match',
    objective: '04-duplicate-work-detection',
    github_issue: current_issue,
    files_modified: ['plugins/devflow/devflow/bin/lib/some-other.cjs'],
  });

  const strongFilePeer = buildPeerBranch({
    branch: 'feature/v1.1-peer-strong-file',
    objective: '04-something-similar',
    github_issue: null,
    files_modified: [
      'plugins/devflow/devflow/bin/lib/dup-detect.cjs',
      'plugins/devflow/devflow/bin/lib/dup-detect.test.cjs',
    ],
  });

  const strongKeywordPeer = buildPeerBranch({
    branch: 'feature/v1.1-peer-strong-keyword',
    objective: 'duplicate work detection engine',
    github_issue: null,
    files_modified: [],
  });

  const weakPeer = buildPeerBranch({
    branch: 'feature/v1.1-peer-weak',
    objective: 'duplicate checker tool',
    github_issue: null,
    files_modified: [],
  });

  const noMatchPeer = buildPeerBranch({
    branch: 'feature/v1.1-peer-no-match',
    objective: 'unrelated database migration',
    github_issue: null,
    files_modified: ['plugins/devflow/devflow/bin/lib/unrelated.cjs'],
  });

  const orgHardMatch = buildOrgOverlapMatch({
    issue_ref: current_issue,
    title: 'Duplicate work detection + resolution',
    score: 0.9,
    chain_match: true,
    matched_keywords: ['duplicate', 'detection'],
  });

  const orgNoMatch = buildOrgOverlapMatch({
    issue_ref: 'AO-Cyber-Systems/devflow-claude#99',
    title: 'Some unrelated roadmap item',
    score: 0.1,
    chain_match: false,
    matched_keywords: [],
  });

  return {
    current: {
      issue: current_issue,
      files: current_files,
      keywords: ['duplicate', 'work', 'detection', 'engine', 'dup', 'detect'],
    },
    peers: { hardPeer, strongFilePeer, strongKeywordPeer, weakPeer, noMatchPeer },
    orgItems: { orgHardMatch, orgNoMatch },
    // Pre-built scan results for common test scenarios
    hardPeerScan: buildPeerScanResult({ branches: [hardPeer] }),
    strongFileScan: buildPeerScanResult({ branches: [strongFilePeer] }),
    strongKeywordScan: buildPeerScanResult({ branches: [strongKeywordPeer] }),
    weakScan: buildPeerScanResult({ branches: [weakPeer] }),
    noMatchScan: buildPeerScanResult({ branches: [noMatchPeer] }),
    emptyScan: buildPeerScanResult({ branches: [] }),
  };
}

// ─── TRD 05-01: Initiative file fixture builders ──────────────────────────────

/**
 * Build a complete initiative file content string (frontmatter + body sections).
 * Locked schema per CONTEXT.md decision #2.
 *
 * @param {object} opts
 * @param {string}   [opts.slug]              - lowercased-hyphenated slug
 * @param {string}   [opts.github_issue]      - issue ref (owner/repo#NN)
 * @param {string}   [opts.parent_project]    - org Project node id (or null)
 * @param {string[]} [opts.key_repos]         - array of github_repo strings
 * @param {string}   [opts.title]             - human title (rendered as # Heading)
 * @param {string}   [opts.why]               - Why section body (markdown)
 * @param {string[]} [opts.open_questions]    - bullet items (without leading "- ")
 * @param {Array<{ref,title,state}>} [opts.sub_issues] - sub-issue entries
 * @param {string}   [opts.status]            - GitHub state label (OPEN/CLOSED)
 * @param {string}   [opts.project_status]    - Project Status field (e.g., "In Progress")
 * @param {string}   [opts.quarter]           - Project Quarter field
 * @param {string}   [opts.updated_at]        - ISO-8601 timestamp
 * @returns {string} - full markdown file content
 */
function buildInitiativeFile({
  slug = 'test-initiative',
  github_issue = 'AO-Cyber-Systems/devflow#30',
  parent_project = 'AO-Cyber-Systems/PVT_kwDODwqLrc4BRsOP',
  key_repos = ['AO-Cyber-Systems/devflow', 'AO-Cyber-Systems/devflow-claude'],
  title = 'Test Initiative',
  why = 'This initiative exists to test the initiative reader.',
  open_questions = ['Question 1?', 'Question 2?'],
  sub_issues = [
    { ref: 'AO-Cyber-Systems/devflow-claude#9', title: 'DevFlow Coordination Layer', state: 'OPEN' },
  ],
  status = 'OPEN',
  project_status = 'In Progress',
  quarter = 'Q2 2026',
  updated_at = '2026-05-05T18:30:00Z',
} = {}) {
  const lines = [];
  lines.push('---');
  lines.push(`slug: ${slug}`);
  lines.push(`github_issue: ${github_issue}`);
  lines.push(`parent_project: ${parent_project}`);
  lines.push('key_repos:');
  for (const r of key_repos) lines.push(`  - ${r}`);
  lines.push(`updated_at: ${updated_at}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${title}`);
  lines.push('');
  lines.push('## Why');
  lines.push('');
  lines.push(why);
  lines.push('');
  lines.push('## Open Questions');
  lines.push('');
  for (const q of open_questions) lines.push(`- ${q}`);
  lines.push('');
  lines.push('## Linked Sub-issues');
  lines.push('');
  for (const si of sub_issues) lines.push(`- ${si.ref} — ${si.title} (${si.state})`);
  lines.push('');
  lines.push('## Status');
  lines.push('');
  lines.push(`- **GitHub:** ${status}`);
  lines.push(`- **Project status:** ${project_status}`);
  lines.push(`- **Quarter:** ${quarter}`);
  lines.push(`- **Updated:** ${updated_at}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Build just the frontmatter portion (for round-trip parse tests).
 * @param {object} opts - subset of buildInitiativeFile opts
 * @returns {string} - YAML frontmatter (with --- markers)
 */
function buildInitiativeYaml({
  slug = 'test-initiative',
  github_issue = 'AO-Cyber-Systems/devflow#30',
  parent_project = 'AO-Cyber-Systems/PVT_kwDODwqLrc4BRsOP',
  key_repos = ['AO-Cyber-Systems/devflow'],
  updated_at = '2026-05-05T18:30:00Z',
} = {}) {
  const lines = ['---'];
  lines.push(`slug: ${slug}`);
  lines.push(`github_issue: ${github_issue}`);
  lines.push(`parent_project: ${parent_project}`);
  lines.push('key_repos:');
  for (const r of key_repos) lines.push(`  - ${r}`);
  lines.push(`updated_at: ${updated_at}`);
  lines.push('---');
  return lines.join('\n');
}

/**
 * Write a fixture initiative-projection home dir with multiple <slug>.md files.
 * Mirror of buildSiblingRepoTree pattern but for initiative files.
 *
 * @param {object}   opts
 * @param {string}   opts.tmpdir   - REQUIRED — base dir to write files under
 * @param {Array<object>} [opts.files] - array of buildInitiativeFile opts (each one becomes one file)
 * @returns {{ home: string, slugs: string[] }}
 */
function buildInitiativesHomeTree({ tmpdir, files = [] } = {}) {
  if (!tmpdir) throw new Error('buildInitiativesHomeTree: tmpdir is required');
  if (!fs.existsSync(tmpdir)) fs.mkdirSync(tmpdir, { recursive: true });
  const slugs = [];
  for (const fileOpts of files) {
    const content = buildInitiativeFile(fileOpts);
    const slug = fileOpts.slug || 'test-initiative';
    fs.writeFileSync(path.join(tmpdir, `${slug}.md`), content, 'utf-8');
    slugs.push(slug);
  }
  return { home: tmpdir, slugs };
}

// ─── TRD 05-02: walkProject mock helper ──────────────────────────────────────

/**
 * Build a mock _runGh function that responds to:
 *   - auth status (returns success with locked scopes)
 *   - api graphql (returns walkProject-shaped JSON)
 *
 * @param {object} opts
 * @param {object[]} opts.walkProjectItems - array of buildOrgItem results to return
 * @param {boolean} opts.authOk - if false, mock auth status returns failure
 * @param {string} opts.authScopes - scopes string for success response
 * @returns {function} mock _runGh fn for _setRunGh injection
 */
function buildMockRunGhForInitiatives({
  walkProjectItems = [],
  authOk = true,
  authScopes = "'project', 'read:project', 'repo'",
} = {}) {
  return function mockRunGh(args) {
    if (args && args[0] === 'auth' && args[1] === 'status') {
      if (!authOk) {
        return { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' };
      }
      return {
        ok: true,
        status: 0,
        stdout: `github.com\n  ✓ Logged in to github.com\n  - Token scopes: ${authScopes}\n`,
        stderr: '',
      };
    }
    if (args && args[0] === 'api' && args[1] === 'graphql') {
      // Build walkProject-shaped GraphQL response
      const nodes = (walkProjectItems || []).map(item => {
        const isIssue = item.item_type !== 'draft';
        const fieldValues = { nodes: [] };
        if (item.product) fieldValues.nodes.push({ name: item.product, field: { name: 'Product' } });
        if (item.quarter) fieldValues.nodes.push({ name: item.quarter, field: { name: 'Quarter' } });
        if (item.status) fieldValues.nodes.push({ name: item.status, field: { name: 'Status' } });
        const content = isIssue ? {
          __typename: 'Issue',
          number: item.issue_ref ? parseInt(item.issue_ref.split('#')[1], 10) : 0,
          title: item.title,
          body: item.body || '',
          repository: { nameWithOwner: item.issue_ref ? item.issue_ref.split('#')[0] : null },
          trackedIssues: {
            totalCount: (item.sub_issues || []).length,
            nodes: (item.sub_issues || []).map(si => ({
              number: parseInt(si.ref.split('#')[1], 10),
              title: si.title,
              state: si.state,
              repository: { nameWithOwner: si.ref.split('#')[0] },
            })),
          },
        } : {
          __typename: 'DraftIssue',
          title: item.title,
          body: item.body || '',
        };
        return { content, fieldValues };
      });
      return {
        ok: true,
        status: 0,
        stdout: JSON.stringify({
          data: {
            node: {
              items: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes,
              },
            },
          },
        }),
        stderr: '',
      };
    }
    // TRD 05-03: handle 'issue view' calls for stale-detection
    if (args && args[0] === 'issue' && args[1] === 'view') {
      const ref = args[2] || '';
      const issueStates = opts.issueStates || {};
      const issueState = issueStates[ref] || 'OPEN';
      return {
        ok: true,
        status: 0,
        stdout: JSON.stringify({ state: issueState, closed: issueState === 'CLOSED' }),
        stderr: '',
      };
    }
    return { ok: false, status: 1, stdout: '', stderr: `unmocked gh call: ${(args || []).join(' ')}` };
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
  // TRD 03-02:
  buildEdenLibsTree,
  // TRD 03-03:
  buildOrgOverlapFixture,
  // TRD 04-01:
  buildPeerBranch,
  buildPeerScanResult,
  buildOrgOverlapMatch,
  buildDupDetectFixtures,
  // TRD 05-01:
  buildInitiativeFile,
  buildInitiativeYaml,
  buildInitiativesHomeTree,
  // TRD 05-02:
  buildMockRunGhForInitiatives,
};
