# State Template

Template for `.planning/STATE.md` — the project's living memory.

---

## File Template

```markdown
# Project State

## Project Reference

See: .planning/PROJECT.md (updated [date])

**Core value:** [One-liner from PROJECT.md Core Value section]
**Current focus:** [Current objective name]

## Current Position

Objective: [X] of [Y] ([Objective name])
Job: [A] of [B] in current objective
Status: [Ready to plan / Planning / Ready to execute / In progress / Objective complete]
Last activity: [YYYY-MM-DD] — [What happened]

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: [N]
- Average duration: [X] min
- Total execution time: [X.X] hours

**By Objective:**

| Objective | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 jobs: [durations]
- Trend: [Improving / Stable / Degrading]

*Updated after each job completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Objective X]: [Decision summary]
- [Objective Y]: [Decision summary]

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

None yet.

## Session Continuity

Last session: [YYYY-MM-DD HH:MM]
Stopped at: [Description of last completed action]
Resume file: [Path to .continue-here*.md if exists, otherwise "None"]
```

<purpose>

STATE.md is the project's short-term memory spanning all objectives and sessions.

**Problem it solves:** Information is captured in summaries, issues, and decisions but not systematically consumed. Sessions start without context.

**Solution:** A single, small file that's:
- Read first in every workflow
- Updated after every significant action
- Contains digest of accumulated context
- Enables instant session restoration

</purpose>

<lifecycle>

**Creation:** After ROADMAP.md is created (during init)
- Reference PROJECT.md (read it for current context)
- Initialize empty accumulated context sections
- Set position to "Objective 1 ready to plan"

**Reading:** First step of every workflow
- progress: Present status to user
- plan: Inform planning decisions
- execute: Know current position
- transition: Know what's complete

**Writing:** After every significant action
- execute: After SUMMARY.md created
  - Update position (objective, job, status)
  - Note new decisions (detail in PROJECT.md)
  - Add blockers/concerns
- transition: After objective marked complete
  - Update progress bar
  - Clear resolved blockers
  - Refresh Project Reference date

</lifecycle>

<sections>

### Project Reference
Points to PROJECT.md for full context. Includes:
- Core value (the ONE thing that matters)
- Current focus (which objective)
- Last update date (triggers re-read if stale)

Claude reads PROJECT.md directly for requirements, constraints, and decisions.

### Current Position
Where we are right now:
- Objective X of Y — which objective
- Plan A of B — which plan within objective
- Status — current state
- Last activity — what happened most recently
- Progress bar — visual indicator of overall completion

Progress calculation: (completed jobs) / (total plans across all objectives) × 100%

### Performance Metrics
Track velocity to understand execution patterns:
- Total plans completed
- Average duration per job
- Per-objective breakdown
- Recent trend (improving/stable/degrading)

Updated after each job completion.

### Accumulated Context

**Decisions:** Reference to PROJECT.md Key Decisions table, plus recent decisions summary for quick access. Full decision log lives in PROJECT.md.

**Pending Todos:** Ideas captured via /df:add-todo
- Count of pending todos
- Reference to .planning/todos/pending/
- Brief list if few, count if many (e.g., "5 pending todos — see /df:check-todos")

**Blockers/Concerns:** From "Next Objective Readiness" sections
- Issues that affect future work
- Prefix with originating objective
- Cleared when addressed

### Session Continuity
Enables instant resumption:
- When was last session
- What was last completed
- Is there a .continue-here file to resume from

</sections>

<size_constraint>

Keep STATE.md under 100 lines.

It's a DIGEST, not an archive. If accumulated context grows too large:
- Keep only 3-5 recent decisions in summary (full log in PROJECT.md)
- Keep only active blockers, remove resolved ones

The goal is "read once, know where we are" — if it's too long, that fails.

</size_constraint>
