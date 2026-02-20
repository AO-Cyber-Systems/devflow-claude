<purpose>
Add a new integer objective to the end of the current milestone in the roadmap. Automatically calculates next objective number, creates objective directory, and updates roadmap structure.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_arguments">
Parse the command arguments:
- All arguments become the objective description
- Example: `/df:add-objective Add authentication` → description = "Add authentication"
- Example: `/df:add-objective Fix critical performance issues` → description = "Fix critical performance issues"

If no arguments provided:

```
ERROR: Objective description required
Usage: /df:add-objective <description>
Example: /df:add-objective Add authentication system
```

Exit.
</step>

<step name="init_context">
Load objective operation context:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init objective-op "0")
```

Check `roadmap_exists` from init JSON. If false:
```
ERROR: No roadmap found (.planning/ROADMAP.md)
Run /df:new-project to initialize.
```
Exit.
</step>

<step name="add_phase">
**Delegate the objective addition to df-tools:**

```bash
RESULT=$(node ~/.claude/devflow/bin/df-tools.cjs objective add "${description}")
```

The CLI handles:
- Finding the highest existing integer objective number
- Calculating next objective number (max + 1)
- Generating slug from description
- Creating the objective directory (`.planning/objectives/{NN}-{slug}/`)
- Inserting the objective entry into ROADMAP.md with Goal, Depends on, and Plans sections

Extract from result: `phase_number`, `padded`, `name`, `slug`, `directory`.
</step>

<step name="update_project_state">
Update STATE.md to reflect the new objective:

1. Read `.planning/STATE.md`
2. Under "## Accumulated Context" → "### Roadmap Evolution" add entry:
   ```
   - Objective {N} added: {description}
   ```

If "Roadmap Evolution" section doesn't exist, create it.
</step>

<step name="completion">
Present completion summary:

```
Objective {N} added to current milestone:
- Description: {description}
- Directory: .planning/objectives/{phase-num}-{slug}/
- Status: Not planned yet

Roadmap updated: .planning/ROADMAP.md

---

## ▶ Next Up

**Objective {N}: {description}**

`/df:plan-objective {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:add-objective <description>` — add another objective
- Review roadmap

---
```
</step>

</process>

<success_criteria>
- [ ] `df-tools objective add` executed successfully
- [ ] Objective directory created
- [ ] Roadmap updated with new objective entry
- [ ] STATE.md updated with roadmap evolution note
- [ ] User informed of next steps
</success_criteria>
