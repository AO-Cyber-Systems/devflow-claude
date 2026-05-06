---
objective: 14-phase-f-default-on-safety
trd: "01"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
  - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/trd-pre-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/df-tools.test.cjs
autonomous: true
requirements:
  - F1
must_haves:
  truths:
    - "df-tools verify trd-pre <objective> returns structured JSON in under 2 seconds"
    - "Cheap checker fails when a roadmap requirement ID is absent from all TRDs"
    - "Cheap checker fails when any task is missing <name>, <action>, <verify>, or <done>"
    - "Cheap checker fails when depends_on graph contains a cycle or references a non-existent TRD"
    - "Cheap checker warns when a TRD has more than 3 tasks; fails at 6+"
    - "Caller can determine from output whether to spawn df-job-checker (LLM-grade dimensions)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/trd-pre-check.cjs"
      provides: "cmdVerifyTrdPre command + dimension helpers"
      min_lines: 150
      exports: ["cmdVerifyTrdPre"]
    - path: "plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs"
      provides: "Unit tests for all four dimensions"
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/trd-pre-fixtures.cjs"
      provides: "Hand-built factory functions for TRD/objective scaffolds"
      min_lines: 60
      exports: ["makeTrdContent", "setupObjectiveDir"]
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "Dispatcher case for `verify trd-pre` subcommand"
      contains: "trd-pre"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/trd-pre-check.cjs"
      via: "require('./lib/trd-pre-check.cjs')"
      pattern: "trd-pre-check"
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "cmdVerifyTrdPre"
      via: "verify subcommand dispatcher"
      pattern: "trd-pre"
---

<objective>
Add `df-tools verify trd-pre <objective>` — a pure-logic, no-agent-spawn pre-flight checker that runs the mechanical dimensions of plan verification (requirement coverage, task completeness, dependency cycles, scope counts). Caller decides whether to additionally spawn `df-job-checker` for LLM-grade dimensions (must_haves quality, context compliance).

Purpose: F1 from issue #31 — flip job-checker default-on without paying agent-spawn cost on every plan-objective. Cheap checker amortizes the safety-net cost.

Output: New `lib/trd-pre-check.cjs` module + tests + dispatcher hook + fixture factory.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                              ← MODIFY (add dispatcher case)
├── df-tools.test.cjs                         ← MODIFY (add e2e dispatcher test)
└── lib/
    ├── trd-pre-check.cjs                     ← CREATE
    ├── trd-pre-check.test.cjs                ← CREATE
    └── __fixtures__/
        └── trd-pre-fixtures.cjs              ← CREATE
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: pure-logic verify command in `lib/verify.cjs`

```js
// plugins/devflow/devflow/bin/lib/verify.cjs (excerpt — cmdVerifyJobStructure)
function cmdVerifyJobStructure(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const fm = extractFrontmatter(content);
  const errors = [];
  const warnings = [];
  // ... dimension checks ...
  output({
    valid: errors.length === 0,
    errors, warnings, task_count: tasks.length, tasks,
    frontmatter_fields: Object.keys(fm),
  }, raw, errors.length === 0 ? 'valid' : 'invalid');
}

module.exports = { cmdVerifyJobStructure, /* ... */ };
```

### Pattern: dispatcher case in `df-tools.cjs`

```js
// plugins/devflow/devflow/bin/df-tools.cjs (excerpt — verify subcommand block)
case 'verify': {
  const subcommand = args[1];
  if (subcommand === 'job-structure') {
    cmdVerifyJobStructure(cwd, args[2], raw);
  } else if (subcommand === 'objective-completeness') {
    cmdVerifyObjectiveCompleteness(cwd, args[2], raw);
  } else if (subcommand === 'references') {
    cmdVerifyReferences(cwd, args[2], raw);
  } // ... etc.
  else {
    error('Unknown verify subcommand. Available: job-structure, objective-completeness, references, commits, artifacts, key-links');
  }
  break;
}
```

