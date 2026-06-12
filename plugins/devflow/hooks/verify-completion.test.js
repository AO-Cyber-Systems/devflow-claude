/**
 * Tests for verify-completion.js Stop hook (TRD 15-05, TRD 10-05).
 *
 * Covers:
 *   - renderAuditEntry shape: full payload, missing fields, truncation, default ts
 *   - appendAuditLog filesystem behavior: parent dir creation, append, error handling
 *   - auditLogPath: env override, default path
 *   - Subprocess integration: ambient mode write, non-DevFlow no-op, SUMMARY scan preserved
 *   - Autonomous resume: block emission, 3-attempt cap, pending decisions bypass, helper functions
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'verify-completion.js');
const {
  renderAuditEntry,
  appendAuditLog,
  auditLogPath,
  isAutonomousMode,
  readResumeCount,
  writeResumeCount,
  clearResumeCount,
  isMidExecution,
} = require('./verify-completion.js');

// ─── renderAuditEntry shape ───────────────────────────────────────────────────

describe('renderAuditEntry shape', () => {
  test('full payload renders all 5 fields', () => {
    const entry = renderAuditEntry({
      ts: '2026-05-04T00:00:00Z',
      session_id: 'abc-123',
      route_recommended: '/devflow:build',
      skill_invoked: true,
      prompt_summary: 'Build the dashboard',
    });
    const parsed = JSON.parse(entry);
    assert.equal(parsed.ts, '2026-05-04T00:00:00Z');
    assert.equal(parsed.session_id, 'abc-123');
    assert.equal(parsed.route_recommended, '/devflow:build');
    assert.equal(parsed.skill_invoked, true);
    assert.equal(parsed.prompt_summary, 'Build the dashboard');
  });

  test('missing session_id → "unknown"', () => {
    const entry = renderAuditEntry({ ts: 'x', route_recommended: 'r', skill_invoked: false });
    assert.equal(JSON.parse(entry).session_id, 'unknown');
  });

  test('missing route_recommended → "none"', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's' });
    assert.equal(JSON.parse(entry).route_recommended, 'none');
  });

  test('missing prompt_summary → "unknown"', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's' });
    assert.equal(JSON.parse(entry).prompt_summary, 'unknown');
  });

  test('skill_invoked non-boolean → false', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's', skill_invoked: 'yes' });
    assert.equal(JSON.parse(entry).skill_invoked, false);
  });

  test('prompt_summary truncated to 80 chars', () => {
    const long = 'x'.repeat(200);
    const entry = renderAuditEntry({ ts: 'x', session_id: 's', prompt_summary: long });
    assert.equal(JSON.parse(entry).prompt_summary.length, 80);
  });

  test('omitted ts → ISO 8601 timestamp generated', () => {
    const entry = renderAuditEntry({ session_id: 's' });
    const parsed = JSON.parse(entry);
    assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ─── appendAuditLog filesystem behavior ──────────────────────────────────────

describe('appendAuditLog filesystem behavior', () => {
  let tmpLog;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-log-'));
    tmpLog = path.join(tmpDir, 'audit.log');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('creates parent directory if missing', () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c', 'audit.log');
    const result = appendAuditLog('{}', nested);
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(nested), true);
  });

  test('appends entry as new line', () => {
    appendAuditLog('{"first":1}', tmpLog);
    appendAuditLog('{"second":2}', tmpLog);
    const lines = fs.readFileSync(tmpLog, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).first, 1);
    assert.equal(JSON.parse(lines[1]).second, 2);
  });

  test('returns ok:false on filesystem error (unwritable path)', () => {
    const result = appendAuditLog('{}', '/nonexistent-root-dir/audit.log');
    assert.equal(result.ok, false);
    assert.ok(result.reason, 'reason should be set');
  });
});

// ─── auditLogPath ─────────────────────────────────────────────────────────────

describe('auditLogPath', () => {
  test('returns DEVFLOW_AUDIT_LOG_PATH env when set', () => {
    const prev = process.env.DEVFLOW_AUDIT_LOG_PATH;
    process.env.DEVFLOW_AUDIT_LOG_PATH = '/tmp/custom-audit.log';
    try {
      assert.equal(auditLogPath(), '/tmp/custom-audit.log');
    } finally {
      if (prev === undefined) delete process.env.DEVFLOW_AUDIT_LOG_PATH;
      else process.env.DEVFLOW_AUDIT_LOG_PATH = prev;
    }
  });

  test('defaults to ~/.claude/devflow/audit.log when env unset', () => {
    const prev = process.env.DEVFLOW_AUDIT_LOG_PATH;
    delete process.env.DEVFLOW_AUDIT_LOG_PATH;
    try {
      assert.equal(
        auditLogPath(),
        path.join(os.homedir(), '.claude', 'devflow', 'audit.log'),
      );
    } finally {
      if (prev !== undefined) process.env.DEVFLOW_AUDIT_LOG_PATH = prev;
    }
  });
});

// ─── Subprocess integration ───────────────────────────────────────────────────

describe('subprocess integration — Stop hook in ambient mode', () => {
  test('writes audit log entry with redirected DEVFLOW_AUDIT_LOG_PATH', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-e2e-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      fs.mkdirSync(path.join(tmp, '.planning', 'objectives'), { recursive: true });
      const payload = JSON.stringify({
        session_id: 'test-session-1',
        prompt: 'Build the dashboard feature',
      });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: payload,
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.equal(fs.existsSync(logPath), true, 'audit.log should exist');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.session_id, 'test-session-1');
      assert.equal(parsed.prompt_summary, 'Build the dashboard feature');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('no-op when not a DevFlow project (no .planning)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-non-df-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(fs.existsSync(logPath), false, 'audit.log should NOT be written outside DevFlow project');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('preserves existing SUMMARY scan warnings', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-summary-'));
    const objDir = path.join(tmp, '.planning', 'objectives', '99-test');
    try {
      fs.mkdirSync(objDir, { recursive: true });
      const summaryPath = path.join(objDir, '99-01-SUMMARY.md');
      fs.writeFileSync(summaryPath, '# x\nSelf-Check: FAILED\n', 'utf8');
      // Touch to ensure mtime is recent
      fs.utimesSync(summaryPath, new Date(), new Date());
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: path.join(tmp, 'audit.log') },
      });
      // Existing scan emits warnings via console.error
      assert.match(result.stderr, /Self-Check FAILED/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('stdout is empty (audit logging is observability-only)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-stdout-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      fs.mkdirSync(path.join(tmp, '.planning', 'objectives'), { recursive: true });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.stdout, '', 'hook must not write to stdout');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('does not crash when DEVFLOW_AUDIT_LOG_PATH is unwritable', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-nowrite-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning', 'objectives'), { recursive: true });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: '/nonexistent-root-dir/audit.log' },
      });
      assert.equal(result.status, 0, 'hook must exit 0 even when audit log is unwritable');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── Autonomous resume — subprocess integration ───────────────────────────────

/**
 * Build a minimal autonomous fixture for subprocess tests.
 *
 * @param {string} tmp - root tmpdir
 * @param {object} opts
 * @param {string} [opts.mode]            - config.json mode field (default: 'autonomous')
 * @param {string|null} [opts.configJson] - raw config JSON string, or null to omit config.json, or 'malformed'
 * @param {boolean} [opts.midExecution]   - whether STATE.md says "Executing" (default: true)
 * @param {string} [opts.objectiveLine]   - objective line content in STATE.md (default: 'Objective: 10')
 * @param {number} [opts.resumeCount]     - pre-existing counter value (default: 0, omit file if undefined)
 * @param {string[]} [opts.pendingIds]    - decision ids to write to .planning/decisions/pending/
 * @returns {string} planningDir path
 */
