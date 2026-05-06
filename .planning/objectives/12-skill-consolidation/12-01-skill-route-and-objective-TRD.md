---
objective: 12-skill-consolidation
trd: 01
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/skill-route.cjs
  - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/skill-route-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/skills/objective/SKILL.md
  - plugins/devflow/skills/add-objective/SKILL.md
  - plugins/devflow/skills/insert-objective/SKILL.md
  - plugins/devflow/skills/remove-objective/SKILL.md
autonomous: true
requirements:
  - PHASE-G1
  - PHASE-G2
  - PHASE-A-HANDOFF
must_haves:
  truths:
    - "User can run `/devflow:objective add <desc>` and it routes to add-objective workflow"
    - "User can run `/devflow:objective insert <after> <desc>` and it routes to insert-objective workflow"
    - "User can run `/devflow:objective remove <num>` and it routes to remove-objective workflow"
    - "User can still run `/devflow:add-objective <desc>` (deprecation warning emitted, forwarding works)"
    - "df-tools skill-route returns deterministic JSON for valid inputs and error JSON for invalid"
    - "df-tools skill-route --list emits machine-readable consolidated skill catalog (Phase A handoff)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/skill-route.cjs"
      provides: "routeSkill, SKILL_ROUTES, deprecation log writer, _setRun* hooks, locked exports"
      contains: "module.exports"
    - path: "plugins/devflow/devflow/bin/lib/skill-route.test.cjs"
      provides: "RED→GREEN test coverage for routeSkill, SKILL_ROUTES, --list, deprecation logger"
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/skill-route-fixtures.cjs"
      provides: "Hand-built factories: buildSkillRouteCall, buildSkillRouteResponse, buildDeprecationLogEntry"
    - path: "plugins/devflow/skills/objective/SKILL.md"
      provides: "Consolidated objective skill with subcommand dispatch via skill-route"
      contains: "df-tools skill-route objective"
    - path: "plugins/devflow/skills/add-objective/SKILL.md"
      provides: "Deprecation redirect to /devflow:objective add"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/insert-objective/SKILL.md"
      provides: "Deprecation redirect to /devflow:objective insert"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/remove-objective/SKILL.md"
      provides: "Deprecation redirect to /devflow:objective remove"
      contains: "DEPRECATED"
  key_links:
    - from: "plugins/devflow/skills/objective/SKILL.md"
      to: "df-tools skill-route"
      via: "Bash invocation in <process>"
      pattern: "df-tools skill-route objective"
    - from: "plugins/devflow/skills/add-objective/SKILL.md"
      to: "/devflow:objective add"
      via: "Deprecation warning + forward"
      pattern: "df-tools deprecation log add-objective"
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "lib/skill-route.cjs"
      via: "case 'skill-route' router arm"
      pattern: "case 'skill-route'"
---

<objective>
Build the skill-route CLI helper (the foundation for all 5 consolidated skills) and ship the first consumer: the `/devflow:objective` consolidated skill plus its 3 deprecation redirects (add/insert/remove-objective).

Purpose: Establish the testable subcommand-dispatch pattern that 12-02, 12-03, 12-04 will consume. Lock the JSON contract for `df-tools skill-route` and `df-tools skill-route --list` so Phase A (v1.2 obj 6) can wire `classify-session.js` against a stable surface. Land objective consolidation atomically (new skill + 3 redirects in one commit) to prevent ambient-mode breakage.

Output: Tested `lib/skill-route.cjs` module with locked exports, integrated `df-tools skill-route` CLI subcommand, consolidated `/devflow:objective` skill with subcommand parsing, 3 deprecation redirects emitting warnings via `df-tools deprecation log`, and the canonical SKILL.md template that 12-02/03/04 mirror.
</objective>

<file_tree>
plugins/devflow/
├── devflow/bin/
│   ├── df-tools.cjs                                    ← MODIFY (add `case 'skill-route'`, `case 'deprecation'`)
│   └── lib/
│       ├── skill-route.cjs                             ← CREATE
│       ├── skill-route.test.cjs                        ← CREATE
│       └── __fixtures__/
│           └── skill-route-fixtures.cjs                ← CREATE
└── skills/
    ├── objective/SKILL.md                              ← CREATE (consolidated)
    ├── add-objective/SKILL.md                          ← MODIFY (deprecation redirect)
    ├── insert-objective/SKILL.md                       ← MODIFY (deprecation redirect)
    └── remove-objective/SKILL.md                       ← MODIFY (deprecation redirect)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: CLI helper module with `_setRunX` injection (from `lib/awareness.cjs`, `lib/initiatives.cjs`):**

