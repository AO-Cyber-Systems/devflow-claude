---
objective: 06-unified-check-todos
trd: 06-01
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/check-todos.cjs
  - plugins/devflow/devflow/bin/lib/check-todos.test.cjs
  - plugins/devflow/devflow/bin/lib/check-todos-cli.cjs
  - plugins/devflow/devflow/bin/lib/check-todos-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - SC-1
  - SC-2
  - SC-3
must_haves:
  truths:
    - "lib/check-todos.cjs::aggregate({ projectRoot, refresh }) returns { blocked, now, soon, ideas, warnings, cached } shape"
    - "Five _fetch* helpers all callable independently with injection hooks (_setRunFs, _setRunGh, _setRunPeer)"
    - "_assignLane(entry, currentUser, currentRepo) is a pure function returning exactly one of 'blocked'|'now'|'soon'|'ideas' per locked rules"
    - "Each entry surfaced by aggregate() carries a 'source' attribution field ('local'|'gh'|'peer'|'initiative'|'dup-detect')"
    - "buildCheckTodosFixtures composes all 5 sources into a single tmpdir-backed bundle with cleanup"
    - "df-tools check-todos route arm dispatches to cmdCheckTodosRoute (stub for show; full flag wiring deferred to 06-04)"
    - "_fetchGhIssues catches GhAuthError, surfaces it as warnings[], skips the source, never propagates"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/check-todos.cjs"
      provides: "Skeleton + aggregate + 5 fetchers + _assignLane + injection hooks + constants"
      contains: "function aggregate"
    - path: "plugins/devflow/devflow/bin/lib/check-todos.test.cjs"
      provides: "Test suite (Groups A/F/L/G/P/I/D/AS)"
      contains: "describe"
    - path: "plugins/devflow/devflow/bin/lib/check-todos-cli.cjs"
      provides: "cmdCheckTodosRoute scaffold; show/refresh stubs for 06-04"
      contains: "cmdCheckTodosRoute"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "buildCheckTodosFixtures composer"
      contains: "buildCheckTodosFixtures"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'check-todos': arm dispatching to cmdCheckTodosRoute"
      contains: "case 'check-todos'"
  key_links:
    - from: "lib/check-todos.cjs::aggregate"
      to: "5 _fetch* helpers"
      via: "sequential calls inside aggregate body"
      pattern: "_fetch(Local|Gh|Peer|Initiative|DupDetect)"
    - from: "_fetchPeerSessions"
      to: "lib/awareness.cjs::scanPeer"
      via: "_runPeer injection seam"
      pattern: "scanPeer"
    - from: "_fetchInitiativeQuestions"
      to: "lib/initiatives.cjs::loadInitiatives + matchByRepo"
      via: "direct require"
      pattern: "loadInitiatives|matchByRepo"
    - from: "_fetchDupDetectLog"
      to: "lib/dup-detect.cjs::DUP_DETECT_LOG_REL"
      via: "constant import + jsonl line walk"
      pattern: "DUP_DETECT_LOG_REL"
    - from: "_fetchGhIssues"
      to: "lib/gh.cjs::requireGhAuth + _runGh"
      via: "transitive via gh module"
      pattern: "requireGhAuth"
    - from: "df-tools.cjs case 'check-todos'"
      to: "lib/check-todos-cli.cjs::cmdCheckTodosRoute"
      via: "command dispatch"
      pattern: "cmdCheckTodosRoute"
---

<objective>
Establish the foundation for `lib/check-todos.cjs`: the aggregator (`aggregate`), five source fetchers (`_fetchLocalTodos`, `_fetchGhIssues`, `_fetchPeerSessions`, `_fetchInitiativeQuestions`, `_fetchDupDetectLog`), the deterministic lane-assignment helper (`_assignLane`), three injection hooks (`_setRunFs`, `_setRunGh` re-export, `_setRunPeer`), constants, and the CLI router scaffold (`cmdCheckTodosRoute` with show/refresh stubs that exit 1 with "filled by TRD 06-04" message). Also extends `__fixtures__/awareness-fixtures.cjs` with one new builder: `buildCheckTodosFixtures`.

Purpose: SC-1 (aggregate shape + five fetchers + warnings array), SC-2 (five fetchers all present with injection hooks), SC-3 (lane assignment is deterministic + tested). The cache layer is added in 06-02; the formatter in 06-03; final integration + CLI flag wiring + skill rewrite in 06-04. This TRD MUST NOT include cache logic, formatter logic, or full CLI flag handling — those belong to subsequent waves.
Output: `lib/check-todos.cjs` (skeleton + aggregator region), `lib/check-todos-cli.cjs` (router with stubs), test suites, fixture builder, df-tools.cjs router arm.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── check-todos.cjs                       ← CREATE (skeleton + aggregator + 5 fetchers + lane assignment)
├── check-todos.test.cjs                  ← CREATE (Groups A/F/L/G/P/I/D/AS)
├── check-todos-cli.cjs                   ← CREATE (CLI router; show/refresh stubs)
├── check-todos-cli.test.cjs              ← CREATE (CLI scaffold tests)
└── __fixtures__/
    └── awareness-fixtures.cjs            ← MODIFY (append buildCheckTodosFixtures)

plugins/devflow/devflow/bin/
└── df-tools.cjs                          ← MODIFY (add case 'check-todos')
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Single-module-multi-wave growth pattern (proven in obj 2/3/4/5):**

```js
// lib/check-todos.cjs (top of file — TRD 06-01)
'use strict';

/**
 * Unified check-todos aggregator.
 *
 * Read-only consumer of:
 *   - .planning/todos/pending/ (local todos)
 *   - gh issue list (assigned/mentioned/review-requested)
 *   - awareness.scanPeer (active peer sessions)
 *   - initiatives.loadInitiatives (initiative open questions)
 *   - .planning/.dup-detect-log.jsonl (dup-detect resolutions)
 *
 * Module growth across waves:
 *   TRD 06-01: aggregate, 5 _fetch* helpers, _assignLane, injection hooks  (THIS TRD)
 *   TRD 06-02: readCheckTodosCache, writeCheckTodosCache, isCheckTodosCacheStale
 *   TRD 06-03: formatCheckTodosMarkdown + 4 lane sub-renderers
 *   TRD 06-04: module.exports finalization + integration tests
 *
 * Iron Law: aggregate NEVER throws. Source failures → warnings[] entry; aggregate continues.
 */

const fs = require('fs');
const path = require('path');
const aw = require('./awareness.cjs');
const initiatives = require('./initiatives.cjs');
const gh = require('./gh.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { DUP_DETECT_LOG_REL } = require('./dup-detect.cjs');

// ─── TRD 06-01: Constants ─────────────────────────────────────────────────────

const CHECK_TODOS_CACHE_REL = '.planning/.check-todos-cache.json';
const CHECK_TODOS_TTL_MINUTES = 10;
const MAX_CHECK_TODOS_OUTPUT_CHARS = 8000;
const DEFAULT_LANE_TRUNCATE = 5;
const LANE_NAMES = ['blocked', 'now', 'soon', 'ideas'];
```

