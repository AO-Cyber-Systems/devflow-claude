---
objective: 16-phase-b-micro-skill
trd: "01"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/micro.cjs
  - plugins/devflow/devflow/bin/lib/micro.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - PHASE-B2

must_haves:
  truths:
    - "df-tools micro start <description> writes .planning/.skill-active marker with skill='micro' and returns task tracking info"
    - "df-tools micro commit produces an atomic git commit with message format 'chore(micro): <description>' and removes the marker"
    - "df-tools micro commit appends a row to STATE.md 'Quick Tasks Completed' table"
    - "df-tools micro abort removes the marker without committing"
    - "All three subcommands fail loudly when invoked outside a .planning/ tree"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/micro.cjs
      provides: "Pure functions startMicro/commitMicro/abortMicro + cmdMicro CLI entry point"
      exports: ["cmdMicro", "startMicro", "commitMicro", "abortMicro"]
    - path: plugins/devflow/devflow/bin/lib/micro.test.cjs
      provides: "Node-native test suite covering all behaviours from the test-list checklist in 16-RESEARCH.md"
      contains: "describe('startMicro'"
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      provides: "Switch arm case 'micro' that delegates to cmdMicro"
      contains: "case 'micro':"
  key_links:
    - from: plugins/devflow/devflow/bin/df-tools.cjs
      to: plugins/devflow/devflow/bin/lib/micro.cjs
      via: "require('./lib/micro.cjs') + case 'micro' switch arm"
      pattern: "require.*lib/micro.cjs"
    - from: plugins/devflow/devflow/bin/lib/micro.cjs
      to: plugins/devflow/devflow/bin/lib/skill-active.cjs
      via: "require + startSkill/endSkill calls (do not duplicate marker logic)"
      pattern: "require.*skill-active.cjs"
    - from: plugins/devflow/devflow/bin/lib/micro.cjs
      to: "cmdCommit (df-tools commit subcommand)"
      via: "require('./misc.cjs') or wherever cmdCommit lives + invoke for atomic commit"
      pattern: "cmdCommit|commit.*chore\\(micro\\)"
---

<objective>
Build the `df-tools micro` CLI surface (`start`, `commit`, `abort`) with a TDD test suite covering every case from the test-list checklist in 16-RESEARCH.md.

Purpose: This CLI is the engine of the `/devflow:micro` skill (16-02 consumes it). The skill body shells out to `df-tools micro <subcommand>`; without the CLI working, the skill is non-functional. TDD is mandatory per playbook because the CLI surface is small, well-defined, and has clear input/output contracts.

Output: Working `df-tools micro start|commit|abort` subcommands, paired test suite, and df-tools.cjs switch-arm wiring. No skill, no workflow, no documentation — those land in 16-02.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                       ← MODIFY (add case 'micro' + import)
└── lib/
    ├── micro.cjs                      ← CREATE (pure functions + cmdMicro)
    ├── micro.test.cjs                 ← CREATE (test suite, 12+ cases)
    ├── skill-active.cjs               ← READ-ONLY (import startSkill/endSkill)
    ├── init.cjs                       ← READ-ONLY (mirror cmdInitQuick numbering)
    └── helpers.cjs                    ← READ-ONLY (output/error helpers)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>
**Pattern A — df-tools subcommand library skeleton (mirror skill-active.cjs):**

```javascript
// plugins/devflow/devflow/bin/lib/skill-active.cjs (existing, 244 lines)
'use strict';

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');

const realFs = {
  existsSync: (...a) => fs.existsSync(...a),
  mkdirSync: (...a) => fs.mkdirSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  unlinkSync: (...a) => fs.unlinkSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (_runFs.existsSync(path.join(dir, '.planning'))) {
      return path.join(dir, '.planning');
    }
    dir = path.dirname(dir);
  }
  return null;
}

function startSkill({ planningDir, skillName, pid, now }) {
  if (!planningDir) {
    return { ok: false, reason: 'no-planning-dir', message: '...' };
  }
  // ... pure logic, returns { ok, ... }
}

function cmdSkillActive(cwd, args, raw) {
  const planningDir = findPlanningDir(cwd);
  const op = (args[0] || '').replace(/^--/, '');
  if (op === 'start') {
    const result = startSkill({ planningDir, skillName: args[1], pid: process.pid, now: new Date().toISOString() });
    if (!result.ok) { error(result.message); return; }
    output(result, raw, JSON.stringify(result));
    return;
  }
  // ... end, status branches
  error(`Unknown skill-active subcommand: "${op}"`);
}

module.exports = { cmdSkillActive, startSkill, endSkill, statusSkill, findPlanningDir, _setRunFs, _resetMocks };
```

