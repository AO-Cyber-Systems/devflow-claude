---
objective: 02-cross-repo-awareness-layer
trd: 02-01
title: STATE.md parser + fixtures scaffold (foundation for awareness module)
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/awareness.cjs
  - plugins/devflow/devflow/bin/lib/awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
autonomous: true
requirements: [SC-2]
verification_commands:
  - "npm test -- --grep awareness"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/awareness.cjs\"); if(typeof a.parseStateMd!==\"function\") throw new Error(\"parseStateMd not exported\"); if(typeof a.aggregateOrgByProductQuarter!==\"function\") throw new Error(\"aggregateOrgByProductQuarter not exported\"); console.log(\"OK\");'"
  - "node -e 'const f=require(\"./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs\"); if(typeof f.buildStateMd!==\"function\") throw new Error(\"buildStateMd not exported\"); if(typeof f.buildGitFixtureRepo!==\"function\") throw new Error(\"buildGitFixtureRepo not exported\"); console.log(\"OK\");'"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/devflow/bin/lib/awareness.cjs plugins/devflow/devflow/bin/lib/awareness.test.cjs | grep -E '^[a-f0-9]+ test' | head -1"

must_haves:
  truths:
    - "lib/awareness.cjs module exists with stable header, requires, and constants block"
    - "parseStateMd(content) returns { objective, trd, branch, github_issue, objective_complete[] } | null when content is malformed/empty/too-short"
    - "parseStateMd is fault-tolerant — never throws on garbage input; returns null instead"
    - "parseStateMd extracts objective from BOTH '**Objective in flight:** N — name' AND '**Objective:** N — name' patterns"
    - "parseStateMd extracts trd from '**Current TRD:** NN-NN' or 'TRD NN-NN' or 'job NN-NN' (case-insensitive)"
    - "parseStateMd extracts branch from '**Branch:** \\`name\\`' pattern (backticks may be optional)"
    - "parseStateMd extracts github_issue from any 'github_issue: ref' line in body (frontmatter or markdown)"
    - "aggregateOrgByProductQuarter(items) groups items by Product then Quarter; items missing those fields go to 'Unknown' bucket"
    - "buildStateMd factory builds realistic STATE.md content from optional fields (no LLM-generated data)"
    - "buildGitFixtureRepo factory creates a tmp git repo with N branches each carrying STATE.md at .planning/STATE.md (used by TRD 02-02 + 02-07)"
    - "All new tests follow RED → GREEN → REFACTOR cycle: test: commit precedes feat: commit per TDD Playbook"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      provides: "Module skeleton with parseStateMd + aggregateOrgByProductQuarter + constants. Exports those two functions plus DEFAULT_TTL_MINUTES, DEFAULT_STALE_DAYS, DEFAULT_BRANCH_PATTERNS, AWARENESS_CACHE_REL constants."
      exports: ["parseStateMd", "aggregateOrgByProductQuarter", "DEFAULT_TTL_MINUTES", "DEFAULT_STALE_DAYS", "DEFAULT_BRANCH_PATTERNS", "AWARENESS_CACHE_REL"]
    - path: "plugins/devflow/devflow/bin/lib/awareness.test.cjs"
      provides: "Test suite: parseStateMd happy/edge/failure cases + aggregateOrgByProductQuarter cases."
      min_lines: 100
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "Hand-built fixture builders: buildStateMd, buildOrgItem, buildGitFixtureRepo, buildOrgScanResult."
      exports: ["buildStateMd", "buildOrgItem", "buildGitFixtureRepo", "buildOrgScanResult", "buildSubIssue"]
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/awareness.test.cjs"
      to: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      via: "require"
      pattern: "require.*awareness\\.cjs"
    - from: "plugins/devflow/devflow/bin/lib/awareness.test.cjs"
      to: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      via: "require"
      pattern: "require.*awareness-fixtures"
---

