---
objective: 22-workflow-impediment-fixes
trd: 01
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/init.cjs
  - plugins/devflow/devflow/bin/lib/init.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - INIT-BRANCH-FLAG
  - INIT-NO-IMPLICIT-WALK
  - INIT-MISSING-STATE-ERROR
user_setup: []

must_haves:
  truths:
    - "df-tools init plan-objective --branch=feature/foo reads .planning/* from feature/foo via git show"
    - "df-tools init plan-objective (no --branch) reads .planning/* from working tree only"
    - "df-tools init plan-objective with missing .planning/STATE.md errors with actionable hint mentioning --branch flag"
    - "df-tools init plan-objective --branch=does-not-exist errors with branch-not-found message before reading any state"
    - "df-tools init plan-objective --branch=current and --branch=HEAD are aliases for default working-tree mode"
    - "When --branch=X passed and current HEAD ≠ X, JSON output includes a one-line informational note (not error)"
    - "All eight init.cjs commands (cmdInitPlanObjective, cmdInitExecuteObjective, cmdInitNewProject, cmdInitNewMilestone, cmdInitVerifyWork, cmdInitObjectiveOp, cmdInitMilestoneOp, cmdInitProgress) accept --branch via shared _resolveBranch helper"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/init.cjs"
      provides: "_resolveBranch helper + branch-aware state readers + --branch flag plumbing across all init commands"
      contains: "function _resolveBranch"
    - path: "plugins/devflow/devflow/bin/lib/init.test.cjs"
      provides: "TDD test list for branch resolution + missing-state error + alias handling + cross-command coverage"
      contains: "_resolveBranch"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/init.cjs"
      to: "_runGit (git rev-parse --verify --quiet, git show <branch>:<path>)"
      via: "branch existence check + state read via git plumbing"
      pattern: "rev-parse.*--verify|git.*show"
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "init.cjs commands"
      via: "args slice passed through; --branch parsed inside each cmd"
      pattern: "args\\.indexOf\\('--branch'\\)|_resolveBranch"
---

<objective>
Add explicit `--branch=<name>` flag to all `df-tools init *` commands. Default behavior reads `.planning/*` from the working tree (current checked-out branch). With `--branch=<name>`, reads from `git show <name>:.planning/...`. No silent history walking — if state is missing on the resolved branch, error with an actionable hint.

