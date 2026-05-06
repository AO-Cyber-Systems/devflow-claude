---
objective: 22-workflow-impediment-fixes
trd: 02
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/project-hygiene.cjs
  - plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - HYGIENE-CHECK-CLI
  - HYGIENE-MISFILED-DETECTION
  - HYGIENE-JSON-CONTRACT
user_setup: []

must_haves:
  truths:
    - "df-tools project-hygiene check returns JSON listing all objectives whose parent_issue or github_issue resolves to a different repo than PROJECT.md github_repo"
    - "Empty objectives list when no misfiled candidates exist"
    - "Skipped: true with remediation warning when gh auth missing (graceful degradation per obj 3 pattern)"
    - "Reports objectives with missing parent_issue/github_issue as 'no_link' status (informational, not flagged)"
    - "Detects archived: true frontmatter on PROJECT.md (informational tag in output, not an error)"
    - "JSON contract is stable: { ok, project_repo, objectives_scanned, misfiled: [], no_link: [], errors: [], skipped: bool, warnings: [] }"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs"
      provides: "scanForMisfiled() + cmdProjectHygieneCheck() + JSON output contract"
      contains: "function scanForMisfiled"
    - path: "plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs"
      provides: "Group 22B tests covering misfiling detection + JSON shape + degradation paths"
      contains: "scanForMisfiled"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'project-hygiene': router arm dispatching to lib/project-hygiene.cjs"
      contains: "case 'project-hygiene'"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs"
      to: "lib/org-awareness.cjs (_extractRepoFromRef + _detectMisfiling)"
      via: "require + delegate misfiling logic"
      pattern: "require\\('./org-awareness.cjs'\\)|_extractRepoFromRef|_detectMisfiling"
    - from: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs"
      to: "lib/gh.cjs (resolveChain)"
      via: "require + GhAuthError graceful catch"
      pattern: "require\\('./gh.cjs'\\)|resolveChain|GhAuthError"
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "cmdProjectHygieneCheck"
      via: "case 'project-hygiene': arm subcommand dispatch"
      pattern: "case 'project-hygiene'"
---

<objective>
Add `df-tools project-hygiene check` CLI returning structured JSON listing objectives in the current repo whose `parent_issue` or `github_issue` resolves to a DIFFERENT repo than PROJECT.md's `github_repo` (misfiled candidates). Read-only; never mutates anything.

Purpose: Surface misfiled-objective candidates explicitly so users can see drift accumulating, before it becomes painful to fix. Ground truth for the move CLI in 22-03.

Output: `lib/project-hygiene.cjs` module with `scanForMisfiled()` + `cmdProjectHygieneCheck()`. CLI surface `df-tools project-hygiene check` returns JSON.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── lib/
│   ├── project-hygiene.cjs        ← CREATE (scanForMisfiled + cmdProjectHygieneCheck)
│   └── project-hygiene.test.cjs   ← CREATE (Group 22B tests)
└── df-tools.cjs                   ← MODIFY (add case 'project-hygiene':)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
## Existing misfiling detection (org-awareness.cjs lines 826-837) — REUSE

