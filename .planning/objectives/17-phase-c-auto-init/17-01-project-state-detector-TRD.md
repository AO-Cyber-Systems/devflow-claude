---
objective: 17-phase-c-auto-init
trd: "01"
type: tdd
confidence: high
wave: 2
depends_on: ["17-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/project-state.cjs
  - plugins/devflow/devflow/bin/lib/project-state.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/project-state-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - C1
must_haves:
  truths:
    - "df-tools project-state [<cwd>] returns JSON with has_planning, has_git, git_age_days, code_files, primary_lang, is_substantive, previously_declined, decline_expires fields"
    - "Substantive heuristic = ((git_age_days > 7) OR (code_files > 10)) AND has_manifest AND NOT is_scratch_dir"
    - "is_scratch_dir excludes paths under /tmp/, ~/Downloads/, /var/folders/"
    - "primary_lang detected from manifest filename (package.json → javascript, Cargo.toml → rust, pyproject.toml → python, go.mod → go, Gemfile → ruby, pom.xml → java)"
    - "previously_declined and decline_expires populated from decline-tracker.readDecline()"
    - "5 acceptance fixtures from #28 covered: ambient project, brownfield no-planning, scratch dir, no-git, declined project"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/project-state.cjs"
      provides: "isSubstantive + isScratchDir + detectManifest + gitAgeDays + countSourceFiles pure helpers + getProjectState + cmdProjectState CLI entry"
      min_lines: 200
      exports: ["isSubstantive", "isScratchDir", "detectManifest", "getProjectState", "cmdProjectState"]
    - path: "plugins/devflow/devflow/bin/lib/project-state.test.cjs"
      provides: "Pure-function + CLI integration tests covering all 25 cases per test list"
      min_lines: 350
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/project-state-fixtures.cjs"
      provides: "Hand-built tmpdir scaffold builders + pure-input builder + locked manifest variants"
      min_lines: 120
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'project-state' switch arm invoking cmdProjectState"
      contains: "case 'project-state'"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/project-state.cjs"
      via: "require + case 'project-state' switch arm"
      pattern: "require.*lib/project-state"
    - from: "plugins/devflow/devflow/bin/lib/project-state.cjs"
      to: "plugins/devflow/devflow/bin/lib/decline-tracker.cjs"
      via: "require + readDecline(cwd) call to populate previously_declined + decline_expires"
      pattern: "require.*lib/decline-tracker"
    - from: "plugins/devflow/devflow/bin/lib/project-state.cjs"
      to: "git CLI"
      via: "spawnSync('git', ['log', '--reverse', '--format=%ct', '-n', '1'], { cwd })"
      pattern: "spawnSync.*git"
---

<objective>
Build `lib/project-state.cjs` (pure-logic detection of project substantiveness + manifest + scratch-dir + git age, plus CLI entry) and the `df-tools project-state` CLI surface. TDD via the locked test list in 17-RESEARCH.md. Imports `readDecline` from 17-02 to populate the decline-related fields.

Purpose: C1 from issue #28. The `project-state` JSON is the single source of truth that classify-session.js consumes (in 17-03) to decide between `init-offer` mode and `skip` mode for non-DevFlow projects. Substantive heuristic prevents pestering users in cloned-but-untouched repos. The 5 acceptance fixtures from #28 must round-trip correctly through this CLI.

Output: New `lib/project-state.cjs` + tests + fixtures + df-tools.cjs case arm. CLI works end-to-end: `df-tools project-state` (uses cwd) and `df-tools project-state /some/path`. JSON output schema matches #28 spec exactly.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                          ← MODIFY (add 1 case arm + import)
└── lib/
    ├── project-state.cjs                                 ← CREATE (pure helpers + getProjectState + cmdProjectState)
    ├── project-state.test.cjs                            ← CREATE (~25 test cases per test list)
    ├── decline-tracker.cjs                               ← READ-ONLY (import readDecline from 17-02)
    ├── brownfield-detector.cjs                           ← READ-ONLY (mirror countSourceFiles pattern)
    └── __fixtures__/
        └── project-state-fixtures.cjs                    ← CREATE (factory + 5 acceptance scaffolds + manifest variants)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: two-tier API (mirror brownfield-detector.cjs)

```js
// plugins/devflow/devflow/bin/lib/project-state.cjs
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { output, error } = require('./helpers.cjs');
const { readDecline } = require('./decline-tracker.cjs');

// ─── Pure functions (testable without filesystem) ─────────────────────────────

const SCRATCH_PREFIXES = [
  '/tmp/',
  '/var/folders/',
];

function isScratchDir(absPath) {
  // Match prefixes that are unconditionally scratch
  for (const prefix of SCRATCH_PREFIXES) {
    if (absPath.startsWith(prefix)) return true;
  }
  // Match ~/Downloads/ — relative to user's actual home (not env var)
  const homeDownloads = path.join(os.homedir(), 'Downloads');
  if (absPath === homeDownloads || absPath.startsWith(homeDownloads + path.sep)) {
    return true;
  }
  return false;
}

function isSubstantive({ git_age_days, code_files, has_manifest, is_scratch_dir }) {
  if (is_scratch_dir) return false;
  if (!has_manifest) return false;
  // git_age_days may be null when there's no git history; treat as 0
  const ageOk = (git_age_days !== null && git_age_days > 7);
  const filesOk = (code_files > 10);
  return ageOk || filesOk;
}

const MANIFEST_LANG = {
  'package.json':   'javascript',  // refined to 'typescript' if tsconfig.json present
  'Cargo.toml':     'rust',
  'pyproject.toml': 'python',
  'go.mod':         'go',
  'Gemfile':        'ruby',
  'pom.xml':        'java',
};

function detectManifest(rootDir) {
  for (const [filename, lang] of Object.entries(MANIFEST_LANG)) {
    if (fs.existsSync(path.join(rootDir, filename))) {
      // Refine package.json → typescript when tsconfig present
      if (filename === 'package.json' && fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
        return { has_manifest: true, primary_lang: 'typescript' };
      }
      return { has_manifest: true, primary_lang: lang };
    }
  }
  return { has_manifest: false, primary_lang: null };
}
```

### Pattern: git age detection (mirror awareness.cjs:234)

```js
function gitAgeDays(cwd) {
  try {
    const r = spawnSync('git', ['log', '--reverse', '--format=%ct', '-n', '1'], {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,           // 2s — fast even on large repos
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (r.error || r.status !== 0) return null;
    const firstCommitUnix = parseInt(r.stdout.trim(), 10);
    if (isNaN(firstCommitUnix)) return null;
    const nowUnix = Math.floor(Date.now() / 1000);
    return Math.floor((nowUnix - firstCommitUnix) / 86400);
  } catch {
    // ENOENT (no git binary), permission errors, etc. — treat as no git
    return null;
  }
}
```

### Pattern: source file counting (mirror brownfield-detector.cjs:65)

```js
const EXCLUDE = new Set(['node_modules', '.git', '.planning', 'dist', 'build', '.next', 'out', 'coverage']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.py', '.go', '.rs', '.rb', '.java']);

function countSourceFiles(root) {
  // PARALLEL: see brownfield-detector.cjs:countSourceFiles — duplicated here
  // intentionally; extract to shared helper on third use.
  let count = 0;
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (EXCLUDE.has(e.name)) continue;
      if (e.isDirectory() && e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && EXTS.has(path.extname(e.name))) count++;
    }
  }
  walk(root);
  return count;
}
```

### Pattern: getProjectState assembly (top-level I/O wrapper)

```js
function getProjectState(cwd, { now = new Date().toISOString() } = {}) {
  const root = path.resolve(cwd);

  // Filesystem checks
  const has_planning = fs.existsSync(path.join(root, '.planning'));
  const has_git = fs.existsSync(path.join(root, '.git'));
  const code_files = countSourceFiles(root);
  const { has_manifest, primary_lang } = detectManifest(root);
  const is_scratch_dir = isScratchDir(root);
  const git_age_days = has_git ? gitAgeDays(root) : null;

  // Decline tracking (from 17-02)
  let decline = { declined: false, expires_at: null };
  try {
    decline = readDecline(root, { now });
  } catch (e) {
    // fail-open: treat as not declined
    process.stderr.write(`[project-state] decline read failed: ${e.message}\n`);
  }

  const is_substantive = isSubstantive({
    git_age_days, code_files, has_manifest, is_scratch_dir,
  });

  return {
    has_planning,
    has_git,
    git_age_days,
    code_files,
    primary_lang,
    is_substantive,
    previously_declined: decline.declined,
    decline_expires: decline.expires_at,
  };
}
```

### Pattern: CLI dispatch (mirror cmdDetectBrownfieldMap)

```js
function cmdProjectState(cwd, targetCwd, raw) {
  const root = targetCwd ? path.resolve(targetCwd) : cwd;
  if (!fs.existsSync(root)) {
    process.stderr.write(`Error: cwd not found: ${root}\n`);
    process.exit(1);
    return;
  }
  const state = getProjectState(root);
  output(state, raw, JSON.stringify(state));
}
```

### Pattern: switch arm in df-tools.cjs

```js
// Top imports:
const { cmdProjectState } = require('./lib/project-state.cjs');

// Switch dispatch (insert near case 'project-decline' from 17-02):
case 'project-state': {
  // df-tools project-state [<cwd>] [--raw]
  cmdProjectState(cwd, args[1], raw);
  break;
}
```

### Pattern: fixture builders (mirror brownfield-fixtures.cjs:makeScaffold)

```js
// __fixtures__/project-state-fixtures.cjs
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function mkAmbientProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-ambient-'));
  fs.mkdirSync(path.join(root, '.planning'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x","version":"0.0.0"}');
  // 5 source files
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(root, `f${i}.js`), `module.exports = ${i};\n`);
  }
  return root;
}

function mkBrownfieldSubstantive() {
  // git repo with >10 source files + manifest, no .planning
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-brownfield-'));
  // Initialize a real git repo with one commit dated >7 days ago
  execSync('git init', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@test"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "test"', { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x","version":"0.0.0"}');
  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(path.join(root, `f${i}.js`), `module.exports = ${i};\n`);
  }
  // Commit with backdated timestamp (>7 days ago)
  const past = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  execSync(`GIT_AUTHOR_DATE='${past}' GIT_COMMITTER_DATE='${past}' git add . && git commit -m init -q`, {
    cwd: root, shell: '/bin/sh', stdio: 'ignore',
  });
  return root;
}

function mkScratchDirInTmp() {
  // Explicitly under /tmp (not os.tmpdir() which may be /var/folders on macOS)
  const root = fs.mkdtempSync('/tmp/ps-scratch-');
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  return root;
}

function mkNoGitProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-nogit-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(root, `f${i}.js`), `module.exports = ${i};\n`);
  }
  return root;
}

// Manifest variant builder
const MANIFESTS = {
  javascript: { name: 'package.json', content: '{"name":"x"}' },
  typescript: [
    { name: 'package.json', content: '{"name":"x"}' },
    { name: 'tsconfig.json', content: '{}' },
  ],
  rust:       { name: 'Cargo.toml', content: '[package]\nname = "x"' },
  python:     { name: 'pyproject.toml', content: '[project]\nname = "x"' },
  go:         { name: 'go.mod', content: 'module x' },
  ruby:       { name: 'Gemfile', content: 'source "https://rubygems.org"' },
  java:       { name: 'pom.xml', content: '<project></project>' },
};

function mkManifestVariant(lang) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ps-manifest-${lang}-`));
  const variant = MANIFESTS[lang];
  const files = Array.isArray(variant) ? variant : [variant];
  for (const f of files) {
    fs.writeFileSync(path.join(root, f.name), f.content);
  }
  return root;
}

