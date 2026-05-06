---
objective: 22-workflow-impediment-fixes
type: research
status: complete
researched: 2026-05-06
---

# Research — Workflow-Impediment Fixes (Objective 22)

## Discovery level: 0 (skip — pure internal work)

All work follows established codebase patterns:
- `_setRunGit` / `_setRunFs` injection hook pattern (locked across awareness.cjs, dup-detect.cjs, org-awareness.cjs, gh.cjs)
- `runInit()` subprocess test pattern (init.cjs already established for init command tests because `output()` calls `process.exit`)
- `case 'X':` router arm pattern in df-tools.cjs
- Cassette-based / fixture-builder test patterns (TRD 04, 05, 18 conventions)

No external dependencies introduced. No new libraries. No API integrations beyond what already exists.

## Standard stack (from STACK.md / package.json)

- Node native test runner (`node --test`) — pattern: `*.test.cjs` adjacent to source
- CommonJS modules (`.cjs` suffix throughout)
- Synchronous I/O (`fs.readFileSync` / `fs.writeFileSync`)
- `child_process.spawnSync` / `execSync` for git commands

No additional libraries needed.

## Architecture patterns (locked)

### `_setRunGit` injection pattern

```js
// In production code
const { spawnSync } = require('child_process');
function runGit(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    ...opts,
  });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: (r.stderr || '').trim() };
}

let _runGit = runGit;
function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGit; }
function _resetGitMock() { _runGit = runGit; }
```

All callers route through `_runGit`. Tests inject mocks via `_setRunGit(mockFn)` then `_resetGitMock()` in cleanup.

### `_setRunFs` injection pattern (for filesystem mutations)

```js
const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
  rmSync: (p, opts) => fs.rmSync(p, opts),
  cpSync: (src, dst, opts) => fs.cpSync(src, dst, opts),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
```

### Subprocess test pattern for init commands

`output()` in `helpers.cjs` calls `process.exit(0)` — making in-process stdout capture impossible. Tests for init commands use:

```js
const { execSync } = require('child_process');
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

function runInit(subcommand, cwd) {
  const stdout = execSync(`node "${DF_TOOLS}" ${subcommand}`, {
    cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout.trim());
}
```

For non-init commands (`project-hygiene`), pure unit tests of `lib/project-hygiene.cjs` exports work because they don't go through `output()`.

### Git fixture pattern

```js
const { execSync } = require('child_process');

function buildGitFixtureRepo({ branches = [], commits = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-hygiene-test-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email "test@test"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  // Initial commit on default branch
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test\n');
  execSync('git add README.md && git commit -qm "init"', { cwd: dir });
  // Create additional branches with specific files
  for (const [branch, files] of Object.entries(commits)) {
    execSync(`git checkout -qb ${branch}`, { cwd: dir });
    for (const [filePath, content] of Object.entries(files)) {
      const full = path.join(dir, filePath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    execSync('git add -A && git commit -qm "branch commit"', { cwd: dir });
    execSync('git checkout -q -', { cwd: dir });
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
```

Tests gated by `GIT_INTEGRATION=1` env var (per established convention). Pure unit tests (no real git) preferred where possible — use `_setRunGit` to mock.

## Don't hand-roll

- **Frontmatter parsing:** use `lib/frontmatter.cjs` `extractFrontmatter()` — tolerates malformed entries, returns parsed object directly (NOT `{frontmatter, body}`).
- **Repo extraction from refs:** use `org-awareness.cjs` `_extractRepoFromRef(ref)` for `owner/repo#NN` shorthand handling.
- **Misfiling detection logic:** `org-awareness.cjs` `_detectMisfiling(chain, projectCtx)` already exists — Feature B's `check` command should call this through `lib/project-hygiene.cjs` rather than duplicate the logic.

## Common pitfalls / gotchas

### G1: `output()` calls `process.exit(0)` — break stdout capture

`helpers.cjs` `output()` writes JSON then exits. In-process tests can NOT capture stdout from functions that call `output()`. Use `execSync` subprocess pattern OR test the underlying internal functions (e.g., `cmdInitPlanObjective` is hard to test in-process; `findObjectiveInternal` is easy).

### G2: `git show <branch>:<path>` exit codes

- Exit 0: branch exists, file exists → stdout has content
- Exit 128: branch doesn't exist OR file doesn't exist on that branch → stderr explains
- The two failure modes return the SAME exit code; tests/code that distinguish "branch missing" vs "file missing on branch" must inspect stderr text or run a separate `git rev-parse <branch>` first.

### G3: `git rev-parse --abbrev-ref HEAD` in detached HEAD

Returns literal `HEAD` (not a branch name). Code must handle this: `--branch=HEAD` may mean "the literal HEAD ref" — explicit detection: if `current === 'HEAD'`, treat as detached and document that `--branch=<name>` is required.

### G4: `fs.cpSync` recursive mode

Node 16.7+ supports `fs.cpSync(src, dst, { recursive: true })`. Older Node throws. Project requires Node 20+ per `package.json`. SAFE.

