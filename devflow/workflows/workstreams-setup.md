<purpose>

Analyze ROADMAP.md dependency graph, identify independent phases, create git worktrees for parallel execution, and provision each worktree with filtered `.planning/` context.

</purpose>

<required_reading>

**Read these files NOW:**

1. `.planning/ROADMAP.md`
2. `.planning/STATE.md`
3. `.planning/config.json`

</required_reading>

<process>

<step name="validate_prerequisites" priority="first">

Before setting up workstreams, validate:

1. **Git repo exists:**
```bash
git rev-parse --git-dir 2>/dev/null
```
If not a git repo, stop: "Workstreams require a git repository."

2. **`.planning/` exists with ROADMAP.md:**
```bash
ls .planning/ROADMAP.md 2>/dev/null
```

3. **No uncommitted changes:**
```bash
git status --porcelain
```
If dirty: "Commit or stash changes before creating workstreams."

4. **No existing workstreams active:**
```bash
cat .planning/workstreams.json 2>/dev/null
```
If exists and status is "active": warn user that workstreams already exist. Offer to view status instead.

</step>

<step name="analyze_dependencies">

Run the dependency analyzer:

```bash
ANALYSIS=$(node ~/.claude/devflow/bin/df-tools.cjs workstreams analyze)
```

Parse the result. Check `parallelism_possible`:

**If `false`:**
```
No parallel workstreams detected.

All pending phases have linear dependencies — each depends on the previous.
Use normal sequential execution: /df:plan-phase → /df:execute-phase

Dependency chain:
[Show phase dependency chain from analysis]
```
Stop here.

**If `true`:**
Continue to presentation step.

</step>

<step name="present_workstreams">

Present the workstream plan to the user:

```
## Workstream Analysis

**Parallelism detected:** {max_concurrent} independent workstreams

### Workstream Groups

| # | Workstream | Phases | Depends on (completed) |
|---|-----------|--------|------------------------|
| 1 | {name}    | Phase {N} | Phase {deps} |
| 2 | {name}    | Phase {N} | Phase {deps} |

### Join Point

**Phase {N}: {name}** — waits for all workstreams to complete

### What happens next

1. Create a git worktree + branch for each workstream
2. Copy .planning/ context (filtered per workstream)
3. You open a terminal in each worktree and run normal DevFlow commands
4. When done, run `/df:workstreams merge` from the main worktree

Proceed with workstream setup?
```

<config-check>
```bash
cat .planning/config.json 2>/dev/null
```
</config-check>

<if mode="yolo">
Auto-approve and proceed.
</if>

<if mode="interactive">
Wait for user confirmation before creating worktrees.
</if>

</step>

<step name="create_worktrees">

Read workstreams config from config.json for prefix customization:

```bash
CONFIG=$(node ~/.claude/devflow/bin/df-tools.cjs state load)
```

For each workstream group:

1. **Determine paths:**
   - Branch: `df/ws-{slug}` (or from config `workstreams.branch_prefix`)
   - Worktree: `../{project-name}-ws-{slug}` (or from config `workstreams.worktree_prefix`)

   The project name is derived from the current directory name.

2. **Record base state:**
```bash
BASE_BRANCH=$(git branch --show-current)
BASE_COMMIT=$(git rev-parse HEAD)
```

3. **Create worktree + branch:**
```bash
git worktree add {worktree_path} -b {branch_name}
```

Track created worktrees for the workstreams.json file.

</step>

<step name="provision_planning">

For each created worktree, provision `.planning/`:

```bash
node ~/.claude/devflow/bin/df-tools.cjs workstreams provision {ws-id} {worktree-path}
```

This copies:
- Shared files: PROJECT.md, REQUIREMENTS.md, ROADMAP.md, config.json
- Shared dirs: research/, codebase/
- Filtered phases: only this workstream's phase directories + completed dependencies
- Generated: filtered STATE.md with workstream context header
- Marker: workstream-marker.json identifying this worktree's scope

</step>

<step name="write_workstreams_json">

Write `.planning/workstreams.json` in the main worktree:

```json
{
  "version": "1.0",
  "created": "{timestamp}",
  "base_branch": "{current branch}",
  "base_commit": "{HEAD commit}",
  "status": "active",
  "workstreams": [
    {
      "id": "ws-{slug}",
      "name": "{phase name}",
      "phases": [{phase_number}],
      "branch": "df/ws-{slug}",
      "worktree_path": "{path}",
      "status": "pending",
      "created": "{timestamp}",
      "completed": null,
      "merge_order": {index}
    }
  ],
  "join_phases": [{join_phase_numbers}],
  "completed_workstreams": []
}
```

</step>

<step name="commit_setup">

<config-check>
Check `commit_docs` from config.
</config-check>

If commit_docs is true:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs: setup workstreams for parallel development" --files .planning/workstreams.json .planning/STATE.md
```

</step>

<step name="present_instructions">

```
## Workstreams Created

{N} parallel workstreams ready:

| Workstream | Branch | Worktree Path |
|-----------|--------|---------------|
| {name} | {branch} | {path} |
| {name} | {branch} | {path} |

### How to Use

**Open a terminal for each workstream:**

```bash
# Terminal 1: {workstream 1 name}
cd {worktree_path_1}
claude
# Then: /df:plan-phase {phase} → /df:execute-phase {phase}

# Terminal 2: {workstream 2 name}
cd {worktree_path_2}
claude
# Then: /df:plan-phase {phase} → /df:execute-phase {phase}
```

**When both are done, come back here:**

```bash
/df:workstreams merge
```

### Tips

- Each worktree is a full working copy — run, test, build normally
- DevFlow commands work the same in each worktree
- The transition workflow will detect workstream context and signal completion
- Don't manually merge branches — use `/df:workstreams merge`
```

</step>

</process>

<success_criteria>

Setup is complete when:

- [ ] Git repo validated (clean working tree)
- [ ] Dependency analysis found parallel opportunities
- [ ] User approved workstream groupings
- [ ] Git worktrees created with branches
- [ ] .planning/ provisioned in each worktree (filtered state, marker)
- [ ] workstreams.json written to main worktree
- [ ] User has clear instructions for next steps

</success_criteria>
