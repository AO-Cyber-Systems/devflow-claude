---
objective: 04-duplicate-work-detection
trd: 04-01
title: Detection engine + signal scoring + injection helpers + buildDupDetectFixtures (foundation for dup-detect module)
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/dup-detect.cjs
  - plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
  - plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs
  - plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements: [SC-1, SC-2, SC-3, SC-4]
verification_commands:
  - "npm test -- --grep 'dup-detect|detectDuplicates|signal'"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/dup-detect.cjs\"); for (const s of [\"detectDuplicates\",\"_setRunPeer\",\"_setRunOrgOverlap\",\"_setRunFs\",\"_resetMocks\",\"_detectHardMatch\",\"_detectStrongMatch\",\"_detectWeakMatch\",\"_readPeerFilesModified\",\"HARD_MATCH_THRESHOLD\",\"STRONG_FILE_OVERLAP_THRESHOLD\",\"STRONG_KEYWORD_OVERLAP_THRESHOLD\"]) if(typeof a[s]===\"undefined\") throw new Error(s+\" not exported\"); console.log(\"OK\");'"
  - "node -e 'const f=require(\"./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs\"); for (const s of [\"buildPeerBranch\",\"buildPeerScanResult\",\"buildOrgOverlapMatch\",\"buildDupDetectFixtures\"]) if(typeof f[s]!==\"function\") throw new Error(s+\" fixture not exported\"); console.log(\"OK\");'"
  - "node ./plugins/devflow/devflow/bin/df-tools.cjs dup-detect 2>&1 | grep -E 'mode plan|mode execute|resolve|log'"
  - "git log --oneline -- plugins/devflow/devflow/bin/lib/dup-detect.cjs plugins/devflow/devflow/bin/lib/dup-detect.test.cjs | grep -E '^[a-f0-9]+ test' | head -1"

must_haves:
  truths:
    - "lib/dup-detect.cjs module exists with stable header, requires, constants block (HARD_MATCH_THRESHOLD=1, STRONG_FILE_OVERLAP_THRESHOLD=2, STRONG_KEYWORD_OVERLAP_THRESHOLD=3, DUP_DETECT_LOG_REL, DEFERRED_DIR_REL), and three injection hooks (_setRunPeer, _setRunOrgOverlap, _setRunFs) plus _resetMocks"
    - "detectDuplicates({ objective, projectCtx, mode, cwd, peer_scan?, org_overlap?, current_files_modified?, current_keywords?, current_github_issue? }) returns { blocking: bool, matches: [...], advisory: [...], warnings: [...], mode, timestamp } with mode='execute' filtering advisory to empty array"
    - "Hard match detection: same github_issue ref between current and peer (string equality) OR org-overlap item with chain_match: true AND issue_ref matches current github_issue. Both detection paths covered."
    - "Strong match detection: |current_files_modified ∩ peer_files_modified| >= 2 (lexical path equality) OR |current_keywords ∩ peer_keywords| >= 3 (using obj 3's _tokenize)"
    - "Weak match detection: 1-2 keyword overlap, single shared file. Surfaced in result.advisory at plan-time; filtered out at execute-time."
    - "_readPeerFilesModified(peer_branch, cwd) reads peer's TRDs via `git show <branch>:.planning/objectives/<dir>/<file>-TRD.md` for each TRD file; uses extractFrontmatter; returns string[] of all files_modified from all TRDs (deduplicated). Missing TRDs silently skipped."
    - "Hand-built fixtures: buildPeerBranch (single peer entry shape), buildPeerScanResult (wraps branches array for scanPeer mock returns), buildOrgOverlapMatch (single org item entry), buildDupDetectFixtures (combined helper returning paired peer + org fixtures with hard/strong/weak signal variations)"
    - "df-tools dup-detect --mode plan <objective_id> CLI subcommand emits structured JSON via lib/dup-detect-cli.cjs router; --mode execute filters advisory; both via cmdDupDetectRoute"
    - "Infrastructure failure tolerance: scanPeer throws → continue with org-only; scanOrgOverlap.skipped: true → continue with peer-only; both fail → return { blocking: false, matches: [], advisory: [], warnings: [...] } with no exception"
    - "All new tests follow RED → GREEN → REFACTOR: test: commit precedes feat: commit per TDD Playbook"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/dup-detect.cjs"
      provides: "Module skeleton + detectDuplicates + signal helpers (_detectHardMatch/_detectStrongMatch/_detectWeakMatch) + _readPeerFilesModified + _setRunPeer/_setRunOrgOverlap/_setRunFs/_resetMocks injection hooks + constants. Partial module.exports containing only this TRD's exports."
      exports: ["detectDuplicates", "_setRunPeer", "_setRunOrgOverlap", "_setRunFs", "_resetMocks", "_detectHardMatch", "_detectStrongMatch", "_detectWeakMatch", "_readPeerFilesModified", "HARD_MATCH_THRESHOLD", "STRONG_FILE_OVERLAP_THRESHOLD", "STRONG_KEYWORD_OVERLAP_THRESHOLD", "DUP_DETECT_LOG_REL", "DEFERRED_DIR_REL"]
    - path: "plugins/devflow/devflow/bin/lib/dup-detect.test.cjs"
      provides: "Test suite for detectDuplicates + signal helpers + _readPeerFilesModified. Includes happy/edge/failure cases per Test list."
      min_lines: 250
    - path: "plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs"
      provides: "CLI subcommand router for `df-tools dup-detect <subcommand>`. Wires --mode plan/execute to detectDuplicates; placeholder error stubs for resolve/log subcommands (filled in 04-02)."
      exports: ["cmdDupDetectRoute", "cmdDupDetectDetect"]
    - path: "plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs"
      provides: "Tests for --mode plan/execute command wiring + --raw flag + help text + stubs for 04-02 commands."
      min_lines: 60
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "Extended file with buildPeerBranch + buildPeerScanResult + buildOrgOverlapMatch + buildDupDetectFixtures builders (preserves all obj 2 + obj 3 builders unchanged)."
      contains: "buildDupDetectFixtures"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "Single-line `case 'dup-detect': cmdDupDetectRoute(cwd, args.slice(1), raw); break;` arm in main router; `dup-detect` added to error/help string."
      contains: "case 'dup-detect'"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.cjs"
      to: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      via: "scanPeer composition (via _runPeer injection)"
      pattern: "require.*awareness\\.cjs"
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.cjs"
      to: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      via: "scanOrgOverlap + _tokenize composition"
      pattern: "require.*org-awareness\\.cjs"
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.cjs"
      to: "plugins/devflow/devflow/bin/lib/frontmatter.cjs"
      via: "extractFrontmatter for peer TRD parsing"
      pattern: "extractFrontmatter"
    - from: "plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs"
      to: "plugins/devflow/devflow/bin/lib/dup-detect.cjs"
      via: "require + detectDuplicates dispatch"
      pattern: "require.*dup-detect\\.cjs"
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs"
      via: "require + cmdDupDetectRoute"
      pattern: "cmdDupDetectRoute"
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.test.cjs"
      to: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      via: "require for fixture builders"
      pattern: "buildPeerBranch|buildOrgOverlapMatch|buildDupDetectFixtures"
---

<objective>
Lay the foundation for `lib/dup-detect.cjs` — the duplicate-work detection module that powers plan-time and execute-time checkpoints. Ship the **detection engine** (`detectDuplicates` + 3 signal helpers + peer files_modified reader) plus the hand-built fixture builders every later TRD reuses, plus the CLI subcommand router skeleton.

Purpose: TRD 04-02 (resolution recorder) and TRD 04-03 (formatter) both extend `dup-detect.cjs`. Skill-workflow TRDs (04-04, 04-05) consume the CLI surface. This TRD locks all foundational shapes (detection engine API, fixture builders, CLI router) so subsequent waves get a stable baseline. Per TDD Playbook habit 4 (fixture builders, not LLM-generated test data), fixtures must be hand-built and committed before any behavior test.

Output:
1. A loadable `lib/dup-detect.cjs` module with `detectDuplicates` + signal helpers + injection hooks + constants.
2. A complete test suite (`dup-detect.test.cjs`) for engine + signal helpers + peer-file reader.
3. The fixture builders in `awareness-fixtures.cjs`: `buildPeerBranch`, `buildPeerScanResult`, `buildOrgOverlapMatch`, `buildDupDetectFixtures`.
4. The CLI router scaffold (`dup-detect-cli.cjs` + tests + df-tools.cjs case arm).
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                          ← MODIFY  (case 'dup-detect' arm)
└── lib/
    ├── dup-detect.cjs                                    ← CREATE  (skeleton + detectDuplicates + signal helpers)
    ├── dup-detect.test.cjs                               ← CREATE  (test suite)
    ├── dup-detect-cli.cjs                                ← CREATE  (CLI subcommand router)
    ├── dup-detect-cli.test.cjs                           ← CREATE  (CLI tests)
    └── __fixtures__/
        └── awareness-fixtures.cjs                        ← MODIFY  (extend with peer + org-overlap + combined fixtures)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing test injection hook pattern** — `lib/org-awareness.cjs::_setRunFs` (obj 3 ship):

