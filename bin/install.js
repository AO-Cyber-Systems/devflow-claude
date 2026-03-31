#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// Get version from package.json
const pkg = require('../package.json');

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasUninstall = args.includes('--uninstall') || args.includes('-u');

const banner = '\n' +
  cyan + '  ██████╗ ███████╗██╗   ██╗███████╗██╗      ██████╗ ██╗    ██╗\n' +
  '  ██╔══██╗██╔════╝██║   ██║██╔════╝██║     ██╔═══██╗██║    ██║\n' +
  '  ██║  ██║█████╗  ██║   ██║█████╗  ██║     ██║   ██║██║ █╗ ██║\n' +
  '  ██║  ██║██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║     ██║   ██║██║███╗██║\n' +
  '  ██████╔╝███████╗ ╚████╔╝ ██║     ███████╗╚██████╔╝╚███╔███╔╝\n' +
  '  ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝' + reset + '\n' +
  '\n' +
  '  DevFlow ' + dim + 'v' + pkg.version + reset + '\n' +
  '  A meta-prompting, context engineering and spec-driven\n' +
  '  development system for Claude Code by AO Cyber Systems.\n';

// Parse --config-dir argument
function parseConfigDirArg() {
  const configDirIndex = args.findIndex(arg => arg === '--config-dir' || arg === '-c');
  if (configDirIndex !== -1) {
    const nextArg = args[configDirIndex + 1];
    // Error if --config-dir is provided without a value or next arg is another flag
    if (!nextArg || nextArg.startsWith('-')) {
      console.error(`  ${yellow}--config-dir requires a path argument${reset}`);
      process.exit(1);
    }
    return nextArg;
  }
  // Also handle --config-dir=value format
  const configDirArg = args.find(arg => arg.startsWith('--config-dir=') || arg.startsWith('-c='));
  if (configDirArg) {
    const value = configDirArg.split('=')[1];
    if (!value) {
      console.error(`  ${yellow}--config-dir requires a non-empty path${reset}`);
      process.exit(1);
    }
    return value;
  }
  return null;
}
const explicitConfigDir = parseConfigDirArg();
const hasHelp = args.includes('--help') || args.includes('-h');
const forceStatusline = args.includes('--force-statusline');

console.log(banner);

// Show help if requested
if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx devflow-cc [options]\n\n  ${yellow}Options:${reset}\n    ${cyan}-g, --global${reset}              Install globally (to ~/.claude)\n    ${cyan}-l, --local${reset}               Install locally (to ./.claude)\n    ${cyan}-u, --uninstall${reset}           Uninstall DevFlow (remove all DevFlow files)\n    ${cyan}-c, --config-dir <path>${reset}   Specify custom config directory\n    ${cyan}-h, --help${reset}                Show this help message\n    ${cyan}--force-statusline${reset}        Replace existing statusline config\n\n  ${yellow}Examples:${reset}\n    ${dim}# Interactive install (prompts for location)${reset}\n    npx devflow-cc\n\n    ${dim}# Install globally${reset}\n    npx devflow-cc --global\n\n    ${dim}# Install to custom config directory${reset}\n    npx devflow-cc --global --config-dir ~/.claude-bc\n\n    ${dim}# Install to current project only${reset}\n    npx devflow-cc --local\n\n    ${dim}# Uninstall DevFlow globally${reset}\n    npx devflow-cc --global --uninstall\n\n  ${yellow}Notes:${reset}\n    The --config-dir option is useful when you have multiple configurations.\n    It takes priority over the CLAUDE_CONFIG_DIR environment variable.\n`);
  process.exit(0);
}

/**
 * Expand ~ to home directory (shell doesn't expand in env vars passed to node)
 */
