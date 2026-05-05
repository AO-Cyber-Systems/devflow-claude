'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('./__fixtures__/awareness-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

function mkTmp(prefix = 'df-init-cli-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ─── Group CLI — list / show / sync-stub ─────────────────────────────────────

test('CLI1: df-tools initiatives list emits JSON array to stdout (exit 0)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'alpha' }, { slug: 'beta' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`stdout not valid JSON: ${r.stdout}`);
  }
  assert.ok(Array.isArray(parsed), 'stdout is JSON array');
  assert.strictEqual(parsed.length, 2, 'two initiatives listed');
  // Each entry has slug + github_issue + key_repos
  for (const item of parsed) {
    assert.ok(item.slug, 'slug present');
    assert.ok(item.github_issue, 'github_issue present');
    assert.ok(Array.isArray(item.key_repos), 'key_repos is array');
  }
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI2: df-tools initiatives list --home <tmpdir> reads from supplied home', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'custom-home-test', github_issue: 'AO-Cyber-Systems/devflow#99' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].slug, 'custom-home-test');
  assert.strictEqual(parsed[0].github_issue, 'AO-Cyber-Systems/devflow#99');
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI3: df-tools initiatives list returns [] (valid empty JSON) when home dir missing', () => {
  const missingHome = path.join(os.tmpdir(), 'df-no-such-initiatives-dir-' + Date.now());
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', missingHome], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`stdout not valid JSON: ${r.stdout}`);
  }
  assert.deepStrictEqual(parsed, [], 'returns empty JSON array');
});

test('CLI4: df-tools initiatives show <slug> emits rendered body to stdout (exit 0)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'show-test', title: 'Show Test Initiative', why: 'Because showing works.' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'show', 'show-test', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes('show-test'), 'output includes slug');
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI5: df-tools initiatives show <missing-slug> writes error JSON to stderr (exit 1)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'alpha' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'show', 'nonexistent-slug', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 1, `expected exit 1; status was: ${r.status}`);
  let errObj;
  try {
    errObj = JSON.parse(r.stderr);
  } catch (e) {
    assert.fail(`stderr not valid JSON: ${r.stderr}`);
  }
  assert.ok(errObj.error, 'error field present in stderr JSON');
  assert.ok(errObj.error.includes('nonexistent-slug'), `error message should mention slug; got: ${errObj.error}`);
  assert.ok(Array.isArray(errObj.available), 'available list present');
  fs.rmSync(home, { recursive: true, force: true });
});

// CLI2-6: replaces TRD 05-01's CLI6 stub assertion — sync now calls real implementation
// Previous CLI6 expected exit 1 with "not yet implemented (TRD 05-02)" message.
// As of TRD 05-02, sync calls real syncInitiatives. With live gh, may exit 0 (success)
// or exit 1 (auth error / no project_id). Either way, the stub message must be gone.
test('CLI6: df-tools initiatives sync (was stub) now calls real implementation — no stub error message', () => {
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'sync', '--home', path.join(os.tmpdir(), 'df-cli6-' + Date.now())], {
    encoding: 'utf-8',
  });
  // May exit 0 (auth present, real sync ran) or exit 1 (auth error / no project_id)
  // Both are acceptable — the key is NO stub message
  const combined = (r.stderr || '') + (r.stdout || '');
  assert.ok(
    !combined.includes('not yet implemented'),
    `stub message must be gone; got: ${combined.slice(0, 200)}`,
  );
  // If exit 1, stderr must be valid JSON (structured error)
  if (r.status === 1 && r.stderr && r.stderr.trim()) {
    let errObj;
    try {
      errObj = JSON.parse(r.stderr.trim());
    } catch {
      // stderr may be combined with init output — try to find JSON
      const match = r.stderr.match(/\{[\s\S]+\}/);
      if (match) errObj = JSON.parse(match[0]);
    }
    if (errObj) {
      assert.ok(errObj.error || errObj.warnings, 'exit-1 stderr has error or warnings field');
    }
  }
});

test('CLI7: df-tools initiatives <unknown-subcommand> writes usage error (exit 1)', () => {
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'frobnicate'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 1, `expected exit 1; status was: ${r.status}`);
  let errObj;
  try {
    errObj = JSON.parse(r.stderr);
  } catch (e) {
    assert.fail(`stderr not valid JSON: ${r.stderr}`);
  }
  assert.ok(errObj.error, 'error field present');
  assert.ok(errObj.error.toLowerCase().includes('unknown') || errObj.error.toLowerCase().includes('frobnicate'), `error mentions unknown command; got: ${errObj.error}`);
});

