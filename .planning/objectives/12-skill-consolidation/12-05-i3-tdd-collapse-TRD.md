---
objective: 12-skill-consolidation
trd: 05
type: tdd
confidence: medium
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/agents/planner.md
  - plugins/devflow/agents/executor.md
  - plugins/devflow/devflow/references/tdd.md
  - plugins/devflow/devflow/bin/lib/trd-tdd.cjs
  - plugins/devflow/devflow/bin/lib/trd-tdd.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/trd-tdd-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - PHASE-I3
must_haves:
  truths:
    - "Planner emits task-level `tdd=\"true\"` attribute on testable tasks (no longer requires dedicated type:tdd TRDs)"
    - "Executor runs RED→GREEN→REFACTOR cycle for any task where tdd=\"true\""
    - "Existing type:tdd TRDs still work (back-compat — type:tdd implies all tasks default tdd=true unless explicitly tdd=false)"
    - "df-tools trd-tdd inspect <trd-path> returns JSON listing each task's effective tdd flag (test fixture for executor + planner)"
    - "references/tdd.md documents BOTH forms during transition window"
    - "Executor preamble shrinks (planner.md grows ~10 lines, executor.md shrinks ~50 lines net)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/trd-tdd.cjs"
      provides: "parseTrdTasks + resolveEffectiveTddFlag + cmdTrdTddInspect"
      contains: "module.exports"
    - path: "plugins/devflow/devflow/bin/lib/trd-tdd.test.cjs"
      provides: "RED→GREEN tests for parseTrdTasks + back-compat resolution + CLI integration"
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/trd-tdd-fixtures.cjs"
      provides: "Hand-built TRD content fixtures (legacy type:tdd, new task-level, mixed, override-false)"
    - path: "plugins/devflow/agents/planner.md"
      provides: "Updated TDD detection section emitting task-level tdd attribute"
      contains: "tdd=\"true\""
    - path: "plugins/devflow/agents/executor.md"
      provides: "Unified TDD execution branch handling both type:tdd and task-level tdd"
      contains: "resolveEffectiveTddFlag"
    - path: "plugins/devflow/devflow/references/tdd.md"
      provides: "Reference doc covering BOTH forms during transition window"
      contains: "task-level tdd attribute"
  key_links:
    - from: "plugins/devflow/agents/planner.md"
      to: "task-level tdd attribute emission"
      via: "Updated TDD Detection section"
      pattern: "tdd=\"true\""
    - from: "plugins/devflow/agents/executor.md"
      to: "df-tools trd-tdd inspect"
      via: "Effective-flag resolution at task-execution time"
      pattern: "trd-tdd inspect|resolveEffectiveTddFlag"
    - from: "plugins/devflow/devflow/bin/lib/trd-tdd.cjs"
      to: "TRD frontmatter + task XML"
      via: "parseTrdTasks reads both type:tdd and task tdd attribute"
      pattern: "frontmatter.type === 'tdd'"
---

<objective>
Phase I3 — Collapse the TDD-as-TRD-type pattern into a task-level `tdd="true"` flag. Preserve back-compat: existing `type: tdd` TRDs still work; planner emits task-level flag for new TRDs; executor handles both forms with one unified branch.

Purpose: Today, TDD adoption forces a separate "TDD TRD" per testable feature, fragmenting plans (e.g., a 3-task TRD where tasks 1-2 are config and task 3 is testable forces splitting into 2 TRDs). Task-level flag lets a single TRD mix testable + non-testable tasks naturally. Net savings: ~50 lines in executor preamble, plus removes a planning decision point.

This TRD is INDEPENDENT of the skill-consolidation TRDs (different files; can run Wave 1 in parallel with 12-01 and 12-06).

Output: `lib/trd-tdd.cjs` helper module with TDD test pairing parser + back-compat resolver + CLI inspector. Planner agent emits task-level flag. Executor agent unifies branches. Reference doc documents both forms.
</objective>

