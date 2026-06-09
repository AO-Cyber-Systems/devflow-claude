'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { output, error, safeReadFile, generateSlugInternal, pathExistsInternal, MODEL_PROFILES } = require('./helpers.cjs');
const { loadConfig } = require('./config.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { getMilestoneInfo, getRoadmapObjectiveInternal } = require('./roadmap.cjs');
const { bootstrapProjectMd, bootstrapObjectiveMd, backfillAllObjectives } = require('./project-bootstrap.cjs');

// ─── Git plumbing (TRD 22-01) ─────────────────────────────────────────────────
//
// Pattern mirrors awareness.cjs lines 233-251: a thin spawnSync wrapper plus a
// `_setRunGit` test injection hook so unit tests can mock git without spawning
// processes. Use ONLY the `_runGit` shadow inside production code paths added
// by TRD 22-01; existing init.cjs code paths keep using `execSync` directly
// (back-compat preserved).

function runGit(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    ...opts,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout || '',
    stderr: (r.stderr || '').trim(),
  };
}

let _runGit = runGit;
function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGit; }
function _resetGitMock() { _runGit = runGit; }

// ─── --branch flag resolution (TRD 22-01) ─────────────────────────────────────

/**
 * Resolve --branch flag from argv slice into a branch spec.
 *
 * Modes:
 *   working_tree (default): read .planning/* via fs from cwd
 *   git_show:               read .planning/* via `git show <branch>:<path>`
 *
 * Aliases: 'current', 'HEAD' → working_tree mode (per G3 in 22-RESEARCH.md;
 * detached HEAD returns literal 'HEAD' from git rev-parse, so treat it as alias).
 *
 * Errors (calls helpers.cjs error() → process.exit(1)):
 *   --branch=<name> where <name> does not exist (rev-parse --verify fails)
 *
 * Accepts both `--branch foo` and `--branch=foo` forms.
 *
 * @param {string[]} args - argv slice
 * @param {string}   cwd  - working directory (passed to git for repo context)
 * @returns {{ mode: 'working_tree'|'git_show', branch: string|null }}
 */
function _resolveBranch(args, cwd) {
  let requested = null;

  // Form 1: --branch foo  (separate tokens)
  const idx = args.indexOf('--branch');
  if (idx !== -1 && idx + 1 < args.length) {
    const next = args[idx + 1];
    // Only accept as the value if it doesn't itself look like a flag
    if (typeof next === 'string' && !next.startsWith('--')) {
      requested = next;
    }
  }

  // Form 2: --branch=foo  (single token; takes precedence if present)
  for (const a of args) {
    if (typeof a === 'string' && a.startsWith('--branch=')) {
      requested = a.slice('--branch='.length);
      break;
    }
  }

  if (!requested || requested === 'current' || requested === 'HEAD') {
    return { mode: 'working_tree', branch: null };
  }

  const verifyR = _runGit(['rev-parse', '--verify', '--quiet', requested], { cwd });
  if (!verifyR.ok) {
    error(
      `--branch=${requested} does not exist. ` +
      `Hint: 'git branch --list ${requested}*' to find similar names, ` +
      `or omit --branch to read from current working tree.`
    );
  }

  return { mode: 'git_show', branch: requested };
}

/**
 * Read .planning/STATE.md respecting branch spec.
 *
 * working_tree mode: fs.readFileSync — returns null if STATE.md missing (caller decides).
 * git_show    mode: git show <branch>:.planning/STATE.md — errors if missing
 *                   (explicit cross-branch reads must fail loudly).
 *
 * Callers receive null when default working-tree read finds no STATE.md and may
 * render that as `state_content: null` in --include state output. Cross-branch
 * reads via --branch=<name> still hard-fail to prevent silent fallback.
 *
 * @param {string} cwd
 * @param {{ mode: string, branch: string|null }} branchSpec
 * @returns {string|null} STATE.md content, or null in working_tree mode when missing
 */
function _readStateBranch(cwd, branchSpec) {
  if (branchSpec.mode === 'working_tree') {
    const full = path.join(cwd, '.planning', 'STATE.md');
    if (!fs.existsSync(full)) {
      return null;
    }
    return fs.readFileSync(full, 'utf-8');
  }
  // git_show mode — keep this branch hard-erroring; cross-branch reads are explicit
  const showR = _runGit(['show', `${branchSpec.branch}:.planning/STATE.md`], { cwd });
  if (!showR.ok) {
    error(`.planning/STATE.md not found on branch ${branchSpec.branch}.`);
  }
  return showR.stdout;
}

