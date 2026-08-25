---
status: active
---
<purpose>
Remove an unstarted future objective from the project roadmap, delete its directory, renumber all subsequent objectives to maintain a clean linear sequence, and commit the change. The git commit serves as the historical record of removal.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_arguments">
Parse the command arguments:
- Argument is the objective number to remove (integer or decimal)
- Example: `/devflow:remove-objective 17` → objective = 17
- Example: `/devflow:remove-objective 16.1` → objective = 16.1

If no argument provided:

```
ERROR: Objective number required
Usage: /devflow:remove-objective <phase-number>
Example: /devflow:remove-objective 17
```

Exit.
</step>

<step name="init_context">
Load objective operation context:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init objective-op "${target}")
```

Extract: `objective_found`, `objective_dir`, `objective_number`, `commit_docs`, `roadmap_exists`.

Also read STATE.md and ROADMAP.md content for parsing current position.
</step>

<step name="validate_future_objective">
Verify the objective is a future objective (not started):

1. Compare target objective to current objective from STATE.md
2. Target must be > current objective number

If target <= current objective:

```
ERROR: Cannot remove Objective {target}

Only future objectives can be removed:
- Current objective: {current}
- Objective {target} is current or completed

To abandon current work, use /devflow:pause-work instead.
```

Exit.
</step>

<step name="confirm_removal">
Present removal summary and confirm:

```
Removing Objective {target}: {Name}

This will:
- Delete: .planning/objectives/{target}-{slug}/
- Renumber all subsequent objectives
- Update: ROADMAP.md, STATE.md

Proceed? (y/n)
```

Wait for confirmation.
</step>

<step name="preview_removal">
**Run the dry run first and show the user the real plan.**

`objective remove` is dry-run by default: without `--confirm` it deletes and renames nothing, prints the full plan to stderr, and exits 0.

```bash
node ~/.claude/devflow/bin/df-tools.cjs objective remove "${target}"
```

The plan names the directory that would be deleted and every `old -> new` directory and file rename. Show it to the user verbatim — this is what backs the confirmation above with a machine-checked preview instead of a narrated one.

If the objective has executed jobs (SUMMARY.md files), df-tools errors here regardless of `--confirm`. Add `--force` only if the user confirms removing executed work:

```bash
node ~/.claude/devflow/bin/df-tools.cjs objective remove "${target}" --force
```
</step>

<step name="execute_removal">
**Delegate the entire removal operation to df-tools.** Only after the user has seen the dry-run plan, re-run it with `--confirm`:

```bash
RESULT=$(node ~/.claude/devflow/bin/df-tools.cjs objective remove "${target}" --confirm)
```

`--confirm` executes exactly the plan the dry run printed. For an objective with executed jobs, both flags are required — `--force` overrides the summaries refusal, `--confirm` authorizes the cascade:

```bash
RESULT=$(node ~/.claude/devflow/bin/df-tools.cjs objective remove "${target}" --force --confirm)
```

The CLI handles:
- Deleting the objective directory
- Renumbering all subsequent directories (in reverse order to avoid conflicts)
- Renaming all files inside renumbered directories (JOB.md, SUMMARY.md, etc.)
- Updating ROADMAP.md (removing section, renumbering all objective references, updating dependencies)
- Updating STATE.md (decrementing objective count)

Extract from result: `removed`, `directory_deleted`, `renamed_directories`, `renamed_files`, `roadmap_updated`, `state_updated`.

Both modes also return `dry_run`, `confirmed` and `mutated`. Check `mutated: true` before reporting success — a run without `--confirm` returns `mutated: false` and has changed nothing. `partial: true` on a confirmed run means the rename cascade aborted part-way and the tree needs fixing by hand.
</step>

<step name="commit">
Stage and commit the removal:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "chore: remove objective {target} ({original-phase-name})" --files .planning/
```

The commit message preserves the historical record of what was removed.
</step>

<step name="completion">
Present completion summary:

```
Objective {target} ({original-name}) removed.

Changes:
- Deleted: .planning/objectives/{target}-{slug}/
- Renumbered: {N} directories and {M} files
- Updated: ROADMAP.md, STATE.md
- Committed: chore: remove objective {target} ({original-name})

---

## What's Next

Would you like to:
- `/devflow:progress` — see updated roadmap status
- Continue with current objective
- Review roadmap

---
```
</step>

</process>

<anti_patterns>

- Don't pass `--confirm` before showing the user the dry-run plan
- Don't remove completed objectives (have SUMMARY.md files) without --force
- Don't remove current or past objectives
- Don't manually renumber — use `df-tools objective remove` which handles all renumbering
- Don't add "removed objective" notes to STATE.md — git commit is the record
- Don't modify completed objective directories
</anti_patterns>

<success_criteria>
Objective removal is complete when:

- [ ] Target objective validated as future/unstarted
- [ ] `df-tools objective remove` executed successfully
- [ ] Changes committed with descriptive message
- [ ] User informed of changes
</success_criteria>
