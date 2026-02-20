<required_reading>

**Read these files NOW:**

1. `.planning/STATE.md`
2. `.planning/PROJECT.md`
3. `.planning/ROADMAP.md`
4. Current objective's job files (`*-JOB.md`)
5. Current objective's summary files (`*-SUMMARY.md`)

</required_reading>

<purpose>

Mark current objective complete and advance to next. This is the natural point where progress tracking and PROJECT.md evolution happen.

"Planning next objective" = "current objective is done"

</purpose>

<process>

<step name="load_project_state" priority="first">

Before transition, read project state:

```bash
cat .planning/STATE.md 2>/dev/null
cat .planning/PROJECT.md 2>/dev/null
```

Parse current position to verify we're transitioning the right objective.
Note accumulated context that may need updating after transition.

</step>

<step name="verify_completion">

Check current objective has all plan summaries:

```bash
ls .planning/objectives/XX-current/*-JOB.md 2>/dev/null | sort
ls .planning/objectives/XX-current/*-SUMMARY.md 2>/dev/null | sort
```

**Verification logic:**

- Count PLAN files
- Count SUMMARY files
- If counts match: all jobs complete
- If counts don't match: incomplete

<config-check>

```bash
cat .planning/config.json 2>/dev/null
```

</config-check>

**If all jobs complete:**

<if mode="yolo">

```
⚡ Auto-approved: Transition Objective [X] → Objective [X+1]
Objective [X] complete — all [Y] plans finished.

Proceeding to mark done and advance...
```

Proceed directly to cleanup_handoff step.

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

Ask: "Objective [X] complete — all [Y] plans finished. Ready to mark done and move to Objective [X+1]?"

Wait for confirmation before proceeding.

</if>

**If plans incomplete:**

**SAFETY RAIL: always_confirm_destructive applies here.**
Skipping incomplete jobs is destructive — ALWAYS prompt regardless of mode.

Present:

```
Objective [X] has incomplete jobs:
- {objective}-01-SUMMARY.md ✓ Complete
- {objective}-02-SUMMARY.md ✗ Missing
- {objective}-03-SUMMARY.md ✗ Missing

⚠️ Safety rail: Skipping plans requires confirmation (destructive action)

Options:
1. Continue current objective (execute remaining jobs)
2. Mark complete anyway (skip remaining jobs)
3. Review what's left
```

Wait for user decision.

</step>

<step name="cleanup_handoff">

Check for lingering handoffs:

```bash
ls .planning/objectives/XX-current/.continue-here*.md 2>/dev/null
```

If found, delete them — objective is complete, handoffs are stale.

</step>

<step name="update_roadmap_and_state">

**Delegate ROADMAP.md and STATE.md updates to df-tools:**

```bash
TRANSITION=$(node ~/.claude/devflow/bin/df-tools.cjs objective complete "${current_phase}")
```

The CLI handles:
- Marking the objective checkbox as `[x]` complete with today's date
- Updating job count to final (e.g., "3/3 jobs complete")
- Updating the Progress table (Status → Complete, adding date)
- Advancing STATE.md to next objective (Current Objective, Status → Ready to plan, Current Job → Not started)
- Detecting if this is the last objective in the milestone

Extract from result: `completed_phase`, `plans_executed`, `next_phase`, `next_phase_name`, `is_last_phase`.

</step>

<step name="archive_prompts">

If prompts were generated for the objective, they stay in place.
The `completed/` subfolder pattern from create-meta-prompts handles archival.

</step>

<step name="evolve_project">

Evolve PROJECT.md to reflect learnings from completed objective.

**Read objective summaries:**

```bash
cat .planning/objectives/XX-current/*-SUMMARY.md
```

**Assess requirement changes:**

1. **Requirements validated?**
   - Any Active requirements shipped in this objective?
   - Move to Validated with objective reference: `- ✓ [Requirement] — Objective X`

2. **Requirements invalidated?**
   - Any Active requirements discovered to be unnecessary or wrong?
   - Move to Out of Scope with reason: `- [Requirement] — [why invalidated]`

3. **Requirements emerged?**
   - Any new requirements discovered during building?
   - Add to Active: `- [ ] [New requirement]`

4. **Decisions to log?**
   - Extract decisions from SUMMARY.md files
   - Add to Key Decisions table with outcome if known

5. **"What This Is" still accurate?**
   - If the product has meaningfully changed, update the description
   - Keep it current and accurate