Purpose: Eliminate misleading-state surprises during planning sessions (root cause traced to v1.1: an init invocation reported a misfiled-objective ROADMAP that didn't exist on the working branch). Make state resolution explicit and auditable.

Output: `lib/init.cjs` extended with shared `_resolveBranch` helper; all 15 init commands honor `--branch`; missing state on the resolved branch errors with a clear message.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── lib/
│   ├── init.cjs              ← MODIFY (add _resolveBranch + branch-aware readers + flag plumbing)
│   └── init.test.cjs         ← MODIFY (add Group 22A tests)
└── df-tools.cjs              ← MODIFY (pass --branch through args slice — likely already pass-through but verify)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
## Existing `_runGit` injection pattern (awareness.cjs lines 220-251)

```js
const { spawnSync } = require('child_process');

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
```

This TRD adds the same pattern to `init.cjs` (currently has no git plumbing).

## Existing init test pattern (init.test.cjs lines 28-57)

```js
function buildProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-test-'));
  fs.mkdirSync(path.join(dir, '.planning', 'objectives', '01-test'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), '{}');
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), '## Objective 1: Test\n');
  fs.writeFileSync(
    path.join(dir, '.planning', 'objectives', '01-test', 'OBJECTIVE.md'),
    '---\nwork: feature\n---\n# Test Objective\n'
  );
  return { cwd: dir, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } };
}

function runInit(subcommand, cwd) {
  const stdout = execSync(`node "${DF_TOOLS}" ${subcommand}`, {
    cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout.trim());
}
```

## Existing argv parsing pattern (init.cjs lines 247-260)

```js
function cmdInitPlanObjective(cwd, objective, includes, raw) {
  if (!objective) {
    error('objective required for init plan-objective');
  }
  const config = loadConfig(cwd);
  const objectiveInfo = findObjectiveInternal(cwd, objective);
  // ...
}
```

The `args` (raw argv slice) reaches df-tools.cjs's `case 'init':` arm, which extracts the subcommand and passes it through. `--branch` parsing must live INSIDE each cmdInitX (consistent with `--include` parsing already present).
</codebase_examples>

<anti_patterns>
- DO NOT introduce a separate `init plan-objective-from-branch` subcommand — keep the flag on the existing commands.
- DO NOT scan `git branch --list <pattern>` to "best-guess" the branch — fail fast with explicit message.
- DO NOT auto-detect "looks like a git repo" — `--branch` flag is opt-in; if user passes it on a non-git directory, error with the git failure verbatim.
- DO NOT remove or shadow the existing `_buildCheckTodosPreview` / `_buildAwarenessPreview` helpers — they're cache-only and orthogonal to this TRD.
- DO NOT walk `.git` directly — always use `_runGit` so injection works.
</anti_patterns>

<error_recovery>
### Recovery: tests fail because `_runGit` mock not reset between tests

Add `t.afterEach(() => _resetGitMock())` at the test group level. Mirror the awareness.test.cjs pattern.

### Recovery: subprocess test stdout includes warning lines that break JSON.parse

`output()` writes JSON.stringify(result) followed by newline; warnings go to STDERR. `runInit()` already separates stderr via `stdio: ['pipe', 'pipe', 'pipe']` — the captured stdout is JSON-clean. If a test fails with parse error, inspect stderr first.

### Recovery: `git rev-parse --verify --quiet` returns false positives in fixture repos

Use a real (or mocked) git repo with the exact branch name. `_runGit(['rev-parse', '--verify', '--quiet', 'feature/foo'])` requires the ref to exist as either a local branch, remote-tracking ref, or tag. For tests that mock _runGit, return `{ ok: true, stdout: '<sha>' }` to simulate existence and `{ ok: false, status: 128 }` to simulate missing.

### Recovery: detached HEAD state breaks default-mode tests

`git rev-parse --abbrev-ref HEAD` returns literal `'HEAD'` in detached state. Tests that exercise default mode in a detached fixture should either (a) checkout a branch first, or (b) accept that `--branch=HEAD` is the explicit alias. Document in test comments.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/22-workflow-impediment-fixes/22-CONTEXT.md
@.planning/objectives/22-workflow-impediment-fixes/22-RESEARCH.md
</context>

<research_context>
- Established pattern: `_setRunGit` injection hook (awareness.cjs lines 248-251) — REUSE EXACTLY in init.cjs.
- Established pattern: `runInit()` subprocess test helper (init.test.cjs lines 50-57) — REUSE EXACTLY for end-to-end tests.
- Init.cjs's helpers (`findObjectiveInternal`, `getMilestoneInfo`, `getRoadmapObjectiveInternal`) currently use `fs.readFileSync` directly — these MUST be wrapped or paralleled with `--branch`-aware variants. NEW HELPERS: `_readStateBranch(cwd, branchSpec)`, `_readRoadmapBranch(cwd, branchSpec)`, `_readObjectiveDirBranch(cwd, branchSpec, objectiveSlug)`. The branch-aware variants delegate to the existing helpers when `branchSpec.mode === 'working_tree'`, OR call `_runGit(['show', ...])` when `mode === 'git_show'`.
- For non-state file-existence checks (`pathExistsInternal`), introduce a `_pathExistsBranch(cwd, branchSpec, relPath)` that uses `git ls-tree --name-only <branch> <path>` for git_show mode.
</research_context>

<gotchas>
- **G2 (research):** `git show` exit code is 128 for both "branch missing" and "file missing on branch". Use `git rev-parse --verify --quiet <branch>` BEFORE first `git show` to distinguish. Lock the branch-existence check in `_resolveBranch` so it runs ONCE at flag resolution time, not per-file.
- **G3 (research):** detached HEAD returns literal `HEAD`. `_resolveBranch` treats `--branch=HEAD` as alias for current/working_tree mode (NOT a literal git ref).
- **G1 (research):** `output()` exits the process. In-process tests of `cmdInitPlanObjective` won't work — use `runInit()` subprocess pattern. Test internals (`_resolveBranch`, `_readStateBranch`) directly via `require('./init.cjs')` exports.
- **--branch=<name>** with state file present BUT corrupt YAML: error path must distinguish "missing" vs "malformed". Reuse existing extractFrontmatter behavior (returns parsed object or empty for malformed; matches working-tree behavior).
- **Mismatch note:** when `--branch=X` and current HEAD = Y (X ≠ Y, both valid), output JSON includes `result.branch_mismatch_note: "current branch is Y; reading state from X (--branch flag)"`. Informational only, not a warning.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing test list for --branch flag and missing-state error</name>
  <files>plugins/devflow/devflow/bin/lib/init.test.cjs</files>
  <action>
Add new test group `Group 22A` to `init.test.cjs`. Test list (write BEFORE implementation per TDD playbook habit 2):

22A1 — `_resolveBranch([])` returns `{ mode: 'working_tree', branch: null }` (default mode)
22A2 — `_resolveBranch(['--branch', 'current'])` returns `{ mode: 'working_tree', branch: null }` (current alias)
22A3 — `_resolveBranch(['--branch', 'HEAD'])` returns `{ mode: 'working_tree', branch: null }` (HEAD alias — see G3)
22A4 — `_resolveBranch(['--branch', 'feature/foo'])` with mocked `_runGit` returning `{ ok: true }` for `rev-parse --verify` returns `{ mode: 'git_show', branch: 'feature/foo' }`
22A5 — `_resolveBranch(['--branch', 'does-not-exist'])` with mocked `_runGit` returning `{ ok: false }` for rev-parse calls `error(...)` (exit 1) with message containing "does not exist" AND mentioning `git branch --list` hint
22A6 — `_readStateBranch(cwd, { mode: 'working_tree' })` reads STATE.md from cwd via fs (back-compat behavior preserved)
22A7 — `_readStateBranch(cwd, { mode: 'working_tree' })` with missing STATE.md calls `error(...)` with message containing "STATE.md not found" AND mentioning `--branch` flag (NEW: prior behavior silently returned null/empty)
22A8 — `_readStateBranch(cwd, { mode: 'git_show', branch: 'feature/foo' })` with mocked `_runGit` returning STATE.md content returns that content
22A9 — `_readStateBranch(cwd, { mode: 'git_show', branch: 'feature/foo' })` with mocked `_runGit` returning `{ ok: false }` calls `error(...)` with message containing "STATE.md not found on branch feature/foo"
22A10 — `runInit('init plan-objective 01-test', cwd)` (working_tree mode) returns JSON with `objective_found: true` (subprocess end-to-end on real fixture)
22A11 — `runInit('init plan-objective 01-test --branch=current', cwd)` returns identical JSON to 22A10 (alias parity)
22A12 — `runInit('init plan-objective 01-test', cwd-without-STATE.md)` exits non-zero with stderr containing "STATE.md not found"
22A13 — `runInit('init plan-objective 01-test --branch=feature/x', git_fixture_repo)` (GIT_INTEGRATION=1 gated) returns JSON with branch-aware state from feature/x
22A14 — `runInit('init plan-objective 01-test --branch=does-not-exist', cwd)` exits non-zero with stderr containing "does not exist"
22A15 — `runInit('init execute-objective 01-test --branch=current', cwd)` works (same flag plumbing across init commands — sanity check 1 of 4)
22A16 — `runInit('init verify-work 01-test --branch=current', cwd)` works (sanity 2 of 4)
22A17 — `runInit('init objective-op 01-test --branch=current', cwd)` works (sanity 3 of 4)
22A18 — `runInit('init progress --branch=current', cwd)` works (sanity 4 of 4 — non-objective-scoped)
22A19 — `runInit('init plan-objective 01-test --branch=feature/x', cwd)` with current HEAD=master (X ≠ HEAD, mock-friendly): output JSON includes `branch_mismatch_note` containing "current branch" (regression prevent: ensure note IS surfaced when branches differ; alias mode does NOT emit note)

Implementation tips for tests:
- Use `_setRunGit` injection hook to mock git for unit tests (22A1-22A9). `t.afterEach(() => _resetGitMock())` for cleanup.
- Use existing `buildProject()` helper for subprocess tests (22A10-22A19).
- For 22A12: extend `buildProject()` with optional `{ omitState: true }` flag, OR delete STATE.md after `buildProject()` returns.
- For 22A13: gated by `process.env.GIT_INTEGRATION === '1'`. Use `buildGitFixtureRepo({...})` from 22-RESEARCH.md error_recovery section. Skip with `t.skip()` when env unset.
- For 22A19: subprocess test on real (non-git) fixture — won't actually run git show, but the `--branch=feature/x` parse path triggers `_resolveBranch` which would call `_runGit`. To make this in-process / hermetic: this case should be a UNIT test of an internal function (e.g., `_buildBranchMismatchNote(currentBranch, requestedBranch)`) rather than subprocess. Adjust accordingly.

# CRITICAL: Test list documented BEFORE writing test code (TDD playbook habit 2). Commit message MUST be `test(22-01): add failing tests for --branch flag and missing-state error (Group 22A)`.
# GOTCHA: 22A12 will fail today because current behavior silently returns objective_found:false instead of erroring. This is the RED state we want.
# PATTERN: `t.test('22A1 — description', () => { ... })` mirrors existing 18I-group pattern in init.test.cjs.
  </action>
  <verify>
`npm test -- --test-name-pattern='22A'` shows 19 tests, ALL fail (or 18 fail + 1 skip if GIT_INTEGRATION unset for 22A13). Failures must be expected ("function not defined" or "expected error not thrown") — NOT syntax errors. Confirm with: `cd /Users/markemerson/Source/devflow-claude-v1.1 && GIT_INTEGRATION=0 npm test 2>&1 | grep -E '22A[0-9]+' | head -25`.
  </verify>
  <done>
Group 22A test cases (19 tests) added to init.test.cjs. All 19 fail with the expected RED-state errors. No syntax errors. Test list comment matches the cases. Single atomic commit: `test(22-01): add failing tests for --branch flag and missing-state error (Group 22A)`.
  </done>
  <recovery>
If a test fails with a syntax error rather than the expected RED-state error, fix the syntax (do NOT proceed to GREEN). If a test passes unexpectedly, audit the test — it's likely missing the assertion that should fail. RED is non-negotiable per Iron Law.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement _resolveBranch + branch-aware state readers + flag plumbing across init commands</name>
  <files>plugins/devflow/devflow/bin/lib/init.cjs</files>
  <action>
Implement the minimum production code to turn Group 22A tests GREEN. Stages within this task:

**Stage 2a: Add internal helpers (top of init.cjs after MODEL_PROFILES require)**

```js
const { spawnSync } = require('child_process');

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

/**
 * Resolve --branch flag from argv slice into a branch spec.
 *
 * Modes:
 *   working_tree (default): read .planning/* via fs from cwd
 *   git_show: read .planning/* via `git show <branch>:<path>`
 *
 * Aliases: 'current', 'HEAD' → working_tree mode (per G3 in 22-RESEARCH.md)
 *
 * Errors (calls helpers.cjs error() → process.exit(1)):
 *   --branch=<name> where <name> does not exist (rev-parse --verify fails)
 *
 * @param {string[]} args - argv slice from df-tools.cjs router
 * @param {string}   cwd  - working directory
 * @returns {{ mode: 'working_tree'|'git_show', branch: string|null }}
 */
function _resolveBranch(args, cwd) {
  const branchIdx = args.indexOf('--branch');
  let requested = null;
  if (branchIdx !== -1) {
    requested = args[branchIdx + 1];
    // Also handle --branch=name form
    if (!requested && args[branchIdx].includes('=')) {
      requested = args[branchIdx].split('=')[1];
    }
  }
  // Or detect --branch=name single-token form
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
    error(`--branch=${requested} does not exist. Hint: 'git branch --list ${requested}*' to find similar names, or omit --branch to read from current working tree.`);
  }

  return { mode: 'git_show', branch: requested };
}

/**
 * Read .planning/STATE.md respecting branch spec.
 *
 * working_tree mode: fs.readFileSync — errors if missing.
 * git_show mode: git show <branch>:.planning/STATE.md — errors if missing.
 *
 * Both error paths call error() with actionable message. PRIOR behavior
 * (silent null/empty fallback) is REMOVED — callers that legitimately
 * tolerate missing STATE.md (e.g., new-project) should NOT call this helper.
 *
 * @param {string} cwd
 * @param {{ mode: string, branch: string|null }} branchSpec
 * @returns {string} STATE.md content
 */
function _readStateBranch(cwd, branchSpec) {
  if (branchSpec.mode === 'working_tree') {
    const full = path.join(cwd, '.planning', 'STATE.md');
    if (!fs.existsSync(full)) {
      error(`.planning/STATE.md not found on current branch. If you need state from another branch, pass --branch=<name>. If this is a new project, run /df:new-project first.`);
    }
    return fs.readFileSync(full, 'utf-8');
  }
  // git_show mode
  const showR = _runGit(['show', `${branchSpec.branch}:.planning/STATE.md`], { cwd });
  if (!showR.ok) {
    error(`.planning/STATE.md not found on branch ${branchSpec.branch}.`);
  }
  return showR.stdout;
}

/**
 * Build informational note when --branch=X but current HEAD = Y (X ≠ Y).
 * Returns null when no mismatch (alias mode, branches equal, or HEAD detached).
 *
 * @param {string|null} currentBranch
 * @param {{ mode: string, branch: string|null }} branchSpec
 * @returns {string|null}
 */
function _buildBranchMismatchNote(currentBranch, branchSpec) {
  if (branchSpec.mode !== 'git_show') return null;
  if (!currentBranch || currentBranch === 'HEAD') return null;
  if (currentBranch === branchSpec.branch) return null;
  return `current branch is ${currentBranch}; reading state from ${branchSpec.branch} (--branch flag)`;
}
```

**Stage 2b: Wire _resolveBranch into all init commands**

The `args` array isn't currently passed to cmdInitX functions — they receive `cwd`, `objective`, `includes`, `raw`. Approach: extend each function signature to accept optional `branchSpec` param, OR (preferred — less invasive) extract branchSpec at the df-tools.cjs `case 'init':` arm and pass it through.

Simpler approach: at the TOP of each cmdInitX, accept a fifth `args` param (or wrapped `opts` object) and call `_resolveBranch(args, cwd)` first thing. Updated signatures:

```js
function cmdInitPlanObjective(cwd, objective, includes, raw, args = []) {
  if (!objective) error('objective required for init plan-objective');
  const branchSpec = _resolveBranch(args, cwd);
  // ... existing logic
  result.branch_spec = branchSpec; // expose to callers
  // Build mismatch note (best-effort current branch detection)
  const currR = _runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  const currentBranch = currR.ok ? currR.stdout.trim() : null;
  result.branch_mismatch_note = _buildBranchMismatchNote(currentBranch, branchSpec);
}
```

Apply pattern to ALL init commands (cmdInitPlanObjective, cmdInitExecuteObjective, cmdInitNewProject, cmdInitNewMilestone, cmdInitQuick, cmdInitResume, cmdInitVerifyWork, cmdInitObjectiveOp, cmdInitTodos, cmdInitMilestoneOp, cmdInitMapCodebase, cmdInitSecurityAudit, cmdInitProgress).

**Stage 2c: Wire missing-state error into commands that read STATE.md**

Most cmdInitX read STATE.md only when `includes.has('state')`. Convert those reads from "silent fallback to null" to use `_readStateBranch(cwd, branchSpec)` which errors on missing. CAVEAT: `cmdInitNewProject` legitimately tolerates missing STATE.md (no .planning yet) — keep that command's behavior unchanged (don't call _readStateBranch).

