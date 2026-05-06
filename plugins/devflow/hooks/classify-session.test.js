'use strict';

/**
 * classify-session.test.js — Tests for classify-session.js SessionStart hook
 *
 * Test structure (outside-in per TDD playbook habit 5):
 *   1. Subprocess integration tests — full hook end-to-end (5 acceptance scenarios)
 *   2. Pure function unit tests — findPlanningDir, findGitDir, hasDeclineMarker
 *   3. hooks.json registration tests
 *
 * Framework: node:test + node:assert/strict
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'classify-session.js');
const HOOKS_JSON_PATH = path.join(__dirname, 'hooks.json');

// Load fixtures from lib/__fixtures__
const {
  mkAmbientTmpProject,
  mkInitOfferTmpProject,
  mkScratchDir,
  mkDeclineMarkerProject,
} = require('../devflow/bin/lib/__fixtures__/classifier-fixtures.cjs');

// ─── Helper: run hook as subprocess ──────────────────────────────────────────

/**
 * Run classify-session.js as a subprocess in the given cwd.
 * Clears DEVFLOW_SKIP_CLASSIFY from env by default (pass envOverride to override).
 */
function runHook(cwd, envOverride = {}) {
  const env = { ...process.env, ...envOverride };
  delete env.DEVFLOW_SKIP_CLASSIFY; // clear inherited env for clean tests
  if ('DEVFLOW_SKIP_CLASSIFY' in envOverride) {
    env.DEVFLOW_SKIP_CLASSIFY = envOverride.DEVFLOW_SKIP_CLASSIFY;
  }

  return spawnSync('node', [HOOK_PATH], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
}

// ─── Subprocess integration tests (outside-in, 5 acceptance scenarios) ───────

describe('classify-session subprocess — 5 acceptance scenarios (#26)', () => {
  test('scenario 6: ambient project → JSON with DEVFLOW PROJECT DETECTED in additionalContext', () => {
    const root = mkAmbientTmpProject();
    try {
      const result = runHook(root);
      assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
      assert.ok(result.stdout.length > 0, 'Expected non-empty stdout for ambient project');

      let parsed;
      assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); }, 'stdout must be valid JSON');

      const hookOut = parsed.hookSpecificOutput;
      assert.ok(hookOut, 'must have hookSpecificOutput');
      assert.equal(hookOut.hookEventName, 'SessionStart');
      assert.ok(hookOut.additionalContext, 'must have additionalContext');
      assert.ok(
        hookOut.additionalContext.includes('DEVFLOW PROJECT DETECTED'),
        `additionalContext must contain DEVFLOW PROJECT DETECTED. Got: ${hookOut.additionalContext.slice(0, 100)}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('scenario 7: init-offer-eligible (git, no planning) → JSON with INIT OFFER in additionalContext', () => {
    const root = mkInitOfferTmpProject();
    try {
      const result = runHook(root);
      assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
      assert.ok(result.stdout.length > 0, 'Expected non-empty stdout for init-offer project');

      let parsed;
      assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); }, 'stdout must be valid JSON');

      const hookOut = parsed.hookSpecificOutput;
      assert.ok(hookOut, 'must have hookSpecificOutput');
      assert.equal(hookOut.hookEventName, 'SessionStart');
      assert.ok(
        hookOut.additionalContext.includes('INIT OFFER'),
        `additionalContext must contain INIT OFFER. Got: ${hookOut.additionalContext.slice(0, 100)}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('scenario 8: scratch dir (no planning, no git) → empty stdout (skip mode, exit 0)', () => {
    const root = mkScratchDir();
    try {
      const result = runHook(root);
      assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
      assert.equal(result.stdout, '', 'Expected empty stdout for scratch dir (skip mode)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('scenario 9: no-git dir (bare tmpdir without git or planning) → empty stdout (skip mode, exit 0)', () => {
    // mkScratchDir creates a dir without .git or .planning — same as no-git dir
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-nogit-'));
    try {
      const result = runHook(root);
      assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
      assert.equal(result.stdout, '', 'Expected empty stdout for no-git dir (skip mode)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('scenario 10: decline-marker present → empty stdout (skip mode despite planningDir)', () => {
    const root = mkDeclineMarkerProject();
    try {
      const result = runHook(root);
      assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
      assert.equal(result.stdout, '', 'Expected empty stdout when decline marker present');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── Env var test ─────────────────────────────────────────────────────────────

describe('classify-session env var override', () => {
  test('scenario 11: DEVFLOW_SKIP_CLASSIFY=1 → empty stdout even for ambient project', () => {
    const root = mkAmbientTmpProject();
    try {
      const result = runHook(root, { DEVFLOW_SKIP_CLASSIFY: '1' });
      assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
      assert.equal(result.stdout, '', 'Expected empty stdout when DEVFLOW_SKIP_CLASSIFY=1');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── JSON shape test ──────────────────────────────────────────────────────────

describe('classify-session JSON output shape', () => {
  test('scenario 12: non-empty stdout parses as valid JSON with documented shape', () => {
    const root = mkAmbientTmpProject();
    try {
      const result = runHook(root);
      assert.ok(result.stdout.length > 0, 'ambient project must produce output');

      let parsed;
      assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); }, 'stdout must be valid JSON');
      assert.ok(parsed.hookSpecificOutput, 'must have hookSpecificOutput');
      assert.equal(typeof parsed.hookSpecificOutput.hookEventName, 'string');
      assert.equal(typeof parsed.hookSpecificOutput.additionalContext, 'string');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── Pure function unit tests ─────────────────────────────────────────────────

describe('findPlanningDir', () => {
  // Require after hook exists (GREEN phase — will fail in RED if hook doesn't exist)
  const hook = require('./classify-session.js');

  test('case 1: walks up from start dir and returns first ancestor containing .planning/', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'find-plan-'));
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    const child = path.join(root, 'src', 'deep', 'dir');
    fs.mkdirSync(child, { recursive: true });
    try {
      assert.equal(hook.findPlanningDir(child), path.join(root, '.planning'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('case 2: returns null when no .planning/ found walking up to filesystem root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-plan-'));
    try {
      assert.equal(hook.findPlanningDir(root), null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('findGitDir', () => {
  const hook = require('./classify-session.js');

  test('case 3: walks up from start dir and finds first ancestor with .git/', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'find-git-'));
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    const child = path.join(root, 'src', 'module');
    fs.mkdirSync(child, { recursive: true });
    try {
      assert.equal(hook.findGitDir(child), path.join(root, '.git'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('hasDeclineMarker', () => {
  const hook = require('./classify-session.js');

  test('case 4: returns true when .planning/.devflow-init-declined exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'decline-'));
    const planningDir = path.join(root, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.devflow-init-declined'), '');
    try {
      assert.equal(hook.hasDeclineMarker(planningDir), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('case 5a: returns false when planningDir is null', () => {
    assert.equal(hook.hasDeclineMarker(null), false);
  });

  test('case 5b: returns false when .devflow-init-declined marker is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-decline-'));
    const planningDir = path.join(root, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    try {
      assert.equal(hook.hasDeclineMarker(planningDir), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── hooks.json registration tests ───────────────────────────────────────────

describe('hooks.json registration', () => {
  let hookData;

  test('case 13: hooks.json parses as valid JSON after classify-session registration', () => {
    const raw = fs.readFileSync(HOOKS_JSON_PATH, 'utf-8');
    assert.doesNotThrow(() => { hookData = JSON.parse(raw); }, 'hooks.json must be valid JSON');
  });

  test('case 14: SessionStart array has 3 entries (was 2, added classify-session)', () => {
    const raw = fs.readFileSync(HOOKS_JSON_PATH, 'utf-8');
    hookData = JSON.parse(raw);
    const ss = hookData.hooks.SessionStart;
    assert.equal(ss.length, 3, `SessionStart should have 3 entries, got ${ss.length}`);
  });

  test('case 15: last SessionStart entry command contains classify-session.js', () => {
    const raw = fs.readFileSync(HOOKS_JSON_PATH, 'utf-8');
    hookData = JSON.parse(raw);
    const ss = hookData.hooks.SessionStart;
    const lastCmd = ss[ss.length - 1].hooks[0].command;
    assert.ok(
      lastCmd.includes('classify-session.js'),
      `Last SessionStart command must include classify-session.js, got: ${lastCmd}`
    );
  });

  test('case 16: classify-session entry comes AFTER sync-runtime entry (index > sync-runtime index)', () => {
    const raw = fs.readFileSync(HOOKS_JSON_PATH, 'utf-8');
    hookData = JSON.parse(raw);
    const ss = hookData.hooks.SessionStart;

    const syncIdx = ss.findIndex(e => e.hooks[0].command.includes('sync-runtime'));
    const classifyIdx = ss.findIndex(e => e.hooks[0].command.includes('classify-session'));

    assert.ok(syncIdx >= 0, 'sync-runtime must be in SessionStart');
    assert.ok(classifyIdx >= 0, 'classify-session.js must be in SessionStart');
    assert.ok(
      classifyIdx > syncIdx,
      `classify-session (idx ${classifyIdx}) must come AFTER sync-runtime (idx ${syncIdx})`
    );
  });
});