```js
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

**Adapt to dup-detect**: use the SAME `_runFs` pattern PLUS two higher-level injectors that mock the composed scanners directly:

```js
const aw = require('./awareness.cjs');
const orgaw = require('./org-awareness.cjs');

let _runPeer = (opts) => aw.scanPeer(opts);
let _runOrgOverlap = (opts) => orgaw.scanOrgOverlap(opts);

function _setRunPeer(fn) { _runPeer = (fn != null) ? fn : ((opts) => aw.scanPeer(opts)); }
function _setRunOrgOverlap(fn) { _runOrgOverlap = (fn != null) ? fn : ((opts) => orgaw.scanOrgOverlap(opts)); }
function _resetMocks() {
  _runPeer = (opts) => aw.scanPeer(opts);
  _runOrgOverlap = (opts) => orgaw.scanOrgOverlap(opts);
  _runFs = realFs;
}
```

**Existing scanner composition pattern** — `lib/org-awareness.cjs::scanOrgOverlap` (obj 3 ship):

```js
function scanOrgOverlap({ objective_id, current_tokens = new Set(), sibling_repos = [], frontmatter = {}, projectCtx = {} } = {}) {
  const out = { items: [], warnings: [], skipped: false, misfiling: null };
  let scanResult = null;
  try {
    scanResult = aw.scanOrg();
  } catch (e) {
    if (e && e.name === 'GhAuthError') {
      out.skipped = true;
      out.warnings.push(`org-overlap unavailable: ${e.message}. Run: ${e.remediation}`);
      return out;
    }
    throw e;
  }
  // ... score + filter + return
  return out;
}
```

**Adapt for detectDuplicates**: same try/catch around peer + org scanners; warnings array; never throws. Returns structured result with `blocking`/`matches`/`advisory`/`warnings`.

**Existing tokenize reuse pattern** — `lib/org-awareness.cjs::_tokenize` (obj 3 ship):

```js
const orgaw = require('./org-awareness.cjs');
const tokens = orgaw._tokenize(text); // returns Set<string>
```

**git show + extractFrontmatter pattern** — `lib/awareness.cjs::scanPeer` (obj 2 ship, line 352-360):

```js
const showR = _runGit(['show', `${ref}:.planning/STATE.md`], { cwd });
if (!showR.ok) {
  // SC-2: silently skip branches without STATE.md
  continue;
}
const parsed = parseStateMd(showR.stdout);
```

**Adapt for _readPeerFilesModified** — read peer's TRD frontmatter via `git show`:

```js
const { extractFrontmatter } = require('./frontmatter.cjs');
const { spawnSync } = require('child_process');

function _runGit(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf-8', stdio: ['pipe','pipe','pipe'], timeout: 30000, ...opts });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: (r.stderr || '').trim() };
}

function _readPeerFilesModified(peer_branch, cwd) {
  // 1. Find peer's objective dir name via `git show <branch>:.planning/STATE.md` parse
  // 2. List peer's TRDs via `git show <branch>` (we'll use `git ls-tree` for listing)
  // 3. For each TRD file path, `git show <branch>:<path>` + extractFrontmatter
  // 4. Union all files_modified arrays; dedupe; return string[]
  // ...
}
```

**Existing fixture builder style** — `lib/__fixtures__/awareness-fixtures.cjs::buildOrgScanResult` (obj 2):

```js
function buildOrgScanResult({ items = [], warnings = [], project_id = 'PVT_test' } = {}) {
  return { items, warnings, project_id, fetched_at: new Date().toISOString() };
}
```

Pattern: every parameter optional with default; build minimal output containing ONLY explicitly-passed fields.

**Existing CLI router style** — `lib/org-awareness-cli.cjs::cmdOrgAwarenessRoute` (obj 3 ship):

```js
function cmdOrgAwarenessRoute(cwd, args, raw) {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    process.stderr.write([
      'Usage: df-tools org-awareness <subcommand> [args]',
      '', 'Subcommands:',
      '  scan-siblings <objective_id> [--raw]      Walk sibling repos under ~/Source/*/ for keyword overlap',
      // ...
    ].join('\n'));
    process.exit(sub ? 0 : 1);
    return;
  }
  if (sub === 'scan-siblings') return cmdOrgAwarenessScanSiblings(cwd, rest, raw);
  // ...
}
```

**Existing case arm style in df-tools.cjs** (line 766-769):

```js
case 'org-awareness': {
  cmdOrgAwarenessRoute(cwd, args.slice(1), raw);
  break;
}
```

Insert `case 'dup-detect': { cmdDupDetectRoute(cwd, args.slice(1), raw); break; }` right after `case 'org-awareness':`.

**Existing test runner style** — `lib/org-awareness.test.cjs` mirrors what dup-detect.test.cjs should do:

```js
const test = require('node:test');
const assert = require('node:assert');
const oa = require('./dup-detect.cjs');
const fix = require('./__fixtures__/awareness-fixtures.cjs');

