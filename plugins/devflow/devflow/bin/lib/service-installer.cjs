'use strict';

/**
 * service-installer — cross-platform user-domain service file generation
 * + launchctl/systemctl orchestration (TRD 20-02).
 *
 *   darwin: ~/Library/LaunchAgents/com.aocyber.devflow-watch.plist  (launchd)
 *   linux:  ~/.config/systemd/user/devflow-watch.service             (systemd-user)
 *   win32:  unsupported in v1.2 (throws EUNSUPPORTED)
 *
 * Service files are atomic: tmp + rename. Idempotent install (try-unload-
 * then-load on darwin; daemon-reload+enable+start on linux). Uninstall
 * tolerates missing files / not-loaded service (silent-success).
 *
 * Test seam: `_setRunExec(fn)` swaps the realRunExec backing for an
 * in-memory mock so tests never invoke real launchctl/systemctl.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const LABEL = 'com.aocyber.devflow-watch';

const realRunExec = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 10000, ...opts }, (err, stdout, stderr) => {
    if (err) {
      // Attach captured streams for caller diagnostics
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    } else {
      resolve({ stdout, stderr });
    }
  });
});

let _runExec = realRunExec;
function _setRunExec(fn) { _runExec = (fn != null) ? fn : realRunExec; }
function _resetMocks() { _runExec = realRunExec; }

function _xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

function _userHome() { return process.env.HOME || os.homedir(); }
function _launchAgentsDir() { return path.join(_userHome(), 'Library', 'LaunchAgents'); }
function _launchAgentsPath() { return path.join(_launchAgentsDir(), `${LABEL}.plist`); }
function _systemdUserDir() { return path.join(_userHome(), '.config', 'systemd', 'user'); }
function _systemdUnitPath() { return path.join(_systemdUserDir(), 'devflow-watch.service'); }
function _devflowLogDir() { return path.join(_userHome(), '.devflow'); }

/**
 * Render a launchd LaunchAgent plist for the daemon. ProgramArguments uses
 * `/usr/bin/env node <abs>` (so node from nvm/asdf/system all work). User-
 * controlled values (projectRoot, devflowWatchPath) are XML-escaped.
 */
function renderLaunchdPlist({ projectRoot, devflowWatchPath }) {
  const args = [
    '/usr/bin/env',
    'node',
    devflowWatchPath,
    'start',
    '--foreground',
    '--project',
    projectRoot,
  ];
  const argsXml = args.map((a) => `        <string>${_xmlEscape(a)}</string>`).join('\n');
  const stdoutPath = path.join(_devflowLogDir(), 'launchd-stdout.log');
  const stderrPath = path.join(_devflowLogDir(), 'launchd-stderr.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${_xmlEscape(stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${_xmlEscape(stderrPath)}</string>
</dict>
</plist>
`;
}

/**
 * Render a systemd-user unit file. systemd unit format has no escape
 * semantics for normal characters — plain string concat is safe.
 */
function renderSystemdUnit({ projectRoot, devflowWatchPath }) {
  return `[Unit]
Description=DevFlow Watch — handoff daemon
After=default.target

[Service]
Type=simple
ExecStart=/usr/bin/env node ${devflowWatchPath} start --foreground --project ${projectRoot}
Restart=on-failure
RestartSec=5
StandardOutput=append:%h/.devflow/systemd-stdout.log
StandardError=append:%h/.devflow/systemd-stderr.log

[Install]
WantedBy=default.target
`;
}

function _atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
  return filePath;
}

/**
 * Install the daemon as a user-domain service.
 *
 * @param {object} opts
 * @param {'darwin'|'linux'} opts.platform
 * @param {string} opts.projectRoot — directory the daemon will watch
 * @param {string} opts.devflowWatchPath — absolute path to devflow-watch.cjs
 * @returns {{servicePath: string}} the path of the written service file
 */
async function installService({ platform, projectRoot, devflowWatchPath }) {
  fs.mkdirSync(_devflowLogDir(), { recursive: true });
  if (platform === 'darwin') {
    const plistPath = _launchAgentsPath();
    const plist = renderLaunchdPlist({ projectRoot, devflowWatchPath });
    _atomicWrite(plistPath, plist);
    // Idempotent: unload first (ignored on first run), then load
    try { await _runExec('launchctl', ['unload', plistPath]); } catch { /* may not be loaded */ }
    await _runExec('launchctl', ['load', plistPath]);
    return { servicePath: plistPath };
  }
  if (platform === 'linux') {
    const unitPath = _systemdUnitPath();
    const unit = renderSystemdUnit({ projectRoot, devflowWatchPath });
    _atomicWrite(unitPath, unit);
    await _runExec('systemctl', ['--user', 'daemon-reload']);
    await _runExec('systemctl', ['--user', 'enable', 'devflow-watch.service']);
    await _runExec('systemctl', ['--user', 'start', 'devflow-watch.service']);
    return { servicePath: unitPath };
  }
  const err = new Error(`unsupported platform: ${platform}`);
  err.code = 'EUNSUPPORTED';
  throw err;
}

/**
 * Uninstall the daemon. Idempotent — safe to call when not installed.
 *
 * @param {object} opts
 * @param {'darwin'|'linux'} opts.platform
 * @returns {{servicePath: string}}
 */
async function uninstallService({ platform }) {
  if (platform === 'darwin') {
    const plistPath = _launchAgentsPath();
    try { await _runExec('launchctl', ['unload', plistPath]); } catch { /* may not be loaded */ }
    try { fs.unlinkSync(plistPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return { servicePath: plistPath };
  }
  if (platform === 'linux') {
    const unitPath = _systemdUnitPath();
    try { await _runExec('systemctl', ['--user', 'stop', 'devflow-watch.service']); } catch { /* may not be running */ }
    try { await _runExec('systemctl', ['--user', 'disable', 'devflow-watch.service']); } catch { /* may not be enabled */ }
    try { fs.unlinkSync(unitPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { await _runExec('systemctl', ['--user', 'daemon-reload']); } catch { /* best-effort */ }
    return { servicePath: unitPath };
  }
  const err = new Error(`unsupported platform: ${platform}`);
  err.code = 'EUNSUPPORTED';
  throw err;
}

module.exports = {
  installService,
  uninstallService,
  renderLaunchdPlist,
  renderSystemdUnit,
  _setRunExec,
  _resetMocks,
};