/**
 * Build informational note when --branch=X but current HEAD = Y (X ≠ Y).
 *
 * Returns null when:
 *   - branchSpec.mode === 'working_tree' (no mismatch possible)
 *   - currentBranch is null or 'HEAD' (detached — no mismatch)
 *   - currentBranch === branchSpec.branch (same branch — no mismatch)
 *
 * Otherwise returns a single-line informational note. Not a warning; the
 * caller is reading state from another branch on purpose.
 *
 * @param {string|null} currentBranch
 * @param {{ mode: string, branch: string|null }} branchSpec
 * @returns {string|null}
 */
function _buildBranchMismatchNote(currentBranch, branchSpec) {
  if (!branchSpec || branchSpec.mode !== 'git_show') return null;
  if (!currentBranch || currentBranch === 'HEAD') return null;
  if (currentBranch === branchSpec.branch) return null;
  return `current branch is ${currentBranch}; reading state from ${branchSpec.branch} (--branch flag)`;
}

/**
 * Resolve current branch (best-effort). Returns null when not in a git repo
 * or when git is unavailable. In detached HEAD state, git rev-parse returns
 * literal 'HEAD' which we propagate so _buildBranchMismatchNote can short
 * circuit the mismatch check.
 *
 * @param {string} cwd
 * @returns {string|null}
 */