**Pattern B — switch arm in df-tools.cjs:**

```javascript
// plugins/devflow/devflow/bin/df-tools.cjs:192 (existing)
const { cmdSkillActive } = require('./lib/skill-active.cjs');

// plugins/devflow/devflow/bin/df-tools.cjs:891 (existing)
case 'skill-active': {
  cmdSkillActive(cwd, args.slice(1), raw);
  break;
}
```

**Pattern C — test fixture helper (mirror skill-active.test.cjs):**

```javascript
// plugins/devflow/devflow/bin/lib/skill-active.test.cjs:18-24
function mkAmbient() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-active-'));
  fs.mkdirSync(path.join(root, '.planning'));
  return { root, planningDir: path.join(root, '.planning') };
}

describe('startSkill', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  test('writes marker JSON with {skill, started_at, pid}', () => {
    const result = startSkill({ planningDir: env.planningDir, skillName: 'build', pid: 1234, now: '2026-05-04T00:00:00Z' });
    assert.equal(result.ok, true);
    // ...
  });
});
```

**Pattern D — quick task numbering (from init.cjs:355-371):**

```javascript
function cmdInitQuick(cwd, description, raw) {
  const slug = description ? generateSlugInternal(description)?.substring(0, 40) : null;
  const quickDir = path.join(cwd, '.planning', 'quick');
  let nextNum = 1;
  try {
    const existing = fs.readdirSync(quickDir)
      .filter(f => /^\d+-/.test(f))
      .map(f => parseInt(f.split('-')[0], 10))
      .filter(n => !isNaN(n));
    if (existing.length > 0) nextNum = Math.max(...existing) + 1;
  } catch {}
  // ...
}
```

Micro reuses this numbering — micro tasks live in the same `.planning/quick/NNN-slug/` namespace as quick tasks (locked decision 3 in CONTEXT.md).
</codebase_examples>

<anti_patterns>
- **Do NOT** reimplement `findPlanningDir` — import from `skill-active.cjs` (already exported).
- **Do NOT** directly write `.planning/.skill-active` from `micro.cjs` — call `startSkill({ planningDir, skillName: 'micro', ... })` from `skill-active.cjs`. Locked-decision 4 in CONTEXT.md.
- **Do NOT** shell out to raw `git commit` — gate-commits.js will block. Use the existing `cmdCommit` from df-tools (which already sets `DEVFLOW_ALLOW_RAW_COMMIT=1` internally) or call its underlying logic.
- **Do NOT** generate test fixtures with an LLM — hand-build them. Mirror `skill-active.test.cjs:mkAmbient()` and write descriptions inline (e.g., `'fix typo in readme'`, `'rename foo to bar'`).
- **Do NOT** introduce a new column in STATE.md "Quick Tasks Completed" table — match the existing table shape on disk. If the table has a Status column, populate it (`micro` entries can use a fixed value like `Atomic`); if not, don't add one.
- **Do NOT** batch tests "while we're here" — one test at a time per RED→GREEN→REFACTOR per playbook habit 3.
- **Do NOT** remove the skill-active marker if commit fails — only remove on commit success, so the user can retry. Pitfall 5 in 16-RESEARCH.md.
</anti_patterns>

<error_recovery>
**Commit fails (pre-commit hook denial, dirty tree, etc.):**
- Return `{ ok: false, reason: 'commit-failed', message: <stderr> }` from `commitMicro`.
- DO NOT call `endSkill` — the marker stays so the user can `df-tools micro commit` again after fixing the cause.
- `cmdMicro` surfaces the failure via `error()` helper (non-zero exit, JSON error in --raw mode).

**Stale marker from a previous session:**
- `df-tools micro start` overwrites it (last-write-wins, mirrors `skill-active.test.cjs` test 4). Document this in 16-02's workflow.
- `df-tools micro abort` is the explicit recovery path (no commit, just clears the marker).

