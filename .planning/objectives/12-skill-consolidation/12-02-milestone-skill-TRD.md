---
objective: 12-skill-consolidation
trd: 02
type: tdd
confidence: high
wave: 2
depends_on: ["12-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/skill-route.cjs
  - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
  - plugins/devflow/skills/milestone/SKILL.md
  - plugins/devflow/skills/new-milestone/SKILL.md
  - plugins/devflow/skills/audit-milestone/SKILL.md
  - plugins/devflow/skills/complete-milestone/SKILL.md
  - plugins/devflow/skills/plan-milestone-gaps/SKILL.md
autonomous: true
requirements:
  - PHASE-G1
  - PHASE-G2
must_haves:
  truths:
    - "User can run `/devflow:milestone new [name]` and it routes to new-milestone workflow"
    - "User can run `/devflow:milestone audit [version]` and it routes to audit-milestone workflow"
    - "User can run `/devflow:milestone complete <version>` and it routes to complete-milestone workflow"
    - "User can run `/devflow:milestone gaps` and it routes to plan-milestone-gaps workflow"
    - "All 4 old milestone skill names still work via deprecation redirects with warning + forward"
    - "df-tools skill-route --list now includes milestone in skills array with 4 subcommands"
  artifacts:
    - path: "plugins/devflow/skills/milestone/SKILL.md"
      provides: "Consolidated milestone skill with 4-way subcommand dispatch"
      contains: "df-tools skill-route milestone"
    - path: "plugins/devflow/skills/new-milestone/SKILL.md"
      provides: "Deprecation redirect to /devflow:milestone new"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/audit-milestone/SKILL.md"
      provides: "Deprecation redirect to /devflow:milestone audit"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/complete-milestone/SKILL.md"
      provides: "Deprecation redirect to /devflow:milestone complete"
      contains: "DEPRECATED"
    - path: "plugins/devflow/skills/plan-milestone-gaps/SKILL.md"
      provides: "Deprecation redirect to /devflow:milestone gaps"
      contains: "DEPRECATED"
  key_links:
    - from: "plugins/devflow/skills/milestone/SKILL.md"
      to: "df-tools skill-route"
      via: "Bash invocation in <process>"
      pattern: "df-tools skill-route milestone"
    - from: "plugins/devflow/devflow/bin/lib/skill-route.cjs"
      to: "SKILL_ROUTES.milestone"
      via: "Extension of dispatch table"
      pattern: "subcommands:.*new.*audit.*complete.*gaps"
---

<objective>
Extend the skill-route dispatch table with `milestone` (4 subcommands), create the consolidated `/devflow:milestone` skill, and replace 4 sibling skills (new/audit/complete/plan-gaps-milestone) with deprecation redirects. Atomic per-skill landing rule applies (all 5 SKILL.md files in one commit).

Purpose: Second consumer of the skill-route pattern from 12-01. Validates the pattern generalizes from 3 subcommands → 4 with no shape change. Locks milestone consolidation before 12-03/04 also extend SKILL_ROUTES.

Output: Tested SKILL_ROUTES.milestone entry, DEPRECATION_MAP extended with 4 entries, consolidated milestone skill, 4 deprecation redirects, all atomic.
</objective>

<file_tree>
plugins/devflow/
├── devflow/bin/lib/
│   ├── skill-route.cjs                                ← MODIFY (extend SKILL_ROUTES + DEPRECATION_MAP)
│   └── skill-route.test.cjs                           ← MODIFY (add milestone test groups)
└── skills/
    ├── milestone/SKILL.md                             ← CREATE (consolidated)
    ├── new-milestone/SKILL.md                         ← MODIFY (deprecation redirect)
    ├── audit-milestone/SKILL.md                       ← MODIFY (deprecation redirect)
    ├── complete-milestone/SKILL.md                    ← MODIFY (deprecation redirect)
    └── plan-milestone-gaps/SKILL.md                   ← MODIFY (deprecation redirect)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: SKILL_ROUTES extension (mirror what 12-01 created):**

```javascript
const SKILL_ROUTES = {
  objective: {
    subcommands: ['add', 'insert', 'remove'],
    workflow_for: (sub) => `~/.claude/devflow/workflows/${sub}-objective.md`,
  },
  milestone: {
    subcommands: ['new', 'audit', 'complete', 'gaps'],
    workflow_for: (sub) => {
      // Note: 'gaps' maps to 'plan-milestone-gaps.md', not 'gaps-milestone.md'
      const map = {
        'new': 'new-milestone.md',
        'audit': 'audit-milestone.md',
        'complete': 'complete-milestone.md',
        'gaps': 'plan-milestone-gaps.md',
      };
      return `~/.claude/devflow/workflows/${map[sub]}`;
    },
  },
};
```

**Pattern: Consolidated SKILL.md template (mirror objective/SKILL.md from 12-01):**

```yaml
---
name: milestone
description: |
  Manage milestones: start a new one, audit a finished one, complete it, or plan gap-closure objectives.
  Subcommand-style: /devflow:milestone new | audit | complete | gaps
argument-hint: "<new|audit|complete|gaps> [args...]"
disable-model-invocation: true
allowed-tools: [Read, Write, Bash, Task, AskUserQuestion, Glob, Grep]
---
```

**Pattern: Deprecation redirect (mirror add-objective from 12-01):**

```yaml
---
name: new-milestone
description: |
  DEPRECATED — use `/devflow:milestone new` instead. Will be removed in v3.0.
disable-model-invocation: true
allowed-tools: [Bash, SlashCommand]
---
```

</codebase_examples>

<anti_patterns>

- **Workflow filename guess** — `gaps` does NOT map to `gaps-milestone.md`. It maps to `plan-milestone-gaps.md`. Tests catch this; do not "fix" by renaming the workflow.
- **Forgetting to update EX1 export-lock test** — when SKILL_ROUTES grows, EX1 tests `routeSkill('milestone', ...)` cases. The locked exports list (8 entries) does NOT change in this TRD; only the data inside SKILL_ROUTES grows.
- **Re-implementing `routeSkill`** — only ADD to `SKILL_ROUTES` table. The dispatch logic is unchanged.
- **LLM-generated test data** — use `__fixtures__/skill-route-fixtures.cjs` builders.
- **Non-atomic commit** — all 5 SKILL files (milestone + 4 redirects) in one commit.

</anti_patterns>

<error_recovery>

- **`new-milestone` workflow file references `Task` tool** — preserve `Task` in `allowed-tools` of consolidated `milestone` SKILL.md (it spawns researcher agents).
- **`audit-milestone` workflow needs `Glob`** — preserve `Glob` in `allowed-tools`.
- **`plan-milestone-gaps` workflow filename mismatch** — see anti-patterns. Test G4 enforces the mapping.
- **Argument-hint mismatch** — keep `argument-hint` exactly synchronized with `SKILL_ROUTES.milestone.subcommands`. EX2 test asserts.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/12-skill-consolidation/12-CONTEXT.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md
@.planning/objectives/12-skill-consolidation/12-01-SUMMARY.md

# Old SKILL files being replaced/redirected
@plugins/devflow/skills/new-milestone/SKILL.md
@plugins/devflow/skills/audit-milestone/SKILL.md
@plugins/devflow/skills/complete-milestone/SKILL.md
@plugins/devflow/skills/plan-milestone-gaps/SKILL.md
</context>

<research_context>

From `12-RESEARCH.md`:

**milestone subcommand mapping (locked):**

| Subcommand | Workflow file | Replaces (old skill) |
|---|---|---|
| `new` | `new-milestone.md` | `new-milestone` |
| `audit` | `audit-milestone.md` | `audit-milestone` |
| `complete` | `complete-milestone.md` | `complete-milestone` |
| `gaps` | `plan-milestone-gaps.md` | `plan-milestone-gaps` |

`gaps` is the user-facing alias for the `plan-milestone-gaps` workflow (cleaner CLI).

**DEPRECATION_MAP additions:**

```javascript
'new-milestone': 'milestone new',
'audit-milestone': 'milestone audit',
'complete-milestone': 'milestone complete',
'plan-milestone-gaps': 'milestone gaps',
```

</research_context>

<gotchas>

- **`disable-model-invocation: true`** on consolidated milestone skill (preserve from siblings).
- **`allowed-tools` superset rule** — consolidated skill's allowed-tools must be the UNION of all 4 siblings' allowed-tools. Otherwise some workflows can't run. From inspection: `[Read, Write, Bash, Task, AskUserQuestion, Glob, Grep]`.
- **`argument-hint` consistency** — EX2 test asserts equality with subcommands enumeration.
- **Decimal-objective sub-flag for `audit`** — `audit-milestone` workflow accepts optional `[version]` arg; pass through verbatim.

</gotchas>

<tasks>

<task type="tdd">
  <name>Task 1: TDD — extend SKILL_ROUTES + DEPRECATION_MAP for milestone</name>
  <files>plugins/devflow/devflow/bin/lib/skill-route.cjs, plugins/devflow/devflow/bin/lib/skill-route.test.cjs</files>
  <action>
RED → GREEN extending the dispatch table.

**Test list:**

Group M (milestone routing):
- M1: `routeSkill('milestone', ['new', 'v1.3'])` → `{skill: 'milestone', subcommand: 'new', args: ['v1.3'], workflow: '~/.claude/devflow/workflows/new-milestone.md'}`
- M2: `routeSkill('milestone', ['audit'])` → subcommand 'audit', args [], workflow audit-milestone.md
- M3: `routeSkill('milestone', ['audit', 'v1.2'])` → subcommand 'audit', args ['v1.2'], workflow audit-milestone.md
- M4: `routeSkill('milestone', ['complete', 'v1.2'])` → subcommand 'complete', args ['v1.2']
- M5: `routeSkill('milestone', ['gaps'])` → subcommand 'gaps', workflow `~/.claude/devflow/workflows/plan-milestone-gaps.md` (NOT `gaps-milestone.md`)
- M6: `routeSkill('milestone', [])` → error 'missing subcommand', usage 'milestone <new|audit|complete|gaps>'
- M7: `routeSkill('milestone', ['unknown'])` → error 'unknown subcommand'

Group MD (DEPRECATION_MAP additions):
- MD1: `DEPRECATION_MAP['new-milestone']` === 'milestone new'
- MD2: `DEPRECATION_MAP['audit-milestone']` === 'milestone audit'
- MD3: `DEPRECATION_MAP['complete-milestone']` === 'milestone complete'
- MD4: `DEPRECATION_MAP['plan-milestone-gaps']` === 'milestone gaps'

Group ML (--list reflects extension):
- ML1: `cmdSkillRouteList(cwd, raw=true)` returns object with `skills[]` containing entry `{name: 'milestone', subcommands: ['new','audit','complete','gaps']}`
- ML2: `--list` `deprecated` map contains all 4 new entries

Group EX (export-lock unchanged):
- EX3: `Object.keys(skill-route.cjs.exports).sort()` STILL deepStrictEqual the 8-entry list from 12-01 (no new exports added)

**Implementation (GREEN):**

In `lib/skill-route.cjs`:

```javascript
const MILESTONE_WORKFLOW_MAP = {
  'new': 'new-milestone.md',
  'audit': 'audit-milestone.md',
  'complete': 'complete-milestone.md',
  'gaps': 'plan-milestone-gaps.md',
};

SKILL_ROUTES.milestone = {
  subcommands: ['new', 'audit', 'complete', 'gaps'],
  workflow_for: (sub) => `~/.claude/devflow/workflows/${MILESTONE_WORKFLOW_MAP[sub]}`,
};

Object.assign(DEPRECATION_MAP, {
  'new-milestone': 'milestone new',
  'audit-milestone': 'milestone audit',
  'complete-milestone': 'milestone complete',
  'plan-milestone-gaps': 'milestone gaps',
});
```

# CRITICAL: workflow_for uses lookup table — `gaps` → `plan-milestone-gaps.md`. Test M5 catches typo.
# CRITICAL: Do NOT add new module.exports entries — banner is locked at 8.
# PATTERN: Mirror objective's workflow_for shape from 12-01.

**REFACTOR (optional):** If both objective and milestone use lookup tables (objective doesn't yet), unify them in a shared `_workflowMap` helper. Optional — only if it reduces duplication.
  </action>
  <verify>
```bash
cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs 2>&1 | tail -25
# All M/MD/ML/EX tests pass

# Manual smoke:
node df-tools.cjs skill-route milestone new "v1.3"
# {"skill":"milestone","subcommand":"new","args":["v1.3"],"workflow":"~/.claude/devflow/workflows/new-milestone.md"}

node df-tools.cjs skill-route milestone gaps
# workflow ends with plan-milestone-gaps.md (not gaps-milestone.md)

node df-tools.cjs skill-route --list | grep -o 'milestone'
# Two hits (skills entry + deprecated entries)

cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test
```
  </verify>
  <done>
RED commit `test(12-02): add failing tests for milestone routing` exists. GREEN commit `feat(12-02): extend SKILL_ROUTES with milestone subcommands` exists. All M/MD/ML/EX tests pass. `df-tools skill-route milestone gaps` resolves to plan-milestone-gaps.md. `npm test` passes.
  </done>
  <recovery>
- If EX3 fails (exports changed), inspect `module.exports` block — accidentally added an entry. Revert added entries; data tables (`SKILL_ROUTES`, `DEPRECATION_MAP`) are mutated objects, not new exports.
- If M5 fails with `gaps-milestone.md` workflow path, fix the lookup table: it must literally be `'gaps': 'plan-milestone-gaps.md'`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Atomic skill swap — consolidated /devflow:milestone + 4 deprecation redirects</name>
  <files>plugins/devflow/skills/milestone/SKILL.md, plugins/devflow/skills/new-milestone/SKILL.md, plugins/devflow/skills/audit-milestone/SKILL.md, plugins/devflow/skills/complete-milestone/SKILL.md, plugins/devflow/skills/plan-milestone-gaps/SKILL.md</files>
  <action>
Standard task — markdown editing of 5 SKILL files. Atomic single-commit rule.

**Step 1: Create `plugins/devflow/skills/milestone/SKILL.md`:**

```yaml
---
name: milestone
description: |
  Manage milestones: start a new one, audit a finished one, complete it, or plan gap-closure objectives.
  Subcommand-style: /devflow:milestone new | audit | complete | gaps
  Use when explicitly requested.
argument-hint: "<new|audit|complete|gaps> [args...]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - AskUserQuestion
  - Glob
  - Grep
---

<objective>
Manage milestones in the current project. Routes by first argument:
- `new [name]` — Start the next development cycle (questioning → research → requirements → roadmap)
- `audit [version]` — Verify a milestone achieved its definition of done
- `complete <version>` — Archive milestone and tag git release
- `gaps` — Turn audit gaps into new objectives that close them

Replaces 4 sibling skills: new-milestone, audit-milestone, complete-milestone, plan-milestone-gaps.
</objective>

<execution_context>
@~/.claude/devflow/workflows/new-milestone.md
@~/.claude/devflow/workflows/audit-milestone.md
@~/.claude/devflow/workflows/complete-milestone.md
@~/.claude/devflow/workflows/plan-milestone-gaps.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/PROJECT.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route milestone $ARGUMENTS --raw)
```

Parse the JSON. If it contains `error`, display `usage` and stop. Otherwise extract `subcommand`, `args`, and `workflow`.

**2. Follow the resolved workflow.**

Based on `subcommand`:
- `new` → execute new-milestone workflow with residual args (the name, if provided)
- `audit` → execute audit-milestone workflow with residual args (the version, if provided)
- `complete` → execute complete-milestone workflow with residual args (the version, REQUIRED)
- `gaps` → execute plan-milestone-gaps workflow with residual args

Pass residual `args` to the workflow as `$ARGUMENTS`.
</process>
```

**Step 2: Replace each redirect SKILL.md** with the deprecation pattern from 12-01 task 3, substituting:

| File | name | Forwards to |
|---|---|---|
| `new-milestone/SKILL.md` | `new-milestone` | `/devflow:milestone new` |
| `audit-milestone/SKILL.md` | `audit-milestone` | `/devflow:milestone audit` |
| `complete-milestone/SKILL.md` | `complete-milestone` | `/devflow:milestone complete` |
| `plan-milestone-gaps/SKILL.md` | `plan-milestone-gaps` | `/devflow:milestone gaps` |

Each redirect:
1. Logs deprecation via `df-tools deprecation log <old-name>`
2. Displays warning notice
3. Forwards via SlashCommand to the new form

# CRITICAL: All 5 SKILL files in ONE commit. No partial commits.
# CRITICAL: argument-hint must match SKILL_ROUTES.milestone.subcommands.
# GOTCHA: complete-milestone REQUIRES version arg; preserve `argument-hint: <version>` semantic in redirect.
# GOTCHA: audit-milestone version arg is OPTIONAL — `argument-hint: "[version]"`.
# PATTERN: Identical to 12-01 task 3.
  </action>
  <verify>
```bash
# Verify atomic commit:
git diff --name-only HEAD~1 HEAD | grep -c 'plugins/devflow/skills/.*milestone.*SKILL\.md'
# Expected: 5

# All 4 dispatch paths resolve:
for sub in new audit complete gaps; do
  node ~/.claude/devflow/bin/df-tools.cjs skill-route milestone $sub
done

# Manual: invoke /devflow:milestone audit in Claude Code → audit-milestone runs
# Manual: invoke /devflow:audit-milestone → deprecation warning + audit-milestone runs

npm test
```
  </verify>
  <done>
- `plugins/devflow/skills/milestone/SKILL.md` exists with 4-subcommand dispatch
- All 4 redirect SKILL.md files updated with DEPRECATED pattern
- All 5 files in single atomic commit
- `df-tools skill-route milestone <sub>` resolves all 4 subcommands correctly
- `npm test` passes
  </done>
  <recovery>
- **Partial commit** — `git reset --soft HEAD~1`, restage all 5, recommit.
- **`/devflow:milestone gaps` invocation hits wrong workflow** — verify SKILL_ROUTES.milestone.workflow_for('gaps') in skill-route.cjs (lookup map issue, not SKILL.md issue).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `/devflow:milestone new` routes to new-milestone workflow (manual)
2. `/devflow:milestone audit` routes to audit-milestone workflow (manual)
3. `/devflow:milestone complete v1.2` routes to complete-milestone workflow (manual)
4. `/devflow:milestone gaps` routes to plan-milestone-gaps workflow (manual)
5. All 4 old skill names trigger deprecation warning + forward (manual)
6. `df-tools skill-route --list` includes milestone with 4 subcommands
7. EX3 export-lock test still passes (8 exports, unchanged)
8. `git log -1 --name-only` for SKILL-swap commit shows 5 files
9. `npm test` passes (1359 + N + M)
</verification>

<success_criteria>
- 3 commits expected: RED for task 1, GREEN for task 1, single atomic commit for task 2
- SKILL_ROUTES.milestone.subcommands = ['new', 'audit', 'complete', 'gaps']
- DEPRECATION_MAP grew by exactly 4 entries
- 5 SKILL.md files updated/created in single atomic commit
- `npm test` passes
- No new module.exports entries (8 exports unchanged)
</success_criteria>

<output>
Create `.planning/objectives/12-skill-consolidation/12-02-SUMMARY.md` per template. Required:
- TDD evidence for task 1 (RED/GREEN exit codes)
- 3 commit hashes
- Test count delta
- Sample `df-tools skill-route milestone gaps` output (proves `gaps` → `plan-milestone-gaps.md` mapping)
</output>