### Pattern: tests in `df-tools.test.cjs` using `node:test`

```js
// plugins/devflow/devflow/bin/df-tools.test.cjs (excerpt)
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('history-digest command', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('empty objectives directory returns valid schema', () => { /* ... */ });
});
```

### Pattern: existing fixture factory style

```js
// plugins/devflow/devflow/bin/lib/__fixtures__/trd-tdd-fixtures.cjs (existing)
function makeTrdWithFrontmatter({ objective, trd, type, ...overrides }) {
  return `---\nobjective: ${objective}\ntrd: "${trd}"\ntype: ${type}\n---\n\n# TRD\n`;
}
module.exports = { makeTrdWithFrontmatter };
```

### Pattern: extracting requirement IDs from ROADMAP

```js
// Reference: plugins/devflow/devflow/bin/lib/roadmap.cjs handles requirement extraction.
// For trd-pre-check, simplest path: regex `/\*\*Requirements:\*\*\s*\[?([^\]\n]+)\]?/i`
// against the objective's section in ROADMAP.md, then split on /,\s*/, strip brackets.
```

</codebase_examples>

<anti_patterns>
- DO NOT spawn any agent or subprocess from this module. Pure-logic only.
- DO NOT use LLM-generated test fixtures (per TDD playbook habit #4). Hand-build factories.
- DO NOT mutate existing verify subcommands' output shapes — `trd-pre` is a new namespace.
- DO NOT introduce new external dependencies. Use Node built-ins + existing helpers.
- DO NOT use property-based testing. Direct case enumeration.
</anti_patterns>

<error_recovery>
- If a TRD file is malformed (frontmatter parse error): include the TRD in the result with `error: "parse_failed"`, do not crash. Other TRDs continue to be checked.
- If the objective directory does not exist: return `{ error: "Objective not found", objective }` and exit non-zero.
- If `--raw` is passed: emit JSON only, no human-readable summary line.
- If ROADMAP.md is missing or has no `**Requirements:**` line for the objective: `requirement_coverage` returns `{ passed: true, missing: [], note: "no requirements declared" }` (do not fail — some objectives may genuinely have no requirements).
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/14-phase-f-default-on-safety/14-CONTEXT.md
@.planning/objectives/14-phase-f-default-on-safety/14-RESEARCH.md
@plugins/devflow/devflow/bin/lib/verify.cjs
@plugins/devflow/devflow/bin/lib/frontmatter.cjs
@plugins/devflow/devflow/bin/df-tools.cjs
</context>

<research_context>

From 14-RESEARCH.md § "F1 — Cheap CLI checker":

**Output shape (locked):**

```json
{
  "objective": "14-phase-f-default-on-safety",
  "passed": true,
  "needs_agent": false,
  "checks": {
    "requirement_coverage": { "passed": true, "missing": [] },
    "task_completeness":   { "passed": true, "incomplete": [] },
    "dependency_correctness": { "passed": true, "cycles": [], "orphan_refs": [] },
    "scope_sanity": { "passed": true, "oversized_trds": [], "total_trds": 5 }
  },
  "summary": "4/4 dimensions passed",
  "elapsed_ms": 87
}
```

**Dimensions (all pure-logic):**

| Dimension | Check |
|---|---|
| `requirement_coverage` | Every roadmap requirement ID for the objective appears in ≥1 TRD's `requirements` frontmatter |
| `task_completeness` | Every `<task>` (auto/tdd) has `<name>`, `<action>`, `<verify>`, `<done>` |
| `dependency_correctness` | `depends_on` graph: no cycles, no orphan refs |
| `scope_sanity` | Per-TRD task count ≤ 3 (warn), <6 (fail at 6+); per-objective TRD count ≤ 10 |

**Performance budget:** <2s wall clock. No subprocess spawns, no network.
</research_context>

<gotchas>
- The existing `cmdVerifyJobStructure` checks ONE TRD file at a time. `cmdVerifyTrdPre` must check ALL TRDs in an objective directory and aggregate results.
- `findObjectiveInternal(cwd, objective)` (in `lib/objective.cjs`) handles fuzzy objective name resolution — use it; do not re-implement.
- TRDs use kebab-case ID like `14-01`; `depends_on` may list `["14-01"]` or `["01"]`. Normalize before graph construction (strip `<objective>-` prefix if present).
- `extractFrontmatter` returns plain JS object; `requirements` may be a string `"F1, F2"` or an array `["F1", "F2"]`. Handle both.
- `<task>` blocks include both `<task type="auto">` and `<task type="tdd">` and `<task type="checkpoint:*">`. Checkpoint tasks have different element requirements (no `<verify>`/`<done>` required) — exclude them from task_completeness.
- ROADMAP.md `**Requirements:**` line may have requirement IDs in brackets `[F1, F2]` or unbracketed `F1, F2`. Strip brackets before splitting.
</gotchas>

<tasks>

<task type="tdd">
  <name>Task 1: Build fixture factory and dimension test cases (RED)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/trd-pre-fixtures.cjs, plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs</files>
  <action>
Test-list checklist (per TDD playbook habit #2 — write this list FIRST as a comment block in the test file):

```
// Test list:
// 1. requirement_coverage:
//    - happy: all requirement IDs covered → passed:true, missing:[]
//    - missing: requirement F2 absent from all TRDs → passed:false, missing:["F2"]
//    - no requirements declared in ROADMAP → passed:true, note set
//    - requirements as string "F1, F2" → both parsed
//    - requirements bracketed "[F1, F2]" → both parsed
// 2. task_completeness:
//    - happy: all tasks have name/action/verify/done → passed:true
//    - missing-action: one task missing <action> → incomplete:[{trd, task, missing:["action"]}]
//    - checkpoint task missing verify/done → still passed (checkpoints exempt)
// 3. dependency_correctness:
//    - happy: linear chain 01→02→03 → passed:true
//    - cycle: 01 depends_on 02, 02 depends_on 01 → cycles:[["01","02"]]
//    - orphan: 02 depends_on 99 → orphan_refs:[{trd:"02", missing:"99"}]
//    - empty depends_on → passed:true
// 4. scope_sanity:
//    - 3 tasks per TRD → passed:true
//    - 4 tasks → warning, still passed
//    - 6 tasks → passed:false, in oversized_trds
//    - 11 TRDs in objective → passed:false, total_trds reported
// 5. e2e (top-level cmdVerifyTrdPre):
//    - all four dimensions pass → result.passed:true, needs_agent:false
//    - any dimension fails → result.passed:false
//    - elapsed_ms field present and < 2000
//    - --raw mode emits JSON only, no human summary line
//    - non-existent objective → error key present, exit non-zero
//    - malformed TRD frontmatter → does not crash; that TRD reported with error
```

Build factory `__fixtures__/trd-pre-fixtures.cjs` exporting:
- `makeTrdContent({ objective, trd, requirements, depends_on, tasks })` — returns TRD markdown string. `tasks` is an array of `{ name, type, hasName, hasAction, hasVerify, hasDone }` (booleans control which elements get emitted, defaulting all true).
- `setupObjectiveDir(tmpRoot, { objective, roadmap_requirements, trds })` — creates `tmpRoot/.planning/objectives/<objective>/` with TRD files written, and `tmpRoot/.planning/ROADMAP.md` with requirements line. Returns the objective directory path.

Build test file `lib/trd-pre-check.test.cjs` covering every case in the checklist. Tests must compile and FAIL (because cmdVerifyTrdPre does not yet exist).

Run: `cd plugins/devflow/devflow/bin && node --test lib/trd-pre-check.test.cjs`
Expected: All tests fail (module not found / function undefined). Capture exit code != 0.

Commit RED: `test(14-01): add failing tests for cmdVerifyTrdPre cheap CLI checker`

# CRITICAL: Test list checklist MUST be a comment block at top of test file (TDD playbook habit #2 — reviewable artifact).
# CRITICAL: One test at a time philosophy — but they all live in one file; just don't batch dimension implementations later.
# GOTCHA: When asserting elapsed_ms, use `>= 0` not `> 0` (very fast paths can be 0ms on tmpfs).
# GOTCHA: Tests must use `os.tmpdir()` scaffolds, NOT real `.planning/` — never write to repo root.
# PATTERN: Mirror node:test setup from df-tools.test.cjs `describe('history-digest command', ...)` block.
  </action>
  <verify>
`cd plugins/devflow/devflow/bin && node --test lib/trd-pre-check.test.cjs 2>&1 | head -50` — exits non-zero, test failures shown for every dimension and e2e case.
`grep -c "^//" plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs` returns a number ≥ 15 (test list checklist as comments).
`test -f plugins/devflow/devflow/bin/lib/__fixtures__/trd-pre-fixtures.cjs` succeeds.
  </verify>
  <done>
Test file exists with full test-list checklist + ≥18 individual test cases covering all four dimensions + e2e. Fixture factory exports `makeTrdContent` and `setupObjectiveDir`. All tests fail because `cmdVerifyTrdPre` is not yet implemented. RED commit landed with `test(14-01):` prefix.
  </done>
  <recovery>
If `node --test` cannot find the test file: ensure path is `plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs` (matches existing pattern of co-located `*.test.cjs` files).
If fixture factory has a syntax error: run `node -e "require('./plugins/devflow/devflow/bin/lib/__fixtures__/trd-pre-fixtures.cjs')"` from repo root, fix until clean.
If a test passes accidentally (because the function happens to exist somewhere): grep for `cmdVerifyTrdPre` in `lib/` — there must be zero matches before this commit.
  </recovery>
</task>

<task type="tdd">
  <name>Task 2: Implement cmdVerifyTrdPre with all four dimensions (GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/trd-pre-check.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Create `plugins/devflow/devflow/bin/lib/trd-pre-check.cjs` exporting `cmdVerifyTrdPre(cwd, objective, raw)`. Implementation strategy:

```
1. Resolve objective directory via findObjectiveInternal(cwd, objective). Error out if not found.
2. List *-TRD.md files in objective directory.
3. For each TRD: extractFrontmatter, count <task> blocks (excluding checkpoint:*), check each task for <name>/<action>/<verify>/<done> presence.
4. Build dependency graph from depends_on values (normalize: strip "<objective>-" prefix).
5. Detect cycles via DFS with white/gray/black coloring.
6. Detect orphan refs: any depends_on target not in the set of declared TRD IDs.
7. Read ROADMAP.md, extract `**Requirements:**` line for this objective (use roadmap.cjs helper if available, else regex).
8. Aggregate dimension results into output shape from RESEARCH.md.
9. Compute elapsed_ms via process.hrtime.bigint() at function entry/exit.
10. Determine passed (all four dimensions pass) and needs_agent (any failure where LLM judgment WOULDN'T help — failures here are mechanical, so needs_agent stays false; the agent is for OTHER dimensions).
11. Call output(result, raw, summary_line) using helpers.cjs.
```

Wire into `plugins/devflow/devflow/bin/df-tools.cjs`:
- Add `const { cmdVerifyTrdPre } = require('./lib/trd-pre-check.cjs');` near the existing verify imports (around line 158).
- Add dispatcher branch in the `case 'verify':` block (around line 350):

```js
} else if (subcommand === 'trd-pre') {
  cmdVerifyTrdPre(cwd, args[2], raw);
}
```

- Update the unknown-subcommand error message to include `trd-pre` in the available list.
- Update the `verify <subcommand>` help comment block (around line 85) to document `verify trd-pre <objective>`.

Run tests one at a time per TDD playbook habit #3:
- Implement `requirement_coverage` only → run tests → those pass → continue.
- Implement `task_completeness` → run tests → continue.
- Implement `dependency_correctness` → run tests → continue.
- Implement `scope_sanity` → run tests → continue.
- Implement e2e wrapper + dispatcher → run tests → all pass.

Run: `cd plugins/devflow/devflow/bin && node --test lib/trd-pre-check.test.cjs`
Expected: All tests pass.

Run full suite: `npm test`
Expected: 1471 + new tests, 0 failures, 0 regressions.

Commit GREEN: `feat(14-01): implement df-tools verify trd-pre cheap CLI checker`

# CRITICAL: Cycle detection — use white/gray/black DFS coloring; a "back edge" to a gray node is a cycle. Do not use simple visited set (gives false positives on shared ancestors).
# CRITICAL: requirements field may be string OR array — normalize via `Array.isArray(req) ? req : String(req).split(/,\s*/)` after stripping brackets.
# GOTCHA: <task type="checkpoint:human-verify"> blocks have NO required <verify>/<done> — task_completeness must skip them. Detect via /<task[^>]*type=["']?checkpoint/.
# GOTCHA: depends_on YAML may be `[]`, `["01"]`, `[14-01]` (no quotes), or null. extractFrontmatter handles parsing; just guard against null/undefined.
# PATTERN: Follow output(result, raw, summary) signature from helpers.cjs (used by all existing cmdVerify* functions).
  </action>
  <verify>
`cd plugins/devflow/devflow/bin && node --test lib/trd-pre-check.test.cjs 2>&1 | tail -5` — shows `# pass <N>`, `# fail 0`.
`npm test 2>&1 | tail -5` — shows test pass count ≥ baseline + new tests, 0 failures.
`node plugins/devflow/devflow/bin/df-tools.cjs verify trd-pre 14 --raw | jq -e '.passed,.checks'` — emits structured JSON with all dimensions present.
`time node plugins/devflow/devflow/bin/df-tools.cjs verify trd-pre 14 > /dev/null` — wall clock < 2s.
`grep -c "trd-pre" plugins/devflow/devflow/bin/df-tools.cjs` returns ≥ 2 (dispatcher case + help comment).
  </verify>
  <done>