**Update PROJECT.md:**

Make the edits inline. Update "Last updated" footer:

```markdown
---
*Last updated: [date] after Objective [X]*
```

**Example evolution:**

Before:

```markdown
### Active

- [ ] JWT authentication
- [ ] Real-time sync < 500ms
- [ ] Offline mode

### Out of Scope

- OAuth2 — complexity not needed for v1
```

After (Objective 2 shipped JWT auth, discovered rate limiting needed):

```markdown
### Validated

- ✓ JWT authentication — Objective 2

### Active

- [ ] Real-time sync < 500ms
- [ ] Offline mode
- [ ] Rate limiting on sync endpoint

### Out of Scope

- OAuth2 — complexity not needed for v1
```

**Step complete when:**

- [ ] Objective summaries reviewed for learnings
- [ ] Validated requirements moved from Active
- [ ] Invalidated requirements moved to Out of Scope with reason
- [ ] Emerged requirements added to Active
- [ ] New decisions logged with rationale
- [ ] "What This Is" updated if product changed
- [ ] "Last updated" footer reflects this transition

</step>

<step name="update_current_position_after_transition">

**Note:** Basic position updates (Current Objective, Status, Current Job, Last Activity) were already handled by `df-tools objective complete` in the update_roadmap_and_state step.

Verify the updates are correct by reading STATE.md. If the progress bar needs updating, use:

```bash
PROGRESS=$(node ~/.claude/devflow/bin/df-tools.cjs progress bar --raw)
```

Update the progress bar line in STATE.md with the result.

**Step complete when:**

- [ ] Objective number incremented to next objective (done by objective complete)
- [ ] Plan status reset to "Not started" (done by objective complete)
- [ ] Status shows "Ready to plan" (done by objective complete)
- [ ] Progress bar reflects total completed jobs

</step>

<step name="update_project_reference">

Update Project Reference section in STATE.md.

```markdown
## Project Reference

See: .planning/PROJECT.md (updated [today])

**Core value:** [Current core value from PROJECT.md]
**Current focus:** [Next objective name]
```

Update the date and current focus to reflect the transition.

</step>

<step name="review_accumulated_context">

Review and update Accumulated Context section in STATE.md.

**Decisions:**

- Note recent decisions from this objective (3-5 max)
- Full log lives in PROJECT.md Key Decisions table

**Blockers/Concerns:**

- Review blockers from completed objective
- If addressed in this objective: Remove from list
- If still relevant for future: Keep with "Objective X" prefix
- Add any new concerns from completed objective's summaries

**Example:**

Before:

```markdown
### Blockers/Concerns

- ⚠️ [Objective 1] Database schema not indexed for common queries
- ⚠️ [Objective 2] WebSocket reconnection behavior on flaky networks unknown
```

After (if database indexing was addressed in Objective 2):

```markdown
### Blockers/Concerns

- ⚠️ [Objective 2] WebSocket reconnection behavior on flaky networks unknown
```

**Step complete when:**

- [ ] Recent decisions noted (full log in PROJECT.md)
- [ ] Resolved blockers removed from list
- [ ] Unresolved blockers kept with objective prefix
- [ ] New concerns from completed objective added

</step>

<step name="update_session_continuity_after_transition">

Update Session Continuity section in STATE.md to reflect transition completion.

**Format:**

```markdown
Last session: [today]
Stopped at: Objective [X] complete, ready to plan Objective [X+1]
Resume file: None
```

**Step complete when:**

