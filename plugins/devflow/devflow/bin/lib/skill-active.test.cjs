'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  startSkill,
  endSkill,
  statusSkill,
  markerPath,
  _resetMocks,
} = require('./skill-active.cjs');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function mkAmbient() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-active-'));
  fs.mkdirSync(path.join(root, '.planning'));
  return { root, planningDir: path.join(root, '.planning') };
}

// ─── startSkill ───────────────────────────────────────────────────────────────

describe('startSkill', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test 1: writes marker JSON with {skill, started_at, pid}
  test('writes marker JSON with {skill, started_at, pid}', () => {
    const result = startSkill({
      planningDir: env.planningDir,
      skillName: 'build',
      pid: 1234,
      now: '2026-05-04T00:00:00Z',
    });
    assert.equal(result.ok, true);
    const raw = fs.readFileSync(markerPath(env.planningDir), 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.skill, 'build');
    assert.equal(parsed.started_at, '2026-05-04T00:00:00Z');
    assert.equal(parsed.pid, 1234);
  });

  // Test 2: returns ok:false when planningDir is null
  test('returns ok:false with reason no-planning-dir when planningDir is null', () => {
    const result = startSkill({ planningDir: null, skillName: 'build', pid: 1, now: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-planning-dir');
  });

  // Test 3: returns ok:false when skillName is missing/empty/whitespace
  test('returns ok:false with reason missing-skill-name when skillName is null/undefined/empty/whitespace', () => {
    for (const name of [undefined, null, '', '   ']) {
      const result = startSkill({ planningDir: env.planningDir, skillName: name, pid: 1, now: 'x' });
      assert.equal(result.ok, false, `expected fail for skillName=${JSON.stringify(name)}`);
      assert.equal(result.reason, 'missing-skill-name');
    }
  });

  // Test 4: overwrites existing marker (last-write-wins)
  test('overwrites existing marker (last-write-wins)', () => {
    startSkill({ planningDir: env.planningDir, skillName: 'first', pid: 1, now: 'a' });
    startSkill({ planningDir: env.planningDir, skillName: 'second', pid: 2, now: 'b' });
    const raw = fs.readFileSync(markerPath(env.planningDir), 'utf8');
    assert.equal(JSON.parse(raw).skill, 'second');
  });

  // Test 5: marker file is valid JSON (round-trip parse)
  test('marker file is valid JSON (round-trip parse)', () => {
    startSkill({ planningDir: env.planningDir, skillName: 'build', pid: 99, now: '2026-01-01' });
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(fs.readFileSync(markerPath(env.planningDir), 'utf8'));
    });
    assert.ok(parsed);
  });

  // Test 6: marker file content matches {skill, started_at, pid} shape exactly
  test('marker file content matches {skill, started_at, pid} shape exactly', () => {
    startSkill({ planningDir: env.planningDir, skillName: 'micro', pid: 42, now: '2026-05-04T12:00:00Z' });
    const parsed = JSON.parse(fs.readFileSync(markerPath(env.planningDir), 'utf8'));
    assert.deepEqual(Object.keys(parsed).sort(), ['pid', 'skill', 'started_at'].sort());
    assert.equal(parsed.skill, 'micro');
    assert.equal(parsed.started_at, '2026-05-04T12:00:00Z');
    assert.equal(parsed.pid, 42);
  });
});

// ─── endSkill ─────────────────────────────────────────────────────────────────