<objective>
Lay the foundation for `lib/awareness.cjs` — the module that powers cross-repo awareness scanning. Ship the STATE.md parser (the first pure-logic, fixturable component) and the hand-built fixture-builder scaffold every later TRD reuses.

Purpose: Every later TRD in this objective extends `awareness.cjs` and consumes `awareness-fixtures.cjs`. This TRD locks both files' shape so subsequent waves (02-02, 02-03, 02-04, 02-07) get a stable baseline to write tests against. Per TDD Playbook habit 4 (fixture builders, not LLM-generated test data), the fixtures must be hand-built and committed before any behavior test.

Output: A loadable `lib/awareness.cjs` module with `parseStateMd` + `aggregateOrgByProductQuarter` + constants; a complete test suite for both; and the `awareness-fixtures.cjs` factory module used by all subsequent TRDs.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── awareness.cjs                          ← CREATE  (module skeleton + parser)
├── awareness.test.cjs                     ← CREATE  (test suite)
└── __fixtures__/
    └── awareness-fixtures.cjs             ← CREATE  (fixture builders)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing module style** — `lib/intent.cjs` and `lib/gh.cjs`. Both use:
- `'use strict';` at top
- CommonJS (`require` / `module.exports`)
- Synchronous file I/O (`fs.readFileSync`)
- Single-line section dividers: `// ─── Section name ──────────────────────────────`

Example header pattern (from `lib/gh.cjs`):

```js
'use strict';

/**
 * GitHub integration for DevFlow.
 * ...
 */

const fs = require('fs');
const path = require('path');
```

**Existing fixture style** — `lib/__fixtures__/gh-fixtures.cjs`. Hand-built factory functions, NO `faker`, NO LLM-generated data. Example:

```js
function buildFrontmatter({ github_issue, parent_issue, ... } = {}) {
  const fm = {};
  if (github_issue !== undefined) fm.github_issue = github_issue;
  if (parent_issue !== undefined) fm.parent_issue = parent_issue;
  return fm;
}
```

Pattern: every parameter optional with default; build minimal object containing ONLY explicitly-passed fields. Tests pass exactly the fields under assertion.

**Existing test style** — `lib/gh.test.cjs` uses `node:test` runner:

```js
const test = require('node:test');
const assert = require('node:assert');

test('parseScopes — handles single-quoted scopes', () => {
  const stdout = "Token scopes: 'repo', 'project'";
  assert.deepStrictEqual(parseScopes(stdout), ['repo', 'project']);
});
```

**Existing STATE.md format** (the input parseStateMd reads):

```markdown
**Objective in flight:** 2 — Cross-worktree session telemetry (next)
**Current TRD:** 02-01 (not yet started)
**Status:** Ready to plan

## Branch State (post-merge)

- `main` — has the merged kind/work intent model...
- `feature/v1.1` (this branch) — clean off new main...
```

Or with backtick'd branch:
```markdown
**Branch:** `feature/v1.1`
```

Or completed objective:
```markdown
**Objective complete:** 0 — Refine (kind, work) defaults table from codebase evidence (verified 2026-05-04, 443/443 tests, all 10 SC met)
**Objective complete:** 1 — GitHub coordination layer (verified 2026-05-04, 563/563 tests, all 6 TRDs done, SC-9 + SC-10 met)
```

</codebase_examples>

<anti_patterns>

- **NO LLM-generated fixture data.** `buildStateMd({objective, trd, ...})` must build content from explicit args. The default `objective: 'X-foo'` literal is fine; `objective: faker.commerce.product()` or anything that looks AI-generated is not.
- **NO over-eager parsing.** parseStateMd extracts ONLY the documented fields (objective, trd, branch, github_issue, objective_complete[]). Do NOT also try to extract metrics, blockers, or session continuity — those are obj 5/6/7 territory.
- **NO throwing on malformed input.** When STATE.md is empty / not-markdown / corrupt, return `null`. The scanner caller (TRD 02-02) skips the branch and logs a warning.
- **NO git or gh calls in this TRD.** Pure logic only. `parseStateMd` takes a string, returns an object; no I/O.

