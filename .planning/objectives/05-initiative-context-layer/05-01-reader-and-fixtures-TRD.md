---
objective: 05-initiative-context-layer
trd: 05-01
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/initiatives.cjs
  - plugins/devflow/devflow/bin/lib/initiatives.test.cjs
  - plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
  - plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - SC-4
  - SC-6
must_haves:
  truths:
    - "loadInitiatives reads ~/.claude/devflow/initiatives/*.md and returns a parsed list"
    - "loadInitiatives returns empty array silently when home dir is missing"
    - "matchByRepo filters initiatives whose key_repos contains the supplied github_repo"
    - "formatInitiativeForPlanner emits markdown bounded by MAX_FORMATTED_PLANNER_CHARS"
    - "df-tools initiatives list enumerates slug + github_issue + key_repos"
    - "df-tools initiatives show <slug> prints the initiative file body"
    - "df-tools initiatives sync exits 1 with stub message (filled by 05-02)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/initiatives.cjs"
      provides: "Reader + token-budget primitives + injection hooks + constants"
      contains: "loadInitiatives"
    - path: "plugins/devflow/devflow/bin/lib/initiatives.test.cjs"
      provides: "Reader test suite (Groups L/M/F/P/CLI)"
      contains: "describe"
    - path: "plugins/devflow/devflow/bin/lib/initiatives-cli.cjs"
      provides: "CLI subcommand router (list + show wired; sync stub for 05-02)"
      contains: "cmdInitiativesRoute"
    - path: "plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs"
      provides: "CLI router test suite"
      contains: "describe"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "buildInitiativeFile + buildInitiativeYaml + buildInitiativesHomeTree builders"
      contains: "buildInitiativeFile"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'initiatives': arm dispatching to cmdInitiativesRoute"
      contains: "case 'initiatives'"
  key_links:
    - from: "lib/initiatives.cjs"
      to: "lib/frontmatter.cjs::extractFrontmatter"
      via: "_parseInitiativeFile"
      pattern: "extractFrontmatter\\("
    - from: "lib/initiatives-cli.cjs"
      to: "lib/initiatives.cjs::loadInitiatives"
      via: "cmdInitiativesList"
      pattern: "loadInitiatives\\("
    - from: "df-tools.cjs"
      to: "lib/initiatives-cli.cjs::cmdInitiativesRoute"
      via: "case 'initiatives':"
      pattern: "cmdInitiativesRoute"
---

<objective>
Establish the foundation for `lib/initiatives.cjs`: the reader path (loadInitiatives + matchByRepo + formatInitiativeForPlanner), the token-budget primitives, injection hooks (`_setRunFs`, `_setRunGh`), constants, and the CLI router scaffold (`cmdInitiativesRoute` with list + show wired; sync as a stub that exits 1 with a "filled by TRD 05-02" message). Also extends `__fixtures__/awareness-fixtures.cjs` with three new hand-built builders.

Purpose: SC-4 (reader exports), SC-6 (CLI list/show sides). The writer side (sync) is filled by TRD 05-02; stale deletion by 05-03; planner integration by 05-04; export-lock + integration by 05-05. This TRD MUST NOT include any `gh` calls — reader is offline-only.
Output: `lib/initiatives.cjs` (skeleton + reader region), `lib/initiatives-cli.cjs` (router with list + show), test suites, fixture builders, df-tools.cjs router arm.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── initiatives.cjs                            ← CREATE (skeleton + reader region)
├── initiatives.test.cjs                       ← CREATE (reader tests)
├── initiatives-cli.cjs                        ← CREATE (CLI router; sync stub)
├── initiatives-cli.test.cjs                   ← CREATE (CLI router tests)
└── __fixtures__/
    └── awareness-fixtures.cjs                 ← MODIFY (add 3 builders)

plugins/devflow/devflow/bin/
└── df-tools.cjs                               ← MODIFY (add case 'initiatives')
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Single-module-multi-wave growth pattern (proven in obj 2/3/4):**

```js
// lib/awareness.cjs (top of file — TRD 02-01)
'use strict';

/**
 * Cross-repo awareness scanner.
 *
 * Module growth across waves:
 *   TRD 02-01: parseStateMd, aggregateOrgByProductQuarter, constants  (THIS TRD)
 *   TRD 02-04: readCache, writeCache, isStale
 *   TRD 02-02: scanPeer, _setRunGit
 *   TRD 02-03: scanOrg (composes walkProject from gh.cjs)
 *   TRD 02-07: module.exports finalization + integration tests
 */

const fs = require('fs');
const path = require('path');

// ─── TRD 02-01: constants ─────────────────────────────────────────────────────
const DEFAULT_TTL_MINUTES = 10;
// ...
```

Mirror this exactly. Header comment block, "Module growth across waves" annotation, "─── TRD NN-NN: <region> ───" banner comments demarcating regions.

**`_setRunFs` injection pattern (from `lib/org-awareness.cjs` TRD 03-01):**

```js
// All production fs calls go through _runFs.X() — never fs.X() directly.
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

For TRD 05-01, restrict realFs to `readFileSync`, `readdirSync`, `existsSync`, `statSync`. Write methods (writeFileSync, mkdirSync, renameSync, unlinkSync) are added by TRD 05-02 and 05-03.

**`_setRunGh` re-export pattern (from `lib/org-awareness.cjs` TRD 03-03):**

```js
const gh = require('./gh.cjs');
// Re-export gh's _setRunGh so obj 5 tests can mock walkProject's underlying gh calls
const _setRunGh = gh._setRunGh;
```

Or alternatively, store a function alias:
```js
function _setRunGh(fn) { return gh._setRunGh(fn); }
```

Use the function alias form (matches obj 4 pattern at `lib/dup-detect.cjs`).

**CLI router stub-then-fill pattern (from `lib/dup-detect-cli.cjs` TRD 04-01):**

```js
// TRD 04-01 ships: --mode plan/execute detection (wired to detectDuplicates).
// Stubs for resolve / log subcommands (filled by TRD 04-02).