<file_tree>
plugins/devflow/
├── agents/
│   ├── planner.md                                     ← MODIFY (lines ~199-209 — TDD Detection section)
│   └── executor.md                                    ← MODIFY (lines ~302-347 — unify <tdd_execution> branch)
└── devflow/
    ├── bin/
    │   ├── df-tools.cjs                               ← MODIFY (add `case 'trd-tdd'` arm)
    │   └── lib/
    │       ├── trd-tdd.cjs                            ← CREATE
    │       ├── trd-tdd.test.cjs                       ← CREATE
    │       └── __fixtures__/
    │           └── trd-tdd-fixtures.cjs               ← CREATE
    └── references/
        └── tdd.md                                     ← MODIFY (document both forms)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: Existing planner.md TDD Detection (lines ~199-209) — what we're replacing:**

```markdown
## TDD Detection

**Heuristic:** Can you write `expect(fn(input)).toBe(output)` before writing `fn`?
- Yes → Create a dedicated TDD TRD (type: tdd)
- No → Standard task in standard TRD

**TDD candidates (dedicated TDD TRDs):** Business logic with defined I/O, API endpoints with request/response contracts, data transformations, validation rules, algorithms, state machines.

**Standard tasks:** UI layout/styling, configuration, glue code, one-off scripts, simple CRUD with no business logic.

**Why TDD gets own TRD:** TDD requires RED→GREEN→REFACTOR cycles consuming 40-50% context. Embedding in multi-task TRDs degrades quality.
```

**Pattern: Existing executor.md `<tdd_execution>` block (lines ~302-347) — what we're rewriting:**

```markdown
<tdd_execution>
When executing task with `type="tdd"` (TRD-level) or `tdd="true"` (legacy):
...
</tdd_execution>
```

(Note: executor ALREADY checks `tdd="true"` as legacy — this TRD makes it primary and back-compats `type: tdd`.)

**Pattern: parseTrdTasks (mirror of frontmatter.cjs::extractFrontmatter):**

```javascript
function parseTrdTasks(trdContent) {
  // 1. Extract frontmatter
  const fm = extractFrontmatter(trdContent);

  // 2. Find <TRD-task-ex ...> XML elements
  const taskRegex = /<TASK-EX\s+([^>]+)>/g;
  const tasks = [];
  let m;
  while ((m = taskRegex.exec(trdContent)) !== null) {
    const attrs = parseAttrs(m[1]);  // {type, tdd, ...}
    tasks.push({ type: attrs.type, tdd: attrs.tdd === 'true' ? true : (attrs.tdd === 'false' ? false : null) });
  }
  return { frontmatter: fm, tasks };
}
```

**Pattern: resolveEffectiveTddFlag (back-compat resolver):**

```javascript
function resolveEffectiveTddFlag(frontmatterType, taskTddAttr) {
  // Explicit task override wins
  if (taskTddAttr === true) return true;
  if (taskTddAttr === false) return false;
  // Inherit from TRD-level type
  if (frontmatterType === 'tdd') return true;
  return false;
}
```

**Pattern: Hand-built TRD fixtures (mirror of __fixtures__/awareness-fixtures.cjs):**

```javascript
function buildLegacyTddTrd() {
  return `---
type: tdd
trd: 99
---
<TRD-task-ex type="tdd">
  <name>Task 1</name>
  <action>...</action>
</TRD-task-ex>
`;
}

function buildTaskLevelTddTrd() {
  return `---
type: standard
trd: 99
---
<TRD-task-ex type="auto" tdd="true">
  <name>Task 1 (testable)</name>
</TRD-task-ex>
<TRD-task-ex type="auto">
  <name>Task 2 (config)</name>
</TRD-task-ex>
`;
}
```

</codebase_examples>

<anti_patterns>

- **Removing back-compat (breaking existing `type: tdd` TRDs)** — objs 10, 11 are mid-flight. Their TRDs use `type: tdd`. They MUST continue to work without re-planning.
- **Implicit TDD inference** — only fire RED→GREEN cycle when EXPLICITLY tagged. No "did the task name contain test?" heuristics.
- **Removing planner heuristic entirely** — planner still detects TDD candidates; just emits task-level flag instead of forcing TRD split.
- **LLM-generated test data for parser tests** — use `__fixtures__/trd-tdd-fixtures.cjs` factory builders.
- **Property-based testing** — finite cases. Enumerate.