Mirror this exactly. Header comment block, "Module growth across waves" annotation, "─── TRD NN-NN: <region> ───" banner comments demarcating regions.

**Three-injection-hook pattern (mirror obj 4 + obj 5):**

```js
// ─── TRD 06-01: Injection hooks ───────────────────────────────────────────────

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};
let _runFs = realFs;
let _runPeer = (opts) => aw.scanPeer(opts);

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _setRunPeer(fn) { _runPeer = (fn != null) ? fn : ((opts) => aw.scanPeer(opts)); }
function _setRunGh(fn) { return gh._setRunGh(fn); }  // re-export — mirrors obj 5

function _resetMocks() {
  _runFs = realFs;
  _runPeer = (opts) => aw.scanPeer(opts);
  gh._setRunGh(null);
}
```

# CRITICAL: `_setRunGh` is a pass-through re-export of `gh._setRunGh`. Tests using obj 1 cassettes can mock all gh calls (including transitive `_fetchGhIssues` invocations) via this single hook. SC-8 requires the export be present even if no 06-01 test uses it directly.
# PATTERN: All production fs reads go through `_runFs.X()` (NOT `fs.X()`). All production peer-scanner calls go through `_runPeer(opts)`. Production gh calls go through `gh._runGh` (transitive via `gh.cjs` module). Direct fs/aw/gh calls in production code = bug.

**Five-fetcher orchestration in `aggregate` (canonical structure):**

```js
// ─── TRD 06-01: aggregate ─────────────────────────────────────────────────────

/**
 * Aggregate todos across 5 sources, route into 4 urgency lanes.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot - cwd (for local todo file walks + dup-detect log)
 * @param {boolean} [opts.refresh]  - force re-fetch (TRD 06-02 will wire cache; TRD 06-01 ignores)
 * @returns {{ blocked: object[], now: object[], soon: object[], ideas: object[],
 *             warnings: object[], cached: boolean }}
 */
function aggregate({ projectRoot, refresh } = {}) {
  const result = {
    blocked: [],
    now: [],
    soon: [],
    ideas: [],
    warnings: [],
    cached: false, // TRD 06-02 will set true on cache hit
  };

  // Resolve current user + current repo for lane assignment
  const currentUser = _detectCurrentUser({ cwd: projectRoot });
  const currentRepo = _detectCurrentRepo({ cwd: projectRoot });

  // 1. Local todos
  let localEntries = [];
  try {
    localEntries = _fetchLocalTodos(projectRoot, {});
  } catch (err) {
    result.warnings.push({ source: 'local', kind: 'fetch_error', message: err.message });
  }

  // 2. GH issues — catches GhAuthError specifically
  let ghEntries = [];
  try {
    ghEntries = _fetchGhIssues({ org: currentRepo ? currentRepo.split('/')[0] : null });
  } catch (err) {
    if (err && err.name === 'GhAuthError') {
      result.warnings.push({
        source: 'gh',
        kind: 'gh_auth_failure',
        remediation: err.remediation || 'gh auth refresh -h github.com -s repo',
      });
    } else {
      result.warnings.push({ source: 'gh', kind: 'fetch_error', message: err.message });
    }
  }

  // 3. Peer sessions
  let peerEntries = [];
  try {
    peerEntries = _fetchPeerSessions({ cwd: projectRoot });
  } catch (err) {
    result.warnings.push({ source: 'peer', kind: 'fetch_error', message: err.message });
  }

  // 4. Initiative open questions
  let initEntries = [];
  try {
    initEntries = _fetchInitiativeQuestions({ githubRepo: currentRepo });
  } catch (err) {
    result.warnings.push({ source: 'initiative', kind: 'fetch_error', message: err.message });
  }

  // 5. Dup-detect log
  let dupEntries = [];
  try {
    dupEntries = _fetchDupDetectLog(projectRoot, {});
  } catch (err) {
    result.warnings.push({ source: 'dup-detect', kind: 'fetch_error', message: err.message });
  }

  // Route each entry into its lane via _assignLane (pure)
  const allEntries = [...localEntries, ...ghEntries, ...peerEntries, ...initEntries, ...dupEntries];
  for (const entry of allEntries) {
    const lane = _assignLane(entry, currentUser, currentRepo);
    if (lane && result[lane]) {
      result[lane].push(entry);
    }
    // _assignLane returning null = entry skipped (e.g., closed issue snuck through)
  }

  return result;
}
```

# CRITICAL: Each `_fetch*` call is wrapped in try/catch. NEVER let one source's failure crash the aggregate. Mirror obj 4's "iron law" of detectDuplicates (also wrapped per-source).
# GOTCHA: GhAuthError is the ONLY error class we special-case. Other errors get a generic `fetch_error` kind. Tests must verify both paths.
# PATTERN: `_detectCurrentUser` and `_detectCurrentRepo` are private helpers — read from `git config user.name` (or `gh auth status` if available) and PROJECT.md frontmatter respectively. Bundle them at the top of the file alongside other helpers.

**Local todos fetcher — refactor of existing `cmdListTodos` from `lib/misc.cjs`:**

```js
// ─── TRD 06-01: _fetchLocalTodos ──────────────────────────────────────────────

/**
 * Walk .planning/todos/pending/*.md and return entries in unified shape.
 *
 * Mirrors existing cmdListTodos data extraction (lib/misc.cjs:44) but exposes
 * the array shape directly instead of the {count, todos} wrapper.
 *
 * @param {string} cwd - project root
 * @param {{ area?: string }} [opts]
 * @returns {Array<{ file, created, title, area, path, source: 'local' }>}
 */
function _fetchLocalTodos(cwd, opts = {}) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  if (!_runFs.existsSync(pendingDir)) return [];
  const out = [];
  let files;
  try {
    files = _runFs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
  for (const file of files) {
    try {
      const content = _runFs.readFileSync(path.join(pendingDir, file), 'utf-8');
      const createdMatch = content.match(/^created:\s*(.+)$/m);
      const titleMatch = content.match(/^title:\s*(.+)$/m);
      const areaMatch = content.match(/^area:\s*(.+)$/m);
      const todoArea = areaMatch ? areaMatch[1].trim() : 'general';
      if (opts.area && todoArea !== opts.area) continue;
      out.push({
        file,
        created: createdMatch ? createdMatch[1].trim() : 'unknown',
        title: titleMatch ? titleMatch[1].trim() : 'Untitled',
        area: todoArea,
        path: path.join('.planning', 'todos', 'pending', file),
        source: 'local',
      });
    } catch { /* silently skip unreadable */ }
  }
  return out;
}
```