function cmdDupDetectResolve(...) {
  process.stderr.write(JSON.stringify({ error: 'not yet implemented (TRD 04-02)' }, null, 2) + '\n');
  process.exit(1);
}
```

For TRD 05-01: wire `cmdInitiativesList` and `cmdInitiativesShow` for real; stub `cmdInitiativesSync` with the same exit-1 pattern. TRD 05-02 replaces the sync stub.

**Fixture builder pattern (from `__fixtures__/awareness-fixtures.cjs` TRD 02-01 + 03-01):**

```js
function buildOrgItem({
  issue_ref = 'AO-Cyber-Systems/example#1',
  title = 'Test item',
  body = '',
  product = 'DevFlow',
  quarter = 'Q2 2026',
  status = 'In Progress',
  sub_issues = [],
} = {}) {
  return { item_type: issue_ref ? 'issue' : 'draft', issue_ref, title, body, product, quarter, status, sub_issues };
}
```

Build new fixtures the same way: locked default values, single-options-arg signature, returns plain objects.

**Tmpdir-based home fixture (from buildSiblingRepoTree, TRD 03-01):**

```js
function buildSiblingRepoTree({
  tmpdir,
  ...
} = {}) {
  if (!tmpdir) throw new Error('buildSiblingRepoTree: tmpdir is required');
  // create dirs + files under tmpdir
  return { tmpdir, paths: [...] };
}
```

For `buildInitiativesHomeTree`: same shape — caller provides tmpdir (typically `fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-'))`), builder creates files, returns home path + list of slugs.
</codebase_examples>

<anti_patterns>
- **DO NOT** call `gh` from any reader-side function. The reader path is OFFLINE-ONLY per CONTEXT.md decision #3.
- **DO NOT** add `writeFileSync` / `mkdirSync` / `renameSync` / `unlinkSync` to `realFs` in this TRD. Those land in 05-02 / 05-03 — adding them here violates region ownership.
- **DO NOT** implement `syncInitiatives`, `_writeInitiativeFile`, `_qualifiesAsInitiative`, `_slugifyInitiativeTitle`, `_renderInitiativeMarkdown`, `_detectStaleInitiatives` in this TRD. Region-owned by 05-02/05-03.
- **DO NOT** use `faker` or LLM-generated test data. All fixtures hand-built per `no_llm_test_data` constraint.
- **DO NOT** include property-based tests (`fast-check`, `quickcheck`-style). Enumerated cases only per `no_property_based_default`.
- **DO NOT** include Gherkin/BDD syntax. Descriptive `t.test('returns empty array when home dir missing', ...)` names per `no_gherkin_layer`.
- **DO NOT** add a `module.exports` with the FULL surface in this TRD. Only export symbols introduced HERE; full surface lock is TRD 05-05.
- **DO NOT** include a banner comment claiming "LOCKED by TRD 05-05" on the partial export. That marker triggers obj 5 export-lock tests prematurely. Use a comment like `// Partial exports — finalized in TRD 05-05`.
</anti_patterns>