function expandTilde(filePath) {
  if (filePath && filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Get the global config directory for Claude Code
 */
function getGlobalDir() {
  if (explicitConfigDir) {
    return expandTilde(explicitConfigDir);
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    return expandTilde(process.env.CLAUDE_CONFIG_DIR);
  }
  return path.join(os.homedir(), '.claude');
}

/**
 * Build a hook command path using forward slashes for cross-platform compatibility.
 */
function buildHookCommand(configDir, hookName) {
  const hooksPath = configDir.replace(/\\/g, '/') + '/hooks/' + hookName;
  return `node "${hooksPath}"`;
}

/**
 * Read and parse settings.json, returning empty object if it doesn't exist
 */
function readSettings(settingsPath) {
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

/**
 * Write settings.json with proper formatting
 */
function writeSettings(settingsPath, settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Get commit attribution setting
 * @returns {null|undefined|string} null = remove, undefined = keep default, string = custom
 */
function getCommitAttribution() {
  const settings = readSettings(path.join(getGlobalDir(), 'settings.json'));
  if (!settings.attribution || settings.attribution.commit === undefined) {
    return undefined;
  } else if (settings.attribution.commit === '') {
    return null;
  } else {
    return settings.attribution.commit;
  }
}

/**
 * Process Co-Authored-By lines based on attribution setting
 */
function processAttribution(content, attribution) {
  if (attribution === null) {
    return content.replace(/(\r?\n){2}Co-Authored-By:.*$/gim, '');
  }
  if (attribution === undefined) {
    return content;
  }
  const safeAttribution = attribution.replace(/\$/g, '$$$$');
  return content.replace(/Co-Authored-By:.*$/gim, `Co-Authored-By: ${safeAttribution}`);
}

/**
 * Recursively copy directory, replacing paths in .md files
 * Deletes existing destDir first to remove orphaned files from previous versions
 */
function copyWithPathReplacement(srcDir, destDir, pathPrefix) {
  // Clean install: remove existing destination to prevent orphaned files
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  const attribution = getCommitAttribution();

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithPathReplacement(srcPath, destPath, pathPrefix);
    } else if (entry.name.endsWith('.md')) {
      let content = fs.readFileSync(srcPath, 'utf8');
      const globalClaudeRegex = /~\/\.claude\//g;
      const localClaudeRegex = /\.\/\.claude\//g;
      content = content.replace(globalClaudeRegex, pathPrefix);
      content = content.replace(localClaudeRegex, `./.claude/`);
      content = processAttribution(content, attribution);
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copy skills directory to destination
 * Source: skills/<name>.md
 * Dest: <targetDir>/skills/<name>.md
 */
function copySkills(srcDir, destDir, pathPrefix) {
  if (!fs.existsSync(srcDir)) return;

  // Remove old skill files/directories before copying new ones
  if (fs.existsSync(destDir)) {
    for (const entry of fs.readdirSync(destDir, { withFileTypes: true })) {
      const entryPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true });
      } else if (entry.name.endsWith('.md')) {
        fs.unlinkSync(entryPath);
      }
    }
  } else {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Also remove legacy commands/df/ if it exists (migration from pre-skills era)
  const legacyCommandsDir = path.join(path.dirname(destDir), 'commands', 'df');
  if (fs.existsSync(legacyCommandsDir)) {
    fs.rmSync(legacyCommandsDir, { recursive: true });
    console.log(`  ${green}✓${reset} Removed legacy commands/df/ (migrated to skills/)`);
  }

  const attribution = getCommitAttribution();

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const skillFile = path.join(srcDir, entry.name);
    let content = fs.readFileSync(skillFile, 'utf8');
    const globalClaudeRegex = /~\/\.claude\//g;
    const localClaudeRegex = /\.\/\.claude\//g;
    content = content.replace(globalClaudeRegex, pathPrefix);
    content = content.replace(localClaudeRegex, `./.claude/`);
    content = processAttribution(content, attribution);
    fs.writeFileSync(path.join(destDir, entry.name), content);
  }
}

/**
 * Clean up orphaned files from previous DevFlow versions
 */
function cleanupOrphanedFiles(configDir) {
  const orphanedFiles = [
    'hooks/gsd-notify.sh',  // Removed in v1.6.x (legacy GSD name)
    'hooks/df-statusline.js',  // Renamed to statusline.js (df- prefix removed)
    'hooks/df-check-update.js',  // Renamed to check-update.js (df- prefix removed)
    'hooks/df-verify-completion.js',  // Renamed to verify-completion.js (df- prefix removed)
    'hooks/df-verify-commits.js',  // Renamed to verify-commits.js (df- prefix removed)
  ];

  for (const relPath of orphanedFiles) {
    const fullPath = path.join(configDir, relPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ${green}✓${reset} Removed orphaned ${relPath}`);
    }
  }
}

/**
 * Clean up orphaned hook registrations from settings.json
 */
function cleanupOrphanedHooks(settings) {
  const orphanedHookPatterns = [
    'df-notify.sh',  // Removed in v1.6.x
    'df-intel-index.js',  // Removed in v1.9.2
    'df-intel-session.js',  // Removed in v1.9.2
    'df-intel-prune.js',  // Removed in v1.9.2
    'hooks/df-statusline.js',  // Renamed to statusline.js (df- prefix removed)
    'hooks/df-check-update.js',  // Renamed to check-update.js (df- prefix removed)
    'hooks/df-verify-completion.js',  // Renamed to verify-completion.js (df- prefix removed)
    'hooks/df-verify-commits.js',  // Renamed to verify-commits.js (df- prefix removed)
  ];

  let cleanedHooks = false;

  if (settings.hooks) {
    for (const eventType of Object.keys(settings.hooks)) {
      const hookEntries = settings.hooks[eventType];
      if (Array.isArray(hookEntries)) {
        const filtered = hookEntries.filter(entry => {
          if (entry.hooks && Array.isArray(entry.hooks)) {
            const hasOrphaned = entry.hooks.some(h =>
              h.command && orphanedHookPatterns.some(pattern => h.command.includes(pattern))
            );
            if (hasOrphaned) {
              cleanedHooks = true;
              return false;
            }
          }
          return true;
        });
        settings.hooks[eventType] = filtered;
      }
    }
  }

  if (cleanedHooks) {
    console.log(`  ${green}✓${reset} Removed orphaned hook registrations`);
  }

  // Migrate statusLine from old df-statusline.js to statusline.js
  if (settings.statusLine && settings.statusLine.command &&
      settings.statusLine.command.includes('df-statusline.js')) {
    settings.statusLine.command = settings.statusLine.command.replace(
      /df-statusline\.js/,
      'statusline.js'
    );
    console.log(`  ${green}✓${reset} Updated statusline path (df-statusline.js -> statusline.js)`);
  }

  return settings;
}

/**
 * Uninstall DevFlow from the specified directory
 */
function uninstall(isGlobal) {
  const targetDir = isGlobal
    ? getGlobalDir()
    : path.join(process.cwd(), '.claude');

  const locationLabel = isGlobal
    ? targetDir.replace(os.homedir(), '~')
    : targetDir.replace(process.cwd(), '.');

  console.log(`  Uninstalling DevFlow from ${cyan}Claude Code${reset} at ${cyan}${locationLabel}${reset}\n`);

  if (!fs.existsSync(targetDir)) {
    console.log(`  ${yellow}Warning${reset} Directory does not exist: ${locationLabel}`);
    console.log(`  Nothing to uninstall.\n`);
    return;
  }

  let removedCount = 0;

  // 1. Remove DevFlow skills (flat .md files in skills/)
  const skillsDir = path.join(targetDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    let skillCount = 0;
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        fs.unlinkSync(path.join(skillsDir, entry.name));
        skillCount++;
      } else if (entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md'))) {
        // Legacy: remove old subdirectory-style skills
        fs.rmSync(path.join(skillsDir, entry.name), { recursive: true });
        skillCount++;
      }
    }
    if (skillCount > 0) {
      removedCount++;
      console.log(`  ${green}✓${reset} Removed ${skillCount} DevFlow skills`);
    }
  }

  // 1b. Also remove legacy commands/df/ if it exists
  const dfCommandsDir = path.join(targetDir, 'commands', 'df');
  if (fs.existsSync(dfCommandsDir)) {
    fs.rmSync(dfCommandsDir, { recursive: true });
    removedCount++;
    console.log(`  ${green}✓${reset} Removed legacy commands/df/`);
  }

  // 2. Remove devflow directory
  const dfDir = path.join(targetDir, 'devflow');
  if (fs.existsSync(dfDir)) {
    fs.rmSync(dfDir, { recursive: true });
    removedCount++;
    console.log(`  ${green}✓${reset} Removed devflow/`);
  }

  // 3. Remove DevFlow agents (known agent .md files)
  const agentsDir = path.join(targetDir, 'agents');
  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir);
    let agentCount = 0;
    for (const file of files) {
      if (KNOWN_AGENTS.includes(file) || (file.startsWith('df-') && file.endsWith('.md'))) {
        fs.unlinkSync(path.join(agentsDir, file));
        agentCount++;
      }
    }
    if (agentCount > 0) {
      removedCount++;
      console.log(`  ${green}✓${reset} Removed ${agentCount} DevFlow agents`);
    }
  }

  // 4. Remove DevFlow hooks
  const hooksDir = path.join(targetDir, 'hooks');
  if (fs.existsSync(hooksDir)) {
    const dfHooks = ['statusline.js', 'check-update.js', 'verify-completion.js', 'verify-commits.js', 'df-statusline.js', 'df-check-update.js', 'df-check-update.sh', 'df-verify-completion.js', 'df-verify-commits.js'];
    let hookCount = 0;
    for (const hook of dfHooks) {
      const hookPath = path.join(hooksDir, hook);
      if (fs.existsSync(hookPath)) {
        fs.unlinkSync(hookPath);
        hookCount++;
      }
    }
    if (hookCount > 0) {
      removedCount++;
      console.log(`  ${green}✓${reset} Removed ${hookCount} DevFlow hooks`);
    }
  }

  // 5. Remove DevFlow package.json (CommonJS mode marker)
  const pkgJsonPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const content = fs.readFileSync(pkgJsonPath, 'utf8').trim();
      if (content === '{"type":"commonjs"}') {
        fs.unlinkSync(pkgJsonPath);
        removedCount++;
        console.log(`  ${green}✓${reset} Removed DevFlow package.json`);
      }
    } catch (e) {
      // Ignore read errors
    }
  }

  // 6. Clean up settings.json (remove DevFlow hooks and statusline)
  const settingsPath = path.join(targetDir, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    let settings = readSettings(settingsPath);
    let settingsModified = false;

    if (settings.statusLine && settings.statusLine.command &&
        (settings.statusLine.command.includes('statusline') || settings.statusLine.command.includes('df-statusline'))) {
      delete settings.statusLine;
      settingsModified = true;
      console.log(`  ${green}✓${reset} Removed DevFlow statusline from settings`);
    }

    if (settings.hooks) {
      // Remove DevFlow hooks from all event types
      const dfHookPatterns = ['check-update', 'statusline', 'verify-completion', 'verify-commits', 'df-check-update', 'df-statusline', 'df-verify-completion', 'df-verify-commits'];
      for (const eventType of ['SessionStart', 'Stop', 'SubagentStop']) {
        if (settings.hooks[eventType]) {
          const before = settings.hooks[eventType].length;
          settings.hooks[eventType] = settings.hooks[eventType].filter(entry => {
            if (entry.hooks && Array.isArray(entry.hooks)) {
              const hasDfHook = entry.hooks.some(h =>
                h.command && dfHookPatterns.some(p => h.command.includes(p))
              );
              return !hasDfHook;
            }
            return true;
          });
          if (settings.hooks[eventType].length < before) {
            settingsModified = true;
          }
          if (settings.hooks[eventType].length === 0) {
            delete settings.hooks[eventType];
          }
        }
      }
      if (settingsModified) {
        console.log(`  ${green}✓${reset} Removed DevFlow hooks from settings`);
      }
      if (settings.hooks && Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
    }

    if (settingsModified) {
      writeSettings(settingsPath, settings);
      removedCount++;
    }
  }

  if (removedCount === 0) {
    console.log(`  ${yellow}Warning${reset} No DevFlow files found to remove.`);
  }

  console.log(`
  ${green}Done!${reset} DevFlow has been uninstalled from Claude Code.
  Your other files and settings have been preserved.
`);
}

/**
 * Verify a directory exists and contains files
 */
function verifyInstalled(dirPath, description) {
  if (!fs.existsSync(dirPath)) {
    console.error(`  ${yellow}x${reset} Failed to install ${description}: directory not created`);
    return false;
  }
  try {
    const entries = fs.readdirSync(dirPath);
    if (entries.length === 0) {
      console.error(`  ${yellow}x${reset} Failed to install ${description}: directory is empty`);
      return false;
    }
  } catch (e) {
    console.error(`  ${yellow}x${reset} Failed to install ${description}: ${e.message}`);
    return false;
  }
  return true;
}

/**
 * Verify a file exists
 */
function verifyFileInstalled(filePath, description) {
  if (!fs.existsSync(filePath)) {
    console.error(`  ${yellow}x${reset} Failed to install ${description}: file not created`);
    return false;
  }
  return true;
}

// ──────────────────────────────────────────────────────
// Local Patch Persistence
// ──────────────────────────────────────────────────────

const PATCHES_DIR_NAME = 'df-local-patches';
const MANIFEST_NAME = 'df-file-manifest.json';
const KNOWN_AGENTS = ['planner.md', 'executor.md', 'verifier.md', 'debugger.md', 'job-checker.md', 'codebase-mapper.md', 'objective-researcher.md', 'project-researcher.md', 'research-synthesizer.md', 'roadmapper.md', 'security-auditor.md', 'integration-checker.md'];

/**
 * Compute SHA256 hash of file contents
 */
function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively collect all files in dir with their hashes
 */
function generateManifest(dir, baseDir) {
  if (!baseDir) baseDir = dir;
  const manifest = {};
  if (!fs.existsSync(dir)) return manifest;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      Object.assign(manifest, generateManifest(fullPath, baseDir));
    } else {
      manifest[relPath] = fileHash(fullPath);
    }
  }
  return manifest;
}

/**
 * Write file manifest after installation for future modification detection
 */
function writeManifest(configDir) {
  const dfDir = path.join(configDir, 'devflow');
  const skillsDir = path.join(configDir, 'skills');
  const agentsDir = path.join(configDir, 'agents');
  const manifest = { version: pkg.version, timestamp: new Date().toISOString(), files: {} };

  const dfHashes = generateManifest(dfDir);
  for (const [rel, hash] of Object.entries(dfHashes)) {
    manifest.files['devflow/' + rel] = hash;
  }
  if (fs.existsSync(skillsDir)) {
    const skillHashes = generateManifest(skillsDir);
    for (const [rel, hash] of Object.entries(skillHashes)) {
      manifest.files['skills/' + rel] = hash;
    }
  }
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (file.endsWith('.md')) {
        manifest.files['agents/' + file] = fileHash(path.join(agentsDir, file));
      }
    }
  }

  fs.writeFileSync(path.join(configDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Detect user-modified DevFlow files by comparing against install manifest.
 * Backs up modified files to df-local-patches/ for reapply after update.
 */
function saveLocalPatches(configDir) {
  const manifestPath = path.join(configDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return [];

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return []; }

  const patchesDir = path.join(configDir, PATCHES_DIR_NAME);
  const modified = [];

  for (const [relPath, originalHash] of Object.entries(manifest.files || {})) {
    const fullPath = path.join(configDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const currentHash = fileHash(fullPath);
    if (currentHash !== originalHash) {
      const backupPath = path.join(patchesDir, relPath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(fullPath, backupPath);
      modified.push(relPath);
    }
  }

  if (modified.length > 0) {
    const meta = {
      backed_up_at: new Date().toISOString(),
      from_version: manifest.version,
      files: modified
    };
    fs.writeFileSync(path.join(patchesDir, 'backup-meta.json'), JSON.stringify(meta, null, 2));
    console.log('  ' + yellow + 'i' + reset + '  Found ' + modified.length + ' locally modified DevFlow file(s) — backed up to ' + PATCHES_DIR_NAME + '/');
    for (const f of modified) {
      console.log('     ' + dim + f + reset);
    }
  }
  return modified;
}

/**
 * After install, report backed-up patches for user to reapply.
 */
function reportLocalPatches(configDir) {
  const patchesDir = path.join(configDir, PATCHES_DIR_NAME);
  const metaPath = path.join(patchesDir, 'backup-meta.json');
  if (!fs.existsSync(metaPath)) return [];

  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { return []; }

  if (meta.files && meta.files.length > 0) {
    console.log('');
    console.log('  ' + yellow + 'Local patches detected' + reset + ' (from v' + meta.from_version + '):');
    for (const f of meta.files) {
      console.log('     ' + cyan + f + reset);
    }
    console.log('');
    console.log('  Your modifications are saved in ' + cyan + PATCHES_DIR_NAME + '/' + reset);
    console.log('  Run ' + cyan + '/df:reapply-patches' + reset + ' to merge them into the new version.');
    console.log('  Or manually compare and merge the files.');
    console.log('');
  }
  return meta.files || [];
}

function install(isGlobal) {
  const src = path.join(__dirname, '..');

  const targetDir = isGlobal
    ? getGlobalDir()
    : path.join(process.cwd(), '.claude');

  const locationLabel = isGlobal
    ? targetDir.replace(os.homedir(), '~')
    : targetDir.replace(process.cwd(), '.');

  // Path prefix for file references in markdown content
  const pathPrefix = isGlobal
    ? `${targetDir.replace(/\\/g, '/')}/`
    : `./.claude/`;

  console.log(`  Installing for ${cyan}Claude Code${reset} to ${cyan}${locationLabel}${reset}\n`);

  // Track installation failures
  const failures = [];

  // Save any locally modified DevFlow files before they get wiped
  saveLocalPatches(targetDir);

  // Clean up orphaned files from previous versions
  cleanupOrphanedFiles(targetDir);

  // Deploy skills (plugins/devflow/commands/<name>.md)
  const skillsSrc = path.join(src, 'plugins', 'devflow', 'commands');
  const skillsDest = path.join(targetDir, 'skills');
  copySkills(skillsSrc, skillsDest, pathPrefix);
  if (verifyInstalled(skillsDest, 'skills')) {
    const count = fs.readdirSync(skillsDest).filter(f => f.endsWith('.md')).length;
    console.log(`  ${green}✓${reset} Installed ${count} skills`);
  } else {
    failures.push('skills');
  }

  // Copy devflow directory with path replacement
  const devflowSrc = path.join(src, 'devflow');
  const devflowDest = path.join(targetDir, 'devflow');
  copyWithPathReplacement(devflowSrc, devflowDest, pathPrefix);
  if (verifyInstalled(devflowDest, 'devflow')) {
    console.log(`  ${green}✓${reset} Installed devflow`);
  } else {
    failures.push('devflow');
  }

  // Copy agents to agents directory
  const agentsSrc = path.join(src, 'plugins', 'devflow', 'agents');
  if (fs.existsSync(agentsSrc)) {
    const agentsDest = path.join(targetDir, 'agents');
    fs.mkdirSync(agentsDest, { recursive: true });

    // Remove old DevFlow agents before copying new ones
    if (fs.existsSync(agentsDest)) {
      for (const file of fs.readdirSync(agentsDest)) {
        if (file.endsWith('.md') && (file.startsWith('df-') || KNOWN_AGENTS.includes(file))) {
          fs.unlinkSync(path.join(agentsDest, file));
        }
      }
    }

    // Copy new agents
    const attribution = getCommitAttribution();
    const agentEntries = fs.readdirSync(agentsSrc, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        let content = fs.readFileSync(path.join(agentsSrc, entry.name), 'utf8');
        const dirRegex = /~\/\.claude\//g;
        content = content.replace(dirRegex, pathPrefix);
        content = processAttribution(content, attribution);
        fs.writeFileSync(path.join(agentsDest, entry.name), content);
      }
    }
    if (verifyInstalled(agentsDest, 'agents')) {
      console.log(`  ${green}✓${reset} Installed agents`);
    } else {
      failures.push('agents');
    }
  }

  // Copy CHANGELOG.md
  const changelogSrc = path.join(src, 'CHANGELOG.md');
  const changelogDest = path.join(targetDir, 'devflow', 'CHANGELOG.md');
  if (fs.existsSync(changelogSrc)) {
    fs.copyFileSync(changelogSrc, changelogDest);
    if (verifyFileInstalled(changelogDest, 'CHANGELOG.md')) {
      console.log(`  ${green}✓${reset} Installed CHANGELOG.md`);
    } else {
      failures.push('CHANGELOG.md');
    }
  }

  // Write VERSION file
  const versionDest = path.join(targetDir, 'devflow', 'VERSION');
  fs.writeFileSync(versionDest, pkg.version);
  if (verifyFileInstalled(versionDest, 'VERSION')) {
    console.log(`  ${green}✓${reset} Wrote VERSION (${pkg.version})`);
  } else {
    failures.push('VERSION');
  }

  // Write package.json to force CommonJS mode for DevFlow scripts
  const pkgJsonDest = path.join(targetDir, 'package.json');
  fs.writeFileSync(pkgJsonDest, '{"type":"commonjs"}\n');
  console.log(`  ${green}✓${reset} Wrote package.json (CommonJS mode)`);

  // Copy hooks from dist/ (bundled with dependencies)
  const hooksSrc = path.join(src, 'hooks', 'dist');
  if (fs.existsSync(hooksSrc)) {
    const hooksDest = path.join(targetDir, 'hooks');
    fs.mkdirSync(hooksDest, { recursive: true });
    const hookEntries = fs.readdirSync(hooksSrc);
    const configDirReplacement = isGlobal ? "'.claude'" : "'.claude'";
    for (const entry of hookEntries) {
      const srcFile = path.join(hooksSrc, entry);
      if (fs.statSync(srcFile).isFile()) {
        const destFile = path.join(hooksDest, entry);
        if (entry.endsWith('.js')) {
          let content = fs.readFileSync(srcFile, 'utf8');
          content = content.replace(/'\.claude'/g, configDirReplacement);
          fs.writeFileSync(destFile, content);
        } else {
          fs.copyFileSync(srcFile, destFile);
        }
      }
    }
    if (verifyInstalled(hooksDest, 'hooks')) {
      console.log(`  ${green}✓${reset} Installed hooks (bundled)`);
    } else {
      failures.push('hooks');
    }
  }

  if (failures.length > 0) {
    console.error(`\n  ${yellow}Installation incomplete!${reset} Failed: ${failures.join(', ')}`);
    process.exit(1);
  }

  // Configure statusline and hooks in settings.json
  const settingsPath = path.join(targetDir, 'settings.json');
  const settings = cleanupOrphanedHooks(readSettings(settingsPath));
  const statuslineCommand = isGlobal
    ? buildHookCommand(targetDir, 'statusline.js')
    : 'node .claude/hooks/statusline.js';
  const updateCheckCommand = isGlobal
    ? buildHookCommand(targetDir, 'check-update.js')
    : 'node .claude/hooks/check-update.js';

  // Configure SessionStart hook for update checking
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.SessionStart) {
    settings.hooks.SessionStart = [];
  }

  const hasDfUpdateHook = settings.hooks.SessionStart.some(entry =>
    entry.hooks && entry.hooks.some(h => h.command && h.command.includes('check-update'))
  );

  if (!hasDfUpdateHook) {
    settings.hooks.SessionStart.push({
      hooks: [
        {
          type: 'command',
          command: updateCheckCommand
        }
      ]
    });
    console.log(`  ${green}✓${reset} Configured update check hook`);
  }

  // Configure Stop hook for completion verification
  const verifyCompletionCommand = isGlobal
    ? buildHookCommand(targetDir, 'verify-completion.js')
    : 'node .claude/hooks/verify-completion.js';

  if (!settings.hooks.Stop) {
    settings.hooks.Stop = [];
  }

  const hasCompletionHook = settings.hooks.Stop.some(entry =>
    entry.hooks && entry.hooks.some(h => h.command && h.command.includes('verify-completion'))
  );

  if (!hasCompletionHook) {
    settings.hooks.Stop.push({
      hooks: [
        {
          type: 'command',
          command: verifyCompletionCommand
        }
      ]
    });
    console.log(`  ${green}✓${reset} Configured completion verification hook`);
  }

  // Configure SubagentStop hook for commit verification
  const verifyCommitsCommand = isGlobal
    ? buildHookCommand(targetDir, 'verify-commits.js')
    : 'node .claude/hooks/verify-commits.js';

  if (!settings.hooks.SubagentStop) {
    settings.hooks.SubagentStop = [];
  }

  const hasCommitsHook = settings.hooks.SubagentStop.some(entry =>
    entry.hooks && entry.hooks.some(h => h.command && h.command.includes('verify-commits'))
  );

  if (!hasCommitsHook) {
    settings.hooks.SubagentStop.push({
      hooks: [
        {
          type: 'command',
          command: verifyCommitsCommand
        }
      ]
    });
    console.log(`  ${green}✓${reset} Configured commit verification hook`);
  }

  // Write file manifest for future modification detection
  writeManifest(targetDir);
  console.log(`  ${green}✓${reset} Wrote file manifest (${MANIFEST_NAME})`);

  // Report any backed-up local patches
  reportLocalPatches(targetDir);

  return { settingsPath, settings, statuslineCommand };
}

/**
 * Apply statusline config, then print completion message
 */
function finishInstall(settingsPath, settings, statuslineCommand, shouldInstallStatusline) {
  if (shouldInstallStatusline) {
    settings.statusLine = {
      type: 'command',
      command: statuslineCommand
    };
    console.log(`  ${green}✓${reset} Configured statusline`);
  }

  writeSettings(settingsPath, settings);

  console.log(`
  ${green}Done!${reset} Launch Claude Code and run ${cyan}/df:help${reset}.
`);
}

/**
 * Handle statusline configuration with optional prompt
 */
function handleStatusline(settings, isInteractive, callback) {
  const hasExisting = settings.statusLine != null;

  if (!hasExisting) {
    callback(true);
    return;
  }

  if (forceStatusline) {
    callback(true);
    return;
  }

  if (!isInteractive) {
    console.log(`  ${yellow}Warning${reset} Skipping statusline (already configured)`);
    console.log(`    Use ${cyan}--force-statusline${reset} to replace\n`);
    callback(false);
    return;
  }

  const existingCmd = settings.statusLine.command || settings.statusLine.url || '(custom)';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`
  ${yellow}Warning${reset} Existing statusline detected\n
  Your current statusline:
    ${dim}command: ${existingCmd}${reset}

  DevFlow includes a statusline showing:
    - Model name
    - Current task (from todo list)
    - Context window usage (color-coded)

  ${cyan}1${reset}) Keep existing
  ${cyan}2${reset}) Replace with DevFlow statusline
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    rl.close();
    const choice = answer.trim() || '1';
    callback(choice === '2');
  });
}

