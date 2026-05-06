'use strict';

/**
 * global-config.test.cjs — Tests for lib/global-config.cjs
 *
 * Covers:
 *   - readConfig: cases 1-5 (missing file, all keys, partial, corrupt, unknown keys)
 *   - writeConfig: cases 6-8 (file creation, update + atomic spy, missing parent dir)
 *   - shouldAutoInit: cases 9-13 (missing, true, false, undefined, string 'true')
 *   - cmdGlobalConfig (CLI): cases 14-21 (get/set/error/coercion/unknown keys)
 *   - subprocess integration: cases 22-23 (HOME-redirected end-to-end)
 *
 * Pattern mirrors skill-active.test.cjs (Groups A-D).
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  readConfig,
  writeConfig,
  shouldAutoInit,
  cmdGlobalConfig,
  DEFAULT_CONFIG,
  GLOBAL_CONFIG_PATH,
  _setConfigPath,
  _setRunFs,
  _resetMocks,
} = require('./global-config.cjs');

const { mkTmpConfigPath, SCENARIOS } = require('./__fixtures__/global-config-fixtures.cjs');

// ─── readConfig ───────────────────────────────────────────────────────────────

describe('readConfig', () => {
  let tmp;
  beforeEach(() => {
    tmp = mkTmpConfigPath();
  });
  afterEach(() => {
    _setConfigPath(null);
    _resetMocks();
    try { fs.rmSync(tmp.dir, { recursive: true, force: true }); } catch {}
  });

  // case 1: File missing → returns { auto_init_substantive_projects: false }
  test('case 1: file missing → returns DEFAULT_CONFIG', () => {
    _setConfigPath(tmp.configPath); // file does not exist
    const result = readConfig();
    assert.deepEqual(result, SCENARIOS.default.expected);
  });

  // case 2: File present with all known keys → returns parsed object
  test('case 2: file with all known keys → returns parsed object', () => {
    fs.writeFileSync(tmp.configPath, SCENARIOS.enabled.content, 'utf-8');
    _setConfigPath(tmp.configPath);
    const result = readConfig();
    assert.deepEqual(result, SCENARIOS.enabled.expected);
  });

  // case 3: Partial file (empty object {}) → missing keys filled from DEFAULT_CONFIG
  test('case 3: partial file (empty object) → missing keys filled from DEFAULT_CONFIG', () => {
    fs.writeFileSync(tmp.configPath, SCENARIOS.partial.content, 'utf-8');
    _setConfigPath(tmp.configPath);
    const result = readConfig();
    assert.deepEqual(result, SCENARIOS.partial.expected);
  });

  // case 4: Corrupt JSON → returns DEFAULT_CONFIG; stderr warning emitted
  test('case 4: corrupt JSON → returns DEFAULT_CONFIG and emits stderr warning', () => {
    fs.writeFileSync(tmp.configPath, SCENARIOS.corrupt.content, 'utf-8');
    _setConfigPath(tmp.configPath);

    // Capture stderr
    const stderrChunks = [];
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
      stderrChunks.push(String(chunk));
      return origStderrWrite(chunk, ...rest);
    };
    let result;
    try {
      result = readConfig();
    } finally {
      process.stderr.write = origStderrWrite;
    }

    assert.deepEqual(result, SCENARIOS.corrupt.expected);
    const stderrOutput = stderrChunks.join('');
    assert.ok(
      stderrOutput.includes('[global-config]'),
      `Expected stderr warning with "[global-config]", got: ${stderrOutput}`
    );
  });

  // case 5: Unknown extra keys → preserved (forward-compat)
  test('case 5: unknown extra keys → preserved on read (forward-compat)', () => {
    fs.writeFileSync(tmp.configPath, SCENARIOS.unknown.content, 'utf-8');
    _setConfigPath(tmp.configPath);
    const result = readConfig();
    assert.deepEqual(result, SCENARIOS.unknown.expected);
    assert.equal(result.future_v13_key, 'foo');
  });

  // bonus: returned config is a copy, not DEFAULT_CONFIG reference (mutation protection)
  test('case 5b: returned config is a copy of DEFAULT_CONFIG, not a reference', () => {
    _setConfigPath(tmp.configPath); // file missing → defaults
    const r1 = readConfig();
    r1.auto_init_substantive_projects = true;
    const r2 = readConfig();
    assert.equal(r2.auto_init_substantive_projects, false, 'DEFAULT_CONFIG must not be mutated');
  });
});

// ─── writeConfig ─────────────────────────────────────────────────────────────

describe('writeConfig', () => {
  let tmp;
  beforeEach(() => {
    tmp = mkTmpConfigPath();
  });
  afterEach(() => {
    _setConfigPath(null);
    _resetMocks();
    try { fs.rmSync(tmp.dir, { recursive: true, force: true }); } catch {}
  });

  // case 6: File missing, parent dir exists → file created with correct JSON
  test('case 6: parent dir exists, no file → creates file with correct JSON', () => {
    _setConfigPath(tmp.configPath);
    writeConfig({ auto_init_substantive_projects: true });
    const raw = fs.readFileSync(tmp.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.auto_init_substantive_projects, true);
  });

  // case 7: File present → values updated, atomic write via renameSync spy
  test('case 7: file present → updated values, atomic write via .tmp rename', () => {
    fs.writeFileSync(tmp.configPath, JSON.stringify({ auto_init_substantive_projects: false }, null, 2), 'utf-8');
    _setConfigPath(tmp.configPath);

    let renamedFrom = null;
    let renamedTo = null;
    const realRenameSync = fs.renameSync.bind(fs);
    _setRunFs({
      existsSync: (...a) => fs.existsSync(...a),
      mkdirSync: (...a) => fs.mkdirSync(...a),
      readFileSync: (...a) => fs.readFileSync(...a),
      writeFileSync: (...a) => fs.writeFileSync(...a),
      renameSync: (from, to) => {
        renamedFrom = from;
        renamedTo = to;
        realRenameSync(from, to);
      },
    });

    writeConfig({ auto_init_substantive_projects: true });

    // Verify atomic rename happened
    assert.ok(renamedFrom, 'renameSync should have been called');
    assert.ok(renamedFrom.endsWith('.tmp'), `temp file should end with .tmp, got: ${renamedFrom}`);
    assert.equal(renamedTo, tmp.configPath);

    // Verify final file content
    const raw = fs.readFileSync(tmp.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.auto_init_substantive_projects, true);
  });

  // case 8: Parent dir missing → mkdir recursive creates it then writes file
  test('case 8: parent dir missing → mkdirSync recursive creates parents', () => {
    // Point to a path inside a directory that does not exist
    const deepDir = path.join(tmp.dir, 'a', 'b', 'c');
    const deepConfig = path.join(deepDir, 'global-config.json');
    _setConfigPath(deepConfig);

    // This should not throw — creates directory tree
    assert.doesNotThrow(() => writeConfig({ auto_init_substantive_projects: false }));
    assert.equal(fs.existsSync(deepConfig), true);
  });
});

// ─── shouldAutoInit ───────────────────────────────────────────────────────────

describe('shouldAutoInit', () => {
  let tmp;
  beforeEach(() => {
    tmp = mkTmpConfigPath();
  });
  afterEach(() => {
    _setConfigPath(null);
    _resetMocks();
    try { fs.rmSync(tmp.dir, { recursive: true, force: true }); } catch {}
  });

  // case 9: Config missing → returns false
  test('case 9: config file missing → returns false', () => {
    _setConfigPath(tmp.configPath);
    assert.equal(shouldAutoInit(), false);
  });

  // case 10: auto_init_substantive_projects: true → returns true
  test('case 10: auto_init_substantive_projects true → returns true', () => {
    fs.writeFileSync(tmp.configPath, JSON.stringify({ auto_init_substantive_projects: true }), 'utf-8');
    _setConfigPath(tmp.configPath);
    assert.equal(shouldAutoInit(), true);
  });

  // case 11: auto_init_substantive_projects: false → returns false
  test('case 11: auto_init_substantive_projects false → returns false', () => {
    fs.writeFileSync(tmp.configPath, JSON.stringify({ auto_init_substantive_projects: false }), 'utf-8');
    _setConfigPath(tmp.configPath);
    assert.equal(shouldAutoInit(), false);
  });

  // case 12: Key absent in file ({} empty object) → returns false (DEFAULT_CONFIG fills it)
  test('case 12: key absent in file → returns false (default applies)', () => {
    fs.writeFileSync(tmp.configPath, JSON.stringify({}), 'utf-8');
    _setConfigPath(tmp.configPath);
    assert.equal(shouldAutoInit(), false);
  });

  // case 13: auto_init_substantive_projects: 'true' (string, not bool) → returns false (strict ===)
  test('case 13: auto_init_substantive_projects is string "true" → returns false (strict bool check)', () => {
    fs.writeFileSync(tmp.configPath, JSON.stringify({ auto_init_substantive_projects: 'true' }), 'utf-8');
    _setConfigPath(tmp.configPath);
    assert.equal(shouldAutoInit(), false);
  });
});

// ─── cmdGlobalConfig — CLI dispatcher ─────────────────────────────────────────
// Note: cmdGlobalConfig calls output() which calls process.exit(0).
// In-process tests intercept stdout/stderr writes to capture output.
// Tests that exercise the error path (process.exit(1)) use spawnSync subprocess.

function captureOutputSync(fn) {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit.bind(process);
  let exitCode = null;
  process.stdout.write = (chunk, ...rest) => {
    chunks.push(String(chunk));
    return true;
  };
  process.exit = (code) => {
    exitCode = code !== undefined ? code : 0;
    throw new Error(`__process_exit_${exitCode}__`);
  };
  let error = null;
  try {
    fn();
  } catch (e) {
    if (!e.message || !e.message.startsWith('__process_exit_')) {
      error = e;
    }
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  if (error) throw error;
  return { output: chunks.join(''), exitCode };
}

describe('cmdGlobalConfig — in-process CLI', () => {
  let tmp;
  const cwd = process.cwd();

  beforeEach(() => {
    tmp = mkTmpConfigPath();
    _setConfigPath(tmp.configPath);
  });
  afterEach(() => {
    _setConfigPath(null);
    _resetMocks();
    try { fs.rmSync(tmp.dir, { recursive: true, force: true }); } catch {}
  });

  // case 14: get auto_init_substantive_projects (default state) → outputs "false"
  test('case 14: get auto_init_substantive_projects (default) → outputs false', () => {
    const { output } = captureOutputSync(() => {
      cmdGlobalConfig(cwd, ['get', 'auto_init_substantive_projects'], false);
    });
    assert.ok(output.includes('false'), `Expected "false" in output, got: ${output}`);
  });

  // case 15: set auto_init_substantive_projects true → file written with true
  test('case 15: set auto_init_substantive_projects true → file written with bool true', () => {
    captureOutputSync(() => {
      cmdGlobalConfig(cwd, ['set', 'auto_init_substantive_projects', 'true'], false);
    });
    const raw = fs.readFileSync(tmp.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.auto_init_substantive_projects, true);
    assert.equal(typeof parsed.auto_init_substantive_projects, 'boolean');
  });

  // case 16: get after set true → outputs "true"
  test('case 16: get after set true → outputs true', () => {
    captureOutputSync(() => {
      cmdGlobalConfig(cwd, ['set', 'auto_init_substantive_projects', 'true'], false);
    });
    const { output } = captureOutputSync(() => {
      cmdGlobalConfig(cwd, ['get', 'auto_init_substantive_projects'], false);
    });
    assert.ok(output.includes('true'), `Expected "true" in output, got: ${output}`);
  });

  // case 18: set with unknown key → stderr warning; file written with unknown key anyway
  test('case 18: set unknown key → stderr warning; file written with key anyway', () => {
    const stderrChunks = [];
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
      stderrChunks.push(String(chunk));
      return origStderrWrite(chunk, ...rest);
    };
    try {
      captureOutputSync(() => {
        cmdGlobalConfig(cwd, ['set', 'foo', 'bar'], false);
      });
    } finally {
      process.stderr.write = origStderrWrite;
    }
    const stderrOutput = stderrChunks.join('');
    assert.ok(
      stderrOutput.includes('unknown key') || stderrOutput.includes('warning'),
      `Expected warning about unknown key, got: ${stderrOutput}`
    );
    const raw = fs.readFileSync(tmp.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.foo, 'bar');
  });

  // case 19: get unknown key → outputs null
  test('case 19: get unknown key → outputs null', () => {
    const { output } = captureOutputSync(() => {
      cmdGlobalConfig(cwd, ['get', 'foo'], false);
    });
    assert.ok(output.includes('null'), `Expected "null" in output, got: ${output}`);
  });

  // case 20: set auto_init_substantive_projects 'false' → coerces to bool false
  test('case 20: set string "false" → coerces to boolean false', () => {
    // First set to true
    captureOutputSync(() => {
      cmdGlobalConfig(cwd, ['set', 'auto_init_substantive_projects', 'true'], false);
    });
    // Then set back to false
    captureOutputSync(() => {
      cmdGlobalConfig(cwd, ['set', 'auto_init_substantive_projects', 'false'], false);
    });
    const raw = fs.readFileSync(tmp.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.auto_init_substantive_projects, false);
    assert.equal(typeof parsed.auto_init_substantive_projects, 'boolean');
  });

  // case 21: set some_int '42' → coerces to number 42
  test('case 21: set string "42" → coerces to number 42', () => {
    captureOutputSync(() => {
      cmdGlobalConfig(cwd, ['set', 'some_int', '42'], false);
    });
    const raw = fs.readFileSync(tmp.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.some_int, 42);
    assert.equal(typeof parsed.some_int, 'number');
  });
});

// ─── cmdGlobalConfig — subprocess tests (error paths + subprocess integration) ─

const DF_TOOLS = require.resolve('../df-tools.cjs');

function spawnGlobalConfig(args, envOverrides = {}) {
  return spawnSync(process.execPath, [DF_TOOLS, 'global-config', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
  });
}

describe('cmdGlobalConfig — subprocess (error paths)', () => {
  let tmp;
  beforeEach(() => {
    tmp = mkTmpConfigPath();
  });
  afterEach(() => {
    try { fs.rmSync(tmp.dir, { recursive: true, force: true }); } catch {}
  });

  // case 17: set with no key → process.exit(1)
  test('case 17: set with no key argument → exits non-zero', () => {
    const proc = spawnGlobalConfig(['set'], { HOME: tmp.dir });
    assert.notEqual(proc.status, 0, `Expected non-zero exit, got: ${proc.status}, stderr: ${proc.stderr}`);
  });

  // case 17b: missing subcommand → exits non-zero
  test('case 17b: unknown subcommand → exits non-zero', () => {
    const proc = spawnGlobalConfig(['bogus'], { HOME: tmp.dir });
    assert.notEqual(proc.status, 0, `Expected non-zero exit, got: ${proc.status}`);
  });
});

describe('cmdGlobalConfig — subprocess integration (HOME-redirected)', () => {
  let tmpHome;
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-home-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
  });

  // case 22: set auto_init_substantive_projects true (HOME=tmpdir) → exit 0; file written correctly
  test('case 22: subprocess set true (HOME-redirected) → exit 0, file contains bool true', () => {
    const proc = spawnGlobalConfig(
      ['set', 'auto_init_substantive_projects', 'true'],
      { HOME: tmpHome }
    );
    assert.equal(proc.status, 0, `Expected exit 0, got stderr: ${proc.stderr}`);
    const expectedPath = path.join(tmpHome, '.claude', 'devflow', 'global-config.json');
    assert.equal(fs.existsSync(expectedPath), true, 'Config file should exist after set');
    const raw = fs.readFileSync(expectedPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.auto_init_substantive_projects, true);
  });

  // case 23: get auto_init_substantive_projects --raw after set true → exit 0, stdout "true"
  test('case 23: subprocess get --raw after set true → exit 0, stdout is "true"', () => {
    // First set it
    spawnGlobalConfig(
      ['set', 'auto_init_substantive_projects', 'true'],
      { HOME: tmpHome }
    );
    // Then get it
    const proc = spawnGlobalConfig(
      ['get', 'auto_init_substantive_projects', '--raw'],
      { HOME: tmpHome }
    );
    assert.equal(proc.status, 0, `Expected exit 0, got stderr: ${proc.stderr}`);
    assert.equal(proc.stdout.trim(), 'true', `Expected "true", got: ${proc.stdout}`);
  });
});