<error_recovery>
- **`fs.readFileSync` throws ENOENT for missing initiative file:** caught by `_parseInitiativeFile`; returns null. `loadInitiatives` filters out nulls before returning the array.
- **YAML frontmatter malformed:** `extractFrontmatter` returns `null` (per obj 1 + obj 3 confirmed behavior). `_parseInitiativeFile` returns null on null frontmatter; `loadInitiatives` writes a single warning to stderr (`Skipping malformed initiative file: <slug>.md`) and continues.
- **Home dir does not exist:** `_runFs.existsSync(home) === false` → return `[]` silently. NO warning, NO error. (Matches obj 3's `scanSiblings` graceful-empty pattern.)
- **`os.homedir()` fails (rare):** Node's `os.homedir()` doesn't throw; returns `null` on uninitialized env. Guard: `defaultInitiativesHome()` returns null-safe path; `loadInitiatives({ home: null })` is treated as "missing dir" and returns `[]`.
- **CLI `list` invoked when home dir missing:** `cmdInitiativesList` should still emit valid JSON (`[]`) to stdout + exit 0. Mirror obj 3's `cmdOrgAwarenessSiblingScan` graceful empty.
- **CLI `show <slug>` invoked for non-existent slug:** `cmdInitiativesShow` writes `{"error": "initiative not found: <slug>", "available": [...]}` to stderr + exit 1.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@.planning/objectives/05-initiative-context-layer/05-CONTEXT.md

# Reference patterns from already-shipped objectives
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
@plugins/devflow/devflow/bin/lib/dup-detect.cjs
@plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
@plugins/devflow/devflow/bin/lib/frontmatter.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
</context>

<research_context>
From `.planning/research/cross-session-coordination.md` §"Initiative context layer":

> Initiatives are the strategic-context layer the planner currently lacks. They map 1:1 to **GitHub Epics** (the parent issues from `github-coordination-layer.md`'s issue hierarchy). The disk projection lives at `~/.claude/devflow/initiatives/` (or under each repo's `.planning/initiatives/` if scoped to one repo) and is editable by hand.

CONTEXT.md decision #1 LOCKS the global path (NOT per-repo). The reader implementation MUST default to `os.homedir() + '/.claude/devflow/initiatives'`.

From the same research §"How the planner consumes it":

> Initiatives are never required — an objective without one still plans fine. They're additive context.

This is why `loadInitiatives` returns `[]` (not error) on missing home dir. The reader gracefully degrades; the planner sees no initiatives and proceeds.
</research_context>

<gotchas>
- **`extractFrontmatter` API confirmed (obj 3 TRD 03-01):** Returns the parsed object directly, NOT `{ frontmatter, body }`. Body is the rest of the file after the YAML. To get body separately, slice the input by the `---` markers manually OR add a body-extraction helper. CONTEXT.md recommends a private helper:
  ```js
  function _extractFrontmatterAndBody(content) {
    const fm = extractFrontmatter(content);
    if (!fm) return { frontmatter: null, body: content };
    // The frontmatter is bounded by --- ... ---; body is everything after the second ---.
    const parts = content.split(/^---\s*$/m);
    const body = parts.length >= 3 ? parts.slice(2).join('---').replace(/^\n+/, '') : '';
    return { frontmatter: fm, body };
  }
  ```
- **CLI stub-and-fill pattern requires a test that ASSERTS the stub behavior** in TRD 05-01, then 05-02 UPDATES that test to assert real behavior (per obj 3 TRD 03-02 deviation pattern). Don't leave the stub untested.
- **`os.homedir()` portability:** On macOS/Linux returns `/Users/<name>` or `/home/<name>`. On Windows returns `C:\Users\<name>`. Use `path.join(os.homedir(), '.claude', 'devflow', 'initiatives')` — NEVER hard-code `/`. The `INITIATIVES_HOME_REL` constant uses `path.join(...)` so the OS separator resolves correctly.
- **`_setRunGh` re-export:** Obj 5 tests do NOT need to mock `gh.runGh` for the reader path (no gh calls). But the EXPORT must be present for SC-8 surface-lock test in TRD 05-05. Export it now as a function alias, even though no reader test exercises it.
- **`output()` in helpers.cjs calls process.exit(0):** Tests for `cmdInitiativesList` / `cmdInitiativesShow` must use the `subprocess test pattern` (per obj 2 TRD 02-06): `execSync('node df-tools.cjs initiatives list ...')` + `JSON.parse(stdout)`. In-process IO capture won't work because `output()` exits.
- **Fixture builder ordering:** When extending `awareness-fixtures.cjs`, add new builders at the end of the file (do NOT inject mid-file). Update `module.exports` block at bottom; mirror existing alphabetical-ish convention but new entries can append.
</gotchas>

## Test list

Hand-built test cases written FIRST (test:add commit), then implementation (feat: commit). Test groups:

### Group L — loadInitiatives

- **L1**: `loadInitiatives({ home })` returns `[]` when home dir does not exist. NO warnings emitted.
- **L2**: `loadInitiatives({ home })` returns `[]` when home is empty (zero `.md` files).
- **L3**: `loadInitiatives({ home })` reads two well-formed initiative files and returns 2 initiatives in array, each with parsed frontmatter (slug, github_issue, parent_project, key_repos, updated_at) + body sections (why, open_questions, sub_issues, status).
- **L4**: `loadInitiatives({ home })` ignores non-`.md` files (e.g., `README`, `.DS_Store`).
- **L5**: `loadInitiatives({ home })` skips a malformed-frontmatter file with stderr warning, returns the well-formed siblings. Verify warning text contains the offending slug.
- **L6**: `loadInitiatives({ home })` defaults `home` to `defaultInitiativesHome()` when omitted (uses `os.homedir() + '/.claude/devflow/initiatives'`).
- **L7**: `loadInitiatives({ home })` is fault-tolerant: a file that fails to read (permission denied via mocked `_runFs.readFileSync`) is silently skipped + warning logged.

### Group M — matchByRepo

- **M1**: `matchByRepo(initiatives, github_repo)` returns initiatives whose `key_repos` array contains `github_repo` (exact match).
- **M2**: `matchByRepo([], github_repo)` returns `[]` (empty input).
- **M3**: `matchByRepo(initiatives, null)` returns `[]` (null repo).
- **M4**: `matchByRepo(initiatives, github_repo)` is case-sensitive (`AO-Cyber-Systems/devflow` ≠ `ao-cyber-systems/devflow`). Document but do not normalize — matches `github_repo` field convention.
- **M5**: `matchByRepo(initiatives, github_repo)` returns multiple matches when `github_repo` appears in multiple initiatives' key_repos.

### Group F — formatInitiativeForPlanner

- **F1**: `formatInitiativeForPlanner(initiative)` returns markdown including `# <Title>` heading + `## Why` section.
- **F2**: Output ≤ MAX_FORMATTED_PLANNER_CHARS (1500). Test with a long-Why initiative (5000 chars input) — output ≤ 1500.
- **F3**: Output drops `## Status` section entirely (per CONTEXT.md decision #8).
- **F4**: Output truncates Why to first paragraph (~500 chars max).
- **F5**: Output lists at most 5 sub-issues; longer lists are truncated with `…and N more` line.
- **F6**: Output contains the slug + github_issue ref so the planner can cross-reference.
- **F7**: Empty Why / Open Questions sections render gracefully (no orphan headers).

### Group P — _parseInitiativeFile

- **P1**: Parses well-formed file with all 4 body sections; returns `{ frontmatter, body, why, open_questions, sub_issues, status }`.
- **P2**: Returns `null` on missing/malformed frontmatter.
- **P3**: Body sections in any order are correctly extracted (regex anchored on `^## Why`, `^## Open Questions`, etc.).
- **P4**: Missing body section returns null/empty for that field, not the whole result.
- **P5**: Sub-issues bullet parser handles both checkbox and non-checkbox bullets.

### Group T — _truncateWhy

- **T1**: Returns input unchanged when ≤ MAX_WHY_CHARS (default 1500).
- **T2**: Truncates at last paragraph break ≤ MAX_WHY_CHARS, appends `…`.
- **T3**: Falls back to hard truncation when no paragraph break exists.
- **T4**: Custom `max` argument overrides default.

### Group CLI — initiatives-cli.cjs

- **CLI1**: `df-tools initiatives list` (subprocess) emits valid JSON array of `{slug, github_issue, key_repos}` to stdout + exit 0.
- **CLI2**: `df-tools initiatives list --home <tmpdir>` reads from supplied home (test injection path).
- **CLI3**: `df-tools initiatives list` returns `[]` (valid empty JSON) when home dir missing.
- **CLI4**: `df-tools initiatives show <slug>` (subprocess) emits the rendered initiative file body to stdout + exit 0.
- **CLI5**: `df-tools initiatives show <missing-slug>` writes `{"error": "..."}` to stderr + exit 1.
- **CLI6**: `df-tools initiatives sync` is a STUB in TRD 05-01: emits `{"error": "not yet implemented (TRD 05-02)"}` to stderr + exit 1. (Replaced by 05-02.)
- **CLI7**: `df-tools initiatives <unknown-subcommand>` writes usage error + exit 1.
- **CLI8**: `df-tools initiatives` (no subcommand) writes usage error listing valid subcommands + exit 1.

### Group I — Integration with df-tools.cjs router

- **I1**: `df-tools initiatives list` routes through `case 'initiatives':` arm (subprocess test).
- **I2**: Other case arms (`gh`, `awareness`, `org-awareness`, `dup-detect`) still work — no regression. Run a quick `df-tools awareness scan-peer --no-fetch` smoke test.

<tasks>

<task type="auto">
  <name>Task 1: Add 3 fixture builders to awareness-fixtures.cjs (RED-prep)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs</files>
  <action>
Extend `awareness-fixtures.cjs` with 3 new hand-built builders. These MUST land BEFORE writing test code (TDD Playbook habit 4: fixture generators not LLM-generated test data).

Add at end of file (before module.exports):

```js
// ─── TRD 05-01: Initiative file fixture builders ──────────────────────────────

/**
 * Build a complete initiative file content string (frontmatter + body sections).
 * Locked schema per CONTEXT.md decision #2.
 *
 * @param {object} opts
 * @param {string} opts.slug              - lowercased-hyphenated slug
 * @param {string} opts.github_issue      - issue ref (owner/repo#NN)
 * @param {string} opts.parent_project    - org Project node id (or null)
 * @param {string[]} opts.key_repos       - array of github_repo strings
 * @param {string} opts.title             - human title (rendered as # Heading)
 * @param {string} opts.why               - Why section body (markdown)
 * @param {string[]} opts.open_questions  - bullet items (without leading "- ")
 * @param {Array<{ref,title,state}>} opts.sub_issues - sub-issue entries
 * @param {string} opts.status            - GitHub state label (OPEN/CLOSED)
 * @param {string} opts.project_status    - Project Status field (e.g., "In Progress")
 * @param {string} opts.quarter           - Project Quarter field
 * @param {string} opts.updated_at        - ISO-8601 timestamp
 * @returns {string} - full markdown file content
 */
function buildInitiativeFile({
  slug = 'test-initiative',
  github_issue = 'AO-Cyber-Systems/devflow#30',
  parent_project = 'AO-Cyber-Systems/PVT_kwDODwqLrc4BRsOP',
  key_repos = ['AO-Cyber-Systems/devflow', 'AO-Cyber-Systems/devflow-claude'],
  title = 'Test Initiative',
  why = 'This initiative exists to test the initiative reader.',
  open_questions = ['Question 1?', 'Question 2?'],
  sub_issues = [
    { ref: 'AO-Cyber-Systems/devflow-claude#9', title: 'DevFlow Coordination Layer', state: 'OPEN' },
  ],
  status = 'OPEN',
  project_status = 'In Progress',
  quarter = 'Q2 2026',
  updated_at = '2026-05-05T18:30:00Z',
} = {}) {
  const lines = [];
  lines.push('---');
  lines.push(`slug: ${slug}`);
  lines.push(`github_issue: ${github_issue}`);
  lines.push(`parent_project: ${parent_project}`);
  lines.push('key_repos:');
  for (const r of key_repos) lines.push(`  - ${r}`);
  lines.push(`updated_at: ${updated_at}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${title}`);
  lines.push('');
  lines.push('## Why');
  lines.push('');
  lines.push(why);
  lines.push('');
  lines.push('## Open Questions');
  lines.push('');
  for (const q of open_questions) lines.push(`- ${q}`);
  lines.push('');
  lines.push('## Linked Sub-issues');
  lines.push('');
  for (const si of sub_issues) lines.push(`- ${si.ref} — ${si.title} (${si.state})`);
  lines.push('');
  lines.push('## Status');
  lines.push('');
  lines.push(`- **GitHub:** ${status}`);
  lines.push(`- **Project status:** ${project_status}`);
  lines.push(`- **Quarter:** ${quarter}`);
  lines.push(`- **Updated:** ${updated_at}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Build just the frontmatter portion (for round-trip parse tests).
 * @param {object} opts - subset of buildInitiativeFile opts
 * @returns {string} - YAML frontmatter (with --- markers)
 */
function buildInitiativeYaml({
  slug = 'test-initiative',
  github_issue = 'AO-Cyber-Systems/devflow#30',
  parent_project = 'AO-Cyber-Systems/PVT_kwDODwqLrc4BRsOP',
  key_repos = ['AO-Cyber-Systems/devflow'],
  updated_at = '2026-05-05T18:30:00Z',
} = {}) {
  const lines = ['---'];
  lines.push(`slug: ${slug}`);
  lines.push(`github_issue: ${github_issue}`);
  lines.push(`parent_project: ${parent_project}`);
  lines.push('key_repos:');
  for (const r of key_repos) lines.push(`  - ${r}`);
  lines.push(`updated_at: ${updated_at}`);
  lines.push('---');
  return lines.join('\n');
}

/**
 * Write a fixture initiative-projection home dir with multiple <slug>.md files.
 * Mirror of buildSiblingRepoTree pattern but for initiative files.
 *
 * @param {object} opts
 * @param {string} opts.tmpdir   - REQUIRED — base dir to write files under
 * @param {Array<object>} opts.files - array of buildInitiativeFile opts (each one becomes one file)
 * @returns {{ home: string, slugs: string[] }}
 */
function buildInitiativesHomeTree({ tmpdir, files = [] } = {}) {
  const fs = require('fs');
  const path = require('path');
  if (!tmpdir) throw new Error('buildInitiativesHomeTree: tmpdir is required');
  if (!fs.existsSync(tmpdir)) fs.mkdirSync(tmpdir, { recursive: true });
  const slugs = [];
  for (const fileOpts of files) {
    const content = buildInitiativeFile(fileOpts);
    const slug = fileOpts.slug || 'test-initiative';
    fs.writeFileSync(path.join(tmpdir, `${slug}.md`), content, 'utf-8');
    slugs.push(slug);
  }
  return { home: tmpdir, slugs };
}
```

Update the `module.exports` block at the bottom of `awareness-fixtures.cjs` to include 3 new entries: `buildInitiativeFile`, `buildInitiativeYaml`, `buildInitiativesHomeTree`.

# CRITICAL: Do NOT use faker, do NOT generate test data with LLM. All defaults are hand-chosen and represent realistic but minimal valid initiative state.
# PATTERN: Mirror buildSiblingRepoTree's tmpdir-required + return-shape contract.
  </action>
  <verify>
node -e "const f = require('./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs'); const md = f.buildInitiativeFile({slug: 'foo'}); console.log(md.split('\\n').length); console.log(md.includes('## Why')); console.log(typeof f.buildInitiativesHomeTree);"
# Expected: prints number of lines (>15), prints "true", prints "function".
  </verify>
  <done>
3 new builders present in awareness-fixtures.cjs, exported from module.exports, each callable with no args (returns valid output via locked defaults). No regression — existing builders still work.
  </done>
  <recovery>
If the file becomes corrupted: `git checkout -- plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` to reset. Re-run task with the diff cleanly applied. The 3 new builders are append-only — no risk to existing code.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Write reader test suite + CLI test scaffold (RED)</name>
  <files>
plugins/devflow/devflow/bin/lib/initiatives.test.cjs
plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
  </files>
  <action>
Create `initiatives.test.cjs` with the test groups L/M/F/P/T (loadInitiatives, matchByRepo, formatInitiativeForPlanner, _parseInitiativeFile, _truncateWhy) per the Test list above. Create `initiatives-cli.test.cjs` with Group CLI + Group I (subprocess tests for list/show/sync-stub/router).

Test framework: Node native test runner (`node:test`) — matches existing pattern (`org-awareness.test.cjs`, `dup-detect.test.cjs`).

Test file scaffold for `initiatives.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('./__fixtures__/awareness-fixtures.cjs');

// MUST require the module under test
const init = require('./initiatives.cjs');

// ─── Helper: tmpdir lifecycle ────────────────────────────────────────────────
function mkTmp(prefix = 'df-init-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ─── Group L — loadInitiatives ───────────────────────────────────────────────

test('L1: loadInitiatives returns [] when home dir missing', () => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'does-not-exist');
  const result = init.loadInitiatives({ home });
  assert.deepStrictEqual(result, []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('L2: loadInitiatives returns [] when home is empty', () => {
  const home = mkTmp();
  const result = init.loadInitiatives({ home });
  assert.deepStrictEqual(result, []);
  fs.rmSync(home, { recursive: true, force: true });
});

test('L3: loadInitiatives reads 2 well-formed files', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [
      { slug: 'alpha', title: 'Alpha Initiative' },
      { slug: 'beta', title: 'Beta Initiative' },
    ],
  });
  const result = init.loadInitiatives({ home });
  assert.strictEqual(result.length, 2);
  const slugs = result.map(r => r.slug).sort();
  assert.deepStrictEqual(slugs, ['alpha', 'beta']);
  // Each entry has the locked frontmatter fields
  for (const r of result) {
    assert.ok(r.github_issue, 'github_issue present');
    assert.ok(Array.isArray(r.key_repos), 'key_repos array');
    assert.ok(r.parent_project, 'parent_project present');
    assert.ok(r.updated_at, 'updated_at present');
  }
  fs.rmSync(home, { recursive: true, force: true });
});

// ... continue L4-L7, M1-M5, F1-F7, P1-P5, T1-T4 per the Test list above.
```

Each test name MUST start with the Group ID (`L1:`, `M2:`, etc.) per obj 4 + obj 3 convention. Tests are RED: they will fail until Task 3 implements the module.

For `initiatives-cli.test.cjs`: subprocess test pattern (since `output()` calls `process.exit`):

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('./__fixtures__/awareness-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// ─── Group CLI — list / show / sync-stub ─────────────────────────────────────

test('CLI1: df-tools initiatives list emits JSON array to stdout (exit 0)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-cli-'));
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'alpha' }, { slug: 'beta' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.ok(Array.isArray(parsed));
  assert.strictEqual(parsed.length, 2);
  fs.rmSync(home, { recursive: true, force: true });
});

// ... continue CLI2-CLI8, I1-I2 per the Test list above.
```

# CRITICAL: All tests must be ENUMERATED — no property-based tests, no faker. Hand-built scenarios only.
# GOTCHA: When testing the sync stub (CLI6), assert it exits 1 with the specific error message — NOT zero — so 05-02 can flip the assertion.
# PATTERN: Subprocess tests for CLI handlers; in-process tests for pure logic. Mirror obj 4 dup-detect.test.cjs structure.
  </action>
  <verify>
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test -- --test-name-pattern="initiatives" 2>&1 | tail -30
# Expected: tests RUN (not skipped) but FAIL because initiatives.cjs doesn't exist yet (Cannot find module).
# This is the RED state. Commit as: test(05-01): add failing reader + CLI tests for initiatives
  </verify>
  <done>
- initiatives.test.cjs exists with 7+5+7+5+4 = 28 named tests (L1-L7, M1-M5, F1-F7, P1-P5, T1-T4)
- initiatives-cli.test.cjs exists with 8+2 = 10 named tests (CLI1-CLI8, I1-I2)
- All tests fail with "Cannot find module './initiatives.cjs'" or similar (RED state)
- Test commit landed: `test(05-01): add failing reader + CLI tests for initiatives`
  </done>
  <recovery>
If tests don't fail correctly (e.g., they pass against a stale module): delete any pre-existing `initiatives.cjs`/`initiatives-cli.cjs` first. If test syntax errors block execution: run `node -c plugins/devflow/devflow/bin/lib/initiatives.test.cjs` to confirm parse-only correctness; fix syntax then re-run.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Implement reader + CLI scaffold (GREEN)</name>
  <files>
plugins/devflow/devflow/bin/lib/initiatives.cjs
plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
Create `lib/initiatives.cjs` with the reader region (loadInitiatives, matchByRepo, formatInitiativeForPlanner, _parseInitiativeFile, _truncateWhy, constants, injection hooks). Create `lib/initiatives-cli.cjs` with the router (list + show wired; sync as stub). Add `case 'initiatives':` arm to `df-tools.cjs`.

Approach for `initiatives.cjs`:

```js
'use strict';

/**
 * Initiative context layer — disk projection of GitHub Epics for planner-time strategic context.
 *
 * Disk projection at ~/.claude/devflow/initiatives/<slug>.md (global, NOT per-repo).
 * Plan-time reader is offline — never calls gh. Sync-time writer (TRD 05-02) is the SINGLE writer.
 *
 * Module growth across waves:
 *   TRD 05-01: skeleton + reader (loadInitiatives, matchByRepo, formatInitiativeForPlanner)
 *              + token-budget primitives + injection hooks + CLI list/show     (THIS TRD)
 *   TRD 05-02: writer (syncInitiatives, _writeInitiativeFile, qualification, sync CLI)
 *   TRD 05-03: stale-deletion (_detectStaleInitiatives, _deleteStaleFile, --force)
 *   TRD 05-05: module.exports finalization + integration tests + token-budget enforcement
 *
 * Iron Law: reader path NEVER calls gh; NEVER throws on missing home.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractFrontmatter } = require('./frontmatter.cjs');
const gh = require('./gh.cjs');

// ─── TRD 05-01: Constants ─────────────────────────────────────────────────────

const INITIATIVES_HOME_REL = path.join('.claude', 'devflow', 'initiatives');
const MAX_WHY_CHARS = 1500;
const MAX_QUESTIONS_BULLETS = 7;
const MAX_SUBISSUES_LINES = 15;
const MAX_FORMATTED_PLANNER_CHARS = 1500;
const MAX_PLANNER_FORMAT_WHY = 500;     // narrower than MAX_WHY_CHARS for planner format
const MAX_PLANNER_FORMAT_SUBISSUES = 5;

function defaultInitiativesHome() {
  const home = os.homedir();
  if (!home) return null;
  return path.join(home, INITIATIVES_HOME_REL);
}

// ─── TRD 05-01: Injection hooks ───────────────────────────────────────────────
// All production fs reads route through _runFs.X() — never fs.X() directly.
// Write methods added by TRD 05-02; readline added by TRD 05-03.

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }

// Re-export gh._setRunGh as a function alias so obj 5 tests can mock walkProject
// transitively. Reader path doesn't use it; included for SC-8 surface lock.
function _setRunGh(fn) { return gh._setRunGh(fn); }

function _resetMocks() {
  _runFs = realFs;
  gh._setRunGh(null);
}

// ─── TRD 05-01: _truncateWhy + helpers ────────────────────────────────────────

function _truncateWhy(text, max = MAX_WHY_CHARS) {
  if (typeof text !== 'string') return '';
  if (text.length <= max) return text;
  // Try paragraph break first
  const truncated = text.slice(0, max);
  const lastBreak = truncated.lastIndexOf('\n\n');
  if (lastBreak > max * 0.5) {
    return truncated.slice(0, lastBreak).trimEnd() + '\n\n…';
  }
  return truncated.trimEnd() + '…';
}

// ─── TRD 05-01: _parseInitiativeFile ──────────────────────────────────────────

function _extractBody(content) {
  // Frontmatter is bounded by --- ... ---; body is everything after the second ---.
  const parts = content.split(/^---\s*$/m);
  if (parts.length < 3) return '';
  return parts.slice(2).join('---').replace(/^\n+/, '');
}

function _extractSection(body, header) {
  // Extract ## Header section — captures lines until next "^## " or end.
  const re = new RegExp(`^## ${header}\\s*$([\\s\\S]*?)(?=^## |\\z)`, 'm');
  const m = body.match(re);
  if (!m) return '';
  return m[1].trim();
}