test('SC-1: detectDuplicates returns structured result', () => {
  oa._setRunPeer(() => fix.buildPeerScanResult({ branches: [] }));
  oa._setRunOrgOverlap(() => ({ items: [], warnings: [], skipped: false, misfiling: null }));
  const r = oa.detectDuplicates({ objective_id: '04', mode: 'plan', cwd: process.cwd() });
  assert.strictEqual(r.blocking, false);
  assert.deepStrictEqual(r.matches, []);
  oa._resetMocks();
});
```

</codebase_examples>

<anti_patterns>

- **DO NOT add LLM-based scoring.** Detection is hand-built lexical only. Per CONTEXT.md locked decision #2.
- **DO NOT use `faker`, `casual`, or other random-data generators.** All fixtures must be hand-built factories with explicit args. Per `no_llm_test_data` constraint.
- **DO NOT call live `awareness.scanPeer` / `org-awareness.scanOrgOverlap` from unit tests.** Always inject via `_setRunPeer` / `_setRunOrgOverlap`. Live tests are gated behind `FS_INTEGRATION=1` / `GH_INTEGRATION=1` (covered in TRD 04-06).
- **DO NOT modify `lib/awareness.cjs`, `lib/org-awareness.cjs`, or `lib/gh.cjs`.** Obj 4 is a read-only consumer (CONTEXT.md locked decision #4).
- **DO NOT throw from `detectDuplicates`.** Infrastructure errors become warnings; the function ALWAYS returns a structured result. Per CONTEXT.md locked decision #8.
- **DO NOT add `recordResolution` / `applyResolution` / `formatDetectionMarkdown` here.** Those belong to TRD 04-02 / 04-03. This TRD's exports are limited to the 14 entries listed in must_haves.artifacts[0].exports.
- **DO NOT include `.dup-detect-log.jsonl` in git.** That's added to .gitignore in TRD 04-02. This TRD only declares the constant `DUP_DETECT_LOG_REL`.

</anti_patterns>

<error_recovery>

- **`scanPeer` throws (e.g., git binary missing)** → catch, log warning to result.warnings, continue with org-only signals. Result.blocking based on org signals alone.
- **`scanOrgOverlap` returns `skipped: true` (gh auth missing)** → log warning, continue with peer-only signals. Result.blocking based on peer signals alone.
- **Both fail** → return `{ blocking: false, matches: [], advisory: [], warnings: [...both warnings...], mode, timestamp }`. Plan-time advances; CONTEXT.md gets a "no signals available" note (handled in TRD 04-04 skill integration).
- **Peer's TRD files don't exist on branch** (`git show` non-zero) → `_readPeerFilesModified` returns empty array silently. Mirror obj 2's `scanPeer` STATE.md-missing pattern (no warning).
- **Peer's TRD frontmatter malformed** → `extractFrontmatter` returns null/undefined fields → treated as empty `files_modified`. Never throws.
- **`current_files_modified` undefined or empty** (fresh objective dir) → keyword-only matching. NOT an error.
- **`current_github_issue` undefined** → hard-match path skipped silently; only strong/weak signals checked.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/04-duplicate-work-detection/04-CONTEXT.md
@.planning/objectives/04-duplicate-work-detection/04-RESEARCH.md

# Reused obj 2 + obj 3 surfaces:
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs

# Pattern reference (test runner + CLI + case arm):
@plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
@plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
@plugins/devflow/devflow/bin/df-tools.cjs

# Frontmatter parsing for peer TRDs:
@plugins/devflow/devflow/bin/lib/frontmatter.cjs
</context>

<research_context>

From `04-RESEARCH.md` (which points at `cross-session-coordination.md` §"Duplicate detection"):

> Plan-time check: After the planner drafts JOB.md but **before** committing, compare against every active session's heartbeat: file overlap (≥2 paths) and same `github_issue` ref are strong/hard matches; LLM compare across intents is weak (advisory).

Obj 4's locked-decision deltas: NO LLM scoring (lexical only); peer state comes from STATE.md + TRDs (not runtime telemetry). Files-modified comes from TRD frontmatter via `git show <branch>:.../*-TRD.md` + `extractFrontmatter`.

Per CONTEXT.md decision #2, three signal classes are LOCKED at:
- Hard: github_issue equality OR org-overlap chain_match.
- Strong: file path intersection >= 2 OR keyword intersection >= 3.
- Weak: keyword intersection 1-2 OR single shared file.

</research_context>

<gotchas>

- **`extractFrontmatter` returns parsed frontmatter object directly** (NOT `{ frontmatter, body }`) — confirmed by obj 3 TRD 03-01 deviation. Code: `const fm = extractFrontmatter(content); const files = fm?.files_modified || []`.
- **`git show <branch>:<path>` exits non-zero when path missing on branch** — handle via `if (!r.ok) continue;` (mirror `scanPeer` pattern). Do NOT throw.
- **Listing peer's TRD files on a branch** requires `git ls-tree -r --name-only <branch> -- '<peer_objective_dir>/'` then filter `*-TRD.md`. Mirror this pattern; don't try to readdir on origin/* refs.
- **`_runPeer` and `_runOrgOverlap` injection is closure-scoped** — once injected for a test, MUST call `_resetMocks()` in test cleanup or subsequent tests see stale mocks. Tests should always wrap in try/finally.
- **`obj 3 _tokenize` returns Set<string>** — for keyword-intersection checks, use `for (const t of currentTokens) if (peerTokens.has(t)) intersection++;` pattern (mirror obj 3 `_score`).
- **Mode='execute' filtering MUST happen at result construction time**, not at the consumer. detectDuplicates returns `{ advisory: [] }` when mode='execute' so all consumers see the same shape.
- **`process.exit(0)` on success in CLI commands** — use `helpers.cjs::output(payload, raw)` (which exits) or write to stdout + `return` from the command function. Mirror `cmdOrgAwarenessShow`'s pattern.
- **The dup-detect CLI subcommand `--mode <plan|execute>` parses positionally** — `df-tools dup-detect --mode plan 04 --raw`: args after `dup-detect` are `['--mode', 'plan', '04', '--raw']`. The router must consume `--mode` flag + value; objective_id is the next non-flag positional arg.
- **`current_keywords` may be passed in directly OR derived from `objective.title`** — accept either; if both, prefer the explicit `current_keywords` (already-tokenized Set). This lets the skill-integration TRDs precompute tokens once.

</gotchas>

## Test list

Per CLAUDE.md TDD Playbook habit 2: enumerate behavior cases BEFORE writing test code. Each case maps to a `t.test()` block.

### Group H (hard match — `_detectHardMatch`)
- H1: same github_issue ref between current and peer → matched: true, signal contains "github_issue"
- H2: different github_issue refs → matched: false
- H3: current github_issue is null → matched: false (hard-match skipped, no false positive)
- H4: peer github_issue is null → matched: false
- H5: org-overlap item with chain_match: true and matching issue_ref → matched: true, signal contains "chain_match"
- H6: org-overlap item with chain_match: true but different issue_ref → matched: false (chain_match alone insufficient — need issue_ref equality)

### Group SF (strong match — file overlap, `_detectStrongMatch`)
- SF1: 2 shared file paths → matched: true (strong threshold met)
- SF2: 3 shared file paths → matched: true
- SF3: 1 shared file path → matched: false (only 1; weak signal handled by _detectWeakMatch)
- SF4: 0 shared paths → matched: false
- SF5: empty current_files_modified → matched: false (no false positive on fresh objective)
- SF6: empty peer_files_modified → matched: false

### Group SK (strong match — keyword overlap, `_detectStrongMatch`)
- SK1: 3 shared keywords → matched: true
- SK2: 4 shared keywords → matched: true
- SK3: 2 shared keywords → matched: false (only 2; weak signal)
- SK4: empty current_keywords → matched: false
- SK5: empty peer_keywords → matched: false

### Group W (weak match — `_detectWeakMatch`)
- W1: 2 shared keywords → matched: true (weak signal)
- W2: 1 shared keyword → matched: true (weak signal)
- W3: 0 shared keywords AND 0 shared files → matched: false
- W4: 1 shared file path → matched: true (weak signal)
- W5: 3+ shared keywords → matched: false (this is strong territory; weak doesn't double-fire)
- W6: 2+ shared files → matched: false (strong territory)

### Group RP (peer files reader — `_readPeerFilesModified`)
- RP1: peer branch with 2 TRDs each declaring files_modified → returns deduplicated union
- RP2: peer branch with no TRDs → returns []
- RP3: peer branch's `git show` fails (branch absent / TRDs missing) → returns []
- RP4: peer TRD frontmatter malformed → that TRD's files contribute [], other TRDs included
- RP5: peer TRD with empty `files_modified: []` frontmatter → contributes []
- RP6: 2 TRDs declaring same file → returns ['file'] (deduplicated)

### Group D (detectDuplicates end-to-end)
- D1: SC-1 happy path — 1 peer with hard match (same github_issue) → blocking: true, matches has 1 hard entry
- D2: SC-2 hard match via org-overlap chain_match → blocking: true, source: 'org-overlap'
- D3: SC-3 strong file overlap (≥2 paths) → blocking: true, matches has 1 strong entry, signal lists overlapping paths
- D4: SC-3 strong keyword overlap (≥3 keywords) → blocking: true
- D5: SC-4 weak match (1 keyword overlap) at plan mode → blocking: false, advisory has 1 entry
- D6: SC-4 weak match at EXECUTE mode → blocking: false, advisory: [] (filtered)
- D7: no peer matches AND empty org-overlap → blocking: false, matches: [], advisory: []
- D8: scanPeer throws → result.warnings includes peer error, blocking based on org signals only
- D9: scanOrgOverlap.skipped: true → result.warnings includes auth remediation, blocking based on peer signals only
- D10: both fail → blocking: false, matches: [], advisory: [], warnings has both errors
- D11: 5 peers all with weak matches → result.advisory length up to 5 (no top-N truncation in advisory; advisory is informational)
- D12: 5 peers all with strong matches → result.matches length 5 (all surfaced; user picks one resolution)
- D13: SC-2 hard match precedence — peer has BOTH github_issue match AND file overlap → matches contains hard entry (strength: 'hard'); strong entry NOT duplicated for same peer
- D14: timestamp field present and parseable as ISO 8601

### Group F (fixture builders)
- F1: buildPeerBranch returns shape with branch, objective, github_issue, files_modified, last_commit
- F2: buildPeerScanResult wraps branches array; current_branch defaults to null
- F3: buildOrgOverlapMatch returns shape with issue_ref, title, score, chain_match, matched_keywords
- F4: buildDupDetectFixtures returns { peer_scan, org_overlap, expected_signal } combinations for hard/strong/weak/none

### Group CLI (dup-detect-cli.cjs)
- CLI1: `df-tools dup-detect --mode plan 04 --raw` returns JSON with blocking, matches, advisory, warnings, mode='plan'
- CLI2: `df-tools dup-detect --mode execute 04 --raw` returns JSON with mode='execute' and advisory: []
- CLI3: `df-tools dup-detect` (no args) prints help to stderr + exit 1
- CLI4: `df-tools dup-detect --help` prints help to stderr + exit 0
- CLI5: `df-tools dup-detect --mode invalid 04` exits 1 with error
- CLI6: `df-tools dup-detect resolve 04 ...` returns placeholder error ("not yet implemented") with exit 1 (filled by 04-02)
- CLI7: `df-tools dup-detect log 04 ...` returns placeholder error (filled by 04-02)

<tasks>

<task type="auto">
  <name>Task 1: Hand-built dup-detect fixtures (RED preparation)</name>
  <files>
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
**FIXTURE-FIRST PER TDD PLAYBOOK HABIT 4** — fixture work happens BEFORE any behavior test.

**Extend `__fixtures__/awareness-fixtures.cjs`** (do not delete or alter obj 2 / obj 3 builders).

Add four new factories:

```js
// ─── Obj 4 dup-detect fixtures ────────────────────────────────────────────────

/**
 * Build a single peer branch entry as scanPeer returns.
 * Shape matches lib/awareness.cjs::scanPeer's branches[] entries.
 *
 * @param {object} opts
 * @param {string}   [opts.branch='feature/peer-objective']
 * @param {string}   [opts.objective='04 — peer-objective']
 * @param {string}   [opts.trd='04-01']
 * @param {string|null} [opts.github_issue=null]
 * @param {string[]} [opts.files_modified=[]]   // NOT in scanPeer output, but used by dup-detect tests
 * @param {string}   [opts.last_commit_iso='2026-05-04T08:00:00Z']
 * @param {string}   [opts.developer='peer-dev']
 */
