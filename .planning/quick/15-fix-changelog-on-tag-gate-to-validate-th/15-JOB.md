---
quick_task: 15-fix-changelog-on-tag-gate-to-validate-th
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/changelog-on-tag.js
  - plugins/devflow/hooks/changelog-on-tag.test.js
autonomous: true
must_haves:
  - "When `git tag -a vX.Y.Z <commit-ish>` names a commit-ish, CHANGELOG.md and the three manifests are read from THAT commit via `git show <commitish>:<path>`, not the working tree"
  - "When no commit-ish is given, file resolution is byte-for-byte today's working-tree behavior"
  - "Commit-ish is found in either git-accepted position: `tag -a <tag> <commit> -m <msg>` AND `tag -a <tag> -m <msg> <commit>`"
  - "Value-consuming flags (-m/--message, -F/--file, -u/--local-user) never have their value read as a commit-ish; -a/-s/-f are boolean"
  - "`stripHeredocs` and `stripQuoted` are REQUIRED from gate-commits.js, not reimplemented"
  - "A candidate that fails `git rev-parse --verify <c>^{commit}` falls back to working-tree behavior — no crash, no deny"
  - "CHANGELOG.md absent at the resolved commit behaves exactly as CHANGELOG.md absent in the working tree does today (full return, both checks skipped)"
  - "Manifests absent at the resolved commit skip the version-sync check silently"
  - "All git invocation is `execFileSync` with an args array — never a shell string"
  - "DEVFLOW_SKIP_CHANGELOG_GATE=1 still bypasses both checks"
  - "Deny messages for the commit-ish path cite the COMMIT's values and name the commit-ish"
  - "`main()` is guarded by `require.main === module` and the command parser is exported for unit testing"
  - "plugins/devflow/hooks/changelog-on-tag.test.js exists and covers all 7 required cases plus parity cases"
  - "npm test shows no NEW failures against the 2935-test / 10-known-failure baseline"
---

<objective>
Fix `plugins/devflow/hooks/changelog-on-tag.js` so that when the gated `git tag` command names a commit-ish, the gate validates **that commit's tree** instead of the working tree. Add the missing test file.

**Real repro from this session.** The hook reads CHANGELOG.md and the three release manifests from the working tree unconditionally. Tagging a historical commit therefore validates the wrong tree:

```
git tag -a v2.6.0 556f8d3 -m "..."
  -> DENIED: package.json: 2.7.0 (expected 2.6.0)
```

556f8d3's own tree has package.json at 2.6.0. The working tree was on 2.7.0. Retroactive/backfill tagging was impossible without the escape hatch; the tag had to be created server-side through the GitHub API instead.

**The fix is narrow: change WHICH TREE is inspected, never the strictness of the rule.** See `<important_subtlety>` — after this fix `git tag -a v2.6.0 556f8d3` must STILL be denied, on the marketplace plugin entry alone, because that commit really was internally inconsistent.

Output: 1 hook modified, 1 test file created (the hook is the only one of 15 with no adjacent `.test.js`).
</objective>

<file_tree>
plugins/devflow/hooks/
├── changelog-on-tag.js          ← MODIFY  (commit-ish parsing + git-show tree reader)
├── changelog-on-tag.test.js     ← CREATE  (none exists today)
└── gate-commits.js              ← READ ONLY (source of stripHeredocs / stripQuoted)
</file_tree>

<embedded_context>

  <codebase_examples>
    <example name="the helpers to REQUIRE — plugins/devflow/hooks/gate-commits.js:49-64,133-139">
Already implemented and exported by TRD 27-04. **Require them. Do not reimplement.**

```js
function stripHeredocs(cmd) {
  return cmd.replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm,
    ' <<HEREDOC '
  );
}

function stripQuoted(cmd) {
  return cmd
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

// bottom of file:
if (require.main === module) main();

module.exports = { invokesGitCommit, stripHeredocs, stripQuoted };
```

`main()` is guarded by `require.main === module`, so requiring this module from
changelog-on-tag.js has NO side effects. Verified.

Import as:
```js
const { stripHeredocs, stripQuoted } = require('./gate-commits.js');
```
    </example>

    <example name="current hook style — plugins/devflow/hooks/changelog-on-tag.js">
Synchronous fs, `deny()` writing a PreToolUse JSON blob then `process.exit(0)`,
silent `return` for every not-applicable case. Preserve all of it.

```js
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
  } catch { return null; }
}
```

The four gated paths, all repo-root-relative (`findRepoRoot` returns the dir
containing `.git`, so these are exactly the paths `git show` wants):
```
CHANGELOG.md
package.json
plugins/devflow/.claude-plugin/plugin.json
.claude-plugin/marketplace.json
```
    </example>

    <example name="test harness shape — plugins/devflow/hooks/gate-commits.test.js:20-70">