function _parseSubIssuesSection(text) {
  // Lines like: "- AO-Cyber-Systems/devflow-claude#9 — DevFlow Coordination Layer (OPEN)"
  // Or: "- [ ] #50 — Title"
  const out = [];
  if (!text) return out;
  const lines = text.split('\n');
  const re = /^[-*]\s+(?:\[[ xX]\]\s+)?(\S+#\d+)\s*[—\-:]\s*(.+?)\s*\(([A-Z]+)\)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) out.push({ ref: m[1], title: m[2].trim(), state: m[3] });
  }
  return out;
}

function _parseQuestionsSection(text) {
  if (!text) return [];
  const out = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^[-*]\s+(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

function _parseInitiativeFile(content) {
  if (typeof content !== 'string' || content.trim().length < 10) return null;
  const fm = extractFrontmatter(content);
  if (!fm || !fm.slug) return null;
  const body = _extractBody(content);
  return {
    slug: fm.slug,
    github_issue: fm.github_issue || null,
    parent_project: fm.parent_project || null,
    key_repos: Array.isArray(fm.key_repos) ? fm.key_repos : [],
    updated_at: fm.updated_at || null,
    body,
    why: _extractSection(body, 'Why'),
    open_questions: _parseQuestionsSection(_extractSection(body, 'Open Questions')),
    sub_issues: _parseSubIssuesSection(_extractSection(body, 'Linked Sub-issues')),
    status: _extractSection(body, 'Status'),
  };
}

// ─── TRD 05-01: loadInitiatives ───────────────────────────────────────────────

function loadInitiatives({ home } = {}) {
  const resolved = home || defaultInitiativesHome();
  if (!resolved || !_runFs.existsSync(resolved)) return [];
  let entries;
  try {
    entries = _runFs.readdirSync(resolved);
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(resolved, entry);
    let content;
    try {
      content = _runFs.readFileSync(filePath, 'utf-8');
    } catch {
      process.stderr.write(`initiatives: skipping unreadable file: ${entry}\n`);
      continue;
    }
    const parsed = _parseInitiativeFile(content);
    if (!parsed) {
      process.stderr.write(`initiatives: skipping malformed initiative file: ${entry}\n`);
      continue;
    }
    out.push(parsed);
  }
  return out;
}

// ─── TRD 05-01: matchByRepo ───────────────────────────────────────────────────

function matchByRepo(initiatives, github_repo) {
  if (!Array.isArray(initiatives) || initiatives.length === 0) return [];
  if (!github_repo || typeof github_repo !== 'string') return [];
  return initiatives.filter(i => Array.isArray(i.key_repos) && i.key_repos.includes(github_repo));
}

// ─── TRD 05-01: formatInitiativeForPlanner ───────────────────────────────────

function formatInitiativeForPlanner(initiative, opts = {}) {
  if (!initiative) return '';
  const lines = [];
  lines.push(`### ${initiative.slug}`);
  if (initiative.github_issue) lines.push(`*Tracks: ${initiative.github_issue}*`);
  lines.push('');
  if (initiative.why) {
    lines.push('**Why:**');
    // First paragraph only
    const firstPara = initiative.why.split('\n\n')[0] || '';
    lines.push(_truncateWhy(firstPara, MAX_PLANNER_FORMAT_WHY));
    lines.push('');
  }
  if (initiative.open_questions && initiative.open_questions.length > 0) {
    lines.push('**Open questions:**');
    for (const q of initiative.open_questions.slice(0, MAX_QUESTIONS_BULLETS)) {
      lines.push(`- ${q}`);
    }
    lines.push('');
  }
  if (initiative.sub_issues && initiative.sub_issues.length > 0) {
    lines.push('**Linked sub-issues:**');
    const shown = initiative.sub_issues.slice(0, MAX_PLANNER_FORMAT_SUBISSUES);
    for (const si of shown) {
      lines.push(`- ${si.ref} — ${si.title} (${si.state})`);
    }
    const more = initiative.sub_issues.length - shown.length;
    if (more > 0) lines.push(`- …and ${more} more`);
  }
  let result = lines.join('\n').trim();
  // Hard-cap at MAX_FORMATTED_PLANNER_CHARS
  if (result.length > MAX_FORMATTED_PLANNER_CHARS) {
    result = result.slice(0, MAX_FORMATTED_PLANNER_CHARS - 1) + '…';
  }
  return result;
}

// ─── Partial exports — finalized in TRD 05-05 ─────────────────────────────────

module.exports = {
  // Reader (TRD 05-01):
  loadInitiatives,
  matchByRepo,
  formatInitiativeForPlanner,
  _parseInitiativeFile,
  _truncateWhy,

  // Test hooks:
  _setRunFs,
  _setRunGh,
  _resetMocks,

  // Constants:
  INITIATIVES_HOME_REL,
  MAX_WHY_CHARS,
  MAX_QUESTIONS_BULLETS,
  MAX_SUBISSUES_LINES,
  MAX_FORMATTED_PLANNER_CHARS,
  defaultInitiativesHome,
};
```

For `initiatives-cli.cjs`:

```js
'use strict';

/**
 * CLI subcommand router for `df-tools initiatives <subcommand>`.
 *
 * TRD 05-01: list + show wired; sync stub returns exit-1 with "filled by TRD 05-02".
 * TRD 05-02: replaces sync stub with real implementation.
 * TRD 05-03: adds --force flag handling.
 */

const init = require('./initiatives.cjs');
const { output } = require('./helpers.cjs');

function _parseFlags(args) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--home' || a === '--initiative' || a === '--project-id') {
      flags[a.slice(2)] = args[i + 1];
      i += 2;
    } else if (a === '--raw' || a === '--force') {
      flags[a.slice(2)] = true;
      i++;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
      i++;
    } else {
      positional.push(a);
      i++;
    }
  }
  return { flags, positional };
}