function buildPeerBranch({
  branch = 'feature/peer-objective',
  objective = '04 — peer-objective',
  trd = '04-01',
  github_issue = null,
  files_modified = [],
  last_commit_iso = '2026-05-04T08:00:00Z',
  developer = 'peer-dev',
} = {}) {
  return {
    branch,
    objective,
    trd,
    github_issue,
    files_modified, // dup-detect-only field; obj 2 scanPeer doesn't emit this
    last_commit: {
      sha: 'abc1234',
      timestamp: last_commit_iso,
      subject: 'feat: peer work',
    },
    developer,
  };
}

/**
 * Wrap a branches array in scanPeer's return shape.
 *
 * @param {object} opts
 * @param {object[]} [opts.branches=[]]
 * @param {string|null} [opts.current_branch=null]
 * @param {string[]} [opts.warnings=[]]
 */
function buildPeerScanResult({ branches = [], current_branch = null, warnings = [] } = {}) {
  return {
    branches,
    current_branch,
    fetched_at: new Date().toISOString(),
    warnings,
  };
}

/**
 * Build a single org-overlap match item as scanOrgOverlap.items[] entry.
 *
 * @param {object} opts
 * @param {string}    [opts.issue_ref='AO-Cyber-Systems/aodex#33']
 * @param {string}    [opts.title='[Roadmap] Go Backend Migration']
 * @param {number}    [opts.score=12]
 * @param {boolean}   [opts.chain_match=true]
 * @param {string[]}  [opts.matched_keywords=[]]
 */
function buildOrgOverlapMatch({
  issue_ref = 'AO-Cyber-Systems/aodex#33',
  title = '[Roadmap] Go Backend Migration',
  score = 12,
  chain_match = true,
  matched_keywords = [],
} = {}) {
  return { issue_ref, title, score, chain_match, matched_keywords };
}

/**
 * Combined helper returning paired peer + org-overlap fixtures for end-to-end
 * detection tests. Variant keys: 'hard_github_issue', 'hard_chain_match',
 * 'strong_files', 'strong_keywords', 'weak_keyword', 'weak_single_file', 'none'.
 *
 * Returns:
 * {
 *   peer_scan: <buildPeerScanResult>,
 *   org_overlap: <scanOrgOverlap shape>,
 *   current_github_issue: string|null,
 *   current_files_modified: string[],
 *   current_keywords: Set<string>,
 *   expected_strength: 'hard'|'strong'|'weak'|null,
 * }
 *
 * @param {string} variant
 */
function buildDupDetectFixtures(variant = 'none') {
  // Use explicit hand-built scenarios per variant — NO LLM-generated data.
  switch (variant) {
    case 'hard_github_issue': {
      return {
        peer_scan: buildPeerScanResult({
          branches: [
            buildPeerBranch({
              branch: 'feature/peer-04',
              github_issue: 'AO-Cyber-Systems/devflow-claude#13',
              objective: '04 — duplicate-work-detection (peer)',
              files_modified: ['plugins/devflow/devflow/bin/lib/dup-detect.cjs'],
            }),
          ],
        }),
        org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
        current_github_issue: 'AO-Cyber-Systems/devflow-claude#13',
        current_files_modified: [],
        current_keywords: new Set(['duplicate', 'detect', 'work']),
        expected_strength: 'hard',
      };
    }
    case 'hard_chain_match': {
      return {
        peer_scan: buildPeerScanResult({ branches: [] }),
        org_overlap: {
          items: [buildOrgOverlapMatch({
            issue_ref: 'AO-Cyber-Systems/devflow-claude#13',
            title: '[Roadmap] dup-detect',
            chain_match: true,
            score: 13,
          })],
          warnings: [], skipped: false, misfiling: null,
        },
        current_github_issue: 'AO-Cyber-Systems/devflow-claude#13',
        current_files_modified: [],
        current_keywords: new Set(['duplicate', 'detect']),
        expected_strength: 'hard',
      };
    }
    case 'strong_files': {
      return {
        peer_scan: buildPeerScanResult({
          branches: [buildPeerBranch({
            branch: 'feature/peer-strong',
            github_issue: null,
            files_modified: [
              'plugins/devflow/devflow/bin/lib/dup-detect.cjs',
              'plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs',
            ],
          })],
        }),
        org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
        current_github_issue: null,
        current_files_modified: [
          'plugins/devflow/devflow/bin/lib/dup-detect.cjs',
          'plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs',
        ],
        current_keywords: new Set(),
        expected_strength: 'strong',
      };
    }
    case 'strong_keywords': {
      return {
        peer_scan: buildPeerScanResult({
          branches: [buildPeerBranch({
            branch: 'feature/peer-keyword',
            github_issue: null,
            objective: '04 — peer dup detect work', // tokens: peer, dup, detect, work
            files_modified: [],
          })],
        }),
        org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
        current_github_issue: null,
        current_files_modified: [],
        current_keywords: new Set(['peer', 'dup', 'detect', 'work']), // 4 shared
        expected_strength: 'strong',
      };
    }
    case 'weak_keyword': {
      return {
        peer_scan: buildPeerScanResult({
          branches: [buildPeerBranch({
            objective: '04 — entirely different objective with shared word: detect',
            files_modified: [],
          })],
        }),
        org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
        current_github_issue: null,
        current_files_modified: [],
        current_keywords: new Set(['detect', 'one', 'specific']), // 1 shared
        expected_strength: 'weak',
      };
    }
    case 'weak_single_file': {
      return {
        peer_scan: buildPeerScanResult({
          branches: [buildPeerBranch({
            files_modified: ['plugins/devflow/devflow/bin/lib/dup-detect.cjs'],
          })],
        }),
        org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
        current_github_issue: null,
        current_files_modified: ['plugins/devflow/devflow/bin/lib/dup-detect.cjs'],
        current_keywords: new Set(),
        expected_strength: 'weak',
      };
    }
    case 'none':
    default:
      return {
        peer_scan: buildPeerScanResult({ branches: [] }),
        org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
        current_github_issue: null,
        current_files_modified: [],
        current_keywords: new Set(),
        expected_strength: null,
      };
  }
}
```

Add the new factories to `module.exports` at the end of the file.

# CRITICAL: hand-built only. No randomness, no LLM-completion, no faker. Every variant is explicit.
# PATTERN: Mirror obj 2's buildOrgScanResult / buildOrgItem and obj 3's buildSiblingRepoTree shapes.
# GOTCHA: buildPeerBranch's `files_modified` field is dup-detect-specific — obj 2's scanPeer doesn't emit it. Tests using buildPeerBranch as a literal scanPeer mock should be aware (only dup-detect logic looks at this field; other obj 2/3 code ignores it).
  </action>
  <verify>
- `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); for (const s of ["buildPeerBranch","buildPeerScanResult","buildOrgOverlapMatch","buildDupDetectFixtures"]) if (typeof f[s] !== "function") throw new Error(s); const v=f.buildDupDetectFixtures("hard_github_issue"); if (v.expected_strength !== "hard") throw new Error("variant"); console.log("OK");'`
- All obj 2 + obj 3 fixture builders still importable (regression check):
  `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); for (const s of ["buildStateMd","buildOrgItem","buildSubIssue","buildOrgScanResult","buildSiblingRepoTree","buildEdenLibsTree","buildMockRunFs","buildOrgOverlapFixture"]) if (typeof f[s] !== "function") throw new Error(s); console.log("regression OK");'`
- `npm test 2>&1 | grep -E "FAIL|fail|^not ok" | grep -v "dup-detect" | head -5` — no regressions in obj 2/3 tests
  </verify>
  <done>
buildPeerBranch + buildPeerScanResult + buildOrgOverlapMatch + buildDupDetectFixtures are loadable from awareness-fixtures.cjs alongside the obj 2 + obj 3 builders. All obj 2 + obj 3 fixture builders still pass regression check. Existing tests still pass.
  </done>
  <recovery>
If a regression appears in obj 2/3 fixture imports: revert the awareness-fixtures.cjs additions and re-add them as a single contiguous block at the END of the file, keeping all earlier exports intact. The module.exports block must list new factories AFTER the existing ones, not interleaved.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: RED — write failing tests for detection engine + signal helpers + CLI router</name>
  <files>
    plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
    plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs
  </files>
  <action>