function buildAutonomousFixture(tmp, opts = {}) {
  const mode = opts.mode !== undefined ? opts.mode : 'autonomous';
  const midExecution = opts.midExecution !== false;
  const objectiveLine = opts.objectiveLine !== undefined ? opts.objectiveLine : 'Objective: 10';
  const pendingIds = opts.pendingIds || [];

  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(path.join(planningDir, 'objectives'), { recursive: true });

  // Write config.json
  if (opts.configJson === null) {
    // omit config.json
  } else if (opts.configJson === 'malformed') {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{ bad json :::');
  } else if (opts.configJson !== undefined) {
    fs.writeFileSync(path.join(planningDir, 'config.json'), opts.configJson);
  } else {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ mode }),
    );
  }

  // Write STATE.md
  const statusLine = midExecution ? 'Status: Executing' : 'Status: Idle';
  const stateContent = `# DevFlow State\n\n## Current Position\n\n${objectiveLine}\n${statusLine}\n`;
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);

  // Write resume counter if specified
  if (opts.resumeCount !== undefined) {
    const objKey = objectiveLine.match(/Objective:\s*(\w+)/) ? objectiveLine.match(/Objective:\s*(\w+)/)[1] : 'current';
    fs.writeFileSync(path.join(planningDir, `.autonomous-resume-${objKey}`), String(opts.resumeCount));
  }

  // Write pending decisions if specified
  if (pendingIds.length > 0) {
    const pendingDir = path.join(planningDir, 'decisions', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    for (const id of pendingIds) {
      fs.writeFileSync(path.join(pendingDir, `${id}.md`), `---\nid: ${id}\nstatus: pending\n---\n`);
    }
  }

  return planningDir;
}