describe('endSkill', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test 7: removes marker when present
  test('removes marker when present', () => {
    startSkill({ planningDir: env.planningDir, skillName: 'build', pid: 1, now: 'x' });
    assert.equal(fs.existsSync(markerPath(env.planningDir)), true);
    const result = endSkill({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(result.removed, true);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), false);
  });

  // Test 8: idempotent — no error when marker absent
  test('idempotent: returns ok:true, removed:false when marker absent (no error)', () => {
    const result = endSkill({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(result.removed, false);
  });

  // Test 9: returns ok:false when planningDir is null
  test('returns ok:false when planningDir is null', () => {
    const result = endSkill({ planningDir: null });
    assert.equal(result.ok, false);
  });
});

// ─── statusSkill ──────────────────────────────────────────────────────────────

describe('statusSkill', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test 10: returns active:false when no marker
  test('returns active:false when no marker', () => {
    const result = statusSkill({ planningDir: env.planningDir });
    assert.deepEqual(result, { active: false });
  });

  // Test 11: returns active:true + marker JSON when present
  test('returns active:true + marker JSON when present', () => {
    startSkill({ planningDir: env.planningDir, skillName: 'build', pid: 99, now: '2026-01-01' });
    const result = statusSkill({ planningDir: env.planningDir });
    assert.equal(result.active, true);
    assert.equal(result.marker.skill, 'build');
    assert.equal(result.marker.pid, 99);
    assert.ok(result.path);
  });

  // Test 12: returns active:false + reason no-planning-dir when planningDir null
  test('returns active:false with reason no-planning-dir when planningDir null', () => {
    const result = statusSkill({ planningDir: null });
    assert.equal(result.active, false);
    assert.equal(result.reason, 'no-planning-dir');
  });

  // Test 13: returns active:true, marker:null, parse_error when marker is corrupt JSON
  test('returns active:true, marker:null, parse_error when marker file is corrupt JSON', () => {
    fs.writeFileSync(markerPath(env.planningDir), 'NOT VALID JSON{{{', 'utf8');
    const result = statusSkill({ planningDir: env.planningDir });
    assert.equal(result.active, true);
    assert.equal(result.marker, null);
    assert.ok(result.parse_error);
  });
});

// ─── cmdSkillActive — dispatcher integration (via subprocess) ────────────────
// cmdSkillActive calls output() which calls process.exit(0). All tests that
// exercise the full CLI handler use spawnSync to avoid terminating the test
// runner. Pure-helper calls are used where we only need to assert on return
// values (no process.exit involved).

const DF_TOOLS = require.resolve('../df-tools.cjs');

function spawnSkillActive(cwd, extraArgs) {
  return spawnSync(process.execPath, [DF_TOOLS, 'skill-active', ...extraArgs], {
    cwd,
    encoding: 'utf8',
  });
}

describe('cmdSkillActive — dispatcher integration', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
  });

  // Test 14: --start <name> writes marker (full CLI path)
  test('--start <name> writes marker (full CLI path)', () => {
    const proc = spawnSkillActive(env.root, ['--start', 'build', '--raw']);
    assert.equal(proc.status, 0, `expected exit 0, got stderr: ${proc.stderr}`);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), true);
  });

  // Test 15: --end removes marker
  test('--end removes marker', () => {
    spawnSkillActive(env.root, ['--start', 'build', '--raw']);
    const proc = spawnSkillActive(env.root, ['--end', '--raw']);
    assert.equal(proc.status, 0, `expected exit 0, got stderr: ${proc.stderr}`);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), false);
  });

  // Test 16a: --status returns {active:false} JSON when no marker
  test('--status returns {active:false} JSON when no marker', () => {
    const proc = spawnSkillActive(env.root, ['--status', '--raw']);
    assert.equal(proc.status, 0, `expected exit 0, got stderr: ${proc.stderr}`);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.active, false);
  });

  // Test 16b: --status returns {active:true} JSON when marker present
  test('--status returns {active:true} JSON after --start', () => {
    spawnSkillActive(env.root, ['--start', 'build', '--raw']);
    const proc = spawnSkillActive(env.root, ['--status', '--raw']);
    assert.equal(proc.status, 0, `expected exit 0, got stderr: ${proc.stderr}`);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.active, true);
    assert.equal(parsed.marker.skill, 'build');
  });

  // Test 17: start <name> (no -- prefix) also works
  test('start <name> (no -- prefix) works equivalently', () => {
    const proc = spawnSkillActive(env.root, ['start', 'build', '--raw']);
    assert.equal(proc.status, 0, `expected exit 0, got stderr: ${proc.stderr}`);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), true);
  });

  // Test 18: end (no -- prefix) also works
  test('end (no -- prefix) works equivalently', () => {
    spawnSkillActive(env.root, ['start', 'build', '--raw']);
    const proc = spawnSkillActive(env.root, ['end', '--raw']);
    assert.equal(proc.status, 0, `expected exit 0, got stderr: ${proc.stderr}`);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), false);
  });

  // Test 19: --start with no name argument exits non-zero
  test('--start with no name argument exits non-zero (error path)', () => {
    const proc = spawnSkillActive(env.root, ['--start']);
    assert.notEqual(proc.status, 0, 'expected non-zero exit for missing skill name');
  });

  // Test 20: unknown subcommand exits non-zero
  test('unknown subcommand exits non-zero', () => {
    const proc = spawnSkillActive(env.root, ['--bogus']);
    assert.notEqual(proc.status, 0, 'expected non-zero exit for unknown subcommand');
  });
});
