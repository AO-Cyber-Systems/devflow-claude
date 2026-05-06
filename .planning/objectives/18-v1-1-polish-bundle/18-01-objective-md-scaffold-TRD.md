---
objective: 18-v1-1-polish-bundle
trd: 18-01
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/project-bootstrap.cjs
  - plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs
  - .planning/objectives/01-github-coordination-layer/OBJECTIVE.md
  - .planning/objectives/02-cross-repo-awareness-layer/OBJECTIVE.md
  - .planning/objectives/03-planning-time-org-awareness/OBJECTIVE.md
  - .planning/objectives/04-duplicate-work-detection/OBJECTIVE.md
  - .planning/objectives/05-initiative-context-layer/OBJECTIVE.md
  - .planning/objectives/06-unified-check-todos/OBJECTIVE.md
  - .planning/objectives/07-handoff-watcher/OBJECTIVE.md
  - .planning/objectives/08-program-aware-tui/OBJECTIVE.md
  - .planning/objectives/09-roadmap-disk-reconciliation/OBJECTIVE.md
  - .planning/objectives/10-phase-e-agent-audit/OBJECTIVE.md
  - .planning/objectives/11-phase-d-verifier-wiring/OBJECTIVE.md
  - .planning/objectives/12-skill-consolidation/OBJECTIVE.md
  - .planning/objectives/13-phase-h-prompt-extraction/OBJECTIVE.md
  - .planning/objectives/14-phase-f-default-on-safety/OBJECTIVE.md
  - .planning/objectives/15-phase-a-routing-keystone/OBJECTIVE.md
  - .planning/objectives/16-phase-b-micro-skill/OBJECTIVE.md
  - .planning/objectives/17-phase-c-auto-init/OBJECTIVE.md
autonomous: true
requirements:
  - POLISH-OBJ-MD-SCAFFOLD
  - POLISH-OBJ-MD-BACKFILL

must_haves:
  truths:
    - "bootstrapObjectiveMd(cwd, objectiveId) writes a minimal OBJECTIVE.md when missing for that objective dir"
    - "bootstrapObjectiveMd is idempotent — second invocation returns { applied: false, reason: 'already exists' }"
    - "bootstrapObjectiveMd reads PROJECT.md default_work and uses it for the stub's `work` field; falls back to 'feature' when absent"
    - "bootstrapObjectiveMd extracts the goal sentence from ROADMAP.md '### Objective N: <name>' entry; falls back to placeholder when not found"
    - "bootstrapObjectiveMd returns { applied, added_fields, path, reason } shape mirroring bootstrapProjectMd"
    - "backfillAllObjectives walks .planning/objectives/*/ and calls bootstrapObjectiveMd per dir; returns { scanned, applied, skipped, errors }"
    - "After backfill runs against this repo, all objective directories 01-17 have an OBJECTIVE.md file (objective 0 already had one)"
    - "Backfilled OBJECTIVE.md files are not auto-committed — user folds them into next commit (mirrors bootstrapProjectMd contract)"
    - "All 1832 pre-existing tests still pass; new tests count ≥10 across O1-O10 in test list"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/project-bootstrap.cjs"
      provides: "bootstrapObjectiveMd + backfillAllObjectives functions exported"
      contains: "function bootstrapObjectiveMd"
    - path: "plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs"
      provides: "Tests for bootstrapObjectiveMd + backfillAllObjectives (≥10 cases)"
      contains: "bootstrapObjectiveMd"
    - path: ".planning/objectives/01-github-coordination-layer/OBJECTIVE.md"
      provides: "Backfilled stub for objective 1"
      contains: "work:"
    - path: ".planning/objectives/09-roadmap-disk-reconciliation/OBJECTIVE.md"
      provides: "Backfilled stub for objective 9"
      contains: "work:"
    - path: ".planning/objectives/17-phase-c-auto-init/OBJECTIVE.md"
      provides: "Backfilled stub for objective 17"
      contains: "work:"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/project-bootstrap.cjs::bootstrapObjectiveMd"
      to: "plugins/devflow/devflow/bin/lib/project-bootstrap.cjs::bootstrapProjectMd"
      via: "shared parsing helpers (extractFrontmatter, file IO patterns)"
      pattern: "function bootstrapObjectiveMd"
    - from: "plugins/devflow/devflow/bin/lib/project-bootstrap.cjs::backfillAllObjectives"
      to: "plugins/devflow/devflow/bin/lib/project-bootstrap.cjs::bootstrapObjectiveMd"
      via: "iteration over .planning/objectives/*"
      pattern: "backfillAllObjectives"
    - from: "module.exports"
      to: "bootstrapObjectiveMd, backfillAllObjectives"
      via: "named export in module.exports block"
      pattern: "bootstrapObjectiveMd"