</anti_patterns>

<error_recovery>

- **Existing TRDs in flight (objs 10, 11) start failing executor mid-flow** — back-compat resolver MUST treat `type: tdd` as "all tasks default tdd=true". If a task in such a TRD has explicit `tdd="false"`, that overrides (rare).
- **Planner outputs malformed task-level flag (e.g., `tdd=true` without quotes)** — XML parser must accept both quoted and unquoted; test PA3 covers.
- **Reference doc out of sync with reality** — references/tdd.md is the canonical source for executor + planner during transition. If a question arises about precedence, check the reference doc.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/12-skill-consolidation/12-CONTEXT.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md

# Files being modified
@plugins/devflow/agents/planner.md
@plugins/devflow/agents/executor.md
@plugins/devflow/devflow/references/tdd.md

# Sibling lib for pattern reference
@plugins/devflow/devflow/bin/lib/frontmatter.cjs

# Reference: existing TRD example (mid-flight, must not break)
@.planning/objectives/10-phase-e-agent-audit/10-01-audit-and-remediate-TRD.md
</context>

<research_context>

From `12-RESEARCH.md` § "TDD collapse design (I3)":

**Today (TRD-level):**
```yaml
---
type: tdd
---
```

**After (task-level):**
```xml
<TRD-task-ex type="auto" tdd="true">
  <name>Add validateEmail function</name>
</TRD-task-ex>
```

**Back-compat resolver:**
- Task `tdd="true"` → run TDD cycle for THIS task
- Task `tdd="false"` → never run TDD cycle for this task
- Task `tdd` absent + TRD `type: tdd` → run TDD (back-compat: TRD-level implies all tasks default true)
- Task `tdd` absent + TRD `type: standard` → no TDD

**Net change:** planner.md grows ~10 lines (task-level flag emission rule), executor.md shrinks ~50 lines (single branch instead of two). References/tdd.md grows ~30 lines documenting both forms.

</research_context>

<gotchas>

- **`type: tdd` MUST remain accepted in TRD frontmatter** — the planner agent's frontmatter validator (df-tools verify trd-structure) doesn't change. We add `tdd` task attribute as ALSO accepted.
- **`extractFrontmatter()` from frontmatter.cjs is permissive** — already accepts unknown fields. No parser changes needed for the frontmatter side.
- **XML attribute parsing** — TRDs use a relaxed XML-like syntax. Use a simple regex parser or borrow from existing TRD parsing utilities. Don't introduce a full XML parser dependency.
- **Test pairing rule** still applies — every source file with logic has a paired test file. Task-level tdd flag doesn't change this; the planner still enforces it.

</gotchas>

<tasks>

<task type="tdd">
  <name>Task 1: TDD — trd-tdd parser + back-compat resolver + CLI helper</name>
  <files>plugins/devflow/devflow/bin/lib/trd-tdd.cjs, plugins/devflow/devflow/bin/lib/trd-tdd.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/trd-tdd-fixtures.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
RED → GREEN for the parser + resolver + CLI inspector.

**Test list:**

Group PA (parseTrdTasks):
- PA1: parse legacy `type: tdd` TRD with 2 tasks → returns `{frontmatter: {type:'tdd'}, tasks: [{type:'tdd', tdd:null}, {type:'tdd', tdd:null}]}`
- PA2: parse task-level TRD with mixed `tdd="true"` + no flag → `[{type:'auto', tdd:true}, {type:'auto', tdd:null}]`
- PA3: parse with unquoted attribute (`tdd=true`) → still resolves to `tdd:true` (relaxed parsing)
- PA4: parse with explicit `tdd="false"` → `{type:'auto', tdd:false}`
- PA5: parse TRD with no tasks → `{frontmatter: {...}, tasks: []}`
- PA6: parse malformed TRD (no closing `>`) → graceful skip, returns parsed-so-far

