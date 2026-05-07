#!/usr/bin/env node

/**
 * DevFlow Tag Gate (PreToolUse, Bash)
 *
 * Fires when Claude is about to run `git tag -a vX.Y.Z`. Enforces two invariants:
 *
 *   1. CHANGELOG.md has a heading for that version (`## [X.Y.Z]`).
 *   2. The three release manifests carry matching versions:
 *        - package.json
 *        - plugins/devflow/.claude-plugin/plugin.json
 *        - .claude-plugin/marketplace.json (the plugin entry matching plugin.json `.name`)
 *
 * If CHANGELOG is missing the entry, denies and tells Claude to run
 * `df-tools changelog update --version vX.Y.Z` first.
 *
 * If any manifest version disagrees with the tag, denies with a per-file
 * mismatch listing.
 *
 * Repos without a CHANGELOG.md skip the changelog check silently.
 * Repos missing any of the three manifests skip the version-sync check silently
 * (so the hook stays a no-op for repos that aren't this one).
 * Tags that do not match vMAJOR.MINOR.PATCH skip silently.
 *
 * Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1 (covers both checks).
 *
 * Filename intentionally retained as `changelog-on-tag.js` for now; rename deferred.
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

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
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
  if (!versionRe.test(content)) {
    deny([
      `CHANGELOG.md has no entry for ${tag}.`,
      `Run before tagging:`,
      `  node ~/.claude/devflow/bin/df-tools.cjs changelog update --version ${tag}`,
      `Then commit the CHANGELOG update, then re-run the tag command.`,
      `Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1`,
    ].join(' '));
  }

  // Manifest version-sync check.
  const pkg = readJsonSafe(path.join(repoRoot, 'package.json'));
  const plugin = readJsonSafe(path.join(repoRoot, 'plugins/devflow/.claude-plugin/plugin.json'));
  const market = readJsonSafe(path.join(repoRoot, '.claude-plugin/marketplace.json'));

  // Skip silently if any of the three are absent / unparseable — keeps hook a no-op for other repos.
  if (!pkg || !plugin || !market) return;
  if (!Array.isArray(market.plugins) || market.plugins.length === 0) return;

  const pluginName = plugin.name;
  const marketEntry =
    market.plugins.find((p) => p && p.name === pluginName) || market.plugins[0];

  const mismatches = [];
  if (pkg.version !== version) {
    mismatches.push(`  package.json: ${pkg.version} (expected ${version})`);
  }
  if (plugin.version !== version) {
    mismatches.push(`  plugins/devflow/.claude-plugin/plugin.json: ${plugin.version} (expected ${version})`);
  }
  if (marketEntry && marketEntry.version !== version) {
    mismatches.push(`  .claude-plugin/marketplace.json [${marketEntry.name}]: ${marketEntry.version} (expected ${version})`);
  }

  if (mismatches.length > 0) {
    deny([
      `Manifest versions out of sync for tag ${tag}:`,
      ...mismatches,
      ``,
      `Update each file to ${version} and commit before tagging.`,
      `Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1`,
    ].join('\n'));
  }
}

main();