---

<objective>
Extend `lib/project-bootstrap.cjs` with two new helpers — `bootstrapObjectiveMd(cwd, objectiveId)` and `backfillAllObjectives(cwd)` — and run the backfill against this repo to produce stub OBJECTIVE.md files for objectives 1-17.

Purpose: closes shelf-ware gap from v1.1 obj 1 — only objective 0 has a per-objective OBJECTIVE.md with GitHub coordination frontmatter. The other 17 objectives are missing this file entirely. The planner reads this file to resolve `work`, `overrides`, `github_issue`, etc., so without it the resolver falls back to PROJECT.md defaults and skips GH coordination.

Output: 2 new exported functions + ≥10 new test cases + 17 backfilled OBJECTIVE.md stub files. Single TDD TRD because the pattern is mechanical (mirror `bootstrapProjectMd`) but the behavior surface is wide enough to warrant an explicit test list (per CLAUDE.md TDD Playbook habit 2: "Test list first").
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── project-bootstrap.cjs           ← MODIFY (add bootstrapObjectiveMd, backfillAllObjectives, update module.exports)
└── project-bootstrap.test.cjs      ← MODIFY (add Group O — O1-O10 tests)

.planning/objectives/
├── 01-github-coordination-layer/OBJECTIVE.md     ← CREATE (backfill output)
├── 02-cross-repo-awareness-layer/OBJECTIVE.md    ← CREATE
├── 03-planning-time-org-awareness/OBJECTIVE.md   ← CREATE
├── 04-duplicate-work-detection/OBJECTIVE.md      ← CREATE
├── 05-initiative-context-layer/OBJECTIVE.md      ← CREATE
├── 06-unified-check-todos/OBJECTIVE.md           ← CREATE
├── 07-handoff-watcher/OBJECTIVE.md               ← CREATE
├── 08-program-aware-tui/OBJECTIVE.md             ← CREATE
├── 09-roadmap-disk-reconciliation/OBJECTIVE.md   ← CREATE
├── 10-phase-e-agent-audit/OBJECTIVE.md           ← CREATE
├── 11-phase-d-verifier-wiring/OBJECTIVE.md       ← CREATE
├── 12-skill-consolidation/OBJECTIVE.md           ← CREATE
├── 13-phase-h-prompt-extraction/OBJECTIVE.md     ← CREATE
├── 14-phase-f-default-on-safety/OBJECTIVE.md     ← CREATE
├── 15-phase-a-routing-keystone/OBJECTIVE.md      ← CREATE
├── 16-phase-b-micro-skill/OBJECTIVE.md           ← CREATE
└── 17-phase-c-auto-init/OBJECTIVE.md             ← CREATE
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>
**Existing pattern: `bootstrapProjectMd` in `lib/project-bootstrap.cjs` (locked surface):**

```js
function bootstrapProjectMd(cwd) {
  const projectMdPath = path.join(cwd, '.planning', 'PROJECT.md');

  if (!fs.existsSync(projectMdPath)) {
    return { applied: false, added_fields: [], path: null, reason: 'no PROJECT.md' };
  }

  const remoteUrl = _getRemoteUrl(cwd);
  if (!remoteUrl) {
    return { applied: false, added_fields: [], path: projectMdPath, reason: 'no git remote' };
  }
  // ... etc, idempotency check, write file, return shape
  return { applied: true, added_fields: addedFields, path: projectMdPath, reason: null };
}
```