# PATTERN: Mirror `cmdListTodos` (lib/misc.cjs:44) — same regex, same fields, same fault-tolerance — but route through `_runFs` instead of bare `fs`, and emit `source: 'local'` so downstream lane assignment can attribute correctly.
# GOTCHA: existing `cmdListTodos` has hard-coded `fs.readdirSync` / `fs.readFileSync` — DO NOT modify lib/misc.cjs. Obj 6 is a parallel implementation that uses the injection-hooked path.

**GH issues fetcher with hard-fail auth + sequential queries:**

```js
// ─── TRD 06-01: _fetchGhIssues ────────────────────────────────────────────────

/**
 * Query gh for assigned/mentioned/review-requested issues.
 * Hard-fails on auth (throws GhAuthError); caller (aggregate) catches.
 *
 * Three sequential queries (per CONTEXT.md decision #3):
 *   1. assigned to @me
 *   2. mentions @me
 *   3. review-requested @me
 *
 * Filters to single-org scope (opts.org).
 *
 * @param {{ org?: string }} [opts]
 * @returns {Array<{ ref, repo, number, title, labels, assignees, mentions,
 *                    review_requested, state, source: 'gh' }>}
 */
function _fetchGhIssues(opts = {}) {
  gh.requireGhAuth(['repo']);  // throws GhAuthError on failure

  const out = [];
  const seen = new Set();  // dedupe by ref across the 3 queries

  // Query 1: assigned to @me
  const assignedR = gh._runGh([
    'issue', 'list',
    '--assignee', '@me',
    '--state', 'open',
    '--json', 'number,title,labels,assignees,repository',
    '--limit', '50',
  ]);
  if (assignedR.ok) {
    let arr = [];
    try { arr = JSON.parse(assignedR.stdout); } catch {}
    for (const issue of (Array.isArray(arr) ? arr : [])) {
      _appendGhIssue(out, seen, issue, { assigned: true }, opts.org);
    }
  }

  // Query 2: mentions @me
  const mentionedR = gh._runGh([
    'search', 'issues',
    'mentions:@me', 'is:open',
    '--json', 'number,title,labels,repository',
    '--limit', '50',
  ]);
  if (mentionedR.ok) {
    let arr = [];
    try { arr = JSON.parse(mentionedR.stdout); } catch {}
    for (const issue of (Array.isArray(arr) ? arr : [])) {
      _appendGhIssue(out, seen, issue, { mentioned: true }, opts.org);
    }
  }

  // Query 3: review-requested @me
  const reviewR = gh._runGh([
    'search', 'issues',
    'review-requested:@me', 'is:open', 'is:pr',
    '--json', 'number,title,labels,repository',
    '--limit', '25',
  ]);
  if (reviewR.ok) {
    let arr = [];
    try { arr = JSON.parse(reviewR.stdout); } catch {}
    for (const issue of (Array.isArray(arr) ? arr : [])) {
      _appendGhIssue(out, seen, issue, { review_requested: true }, opts.org);
    }
  }

  return out;
}
```

# CRITICAL: `requireGhAuth` is the FIRST action — it throws on failure. The aggregate path catches and routes to warnings[]. Do NOT swallow the error here.
# GOTCHA: Three separate gh queries — each can succeed or fail independently (transient network). On failure, that query's results are empty; the others still proceed.
# PATTERN: Single-org filter applied in `_appendGhIssue` (private helper). Strip out items whose repository doesn't match `opts.org`. Decoupled from the queries themselves.
# PATTERN: Dedup via `seen` Set on `repo#number` ref string. An issue assigned AND mentioning the user gets ONE entry with both flags set.

**Lane assignment — pure deterministic function:**

```js
// ─── TRD 06-01: _assignLane ───────────────────────────────────────────────────

/**
 * Assign an entry to exactly one of 4 urgency lanes.
 * Pure function — no I/O, no global state.
 *
 * Lane rules (per CONTEXT.md decision #2):
 *   - 🔥 Blocked-on-you: peer.state === 'blocked_on_user' OR
 *                         dup-detect resolution === 'coordinate' (recent)
 *   - ⚡ Now:             gh.assigned + priority label OR
 *                         peer.state === 'active' on this repo OR
 *                         current objective's open TRDs (local STATE source)
 *   - 📋 Soon:            gh.mentioned (not assigned) OR
 *                         gh.review_requested OR
 *                         initiative open question
 *   - 💡 Ideas:           local todo OR gh.assigned without priority
 *
 * Tie-breakers (per CONTEXT.md):
 *   - Both assigned + mentioned → assignment wins → check priority for Now/Ideas split
 *   - peer.state === 'blocked_on_user' on cross-repo branch → still Blocked-on-you
 *   - initiative open question → always Soon (never Now/Ideas)
 *   - local todo → always Ideas
 *
 * @param {object} entry        - source-emitted entry with `source` field
 * @param {string} currentUser  - git config user.name OR gh authed user
 * @param {string} currentRepo  - PROJECT.md github_repo (e.g., "AO-Cyber-Systems/devflow-claude")
 * @returns {'blocked'|'now'|'soon'|'ideas'|null}  // null = skipped
 */
function _assignLane(entry, currentUser, currentRepo) {
  if (!entry || !entry.source) return null;

  switch (entry.source) {
    case 'local':
      return 'ideas';

    case 'initiative':
      return 'soon';

    case 'dup-detect': {
      // Recent coordinate / pending blocking-execute → blocked
      const recent = _isRecent(entry.timestamp, 7);  // 7-day window
      if (!recent) return null;  // stale — skip
      if (entry.resolution === 'coordinate') return 'blocked';
      if (entry.mode === 'execute' && entry.blocking) return 'blocked';
      return null;  // resolved cleanly — skip
    }

    case 'peer': {
      if (entry.state === 'blocked_on_user') return 'blocked';
      if (entry.state === 'active') return 'now';
      return null;  // paused / done / unknown → skip
    }

    case 'gh': {
      // Tie-breakers: assigned > mentioned > review_requested
      if (entry.assigned) {
        // Priority label routes to Now; absence routes to Ideas
        const labels = Array.isArray(entry.labels) ? entry.labels : [];
        const isPriority = labels.some(l =>
          /^priority:high$/i.test(l) || /^P[01]$/i.test(l)
        );
        return isPriority ? 'now' : 'ideas';
      }
      if (entry.mentioned) return 'soon';
      if (entry.review_requested) return 'soon';
      return null;  // none of the flags → shouldn't happen, skip
    }

    default:
      return null;
  }
}
```

# CRITICAL: Pure function — never reads filesystem, never calls gh, never throws. Test exhaustively with enumerated cases.
# GOTCHA: `_isRecent(timestamp, days)` is a small helper used by dup-detect routing — wraps Date.parse with NaN guard. Stale entries (older than N days) return null (skip).
# GOTCHA: peer.state values come from STATE.md parsing in obj 2's parseStateMd; allowed values are 'active' | 'paused' | 'done' | 'blocked_on_user' | null. Test the null path.

**df-tools.cjs case arm wiring:**