function _resolveCurrentBranch(cwd) {
  const r = _runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  return r.ok ? r.stdout.trim() : null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns true when lib/awareness.cjs can be required successfully.
 *
 * Guidance-only flag — callers (plan-objective, execute-objective skills) read
 * this field and decide whether to run `df-tools awareness show --refresh`.
 * init.cjs does NOT spawn the refresh itself (locked per TRD 02-06 must_haves).
 *
 * Returns false on any require error (e.g., awareness.cjs has a syntax error or
 * a transitive dependency is missing) to avoid breaking init for the caller.
 *
 * @returns {boolean}
 */
function _awarenessLoadable() {
  try {
    require('./awareness.cjs');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read .planning/.check-todos-cache.json (cache-only; never spawn fresh fetch).
 *
 * Returns:
 *   { line: '📋 N todos in Now lane (run /devflow:check-todos)', warning: null }
 *   when cache exists and the `now` lane has ≥1 entry.
 *   { line: null, warning: null } when cache absent or `now` empty/not-an-array.
 *   { line: null, warning: '<msg>' } on read/parse error.
 *
 * The cache `now` top-level array is written by the post-aggregate check-todos
 * pipeline. If the user has not yet run /devflow:check-todos the field will be
 * absent; the helper degrades gracefully to null (no preview line emitted).
 *
 * @param {string} cwd - working directory
 * @returns {{ line: string|null, warning: string|null }}
 */
function _buildCheckTodosPreview(cwd) {
  const cachePath = path.join(cwd, '.planning', '.check-todos-cache.json');
  if (!fs.existsSync(cachePath)) return { line: null, warning: null };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (e) {
    return { line: null, warning: `check-todos-cache parse error: ${e.message}` };
  }
  const nowEntries = Array.isArray(parsed.now) ? parsed.now : null;
  if (!nowEntries || nowEntries.length === 0) return { line: null, warning: null };
  return {
    line: `📋 ${nowEntries.length} todos in Now lane (run /devflow:check-todos)`,
    warning: null,
  };
}

/**
 * Read .planning/.awareness-cache.json (cache-only). Filters out the current branch.
 *
 * Returns:
 *   { line: '⚠ N other branches active (run df-tools awareness show)', warning: null }
 *   when cache exists and ≥1 peer branch (excluding current) is present.
 *   { line: null, warning: null } when cache absent, peer.branches missing, or all branches filtered.
 *   { line: null, warning: '<msg>' } on read/parse error.
 *
 * @param {string} cwd - working directory
 * @returns {{ line: string|null, warning: string|null }}
 */
function _buildAwarenessPreview(cwd) {
  const cachePath = path.join(cwd, '.planning', '.awareness-cache.json');
  if (!fs.existsSync(cachePath)) return { line: null, warning: null };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (e) {
    return { line: null, warning: `awareness-cache parse error: ${e.message}` };
  }
  const branches =
    parsed && parsed.peer && Array.isArray(parsed.peer.branches)
      ? parsed.peer.branches
      : null;
  if (!branches) return { line: null, warning: null };
  const currentBranch = (parsed.peer && parsed.peer.current_branch) || null;
  const otherBranches = branches.filter(b => {
    const name = typeof b === 'string' ? b : (b && b.branch);
    return name && name !== currentBranch;
  });
  if (otherBranches.length === 0) return { line: null, warning: null };
  return {
    line: `⚠ ${otherBranches.length} other branches active (run df-tools awareness show)`,
    warning: null,
  };
}

function resolveModelInternal(cwd, agentType) {
  const config = loadConfig(cwd);

  // Check per-agent override first (legacy key)
  const override = config.model_overrides?.[agentType];
  if (override) {
    return override === 'opus' ? 'inherit' : override;
  }

  // Merge package defaults with any per-project agent_models overrides
  const profile = config.model_profile || 'quality';
  const agentModels = Object.assign(
    {},
    MODEL_PROFILES[agentType] || {},
    config.agent_models?.[agentType] || {}
  );
  if (Object.keys(agentModels).length === 0) return 'sonnet';
  const resolved = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  return resolved === 'opus' ? 'inherit' : resolved;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = config.model_profile || 'quality';

  // Merge package defaults with any per-project agent_models overrides
  const agentModels = Object.assign(
    {},
    MODEL_PROFILES[agentType] || {},
    config.agent_models?.[agentType] || {}
  );
  if (Object.keys(agentModels).length === 0) {
    const result = { model: 'sonnet', profile, unknown_agent: true };
    output(result, raw, 'sonnet');
    return;
  }

  const resolved = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  const model = resolved === 'opus' ? 'inherit' : resolved;
  const result = { model, profile };
  output(result, raw, model);
}

function cmdInitExecuteObjective(cwd, objective, includes, raw, args = []) {
  if (!objective) {
    error('objective required for init execute-objective');
  }

  const branchSpec = _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  const objectiveInfo = findObjectiveInternal(cwd, objective);
  const milestone = getMilestoneInfo(cwd);

  const result = {
    // Models
    executor_model: resolveModelInternal(cwd, 'df-executor'),
    verifier_model: resolveModelInternal(cwd, 'df-verifier'),

    // Config flags
    commit_docs: config.commit_docs,
    parallelization: config.parallelization,
    branching_strategy: config.branching_strategy,
    objective_branch_template: config.objective_branch_template,
    milestone_branch_template: config.milestone_branch_template,
    verifier_enabled: config.verifier,

    // Objective info
    objective_found: !!objectiveInfo,
    objective_dir: objectiveInfo?.directory || null,
    objective_number: objectiveInfo?.objective_number || null,
    objective_name: objectiveInfo?.objective_name || null,
    objective_slug: objectiveInfo?.objective_slug || null,

    // Plan inventory
    jobs: objectiveInfo?.jobs || [],
    summaries: objectiveInfo?.summaries || [],
    incomplete_jobs: objectiveInfo?.incomplete_jobs || [],
    job_count: objectiveInfo?.jobs?.length || 0,
    incomplete_count: objectiveInfo?.incomplete_jobs?.length || 0,

    // Branch name (pre-computed)
    branch_name: config.branching_strategy === 'objective' && objectiveInfo
      ? config.objective_branch_template
          .replace('{objective}', objectiveInfo.objective_number)
          .replace('{slug}', objectiveInfo.objective_slug || 'objective')
      : config.branching_strategy === 'milestone'
        ? config.milestone_branch_template
            .replace('{milestone}', milestone.version)
            .replace('{slug}', generateSlugInternal(milestone.name) || 'milestone')
        : null,

    // Milestone info
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // File existence
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    config_exists: pathExistsInternal(cwd, '.planning/config.json'),
  };

  // Include file contents if requested via --include
  // TRD 22-01: STATE.md gets strict missing-state error via _readStateBranch
  // (vs. silent null fallback). config.json + ROADMAP.md keep safeReadFile
  // (legitimately-optional artifacts).
  if (includes.has('state')) {
    result.state_content = _readStateBranch(cwd, branchSpec);
  }
  if (includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
  }

  // Guidance flag for execute-objective skill: trigger df-tools awareness show --refresh
  // before spawning the executor agent. The skill is responsible for consuming this flag;
  // init.cjs only sets it. Falls back to false if awareness.cjs is unavailable/broken.
  result.awareness_refresh = _awarenessLoadable();

  // TRD 18-03: emit one-line previews from cached data (cache-only, no subprocess spawn)
  const ctPreviewExec = _buildCheckTodosPreview(cwd);
  const awPreviewExec = _buildAwarenessPreview(cwd);
  result.check_todos_preview = ctPreviewExec.line;
  result.awareness_preview = awPreviewExec.line;
  result.advisories_warnings = [];
  if (ctPreviewExec.warning) result.advisories_warnings.push(ctPreviewExec.warning);
  if (awPreviewExec.warning) result.advisories_warnings.push(awPreviewExec.warning);

  // TRD 22-01: surface branch resolution + mismatch note
  result.branch_spec = branchSpec;
  result.branch_mismatch_note = _buildBranchMismatchNote(_resolveCurrentBranch(cwd), branchSpec);

  // Self-healing bootstrap: ensure PROJECT.md has org + github_repo fields.
  // If anything was added, the result.bootstrap object communicates what changed
  // so the calling skill can surface it to the user (no auto-commit; user folds
  // the change into their next commit).
  result.bootstrap = bootstrapProjectMd(cwd);
  // Scoped bootstrap: only touch the target objective's dir, not every
  // objective under .planning/objectives/. Synthesize the legacy shape so
  // downstream consumers (skills/agents reading bootstrap_objectives) work
  // unchanged.
  const _bootstrapObjId = objectiveInfo?.directory
    ? path.basename(objectiveInfo.directory)
    : objective;
  const _bootstrapR = bootstrapObjectiveMd(cwd, _bootstrapObjId);
  result.bootstrap_objectives = {
    scanned: 1,
    applied: _bootstrapR.applied ? 1 : 0,
    skipped: _bootstrapR.applied ? 0 : 1,
    errors: [],
  };

  output(result, raw);
}

function cmdInitPlanObjective(cwd, objective, includes, raw, args = []) {
  if (!objective) {
    error('objective required for init plan-objective');
  }

  const branchSpec = _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  const objectiveInfo = findObjectiveInternal(cwd, objective);

  const result = {
    // Models
    researcher_model: resolveModelInternal(cwd, 'df-objective-researcher'),
    planner_model: resolveModelInternal(cwd, 'df-planner'),
    checker_model: resolveModelInternal(cwd, 'df-job-checker'),

    // Workflow flags
    research_enabled: config.research,
    job_checker_enabled: config.job_checker,
    commit_docs: config.commit_docs,

    // Objective info
    objective_found: !!objectiveInfo,
    objective_dir: objectiveInfo?.directory || null,
    objective_number: objectiveInfo?.objective_number || null,
    objective_name: objectiveInfo?.objective_name || null,
    objective_slug: objectiveInfo?.objective_slug || null,
    padded_objective: objectiveInfo?.objective_number?.padStart(2, '0') || null,

    // Existing artifacts
    has_research: objectiveInfo?.has_research || false,
    has_context: objectiveInfo?.has_context || false,
    has_jobs: (objectiveInfo?.jobs?.length || 0) > 0,
    job_count: objectiveInfo?.jobs?.length || 0,

    // Environment
    planning_exists: pathExistsInternal(cwd, '.planning'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
  };

  // Include file contents if requested via --include
  // TRD 22-01: STATE.md gets strict missing-state error via _readStateBranch.
  if (includes.has('state')) {
    result.state_content = _readStateBranch(cwd, branchSpec);
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('requirements')) {
    result.requirements_content = safeReadFile(path.join(cwd, '.planning', 'REQUIREMENTS.md'));
  }
  if (includes.has('context') && objectiveInfo?.directory) {
    // Find *-CONTEXT.md in objective directory
    const objectiveDirFull = path.join(cwd, objectiveInfo.directory);
    try {
      const files = fs.readdirSync(objectiveDirFull);
      const contextFile = files.find(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) {
        result.context_content = safeReadFile(path.join(objectiveDirFull, contextFile));
      }
    } catch {}
  }
  if (includes.has('research') && objectiveInfo?.directory) {
    // Find *-RESEARCH.md in objective directory
    const objectiveDirFull = path.join(cwd, objectiveInfo.directory);
    try {
      const files = fs.readdirSync(objectiveDirFull);
      const researchFile = files.find(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
      if (researchFile) {
        result.research_content = safeReadFile(path.join(objectiveDirFull, researchFile));
      }
    } catch {}
  }
  if (includes.has('verification') && objectiveInfo?.directory) {
    // Find *-VERIFICATION.md in objective directory
    const objectiveDirFull = path.join(cwd, objectiveInfo.directory);
    try {
      const files = fs.readdirSync(objectiveDirFull);
      const verificationFile = files.find(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');
      if (verificationFile) {
        result.verification_content = safeReadFile(path.join(objectiveDirFull, verificationFile));
      }
    } catch {}
  }
  if (includes.has('uat') && objectiveInfo?.directory) {
    // Find *-UAT.md in objective directory
    const objectiveDirFull = path.join(cwd, objectiveInfo.directory);
    try {
      const files = fs.readdirSync(objectiveDirFull);
      const uatFile = files.find(f => f.endsWith('-UAT.md') || f === 'UAT.md');
      if (uatFile) {
        result.uat_content = safeReadFile(path.join(objectiveDirFull, uatFile));
      }
    } catch {}
  }

  // Guidance flag for plan-objective skill: trigger df-tools awareness show --refresh
  // before spawning the planner agent. The skill is responsible for consuming this flag;
  // init.cjs only sets it. Falls back to false if awareness.cjs is unavailable/broken.
  result.awareness_refresh = _awarenessLoadable();

  // TRD 18-03: emit one-line previews from cached data (cache-only, no subprocess spawn)
  const ctPreviewPlan = _buildCheckTodosPreview(cwd);
  const awPreviewPlan = _buildAwarenessPreview(cwd);
  result.check_todos_preview = ctPreviewPlan.line;
  result.awareness_preview = awPreviewPlan.line;
  result.advisories_warnings = [];
  if (ctPreviewPlan.warning) result.advisories_warnings.push(ctPreviewPlan.warning);
  if (awPreviewPlan.warning) result.advisories_warnings.push(awPreviewPlan.warning);

  // TRD 22-01: surface branch resolution + mismatch note
  result.branch_spec = branchSpec;
  result.branch_mismatch_note = _buildBranchMismatchNote(_resolveCurrentBranch(cwd), branchSpec);

  // Self-healing bootstrap: ensure PROJECT.md has org + github_repo fields.
  // See cmdInitExecuteObjective for the same pattern.
  result.bootstrap = bootstrapProjectMd(cwd);
  // Scoped bootstrap: only touch the target objective's dir, not every
  // objective under .planning/objectives/. Synthesize the legacy shape so
  // downstream consumers (skills/agents reading bootstrap_objectives) work
  // unchanged.
  const _bootstrapObjId = objectiveInfo?.directory
    ? path.basename(objectiveInfo.directory)
    : objective;
  const _bootstrapR = bootstrapObjectiveMd(cwd, _bootstrapObjId);
  result.bootstrap_objectives = {
    scanned: 1,
    applied: _bootstrapR.applied ? 1 : 0,
    skipped: _bootstrapR.applied ? 0 : 1,
    errors: [],
  };

  output(result, raw);
}

function cmdInitNewProject(cwd, raw, args = []) {
  // TRD 22-01: resolve --branch (no-op for new-project — no state to read yet,
  // but flag must parse cleanly so the missing-branch error fires consistently).
  const branchSpec = _resolveBranch(args, cwd);
  const config = loadConfig(cwd);

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.devflow', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Detect existing code
  let hasCode = false;
  let hasPackageFile = false;
  try {
    const files = execSync('find . -maxdepth 3 \\( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.swift" -o -name "*.java" \\) 2>/dev/null | grep -v node_modules | grep -v .git | head -5', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    hasCode = files.trim().length > 0;
  } catch {}

  hasPackageFile = pathExistsInternal(cwd, 'package.json') ||
                   pathExistsInternal(cwd, 'requirements.txt') ||
                   pathExistsInternal(cwd, 'Cargo.toml') ||
                   pathExistsInternal(cwd, 'go.mod') ||
                   pathExistsInternal(cwd, 'Package.swift');

  const result = {
    // Models
    researcher_model: resolveModelInternal(cwd, 'df-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'df-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'df-roadmapper'),

    // Config
    commit_docs: config.commit_docs,

    // Existing state
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    has_codebase_map: pathExistsInternal(cwd, '.planning/codebase'),
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Brownfield detection
    has_existing_code: hasCode,
    has_package_file: hasPackageFile,
    is_brownfield: hasCode || hasPackageFile,
    needs_codebase_map: (hasCode || hasPackageFile) && !pathExistsInternal(cwd, '.planning/codebase'),

    // Git state
    has_git: pathExistsInternal(cwd, '.git'),

    // Enhanced search
    brave_search_available: hasBraveSearch,
  };

  output(result, raw);
}

function cmdInitNewMilestone(cwd, raw, args = []) {
  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  const result = {
    // Models
    researcher_model: resolveModelInternal(cwd, 'df-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'df-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'df-roadmapper'),

    // Config
    commit_docs: config.commit_docs,
    research_enabled: config.research,

    // Current milestone
    current_milestone: milestone.version,
    current_milestone_name: milestone.name,

    // File existence
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
  };

  output(result, raw);
}

function cmdInitQuick(cwd, description, raw, args = []) {
  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  const now = new Date();
  const slug = description ? generateSlugInternal(description)?.substring(0, 40) : null;

  // Find next quick task number
  const quickDir = path.join(cwd, '.planning', 'quick');
  let nextNum = 1;
  try {
    const existing = fs.readdirSync(quickDir)
      .filter(f => /^\d+-/.test(f))
      .map(f => parseInt(f.split('-')[0], 10))
      .filter(n => !isNaN(n));
    if (existing.length > 0) {
      nextNum = Math.max(...existing) + 1;
    }
  } catch {}

  const result = {
    // Models
    planner_model: resolveModelInternal(cwd, 'df-planner'),
    executor_model: resolveModelInternal(cwd, 'df-executor'),
    checker_model: resolveModelInternal(cwd, 'df-job-checker'),
    verifier_model: resolveModelInternal(cwd, 'df-verifier'),

    // Config
    commit_docs: config.commit_docs,

    // Quick task info
    next_num: nextNum,
    slug: slug,
    description: description || null,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Paths
    quick_dir: '.planning/quick',
    task_dir: slug ? `.planning/quick/${nextNum}-${slug}` : null,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),
  };

  output(result, raw);
}

function cmdInitResume(cwd, raw, args = []) {
  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);

  // Check for interrupted agent
  let interruptedAgentId = null;
  try {
    interruptedAgentId = fs.readFileSync(path.join(cwd, '.planning', 'current-agent-id.txt'), 'utf-8').trim();
  } catch {}

  const result = {
    // File existence
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Agent state
    has_interrupted_agent: !!interruptedAgentId,
    interrupted_agent_id: interruptedAgentId,

    // Config
    commit_docs: config.commit_docs,
  };

  output(result, raw);
}

function cmdInitVerifyWork(cwd, objective, raw, args = []) {
  if (!objective) {
    error('objective required for init verify-work');
  }

  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  const objectiveInfo = findObjectiveInternal(cwd, objective);

  const result = {
    // Models
    planner_model: resolveModelInternal(cwd, 'df-planner'),
    checker_model: resolveModelInternal(cwd, 'df-job-checker'),

    // Config
    commit_docs: config.commit_docs,

    // Objective info
    objective_found: !!objectiveInfo,
    objective_dir: objectiveInfo?.directory || null,
    objective_number: objectiveInfo?.objective_number || null,
    objective_name: objectiveInfo?.objective_name || null,

    // Existing artifacts
    has_verification: objectiveInfo?.has_verification || false,
  };

  output(result, raw);
}

function cmdInitObjectiveOp(cwd, objective, raw, args = []) {
  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  let objectiveInfo = findObjectiveInternal(cwd, objective);

  // Fallback to ROADMAP.md if no directory exists (e.g., **Jobs:** TBD)
  if (!objectiveInfo) {
    const roadmapObjective = getRoadmapObjectiveInternal(cwd, objective);
    if (roadmapObjective?.found) {
      const objectiveName = roadmapObjective.objective_name;
      objectiveInfo = {
        found: true,
        directory: null,
        objective_number: roadmapObjective.objective_number,
        objective_name: objectiveName,
        objective_slug: objectiveName ? objectiveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
        jobs: [],
        summaries: [],
        incomplete_jobs: [],
        has_research: false,
        has_context: false,
        has_verification: false,
      };
    }
  }

  const result = {
    // Config
    commit_docs: config.commit_docs,
    brave_search: config.brave_search,

    // Objective info
    objective_found: !!objectiveInfo,
    objective_dir: objectiveInfo?.directory || null,
    objective_number: objectiveInfo?.objective_number || null,
    objective_name: objectiveInfo?.objective_name || null,
    objective_slug: objectiveInfo?.objective_slug || null,
    padded_objective: objectiveInfo?.objective_number?.padStart(2, '0') || null,

    // Existing artifacts
    has_research: objectiveInfo?.has_research || false,
    has_context: objectiveInfo?.has_context || false,
    has_jobs: (objectiveInfo?.jobs?.length || 0) > 0,
    has_verification: objectiveInfo?.has_verification || false,
    job_count: objectiveInfo?.jobs?.length || 0,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),
  };

  output(result, raw);
}

function cmdInitTodos(cwd, area, raw, args = []) {
  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  const now = new Date();

  // List todos (reuse existing logic)
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);
        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.join('.planning', 'todos', 'pending', file),
        });
      } catch {}
    }
  } catch {}

  const result = {
    // Config
    commit_docs: config.commit_docs,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Todo inventory
    todo_count: count,
    todos,
    area_filter: area || null,

    // Paths
    pending_dir: '.planning/todos/pending',
    completed_dir: '.planning/todos/completed',

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    todos_dir_exists: pathExistsInternal(cwd, '.planning/todos'),
    pending_dir_exists: pathExistsInternal(cwd, '.planning/todos/pending'),
  };

  output(result, raw);
}

