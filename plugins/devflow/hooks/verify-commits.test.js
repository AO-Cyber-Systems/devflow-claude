/**
 * Tests for verify-commits.js SubagentStop hook (TRD 10-06).
 *
 * Covers:
 *   - Subprocess integration (spawnSync, cwd = fixture project, stdin = payload)
 *     Test 1: autonomous + mid-execution + no recent commits + no marker → block JSON + marker created
 *     Test 2: same agent_id + marker exists → no block (retry already used)
 *     Test 3: different agent_id, no marker for it → blocks independently
 *     Test 4: mode yolo + no commits + mid-execution → stderr warning only, no stdout JSON
 *     Test 5: autonomous + recent commits exist → no block, no warning
 *     Test 6: autonomous + STATE.md not mid-execution → no block
 *     Test 7: non-DevFlow dir → silent no-op
 *     Test 8: payload missing agent_id → falls back to 'unknown' key, still bounded once
 *     Test 9: git unavailable / not a repo in fixture → silent no-op
 *   - Helpers (in-process)
 *     Test 10: retryMarkerPath sanitizes agentId (path traversal chars stripped)
 *     Test 11: cleanStaleMarkers removes markers older than 1 hour, keeps fresh ones
 *     Test 12: isAutonomousMode / isMidExecution behave correctly
 */

'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'verify-commits.js');

// ─── Import exported helpers (will fail until verify-commits.js exports them) ─
const {
  findPlanningDir,
  hasRecentCommits,
  isMidExecution,
  isAutonomousMode,
  retryMarkerPath,
  cleanStaleMarkers,
} = require('./verify-commits.js');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Create a tmp DevFlow project fixture.
 *
 * @param {object} opts
 * @param {string} [opts.mode]              config.json mode ('autonomous'|'yolo')
 * @param {boolean} [opts.midExecution]     include 'Executing' in STATE.md
 * @param {boolean} [opts.initGit]          git init the fixture
 * @param {boolean} [opts.recentCommit]     add a commit dated "now" (requires initGit)
 * @param {boolean} [opts.staleCommit]      add a commit dated 20 min ago (no recent commits effect)
 */
function makeFixture(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-test-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  // Write config.json
  const mode = opts.mode || 'autonomous';
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify({ mode }),
    'utf8',
  );

  // Write STATE.md
  const stateContent = opts.midExecution
    ? '# State\n\nStatus: Executing objective 10\n'
    : '# State\n\nStatus: Idle\n';
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent, 'utf8');

  // Optionally set up git
  if (opts.initGit) {
    execSync('git init -q', { cwd: tmp });
    execSync('git config user.email "test@test.com"', { cwd: tmp });
    execSync('git config user.name "Test"', { cwd: tmp });

    if (opts.recentCommit) {
      fs.writeFileSync(path.join(tmp, 'test.txt'), 'hello', 'utf8');
      execSync('git add test.txt', { cwd: tmp });
      execSync('git commit -m "recent commit"', { cwd: tmp });
    } else if (opts.staleCommit) {
      // Commit dated 20 minutes ago — outside the 10-minute window
      const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      fs.writeFileSync(path.join(tmp, 'test.txt'), 'hello', 'utf8');
      execSync('git add test.txt', { cwd: tmp });
      execSync('git commit -m "old commit"', {
        cwd: tmp,
        env: { ...process.env, GIT_AUTHOR_DATE: oldDate, GIT_COMMITTER_DATE: oldDate },
      });
    }
  }

  return tmp;
}

/**
 * Run the hook subprocess with given fixture dir and payload.
 */
function runHook(cwd, payload = {}) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 10000,
  });
}