```js
// In df-tools.cjs main switch (alongside other case arms):
case 'check-todos': {
  cmdCheckTodosRoute(cwd, args.slice(1), raw);
  break;
}
```

Add the require near the top alongside other CLI module requires. Find the existing `dup-detect-cli` or `initiatives-cli` require and add a sibling line.

**CLI router scaffold — show/refresh stubs (06-04 fills these in):**

```js
// lib/check-todos-cli.cjs (TRD 06-01 — minimal scaffold)
'use strict';

const ct = require('./check-todos.cjs');
const { output, error } = require('./helpers.cjs');

function _parseFlags(args) {
  const flags = {};
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--all' || a === '--refresh' || a === '--raw') {
      flags[a.slice(2)] = true;
      i++;
    } else if (a === '--lane') {
      flags['lane'] = args[i + 1] || null;
      i += 2;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
      i++;
    } else {
      i++; // positional ignored
    }
  }
  return flags;
}

function cmdCheckTodosRoute(cwd, args, raw) {
  // TRD 06-01 scaffold: aggregate-and-emit-raw only. Full flag wiring + render in TRD 06-04.
  const flags = _parseFlags(args);
  if (flags['lane'] && !ct.LANE_NAMES.includes(flags['lane'])) {
    error(`Unknown lane: ${flags['lane']}. Valid: ${ct.LANE_NAMES.join(', ')}`);
  }
  const result = ct.aggregate({ projectRoot: cwd, refresh: !!flags['refresh'] });
  // TRD 06-01: always raw JSON until 06-04 adds the markdown renderer + flag wiring.
  output(result, true, JSON.stringify(result));
}

module.exports = { cmdCheckTodosRoute, _parseFlags };
```

# PATTERN: TRD 06-01 emits raw JSON only (refusing to fail on missing markdown renderer). TRD 06-04 replaces the raw-only behavior with full flag handling and routes through `formatCheckTodosMarkdown` (06-03's deliverable). Document the transition explicitly in 06-04's SUMMARY.
# CRITICAL: TRD 06-01 CLI tests assert raw-JSON-only output. TRD 06-04 will replace these CLI tests with full flag-handling tests (per obj 3 TRD 03-02 deviation pattern).

**Fixture builder pattern (mirror buildDupDetectFixtures from obj 4):**

```js
// At end of __fixtures__/awareness-fixtures.cjs (append at very bottom):

/**
 * Compose a tmpdir-backed fixture for unified check-todos testing.
 *
 * Returns:
 *   {
 *     projectRoot,        // tmp .planning/-rooted dir with todos/, dup-detect-log.jsonl, STATE.md
 *     initiativesHome,    // tmp dir with N initiative .md files (consumes existing buildInitiativesHomeTree)
 *     mockGh,             // gh mock function (returns canned issue list responses)
 *     mockPeer,           // scanPeer mock function
 *     mockFs,             // optional fs mock (delegates to real fs by default)
 *     cleanup,            // () => removes both tmpdirs
 *   }
 *
 * @param {object} opts
 * @param {Array}  [opts.localTodos]            - [{ title, area, created }, ...]
 * @param {Array}  [opts.ghIssues]              - [{ ref, title, labels, assigned, mentioned, review_requested }, ...]
 * @param {Array}  [opts.peerBranches]          - same shape as buildPeerScanResult.branches
 * @param {Array}  [opts.initiatives]           - [{ slug, github_issue, key_repos, open_questions }, ...]
 * @param {Array}  [opts.dupLogEntries]         - jsonl-format entries
 * @param {string} [opts.currentUser]           - default 'mark'
 * @param {string} [opts.currentRepo]           - default 'AO-Cyber-Systems/devflow-claude'
 * @returns {object} bundle described above
 */
function buildCheckTodosFixtures({
  localTodos = [],
  ghIssues = [],
  peerBranches = [],
  initiatives = [],
  dupLogEntries = [],
  currentUser = 'mark',
  currentRepo = 'AO-Cyber-Systems/devflow-claude',
} = {}) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // 1. tmp project root
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-todos-'));
  const planningDir = path.join(projectRoot, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  // 1a. local todos
  if (localTodos.length > 0) {
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });
    for (const t of localTodos) {
      const filename = `${(t.created || '2026-05-04').replace(/[^0-9-]/g, '-')}-${t.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
      fs.writeFileSync(path.join(todosDir, filename),
        `---\ntitle: ${t.title}\ncreated: ${t.created || '2026-05-04'}\narea: ${t.area || 'general'}\n---\n\n${t.body || ''}\n`,
        'utf-8');
    }
  }

  // 1b. dup-detect log
  if (dupLogEntries.length > 0) {
    const logPath = path.join(planningDir, '.dup-detect-log.jsonl');
    const lines = dupLogEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(logPath, lines, 'utf-8');
  }

  // 1c. STATE.md (minimal — needed by _detectCurrentRepo)
  fs.writeFileSync(path.join(planningDir, 'STATE.md'),
    `**Branch:** test-branch\n**Objective in flight:** test-objective\n`, 'utf-8');

  // 1d. PROJECT.md (frontmatter for currentRepo detection)
  fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
    `---\ngithub_repo: ${currentRepo}\n---\n\n# Test Project\n`, 'utf-8');

  // 2. initiatives home
  const initiativesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'check-todos-init-'));
  for (const init of initiatives) {
    // Reuse existing buildInitiativeFile if available, OR write a minimal valid file
    const yaml = `---\nslug: ${init.slug}\ngithub_issue: ${init.github_issue || ''}\nkey_repos:\n${(init.key_repos || []).map(r => `  - ${r}`).join('\n')}\n---\n\n## Why\n\n${init.why || ''}\n\n## Open Questions\n\n${(init.open_questions || []).map(q => `- ${q}`).join('\n')}\n\n## Linked Sub-issues\n\n## Status\n`;
    fs.writeFileSync(path.join(initiativesHome, `${init.slug}.md`), yaml, 'utf-8');
  }

  // 3. mock builders
  const mockGh = _buildCheckTodosMockGh(ghIssues);
  const mockPeer = () => ({
    branches: peerBranches,
    fetched_at: new Date().toISOString(),
  });

  return {
    projectRoot,
    initiativesHome,
    currentUser,
    currentRepo,
    mockGh,
    mockPeer,
    cleanup: () => {
      try { fs.rmSync(projectRoot, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(initiativesHome, { recursive: true, force: true }); } catch {}
    },
  };
}

