---
objective: 12-skill-consolidation
created: 2026-05-04
sources:
  - GitHub issue #32 (Phase G consolidation table)
  - GitHub issue #34 (Phase I cleanups)
  - plugins/devflow/skills/ (28 current SKILL.md files)
  - plugins/devflow/skills/workstreams/SKILL.md (subcommand pattern reference)
  - plugins/devflow/agents/planner.md (lines 200-209 TDD detection)
  - plugins/devflow/agents/executor.md (lines 302-347 TDD execution)
  - plugins/devflow/devflow/templates/summary*.md (4 variants)
  - plugins/devflow/devflow/bin/lib/templates.cjs (template selection logic)
  - plugins/devflow/devflow/bin/lib/objective.cjs (decimal-objective code)
  - plugins/devflow/devflow/workflows/help.md (skill catalog reference)
---

# Research — Phase G+I Skill consolidation + low-leverage cleanup

## Standard stack (no new dependencies)

- **Test runner:** Node native `node --test` (existing); test files `.test.cjs` adjacent to source.
- **Module format:** CommonJS `.cjs`. All `df-tools` libs follow this convention.
- **Skill structure:** YAML frontmatter (`name`, `description`, `argument-hint`, `disable-model-invocation`, `allowed-tools`) + XML body (`<objective>`, `<execution_context>`, `<context>`, `<process>`).
- **Workflow file references:** `@~/.claude/devflow/workflows/<name>.md` — populated by `sync-runtime` SessionStart hook from `${CLAUDE_PLUGIN_ROOT}/devflow/`.
- **CLI helper pattern:** `df-tools <command> <args>` invokes `node ~/.claude/devflow/bin/df-tools.cjs <command>`; output to stdout; JSON via `--raw` or `output()` helper.

## Architecture pattern: subcommand parsing in consolidated skills

**Existing exemplar — workstreams SKILL.md (already consolidated):**

```yaml
---
name: workstreams
argument-hint: "setup | status | merge"
---
<process>
Parse $ARGUMENTS to determine subcommand.

**If `setup`:** Follow @~/.claude/devflow/workflows/workstreams-setup.md
**If `status`:** Follow @~/.claude/devflow/workflows/workstreams-status.md
**If `merge`:** Follow @~/.claude/devflow/workflows/workstreams-merge.md

**If no argument or unrecognized:** Display usage.
</process>
```

**Generalization for this objective — `df-tools skill-route` CLI:**

The five new skills share the same dispatch shape. Rather than duplicating prose-level branches in each SKILL.md (and risking drift), extract the dispatch into a tested CLI helper:

```bash
df-tools skill-route objective add "fix login bug"
# → {"skill": "objective", "subcommand": "add", "args": ["fix login bug"],
#    "workflow": "~/.claude/devflow/workflows/add-objective.md"}

df-tools skill-route objective       # missing subcommand
# → {"error": "missing subcommand", "usage": "objective <add|insert|remove>",
#    "valid_subcommands": ["add", "insert", "remove"]}
```

Each consolidated SKILL.md body is then ~10 lines: call `skill-route`, follow the returned workflow, pass residual args. **Testable**: subcommand parsing, workflow path resolution, validation, residual-arg passthrough — all exercisable via `expect(parseSkillRoute(input)).toEqual(output)` style unit tests.

## Subcommand→workflow mapping table (locked)

| Skill | Subcommand | Workflow file | Replaces (old skill) |
|---|---|---|---|
| `objective` | `add` | `add-objective.md` | `add-objective` |
| `objective` | `insert` | `insert-objective.md` | `insert-objective` |
| `objective` | `remove` | `remove-objective.md` | `remove-objective` |
| `milestone` | `new` | `new-milestone.md` | `new-milestone` |
| `milestone` | `audit` | `audit-milestone.md` | `audit-milestone` |
| `milestone` | `complete` | `complete-milestone.md` | `complete-milestone` |
| `milestone` | `gaps` | `plan-milestone-gaps.md` | `plan-milestone-gaps` |
| `todo` | `add` | `add-todo.md` | `add-todo` |
| `todo` | `list` | `check-todos.md` | `check-todos` |
| `status` | (default) | `progress.md` | `progress` |
| `status` | `--check` | `health.md` | `health` |
| `status` | `--pause` | `pause-work.md` | `pause-work` |
| `status` | `--resume` | `resume-project.md` | `resume-work` |
| `workstreams` | `setup` | `workstreams-setup.md` | (none — already consolidated) |
| `workstreams` | `status` | `workstreams-status.md` | (none) |
| `workstreams` | `merge` | `workstreams-merge.md` | (none) |
| `workstreams` | `run` | `workstreams-run.md` *(NEW)* | (none — new capability) |