```javascript
'use strict';

const fs = require('fs');
const realFs = {
  readFileSync: fs.readFileSync,
  appendFileSync: fs.appendFileSync,
  existsSync: fs.existsSync,
  mkdirSync: fs.mkdirSync,
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }
```

**Pattern: df-tools.cjs router arm (from `case 'awareness':` ~line 700):**

```javascript
case 'skill-route': {
  const { cmdSkillRoute } = require('./lib/skill-route.cjs');
  const args = argv.slice(1);
  const raw = args.includes('--raw');
  cmdSkillRoute(cwd, args.filter(a => a !== '--raw'), raw);
  break;
}
```

**Pattern: Existing workstreams SKILL.md (subcommand prose-level dispatch — what we're generalizing):**

```yaml
<process>
Parse $ARGUMENTS to determine subcommand.

**If `setup`:** Follow @~/.claude/devflow/workflows/workstreams-setup.md
**If `status`:** Follow @~/.claude/devflow/workflows/workstreams-status.md
**If `merge`:** Follow @~/.claude/devflow/workflows/workstreams-merge.md
</process>
```

**Pattern: Existing add-objective SKILL.md (the file we're replacing with a deprecation stub):**

```yaml
---
name: add-objective
description: |
  Add a new objective to the end of the current milestone roadmap.
argument-hint: <description>
disable-model-invocation: true
allowed-tools: [Read, Write, Bash]
---

<execution_context>
@~/.claude/devflow/workflows/add-objective.md
</execution_context>

<process>
Follow the add-objective workflow from @~/.claude/devflow/workflows/add-objective.md.
</process>
```

**Pattern: Hand-built fixture builders (from `lib/__fixtures__/awareness-fixtures.cjs`):**

```javascript
function buildSkillRouteCall(opts = {}) {
  return {
    skill: opts.skill || 'objective',
    args: opts.args || ['add', 'fix login bug'],
  };
}

function buildSkillRouteResponse(opts = {}) {
  return {
    skill: opts.skill || 'objective',
    subcommand: opts.subcommand || 'add',
    args: opts.args || ['fix login bug'],
    workflow: opts.workflow || '~/.claude/devflow/workflows/add-objective.md',
  };
}
```

**Pattern: Export-lock banner (from obj 1-5):**

```javascript
// ─── module.exports — LOCKED by TRD 12-01 (8-entry surface; SC-G1, G2)
//     DO NOT MODIFY without updating EX1 export-lock test atomically.
module.exports = {
  routeSkill,
  cmdSkillRoute,
  cmdSkillRouteList,
  cmdDeprecationLog,
  SKILL_ROUTES,
  DEPRECATION_MAP,
  _setRunFs,
  _resetMocks,
};
```

</codebase_examples>

<anti_patterns>

- **Inline subcommand branching in SKILL.md** — workstreams already does this; do NOT replicate the pattern in 4 more skills. Centralize in `lib/skill-route.cjs`.
- **LLM-generated test data** — per global TDD playbook. All test data via `__fixtures__/skill-route-fixtures.cjs` factory builders.
- **Property-based testing** — subcommand parsing is finite. Enumerate cases.
- **Subprocess tests for unit-level dispatch** — call `routeSkill()` directly. Reserve `spawnSync` for the end-to-end CLI integration test.
- **Skipping export-lock test** — the EX1 deepStrictEqual test must land in this TRD; future TRDs adding exports must update it atomically.

</anti_patterns>

<error_recovery>

- **Skill name collision (objective dir already exists from prior commit)** — verify with `ls plugins/devflow/skills/objective/` before creating. If present, read existing content first; the consolidated SKILL.md replaces it.
- **`df-tools skill-route` invoked before lib is wired into `df-tools.cjs`** — RED test C1 catches this; if executor sees `Unknown command: skill-route`, GREEN phase added the case arm.
- **Deprecation warning spam** — log file `.planning/.deprecation-log.jsonl` is gitignored. If executor accidentally commits it, `git rm --cached .planning/.deprecation-log.jsonl` and add to `.gitignore`.
- **Pre-existing test failure** — run `npm test` BEFORE making any changes. If 1359 doesn't match, baseline drift; do not assume new failures are from this TRD.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/12-skill-consolidation/12-CONTEXT.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md

# Current SKILL.md files being modified or replaced
@plugins/devflow/skills/workstreams/SKILL.md
@plugins/devflow/skills/add-objective/SKILL.md
@plugins/devflow/skills/insert-objective/SKILL.md
@plugins/devflow/skills/remove-objective/SKILL.md

# Sibling lib for pattern reference
@plugins/devflow/devflow/bin/lib/awareness-cli.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
</context>

<research_context>

From `12-RESEARCH.md`:

**Subcommand→workflow mapping for objective skill (locked):**

| Subcommand | Workflow file |
|---|---|
| `add` | `add-objective.md` |
| `insert` | `insert-objective.md` |
| `remove` | `remove-objective.md` |

**`df-tools skill-route` JSON contract (locked — Phase A consumes this):**

```bash
df-tools skill-route objective add "fix login bug"
# → {"skill": "objective", "subcommand": "add", "args": ["fix login bug"],
#    "workflow": "~/.claude/devflow/workflows/add-objective.md"}

df-tools skill-route objective       # missing subcommand
# → {"error": "missing subcommand", "usage": "objective <add|insert|remove>",
#    "valid_subcommands": ["add", "insert", "remove"]}

df-tools skill-route --list
# → {"skills": [{"name": "objective", "subcommands": ["add","insert","remove"]}, ...],
#    "deprecated": {"add-objective": "objective add", ...}}
```

**Deprecation logger contract (locked):**

```bash
df-tools deprecation log add-objective
# Appends {ts, old_name, new_form, project_root} to .planning/.deprecation-log.jsonl
# Returns {"logged": true, "old_name": "add-objective", "new_form": "objective add"}
```

**Atomicity rule:** All 4 SKILL files (consolidated `objective` + 3 redirects) MUST land in the same git commit. Recovery: if executor partially commits, immediately `git reset HEAD~1` and re-stage all 4 together.

</research_context>

<gotchas>

- **`disable-model-invocation: true`** — preserve on all 4 SKILL files. Prevents Claude from auto-invoking structural roadmap mutations.
- **`argument-hint` consistency** — must match `skill-route`'s `valid_subcommands` enumeration. EX1 test asserts.
- **`workflow` path uses `~/.claude/devflow/workflows/`** — NOT `${CLAUDE_PLUGIN_ROOT}` (the latter doesn't interpolate in `@path` references). The sync-runtime hook mirrors content to home.
- **`disable-model-invocation` on redirect skills** — keep `true` so Claude doesn't accidentally call deprecated skills (user can still invoke explicitly).
- **`SKILL_ROUTES` field naming** — use `subcommands` (plural array) not `subcommand` to match Phase A handoff schema.

</gotchas>

<tasks>

<task type="tdd">
  <name>Task 1: TDD — skill-route core (routeSkill + SKILL_ROUTES + fixtures)</name>
  <files>plugins/devflow/devflow/bin/lib/skill-route.cjs, plugins/devflow/devflow/bin/lib/skill-route.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/skill-route-fixtures.cjs</files>
  <action>
RED → GREEN → REFACTOR for the core dispatch logic.

**Test list (write all RED first; commit; then GREEN):**

Group R (routeSkill happy path):
- R1: `routeSkill('objective', ['add', 'fix bug'])` → returns `{skill, subcommand: 'add', args: ['fix bug'], workflow: '~/.claude/devflow/workflows/add-objective.md'}`
- R2: `routeSkill('objective', ['insert', '5', 'urgent'])` → subcommand 'insert', args ['5', 'urgent'], workflow add-objective.md → insert-objective.md
- R3: `routeSkill('objective', ['remove', '7'])` → subcommand 'remove', args ['7']
- R4: `routeSkill('objective', ['add'])` → empty residual args allowed → `{skill, subcommand: 'add', args: [], workflow: ...}`

Group RE (routeSkill errors):
- RE1: `routeSkill('objective', [])` → `{error: 'missing subcommand', usage: 'objective <add|insert|remove>', valid_subcommands: ['add','insert','remove']}`
- RE2: `routeSkill('objective', ['unknown'])` → `{error: 'unknown subcommand', got: 'unknown', valid_subcommands: ['add','insert','remove']}`
- RE3: `routeSkill('nonexistent-skill', ['add'])` → `{error: 'unknown skill', got: 'nonexistent-skill', valid_skills: [...]}`
- RE4: `routeSkill(null, [])` → error
- RE5: `routeSkill('objective', null)` → error (args must be array)

Group SR (SKILL_ROUTES structure):
- SR1: SKILL_ROUTES.objective.subcommands deepEquals ['add','insert','remove']
- SR2: SKILL_ROUTES.objective.workflow_for('add') returns '~/.claude/devflow/workflows/add-objective.md'
- SR3: SKILL_ROUTES.objective.workflow_for('insert') returns insert-objective.md (NOT a generic template)
- SR4: SKILL_ROUTES enumerates only `objective` in this TRD (12-02/03/04 add the rest)

Group F (fixtures):
- F1: buildSkillRouteCall() returns canonical objective-add call
- F2: buildSkillRouteCall({skill: 'objective', args: ['remove', '7']}) returns custom call
- F3: buildSkillRouteResponse({subcommand: 'remove', args: ['7'], workflow: '...remove-objective.md'}) returns canonical response shape
- F4: buildDeprecationLogEntry({old_name: 'add-objective'}) returns {ts: <iso>, old_name, new_form: 'objective add', project_root}

**Implementation (GREEN phase, after RED commit):**

Create `lib/skill-route.cjs` with:
- `SKILL_ROUTES` const (only `objective` populated in this TRD)
- `routeSkill(skill, args)` pure function
- `_setRunFs` / `_resetMocks` injection hooks (used by deprecation logger task 2)
- Module exports per banner

# CRITICAL: routeSkill is PURE — no fs, no process.exit, no console output. Returns object.
# CRITICAL: workflow paths use literal '~/.claude/devflow/workflows/<name>.md' — do NOT resolve $HOME.
# GOTCHA: argument validation runs BEFORE skill lookup so RE4/RE5 don't hit 'unknown skill'.
# PATTERN: Mirror lib/awareness-cli.cjs::parseShowFlags pure-fn shape.

**REFACTOR (if needed):** Extract `_validateArgs(skill, args)` helper if RE1-RE5 share validation logic. Tests still pass.
  </action>
  <verify>
RED phase:
```bash
cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs 2>&1 | tail -20
# Expected: ALL tests FAIL (skill-route.cjs doesn't exist)
```

GREEN phase:
```bash
cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs 2>&1 | tail -20
# Expected: All tests PASS, 0 failures
npm test  # full suite — should be 1359 + N new tests passing
```
  </verify>
  <done>
RED commit `test(12-01): add failing tests for skill-route core` exists. GREEN commit `feat(12-01): implement skill-route core (routeSkill + SKILL_ROUTES)` exists. All R/RE/SR/F tests pass. `npm test` shows 1359 + N passing, 0 failing.
  </done>
  <recovery>
- If RED phase has 0 failures, the file already exists from incomplete previous run — `git status` to inspect; if uncommitted, `git checkout` the file and start over.
- If GREEN can't pass within 3 iterations, document failing case and continue (per global TDD playbook). Do NOT fudge tests to pass.
  </recovery>
</task>

<task type="tdd">
  <name>Task 2: TDD — deprecation logger + df-tools.cjs CLI integration</name>
  <files>plugins/devflow/devflow/bin/lib/skill-route.cjs, plugins/devflow/devflow/bin/lib/skill-route.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
RED → GREEN for deprecation logger + CLI dispatch.

**Test list:**

Group D (deprecation logger):
- D1: `cmdDeprecationLog(cwd, 'add-objective', raw=true)` writes to `.planning/.deprecation-log.jsonl`, returns `{logged: true, old_name: 'add-objective', new_form: 'objective add'}`
- D2: D1 again → second JSONL line appended (not overwritten)
- D3: Unknown old_name → `{error: 'unknown deprecated skill', got: 'foo'}`, no file write
- D4: `_setRunFs` mock injected → assertion that `appendFileSync` was called with correct path + payload
- D5: DEPRECATION_MAP enumerates only objective-related entries in this TRD: `{'add-objective': 'objective add', 'insert-objective': 'objective insert', 'remove-objective': 'objective remove'}`

Group C (CLI integration via spawnSync — end-to-end):
- C1: `spawnSync('node', ['df-tools.cjs', 'skill-route', 'objective', 'add', 'fix bug'])` exits 0 with JSON on stdout matching R1's expected shape
- C2: `spawnSync('node', ['df-tools.cjs', 'skill-route', 'objective'])` exits 1 with error JSON on stderr (or stdout — match existing CLI conventions; check awareness-cli for precedent)
- C3: `spawnSync('node', ['df-tools.cjs', 'skill-route', '--list'])` exits 0 with `{skills: [{name: 'objective', subcommands: [...]}], deprecated: {...}}`
- C4: `spawnSync('node', ['df-tools.cjs', 'deprecation', 'log', 'add-objective'])` exits 0, JSONL line appended

Group EX (export-lock):
- EX1: `Object.keys(skill-route.cjs.exports).sort()` deepStrictEqual canonical 8-entry list
- EX2: Banner comment `LOCKED by TRD 12-01` present (regex on file content)

**Implementation (GREEN):**

Add to `lib/skill-route.cjs`:
- `cmdSkillRoute(cwd, args, raw)` — parses CLI args, calls `routeSkill`, writes JSON via `output()` helper from `lib/helpers.cjs`
- `cmdSkillRouteList(cwd, raw)` — emits enumeration via `output()`
- `cmdDeprecationLog(cwd, oldName, raw)` — calls `_runFs.appendFileSync` to `.planning/.deprecation-log.jsonl`
- `DEPRECATION_MAP` const (objective entries only this TRD)

Add to `df-tools.cjs`:
```javascript
case 'skill-route': {
  const { cmdSkillRoute, cmdSkillRouteList } = require('./lib/skill-route.cjs');
  const args = argv.slice(1);
  const raw = args.includes('--raw');
  const filtered = args.filter(a => a !== '--raw');
  if (filtered[0] === '--list') {
    cmdSkillRouteList(cwd, raw);
  } else {
    cmdSkillRoute(cwd, filtered, raw);
  }
  break;
}

case 'deprecation': {
  const { cmdDeprecationLog } = require('./lib/skill-route.cjs');
  const sub = argv[1];
  const raw = argv.includes('--raw');
  if (sub === 'log') {
    cmdDeprecationLog(cwd, argv[2], raw);
  } else {
    error('Usage: df-tools deprecation log <old-name>');
  }
  break;
}
```

Append banner + exports:
```javascript
// ─── module.exports — LOCKED by TRD 12-01 (8-entry surface; SC-G1, SC-G2)
//     DO NOT MODIFY without updating EX1 test atomically.
module.exports = {
  routeSkill,
  cmdSkillRoute,
  cmdSkillRouteList,
  cmdDeprecationLog,
  SKILL_ROUTES,
  DEPRECATION_MAP,
  _setRunFs,
  _resetMocks,
};
```

# CRITICAL: appendFileSync (not writeFileSync) for deprecation log — JSONL append-only.
# CRITICAL: deprecation log path is .planning/.deprecation-log.jsonl (gitignored — add in this task).
# GOTCHA: lib/helpers.cjs::output() calls process.exit(0); test C tests use spawnSync subprocess pattern (see obj 5 TRD 05-02 deviation).
# PATTERN: Mirror lib/awareness-cli.cjs CLI router shape.

Update `.gitignore`:
```
# DevFlow deprecation log (gitignored, like dup-detect log)
.planning/.deprecation-log.jsonl
```

**REFACTOR (optional):** Extract `cmdDeprecationLog`'s file-write into `_writeDeprecationEntry(cwd, entry)` private helper if multiple call sites emerge. Tests still pass.
  </action>
  <verify>
```bash
cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs 2>&1 | tail -25
# All D/C/EX tests pass

# Manual smoke:
node df-tools.cjs skill-route objective add "fix login"
# {"skill":"objective","subcommand":"add","args":["fix login"],"workflow":"~/.claude/devflow/workflows/add-objective.md"}

node df-tools.cjs skill-route --list
# {"skills":[{"name":"objective","subcommands":["add","insert","remove"]}],"deprecated":{"add-objective":"objective add",...}}

node df-tools.cjs deprecation log add-objective
# {"logged":true,"old_name":"add-objective","new_form":"objective add"}

cat .planning/.deprecation-log.jsonl  # one JSONL entry exists
git check-ignore .planning/.deprecation-log.jsonl  # exits 0 (ignored)

cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test  # full suite passes
```
  </verify>
  <done>
RED commit `test(12-01): add failing tests for deprecation logger + CLI integration` exists. GREEN commit `feat(12-01): wire skill-route + deprecation log into df-tools` exists. All D/C/EX tests pass. `df-tools skill-route objective add 'foo'` returns valid JSON. `.planning/.deprecation-log.jsonl` is gitignored. Export-lock banner present. `npm test` passes.
  </done>
  <recovery>
- If `case 'skill-route'` collision with existing case in df-tools.cjs (extremely unlikely — no such case today), append after the last existing case before the `default`.
- If gitignore edit conflicts with existing entries, append at file end with comment header.
- If `output()` exit-on-call breaks subprocess tests, switch to `spawnSync` pattern with stdout JSON parse (proven in obj 5 TRD 05-02).
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Atomic skill swap — consolidated /devflow:objective + 3 deprecation redirects</name>
  <files>plugins/devflow/skills/objective/SKILL.md, plugins/devflow/skills/add-objective/SKILL.md, plugins/devflow/skills/insert-objective/SKILL.md, plugins/devflow/skills/remove-objective/SKILL.md</files>
  <action>
Standard task — no TDD needed; this is markdown editing of skill files. The dispatcher logic (the testable part) is already TDD-covered in tasks 1+2.

**Step 1: Create new consolidated skill** at `plugins/devflow/skills/objective/SKILL.md`:

```yaml
---
name: objective
description: |
  Add, insert, or remove an objective from the current milestone roadmap.
  Subcommand-style: /devflow:objective add | insert | remove
  Use when explicitly requested.
argument-hint: "<add|insert|remove> [args...]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<objective>
Manage objectives in the current milestone roadmap. Routes by first argument:
- `add <description>` — Add a new integer objective to the end of the milestone
- `insert <after> <description>` — Insert a decimal objective for urgent work
- `remove <number>` — Remove an unstarted objective and renumber siblings

Replaces 3 sibling skills: add-objective, insert-objective, remove-objective.
</objective>

<execution_context>
@~/.claude/devflow/workflows/add-objective.md
@~/.claude/devflow/workflows/insert-objective.md
@~/.claude/devflow/workflows/remove-objective.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route objective $ARGUMENTS --raw)
```

Parse the JSON. If it contains `error`, display the `usage` field to the user and stop. Otherwise extract `subcommand`, `args`, and `workflow`.

**2. Follow the resolved workflow.**

Based on `subcommand`:
- `add` → execute the add-objective workflow loaded above with the residual args
- `insert` → execute the insert-objective workflow with the residual args
- `remove` → execute the remove-objective workflow with the residual args

Pass residual `args` to the workflow as if the user had typed them.

**3. Display deprecation summary if invoked via redirect** (handled by redirect skills; this consolidated skill does not log deprecation itself).
</process>
```

**Step 2: Replace each redirect SKILL.md** (`add-objective`, `insert-objective`, `remove-objective`):

For `add-objective/SKILL.md`:
```yaml
---
name: add-objective
description: |
  DEPRECATED — use `/devflow:objective add` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: <description>
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:objective add`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log add-objective --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
⚠️  /devflow:add-objective is DEPRECATED.
    Use /devflow:objective add instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:objective add $ARGUMENTS` and let it run.
</process>
```

Mirror the same shape for `insert-objective/SKILL.md` (replace `add-objective` → `insert-objective`, `objective add` → `objective insert`) and `remove-objective/SKILL.md` (replace with `remove-objective` / `objective remove`).

# CRITICAL: All 4 SKILL files MUST be staged and committed in a SINGLE commit. Atomicity prevents
#           a window where the consolidated skill exists but redirects don't (or vice versa) —
#           which would break ambient routing for some users.
# CRITICAL: argument-hint string MUST match SKILL_ROUTES.objective.subcommands enumeration.
# GOTCHA: Use SlashCommand allowed-tool for the forward-invocation in redirects.
# GOTCHA: $ARGUMENTS in the redirect is the ORIGINAL user input minus the skill name; pass through verbatim.
# PATTERN: Mirror /devflow:awareness SKILL.md structure (thin orchestrator, df-tools call, follow returned workflow).
  </action>
  <verify>
```bash
# Verify SKILL frontmatter validates:
for s in objective add-objective insert-objective remove-objective; do
  head -15 plugins/devflow/skills/$s/SKILL.md
  echo "---"
done

# Verify atomic commit (all 4 files in last commit):
git diff --name-only HEAD~1 HEAD | grep -c 'plugins/devflow/skills/.*objective.*SKILL\.md'
# Expected: 4

# Verify skill-route handles all 3 subcommands end-to-end:
node ~/.claude/devflow/bin/df-tools.cjs skill-route objective add "test desc"
node ~/.claude/devflow/bin/df-tools.cjs skill-route objective insert 5 "urgent"
node ~/.claude/devflow/bin/df-tools.cjs skill-route objective remove 7

# Manual: Invoke /devflow:objective add "test" in Claude Code session — confirm dispatch works
# Manual: Invoke /devflow:add-objective "test" — confirm deprecation warning displays + forwards

npm test  # 1359 + N still passes
```
  </verify>
  <done>
- `plugins/devflow/skills/objective/SKILL.md` exists with subcommand dispatch via skill-route
- All 3 redirect SKILL.md files updated with DEPRECATED frontmatter + forward logic
- All 4 files committed in a SINGLE commit
- `df-tools skill-route objective <add|insert|remove>` returns valid workflow paths
- `npm test` passes
  </done>
  <recovery>
- **Partial commit detected** (only some of the 4 SKILL files in last commit) — IMMEDIATELY `git reset --soft HEAD~1`, restage all 4 files, recommit. Do NOT push until atomic.
- **Existing `objective` SKILL.md** from prior incomplete attempt — read content first, decide if it's compatible. If incompatible, `git rm` and recreate per spec.
- **`/devflow:objective add "foo"` invocation fails in Claude Code session** — check that `df-tools skill-route` is reachable (`which df-tools` or full path). Sync-runtime hook should have mirrored. If not, run `node plugins/devflow/hooks/sync-runtime.js` manually.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
Goal-backward verification — every truth must hold:

1. **`/devflow:objective add <desc>` routes correctly** → invoke in Claude Code, confirm add-objective workflow runs.
2. **`/devflow:objective insert <after> <desc>` routes correctly** → invoke, confirm insert-objective workflow runs.
3. **`/devflow:objective remove <num>` routes correctly** → invoke, confirm remove-objective workflow runs.
4. **`/devflow:add-objective` still works (deprecation path)** → invoke, confirm warning displays + add-objective workflow runs + JSONL log entry appended.
5. **`/devflow:insert-objective` and `/devflow:remove-objective` redirects work** → mirror check.
6. **`df-tools skill-route --list` JSON contract** → run, validate shape matches RESEARCH.md spec exactly.
7. **All 1359+N tests pass** → `npm test` exit code 0.
8. **Atomic commit** → `git log -1 --name-only` for the SKILL-swap commit shows all 4 SKILL.md files.
9. **`.planning/.deprecation-log.jsonl` is gitignored** → `git check-ignore .planning/.deprecation-log.jsonl` exits 0.
10. **Export-lock banner present** → `grep -q 'LOCKED by TRD 12-01' plugins/devflow/devflow/bin/lib/skill-route.cjs`.
</verification>

<success_criteria>
- 5 commits total expected: RED for task 1, GREEN for task 1, RED for task 2, GREEN for task 2, single atomic commit for task 3 (5 commits; or 4 if REFACTOR adds none)
- `lib/skill-route.cjs` exports exactly 8 entries per banner
- `lib/skill-route.test.cjs` ≥ 200 lines, ≥ 25 test cases
- `lib/__fixtures__/skill-route-fixtures.cjs` ≥ 30 lines with ≥ 4 builder functions
- `df-tools skill-route` and `df-tools deprecation log` CLI subcommands wired in `df-tools.cjs`
- 4 SKILL.md files updated/created in single atomic commit
- All RED tests fail at RED phase; all GREEN tests pass at GREEN phase (evidence in TDD Evidence section of SUMMARY.md)
- `.planning/.deprecation-log.jsonl` added to `.gitignore`
- `npm test` passes (1359 + new tests, 0 failing)
</success_criteria>

<output>
After completion, create `.planning/objectives/12-skill-consolidation/12-01-SUMMARY.md` per `~/.claude/devflow/templates/summary.md`. Required sections:
- TDD Evidence table (RED/GREEN exit codes per task)
- Commit hashes (5 commits expected)
- Test count delta (1359 → 1359+N)
- Locked exports list (8 entries)
- Phase A handoff data sample (output of `df-tools skill-route --list`)
</output>