### G5: `fs.rmSync` with `recursive: true, force: true`

Won't throw on missing paths. Important for cleanup-after-error paths in atomic move (we want the rm to be idempotent if called twice).

### G6: `.gitignore` patterns must NOT cover `archived-projects/`

If a future obj puts `archived-projects/` in `.gitignore`, archive-apply silently loses data on next checkout. Document in TRD: archive output dir is at WORKSPACE-LEVEL (sibling of source repo), not inside any repo. Naming: `archived-projects/<repo-name>-planning/`.

### G7: Misfiling detection requires gh auth (resolveChain)

`_detectMisfiling` calls `resolveChain` which calls `gh` CLI. In CI / no-auth contexts, `requireGhAuth` throws. The hygiene `check` command must catch `GhAuthError` and degrade gracefully (skip misfiling check, return what it could compute from frontmatter alone). Per obj 3 TRD 03-03 locked decision: "GhAuthError graceful degradation".

### G8: PROJECT.md `github_repo` may be missing

Legacy projects don't have it. Hygiene `check` returns `{misfiled: [], reason: 'github_repo absent'}` rather than crashing.

### G9: `git rev-parse <branch>` for branch existence check

Lightweight branch-existence test: `git rev-parse --verify --quiet <branch>` returns 0 if exists, non-zero otherwise. Use this BEFORE `git show <branch>:<file>` to disambiguate G2.

## Error recovery patterns

### Pattern: `--branch` resolution failure

```js
function _resolveBranch(args, cwd) {
  const branchIdx = args.indexOf('--branch');
  const requested = (branchIdx !== -1) ? args[branchIdx + 1] : null;

  if (!requested || requested === 'current' || requested === 'HEAD') {
    // Default: current branch (no git show needed; reads from working tree)
    return { mode: 'working_tree', branch: null };
  }

  // Explicit branch — verify it exists
  const verifyR = _runGit(['rev-parse', '--verify', '--quiet', requested], { cwd });
  if (!verifyR.ok) {
    error(`--branch=${requested} does not exist. Hint: 'git branch --list ${requested}*' to find similar names.`);
  }

  return { mode: 'git_show', branch: requested };
}
```

### Pattern: state file missing (no silent fallback)

```js
function _readStateFile(cwd, branchSpec, relPath) {
  if (branchSpec.mode === 'working_tree') {
    const full = path.join(cwd, relPath);
    if (!fs.existsSync(full)) {
      // PRIOR BEHAVIOR: silent fallback to {} or null. NEW BEHAVIOR: error explicitly.
      error(`${relPath} not found on current branch. If you need state from another branch, pass --branch=<name>.`);
    }
    return fs.readFileSync(full, 'utf-8');
  } else {
    // git_show mode
    const showR = _runGit(['show', `${branchSpec.branch}:${relPath}`], { cwd });
    if (!showR.ok) {
      error(`${relPath} not found on branch ${branchSpec.branch}.`);
    }
    return showR.stdout;
  }
}
```

### Pattern: atomic move with verify

```js
function _atomicMove(src, dst) {
  // 1. Pre-check: src exists, dst does not
  if (!_runFs.existsSync(src)) throw new Error(`source not found: ${src}`);
  if (_runFs.existsSync(dst)) throw new Error(`destination exists (refuse to overwrite): ${dst}`);

  // 2. cp -r (atomic-ish — dst either fully populates or fails)
  _runFs.cpSync(src, dst, { recursive: true });

  // 3. Verify (filesystem walk: file count + total bytes match)
  const srcStats = _walkStats(src);
  const dstStats = _walkStats(dst);
  if (srcStats.files !== dstStats.files || srcStats.bytes !== dstStats.bytes) {
    // Roll back: remove dst
    _runFs.rmSync(dst, { recursive: true, force: true });
    throw new Error(`verify failed: src ${srcStats.files}f/${srcStats.bytes}b vs dst ${dstStats.files}f/${dstStats.bytes}b`);
  }

  // 4. Only AFTER verify passes: remove src
  _runFs.rmSync(src, { recursive: true, force: true });
}
```

## Anti-patterns to avoid

- **Implicit state walking:** anything that "tries multiple branches" — must error with hint instead.
- **Silent missing-state fallback:** returning `{}` or empty arrays when STATE.md/ROADMAP.md absent — error with actionable message instead.
- **Auto-execute `gh repo archive`:** archive `--apply` MUST emit the command to stdout for user to run; preserves user authority over GH-side state changes per CONTEXT.md locked decision #5.
- **Auto-update both repos' ROADMAPs on move:** `--update-roadmaps` flag is OPTIONAL; default behavior is move dir + emit one-line note "remember to update ROADMAP.md in both repos".
- **`git mv` for move:** NOT a git operation. User commits source-side delete and dest-side add separately on their respective branches.
- **In-process testing of init commands that call `output()`:** subprocess pattern (`runInit()`) is the established workaround.