**Note on `status`:** The orchestrator's table uses flag-style subcommands (`[--pause|--resume|--check]`). For consistency with `objective`/`milestone`/`todo` (subcommand-style), the implementation accepts BOTH:
- `status` (no arg) → `progress.md` (default)
- `status check` or `status --check` → `health.md`
- `status pause` or `status --pause` → `pause-work.md`
- `status resume` or `status --resume` → `resume-project.md`

`skill-route` normalizes leading `--` strip + alias resolution. Tests cover both forms.

**Note on `workstreams run`:** Per #32 the consolidation table mentions `workstreams <setup|status|merge|run>`. `run` is a NEW capability not present today (no `workstreams-run.md` workflow exists). This objective creates a stub workflow that exits with "not yet implemented in v1.2 obj 3 — landing in v1.2 obj 6 PR" — to lock the dispatch surface without committing implementation. Stub-and-fill follows obj 5 pattern (TRD 05-01 cmdInitiativesSync).

## Deprecation redirect template

Each of 13 old skill files becomes a thin redirect (≤25 lines):

```yaml
---
name: add-objective
description: |
  DEPRECATED: use `/devflow:objective add` instead. Will be removed in v3.0.
  This redirect forwards to the consolidated skill.
argument-hint: <description>
disable-model-invocation: true
allowed-tools:
  - Bash
---

<objective>
DEPRECATED redirect. Calls `/devflow:objective add $ARGUMENTS`.
</objective>

<process>
1. Emit deprecation warning via `df-tools deprecation log add-objective`
2. Invoke `/devflow:objective add $ARGUMENTS` as if user typed it
</process>
```

`df-tools deprecation log <old-name>` appends to `.planning/.deprecation-log.jsonl` (gitignored, like `.dup-detect-log.jsonl`). Format: `{ts, old_name, new_form, project_root}`. Used by analytics + future v3.0 removal-readiness check.

## TDD collapse design (I3)

**Today (TRD-level type):**

```yaml
# In TRD frontmatter
---
type: tdd
---
```

Planner detects via heuristic (planner.md:199-209), creates dedicated `type: tdd` TRD per feature. Executor branches on `type === 'tdd'` (executor.md:302-347).

**After (task-level flag):**

```xml
<task type="auto" tdd="true">
  <name>Add validateEmail function</name>
  <files>src/lib/email.cjs, src/lib/email.test.cjs</files>
  <action>...</action>
  <verify>...</verify>
  <done>...</done>
</task>
```

Planner emits `tdd="true"` attribute on individual tasks (still uses test-pairing rule). Executor's `<tdd_execution>` block runs RED→GREEN→REFACTOR for any task where `tdd="true"` regardless of TRD `type`. Existing `type: tdd` TRDs still work — the executor treats `type: tdd` as "all tasks default to `tdd="true"`".

**Back-compat:** During the transition window, executor checks BOTH:
1. Task-level `tdd="true"` → run TDD cycle for this task
2. TRD-level `type: tdd` → run TDD cycle for ALL tasks unless explicitly `tdd="false"`

This means existing TRDs in flight (objs 10, 11) continue to work without re-planning. New TRDs from v1.2 obj 4+ adopt task-level pattern.

**Files touched:**
- `plugins/devflow/agents/planner.md` lines ~199-209 (TDD Detection section)
- `plugins/devflow/agents/executor.md` lines ~302-347 (`<tdd_execution>` block)
- `plugins/devflow/devflow/references/tdd.md` (canonical reference; describe both forms during transition)

**Net savings:** ~50 lines in executor preamble (planner.md grows ~10 lines for task-level flag emission rule; executor.md shrinks ~60 lines as TRD-type branch merges into task-loop). Estimated token savings: ~400 tokens per executor invocation.

## I2: Decimal-objective survey design

**Survey scope:** Active DevFlow projects on the user's machine — directories under `~/Source/`, `~/Repos/`, or wherever this user keeps repos. The survey CLI walks each project's `.planning/objectives/` and counts:
- Total objectives (any directory matching `^\d+`)
- Decimal objectives (matching `^\d+\.\d+`)
- Inserted objectives (frontmatter or directory name contains `INSERTED` marker)