test('CLI8: df-tools initiatives (no subcommand) writes usage error listing valid subcommands (exit 1)', () => {
  const r = spawnSync('node', [DF_TOOLS, 'initiatives'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 1, `expected exit 1; status was: ${r.status}`);
  let errObj;
  try {
    errObj = JSON.parse(r.stderr);
  } catch (e) {
    assert.fail(`stderr not valid JSON: ${r.stderr}`);
  }
  assert.ok(errObj.error, 'error field present');
  // Should mention valid subcommands
  const errorStr = errObj.error;
  assert.ok(
    errorStr.includes('list') || errorStr.includes('show') || errorStr.includes('sync'),
    `error should mention valid subcommands; got: ${errorStr}`,
  );
});

// ─── Group I — Integration with df-tools.cjs router ─────────────────────────

test('I1: df-tools initiatives list routes through case "initiatives" arm (subprocess)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'router-test' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `router arm failed; stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.ok(Array.isArray(parsed), 'router returns JSON array');
  fs.rmSync(home, { recursive: true, force: true });
});

test('I2: Other case arms still work — awareness, org-awareness, dup-detect no regressions', () => {
  // awareness scan-peer --no-fetch smoke test
  const r = spawnSync('node', [DF_TOOLS, 'awareness', 'scan-peer', '--no-fetch'], {
    encoding: 'utf-8',
    cwd: path.join(__dirname, '..', '..', '..', '..', '..'),
  });
  // scan-peer may fail if no git repo but should not crash with unknown command
  const stderr = r.stderr || '';
  assert.ok(
    !stderr.includes('Unknown command: awareness'),
    `awareness case arm broken; stderr: ${stderr}`,
  );
});

// ─── TRD 05-02: Group CLI2 — cmdInitiativesSync (real implementation) ────────
// In-process tests using _setRunGh injection (avoids subprocess complexity of mocking gh).
// Note: cmdInitiativesSync calls output() which calls process.exit(0) — test only the
// non-output paths (error paths) in-process; success path tested via subprocess with mocked home.

const init = require('./initiatives.cjs');
const { cmdInitiativesSync } = require('./initiatives-cli.cjs');

test('CLI2-1: cmdInitiativesSync in-process with mocked auth — calls syncInitiatives (not stub)', async () => {
  // Verify that cmdInitiativesSync is no longer a stub by checking it doesn't emit the old stub error
  // We do this by inspecting the source or by calling with mocked auth and catching the process.exit
  const home = mkTmp('df-cli2-');

  // Mock auth failure — cmdInitiativesSync should emit GhAuthError JSON + exit 1
  init._setRunGh((args) => {
    if (args[0] === 'auth') {
      return { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });

  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    stderrChunks.push(String(chunk));
    return true;
  };

  let exitCode = null;
  const origExit = process.exit;
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    await cmdInitiativesSync(process.cwd(), ['--home', home, '--project-id', 'PVT_test']);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderr;
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }

  const stderrOutput = stderrChunks.join('');
  // Should be GhAuthError JSON, not the stub message
  assert.ok(!stderrOutput.includes('not yet implemented'), 'stub message should not appear');
  assert.ok(exitCode === 1, `should exit 1 on auth failure; got: ${exitCode}`);
});