**RED PHASE PER TDD PLAYBOOK HABIT 3 — one test at a time.**

Write tests for ALL groups in the Test list (H, SF, SK, W, RP, D, F, CLI). Tests MUST fail because `lib/dup-detect.cjs` and `lib/dup-detect-cli.cjs` don't yet exist.

`dup-detect.test.cjs` structure:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dd = require('./dup-detect.cjs');
const fix = require('./__fixtures__/awareness-fixtures.cjs');

// Group H — _detectHardMatch
test('H1 — same github_issue ref between current and peer matches', () => {
  const r = dd._detectHardMatch(
    { github_issue: 'AO-Cyber-Systems/devflow-claude#13' },
    { github_issue: 'AO-Cyber-Systems/devflow-claude#13' }
  );
  assert.strictEqual(r.matched, true);
  assert.match(r.signal, /github_issue/);
});
// ... H2-H6

// Group SF — _detectStrongMatch (file overlap)
test('SF1 — 2 shared file paths matched as strong', () => {
  const r = dd._detectStrongMatch(
    { files_modified: ['a.ts', 'b.ts', 'c.ts'], keywords: new Set() },
    { files_modified: ['a.ts', 'b.ts', 'd.ts'], keywords: new Set() }
  );
  assert.strictEqual(r.matched, true);
  assert.match(r.signal, /file.*overlap|shared/i);
});
// ... SF2-SF6

// Group SK — _detectStrongMatch (keyword overlap)
test('SK1 — 3 shared keywords matched as strong', () => {
  const r = dd._detectStrongMatch(
    { files_modified: [], keywords: new Set(['auth', 'flow', 'token', 'login']) },
    { files_modified: [], keywords: new Set(['auth', 'flow', 'token', 'guard']) }
  );
  assert.strictEqual(r.matched, true);
  assert.match(r.signal, /keyword.*overlap/i);
});
// ... SK2-SK5

// Group W — _detectWeakMatch
test('W1 — 2 shared keywords matched as weak', () => {
  const r = dd._detectWeakMatch(
    { files_modified: [], keywords: new Set(['a', 'b', 'c']) },
    { files_modified: [], keywords: new Set(['a', 'b', 'x']) }
  );
  assert.strictEqual(r.matched, true);
});
// ... W2-W6

// Group RP — _readPeerFilesModified (uses _setRunFs / git mock)
test('RP1 — peer with 2 TRDs returns deduplicated union of files_modified', () => {
  // Stub _runGit to return controlled `git ls-tree` + `git show` output
  // ...
});
// ... RP2-RP6

// Group D — detectDuplicates end-to-end
test('D1 — SC-1: hard match via github_issue → blocking: true', () => {
  const fix_ = fix.buildDupDetectFixtures('hard_github_issue');
  dd._setRunPeer(() => fix_.peer_scan);
  dd._setRunOrgOverlap(() => fix_.org_overlap);
  try {
    const r = dd.detectDuplicates({
      objective_id: '04',
      mode: 'plan',
      cwd: process.cwd(),
      current_github_issue: fix_.current_github_issue,
      current_files_modified: fix_.current_files_modified,
      current_keywords: fix_.current_keywords,
    });
    assert.strictEqual(r.blocking, true);
    assert.strictEqual(r.matches.length, 1);
    assert.strictEqual(r.matches[0].strength, 'hard');
    assert.match(r.matches[0].signal, /github_issue/);
  } finally {
    dd._resetMocks();
  }
});
// ... D2-D14

// Group F — fixture sanity
test('F1 — buildPeerBranch returns expected shape', () => {
  const b = fix.buildPeerBranch({ branch: 'foo', github_issue: '#1' });
  assert.strictEqual(b.branch, 'foo');
  assert.strictEqual(b.github_issue, '#1');
  assert.ok(Array.isArray(b.files_modified));
  assert.ok(b.last_commit && b.last_commit.timestamp);
});
// ... F2-F4
```

`dup-detect-cli.test.cjs` structure:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');

test('CLI1 — --mode plan returns JSON with blocking, matches, advisory, warnings, mode=plan', () => {
  const r = spawnSync('node', [dfTools, 'dup-detect', '--mode', 'plan', '04', '--raw'], {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.ok('blocking' in parsed, 'blocking field present');
  assert.ok('matches' in parsed);
  assert.ok('advisory' in parsed);
  assert.ok('warnings' in parsed);
  assert.strictEqual(parsed.mode, 'plan');
});

test('CLI2 — --mode execute filters advisory to []', () => {
  const r = spawnSync('node', [dfTools, 'dup-detect', '--mode', 'execute', '04', '--raw'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.deepStrictEqual(parsed.advisory, []);
  assert.strictEqual(parsed.mode, 'execute');
});

test('CLI3 — no args prints help to stderr + exit 1', () => {
  const r = spawnSync('node', [dfTools, 'dup-detect'], { encoding: 'utf-8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /mode.*plan|execute|Usage/i);
});
// CLI4, CLI5, CLI6, CLI7
```

# CRITICAL: Tests must currently FAIL with module-not-found errors. That IS the red signal.
# PATTERN: Mirror lib/org-awareness.test.cjs and lib/org-awareness-cli.test.cjs structure exactly.
# GOTCHA: For RP tests using git mock, use the SAME pattern as obj 2's RP-style tests for `_runGit` injection — but here we mock the higher-level _readPeerFilesModified by stubbing `_runFs` reads of TRD frontmatter content. Live git is acceptable in CLI1/CLI2/CLI3 tests since they hit real subprocess but with empty cwd-state (no real peers).

Run `npm test 2>&1 | grep -i 'dup-detect' | head -20` — should show all groups failing on module not found.

**Commit RED phase:**
```bash
git add plugins/devflow/devflow/bin/lib/dup-detect.test.cjs plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
git commit -m "test(04-01): add failing tests for detectDuplicates + signal helpers + CLI router

RED phase: tests fail because lib/dup-detect.cjs and lib/dup-detect-cli.cjs don't yet
exist. Hand-built fixture builders (buildPeerBranch, buildPeerScanResult,
buildOrgOverlapMatch, buildDupDetectFixtures) follow obj 2/3 patterns; cover hard /
strong / weak / none variants for end-to-end detection tests.

Test groups: H (hard match), SF (strong file), SK (strong keyword), W (weak),
RP (peer file reader), D (end-to-end), F (fixtures), CLI (router)."
```
  </action>
  <verify>
`npm test 2>&1 | grep -E 'dup-detect|FAIL|fail' | head -30` shows test failures with module-not-found errors. Test count for dup-detect groups (H, SF, SK, W, RP, D, F, CLI) >= 40 cases. Fixture sanity tests (F1-F4) PASS standalone since fixtures exist from Task 1.
  </verify>
  <done>
test commit lands. All test cases per Test list are written. Tests fail with module-not-found errors (dup-detect.cjs / dup-detect-cli.cjs missing). Fixture tests (Group F) pass. RED → GREEN → REFACTOR ordering is clean (only test commits so far).
  </done>
  <recovery>
