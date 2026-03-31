#!/usr/bin/env node
// Build the marketplace plugin directory with real files (no symlinks).
// Flattens skills/<name>/SKILL.md → plugins/devflow/commands/<name>.md
// Copies agents/<name>.md → plugins/devflow/agents/<name>.md

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skillsSrc = path.join(root, 'skills');
const agentsSrc = path.join(root, 'agents');
const pluginDir = path.join(root, 'plugins', 'devflow');
const commandsDest = path.join(pluginDir, 'commands');
const agentsDest = path.join(pluginDir, 'agents');

// Remove old symlinks / directories and recreate
function resetDir(dir) {
  if (fs.existsSync(dir)) {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(dir);
    } else {
      fs.rmSync(dir, { recursive: true });
    }
  }
  fs.mkdirSync(dir, { recursive: true });
}

// Remove all old symlinks in the plugin root
const symlinkNames = ['skills', 'devflow', 'hooks', 'agents'];
for (const name of symlinkNames) {
  const p = path.join(pluginDir, name);
  if (fs.existsSync(p) || fs.lstatSync(p).isSymbolicLink?.()) {
    try {
      const stat = fs.lstatSync(p);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(p);
        console.log(`Removed symlink: plugins/devflow/${name}`);
      }
    } catch {}
  }
}

resetDir(commandsDest);
resetDir(agentsDest);

// Flatten skills/<name>/SKILL.md → commands/<name>.md
let skillCount = 0;
for (const entry of fs.readdirSync(skillsSrc)) {
  const skillFile = path.join(skillsSrc, entry, 'SKILL.md');
  if (!fs.existsSync(skillFile)) continue;
  const dest = path.join(commandsDest, `${entry}.md`);
  fs.copyFileSync(skillFile, dest);
  skillCount++;
}
console.log(`Copied ${skillCount} skills → plugins/devflow/commands/`);

// Copy agents/<name>.md → agents/<name>.md
let agentCount = 0;
for (const entry of fs.readdirSync(agentsSrc)) {
  if (!entry.endsWith('.md')) continue;
  fs.copyFileSync(path.join(agentsSrc, entry), path.join(agentsDest, entry));
  agentCount++;
}
console.log(`Copied ${agentCount} agents → plugins/devflow/agents/`);

console.log('Plugin build complete.');
