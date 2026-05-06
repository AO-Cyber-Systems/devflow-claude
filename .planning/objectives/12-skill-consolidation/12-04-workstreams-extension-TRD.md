---
objective: 12-skill-consolidation
trd: 04
type: tdd
confidence: high
wave: 2
depends_on: ["12-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/skill-route.cjs
  - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
  - plugins/devflow/skills/workstreams/SKILL.md
  - plugins/devflow/devflow/workflows/workstreams-run.md
autonomous: true
requirements:
  - PHASE-G1
must_haves:
  truths:
    - "User can run `/devflow:workstreams setup`, `status`, `merge` and routes via skill-route (consistent with other consolidated skills)"
    - "User can run `/devflow:workstreams run` and routes to workstreams-run.md stub"
    - "skill-route --list includes workstreams with 4 subcommands ['setup','status','merge','run']"
    - "workstreams-run.md stub workflow exists, exits with 'not yet implemented in v1.2 obj 3' message, locks the dispatch surface for v1.2 obj 6"
    - "Existing /devflow:workstreams setup/status/merge invocations continue working (back-compat)"
  artifacts:
    - path: "plugins/devflow/skills/workstreams/SKILL.md"
      provides: "Updated workstreams skill using skill-route + new `run` subcommand"
      contains: "df-tools skill-route workstreams"
    - path: "plugins/devflow/devflow/workflows/workstreams-run.md"
      provides: "Stub workflow for `run` subcommand (locks surface, marks not-yet-implemented)"
      contains: "not yet implemented"
  key_links:
    - from: "plugins/devflow/skills/workstreams/SKILL.md"
      to: "df-tools skill-route"
      via: "Bash invocation"
      pattern: "df-tools skill-route workstreams"
    - from: "plugins/devflow/devflow/bin/lib/skill-route.cjs"
      to: "SKILL_ROUTES.workstreams"
      via: "Extension of dispatch table with 4 subcommands"
      pattern: "subcommands:.*setup.*status.*merge.*run"
---

<objective>
Migrate the existing `/devflow:workstreams` skill from inline prose-level subcommand parsing to the `skill-route` CLI helper pattern (consistency with 12-01/02/03), and add a stub `run` subcommand to lock the dispatch surface for v1.2 obj 6.

Purpose: Workstreams was already partially consolidated in v1.1 (it accepts setup/status/merge today via inline branching), but using the new skill-route CLI keeps all 5 consolidated skills shape-identical. Add `run` as a stub workflow so Phase A (v1.2 obj 6) sees the full 4-subcommand surface in `df-tools skill-route --list`.

Note: This is the ONLY consolidation TRD with NO deprecation redirects — there were never sibling `workstreams-setup` / `workstreams-status` / `workstreams-merge` skill directories (only workflow files). DEPRECATION_MAP is unchanged.

Output: Tested SKILL_ROUTES.workstreams entry with 4 subcommands, updated workstreams SKILL.md using skill-route, new stub workstreams-run.md workflow.
</objective>

<file_tree>
plugins/devflow/
├── devflow/
│   ├── bin/lib/
│   │   ├── skill-route.cjs                            ← MODIFY (add SKILL_ROUTES.workstreams)
│   │   └── skill-route.test.cjs                       ← MODIFY (add workstreams test group)
│   └── workflows/
│       └── workstreams-run.md                         ← CREATE (stub)
└── skills/
    └── workstreams/SKILL.md                           ← MODIFY (use skill-route instead of inline)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: Existing workstreams SKILL.md (the file we're rewriting):**

```yaml
---
name: workstreams
description: Run independent objectives in parallel using git worktrees, then merge results back.
argument-hint: "setup | status | merge"
disable-model-invocation: true
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion]
---
<process>
Parse $ARGUMENTS to determine subcommand.

**If `setup`:** Follow @~/.claude/devflow/workflows/workstreams-setup.md
**If `status`:** Follow @~/.claude/devflow/workflows/workstreams-status.md
**If `merge`:** Follow @~/.claude/devflow/workflows/workstreams-merge.md
</process>
```

**Pattern: Stub workflow (mirror of obj 5 TRD 05-01 stub):**

```markdown
---
status: stub
locked_by: TRD 12-04
will_implement: v1.2 obj 6 (Phase A wiring)
---

<purpose>
STUB: `/devflow:workstreams run` is not yet implemented.
This file exists to lock the dispatch surface for v1.2 obj 6.
</purpose>

<process>
Print to user:

```
⏳ /devflow:workstreams run is not yet implemented.
   Tracked for v1.2 obj 6 (Phase A — Authoritative routing keystone).
   Use /devflow:workstreams setup | status | merge today.
```

Exit with status 0 (informational, not error).
</process>
```

**Pattern: SKILL_ROUTES extension (mirror 12-02 / 12-03):**

```javascript
const WORKSTREAMS_WORKFLOW_MAP = {
  'setup': 'workstreams-setup.md',
  'status': 'workstreams-status.md',
  'merge': 'workstreams-merge.md',
  'run': 'workstreams-run.md',
};

SKILL_ROUTES.workstreams = {
  subcommands: ['setup', 'status', 'merge', 'run'],
  workflow_for: (sub) => `~/.claude/devflow/workflows/${WORKSTREAMS_WORKFLOW_MAP[sub]}`,
};
```

</codebase_examples>

<anti_patterns>

- **Adding workstreams entries to DEPRECATION_MAP** — there are NO old `workstreams-*` skill directories to deprecate. DEPRECATION_MAP must NOT grow in this TRD. Test EX5 enforces.
- **Implementing `run` for real in this TRD** — it's a stub. Real implementation lands in v1.2 obj 6. Stub-and-fill pattern from obj 5 TRD 05-01.
- **Removing inline parsing without testing existing flows** — preserve the 3 existing subcommands' behavior. Tests W1-W3 cover this.

</anti_patterns>

<error_recovery>

- **Existing workstreams SKILL.md uses `Edit` allowed-tool** (per inspection) — preserve in updated version.
- **Workflow files for setup/status/merge already exist** — do NOT modify them in this TRD (out of scope). Only create `workstreams-run.md` (the stub).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/12-skill-consolidation/12-CONTEXT.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md
@.planning/objectives/12-skill-consolidation/12-01-SUMMARY.md

# Existing skill being modified
@plugins/devflow/skills/workstreams/SKILL.md
</context>

<research_context>

From `12-RESEARCH.md`:

**workstreams subcommand mapping (locked):**

| Subcommand | Workflow file |
|---|---|
| `setup` | `workstreams-setup.md` (existing) |
| `status` | `workstreams-status.md` (existing) |
| `merge` | `workstreams-merge.md` (existing) |
| `run` | `workstreams-run.md` (NEW stub) |

**Note:** No deprecation redirects — there are no sibling `workstreams-*` skill dirs. DEPRECATION_MAP unchanged.

</research_context>

<gotchas>

- **`disable-model-invocation: true`** — preserve. Workstreams is structural git mutation, not user-friendly invoke target.
- **`Edit` tool** — workstreams uses Edit (not just Write); preserve in allowed-tools.
- **Stub workflow exits 0** (not error) — user is informed, not penalized for trying.
- **Banner is unchanged at 8 entries.**

</gotchas>

<tasks>

<task type="tdd">
  <name>Task 1: TDD — extend SKILL_ROUTES with workstreams (4 subcommands incl. run stub)</name>
  <files>plugins/devflow/devflow/bin/lib/skill-route.cjs, plugins/devflow/devflow/bin/lib/skill-route.test.cjs</files>
  <action>
RED → GREEN extending dispatch table.

**Test list:**

Group W (workstreams routing):
- W1: `routeSkill('workstreams', ['setup'])` → subcommand 'setup', workflow workstreams-setup.md
- W2: `routeSkill('workstreams', ['status'])` → subcommand 'status', workflow workstreams-status.md
- W3: `routeSkill('workstreams', ['merge'])` → subcommand 'merge', workflow workstreams-merge.md
- W4: `routeSkill('workstreams', ['run'])` → subcommand 'run', workflow workstreams-run.md
- W5: `routeSkill('workstreams', [])` → error 'missing subcommand', usage 'workstreams <setup|status|merge|run>'
- W6: `routeSkill('workstreams', ['unknown'])` → error 'unknown subcommand'

Group WL (--list reflects extension):
- WL1: `cmdSkillRouteList` `skills[]` contains entry `{name: 'workstreams', subcommands: ['setup','status','merge','run']}`

Group WD (DEPRECATION_MAP unchanged — no workstreams entries added):
- WD1: `Object.keys(DEPRECATION_MAP).length` ≤ 13 (12-01 added 3, 12-02 added 4, 12-03 added 6 = 13 total; no growth from this TRD)
- WD2: `DEPRECATION_MAP['workstreams']` is undefined (sanity)

Group EX (export-lock unchanged):
- EX5: `Object.keys(skill-route.cjs.exports).sort()` STILL deepStrictEqual the 8-entry list

**Implementation (GREEN):**

```javascript
const WORKSTREAMS_WORKFLOW_MAP = {
  'setup': 'workstreams-setup.md',
  'status': 'workstreams-status.md',
  'merge': 'workstreams-merge.md',
  'run': 'workstreams-run.md',
};

SKILL_ROUTES.workstreams = {
  subcommands: ['setup', 'status', 'merge', 'run'],
  workflow_for: (sub) => `~/.claude/devflow/workflows/${WORKSTREAMS_WORKFLOW_MAP[sub]}`,
};
```

# CRITICAL: DEPRECATION_MAP must NOT change in this TRD.
# CRITICAL: module.exports must remain at 8 entries.
# PATTERN: Identical shape to milestone (12-02 task 1).
  </action>
  <verify>
```bash
cd plugins/devflow/devflow/bin && node --test lib/skill-route.test.cjs 2>&1 | tail -25
# All W/WL/WD/EX tests pass; existing tests pass.

node df-tools.cjs skill-route workstreams setup
node df-tools.cjs skill-route workstreams run
node df-tools.cjs skill-route --list | grep workstreams

cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test
```
  </verify>
  <done>
RED + GREEN commits exist. All W/WL/WD/EX tests pass. `df-tools skill-route workstreams run` returns workflow workstreams-run.md. `npm test` passes.
  </done>
  <recovery>
- If WD1 fails (DEPRECATION_MAP grew), inspect changes — accidentally added workstreams entries. Remove.
- If EX5 fails, exports were modified — restore.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Update workstreams SKILL.md + create run stub workflow</name>
  <files>plugins/devflow/skills/workstreams/SKILL.md, plugins/devflow/devflow/workflows/workstreams-run.md</files>
  <action>
Standard task. Atomic single commit (2 files).

**Step 1: Replace `plugins/devflow/skills/workstreams/SKILL.md`** with the skill-route pattern (consistent with other consolidated skills):

```yaml
---
name: workstreams
description: |
  Run independent objectives in parallel using git worktrees, then merge results back.
  Subcommand-style: /devflow:workstreams setup | status | merge | run
  Advanced parallel execution — use only when explicitly requested.
argument-hint: "<setup|status|merge|run> [args...]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---

<objective>
Manage parallel feature development using git worktrees. Routes by first argument:
- `setup` — Analyze deps, create worktrees, provision .planning/
- `status` — Check progress across all active workstreams
- `merge` — Squash-merge completed workstreams, reconcile state
- `run` — (stub; v1.2 obj 6 implementation) Run an active workstream end-to-end
</objective>

<execution_context>
@~/.claude/devflow/references/ui-brand.md
@~/.claude/devflow/workflows/workstreams-setup.md
@~/.claude/devflow/workflows/workstreams-status.md
@~/.claude/devflow/workflows/workstreams-merge.md
@~/.claude/devflow/workflows/workstreams-run.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/config.json
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route workstreams $ARGUMENTS --raw)
```

Parse JSON. If `error`, display `usage` and stop.

**2. Follow resolved workflow** based on `subcommand`:
- `setup` → workstreams-setup.md with residual args
- `status` → workstreams-status.md
- `merge` → workstreams-merge.md
- `run` → workstreams-run.md (stub — informs user, exits cleanly)
</process>
```

**Step 2: Create `plugins/devflow/devflow/workflows/workstreams-run.md`** (stub):

```markdown
---
status: stub
locked_by: TRD 12-04
will_implement: v1.2 obj 6 (Phase A — Authoritative routing keystone)
---

<purpose>
STUB workflow for `/devflow:workstreams run`.

This file locks the dispatch surface (so `df-tools skill-route workstreams run` resolves
to a real path) ahead of v1.2 obj 6, where the real implementation lands as part of
the Phase A authoritative-routing wiring.
</purpose>

<process>
Print this message to the user:

```
⏳ /devflow:workstreams run is not yet implemented.
   Tracked for v1.2 obj 6 (Phase A — Authoritative routing keystone, GitHub #26).
   Use /devflow:workstreams setup | status | merge today.
```

Do NOT execute any worktree operations. Exit cleanly (informational, status 0).
</process>
```

# CRITICAL: 2 files in ONE atomic commit.
# CRITICAL: Stub must NOT trigger any worktree mutation. Inform-only.
# GOTCHA: SKILL.md `<execution_context>` lists workstreams-run.md so the @path mirror works after sync-runtime hook.
# PATTERN: Stub-and-fill from obj 5 TRD 05-01 (cmdInitiativesSync stub).
  </action>
  <verify>
```bash
git diff --name-only HEAD~1 HEAD
# Expected: plugins/devflow/skills/workstreams/SKILL.md AND plugins/devflow/devflow/workflows/workstreams-run.md (2 files)

# Resolution check:
node ~/.claude/devflow/bin/df-tools.cjs skill-route workstreams setup
node ~/.claude/devflow/bin/df-tools.cjs skill-route workstreams run

# Manual: /devflow:workstreams setup → workstreams-setup runs (back-compat)
# Manual: /devflow:workstreams run → stub message, no worktree mutation

# Verify stub workflow file content:
grep -q "not yet implemented" plugins/devflow/devflow/workflows/workstreams-run.md
grep -q "v1.2 obj 6" plugins/devflow/devflow/workflows/workstreams-run.md

npm test
```
  </verify>
  <done>
- workstreams SKILL.md uses skill-route dispatch
- workstreams-run.md stub exists with "not yet implemented" + obj 6 reference
- 2 files in single atomic commit
- All 4 subcommands resolve via df-tools skill-route
- Manual `/devflow:workstreams setup` still works
- `npm test` passes
  </done>
  <recovery>
- **`/devflow:workstreams run` triggers worktree mutation** — workflow file has implementation logic. Replace with stub-only content.
- **`/devflow:workstreams setup` regression** — verify SKILL.md `<process>` matches the consolidated pattern; sync-runtime mirror may need refresh: `node plugins/devflow/hooks/sync-runtime.js` manually.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `/devflow:workstreams setup` continues to work via skill-route (back-compat)
2. `/devflow:workstreams status` continues to work
3. `/devflow:workstreams merge` continues to work
4. `/devflow:workstreams run` displays stub message, no mutation
5. `df-tools skill-route --list` includes workstreams with all 4 subcommands
6. EX5 export-lock test passes
7. WD1 (DEPRECATION_MAP unchanged) passes
8. `npm test` passes
</verification>

<success_criteria>
- 3 commits expected: RED for task 1, GREEN for task 1, atomic commit for task 2
- SKILL_ROUTES.workstreams.subcommands = ['setup', 'status', 'merge', 'run']
- DEPRECATION_MAP did NOT grow
- module.exports unchanged at 8 entries
- 2 files in single atomic commit (SKILL.md + run stub workflow)
- `npm test` passes
</success_criteria>

<output>
Create `.planning/objectives/12-skill-consolidation/12-04-SUMMARY.md` per template. Required:
- TDD evidence
- 3 commit hashes
- Sample stub message output (proves run is not implemented)
- Confirmation DEPRECATION_MAP unchanged
</output>