function cleanup(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// ─── Subprocess integration tests ─────────────────────────────────────────────

describe('verify-commits subprocess — SubagentStop retry-once', () => {
  test('Test 1: autonomous + mid-execution + no recent commits + no marker → block JSON + marker created', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      const planningDir = path.join(tmp, '.planning');
      const payload = { agent_id: 'agent-abc-1' };
      const result = runHook(tmp, payload);

      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(result.stdout.trim().length > 0, 'expected stdout JSON for block');

      let parsed;
      assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); }, 'stdout must be valid JSON');
      assert.ok(parsed.hookSpecificOutput, 'must have hookSpecificOutput wrapper');
      assert.equal(parsed.hookSpecificOutput.hookEventName, 'SubagentStop');
      assert.equal(parsed.hookSpecificOutput.decision, 'block');
      assert.match(parsed.hookSpecificOutput.reason, /no commits/i);

      // Marker file must be created
      const marker = path.join(planningDir, '.autonomous-retry-agent-abc-1');
      assert.ok(fs.existsSync(marker), 'retry marker file must be created');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 2: same agent_id + marker exists → no block JSON (retry already used)', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      const planningDir = path.join(tmp, '.planning');
      const payload = { agent_id: 'agent-abc-2' };

      // Pre-create the marker (simulating first retry already consumed)
      fs.writeFileSync(
        path.join(planningDir, '.autonomous-retry-agent-abc-2'),
        String(Date.now()),
        'utf8',
      );

      const result = runHook(tmp, payload);
      assert.equal(result.status, 0);
      // No block JSON on second invocation for same agent
      assert.equal(result.stdout.trim(), '', 'second stop must not produce block JSON');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 3: different agent_id, no marker for it → blocks independently', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      const planningDir = path.join(tmp, '.planning');

      // Marker exists for agent-X but NOT for agent-Y
      fs.writeFileSync(
        path.join(planningDir, '.autonomous-retry-agent-X'),
        String(Date.now()),
        'utf8',
      );

      const payload = { agent_id: 'agent-Y' };
      const result = runHook(tmp, payload);
      assert.equal(result.status, 0);
      assert.ok(result.stdout.trim().length > 0, 'agent-Y should still be blocked (no marker for it)');

      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.hookSpecificOutput.decision, 'block');

      // Marker for agent-Y should now exist
      assert.ok(fs.existsSync(path.join(planningDir, '.autonomous-retry-agent-Y')));
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 4: mode yolo + no commits + mid-execution → stderr warning only, no stdout JSON', () => {
    const tmp = makeFixture({ mode: 'yolo', midExecution: true, initGit: true });
    try {
      const result = runHook(tmp, { agent_id: 'agent-yolo' });
      assert.equal(result.status, 0);
      // No block JSON
      assert.equal(result.stdout.trim(), '', 'yolo mode must not produce stdout JSON');
      // Should have warning on stderr
      assert.match(result.stderr, /no git commits/i, 'yolo mode must produce stderr warning');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 5: autonomous + recent commits exist → no block, no warning', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true, recentCommit: true });
    try {
      const result = runHook(tmp, { agent_id: 'agent-happy' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), '', 'no block when recent commits exist');
      assert.equal(result.stderr.trim(), '', 'no warning when recent commits exist');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 6: autonomous + STATE.md not mid-execution → no block', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: false, initGit: true });
    try {
      const result = runHook(tmp, { agent_id: 'agent-idle' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), '', 'no block when not mid-execution');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 7: non-DevFlow dir → silent no-op', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-nodf-'));
    try {
      const result = runHook(tmp, { agent_id: 'agent-nobody' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), '', 'must be silent outside DevFlow project');
      assert.equal(result.stderr.trim(), '', 'no stderr outside DevFlow project');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 8: payload missing agent_id → falls back to "unknown" key, still bounded once', () => {
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: true });
    try {
      const planningDir = path.join(tmp, '.planning');
      // First call without agent_id → should block and create .autonomous-retry-unknown
      const result = runHook(tmp, {});
      assert.equal(result.status, 0);
      assert.ok(result.stdout.trim().length > 0, 'should block on first call without agent_id');

      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.hookSpecificOutput.decision, 'block');

      const unknownMarker = path.join(planningDir, '.autonomous-retry-unknown');
      assert.ok(fs.existsSync(unknownMarker), '.autonomous-retry-unknown marker must be created');

      // Second call → no block (marker already consumed)
      const result2 = runHook(tmp, {});
      assert.equal(result2.stdout.trim(), '', 'second call with unknown agent must not block');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 9: git unavailable / not a repo in fixture → silent no-op', () => {
    // Create a fixture with .planning but NO git repo
    const tmp = makeFixture({ mode: 'autonomous', midExecution: true, initGit: false });
    try {
      const result = runHook(tmp, { agent_id: 'agent-nogit' });
      assert.equal(result.status, 0, `hook must exit 0: ${result.stderr}`);
      // The git call will fail → silent catch → no stdout block, no crash
      assert.equal(result.stdout.trim(), '', 'must be silent when git fails');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Helper unit tests (in-process) ──────────────────────────────────────────

describe('verify-commits helpers — in-process', () => {
  test('Test 10: retryMarkerPath sanitizes agentId (path traversal chars stripped)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-san-'));
    try {
      // Path traversal attempt
      const p = retryMarkerPath(tmp, '../../../etc/passwd');
      const base = path.basename(p);
      // Must be inside planningDir (no traversal)
      assert.ok(p.startsWith(tmp), `marker must be inside planningDir, got: ${p}`);
      // All non-alphanumeric-underscore-hyphen chars must be stripped/replaced
      assert.doesNotMatch(base, /[./].*[./]/, 'sanitized name must not contain path separators');
      // The actual sanitized filename
      assert.match(base, /^\.autonomous-retry-/, 'must start with .autonomous-retry-');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 11: cleanStaleMarkers removes markers older than 1 hour, keeps fresh ones', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-stale-'));
    try {
      const now = Date.now();
      const oneHourAgo = now - 61 * 60 * 1000; // just over 1 hour old
      const recent = now - 5 * 60 * 1000;      // 5 minutes old

      // Create stale marker
      const staleMarker = path.join(tmp, '.autonomous-retry-stale-agent');
      fs.writeFileSync(staleMarker, String(oneHourAgo), 'utf8');
      // Backdate mtime to over 1 hour ago
      const staleDate = new Date(oneHourAgo);
      fs.utimesSync(staleMarker, staleDate, staleDate);

      // Create fresh marker
      const freshMarker = path.join(tmp, '.autonomous-retry-fresh-agent');
      fs.writeFileSync(freshMarker, String(recent), 'utf8');

      cleanStaleMarkers(tmp);

      assert.equal(fs.existsSync(staleMarker), false, 'stale marker (>1 hr) must be removed');
      assert.equal(fs.existsSync(freshMarker), true, 'fresh marker must be preserved');
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12a: isAutonomousMode returns true for mode:autonomous config', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-isauto-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'config.json'),
        JSON.stringify({ mode: 'autonomous' }),
        'utf8',
      );
      assert.equal(isAutonomousMode(tmp), true);
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12b: isAutonomousMode returns false for mode:yolo config', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-isauto-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'config.json'),
        JSON.stringify({ mode: 'yolo' }),
        'utf8',
      );
      assert.equal(isAutonomousMode(tmp), false);
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12c: isMidExecution returns true when STATE.md contains Executing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-ismid-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'STATE.md'),
        '# State\n\nStatus: Executing objective 10\n',
        'utf8',
      );
      assert.equal(isMidExecution(tmp), true);
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12d: isMidExecution returns true when STATE.md contains In progress', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-ismid-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'STATE.md'),
        '# State\n\nStatus: In progress\n',
        'utf8',
      );
      assert.equal(isMidExecution(tmp), true);
    } finally {
      cleanup(tmp);
    }
  });

  test('Test 12e: isMidExecution returns false when STATE.md is Idle', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-ismid-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'STATE.md'),
        '# State\n\nStatus: Idle\n',
        'utf8',
      );
      assert.equal(isMidExecution(tmp), false);
    } finally {
      cleanup(tmp);
    }
  });
});