function cmdInitMilestoneOp(cwd, raw, args = []) {
  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Count objectives
  let objectiveCount = 0;
  let completedPhases = 0;
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    objectiveCount = dirs.length;

    // Count objectives with summaries (completed)
    for (const dir of dirs) {
      try {
        const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
        const hasSummary = objectiveFiles.some(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        if (hasSummary) completedPhases++;
      } catch {}
    }
  } catch {}

  // Check archive
  const archiveDir = path.join(cwd, '.planning', 'archive');
  let archivedMilestones = [];
  try {
    archivedMilestones = fs.readdirSync(archiveDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {}

  const result = {
    // Config
    commit_docs: config.commit_docs,

    // Current milestone
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // Objective counts
    objective_count: objectiveCount,
    completed_objectives: completedPhases,
    all_objectives_complete: objectiveCount > 0 && objectiveCount === completedPhases,

    // Archive
    archived_milestones: archivedMilestones,
    archive_count: archivedMilestones.length,

    // File existence
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    archive_exists: pathExistsInternal(cwd, '.planning/archive'),
    objectives_dir_exists: pathExistsInternal(cwd, '.planning/objectives'),
  };

  output(result, raw);
}

function cmdInitMapCodebase(cwd, raw, args = []) {
  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);

  // Check for existing codebase maps
  const codebaseDir = path.join(cwd, '.planning', 'codebase');
  let existingMaps = [];
  try {
    existingMaps = fs.readdirSync(codebaseDir).filter(f => f.endsWith('.md'));
  } catch {}

  const result = {
    // Models
    mapper_model: resolveModelInternal(cwd, 'df-codebase-mapper'),

    // Config
    commit_docs: config.commit_docs,
    search_gitignored: config.search_gitignored,
    parallelization: config.parallelization,

    // Paths
    codebase_dir: '.planning/codebase',

    // Existing maps
    existing_maps: existingMaps,
    has_maps: existingMaps.length > 0,

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    codebase_dir_exists: pathExistsInternal(cwd, '.planning/codebase'),
  };

  output(result, raw);
}

function cmdInitSecurityAudit(cwd, raw, args = []) {
  // TRD 22-01: resolve --branch (validates flag; not currently consumed in body)
  _resolveBranch(args, cwd);
  const config = loadConfig(cwd);

  // Resolve auditor model
  const auditorModel = resolveModelInternal(cwd, 'df-security-auditor');

  // Check for existing audit report
  const planningExists = pathExistsInternal(cwd, '.planning');
  const outputDir = planningExists ? '.planning' : '.';
  const reportPath = path.join(outputDir, 'SECURITY-AUDIT.md');
  const existingReport = pathExistsInternal(cwd, reportPath);

  // Check for stale temp dir
  const tmpDir = '.security-audit-tmp';
  const staleTmpExists = pathExistsInternal(cwd, tmpDir);

  // Detect stack from common manifest files
  const stack = [];
  if (pathExistsInternal(cwd, 'package.json')) stack.push('javascript');
  if (pathExistsInternal(cwd, 'tsconfig.json')) stack.push('typescript');
  if (pathExistsInternal(cwd, 'requirements.txt') || pathExistsInternal(cwd, 'pyproject.toml') || pathExistsInternal(cwd, 'Pipfile')) stack.push('python');
  if (pathExistsInternal(cwd, 'go.mod')) stack.push('go');
  if (pathExistsInternal(cwd, 'Cargo.toml')) stack.push('rust');
  if (pathExistsInternal(cwd, 'pom.xml') || pathExistsInternal(cwd, 'build.gradle')) stack.push('java');
  if (pathExistsInternal(cwd, 'Gemfile')) stack.push('ruby');

  const result = {
    auditor_model: auditorModel,
    parallelization: config.parallelization,
    output_dir: outputDir,
    report_path: reportPath,
    existing_report: existingReport,
    stale_tmp_exists: staleTmpExists,
    tmp_dir: tmpDir,
    stack: stack,
    planning_exists: planningExists,
  };

  output(result, raw);
}

function cmdInitProgress(cwd, includes, raw, args = []) {
  const branchSpec = _resolveBranch(args, cwd);
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);
  const { findPlanFiles } = require('./helpers.cjs');

  // Analyze objectives
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const objectives = [];
  let currentObjective = null;
  let nextObjective = null;

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      const match = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const objectiveNumber = match ? match[1] : dir;
      const objectiveName = match && match[2] ? match[2] : null;

      const objectivePath = path.join(objectivesDir, dir);
      const objectiveFiles = fs.readdirSync(objectivePath);

      const plans = findPlanFiles(objectiveFiles);
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const hasResearch = objectiveFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

      const status = summaries.length >= plans.length && plans.length > 0 ? 'complete' :
                     plans.length > 0 ? 'in_progress' :
                     hasResearch ? 'researched' : 'pending';

      const objectiveInfo = {
        number: objectiveNumber,
        name: objectiveName,
        directory: path.join('.planning', 'objectives', dir),
        status,
        job_count: plans.length,
        summary_count: summaries.length,
        has_research: hasResearch,
      };

      objectives.push(objectiveInfo);

      // Find current (first incomplete with plans) and next (first pending)
      if (!currentObjective && (status === 'in_progress' || status === 'researched')) {
        currentObjective = objectiveInfo;
      }
      if (!nextObjective && status === 'pending') {
        nextObjective = objectiveInfo;
      }
    }
  } catch {}

  // Check for paused work
  let pausedAt = null;
  try {
    const state = fs.readFileSync(path.join(cwd, '.planning', 'STATE.md'), 'utf-8');
    const pauseMatch = state.match(/\*\*Paused At:\*\*\s*(.+)/);
    if (pauseMatch) pausedAt = pauseMatch[1].trim();
  } catch {}

  const result = {
    // Models
    executor_model: resolveModelInternal(cwd, 'df-executor'),
    planner_model: resolveModelInternal(cwd, 'df-planner'),

    // Config
    commit_docs: config.commit_docs,

    // Milestone
    milestone_version: milestone.version,
    milestone_name: milestone.name,

    // Objective overview
    objectives,
    objective_count: objectives.length,
    completed_count: objectives.filter(p => p.status === 'complete').length,
    in_progress_count: objectives.filter(p => p.status === 'in_progress').length,

    // Current state
    current_objective: currentObjective,
    next_objective: nextObjective,
    paused_at: pausedAt,
    has_work_in_progress: !!currentObjective,

    // File existence
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
  };

  // Include file contents if requested via --include
  // TRD 22-01: STATE.md gets strict missing-state error via _readStateBranch.
  if (includes.has('state')) {
    result.state_content = _readStateBranch(cwd, branchSpec);
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('project')) {
    result.project_content = safeReadFile(path.join(cwd, '.planning', 'PROJECT.md'));
  }
  if (includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }

  output(result, raw);
}

module.exports = {
  resolveModelInternal,
  cmdResolveModel,
  cmdInitExecuteObjective,
  cmdInitPlanObjective,
  cmdInitNewProject,
  cmdInitNewMilestone,
  cmdInitQuick,
  cmdInitResume,
  cmdInitVerifyWork,
  cmdInitObjectiveOp,
  cmdInitTodos,
  cmdInitMilestoneOp,
  cmdInitMapCodebase,
  cmdInitSecurityAudit,
  cmdInitProgress,
  // TRD 18-03: exported for unit testing (underscore-prefix = test-only, not public API)
  _buildCheckTodosPreview,
  _buildAwarenessPreview,
  // TRD 22-01: --branch flag plumbing + branch-aware state readers
  _resolveBranch,
  _readStateBranch,
  _buildBranchMismatchNote,
  _resolveCurrentBranch,
  _setRunGit,
  _resetGitMock,
};