</anti_patterns>

<error_recovery>

- If `parseStateMd` regex fails on a real-world STATE.md found in this repo, prefer fixing the regex over rejecting the input. Test with at least 3 real STATE.md samples from `.planning/STATE.md`, `.planning/objectives/01-github-coordination-layer/01-CONTEXT.md`, and the heartbeat schema example in `.planning/research/cross-session-coordination.md`.
- If `buildGitFixtureRepo` fails to spawn `git init` (e.g., on CI without git installed), the test should `assert.skip` rather than fail — mirror the `GH_INTEGRATION=1` gating pattern from `gh.test.cjs`.
- The fixture builders are CALLED by subsequent TRDs' tests. If you change the function signature after this TRD ships, downstream tests break. Lock the signature in the test list and don't change it without a follow-up TRD.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md
@.planning/objectives/02-cross-repo-awareness-layer/02-RESEARCH.md
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
@plugins/devflow/devflow/bin/lib/gh.cjs
</context>

<research_context>

From `.planning/research/cross-session-coordination.md` §"Active-session heartbeat":

> Switching branches mid-session updates the heartbeat — no special handling needed; `git branch --show-current` at heartbeat time is the source of truth. Worktrees are tracked by path so two worktrees of the same repo on different branches are distinct sessions.

In v1.1's read-side simplification, the `git branch --show-current` becomes `git for-each-ref refs/remotes/origin/*` (TRD 02-02). For THIS TRD, the parser only needs to extract fields from STATE.md content (the scanner caller in TRD 02-02 supplies the branch name from the ref iteration).

The heartbeat schema fields obj 2's parser maps:

| Original heartbeat field | parseStateMd field | Source pattern in STATE.md |
|---|---|---|
| `objective: 04-grok-admin-keys` | `objective` | `**Objective in flight:** 4 — Grok admin keys` |
| `job: 02-controller-shape` | `trd` | `**Current TRD:** 02-01` |
| `branch: mark/grok-fix` | `branch` | `**Branch:** \`mark/grok-fix\`` |
| `github_issue: AO-Cyber-Systems/aosentry#42` | `github_issue` | `github_issue: AO-Cyber-Systems/aosentry#42` |
| `developer: mark` | (caller-supplied from `git config user.name`) | NOT in STATE.md |
| `last_heartbeat: ...` | (caller-supplied from `git log -1 origin/<branch>`) | NOT in STATE.md |

</research_context>

<gotchas>

- STATE.md format varies across repos. Tests must use REAL STATE.md content from this repo as fixtures — copy 3 representative blocks into the fixture builder's defaults. Refer to `.planning/STATE.md` for the canonical format.
- The "Objective complete" pattern can repeat (multiple completed objectives in one STATE.md). Return ALL matches as an array, not just the first.
- The `**Current TRD:** NN-NN` pattern in this repo uses 2-2 (objective-trd) form (e.g., `02-01`); some older STATE.md files use 1-2 (e.g., `1-3`). Accept BOTH patterns: `\d+(?:-\d+)?` for the TRD number.
- `aggregateOrgByProductQuarter` is the SHAPE-defining function for the org scanner output. Its output shape is what TRD 02-03 emits. Lock the shape: `{ [Product]: { [Quarter]: items[] } }`. Items missing `product` go under `'Unknown'`; items missing `quarter` go under that product's `'Unknown'` quarter.

</gotchas>

## Test list

Per TDD Playbook habit 2 — write the behavior cases BEFORE the test code. The full enumerated list:

**parseStateMd — happy paths:**
1. P1: parses `**Objective in flight:** 2 — Cross-worktree session telemetry` → `{ objective: '2 — Cross-worktree session telemetry' }`
2. P2: parses `**Current TRD:** 02-01 (not yet started)` → `{ trd: '02-01' }`
3. P3: parses `**Branch:** \`feature/v1.1\`` → `{ branch: 'feature/v1.1' }`
4. P4: parses `github_issue: AO-Cyber-Systems/devflow-claude#11` → `{ github_issue: 'AO-Cyber-Systems/devflow-claude#11' }`
5. P5: parses `**Objective complete:** 0 — Foo (verified)` repeated lines → `{ objective_complete: ['0 — Foo (verified)', ...] }`
6. P6: full real-world STATE.md sample from this repo → all four fields populated correctly

**parseStateMd — edge cases:**
7. E1: empty string → `null`
8. E2: whitespace-only string → `null`
9. E3: 200 chars of garbage (no recognized markers) → `null`
10. E4: STATE.md with `**Objective:** N — name` (older format, no "in flight") → `{ objective: 'N — name' }`
11. E5: STATE.md with branch name lacking backticks: `**Branch:** feature/v1.1` → `{ branch: 'feature/v1.1' }`
12. E6: TRD with mid-objective format `**Current TRD:** 1-3` → `{ trd: '1-3' }`
13. E7: github_issue with shorthand `github_issue: #11` → `{ github_issue: '#11' }` (DO NOT expand shorthand here — that's the scanner's job)

**parseStateMd — failure modes:**
14. F1: malformed YAML-style frontmatter at top of STATE.md → parser ignores frontmatter, returns body fields
15. F2: file with ONLY `**Objective complete:**` and no in-flight → `{ objective_complete: [...] }` (objective field absent or null)
16. F3: huge file (10K lines) with no markers → `null`

**aggregateOrgByProductQuarter — happy paths:**
17. A1: 3 items each with distinct (product, quarter) → 3 buckets
18. A2: 2 items with same (product, quarter) → 1 bucket with 2 items
19. A3: 0 items → empty `{}`

**aggregateOrgByProductQuarter — edge cases:**
20. A4: item with `product: null, quarter: null` → goes to `Unknown.Unknown`
21. A5: item with product set, quarter null → goes to `<Product>.Unknown`
22. A6: items pre-sorted by title remain in input order within their bucket (stable grouping)

**buildStateMd factory — happy paths:**
23. B1: `buildStateMd({ objective: '2 — Test' })` → string contains `**Objective in flight:** 2 — Test`
24. B2: `buildStateMd({ trd: '02-01' })` → string contains `**Current TRD:** 02-01`
25. B3: `buildStateMd({ objective_complete: ['0 — A (verified)', '1 — B (verified)'] })` → string contains both lines

**buildGitFixtureRepo factory — happy paths (gated on `GIT_INTEGRATION=1` for actual git ops):**
26. G1: `buildGitFixtureRepo({ branches: [{ name: 'feature/foo', state_md: '...' }] })` returns `{ root, cleanup }`; `git -C root branch -a` includes `feature/foo`
27. G2: cleanup() removes the tmp dir

**buildOrgItem + buildSubIssue + buildOrgScanResult factories:**
28. O1: `buildOrgItem({})` returns minimal valid item shape
29. O2: `buildOrgScanResult({ items: [buildOrgItem(...), ...] })` returns shape compatible with `aggregateOrgByProductQuarter`

Total: 29 enumerated cases. Implement RED first (one test at a time), then GREEN (minimal impl), then REFACTOR if needed.

<tasks>

<task type="auto">
  <name>Task 1: Build awareness-fixtures.cjs scaffold (factory builders, no behavior tests yet)</name>
  <files>
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
Create the fixture-builder module FIRST per TDD Playbook habit 4 (fixture builders ahead of behavior tests).

Approach:
1. Module header (matches gh-fixtures.cjs style):
   - `'use strict';`
   - `// Hand-built fixture builders for awareness module tests.`
   - `// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.`