function _buildCheckTodosMockGh(issues = []) {
  // Returns a function suitable for gh._setRunGh(fn) — receives args array, returns { ok, stdout, stderr, status }.
  return function mockGh(args) {
    if (!Array.isArray(args)) return { ok: false, stdout: '', stderr: 'unknown call', status: 1 };
    // Handle `gh auth status` for requireGhAuth — synthesize a healthy authed response
    if (args[0] === 'auth' && args[1] === 'status') {
      return {
        ok: true,
        status: 0,
        stdout: '',
        stderr: '✓ Logged in to github.com as mark\n  Token scopes: repo, project, read:project',
      };
    }
    // Issue list with --assignee @me
    if (args[0] === 'issue' && args[1] === 'list' && args.includes('--assignee')) {
      const assigned = issues.filter(i => i.assigned).map(_normalizeForGhJson);
      return { ok: true, status: 0, stdout: JSON.stringify(assigned), stderr: '' };
    }
    // search issues for mentions / review-requested
    if (args[0] === 'search' && args[1] === 'issues') {
      if (args.includes('mentions:@me')) {
        const mentioned = issues.filter(i => i.mentioned).map(_normalizeForGhJson);
        return { ok: true, status: 0, stdout: JSON.stringify(mentioned), stderr: '' };
      }
      if (args.includes('review-requested:@me')) {
        const reviews = issues.filter(i => i.review_requested).map(_normalizeForGhJson);
        return { ok: true, status: 0, stdout: JSON.stringify(reviews), stderr: '' };
      }
    }
    return { ok: false, status: 1, stdout: '', stderr: `unhandled gh call: ${args.join(' ')}` };
  };
}

function _normalizeForGhJson(issue) {
  // Convert fixture-shape issue to gh JSON output shape
  return {
    number: issue.number || parseInt(issue.ref.split('#').pop(), 10),
    title: issue.title,
    labels: (issue.labels || []).map(l => ({ name: l })),
    assignees: issue.assigned ? [{ login: 'mark' }] : [],
    repository: {
      nameWithOwner: issue.ref ? issue.ref.split('#')[0] : 'AO-Cyber-Systems/devflow-claude',
    },
  };
}
```

# PATTERN: Mirror buildDupDetectFixtures (obj 4 — line ~670 of awareness-fixtures.cjs). Single composer, multi-source bundle, single cleanup. The composer USES existing builders where available (buildInitiativesHomeTree / buildInitiativeFile / buildPeerBranch / buildPeerScanResult) — does NOT duplicate them.
# GOTCHA: When mocking `gh auth status`, synthesize the EXACT format `parseScopes()` in `lib/gh.cjs` expects ("Token scopes: repo, project, read:project"). Otherwise `requireGhAuth` will throw and break unrelated tests.
</codebase_examples>

<anti_patterns>
- **Don't duplicate cmdListTodos's logic.** Reuse the same regex + fault-tolerance pattern, but route through `_runFs` and emit `source: 'local'`. The existing cmdListTodos in lib/misc.cjs stays untouched (still callable as `df-tools list-todos`).
- **Don't mutate any source.** No write to local todos, no `gh issue comment`, no STATE.md edit, no initiative file write. Read-only is the contract.
- **Don't add cache logic to `aggregate`.** That's TRD 06-02's region. TRD 06-01's `aggregate` always re-fetches (sets `cached: false` unconditionally). TRD 06-02 will wire cache-or-fetch logic.
- **Don't add markdown rendering.** TRD 06-03 owns `formatCheckTodosMarkdown`. TRD 06-01's CLI emits raw JSON only.
- **Don't add full flag handling to the CLI.** TRD 06-04 owns `--all`, `--lane`, `--refresh`, `--raw` end-to-end. TRD 06-01 only validates `--lane` value (rejects unknown lanes) and passes `refresh` boolean through; everything else is stubbed.
- **Don't recreate `requireGhAuth`.** Use `gh.requireGhAuth(['repo'])` directly — the auth pattern is already locked in obj 1 TRD 01-03.
- **Don't add LLM scoring or semantic similarity to `_assignLane`.** Lane rules are deterministic-by-design. Test with enumerated cases.
- **Don't add a separate `_fetchPeerSessions` injection beyond `_setRunPeer`.** The whole point of `_setRunPeer` is single-seam mock.
</anti_patterns>

<error_recovery>
- **Test pollution from injection hooks:** Every test that calls `_setRunFs`, `_setRunPeer`, or `_setRunGh` must call `_resetMocks()` in `afterEach`. Failure to reset = stale mocks leak into the next test.
- **`requireGhAuth` throws inside test:** Mock `gh._setRunGh(mockFn)` BEFORE calling `aggregate`. Otherwise the test process tries real `gh auth status` and may pass/fail unpredictably depending on dev environment. The `mockGh` from `buildCheckTodosFixtures` returns a healthy auth status response.
- **Initiative home dir doesn't exist in test:** `loadInitiatives` returns `[]` silently when home is missing — `_fetchInitiativeQuestions` propagates that empty array. Test expectations: empty `initiative` source = empty initiative entries, NOT a warning.
- **Dup-detect log path collision:** Test fixtures write to `path.join(projectRoot, '.planning', '.dup-detect-log.jsonl')` — match obj 4's `DUP_DETECT_LOG_REL` constant. Hard-coding is fine in tests; production reads from the constant.
- **df-tools.cjs case-arm collision:** Search df-tools.cjs for any existing `check-todos` reference before adding. If found, document and rename. (None expected — the EXISTING `/devflow:check-todos` skill delegates to `workflows/check-todos.md`, not a df-tools subcommand.)
- **CLI subprocess test pattern:** `output()` in `helpers.cjs` calls `process.exit(0)`. CLI tests must use `execSync('node df-tools.cjs check-todos ...')` subprocess invocation, NOT in-process `cmdCheckTodosRoute` calls. See `lib/initiatives-cli.test.cjs` for the canonical subprocess pattern.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/06-unified-check-todos/06-CONTEXT.md
@.planning/research/cross-session-coordination.md
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/initiatives.cjs
@plugins/devflow/devflow/bin/lib/dup-detect.cjs
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/misc.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
</context>

<gotchas>
- **No two TRDs in this objective touch `lib/check-todos.cjs` in the same wave.** All four TRDs are serialized on this file. 06-01 creates it; 06-02/03/04 extend specific regions (cache, formatter, CLI/skill/export-lock).
- **`requireGhAuth(['repo'])` only — not `project` / `read:project`.** Listing issues requires only `repo` scope. Don't over-request scopes; that's a friction signal for users who don't have project scope yet.
- **`_isRecent(timestamp, days)` helper:** Implement as `Date.now() - Date.parse(timestamp) < days * 86400000`, returns false on NaN parse. Test with future timestamps (returns true — cooperate with clock skew).
- **Single `awareness-fixtures.cjs` file per memory `feedback_planner_proto_conflict`:** This TRD APPENDS to the existing file (don't create a new fixtures file). Mirror obj 5 TRD 05-01 pattern.
- **df-tools.cjs require ordering:** Find where `dup-detect-cli` or `initiatives-cli` is required at the top of df-tools.cjs and add a sibling line for `check-todos-cli`. Match the existing destructuring pattern (single line, single import per CLI module).
- **The existing `/devflow:check-todos` skill currently delegates to `workflows/check-todos.md` (local todos browser):** Do NOT modify the skill file in TRD 06-01. TRD 06-04 rewrites it. The `workflows/check-todos.md` file is preserved for v1.1 (legacy local-only flow remains accessible via `df-tools list-todos`).
- **CLI test isolation:** Each CLI test exercising argv parsing must reset `_runFs` and `_resetMocks()` in `afterEach` to prevent test pollution.
- **`output()` helper exits process:** `helpers.cjs::output` calls `process.exit(0)` on success. CLI tests must spawn subprocess via `execSync('node df-tools.cjs check-todos --raw', ...)` rather than calling `cmdCheckTodosRoute` in-process — otherwise the test process exits mid-run.
</gotchas>

## Test list

Hand-built test cases written FIRST (test:add commit), then implementation (feat: commit). Test groups:

### Group A — aggregate (top-level orchestration)

- **A1**: `aggregate({ projectRoot })` with all 5 sources empty returns `{ blocked: [], now: [], soon: [], ideas: [], warnings: [], cached: false }`. Pure smoke.
- **A2**: `aggregate({ projectRoot })` with mixed sources routes entries into correct lanes (one entry per lane). Verify counts + per-lane source attribution.
- **A3**: `aggregate({ projectRoot })` survives `_fetchLocalTodos` throwing (e.g., permission denied via mocked _runFs). Returns warnings entry kind=`fetch_error`, other 4 sources still aggregate.
- **A4**: `aggregate({ projectRoot })` catches `GhAuthError` from `_fetchGhIssues`. Adds `gh_auth_failure` warning + skips gh source. Other 4 sources continue.
- **A5**: `aggregate({ projectRoot })` survives `_fetchPeerSessions` throwing (e.g., scanPeer crash). Generic `fetch_error` warning; other 4 sources continue.
- **A6**: `aggregate({ projectRoot })` survives `_fetchInitiativeQuestions` throwing. Generic `fetch_error` warning; other 4 sources continue.
- **A7**: `aggregate({ projectRoot })` survives `_fetchDupDetectLog` throwing. Generic `fetch_error` warning; other 4 sources continue.
- **A8**: `aggregate({ projectRoot, refresh: true })` calls all fetchers; `cached: false` (cache wiring deferred to 06-02 — `refresh` flag passes through but does nothing in 06-01).

### Group F — _fetchLocalTodos

- **F1**: Empty `.planning/todos/pending/` → returns `[]`.
- **F2**: Two well-formed todo files → returns 2 entries with `source: 'local'`, parsed `title`/`created`/`area`.
- **F3**: Missing pending dir → returns `[]` silently (no throw).
- **F4**: Mixed files (`.md` + `README` + `.DS_Store`) → only `.md` returned.
- **F5**: Malformed todo (no `title:` line) → entry uses `'Untitled'` placeholder.
- **F6**: `opts.area` filter applies — only matching todos returned.
- **F7**: All entries have `path` field with relative path `.planning/todos/pending/<file>`.

### Group L — _fetchGhIssues

- **L1**: `requireGhAuth` throws → `_fetchGhIssues` propagates the error (caller catches).
- **L2**: All 3 queries succeed → returns deduplicated entries with correct flags (`assigned`, `mentioned`, `review_requested`).
- **L3**: Issue assigned AND mentioned → ONE entry with both flags set (dedupe via `repo#number`).
- **L4**: Cross-org issue → filtered out via `opts.org` org-filter.
- **L5**: Query 2 fails (network) but Query 1 + 3 succeed → returns entries from queries 1 + 3 (no warning emitted from fetcher; aggregate caller handles).
- **L6**: All entries have `source: 'gh'` and `ref` field (e.g., `'AO-Cyber-Systems/devflow#15'`).
- **L7**: Labels normalized from `[{ name: 'priority:high' }]` → `['priority:high']` array of strings.