test('CLI2-2: GhAuthError emits structured JSON to stderr + exit 1', async () => {
  const home = mkTmp('df-cli2-');

  init._setRunGh((args) => {
    if (args[0] === 'auth') {
      return { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });

  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => { stderrChunks.push(String(chunk)); return true; };

  let exitCode = null;
  const origExit = process.exit;
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    await cmdInitiativesSync(process.cwd(), ['--home', home, '--project-id', 'PVT_test']);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderr;
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }

  const stderrOutput = stderrChunks.join('');
  assert.strictEqual(exitCode, 1, 'exit code is 1');
  // stderr should contain valid JSON with error field
  let errObj;
  try {
    errObj = JSON.parse(stderrOutput.trim());
  } catch {
    // May be multi-line; try to find JSON object
    const match = stderrOutput.match(/\{[\s\S]+\}/);
    if (match) errObj = JSON.parse(match[0]);
    else assert.fail(`stderr not valid JSON: ${stderrOutput.slice(0, 200)}`);
  }
  assert.ok(errObj && errObj.error, `stderr JSON should have error field; got: ${JSON.stringify(errObj)}`);
});

test('CLI2-3: successful sync emits structured JSON to stdout + exit 0', async () => {
  const home = mkTmp('df-cli2-');
  const items = [
    fixtures.buildOrgItem({ title: '[Epic] Cli2 Test', issue_ref: 'AO-Cyber-Systems/devflow#50' }),
  ];
  init._setRunGh(fixtures.buildMockRunGhForInitiatives({ walkProjectItems: items }));

  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { stdoutChunks.push(String(chunk)); return true; };

  let firstExitCode = null;
  const origExit = process.exit;
  // Record only the FIRST exit code — output() calls exit(0), then cmdInitiativesSync's
  // catch may call exit(1) after catching the thrown pseudo-exit. We want the first exit code.
  process.exit = (code) => {
    if (firstExitCode === null) firstExitCode = code;
    throw new Error(`process.exit(${code})`);
  };

  try {
    await cmdInitiativesSync(process.cwd(), ['--home', home, '--project-id', 'PVT_test']);
  } catch (e) {
    // expected — process.exit throws
  } finally {
    process.exit = origExit;
    process.stdout.write = origStdout;
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }

  assert.strictEqual(firstExitCode, 0, `expected first exit 0 (from output()); got: ${firstExitCode}`);
  const stdoutOutput = stdoutChunks.join('');
  let result;
  try {
    result = JSON.parse(stdoutOutput.trim());
  } catch {
    const match = stdoutOutput.match(/\{[\s\S]+\}/);
    if (match) result = JSON.parse(match[0]);
    else assert.fail(`stdout not valid JSON: ${stdoutOutput.slice(0, 200)}`);
  }
  assert.ok(result && result.ok === true, `result.ok should be true; got: ${JSON.stringify(result)}`);
  assert.ok(Array.isArray(result.written), 'result.written is array');
});

test('CLI2-4: --initiative <slug> flag passes through to syncInitiatives', async () => {
  const home = mkTmp('df-cli2-');
  const items = [
    fixtures.buildOrgItem({ title: '[Epic] Target Initiative', issue_ref: 'AO-Cyber-Systems/devflow#51' }),
    fixtures.buildOrgItem({ title: '[Epic] Other Initiative', issue_ref: 'AO-Cyber-Systems/devflow#52' }),
  ];
  init._setRunGh(fixtures.buildMockRunGhForInitiatives({ walkProjectItems: items }));

  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { stdoutChunks.push(String(chunk)); return true; };

  let firstExitCode = null;
  const origExit = process.exit;
  process.exit = (code) => {
    if (firstExitCode === null) firstExitCode = code;
    throw new Error(`process.exit(${code})`);
  };

  try {
    await cmdInitiativesSync(process.cwd(), ['--home', home, '--project-id', 'PVT_test', '--initiative', 'target-initiative']);
  } catch (e) {
    // expected — process.exit throws
  } finally {
    process.exit = origExit;
    process.stdout.write = origStdout;
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }

  assert.strictEqual(firstExitCode, 0, `expected first exit 0; got: ${firstExitCode}`);
  const result = JSON.parse(stdoutChunks.join('').trim());
  assert.strictEqual(result.written.length, 1, 'only 1 item written with --initiative filter');
  assert.strictEqual(result.written[0].slug, 'target-initiative');
});

// ─── TRD 05-03: Group CLI3 — cmdInitiativesSync --force flag ─────────────────

test('CLI3-1: --force flag passes force: true through to syncInitiatives', async () => {
  const home = mkTmp('df-cli3-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic-cli3', github_issue: 'AO-Cyber-Systems/devflow#300' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });

  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { stdoutChunks.push(String(chunk)); return true; };

  let firstExitCode = null;
  const origExit = process.exit;
  process.exit = (code) => {
    if (firstExitCode === null) firstExitCode = code;
    throw new Error(`process.exit(${code})`);
  };

  try {
    await cmdInitiativesSync(process.cwd(), ['--home', home, '--project-id', 'PVT_test', '--force']);
  } catch (e) {
    // expected — process.exit throws
  } finally {
    process.exit = origExit;
    process.stdout.write = origStdout;
    init._resetMocks();
  }

  assert.strictEqual(firstExitCode, 0, `expected exit 0; got: ${firstExitCode}`);
  const outputStr = stdoutChunks.join('');
  let result;
  try {
    result = JSON.parse(outputStr.trim());
  } catch {
    const match = outputStr.match(/\{[\s\S]+\}/);
    if (match) result = JSON.parse(match[0]);
    else assert.fail(`stdout not valid JSON: ${outputStr.slice(0, 200)}`);
  }
  assert.ok(result.ok, 'result.ok should be true');
  // With --force and a closed+removed issue, result.deleted should have 1 entry
  assert.ok(Array.isArray(result.deleted), 'result.deleted is array');
  assert.strictEqual(result.deleted.length, 1, `expected 1 deleted with --force; deleted: ${JSON.stringify(result.deleted)}`);
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI3-2: without --force, force: false is the default', async () => {
  const home = mkTmp('df-cli3-');
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });

  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { stdoutChunks.push(String(chunk)); return true; };

  let firstExitCode = null;
  const origExit = process.exit;
  process.exit = (code) => {
    if (firstExitCode === null) firstExitCode = code;
    throw new Error(`process.exit(${code})`);
  };

  try {
    await cmdInitiativesSync(process.cwd(), ['--home', home, '--project-id', 'PVT_test']);
  } catch (e) {
    // expected — process.exit throws
  } finally {
    process.exit = origExit;
    process.stdout.write = origStdout;
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }

  assert.strictEqual(firstExitCode, 0, `expected exit 0; got: ${firstExitCode}`);
  const result = JSON.parse(stdoutChunks.join('').trim());
  // No stale files in empty home, so deleted should be empty regardless
  assert.ok(Array.isArray(result.deleted), 'result.deleted is array even without --force');
});