Follow this structure: node:test + node:assert/strict, subprocess spawn with the
payload piped to stdin, `fs.realpathSync` on the tmpdir (macOS /var -> /private/var),
explicit deletion of the escape-hatch env var.

```js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-commits.js');

function mkTmpProject(setup) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-commits-')));
  if (setup) setup(root);
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function runHook(payload, cwd, extraEnv = {}) {
  const env = { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: undefined, ...extraEnv };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd, input: JSON.stringify(payload), encoding: 'utf-8', env,
  });
}

function isDeny(stdout) { /* JSON.parse -> permissionDecision === 'deny' */ }
function isPassThrough(stdout) { return !stdout || stdout.trim() === ''; }
```
    </example>
  </codebase_examples>

  <probe_results>
Every design assumption below was verified live in this repo before planning.
Do not re-derive them; do not contradict them.

**1. `stripQuoted(stripHeredocs(cmd))` collapses each quoted message to ONE token.**
```
'git tag -a v2.6.0 556f8d3 -m "release notes here"'
  -> tokens ["git","tag","-a","v2.6.0","556f8d3","-m","\"\""]
'git tag -a v2.6.0 -m "release notes here" 556f8d3'
  -> tokens ["git","tag","-a","v2.6.0","-m","\"\"","556f8d3"]
"git tag -a v1.0.0 -m 'single quoted message'"
  -> tokens ["git","tag","-a","v1.0.0","-m","''"]
'git tag -a v1.0.0 -u alice@example.com 556f8d3'
  -> tokens ["git","tag","-a","v1.0.0","-u","alice@example.com","556f8d3"]
'git tag -a v1.0.0 && git push origin v1.0.0'
  -> tokens ["git","tag","-a","v1.0.0","&&","git","push","origin","v1.0.0"]
'echo "git tag -a v9.9.9 -m x"'
  -> "echo \"\""    (tag text gone entirely)
```
So after stripping, whitespace tokenization is sufficient — no shell-grade parser needed.

**2. git accepts the commit-ish in BOTH positions** (git 2.50.1, verified):
`git tag -a <tag> <commit> -m <msg>` => ACCEPTED
`git tag -a <tag> -m <msg> <commit>` => ACCEPTED

**3. `git show <sha>:absent-path`** throws, `e.status === 128`,
stderr `fatal: path 'nope.md' does not exist in '<sha>'`.

**4. `git rev-parse --verify <c>^{commit}`** on `deadbeefdeadbeef`, `&&`, `-m`,
and `message` (no such ref) all exit 128 => unresolved. Safe fallback signal.

**5. A branch literally named `message` DOES resolve.** This is what makes the
`-m "release message"` test discriminating — see `<gotchas>`.

**6. Real history, verified with `git show`:**
```
556f8d3:package.json                                  2.6.0
556f8d3:plugins/devflow/.claude-plugin/plugin.json    2.6.0
556f8d3:.claude-plugin/marketplace.json  top-level    2.6.0
556f8d3:.claude-plugin/marketplace.json  [devflow]    2.5.0   <-- genuinely stale
556f8d3:CHANGELOG.md  has "## [2.6.0]"                yes
working tree package.json                             2.7.0
```
  </probe_results>

  <second_bug_reproduced_live>
While probing, this planning session ran:

```
node -e "... 'git tag -a v2.6.0 556f8d3 -m \"release notes here\"' ..."
```

— a Node one-liner with the tag command inside a **JS string literal**. The hook
DENIED it. It matches the raw command text, so any command that merely *mentions*
a tag command is refused. This is the exact false-positive class TRD 27-04 fixed
for `gate-commits.js` and never backported here.

**Decision (deliberate, in scope):** run the firing regex against the CLEANED
string, not the raw one. Justification that this cannot lose a true positive:

- Stripping only ever REMOVES text, so the change is a pure narrowing.
- `git tag -a v2.6.0 -m "msg"` — tag token is unquoted, survives stripping, still fires.
- `git tag -a "v2.6.0"` — quoted tag. Does NOT fire today either (today's regex
  needs `v` immediately after `-a `, and finds `"`). Parity, no gating lost.
  </second_bug_reproduced_live>

  <anti_patterns>
    - Do NOT reimplement `stripHeredocs` / `stripQuoted`. Require them from `./gate-commits.js`.
    - Do NOT build a shell command string. `execFileSync('git', [...args])`, no `shell: true`, ever.
    - Do NOT let an unresolvable commit-ish deny or throw. Unresolvable => working-tree fallback.
    - Do NOT treat a token beginning with `-` as a commit-ish candidate (guards `git rev-parse --verify` against option injection).
    - Do NOT change what the manifest check compares. `marketEntry.version` only; the marketplace TOP-LEVEL `.version` stays uncompared (it is the bundle version).
    - Do NOT "fix" the 556f8d3 denial. It is correct. See `<important_subtlety>`.
    - Do NOT widen the firing regex to accept `-s` / `-f` / git global flags (`-C`, `-c`). Out of scope — see `<out_of_scope>`.
    - Do NOT introduce a second env var. `DEVFLOW_SKIP_CHANGELOG_GATE=1` covers everything.
    - Do NOT add dependencies or async. Sync + core modules only, matching the file.
    - Do NOT write test fixtures anywhere inside the project tree. `os.tmpdir()` only.
    - Do NOT chase the 10 pre-existing `npm test` failures.
  </anti_patterns>

  <error_recovery>
    - `git show` throws (path absent at commit, or bad object) => treat as "file not present" => `null`, same as `fs.existsSync` false today.
    - `git rev-parse --verify` throws => candidate is not a commit => reader falls back to the working tree.
    - `git` binary missing / not a repo => every git call throws => caught => working-tree behavior. Hook never crashes.
    - JSON.parse throws on a blob read from a commit => `null` => version-sync check skipped silently.
    - No commit-ish token at all => reader is the working-tree reader => unchanged behavior.
    - Suppress git's stderr on expected failures (`stdio: ['ignore','pipe','ignore']`) so the hook stays silent.
  </error_recovery>