describe('autonomous resume — subprocess', () => {
  // Test 1: autonomous + mid-execution + count 0 → block JSON on stdout, counter = 1
  test('autonomous + mid-execution + count 0 → block JSON with attempt 1/3, counter written', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-1-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const planningDir = buildAutonomousFixture(tmp, { resumeCount: 0 });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0, `hook crashed: ${result.stderr}`);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.decision, 'block');
      assert.match(parsed.reason, /resuming \(attempt 1\/3\)/);
      // Counter file should now be 1
      const counterFile = path.join(planningDir, '.autonomous-resume-10');
      assert.equal(fs.readFileSync(counterFile, 'utf8').trim(), '1');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 2: counter at 3 → NO block, counter deleted
  test('counter at 3 → allow stop, counter file deleted', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-2-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const planningDir = buildAutonomousFixture(tmp, { resumeCount: 3 });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '', 'at cap 3 must not emit block JSON');
      // Counter file should be deleted
      const counterFile = path.join(planningDir, '.autonomous-resume-10');
      assert.equal(fs.existsSync(counterFile), false, 'counter file should be cleared at cap');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 3: mode yolo + mid-execution → no block
  test('mode yolo + mid-execution → no block (warn-only preserved)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-3-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, { mode: 'yolo' });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '', 'yolo mode must not emit block JSON');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 4: autonomous + STATE.md NOT mid-execution → no block, counter cleared if present
  test('autonomous + NOT mid-execution → no block, counter cleared', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-4-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const planningDir = buildAutonomousFixture(tmp, { midExecution: false, resumeCount: 2 });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '', 'idle state must not emit block JSON');
      // Counter file should be cleared
      const counterFile = path.join(planningDir, '.autonomous-resume-10');
      assert.equal(fs.existsSync(counterFile), false, 'counter should be cleared when not mid-execution');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 5: autonomous + mid-execution + pending decisions → block emitted, reason lists pending ids
  test('autonomous + mid-execution + pending decisions → block emitted, reason contains pending ids', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-5-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, {
        pendingIds: ['DECISION-001', 'DECISION-002'],
      });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.decision, 'block');
      assert.match(parsed.reason, /DECISION-001/);
      assert.match(parsed.reason, /DECISION-002/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 6: non-DevFlow dir (no .planning) → no output, exit 0
  test('non-DevFlow dir → no output, exit 0', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-6-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      // No .planning dir created
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 7: malformed config.json → treated as non-autonomous, no block, no crash
  test('malformed config.json → treated as non-autonomous, no block, exit 0', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-7-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, { configJson: 'malformed' });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '', 'malformed config must not emit block JSON');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Test 8: existing audit-log behavior still works in autonomous block path (audit + block coexist)
  test('autonomous block path: audit log entry still written alongside block JSON', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-auto-8-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      buildAutonomousFixture(tmp, { resumeCount: 0 });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: JSON.stringify({ session_id: 'audit-coexist-test' }),
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      // Block JSON on stdout
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.decision, 'block');
      // Audit log also written
      assert.equal(fs.existsSync(logPath), true, 'audit log must exist');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const auditEntry = JSON.parse(lines[0]);
      assert.equal(auditEntry.session_id, 'audit-coexist-test');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── Autonomous resume — pure helpers ────────────────────────────────────────

describe('autonomous resume — helpers', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-helpers-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  // Test 9: isAutonomousMode
  test('isAutonomousMode: true only for mode="autonomous"', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ mode: 'autonomous' }));
    assert.equal(isAutonomousMode(planningDir), true);
  });

  test('isAutonomousMode: false for mode="yolo"', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ mode: 'yolo' }));
    assert.equal(isAutonomousMode(planningDir), false);
  });

  test('isAutonomousMode: false when config missing', () => {
    // No config.json written
    assert.equal(isAutonomousMode(planningDir), false);
  });

  test('isAutonomousMode: false when config malformed', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{ bad json :::');
    assert.equal(isAutonomousMode(planningDir), false);
  });

  // Test 10: readResumeCount
  test('readResumeCount: missing file → 0', () => {
    assert.equal(readResumeCount(planningDir, 'test'), 0);
  });

  test('readResumeCount: garbage content → 0', () => {
    fs.writeFileSync(path.join(planningDir, '.autonomous-resume-test'), 'not-a-number');
    assert.equal(readResumeCount(planningDir, 'test'), 0);
  });

  test('readResumeCount: "2" → 2', () => {
    fs.writeFileSync(path.join(planningDir, '.autonomous-resume-test'), '2');
    assert.equal(readResumeCount(planningDir, 'test'), 2);
  });

  // Test 11: writeResumeCount + clearResumeCount round-trip
  test('writeResumeCount + clearResumeCount round-trip', () => {
    writeResumeCount(planningDir, 'rt', 5);
    assert.equal(readResumeCount(planningDir, 'rt'), 5);
    clearResumeCount(planningDir, 'rt');
    assert.equal(readResumeCount(planningDir, 'rt'), 0);
    assert.equal(fs.existsSync(path.join(planningDir, '.autonomous-resume-rt')), false);
  });

  // Test 12: isMidExecution
  test('isMidExecution: "Executing" in STATE.md → true', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Status: Executing\n');
    assert.equal(isMidExecution(planningDir), true);
  });

  test('isMidExecution: "In progress" in STATE.md → true', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Status: In progress\n');
    assert.equal(isMidExecution(planningDir), true);
  });

  test('isMidExecution: neither keyword → false', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Status: Idle\n');
    assert.equal(isMidExecution(planningDir), false);
  });

  test('isMidExecution: missing STATE.md → false', () => {
    // No STATE.md written
    assert.equal(isMidExecution(planningDir), false);
  });

  // Test 13: counter file is per-objective (independent keys)
  test('counter files are per-objective key (10 and 11 are independent)', () => {
    writeResumeCount(planningDir, '10', 1);
    writeResumeCount(planningDir, '11', 2);
    assert.equal(readResumeCount(planningDir, '10'), 1);
    assert.equal(readResumeCount(planningDir, '11'), 2);
    clearResumeCount(planningDir, '10');
    assert.equal(readResumeCount(planningDir, '10'), 0);
    assert.equal(readResumeCount(planningDir, '11'), 2); // unaffected
  });
});
