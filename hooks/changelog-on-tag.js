#!/usr/bin/env node

/**
 * DevFlow Changelog Gate (PreToolUse, Bash)
 *
 * Fires when Claude is about to run `git tag -a vX.Y.Z`. If CHANGELOG.md
 * does not already have a heading for that version, deny the command and
 * tell Claude to run `df-tools changelog update --version vX.Y.Z` first.
 *
 * Repos without a CHANGELOG.md skip silently.
 * Tags that do not match vMAJOR.MINOR.PATCH skip silently.
 *
 * Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1
 */

const fs = require('fs');
const path = require('path');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function findRepoRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function main() {
  if (process.env.DEVFLOW_SKIP_CHANGELOG_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  // Match `git tag -a vX.Y.Z` or `git tag vX.Y.Z` (annotated or lightweight)
  const m = cmd.match(/\bgit\s+tag\s+(?:-a\s+)?(?:-m\s+\S+\s+)?(v\d+\.\d+\.\d+)\b/);
  if (!m) return;

  const tag = m[1];
  const version = tag.replace(/^v/, '');
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) return;

  const clPath = path.join(repoRoot, 'CHANGELOG.md');
  if (!fs.existsSync(clPath)) return; // No CHANGELOG = nothing to gate

  const content = fs.readFileSync(clPath, 'utf-8');
  const versionRe = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm');
  if (versionRe.test(content)) return; // Already documented — pass through

  deny([
    `CHANGELOG.md has no entry for ${tag}.`,
    `Run before tagging:`,
    `  node ~/.claude/devflow/bin/df-tools.cjs changelog update --version ${tag}`,
    `Then commit the CHANGELOG update, then re-run the tag command.`,
    `Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1`,
  ].join(' '));
}

main();