Group RE (resolveEffectiveTddFlag):
- RE1: `resolveEffectiveTddFlag('tdd', null)` → true (legacy back-compat)
- RE2: `resolveEffectiveTddFlag('tdd', true)` → true (explicit, redundant but valid)
- RE3: `resolveEffectiveTddFlag('tdd', false)` → false (explicit override of TRD-level type)
- RE4: `resolveEffectiveTddFlag('standard', true)` → true (new task-level pattern)
- RE5: `resolveEffectiveTddFlag('standard', null)` → false (no TDD)
- RE6: `resolveEffectiveTddFlag('standard', false)` → false (explicit no-TDD)
- RE7: `resolveEffectiveTddFlag(undefined, true)` → true (missing frontmatter type defaults to standard)

Group CLI (cmdTrdTddInspect):
- CLI1: `df-tools trd-tdd inspect <legacy-tdd.md>` → JSON `{frontmatter, tasks: [{name, type, tdd_attr, tdd_effective}]}`, all `tdd_effective: true`
- CLI2: `df-tools trd-tdd inspect <TASK-EX-level.md>` → mixed `tdd_effective` per task per fixture
- CLI3: `df-tools trd-tdd inspect <missing-file>` → exits 1, error JSON
- CLI4: `--raw` flag returns canonical JSON (no decoration)

Group F (fixtures):
- F1: `buildLegacyTddTrd()` returns valid TRD content with `type: tdd` + 2 plain tasks
- F2: `buildTaskLevelTddTrd()` returns valid TRD content with `type: standard` + mixed tasks
- F3: `buildOverrideTddTrd()` returns TRD with `type: tdd` + one task `tdd="false"`
- F4: `buildMalformedTrd()` returns intentionally broken TRD content for PA6

Group EX (export-lock):
- EX1: `Object.keys(trd-tdd.cjs.exports).sort()` deepStrictEqual canonical 6-entry list:
  `['_resetMocks', '_setRunFs', 'cmdTrdTddInspect', 'parseTrdTasks', 'resolveEffectiveTddFlag', '<banner-string-or-other-helper>']`
- EX2: Banner comment `LOCKED by TRD 12-05` present

**Implementation (GREEN):**

`lib/trd-tdd.cjs`:

```javascript
'use strict';

const fs = require('fs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { output, error } = require('./helpers.cjs');

const realFs = { readFileSync: fs.readFileSync, existsSync: fs.existsSync };
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

function _parseAttrs(attrStr) {
  const attrs = {};
  // Match key="value" OR key='value' OR key=value
  const re = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
  }
  return attrs;
}

function parseTrdTasks(trdContent) {
  const fm = extractFrontmatter(trdContent) || {};
  const taskRegex = /<TASK-EX\s+([^>]+?)>([\s\S]*?)<\/task>/g;
  const tasks = [];
  let m;
  while ((m = taskRegex.exec(trdContent)) !== null) {
    const attrs = _parseAttrs(m[1]);
    const body = m[2];
    const nameMatch = body.match(/<name>([^<]+)<\/name>/);
    const tddVal = attrs.tdd === 'true' ? true : (attrs.tdd === 'false' ? false : null);
    tasks.push({
      name: nameMatch ? nameMatch[1].trim() : '(unnamed)',
      type: attrs.type || 'auto',
      tdd_attr: tddVal,
    });
  }
  return { frontmatter: fm, tasks };
}

function resolveEffectiveTddFlag(frontmatterType, taskTddAttr) {
  if (taskTddAttr === true) return true;
  if (taskTddAttr === false) return false;
  if (frontmatterType === 'tdd') return true;
  return false;
}

function cmdTrdTddInspect(cwd, trdPath, raw) {
  if (!trdPath) { error('Usage: df-tools trd-tdd inspect <trd-path>'); return; }
  if (!_runFs.existsSync(trdPath)) {
    output({ error: 'TRD file not found', path: trdPath }, raw);
    process.exit(1);
  }
  const content = _runFs.readFileSync(trdPath, 'utf-8');
  const { frontmatter, tasks } = parseTrdTasks(content);
  const inspected = tasks.map(t => ({
    ...t,
    tdd_effective: resolveEffectiveTddFlag(frontmatter.type, t.tdd_attr),
  }));
  output({ frontmatter, tasks: inspected }, raw);
}

// ─── module.exports — LOCKED by TRD 12-05 (5-entry surface; SC-I3)
//     DO NOT MODIFY without updating EX1 export-lock test atomically.
module.exports = {
  parseTrdTasks,
  resolveEffectiveTddFlag,
  cmdTrdTddInspect,
  _setRunFs,
  _resetMocks,
};
```