function buildSubstantiveInputs({ git_age_days = 240, code_files = 47, has_manifest = true, is_scratch = false } = {}) {
  return { git_age_days, code_files, has_manifest, is_scratch_dir: is_scratch };
}

module.exports = {
  mkAmbientProject, mkBrownfieldSubstantive, mkScratchDirInTmp, mkNoGitProject,
  mkManifestVariant, buildSubstantiveInputs,
};
```

</codebase_examples>

<anti_patterns>

- **Do NOT shell out to git in pure-function tests.** `gitAgeDays(cwd)` is the I/O wrapper; pure tests should pass `git_age_days` directly to `isSubstantive(...)`. Only CLI integration tests build real git repos via `mkBrownfieldSubstantive`.
- **Do NOT mutate process.env.HOME in pure tests.** `isScratchDir` uses `os.homedir()` which reads HOME at call time. For predictable testing, prefer absolute paths in test fixtures: `/tmp/...`, `/var/folders/...`, and explicitly redirect HOME for ~/Downloads tests via spawnSync subprocess (not in-process).
- **Do NOT use `os.tmpdir()` for the scratch-dir test.** macOS `os.tmpdir()` returns `/var/folders/...` which IS a scratch prefix — that's fine. But Linux returns `/tmp/...`. Both are scratch prefixes by design. Use `fs.mkdtempSync('/tmp/ps-scratch-')` to explicitly anchor under `/tmp` for the cross-platform test.
- **Do NOT count files in node_modules / .git / .planning.** The EXCLUDE set must match brownfield-detector.cjs exactly. Diverging causes test drift.
- **Do NOT use Date objects in test inputs.** ISO 8601 strings only. `now: '2026-05-04T12:00:00.000Z'` for deterministic tests.
- **Do NOT block classify-session.js on git timeout > 2s.** The 2s spawnSync timeout is hard-coded. SessionStart hot-path can't afford slower detection.
- **Do NOT crash on permission denied subdirs.** countSourceFiles wraps `readdirSync` in try/catch and continues. Mirrors brownfield-detector pattern.
- **Do NOT depend on git config user.email being set globally.** mkBrownfieldSubstantive sets it per-repo to avoid environment dependencies.

</anti_patterns>

<error_recovery>

- **`spawnSync('git', ...)` ENOENT (no git binary)** — `r.error` set, return null. Caller treats null git_age_days as "not git-substantive".
- **`fs.existsSync` race during scan** — countSourceFiles wraps readdirSync; if dir is deleted mid-walk, skip and continue. No crash.
- **`readDecline` throws** — wrapped in try/catch in `getProjectState`; falls back to `{ declined: false, expires_at: null }` and writes stderr warning. The CLI still emits valid JSON.
- **Symlink loops in countSourceFiles** — `e.isDirectory()` returns false for symlinks; they're skipped. No special handling needed (mirror brownfield-detector pattern).
- **mkBrownfieldSubstantive git commands fail on CI without git** — tests skip via `t.skip()` when `execSync('git --version')` throws. Add a top-of-file check + early skip for tests that need a real git repo.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/17-phase-c-auto-init/17-CONTEXT.md
@.planning/objectives/17-phase-c-auto-init/17-RESEARCH.md
@.planning/objectives/17-phase-c-auto-init/17-02-decline-tracker-TRD.md

@plugins/devflow/devflow/bin/lib/brownfield-detector.cjs
@plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/brownfield-fixtures.cjs
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
</context>

<research_context>

## Locked output schema (from #28)

```json
{
  "has_planning": false,
  "has_git": true,
  "git_age_days": 240,
  "code_files": 47,
  "primary_lang": "typescript",
  "is_substantive": true,
  "previously_declined": false,
  "decline_expires": null
}
```

## Locked substantive heuristic (from #28 + 17-CONTEXT §"Locked decisions")

```
is_substantive = ((git_age_days > 7) OR (code_files > 10))
                 AND has_manifest
                 AND NOT is_scratch_dir