### Group P — _fetchPeerSessions

- **P1**: `_runPeer` returns `{ branches: [...] }` → entries flow through with `source: 'peer'`.
- **P2**: `_runPeer` returns `{ branches: [] }` → returns `[]`.
- **P3**: `_runPeer` throws → `_fetchPeerSessions` propagates (aggregate catches).
- **P4**: Each entry includes `branch`, `objective`, `trd`, `last_commit`, `state`, `github_issue` from peer scanner output.
- **P5**: `state === 'blocked_on_user'` flag preserved for downstream lane assignment.

### Group I — _fetchInitiativeQuestions

- **I1**: Initiatives home empty → returns `[]`.
- **I2**: Three initiatives, two match current repo (key_repos contains it) → returns N entries (one per open_question across the 2 matched initiatives).
- **I3**: Each entry has `initiative_slug`, `github_issue`, `question`, `source: 'initiative'`.
- **I4**: Initiative with empty `open_questions` array → contributes 0 entries.
- **I5**: `loadInitiatives` failure (e.g., home dir read error) → propagates (aggregate catches).
- **I6**: `opts.githubRepo === null` → returns `[]` (no current repo, no matching).

### Group D — _fetchDupDetectLog

- **D1**: Log file missing → returns `[]`.
- **D2**: Log with 3 entries → returns 3 with `source: 'dup-detect'`, fields preserved (`timestamp`, `objective_id`, `mode`, `blocking`, `top_match`, `resolution`).
- **D3**: Malformed JSONL line → silently skipped, valid lines still returned.
- **D4**: Empty log file → returns `[]`.
- **D5**: Each entry's timestamp is preserved verbatim for downstream `_isRecent` checks.

### Group AS — _assignLane (deterministic enumeration)

- **AS1**: `entry.source === 'local'` → always `'ideas'` (regardless of other fields).
- **AS2**: `entry.source === 'initiative'` → always `'soon'`.
- **AS3**: `entry.source === 'peer'`, state='blocked_on_user' → `'blocked'`.
- **AS4**: `entry.source === 'peer'`, state='active' → `'now'`.
- **AS5**: `entry.source === 'peer'`, state='paused' or `null` → `null` (skipped).
- **AS6**: `entry.source === 'gh'`, assigned=true, labels=['priority:high'] → `'now'`.
- **AS7**: `entry.source === 'gh'`, assigned=true, labels=['P0'] → `'now'`.
- **AS8**: `entry.source === 'gh'`, assigned=true, labels=['enhancement'] → `'ideas'`.
- **AS9**: `entry.source === 'gh'`, mentioned=true, assigned=false → `'soon'`.
- **AS10**: `entry.source === 'gh'`, review_requested=true → `'soon'`.
- **AS11**: `entry.source === 'gh'`, no flags set → `null` (skipped).
- **AS12**: `entry.source === 'dup-detect'`, resolution='coordinate', recent (within 7 days) → `'blocked'`.
- **AS13**: `entry.source === 'dup-detect'`, mode='execute', blocking=true, recent → `'blocked'`.
- **AS14**: `entry.source === 'dup-detect'`, resolution='proceed-anyway' → `null` (clean resolution).
- **AS15**: `entry.source === 'dup-detect'`, timestamp older than 7 days → `null` (stale).
- **AS16**: `entry.source` invalid/missing → `null`.
- **AS17**: Tie-breaker — gh.assigned=true AND gh.mentioned=true → routes per ASSIGNED rule (not mentioned).