**Threshold:** <5% of objectives use decimals → drop the feature. Survey output is a JSON report saved to `12-RESEARCH.md` § "I2 disposition" (see below).

**CLI surface:**

```bash
df-tools survey decimal-objectives --root ~/Source
# → {
#   "projects_scanned": 12,
#   "total_objectives": 87,
#   "decimal_objectives": 1,
#   "decimal_percentage": 1.15,
#   "threshold_percentage": 5.0,
#   "recommendation": "drop",
#   "by_project": [
#     {"project": "devflow-claude", "total": 12, "decimal": 0},
#     ...
#   ]
# }
```

**Disposition section in 12-RESEARCH.md** is populated by the executor running this CLI. If `recommendation: drop`, a follow-up sub-task removes `lib/objective.cjs` decimal logic + simplifies roadmap parsing (lines 198-237, 399-455, 503-578 per the grep results = ~80 LOC). If `recommendation: keep`, the disposition documents the cells where decimals proved useful.

### I2 disposition

**Survey ran:** 2026-05-04T00:00:00Z
**Survey root:** /Users/markemerson/Source
**Projects scanned:** 16
**Total objectives:** 120
**Decimal objectives:** 0 (0%)
**Threshold:** 5.0%
**Recommendation:** drop

**Per-project breakdown:**

| Project | Total objectives | Decimal objectives |
|---|---|---|
| aodex | 11 | 0 |
| aodex-dev | 6 | 0 |
| aodex-flutter | 11 | 0 |
| aodex-go | 2 | 0 |
| aohealth | 15 | 0 |
| aosentry | 3 | 0 |
| claude-relay | 1 | 0 |
| devflow-claude | 1 | 0 |
| devflow-claude-handoff-completion | 1 | 0 |
| devflow-claude-v1.1 | 13 | 0 |
| devflow-claude-v11 | 1 | 0 |
| eden-biz-flutter | 4 | 0 |
| eden-biz-flutter.SAAS | 4 | 0 |
| eden-biz-go | 17 | 0 |
| eden-biz-go.SAAS | 14 | 0 |
| eden-libs | 16 | 0 |

**Action taken:**
- Recommendation is `drop` (0% usage across 16 active projects, 120 objectives scanned).
- Task 3 of this TRD (12-06) removes `lib/objective.cjs` decimal-handling code per this disposition.
- `df-tools objective insert` (decimal-objective insertion) deprecated and returns error JSON in v1.2.

## I4: Summary template canonicalization

**Today:**
- `templates/summary.md` (326 lines) — the verbose canonical
- `templates/summary-minimal.md` (41 lines) — auto-selected for small TRDs
- `templates/summary-standard.md` (48 lines) — auto-selected default
- `templates/summary-complex.md` (59 lines) — auto-selected for big TRDs

**Selection logic** (`lib/templates.cjs:cmdTemplateSelect`): heuristic on task count + file count + decision keyword presence. Three of four templates are dead weight relative to the canonical 326-line version, which is the only one referenced by `executor.md:452` and `planner.md:496`.

**Decision (locked):**
- Keep `templates/summary.md` (canonical 326-line version)
- Delete `summary-minimal.md`, `summary-standard.md`, `summary-complex.md`
- Update `lib/templates.cjs:cmdTemplateSelect` to ALWAYS return `templates/summary.md` regardless of heuristic input
- Add config flag `summary_verbosity: minimal|standard|complex|full` (default `full`) for FUTURE differentiation (out of scope for v1.2 obj 3 — but reserve the field)
- Tests in `lib/templates.test.cjs` updated: `cmdTemplateSelect` always returns `templates/summary.md`

**Net savings:** 148 lines deleted (41+48+59), ~1KB on disk per plugin install. Removes one decision point from agent workflow.

## Codebase patterns to mimic

### Pattern: CLI helper module with `_setRunX` injection (from obj 1-5)

```javascript
// lib/skill-route.cjs
'use strict';

const fs = require('fs');
const path = require('path');

const realFs = {
  readFileSync: fs.readFileSync,
  existsSync: fs.existsSync,
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

const SKILL_ROUTES = {
  objective: {
    subcommands: ['add', 'insert', 'remove'],
    workflow_for: (sub) => `~/.claude/devflow/workflows/${sub}-objective.md`,
  },
  // ...
};

function routeSkill(skill, args) { /* ... */ }

module.exports = {
  routeSkill,
  SKILL_ROUTES,
  _setRunFs,
  _resetMocks,
};
```