**Mirror this shape exactly** for `bootstrapObjectiveMd`:

```js
function bootstrapObjectiveMd(cwd, objectiveId) {
  const objectiveDir = path.join(cwd, '.planning', 'objectives', objectiveId);
  if (!fs.existsSync(objectiveDir)) {
    return { applied: false, added_fields: [], path: null, reason: 'objective dir not found' };
  }
  const objectiveMdPath = path.join(objectiveDir, 'OBJECTIVE.md');
  if (fs.existsSync(objectiveMdPath)) {
    return { applied: false, added_fields: [], path: objectiveMdPath, reason: 'already exists' };
  }

  // Read PROJECT.md default_work
  const projectMdPath = path.join(cwd, '.planning', 'PROJECT.md');
  let defaultWork = 'feature';
  if (fs.existsSync(projectMdPath)) {
    const content = fs.readFileSync(projectMdPath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const dwMatch = fmMatch[1].match(/^default_work:\s*(\S+)/m);
      if (dwMatch) defaultWork = dwMatch[1];
    }
  }

  // Extract goal from ROADMAP.md (best-effort)
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  // pattern: '### Objective N: <name>' (objectiveId might be '01-foo' or just '01' — strip suffix)
  const objectiveNum = String(objectiveId).split('-')[0].replace(/^0+/, '') || '0';
  let goalLine = '_(extract from ROADMAP.md "### Objective N:" entry)_';
  let objectiveName = objectiveId;
  if (fs.existsSync(roadmapPath)) {
    const roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    const re = new RegExp(`^### Objective ${objectiveNum}:\\s*(.+)$`, 'm');
    const m = roadmap.match(re);
    if (m) objectiveName = m[1].trim();
    // Goal is usually the next paragraph; best-effort scan for **Goal:** OR first non-empty line after the heading
    const goalRe = new RegExp(`### Objective ${objectiveNum}:[\\s\\S]*?\\*\\*Goal:\\*\\*\\s*([^\\n]+)`, 'm');
    const gm = roadmap.match(goalRe);
    if (gm) goalLine = gm[1].trim();
  }

  const today = new Date().toISOString().slice(0, 10);
  const stub = `---
work: ${defaultWork}
---

# ${objectiveName}

## Goal

${goalLine}

---
*Created: ${today} (auto-scaffold via bootstrapObjectiveMd)*
`;
  fs.writeFileSync(objectiveMdPath, stub, 'utf-8');
  return { applied: true, added_fields: ['work'], path: objectiveMdPath, reason: null };
}

function backfillAllObjectives(cwd) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const result = { scanned: 0, applied: 0, skipped: 0, errors: [] };
  if (!fs.existsSync(objectivesDir)) return result;
  const entries = fs.readdirSync(objectivesDir).sort(); // sort for determinism
  for (const entry of entries) {
    const dir = path.join(objectivesDir, entry);
    try {
      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) continue;
      result.scanned++;
      const r = bootstrapObjectiveMd(cwd, entry);
      if (r.applied) result.applied++;
      else result.skipped++;
    } catch (e) {
      result.errors.push({ objective: entry, message: e.message });
    }
  }
  return result;
}
```

**Existing test pattern from `project-bootstrap.test.cjs`:**

```js
const test = require('node:test');
const assert = require('node:assert');
// ... makeRepo helper (lines 13-22)