function cmdInitiativesList(cwd, args) {
  const { flags } = _parseFlags(args);
  const home = flags.home || init.defaultInitiativesHome();
  const initiatives = init.loadInitiatives({ home });
  const summary = initiatives.map(i => ({
    slug: i.slug,
    github_issue: i.github_issue,
    key_repos: i.key_repos,
    updated_at: i.updated_at,
  }));
  output(summary, flags.raw, JSON.stringify(summary, null, 2));
}

function cmdInitiativesShow(cwd, args) {
  const { flags, positional } = _parseFlags(args);
  const slug = positional[0];
  if (!slug) {
    process.stderr.write(JSON.stringify({ error: 'Usage: initiatives show <slug>' }) + '\n');
    process.exit(1);
    return;
  }
  const home = flags.home || init.defaultInitiativesHome();
  const initiatives = init.loadInitiatives({ home });
  const found = initiatives.find(i => i.slug === slug);
  if (!found) {
    process.stderr.write(JSON.stringify({
      error: `initiative not found: ${slug}`,
      available: initiatives.map(i => i.slug),
    }) + '\n');
    process.exit(1);
    return;
  }
  if (flags.raw) {
    process.stdout.write(JSON.stringify(found, null, 2));
    process.exit(0);
    return;
  }
  // Human-readable: re-render from parsed data
  const lines = [];
  lines.push(`# ${found.slug}`);
  lines.push(`Tracks: ${found.github_issue}`);
  lines.push(`Key repos: ${(found.key_repos || []).join(', ')}`);
  lines.push('');
  if (found.why) { lines.push('## Why'); lines.push(''); lines.push(found.why); lines.push(''); }
  if (found.open_questions && found.open_questions.length > 0) {
    lines.push('## Open Questions');
    lines.push('');
    for (const q of found.open_questions) lines.push(`- ${q}`);
    lines.push('');
  }
  if (found.sub_issues && found.sub_issues.length > 0) {
    lines.push('## Linked Sub-issues');
    lines.push('');
    for (const si of found.sub_issues) lines.push(`- ${si.ref} — ${si.title} (${si.state})`);
    lines.push('');
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

function cmdInitiativesSync(cwd, args) {
  // TRD 05-01 stub — replaced by TRD 05-02
  process.stderr.write(JSON.stringify({
    error: 'not yet implemented (TRD 05-02)',
  }, null, 2) + '\n');
  process.exit(1);
}

function cmdInitiativesRoute(cwd, args) {
  const sub = args[0];
  if (!sub) {
    process.stderr.write(JSON.stringify({
      error: 'Usage: initiatives <sync|list|show>',
    }, null, 2) + '\n');
    process.exit(1);
    return;
  }
  switch (sub) {
    case 'list': return cmdInitiativesList(cwd, args.slice(1));
    case 'show': return cmdInitiativesShow(cwd, args.slice(1));
    case 'sync': return cmdInitiativesSync(cwd, args.slice(1));
    default:
      process.stderr.write(JSON.stringify({
        error: `Unknown initiatives subcommand: ${sub}. Available: sync, list, show`,
      }, null, 2) + '\n');
      process.exit(1);
  }
}

module.exports = {
  cmdInitiativesRoute,
  cmdInitiativesList,
  cmdInitiativesShow,
  cmdInitiativesSync,
};
```

For `df-tools.cjs`: insert the new case BEFORE the default arm (alongside other cases like `dup-detect`):

```js
case 'initiatives': {
  cmdInitiativesRoute(cwd, args.slice(1));
  break;
}
```

Add the require at the top of df-tools.cjs near other CLI imports:

```js
const { cmdInitiativesRoute } = require('./lib/initiatives-cli.cjs');
```

Run tests to confirm GREEN. RED→GREEN commit message: `feat(05-01): implement initiatives reader + CLI list/show`

# CRITICAL: Reader NEVER calls gh — `initiatives.cjs` requires gh ONLY for the `_setRunGh` re-export (no gh function calls in reader code paths).
# GOTCHA: `output()` from helpers.cjs calls `process.exit(0)`. CLI tests must subprocess; in-process test harness won't capture output.
# PATTERN: Mirror `lib/dup-detect-cli.cjs` argument parsing + router structure.
  </action>
  <verify>
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test 2>&1 | tail -20
# Expected: all initiatives.test.cjs + initiatives-cli.test.cjs tests PASS. Total test count delta: +38 (28 reader + 10 CLI).
# No regressions in existing tests (awareness, gh, dup-detect, org-awareness, etc.).
  </verify>
  <done>
- `lib/initiatives.cjs` exists with reader region, constants, injection hooks, partial module.exports
- `lib/initiatives-cli.cjs` exists with list + show wired and sync as a stub
- `df-tools.cjs` has `case 'initiatives':` arm and the require statement
- All 38 new tests PASS
- No regressions in existing test suite
- Implementation commit landed: `feat(05-01): implement initiatives reader + CLI list/show`
  </done>
  <recovery>
If tests fail with parse errors: `node -c lib/initiatives.cjs && node -c lib/initiatives-cli.cjs` to localize. If a single test fails, read the test name (e.g., F4) and the relevant section of `_parseInitiativeFile` / `formatInitiativeForPlanner`. If df-tools.cjs becomes unparseable: `git checkout -- plugins/devflow/devflow/bin/df-tools.cjs` and re-apply the case-arm change carefully.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test</test>
</validation_gates>

<verification>
After all tasks complete:

1. **Reader contract** — `loadInitiatives({ home })` returns `[]` on missing home; reads + parses well-formed files; skips malformed with stderr warning.
2. **matchByRepo + formatInitiativeForPlanner** — pure logic; SC-4 surface-side.
3. **CLI list/show** — subprocess tests pass; SC-6 reader-side.
4. **Sync stub** — exits 1 with "TRD 05-02" message; CLI6 test asserts this.
5. **Token-budget primitive** — `_truncateWhy` + format hard-caps at MAX_FORMATTED_PLANNER_CHARS; preliminary SC-10 (final assertion in 05-05 with multi-initiative composition).
6. **No gh calls in reader** — grep test or manual audit: `grep "_runGh\|gh\." lib/initiatives.cjs` must show only the re-export shim and the `require('./gh.cjs')` import.
7. **No regressions** — full `npm test` passes the 842/842 baseline + 38 new = 880/880 (allowing for skips).
</verification>

<success_criteria>
- [ ] `lib/initiatives.cjs` exists with reader region (loadInitiatives, matchByRepo, formatInitiativeForPlanner, _parseInitiativeFile, _truncateWhy, constants, injection hooks)
- [ ] `lib/initiatives-cli.cjs` exists with list + show wired; sync stub returns exit-1 with "TRD 05-02" message
- [ ] `df-tools.cjs` has `case 'initiatives':` arm
- [ ] `awareness-fixtures.cjs` has 3 new builders: buildInitiativeFile, buildInitiativeYaml, buildInitiativesHomeTree
- [ ] 38 new tests pass (Group L 7 + M 5 + F 7 + P 5 + T 4 + CLI 8 + I 2)
- [ ] No regressions: full npm test suite still green
- [ ] 2 atomic commits land: `test(05-01): ...` then `feat(05-01): ...`
- [ ] SC-4 partial (reader exports present); SC-6 partial (list + show wired)
</success_criteria>

<output>
After completion, create `.planning/objectives/05-initiative-context-layer/05-01-SUMMARY.md` documenting:
- Files created/modified
- Test groups + counts (8/5/7/5/4/8/2 = 39 tests)
- Locked behaviors confirmed (e.g., L1 graceful empty contract; F2 1500-char hard cap; CLI6 stub-and-fill pattern)
- Anything that deviated from the TRD plan + reason
- Pointers to where 05-02 picks up (writer region; sync CLI replacement)
</output>