```

## Locked scratch-dir prefixes

- `/tmp/...` (Linux + macOS Linux compat)
- `/var/folders/...` (macOS default `os.tmpdir()`)
- `~/Downloads/...` (resolved via `os.homedir() + '/Downloads'`)

## Locked manifest detection table

| File | primary_lang |
|------|--------------|
| package.json | javascript (or typescript if tsconfig.json adjacent) |
| Cargo.toml | rust |
| pyproject.toml | python |
| go.mod | go |
| Gemfile | ruby |
| pom.xml | java |

First match wins. Order is locked above (package.json checked first).

## Test list (locked, see 17-RESEARCH.md test list 17-01)

25 cases — all must appear as `test('case N: ...', ...)` calls per TDD playbook habit 2.

</research_context>

<gotchas>

- **`primary_lang` ambiguity for typescript:** package.json alone → 'javascript'. package.json + tsconfig.json → 'typescript'. Test 14 enforces both branches.
- **`os.tmpdir()` is platform-specific:** on macOS it returns `/var/folders/...`, on Linux it returns `/tmp/...`. Both are scratch by design. Use `fs.mkdtempSync('/tmp/ps-scratch-')` to explicitly anchor under /tmp when the test needs to assert is_scratch_dir against `/tmp/`.
- **git_age_days = null vs 0:** Empty repo (no commits) returns null. 1-day-old commit returns 0 or 1 (integer floor). isSubstantive treats null as not-substantive (`null > 7` is false).
- **previously_declined depends on 17-02:** The `readDecline` import means project-state.cjs WILL break if 17-02 hasn't shipped yet. depends_on=[17-02] in frontmatter enforces wave ordering.
- **Real git repo creation in fixtures:** mkBrownfieldSubstantive uses `execSync('git init')`. CI environments without git will fail this fixture. Wrap test setup in `try { execSync('git --version') } catch { t.skip('git unavailable') }` at the test level.
- **/tmp is symlinked to /private/tmp on macOS.** `path.resolve('/tmp')` returns '/tmp' (normalized) but `fs.realpathSync('/tmp')` returns '/private/tmp'. The `isScratchDir` check uses startsWith on the input path AS PROVIDED. Tests should use the same form (don't realpath before testing).
- **homedir-relative scratch:** Test fixture for ~/Downloads is hard to construct safely (don't pollute the user's actual Downloads). Use a subprocess test with HOME=tmpdir and create $HOME/Downloads/foo for the assertion.

</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD pure helpers (isSubstantive + isScratchDir + detectManifest) + fixtures</name>
  <files>
    plugins/devflow/devflow/bin/lib/project-state.cjs,
    plugins/devflow/devflow/bin/lib/project-state.test.cjs,
    plugins/devflow/devflow/bin/lib/__fixtures__/project-state-fixtures.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for all pure-function logic.

**Test list (TDD playbook habit 2 — write FIRST as failing tests):**

`isSubstantive` (8 cases):
1. git_age_days=240, code_files=47, has_manifest=true, is_scratch=false → true
2. git_age_days=2, code_files=5, has_manifest=true, is_scratch=false → false
3. git_age_days=240, code_files=5, has_manifest=true, is_scratch=false → true (git age threshold)
4. git_age_days=2, code_files=20, has_manifest=true, is_scratch=false → true (file threshold)
5. git_age_days=240, code_files=47, has_manifest=false, is_scratch=false → false (no manifest)
6. git_age_days=240, code_files=47, has_manifest=true, is_scratch=true → false (scratch)
7. git_age_days=null, code_files=20, has_manifest=true, is_scratch=false → true (file threshold; null age OK)
8. git_age_days=null, code_files=5, has_manifest=true, is_scratch=false → false

`isScratchDir` (5 cases):
9. `/tmp/foo` → true
10. `/var/folders/abc/T/xyz` → true
11. `${os.homedir()}/Downloads/repo` → true (use os.homedir() at test time)
12. `/Users/x/Source/repo` → false
13. `/home/user/projects/myapp` → false

`detectManifest` (7 cases — fixture-driven):
14. package.json + tsconfig.json → has_manifest:true, primary_lang:'typescript'
15. package.json (no tsconfig) → has_manifest:true, primary_lang:'javascript'
16. Cargo.toml → has_manifest:true, primary_lang:'rust'
17. pyproject.toml → has_manifest:true, primary_lang:'python'
18. go.mod → has_manifest:true, primary_lang:'go'
19. Gemfile → has_manifest:true, primary_lang:'ruby'
20. pom.xml → has_manifest:true, primary_lang:'java'
(Bonus) 20b. no manifest → has_manifest:false, primary_lang:null

**Fixture file (build BEFORE the test file, TDD playbook habit 4):**

`__fixtures__/project-state-fixtures.cjs` — provides:
- `mkAmbientProject()` — .planning/ + .git/ + package.json + 5 source files
- `mkBrownfieldSubstantive()` — git repo (init + backdated commit) + package.json + 50 source files
- `mkScratchDirInTmp()` — fs.mkdtempSync('/tmp/ps-scratch-') + package.json
- `mkNoGitProject()` — package.json + 5 source files, no .git/
- `mkManifestVariant(lang)` — produces dir with manifest for given language
- `buildSubstantiveInputs({...})` — pure-input builder with sensible defaults

# CRITICAL: Habit 2 — write all 21 cases (8 + 5 + 8) above as failing tests FIRST. They fail because project-state.cjs doesn't exist yet.
# CRITICAL: Habit 4 — fixtures are HAND-BUILT factories. No LLM-generated test data, no random IDs. Per TDD playbook, treat fixture work as its own task ahead of the first behavior test.
# GOTCHA: Test 11 (~/Downloads) is platform-specific. Use os.homedir() at test time and join 'Downloads/repo'. Don't hardcode /Users/x/.
# PATTERN: Mirror brownfield-fixtures.cjs structure (lines 1-100). Cleanup via try/finally with fs.rmSync.

**Implementation (GREEN):**

Implement minimally per codebase_examples block. Pure functions only — no fs except in `detectManifest` (which the test exercises via fixture dirs).

Commits:
- `test(17-01): add failing tests for project-state pure helpers + fixtures`
- `feat(17-01): implement isSubstantive + isScratchDir + detectManifest`
- (REFACTOR optional) `refactor(17-01): extract MANIFEST_LANG constant`
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/project-state.test.cjs
# Must pass all 21 cases (Tests 1-20 + 20b).

node -e "
  const ps = require('./plugins/devflow/devflow/bin/lib/project-state.cjs');
  console.log('isSubstantive:', typeof ps.isSubstantive);
  console.log('isScratchDir:', typeof ps.isScratchDir);
  console.log('detectManifest:', typeof ps.detectManifest);
  console.log('substantive(typical):', ps.isSubstantive({ git_age_days: 240, code_files: 47, has_manifest: true, is_scratch_dir: false }));
  console.log('scratch(/tmp/foo):', ps.isScratchDir('/tmp/foo'));
"
# Expected:
#   isSubstantive: function
#   isScratchDir: function
#   detectManifest: function
#   substantive(typical): true
#   scratch(/tmp/foo): true
  </verify>
  <done>
- `lib/project-state.cjs` exists with isSubstantive + isScratchDir + detectManifest exports
- `lib/project-state.test.cjs` has 21 tests, all passing
- `lib/__fixtures__/project-state-fixtures.cjs` provides 6 builder functions per locked spec
- All 7 manifest variants tested (Tests 14-20)
- All 4 substantive boundary conditions tested (Tests 1-8)
- All 5 scratch-dir cases tested (Tests 9-13)
- 2-3 atomic commits per RED-GREEN-REFACTOR cycle
  </done>
  <recovery>
If Test 11 (~/Downloads) fails on CI without HOME set: skip the test when os.homedir() returns '' or '/'. Document via t.skip().

If Test 14 (package.json + tsconfig → typescript) wrongly returns javascript: the order of checks matters. The MANIFEST_LANG iteration must check tsconfig.json existence WHEN package.json is the matched manifest, BEFORE returning javascript.

If REFACTOR breaks tests: revert via `git reset HEAD~1` and skip the optional refactor commit.

If fixture builders fail because /tmp is locked down (sandboxed CI): fall back to os.tmpdir() and skip Test 9 (the /tmp/ scratch test).
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TDD getProjectState assembly + cmdProjectState CLI + df-tools.cjs wiring + 5 acceptance fixtures</name>
  <files>
    plugins/devflow/devflow/bin/lib/project-state.cjs,
    plugins/devflow/devflow/bin/lib/project-state.test.cjs,
    plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for `getProjectState` (composes pure helpers + I/O), `cmdProjectState` CLI, and the 5 acceptance fixtures from #28.

**Test list (extends Task 1's test file with new describe blocks):**

`gitAgeDays` (3 cases — uses real git repo fixture):
21a. mkBrownfieldSubstantive (commit 30d ago) → returns ~30 (within ±2 days due to floor + timing)
21b. dir without .git → returns null
21c. dir with .git but no commits → returns null (git log fails)

`getProjectState` integration — 5 acceptance fixtures from #28 (Tests 21-25):
21. mkAmbientProject (planning + git + manifest + 5 files) → has_planning:true, has_git:true, is_substantive:false (5 files < 10, no real git history with backdated commit) — this fixture demonstrates "ambient" classification, not the substantive heuristic per se
22. mkBrownfieldSubstantive (no .planning, git repo with backdated commit, manifest, 50 files) → has_planning:false, has_git:true, git_age_days≥7, code_files=50, primary_lang:'javascript', is_substantive:true, previously_declined:false
23. mkScratchDirInTmp (under /tmp, manifest) → is_scratch_dir branch → is_substantive:false
24. mkNoGitProject (manifest + 5 files, no .git/) → has_git:false, git_age_days:null, is_substantive:false (5<10 files threshold)
25. mkBrownfieldSubstantive + decline file present → previously_declined:true, decline_expires:non-null (uses 17-02's writeDecline to populate file BEFORE calling getProjectState)

`cmdProjectState` CLI:
26. `cmdProjectState(cwd, undefined, true)` (no targetCwd, raw mode) → emits valid JSON to stdout matching the 8-field schema
27. `cmdProjectState(cwd, '/nonexistent/path', true)` → process.exit(1) with stderr error
28. Subprocess: `node df-tools.cjs project-state /tmp/<brownfield_fixture> --raw` → exit 0, valid JSON output

# CRITICAL: Test 22 needs git repo with backdated commit. Fixture mkBrownfieldSubstantive does this. If git unavailable on test runner, skip via try/catch around execSync('git --version').
# CRITICAL: Test 25 cross-TRD dependency — uses writeDecline from 17-02. Tests must have 17-02 shipped first (depends_on enforces this). Import via require('./decline-tracker.cjs').writeDecline + _setDeclinePath to redirect away from real ~/.claude/devflow/.
# GOTCHA: cmdProjectState process.exit(1) on missing dir — wrap test in try/catch since exit propagates as throw in test harness. Or use spawnSync subprocess.
# PATTERN: Test fixtures clean up via try/finally fs.rmSync(root, { recursive: true, force: true }). Even if assertions fail, tmpdir is removed.

**Implementation (GREEN):**

Add `gitAgeDays`, `countSourceFiles`, `getProjectState`, `cmdProjectState` to project-state.cjs. Wire df-tools.cjs:

```js
// Top imports:
const { cmdProjectState } = require('./lib/project-state.cjs');