For working_tree mode, the missing-state error is NEW (prior behavior was silent fallback). For git_show mode, it's the only sensible behavior. NOTE: keep existing `safeReadFile` for files that genuinely tolerate absence (e.g., requirements_content); only STATE.md and ROADMAP.md get strict treatment.

**Stage 2d: Update df-tools.cjs router (`case 'init':` arm)**

Pass the full args slice through to each cmdInitX. Currently the router likely strips `--include` flags then passes specific positionals; ensure `--branch` and `--branch=value` survive. Cleanest fix: pass `args` (the full args slice excluding the already-consumed subcommand) as the last param. Verify by inspecting current code at df-tools.cjs lines 671-720.

**Stage 2e: Export internal helpers for unit testing**

```js
module.exports = {
  // ... existing exports
  _resolveBranch,
  _readStateBranch,
  _buildBranchMismatchNote,
  _setRunGit,
  _resetGitMock,
};
```

# CRITICAL: Run RED tests FIRST (`npm test -- --test-name-pattern='22A'` should still fail). Then implement until ALL 19 PASS. Then commit.
# GOTCHA: `args.indexOf('--branch')` doesn't catch `--branch=value` form — handle both (see code above).
# GOTCHA: `cmdInitNewProject` does NOT need _readStateBranch — it runs BEFORE state exists.
# PATTERN: Mirror `_setRunGit` test injection hook EXACTLY from awareness.cjs lines 248-251.
  </action>
  <verify>
