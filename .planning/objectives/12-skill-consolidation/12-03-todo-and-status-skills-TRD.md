---
objective: 12-skill-consolidation
trd: 03
type: tdd
confidence: high
wave: 2
depends_on: ["12-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/skill-route.cjs
  - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
  - plugins/devflow/skills/todo/SKILL.md
  - plugins/devflow/skills/status/SKILL.md
  - plugins/devflow/skills/add-todo/SKILL.md
  - plugins/devflow/skills/check-todos/SKILL.md
  - plugins/devflow/skills/pause-work/SKILL.md
  - plugins/devflow/skills/resume-work/SKILL.md
  - plugins/devflow/skills/progress/SKILL.md
  - plugins/devflow/skills/health/SKILL.md
autonomous: true
requirements:
  - PHASE-G1
  - PHASE-G2
must_haves:
  truths:
    - "User can run `/devflow:todo add <desc>` and it routes to add-todo workflow"
    - "User can run `/devflow:todo list` and it routes to check-todos workflow"
    - "User can run `/devflow:status` (no arg) and it routes to progress workflow (default)"
    - "User can run `/devflow:status check` or `/devflow:status --check` and routes to health workflow"
    - "User can run `/devflow:status pause` or `/devflow:status --pause` and routes to pause-work workflow"
    - "User can run `/devflow:status resume` or `/devflow:status --resume` and routes to resume-project workflow"
    - "All 6 old skill names still work via deprecation redirects"
    - "skill-route normalizes leading -- on status flag-style subcommands"
  artifacts:
    - path: "plugins/devflow/skills/todo/SKILL.md"
      provides: "Consolidated todo skill (add | list)"
      contains: "df-tools skill-route todo"
    - path: "plugins/devflow/skills/status/SKILL.md"
      provides: "Consolidated status skill (default progress + check/pause/resume subcommands)"
      contains: "df-tools skill-route status"
    - path: "plugins/devflow/skills/add-todo/SKILL.md"
      provides: "Deprecation redirect to /devflow:todo add"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/check-todos/SKILL.md"
      provides: "Deprecation redirect to /devflow:todo list"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/pause-work/SKILL.md"
      provides: "Deprecation redirect to /devflow:status pause"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/resume-work/SKILL.md"
      provides: "Deprecation redirect to /devflow:status resume"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/progress/SKILL.md"
      provides: "Deprecation redirect to /devflow:status (default)"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/health/SKILL.md"
      provides: "Deprecation redirect to /devflow:status check"
      contains: "DEPRECATED"
  key_links:
    - from: "plugins/devflow/skills/todo/SKILL.md"
      to: "df-tools skill-route"
      via: "Bash invocation"
      pattern: "df-tools skill-route todo"
    - from: "plugins/devflow/skills/status/SKILL.md"
      to: "df-tools skill-route"
      via: "Bash invocation"
      pattern: "df-tools skill-route status"
    - from: "plugins/devflow/devflow/bin/lib/skill-route.cjs"
      to: "SKILL_ROUTES.todo + SKILL_ROUTES.status"
      via: "Extension of dispatch table with --flag normalization"
      pattern: "_normalizeStatusSubcommand"
---

<objective>
Extend skill-route with TWO consolidated skills in one TRD: `todo` (2 subcommands) and `status` (default + 3 flag-style subcommands). Replace 6 sibling skills with deprecation redirects. Bundle these together because they share testing infrastructure (`__fixtures__/skill-route-fixtures.cjs`) and are complementary "user productivity" skills with similar shape.

Purpose: Validates skill-route handles two edge cases not covered by 12-01/02:
1. **Subcommand-as-flag normalization** — `status --check` and `status check` both resolve.
2. **Default subcommand** — `status` with no arg resolves to `progress.md` (NOT an error).

Output: Tested SKILL_ROUTES.todo + SKILL_ROUTES.status entries with normalization helper, DEPRECATION_MAP extended with 6 entries, 2 consolidated SKILL.md files, 6 deprecation redirects. Two atomic commits — one per consolidated-skill family.
</objective>

<file_tree>
plugins/devflow/
├── devflow/bin/lib/
│   ├── skill-route.cjs                                ← MODIFY (extend SKILL_ROUTES + DEPRECATION_MAP + flag normalizer)
│   └── skill-route.test.cjs                           ← MODIFY (add todo + status test groups)
└── skills/
    ├── todo/SKILL.md                                  ← CREATE (consolidated)
    ├── status/SKILL.md                                ← CREATE (consolidated)
    ├── add-todo/SKILL.md                              ← MODIFY (deprecation redirect)
    ├── check-todos/SKILL.md                           ← MODIFY (deprecation redirect)
    ├── pause-work/SKILL.md                            ← MODIFY (deprecation redirect)
    ├── resume-work/SKILL.md                           ← MODIFY (deprecation redirect)
    ├── progress/SKILL.md                              ← MODIFY (deprecation redirect)
    └── health/SKILL.md                                ← MODIFY (deprecation redirect)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: SKILL_ROUTES with default subcommand support (NEW for status):**

```javascript
SKILL_ROUTES.status = {
  subcommands: [null, 'check', 'pause', 'resume'],   // null = default (no subcommand provided)
  default_workflow: 'progress.md',
  workflow_for: (sub) => {
    const map = {
      'check': 'health.md',
      'pause': 'pause-work.md',
      'resume': 'resume-project.md',  // NOTE: workflow is resume-project.md, not resume-work.md
    };
    if (sub == null) return `~/.claude/devflow/workflows/${SKILL_ROUTES.status.default_workflow}`;
    return `~/.claude/devflow/workflows/${map[sub]}`;
  },
};
```

**Pattern: Flag normalization helper (NEW):**

```javascript
function _normalizeStatusSubcommand(arg) {
  if (arg == null || arg === '') return null;
  // Strip leading '--' for flag-style invocation
  const stripped = arg.startsWith('--') ? arg.slice(2) : arg;
  return stripped;
}
```

**Pattern: routeSkill default-subcommand handling — extend, don't rewrite:**

```javascript
function routeSkill(skill, args) {
  // ... existing validation ...
  const route = SKILL_ROUTES[skill];
  if (!route) return { error: 'unknown skill', got: skill, valid_skills: Object.keys(SKILL_ROUTES) };

  let firstArg = args[0];
  let residual = args.slice(1);

  // Status-specific: normalize --flag → flag
  if (skill === 'status') {
    firstArg = _normalizeStatusSubcommand(firstArg);
  }

  // Default-subcommand support
  if (firstArg == null && route.subcommands.includes(null)) {
    return { skill, subcommand: null, args: [], workflow: route.workflow_for(null) };
  }

  if (!route.subcommands.includes(firstArg)) {
    return { error: 'unknown subcommand', got: firstArg, valid_subcommands: route.subcommands.filter(s => s != null) };
  }

  return { skill, subcommand: firstArg, args: residual, workflow: route.workflow_for(firstArg) };
}
```

**Pattern: Existing `progress` SKILL.md (the one we're redirecting from):**

```yaml
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - SlashCommand
```

The consolidated `status` skill must include all of these PLUS `Write` (pause-work needs it) PLUS `AskUserQuestion` (resume-work needs it).

</codebase_examples>

<anti_patterns>

- **Hard-coded `--check`/`--pause`/`--resume` in SKILL.md prose** — let `df-tools skill-route` normalize. Skill bodies stay simple.
- **`resume-project.md` typo as `resume-work.md`** — workflow filename is `resume-project.md`, NOT `resume-work.md`. Test S6 catches this.
- **Empty subcommand for `todo` skill defaulting** — `todo` does NOT have a default subcommand (unlike status). `todo` with no arg → error. Test T4 enforces.
- **Forgetting `null` in subcommands array** — for status, the `null` entry is what `routeSkill` checks for default-subcommand support.
- **Non-atomic commit (any of the 8 SKILL files split across commits)** — bundle either as ONE big commit (todo+status+6 redirects) or TWO atomic commits (todo+2 redirects, then status+4 redirects). Pick ONE strategy and document in commit message.

</anti_patterns>

<error_recovery>

- **`pause-work.md` workflow body uses `Write` tool** — preserve `Write` in consolidated `status` allowed-tools.
- **`resume-work` redirect file → `/devflow:status resume`, but the WORKFLOW called is `resume-project.md`** — there are 3 different names involved here. Triple-check the lookup map.
- **`progress` redirect — what does it forward to?** — `/devflow:status` (no subcommand). The redirect maps to the DEFAULT, not a subcommand.
- **`add-todo` SKILL.md does NOT have `disable-model-invocation: true`** (per inspection). Other todo skills MIGHT have it. Carry the consolidated `todo` skill's policy from `add-todo` (model-invocable). Document decision in commit message.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/12-skill-consolidation/12-CONTEXT.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md
@.planning/objectives/12-skill-consolidation/12-01-SUMMARY.md

# Old SKILL files
@plugins/devflow/skills/add-todo/SKILL.md
@plugins/devflow/skills/check-todos/SKILL.md
@plugins/devflow/skills/pause-work/SKILL.md
@plugins/devflow/skills/resume-work/SKILL.md
@plugins/devflow/skills/progress/SKILL.md
@plugins/devflow/skills/health/SKILL.md
</context>

<research_context>

From `12-RESEARCH.md`:

**todo subcommand mapping (locked):**

| Subcommand | Workflow file | Replaces |
|---|---|---|
| `add` | `add-todo.md` | `add-todo` |
| `list` | `check-todos.md` | `check-todos` |

**status subcommand mapping (locked) — note flag-style + default-subcommand:**

| Input | Subcommand | Workflow file | Replaces |
|---|---|---|---|
| (no arg) | null (default) | `progress.md` | `progress` |
| `check` or `--check` | `check` | `health.md` | `health` |
| `pause` or `--pause` | `pause` | `pause-work.md` | `pause-work` |
| `resume` or `--resume` | `resume` | `resume-project.md` | `resume-work` |

**Note:** `resume-work` skill name → `resume-project.md` workflow filename (different name; preserve).

**DEPRECATION_MAP additions:**

```javascript
'add-todo': 'todo add',
'check-todos': 'todo list',
'pause-work': 'status pause',
'resume-work': 'status resume',
'progress': 'status',                  // Default — forward to /devflow:status (no subcommand)
'health': 'status check',
```

</research_context>

<gotchas>

- **`todo` model-invocability:** `add-todo` is currently model-invocable (no `disable-model-invocation: true`). Preserve this on consolidated `todo` — it's a productivity skill that benefits from auto-invoke.
- **`status` model-invocability:** `progress` and `health` are model-invocable. Preserve on consolidated `status`.
- **`pause-work`, `resume-work` ARE model-invocable** — keep that policy on the redirects.
- **SlashCommand allowed-tool** — needed in redirects (forward via `/devflow:...`) AND in consolidated `status` (resume → may invoke `/devflow:plan-objective` or others per existing resume-project.md logic).
- **Allowed-tools UNION rule for consolidated skills:**
  - `todo`: union of add-todo + check-todos = `[Read, Write, Bash, AskUserQuestion]`
  - `status`: union of progress + health + pause-work + resume-work = `[Read, Write, Bash, Grep, Glob, AskUserQuestion, SlashCommand]`

</gotchas>

<tasks>

<task type="tdd">
  <name>Task 1: TDD — extend SKILL_ROUTES with todo + status (incl. flag normalization + default subcommand)</name>
  <files>plugins/devflow/devflow/bin/lib/skill-route.cjs, plugins/devflow/devflow/bin/lib/skill-route.test.cjs</files>
  <action>
RED → GREEN extending the dispatch table with two new patterns: (a) default subcommand, (b) `--flag` normalization.

**Test list:**

Group T (todo routing):
- T1: `routeSkill('todo', ['add', 'idea text'])` → subcommand 'add', workflow add-todo.md
- T2: `routeSkill('todo', ['list'])` → subcommand 'list', workflow check-todos.md
- T3: `routeSkill('todo', ['list', '--lane', 'now'])` → subcommand 'list', residual args ['--lane', 'now']
- T4: `routeSkill('todo', [])` → error 'missing subcommand', usage 'todo <add|list>'
- T5: `routeSkill('todo', ['unknown'])` → error 'unknown subcommand'

Group TD (todo deprecation map):
- TD1: `DEPRECATION_MAP['add-todo']` === 'todo add'
- TD2: `DEPRECATION_MAP['check-todos']` === 'todo list'

Group S (status routing — default + subcommand + flag-style):
- S1: `routeSkill('status', [])` → `{skill, subcommand: null, args: [], workflow: '~/.claude/devflow/workflows/progress.md'}` (DEFAULT)
- S2: `routeSkill('status', ['check'])` → subcommand 'check', workflow health.md
- S3: `routeSkill('status', ['--check'])` → subcommand 'check' (flag normalized), workflow health.md
- S4: `routeSkill('status', ['pause'])` → subcommand 'pause', workflow pause-work.md
- S5: `routeSkill('status', ['--pause'])` → subcommand 'pause', workflow pause-work.md
- S6: `routeSkill('status', ['resume'])` → subcommand 'resume', workflow `resume-project.md` (NOT `resume-work.md`)
- S7: `routeSkill('status', ['--resume'])` → subcommand 'resume', workflow resume-project.md
- S8: `routeSkill('status', ['unknown'])` → error 'unknown subcommand', valid_subcommands ['check', 'pause', 'resume'] (null FILTERED OUT of error message)
- S9: `routeSkill('status', ['--unknown'])` → error (after strip, 'unknown' is still unknown)

Group SD (status deprecation map):
- SD1: `DEPRECATION_MAP['pause-work']` === 'status pause'
- SD2: `DEPRECATION_MAP['resume-work']` === 'status resume'
- SD3: `DEPRECATION_MAP['progress']` === 'status'         (no subcommand — default form)
- SD4: `DEPRECATION_MAP['health']` === 'status check'

Group SN (status normalize helper):
- SN1: `_normalizeStatusSubcommand('--check')` === 'check'
- SN2: `_normalizeStatusSubcommand('check')` === 'check'
- SN3: `_normalizeStatusSubcommand('')` === null
- SN4: `_normalizeStatusSubcommand(undefined)` === null
- SN5: `_normalizeStatusSubcommand('--')` === '' (edge case, then becomes 'unknown subcommand' upstream)

Group LL (--list reflects all extensions):
- LL1: `cmdSkillRouteList` `skills[]` contains entries for `todo` (subcommands ['add','list']) and `status` (subcommands [null,'check','pause','resume'])
- LL2: `--list` `deprecated` map contains all 6 new entries

Group EX (export-lock — adding `_normalizeStatusSubcommand` to exports? NO — keep it private):
- EX4: `Object.keys(skill-route.cjs.exports).sort()` STILL deepStrictEqual the 8-entry list

**Implementation (GREEN):**

In `lib/skill-route.cjs`:

```javascript
function _normalizeStatusSubcommand(arg) {
  if (arg == null || arg === '') return null;
  return arg.startsWith('--') ? arg.slice(2) : arg;
}

const TODO_WORKFLOW_MAP = {
  'add': 'add-todo.md',
  'list': 'check-todos.md',
};

SKILL_ROUTES.todo = {
  subcommands: ['add', 'list'],
  workflow_for: (sub) => `~/.claude/devflow/workflows/${TODO_WORKFLOW_MAP[sub]}`,
};

const STATUS_WORKFLOW_MAP = {
  'check': 'health.md',
  'pause': 'pause-work.md',
  'resume': 'resume-project.md',  // NOT resume-work.md
};

SKILL_ROUTES.status = {
  subcommands: [null, 'check', 'pause', 'resume'],
  default_workflow: 'progress.md',
  workflow_for: (sub) => {
    if (sub == null) return `~/.claude/devflow/workflows/progress.md`;
    return `~/.claude/devflow/workflows/${STATUS_WORKFLOW_MAP[sub]}`;
  },
};

Object.assign(DEPRECATION_MAP, {
  'add-todo': 'todo add',
  'check-todos': 'todo list',
  'pause-work': 'status pause',
  'resume-work': 'status resume',
  'progress': 'status',
  'health': 'status check',
});
```

Update `routeSkill` to handle status normalization + default-subcommand:

```javascript
function routeSkill(skill, args) {
  // ... existing arg validation ...
  if (!SKILL_ROUTES[skill]) return { error: 'unknown skill', got: skill, valid_skills: Object.keys(SKILL_ROUTES) };
  const route = SKILL_ROUTES[skill];

  let firstArg = args[0];
  let residual = args.slice(1);

  if (skill === 'status') {
    firstArg = _normalizeStatusSubcommand(firstArg);
  }

  // Default-subcommand support
  if (firstArg == null) {
    if (route.subcommands.includes(null)) {
      return { skill, subcommand: null, args: [], workflow: route.workflow_for(null) };
    }
    return { error: 'missing subcommand', usage: `${skill} <${route.subcommands.filter(s => s != null).join('|')}>`, valid_subcommands: route.subcommands.filter(s => s != null) };
  }

  if (!route.subcommands.includes(firstArg)) {
    return { error: 'unknown subcommand', got: firstArg, valid_subcommands: route.subcommands.filter(s => s != null) };
  }

  return { skill, subcommand: firstArg, args: residual, workflow: route.workflow_for(firstArg) };
}
```

# CRITICAL: `_normalizeStatusSubcommand` is NOT exported — keep banner at 8 entries.
# CRITICAL: `null` subcommand in array enables default; do NOT include null in error `valid_subcommands`.
# CRITICAL: workflow filename for 'resume' is `resume-project.md` (test S6 catches typo).
# GOTCHA: routeSkill changes are BACKWARD-COMPATIBLE — objective + milestone tests from 12-01/02 must still pass.
# PATTERN: Mirror obj 5 TRD 05-02's pattern of extending CLI router for new commands.

**REFACTOR (optional):** Extract `_resolveSubcommand(skill, firstArg)` if `routeSkill` body grows complex. Tests still pass.
  </action>
  <verify>
```bash
cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs 2>&1 | tail -30
# All T/TD/S/SD/SN/LL/EX tests pass; existing 12-01/02 tests STILL pass.

# Manual smoke:
node df-tools.cjs skill-route status              # → workflow progress.md (default)
node df-tools.cjs skill-route status check        # → workflow health.md
node df-tools.cjs skill-route status --check      # → workflow health.md (same as above)
node df-tools.cjs skill-route status resume       # → workflow resume-project.md (NOT resume-work.md)
node df-tools.cjs skill-route todo add "idea"     # → workflow add-todo.md
node df-tools.cjs skill-route todo list           # → workflow check-todos.md

cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test
```
  </verify>
  <done>
RED commit `test(12-03): add failing tests for todo + status routing` exists. GREEN commit `feat(12-03): extend SKILL_ROUTES with todo + status (default + flag normalization)` exists. All T/TD/S/SD/SN/LL/EX tests pass. `--check` and `check` both resolve to health.md. `--list` includes both new skills. `npm test` passes.
  </done>
  <recovery>
- If S6 fails with `resume-work.md`, fix STATUS_WORKFLOW_MAP — `'resume': 'resume-project.md'`.
- If S1 returns error instead of default workflow, ensure `null` is in `subcommands` array AND `routeSkill` checks it.
- If existing objective/milestone tests start failing, the routeSkill rewrite was not backward-compatible — restore prior shape, then merge changes incrementally.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Atomic skill swap A — consolidated /devflow:todo + 2 deprecation redirects</name>
  <files>plugins/devflow/skills/todo/SKILL.md, plugins/devflow/skills/add-todo/SKILL.md, plugins/devflow/skills/check-todos/SKILL.md</files>
  <action>
Standard task. Single atomic commit for todo family (3 files).

**Step 1: Create `plugins/devflow/skills/todo/SKILL.md`:**

```yaml
---
name: todo
description: |
  Manage todos: capture an idea/task or view the morning standup across local + GitHub + peer sources.
  Subcommand-style: /devflow:todo add | list
  Use when the user wants to save something for later, note an idea, or get a "what should I work on?" view.
  Triggers on: "remember to", "add a todo", "save this idea", "what should I work on?", "morning standup", "check todos".
argument-hint: "<add|list> [args...]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
Manage todos. Routes by first argument:
- `add [description]` — Capture an idea/task from current conversation
- `list [--all|--lane|--refresh|--raw]` — Morning standup view across 5 sources

Replaces 2 sibling skills: add-todo, check-todos.
</objective>

<execution_context>
@~/.claude/devflow/workflows/add-todo.md
@~/.claude/devflow/workflows/check-todos.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/STATE.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route todo $ARGUMENTS --raw)
```

Parse JSON. If `error`, display `usage` and stop.

**2. Follow resolved workflow:**

- `add` → execute add-todo workflow with residual args
- `list` → execute check-todos workflow with residual args (passes `--all`, `--lane`, etc. through)
</process>
```

**Step 2: Replace `add-todo/SKILL.md` and `check-todos/SKILL.md`** with deprecation redirect pattern (pattern from 12-01 task 3):

| File | Forwards to |
|---|---|
| `add-todo/SKILL.md` | `/devflow:todo add` |
| `check-todos/SKILL.md` | `/devflow:todo list` |

# CRITICAL: 3 files (todo, add-todo, check-todos) in ONE atomic commit.
# GOTCHA: Preserve model-invocability on consolidated `todo` skill (no `disable-model-invocation`).
# GOTCHA: `check-todos` had a long description with triggers; the consolidated `todo` description bundles BOTH old descriptions' triggers in its `description` field.
# PATTERN: Same as 12-01 task 3 / 12-02 task 2.
  </action>
  <verify>
```bash
git diff --name-only HEAD~1 HEAD | grep -c 'plugins/devflow/skills/.*\(todo\|todos\)/SKILL\.md'
# Expected: 3

node ~/.claude/devflow/bin/df-tools.cjs skill-route todo add "test"
node ~/.claude/devflow/bin/df-tools.cjs skill-route todo list

# Manual: /devflow:todo add "remember X" → add-todo runs
# Manual: /devflow:add-todo "remember X" → deprecation warning + add-todo runs

npm test
```
  </verify>
  <done>
- `plugins/devflow/skills/todo/SKILL.md` exists with 2-subcommand dispatch
- 2 redirect SKILL.md files updated
- 3 files in single atomic commit
- `df-tools skill-route todo <sub>` resolves
- `npm test` passes
  </done>
  <recovery>
- **Partial commit** — `git reset --soft HEAD~1`, restage all 3, recommit.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Atomic skill swap B — consolidated /devflow:status + 4 deprecation redirects</name>
  <files>plugins/devflow/skills/status/SKILL.md, plugins/devflow/skills/pause-work/SKILL.md, plugins/devflow/skills/resume-work/SKILL.md, plugins/devflow/skills/progress/SKILL.md, plugins/devflow/skills/health/SKILL.md</files>
  <action>
Standard task. Single atomic commit for status family (5 files).

**Step 1: Create `plugins/devflow/skills/status/SKILL.md`:**

```yaml
---
name: status
description: |
  Check project status, health, save/resume work, see what's next.
  Default (no arg): show progress + intelligently route to next action.
  Flag-style subcommands: --check (integrity), --pause (save context), --resume (restore context).
  Both flag and bare forms accepted: `/devflow:status --check` ≡ `/devflow:status check`.
  Use when the user asks about project status, where they are, what to do next, save/resume work.
  Triggers on: "where are we?", "what's the status?", "show progress", "what's next?", "is the project healthy?", "I need to stop", "save my progress", "let's continue", "pick up where we left off", "resume".
argument-hint: "[check | pause | resume]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
  - SlashCommand
---

<objective>
Project status, health checks, and work continuity. Routes by first argument:
- (no arg) — Show progress + route to next action
- `check` or `--check` — Validate `.planning/` integrity, fix issues
- `pause` or `--pause` — Save context to `.continue-here.md` for later resumption
- `resume` or `--resume` — Restore project context, pick up where you left off

Replaces 4 sibling skills: progress, health, pause-work, resume-work.
</objective>

<execution_context>
@~/.claude/devflow/workflows/progress.md
@~/.claude/devflow/workflows/health.md
@~/.claude/devflow/workflows/pause-work.md
@~/.claude/devflow/workflows/resume-project.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/STATE.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route status $ARGUMENTS --raw)
```

Parse JSON. If `error`, display `usage` and stop.

**2. Follow resolved workflow:**

Based on `subcommand`:
- `null` (default, no subcommand) → execute progress workflow
- `check` → execute health workflow with residual args (e.g., `--repair`, `--migrate`)
- `pause` → execute pause-work workflow
- `resume` → execute resume-project workflow

Pass residual `args` to the workflow.
</process>
```

**Step 2: Replace 4 redirect SKILL.md files** with deprecation pattern:

| File | Forwards to |
|---|---|
| `progress/SKILL.md` | `/devflow:status` (no subcommand — default) |
| `health/SKILL.md` | `/devflow:status check` |
| `pause-work/SKILL.md` | `/devflow:status pause` |
| `resume-work/SKILL.md` | `/devflow:status resume` |

# CRITICAL: 5 files (status + 4 redirects) in ONE atomic commit.
# CRITICAL: progress redirect forwards to `/devflow:status` (NO subcommand). The deprecation log entry is `progress → status` (no subcommand string).
# GOTCHA: resume-work redirect forwards to `/devflow:status resume` — note the `resume-work` SKILL → `resume` subcommand mapping (not `status resume-work`).
# PATTERN: Same as 12-01 task 3 / 12-02 task 2 / this TRD task 2.
  </action>
  <verify>
```bash
git diff --name-only HEAD~1 HEAD | grep -c 'plugins/devflow/skills/\(status\|progress\|health\|pause-work\|resume-work\)/SKILL\.md'
# Expected: 5

# All 4 dispatch paths:
node ~/.claude/devflow/bin/df-tools.cjs skill-route status
node ~/.claude/devflow/bin/df-tools.cjs skill-route status check
node ~/.claude/devflow/bin/df-tools.cjs skill-route status --check
node ~/.claude/devflow/bin/df-tools.cjs skill-route status pause
node ~/.claude/devflow/bin/df-tools.cjs skill-route status resume

# Manual: /devflow:status → progress runs
# Manual: /devflow:status check → health runs
# Manual: /devflow:health → deprecation warning + health runs
# Manual: /devflow:progress → deprecation warning + progress runs

npm test
```
  </verify>
  <done>
- `plugins/devflow/skills/status/SKILL.md` exists with default + 3-subcommand dispatch
- 4 redirect SKILL.md files updated
- 5 files in single atomic commit
- `npm test` passes
  </done>
  <recovery>
- **`/devflow:status` (no arg) doesn't run progress workflow** — verify SKILL.md `<process>` correctly handles `subcommand === null` case.
- **`progress` redirect dispatches to `status` empty subcommand** — the deprecation forward should be `/devflow:status` (no extra args). If executor reads `progress → status` from DEPRECATION_MAP and accidentally appends `status` as subcommand, fix the forward shell command.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `/devflow:todo add` and `/devflow:todo list` both route correctly
2. `/devflow:status`, `/devflow:status check`, `/devflow:status --check`, `/devflow:status pause`, `/devflow:status resume` all route correctly
3. All 6 old skills (`add-todo`, `check-todos`, `pause-work`, `resume-work`, `progress`, `health`) trigger deprecation + forward
4. `df-tools skill-route status --resume` and `df-tools skill-route status resume` produce same workflow path
5. `df-tools skill-route status` (no args) returns workflow `progress.md` and subcommand `null`
6. `--list` reflects both `todo` and `status` skills
7. EX4 export-lock test passes (8 exports unchanged)
8. Two atomic commits for SKILL swaps (3 files + 5 files)
9. `npm test` passes
</verification>

<success_criteria>
- 4 commits expected: RED for task 1, GREEN for task 1, atomic commit for task 2, atomic commit for task 3
- SKILL_ROUTES.todo.subcommands = ['add', 'list']
- SKILL_ROUTES.status.subcommands = [null, 'check', 'pause', 'resume']
- DEPRECATION_MAP grew by exactly 6 entries
- 8 SKILL.md files updated/created across two atomic commits
- `_normalizeStatusSubcommand` is private (not in module.exports)
- `npm test` passes
</success_criteria>

<output>
Create `.planning/objectives/12-skill-consolidation/12-03-SUMMARY.md` per template. Required:
- TDD evidence for task 1
- 4 commit hashes
- Sample outputs proving `--check` ≡ `check` normalization
- Sample output proving `status` (no arg) → progress.md
</output>