/**
 * Prompt for install location
 */
function promptLocation() {
  if (!process.stdin.isTTY) {
    console.log(`  ${yellow}Non-interactive terminal detected, defaulting to global install${reset}\n`);
    runInstall(true, false);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let answered = false;

  rl.on('close', () => {
    if (!answered) {
      answered = true;
      console.log(`\n  ${yellow}Installation cancelled${reset}\n`);
      process.exit(0);
    }
  });

  const globalPath = getGlobalDir().replace(os.homedir(), '~');

  console.log(`  ${yellow}Where would you like to install?${reset}\n\n  ${cyan}1${reset}) Global ${dim}(${globalPath})${reset} - available in all projects
  ${cyan}2${reset}) Local  ${dim}(./.claude)${reset} - this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    answered = true;
    rl.close();
    const choice = answer.trim() || '1';
    const isGlobal = choice !== '2';
    runInstall(isGlobal, true);
  });
}

/**
 * Run the install and handle statusline prompt
 */
function runInstall(isGlobal, isInteractive) {
  const result = install(isGlobal);

  handleStatusline(result.settings, isInteractive, (shouldInstallStatusline) => {
    finishInstall(result.settingsPath, result.settings, result.statuslineCommand, shouldInstallStatusline);
  });
}

// Main logic
if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (explicitConfigDir && hasLocal) {
  console.error(`  ${yellow}Cannot use --config-dir with --local${reset}`);
  process.exit(1);
} else if (hasUninstall) {
  if (!hasGlobal && !hasLocal) {
    console.error(`  ${yellow}--uninstall requires --global or --local${reset}`);
    process.exit(1);
  }
  uninstall(hasGlobal);
} else if (hasGlobal || hasLocal) {
  runInstall(hasGlobal, false);
} else {
  // Interactive
  if (!process.stdin.isTTY) {
    console.log(`  ${yellow}Non-interactive terminal detected, defaulting to global install${reset}\n`);
    runInstall(true, false);
  } else {
    promptLocation();
  }
}