**STATE.md missing or malformed:**
- If the file doesn't exist → fail with `reason: 'no-state-file'`. Don't auto-create; that's the project init's responsibility.
- If the "Quick Tasks Completed" section is missing → create it (matching no-`--full` 5-column shape: `# | Description | Date | Commit | Directory`).
- If the section exists with a Status column → match the existing 6-column shape and populate Status with `Atomic`.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/16-phase-b-micro-skill/16-CONTEXT.md
@.planning/objectives/16-phase-b-micro-skill/16-RESEARCH.md

@plugins/devflow/devflow/bin/lib/skill-active.cjs
@plugins/devflow/devflow/bin/lib/skill-active.test.cjs
@plugins/devflow/devflow/bin/lib/init.cjs
@plugins/devflow/devflow/bin/df-tools.cjs
</context>

<research_context>
From 16-RESEARCH.md:

- Discovery level 0 — no new libraries, no new patterns. All work follows established codebase patterns.
- Standard stack: `node:test`, `node:assert/strict`, `child_process.spawnSync`, `fs.mkdtempSync`+`os.tmpdir()`, CommonJS `.cjs`.
- Pattern locks: `df-tools subcommand library` (Pattern A), `switch arm wiring` (Pattern B), `mkAmbient test helper` (Pattern C).
- Playbook directives applied: TDD type, hand-built fixtures (no LLM-generated test data), one test at a time, no property-based, no Gherkin.
- Test-list checklist for `start` / `commit` / `abort` is REQUIRED in this TRD per playbook habit 2 — see `<feature>` block below.
</research_context>

<gotchas>
1. **Marker stays on commit failure** — only `endSkill` after successful commit. Pitfall 5 / error_recovery section.
2. **STATE.md table shape varies** — match what's on disk, don't introduce a new column. Pitfall 2.
3. **Subprocess e2e tests are slow** — keep `spawnSync` cases to ≤2 (one happy path, one no-`.planning/`). Unit-test the rest. Pitfall 4.
4. **gate-commits.js will block raw `git commit`** — route through `cmdCommit` from df-tools commit subcommand. Pitfall 5 in RESEARCH.
5. **Slug must be ≤40 chars and lowercase-hyphen** — reuse `generateSlugInternal` from `init.cjs`. Don't reimplement.
6. **Tests under 15-04 (skill-active) MUST keep passing** — micro imports from skill-active.cjs but does not modify it. Run `npm test -- --test-name-pattern="skill-active"` after micro lands to confirm 0 regression.
</gotchas>

