---
objective: 03-planning-time-org-awareness
trd: 03-01
title: Sibling-repo scanner + filesystem fixtures + CLI scaffold (foundation for org-awareness module)
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/org-awareness.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/templates/config.json
autonomous: true
requirements: [SC-1, SC-2]
verification_commands:
  - "npm test -- --grep 'org-awareness|scanSiblings|tokenize'"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/org-awareness.cjs\"); for (const s of [\"scanSiblings\",\"_setRunFs\",\"_resetFsMock\",\"DEFAULT_SIBLING_GLOB\",\"SUMMARY_RECENCY_DAYS\",\"TOP_N\"]) if(typeof a[s]===\"undefined\") throw new Error(s+\" not exported\"); console.log(\"OK\");'"
  - "node -e 'const f=require(\"./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs\"); for (const s of [\"buildSiblingRepoTree\",\"buildMockRunFs\"]) if(typeof f[s]!==\"function\") throw new Error(s+\" fixture not exported\"); console.log(\"OK\");'"
  - "node ./plugins/devflow/devflow/bin/df-tools.cjs org-awareness 2>&1 | grep -E 'scan-siblings|scan-libs|scan-org-overlap|considerations'"
  - "git log --oneline -- plugins/devflow/devflow/bin/lib/org-awareness.cjs plugins/devflow/devflow/bin/lib/org-awareness.test.cjs | grep -E '^[a-f0-9]+ test' | head -1"

must_haves:
  truths:
    - "lib/org-awareness.cjs module exists with stable header, requires, constants block, and `_setRunFs`/`_resetFsMock` test injection hooks"
    - "scanSiblings(opts) walks sibling repos under `~/Source/*/` (or configured paths), reads each PROJECT.md, filters by `org` match, walks `.planning/objectives/*/` for objectives modified in last SUMMARY_RECENCY_DAYS (90), tokenizes summaries, and returns top TOP_N (3) matches by token-intersection score"
    - "scanSiblings is fault-tolerant — repos without PROJECT.md silently skipped; repos with `org` mismatch silently skipped; sibling SUMMARY.md read errors logged as warnings without throwing"
    - "Tokenize helper applies the locked algorithm: lowercase + strip punctuation + split on whitespace/hyphen/underscore + length ≥ 3 + stop-word filter + dedup"
    - "Scoring formula: |current ∩ sibling| / max(|current|, |sibling|) (Jaccard-like, [0,1])"
    - "Configurable sibling discovery: `awareness.sibling_repos: [paths]` in `.planning/config.json` REPLACES default glob (no merge); home-relative `~/...` paths expand correctly"
    - "Current repo is excluded from sibling list (compare via `path.resolve()`)"
    - "Hand-built fixtures: buildSiblingRepoTree creates a tmp dir with PROJECT.md (org field) + .planning/STATE.md + .planning/objectives/01-foo/01-SUMMARY.md; buildMockRunFs builds a canned-response readFileSync/readdirSync/existsSync mock"
    - "df-tools org-awareness scan-siblings <objective_id> CLI subcommand emits structured JSON to stdout via lib/org-awareness-cli.cjs router"
    - "All new tests follow RED → GREEN → REFACTOR: test: commit precedes feat: commit per TDD Playbook"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      provides: "Module skeleton + scanSiblings + tokenize + _setRunFs/_resetFsMock + constants. Partial module.exports containing only this TRD's exports."
      exports: ["scanSiblings", "_setRunFs", "_resetFsMock", "DEFAULT_SIBLING_GLOB", "DEFAULT_EDEN_LIBS_PATH", "TOP_N", "SUMMARY_RECENCY_DAYS"]
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs"
      provides: "Test suite for scanSiblings + tokenize. Includes happy/edge/failure cases per Test list."
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs"
      provides: "CLI subcommand router for `df-tools org-awareness <subcommand>`. Wires scan-siblings to scanSiblings; placeholder error stubs for scan-libs/scan-org-overlap/considerations (filled in 03-02/03-03/03-04)."
      exports: ["cmdOrgAwarenessRoute", "cmdOrgAwarenessScanSiblings"]
    - path: "plugins/devflow/devflow/bin/lib/org-awareness-cli.test.cjs"
      provides: "Tests for scan-siblings command wiring + --raw flag + help text."
      min_lines: 60
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "Extended file with buildSiblingRepoTree + buildMockRunFs builders (preserves all obj 2 builders unchanged)."
      exports: ["buildSiblingRepoTree", "buildMockRunFs", "buildStateMd", "buildOrgItem", "buildSubIssue", "buildOrgScanResult", "buildGitFixtureRepo", "buildMockRunGit"]
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "Single-line `case 'org-awareness': cmdOrgAwarenessRoute(cwd, args.slice(1), raw); break;` arm in main router; `org-awareness` added to Usage commands list."
      contains: "case 'org-awareness'"
    - path: "plugins/devflow/devflow/templates/config.json"
      provides: "Documents `awareness.sibling_repos`, `awareness.eden_libs_path` config keys with defaults."
      contains: "sibling_repos"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      to: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      via: "require + parseStateMd reuse"
      pattern: "require.*awareness\\.cjs"
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      to: "plugins/devflow/devflow/bin/lib/frontmatter.cjs"
      via: "require + extractFrontmatter for PROJECT.md parsing"
      pattern: "require.*frontmatter"
    - from: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs"
      to: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      via: "require + scanSiblings dispatch"
      pattern: "require.*org-awareness\\.cjs"
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs"
      via: "require + cmdOrgAwarenessRoute"
      pattern: "cmdOrgAwarenessRoute"
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs"
      to: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      via: "require for fixture builders"
      pattern: "buildSiblingRepoTree|buildMockRunFs"
---

<objective>
Lay the foundation for `lib/org-awareness.cjs` — the planning-time org-awareness module that powers `## Cross-Repo Considerations` in CONTEXT.md. Ship the **sibling-repo scanner** (the first pure-logic, fixturable component) plus the hand-built filesystem fixture-builder scaffold every later TRD reuses, plus the CLI subcommand router skeleton.

