<purpose>

Merge completed workstream branches back to main, reconcile `.planning/` state, clean up worktrees, and prepare for the join objective.

</purpose>

<required_reading>

**Read these files NOW:**

1. `.planning/workstreams.json`
2. `.planning/ROADMAP.md`
3. `.planning/STATE.md`

</required_reading>

<process>

<step name="verify_completion" priority="first">

Read workstreams.json and check each workstream's completion status:

```bash
cat .planning/workstreams.json
```

For each workstream, check its worktree's STATE.md and disk status:

```bash
# For each workstream
cat {worktree_path}/.planning/STATE.md 2>/dev/null
ls {worktree_path}/.planning/objectives/XX-*/*-SUMMARY.md 2>/dev/null
```

**If all workstreams complete:**
Proceed to merge step.

**If some incomplete:**

```
## Workstream Merge Check

| Workstream | Status | Plans |
|-----------|--------|-------|
| {name} | ✓ Complete | {X}/{X} |
| {name} | ✗ Incomplete | {Y}/{Z} |

⚠️ Some workstreams are not complete.

Options:
1. Merge only completed workstreams (incomplete stay as worktrees)
2. Wait for all to complete
3. Force merge all (incomplete work included as-is)
```

Wait for user decision.

</step>

<step name="merge_branches">

For each workstream to merge (in `merge_order` from workstreams.json):

1. **Ensure on main branch:**
```bash
git checkout {base_branch}
```

2. **Squash merge the workstream branch:**
```bash
git merge --squash {branch_name}
```

The `--squash` strategy creates a single clean commit per workstream on main.

3. **Handle conflicts:**

   **Code files (`src/`, `lib/`, etc.):**
   - Let git auto-merge handle most conflicts
   - If real conflicts: present diff to user for manual resolution
   - After resolution: `git add` resolved files

   **`.planning/` files — auto-reconcile strategy:**

   | File | Strategy |
   |------|----------|
   | `objectives/` | No conflict — each workstream has different directories |
   | `ROADMAP.md` | Regenerate from disk after all merges (via reconcile) |
   | `STATE.md` | Discard all versions, regenerate for join objective (via reconcile) |
   | `REQUIREMENTS.md` | Union of `[x]` checkbox completions |
   | `PROJECT.md` | Present diff to user if both modified (rare) |
   | `config.json` | Take main's version |
   | `codebase/` | Take latest (or manual merge if both modified) |
   | `workstream-marker.json` | Delete from merge (main worktree doesn't need it) |

   For `.planning/` conflicts, auto-resolve by taking the workstream's version for objective directories and discarding STATE.md/ROADMAP.md changes (they'll be regenerated):

   ```bash
   # Accept workstream's objective directories (they're unique per workstream)
   git checkout --theirs .planning/objectives/
   # Discard STATE.md and ROADMAP.md changes (will regenerate)
   git checkout --ours .planning/STATE.md .planning/ROADMAP.md 2>/dev/null
   # Remove workstream-marker.json from merge
   git rm .planning/workstream-marker.json 2>/dev/null
   git add .planning/
   ```

4. **Commit the merge:**
```bash
git commit -m "feat: merge {ws-name} (Objective {N}: {objective name})"
```

5. **Update workstream status in workstreams.json:**
   Set this workstream's status to "merged".

Repeat for each workstream.

</step>

<step name="reconcile_state">

After all merges complete, reconcile `.planning/` state:

```bash
RECONCILE=$(node ~/.claude/devflow/bin/df-tools.cjs workstreams reconcile)
```

This command:
- Updates ROADMAP.md progress from disk (counts actual PLAN vs SUMMARY files)
- Regenerates STATE.md pointing to the join objective
- Merges accumulated context (decisions, blockers) from all workstream STATE.md files
- Updates workstreams.json (moves active to completed_workstreams)

Parse the result for `next_phase` and `next_phase_name`.

</step>

<step name="cleanup_worktrees">

For each merged workstream, remove worktree and branch:

```bash
# Remove worktree
git worktree remove {worktree_path} --force

# Delete branch
git branch -d {branch_name}
```

If worktree removal fails (e.g., modified files), warn user:
```
⚠️ Could not auto-remove worktree at {path}.
Manually clean up: rm -rf {path} && git worktree prune
```

</step>

<step name="commit_reconciliation">

<config-check>
Check `commit_docs` from config.
</config-check>

If commit_docs is true:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs: merge workstreams, advance to Objective {N}" --files .planning/workstreams.json .planning/STATE.md .planning/ROADMAP.md
```

</step>

<step name="present_next">

```
## Workstreams Merged

{N} workstreams merged successfully:

| Workstream | Objective | Commit |
|-----------|-------|--------|
| {name} | Objective {N} | {short hash} |
| {name} | Objective {N} | {short hash} |

### State Reconciled

- ROADMAP.md: Progress updated from disk
- STATE.md: Regenerated for Objective {join_phase}
- Worktrees: Cleaned up
- Branches: Deleted

---

## ▶ Next Up

**Objective {join_phase}: {name}** — the join point

All workstream dependencies are satisfied. Ready to plan:

`/df:plan-objective {join_phase}`

<sub>`/clear` first → fresh context window</sub>
```

</step>

</process>

<conflict_strategy>

### Merge Conflict Resolution

**.planning/ files — deterministic strategy:**

| File | Action | Rationale |
|------|--------|-----------|
| `objectives/` | Accept theirs | Each workstream has unique objective dirs |
| `ROADMAP.md` | Regenerate | Count actual files on disk post-merge |
| `STATE.md` | Regenerate | Fresh state for join objective |
| `REQUIREMENTS.md` | Union `[x]` | Both workstreams may complete different requirements |
| `PROJECT.md` | Manual if both changed | Rare — present diff to user |
| `config.json` | Take ours (main) | Config shouldn't change in workstreams |
| `codebase/` | Take latest | Or manual if both modified |
| `workstream-marker.json` | Delete | Only exists in worktrees |

**Code files (src/, etc.):**

Git auto-merge handles most cases. For real conflicts:
1. Show the conflicting files
2. Present both versions
3. Ask user to resolve
4. `git add` after resolution

</conflict_strategy>

<success_criteria>

Merge is complete when:

- [ ] All selected workstreams merged to main
- [ ] Merge conflicts resolved (code: manual, .planning/: auto)
- [ ] Merge commits created per workstream
- [ ] .planning/ state reconciled (ROADMAP, STATE regenerated)
- [ ] Worktrees removed and branches deleted
- [ ] workstreams.json updated (active → completed)
- [ ] User knows join objective and next steps

</success_criteria>