`df-tools.cjs` arm:

```javascript
case 'trd-tdd': {
  const { cmdTrdTddInspect } = require('./lib/trd-tdd.cjs');
  const sub = argv[1];
  const raw = argv.includes('--raw');
  if (sub === 'inspect') {
    cmdTrdTddInspect(cwd, argv[2], raw);
  } else {
    error('Usage: df-tools trd-tdd inspect <trd-path>');
  }
  break;
}
```

# CRITICAL: extractFrontmatter from frontmatter.cjs is permissive — works as-is, no changes.
# CRITICAL: _parseAttrs handles 3 quote styles (test PA3 covers unquoted).
# CRITICAL: Banner is 5 entries (NOT 8). Different module from skill-route.cjs.
# GOTCHA: process.exit(1) on missing file — match obj 5 cmdInitiativesSync error pattern.
# PATTERN: Mirror lib/awareness-cli.cjs CLI inspector shape.

**REFACTOR (optional):** Extract `_extractTaskName(body)` helper if multiple tasks need name extraction. Optional.
  </action>
  <verify>
```bash
cd plugins/devflow/devflow/bin && node --test lib/trd-tdd.test.cjs 2>&1 | tail -25
# All PA/RE/CLI/F/EX tests pass

# Manual smoke against an existing TRD:
node df-tools.cjs trd-tdd inspect .planning/objectives/10-phase-e-agent-audit/10-01-audit-and-remediate-TRD.md
# Should return JSON with each task's tdd_effective resolved per back-compat

cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test
```
  </verify>
  <done>
RED + GREEN commits exist. All test groups pass. CLI inspector resolves real existing TRDs from objs 10/11 with back-compat semantics. `npm test` passes.
  </done>
  <recovery>
- If RE1 fails (legacy `type: tdd` not implying tdd=true), the resolver order is wrong — explicit task value wins, then TRD-level fallback.
- If PA6 throws on malformed TRD, wrap regex iteration in try/catch and return whatever was parsed.
- If CLI3 doesn't exit 1, check `process.exit(1)` is called BEFORE `output()` (which itself calls `process.exit(0)`).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Update planner.md + executor.md + references/tdd.md to use task-level flag</name>
  <files>plugins/devflow/agents/planner.md, plugins/devflow/agents/executor.md, plugins/devflow/devflow/references/tdd.md</files>
  <action>
Standard task — agent prompt editing. Atomic single commit (3 files).

**Step 1: Update `plugins/devflow/agents/planner.md` lines ~199-209 (TDD Detection section):**

Replace the current section with:

```markdown
## TDD Detection

**Heuristic:** Can you write `expect(fn(input)).toBe(output)` before writing `fn`?
- Yes → Mark the task with `tdd="true"` attribute (task-level flag)
- No → Plain task (no flag)

**TDD candidates (per global TDD playbook):** Business logic with defined I/O, API endpoints with request/response contracts, data transformations, validation rules, algorithms, state machines.

**Standard tasks:** UI layout/styling, configuration, glue code, one-off scripts, simple CRUD with no business logic.

**Task-level flag emission rule:**

```xml
<TRD-task-ex type="auto" tdd="true">
  <name>Add validateEmail function</name>
  <files>src/lib/email.cjs, src/lib/email.test.cjs</files>
  <action>...</action>
  <verify>...</verify>
  <done>...</done>
</task>
```

**Why task-level (replaces dedicated `type: tdd` TRDs):** A single TRD can mix testable + non-testable tasks. No more forced TRD splits. Test-pairing rule still applies (every source file with logic has a paired test file).

**Back-compat:** Existing TRDs with `type: tdd` (in-flight objs 10, 11) continue to work — executor treats `type: tdd` as "all tasks default `tdd="true"` unless explicit `tdd="false"`".

**When to use TRD-level `type: tdd` going forward:** Only when ALL tasks in a TRD are TDD candidates (rare). Otherwise prefer task-level flag.
```