2. Implement these factories (signatures locked — TRDs 02-02, 02-03, 02-04, 02-07 will call them):

```js
// buildStateMd({ objective, trd, branch, github_issue, objective_complete }) => string
//   Constructs realistic STATE.md content. All params optional; output contains
//   ONLY the lines for params that are explicitly passed (no defaults beyond the
//   `# DevFlow State` header and a `## Current Position` section heading).
function buildStateMd({ objective, trd, branch, github_issue, objective_complete = [] } = {}) { ... }

// buildOrgItem({ issue_ref, title, body, product, quarter, status, sub_issues }) => object
//   Returns a minimal valid org-scan item: { item_type: 'issue', issue_ref, title,
//   body, product, quarter, status, sub_issues: [...] }. issue_ref defaults to a
//   literal placeholder 'AO-Cyber-Systems/test#1'.
function buildOrgItem({ issue_ref = 'AO-Cyber-Systems/test#1', title = 'Test item', body = '',
                        product = null, quarter = null, status = null, sub_issues = [] } = {}) { ... }

// buildSubIssue({ ref, title, state }) => object
//   Returns { ref, title, state }. ref default 'AO-Cyber-Systems/test#2'.
function buildSubIssue({ ref = 'AO-Cyber-Systems/test#2', title = 'Test sub-issue', state = 'OPEN' } = {}) { ... }

// buildOrgScanResult({ items, fetched_at, project_id, warnings }) => object
//   Returns the shape scanOrg emits: { items, fetched_at, project_id, warnings }.
function buildOrgScanResult({ items = [], fetched_at = new Date().toISOString(),
                              project_id = 'PVT_test', warnings = [] } = {}) { ... }

// buildGitFixtureRepo({ branches, dev_name }) => { root, cleanup, ranGit }
//   Spawns: tmp dir, `git init`, sets user.name=dev_name (default 'test-dev'),
//   creates initial commit on main with empty README, then for each branch:
//     - `git checkout -b <name>`
//     - writes branches[i].state_md to .planning/STATE.md
//     - `git add` + `git commit -m "test: branch state"`
//   Then `git checkout main`. Returns root path and cleanup function.
//   IMPORTANT: spawns git via require('child_process').spawnSync with timeout 5000.
//   If git fails (not installed), throws with message that tests can catch and skip.
function buildGitFixtureRepo({ branches = [], dev_name = 'test-dev' } = {}) { ... }
```

3. Add `module.exports = { buildStateMd, buildOrgItem, buildSubIssue, buildOrgScanResult, buildGitFixtureRepo };`

# CRITICAL: signatures are LOCKED — TRDs 02-02 / 02-03 / 02-04 / 02-07 call these. Don't rename or remove params after ship.
# GOTCHA: buildGitFixtureRepo creates fixtures in os.tmpdir() — cleanup() must rm -rf safely (try/catch around rmSync).
# PATTERN: Mirror gh-fixtures.cjs structure — section dividers + JSDoc on each factory.
  </action>
  <verify>
1. File exists: `ls plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs`
2. Module loads without throwing: `node -e 'require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); console.log("OK")'`
3. All 5 factories exported: `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); for (const k of ["buildStateMd","buildOrgItem","buildSubIssue","buildOrgScanResult","buildGitFixtureRepo"]) if (typeof f[k] !== "function") throw new Error(k); console.log("OK")'`
4. `buildStateMd({ objective: "2 — Test" })` returns a string containing `**Objective in flight:** 2 — Test`
  </verify>
  <done>
Fixture module exists, exports 5 factory functions, signatures match the doc above. No behavior tests yet — those land in Task 3 after the parser is written.
  </done>
  <recovery>
If `buildGitFixtureRepo` flakes on tmp-dir cleanup (e.g., Windows paths), wrap rmSync in try/catch. If git binary is unavailable in CI, the function should throw a clear error message; the test caller (Task 3 G1/G2) will use `t.skip()` when this happens.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Write awareness.test.cjs RED phase — failing tests for parseStateMd + aggregateOrgByProductQuarter</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.test.cjs
  </files>
  <action>