```js
function _detectMisfiling(chain, projectCtx) {
  if (!projectCtx || !projectCtx.github_repo) return null;
  if (!chain || !chain.roadmap_issue) return null;
  const resolvedRepo = _extractRepoFromRef(chain.roadmap_issue);
  if (!resolvedRepo) return null;
  if (resolvedRepo === projectCtx.github_repo) return null;
  return {
    current_repo: projectCtx.github_repo,
    resolved_repo: resolvedRepo,
    message: `this objective's resolved [Roadmap] is in '${resolvedRepo}' but current repo is '${projectCtx.github_repo}'. Possible misfile — consider whether this objective belongs in '${resolvedRepo}' instead.`,
  };
}
```

**Key insight:** `_detectMisfiling` operates on a SINGLE objective's resolved chain. To scan ALL objectives in a repo, iterate `.planning/objectives/*/OBJECTIVE.md`, call `resolveChain` on each, then `_detectMisfiling` per result.

## Existing repo extraction (org-awareness.cjs lines 806-814) — REUSE

```js
function _extractRepoFromRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const cleaned = ref.replace(/^https?:\/\/github\.com\//, '');
  const idx = cleaned.indexOf('#');
  if (idx <= 0) return null;
  return cleaned.slice(0, idx);
}
```

Recognizes: `owner/repo#NN`, `https://github.com/owner/repo/issues/NN`. Returns null for shorthand `#NN`.

## Existing GhAuthError graceful pattern (org-awareness.cjs scanOrgOverlap, decided in TRD 03-03)

```js
try {
  const items = aw.scanOrg({ ... });
  // ... process items
} catch (e) {
  if (e instanceof gh.GhAuthError) {
    return { items: [], warnings: [`gh auth missing: ${e.message}. Run: ${e.remediation}`], skipped: true };
  }
  throw e;
}
```

`project-hygiene check` MUST follow this pattern: if `resolveChain` throws GhAuthError, return `{ skipped: true, warnings: [...] }` instead of crashing.

## Existing case-arm router pattern (df-tools.cjs `case 'org-awareness':`)

```js
case 'org-awareness': {
  const subcommand = args[1];
  if (subcommand === 'scan-siblings') { /* ... */ }
  else if (subcommand === 'scan-libs') { /* ... */ }
  else if (subcommand === 'scan-org-overlap') { /* ... */ }
  else if (subcommand === 'considerations') { /* ... */ }
  else { error('Unknown org-awareness subcommand. Available: ...'); }
  break;
}
```

This TRD adds `case 'project-hygiene':` with `subcommand === 'check'` arm. TRDs 22-03 and 22-04 add `move` and `archive` arms in Wave 2.

## Existing PROJECT.md frontmatter parse pattern (gh.cjs)

```js
const { extractFrontmatter } = require('./frontmatter.cjs');
const projectMd = fs.readFileSync(path.join(cwd, '.planning', 'PROJECT.md'), 'utf-8');
const projectCtx = extractFrontmatter(projectMd);
// projectCtx is the parsed object directly (NOT { frontmatter, body })
```
</codebase_examples>

<anti_patterns>
- DO NOT duplicate `_extractRepoFromRef` or `_detectMisfiling` — `require('./org-awareness.cjs')` and call them.
- DO NOT crash on missing PROJECT.md `github_repo` — return `{ ok: true, misfiled: [], reason: 'github_repo absent' }` (legacy projects support).
- DO NOT crash on missing OBJECTIVE.md frontmatter — skip that objective, add a warning.
- DO NOT call `gh` CLI for every objective sequentially — `resolveChain` has per-process in-memory cache; first call per (repo, issue) is the slow one, repeats are free.
- DO NOT include archived objectives (e.g., `.planning/milestones/v1.X-objectives/*`) in scan — only scan `.planning/objectives/*`.
- DO NOT auto-execute moves or write any files — `check` is READ-ONLY.
</anti_patterns>

<error_recovery>
### Recovery: GhAuthError graceful degradation

```js
try {
  const chain = gh.resolveChain(frontmatter, projectCtx);
  // ... call _detectMisfiling
} catch (e) {
  if (e instanceof gh.GhAuthError) {
    result.skipped = true;
    result.warnings.push(`gh auth missing — misfiling check skipped. ${e.remediation || 'Run: gh auth refresh'}`);
    return result;
  }
  throw e;
}
```

### Recovery: ENOENT on .planning/objectives/

```js
let objectiveDirs = [];
try {
  objectiveDirs = fs.readdirSync(path.join(cwd, '.planning', 'objectives'), { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name);
} catch (e) {
  if (e.code === 'ENOENT') return { ok: true, ...empty, warnings: ['.planning/objectives/ not found'] };
  throw e;
}
```

### Recovery: malformed OBJECTIVE.md frontmatter

```js
let frontmatter;
try {
  frontmatter = extractFrontmatter(fs.readFileSync(objectivePath, 'utf-8'));
} catch (e) {
  result.errors.push({ objective: dir, error: `frontmatter parse failed: ${e.message}` });
  continue;
}
```

extractFrontmatter is permissive — typical failure is the file being unreadable, not malformed frontmatter (which returns empty/partial object).
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/22-workflow-impediment-fixes/22-CONTEXT.md
@.planning/objectives/22-workflow-impediment-fixes/22-RESEARCH.md
</context>

<research_context>
- Established pattern: `lib/<concern>.cjs` exports both internal helpers (`_funcName`) and `cmdX` command functions consumed by df-tools.cjs router.
- `lib/gh.cjs` exports `resolveChain` and `GhAuthError`. `lib/org-awareness.cjs` exports `_extractRepoFromRef` and `_detectMisfiling` (per the module.exports in lines 1115-1135 — VERIFY at execution time and add to exports if missing).
- JSON contract for `check` output:
  ```json
  {
    "ok": true,
    "project_repo": "AO-Cyber-Systems/devflow-claude",
    "project_archived": false,
    "objectives_scanned": 22,
    "misfiled": [
      { "objective": "07-something", "directory": ".planning/objectives/07-something", "current_repo": "AO-Cyber-Systems/devflow-claude", "resolved_repo": "AO-Cyber-Systems/aodex-go", "via": "parent_issue", "ref": "AO-Cyber-Systems/aodex-go#42" }
    ],
    "no_link": [
      { "objective": "00-something", "directory": ".planning/objectives/00-something", "reason": "no parent_issue or github_issue in frontmatter" }
    ],
    "errors": [
      { "objective": "bad-dir", "error": "frontmatter parse failed: ..." }
    ],
    "skipped": false,
    "warnings": []
  }
  ```
- Subprocess test pattern not strictly required (project-hygiene.cjs's check command can be tested in-process by directly calling `scanForMisfiled` if it's exported — only `cmdProjectHygieneCheck` calls `output()` which exits). Prefer in-process unit tests for speed.
</research_context>

<gotchas>
- **G7 (research):** GhAuthError graceful degradation REQUIRED. Default exit code 0 even on skip; warnings communicate the issue.
- **G8 (research):** Missing `github_repo` in PROJECT.md → `{ ok: true, misfiled: [], reason: 'github_repo absent in PROJECT.md' }`. NOT an error.
- **`_detectMisfiling` checks `chain.roadmap_issue` only** — NOT `parent_issue` or `github_issue`. The hygiene check is BROADER: scan parent_issue AND github_issue refs directly (don't rely solely on the resolved roadmap_issue), because some objectives may have parent_issue pointing to a different repo without a roadmap chain. Implementation note: extract repo from BOTH `frontmatter.parent_issue` and `frontmatter.github_issue`; if EITHER differs from PROJECT.md github_repo, flag the objective. The `via` field records which one triggered ("parent_issue" or "github_issue").
- **archived: true** in PROJECT.md frontmatter — the `check` output includes `project_archived: true|false` so callers (the archive CLI in 22-04) can short-circuit. Not an error condition.
- **Scan only current objectives** — exclude `.planning/milestones/v*-objectives/*` (archived). Only `.planning/objectives/*` (current) gets scanned.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing test list for project-hygiene check</name>
  <files>plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs</files>
  <action>
Create new test file `plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs`. Test list (write BEFORE implementation per TDD playbook habit 2):

22B1 — `scanForMisfiled({ cwd })` with empty .planning/objectives/ returns `{ ok: true, project_repo: <X>, objectives_scanned: 0, misfiled: [], no_link: [], errors: [], skipped: false, warnings: [] }`
22B2 — `scanForMisfiled({ cwd })` with one objective whose parent_issue is `<other-org/other-repo>#42` and PROJECT.md github_repo is `<own-org/own-repo>` returns `misfiled: [{ objective, directory, current_repo, resolved_repo, via: 'parent_issue', ref }]`
22B3 — `scanForMisfiled({ cwd })` with one objective whose parent_issue is `<own-org/own-repo>#42` (matches PROJECT.md github_repo) returns `misfiled: []` (no flag — not misfiled)
22B4 — `scanForMisfiled({ cwd })` with one objective whose github_issue is `<other-org/other-repo>#15` and parent_issue absent returns `misfiled: [{ ..., via: 'github_issue', ref }]`
22B5 — `scanForMisfiled({ cwd })` with one objective WITHOUT parent_issue or github_issue returns `no_link: [{ objective, directory, reason }]`, `misfiled: []`
22B6 — `scanForMisfiled({ cwd })` with one objective frontmatter that fails to parse (corrupt file) returns `errors: [{ objective, error }]`, `misfiled: []`
22B7 — `scanForMisfiled({ cwd })` with PROJECT.md missing `github_repo` field returns `{ ok: true, misfiled: [], reason: 'github_repo absent in PROJECT.md', warnings: [] }`
22B8 — `scanForMisfiled({ cwd })` with `.planning/objectives/` directory absent returns `{ ok: true, objectives_scanned: 0, ...empty, warnings: ['.planning/objectives/ not found'] }`
22B9 — `scanForMisfiled({ cwd })` with PROJECT.md frontmatter `archived: true` returns `project_archived: true` AND continues to scan objectives (not a short-circuit)
22B10 — `scanForMisfiled({ cwd })` with `parent_issue: '#9'` (shorthand, no repo) returns `no_link` (NOT misfiled — repo extraction returns null per `_extractRepoFromRef` contract)
22B11 — `scanForMisfiled({ cwd })` with multiple objectives — 2 misfiled, 1 matching, 1 no_link — returns each in correct bucket; objectives_scanned = 4
22B12 — `scanForMisfiled({ cwd })` with mocked `gh.resolveChain` throwing `GhAuthError` continues to scan via raw frontmatter inspection (parent_issue/github_issue extraction does NOT depend on gh CLI — it's pure string parsing). Misfiling detection by direct ref extraction succeeds. Output should NOT have `skipped: true` for this case (auth-free path works fine).
22B13 — `cmdProjectHygieneCheck(cwd, raw=true)` writes JSON.stringify of scanForMisfiled output to stdout and exits 0 (subprocess test via execSync `node df-tools.cjs project-hygiene check`)
22B14 — `cmdProjectHygieneCheck(cwd, raw=false)` writes JSON.stringify pretty-printed (2-space indent) and exits 0
22B15 — End-to-end: `df-tools project-hygiene` (no subcommand) errors with stderr containing "Unknown project-hygiene subcommand" and exits non-zero
22B16 — End-to-end: `df-tools project-hygiene unknown-sub` errors similarly
22B17 — Excludes archived milestone dirs: build a fixture with both `.planning/objectives/01-foo/OBJECTIVE.md` AND `.planning/milestones/v1.0-objectives/02-bar/OBJECTIVE.md`. Verify `objectives_scanned === 1` (only current scanned).

Implementation tips:
- Use hand-built fixture builder (TDD playbook habit 4). NO LLM-generated test data.

```js
function buildHygieneFixture({ projectFm = { github_repo: 'AO-Cyber-Systems/devflow-claude' }, objectives = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-hygiene-test-'));
  fs.mkdirSync(path.join(dir, '.planning', 'objectives'), { recursive: true });
  // Write PROJECT.md from projectFm (or skip if projectFm === null)
  if (projectFm !== null) {
    const fmYaml = Object.entries(projectFm).map(([k, v]) => `${k}: ${v}`).join('\n');
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), `---\n${fmYaml}\n---\n# Project\n`);
  }
  // Write objectives
  for (const [name, frontmatter] of Object.entries(objectives)) {
    const objDir = path.join(dir, '.planning', 'objectives', name);
    fs.mkdirSync(objDir, { recursive: true });
    if (frontmatter === null) {
      // Corrupt-frontmatter case: write malformed yaml between --- markers
      fs.writeFileSync(path.join(objDir, 'OBJECTIVE.md'), '---\n: : :\nbad yaml\n---\n');
    } else if (frontmatter === '__missing__') {
      // No OBJECTIVE.md at all
    } else {
      const fmYaml = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join('\n');
      fs.writeFileSync(path.join(objDir, 'OBJECTIVE.md'), `---\n${fmYaml}\n---\n# Objective ${name}\n`);
    }
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
```

- For 22B11: build fixture with 4 objectives in one shot.
- For 22B17: extend builder with `archivedObjectives: { '02-bar': { ... } }` option that writes to `.planning/milestones/v1.0-objectives/02-bar/`.
- Subprocess tests (22B13-22B17) use `execSync` with df-tools.cjs path resolution.

# CRITICAL: Test list documented BEFORE writing test code (TDD playbook habit 2). Single commit: `test(22-02): add failing tests for project-hygiene check (Group 22B)`.
# GOTCHA: 22B12 requires `_setRunGh` mock from gh.cjs — verify the export exists. If not exported, this is an existing-codebase issue beyond TRD scope; skip 22B12 and document.
# PATTERN: `test('22B1 — description', () => { ... })` mirrors existing test naming convention.
  </action>
  <verify>
`npm test -- --test-name-pattern='22B'` shows 17 tests; ALL fail (or 16 + 1 skip if 22B12 dependency missing). Failures must be expected ("Cannot find module './project-hygiene.cjs'" or "function not defined") — NOT syntax errors.
  </verify>
  <done>
17 Group 22B tests added to `plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs`. All 17 fail with expected RED-state errors (module-missing or function-undefined). Single atomic commit: `test(22-02): add failing tests for project-hygiene check (Group 22B)`.
  </done>
  <recovery>
If a test fails with a syntax error rather than expected RED-state error, fix the syntax. If a test passes unexpectedly, the test is missing its assertion — audit before proceeding.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement project-hygiene.cjs + scanForMisfiled + cmdProjectHygieneCheck + df-tools router</name>
  <files>plugins/devflow/devflow/bin/lib/project-hygiene.cjs,plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Implement the minimum production code to turn Group 22B tests GREEN.

**Stage 2a: Create `plugins/devflow/devflow/bin/lib/project-hygiene.cjs`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const orgaw = require('./org-awareness.cjs');
const gh = require('./gh.cjs');

/**
 * Scan current repo's .planning/objectives/* for misfiled candidates.
 *
 * Misfiled = objective's parent_issue OR github_issue resolves to a different
 * github_repo than PROJECT.md's github_repo. Pure ref-extraction (no gh CLI
 * call required for the primary detection path).
 *
 * Read-only — never writes anything.
 *
 * @param {{ cwd?: string }} opts
 * @returns {{
 *   ok: boolean,
 *   project_repo: string|null,
 *   project_archived: boolean,
 *   objectives_scanned: number,
 *   misfiled: Array<{objective: string, directory: string, current_repo: string, resolved_repo: string, via: string, ref: string}>,
 *   no_link: Array<{objective: string, directory: string, reason: string}>,
 *   errors: Array<{objective: string, error: string}>,
 *   skipped: boolean,
 *   warnings: string[],
 *   reason?: string
 * }}
 */