`lib/trd-pre-check.cjs` exists, exports `cmdVerifyTrdPre`, implements all four dimensions per RESEARCH.md output shape. df-tools.cjs dispatcher handles `verify trd-pre <objective>`. All TRD-01 tests pass. Full suite still passes (no regressions). End-to-end CLI invocation against this very objective (`14`) returns structured JSON in <2s. GREEN commit landed with `feat(14-01):` prefix.
  </done>
  <recovery>
If full suite shows regressions: bisect by reverting to RED commit and re-applying only the new files (no changes to existing files outside dispatcher case + help comment). The change in df-tools.cjs is additive — should never break existing tests.
If wall-clock > 2s: profile via `node --prof`, check for accidental nested glob or repeated file reads. Cache TRD reads — read each TRD once, parse once.
If cycle detection misfires on diamond dependency (A → B,C; B,C → D — should pass): you used simple visited-set coloring; switch to white/gray/black.
  </recovery>
</task>

<task type="tdd">
  <name>Task 3: Add dispatcher e2e test + (optional) refactor (REFACTOR)</name>
  <files>plugins/devflow/devflow/bin/df-tools.test.cjs, plugins/devflow/devflow/bin/lib/trd-pre-check.cjs</files>
  <action>
Add a top-level integration test in `df-tools.test.cjs` that asserts the dispatcher path works end-to-end (spawns df-tools.cjs as a subprocess and parses --raw JSON). Mirror the existing pattern from other dispatcher tests:

```js
describe('verify trd-pre command', () => {
  // builds a tmp .planning/ scaffold, runs df-tools verify trd-pre via execFileSync,
  // parses --raw JSON, asserts shape and passed status
});
```

Three sub-cases:
1. Happy path — well-formed objective scaffold → exit 0, passed:true.
2. Missing requirement coverage — exit non-zero, passed:false, missing array populated.
3. Unknown objective → exit non-zero, error key in JSON.

Then assess whether refactor is needed:
- Are dimension functions cleanly named and ≤ ~30 lines each? If yes: skip refactor, no commit.
- Is there duplicated TRD-loading logic between dimensions? If yes: extract `loadTrds(objectiveDir)` helper.
- Is the cycle detection function readable? If not: add inline comments OR rename for clarity.

Run full suite: `npm test`
Expected: All tests pass; new dispatcher e2e tests pass.

Commit decision per TDD playbook:
- If refactor was made: `refactor(14-01): extract loadTrds helper and clarify cycle detection`
- If no refactor needed: still commit the dispatcher e2e test as `test(14-01): add dispatcher e2e test for verify trd-pre`

# GOTCHA: execFileSync test pattern — capture both stdout and exit code. Use `{ encoding: 'utf-8' }` and wrap in try/catch to handle non-zero exits without throwing the test.
# GOTCHA: Don't write tmpdir scaffolds inside repo root. Use `os.tmpdir()`.
# PATTERN: Existing df-tools.test.cjs has subprocess invocation patterns — mirror exactly (look for execFileSync usages).
  </action>
  <verify>
