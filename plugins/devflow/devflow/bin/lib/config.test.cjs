'use strict';

const { describe, test, afterEach, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadConfig } = require('./config.cjs');
const { buildPlanningDirWithConfig } = require('./__fixtures__/autonomous-fixtures.cjs');

let tmpdir;

afterEach(() => {
  if (tmpdir && fs.existsSync(tmpdir)) {
    fs.rmSync(tmpdir, { recursive: true, force: true });
    tmpdir = null;
  }
});

describe('loadConfig', () => {

  // Case 1: mode "autonomous" → autonomous:true + derived workflow flags true
  test('1. mode autonomous → autonomous:true, verifier_checkpoints:true, decision_queue:true', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { mode: 'autonomous' });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'autonomous');
    assert.strictEqual(cfg.autonomous, true);
    assert.strictEqual(cfg.verifier_checkpoints, true);
    assert.strictEqual(cfg.decision_queue, true);
  });

  // Case 2: mode "yolo" → autonomous:false + workflow flags false
  test('2. mode yolo → autonomous:false, verifier_checkpoints:false, decision_queue:false', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { mode: 'yolo' });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, false);
  });

  // Case 3: mode "interactive" → autonomous:false
  test('3. mode interactive → autonomous:false', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { mode: 'interactive' });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'interactive');
    assert.strictEqual(cfg.autonomous, false);
  });

  // Case 4: missing config.json → defaults (mode yolo, autonomous false)
  test('4. missing config.json → defaults (mode:yolo, autonomous:false)', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, null);
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, false);
  });

  // Case 5: nested form { workflow: { mode: "autonomous" } } → autonomous:true
  test('5. nested workflow.mode autonomous → autonomous:true', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, { workflow: { mode: 'autonomous' } });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.mode, 'autonomous');
    assert.strictEqual(cfg.autonomous, true);
    assert.strictEqual(cfg.verifier_checkpoints, true);
    assert.strictEqual(cfg.decision_queue, true);
  });

  // Case 6: explicit override: mode autonomous + workflow.verifier_checkpoints:false → false
  test('6. autonomous mode with explicit verifier_checkpoints:false → verifier_checkpoints:false', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, {
      mode: 'autonomous',
      workflow: { verifier_checkpoints: false },
    });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.autonomous, true);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, true);
  });

  // Case 7: explicit opt-in outside autonomous: mode yolo + workflow.decision_queue:true → true
  test('7. yolo mode with explicit decision_queue:true → decision_queue:true', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, {
      mode: 'yolo',
      workflow: { decision_queue: true },
    });
    const cfg = loadConfig(tmpdir);
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.decision_queue, true);
  });

  // Case 8: malformed JSON → defaults returned, no throw
  test('8. malformed JSON config → defaults returned, no throw', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, '{ this is not json }');
    let cfg;
    assert.doesNotThrow(() => { cfg = loadConfig(tmpdir); });
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, false);
  });

  // Case 9: back-compat — all pre-existing loadConfig keys still present and unchanged for yolo config
  test('9. back-compat: all pre-existing keys present for yolo config', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
    buildPlanningDirWithConfig(tmpdir, {
      mode: 'yolo',
      auto_advance: true,
      model_profile: 'quality',
      commit_docs: false,
      require_verification: false,
      require_tests: false,
      search_gitignored: true,
      branching_strategy: 'none',
      parallelization: true,
      brave_search: false,
    });
    const cfg = loadConfig(tmpdir);
    // New keys present
    assert.strictEqual(cfg.autonomous, false);
    assert.strictEqual(cfg.verifier_checkpoints, false);
    assert.strictEqual(cfg.decision_queue, false);
    // All pre-existing keys intact
    assert.strictEqual(cfg.mode, 'yolo');
    assert.strictEqual(cfg.auto_advance, true);
    assert.strictEqual(cfg.model_profile, 'quality');
    assert.strictEqual(cfg.commit_docs, false);
    assert.strictEqual(cfg.require_verification, false);
    assert.strictEqual(cfg.require_tests, false);
    assert.strictEqual(cfg.search_gitignored, true);
    assert.strictEqual(cfg.branching_strategy, 'none');
    assert.strictEqual(cfg.parallelization, true);
    assert.strictEqual(cfg.brave_search, false);
    // Shape completeness — keys not absent
    assert.ok('research' in cfg);
    assert.ok('job_checker' in cfg);
    assert.ok('verifier' in cfg);
  });

});