If a test passes accidentally (because of a stub that shouldn't exist yet): make sure the production module file truly does not yet exist. Delete any premature stub before committing the RED test.
If git mock setup for RP tests is too complex: defer those tests to a follow-up task and mark them as `t.test('RP1', { skip: 'TODO Task 3' }, ...)` — they MUST be enabled before commit. Better: implement minimal `_runGit` injection in the same pattern as `_setRunPeer`.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: GREEN — implement detectDuplicates + signal helpers + _readPeerFilesModified + CLI router scaffold</name>
  <files>
    plugins/devflow/devflow/bin/lib/dup-detect.cjs
    plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs
    plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
**GREEN PHASE PER TDD PLAYBOOK HABIT 3 — minimal code to pass the RED tests.**

**Part 1: Create `lib/dup-detect.cjs` — module skeleton + detectDuplicates + signal helpers + peer file reader + partial exports**

```js
'use strict';

/**
 * Duplicate-work detection engine.
 *
 * Plan-time + execute-time checks against active peer sessions and org-Project overlap.
 * Three signal classes: hard (github_issue / chain_match), strong (≥2 file overlap or ≥3
 * keyword overlap), weak (1-2 keyword or single shared file).
 *
 * Composes obj 2's scanPeer + obj 3's scanOrgOverlap. NO new storage. NO LLM scoring.
 *
 * Module growth across waves:
 *   TRD 04-01: skeleton + detectDuplicates + signal helpers + _readPeerFilesModified  (THIS TRD)
 *   TRD 04-02: recordResolution + applyResolution + _writeCoordinationNote + _writeDeferredState
 *   TRD 04-03: formatDetectionMarkdown
 *   TRD 04-06: module.exports finalization + integration tests
 *
 * Iron Law: detectDuplicates NEVER throws. Infrastructure errors become warnings.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractFrontmatter } = require('./frontmatter.cjs');
const aw = require('./awareness.cjs');
const orgaw = require('./org-awareness.cjs');

// ─── Constants ────────────────────────────────────────────────────────────────

const HARD_MATCH_THRESHOLD = 1;
const STRONG_FILE_OVERLAP_THRESHOLD = 2;
const STRONG_KEYWORD_OVERLAP_THRESHOLD = 3;
const DUP_DETECT_LOG_REL = path.join('.planning', '.dup-detect-log.jsonl');
const DEFERRED_DIR_REL = path.join('.planning', '.deferred');

// ─── Injection hooks ──────────────────────────────────────────────────────────

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  writeFileSync: (p, data) => fs.writeFileSync(p, data),
  appendFileSync: (p, data) => fs.appendFileSync(p, data),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }

let _runPeer = (opts) => aw.scanPeer(opts);
function _setRunPeer(fn) { _runPeer = (fn != null) ? fn : ((opts) => aw.scanPeer(opts)); }

let _runOrgOverlap = (opts) => orgaw.scanOrgOverlap(opts);
function _setRunOrgOverlap(fn) { _runOrgOverlap = (fn != null) ? fn : ((opts) => orgaw.scanOrgOverlap(opts)); }

function _resetMocks() {
  _runFs = realFs;
  _runPeer = (opts) => aw.scanPeer(opts);
  _runOrgOverlap = (opts) => orgaw.scanOrgOverlap(opts);
}

// Low-level git wrapper for _readPeerFilesModified
function _runGit(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf-8', stdio: ['pipe','pipe','pipe'], timeout: 30000, ...opts,
  });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: (r.stderr || '').trim() };
}

// ─── Signal helpers ──────────────────────────────────────────────────────────

/**
 * Detect hard match: same github_issue OR matching org-overlap chain_match issue_ref.
 *
 * @param {{ github_issue: string|null, ... }} current
 * @param {{ github_issue: string|null, ... }} peer
 * @returns {{ matched: boolean, signal: string }}
 */
function _detectHardMatch(current, peer) {
  if (!current.github_issue || !peer.github_issue) return { matched: false, signal: '' };
  if (current.github_issue === peer.github_issue) {
    return { matched: true, signal: `github_issue match: ${current.github_issue}` };
  }
  return { matched: false, signal: '' };
}

/**
 * Detect strong match: ≥2 file path overlap OR ≥3 keyword overlap.
 *
 * @param {{ files_modified: string[], keywords: Set<string> }} current
 * @param {{ files_modified: string[], keywords: Set<string> }} peer
 * @returns {{ matched: boolean, signal: string }}
 */
function _detectStrongMatch(current, peer) {
  const cFiles = current.files_modified || [];
  const pFiles = peer.files_modified || [];
  const sharedFiles = cFiles.filter(f => pFiles.includes(f));
  if (sharedFiles.length >= STRONG_FILE_OVERLAP_THRESHOLD) {
    return { matched: true, signal: `≥${STRONG_FILE_OVERLAP_THRESHOLD} file overlap: ${sharedFiles.join(', ')}` };
  }
  const cKw = current.keywords instanceof Set ? current.keywords : new Set();
  const pKw = peer.keywords instanceof Set ? peer.keywords : new Set();
  let kwOverlap = 0;
  const sharedKw = [];
  for (const k of cKw) if (pKw.has(k)) { kwOverlap++; sharedKw.push(k); }
  if (kwOverlap >= STRONG_KEYWORD_OVERLAP_THRESHOLD) {
    return { matched: true, signal: `≥${STRONG_KEYWORD_OVERLAP_THRESHOLD} keyword overlap: ${sharedKw.join(', ')}` };
  }
  return { matched: false, signal: '' };
}

/**
 * Detect weak match: 1-2 keyword overlap OR single shared file (but NOT enough for strong).
 * Only returns matched: true when there's any overlap below the strong threshold.
 *
 * @returns {{ matched: boolean, signal: string }}
 */
function _detectWeakMatch(current, peer) {
  const cFiles = current.files_modified || [];
  const pFiles = peer.files_modified || [];
  const sharedFiles = cFiles.filter(f => pFiles.includes(f));
  if (sharedFiles.length >= STRONG_FILE_OVERLAP_THRESHOLD) return { matched: false, signal: '' }; // strong territory
  const cKw = current.keywords instanceof Set ? current.keywords : new Set();
  const pKw = peer.keywords instanceof Set ? peer.keywords : new Set();
  let kwOverlap = 0;
  const sharedKw = [];
  for (const k of cKw) if (pKw.has(k)) { kwOverlap++; sharedKw.push(k); }
  if (kwOverlap >= STRONG_KEYWORD_OVERLAP_THRESHOLD) return { matched: false, signal: '' }; // strong territory
  if (sharedFiles.length === 1) {
    return { matched: true, signal: `single shared file: ${sharedFiles[0]}` };
  }
  if (kwOverlap >= 1) {
    return { matched: true, signal: `${kwOverlap} keyword overlap: ${sharedKw.join(', ')}` };
  }
  return { matched: false, signal: '' };
}

// ─── Peer files-modified reader ──────────────────────────────────────────────

/**
 * Read a peer branch's files_modified by walking its TRD frontmatter via `git show`.
 * Returns deduplicated union of files_modified across all TRDs in the peer's
 * objective directory. Empty array on any failure (silent skip per CONTEXT.md).
 *
 * @param {string} peer_branch  e.g. 'feature/peer-04'
 * @param {string} cwd
 * @param {string|null} [peer_objective_dir]  e.g. '.planning/objectives/04-foo' (optional override)
 * @returns {string[]}
 */
function _readPeerFilesModified(peer_branch, cwd, peer_objective_dir = null) {
  const ref = `origin/${peer_branch.replace(/^origin\//, '')}`;
  const filesSet = new Set();

  // Step 1: list peer's TRD files via `git ls-tree -r --name-only`
  let lsArgs;
  if (peer_objective_dir) {
    lsArgs = ['ls-tree', '-r', '--name-only', ref, '--', peer_objective_dir];
  } else {
    lsArgs = ['ls-tree', '-r', '--name-only', ref, '--', '.planning/objectives/'];
  }
  const lsR = _runGit(lsArgs, { cwd });
  if (!lsR.ok) return []; // silent skip

  const trdFiles = lsR.stdout
    .split('\n')
    .map(s => s.trim())
    .filter(p => /-TRD\.md$/.test(p));

  // Step 2: read each TRD via `git show`, parse frontmatter, collect files_modified
  for (const trdPath of trdFiles) {
    const showR = _runGit(['show', `${ref}:${trdPath}`], { cwd });
    if (!showR.ok) continue;
    let fm;
    try {
      fm = extractFrontmatter(showR.stdout);
    } catch {
      continue;
    }
    if (!fm) continue;
    const filesModified = Array.isArray(fm.files_modified) ? fm.files_modified : [];
    for (const f of filesModified) {
      if (typeof f === 'string' && f.length > 0) filesSet.add(f);
    }
  }

  return Array.from(filesSet);
}

// ─── detectDuplicates orchestrator ───────────────────────────────────────────

/**
 * Detect duplicate-work signals at plan-time or execute-time.
 *
 * NEVER throws. Infrastructure errors become warnings; result.blocking degrades
 * to false when no signals are available.
 *
 * @param {object} opts
 * @param {string}      opts.objective_id        - current objective ID (e.g. '04')
 * @param {'plan'|'execute'} opts.mode
 * @param {string}      [opts.cwd]               - default process.cwd()
 * @param {string|null} [opts.current_github_issue]
 * @param {string[]}    [opts.current_files_modified=[]]
 * @param {Set<string>} [opts.current_keywords]  - tokenized current objective tokens
 * @param {object}      [opts.objective]         - current OBJECTIVE.md frontmatter (passed to scanOrgOverlap)
 * @param {object}      [opts.projectCtx]        - current PROJECT.md frontmatter (passed to scanOrgOverlap)
 * @returns {{ blocking: boolean, matches: object[], advisory: object[], warnings: string[], mode: string, timestamp: string }}
 */
function detectDuplicates({
  objective_id,
  mode,
  cwd = process.cwd(),
  current_github_issue = null,
  current_files_modified = [],
  current_keywords = new Set(),
  objective = {},
  projectCtx = {},
} = {}) {
  const out = {
    blocking: false,
    matches: [],
    advisory: [],
    warnings: [],
    mode,
    timestamp: new Date().toISOString(),
  };

  if (!objective_id) {
    out.warnings.push('detectDuplicates: objective_id is required');
    return out;
  }
  if (mode !== 'plan' && mode !== 'execute') {
    out.warnings.push(`detectDuplicates: invalid mode '${mode}' (expected 'plan' or 'execute')`);
    return out;
  }

  // 1. Peer scan (graceful degradation)
  let peer_scan = null;
  try {
    peer_scan = _runPeer({ cwd, no_fetch: false });
  } catch (e) {
    out.warnings.push(`peer scan failed: ${e && e.message ? e.message : String(e)}`);
  }

  // 2. Org-overlap scan (graceful degradation; org-aware throws never throw GhAuthError —
  //    they return skipped: true. Other exceptions are caught here.)
  let org_overlap = null;
  try {
    org_overlap = _runOrgOverlap({
      objective_id,
      current_tokens: current_keywords,
      sibling_repos: [],
      frontmatter: objective,
      projectCtx,
    });
    if (org_overlap && org_overlap.skipped) {
      out.warnings.push(...(org_overlap.warnings || []));
    }
  } catch (e) {
    out.warnings.push(`org-overlap scan failed: ${e && e.message ? e.message : String(e)}`);
  }

  // 3. Detect signals from peer branches
  if (peer_scan && Array.isArray(peer_scan.branches)) {
    for (const peerBranch of peer_scan.branches) {
      const peerFiles = Array.isArray(peerBranch.files_modified) && peerBranch.files_modified.length > 0
        ? peerBranch.files_modified
        : _readPeerFilesModified(peerBranch.branch, cwd);
      const peerKeywords = orgaw._tokenize(peerBranch.objective || '');

      const current = {
        github_issue: current_github_issue,
        files_modified: current_files_modified,
        keywords: current_keywords,
      };
      const peer = {
        github_issue: peerBranch.github_issue,
        files_modified: peerFiles,
        keywords: peerKeywords,
      };

      // Hard match takes precedence; do not also emit strong for same peer
      const hard = _detectHardMatch(current, peer);
      if (hard.matched) {
        out.matches.push({
          strength: 'hard',
          source: 'peer',
          peer_objective: peerBranch.objective || null,
          peer_branch: peerBranch.branch,
          signal: hard.signal,
          score: 100,
        });
        continue;
      }
      const strong = _detectStrongMatch(current, peer);
      if (strong.matched) {
        out.matches.push({
          strength: 'strong',
          source: 'peer',
          peer_objective: peerBranch.objective || null,
          peer_branch: peerBranch.branch,
          signal: strong.signal,
          score: 50,
        });
        continue;
      }
      const weak = _detectWeakMatch(current, peer);
      if (weak.matched) {
        out.advisory.push({
          strength: 'weak',
          source: 'peer',
          peer_objective: peerBranch.objective || null,
          peer_branch: peerBranch.branch,
          signal: weak.signal,
          score: 10,
        });
      }
    }
  }

  // 4. Detect signals from org-overlap items (chain_match indicates likely hard match)
  if (org_overlap && Array.isArray(org_overlap.items)) {
    for (const item of org_overlap.items) {
      if (item.chain_match && item.issue_ref && current_github_issue && item.issue_ref === current_github_issue) {
        out.matches.push({
          strength: 'hard',
          source: 'org-overlap',
          peer_objective: item.title || null,
          peer_branch: null,
          signal: `chain_match issue_ref equality: ${item.issue_ref}`,
          score: 100,
        });
      }
    }
  }

  // 5. Mode='execute' filters advisory to []
  if (mode === 'execute') {
    out.advisory = [];
  }

  // 6. Blocking flag
  out.blocking = out.matches.length > 0;

  return out;
}

// ─── Partial exports (TRD 04-01) ──────────────────────────────────────────────
//
// This export block is the AUTHORITATIVE surface FOR THIS WAVE only.
// TRDs 04-02, 04-03 each extend this block. TRD 04-06 finalizes it.

module.exports = {
  detectDuplicates,
  _detectHardMatch,
  _detectStrongMatch,
  _detectWeakMatch,
  _readPeerFilesModified,
  _setRunPeer,
  _setRunOrgOverlap,
  _setRunFs,
  _resetMocks,
  HARD_MATCH_THRESHOLD,
  STRONG_FILE_OVERLAP_THRESHOLD,
  STRONG_KEYWORD_OVERLAP_THRESHOLD,
  DUP_DETECT_LOG_REL,
  DEFERRED_DIR_REL,
};
```

# CRITICAL: detectDuplicates must NEVER throw. All errors → warnings array.
# GOTCHA: scanPeer's branches[] entries do NOT include files_modified (obj 2 design); _readPeerFilesModified is called when the field is missing. Tests can override by passing files_modified directly via buildPeerBranch — that's why dup-detect tests use the fixture extension.
# PATTERN: Mirror lib/org-awareness.cjs region-comment style; identical CommonJS layout.

**Part 2: Create `lib/dup-detect-cli.cjs` — CLI router scaffold**

```js
'use strict';

const dd = require('./dup-detect.cjs');
const { output } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const orgaw = require('./org-awareness.cjs');

/**
 * Parse `--mode <plan|execute>` and remaining positional objective_id from args.
 * @returns {{ mode: 'plan'|'execute'|null, objective_id: string|null, raw: boolean, errors: string[] }}
 */
function _parseDetectArgs(args) {
  const out = { mode: null, objective_id: null, raw: false, errors: [] };
  const a = args.slice();
  while (a.length > 0) {
    const t = a.shift();
    if (t === '--mode') {
      out.mode = a.shift() || null;
    } else if (t === '--raw') {
      out.raw = true;
    } else if (t.startsWith('--')) {
      out.errors.push(`Unknown flag: ${t}`);
    } else if (out.objective_id === null) {
      out.objective_id = t;
    }
  }
  if (out.mode !== 'plan' && out.mode !== 'execute') {
    out.errors.push(`--mode must be 'plan' or 'execute' (got: ${out.mode})`);
  }
  if (!out.objective_id) {
    out.errors.push('objective_id is required');
  }
  return out;
}

/**
 * Resolve current objective state from disk:
 *   - github_issue from OBJECTIVE.md frontmatter
 *   - files_modified from union of all TRD frontmatter
 *   - keywords from objective title
 */
function _resolveCurrentState(cwd, objective_id) {
  const out = {
    objective: {},
    projectCtx: {},
    current_github_issue: null,
    current_files_modified: [],
    current_keywords: new Set(),
  };
  // PROJECT.md
  const projectMdPath = path.join(cwd, '.planning', 'PROJECT.md');
  if (fs.existsSync(projectMdPath)) {
    try {
      const fm = extractFrontmatter(fs.readFileSync(projectMdPath, 'utf-8'));
      if (fm) out.projectCtx = fm;
    } catch { /* swallow */ }
  }
  // Find objective dir
  const objsDir = path.join(cwd, '.planning', 'objectives');
  if (!fs.existsSync(objsDir)) return out;
  let objs;
  try { objs = fs.readdirSync(objsDir); } catch { return out; }
  const matchingDir = objs.find(n => n.startsWith(`${objective_id}-`) || n === objective_id);
  if (!matchingDir) return out;
  const objDirPath = path.join(objsDir, matchingDir);
  // OBJECTIVE.md
  const objMdPath = path.join(objDirPath, 'OBJECTIVE.md');
  if (fs.existsSync(objMdPath)) {
    try {
      const fm = extractFrontmatter(fs.readFileSync(objMdPath, 'utf-8'));
      if (fm) {
        out.objective = fm;
        if (fm.github_issue) out.current_github_issue = fm.github_issue;
        if (fm.title) for (const t of orgaw._tokenize(fm.title)) out.current_keywords.add(t);
      }
    } catch { /* swallow */ }
  }
  // Tokenize objective_id slug as fallback
  for (const t of orgaw._tokenize(matchingDir)) out.current_keywords.add(t);
  // TRDs
  let trds;
  try { trds = fs.readdirSync(objDirPath); } catch { return out; }
  const filesSet = new Set();
  for (const f of trds) {
    if (!/-TRD\.md$/.test(f)) continue;
    try {
      const fm = extractFrontmatter(fs.readFileSync(path.join(objDirPath, f), 'utf-8'));
      if (fm && Array.isArray(fm.files_modified)) {
        for (const p of fm.files_modified) if (typeof p === 'string') filesSet.add(p);
      }
    } catch { /* swallow */ }
  }
  out.current_files_modified = Array.from(filesSet);
  return out;
}

function cmdDupDetectDetect(cwd, args, raw_outer) {
  const parsed = _parseDetectArgs(args);
  if (parsed.errors.length > 0) {
    process.stderr.write(parsed.errors.map(e => 'Error: ' + e).join('\n') + '\n');
    process.exit(1);
    return;
  }
  const state = _resolveCurrentState(cwd, parsed.objective_id);
  const result = dd.detectDuplicates({
    objective_id: parsed.objective_id,
    mode: parsed.mode,
    cwd,
    current_github_issue: state.current_github_issue,
    current_files_modified: state.current_files_modified,
    current_keywords: state.current_keywords,
    objective: state.objective,
    projectCtx: state.projectCtx,
  });
  output(result, parsed.raw || raw_outer);
}

function cmdDupDetectResolve(cwd, args, raw) {
  // TRD 04-02 fills this in
  process.stderr.write('resolve not yet implemented (TRD 04-02)\n');
  process.exit(1);
}

function cmdDupDetectLog(cwd, args, raw) {
  // TRD 04-02 fills this in
  process.stderr.write('log not yet implemented (TRD 04-02)\n');
  process.exit(1);
}

function cmdDupDetectRoute(cwd, args, raw) {
  if (!args || args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stderr.write([
      'Usage: df-tools dup-detect [subcommand|--mode] [args]',
      '',
      'Subcommands:',
      '  --mode plan <objective_id> [--raw]      Run plan-time duplicate detection (returns JSON)',
      '  --mode execute <objective_id> [--raw]   Run execute-time detection (stricter; advisory filtered)',
      '  resolve <objective_id> --resolution <merge|defer|coordinate|proceed-anyway> --peer-branch <name> --peer-objective <id>  (TRD 04-02)',
      '  log <objective_id> --mode <plan|execute> [--blocking <true|false>] [--top-match-json <json>] [--resolution <r>]  (TRD 04-02)',
      '',
    ].join('\n'));
    process.exit(args && args.length > 0 ? 0 : 1);
    return;
  }
  // First positional or flag determines dispatch
  if (args[0] === '--mode') {
    return cmdDupDetectDetect(cwd, args, raw);
  }
  if (args[0] === 'resolve') {
    return cmdDupDetectResolve(cwd, args.slice(1), raw);
  }
  if (args[0] === 'log') {
    return cmdDupDetectLog(cwd, args.slice(1), raw);
  }
  process.stderr.write(`Unknown dup-detect subcommand: ${args[0]}\n`);
  process.exit(1);
}

module.exports = {
  cmdDupDetectRoute,
  cmdDupDetectDetect,
  cmdDupDetectResolve,
  cmdDupDetectLog,
};
```

**Part 3: Wire into `df-tools.cjs`**

- Add `const { cmdDupDetectRoute } = require('./lib/dup-detect-cli.cjs');` near the existing `cmdOrgAwarenessRoute` import.
- Add `case 'dup-detect': { cmdDupDetectRoute(cwd, args.slice(1), raw); break; }` arm right after the `case 'org-awareness':` arm (around line 770).
- Add `dup-detect` to any usage/help string that lists available commands.

**Run tests until green:**
```bash
npm test 2>&1 | grep -E 'dup-detect|FAIL|fail' | head -30
```
Expect all groups (H, SF, SK, W, RP, D, F, CLI) to pass.

**Commit GREEN phase:**
```bash
git add plugins/devflow/devflow/bin/lib/dup-detect.cjs plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs plugins/devflow/devflow/bin/df-tools.cjs
git commit -m "feat(04-01): implement detectDuplicates + signal helpers + CLI router scaffold

GREEN phase: lib/dup-detect.cjs ships with detectDuplicates (plan/execute modes,
hard/strong/weak signal classes), _detectHardMatch/_detectStrongMatch/_detectWeakMatch,
_readPeerFilesModified (git show + extractFrontmatter for peer TRDs), and
_setRunPeer/_setRunOrgOverlap/_setRunFs/_resetMocks injection hooks.
lib/dup-detect-cli.cjs provides the df-tools subcommand router with stubs for
resolve/log (filled in 04-02). df-tools.cjs adds the case 'dup-detect' arm.

Closes SC-1, SC-2, SC-3, SC-4 (detection engine surface + 3 signal classes)."
```
  </action>
  <verify>
- `npm test 2>&1 | tail -30` — full suite passes (existing 842 + ~45 new tests). Specifically: groups H, SF, SK, W, RP, D, F all pass; CLI tests pass.
- `node plugins/devflow/devflow/bin/df-tools.cjs dup-detect 2>&1 | grep -c 'mode plan\|mode execute'` returns ≥ 2
- `node plugins/devflow/devflow/bin/df-tools.cjs dup-detect --mode plan 04 --raw 2>&1 | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); assert "blocking" in d; assert "matches" in d; assert "advisory" in d; assert d["mode"] == "plan"; print("OK")'`
- `node plugins/devflow/devflow/bin/df-tools.cjs dup-detect --mode execute 04 --raw 2>&1 | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); assert d["advisory"] == []; assert d["mode"] == "execute"; print("OK")'`
- All 14 exports listed in must_haves.artifacts present (verify via the verification_commands node -e check).
  </verify>
  <done>
feat commit lands. RED tests are now GREEN. Module is loadable, exports match the partial-surface contract for this wave (14 entries listed in module.exports), CLI router dispatches correctly, df-tools recognizes the new subcommand. SC-1, SC-2, SC-3, SC-4 closed.
  </done>
  <recovery>
If `npm test` reveals a regression in obj 1/2/3 tests: examine the diff to gh.cjs / awareness.cjs / org-awareness.cjs / awareness-fixtures.cjs (you should NOT have touched gh.cjs / awareness.cjs / org-awareness.cjs; awareness-fixtures.cjs additions should be additive only). If found, revert and rebuild additions.
If df-tools.cjs case arm has a syntax error: re-read the existing `case 'org-awareness':` arm and copy its exact shape verbatim, only changing the command name and route function name.
If `_readPeerFilesModified` test (Group RP) needs git mock and the fixture pattern from obj 2 doesn't transplant cleanly: stub `_runGit` directly via a module-private rebind in tests (export `_setRunGit` from dup-detect.cjs as a hidden hook if needed, but prefer leaving it private and using FS_INTEGRATION-gated tests for the live path). For RED phase, RP tests CAN call `dd._readPeerFilesModified('nonexistent-branch', os.tmpdir())` and assert `[]` — that's the real-fs cheap-failure path.
If CLI tests are flaky because subprocess inherits pwd: pass an explicit `cwd: process.cwd()` to spawnSync.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none — repo has no lint command per CLAUDE.md)</lint>
<test>npm test</test>
<build>(none — no build step)</build>
</validation_gates>