- [ ] Last session timestamp updated to current date and time
- [ ] Stopped at describes objective completion and next objective
- [ ] Resume file confirmed as None (transitions don't use resume files)

</step>

<step name="offer_next_phase">

**MANDATORY: Check for workstream context first, then verify milestone status.**

**Check for workstream context:**

```bash
cat .planning/workstream-marker.json 2>/dev/null
```

If the file exists, parse it. Check if the completing objective is the LAST objective in this workstream's `objectives` array. If so → **Route C: Workstream Complete**. Otherwise → normal routing below (advance within this workstream).

**Use the transition result from `df-tools objective complete`:**

The `is_last_phase` field from the objective complete result tells you directly:
- `is_last_phase: false` → More objectives remain → Go to **Route A**
- `is_last_phase: true` → Milestone complete → Go to **Route B**

The `next_phase` and `next_phase_name` fields give you the next objective details.

If you need additional context, use:
```bash
ROADMAP=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap analyze)
```

This returns all objectives with goals, disk status, and completion info.

---

**Route C: Workstream complete (only when workstream-marker.json exists)**

The completing objective is the last objective in this workstream's scope.

```
## ✓ Workstream Complete

**{workstream name}** — all objectives done ({objectives list}).

This workstream worktree has completed its scope.

---

## ▶ Next Steps

Return to the **main worktree** and check status:

```bash
cd {main_worktree_path}
```

Then run:
- `/df:workstreams status` — see all workstream progress
- `/df:workstreams merge` — merge when all workstreams are done
```

Do NOT offer to plan the next sequential objective — this worktree only owns its assigned objectives. The join objective will be planned from the main worktree after merge.

---

**Route A: More objectives remain in milestone**

Read ROADMAP.md to get the next objective's name and goal.

**Check if next objective has CONTEXT.md:**

```bash
ls .planning/objectives/*[X+1]*/*-CONTEXT.md 2>/dev/null
```

**If next objective exists:**

<if mode="yolo">

**If CONTEXT.md exists:**

```
Objective [X] marked complete.

Next: Objective [X+1] — [Name]

⚡ Auto-continuing: Plan Objective [X+1] in detail
```

Exit skill and invoke SlashCommand("/df:plan-objective [X+1] --auto")

**If CONTEXT.md does NOT exist:**

```
Objective [X] marked complete.

Next: Objective [X+1] — [Name]

⚡ Auto-continuing: Discuss Objective [X+1] first
```

Exit skill and invoke SlashCommand("/df:discuss-objective [X+1] --auto")

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

**If CONTEXT.md does NOT exist:**

```
## ✓ Objective [X] Complete

---

## ▶ Next Up

**Objective [X+1]: [Name]** — [Goal from ROADMAP.md]

`/df:discuss-objective [X+1]` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:plan-objective [X+1]` — skip discussion, plan directly
- `/df:research-objective [X+1]` — investigate unknowns

---
```

**If CONTEXT.md exists:**

```
## ✓ Objective [X] Complete

---

## ▶ Next Up

**Objective [X+1]: [Name]** — [Goal from ROADMAP.md]
<sub>✓ Context gathered, ready to plan</sub>

`/df:plan-objective [X+1]`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:discuss-objective [X+1]` — revisit context
- `/df:research-objective [X+1]` — investigate unknowns

---
```

</if>

---

**Route B: Milestone complete (all objectives done)**

**Clear auto-advance** — milestone boundary is the natural stopping point:
```bash
node ~/.claude/devflow/bin/df-tools.cjs config-set workflow.auto_advance false
```

<if mode="yolo">

```
Objective {X} marked complete.

🎉 Milestone {version} is 100% complete — all {N} objectives finished!

⚡ Auto-continuing: Complete milestone and archive
```

Exit skill and invoke SlashCommand("/df:complete-milestone {version}")

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

```
## ✓ Objective {X}: {Objective Name} Complete

🎉 Milestone {version} is 100% complete — all {N} objectives finished!

---

## ▶ Next Up

**Complete Milestone {version}** — archive and prepare for next

`/df:complete-milestone {version}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Review accomplishments before archiving

---
```

</if>

</step>

</process>

<implicit_tracking>
Progress tracking is IMPLICIT: planning objective N implies objectives 1-(N-1) complete. No separate progress step—forward motion IS progress.
</implicit_tracking>

<partial_completion>

If user wants to move on but objective isn't fully complete:

```
Objective [X] has incomplete jobs:
- {objective}-02-JOB.md (not executed)
- {objective}-03-JOB.md (not executed)

Options:
1. Mark complete anyway (plans weren't needed)
2. Defer work to later objective
3. Stay and finish current objective
```

Respect user judgment — they know if work matters.

**If marking complete with incomplete jobs:**

- Update ROADMAP: "2/3 jobs complete" (not "3/3")
- Note in transition message which plans were skipped

</partial_completion>

<success_criteria>

Transition is complete when:

- [ ] Current objective plan summaries verified (all exist or user chose to skip)
- [ ] Any stale handoffs deleted
- [ ] ROADMAP.md updated with completion status and job count
- [ ] PROJECT.md evolved (requirements, decisions, description if needed)
- [ ] STATE.md updated (position, project reference, context, session)
- [ ] Progress table updated
- [ ] User knows next steps

</success_criteria>
