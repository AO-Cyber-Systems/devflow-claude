#!/usr/bin/env node
// Mirror plugin-bundled devflow runtime to ~/.claude/devflow/.
// Skills and agents reference @~/.claude/devflow/* paths which are not
// interpolated against ${CLAUDE_PLUGIN_ROOT}, so the runtime is mirrored
// to the home location on each session start when the version differs.

const fs = require('fs');
const path = require('path');
const os = require('os');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) {
  process.exit(0);
}

const sourceDir = path.join(pluginRoot, 'devflow');
const targetDir = path.join(os.homedir(), '.claude', 'devflow');
const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
const versionFile = path.join(targetDir, '.plugin-version');

let pluginVersion = 'unknown';
try {
  pluginVersion = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || 'unknown';
} catch {
  process.exit(0);
}

let installedVersion = null;
try {
  installedVersion = fs.readFileSync(versionFile, 'utf8').trim();
} catch {}

if (installedVersion === pluginVersion && fs.existsSync(targetDir)) {
  process.exit(0);
}

if (!fs.existsSync(sourceDir)) {
  process.exit(0);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

try {
  for (const sub of ['workflows', 'references', 'templates', 'bin']) {
    const target = path.join(targetDir, sub);
    const source = path.join(sourceDir, sub);
    removeDir(target);
    if (fs.existsSync(source)) {
      copyDir(source, target);
    }
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(versionFile, pluginVersion);
  process.stderr.write(`[devflow] runtime synced to ~/.claude/devflow (v${pluginVersion})\n`);
} catch (err) {
  process.stderr.write(`[devflow] sync-runtime failed: ${err.message}\n`);
  process.exit(0);
}