</embedded_context>

<important_subtlety>
**This is a correctness trap. Read it before writing the manifest test.**

At 556f8d3 the marketplace **plugin entry** for `devflow` was genuinely `2.5.0`,
while package.json, plugin.json and the marketplace **top-level** all read `2.6.0`.

So even after this fix, `git tag -a v2.6.0 556f8d3` **SHOULD still be denied** —
on the marketplace entry alone. That commit really was internally inconsistent.
The fix changes which tree is inspected, not how strict the rule is.

The observable difference the fix must produce:

| | before fix | after fix |
|---|---|---|
| cited mismatches | package.json 2.7.0, plugin.json 2.7.0, marketplace [devflow] 2.7.0 | marketplace [devflow] **2.5.0** only |
| source of values | working tree | commit 556f8d3 |

Assert BOTH halves: the marketplace line IS present with `2.5.0`, and
`package.json` is NOT mentioned at all.
</important_subtlety>

<gotchas>
  - **`git show` needs `cwd: repoRoot`.** `findRepoRoot()` walks up for `.git`; all four gated paths are relative to that root. Passing the hook's own cwd would break when Claude runs from a subdirectory.
  - **CHANGELOG absent => FULL return, not just "skip the changelog check".** Today line 86 is `if (!fs.existsSync(clPath)) return;` — that skips the manifest check too. Mirror that exactly on the commit path. Skipping only the changelog check would be a strictness change.
  - **Attached-value flags.** `-m"msg"` becomes `-m""` (one token, starts with `-`) and `--message=x` is one token. Rule: any token starting with `-` is a flag; only additionally consume the NEXT token when the token is exactly `-m`, `--message`, `-F`, `--file`, `-u`, `--local-user`. `-a`/`-s`/`-f` consume nothing.
  - **Stop at command separators.** `git tag -a v1.0.0 && git push origin v1.0.0` leaves `&&`, `git`, `push`, `origin`, `v1.0.0` in the token stream; without a stop, `&&` becomes positional[1]. It happens to fail `rev-parse` and fall back safely, but stop explicitly at `&&`, `||`, `;`, `|`, `)` — do not rely on the accident.
  - **The `-m` test is only discriminating if the message word is a REAL ref.** `message` does not resolve in a fresh repo, so a naive test passes even with broken parsing (unresolvable => fallback => working tree => same result). Create a branch named `message` pointing at an out-of-sync commit, then use `-m "release message"` with an in-sync working tree. Broken parsing resolves the branch and denies; correct parsing passes through.
  - **Positional[0] is the tag, positional[1] is the commit-ish.** Do not take the first positional.
  - **`main()` is currently unguarded** (`main();` at line 135, no `require.main` check) — requiring the module in a test would execute it against fd 0. Add the guard and export the parser.
  - **`maxBuffer`.** `execFileSync` defaults to 1MB; CHANGELOG.md is large and growing. Set `maxBuffer` explicitly (32MB).
  - **`fs.realpathSync` the tmpdir in tests** — macOS `/var` symlinks to `/private/var`, and `findRepoRoot` returns an unresolved path otherwise.
  - **Set git identity per-invocation in fixtures** (`-c user.email=... -c user.name=... -c commit.gpgsign=false`); do not depend on the machine's global git config.
  - **Both hooks gate this session's own Bash calls.** `gate-commits` blocks the `git commit` needed to build a fixture repo from a Bash call, and inline `VAR=1 cmd` does not reach hooks. Build fixture repos from Node (`execFileSync`) inside the test file — that is not a Bash tool call, so no gate applies. This is why the fixture builder must live in the test file, not in a shell setup script.
</gotchas>

<test_list>
Behavior cases, outermost first. Write these as failing tests BEFORE touching the hook.