test('B4 — PROJECT.md without frontmatter → prepends org+github_repo', () => {
  const repo = makeRepo({
    remote: 'https://github.com/AO-Cyber-Systems/aodex-dev.git',
    projectMd: '# AODex Dev\n\nSome content.\n',
  });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, true);
    // ...
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
```

Mirror this `makeRepo` helper to also accept `objectivesContent` (a `Record<objectiveId, fileContent | null>` — null means "create dir, no OBJECTIVE.md"; string means "create dir + OBJECTIVE.md with that content").

**Stub format (locked):**

```yaml
---
work: feature       # or default_work from PROJECT.md
---

# <Objective Name>

## Goal

<Goal sentence from ROADMAP, or placeholder>

---
*Created: YYYY-MM-DD (auto-scaffold via bootstrapObjectiveMd)*
```

Keep it minimal — users fill in `github_issue`, `overrides`, etc. when they want them.
</codebase_examples>

<anti_patterns>
- **Auto-creating GH issues during backfill.** This is decision-locked OUT of scope (CONTEXT §3). bootstrapObjectiveMd is pure file I/O.
- **Auto-committing the backfill output.** Mirror bootstrapProjectMd: write files, return result, let user fold into next commit.
- **Reading frontmatter without the `extractFrontmatter` pattern.** Use the lightweight regex shown above (or import from `lib/frontmatter.cjs`) — don't reinvent YAML parsing.
- **Failing on missing PROJECT.md or ROADMAP.md.** Both are best-effort reads. Missing files produce graceful fallbacks (`work: feature`, placeholder goal).
- **Sorting differently across platforms.** `fs.readdirSync` is platform-dependent. Always `.sort()` before iterating in tests.
- **Treating an existing zero-byte OBJECTIVE.md as "missing".** `fs.existsSync` is the contract — empty file → `applied: false, reason: 'already exists'`. (Test O2 covers this.)
</anti_patterns>

<error_recovery>
- **PROJECT.md exists but is malformed (no frontmatter):** `default_work` falls back to `feature`. Test must cover.
- **ROADMAP.md missing the `### Objective N:` heading:** goal becomes the placeholder string. Test O5/O6 covers.
- **Objective dir doesn't exist (caller passed wrong id):** return `{ applied: false, reason: 'objective dir not found' }`. Test O5 covers.
- **fs.writeFileSync throws (permissions, disk full):** error bubbles up to caller. backfillAllObjectives catches per-dir and pushes to `result.errors[]`.
- **PROJECT.md frontmatter has weird whitespace (`default_work :  feature  `):** regex must tolerate. Use `^default_work:\s*(\S+)` not `^default_work:\s+(\S+)\s*$`.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@plugins/devflow/devflow/bin/lib/project-bootstrap.cjs
@plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs
@plugins/devflow/devflow/templates/objective.md
@.planning/objectives/00-refine-defaults-table/OBJECTIVE.md

# CONTEXT + RESEARCH for this objective
@.planning/objectives/18-v1-1-polish-bundle/18-CONTEXT.md
@.planning/objectives/18-v1-1-polish-bundle/18-RESEARCH.md
</context>

<research_context>
- Pattern source: `bootstrapProjectMd` (lines 49-98 of project-bootstrap.cjs). Locked return shape `{ applied, added_fields, path, reason }`.
- Stub format: see template at `plugins/devflow/devflow/templates/objective.md` and obj 0's existing `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` (5 frontmatter fields: work, github_issue, parent_issue, org_project, plus body). Backfill stub uses ONLY `work` to keep the file minimal — user adds GH coordination fields when ready.
- Idempotency contract: second invocation returns `{ applied: false, reason: 'already exists' }`. Test O7 enforces no file mtime change.
- ROADMAP goal extraction: best-effort regex against `\\*\\*Goal:\\*\\*\\s*([^\\n]+)`. Falls back to placeholder on miss (most v1.1 objs DO have **Goal:** lines per ROADMAP.md scan).
</research_context>

<gotchas>
- **objectiveId format ambiguity.** Callers might pass `'09'` or `'09-roadmap-disk-reconciliation'` or `'9'`. The function reads `path.join(cwd, '.planning/objectives', objectiveId)` — so it MUST match the directory name exactly. backfillAllObjectives already uses the directory name as objectiveId, so internal consistency is fine. For external callers, document: pass the directory name (e.g., `'09-roadmap-disk-reconciliation'`).
- **Padding in objective number for ROADMAP regex.** Roadmap headings use `### Objective 9:` (no padding). Strip leading zeros from objectiveId's first segment: `'09-foo'.split('-')[0].replace(/^0+/, '') || '0'`. Edge case: objective `'0'` itself (already has OBJECTIVE.md, will hit `'already exists'` path; but the regex must still produce `'0'` not empty string).
- **Test isolation.** Use `fs.mkdtempSync` per test (mirror existing `makeRepo`). Add an `objectives` map: `{ '01-foo': null, '02-bar': '---\nwork: refactor\n---\n# Bar\n' }`.
- **module.exports update.** Existing exports: `{ bootstrapProjectMd, _parseGithubRemote }`. Add `bootstrapObjectiveMd, backfillAllObjectives`. Keep alphabetical-ish or add a banner comment if the surface grows beyond 5 entries.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Test list + RED — write failing tests O1-O10 in project-bootstrap.test.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs</files>
  <action>
Per CLAUDE.md TDD Playbook habit 2 (test list first) — append a "Group O" comment block to project-bootstrap.test.cjs listing all 10 cases as a header:

```
// TEST LIST — Group O — bootstrapObjectiveMd + backfillAllObjectives (TRD 18-01)
//
// O1 — bootstrapObjectiveMd: missing OBJECTIVE.md + valid PROJECT.md → applied:true, added_fields:['work']
// O2 — bootstrapObjectiveMd: existing OBJECTIVE.md → applied:false, reason:'already exists'
// O3 — bootstrapObjectiveMd: missing PROJECT.md → uses 'feature' fallback; still applies
// O4 — bootstrapObjectiveMd: PROJECT.md default_work=refactor → stub uses work:refactor
// O5 — bootstrapObjectiveMd: objective dir doesn't exist → applied:false, reason:'objective dir not found'
// O6 — bootstrapObjectiveMd: ROADMAP.md has '### Objective 5: Foo bar' + '**Goal:** baz' → stub goal includes 'baz'
// O7 — bootstrapObjectiveMd: idempotent — second invocation produces no file mtime change
// O8 — backfillAllObjectives: scans dirs, returns { scanned, applied, skipped, errors } shape
// O9 — backfillAllObjectives: mixed dirs (3 missing, 1 exists) → applied:3, skipped:1
// O10 — bootstrapObjectiveMd: pure file I/O, no shell-out (mock execSync to throw, function still works)
```

Then write each test using node:test (`describe`/`it` OR top-level `test()` — match the file's existing style: top-level `test()`).

Extend `makeRepo` helper to accept `objectives` parameter:
```js
function makeRepo({ remote, projectMd, roadmap, objectives }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));
  execSync('git init -q', { cwd: root });
  if (remote) execSync(`git remote add origin ${remote}`, { cwd: root });
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (projectMd !== undefined) fs.writeFileSync(path.join(root, '.planning', 'PROJECT.md'), projectMd, 'utf-8');
  if (roadmap !== undefined) fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), roadmap, 'utf-8');
  if (objectives) {
    const objDir = path.join(root, '.planning', 'objectives');
    fs.mkdirSync(objDir, { recursive: true });
    for (const [id, content] of Object.entries(objectives)) {
      const dir = path.join(objDir, id);
      fs.mkdirSync(dir, { recursive: true });
      if (content !== null) fs.writeFileSync(path.join(dir, 'OBJECTIVE.md'), content, 'utf-8');
    }
  }
  return root;
}
```

Each test should:
1. Use `makeRepo({ ... })` to scaffold a tmp dir
2. Call `bootstrapObjectiveMd(repo, '01-foo')` (or similar) OR `backfillAllObjectives(repo)`
3. Assert on the returned object (`applied`, `added_fields`, `reason`)
4. Read the resulting OBJECTIVE.md and assert on its content (regex matches `^work: \\w+`, `^# `, `## Goal`)
5. Wrap in try/finally with `fs.rmSync(repo, { recursive: true, force: true })`

Run `npm test 2>&1 | grep -E "Group O|fail|pass" | head -30` — expect O1-O10 to FAIL because functions don't exist yet.

# CRITICAL: This is the RED phase. The require statement at top must include the new exports:
#   const { bootstrapObjectiveMd, backfillAllObjectives, bootstrapProjectMd } = require('./project-bootstrap.cjs');
# Tests will fail with "bootstrapObjectiveMd is not a function" — that's the RED signal.
# GOTCHA: Do NOT modify project-bootstrap.cjs in this task. Pure RED.
# PATTERN: Mirror existing test style (top-level `test('label', () => {...})`); use node:assert.
  </action>
  <verify>
`npm test 2>&1 | tee /tmp/red.log` → at least 10 new test failures all referencing "bootstrapObjectiveMd" or "backfillAllObjectives" being undefined or returning unexpected. Existing tests (B1-B8 etc.) still pass. Commit with message `test(18-01): add failing tests for bootstrapObjectiveMd + backfillAllObjectives (RED)`.
  </verify>
  <done>
RED phase complete: project-bootstrap.test.cjs has Group O test list comment + 10 new test cases. `npm test` shows ≥10 new failures specifically about the missing functions. Tests B1-B8 still PASS (regression guard). Single commit logged with `test(18-01):` prefix.
  </done>
  <recovery>
If a test fails for the wrong reason (e.g., regex error, undefined helper), fix the test code — don't add implementation. The point is to fail because the functions don't exist, not because the tests are buggy.
If `makeRepo` extension breaks existing B-group tests (signature change), make `objectives` parameter optional with default `undefined`.
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — implement bootstrapObjectiveMd + backfillAllObjectives in project-bootstrap.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/project-bootstrap.cjs</files>
  <action>
Add `bootstrapObjectiveMd(cwd, objectiveId)` and `backfillAllObjectives(cwd)` per the codebase_examples block above.

Implementation order (write the minimum to pass O1-O10 in order):

1. Add `bootstrapObjectiveMd` function. Follow the structure shown in codebase_examples:
   - Resolve objectiveDir, return early if missing
   - Resolve objectiveMdPath, return early if exists (idempotency)
   - Read PROJECT.md to extract default_work (regex: `/^default_work:\s*(\S+)/m`)
   - Read ROADMAP.md to extract objective name + goal (best-effort)
   - Construct stub string with template literal
   - `fs.writeFileSync` and return `{ applied: true, added_fields: ['work'], path, reason: null }`

2. Add `backfillAllObjectives` function. Walks `.planning/objectives/`, calls bootstrapObjectiveMd per dir, aggregates into `{ scanned, applied, skipped, errors }`. Sort entries for determinism.

3. Update module.exports at bottom of file:
```js
module.exports = {
  bootstrapProjectMd,
  bootstrapObjectiveMd,        // NEW
  backfillAllObjectives,       // NEW
  _parseGithubRemote,
};
```

Run `npm test 2>&1 | tee /tmp/green.log` — expect O1-O10 to PASS, all existing tests still pass.

# CRITICAL: Minimum implementation. Don't add features not covered by tests (e.g., don't auto-populate github_issue field — out of scope per CONTEXT §3).
# GOTCHA: extractFrontmatter via regex must NOT use `^---\n([\s\S]*?)\n---/m` with multiline flag — that overmatches. Stick to `/^---\n([\s\S]*?)\n---/`.
# GOTCHA: Default work fallback chain: PROJECT.md.default_work → 'feature'. Don't add a third fallback (no need).
# PATTERN: Follow existing function ordering — internal helpers `_underscore`, then exported functions. Match the comment-banner style of bootstrapProjectMd.
  </action>
  <verify>
`npm test 2>&1 | grep -E "Group O|fail|pass" | head -30` → all 10 Group O tests PASS. Total test count went up by ≥10 (e.g., 1832 → 1842). No B1-B8 regression. Commit with message `feat(18-01): implement bootstrapObjectiveMd + backfillAllObjectives (GREEN)`.
  </verify>
  <done>
GREEN phase complete: 2 new functions exported from project-bootstrap.cjs; all 10 Group O tests pass; pre-existing test count preserved (no B1-B8 regression); test count grew by ≥10. Single commit logged with `feat(18-01):` prefix.
  </done>
  <recovery>
If a test fails: read the test failure message, look at which assertion failed, fix the implementation. DO NOT modify the test to match the implementation (that defeats TDD).
If module.exports changes break some other consumer (test fails in a different file): the rest of the codebase only imports `bootstrapProjectMd` — adding new exports is additive, no breakage expected. If breakage occurs, audit `grep -rn "require.*project-bootstrap" plugins/`.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Run backfill against this repo + verify 17 OBJECTIVE.md files created</name>
  <files>.planning/objectives/01-github-coordination-layer/OBJECTIVE.md, .planning/objectives/02-cross-repo-awareness-layer/OBJECTIVE.md, .planning/objectives/03-planning-time-org-awareness/OBJECTIVE.md, .planning/objectives/04-duplicate-work-detection/OBJECTIVE.md, .planning/objectives/05-initiative-context-layer/OBJECTIVE.md, .planning/objectives/06-unified-check-todos/OBJECTIVE.md, .planning/objectives/07-handoff-watcher/OBJECTIVE.md, .planning/objectives/08-program-aware-tui/OBJECTIVE.md, .planning/objectives/09-roadmap-disk-reconciliation/OBJECTIVE.md, .planning/objectives/10-phase-e-agent-audit/OBJECTIVE.md, .planning/objectives/11-phase-d-verifier-wiring/OBJECTIVE.md, .planning/objectives/12-skill-consolidation/OBJECTIVE.md, .planning/objectives/13-phase-h-prompt-extraction/OBJECTIVE.md, .planning/objectives/14-phase-f-default-on-safety/OBJECTIVE.md, .planning/objectives/15-phase-a-routing-keystone/OBJECTIVE.md, .planning/objectives/16-phase-b-micro-skill/OBJECTIVE.md, .planning/objectives/17-phase-c-auto-init/OBJECTIVE.md</files>
  <action>
Run a one-shot Node command against this repo to invoke backfillAllObjectives:

```bash
node -e "
const { backfillAllObjectives } = require('./plugins/devflow/devflow/bin/lib/project-bootstrap.cjs');
const r = backfillAllObjectives(process.cwd());
console.log(JSON.stringify(r, null, 2));
"
```

Expected output: `{ scanned: 19, applied: 17, skipped: 2, errors: [] }` — assuming objective 0 (already has OBJECTIVE.md) and objective 18 (this objective; just got created during planning) both get skipped.

Note: objective 18-v1-1-polish-bundle's directory exists. If 18-CONTEXT.md and 18-RESEARCH.md exist there but no OBJECTIVE.md, the backfill WILL create one for it. That's fine — verify the file gets created and contains `work: feature` or appropriate inheritance.

Verify each backfilled file:
- Has YAML frontmatter starting with `---\nwork: <something>\n---`
- Has a `# <Title>` H1 line
- Has a `## Goal` section
- Has a footer line matching `\*Created: \d{4}-\d{2}-\d{2}`

Spot-check 3 files (01, 09, 17):
```bash
head -20 .planning/objectives/01-github-coordination-layer/OBJECTIVE.md
head -20 .planning/objectives/09-roadmap-disk-reconciliation/OBJECTIVE.md
head -20 .planning/objectives/17-phase-c-auto-init/OBJECTIVE.md
```

Run idempotency check — re-run backfill, expect `applied: 0` this time.

```bash
node -e "
const { backfillAllObjectives } = require('./plugins/devflow/devflow/bin/lib/project-bootstrap.cjs');
const r = backfillAllObjectives(process.cwd());
console.log(JSON.stringify(r, null, 2));
"
```

Expected: `{ scanned: 19, applied: 0, skipped: 19, errors: [] }`.

Commit all backfilled files in a single commit:
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "feat(18-01): backfill OBJECTIVE.md for objectives 01-17 + 18 (auto-scaffold)" --files .planning/objectives/*/OBJECTIVE.md
```

# CRITICAL: All 1832 pre-existing tests MUST still pass after backfill (the backfilled files are content, not code, but verify with `npm test` after).
# GOTCHA: If backfill produces `errors: [...]`, investigate per-objective; common cause is a permissions issue in the test fixture dir. Real-repo .planning/objectives should not error.
# GOTCHA: Don't modify the backfilled stubs by hand — they're the literal output of the function. Hand edits indicate the function logic is wrong, fix the function (and re-run backfill) instead.
  </action>
  <verify>
1. `ls .planning/objectives/*/OBJECTIVE.md | wc -l` → 18 (or 19 if 18-v1-1-polish-bundle gets backfilled too) — all dirs covered.
2. Spot-check `cat .planning/objectives/09-roadmap-disk-reconciliation/OBJECTIVE.md` — has frontmatter + goal + creation date.
3. Re-run backfill → `applied: 0` (idempotent).
4. `npm test` → all tests still pass (no count regression).
  </verify>
  <done>
17+1=18 backfilled OBJECTIVE.md files exist on disk, each with valid frontmatter + goal section + creation footer. Idempotency confirmed. Single `feat(18-01):` commit captures all backfill output. No test regressions.
  </done>
  <recovery>
If backfill fails partway: errors array tells you which objective. Fix the helper (e.g., handle special characters in objective dir name) and re-run — idempotency means already-applied dirs get skipped on retry.
If a backfilled file looks wrong (e.g., goal placeholder when ROADMAP.md has a Goal): the regex in bootstrapObjectiveMd missed. Fix the regex, delete the bad files (`rm .planning/objectives/{N}-*/OBJECTIVE.md`), re-run backfill.
If `npm test` shows a regression: the backfilled files might have triggered a frontmatter parser test that now sees a malformed file — but bootstrapObjectiveMd should produce well-formed YAML. Check the failing test, then check the file it's reading.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<lint>(no lint command in this repo per CLAUDE.md)</lint>
<build>(no build step — runtime is Node.js native via df-tools.cjs)</build>
</validation_gates>

<verification>
- [ ] Group O tests (10 cases) all pass after task 2
- [ ] All B-group (existing) tests still pass — no regression
- [ ] All 1832 pre-existing tests still pass after task 3
- [ ] `bootstrapObjectiveMd` and `backfillAllObjectives` exported from project-bootstrap.cjs
- [ ] Each `.planning/objectives/<id>/OBJECTIVE.md` exists for ids 01-17 (and ideally 18)
- [ ] Each backfilled stub has YAML frontmatter `work:` field
- [ ] Idempotency verified: re-run backfill produces `applied: 0`
- [ ] 3 atomic commits: `test(18-01):` (RED) + `feat(18-01):` (GREEN) + `feat(18-01):` (backfill output)
</verification>

<success_criteria>
- bootstrapObjectiveMd return shape matches bootstrapProjectMd: `{ applied, added_fields, path, reason }`
- backfillAllObjectives return shape: `{ scanned, applied, skipped, errors }`
- All 17 (or 18) backfilled OBJECTIVE.md files exist
- New tests count: ≥10 (covering O1-O10 from test list)
- Zero regressions in existing tests
- POLISH-OBJ-MD-SCAFFOLD requirement met: function exists and is exported
- POLISH-OBJ-MD-BACKFILL requirement met: 17 OBJECTIVE.md files created in this run
</success_criteria>

<output>
After completion, create `.planning/objectives/18-v1-1-polish-bundle/18-01-objective-md-scaffold-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`. Include:
- Functions added (`bootstrapObjectiveMd`, `backfillAllObjectives`)
- Test count delta (+10 or more)
- List of 17 backfilled files (or copy the JSON output of backfillAllObjectives)
- Self-Check verdict: PASSED if all verification checks above pass
</output>