**Step 2: Update `plugins/devflow/agents/executor.md` lines ~302-347 (`<tdd_execution>` block):**

Replace with a unified branch keyed off task-level effective flag:

```markdown
<tdd_execution>
**Resolution:** Before executing a task, resolve its effective TDD flag using `df-tools trd-tdd inspect`:

```bash
TDD_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs trd-tdd inspect "$TRD_PATH" --raw)
# JSON: { frontmatter, tasks: [{name, type, tdd_attr, tdd_effective}, ...] }
```

For each task, `tdd_effective: true` triggers RED→GREEN→REFACTOR. `tdd_effective: false` runs as a standard task.

**Effective-flag rules (handled by `df-tools trd-tdd inspect`):**
- Task `tdd="true"` → effective TRUE
- Task `tdd="false"` → effective FALSE
- Task absent + TRD `type: tdd` → effective TRUE (back-compat)
- Task absent + TRD `type: standard` → effective FALSE

**1. Check test infrastructure** (if first TDD task in this TRD): detect project type, install test framework if needed.

**2. RED phase — Write failing test:**
- Read `<behavior>` or `<test>` element (or `<action>` for task-level pattern)
- Create test file, write failing tests
- Run test command — MUST fail (exit code != 0)
- **Capture evidence:**
  ```
  RED_CMD="npm test -- --grep 'feature'"
  RED_OUTPUT=$(eval "$RED_CMD" 2>&1)
  RED_EXIT=$?
  # RED_EXIT MUST be non-zero. If 0, investigate: feature already exists or test is wrong.
  ```
- Commit: `test({objective}-{trd}): add failing test for [feature]`

**3. GREEN phase — Make test pass:**
- Write minimal code to pass
- Run test command — MUST pass (exit code == 0)
- **Capture evidence:**
  ```
  GREEN_CMD="npm test -- --grep 'feature'"
  GREEN_OUTPUT=$(eval "$GREEN_CMD" 2>&1)
  GREEN_EXIT=$?
  # GREEN_EXIT MUST be 0. If non-zero, debug/iterate (max 3 attempts).
  ```
- Commit: `feat({objective}-{trd}): implement [feature]`

**4. REFACTOR phase (if needed):**
- Clean up implementation
- Run tests — MUST still pass
- Commit only if changes: `refactor({objective}-{trd}): clean up [feature]`

**Error handling:** RED doesn't fail → investigate (feature exists or test wrong). GREEN doesn't pass after 3 attempts → document and continue. REFACTOR breaks → undo.

**Evidence storage:** All phase evidence (command, output, exit code) stored for SUMMARY.md TDD Evidence table.
</tdd_execution>
```

**Step 3: Update `plugins/devflow/devflow/references/tdd.md`** — add a "Forms" section documenting both:

```markdown
## Forms (transition window)

DevFlow accepts TWO forms of TDD declaration during the v1.2+ transition:

### Form A — Task-level flag (PREFERRED, v1.2 obj 3+)

```xml
  <TASK-EX type="auto" tdd="true">
    <name>Add validateEmail function</name>
    <files>src/lib/email.cjs, src/lib/email.test.cjs</files>
    ...
  </TASK-EX>
  ```

Use this when only SOME tasks in a TRD are testable (mixed TRD).

### Form B — TRD-level type (LEGACY, back-compat)

```yaml
---
type: tdd
---
```

Treats ALL tasks in this TRD as `tdd="true"` unless explicitly `tdd="false"`. Existing TRDs (objs 10, 11) use this form. New TRDs SHOULD prefer Form A.

### Resolution precedence

`df-tools trd-tdd inspect <trd-path>` resolves the effective flag per task:

| Task `tdd` attr | Frontmatter `type` | Effective TDD |
|---|---|---|
| `"true"` | (any) | TRUE |
| `"false"` | (any) | FALSE |
| absent | `tdd` | TRUE |
| absent | `standard` | FALSE |

### Iron Law (unchanged)

No production code without a failing test first. RED → GREEN → REFACTOR.
```