Purpose: Every later TRD in this objective extends `org-awareness.cjs` and consumes the new fixture builders. This TRD locks all foundational shapes (module skeleton, fixtures file extension, CLI router) so subsequent waves (03-02, 03-03, 03-04, 03-07) get a stable baseline to write tests against. Per TDD Playbook habit 4 (fixture builders, not LLM-generated test data), fixtures must be hand-built and committed before any behavior test.

Output:
1. A loadable `lib/org-awareness.cjs` module with `scanSiblings` + tokenize helpers + `_setRunFs` injection hook + constants.
2. A complete test suite (`org-awareness.test.cjs`) for sibling scanner happy/edge/failure paths.
3. The fixture builders in `awareness-fixtures.cjs`: `buildSiblingRepoTree`, `buildMockRunFs`.
4. The CLI router scaffold (`org-awareness-cli.cjs` + tests + df-tools.cjs case arm).
5. Config docs in `templates/config.json` for `awareness.sibling_repos` and `awareness.eden_libs_path`.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                          ← MODIFY  (case 'org-awareness' arm)
└── lib/
    ├── org-awareness.cjs                                 ← CREATE  (skeleton + scanSiblings + tokenize)
    ├── org-awareness.test.cjs                            ← CREATE  (test suite)
    ├── org-awareness-cli.cjs                             ← CREATE  (CLI subcommand router)
    ├── org-awareness-cli.test.cjs                        ← CREATE  (CLI tests)
    └── __fixtures__/
        └── awareness-fixtures.cjs                        ← MODIFY  (extend with fs fixtures)

plugins/devflow/devflow/templates/
└── config.json                                           ← MODIFY  (awareness.sibling_repos + eden_libs_path)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing test injection hook (mirror this for `_setRunFs`)** — `lib/awareness.cjs::_setRunGit`:

```js
const { spawnSync } = require('child_process');

function runGit(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, ...opts,
  });
  return {
    ok: r.status === 0, status: r.status,
    stdout: r.stdout || '',  // NOT trimmed
    stderr: (r.stderr || '').trim(),
  };
}

let _runGit = runGit;
function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGit; }
function _resetGitMock() { _runGit = runGit; }
```

**Adapt for filesystem.** Wrap `fs.readFileSync`, `fs.readdirSync`, `fs.existsSync`, `fs.statSync` in a `_runFs` object. Test injection replaces it wholesale via `_setRunFs(mockObject)`.

```js
const fs = require('fs');

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};

let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetFsMock() { _runFs = realFs; }
```

**Existing fixture builder style** — `lib/__fixtures__/awareness-fixtures.cjs::buildStateMd` (obj 2):

```js
function buildStateMd({ objective, trd, branch, github_issue, objective_complete = [] } = {}) {
  const lines = ['# DevFlow State', ''];
  for (const c of objective_complete) lines.push(`**Objective complete:** ${c}`);
  lines.push('## Current Position', '');
  if (objective !== undefined) lines.push(`**Objective in flight:** ${objective}`);
  if (trd !== undefined) lines.push(`**Current TRD:** ${trd}`);
  if (branch !== undefined) lines.push(`**Branch:** \`${branch}\``);
  // ... etc
  return lines.join('\n') + '\n';
}
```

Pattern: every parameter optional with default; build minimal output containing ONLY explicitly-passed fields.

**Existing CLI router style** — `lib/awareness-cli.cjs::cmdAwarenessRoute` (obj 2):

```js
function cmdAwarenessRoute(cwd, args, raw) {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    process.stderr.write([
      'Usage: df-tools awareness <subcommand> [args]',
      '',
      'Subcommands:',
      '  scan-peer [--no-fetch] [--raw]    Walk origin/* refs; emit JSON',
      // ...
    ].join('\n'));
    process.exit(sub ? 0 : 1);
    return;
  }

  if (sub === 'scan-peer') return cmdAwarenessScanPeer(cwd, rest, raw);
  if (sub === 'scan-org') return cmdAwarenessScanOrg(cwd, rest, raw);
  if (sub === 'show') return cmdAwarenessShow(cwd, rest, raw);
  error(`Unknown awareness subcommand: ${sub}. Available: scan-peer, scan-org, show`);
}
```

**Existing case arm style in df-tools.cjs**:

```js
case 'awareness': {
  cmdAwarenessRoute(cwd, args.slice(1), raw);
  break;
}
```

**Existing test runner style** — `lib/awareness.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const aw = require('./awareness.cjs');
const fix = require('./__fixtures__/awareness-fixtures.cjs');