function scanForMisfiled({ cwd = process.cwd() } = {}) {
  const result = {
    ok: true,
    project_repo: null,
    project_archived: false,
    objectives_scanned: 0,
    misfiled: [],
    no_link: [],
    errors: [],
    skipped: false,
    warnings: [],
  };

  // 1. Read PROJECT.md
  const projectMdPath = path.join(cwd, '.planning', 'PROJECT.md');
  let projectCtx = {};
  if (fs.existsSync(projectMdPath)) {
    try {
      projectCtx = extractFrontmatter(fs.readFileSync(projectMdPath, 'utf-8')) || {};
    } catch (e) {
      result.warnings.push(`PROJECT.md frontmatter parse failed: ${e.message}`);
    }
  }
  result.project_repo = projectCtx.github_repo || null;
  result.project_archived = projectCtx.archived === true || projectCtx.archived === 'true';

  if (!result.project_repo) {
    result.reason = 'github_repo absent in PROJECT.md';
    return result;
  }

  // 2. List current objectives (exclude archived milestones)
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  let dirs;
  try {
    dirs = fs.readdirSync(objectivesDir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch (e) {
    if (e.code === 'ENOENT') {
      result.warnings.push('.planning/objectives/ not found');
      return result;
    }
    throw e;
  }

  // 3. Scan each
  for (const dirName of dirs) {
    result.objectives_scanned++;
    const objMdPath = path.join(objectivesDir, dirName, 'OBJECTIVE.md');
    if (!fs.existsSync(objMdPath)) {
      result.no_link.push({
        objective: dirName,
        directory: path.join('.planning', 'objectives', dirName),
        reason: 'OBJECTIVE.md not found',
      });
      continue;
    }

    let frontmatter;
    try {
      frontmatter = extractFrontmatter(fs.readFileSync(objMdPath, 'utf-8')) || {};
    } catch (e) {
      result.errors.push({ objective: dirName, error: `frontmatter parse failed: ${e.message}` });
      continue;
    }

    // Check parent_issue first, then github_issue
    const flagged = _checkObjectiveRefs(dirName, frontmatter, result.project_repo);
    if (flagged === 'no_link') {
      result.no_link.push({
        objective: dirName,
        directory: path.join('.planning', 'objectives', dirName),
        reason: 'no parent_issue or github_issue in frontmatter (or only shorthand refs)',
      });
    } else if (flagged) {
      result.misfiled.push({
        objective: dirName,
        directory: path.join('.planning', 'objectives', dirName),
        current_repo: result.project_repo,
        ...flagged,
      });
    }
    // else: not misfiled, not no_link — refs match own repo. Don't add to any list.
  }

  return result;
}

/**
 * Internal: check single objective's frontmatter refs for misfiling.
 * Returns 'no_link' | { resolved_repo, via, ref } | null (matches own repo).
 */
function _checkObjectiveRefs(objectiveName, frontmatter, projectRepo) {
  const candidates = [
    { field: 'parent_issue', value: frontmatter.parent_issue },
    { field: 'github_issue', value: frontmatter.github_issue },
  ];

  let sawAnyRef = false;
  for (const { field, value } of candidates) {
    if (!value || typeof value !== 'string') continue;
    sawAnyRef = true;
    const repo = orgaw._extractRepoFromRef(value);
    if (!repo) continue; // shorthand or unparseable
    if (repo === projectRepo) return null; // matches — not misfiled
    return { resolved_repo: repo, via: field, ref: value };
  }

  return sawAnyRef ? 'no_link' : 'no_link';
  // ^ Both shorthand-only and absent-refs collapse to no_link
}

function cmdProjectHygieneCheck(cwd, raw) {
  const result = scanForMisfiled({ cwd });
  output(result, raw);
}

module.exports = {
  scanForMisfiled,
  cmdProjectHygieneCheck,
  _checkObjectiveRefs,
};
```

**Stage 2b: Wire df-tools.cjs router (`case 'project-hygiene':`)**

Add after `case 'org-awareness':` arm:

```js
case 'project-hygiene': {
  const subcommand = args[1];
  if (subcommand === 'check') {
    const { cmdProjectHygieneCheck } = require('./lib/project-hygiene.cjs');
    cmdProjectHygieneCheck(cwd, raw);
  } else if (!subcommand) {
    error('Unknown project-hygiene subcommand. Available: check (move and archive in 22-03/22-04)');
  } else {
    error(`Unknown project-hygiene subcommand: ${subcommand}. Available: check`);
  }
  break;
}
```

**Stage 2c: Verify org-awareness.cjs exports `_extractRepoFromRef`**

Inspect `module.exports` in `lib/org-awareness.cjs` (lines 1115-1135 area). If `_extractRepoFromRef` is NOT exported, add it. This is a TINY surgical export addition — not a refactor. Document in commit message: `also exports _extractRepoFromRef from org-awareness.cjs (needed by project-hygiene.cjs)`.

# CRITICAL: Run RED tests FIRST, confirm 17 fail. Then implement until ALL 17 PASS.
# GOTCHA: `_checkObjectiveRefs` collapses shorthand-only refs into `no_link` — confirmed by 22B10 test contract.
# GOTCHA: 22B12 (resolveChain throws GhAuthError) — current scanForMisfiled does NOT call resolveChain (pure ref extraction). 22B12 should PASS without any change because gh CLI is not invoked. If the test was written expecting resolveChain to be called, REVISE the test to assert "no skipped state, no warnings, scan completes via direct ref extraction" instead.
# PATTERN: Module exports both internal helpers (`_checkObjectiveRefs`) and public API (`scanForMisfiled`, `cmdProjectHygieneCheck`).
  </action>
  <verify>
`npm test -- --test-name-pattern='22B'` shows 17 tests; ALL pass. Full suite: `npm test 2>&1 | tail -5` shows 2168 (Wave 1 baseline) + 17 = 2185 pass with no regressions. Manual smoke: `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene check` returns valid JSON for current repo (devflow-claude — should report 0 misfiled).
  </verify>
  <done>
All 17 Group 22B tests pass. Full suite: 2185 pass; 0 new regressions. Single atomic commit: `feat(22-02): add lib/project-hygiene.cjs + project-hygiene check CLI`. Manual smoke run on current repo returns expected JSON shape.
  </done>
  <recovery>
If `org-awareness.cjs` doesn't export `_extractRepoFromRef`: add to `module.exports`. If `gh.cjs` doesn't export `GhAuthError` class: same — add to exports. Both are minor surgical additions. If broader refactor needed, defer the test relying on the dependency and document in SUMMARY.md as a known-limitation.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene check` returns valid JSON with `ok: true` on current repo
- JSON includes all required fields: `ok, project_repo, project_archived, objectives_scanned, misfiled, no_link, errors, skipped, warnings`
- `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene` (no subcommand) exits non-zero with stderr "Unknown project-hygiene subcommand"
- `npm test` shows 2185 tests passing (2168 Wave 1 baseline + 17 Group 22B)
</verification>

<success_criteria>
- `lib/project-hygiene.cjs` created with `scanForMisfiled` + `cmdProjectHygieneCheck` exports
- `df-tools project-hygiene check` returns stable JSON contract documented in TRD
- Misfiling detected via DIRECT ref extraction (no gh CLI required for primary path) — fast, auth-free
- Graceful handling of: missing PROJECT.md, missing github_repo, missing .planning/objectives, malformed OBJECTIVE.md frontmatter, shorthand-only refs
- Excludes archived milestone objectives from scan
- 2168 baseline tests preserved + 17 new Group 22B tests pass
- 1 atomic commit per TDD cycle (test + feat = 2 commits total)
</success_criteria>

<output>
After completion, create `.planning/objectives/22-workflow-impediment-fixes/22-02-hygiene-check-SUMMARY.md` documenting: tests added (17), production module created (`lib/project-hygiene.cjs`), CLI surface added (`df-tools project-hygiene check`), exports modified (potentially `_extractRepoFromRef` from org-awareness.cjs), commits made (2), test count delta (+17), regressions (0).
</output>