**Integration (subprocess, real git fixture repos)**
1. No commit-ish, working tree in sync => pass through *(existing behavior preserved)*
2. No commit-ish, working tree out of sync => deny citing working-tree values *(existing behavior preserved)*
3. **HEADLINE:** commit-ish tree fully in sync, working tree disagrees => **pass through**
4. Commit-ish with a manifest mismatch => deny; message cites the COMMIT's values, not the working tree's, and names the commit-ish
5. Commit-ish with no CHANGELOG entry at that commit (working tree HAS it) => deny with the changelog message
6. Commit-ish with CHANGELOG.md entirely absent at that commit => pass through (full return, manifest check skipped too)
7. `-m "release message"` + a branch named `message` + no real commit-ish => pass through *(discriminating: proves the message word is not read as a commit-ish)*
8. Commit-ish in trailing position `tag -a <tag> -m <msg> <commit>` => same result as leading position
9. `-u <keyid> <commit>` => keyid not read as the commit-ish
10. Unresolvable commit-ish (`deadbeefdeadbeef`) + out-of-sync working tree => deny citing WORKING-TREE values *(proves fallback actually read the working tree, not merely "did not crash")*
11. `DEVFLOW_SKIP_CHANGELOG_GATE=1` bypasses, both with and without a commit-ish
12. `git tag -a v1.0.0 && git push origin v1.0.0` => separator stops the scan; behaves as no-commit-ish
13. Command merely MENTIONING a tag command inside quotes (`echo "git tag -a v9.9.9 -m x"`) => pass through *(the live-reproduced false positive)*
14. `tool_name !== 'Bash'` => pass through
15. Non-semver tag (`git tag -a release-1`) => pass through
16. Repo with no CHANGELOG.md and no manifests => pass through (no-op for other repos)
17. *(conditional, skip if `git cat-file -e 556f8d3^{commit}` fails)* real repo + `git tag -a v2.6.0 556f8d3` => deny citing `marketplace.json [devflow]: 2.5.0`, and NOT citing `package.json`

**Unit (direct require of the exported parser)**
18. `parseTagCommand('git tag -a v2.6.0 556f8d3 -m "x"')` => `{ tag: 'v2.6.0', commitish: '556f8d3' }`
19. `parseTagCommand('git tag -a v2.6.0 -m "x" 556f8d3')` => same
20. `parseTagCommand('git tag -a v1.0.0 -m "multi word msg"')` => `{ tag: 'v1.0.0', commitish: null }`
21. `parseTagCommand('git tag -a v1.0.0 -u alice 556f8d3')` => commitish `556f8d3`
22. `parseTagCommand('echo "git tag -a v9.9.9"')` => `null`
</test_list>

<task type="auto" tdd="true">
  <name>RED: create changelog-on-tag.test.js with fixture builder and full failing suite</name>
  <files>plugins/devflow/hooks/changelog-on-tag.test.js</files>
  <action>
Create `plugins/devflow/hooks/changelog-on-tag.test.js` covering every case in
`<test_list>`. No test file exists today; mirror `gate-commits.test.js` structure
(node:test `describe`/`test`, `node:assert/strict`, subprocess spawn, tmp dirs).

**Fixture builder (hand-written generator — no generated/sampled data).**

```js
const { execFileSync } = require('child_process');

// Hand-built manifest shapes. Only the fields the hook reads.
function manifests(version, marketEntryVersion = version) {
  return {
    'package.json': JSON.stringify({ name: 'x', version }, null, 2),
    'plugins/devflow/.claude-plugin/plugin.json': JSON.stringify({ name: 'devflow', version }, null, 2),
    '.claude-plugin/marketplace.json': JSON.stringify({
      name: 'aocyber', version,
      plugins: [{ name: 'devflow', version: marketEntryVersion }],
    }, null, 2),
    'CHANGELOG.md': `# Changelog\n\n## [${version}] - 2026-01-01\n\n- entry\n`,
  };
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

