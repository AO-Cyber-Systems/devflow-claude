'use strict';

/**
 * Tests for changelog-on-tag.js PreToolUse hook
 *
 * Quick task 15: the hook previously validated CHANGELOG.md + the three
 * release manifests against the WORKING TREE unconditionally, even when the
 * gated `git tag -a vX.Y.Z <commit-ish>` command named a specific commit-ish.
 * Retroactive/backfill tagging of a historical commit was therefore judged
 * against the wrong tree. This suite locks in commit-ish-aware resolution:
 *
 *   - No commit-ish => working-tree behavior, byte-for-byte unchanged.
 *   - A commit-ish (either accepted position) => resolved via
 *     `git rev-parse --verify <c>^{commit}`; on success all four gated files
 *     are read via `git show <c>:<path>` instead of `fs`.
 *   - Unresolvable commit-ish => silent fallback to the working-tree reader.
 *     Never deny, never throw.
 *
 * Also locks in TRD 27-04-style invocation-aware detection (ported from
 * gate-commits.js via the shared stripHeredocs/stripQuoted helpers): a
 * command that merely MENTIONS a tag command inside quotes no longer fires
 * the gate.
 *
 * Harness: subprocess spawn with JSON piped to stdin, real throwaway git
 * fixture repos hand-built in os.tmpdir() via execFileSync (never Bash —
 * building repos from a Bash tool call would itself trip gate-commits.js).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'changelog-on-tag.js');

// ---------------------------------------------------------------------------
// Fixture builder — hand-written, no generated/sampled data.
// ---------------------------------------------------------------------------

/** Hand-built manifest shapes. Only the fields the hook reads. */
function manifests(version, marketEntryVersion = version) {
  return {
    'package.json': JSON.stringify({ name: 'x', version }, null, 2),
    'plugins/devflow/.claude-plugin/plugin.json': JSON.stringify({ name: 'devflow', version }, null, 2),
    '.claude-plugin/marketplace.json': JSON.stringify({
      name: 'aocyber',
      version,
      plugins: [{ name: 'devflow', version: marketEntryVersion }],
    }, null, 2),
    'CHANGELOG.md': `# Changelog\n\n## [${version}] - 2026-01-01\n\n- entry\n`,
  };
}

/**
 * Same shape as manifests(), but the CHANGELOG.md entry is for `tagVersion`
 * while the three manifest files carry `manifestVersion`. Needed whenever a
 * test wants the CHANGELOG check to PASS (entry matches the tag under test)
 * so the manifest-mismatch deny is the one that actually fires and can be
 * asserted on — using manifests(X) alone ties both checks to the same X and
 * the CHANGELOG check (which runs first) masks the manifest assertion.
 */
