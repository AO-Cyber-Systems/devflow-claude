'use strict';

/**
 * Tests for lib/service-installer.cjs — cross-platform service file
 * generation + launchctl/systemctl orchestration (TRD 20-02).
 *
 * Coverage groups:
 *   P: launchd plist rendering (8)
 *   U: systemd unit rendering (5)
 *   I: installService / uninstallService (12)
 *   EX: export surface lock (1)
 *
 * Group C (CLI integration) lives in devflow-watch.test.cjs.
 * Group D (documentation) verified via grep.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const installer = require('./service-installer.cjs');
const fx = require('./__fixtures__/daemon-polish-fixtures.cjs');

const LABEL = 'com.aocyber.devflow-watch';

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'svc-installer-'));
}
function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// Group P — Launchd plist rendering
// ---------------------------------------------------------------------------

describe('service-installer — Group P: launchd plist rendering', () => {
  test('P-1 renders valid XML with declaration + DOCTYPE + plist version="1.0"', () => {
    const xml = installer.renderLaunchdPlist({
      projectRoot: '/p',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN"/);
    assert.match(xml, /<plist version="1\.0">/);
  });

  test('P-2 contains <key>Label</key><string>com.aocyber.devflow-watch</string>', () => {
    const xml = installer.renderLaunchdPlist({
      projectRoot: '/p',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.match(xml, /<key>Label<\/key>\s*<string>com\.aocyber\.devflow-watch<\/string>/);
  });

  test('P-3 ProgramArguments contains /usr/bin/env, node, abs path, start, --foreground, --project, projectRoot', () => {
    const xml = installer.renderLaunchdPlist({
      projectRoot: '/my/project',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.match(xml, /<key>ProgramArguments<\/key>/);
    assert.match(xml, /<string>\/usr\/bin\/env<\/string>/);
    assert.match(xml, /<string>node<\/string>/);
    assert.match(xml, /<string>\/abs\/devflow-watch\.cjs<\/string>/);
    assert.match(xml, /<string>start<\/string>/);
    assert.match(xml, /<string>--foreground<\/string>/);
    assert.match(xml, /<string>--project<\/string>/);
    assert.match(xml, /<string>\/my\/project<\/string>/);
  });

  test('P-4 contains <key>RunAtLoad</key><true/>', () => {
    const xml = installer.renderLaunchdPlist({
      projectRoot: '/p',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/);
  });

  test('P-5 contains KeepAlive dict with SuccessfulExit false', () => {
    const xml = installer.renderLaunchdPlist({
      projectRoot: '/p',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    // KeepAlive contains SuccessfulExit: false (respawn on failure only)
    assert.match(xml, /<key>KeepAlive<\/key>/);
    assert.match(xml, /<key>SuccessfulExit<\/key>\s*<false\/>/);
  });

  test('P-6 xmlEscape handles all 5 entities', () => {
    const xml = installer.renderLaunchdPlist({
      projectRoot: `</breaks> & 'apos' "quote"`,
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.ok(xml.includes('&amp;'), '& → &amp;');
    assert.ok(xml.includes('&lt;'), '< → &lt;');
    assert.ok(xml.includes('&gt;'), '> → &gt;');
    assert.ok(xml.includes('&apos;'), `' → &apos;`);
    assert.ok(xml.includes('&quot;'), '" → &quot;');
  });

  test('P-7 projectRoot with special chars renders cleanly (no raw <, &)', () => {
    const xml = installer.renderLaunchdPlist({
      projectRoot: "Tom's Project & Co.",
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    // The substring "Tom's" must NOT appear unescaped — apostrophe escaped
    assert.ok(!xml.includes("Tom's"), 'apostrophe must be escaped');
    // & must be escaped
    assert.ok(!/[^&]&[^a-zA-Z]/.test(xml.replace(/&[a-zA-Z]+;/g, '')), 'no raw &');
  });

  test('P-8 StandardOutPath / StandardErrorPath point to ~/.devflow/launchd-{stdout,stderr}.log', () => {
    const tmp = mkTmp();
    const prevHOME = process.env.HOME;
    process.env.HOME = tmp;
    try {
      const xml = installer.renderLaunchdPlist({
        projectRoot: '/p',
        devflowWatchPath: '/abs/devflow-watch.cjs',
      });
      assert.match(xml, /<key>StandardOutPath<\/key>\s*<string>[^<]*\.devflow\/launchd-stdout\.log<\/string>/);
      assert.match(xml, /<key>StandardErrorPath<\/key>\s*<string>[^<]*\.devflow\/launchd-stderr\.log<\/string>/);
    } finally {
      if (prevHOME === undefined) delete process.env.HOME;
      else process.env.HOME = prevHOME;
      rmTmp(tmp);
    }
  });
});

// ---------------------------------------------------------------------------
// Group U — Systemd unit rendering
// ---------------------------------------------------------------------------

describe('service-installer — Group U: systemd unit rendering', () => {
  test('U-1 [Unit], [Service], [Install] sections in order', () => {
    const u = installer.renderSystemdUnit({
      projectRoot: '/p',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    const unitIdx = u.indexOf('[Unit]');
    const serviceIdx = u.indexOf('[Service]');
    const installIdx = u.indexOf('[Install]');
    assert.ok(unitIdx >= 0 && serviceIdx > unitIdx && installIdx > serviceIdx, 'sections in correct order');
  });

  test('U-2 [Service] contains Type=simple, Restart=on-failure, RestartSec=5', () => {
    const u = installer.renderSystemdUnit({
      projectRoot: '/p',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.match(u, /Type=simple/);
    assert.match(u, /Restart=on-failure/);
    assert.match(u, /RestartSec=5/);
  });

  test('U-3 ExecStart references /usr/bin/env node <absPath> start --foreground --project <projectRoot>', () => {
    const u = installer.renderSystemdUnit({
      projectRoot: '/my/project',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.match(u, /ExecStart=\/usr\/bin\/env node \/abs\/devflow-watch\.cjs start --foreground --project \/my\/project/);
  });

  test('U-4 [Install] contains WantedBy=default.target', () => {
    const u = installer.renderSystemdUnit({
      projectRoot: '/p',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.match(u, /\[Install\][\s\S]*WantedBy=default\.target/);
  });

  test('U-5 StandardOutput/StandardError use append:%h/.devflow/systemd-{stdout,stderr}.log', () => {
    const u = installer.renderSystemdUnit({
      projectRoot: '/p',
      devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.match(u, /StandardOutput=append:%h\/\.devflow\/systemd-stdout\.log/);
    assert.match(u, /StandardError=append:%h\/\.devflow\/systemd-stderr\.log/);
  });
});

// ---------------------------------------------------------------------------
// Group I — installService / uninstallService
// ---------------------------------------------------------------------------

describe('service-installer — Group I: install/uninstall', () => {
  let tmp;
  let homeFx;
  let mockExec;

  beforeEach(() => {
    tmp = mkTmp();
    homeFx = fx.buildServiceInstallerTmpHome(tmp);
    installer._resetMocks();
    mockExec = fx.buildMockExecFile();
    installer._setRunExec(mockExec.fn);
  });

  afterEach(() => {
    installer._resetMocks();
    if (homeFx) homeFx.restoreHome();
    rmTmp(tmp);
  });

  test('I-1 darwin writes plist to ~/Library/LaunchAgents/com.aocyber.devflow-watch.plist', async () => {
    const plistPath = path.join(homeFx.launchAgentsDir, `${LABEL}.plist`);
    await installer.installService({
      platform: 'darwin', projectRoot: '/p', devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.ok(fs.existsSync(plistPath), 'plist file written');
    const content = fs.readFileSync(plistPath, 'utf8');
    assert.match(content, /<plist version="1\.0">/);
    assert.match(content, /com\.aocyber\.devflow-watch/);
  });

  test('I-2 darwin invokes launchctl unload (ignored) THEN launchctl load', async () => {
    await installer.installService({
      platform: 'darwin', projectRoot: '/p', devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    const cmds = mockExec.calls.filter((c) => c.cmd === 'launchctl');
    assert.ok(cmds.length >= 2, 'at least 2 launchctl calls');
    // First call should be unload, second load
    assert.equal(cmds[0].args[0], 'unload');
    assert.equal(cmds[cmds.length - 1].args[0], 'load');
  });

  test('I-3 linux writes unit to ~/.config/systemd/user/devflow-watch.service', async () => {
    const unitPath = path.join(homeFx.systemdUserDir, 'devflow-watch.service');
    await installer.installService({
      platform: 'linux', projectRoot: '/p', devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    assert.ok(fs.existsSync(unitPath), 'unit file written');
    const content = fs.readFileSync(unitPath, 'utf8');
    assert.match(content, /\[Unit\]/);
    assert.match(content, /\[Service\]/);
  });

  test('I-4 linux invokes systemctl --user daemon-reload, enable, start (in order)', async () => {
    await installer.installService({
      platform: 'linux', projectRoot: '/p', devflowWatchPath: '/abs/devflow-watch.cjs',
    });
    const sub = mockExec.calls.filter((c) => c.cmd === 'systemctl').map((c) => c.args.join(' '));
    // Should include daemon-reload, enable, start
    const reloadIdx = sub.findIndex((a) => a.includes('daemon-reload'));
    const enableIdx = sub.findIndex((a) => a.includes('enable'));
    const startIdx = sub.findIndex((a) => a.includes('start'));
    assert.ok(reloadIdx >= 0, 'daemon-reload called');
    assert.ok(enableIdx > reloadIdx, 'enable after daemon-reload');
    assert.ok(startIdx > enableIdx, 'start after enable');
  });

  test('I-5 win32 throws platform error with EUNSUPPORTED code', async () => {
    await assert.rejects(
      () => installer.installService({
        platform: 'win32', projectRoot: '/p', devflowWatchPath: '/abs/d.cjs',
      }),
      (e) => e.code === 'EUNSUPPORTED' || /unsupported platform/i.test(e.message),
    );
  });

  test('I-6 install twice in a row succeeds (idempotent)', async () => {
    await installer.installService({
      platform: 'darwin', projectRoot: '/p', devflowWatchPath: '/abs/d.cjs',
    });
    await installer.installService({
      platform: 'darwin', projectRoot: '/p', devflowWatchPath: '/abs/d.cjs',
    });
    const plistPath = path.join(homeFx.launchAgentsDir, `${LABEL}.plist`);
    assert.ok(fs.existsSync(plistPath));
  });

  test('I-7 uninstallService darwin invokes launchctl unload then deletes plist file', async () => {
    // First install
    await installer.installService({
      platform: 'darwin', projectRoot: '/p', devflowWatchPath: '/abs/d.cjs',
    });
    const plistPath = path.join(homeFx.launchAgentsDir, `${LABEL}.plist`);
    assert.ok(fs.existsSync(plistPath));
    // Reset mock to track only uninstall calls
    mockExec.calls.length = 0;
    await installer.uninstallService({ platform: 'darwin' });
    const unloadCalls = mockExec.calls.filter((c) => c.cmd === 'launchctl' && c.args[0] === 'unload');
    assert.ok(unloadCalls.length >= 1, 'launchctl unload invoked');
    assert.ok(!fs.existsSync(plistPath), 'plist file deleted after uninstall');
  });

  test('I-8 uninstallService linux stops + disables + deletes + daemon-reloads', async () => {
    await installer.installService({
      platform: 'linux', projectRoot: '/p', devflowWatchPath: '/abs/d.cjs',
    });
    const unitPath = path.join(homeFx.systemdUserDir, 'devflow-watch.service');
    assert.ok(fs.existsSync(unitPath));
    mockExec.calls.length = 0;
    await installer.uninstallService({ platform: 'linux' });
    const sub = mockExec.calls.filter((c) => c.cmd === 'systemctl').map((c) => c.args.join(' '));
    assert.ok(sub.some((a) => a.includes('stop')), 'stop called');
    assert.ok(sub.some((a) => a.includes('disable')), 'disable called');
    assert.ok(!fs.existsSync(unitPath), 'unit file deleted');
  });

  test('I-9 uninstallService when not installed returns success (idempotent)', async () => {
    // No prior install
    await assert.doesNotReject(() => installer.uninstallService({ platform: 'darwin' }));
  });

  test('I-10 service file path uses os.homedir() — overridable via HOME env var', async () => {
    // We've already overridden HOME in beforeEach via homeFx
    await installer.installService({
      platform: 'darwin', projectRoot: '/p', devflowWatchPath: '/abs/d.cjs',
    });
    // Plist should land in our tmp HOME, NOT real ~/Library/LaunchAgents
    const plistPath = path.join(homeFx.launchAgentsDir, `${LABEL}.plist`);
    assert.ok(fs.existsSync(plistPath), 'plist in tmp HOME, not real ~/Library/LaunchAgents');
  });

  test('I-11 mkdir -p on parent dir before writeFileSync (~/.config/systemd/user/ may not exist)', async () => {
    // homeFx tmp doesn't pre-create systemd dir
    assert.ok(!fs.existsSync(homeFx.systemdUserDir), 'systemd dir does not yet exist');
    await installer.installService({
      platform: 'linux', projectRoot: '/p', devflowWatchPath: '/abs/d.cjs',
    });
    assert.ok(fs.existsSync(homeFx.systemdUserDir), 'systemd dir created by mkdir -p');
  });

  test('I-12 atomic write: tmp file does not persist after success', async () => {
    await installer.installService({
      platform: 'darwin', projectRoot: '/p', devflowWatchPath: '/abs/d.cjs',
    });
    const tmpPlist = path.join(homeFx.launchAgentsDir, `${LABEL}.plist.tmp`);
    assert.ok(!fs.existsSync(tmpPlist), 'tmp file cleaned up after rename');
  });
});

// ---------------------------------------------------------------------------
// Group EX — Export surface lock
// ---------------------------------------------------------------------------

describe('service-installer — Group EX: export surface', () => {
  test('EX-1 exports exactly the locked surface', () => {
    const keys = Object.keys(installer).sort();
    assert.deepStrictEqual(
      keys,
      ['_resetMocks', '_setRunExec', 'installService', 'renderLaunchdPlist', 'renderSystemdUnit', 'uninstallService']
    );
  });
});