// Returns { root, sha, cleanup }. `commitFiles` is committed; `worktreeFiles`
// (optional) is then written on top WITHOUT committing, so the two trees differ.
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
  for (const b of branches) git('branch', b);       // e.g. a branch named "message"
  if (worktreeFiles) writeTree(root, worktreeFiles); // uncommitted divergence
  return { root, sha, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
```

**Assertion helpers:** reuse `isDeny` / `isPassThrough` from `gate-commits.test.js`,
plus a `denyReason(stdout)` that returns
`JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason` so tests can assert
on message CONTENT (required by cases 4 and 10 and 17).

**`runHook(payload, cwd, extraEnv)`** must delete `DEVFLOW_SKIP_CHANGELOG_GATE`
from the inherited env by default (the escape-hatch cases set it explicitly).

**Case 3, the headline test, concretely:**
```js
const { root, sha, cleanup } = mkRepo({
  commitFiles:   manifests('2.6.0'),                 // committed tree: all 2.6.0
  worktreeFiles: manifests('2.7.0'),                 // working tree:   all 2.7.0
});
const r = runHook({ tool_name: 'Bash', tool_input: {
  command: `git tag -a v2.6.0 ${sha} -m "release"`,
} }, root);
assert.ok(isPassThrough(r.stdout), `expected pass-through, got: ${r.stdout}`);
```
Pre-fix this DENIES (reads the 2.7.0 working tree). That is the RED signal.

**Case 4** uses `mkRepo({ commitFiles: manifests('2.6.0', '2.5.0'), worktreeFiles: manifests('2.7.0') })`
— mirroring 556f8d3. Assert the reason CONTAINS `2.5.0` and does NOT contain `2.7.0`.

**Case 7**, the discriminating `-m` test:
```js
const { root, sha, cleanup } = mkRepo({
  commitFiles:   manifests('9.9.9'),        // stale tree, reachable as branch "message"
  worktreeFiles: manifests('2.6.0'),        // working tree in sync with the tag
  branches: ['message'],
});
const r = runHook({ tool_name: 'Bash', tool_input: {
  command: 'git tag -a v2.6.0 -m "release message"',
} }, root);
assert.ok(isPassThrough(r.stdout));  // broken parsing resolves branch "message" -> denies
```

**Case 17** is conditional. Compute the skip up front so a shallow clone never fails:
```js
function hasCommit(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`],
      { cwd: REPO_ROOT, stdio: 'ignore' });
    return true;
  } catch { return false; }
}
test('real history: v2.6.0 at 556f8d3 denies on the marketplace entry alone',
  { skip: hasCommit('556f8d3') ? false : 'commit 556f8d3 not present' }, () => { ... });
```
It runs the hook with `cwd = REPO_ROOT` (read-only; the hook never writes).

**Unit cases 18-22** require the hook module directly and call the exported
`parseTagCommand`. These are RED with `TypeError: parseTagCommand is not a function`
until Task 2 adds the export — that is expected and correct.

Every fixture root goes in `os.tmpdir()`. Wrap bodies in `try { ... } finally { cleanup(); }`.
  </action>
  <verify>
```
cd /Users/justin/dev/devflow-claude && node --test plugins/devflow/hooks/changelog-on-tag.test.js
```
Expect FAILURES, and confirm they are the RIGHT failures:
- case 3 fails with a deny (hook read the working tree) — the headline bug
- case 4 fails because the reason cites `2.7.0` instead of `2.5.0`
- case 5 fails (pass-through instead of the changelog deny)
- case 13 fails with a deny (the quoted-mention false positive)
- cases 18-22 fail with `parseTagCommand is not a function`
- cases 1, 2, 11, 14, 15, 16 should already PASS (existing behavior, must not regress)

A case-3 failure for any OTHER reason (fixture repo not created, git identity
error, `findRepoRoot` returning null) means the harness is wrong, not the hook —
fix the harness before moving on.
  </verify>
  <done>
- `plugins/devflow/hooks/changelog-on-tag.test.js` exists
- All 22 cases from `<test_list>` are present
- `mkRepo` / `manifests` / `writeTree` build real git repos in `os.tmpdir()` via `execFileSync` (no Bash, no project-tree writes)
- Case 3 fixture has a committed tree and a divergent uncommitted working tree
- Case 4 asserts on message content both positively (`2.5.0`) and negatively (no `2.7.0`)
- Case 7 creates a branch named `message`
- Case 17 is skip-guarded on `git cat-file -e 556f8d3^{commit}`
- Suite currently RED on the feature cases and GREEN on the parity cases
- Every fixture is cleaned up in a `finally`
  </done>
  <recovery>
- `fatal: not a git repository` from the hook => `findRepoRoot` did not find `.git`; confirm `runHook` passes `cwd: root` and `mkRepo` ran `git init` in that same realpath'd dir.
- `Committer identity unknown` => the `-c user.email` / `-c user.name` flags are missing from a `git()` call.
- Case 3 passes pre-fix => the fixture's two trees are not actually divergent; confirm `worktreeFiles` is written AFTER the commit and never staged.
- Case 7 passes pre-fix even with parsing you believe is broken => the `message` branch was not created, or it points at an in-sync tree.
- Rollback: `rm plugins/devflow/hooks/changelog-on-tag.test.js`. Nothing else is touched by this task.
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>GREEN: resolve gated files from the named commit-ish via git show</name>
  <files>plugins/devflow/hooks/changelog-on-tag.js</files>
  <action>
Make the suite from Task 1 pass. Keep the file synchronous, dependency-free, and
stylistically identical.

**1. Imports.** Add `const { execFileSync } = require('child_process');` and
`const { stripHeredocs, stripQuoted } = require('./gate-commits.js');`
(safe — its `main()` is `require.main`-guarded).

**2. `parseTagCommand(cmd)` — exported.** Returns `{ tag, commitish }` or `null`.

```
Approach:
1. cleaned = stripQuoted(stripHeredocs(String(cmd || '')))
2. m = cleaned.match(TAG_RE)   # today's regex, unchanged, applied to `cleaned`
   if (!m) return null
   tag = m[1]
3. Tokenize cleaned.slice(m.index) on /\s+/
4. Walk from the token after `tag`, collecting positionals:
     - stop at a separator token: && || ; | )
     - token starts with '-':
         exactly -m|--message|-F|--file|-u|--local-user  -> skip it AND the next token
         otherwise (boolean, or attached-value like -m"" / --message=x) -> skip only it
     - else: it is a positional -> first one found here is the commit-ish; stop
5. return { tag, commitish: candidate || null }

# CRITICAL: the regex is applied to `cleaned`, not the raw command. This is a pure
#   narrowing (stripping only removes text) and kills the live-reproduced false
#   positive where `echo "git tag -a v9.9.9"` was denied. See <second_bug_reproduced_live>.
# CRITICAL: TAG_RE stays byte-for-byte today's
#   /\bgit\s+tag\s+(?:-a\s+)?(?:-m\s+\S+\s+)?(v\d+\.\d+\.\d+)\b/
#   Do NOT widen it to accept -s/-f/global flags. Out of scope.
# GOTCHA: positional[0] is the tag itself; the commit-ish is the NEXT positional.
#   Starting the walk after the tag token makes the first positional found the answer.
# GOTCHA: never return a token starting with '-' as a commit-ish — it would reach
#   `git rev-parse --verify` as an option.
```

**3. `resolveCommit(repoRoot, commitish)`** — returns the commit-ish if
`git rev-parse --verify <c>^{commit}` succeeds, else `null`:
```js
try {
  execFileSync('git', ['rev-parse', '--verify', `${commitish}^{commit}`],
    { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  return commitish;
} catch { return null; }
```

**4. `makeTreeReader(repoRoot, commitish)`** — one seam, both checks flow through it:
```js
function makeTreeReader(repoRoot, commitish) {
  if (!commitish) {
    return { commitish: null, read: (rel) => {
      const p = path.join(repoRoot, rel);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    } };
  }
  return { commitish, read: (rel) => {
    try {
      return execFileSync('git', ['show', `${commitish}:${rel}`], {
        cwd: repoRoot, encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch { return null; }
  } };
}
```
The no-commitish branch is exactly today's `fs.existsSync` + `readFileSync` — that
is how "byte-for-byte unchanged" is guaranteed structurally rather than by promise.

**5. Rewire `main()`.** Replace the direct fs reads; keep the control flow identical.
```
parsed = parseTagCommand(cmd); if (!parsed) return
tag, version as today
repoRoot = findRepoRoot(process.cwd()); if (!repoRoot) return
commitish = parsed.commitish ? resolveCommit(repoRoot, parsed.commitish) : null
reader = makeTreeReader(repoRoot, commitish)
at = commitish ? ` (at commit ${commitish})` : ''

content = reader.read('CHANGELOG.md')
if (content === null) return          # <-- FULL return, both checks skipped
if (!versionRe.test(content)) deny(`CHANGELOG.md has no entry for ${tag}${at}. ...`)

pkg    = parseJsonSafe(reader.read('package.json'))
plugin = parseJsonSafe(reader.read('plugins/devflow/.claude-plugin/plugin.json'))
market = parseJsonSafe(reader.read('.claude-plugin/marketplace.json'))
... rest of the mismatch logic UNCHANGED ...
deny(`Manifest versions out of sync for tag ${tag}${at}: ...`)
```

# CRITICAL: `content === null` returns from main entirely — today's line 86
#   (`if (!fs.existsSync(clPath)) return;`) skips the manifest check too. Skipping
#   only the changelog check would silently make the gate STRICTER.
# CRITICAL: an unresolvable commit-ish yields commitish=null => working-tree reader.
#   Never deny and never throw on a bad ref.
# PATTERN: `readJsonSafe(path)` becomes `parseJsonSafe(text)` — same try/catch,
#   returning null on any failure, but taking already-read content.

**6. Escape hatch and shape.** `DEVFLOW_SKIP_CHANGELOG_GATE === '1'` check stays the
first line of `main()`. No new env var.

**7. Guard and export** (required by unit cases 18-22, matching gate-commits.js):
```js
if (require.main === module) main();
module.exports = { parseTagCommand, makeTreeReader, resolveCommit };
```

**8. Update the JSDoc header** to state that when the command names a commit-ish,
the four files are read from that commit via `git show`, that an unresolvable
commit-ish falls back to the working tree, and that detection is invocation-aware
(heredoc/quoted mentions ignored, per TRD 27-04).
  </action>
  <verify>
1. Full suite green:
```
cd /Users/justin/dev/devflow-claude && node --test plugins/devflow/hooks/changelog-on-tag.test.js
```
All 22 cases pass (case 17 may report as skipped).

2. No shell interpolation anywhere — must print nothing:
```
cd /Users/justin/dev/devflow-claude && grep -n "shell:\s*true\|execSync(" plugins/devflow/hooks/changelog-on-tag.js
```

3. Helpers required, not reimplemented — must show the require and NO local definitions:
```
cd /Users/justin/dev/devflow-claude && grep -n "stripHeredocs\|stripQuoted" plugins/devflow/hooks/changelog-on-tag.js
```

4. Requiring the module has no side effects (no stdin read, no output, exit 0):
```
cd /Users/justin/dev/devflow-claude && node -e "const m=require('./plugins/devflow/hooks/changelog-on-tag.js'); console.log(typeof m.parseTagCommand)"
```
Prints `function`.

5. Diff review: `git diff plugins/devflow/hooks/changelog-on-tag.js` — expect the
JSDoc rewrite, two new requires, three new functions, the `main()` rewiring, and the
guard/export. The mismatch-comparison logic itself must be untouched.
  </verify>
  <done>
- All 22 test cases pass
- `stripHeredocs` / `stripQuoted` are required from `./gate-commits.js`, defined nowhere in this file
- Every git call is `execFileSync` with an args array; no `shell: true`, no `execSync`
- `parseTagCommand` finds the commit-ish in both git-accepted positions
- `-m`/`--message`, `-F`/`--file`, `-u`/`--local-user` values are never returned as a commit-ish
- Tokens starting with `-` are never returned as a commit-ish
- Token scan stops at `&&`, `||`, `;`, `|`, `)`
- Unresolvable commit-ish falls back to the working-tree reader without denying or throwing
- CHANGELOG absent at the resolved tree returns from `main()` entirely
- Deny messages include `(at commit <c>)` on the commit path and cite that tree's values
- `DEVFLOW_SKIP_CHANGELOG_GATE=1` still bypasses both checks
- `main()` guarded by `require.main === module`; `parseTagCommand` exported
- JSDoc header documents commit-ish resolution, fallback, and invocation-aware detection
- No new dependencies, no async, filename unchanged
  </done>
  <recovery>
- Case 3 still denies => the reader seam is not actually used by the manifest block; confirm all four reads go through `reader.read(...)` and none still call `path.join(repoRoot, ...)` + `fs.readFileSync`.
- Case 7 denies => the `-m` value is being consumed as a positional; confirm `-m` is in the value-consuming set and that the walk skips TWO tokens for it.
- Case 10 passes through instead of denying => `resolveCommit` is returning truthy for a bad ref, or the fallback reader is not reading the working tree.
- Case 5 passes through => `content === null` is being hit when the file DOES exist at that commit; check `git show` is running with `cwd: repoRoot` and that the path has no leading `./`.
- Case 13 still denies => the regex is still being applied to the raw command instead of `cleaned`.
- `fatal: ambiguous argument` on stderr during tests => `stdio` is not suppressing git's stderr; use `['ignore','pipe','ignore']`.
- Rollback: `git checkout -- plugins/devflow/hooks/changelog-on-tag.js`. The test file is independent and can stay.
  </recovery>
</task>

<task type="auto">
  <name>Verify: full-suite regression against baseline plus the live repro</name>
  <files>(no files modified — verification only)</files>
  <action>
Confirm the fix works against real history and that nothing else regressed.

**1. Baseline comparison.** Run the full suite:
```
cd /Users/justin/dev/devflow-claude && npm test 2>&1 | tail -40
```
Baseline is **2935 tests / 10 pre-existing failures** (daemon start/stop,
multi-project CLI, handoff-e2e, scanPeer — all flaky timing, all unrelated).
Expect: pass count up by the new cases, failure count still 10, and the SAME 10
names. Do not investigate or fix those 10.

**2. The live repro, end to end.** Drive the hook exactly as Claude Code would.
Note the working tree is on 2.7.0 while 556f8d3 is on 2.6.0 — that divergence is
the whole point, so do not "clean up" the tree first.

Write the driver with the Write tool (not a Bash heredoc — the un-fixed-shape
command text would trip the very gate under test), then run it:

```js
// scratchpad/repro.js
const { spawnSync } = require('child_process');
const payload = { tool_name: 'Bash', tool_input: {
  command: ['git', 'tag', '-a', 'v2.6.0', '556f8d3', '-m', '"release"'].join(' '),
} };
const r = spawnSync(process.execPath,
  ['/Users/justin/dev/devflow-claude/plugins/devflow/hooks/changelog-on-tag.js'],
  { cwd: '/Users/justin/dev/devflow-claude', input: JSON.stringify(payload), encoding: 'utf-8' });
console.log(r.stdout || '(pass-through)');
```

**Expected — and this is the whole point of `<important_subtlety>`:** it STILL
denies, but now for the right reason and from the right tree:
- reason CONTAINS `.claude-plugin/marketplace.json [devflow]: 2.5.0 (expected 2.6.0)`
- reason does NOT contain `package.json` (2.6.0 at that commit — matches)
- reason does NOT contain `2.7.0` (the working-tree value is no longer consulted)

If it denies citing `package.json: 2.7.0`, the fix is not wired in.
If it passes through, the gate got LOOSER — a regression, not a success.

**3. Positive control.** Re-run the same driver with the commit-ish changed to
`HEAD`. It should deny citing the working-tree/HEAD values — confirming the gate
still fires normally and only the inspected tree changed.

**4. Record the out-of-scope note** in the SUMMARY (no code change):
`DEVFLOW_*` escape hatches do not reach hooks from an inline shell assignment —
`DEVFLOW_SKIP_CHANGELOG_GATE=1 git tag ...` does NOT disable the gate, because the
hook reads Claude Code's process env, not the shell's. The escape hatch works only
when the variable is set in the environment Claude Code itself was launched with.
This bit this planning session twice and is worth writing down.
  </action>
  <verify>
- `npm test` failure count is exactly 10 and the names match the known-flaky list
- The new `changelog-on-tag.test.js` cases appear in the pass count
- Step 2 denies, citing `2.5.0` on the marketplace line, with no mention of `package.json` or `2.7.0`
- Step 3 denies, confirming the gate still fires on the normal path
  </verify>
  <done>
- Full suite run and compared against the 2935/10 baseline; no new failures
- Live repro reproduces the CORRECT denial (marketplace entry only, from the commit's tree)
- Positive control confirms the gate is not loosened
- Env-var escape-hatch limitation recorded as a note in the SUMMARY
  </done>
  <recovery>
- New failures outside `changelog-on-tag.test.js` => the `require('./gate-commits.js')` import has a side effect or a cycle; verify `gate-commits.js` still guards `main()` with `require.main === module` and that `changelog-on-tag.js` is not required back from it.
- Failure count above 10 but all in the known-flaky set => re-run once; those are timing-dependent.
- Step 2 passes through => the gate was loosened. Most likely `content === null` is short-circuiting because `git show 556f8d3:CHANGELOG.md` failed; run it by hand to confirm the blob is readable.
  </recovery>
</task>

<out_of_scope>
Note these; do not implement them here.

- **Env-var escape hatches do not reach hooks from an inline shell assignment.**
  `DEVFLOW_SKIP_CHANGELOG_GATE=1 git tag ...` does not disable the gate — the hook
  reads Claude Code's process env, not the shell's. Affects every `DEVFLOW_*` hatch.
- **Firing-regex breadth.** The gate still ignores `git tag -s`, `git tag -f`, and
  git global flags (`git -C <path> tag ...`). Widening it would make the gate
  STRICTER; this task changes which tree is inspected, not strictness.
- **CLAUDE.md hook description** ("blocks `git tag -a vX.Y.Z` if CHANGELOG.md lacks
  `## [X.Y.Z]`") does not mention commit-ish resolution. One-line doc drift, left
  out to hold the stated 2-file footprint.
- **Filename.** `changelog-on-tag.js` now gates more than the changelog. Rename
  still deferred, as decided in quick task 2.
- **The 10 pre-existing `npm test` failures.**
</out_of_scope>

<success_criteria>
- Exactly 2 files touched: `changelog-on-tag.js` modified, `changelog-on-tag.test.js` created
- `git tag -a vX.Y.Z <commit-ish>` validates that commit's tree via `git show`
- No commit-ish => working-tree behavior structurally unchanged (same `fs` calls, same order)
- Commit-ish found in both git-accepted argument positions
- `-m`/`-F`/`-u` values never mistaken for a commit-ish
- `stripHeredocs` / `stripQuoted` required from `gate-commits.js`, not reimplemented
- Unresolvable commit-ish => working-tree fallback, no crash, no deny
- Absent files at the resolved tree mirror today's absent-file semantics exactly
- All git calls are `execFileSync` with an args array
- `DEVFLOW_SKIP_CHANGELOG_GATE=1` still bypasses
- `git tag -a v2.6.0 556f8d3` still DENIES — on the marketplace entry alone, citing `2.5.0`
- `npm test` shows no new failures against the 2935/10 baseline
</success_criteria>

<output>
- `plugins/devflow/hooks/changelog-on-tag.js` — parses an optional commit-ish out of the
  gated `git tag` command (reusing TRD 27-04's stripping helpers), verifies it with
  `git rev-parse --verify`, and routes all four gated file reads through a tree reader
  that is either `git show <commit>:<path>` or today's working-tree `fs` calls. Falls
  back to the working tree on any unresolvable ref. `main()` guarded, parser exported.
- `plugins/devflow/hooks/changelog-on-tag.test.js` — the hook's first test file (the
  only one of 15 hooks without one). 22 cases over hand-built throwaway git repos in
  `os.tmpdir()`, including the headline fix, the 556f8d3 regression, the discriminating
  `-m` parsing test, and the quoted-mention false positive reproduced during planning.
</output>