<feature>
  <name>df-tools micro CLI (start/commit/abort)</name>
  <files>
    plugins/devflow/devflow/bin/lib/micro.cjs
    plugins/devflow/devflow/bin/lib/micro.test.cjs
  </files>
  <behavior>
    Three subcommands implemented as pure functions + a `cmdMicro(cwd, args, raw)` CLI wrapper. Mirrors the skill-active.cjs structure exactly.

    **Test-list checklist (REQUIRED before any test code is written):**

    `startMicro({ planningDir, description, pid, now })`:
    - happy: returns `{ok:true, next_num, slug, task_dir, marker}`; writes `.planning/.skill-active` with `skill='micro'`
    - edge: `description` empty/whitespace → `{ok:false, reason:'missing-description'}`
    - edge: `planningDir` null → `{ok:false, reason:'no-planning-dir'}`
    - edge: pre-existing marker → overwrites (last-write-wins, marker.skill becomes 'micro')
    - edge: existing `.planning/quick/0042-foo` dir → `next_num === 43`
    - edge: description with special chars → slug stripped to lowercase-hyphen ≤40 chars (delegate to `generateSlugInternal`)

    `commitMicro({ planningDir, description, files, now, gitRunner })`:
    - happy: commits with message `chore(micro): {description}`, removes marker, appends row to STATE.md "Quick Tasks Completed" table → `{ok:true, commit_hash, removed_marker:true}`
    - happy with `files` array: only that subset is staged (delegates through gitRunner, which mirrors cmdCommit's --files behaviour)
    - edge: no marker present → `{ok:false, reason:'no-active-micro'}`
    - edge: commit fails (gitRunner returns non-zero) → `{ok:false, reason:'commit-failed', stderr, removed_marker:false}` — marker stays
    - edge: STATE.md missing → `{ok:false, reason:'no-state-file'}` (don't auto-create)
    - edge: STATE.md present but no "Quick Tasks Completed" section → create section in 5-column shape (no Status column)
    - edge: STATE.md present with Status column already → match 6-column shape, populate Status with `'Atomic'`

    `abortMicro({ planningDir })`:
    - happy: marker present → removes, returns `{ok:true, removed:true}`
    - happy: marker absent → idempotent `{ok:true, removed:false}` (mirrors `endSkill`)
    - edge: `planningDir` null → `{ok:false, reason:'no-planning-dir'}`

    `cmdMicro(cwd, args, raw)`:
    - dispatches `start <description>` → `startMicro` (pid=process.pid, now=new Date().toISOString())
    - dispatches `commit [--files <p>...]` → `commitMicro` (parses --files like cmdCommit does)
    - dispatches `abort` → `abortMicro`
    - unknown subcommand → `error('Unknown micro subcommand: "..."')`
    - on `result.ok === false` → `error(result.message || result.reason)`; on success → `output(result, raw, JSON.stringify(result))`

    **Subprocess e2e (≤2 cases via `spawnSync` of `node df-tools.cjs micro ...`):**
    - case e2e-1: in `mkAmbient()` tmpdir, `start "fix typo" → commit` round-trip; assert marker created/removed, commit appears in `git log -1`, STATE.md row appended
    - case e2e-2: outside any `.planning/` tree → `start "x"` exits non-zero with `no-planning-dir` in stderr
  </behavior>
  <implementation>
    1. Create `micro.cjs` mirroring `skill-active.cjs` (fs injection, _setRunFs, _resetMocks).
    2. Import `findPlanningDir`, `startSkill`, `endSkill` from `./skill-active.cjs`. Do not reimplement.
    3. Import `generateSlugInternal` from `./init.cjs` for slug generation.
    4. For commits: import `cmdCommit` (or its underlying logic) from `./misc.cjs` (where it currently lives — verify by grep). If direct import is awkward, accept a `gitRunner` injection in pure functions and use `child_process.spawnSync('git', ...)` in the production path with `DEVFLOW_ALLOW_RAW_COMMIT=1` set.
    5. STATE.md row append: read file, locate `### Quick Tasks Completed`, parse header to detect column count (5 vs 6), append matching row, write back.
    6. Wire `case 'micro':` in `df-tools.cjs` (around line 891 after the existing `case 'skill-active':`).
  </implementation>
</feature>

<tasks>

<task tdd="true">
  <name>Task 1: Write failing tests for micro CLI (RED)</name>
  <files>plugins/devflow/devflow/bin/lib/micro.test.cjs</files>
  <action>
Create the test file `plugins/devflow/devflow/bin/lib/micro.test.cjs`. Mirror the shape of `skill-active.test.cjs` exactly:

- Top-level `describe('startMicro')`, `describe('commitMicro')`, `describe('abortMicro')`, `describe('cmdMicro (CLI dispatch)')`, `describe('e2e (spawnSync)')`.
- `mkAmbient()` helper: `fs.mkdtempSync(os.tmpdir() + '/micro-')` + `fs.mkdirSync(path.join(root, '.planning'))`. For commit tests, also init a git repo in `root` with `child_process.spawnSync('git', ['init', '-q'], { cwd: root })` and `git config user.email/user.name`. For STATE.md tests, write a minimal STATE.md fixture (5-column or 6-column shape per test).
- `beforeEach`: build env. `afterEach`: `fs.rmSync(env.root, { recursive: true, force: true }); _resetMocks();`.

Write ALL test cases from the test-list checklist in `<feature><behavior>` above — but write them so they FAIL (the production code in micro.cjs does not exist yet). Each `test(...)` requires the `startMicro`/`commitMicro`/`abortMicro`/`cmdMicro` exports from `./micro.cjs` — those imports will throw `Cannot find module` initially. That IS the RED state.

# CRITICAL: Hand-build all fixture descriptions. No LLM-generated strings. Use realistic micro-task descriptions: 'fix typo in readme', 'rename foo to bar', 'bump dependency version', 'add missing semicolon'.
# CRITICAL: Each test asserts ONE behaviour. Don't combine. Don't loop over fixtures with shared assertions when the behaviours differ.
# GOTCHA: For commit tests, gate-commits.js MUST be bypassed in the test runner. Pre-set `process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1'` in beforeEach if the test invokes `cmdCommit` or shells out to `git commit`. Restore in afterEach.
# GOTCHA: Subprocess e2e tests via spawnSync use `path.join(__dirname, '..', 'df-tools.cjs')` — NOT `~/.claude/devflow/bin/...` (sync-runtime hasn't run in test context).
# PATTERN: Mirror `skill-active.test.cjs:18-24` for mkAmbient and `skill-active.test.cjs:108-115` for marker round-trip tests.

Run `npm test -- --test-name-pattern="micro"` and confirm ALL new micro tests fail (the rest of the suite still passes). Commit:

```
node ~/.claude/devflow/bin/df-tools.cjs commit "test(16-01): add failing tests for df-tools micro CLI" \
  --files plugins/devflow/devflow/bin/lib/micro.test.cjs
```
  </action>
  <verify>
    npm test -- --test-name-pattern="micro" 2>&1 | grep -E "^# fail|^# pass" — expect fail >= 12 (one per checklist case minimum), pass for unrelated tests unchanged.
    git log -1 --pretty=%s — expect "test(16-01): add failing tests for df-tools micro CLI"
  </verify>
  <done>
    Test file exists with ≥12 failing test cases covering the entire test-list checklist. The pre-existing 1702 passing tests still pass (we haven't broken anything; we've only added new failing tests). Commit landed with `test(16-01):` prefix.
  </done>
  <recovery>
    If a test you write fails because of an unrelated regression (not a missing micro export), revert your test file and investigate before continuing. The pre-existing 1702 baseline must hold.
  </recovery>
</task>

<task tdd="true">
  <name>Task 2: Implement micro CLI to make tests pass (GREEN)</name>
  <files>
    plugins/devflow/devflow/bin/lib/micro.cjs
    plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
Create `plugins/devflow/devflow/bin/lib/micro.cjs` and wire `case 'micro':` into `df-tools.cjs`. Write the MINIMUM code needed to turn each failing test green. Do NOT add behaviours that no test asserts.

Approach:

1. Skeleton mirrors `skill-active.cjs`:
   - `'use strict';`
   - `const fs = require('fs'); const path = require('path');`
   - `const { output, error } = require('./helpers.cjs');`
   - `const { findPlanningDir, startSkill, endSkill } = require('./skill-active.cjs');`
   - `const { generateSlugInternal } = require('./init.cjs');` — verify this is exported; if not, add the export to init.cjs (one-line change in module.exports).
   - fs injection block (`realFs`, `_runFs`, `_setRunFs`, `_resetMocks`) — same shape.

2. `function startMicro({ planningDir, description, pid, now })`:
   - Validate `planningDir`, return `{ok:false, reason:'no-planning-dir'}` if null.
   - Validate `description` (non-empty after trim), return `{ok:false, reason:'missing-description'}` if missing.
   - Compute slug: `generateSlugInternal(description)?.substring(0, 40)`.
   - Compute next_num: read `.planning/quick/`, find max `^\d+-` prefix, +1 (mirror `cmdInitQuick:362-371`).
   - Compute `task_dir = path.join('.planning/quick', \`${nextNum}-${slug}\`)`.
   - Call `startSkill({ planningDir, skillName: 'micro', pid, now })`. Surface its error if any.
   - Return `{ok:true, next_num, slug, task_dir, marker: <result.marker>}`.

3. `function commitMicro({ planningDir, description, files, now, gitRunner })`:
   - Validate marker exists via `statusSkill({ planningDir })` (import from skill-active.cjs) — if `active:false` or `marker.skill !== 'micro'`, return `{ok:false, reason:'no-active-micro'}`.
   - Read STATE.md path. If missing, return `{ok:false, reason:'no-state-file'}`.
   - Run commit via `gitRunner` (default: `child_process.spawnSync` with `git add` + `git commit -m \`chore(micro): ${description}\``, env including `DEVFLOW_ALLOW_RAW_COMMIT: '1'`). If non-zero, return `{ok:false, reason:'commit-failed', stderr, removed_marker:false}`.
   - On commit success: get short hash via `git rev-parse --short HEAD`.
   - Append STATE.md row (parse `### Quick Tasks Completed` header column count; create section if missing in 5-col shape; match shape if exists).
   - Call `endSkill({ planningDir })` — only after commit AND STATE.md write both succeed.
   - Return `{ok:true, commit_hash, removed_marker:true}`.

4. `function abortMicro({ planningDir })`:
   - Validate `planningDir`, return `{ok:false, reason:'no-planning-dir'}` if null.
   - Call `endSkill({ planningDir })`. Pass through its result shape.

5. `function cmdMicro(cwd, args, raw)`:
   - `const planningDir = findPlanningDir(cwd);`
   - `const op = args[0];`
   - For `'start'`: `description = args.slice(1).join(' ').trim();` then `startMicro({ planningDir, description, pid: process.pid, now: new Date().toISOString() })`.
   - For `'commit'`: parse `--files` like df-tools.cjs:300-307 does (`filesIndex = args.indexOf('--files'); files = filesIndex !== -1 ? args.slice(filesIndex+1).filter(a => !a.startsWith('--')) : null;`). Read description from existing marker via `statusSkill`.
   - For `'abort'`: `abortMicro({ planningDir })`.
   - Unknown op: `error('Unknown micro subcommand: "..." Available: start <description>, commit [--files <p>...], abort')`.
   - On `!result.ok`: `error(result.message || result.reason)`. On success: `output(result, raw, JSON.stringify(result))`.

6. `module.exports = { cmdMicro, startMicro, commitMicro, abortMicro, _setRunFs, _resetMocks };`

7. Wire `df-tools.cjs`:
   - Add `const { cmdMicro } = require('./lib/micro.cjs');` near line 192 (after `cmdSkillActive`).
   - Add `case 'micro': { cmdMicro(cwd, args.slice(1), raw); break; }` near line 895 (after `case 'skill-active':`).

Run `npm test` after each pure-function group. Commit when all micro tests are green AND the 1702-baseline still passes:

```
node ~/.claude/devflow/bin/df-tools.cjs commit "feat(16-01): implement df-tools micro CLI (start/commit/abort)" \
  --files plugins/devflow/devflow/bin/lib/micro.cjs plugins/devflow/devflow/bin/df-tools.cjs
```

# CRITICAL: One test green at a time per playbook habit 3. Don't write all of micro.cjs, then run tests. Write startMicro → confirm its tests green → commitMicro → its tests → abortMicro → cmdMicro.
# CRITICAL: STATE.md row append MUST match existing column shape on disk. If the project STATE.md has 5 columns (no Status), append 5 columns. If 6 (with Status), append 6 with Status='Atomic'. See pitfall 2 in 16-RESEARCH.md.
# GOTCHA: Marker.skill must equal 'micro' for commitMicro to proceed. If a different skill (e.g., 'build') is active, commit refuses with no-active-micro. This prevents micro accidentally clearing another skill's marker.
# GOTCHA: gate-commits.js blocks raw `git commit` unless DEVFLOW_ALLOW_RAW_COMMIT=1 is in env. Set it in the spawn env, NOT in process.env globally (would leak into other tests).
# PATTERN: Follow skill-active.cjs structure literally. Same export shape, same fs injection, same JSON output format.
  </action>
  <verify>
    npm test 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail" — expect tests >= 1714 (1702 baseline + ≥12 new), pass >= 1714, fail 0.
    node plugins/devflow/devflow/bin/df-tools.cjs micro abort --raw — should return JSON {ok:true,removed:false} when run from a .planning/ project root.
    git log -1 --pretty=%s — expect "feat(16-01): implement df-tools micro CLI (start/commit/abort)".
  </verify>
  <done>
    All micro tests pass. The 1702-test baseline still passes (no regressions). `df-tools micro {start,commit,abort}` works end-to-end via `spawnSync`-driven e2e tests. Switch arm wired in df-tools.cjs.
  </done>
  <recovery>
    If a test refuses to go green and you suspect the test is wrong (not the production code), STOP and re-read the test-list checklist in `<feature><behavior>`. Don't rewrite the test to match buggy production code. If the test is genuinely wrong, fix it and commit the fix as `test(16-01): correct test for <case>` BEFORE the feat commit.
    If the 1702 baseline regresses, revert the feat commit (`git reset --hard HEAD~1`) and inspect which existing test broke. Most likely cause: accidentally re-exporting a name that collides with an existing module.
  </recovery>
</task>

<task tdd="true">
  <name>Task 3: Refactor for clarity and shared helpers (REFACTOR — only if needed)</name>
  <files>
    plugins/devflow/devflow/bin/lib/micro.cjs
  </files>
  <action>
ONLY perform this task if Task 2 left meaningful duplication or unclear naming. Common refactor candidates:

1. STATE.md table parsing/append helper extracted to a private `_appendQuickTaskRow(stateMd, row)` function (testable in isolation).
2. Marker validation extracted to `_requireActiveMicroMarker(planningDir)` if both `commitMicro` and other subcommands need it.
3. JSDoc comments matching skill-active.cjs's level of detail (lines 73-83 of skill-active.cjs are a good template).

Run `npm test` after refactoring. ALL tests must remain green. If anything breaks, the refactor is wrong — revert.

Commit ONLY if you actually changed code:

```
node ~/.claude/devflow/bin/df-tools.cjs commit "refactor(16-01): extract STATE.md row helper + JSDoc cleanup" \
  --files plugins/devflow/devflow/bin/lib/micro.cjs
```

If the GREEN code is already clean (well-named, well-commented, no duplication), SKIP this task. Do not invent refactors to satisfy the cycle.

# CRITICAL: REFACTOR step is OPTIONAL per playbook. Skip if the GREEN code is already clean.
# GOTCHA: Tests must remain green throughout. Run npm test after each extracted helper.
  </action>
  <verify>
    npm test 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail" — pass count unchanged from end of Task 2, fail still 0.
    If commit landed: git log -1 --pretty=%s — "refactor(16-01): ..."
    If skipped: no commit, message in SUMMARY.md noting why refactor was unnecessary.
  </verify>
  <done>
    Either: a refactor commit lands with all tests still green, OR the task is documented as skipped because GREEN code was already clean.
  </done>
  <recovery>
    If a refactor breaks a test, immediately `git reset --hard HEAD` (uncommitted) or `git revert` (committed). The TDD playbook is "tests stay green during refactor" — no exceptions.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
End-state checks for this TRD:

1. **CLI works end-to-end** in a temporary `.planning/` project:
   - `df-tools micro start "fix typo in readme"` writes `.planning/.skill-active` with `skill='micro'`, returns task_dir + next_num.
   - Make a 1-line edit (allowed because marker exists; gate-edits.js permits).
   - `df-tools micro commit` produces a commit with message `chore(micro): fix typo in readme`, removes marker, appends STATE.md row.
   - `df-tools micro abort` (idempotent test): returns `{ok:true, removed:false}` when no marker.

2. **Test count baseline:** `npm test` shows tests ≥ 1714 (1702 + ≥12 new), pass ≥ 1714, fail 0. (The 2 known-failing novel-domain tests in master are unrelated; if they were failing before this TRD, they're still failing, not a regression caused here.)

3. **No skill-active regression:** all 15-04 tests still pass (`npm test -- --test-name-pattern="skill-active"`).

4. **Switch arm wired:** `node plugins/devflow/devflow/bin/df-tools.cjs micro` (with no args) emits the "Unknown micro subcommand" error, NOT a "Unknown command 'micro'" — proving the arm is reached.

5. **STATE.md table integrity:** running `micro commit` against a STATE.md that already has a 5-col Quick Tasks Completed table appends a 5-col row (no Status leak); running against a 6-col table appends a 6-col row with Status='Atomic'.
</verification>

<success_criteria>
- [ ] `plugins/devflow/devflow/bin/lib/micro.cjs` exists with exports `cmdMicro, startMicro, commitMicro, abortMicro, _setRunFs, _resetMocks`.
- [ ] `plugins/devflow/devflow/bin/lib/micro.test.cjs` exists with ≥12 test cases covering the test-list checklist in `<feature><behavior>`.
- [ ] `df-tools.cjs` has `const { cmdMicro } = require('./lib/micro.cjs');` and `case 'micro': { cmdMicro(cwd, args.slice(1), raw); break; }`.
- [ ] `npm test` shows tests ≥ 1714, pass ≥ 1714 (1702 baseline + new tests), fail = 0.
- [ ] At least 2 atomic commits land: `test(16-01):` for RED + `feat(16-01):` for GREEN. Optional `refactor(16-01):` if Task 3 produced changes.
- [ ] `df-tools micro start "..."` round-trips through `commit` and the resulting commit has the format `chore(micro): ...`.
- [ ] No regression in skill-active.cjs tests (15-04 baseline preserved).
</success_criteria>

<output>
After completion, create `.planning/objectives/16-phase-b-micro-skill/16-01-SUMMARY.md` summarising:
- Test count delta (1702 → 1702+N)
- File-by-file changes
- Decisions made during implementation (e.g., gitRunner injection vs direct cmdCommit reuse)
- Anything 16-02 (skill+workflow) needs to know about the CLI contract
</output>