### Pattern: SKILL.md thin orchestrator (from `awareness`, `initiatives`)

```yaml
---
name: objective
argument-hint: "<add|insert|remove> [args]"
disable-model-invocation: true
allowed-tools: [Read, Write, Bash]
---
<objective>
Add, insert, or remove an objective from the current milestone roadmap.
</objective>

<process>
**Run skill-route to dispatch:**

```bash
ROUTE=$(df-tools skill-route objective $ARGUMENTS)
```

**Follow the workflow returned by ROUTE.workflow:**

@${ROUTE.workflow}

**Pass residual args via $ARGUMENTS to the workflow.**
</process>
```

### Pattern: Export-lock comment (from obj 1, 2, 3, 4, 5)

Every shared lib module ends with:

```javascript
// ─── module.exports — LOCKED by TRD 12-NN (M-entry surface; SC-N)
//     DO NOT MODIFY without updating EX1 export-lock test atomically.
module.exports = { /* ... */ };
```

### Pattern: Single-source-of-truth check (from obj 4 dup-detect)

Tests call `routeSkill('objective', ['add', 'fix bug'])` directly — no subprocess. Subprocess tests reserved for end-to-end CLI dispatch (`spawnSync('df-tools', ['skill-route', 'objective', 'add', 'fix bug'])`).

## Anti-patterns (don't repeat)

- **Inline branching in SKILL.md** — workstreams uses prose `If setup: ... If status: ...`. This was acceptable for one skill but doesn't scale to 4 more without drift. Use the CLI helper.
- **LLM-generated test data** — per global TDD playbook. Build factory fixtures in `__fixtures__/skill-route-fixtures.cjs`.
- **Property-based testing** — not justified here. Subcommand parsing is finite; enumerate cases.
- **Gherkin / BDD layer** — overkill. Descriptive test names are enough.
- **Mixing TRD scope** — don't bundle skill consolidation with TDD-collapse + summary cleanup in one TRD. Each gets its own TRD per orchestrator decomposition guidance.
- **Atomicity violation** — never land a consolidated skill without its deprecation redirects in the same commit. See risk note in 12-CONTEXT.md.

## Common pitfalls

- **Skill name collisions** — current `workstreams` skill already exists. The new consolidation must REPLACE its body (extending to add `run`) rather than create a sibling. TRD 12-04 specifically calls this out.
- **Argument-hint sync** — `argument-hint` in YAML frontmatter must match `skill-route`'s usage strings. Test asserts equality.
- **`disable-model-invocation: true`** — preserve this on consolidated skills (carried from old siblings). It prevents Claude from auto-invoking these structural-change commands.
- **Shorthand normalization for `status`** — `--check` and `check` must both resolve. Same for `--pause`/`pause` and `--resume`/`resume`. `skill-route` strips leading `--` before lookup.
- **`resume-work` workflow filename** — old skill file is `resume-work/SKILL.md` but the workflow is `resume-project.md` (not `resume-work.md`). Mapping table above reflects this. Test guards against typo.

## Phase A handoff (consumed by v1.2 obj 6)

Phase A's `classify-session.js` SessionStart hook injects a routing decision table into the system prompt. This objective produces:

1. **Consolidated skill list** (5 entries instead of 17) — Phase A reads `df-tools skill-route --list` to enumerate.
2. **Subcommand inventory** — flat list of `(skill, subcommand) → workflow` pairs from `SKILL_ROUTES`.
3. **Deprecation map** — `(old_name → new_form)` from the 13 redirect SKILL files.

`df-tools skill-route --list` outputs:

```json
{
  "skills": [
    {"name": "objective", "subcommands": ["add", "insert", "remove"]},
    {"name": "milestone", "subcommands": ["new", "audit", "complete", "gaps"]},
    {"name": "todo", "subcommands": ["add", "list"]},
    {"name": "status", "subcommands": [null, "check", "pause", "resume"]},
    {"name": "workstreams", "subcommands": ["setup", "status", "merge", "run"]}
  ],
  "deprecated": {
    "add-objective": "objective add",
    "insert-objective": "objective insert",
    ...
  }
}
```

Phase A consumes this without re-implementation.

## Validation gates

```bash
npm test              # all 1359+ tests pass
node ~/.claude/devflow/bin/df-tools.cjs skill-route --list  # JSON contract intact
node ~/.claude/devflow/bin/df-tools.cjs survey decimal-objectives --root ~/Source  # I2 survey
```

There is no separate lint or build command in this codebase — only `npm test`.