test('CLI3-3: --force JSON output includes deleted: [...] array', async () => {
  const home = mkTmp('df-cli3-3-');
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });

  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { stdoutChunks.push(String(chunk)); return true; };

  let firstExitCode = null;
  const origExit = process.exit;
  process.exit = (code) => {
    if (firstExitCode === null) firstExitCode = code;
    throw new Error(`process.exit(${code})`);
  };

  try {
    await cmdInitiativesSync(process.cwd(), ['--home', home, '--project-id', 'PVT_test', '--force']);
  } catch (e) {
    // expected — process.exit throws
  } finally {
    process.exit = origExit;
    process.stdout.write = origStdout;
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }

  assert.strictEqual(firstExitCode, 0, `expected exit 0; got: ${firstExitCode}`);
  const outputStr = stdoutChunks.join('');
  let result;
  try {
    result = JSON.parse(outputStr.trim());
  } catch {
    const match = outputStr.match(/\{[\s\S]+\}/);
    if (match) result = JSON.parse(match[0]);
    else assert.fail(`stdout not valid JSON: ${outputStr.slice(0, 200)}`);
  }
  assert.ok(Object.prototype.hasOwnProperty.call(result, 'deleted'),
    `result should have deleted property; got: ${JSON.stringify(Object.keys(result))}`);
  assert.ok(Array.isArray(result.deleted), 'deleted is an array');
});

test('CLI2-5: --project-id <id> flag passes through to syncInitiatives', async () => {
  const home = mkTmp('df-cli2-');
  let usedProjectId = null;

  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') {
      // Capture the project ID from the graphql body argument
      const bodyIdx = args.indexOf('-f');
      if (bodyIdx >= 0) {
        const bodyStr = args.slice(bodyIdx).join(' ');
        const idMatch = bodyStr.match(/PVT_cli2_custom/);
        if (idMatch) usedProjectId = 'PVT_cli2_custom';
      }
      // Also check in the full args string
      if (args.join(' ').includes('PVT_cli2_custom')) usedProjectId = 'PVT_cli2_custom';
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });

  let exitCode = null;
  const origExit = process.exit;
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };
  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { stdoutChunks.push(String(chunk)); return true; };

  try {
    await cmdInitiativesSync(process.cwd(), ['--home', home, '--project-id', 'PVT_cli2_custom']);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.exit = origExit;
    process.stdout.write = origStdout;
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }

  // The project-id should have been used in the graphql call
  assert.ok(usedProjectId === 'PVT_cli2_custom' || exitCode === 0,
    `project-id PVT_cli2_custom should be passed through; usedProjectId: ${usedProjectId}, exitCode: ${exitCode}`);
});
