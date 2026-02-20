<purpose>
Create `.continue-here.md` handoff file to preserve complete work state across sessions. Enables seamless resumption with full context restoration.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="detect">
Find current objective directory from most recently modified files:

```bash
# Find most recent objective directory with work
ls -lt .planning/objectives/*/JOB.md 2>/dev/null | head -1 | grep -oP 'objectives/\K[^/]+'
```

If no active objective detected, ask user which objective they're pausing work on.
</step>

<step name="gather">
**Collect complete state for handoff:**

1. **Current position**: Which objective, which plan, which task
2. **Work completed**: What got done this session
3. **Work remaining**: What's left in current job/objective
4. **Decisions made**: Key decisions and rationale
5. **Blockers/issues**: Anything stuck
6. **Mental context**: The approach, next steps, "vibe"
7. **Files modified**: What's changed but not committed

Ask user for clarifications if needed via conversational questions.
</step>

<step name="write">
**Write handoff to `.planning/objectives/XX-name/.continue-here.md`:**

```markdown
---
objective: XX-name
task: 3
total_tasks: 7
status: in_progress
last_updated: [timestamp from current-timestamp]
---

<current_state>
[Where exactly are we? Immediate context]
</current_state>

<completed_work>

- Task 1: [name] - Done
- Task 2: [name] - Done
- Task 3: [name] - In progress, [what's done]
</completed_work>

<remaining_work>

- Task 3: [what's left]
- Task 4: Not started
- Task 5: Not started
</remaining_work>

<decisions_made>

- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]
</decisions_made>

<blockers>
- [Blocker 1]: [status/workaround]
</blockers>

<context>
[Mental state, what were you thinking, the job]
</context>

<next_action>
Start with: [specific first action when resuming]
</next_action>
```

Be specific enough for a fresh Claude to understand immediately.

Use `current-timestamp` for last_updated field. You can use init todos (which provides timestamps) or call directly:
```bash
timestamp=$(node ~/.claude/devflow/bin/df-tools.cjs current-timestamp full --raw)
```
</step>

<step name="commit">
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "wip: [phase-name] paused at task [X]/[Y]" --files .planning/objectives/*/.continue-here.md
```
</step>

<step name="confirm">
```
✓ Handoff created: .planning/objectives/[XX-name]/.continue-here.md

Current state:

- Objective: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Committed as WIP

To resume: /df:resume-work

```
</step>

</process>

<success_criteria>
- [ ] .continue-here.md created in correct objective directory
- [ ] All sections filled with specific content
- [ ] Committed as WIP
- [ ] User knows location and how to resume
</success_criteria>
