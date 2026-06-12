'use strict';

/**
 * Tests for gate-commits.js PreToolUse hook
 *
 * TDD suite for TRD 23-02 (gate-commits initialization fix):
 * - Bare .planning/ (no ROADMAP.md, no objectives/, no STATE.md) → pass through
 * - .planning/ROADMAP.md present, STATE.md absent → DENY (bypass fix)
 * - .planning/objectives/ dir present, no ROADMAP.md, no STATE.md → DENY
 * - DevFlow-initialized project + DEVFLOW_ALLOW_RAW_COMMIT=1 → pass through
 * - DevFlow-initialized project + df-tools wrapper command → pass through
 * - DevFlow-initialized project + non-commit command → pass through
 * - tool_name !== "Bash" → pass through
 * - No .planning/ anywhere up the tree → pass through
 *
 * Harness: subprocess spawn with JSON piped to stdin, tmp project dirs hand-built.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-commits.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTmpProject(setup) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-commits-')));
  if (setup) setup(root);
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function runHook(payload, cwd, extraEnv = {}) {
  const env = {
    ...process.env,
    DEVFLOW_ALLOW_RAW_COMMIT: undefined,
    ...extraEnv,
  };
  // Remove undefined entries (to actually unset)
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete env[k];
  }
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env,
  });
}

const GIT_COMMIT_PAYLOAD = {
  tool_name: 'Bash',
  tool_input: { command: 'git commit -m "x"' },
};

function isDeny(stdout) {
  if (!stdout || stdout.trim() === '') return false;
  try {
    const parsed = JSON.parse(stdout);
    return parsed.hookSpecificOutput &&
      parsed.hookSpecificOutput.permissionDecision === 'deny';
  } catch {
    return false;
  }
}

function isPassThrough(stdout) {
  return !stdout || stdout.trim() === '';
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('gate-commits — initialization gating', () => {

  // Case 1: Bare .planning/ — no ROADMAP.md, no objectives/, no STATE.md → pass through
  test('case 1: bare .planning/ (no ROADMAP.md, no objectives/, no STATE.md) → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    });
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through (empty stdout), got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 2: .planning/ROADMAP.md present, STATE.md absent → DENY (this was the bypass bug)
  test('case 2: .planning/ROADMAP.md present, no STATE.md → deny (bypass fix)', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
    });
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isDeny(result.stdout),
        `expected deny JSON, got: ${result.stdout || '(empty)'}`);
    } finally {
      cleanup();
    }
  });

  // Case 3: .planning/objectives/ dir present, no ROADMAP.md, no STATE.md → DENY
  test('case 3: .planning/objectives/ dir present, no ROADMAP.md, no STATE.md → deny', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning', 'objectives'), { recursive: true });
    });
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isDeny(result.stdout),
        `expected deny JSON, got: ${result.stdout || '(empty)'}`);
    } finally {
      cleanup();
    }
  });

  // Case 4: DevFlow-initialized project + DEVFLOW_ALLOW_RAW_COMMIT=1 → pass through
  test('case 4: DevFlow-initialized project + DEVFLOW_ALLOW_RAW_COMMIT=1 → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# State\n');
    });
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root, { DEVFLOW_ALLOW_RAW_COMMIT: '1' });
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through with escape hatch, got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 5: DevFlow-initialized project + df-tools wrapper command → pass through
  test('case 5: DevFlow-initialized project + df-tools.cjs commit command → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# State\n');
    });
    try {
      const payload = {
        tool_name: 'Bash',
        tool_input: { command: 'node ~/.claude/devflow/bin/df-tools.cjs commit "test(23-02): example"' },
      };
      const result = runHook(payload, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through for df-tools wrapper, got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 6: DevFlow-initialized project + non-commit command → pass through
  test('case 6: DevFlow-initialized project + git status → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# State\n');
    });
    try {
      const payload = {
        tool_name: 'Bash',
        tool_input: { command: 'git status' },
      };
      const result = runHook(payload, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through for non-commit command, got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 7: tool_name !== "Bash" → pass through
  test('case 7: tool_name !== "Bash" → pass through', () => {
    const { root, cleanup } = mkTmpProject(root => {
      fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# Roadmap\n');
      fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# State\n');
    });
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { command: 'git commit -m "x"' },
      };
      const result = runHook(payload, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through for non-Bash tool, got: ${result.stdout}`);
    } finally {
      cleanup();
    }
  });

  // Case 8: No .planning/ anywhere up the tree → pass through
  test('case 8: no .planning/ anywhere up the tree → pass through', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-commits-noplan-')));
    try {
      const result = runHook(GIT_COMMIT_PAYLOAD, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(isPassThrough(result.stdout),
        `expected pass-through when no .planning/ exists, got: ${result.stdout}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

});