Write the FAILING test suite per RED phase. This task ENDS with `npm test` having ~29 failing test cases. Do NOT write awareness.cjs yet (Task 3).

Approach:
1. File header:
   ```js
   'use strict';
   const test = require('node:test');
   const assert = require('node:assert');
   const path = require('path');
   const fs = require('fs');
   const os = require('os');
   const {
     parseStateMd,
     aggregateOrgByProductQuarter,
     DEFAULT_TTL_MINUTES,
     DEFAULT_STALE_DAYS,
     DEFAULT_BRANCH_PATTERNS,
     AWARENESS_CACHE_REL,
   } = require('./awareness.cjs');  // Will fail at this require until Task 3 lands
   const {
     buildStateMd, buildOrgItem, buildSubIssue, buildOrgScanResult, buildGitFixtureRepo,
   } = require('./__fixtures__/awareness-fixtures.cjs');
   ```

2. Implement Group P (parseStateMd happy paths) — 6 tests, P1-P6 from test list.
3. Implement Group E (parseStateMd edge cases) — 7 tests, E1-E7.
4. Implement Group F (parseStateMd failure modes) — 3 tests, F1-F3.
5. Implement Group A (aggregateOrgByProductQuarter) — 6 tests, A1-A6.
6. Implement Group B (buildStateMd factory contract) — 3 tests, B1-B3.
7. Implement Group G (buildGitFixtureRepo) — 2 tests, G1-G2 — gated on `GIT_INTEGRATION=1` env var. When unset, call `t.skip("Set GIT_INTEGRATION=1 to run")`.
8. Implement Group O (buildOrgItem/buildOrgScanResult contracts) — 2 tests, O1-O2.

Test naming style (matches gh.test.cjs): `test('group X: short description', () => {...})` — single line per assertion when feasible; multiple `assert.deepStrictEqual` per test ONLY for closely-related cases.

# CRITICAL: Use REAL STATE.md content from this repo for P6.
#   Read .planning/STATE.md, copy a 30-line excerpt as a const at the top of the test file,
#   pass it to parseStateMd, assert all four fields populated.
# GOTCHA: For G1/G2 (buildGitFixtureRepo), wrap the entire test body in a try/catch that
#   skips on git-not-installed errors. Tests must NOT fail when git is unavailable.
# PATTERN: Test groups separated by section dividers `// ─── Group P: parseStateMd happy paths ──────────`

