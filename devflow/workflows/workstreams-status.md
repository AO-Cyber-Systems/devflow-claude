<purpose>

Check progress across all active workstreams. Reads each worktree's STATE.md and git branch activity to present a unified status view.

</purpose>

<required_reading>

**Read these files NOW:**

1. `.planning/workstreams.json`
2. `.planning/STATE.md`

</required_reading>

<process>

<step name="load_workstreams">

Read workstreams data:

```bash
cat .planning/workstreams.json 2>/dev/null
```

If not found: "No active workstreams. Use `/df:workstreams setup` to create them."

If status is "merged": "All workstreams have been merged. Ready for next phase."

</step>

<step name="check_each_worktree">

For each workstream in `workstreams`:

1. **Read worktree STATE.md:**
```bash
cat {worktree_path}/.planning/STATE.md 2>/dev/null
```

Parse: current phase, plan progress, status.

2. **Check git branch activity:**
```bash
git log --oneline -5 {branch_name} 2>/dev/null
```

Extract: last commit date, commit count since base.

3. **Check plan completion on disk:**
```bash
ls {worktree_path}/.planning/phases/*-PLAN.md 2>/dev/null | wc -l
ls {worktree_path}/.planning/phases/*-SUMMARY.md 2>/dev/null | wc -l
```

4. **Determine status:**
   - `pending` — No plans created yet
   - `planning` — PLAN files exist, no SUMMARY
   - `in_progress` — Some SUMMARY files exist
   - `complete` — All plans have summaries

</step>

<step name="present_status">

```
## Workstream Status

| Workstream | Phase | Plans | Status | Last Activity |
|-----------|-------|-------|--------|---------------|
| {name} | Phase {N} | {done}/{total} | {status} | {date} |
| {name} | Phase {N} | {done}/{total} | {status} | {date} |

### Join Phase

**Phase {N}: {name}** — waiting for: {list of incomplete workstreams}

{If all workstreams complete:}
All workstreams complete. Ready to merge:

`/df:workstreams merge`

{If some workstreams complete, some not:}
### Next Steps

**Complete:**
- ✓ {workstream name} — all plans done

**In Progress:**
- ◐ {workstream name} — {X}/{Y} plans done
  Path: `cd {worktree_path}`

{If no workstreams started:}
### Getting Started

Open a terminal for each workstream:
{list worktree paths with cd commands}
```

</step>

</process>

<success_criteria>

Status check is complete when:

- [ ] All active workstreams inspected
- [ ] Progress table presented
- [ ] Join phase status shown
- [ ] Clear next steps provided

</success_criteria>