### Group CLI — check-todos-cli scaffold

- **CLI1**: `df-tools check-todos --raw` (subprocess, against fixture project) → exit 0, valid JSON to stdout matching `{ blocked, now, soon, ideas, warnings, cached }` shape.
- **CLI2**: `df-tools check-todos --lane unknown` → exit 1, error message lists valid lanes.
- **CLI3**: `df-tools check-todos --refresh` → exit 0, JSON has `cached: false` (06-02 will replace this with cached: true after first call).
- **CLI4**: Flag parser unit test — `_parseFlags(['--all', '--refresh', '--lane', 'now'])` → `{ all: true, refresh: true, lane: 'now' }`.

Total: ~57 new tests across 8 groups.

<tasks>

<task type="auto">
  <name>Task 1: RED — fixture builder + skeleton + test list (test: commit)</name>
  <files>
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
    plugins/devflow/devflow/bin/lib/check-todos.cjs
    plugins/devflow/devflow/bin/lib/check-todos.test.cjs
    plugins/devflow/devflow/bin/lib/check-todos-cli.cjs
    plugins/devflow/devflow/bin/lib/check-todos-cli.test.cjs
    plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
RED phase: write the test list and create the file scaffolds with stub implementations that will fail. Single `test:` commit.

**Step 1: Append `buildCheckTodosFixtures` to `awareness-fixtures.cjs`** per the embedded fixture pattern.

- Add at end of file, BEFORE the existing `module.exports` block.
- Update the `module.exports` block to add `buildCheckTodosFixtures` and the private helper `_buildCheckTodosMockGh` (only buildCheckTodosFixtures is exported).
- Reuse existing `buildPeerBranch`, `buildInitiativeFile`, `buildInitiativesHomeTree` where the fixture composer assembles sub-pieces. DO NOT duplicate them.

**Step 2: Create `lib/check-todos.cjs` with skeleton**:

- Header comment block ("Module growth across waves" annotation).
- All `require`s (fs, path, awareness, initiatives, gh, frontmatter, dup-detect for `DUP_DETECT_LOG_REL`).
- Constants: `CHECK_TODOS_CACHE_REL`, `CHECK_TODOS_TTL_MINUTES`, `MAX_CHECK_TODOS_OUTPUT_CHARS`, `DEFAULT_LANE_TRUNCATE`, `LANE_NAMES`.
- Injection hooks: `realFs`, `_runFs`, `_runPeer`, `_setRunFs`, `_setRunPeer`, `_setRunGh` (re-export from gh), `_resetMocks`.
- Stub implementations of all 5 fetchers + `aggregate` + `_assignLane` (each function returns null/empty/throws "not yet implemented") so the test file can require the module.
- Partial `module.exports` block listing only the symbols this TRD introduces.

**Step 3: Create `lib/check-todos-cli.cjs` with stub `cmdCheckTodosRoute`**:

- Per the embedded skeleton — `_parseFlags` + `cmdCheckTodosRoute` that calls `ct.aggregate(...)` and emits raw JSON.
- Validates `--lane <name>` against `ct.LANE_NAMES`; errors out on unknown.
- Show + refresh full handling deferred to TRD 06-04 (pass-through only in 06-01).

**Step 4: Create `lib/check-todos.test.cjs`** — write the FULL test list per the `## Test list` section above. ALL ~57 tests should be present at RED time.

- Top of file: `// TEST LIST — TRD 06-01 aggregator + fetchers + lane assignment` followed by the 8 groups enumerated.
- Use `node:test` runner (mirror obj 5 + obj 4 patterns).
- Each test imports `lib/check-todos.cjs` + uses `buildCheckTodosFixtures` for setup.
- `afterEach` block calls `_resetMocks()`.

**Step 5: Create `lib/check-todos-cli.test.cjs`** — Group CLI tests:

- CLI1-CLI4 per the test list.
- CLI tests use `execSync('node ' + DF_TOOLS_PATH + ' check-todos --raw', { cwd: fixture.projectRoot })` subprocess pattern (per `lib/initiatives-cli.test.cjs`).

**Step 6: Wire `df-tools.cjs`**:

- Add require: `const { cmdCheckTodosRoute } = require('./lib/check-todos-cli.cjs');` near other CLI module requires.
- Add case arm:
  ```js
  case 'check-todos': {
    cmdCheckTodosRoute(cwd, args.slice(1), raw);
    break;
  }
  ```
- Place alongside `case 'dup-detect'` and `case 'initiatives'`.

# CRITICAL: At RED time ALL ~57 tests should be written. Most will FAIL because the stub implementations return null/empty/throw. This is the test-list-first habit from CLAUDE.md TDD Playbook.
# GOTCHA: The fixture builder must support tests where `loadInitiatives` is called against the fixture's `initiativesHome` — but `loadInitiatives` defaults to `os.homedir() + '/.claude/devflow/initiatives'`. Tests must pass `home: fixture.initiativesHome` explicitly to `_fetchInitiativeQuestions` (which then forwards to `loadInitiatives({ home })`). Bake this into `_fetchInitiativeQuestions`'s opts signature.
# GOTCHA: `requireGhAuth` mock must produce the exact "Token scopes:" string format for `parseScopes` to recognize it. Re-read lib/gh.cjs::parseScopes if the mock auth response shape is unclear.

Commit: `test(06-01): add failing tests for unified check-todos aggregator + 5 fetchers + lane assignment + fixture builder`.
  </action>
  <verify>
1. `npm test 2>&1 | tail -40` — shows new test file with ~57 failing tests.
2. `node -e "const ct = require('./plugins/devflow/devflow/bin/lib/check-todos.cjs'); console.log(Object.keys(ct))"` — module loads, exports present.
3. `node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw 2>&1 | head -5` — case arm dispatches (will likely emit warnings or skeleton JSON; main thing is no "Unknown command").
4. `grep "buildCheckTodosFixtures" plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` — fixture builder exists.
  </verify>
  <done>
~57 new tests added in RED state (failing as expected). All 6 files exist. Single `test:` commit.
  </done>
  <recovery>
If df-tools.cjs case arm collides (unexpected — `check-todos` was a SKILL name, not a CLI subcommand previously), search the file for any prior `check-todos` reference before adding. If `df-tools list-todos` already handles a subset, that's fine — leave list-todos alone (legacy local-only path is preserved per CONTEXT.md).

If the fixture builder runs into circular require with `lib/initiatives.cjs`, lazy-load: `const initiatives = require('./initiatives.cjs')` inside the function body, not at top of file.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement aggregator + 5 fetchers + lane assignment (feat: commit)</name>
  <files>
    plugins/devflow/devflow/bin/lib/check-todos.cjs
  </files>
  <action>
GREEN phase: replace the stub implementations with real logic per the embedded codebase examples.