After writing the file, run `npm test`. Expected: ~29 new failing tests with messages like "parseStateMd is not a function" (because awareness.cjs doesn't exist yet).

Commit RED phase:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "test(02-01): add failing tests for STATE.md parser + aggregator + fixtures" \
  --files plugins/devflow/devflow/bin/lib/awareness.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
```
  </action>
  <verify>
1. Test file exists: `ls plugins/devflow/devflow/bin/lib/awareness.test.cjs`
2. `npm test` runs without crashing the runner (failures are EXPECTED — count them)
3. Count of new failing tests is 27-29 (G1+G2 may skip without GIT_INTEGRATION=1)
4. RED-phase commit lands: `git log --oneline -1 | grep -E '^[a-f0-9]+ test\(02-01\):'`
  </verify>
  <done>
Test file written with all 29 enumerated cases. `npm test` shows the new tests failing because awareness.cjs doesn't exist. RED-phase commit landed via df-tools.cjs commit (Conventional Commits, scope `02-01`).
  </done>
  <recovery>
If a test case CAN'T be expressed cleanly without the implementation existing (e.g., A6 which needs a working aggregator), comment out the assertion with `// TODO Task 3` and add a `t.skip("RED phase placeholder")` — Task 3 uncomments it during GREEN. Better: stub minimal awareness.cjs with `parseStateMd: () => null` and ALL tests fail predictably; remove the stub at start of Task 3.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Write awareness.cjs GREEN phase — minimal implementations to make tests pass</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.cjs
  </files>
  <action>
Write minimum viable `lib/awareness.cjs` to make the Task-2 tests pass. Iterate test-by-test if needed; commit GREEN once all 29 pass.

Approach:

1. Module header (mirrors gh.cjs style):
```js
'use strict';

/**
 * Cross-repo awareness scanner.
 *
 * Two-fold awareness layer: peer (git-branch state) + org (Product Roadmap project).
 * Storage: git is the source of truth for peer; obj 1's resolveChain primitives walk
 * org-side. No new shared store; pure read-side aggregation.
 *
 * Module growth across waves:
 *   TRD 02-01: parseStateMd, aggregateOrgByProductQuarter, constants  (THIS TRD)
 *   TRD 02-04: readCache, writeCache, isStale
 *   TRD 02-02: scanPeer, _setRunGit
 *   TRD 02-03: scanOrg (composes walkProject from gh.cjs)
 *   TRD 02-07: module.exports finalization + integration tests
 *
 * Iron Law: parseStateMd MUST be fault-tolerant — never throw on garbage input.
 */

const fs = require('fs');
const path = require('path');
```

2. Constants block:
```js
const DEFAULT_TTL_MINUTES = 10;
const DEFAULT_STALE_DAYS = 30;
const DEFAULT_BRANCH_PATTERNS = ['feature/*', 'df/*', 'fix/*', 'proposal/*'];
const AWARENESS_CACHE_REL = path.join('.planning', '.awareness-cache.json');
```

3. Implement `parseStateMd(content)`:
```js
function parseStateMd(content) {
  if (typeof content !== 'string') return null;
  if (content.trim().length < 10) return null; // E1, E2, F3-ish

  const result = { objective: null, trd: null, branch: null, github_issue: null, objective_complete: [] };

  // Objective (in-flight first, fall back to plain Objective:)
  let m = content.match(/\*\*Objective in flight:\*\*\s+([^\n]+)/i);
  if (!m) m = content.match(/\*\*Objective:\*\*\s+([^\n]+)/i);
  if (m) result.objective = m[1].trim();

  // TRD: accept NN-NN, N-N, NN-N, etc.
  m = content.match(/\*\*Current TRD:\*\*\s+(\d+(?:[-.]\d+)?)/i);
  if (m) result.trd = m[1];

  // Branch (backticks optional)
  m = content.match(/\*\*Branch:\*\*\s+`?([^`\n\s]+)`?/i);
  if (m) result.branch = m[1].trim();

  // github_issue — anywhere in body
  m = content.match(/github_issue:\s*([^\s\n]+)/i);
  if (m) result.github_issue = m[1].trim();

  // Objective complete (multiple) — return all matches as array
  const completeRe = /\*\*Objective complete:\*\*\s+([^\n]+)/gi;
  let cm;
  while ((cm = completeRe.exec(content)) !== null) {
    result.objective_complete.push(cm[1].trim());
  }

  // F2 / failure-mode guard: if NOTHING parsed, return null
  if (
    !result.objective && !result.trd && !result.branch &&
    !result.github_issue && result.objective_complete.length === 0
  ) {
    return null;
  }
  return result;
}
```

4. Implement `aggregateOrgByProductQuarter(items)`:
```js
function aggregateOrgByProductQuarter(items) {
  const out = {};
  for (const item of (items || [])) {
    const product = item.product || 'Unknown';
    const quarter = item.quarter || 'Unknown';
    if (!out[product]) out[product] = {};
    if (!out[product][quarter]) out[product][quarter] = [];
    out[product][quarter].push(item);
  }
  return out;
}
```

5. Module exports (PARTIAL — only this TRD's surface; later TRDs append):
```js
module.exports = {
  parseStateMd,
  aggregateOrgByProductQuarter,
  DEFAULT_TTL_MINUTES,
  DEFAULT_STALE_DAYS,
  DEFAULT_BRANCH_PATTERNS,
  AWARENESS_CACHE_REL,
};
```

6. Run `npm test`. All 27-29 new tests must pass (G1/G2 skip without GIT_INTEGRATION=1).

7. If any test fails, iterate the parser regex until that case passes. Common iteration points:
   - E5 (branch without backticks): regex needs `\`?...\`?` for optional backticks
   - E7 (shorthand `#11`): parser MUST NOT expand — return literal `#11`
   - F1 (frontmatter at top): parser ignores YAML frontmatter (don't strip; just match in body)
   - P5 (multiple `Objective complete:`): use `g` flag, return array

8. Commit GREEN phase:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-01): implement STATE.md parser + org aggregator" \
  --files plugins/devflow/devflow/bin/lib/awareness.cjs
```

# CRITICAL: parseStateMd MUST NEVER throw — wrap any risky regex in try/catch returning null.
# GOTCHA: The 'github_issue' field can match in YAML frontmatter (e.g. `github_issue: "#11"`); strip surrounding quotes? NO — the test E7 asserts the literal `#11`. Don't post-process.
# PATTERN: Match obj 1's gh.cjs section dividers (`// ─── Section ───`) so future waves can append cleanly.
  </action>
  <verify>
1. `npm test` passes ALL the new tests added in Task 2 (27-29 depending on GIT_INTEGRATION env)
2. No existing tests broken: full test suite is now `prev_count + 27..29` passing
3. GREEN-phase commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-01\):'`
4. Module surface matches frontmatter exports: `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/awareness.cjs"); for (const k of ["parseStateMd","aggregateOrgByProductQuarter","DEFAULT_TTL_MINUTES","DEFAULT_STALE_DAYS","DEFAULT_BRANCH_PATTERNS","AWARENESS_CACHE_REL"]) if (a[k] === undefined) throw new Error(k); console.log("OK")'`
  </verify>
  <done>
