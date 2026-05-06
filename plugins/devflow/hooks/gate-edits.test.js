/**
 * Tests for gate-edits PreToolUse hook — strict DENY mode
 *
 * Decision matrix (24 tests):
 *
 *   shouldGate() — 8 core scenarios
 *   hasOverridePhrase() — 8 override-phrase + null-safety scenarios
 *   hasSkillActiveMarker() — 3 fs-interaction scenarios
 *   subprocess e2e — 8 scenarios (DENY + ALLOW + edge-cases)
 *   env var escape — 1 test
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-edits.js');
const {
  shouldGate,
  hasSkillActiveMarker,
  hasOverridePhrase,
  OVERRIDE_PHRASES,
} = require('./gate-edits.js');

// ---------------------------------------------------------------------------
// Decision matrix: shouldGate()
// ---------------------------------------------------------------------------

describe('shouldGate decision matrix', () => {
  const base = {
    tool: 'Edit',
    filePath: '/proj/src/foo.ts',
    planningDir: '/proj/.planning',
    skillActive: false,
    overrideActive: false,
  };

  // Test 1
  test('DENY: ambient + Edit + no marker + no override + non-planning + non-md path', () => {
    const result = shouldGate(base);
    assert.equal(result.decision, 'deny');
    assert.match(result.reason, /ambient mode/i);
  });

  // Test 2
  test('ALLOW: ambient + Edit + skill-active marker (regardless of override)', () => {
    const result = shouldGate({ ...base, skillActive: true });
    assert.equal(result.decision, 'allow');
    assert.match(result.reason, /skill-active/i);
  });

  // Test 3
  test('ALLOW: ambient + Edit + override phrase (regardless of marker)', () => {
    const result = shouldGate({ ...base, overrideActive: true });
    assert.equal(result.decision, 'allow');
    assert.match(result.reason, /override/i);
  });

  // Test 4
  test('ALLOW: any path matching /.planning/ (planning artifact override)', () => {
    const result = shouldGate({ ...base, filePath: '/proj/.planning/STATE.md' });
    assert.equal(result.decision, 'allow');
    assert.match(result.reason, /planning artifact/i);
  });

  // Test 5
  test('ALLOW: any path matching .md$ (docs override)', () => {
    const result = shouldGate({ ...base, filePath: '/proj/README.md' });
    assert.equal(result.decision, 'allow');
    assert.match(result.reason, /markdown doc/i);
  });

  // Test 6
  test('NOOP: planningDir null (non-DevFlow project)', () => {
    const result = shouldGate({ ...base, planningDir: null });
    assert.equal(result.decision, 'noop');
  });

  // Test 7
  test('NOOP: non-modifying tools (Read, Grep, Glob, Bash) are never gated', () => {
    for (const tool of ['Read', 'Grep', 'Glob', 'Bash', 'LS']) {
      const result = shouldGate({ ...base, tool });
      assert.equal(result.decision, 'noop', `Expected noop for tool=${tool}`);
    }
  });

  // Test 8
  test('NOOP: empty filePath', () => {
    const result = shouldGate({ ...base, filePath: '' });
    assert.equal(result.decision, 'noop');
  });

  // Additional: Write and MultiEdit also gated
  test('DENY: Write tool in ambient mode', () => {
    assert.equal(shouldGate({ ...base, tool: 'Write' }).decision, 'deny');
  });

  test('DENY: MultiEdit tool in ambient mode', () => {
    assert.equal(shouldGate({ ...base, tool: 'MultiEdit' }).decision, 'deny');
  });

  // ALLOW: both skill-active AND override active
  test('ALLOW: both skillActive and overrideActive → allow (skill-active wins)', () => {
    const result = shouldGate({ ...base, skillActive: true, overrideActive: true });
    assert.equal(result.decision, 'allow');
  });
});

// ---------------------------------------------------------------------------
// Override phrase detection: hasOverridePhrase()
// ---------------------------------------------------------------------------

describe('hasOverridePhrase — phrase detection', () => {
  // Tests 9-12: each phrase detects case-insensitively
  for (const phrase of ['skip devflow', 'just edit', 'bypass devflow', 'force edit']) {
    // Test 9: lowercase
    test(`detects "${phrase}" (lowercase)`, () => {
      assert.equal(hasOverridePhrase(`Please ${phrase} the bug`), true);
    });

    // Test 10: uppercase
    test(`detects "${phrase.toUpperCase()}" (uppercase)`, () => {
      assert.equal(hasOverridePhrase(`Please ${phrase.toUpperCase()} the bug`), true);
    });

    // Test 11: mixed case
    test(`detects "${phrase}" (mixed case)`, () => {
      const mixed = phrase.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c).join('');
      assert.equal(hasOverridePhrase(`do this: ${mixed}`), true);
    });
  }

  // Test 13: null safety
  test('returns false for null', () => {
    assert.equal(hasOverridePhrase(null), false);
  });

  test('returns false for undefined', () => {
    assert.equal(hasOverridePhrase(undefined), false);
  });

  test('returns false for empty string', () => {
    assert.equal(hasOverridePhrase(''), false);
  });

  test('returns false for non-matching string', () => {
    assert.equal(hasOverridePhrase('Fix the login bug'), false);
    assert.equal(hasOverridePhrase('edit this file for me'), false);
    assert.equal(hasOverridePhrase('skip this check'), false);
  });

  test('OVERRIDE_PHRASES array contains all 4 phrases', () => {
    assert.equal(Array.isArray(OVERRIDE_PHRASES), true);
    assert.equal(OVERRIDE_PHRASES.length, 4);
    assert.ok(OVERRIDE_PHRASES.includes('skip devflow'));
    assert.ok(OVERRIDE_PHRASES.includes('just edit'));
    assert.ok(OVERRIDE_PHRASES.includes('bypass devflow'));
    assert.ok(OVERRIDE_PHRASES.includes('force edit'));
  });
});

// ---------------------------------------------------------------------------
// Skill-active marker: hasSkillActiveMarker() — fs interaction
// ---------------------------------------------------------------------------

describe('hasSkillActiveMarker — fs interaction', () => {
  // Test 14
  test('returns true when .skill-active file exists', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning'));
      fs.writeFileSync(path.join(tmp, '.planning', '.skill-active'), JSON.stringify({
        skill: 'build',
        started_at: new Date().toISOString(),
        pid: process.pid,
      }));
      assert.equal(hasSkillActiveMarker(path.join(tmp, '.planning')), true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 15
  test('returns false when marker file absent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-no-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning'));
      assert.equal(hasSkillActiveMarker(path.join(tmp, '.planning')), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 16
  test('returns false when planningDir is null', () => {
    assert.equal(hasSkillActiveMarker(null), false);
  });
});

// ---------------------------------------------------------------------------
// Subprocess e2e: JSON-stdin → JSON-stdout contract
// ---------------------------------------------------------------------------

// Helper: run the hook as a subprocess with given payload and env
function runHook(payload, { cwd, extraEnv = {} } = {}) {
  const tmp = cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-e2e-'));
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    cwd: tmp,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      DEVFLOW_SKIP_EDIT_GATE: undefined, // ensure gate is active unless overridden
      ...extraEnv,
    },
  });
  return { tmp, result };
}

// Helper: create tmp dir with .planning/ (ambient DevFlow project)
function makeTmp(withMarker = false) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-'));
  fs.mkdirSync(path.join(tmp, '.planning'));
  if (withMarker) {
    fs.writeFileSync(path.join(tmp, '.planning', '.skill-active'), JSON.stringify({
      skill: 'build', started_at: new Date().toISOString(), pid: process.pid,
    }));
  }
  return tmp;
}

describe('subprocess e2e — DENY in ambient + no marker + no override', () => {
  // Test 17
  test('emits permissionDecision: deny with ambient mode reason', () => {
    const tmp = makeTmp(false);
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'Edit foo.ts please',
      };
      const { result } = runHook(payload, { cwd: tmp });
      assert.ok(result.stdout.length > 0, 'Expected JSON output (DENY)');
      const out = JSON.parse(result.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /ambient mode/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — ALLOW with skill-active marker', () => {
  // Test 18
  test('no stdout when skill-active marker present', () => {
    const tmp = makeTmp(true);
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'Edit foo.ts please',
      };
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout (allow via no-op)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — ALLOW with override phrase in user_message', () => {
  // Test 19
  test('no stdout when user_message contains override phrase', () => {
    const tmp = makeTmp(false);
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'skip devflow and just fix this',
      };
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout (override phrase allows)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('no stdout when prompt field contains override phrase (fallback field)', () => {
    const tmp = makeTmp(false);
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        prompt: 'just edit it',
      };
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout (prompt field fallback)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — non-ambient (no .planning) NOOP', () => {
  // Test 20
  test('empty stdout when no .planning dir (non-DevFlow project)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-noplan-'));
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'Edit foo.ts please',
      };
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout (no .planning = no-op)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — Read tool NOOP', () => {
  // Test 21
  test('empty stdout for Read tool in ambient project', () => {
    const tmp = makeTmp(false);
    try {
      const payload = {
        tool_name: 'Read',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'Read foo.ts',
      };
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout for Read tool');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — .md path allowed', () => {
  // Test 22
  test('empty stdout when editing a .md file', () => {
    const tmp = makeTmp(false);
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'README.md') },
        user_message: 'Fix the README',
      };
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout for .md file');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — .planning path allowed', () => {
  // Test 23
  test('empty stdout when editing a .planning/** path', () => {
    const tmp = makeTmp(false);
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, '.planning', 'STATE.md') },
        user_message: 'Update planning state',
      };
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout for .planning/ path');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('env var escape hatch', () => {
  // Test 24
  test('DEVFLOW_SKIP_EDIT_GATE=1 disables gate even in ambient mode without marker', () => {
    const tmp = makeTmp(false);
    try {
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'Edit foo.ts please',
      };
      const { result } = runHook(payload, {
        cwd: tmp,
        extraEnv: { DEVFLOW_SKIP_EDIT_GATE: '1' },
      });
      assert.equal(result.stdout, '', 'Expected empty stdout when escape hatch is active');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
