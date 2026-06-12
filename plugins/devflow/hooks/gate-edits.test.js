/**
 * Tests for gate-edits PreToolUse hook — strict DENY mode
 *
 * Decision matrix:
 *
 *   shouldGate() — 11 core scenarios (pure function, unchanged)
 *   hasOverridePhrase() — phrase detection + null-safety (re-exports from shared lib)
 *   hasSkillActiveMarker() — 3 fs-interaction scenarios
 *   subprocess e2e — realistic PreToolUse payloads (no user_message/prompt keys)
 *   env var escape — 1 test
 *   export re-export shape — 1 test
 *
 * Payload contract (TRD 24-01, 24-RESEARCH.md finding 1):
 *   Real PreToolUse payloads carry ONLY: session_id, transcript_path, cwd,
 *   permission_mode, hook_event_name, tool_name, tool_input.
 *   user_message and prompt fields do NOT exist in the real harness payload.
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
// Realistic PreToolUse payload builder (locked contract from 24-RESEARCH.md)
// Has NO user_message and NO prompt keys — guards against regression.
// ---------------------------------------------------------------------------

function realPreToolUsePayload({ tool_name, file_path, cwd }) {
  return {
    session_id: 'test-session',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: cwd || '/tmp',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name,
    tool_input: { file_path },
  };
}

// Verify the payload helper itself has no user_message/prompt keys
test('realPreToolUsePayload has no user_message or prompt keys (contract guard)', () => {
  const payload = realPreToolUsePayload({ tool_name: 'Edit', file_path: '/tmp/a.ts', cwd: '/tmp' });
  assert.ok(!('user_message' in payload), 'payload must not contain user_message');
  assert.ok(!('prompt' in payload), 'payload must not contain prompt');
});

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
// Override phrase detection: hasOverridePhrase() — re-export from shared lib
// ---------------------------------------------------------------------------

describe('hasOverridePhrase — phrase detection (re-export from lib/edit-override.js)', () => {
  // Tests: each phrase detects case-insensitively
  for (const phrase of ['skip devflow', 'just edit', 'bypass devflow', 'force edit']) {
    test(`detects "${phrase}" (lowercase)`, () => {
      assert.equal(hasOverridePhrase(`Please ${phrase} the bug`), true);
    });

    test(`detects "${phrase.toUpperCase()}" (uppercase)`, () => {
      assert.equal(hasOverridePhrase(`Please ${phrase.toUpperCase()} the bug`), true);
    });

    test(`detects "${phrase}" (mixed case)`, () => {
      const mixed = phrase.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c).join('');
      assert.equal(hasOverridePhrase(`do this: ${mixed}`), true);
    });
  }

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
// Export shape test (test 11): gate-edits re-exports OVERRIDE_PHRASES and hasOverridePhrase
// ---------------------------------------------------------------------------

describe('gate-edits export re-export shape', () => {
  test('exports OVERRIDE_PHRASES (length 4) via re-export from shared lib', () => {
    assert.ok(Array.isArray(OVERRIDE_PHRASES));
    assert.equal(OVERRIDE_PHRASES.length, 4);
  });

  test('exports hasOverridePhrase that behaves identically to the shared lib', () => {
    assert.equal(typeof hasOverridePhrase, 'function');
    assert.equal(hasOverridePhrase('skip devflow'), true);
    assert.equal(hasOverridePhrase('not a phrase'), false);
    assert.equal(hasOverridePhrase(null), false);
  });
});

// ---------------------------------------------------------------------------
// Skill-active marker: hasSkillActiveMarker() — fs interaction
// ---------------------------------------------------------------------------

describe('hasSkillActiveMarker — fs interaction', () => {
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

  test('returns false when marker file absent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-no-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning'));
      assert.equal(hasSkillActiveMarker(path.join(tmp, '.planning')), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('returns false when planningDir is null', () => {
    assert.equal(hasSkillActiveMarker(null), false);
  });
});

// ---------------------------------------------------------------------------
// Subprocess e2e helpers
// ---------------------------------------------------------------------------

// Run the hook as a subprocess with given payload and env
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

// Create tmp dir with .planning/ (ambient DevFlow project)
function makeTmp(withSkillMarker = false) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-'));
  fs.mkdirSync(path.join(tmp, '.planning'));
  if (withSkillMarker) {
    fs.writeFileSync(path.join(tmp, '.planning', '.skill-active'), JSON.stringify({
      skill: 'build', started_at: new Date().toISOString(), pid: process.pid,
    }));
  }
  return tmp;
}

// ---------------------------------------------------------------------------
// Test 7: e2e DENY — ambient project, realistic Edit payload (no user_message/prompt), no marker
// ---------------------------------------------------------------------------

describe('subprocess e2e — DENY in ambient + no marker + realistic payload', () => {
  test('emits permissionDecision: deny with ambient mode reason (no user_message key)', () => {
    const tmp = makeTmp(false);
    try {
      const payload = realPreToolUsePayload({
        tool_name: 'Edit',
        file_path: path.join(tmp, 'src/foo.ts'),
        cwd: tmp,
      });
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

// ---------------------------------------------------------------------------
// Test 8: e2e ALLOW — ambient project + fresh .edit-override marker
// ---------------------------------------------------------------------------

describe('subprocess e2e — ALLOW with fresh .edit-override marker', () => {
  test('empty stdout AND marker file no longer exists after run', () => {
    const tmp = makeTmp(false);
    try {
      const markerPath = path.join(tmp, '.planning', '.edit-override');
      fs.writeFileSync(markerPath, JSON.stringify({ created_at: new Date().toISOString() }));
      const payload = realPreToolUsePayload({
        tool_name: 'Edit',
        file_path: path.join(tmp, 'src/foo.ts'),
        cwd: tmp,
      });
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout (allow via fresh marker)');
      assert.equal(fs.existsSync(markerPath), false, 'Marker should be consumed (deleted)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Test 9: e2e DENY — ambient project + stale .edit-override marker (10 min old, TTL 5 min)
// ---------------------------------------------------------------------------

describe('subprocess e2e — DENY with stale .edit-override marker', () => {
  test('deny output AND marker file deleted after run', () => {
    const tmp = makeTmp(false);
    try {
      const markerPath = path.join(tmp, '.planning', '.edit-override');
      fs.writeFileSync(markerPath, JSON.stringify({ created_at: new Date().toISOString() }));
      // Backdate mtime to 10 minutes ago (past 5-min TTL)
      const tenMinAgo = (Date.now() - 10 * 60 * 1000) / 1000;
      fs.utimesSync(markerPath, tenMinAgo, tenMinAgo);
      const payload = realPreToolUsePayload({
        tool_name: 'Edit',
        file_path: path.join(tmp, 'src/foo.ts'),
        cwd: tmp,
      });
      const { result } = runHook(payload, { cwd: tmp });
      assert.ok(result.stdout.length > 0, 'Expected JSON output (DENY for stale marker)');
      const out = JSON.parse(result.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      assert.equal(fs.existsSync(markerPath), false, 'Stale marker should also be deleted');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Test 10: e2e regression — all other escape hatches still work (realistic payloads)
// ---------------------------------------------------------------------------

describe('subprocess e2e — ALLOW with skill-active marker (realistic payload)', () => {
  test('no stdout when skill-active marker present', () => {
    const tmp = makeTmp(true);
    try {
      const payload = realPreToolUsePayload({
        tool_name: 'Edit',
        file_path: path.join(tmp, 'src/foo.ts'),
        cwd: tmp,
      });
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout (allow via skill-active)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — non-ambient (no .planning) NOOP (realistic payload)', () => {
  test('empty stdout when no .planning dir (non-DevFlow project)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-noplan-'));
    try {
      const payload = realPreToolUsePayload({
        tool_name: 'Edit',
        file_path: path.join(tmp, 'src/foo.ts'),
        cwd: tmp,
      });
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout (no .planning = no-op)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — Read tool NOOP (realistic payload)', () => {
  test('empty stdout for Read tool in ambient project', () => {
    const tmp = makeTmp(false);
    try {
      const payload = realPreToolUsePayload({
        tool_name: 'Read',
        file_path: path.join(tmp, 'src/foo.ts'),
        cwd: tmp,
      });
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout for Read tool');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — .md path allowed (realistic payload)', () => {
  test('empty stdout when editing a .md file', () => {
    const tmp = makeTmp(false);
    try {
      const payload = realPreToolUsePayload({
        tool_name: 'Edit',
        file_path: path.join(tmp, 'README.md'),
        cwd: tmp,
      });
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout for .md file');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — .planning path allowed (realistic payload)', () => {
  test('empty stdout when editing a .planning/** path', () => {
    const tmp = makeTmp(false);
    try {
      const payload = realPreToolUsePayload({
        tool_name: 'Edit',
        file_path: path.join(tmp, '.planning', 'STATE.md'),
        cwd: tmp,
      });
      const { result } = runHook(payload, { cwd: tmp });
      assert.equal(result.stdout, '', 'Expected empty stdout for .planning/ path');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('env var escape hatch', () => {
  test('DEVFLOW_SKIP_EDIT_GATE=1 disables gate even in ambient mode without marker', () => {
    const tmp = makeTmp(false);
    try {
      const payload = realPreToolUsePayload({
        tool_name: 'Edit',
        file_path: path.join(tmp, 'src/foo.ts'),
        cwd: tmp,
      });
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
