<purpose>
Insert a decimal objective for urgent work discovered mid-milestone between existing integer objectives. Uses decimal numbering (72.1, 72.2, etc.) to preserve the logical sequence of planned objectives while accommodating urgent insertions without renumbering the entire roadmap.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_arguments">
Parse the command arguments:
- First argument: integer objective number to insert after
- Remaining arguments: objective description

Example: `/df:insert-objective 72 Fix critical auth bug`
-> after = 72
-> description = "Fix critical auth bug"

If arguments missing:

```
ERROR: Both objective number and description required
Usage: /df:insert-objective <after> <description>
Example: /df:insert-objective 72 Fix critical auth bug
```

Exit.

Validate first argument is an integer.
</step>

<step name="init_context">
Load objective operation context:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init objective-op "${after_objective}")
```

Check `roadmap_exists` from init JSON. If false:
```
ERROR: No roadmap found (.planning/ROADMAP.md)
```
Exit.
</step>

<step name="insert_objective">
**Delegate the objective insertion to df-tools:**

```bash
RESULT=$(node ~/.claude/devflow/bin/df-tools.cjs objective insert "${after_objective}" "${description}")
```

The CLI handles:
- Verifying target objective exists in ROADMAP.md
- Calculating next decimal objective number (checking existing decimals on disk)
- Generating slug from description
- Creating the objective directory (`.planning/objectives/{N.M}-{slug}/`)
- Inserting the objective entry into ROADMAP.md after the target objective with (INSERTED) marker

Extract from result: `objective_number`, `after_objective`, `name`, `slug`, `directory`.
</step>

<step name="update_project_state">
Update STATE.md to reflect the inserted objective:

1. Read `.planning/STATE.md`
2. Under "## Accumulated Context" → "### Roadmap Evolution" add entry:
   ```
   - Objective {decimal_objective} inserted after Objective {after_objective}: {description} (URGENT)
   ```

If "Roadmap Evolution" section doesn't exist, create it.
</step>

<step name="completion">
Present completion summary:

```
Objective {decimal_objective} inserted after Objective {after_objective}:
- Description: {description}
- Directory: .planning/objectives/{decimal-objective}-{slug}/
- Status: Not planned yet
- Marker: (INSERTED) - indicates urgent work

Roadmap updated: .planning/ROADMAP.md
Project state updated: .planning/STATE.md

---

## Next Up

**Objective {decimal_objective}: {description}** -- urgent insertion

`/df:plan-objective {decimal_objective}`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- Review insertion impact: Check if Objective {next_integer} dependencies still make sense
- Review roadmap

---
```
</step>

</process>

<anti_patterns>

- Don't use this for planned work at end of milestone (use /df:add-objective)
- Don't insert before Objective 1 (decimal 0.1 makes no sense)
- Don't renumber existing objectives
- Don't modify the target objective content
- Don't create plans yet (that's /df:plan-objective)
- Don't commit changes (user decides when to commit)
</anti_patterns>

<success_criteria>
Objective insertion is complete when:

- [ ] `df-tools objective insert` executed successfully
- [ ] Objective directory created
- [ ] Roadmap updated with new objective entry (includes "(INSERTED)" marker)
- [ ] STATE.md updated with roadmap evolution note
- [ ] User informed of next steps and dependency implications
</success_criteria>
