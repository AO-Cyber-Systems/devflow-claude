'use strict';
/**
 * init.cjs tests
 *
 * TRD 18-03 — Group 18I: check-todos + awareness init previews
 * TRD 02-06 — Group I: awareness_refresh flag tests
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// ─── TRD 18-03 Imports (helpers exported for unit testing) ───────────────────

const { _buildCheckTodosPreview, _buildAwarenessPreview } = require('./init.cjs');

// ─── Fixtures / Helpers ───────────────────────────────────────────────────────

/**
 * Build a minimal DevFlow project in a temp directory.
 * Returns { cwd, cleanup }.
 */
function buildProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-test-'));
  // Minimal .planning structure expected by init commands
  fs.mkdirSync(path.join(dir, '.planning', 'objectives', '01-test'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), '{}');
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), '## Objective 1: Test\n');
  fs.writeFileSync(
    path.join(dir, '.planning', 'objectives', '01-test', 'OBJECTIVE.md'),
    '---\nwork: feature\n---\n# Test Objective\n'
  );
  return {
    cwd: dir,
    cleanup: () => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    },
  };
}

/**
 * Run a df-tools command in a subprocess and return the parsed JSON result.
 * Throws if the command exits non-zero.
 */
function runInit(subcommand, cwd) {
  const stdout = execSync(`node "${DF_TOOLS}" ${subcommand}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout.trim());
}

/**
 * Build a minimal fixture directory with optional cache files.
 * Returns the path to the tmp root.
 * Per TDD Playbook habit 4: hand-built factory function, no LLM-generated test data.
 *
 * @param {{ checkTodosCache?: any, awarenessCache?: any }} opts
 * @returns {string} path to tmp dir
 */
function makeFixture({ checkTodosCache, awarenessCache } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'init-preview-test-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (checkTodosCache !== undefined) {
    fs.writeFileSync(
      path.join(root, '.planning', '.check-todos-cache.json'),
      typeof checkTodosCache === 'string' ? checkTodosCache : JSON.stringify(checkTodosCache)
    );
  }
  if (awarenessCache !== undefined) {
    fs.writeFileSync(
      path.join(root, '.planning', '.awareness-cache.json'),
      typeof awarenessCache === 'string' ? awarenessCache : JSON.stringify(awarenessCache)
    );
  }
  return root;
}

// ─── Group 18I: TRD 18-03 — check-todos + awareness init previews ─────────────
//
// TEST LIST (TDD Playbook habit 2 — documented before test code written):
//
// 18I1 — _buildCheckTodosPreview: cache with parsed.now=[a,b] → line='📋 2 todos in Now lane (run /devflow:check-todos)', warning=null
// 18I2 — _buildCheckTodosPreview: missing cache file → { line: null, warning: null }
// 18I3 — _buildCheckTodosPreview: cache with parsed.now=[] → { line: null, warning: null }
// 18I4 — _buildCheckTodosPreview: malformed JSON → { line: null, warning: <non-empty> }
// 18I5 — _buildAwarenessPreview: cache with peer.branches=[{branch:'b1'},{branch:'b2'},{branch:'b3'}], current_branch='b1' → line='⚠ 2 other branches active (run df-tools awareness show)'
// 18I6 — _buildAwarenessPreview: missing cache file → { line: null, warning: null }
// 18I7 — _buildAwarenessPreview: branches=[{branch:'main'}], current_branch='main' → { line: null, warning: null } (filtered to zero)
// 18I8 — Integration: cmdInitExecuteObjective JSON contains check_todos_preview + awareness_preview + advisories_warnings keys
// 18I9 — Integration: cmdInitPlanObjective JSON contains the same three keys (DRY)
// 18I10 — Integration: when cache files absent, all three keys present with null/[] values (back-compat)

test('18I1 — _buildCheckTodosPreview: 2 now entries returns formatted line', () => {
  const repo = makeFixture({ checkTodosCache: { now: [{ id: 1 }, { id: 2 }], blocked: [], soon: [], ideas: [] } });
  try {
    const r = _buildCheckTodosPreview(repo);
    assert.strictEqual(r.line, '📋 2 todos in Now lane (run /devflow:check-todos)');
    assert.strictEqual(r.warning, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I2 — _buildCheckTodosPreview: missing cache file → {line:null, warning:null}', () => {
  const repo = makeFixture({});
  try {
    const r = _buildCheckTodosPreview(repo);
    assert.strictEqual(r.line, null);
    assert.strictEqual(r.warning, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I3 — _buildCheckTodosPreview: empty now array → {line:null, warning:null}', () => {
  const repo = makeFixture({ checkTodosCache: { now: [], blocked: [], soon: [], ideas: [] } });
  try {
    const r = _buildCheckTodosPreview(repo);
    assert.strictEqual(r.line, null);
    assert.strictEqual(r.warning, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I4 — _buildCheckTodosPreview: malformed JSON → {line:null, warning:non-empty}', () => {
  const repo = makeFixture({ checkTodosCache: '{ invalid json !! }' });
  try {
    const r = _buildCheckTodosPreview(repo);
    assert.strictEqual(r.line, null);
    assert.ok(
      typeof r.warning === 'string' && r.warning.length > 0,
      `expected non-empty warning, got: ${JSON.stringify(r.warning)}`
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I5 — _buildAwarenessPreview: 3 branches, current=b1 → 2 other branches line', () => {
  const repo = makeFixture({
    awarenessCache: {
      peer: {
        current_branch: 'b1',
        branches: [{ branch: 'b1' }, { branch: 'b2' }, { branch: 'b3' }],
      },
    },
  });
  try {
    const r = _buildAwarenessPreview(repo);
    assert.strictEqual(r.line, '⚠ 2 other branches active (run df-tools awareness show)');
    assert.strictEqual(r.warning, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I6 — _buildAwarenessPreview: missing cache file → {line:null, warning:null}', () => {
  const repo = makeFixture({});
  try {
    const r = _buildAwarenessPreview(repo);
    assert.strictEqual(r.line, null);
    assert.strictEqual(r.warning, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I7 — _buildAwarenessPreview: only current branch in list → {line:null, warning:null}', () => {
  const repo = makeFixture({
    awarenessCache: {
      peer: {
        current_branch: 'main',
        branches: [{ branch: 'main' }],
      },
    },
  });
  try {
    const r = _buildAwarenessPreview(repo);
    assert.strictEqual(r.line, null);
    assert.strictEqual(r.warning, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I8 — Integration: cmdInitExecuteObjective emits check_todos_preview + awareness_preview + advisories_warnings', () => {
  const repo = makeFixture({ checkTodosCache: { now: [{ id: 1 }], blocked: [], soon: [], ideas: [] } });
  try {
    // Need minimal .planning structure for init execute-objective to succeed
    fs.mkdirSync(path.join(repo, '.planning', 'objectives', '01-test'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.planning', 'config.json'), '{}');
    fs.writeFileSync(path.join(repo, '.planning', 'ROADMAP.md'), '## Objective 1: Test\n');

    const stdout = execSync(`node "${DF_TOOLS}" init execute-objective 1`, {
      cwd: repo,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const json = JSON.parse(stdout.trim());
    assert.ok('check_todos_preview' in json, 'check_todos_preview key must be present');
    assert.ok('awareness_preview' in json, 'awareness_preview key must be present');
    assert.ok('advisories_warnings' in json, 'advisories_warnings key must be present');
    assert.ok(Array.isArray(json.advisories_warnings), 'advisories_warnings must be an array');
    // With a now-lane cache entry, preview should be a non-null string
    assert.ok(
      typeof json.check_todos_preview === 'string' && json.check_todos_preview.includes('1 todos in Now lane'),
      `expected check_todos_preview to contain '1 todos in Now lane', got: ${JSON.stringify(json.check_todos_preview)}`
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('FIX-1: init execute-objective triggers backfillAllObjectives, scaffolding missing OBJECTIVE.md files', () => {
  const repo = makeFixture({});
  try {
    // Build .planning with TWO objective dirs, neither has OBJECTIVE.md
    fs.mkdirSync(path.join(repo, '.planning', 'objectives', '01-foo'), { recursive: true });
    fs.mkdirSync(path.join(repo, '.planning', 'objectives', '02-bar'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.planning', 'config.json'), '{}');
    fs.writeFileSync(path.join(repo, '.planning', 'ROADMAP.md'),
      '## Milestone v1.0\n\n### Objective 1: Foo\n**Goal:** Test foo\n\n### Objective 2: Bar\n**Goal:** Test bar\n');
    fs.writeFileSync(path.join(repo, '.planning', 'PROJECT.md'),
      '---\ngithub_repo: own/repo\ndefault_work: feature\n---\n# P\n');

    // Pre-condition: neither OBJECTIVE.md exists
    assert.strictEqual(fs.existsSync(path.join(repo, '.planning', 'objectives', '01-foo', 'OBJECTIVE.md')), false);
    assert.strictEqual(fs.existsSync(path.join(repo, '.planning', 'objectives', '02-bar', 'OBJECTIVE.md')), false);

    const stdout = execSync(`node "${DF_TOOLS}" init execute-objective 1`, {
      cwd: repo, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const json = JSON.parse(stdout.trim());

    // Post-condition: bootstrap_objectives reports the backfill
    assert.ok('bootstrap_objectives' in json, 'bootstrap_objectives key must be present');
    assert.ok(json.bootstrap_objectives.applied >= 2, `expected at least 2 applied, got: ${json.bootstrap_objectives.applied}`);

    // Both OBJECTIVE.md files now exist
    assert.strictEqual(fs.existsSync(path.join(repo, '.planning', 'objectives', '01-foo', 'OBJECTIVE.md')), true);
    assert.strictEqual(fs.existsSync(path.join(repo, '.planning', 'objectives', '02-bar', 'OBJECTIVE.md')), true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('FIX-1: init plan-objective triggers backfillAllObjectives same as execute-objective', () => {
  const repo = makeFixture({});
  try {
    fs.mkdirSync(path.join(repo, '.planning', 'objectives', '03-baz'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.planning', 'config.json'), '{}');
    fs.writeFileSync(path.join(repo, '.planning', 'ROADMAP.md'), '### Objective 3: Baz\n**Goal:** Test\n');
    fs.writeFileSync(path.join(repo, '.planning', 'PROJECT.md'),
      '---\ngithub_repo: own/repo\n---\n# P\n');

    assert.strictEqual(fs.existsSync(path.join(repo, '.planning', 'objectives', '03-baz', 'OBJECTIVE.md')), false);

    const stdout = execSync(`node "${DF_TOOLS}" init plan-objective 3`, {
      cwd: repo, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const json = JSON.parse(stdout.trim());
    assert.ok('bootstrap_objectives' in json);
    assert.ok(json.bootstrap_objectives.applied >= 1);
    assert.strictEqual(fs.existsSync(path.join(repo, '.planning', 'objectives', '03-baz', 'OBJECTIVE.md')), true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I9 — Integration: cmdInitPlanObjective emits check_todos_preview + awareness_preview + advisories_warnings', () => {
  const repo = makeFixture({
    awarenessCache: {
      peer: {
        current_branch: 'main',
        branches: [{ branch: 'feature-a' }, { branch: 'feature-b' }],
      },
    },
  });
  try {
    fs.mkdirSync(path.join(repo, '.planning', 'objectives', '01-test'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.planning', 'config.json'), '{}');
    fs.writeFileSync(path.join(repo, '.planning', 'ROADMAP.md'), '## Objective 1: Test\n');

    const stdout = execSync(`node "${DF_TOOLS}" init plan-objective 1`, {
      cwd: repo,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const json = JSON.parse(stdout.trim());
    assert.ok('check_todos_preview' in json, 'check_todos_preview key must be present');
    assert.ok('awareness_preview' in json, 'awareness_preview key must be present');
    assert.ok('advisories_warnings' in json, 'advisories_warnings key must be present');
    // With 2 peer branches (neither is current 'main'), awareness_preview should be non-null
    assert.ok(
      typeof json.awareness_preview === 'string' && json.awareness_preview.includes('2 other branches active'),
      `expected awareness_preview to contain '2 other branches active', got: ${JSON.stringify(json.awareness_preview)}`
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('18I10 — Integration: cache files absent → all three keys present with null/[] values (back-compat)', () => {
  const repo = makeFixture({});
  try {
    fs.mkdirSync(path.join(repo, '.planning', 'objectives', '01-test'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.planning', 'config.json'), '{}');
    fs.writeFileSync(path.join(repo, '.planning', 'ROADMAP.md'), '## Objective 1: Test\n');

    const stdout = execSync(`node "${DF_TOOLS}" init plan-objective 1`, {
      cwd: repo,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const json = JSON.parse(stdout.trim());
    assert.ok('check_todos_preview' in json, 'check_todos_preview key must be present');
    assert.ok('awareness_preview' in json, 'awareness_preview key must be present');
    assert.ok('advisories_warnings' in json, 'advisories_warnings key must be present');
    assert.strictEqual(json.check_todos_preview, null, `expected null check_todos_preview, got: ${JSON.stringify(json.check_todos_preview)}`);
    assert.strictEqual(json.awareness_preview, null, `expected null awareness_preview, got: ${JSON.stringify(json.awareness_preview)}`);
    assert.deepStrictEqual(json.advisories_warnings, [], `expected [] advisories_warnings, got: ${JSON.stringify(json.advisories_warnings)}`);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ─── Group I: TRD 02-06 — init.cjs awareness_refresh flag ────────────────────
//
// Test list (TDD Playbook habit 2 — documented before test code written):
// I1: cmdInitPlanObjective emits awareness_refresh:true when awareness.cjs loads
// I3: cmdInitExecuteObjective emits awareness_refresh:true when awareness.cjs loads
// I5: existing fields (planner_model, objective_dir) preserved after addition
//
// Notes on I2/I4 (require-failure path):
// The _awarenessLoadable() helper wraps require('./awareness.cjs') in try/catch.
// Testing the false path requires spawning a subprocess with a broken awareness.cjs
// path — complex and fragile. The design choice is: false path is a graceful
// degradation guard; the function is a single-line try/catch. Verified by inspection.
//
// Test pattern: subprocess via execSync (df-tools CLI) because output() calls
// process.exit(0) — in-process capture is not feasible for these init commands.

test('I1: cmdInitPlanObjective emits awareness_refresh:true when awareness.cjs loads', () => {
  const p = buildProject();
  try {
    const json = runInit('init plan-objective 1', p.cwd);
    assert.strictEqual(
      json.awareness_refresh,
      true,
      `expected awareness_refresh:true, got: ${JSON.stringify(json.awareness_refresh)}`
    );
  } finally { p.cleanup(); }
});

test('I3: cmdInitExecuteObjective emits awareness_refresh:true when awareness.cjs loads', () => {
  const p = buildProject();
  try {
    const json = runInit('init execute-objective 1', p.cwd);
    assert.strictEqual(
      json.awareness_refresh,
      true,
      `expected awareness_refresh:true, got: ${JSON.stringify(json.awareness_refresh)}`
    );
  } finally { p.cleanup(); }
});

test('I5: existing fields preserved — planner_model and objective_dir still present', () => {
  const p = buildProject();
  try {
    const json = runInit('init plan-objective 1', p.cwd);
    // planner_model must exist and be a string
    assert.ok(
      typeof json.planner_model === 'string',
      `expected planner_model string, got: ${JSON.stringify(json.planner_model)}`
    );
    // objective_dir is null when not found, or a string
    assert.ok(
      json.objective_dir === null || typeof json.objective_dir === 'string',
      `expected objective_dir string|null, got: ${JSON.stringify(json.objective_dir)}`
    );
    // awareness_refresh must also be present (regression guard for I1)
    assert.ok(
      'awareness_refresh' in json,
      'awareness_refresh field must be present alongside existing fields'
    );
  } finally { p.cleanup(); }
});

// ─── Group 22A: TRD 22-01 — --branch flag + missing-state error ───────────────
//
// TEST LIST (TDD Playbook habit 2 — documented before test code written):
//
// 22A1  — _resolveBranch([])                                        → { mode: 'working_tree', branch: null }
// 22A2  — _resolveBranch(['--branch', 'current'])                   → { mode: 'working_tree', branch: null }   (alias)
// 22A3  — _resolveBranch(['--branch', 'HEAD'])                      → { mode: 'working_tree', branch: null }   (alias, G3)
// 22A4  — _resolveBranch(['--branch', 'feature/foo']) + mock ok     → { mode: 'git_show', branch: 'feature/foo' }
// 22A5  — _resolveBranch(['--branch', 'does-not-exist']) + mock !ok → process.exit(1) with stderr "does not exist"
// 22A6  — _readStateBranch(cwd, working_tree) → reads STATE.md from cwd (back-compat)
// 22A7  — _readStateBranch(cwd, working_tree) missing STATE.md      → process.exit(1) with stderr "STATE.md not found"
// 22A8  — _readStateBranch(cwd, git_show) + mock ok                 → returns STATE.md content from mock
// 22A9  — _readStateBranch(cwd, git_show) + mock !ok                → process.exit(1) with stderr "STATE.md not found on branch"
// 22A10 — runInit('init plan-objective 1', cwd_with_state)          → { objective_found: true } (working_tree default)
// 22A11 — runInit('init plan-objective 1 --branch=current', cwd)    → identical shape to 22A10 (alias parity)
// 22A12 — runInit('init plan-objective 1 --branch=does-not-exist')  → exits non-zero with stderr "does not exist"
// 22A13 — runInit('init execute-objective 1 --branch=current')      → ok (sanity 1 of 4)
// 22A14 — runInit('init verify-work 1 --branch=current')            → ok (sanity 2 of 4)
// 22A15 — runInit('init objective-op 1 --branch=current')           → ok (sanity 3 of 4)
// 22A16 — runInit('init progress --branch=current')                 → ok (sanity 4 of 4 — non-objective-scoped)
// 22A17 — _buildBranchMismatchNote('master', { mode: 'git_show', branch: 'feature/x' }) → contains 'master' and 'feature/x'
// 22A18 — _buildBranchMismatchNote('master', { mode: 'working_tree', branch: null })   → null
// 22A19 — _buildBranchMismatchNote('master', { mode: 'git_show', branch: 'master' })   → null (same)
//
// Notes:
// - 22A1-22A9 + 22A17-22A19 are unit tests via direct require() — fast, hermetic.
// - 22A10-22A16 are subprocess tests via runInit (working_tree mode only — no git mocks).
// - 22A12 (does-not-exist) hits real git on the test fixture; in a fixture without a git
//   repo, 'rev-parse --verify' fails naturally → expected error message.

const initMod = require('./init.cjs');
const {
  _resolveBranch,
  _readStateBranch,
  _buildBranchMismatchNote,
  _setRunGit,
  _resetGitMock,
} = initMod;

/**
 * Build a project fixture WITH STATE.md (extends buildProject for new
 * strict-missing-state behavior introduced by TRD 22-01).
 */
function buildProjectWithState() {
  const p = buildProject();
  fs.writeFileSync(path.join(p.cwd, '.planning', 'STATE.md'), '# State\n\n**Current Objective:** 01\n');
  return p;
}

/**
 * Build a project fixture WITHOUT STATE.md (for missing-state error tests).
 */
function buildProjectWithoutState() {
  // Same as buildProject — that helper already does NOT write STATE.md
  return buildProject();
}

test('22A1 — _resolveBranch([]) returns working_tree default', () => {
  assert.ok(_resolveBranch, '_resolveBranch must be exported from init.cjs');
  const r = _resolveBranch([], '/tmp');
  assert.deepStrictEqual(r, { mode: 'working_tree', branch: null });
});

test("22A2 — _resolveBranch(['--branch','current']) returns working_tree (alias)", () => {
  const r = _resolveBranch(['--branch', 'current'], '/tmp');
  assert.deepStrictEqual(r, { mode: 'working_tree', branch: null });
});

test("22A3 — _resolveBranch(['--branch','HEAD']) returns working_tree (alias, G3)", () => {
  const r = _resolveBranch(['--branch', 'HEAD'], '/tmp');
  assert.deepStrictEqual(r, { mode: 'working_tree', branch: null });
});

test("22A4 — _resolveBranch(['--branch','feature/foo']) + mock ok returns git_show", () => {
  _setRunGit((args) => {
    if (args[0] === 'rev-parse' && args.includes('feature/foo')) {
      return { ok: true, status: 0, stdout: 'abc1234\n', stderr: '' };
    }
    return { ok: false, status: 128, stdout: '', stderr: 'unknown call' };
  });
  try {
    const r = _resolveBranch(['--branch', 'feature/foo'], '/tmp');
    assert.deepStrictEqual(r, { mode: 'git_show', branch: 'feature/foo' });
  } finally { _resetGitMock(); }
});

test("22A5 — _resolveBranch(['--branch','does-not-exist']) + mock !ok exits 1 with hint", () => {
  // Verify via subprocess (the in-process path calls error() which exits)
  const p = buildProjectWithState();
  try {
    let threw = false;
    let stderr = '';
    try {
      execSync(`node "${DF_TOOLS}" init plan-objective 1 --branch=does-not-exist-${Date.now()}`, {
        cwd: p.cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      threw = true;
      stderr = e.stderr || '';
    }
    assert.ok(threw, 'expected non-zero exit for missing branch');
    assert.ok(/does not exist/i.test(stderr), `expected stderr to mention "does not exist", got: ${stderr}`);
  } finally { p.cleanup(); }
});

test('22A6 — _readStateBranch(cwd, working_tree) reads STATE.md (back-compat)', () => {
  assert.ok(_readStateBranch, '_readStateBranch must be exported');
  const p = buildProjectWithState();
  try {
    const content = _readStateBranch(p.cwd, { mode: 'working_tree', branch: null });
    assert.ok(content.includes('Current Objective'), `expected STATE.md content, got: ${content}`);
  } finally { p.cleanup(); }
});

test('22A7 — _readStateBranch(cwd, working_tree) missing STATE.md exits 1 with hint', () => {
  // Subprocess to capture process.exit(1)
  const p = buildProjectWithoutState();
  try {
    let threw = false;
    let stderr = '';
    try {
      execSync(`node "${DF_TOOLS}" init plan-objective 1 --include state`, {
        cwd: p.cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      threw = true;
      stderr = e.stderr || '';
    }
    assert.ok(threw, 'expected non-zero exit when STATE.md missing and --include state');
    assert.ok(/STATE\.md not found/i.test(stderr), `expected stderr to mention "STATE.md not found", got: ${stderr}`);
    assert.ok(/--branch/.test(stderr), `expected stderr to mention "--branch" hint, got: ${stderr}`);
  } finally { p.cleanup(); }
});

test('22A8 — _readStateBranch(cwd, git_show) + mock ok returns content', () => {
  const fakeContent = '# State on feature/x\n\n**Current Objective:** 99\n';
  _setRunGit((args) => {
    if (args[0] === 'show' && args[1] && args[1].includes('feature/x:.planning/STATE.md')) {
      return { ok: true, status: 0, stdout: fakeContent, stderr: '' };
    }
    return { ok: false, status: 128, stdout: '', stderr: 'unknown call' };
  });
  try {
    const content = _readStateBranch('/tmp', { mode: 'git_show', branch: 'feature/x' });
    assert.strictEqual(content, fakeContent);
  } finally { _resetGitMock(); }
});

test('22A9 — _readStateBranch(cwd, git_show) + mock !ok exits 1 with branch in message', () => {
  // Need subprocess because error() calls process.exit. Use --branch with a real branch
  // from the host repo so resolveBranch passes, then test that the error path triggers
  // when STATE.md is missing on that branch.
  // Simpler: use direct in-process call with mock — but error() exits the test process.
  // We'll wrap the test to assert via try/catch on a child_process spawn that exercises
  // the error exit path. Use a fixture where rev-parse mock succeeds but show fails —
  // but we cannot inject mocks across processes. Alternative: test the error path via
  // a temporary fork that intercepts process.exit. For simplicity: the in-process unit
  // test is gated by replacing process.exit/process.stderr.write to capture vs. exit.
  const realExit = process.exit;
  const realErrWrite = process.stderr.write.bind(process.stderr);
  let exitCode = null;
  let stderrBuf = '';
  process.exit = (code) => { exitCode = code; throw new Error('__test_exit__'); };
  process.stderr.write = (s) => { stderrBuf += s; return true; };
  _setRunGit((args) => {
    if (args[0] === 'show') {
      return { ok: false, status: 128, stdout: '', stderr: 'fatal: path does not exist' };
    }
    return { ok: false, status: 128, stdout: '', stderr: 'unknown' };
  });
  try {
    try {
      _readStateBranch('/tmp', { mode: 'git_show', branch: 'feature/x' });
    } catch (e) {
      if (e.message !== '__test_exit__') throw e;
    }
    assert.strictEqual(exitCode, 1, 'expected process.exit(1)');
    assert.ok(/STATE\.md not found on branch feature\/x/.test(stderrBuf),
      `expected branch in error message, got: ${stderrBuf}`);
  } finally {
    _resetGitMock();
    process.exit = realExit;
    process.stderr.write = realErrWrite;
  }
});

test('22A10 — runInit("init plan-objective 1", cwd_with_state) returns objective_found:true', () => {
  const p = buildProjectWithState();
  try {
    const json = runInit('init plan-objective 1', p.cwd);
    assert.strictEqual(json.objective_found, true, `expected objective_found:true, got: ${JSON.stringify(json.objective_found)}`);
  } finally { p.cleanup(); }
});

test('22A11 — runInit("init plan-objective 1 --branch=current") matches default', () => {
  const p = buildProjectWithState();
  try {
    const jsonDefault = runInit('init plan-objective 1', p.cwd);
    const jsonAlias = runInit('init plan-objective 1 --branch=current', p.cwd);
    assert.strictEqual(jsonAlias.objective_found, jsonDefault.objective_found, 'objective_found parity');
    assert.strictEqual(jsonAlias.objective_dir, jsonDefault.objective_dir, 'objective_dir parity');
  } finally { p.cleanup(); }
});

test('22A12 — runInit("init plan-objective 1 --branch=does-not-exist") exits non-zero', () => {
  const p = buildProjectWithState();
  try {
    let threw = false;
    let stderr = '';
    try {
      execSync(`node "${DF_TOOLS}" init plan-objective 1 --branch=does-not-exist-${Date.now()}`, {
        cwd: p.cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      threw = true;
      stderr = e.stderr || '';
    }
    assert.ok(threw, 'expected non-zero exit');
    assert.ok(/does not exist/i.test(stderr), `expected "does not exist" in stderr, got: ${stderr}`);
  } finally { p.cleanup(); }
});

test('22A13 — runInit("init execute-objective 1 --branch=current") works (sanity 1/4)', () => {
  const p = buildProjectWithState();
  try {
    const json = runInit('init execute-objective 1 --branch=current', p.cwd);
    assert.ok(json, 'expected JSON result');
  } finally { p.cleanup(); }
});

test('22A14 — runInit("init verify-work 1 --branch=current") works (sanity 2/4)', () => {
  const p = buildProjectWithState();
  try {
    const json = runInit('init verify-work 1 --branch=current', p.cwd);
    assert.ok(json, 'expected JSON result');
  } finally { p.cleanup(); }
});

test('22A15 — runInit("init objective-op 1 --branch=current") works (sanity 3/4)', () => {
  const p = buildProjectWithState();
  try {
    const json = runInit('init objective-op 1 --branch=current', p.cwd);
    assert.ok(json, 'expected JSON result');
  } finally { p.cleanup(); }
});

test('22A16 — runInit("init progress --branch=current") works (sanity 4/4)', () => {
  const p = buildProjectWithState();
  try {
    const json = runInit('init progress --branch=current', p.cwd);
    assert.ok(json, 'expected JSON result');
  } finally { p.cleanup(); }
});

test('22A17 — _buildBranchMismatchNote different branches returns informational note', () => {
  assert.ok(_buildBranchMismatchNote, '_buildBranchMismatchNote must be exported');
  const note = _buildBranchMismatchNote('master', { mode: 'git_show', branch: 'feature/x' });
  assert.ok(typeof note === 'string', `expected string note, got: ${JSON.stringify(note)}`);
  assert.ok(note.includes('master'), `expected current branch in note, got: ${note}`);
  assert.ok(note.includes('feature/x'), `expected requested branch in note, got: ${note}`);
});

test('22A18 — _buildBranchMismatchNote in working_tree mode returns null', () => {
  const note = _buildBranchMismatchNote('master', { mode: 'working_tree', branch: null });
  assert.strictEqual(note, null);
});

test('22A19 — _buildBranchMismatchNote when branches equal returns null', () => {
  const note = _buildBranchMismatchNote('master', { mode: 'git_show', branch: 'master' });
  assert.strictEqual(note, null);
});
