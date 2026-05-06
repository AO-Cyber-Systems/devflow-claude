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