function manifestsForTag(tagVersion, manifestVersion, marketEntryVersion = manifestVersion) {
  const m = manifests(manifestVersion, marketEntryVersion);
  m['CHANGELOG.md'] = `# Changelog\n\n## [${tagVersion}] - 2026-01-01\n\n- entry\n`;
  return m;
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

/**
 * Returns { root, sha, cleanup }. `commitFiles` is committed; `worktreeFiles`
 * (optional) is then written on top WITHOUT committing, so the two trees
 * differ. `branches` (optional) are created pointing at the commit.
 */
function mkRepo({ commitFiles, worktreeFiles, branches = [] }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-on-tag-')));
  const git = (...args) => execFileSync('git', [
    '-c', 'user.email=t@t', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  git('init', '-q', '.');
  writeTree(root, commitFiles);
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  for (const b of branches) git('branch', b);
  if (worktreeFiles) writeTree(root, worktreeFiles); // uncommitted divergence
  return { root, sha, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function runHook(payload, cwd, extraEnv = {}) {
  const env = { ...process.env, DEVFLOW_SKIP_CHANGELOG_GATE: undefined, ...extraEnv };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd, input: JSON.stringify(payload), encoding: 'utf-8', env,
  });
}

function isDeny(stdout) {
  if (!stdout || stdout.trim() === '') return false;
  try {
    const parsed = JSON.parse(stdout);
    return parsed.hookSpecificOutput &&
      parsed.hookSpecificOutput.permissionDecision === 'deny';
  } catch {
    return false;
  }
}

function isPassThrough(stdout) {
  return !stdout || stdout.trim() === '';
}

function denyReason(stdout) {
  return JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason;
}

function tagCmd(tag, extra) {
  return `git tag -a ${tag} ${extra}`;
}

// ---------------------------------------------------------------------------
// Integration cases (subprocess, real git fixture repos)
// ---------------------------------------------------------------------------

describe('changelog-on-tag — commit-ish-aware tree resolution', () => {

  // 1. No commit-ish, working tree in sync => pass through (existing behavior)
  test('case 1: no commit-ish, working tree in sync => pass through', () => {
    const { root, cleanup } = mkRepo({ commitFiles: manifests('2.6.0') });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: tagCmd('v2.6.0', '-m "release"'),
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 2. No commit-ish, working tree out of sync => deny citing working-tree values
  test('case 2: no commit-ish, working tree out of sync => deny citing working-tree values', () => {
    const { root, cleanup } = mkRepo({
      commitFiles: manifests('2.6.0'),
      // CHANGELOG entry matches the tag so the (earlier) changelog check
      // passes and the manifest-mismatch deny is the one that actually fires.
      worktreeFiles: manifestsForTag('2.6.0', '2.7.0'),
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: tagCmd('v2.6.0', '-m "release"'),
      } }, root);
      assert.ok(isDeny(r.stdout), `expected deny, got: ${r.stdout}`);
      assert.match(denyReason(r.stdout), /2\.7\.0/);
    } finally { cleanup(); }
  });

  // 3. HEADLINE: commit-ish tree fully in sync, working tree disagrees => pass through
  test('case 3 (HEADLINE): commit-ish tree in sync, working tree disagrees => pass through', () => {
    const { root, sha, cleanup } = mkRepo({
      commitFiles: manifests('2.6.0'),   // committed tree: all 2.6.0
      worktreeFiles: manifests('2.7.0'), // working tree:   all 2.7.0
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: `git tag -a v2.6.0 ${sha} -m "release"`,
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 4. Commit-ish with a manifest mismatch => deny citing the COMMIT's values, names the commit-ish
  test('case 4: commit-ish manifest mismatch => deny citing commit values, not working tree', () => {
    const { root, sha, cleanup } = mkRepo({
      commitFiles: manifests('2.6.0', '2.5.0'), // mirrors 556f8d3: marketplace entry stale
      worktreeFiles: manifests('2.7.0'),
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: `git tag -a v2.6.0 ${sha} -m "release"`,
      } }, root);
      assert.ok(isDeny(r.stdout), `expected deny, got: ${r.stdout}`);
      const reason = denyReason(r.stdout);
      assert.match(reason, /2\.5\.0/);
      assert.doesNotMatch(reason, /2\.7\.0/);
      assert.match(reason, new RegExp(sha));
    } finally { cleanup(); }
  });

  // 5. Commit-ish with no CHANGELOG entry at that commit (working tree HAS it) => deny with changelog message
  test('case 5: commit-ish missing changelog entry => deny with changelog message', () => {
    const commitFiles = manifests('2.6.0');
    commitFiles['CHANGELOG.md'] = '# Changelog\n\n## [2.5.0] - 2026-01-01\n\n- entry\n';
    const { root, sha, cleanup } = mkRepo({
      commitFiles,
      worktreeFiles: manifests('2.6.0'), // working tree HAS the 2.6.0 entry
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: `git tag -a v2.6.0 ${sha} -m "release"`,
      } }, root);
      assert.ok(isDeny(r.stdout), `expected deny, got: ${r.stdout}`);
      assert.match(denyReason(r.stdout), /CHANGELOG\.md has no entry/);
    } finally { cleanup(); }
  });

  // 6. Commit-ish with CHANGELOG.md entirely absent at that commit => pass through (full return)
  test('case 6: CHANGELOG.md absent at commit => pass through (manifest check skipped too)', () => {
    const commitFiles = manifests('2.6.0', '9.9.9'); // manifest mismatch at commit
    delete commitFiles['CHANGELOG.md']; // never committed
    const { root, sha, cleanup } = mkRepo({ commitFiles });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: `git tag -a v2.6.0 ${sha} -m "release"`,
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 7. `-m "release message"` + branch named "message" + no real commit-ish => pass through
  test('case 7: -m "release message" is not read as a commit-ish (discriminating)', () => {
    const { root, cleanup } = mkRepo({
      commitFiles: manifests('9.9.9'),   // stale tree, reachable as branch "message"
      worktreeFiles: manifests('2.6.0'), // working tree in sync with the tag
      branches: ['message'],
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: 'git tag -a v2.6.0 -m "release message"',
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 8. Commit-ish in trailing position => same result as leading position
  test('case 8: trailing-position commit-ish (tag -a <tag> -m <msg> <commit>) => pass through', () => {
    const { root, sha, cleanup } = mkRepo({
      commitFiles: manifests('2.6.0'),
      worktreeFiles: manifests('2.7.0'),
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: `git tag -a v2.6.0 -m "release" ${sha}`,
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 9. `-u <keyid> <commit>` => keyid not read as the commit-ish
  test('case 9: -u <keyid> <commit> => keyid is not read as the commit-ish', () => {
    const { root, sha, cleanup } = mkRepo({
      // CHANGELOG entry matches the tag so the commit's manifest mismatch
      // (not the changelog check) is the one that fires and can be asserted on.
      commitFiles: manifestsForTag('2.6.0', '9.9.9'), // out of sync with the tag
      worktreeFiles: manifests('2.6.0'), // in sync with the tag
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: `git tag -a v2.6.0 -u someone@example.com ${sha} -m "release"`,
      } }, root);
      // Correct parsing resolves `sha` as the commit-ish (out of sync) => deny.
      // If the keyid were misread as the commit-ish, it would fail rev-parse,
      // fall back to the in-sync working tree, and pass through instead.
      assert.ok(isDeny(r.stdout), `expected deny (proves keyid was skipped), got: ${r.stdout}`);
      const reason = denyReason(r.stdout);
      assert.match(reason, /9\.9\.9/);
      assert.doesNotMatch(reason, /someone@example\.com/);
    } finally { cleanup(); }
  });

  // 10. Unresolvable commit-ish + out-of-sync working tree => deny citing WORKING-TREE values
  test('case 10: unresolvable commit-ish falls back to working tree (proves fallback reads it)', () => {
    const { root, cleanup } = mkRepo({
      commitFiles: manifests('2.6.0'),
      // CHANGELOG entry matches the tag so the manifest-mismatch deny fires.
      worktreeFiles: manifestsForTag('2.6.0', '2.7.0'),
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: 'git tag -a v2.6.0 deadbeefdeadbeef -m "release"',
      } }, root);
      assert.ok(isDeny(r.stdout), `expected deny, got: ${r.stdout}`);
      assert.match(denyReason(r.stdout), /2\.7\.0/);
    } finally { cleanup(); }
  });

  // 11. DEVFLOW_SKIP_CHANGELOG_GATE=1 bypasses, both with and without a commit-ish
  test('case 11a: escape hatch bypasses without a commit-ish', () => {
    const { root, cleanup } = mkRepo({
      commitFiles: manifests('2.6.0'),
      worktreeFiles: manifests('2.7.0'),
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: tagCmd('v2.6.0', '-m "release"'),
      } }, root, { DEVFLOW_SKIP_CHANGELOG_GATE: '1' });
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  test('case 11b: escape hatch bypasses with a commit-ish', () => {
    const { root, sha, cleanup } = mkRepo({
      commitFiles: manifests('2.6.0', '2.5.0'),
      worktreeFiles: manifests('2.7.0'),
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: `git tag -a v2.6.0 ${sha} -m "release"`,
      } }, root, { DEVFLOW_SKIP_CHANGELOG_GATE: '1' });
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 12. Command separator stops the scan; behaves as no-commit-ish
  test('case 12: && separator stops the token scan; behaves as no-commit-ish', () => {
    const { root, cleanup } = mkRepo({
      commitFiles: manifests('1.0.0'),
      // CHANGELOG entry matches the tag so the manifest-mismatch deny fires.
      worktreeFiles: manifestsForTag('1.0.0', '2.6.0'),
    });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: 'git tag -a v1.0.0 && git push origin v1.0.0',
      } }, root);
      assert.ok(isDeny(r.stdout), `expected deny, got: ${r.stdout}`);
      assert.match(denyReason(r.stdout), /2\.6\.0/);
    } finally { cleanup(); }
  });

  // 13. Command merely MENTIONING a tag command inside quotes => pass through (live-reproduced false positive)
  test('case 13: quoted mention of a tag command is not an invocation', () => {
    const { root, cleanup } = mkRepo({ commitFiles: manifests('2.6.0') });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: 'echo "git tag -a v9.9.9 -m x"',
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 14. tool_name !== 'Bash' => pass through
  test('case 14: tool_name !== "Bash" => pass through', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-on-tag-nonbash-')));
    try {
      const r = runHook({ tool_name: 'Edit', tool_input: {
        command: 'git tag -a v9.9.9 -m x',
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  // 15. Non-semver tag => pass through
  test('case 15: non-semver tag => pass through', () => {
    const { root, cleanup } = mkRepo({ commitFiles: manifests('2.6.0') });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: 'git tag -a release-1 -m "x"',
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 16. Repo with no CHANGELOG.md and no manifests => pass through (no-op for other repos)
  test('case 16: repo with no CHANGELOG.md and no manifests => pass through', () => {
    const { root, cleanup } = mkRepo({ commitFiles: { 'README.md': '# hi\n' } });
    try {
      const r = runHook({ tool_name: 'Bash', tool_input: {
        command: 'git tag -a v1.0.0 -m "x"',
      } }, root);
      assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
    } finally { cleanup(); }
  });

  // 17. Real history: v2.6.0 at 556f8d3 denies on the marketplace entry alone (conditional)
  const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: __dirname, encoding: 'utf-8',
  }).trim();

  function hasCommit(sha) {
    try {
      execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: REPO_ROOT, stdio: 'ignore' });
      return true;
    } catch { return false; }
  }

  const commit556Present = hasCommit('556f8d3');

  test('case 17: real history — v2.6.0 at 556f8d3 denies on the marketplace entry alone', {
    skip: commit556Present ? false : 'commit 556f8d3 not present in this checkout',
  }, () => {
    const r = runHook({ tool_name: 'Bash', tool_input: {
      command: 'git tag -a v2.6.0 556f8d3 -m "release"',
    } }, REPO_ROOT);
    assert.ok(isDeny(r.stdout), `expected deny, got: ${r.stdout}`);
    const reason = denyReason(r.stdout);
    assert.match(reason, /marketplace\.json \[devflow\]: 2\.5\.0/);
    assert.doesNotMatch(reason, /package\.json/);
  });

});

// ---------------------------------------------------------------------------
// Unit cases — direct require of the exported parser
// ---------------------------------------------------------------------------

const { parseTagCommand } = require('./changelog-on-tag.js');

describe('changelog-on-tag — parseTagCommand()', () => {

  test('case 18: leading-position commit-ish', () => {
    assert.deepEqual(
      parseTagCommand('git tag -a v2.6.0 556f8d3 -m "x"'),
      { tag: 'v2.6.0', commitish: '556f8d3' },
    );
  });

  test('case 19: trailing-position commit-ish', () => {
    assert.deepEqual(
      parseTagCommand('git tag -a v2.6.0 -m "x" 556f8d3'),
      { tag: 'v2.6.0', commitish: '556f8d3' },
    );
  });

  test('case 20: no commit-ish, multi-word message', () => {
    assert.deepEqual(
      parseTagCommand('git tag -a v1.0.0 -m "multi word msg"'),
      { tag: 'v1.0.0', commitish: null },
    );
  });

  test('case 21: -u value-consuming flag does not eat the commit-ish', () => {
    const result = parseTagCommand('git tag -a v1.0.0 -u alice 556f8d3');
    assert.equal(result.commitish, '556f8d3');
  });

  test('case 22: quoted mention => null', () => {
    assert.equal(parseTagCommand('echo "git tag -a v9.9.9"'), null);
  });

});
