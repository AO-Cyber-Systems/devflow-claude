/**
 * Tests for verify-completion.js Stop hook (TRD 15-05).
 *
 * Covers:
 *   - renderAuditEntry shape: full payload, missing fields, truncation, default ts
 *   - appendAuditLog filesystem behavior: parent dir creation, append, error handling
 *   - auditLogPath: env override, default path
 *   - Subprocess integration: ambient mode write, non-DevFlow no-op, SUMMARY scan preserved
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'verify-completion.js');
const { renderAuditEntry, appendAuditLog, auditLogPath } = require('./verify-completion.js');

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