`npm test 2>&1 | tail -5` — all tests pass, test count = baseline + Task 1 tests + 3 e2e cases.
`grep -c "verify trd-pre" plugins/devflow/devflow/bin/df-tools.test.cjs` returns ≥ 3 (one describe block + ≥2 happy/sad path tests).
`git log --oneline -3` shows commits for tasks 1, 2, 3 in order with correct prefixes (`test(14-01):`, `feat(14-01):`, then `test(14-01):` or `refactor(14-01):`).
  </verify>
  <done>
Dispatcher e2e tests exist and pass. Optional refactor performed (or skipped with rationale in SUMMARY). 1471 + new tests pass total. Three commits visible in git log with correct conventional prefixes.
  </done>
  <recovery>
If e2e test fails because subprocess can't find df-tools.cjs: verify the test path uses `path.join(__dirname, 'df-tools.cjs')` (relative to test file location), not a hardcoded path.
If refactor breaks tests that previously passed: revert the refactor commit (`git reset --hard HEAD~1`), keep the e2e test, ship with no refactor.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(no lint configured for plugins/devflow at present — skip)</lint>
<test>npm test</test>
<build>(no build step — pure CJS)</build>
</validation_gates>

<verification>
- `df-tools verify trd-pre 14 --raw` returns valid JSON with all four dimension keys
- Wall-clock execution time < 2s
- Cycle detection correctly identifies cycles and accepts diamond dependencies
- Tests cover all dimensions + back-compat cases (string vs array requirements, bracketed vs not)
- Full suite passes with no regressions
</verification>

<success_criteria>
- [ ] `lib/trd-pre-check.cjs` exists, exports `cmdVerifyTrdPre`, ≥150 lines
- [ ] `lib/trd-pre-check.test.cjs` exists with test-list comment block + ≥18 test cases
- [ ] `__fixtures__/trd-pre-fixtures.cjs` exists with hand-built factory functions
- [ ] `df-tools.cjs` dispatcher handles `verify trd-pre <objective>` and `--raw`
- [ ] `df-tools.cjs` help comment block documents `verify trd-pre`
- [ ] Three atomic commits: RED test → GREEN feat → (refactor OR test e2e)
- [ ] All tests pass; no regressions in 1471 baseline
- [ ] Manual smoke: `df-tools verify trd-pre 14` runs in <2s and emits structured JSON
</success_criteria>

<output>
After completion, create `.planning/objectives/14-phase-f-default-on-safety/14-01-SUMMARY.md` per `~/.claude/devflow/templates/summary.md`. Include:
- Three commit hashes (RED, GREEN, third)
- Test count delta (baseline → new total)
- Wall-clock measurement of `verify trd-pre 14`
- Whether Task 3 was refactor or test-only
</output>
