'use strict';

/**
 * Tests for lib/wrappers/powershell.cjs (TRD 20-05).
 *
 * Group PW (unit-level + end-to-end gated on `pwsh` PATH).
 * Group EX-4 (export surface lock).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');

const pwsh = require('./powershell.cjs');
const { shellAvailable } = require('../__fixtures__/daemon-polish-fixtures.cjs');

const pwshAvailable = shellAvailable('pwsh') || shellAvailable('powershell');

describe('wrappers/powershell.cjs — Group PW unit', () => {
  test('PW-1 wrapCommand uses [System.IO.Path]::GetTempFileName() (NOT mktemp)', () => {
    const lines = pwsh.wrapCommand('Write-Output hello', 'h-1');
    assert.ok(lines.some((l) => l.includes('[System.IO.Path]::GetTempFileName()')));
    assert.ok(!lines.some((l) => l.includes('mktemp')));
  });

  test('PW-2 wrapCommand uses & { cmd } *> $dfwOut 2> $dfwErr (pwsh stream redirect)', () => {
    const lines = pwsh.wrapCommand('Write-Output hello', 'h-1');
    assert.ok(lines.some((l) => /& \{ Write-Output hello \} \*> \$dfwOut 2> \$dfwErr/.test(l)));
  });

  test('PW-3 wrapCommand uses $LASTEXITCODE (NOT $?)', () => {
    const lines = pwsh.wrapCommand('Write-Output x', 'h-1');
    assert.ok(lines.some((l) => l.includes('$LASTEXITCODE')));
    assert.ok(!lines.some((l) => /\$\?/.test(l)));
  });

  test('PW-4 wrapCommand uses Write-Output for sentinel emission', () => {
    const lines = pwsh.wrapCommand('Write-Output x', 'h-1');
    assert.ok(lines.some((l) => /Write-Output "__DFW_BEGIN_h-1__"/.test(l)));
    assert.ok(lines.some((l) => /Write-Output "__DFW_DELIM_h-1__"/.test(l)));
  });

  test('PW-5 wrapCommand handles $LASTEXITCODE null (defaults to 0)', () => {
    const lines = pwsh.wrapCommand('Write-Output x', 'h-1');
    // Should have a guard for null LASTEXITCODE
    assert.ok(lines.some((l) => /\$null -eq \$dfwRc.*\$dfwRc = 0|\$dfwRc = 0/.test(l)));
  });

  test('PW-6 initLines includes prompt + ProgressPreference setup', () => {
    const init = pwsh.initLines('pipe');
    assert.ok(init.some((l) => l.includes("$Function:prompt = { '' }")));
    assert.ok(init.some((l) => l.includes('ProgressPreference')));
  });

  test('PW-7 shellArgs(true) returns ["-NoLogo", "-NoExit"]; (false) returns ["-NoLogo"]', () => {
    assert.deepEqual(pwsh.shellArgs(true), ['-NoLogo', '-NoExit']);
    assert.deepEqual(pwsh.shellArgs(false), ['-NoLogo']);
  });
});

describe('wrappers/powershell.cjs — Group PW end-to-end', () => {
  test('PW-8 dispatches Write-Output end-to-end', { skip: !pwshAvailable }, () => {
    const lines = pwsh.wrapCommand('Write-Output hello', 'pw-8');
    const script = lines.join('\n');
    const cmd = shellAvailable('pwsh') ? 'pwsh' : 'powershell';
    const r = spawnSync(cmd, ['-NoLogo', '-NoProfile', '-Command', script], {
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(r.status, 0, `pwsh exited ${r.status}: ${r.stderr}`);
    assert.match(r.stdout, /__DFW_BEGIN_pw-8__/);
    assert.match(r.stdout, /hello/);
    assert.match(r.stdout, /__DFW_END_pw-8__:0/);
  });

  test('PW-9 exit 7 reports exit_code=7', { skip: !pwshAvailable }, () => {
    const lines = pwsh.wrapCommand('exit 7', 'pw-9');
    const cmd = shellAvailable('pwsh') ? 'pwsh' : 'powershell';
    const r = spawnSync(cmd, ['-NoLogo', '-NoProfile', '-Command', lines.join('\n')], {
      encoding: 'utf8', timeout: 10000,
    });
    // Even if cmd exits 7, our outer pwsh -Command runs the whole script;
    // outer exit may differ — what matters is the END marker shows :7
    assert.match(r.stdout, /__DFW_END_pw-9__:7/);
  });
});

describe('wrappers/powershell.cjs — Group EX', () => {
  test('EX-4 export surface lock', () => {
    const keys = Object.keys(pwsh).sort();
    assert.deepStrictEqual(keys, ['initLines', 'lineSep', 'shellArgs', 'shellName', 'wrapCommand']);
  });
});