`npm test -- --test-name-pattern='22A'` shows 19 tests; ALL pass (or 18 + 1 skip with GIT_INTEGRATION unset). Run full suite: `cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test 2>&1 | tail -5` — confirm 2168/2168 (2149 baseline + 19 new = 2168) tests pass with no regressions. Allow E2E1 and novel-domain pre-existing failures.
  </verify>
  <done>
All 19 Group 22A tests pass. Full suite: 2149 baseline + 19 new = 2168 pass; no new regressions vs `feature/v1.2-obj-12-bidirectional-gh-sync` baseline. Commit: `feat(22-01): add --branch flag + branch-aware state readers + missing-state error to init commands`.
  </done>
  <recovery>
If tests fail unexpectedly: (a) check `_resolveBranch` returns shape — must match the destructured `{mode, branch}`. (b) check `args` propagation through df-tools.cjs router — log args at top of cmdInitX during dev. (c) check existing tests for collateral damage — the new "missing STATE.md errors" behavior may break old tests that relied on silent fallback. If old tests break, audit each: if they were testing real production behavior (not the silent fallback as desired), update them. If they were exercising silent fallback as a feature, the test belongs in the "deferred" bucket — convert to expect the new error behavior.
  </recovery>
</task>

<task type="auto">
  <name>Task 3 (REFACTOR): Consolidate branch resolution at router level + update help text</name>
  <files>plugins/devflow/devflow/bin/lib/init.cjs,plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Cleanup pass after GREEN (skip this task entirely if Task 2 left the code clean — REFACTOR is optional per TDD playbook).

