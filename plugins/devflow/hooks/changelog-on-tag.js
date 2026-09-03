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
 * Commit-ish awareness (quick task 15): when the gated command names a
 * commit-ish (`git tag -a vX.Y.Z <commit-ish>`, in either git-accepted
 * position), all four gated files are read from THAT COMMIT's tree via
 * `git show <commit-ish>:<path>` instead of the working tree — so
 * retroactively tagging a historical commit is judged against its own tree,
 * not whatever the working tree happens to be on right now. The commit-ish is
 * verified with `git rev-parse --verify <c>^{commit}` first; if it doesn't
 * resolve to a real commit, the hook silently falls back to today's
 * working-tree behavior (never denies or throws on a bad ref). No commit-ish
 * at all => working-tree behavior, structurally unchanged.
 *
 * Repos without a CHANGELOG.md (at the resolved tree) skip the changelog
 * check silently — and that return skips the manifest check too.
 * Repos missing any of the three manifests (at the resolved tree) skip the
 * version-sync check silently (so the hook stays a no-op for repos that
 * aren't this one).
 * Tags that do not match vMAJOR.MINOR.PATCH skip silently.
 *
 * Detection is invocation-aware (mirrors TRD 27-04's gate-commits.js fix):
 * heredoc bodies and quoted arguments are stripped (via the shared
 * stripHeredocs/stripQuoted helpers) before the tag-command regex runs, so a
 * command that merely MENTIONS a tag command inside quotes (e.g.
 * `echo "git tag -a v9.9.9 -m x"`) is not treated as an invocation.
 *
 * Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1 (covers both checks, with or
 * without a commit-ish).
 *
 * Filename intentionally retained as `changelog-on-tag.js` for now; rename deferred.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { stripHeredocs, stripQuoted } = require('./gate-commits.js');

// Flags that consume the NEXT token as their value (never a commit-ish candidate).
const VALUE_FLAGS = new Set(['-m', '--message', '-F', '--file', '-u', '--local-user']);
// Tokens that stop the positional scan (shell control-flow, not part of `git tag`).
const SEPARATORS = new Set(['&&', '||', ';', '|', ')']);

// Today's tag-matching regex, unchanged — applied to the CLEANED command (see parseTagCommand).
const TAG_RE = /\bgit\s+tag\s+(?:-a\s+)?(?:-m\s+\S+\s+)?(v\d+\.\d+\.\d+)\b/;

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

function parseJsonSafe(text) {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Parses a (possibly heredoc/quote-laden) shell command string into the tag
 * being created and an optional commit-ish, if the command actually invokes
 * `git tag -a vX.Y.Z [...]`.
 *
 * Returns `{ tag, commitish }` (commitish may be null) or `null` when the
 * command does not invoke a tag command at all (including when the only
 * apparent invocation was inside a heredoc body or a quoted string).
 *
 * @param {string} cmd
 * @returns {{ tag: string, commitish: string|null } | null}
 */
function parseTagCommand(cmd) {
  const cleaned = stripQuoted(stripHeredocs(String(cmd || '')));
  const m = cleaned.match(TAG_RE);
  if (!m) return null;

  const tag = m[1];

  // Tokenize from the matched point onward so we can walk positionals after the tag.
  const tokens = cleaned.slice(m.index).split(/\s+/).filter(Boolean);
  // tokens[0..] look like: git tag -a v2.6.0 <rest...> — find the tag token, then walk after it.
  const tagIdx = tokens.indexOf(tag);
  let commitish = null;

  for (let i = tagIdx + 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (SEPARATORS.has(tok)) break;
    if (tok.startsWith('-')) {
      if (VALUE_FLAGS.has(tok)) i++; // skip the flag's value too
      continue;
    }
    // First non-flag, non-separator token after the tag is the commit-ish.
    commitish = tok;
    break;
  }

  return { tag, commitish };
}

/**
 * Verifies `commitish` resolves to a real commit. Returns the same string on
 * success, or null on any failure (bad ref, git missing, not a repo) — never
 * throws.
 *
 * @param {string} repoRoot
 * @param {string} commitish
 * @returns {string|null}
 */
function resolveCommit(repoRoot, commitish) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${commitish}^{commit}`], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return commitish;
  } catch {
    return null;
  }
}

/**
 * Builds a tree reader for the four gated files. With no commitish, reads the
 * working tree via `fs` (today's behavior, structurally unchanged). With a
 * resolved commitish, reads via `git show <commitish>:<path>` — absent paths
 * and any git failure return null, mirroring `fs.existsSync` false today.
 *
 * @param {string} repoRoot
 * @param {string|null} commitish
 * @returns {{ commitish: string|null, read: (rel: string) => string|null }}
 */
function makeTreeReader(repoRoot, commitish) {
  if (!commitish) {
    return {
      commitish: null,
      read: (rel) => {
        const p = path.join(repoRoot, rel);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
      },
    };
  }
  return {
    commitish,
    read: (rel) => {
      try {
        return execFileSync('git', ['show', `${commitish}:${rel}`], {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 32 * 1024 * 1024,
        });
      } catch {
        return null;
      }
    },
  };
}

function main() {
  if (process.env.DEVFLOW_SKIP_CHANGELOG_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  const parsed = parseTagCommand(cmd);
  if (!parsed) return;

  const { tag } = parsed;
  const version = tag.replace(/^v/, '');
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) return;

  const commitish = parsed.commitish ? resolveCommit(repoRoot, parsed.commitish) : null;
  const reader = makeTreeReader(repoRoot, commitish);
  const at = commitish ? ` (at commit ${commitish})` : '';

  const content = reader.read('CHANGELOG.md');
  if (content === null) return; // No CHANGELOG at the resolved tree = nothing to gate (skips manifest check too)

  const versionRe = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm');
  if (!versionRe.test(content)) {
    deny([
      `CHANGELOG.md has no entry for ${tag}${at}.`,
      `Run before tagging:`,
      `  node ~/.claude/devflow/bin/df-tools.cjs changelog update --version ${tag}`,
      `Then commit the CHANGELOG update, then re-run the tag command.`,
      `Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1`,
    ].join(' '));
  }

  // Manifest version-sync check.
  const pkg = parseJsonSafe(reader.read('package.json'));
  const plugin = parseJsonSafe(reader.read('plugins/devflow/.claude-plugin/plugin.json'));
  const market = parseJsonSafe(reader.read('.claude-plugin/marketplace.json'));

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
      `Manifest versions out of sync for tag ${tag}${at}:`,
      ...mismatches,
      ``,
      `Update each file to ${version} and commit before tagging.`,
      `Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1`,
    ].join('\n'));
  }
}

if (require.main === module) main();

module.exports = {
  parseTagCommand,
  makeTreeReader,
  resolveCommit,
};