// Switch dispatch (insert near case 'project-decline'):
case 'project-state': {
  cmdProjectState(cwd, args[1], raw);
  break;
}
```

Verify:
```bash
grep -n "case 'project-state'" plugins/devflow/devflow/bin/df-tools.cjs
# Should print 1 line.
```

Commits:
- `test(17-01): add failing tests for getProjectState + 5 acceptance fixtures + CLI`
- `feat(17-01): implement getProjectState + cmdProjectState + wire df-tools.cjs`
  </action>
  <verify>
# Tests
node --test plugins/devflow/devflow/bin/lib/project-state.test.cjs
# Must pass all ~28 cases.

# Subprocess smoke (creates a real brownfield fixture and invokes the CLI)
node -e "
  const { mkBrownfieldSubstantive } = require('./plugins/devflow/devflow/bin/lib/__fixtures__/project-state-fixtures.cjs');
  const root = mkBrownfieldSubstantive();
  console.log('FIXTURE_PATH=' + root);
" > /tmp/ps-smoke-fixture.txt 2>&1
ROOT=$(grep FIXTURE_PATH /tmp/ps-smoke-fixture.txt | sed 's/FIXTURE_PATH=//')
node plugins/devflow/devflow/bin/df-tools.cjs project-state "$ROOT" --raw
# Expected JSON output: { "has_planning": false, "has_git": true, "git_age_days": >=7, "code_files": 50, "primary_lang": "javascript", "is_substantive": true, "previously_declined": false, "decline_expires": null }
rm -rf "$ROOT" /tmp/ps-smoke-fixture.txt

# df-tools.cjs case arm registered
grep -n "case 'project-state'" plugins/devflow/devflow/bin/df-tools.cjs
# Expected: 1 line

# Full test suite still passes
npm test 2>&1 | tail -5
# Expected: 1726 + 21 (Task 1) + ~7 (Task 2) ≈ 1755 tests pass; no new failures
  </verify>
  <done>
- `getProjectState`, `cmdProjectState`, `gitAgeDays`, `countSourceFiles` exported from project-state.cjs
- df-tools.cjs has case 'project-state' + import statement
- 5 acceptance fixtures from #28 covered (Tests 21-25 — ambient, brownfield substantive, scratch, no-git, declined)
- Subprocess smoke test emits 8-field JSON for a real brownfield fixture
- All Task 1 + Task 2 tests pass (~28 total)
- npm test full suite: net +28 tests
- 2 atomic commits (test + feat) for Task 2
- Cross-TRD integration: Test 25 uses 17-02's writeDecline + _setDeclinePath
  </done>
  <recovery>
If Test 22 (mkBrownfieldSubstantive git_age_days≥7) fails because git timing is racy: assert `git_age_days >= 7 && git_age_days <= 35` (loose bounds since the fixture commits 30d ago).

If Test 25 (declined project) fails because writeDecline path collision: ensure both project-state-fixtures.cjs AND decline-tracker tests use _setDeclinePath to isolate. Use `path.join(root, '.devflow-test-decline.json')` or similar.

If subprocess smoke test fails because the JSON output is mangled: confirm output() helper handles JSON correctly when raw=true. Inspect df-tools.cjs --raw flag parsing (~line 30-60).

If git is unavailable in test env: wrap mkBrownfieldSubstantive call in try/catch; if execSync fails, t.skip() the affected tests with a clear message.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test>node --test plugins/devflow/devflow/bin/lib/project-state.test.cjs</test>
</validation_gates>

<verification>
Acceptance criteria from #28 (this TRD covers C1):
- [ ] `df-tools project-state` returns correct JSON for 5 test fixtures: ambient project, brownfield no-planning, scratch dir, no-git, declined project (Task 2 cases 21-25, 28)
- [ ] Substantive heuristic excludes /tmp/, ~/Downloads/, /var/folders/ (Task 1 cases 9-11; Task 2 case 23)
- [ ] git_age_days computed via spawnSync('git log') with 2s timeout (Task 2 cases 21a-c)
- [ ] code_files counted via brownfield-style walk with EXCLUDE/EXTS sets (Task 2 implicit via mkBrownfieldSubstantive)
- [ ] primary_lang detected from manifest filename (Task 1 cases 14-20)
- [ ] previously_declined + decline_expires populated from readDecline (Task 2 case 25)
- [ ] CLI handles missing cwd with exit 1 + stderr (Task 2 case 27)
- [ ] Pre-existing 1726 tests still pass

Truth-coverage:
- Truth #1 (8-field JSON output): Task 2 cases 21-26
- Truth #2 (substantive heuristic): Task 1 cases 1-8
- Truth #3 (scratch-dir prefixes): Task 1 cases 9-13, Task 2 case 23
- Truth #4 (primary_lang per manifest): Task 1 cases 14-20
- Truth #5 (decline integration): Task 2 case 25
- Truth #6 (5 acceptance fixtures): Task 2 cases 21-25
</verification>

<success_criteria>
- 4 files created/modified (3 NEW: project-state.cjs + .test.cjs + fixtures; 1 MODIFY: df-tools.cjs)
- ~28 new tests pass; npm test full suite has 1726 + 28 ≈ 1754 passing (net additive)
- 5 acceptance fixtures from #28 round-trip through CLI emitting correct JSON
- Cross-TRD wiring with 17-02 verified (Test 25 — declined project)
- Subprocess smoke test emits 8-field JSON for a real brownfield fixture
- 4-6 atomic commits across 2 tasks
- SUMMARY.md captures: test counts, commit hashes, sample JSON for each acceptance fixture
- Phase C acceptance criterion #1 + #2 satisfied
</success_criteria>

<output>
After completion, create `.planning/objectives/17-phase-c-auto-init/17-01-SUMMARY.md`
</output>