Candidate refactors:
1. If df-tools.cjs `case 'init':` arm has 13 near-identical "extract args, call cmdInitX(cwd, ..., args)" branches, extract a helper `_dispatchInit(subcommand, cwd, args, raw)` to reduce duplication.
2. Update df-tools.cjs help text (the comment block lines 100-160) to document `--branch=<name>` flag once at the top of the init subcommand section.
3. If `_resolveBranch` argv parsing has duplicated logic (handles both `--branch foo` and `--branch=foo`), consolidate into a single regex/loop.
4. Add JSDoc with explicit examples to each new helper.

# CRITICAL: This task only commits if it produces real cleanup. If Task 2 GREEN code is already clean (small functions, no duplication), SKIP this task — do NOT make a no-op commit.
# GOTCHA: Refactor must preserve all 19 Group 22A tests + the 2149 baseline tests. Run full suite before commit.
# PATTERN: TDD playbook habit allows REFACTOR as 3rd commit per TRD; only when necessary.
  </action>
  <verify>
`npm test 2>&1 | tail -5` shows 2168 pass (no regressions). If skipping: confirm decision in commit log (no commit made for this task) and proceed to TRD completion.
  </verify>
  <done>
Either: (a) refactor commit `refactor(22-01): consolidate init dispatch + document --branch flag` lands and full suite still passes, OR (b) Task 3 is explicitly skipped because Task 2 left clean code. Document the decision in the SUMMARY.md output.
  </done>
  <recovery>