**Step 1: Implement `_detectCurrentUser` + `_detectCurrentRepo` private helpers**:

- `_detectCurrentUser({ cwd })`: try `git config user.name` via `_runGit`-style spawnSync; fallback to env `USER`; return null on both fail. (Synchronous, fault-tolerant.)
- `_detectCurrentRepo({ cwd })`: read `path.join(cwd, '.planning', 'PROJECT.md')`, `extractFrontmatter`, return `frontmatter.github_repo || null`. Fault-tolerant.

**Step 2: Implement 5 `_fetch*` helpers** per embedded examples:

- `_fetchLocalTodos(cwd, opts)` — mirror `cmdListTodos` regex/walk but route through `_runFs` + emit `source: 'local'`.
- `_fetchGhIssues(opts)` — call `gh.requireGhAuth(['repo'])` first; then 3 sequential `gh._runGh(...)` queries; dedupe via `seen` Set; filter by `opts.org`.
- `_fetchPeerSessions(opts)` — call `_runPeer({ cwd: opts.cwd })`; map result.branches → entries with `source: 'peer'`.
- `_fetchInitiativeQuestions(opts)` — `initiatives.loadInitiatives({ home: opts.home })` → `initiatives.matchByRepo(arr, opts.githubRepo)` → flat-map open_questions → entries with `source: 'initiative'`.
- `_fetchDupDetectLog(cwd, opts)` — read `path.join(cwd, DUP_DETECT_LOG_REL)`, parse JSONL line-by-line (skip malformed), emit entries with `source: 'dup-detect'`.

**Step 3: Implement `_assignLane(entry, currentUser, currentRepo)`** per embedded example with the locked rules. Add `_isRecent(timestamp, days)` helper.

**Step 4: Implement `aggregate({ projectRoot, refresh })`** per embedded orchestration:

- Call `_detectCurrentUser` + `_detectCurrentRepo` once.
- Wrap each `_fetch*` call in try/catch with source-attributed warning emission.
- Special-case `GhAuthError` (kind: `gh_auth_failure` + remediation).
- Iterate aggregated entries through `_assignLane` and push into appropriate lane bucket.
- Return result with `cached: false` (TRD 06-02 wires cache).

**Step 5: Run tests**:

```bash
npm test 2>&1 | tail -40
```

Expected: all ~57 tests GREEN. Existing 1097 tests remain GREEN (no regression).

# CRITICAL: After Task 2, the test count must increase by ~57 with zero new failures. If any test fails, debug + fix in this same task — don't ship broken GREEN.
# GOTCHA: `_fetchGhIssues` only swallows query-level errors (one query fails, others succeed). It propagates `GhAuthError` from the initial `requireGhAuth` call so aggregate can route it to warnings.
# GOTCHA: `_fetchPeerSessions` does NOT call `aw.scanPeer` directly — it calls `_runPeer(opts)`. `_runPeer` defaults to `(opts) => aw.scanPeer(opts)`, but tests inject mocks via `_setRunPeer(mockFn)`.

Commit: `feat(06-01): implement unified check-todos aggregator + 5 fetchers + lane assignment`.
  </action>
  <verify>
1. `npm test 2>&1 | grep -E "(pass|fail) " | tail -3` — total pass count UP by ~57; fail count = 0.
2. `node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw` (against this repo) → emits valid JSON with all 5 source attempts (gh may have auth-failure warning, peer/local/initiative/dup may have data depending on this repo's actual state).
3. `node -e "const ct = require('./plugins/devflow/devflow/bin/lib/check-todos.cjs'); const r = ct.aggregate({ projectRoot: process.cwd() }); console.log(Object.keys(r))"` → prints `['blocked', 'now', 'soon', 'ideas', 'warnings', 'cached']`.
  </verify>
  <done>
All ~57 tests GREEN. No regression. Commit `feat(06-01): ...`. Manual smoke test against this repo prints valid aggregate JSON.
  </done>
  <recovery>
If a test fails because of unexpected `gh` invocation in CI, ensure the test file calls `gh._setRunGh(mockGh)` BEFORE invoking aggregate. The mock from `buildCheckTodosFixtures` synthesizes a healthy `gh auth status` response; without it, `requireGhAuth` will try real auth and may fail in CI environments.

If `_fetchInitiativeQuestions` test fails because `loadInitiatives` returns `[]` from the wrong path, verify the test passes `home: fixture.initiativesHome` to the fetcher and that `_fetchInitiativeQuestions` forwards it to `loadInitiatives({ home: opts.home })`.

If lane assignment tests pass individually but fail when run together, suspect mock pollution. Verify `afterEach(() => check_todos._resetMocks())` is in the test file.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `lib/check-todos.cjs` exists with skeleton + aggregator + 5 fetchers + `_assignLane` + 4 injection hooks + 5 constants.
2. `lib/check-todos.test.cjs` has Groups A/F/L/P/I/D/AS at GREEN.
3. `lib/check-todos-cli.cjs` exists with `cmdCheckTodosRoute` scaffold (raw JSON only; --lane validation).
4. `lib/check-todos-cli.test.cjs` has Group CLI at GREEN.
5. `lib/__fixtures__/awareness-fixtures.cjs` has `buildCheckTodosFixtures` appended to module.exports.
6. `df-tools.cjs` has `case 'check-todos'` arm dispatching to `cmdCheckTodosRoute`.
7. `df-tools check-todos --raw` (against this repo) emits valid JSON with the 6-key aggregate shape.
8. Total commits this TRD: 2 (`test:` RED + `feat:` GREEN).
</verification>

<success_criteria>
- [ ] SC-1 satisfied: `aggregate({ projectRoot, refresh })` returns `{ blocked, now, soon, ideas, warnings, cached }` shape; tested in Group A.
- [ ] SC-2 satisfied: 5 `_fetch*` helpers exist with `_setRunFs`/`_setRunGh`/`_setRunPeer` injection seams; tested in Groups F/L/P/I/D.
- [ ] SC-3 satisfied: `_assignLane` is deterministic; 17 enumerated cases in Group AS pass.
- [ ] All ~57 new tests GREEN; total test count increased proportionally.
- [ ] No regression in baseline (1097 tests still pass).
- [ ] Manual smoke: `df-tools check-todos --raw` against this repo emits valid aggregate JSON.
</success_criteria>

<output>
After completion, create `.planning/objectives/06-unified-check-todos/06-01-aggregator-and-fixtures-SUMMARY.md`. Record:

- Test count delta (before/after this TRD).
- Both commit hashes (`test:` RED + `feat:` GREEN).
- Any deviations from the locked design (especially: how `_detectCurrentRepo` reads PROJECT.md frontmatter; how `_isRecent` handles NaN; whether `_fetchInitiativeQuestions` opts.home is required or defaults to `os.homedir()`).
- Manual smoke-test result: `df-tools check-todos --raw` against this repo's actual state — capture the JSON.
</output>