<verification>
1. `npm test` passes (no regressions in 842 obj-3 baseline tests + new tests pass).
2. `lib/dup-detect.cjs` loads in a fresh process and exports the 14 partial-surface symbols.
3. `df-tools dup-detect --mode plan 04 --raw` exits 0 with parseable JSON containing { blocking, matches, advisory, warnings, mode: 'plan' }.
4. `df-tools dup-detect --mode execute 04 --raw` exits 0 with `advisory: []`.
5. `df-tools dup-detect` (no args) exits 1 with help text on stderr.
6. obj 1/2/3 modules (`gh.cjs`, `awareness.cjs`, `org-awareness.cjs`) NOT modified (read-only consumer principle).
7. All 15+ obj 2 + obj 3 fixture builders still importable (no breakage in extension).
8. detectDuplicates does NOT throw under any input — including null/undefined/missing fields.
</verification>

<success_criteria>
- [ ] `lib/dup-detect.cjs` created with detectDuplicates + 3 signal helpers + _readPeerFilesModified + injection hooks (_setRunPeer/_setRunOrgOverlap/_setRunFs/_resetMocks)
- [ ] `lib/dup-detect.test.cjs` created with all Test list groups (H, SF, SK, W, RP, D, F)
- [ ] `lib/dup-detect-cli.cjs` created with cmdDupDetectRoute dispatching --mode plan/execute (other subcommand stubs return placeholder errors)
- [ ] `lib/dup-detect-cli.test.cjs` created with CLI1-CLI7 tests
- [ ] `lib/__fixtures__/awareness-fixtures.cjs` extended with buildPeerBranch + buildPeerScanResult + buildOrgOverlapMatch + buildDupDetectFixtures (obj 2 + obj 3 builders preserved)
- [ ] `df-tools.cjs` routes `dup-detect` subcommand
- [ ] RED commit (test:) precedes GREEN commit (feat:) per TDD Playbook habit 3
- [ ] `npm test` shows all new tests passing
- [ ] SC-1 (detectDuplicates structured return) verifiable via D1+D7 test cases
- [ ] SC-2 (hard match — peer + org-overlap paths) verifiable via D1+D2 test cases
- [ ] SC-3 (strong file overlap ≥2) verifiable via SF1+SF2+D3 test cases
- [ ] SC-4 (weak match in advisory at plan, filtered at execute) verifiable via D5+D6 test cases
</success_criteria>

<output>
After completion, create `.planning/objectives/04-duplicate-work-detection/04-01-detection-engine-and-fixtures-SUMMARY.md`.
</output>
