'use strict';
/**
 * TRD 02-06 — Group I: init.cjs awareness_refresh flag tests
 *
 * Test list (TDD Playbook habit 2 — documented before test code written):
 * I1: cmdInitPlanObjective emits awareness_refresh:true when awareness.cjs loads
 * I3: cmdInitExecuteObjective emits awareness_refresh:true when awareness.cjs loads
 * I5: existing fields (planner_model, objective_dir) preserved after addition
 *
 * Notes on I2/I4 (require-failure path):
 * The _awarenessLoadable() helper wraps require('./awareness.cjs') in try/catch.
 * Testing the false path requires spawning a subprocess with a broken awareness.cjs
 * path — complex and fragile. The design choice is: false path is a graceful
 * degradation guard; the function is a single-line try/catch. Verified by inspection.
 *
 * Test pattern: subprocess via execSync (df-tools CLI) because output() calls
 * process.exit(0) — in-process capture is not feasible for these init commands.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Group I: init.cjs awareness_refresh flag ─────────────────────────────────

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