# CRITICAL: Atomic 3-file commit. Planner+executor+reference must agree on the rules.
# CRITICAL: Existing TRDs (objs 10, 11) in `.planning/objectives/` MUST NOT be touched. Back-compat handles them.
# GOTCHA: Don't replace executor.md `<tdd_execution>` content wholesale — preserve evidence-capture format (RED/GREEN/REFACTOR commands, exit codes); only replace the GUARD CONDITION (was: `type === 'tdd' OR tdd === 'true'`; now: use trd-tdd inspect).
# GOTCHA: planner.md "Why TDD gets own TRD" justification is REPLACED by "Why task-level". Don't keep contradictory text.
# PATTERN: Reference doc as canonical source of truth (mirrors references/testing-strategy.md from obj 0).
  </action>
  <verify>
```bash
# Verify atomic commit:
git diff --name-only HEAD~1 HEAD | grep -c -E '(planner\.md|executor\.md|tdd\.md)'
# Expected: 3

# Verify text changes:
grep -q 'tdd="true"' plugins/devflow/agents/planner.md
grep -q 'trd-tdd inspect' plugins/devflow/agents/executor.md
grep -q 'Form A — Task-level flag' plugins/devflow/devflow/references/tdd.md

# Smoke against an existing in-flight TRD:
node ~/.claude/devflow/bin/df-tools.cjs trd-tdd inspect .planning/objectives/11-phase-d-verifier-wiring/11-01-diagnose-and-fix-TRD.md
# Should return JSON with tdd_effective resolved per back-compat

# Verify 12-05's own TRDs (this TRD!) parses correctly:
node ~/.claude/devflow/bin/df-tools.cjs trd-tdd inspect .planning/objectives/12-skill-consolidation/12-05-i3-tdd-collapse-TRD.md
# Task 1 is type="tdd" → tdd_effective: true; Task 2 is type="auto" with no tdd flag → tdd_effective: false

npm test
```
  </verify>
  <done>
- planner.md TDD Detection section emits task-level flag rule
- executor.md `<tdd_execution>` uses df-tools trd-tdd inspect for resolution
- references/tdd.md documents both forms with precedence table
- 3 files in single atomic commit
- `df-tools trd-tdd inspect` works against real existing TRDs (objs 10, 11)
- `npm test` passes
  </done>
  <recovery>
- **executor.md changes break in-flight TRDs (objs 10, 11)** — verify back-compat resolver. If `type: tdd` TRDs no longer trigger TDD cycle, fix `resolveEffectiveTddFlag` to return TRUE for `frontmatterType === 'tdd'`.
- **Planner outputs malformed TRD** — review the new TDD Detection section; ensure example XML is well-formed (`tdd="true"` quoted).
- **Reference doc drift** — references/tdd.md is canonical. If executor or planner contradict, update them to match the doc.
  </recovery>
</TRD-task-ex>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `df-tools trd-tdd inspect <legacy TRD>` returns all `tdd_effective: true` for `type: tdd` TRDs (back-compat)
2. `df-tools trd-tdd inspect <new TRD>` returns mixed `tdd_effective` per task `tdd` attribute
3. Existing in-flight TRDs (objs 10, 11) still trigger TDD cycle when executed
4. Planner emits `tdd="true"` attribute (verified by reading new planner.md)
5. Executor uses `df-tools trd-tdd inspect` for resolution
6. references/tdd.md documents both forms with precedence table
7. EX1 export-lock test passes (5 entries for trd-tdd.cjs)
8. Net line delta: planner.md grew slightly, executor.md shrank
9. `npm test` passes
</verification>

<success_criteria>
- 4 commits expected: RED for task 1, GREEN for task 1, atomic commit for task 2 (3 agent/reference files)
- `lib/trd-tdd.cjs` exports exactly 5 entries
- `df-tools trd-tdd inspect` CLI works against arbitrary TRD paths
- Back-compat for existing `type: tdd` TRDs preserved
- 3 agent/reference files updated atomically
- `npm test` passes
</success_criteria>

<output>
Create `.planning/objectives/12-skill-consolidation/12-05-SUMMARY.md` per template. Required:
- TDD evidence
- 4 commit hashes
- Sample inspect output for a legacy TRD (proves back-compat)
- Sample inspect output for a task-level TRD
- Line delta summary (planner.md +N, executor.md -M)
</output>