`lib/awareness.cjs` exists with parseStateMd + aggregateOrgByProductQuarter + 4 constants. All Task-2 tests pass. GREEN-phase commit landed (Conventional Commits, scope `02-01`).
  </done>
  <recovery>
If a test refuses to pass after 3 regex iterations, capture the failing input verbatim, check whether the test case is correct (re-read the test list), and if the test IS correct but the regex genuinely can't handle it cleanly, switch to a small split-and-search strategy (split content by `\n`, scan for line prefixes). Don't add more regex complexity than needed for THIS TRD.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After all tasks ship:

1. `lib/awareness.cjs` loads without error and exports the documented surface
2. `lib/awareness.test.cjs` passes 27-29 tests (G1/G2 skip when `GIT_INTEGRATION` unset)
3. `lib/__fixtures__/awareness-fixtures.cjs` exports 5 factory functions
4. Two atomic commits in git history with prefix `test(02-01):` then `feat(02-01):` (RED then GREEN per TDD Playbook)
5. `npm test` total count rises by 27-29
6. SC-2 truth verifiable: parseStateMd returns null on malformed input (run `node -e` test cases manually if needed)
</verification>

<success_criteria>
- SC-2 partial coverage: parseStateMd is fault-tolerant (returns null on malformed/missing input; never throws)
- Foundation laid for downstream waves: TRDs 02-02, 02-03, 02-04, 02-07 can `require` the new module + fixtures
- Test list (29 cases) implemented per TDD Playbook habit 2 (test list first)
- Hand-built fixture builders committed before any behavior test (TDD Playbook habit 4 — fixture builders ahead of behavior tests)
- 2 atomic commits per TDD Playbook (test: → feat:)
</success_criteria>

<output>
After completion, create `.planning/objectives/02-cross-repo-awareness-layer/02-01-state-md-parser-and-fixtures-SUMMARY.md`
</output>