If refactor breaks a test: revert the refactor commit, leave Task 2 GREEN as-is. The TRD is complete with 2 commits (test + feat) — refactor is optional.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs init plan-objective 22-workflow-impediment-fixes --branch=current` returns JSON with `branch_spec.mode === 'working_tree'`, `branch_mismatch_note: null`
- `node plugins/devflow/devflow/bin/df-tools.cjs init plan-objective 22-workflow-impediment-fixes --branch=does-not-exist` exits non-zero with stderr matching `does not exist`
- `node plugins/devflow/devflow/bin/df-tools.cjs init plan-objective 22-workflow-impediment-fixes --branch=feature/v1.2-obj-13-workflow-impediment` returns JSON with `branch_spec.mode === 'git_show'`, `branch_spec.branch === 'feature/v1.2-obj-13-workflow-impediment'`, no error
- Old call site `node plugins/devflow/devflow/bin/df-tools.cjs init plan-objective 22-workflow-impediment-fixes` (no flag) returns identical shape to `--branch=current` (back-compat regression check)
- `npm test` shows 2168 tests passing (2149 baseline + 19 Group 22A) — allow pre-existing E2E1 + novel-domain skips
</verification>

<success_criteria>
- All 15 init.cjs commands accept `--branch=<name>` flag (including `--branch=name` and `--branch name` forms)
- Default mode reads from working tree (back-compat preserved for invocations without flag)
- Missing STATE.md on resolved branch errors with actionable message mentioning `--branch` flag
- Missing branch (`--branch=foo` where foo doesn't exist) errors before reading any state
- `--branch=current` and `--branch=HEAD` are aliases for default working-tree mode
- `branch_mismatch_note` field surfaced in JSON when current HEAD ≠ requested branch
- 2149 baseline tests preserved + 19 new Group 22A tests pass
- 2-3 atomic commits per TDD cycle: `test:` (RED) + `feat:` (GREEN) + optional `refactor:`
</success_criteria>

<output>
After completion, create `.planning/objectives/22-workflow-impediment-fixes/22-01-init-branch-flag-SUMMARY.md` documenting: tests added (19), production helpers added (`_resolveBranch`, `_readStateBranch`, `_buildBranchMismatchNote`, `_setRunGit`, `_resetGitMock`), commands updated (15 init commands), commits made (2 or 3), test count delta (+19), regressions (0).
</output>