test('parseStateMd — handles in-flight objective', () => {
  const content = fix.buildStateMd({ objective: '2 — Cross-worktree session telemetry' });
  const parsed = aw.parseStateMd(content);
  assert.strictEqual(parsed.objective, '2 — Cross-worktree session telemetry');
});
```

</codebase_examples>

<anti_patterns>

- **DO NOT add LLM-based scoring.** Scoring is token-intersection only. Per CONTEXT.md locked decision #2.
- **DO NOT use `faker`, `casual`, or other random-data generators.** All fixtures must be hand-built factories with explicit args. Per `no_llm_test_data` constraint.
- **DO NOT call live filesystem from unit tests.** All fs reads in `scanSiblings` MUST go through `_runFs` so `_setRunFs` injection works. Live-fs integration tests are gated behind `FS_INTEGRATION=1`.
- **DO NOT add a `--refresh` flag or any caching layer.** The `## Cross-Repo Considerations` section is regenerated cheaply on each `/df:research-objective` call (CONTEXT.md §"Out of scope").
- **DO NOT couple to the awareness cache.** `lib/awareness.cjs::readCache` / `writeCache` are NOT consumed by org-awareness.
- **DO NOT modify `lib/awareness.cjs` or `lib/gh.cjs`.** Obj 3 is a read-only consumer (CONTEXT.md locked decision #4).

</anti_patterns>

<error_recovery>

- **Missing PROJECT.md in a sibling repo** → silently skip that repo. No warning, no entry in result.
- **Malformed PROJECT.md frontmatter** → silently skip (treated like missing). Logged as warning at debug level only.
- **`org` field mismatch** → silently skip.
- **`fs.readdirSync` permission error on a sibling** → catch, log warning, continue with other siblings. Do not throw.
- **Empty `~/Source/*/` glob result** → return `{ matches: [], warnings: ['no sibling repos discovered under ~/Source/*'], scanned_repos: 0 }`. Not an error.
- **`awareness.sibling_repos` config points to non-existent path** → log warning per missing path, skip; if ALL configured paths missing, return empty matches with warning array enumerating each.
- **Current repo's `OBJECTIVE.md` not yet created** (objective dir is empty) → use objective slug + roadmap goal as fallback tokens. Do not throw.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/03-planning-time-org-awareness/03-CONTEXT.md
@.planning/objectives/03-planning-time-org-awareness/03-RESEARCH.md

# Reused obj 1 + obj 2 surfaces:
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
@plugins/devflow/devflow/bin/lib/awareness-cli.cjs

# Pattern reference:
@plugins/devflow/devflow/bin/lib/awareness.test.cjs
@plugins/devflow/devflow/bin/df-tools.cjs
</context>

<research_context>

From parent research (`.planning/research/github-coordination-layer.md` §"Where org-awareness shows up"):

> **During planning (`df:plan-objective`, `df:research-objective`):**
> - Survey sibling repos for related recent work (semantic scan of SUMMARY.md, last 90 days of commits)
> - Output as a "Cross-Repo Considerations" section in CONTEXT.md, influencing TRDs

Obj 3 implements the SUMMARY.md-scan portion using lexical (not semantic) match. Per CONTEXT.md locked decision #2, no LLM scoring; pure token-intersection.

Sibling-repo cardinality observed in user's `~/Source/`: 19 entries (per discovery). Sync `readdirSync` is fine.

Sibling-repo PROJECT.md frontmatter convention from obj 1 spike: `org: AO-Cyber-Systems` is the canonical field name. Some repos may not yet declare `org`; per CONTEXT.md locked decision #5, fall back to "match all .planning/-bearing repos" only when current PROJECT.md ALSO lacks `org`.

</research_context>

<gotchas>

- **`~/Source/*/` glob expansion in JS** — `path` does not glob; resolve `~` via `os.homedir()` then `fs.readdirSync` the resulting path. Filter for entries that are directories AND have `.git/` AND have `.planning/`.
- **`SUMMARY_RECENCY_DAYS` filter is on file mtime, not commit time.** Cheaper than `git log` per file. Acceptable approximation.
- **PROJECT.md frontmatter parsing** — use `lib/frontmatter.cjs::extractFrontmatter`. Returns `{ frontmatter: {...}, body: '...' }`. Permissive parser; never throws.
- **Empty objectives directory** — sibling repo with `.planning/` but no `objectives/` subdirectory: skip the sibling silently (no recent SUMMARY.md to compare).
- **Test injection hooks must wrap ALL fs calls** — even `existsSync` and `statSync`. If you call `fs.X` directly from production code, tests can't mock it. Route everything through `_runFs.X(...)`.
- **`templates/config.json` is the user-facing config schema doc.** Editing it changes what new projects get. Be conservative — add only the two new keys with sensible defaults. Existing keys must not change shape.
- **`process.exit(0)` on success in CLI commands** — use `helpers.cjs::output(payload, raw)` (which exits) or write to stdout + `return` from the command function. Mirror `cmdAwarenessShow`'s pattern.

</gotchas>

## Test list

Per CLAUDE.md TDD Playbook habit 2: enumerate behavior cases BEFORE writing test code. Each case maps to a `t.test()` block.

### Group T (tokenize helper — pure logic)
- T1: empty string → empty Set
- T2: null/undefined input → empty Set
- T3: simple lowercase phrase → set of length-≥3 tokens, deduped
- T4: stop-words filtered ("the auth flow" → just `auth`, `flow`)
- T5: punctuation stripped ("auth-flow.test.cjs" → `auth`, `flow`, `test`, `cjs`)
- T6: hyphen/underscore split ("auth_keys-controller" → `auth`, `keys`, `controller`)
- T7: length filter (tokens with len < 3 dropped — "is", "a", "of" etc never appear)

### Group SC (scoring algorithm — pure logic)
- SC1: identical token sets → score 1.0
- SC2: zero overlap → score 0.0
- SC3: half-overlap → 0.5 (both 4-token sets, 2 shared)
- SC4: empty current set → score 0 (avoid divide by zero)
- SC5: empty sibling set → score 0

### Group D (sibling discovery — `discoverSiblings`)
- D1: default `~/Source/*/` glob with 3 fixture repos (one with .git+.planning, one with .git only, one with .planning only) → returns ONLY the .git+.planning repo
- D2: configured `awareness.sibling_repos: [path1, path2]` REPLACES default (does not merge). One configured path is non-existent; warning emitted, other path scanned.
- D3: home-relative `~/foo` path expanded correctly via `os.homedir()`
- D4: current repo (`process.cwd()`) excluded from sibling list even if it would otherwise match
- D5: sibling repo without PROJECT.md → silently excluded
- D6: sibling repo with PROJECT.md `org: Different-Org` → excluded
- D7: sibling repo with PROJECT.md but no `org` field, AND current PROJECT.md ALSO lacks `org` → INCLUDED (fallback per CONTEXT.md locked decision #5)
- D8: sibling repo with PROJECT.md but no `org` field, AND current PROJECT.md has `org: AO-Cyber-Systems` → EXCLUDED

### Group S (scanSiblings end-to-end)
- S1: happy path — 2 sibling repos, current objective tokens overlap differently with each → returns top-2 sorted by score descending
- S2: top-N truncation — 5 siblings all with non-zero scores → returns top 3
- S3: empty siblings list → `{ matches: [], warnings: [...], scanned_repos: 0 }`
- S4: SUMMARY.md older than 90 days (mtime) → not included in tokens
- S5: sibling with no objectives/ subdir → skipped silently
- S6: sibling SUMMARY.md unreadable (mock readFileSync throws) → warning logged, sibling included with empty tokens (so score 0; likely tail of list)
- S7: tie-break on equal score → most-recent SUMMARY.md mtime wins
- S8: current OBJECTIVE.md absent → uses objective slug + ROADMAP goal as token source (does not throw)

### Group F (fixture builders)
- F1: buildSiblingRepoTree builds directory structure {tmpdir}/repo/{.git,.planning/objectives/01-foo/01-SUMMARY.md,PROJECT.md} when given org+objectives params
- F2: buildSiblingRepoTree omits PROJECT.md when `omit_project_md: true` (for D5 test)
- F3: buildMockRunFs returns canned readFileSync results for configured paths
- F4: buildMockRunFs throws when readFileSync called for unconfigured path (helps catch missing fixtures)

### Group CLI (org-awareness-cli.cjs)
- CLI1: `df-tools org-awareness scan-siblings <obj_id>` returns JSON to stdout
- CLI2: `df-tools org-awareness scan-siblings <obj_id> --raw` returns raw JSON (same as default for now; flag passthrough)
- CLI3: `df-tools org-awareness` (no subcommand) prints help to stderr + exit code 1
- CLI4: `df-tools org-awareness --help` prints help to stderr + exit code 0
- CLI5: `df-tools org-awareness scan-libs <obj_id>` returns placeholder error ("not yet implemented") with exit 1 (will be filled by 03-02)

### Group I (FS_INTEGRATION=1, gated)
- I1 (gated): real `~/Source/*/` walk completes without throw on author's machine; returns scanned_repos count > 0
- I2 (gated): real current-repo PROJECT.md parsed successfully

<tasks>

<task type="auto">
  <name>Task 1: Hand-built fs fixtures + config.json docs (RED preparation)</name>
  <files>
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
    plugins/devflow/devflow/templates/config.json
  </files>
  <action>
**FIXTURE-FIRST PER TDD PLAYBOOK HABIT 4** — fixture work happens BEFORE any behavior test.

**Part 1: Extend `__fixtures__/awareness-fixtures.cjs`** (do not delete or alter obj 2 builders).

Add `buildSiblingRepoTree({ tmpdir, name = 'sibling-repo', org = 'AO-Cyber-Systems', omit_project_md = false, objectives = [{ id: '01-foo', summary_content: 'sibling work on auth keys controller' }], summary_mtime_days_ago = 0 })`:

Approach:
1. Create `${tmpdir}/${name}/` directory
2. Create `${tmpdir}/${name}/.git/` directory (just empty marker — we don't need a real git tree)
3. Create `${tmpdir}/${name}/.planning/` directory
4. If NOT `omit_project_md`: write PROJECT.md with frontmatter `--- \n org: ${org}\n kind: api\n ---\n# ...`
5. For each objective: create `${tmpdir}/${name}/.planning/objectives/${obj.id}/${obj.id}-SUMMARY.md` with body = `obj.summary_content`
6. If `summary_mtime_days_ago > 0`: use `fs.utimesSync` to backdate mtime
7. Optionally write `${tmpdir}/${name}/.planning/STATE.md` with stub state
8. Return `{ root: ${tmpdir}/${name}, project_md_path, objective_paths: [...] }`

# CRITICAL: Use os.tmpdir() + crypto.randomBytes for tmpdir; tests are responsible for cleanup via fs.rmSync(root, { recursive: true })
# PATTERN: Mirror buildGitFixtureRepo (obj 2) which already does tmpdir cleanup pattern

Add `buildMockRunFs({ files = {}, dirs = {}, missing = [] } = {})`:

Approach:
- `files`: map of absolute path → file content string
- `dirs`: map of absolute path → array of dirent names (for readdirSync)
- `missing`: array of paths that should report `existsSync(p) === false` and `readFileSync(p)` should throw `ENOENT`

Returns object with shape:
```js
{
  readFileSync: (p, enc) => {
    if (missing.includes(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    if (files[p] != null) return files[p];
    throw new Error(`buildMockRunFs: no fixture for path: ${p}`);
  },
  readdirSync: (p, opts) => {
    if (dirs[p] != null) return dirs[p];
    throw new Error(`buildMockRunFs: no fixture dir: ${p}`);
  },
  existsSync: (p) => !missing.includes(p) && (files[p] != null || dirs[p] != null),
  statSync: (p) => {
    if (files[p] != null) return { isDirectory: () => false, isFile: () => true, mtimeMs: Date.now() };
    if (dirs[p] != null) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
    throw new Error(`buildMockRunFs: no fixture stat for path: ${p}`);
  },
}
```

# GOTCHA: tests that touch mtime filtering need to override the mtimeMs default. Add `mtimes: { [path]: msSinceEpoch }` opts override.

**Part 2: Document config keys in `templates/config.json`**

Read existing `templates/config.json` first. Add (preserving JSON validity) under `awareness:` block (the block was added by obj 2 TRD 02-04):
```json
"awareness": {
  ...existing keys...,
  "sibling_repos": [],
  "eden_libs_path": null
}
```

If `awareness:` block doesn't exist in the file, create it. The existing file already has it from obj 2 — verify.

Comment lines (since JSON doesn't support comments, document inline via a `_doc` field if pattern exists, or via a separate `# comment` if file uses JSON5; check current file format first).

# CRITICAL: Do not change shape of existing fields. Add only the two new ones with empty/null defaults.
  </action>
  <verify>
- `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); const t=f.buildSiblingRepoTree({tmpdir:require("os").tmpdir()}); console.log(t.root); require("fs").rmSync(t.root,{recursive:true})'`
- `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); const m=f.buildMockRunFs({files:{"/a":"hi"},dirs:{"/d":["x"]},missing:["/m"]}); console.log(m.readFileSync("/a"), m.readdirSync("/d"), m.existsSync("/m"))'`
- `cat plugins/devflow/devflow/templates/config.json | python3 -c 'import sys,json; c=json.load(sys.stdin); assert "awareness" in c; print("OK")'`
- All 6 obj 2 fixture builders still importable (regression check)
  </verify>
  <done>
buildSiblingRepoTree + buildMockRunFs are loadable from awareness-fixtures.cjs alongside the obj 2 builders. templates/config.json documents the two new awareness keys with empty defaults. No obj 2 fixture or config field is altered.
  </done>
  <recovery>
If tmpdir creation fails: ensure os.tmpdir() returns writable path (it does on macOS/Linux). On Windows CI: use os.tmpdir() unconditionally.
If templates/config.json shape changes break parser: revert the file and add only the two new keys via JSON.parse → mutate → JSON.stringify cycle (preserves shape best).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: RED — write failing tests for tokenize, scoring, scanSiblings</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
    plugins/devflow/devflow/bin/lib/org-awareness-cli.test.cjs
  </files>
  <action>
**RED PHASE PER TDD PLAYBOOK HABIT 3 — one test at a time.**

Write tests for ALL groups in the Test list (T, SC, D, S, F, CLI). Tests MUST fail because `lib/org-awareness.cjs` and `lib/org-awareness-cli.cjs` don't yet exist.

`org-awareness.test.cjs` structure:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const oa = require('./org-awareness.cjs');
const fix = require('./__fixtures__/awareness-fixtures.cjs');

// Group T — tokenize
test('T1 — tokenize empty string returns empty Set', () => {
  const t = oa._tokenize ? oa._tokenize('') : oa.tokenize ? oa.tokenize('') : null;
  // Either name acceptable; just assert empty Set
  assert.strictEqual((t || new Set()).size, 0);
});
// ... T2-T7

// Group SC — scoring
test('SC1 — identical token sets score 1.0', () => {
  const a = new Set(['auth', 'flow']);
  const b = new Set(['auth', 'flow']);
  assert.strictEqual(oa._score(a, b), 1.0);
});
// ... SC2-SC5

// Group D — discoverSiblings (use buildSiblingRepoTree fixtures)
test('D1 — default glob includes only .git+.planning repos', () => {
  // Build tmpdir with 3 sibling repos; mock _runFs
  // ...
});
// ... D2-D8

// Group S — scanSiblings end-to-end
test('S1 — top-2 sorted by score descending', () => {
  // ...
});
// ... S2-S8

// Group F — fixture sanity
test('F1 — buildSiblingRepoTree creates expected layout', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sibtree-'));
  try {
    const t = fix.buildSiblingRepoTree({ tmpdir: tmp, name: 'foo', org: 'AO-Cyber-Systems' });
    assert.ok(fs.existsSync(path.join(t.root, '.git')));
    assert.ok(fs.existsSync(path.join(t.root, '.planning')));
    assert.ok(fs.existsSync(path.join(t.root, 'PROJECT.md')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
// ... F2-F4

// Group I — gated FS_INTEGRATION
test('I1 — real ~/Source/*/ walk', { skip: !process.env.FS_INTEGRATION }, () => {
  const r = oa.scanSiblings({ objective_id: '03', cwd: process.cwd() });
  assert.ok(r.scanned_repos >= 0);
});
```

`org-awareness-cli.test.cjs` structure:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');

test('CLI1 — scan-siblings returns JSON to stdout', () => {
  const r = spawnSync('node', [dfTools, 'org-awareness', 'scan-siblings', '03', '--raw'], {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  // We expect non-empty stdout that parses as JSON
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.ok('matches' in parsed);
});

test('CLI3 — no subcommand prints help to stderr + exit 1', () => {
  const r = spawnSync('node', [dfTools, 'org-awareness'], { encoding: 'utf-8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /scan-siblings|Usage/i);
});

// CLI2, CLI4, CLI5
```

# CRITICAL: Tests must currently FAIL with module-not-found errors. That IS the red signal.
# PATTERN: Mirror lib/awareness.test.cjs and lib/awareness-cli.test.cjs structure exactly.

Run `npm test 2>&1 | grep -i 'org-awareness' | head -20` — should show all groups failing on module not found.

**Commit RED phase:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.test.cjs plugins/devflow/devflow/bin/lib/org-awareness-cli.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs plugins/devflow/devflow/templates/config.json
git commit -m "test(03-01): add failing tests for scanSiblings + tokenize + scoring + CLI router

RED phase: tests fail because lib/org-awareness.cjs and lib/org-awareness-cli.cjs
don't yet exist. Hand-built fixture builders (buildSiblingRepoTree, buildMockRunFs)
follow obj 2's pattern; templates/config.json documents the two new awareness keys."
```
  </action>
  <verify>
`npm test 2>&1 | grep -E 'org-awareness|FAIL|fail'` shows test failures with module-not-found errors. Test count for org-awareness groups (T, SC, D, S, F, CLI, I) >= 35 cases.
  </verify>
  <done>
test commit lands. All test cases per Test list are written. Tests fail with module-not-found errors (org-awareness.cjs / org-awareness-cli.cjs missing). Fixture sanity tests (Group F) pass standalone since fixtures exist.
  </done>
  <recovery>
If a test passes accidentally (because of a stub that shouldn't exist yet): make sure the production module file truly does not yet exist. Delete any premature stub before committing the RED test.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: GREEN — implement scanSiblings + tokenize + _setRunFs + CLI router scaffold</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.cjs
    plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
    plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
**GREEN PHASE PER TDD PLAYBOOK HABIT 3 — minimal code to pass the RED tests.**

**Part 1: Create `lib/org-awareness.cjs` — module skeleton + scanSiblings + helpers + partial exports**

Module structure (mirror lib/awareness.cjs region-comment style):

```js
'use strict';

/**
 * Planning-time org-awareness scanner.
 *
 * Surfaces three signals into CONTEXT.md's `## Cross-Repo Considerations` section:
 *   1. Sibling repos in ~/Source/*/  (this TRD: scanSiblings)
 *   2. eden-libs reuse candidates    (TRD 03-02: scanLibs)
 *   3. Org Project overlap           (TRD 03-03: scanOrgOverlap)
 * Markdown rendering: TRD 03-04 (formatConsiderations).
 *
 * Module growth across waves:
 *   TRD 03-01: skeleton + scanSiblings + tokenize + _setRunFs   (THIS TRD)
 *   TRD 03-02: scanLibs
 *   TRD 03-03: scanOrgOverlap + misfiling
 *   TRD 03-04: formatConsiderations
 *   TRD 03-07: module.exports finalization + integration tests
 *
 * Iron Law: All filesystem operations route through `_runFs.X(...)` so test
 * injection via `_setRunFs(mock)` is reliable.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractFrontmatter } = require('./frontmatter.cjs');
const aw = require('./awareness.cjs');

// ─── Constants ────────────────────────────────────────────────────────────────

const TOP_N = 3;
const SUMMARY_RECENCY_DAYS = 90;
const DEFAULT_SIBLING_GLOB = '~/Source/*/';
const DEFAULT_EDEN_LIBS_PATH = '~/Source/eden-libs';
const STOP_WORDS = new Set([
  'a','an','the','of','for','in','on','with','to','from','by','at',
  'is','are','was','were','be','been','being','have','has','had',
]);

// ─── Filesystem injection hook ────────────────────────────────────────────────

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetFsMock() { _runFs = realFs; }

// ─── Tokenization + scoring helpers ───────────────────────────────────────────

function _tokenize(text) {
  if (!text || typeof text !== 'string') return new Set();
  const tokens = text.toLowerCase()
    .replace(/[^a-z0-9\s_/-]/g, ' ')
    .split(/[\s\-_/]+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function _score(a, b) {
  if (!a || !b || a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / Math.max(a.size, b.size);
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function _expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (p === '~') return os.homedir();
  return p;
}

// ─── Sibling discovery ────────────────────────────────────────────────────────

function _discoverSiblings({ cwd = process.cwd(), config_paths = null } = {}) {
  const out = { paths: [], warnings: [] };
  const currentRepoAbs = path.resolve(cwd);

  let candidatePaths = [];
  if (Array.isArray(config_paths) && config_paths.length > 0) {
    // configured paths replace default (no merge)
    for (const cp of config_paths) {
      const expanded = _expandHome(cp);
      if (!_runFs.existsSync(expanded)) {
        out.warnings.push(`configured sibling path not found: ${cp}`);
        continue;
      }
      candidatePaths.push(expanded);
    }
  } else {
    // default: walk ~/Source/*/ — readdir the parent
    const sourceRoot = _expandHome('~/Source');
    if (!_runFs.existsSync(sourceRoot)) {
      out.warnings.push(`default sibling root not found: ${sourceRoot}`);
      return out;
    }
    let entries;
    try {
      entries = _runFs.readdirSync(sourceRoot);
    } catch (e) {
      out.warnings.push(`readdir failed for ${sourceRoot}: ${e.message}`);
      return out;
    }
    for (const name of entries) {
      candidatePaths.push(path.join(sourceRoot, name));
    }
  }

  for (const p of candidatePaths) {
    if (path.resolve(p) === currentRepoAbs) continue; // exclude self
    try {
      if (!_runFs.statSync(p).isDirectory()) continue;
    } catch { continue; }
    if (!_runFs.existsSync(path.join(p, '.git'))) continue;
    if (!_runFs.existsSync(path.join(p, '.planning'))) continue;
    out.paths.push(p);
  }
  return out;
}

// ─── Read PROJECT.md ──────────────────────────────────────────────────────────

function _readProjectMd(repoPath) {
  const p = path.join(repoPath, 'PROJECT.md');
  if (!_runFs.existsSync(p)) return null;
  try {
    const content = _runFs.readFileSync(p, 'utf-8');
    const { frontmatter } = extractFrontmatter(content);
    return frontmatter || {};
  } catch {
    return null;
  }
}

// ─── Read recent SUMMARY.md files for a sibling ───────────────────────────────

function _readRecentSummaries(repoPath, recencyMs = SUMMARY_RECENCY_DAYS * 86400000) {
  const out = { items: [], warnings: [] };
  const objDir = path.join(repoPath, '.planning', 'objectives');
  if (!_runFs.existsSync(objDir)) return out;

  let entries;
  try { entries = _runFs.readdirSync(objDir); } catch (e) {
    out.warnings.push(`readdir ${objDir} failed: ${e.message}`);
    return out;
  }

  const now = Date.now();
  for (const objName of entries) {
    const subDir = path.join(objDir, objName);
    let subEntries;
    try { subEntries = _runFs.readdirSync(subDir); } catch { continue; }
    for (const f of subEntries) {
      if (!/SUMMARY\.md$/.test(f)) continue;
      const filePath = path.join(subDir, f);
      let stat;
      try { stat = _runFs.statSync(filePath); } catch { continue; }
      if ((now - stat.mtimeMs) > recencyMs) continue;
      let body;
      try { body = _runFs.readFileSync(filePath, 'utf-8'); } catch (e) {
        out.warnings.push(`read ${filePath} failed: ${e.message}`);
        body = '';
      }
      out.items.push({ obj: objName, path: filePath, mtime: stat.mtimeMs, body });
    }
  }
  return out;
}

// ─── Current-objective token extraction ───────────────────────────────────────

function _readCurrentObjectiveTokens(objective_id, cwd) {
  const objDirGlob = path.join(cwd, '.planning', 'objectives');
  const candidate_tokens = new Set();
  // Use objective_id slug as base
  for (const t of _tokenize(objective_id)) candidate_tokens.add(t);
  // Try to read OBJECTIVE.md if it exists
  if (_runFs.existsSync(objDirGlob)) {
    try {
      const objs = _runFs.readdirSync(objDirGlob);
      const matching = objs.find(n => n.startsWith(`${objective_id}-`) || n === objective_id);
      if (matching) {
        const objMdPath = path.join(objDirGlob, matching, 'OBJECTIVE.md');
        if (_runFs.existsSync(objMdPath)) {
          try {
            const content = _runFs.readFileSync(objMdPath, 'utf-8');
            const { frontmatter, body } = extractFrontmatter(content);
            if (frontmatter && frontmatter.title) for (const t of _tokenize(frontmatter.title)) candidate_tokens.add(t);
            if (body) for (const t of _tokenize(body.slice(0, 2000))) candidate_tokens.add(t);
          } catch { /* swallow */ }
        }
      }
    } catch { /* swallow */ }
  }
  return candidate_tokens;
}

// ─── scanSiblings ─────────────────────────────────────────────────────────────

function scanSiblings({ objective_id, cwd = process.cwd(), config_paths = null } = {}) {
  if (!objective_id) throw new Error('scanSiblings: objective_id is required');

  const out = { matches: [], warnings: [], scanned_repos: 0 };

  const currentTokens = _readCurrentObjectiveTokens(objective_id, cwd);
  const currentProject = _readProjectMd(cwd);
  const currentOrg = currentProject ? currentProject.org : null;

  const disc = _discoverSiblings({ cwd, config_paths });
  out.warnings.push(...disc.warnings);

  for (const siblingPath of disc.paths) {
    const sibProj = _readProjectMd(siblingPath);
    if (!sibProj) continue; // missing PROJECT.md → silently skip per CONTEXT.md
    // org match: if both declare org, must match. If current declares but sibling doesn't, exclude.
    if (currentOrg) {
      if (sibProj.org && sibProj.org !== currentOrg) continue;
      if (!sibProj.org) continue;
    }
    // (else: current lacks org → fallback per locked decision #5; include sibling)

    out.scanned_repos++;
    const recents = _readRecentSummaries(siblingPath);
    out.warnings.push(...recents.warnings);

    let bestScore = 0;
    let bestObj = null;
    let bestMtime = 0;
    let combinedTokens = new Set();
    for (const item of recents.items) {
      const tokens = _tokenize(item.body);
      for (const t of tokens) combinedTokens.add(t);
      const score = _score(currentTokens, tokens);
      if (score > bestScore || (score === bestScore && item.mtime > bestMtime)) {
        bestScore = score;
        bestObj = item.obj;
        bestMtime = item.mtime;
      }
    }

    // include even with 0 score so tests can rank (sort will push to tail)
    out.matches.push({
      repo: path.basename(siblingPath),
      path: siblingPath,
      score: bestScore,
      best_objective: bestObj,
      best_summary_mtime: bestMtime || null,
      summary_count: recents.items.length,
    });
  }

  // Sort by score desc, then mtime desc, then take top-N
  out.matches.sort((a, b) => (b.score - a.score) || ((b.best_summary_mtime || 0) - (a.best_summary_mtime || 0)));
  out.matches = out.matches.slice(0, TOP_N);

  return out;
}

// ─── Partial exports (TRD 03-01) ──────────────────────────────────────────────
//
// This export block is the AUTHORITATIVE surface FOR THIS WAVE only.
// TRDs 03-02, 03-03, 03-04 each extend this block. TRD 03-07 finalizes it
// (asserts the full 11-entry surface via Object.keys deepStrictEqual).

module.exports = {
  scanSiblings,
  _setRunFs,
  _resetFsMock,
  _tokenize,    // exported for tests; internal callers use it locally
  _score,       // exported for tests
  TOP_N,
  SUMMARY_RECENCY_DAYS,
  DEFAULT_SIBLING_GLOB,
  DEFAULT_EDEN_LIBS_PATH,
};
```

# CRITICAL: All fs reads route through _runFs (not direct fs.X). Tests inject mocks via _setRunFs.
# GOTCHA: extractFrontmatter from frontmatter.cjs returns { frontmatter, body }. It's permissive — never throws.
# PATTERN: Mirror lib/awareness.cjs region-comment style; identical CommonJS layout.

**Part 2: Create `lib/org-awareness-cli.cjs` — CLI router scaffold**

```js
'use strict';

const oa = require('./org-awareness.cjs');
const { output } = require('./helpers.cjs');

function cmdOrgAwarenessScanSiblings(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness scan-siblings <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }
  const result = oa.scanSiblings({ objective_id, cwd });
  output(result, raw);
}

function cmdOrgAwarenessScanLibs(cwd, args, raw) {
  // TRD 03-02 fills this in
  process.stderr.write('scan-libs not yet implemented (TRD 03-02)\n');
  process.exit(1);
}

function cmdOrgAwarenessScanOrgOverlap(cwd, args, raw) {
  // TRD 03-03 fills this in
  process.stderr.write('scan-org-overlap not yet implemented (TRD 03-03)\n');
  process.exit(1);
}

function cmdOrgAwarenessConsiderations(cwd, args, raw) {
  // TRD 03-04/03-05 fills this in
  process.stderr.write('considerations not yet implemented (TRD 03-04)\n');
  process.exit(1);
}

function cmdOrgAwarenessRoute(cwd, args, raw) {
  const sub = args[0];
  const rest = args.slice(1);
  if (!sub || sub === '--help' || sub === '-h') {
    process.stderr.write([
      'Usage: df-tools org-awareness <subcommand> [args]',
      '',
      'Subcommands:',
      '  scan-siblings <objective_id> [--raw]      Walk sibling repos under ~/Source/*/ for keyword overlap',
      '  scan-libs <objective_id> [--raw]          Scan eden-libs for reusable exports (TRD 03-02)',
      '  scan-org-overlap <objective_id> [--raw]   Walk org Product Roadmap for overlapping work (TRD 03-03)',
      '  considerations <objective_id> [--raw]     Run all three scans + render Markdown section (TRD 03-04+)',
      '',
    ].join('\n'));
    process.exit(sub ? 0 : 1);
    return;
  }
  if (sub === 'scan-siblings') return cmdOrgAwarenessScanSiblings(cwd, rest, raw);
  if (sub === 'scan-libs') return cmdOrgAwarenessScanLibs(cwd, rest, raw);
  if (sub === 'scan-org-overlap') return cmdOrgAwarenessScanOrgOverlap(cwd, rest, raw);
  if (sub === 'considerations') return cmdOrgAwarenessConsiderations(cwd, rest, raw);
  process.stderr.write(`Unknown org-awareness subcommand: ${sub}\n`);
  process.exit(1);
}

module.exports = {
  cmdOrgAwarenessRoute,
  cmdOrgAwarenessScanSiblings,
  cmdOrgAwarenessScanLibs,
  cmdOrgAwarenessScanOrgOverlap,
  cmdOrgAwarenessConsiderations,
};
```

**Part 3: Wire into `df-tools.cjs`**

- Add `const { cmdOrgAwarenessRoute } = require('./lib/org-awareness-cli.cjs');` near the existing `cmdAwarenessRoute` import.
- Add `case 'org-awareness': { cmdOrgAwarenessRoute(cwd, args.slice(1), raw); break; }` arm right after the `case 'awareness':` arm.
- Add `org-awareness` to the help string in the `error('Usage: ...')` line.

**Run tests until green:**
```bash
npm test 2>&1 | grep -E 'org-awareness|FAIL|fail' | head -30
```
Expect all groups (T, SC, D, S, F, CLI) to pass except FS_INTEGRATION-gated I1/I2 (skipped without env var).

**Commit GREEN phase:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.cjs plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs plugins/devflow/devflow/bin/df-tools.cjs
git commit -m "feat(03-01): implement scanSiblings + tokenize + CLI router scaffold

GREEN phase: lib/org-awareness.cjs ships with scanSiblings (tokenize + score
+ Jaccard-like overlap), _setRunFs/_resetFsMock injection hooks, and constants.
lib/org-awareness-cli.cjs provides the df-tools subcommand router with stubs
for scan-libs/scan-org-overlap/considerations (filled in 03-02/03-03/03-04).
df-tools.cjs adds the case 'org-awareness' arm.

Closes SC-1, SC-2 (sibling scanner + configurable discovery)."
```
  </action>
  <verify>
- `npm test 2>&1 | tail -20` — full suite passes (existing 731 + ~35 new tests). Specifically: groups T, SC, D, S, F all pass; CLI tests pass with exit codes matching cases.
- `node plugins/devflow/devflow/bin/df-tools.cjs org-awareness 2>&1 | grep -c 'scan-siblings'` returns ≥ 1
- `node plugins/devflow/devflow/bin/df-tools.cjs org-awareness scan-siblings 03 --raw 2>&1 | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); assert "matches" in d; assert "warnings" in d; print("OK")'`
- All exports listed in must_haves.artifacts present (verify via the verification_commands node -e check)
  </verify>
  <done>
feat commit lands. RED tests are now GREEN. Module is loadable, exports match the partial-surface contract for this wave (10 entries listed in module.exports), CLI router dispatches correctly, df-tools recognizes the new subcommand. FS_INTEGRATION-gated tests skip cleanly without env var.
  </done>
  <recovery>
If `npm test` reveals a regression in obj 1/obj 2 tests: examine the diff to gh.cjs / awareness.cjs / awareness-fixtures.cjs (you should NOT have touched gh.cjs or awareness.cjs; awareness-fixtures.cjs additions should be additive only). If found, revert and rebuild additions.
If df-tools.cjs case arm has a syntax error: re-read the existing `case 'awareness':` arm and copy its exact shape verbatim, only changing the command name and route function name.
If `extractFrontmatter` returns `null` instead of `{ frontmatter, body }` for some PROJECT.md: defensive code already handles via `if (!sibProj)`. Verify against an actual `.planning/PROJECT.md` in this repo.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none — repo has no lint command per CLAUDE.md)</lint>
<test>npm test</test>
<build>(none — no build step)</build>
</validation_gates>

<verification>
1. `npm test` passes (no regressions in 731 obj-2 baseline tests + new tests pass).
2. `lib/org-awareness.cjs` loads in a fresh process and exports the 9 partial-surface symbols.
3. `df-tools org-awareness scan-siblings 03 --raw` exits 0 with parseable JSON.
4. `df-tools org-awareness` (no args) exits 1 with help text on stderr.
5. `templates/config.json` retains shape (json-parseable; existing keys unchanged).
6. obj 2's `awareness.cjs`, `gh.cjs`, `awareness-cli.cjs` files are NOT modified (read-only consumer principle).
7. All 6 obj 2 fixture builders still importable (no breakage in extension).
</verification>

<success_criteria>
- [ ] `lib/org-awareness.cjs` created with scanSiblings + tokenize + scoring + _setRunFs hooks
- [ ] `lib/org-awareness.test.cjs` created with all Test list groups (T, SC, D, S, F, CLI, I)
- [ ] `lib/org-awareness-cli.cjs` created with cmdOrgAwarenessRoute dispatching to scanSiblings (other subcommand stubs return placeholder errors)
- [ ] `lib/__fixtures__/awareness-fixtures.cjs` extended with buildSiblingRepoTree + buildMockRunFs (obj 2 builders preserved)
- [ ] `df-tools.cjs` routes `org-awareness` subcommand
- [ ] `templates/config.json` documents `awareness.sibling_repos` + `awareness.eden_libs_path`
- [ ] RED commit (test:) precedes GREEN commit (feat:) per TDD Playbook habit 3
- [ ] `npm test` shows all new tests passing; FS_INTEGRATION I1/I2 skip cleanly
- [ ] SC-1 (sibling walker returns top-3 by overlap) verifiable via S1+S2 test cases
- [ ] SC-2 (configurable + silent skip) verifiable via D2/D5/D6/D7/D8 test cases
</success_criteria>

<output>
After completion, create `.planning/objectives/03-planning-time-org-awareness/03-01-sibling-scanner-and-fixtures-SUMMARY.md`.
</output>
