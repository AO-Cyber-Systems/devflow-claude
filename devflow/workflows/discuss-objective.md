<purpose>
Extract implementation decisions that downstream agents need. Analyze the objective to identify gray areas, let the user choose what to discuss, then deep-dive each selected area until satisfied.

You are a thinking partner, not an interviewer. The user is the visionary — you are the builder. Your job is to capture decisions that will guide research and planning, not to figure out implementation yourself.
</purpose>

<downstream_awareness>
**CONTEXT.md feeds into:**

1. **df-objective-researcher** — Reads CONTEXT.md to know WHAT to research
   - "User wants card-based layout" → researcher investigates card component patterns
   - "Infinite scroll decided" → researcher looks into virtualization libraries

2. **df-planner** — Reads CONTEXT.md to know WHAT decisions are locked
   - "Pull-to-refresh on mobile" → planner includes that in task specs
   - "Claude's Discretion: loading skeleton" → planner can decide approach

**Your job:** Capture decisions clearly enough that downstream agents can act on them without asking the user again.

**Not your job:** Figure out HOW to implement. That's what research and planning do with the decisions you capture.
</downstream_awareness>

<philosophy>
**User = founder/visionary. Claude = builder.**

The user knows:
- How they imagine it working
- What it should look/feel like
- What's essential vs nice-to-have
- Specific behaviors or references they have in mind

The user doesn't know (and shouldn't be asked):
- Codebase patterns (researcher reads the code)
- Technical risks (researcher identifies these)
- Implementation approach (planner figures this out)
- Success metrics (inferred from the work)

Ask about vision and implementation choices. Capture decisions for downstream agents.
</philosophy>

<scope_guardrail>
**CRITICAL: No scope creep.**

The objective boundary comes from ROADMAP.md and is FIXED. Discussion clarifies HOW to implement what's scoped, never WHETHER to add new capabilities.

**Allowed (clarifying ambiguity):**
- "How should posts be displayed?" (layout, density, info shown)
- "What happens on empty state?" (within the feature)
- "Pull to refresh or manual?" (behavior choice)

**Not allowed (scope creep):**
- "Should we also add comments?" (new capability)
- "What about search/filtering?" (new capability)
- "Maybe include bookmarking?" (new capability)

**The heuristic:** Does this clarify how we implement what's already in the objective, or does it add a new capability that could be its own objective?

**When user suggests scope creep:**
```
"[Feature X] would be a new capability — that's its own objective.
Want me to note it for the roadmap backlog?

For now, let's focus on [objective domain]."
```

Capture the idea in a "Deferred Ideas" section. Don't lose it, don't act on it.
</scope_guardrail>

<gray_area_identification>
Gray areas are **implementation decisions the user cares about** — things that could go multiple ways and would change the result.

**How to identify gray areas:**

1. **Read the objective goal** from ROADMAP.md
2. **Understand the domain** — What kind of thing is being built?
   - Something users SEE → visual presentation, interactions, states matter
   - Something users CALL → interface contracts, responses, errors matter
   - Something users RUN → invocation, output, behavior modes matter
   - Something users READ → structure, tone, depth, flow matter
   - Something being ORGANIZED → criteria, grouping, handling exceptions matter
3. **Generate phase-specific gray areas** — Not generic categories, but concrete decisions for THIS objective

**Don't use generic category labels** (UI, UX, Behavior). Generate specific gray areas:

```
Objective: "User authentication"
→ Session handling, Error responses, Multi-device policy, Recovery flow

Objective: "Organize photo library"
→ Grouping criteria, Duplicate handling, Naming convention, Folder structure

Objective: "CLI for database backups"
→ Output format, Flag design, Progress reporting, Error recovery

Objective: "API documentation"
→ Structure/navigation, Code examples depth, Versioning approach, Interactive elements
```

**The key question:** What decisions would change the outcome that the user should weigh in on?

**Claude handles these (don't ask):**
- Technical implementation details
- Architecture patterns
- Performance optimization
- Scope (roadmap defines this)
</gray_area_identification>

<process>

<step name="initialize" priority="first">
Objective number from argument (required).

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init objective-op "${OBJECTIVE}")
```

Parse JSON for: `commit_docs`, `objective_found`, `objective_dir`, `objective_number`, `objective_name`, `objective_slug`, `padded_objective`, `has_research`, `has_context`, `has_jobs`, `has_verification`, `job_count`, `roadmap_exists`, `planning_exists`.

**If `objective_found` is false:**
```
Objective [X] not found in roadmap.

Use /df:progress to see available objectives.
```
Exit workflow.

**If `objective_found` is true:** Continue to check_existing.
</step>

<step name="check_existing">
Check if CONTEXT.md already exists using `has_context` from init.

```bash
ls ${objective_dir}/*-CONTEXT.md 2>/dev/null
```

**If exists:**
Use AskUserQuestion:
- header: "Context"
- question: "Objective [X] already has context. What do you want to do?"
- options:
  - "Update it" — Review and revise existing context
  - "View it" — Show me what's there
  - "Skip" — Use existing context as-is

If "Update": Load existing, continue to analyze_objective
If "View": Display CONTEXT.md, then offer update/skip
If "Skip": Exit workflow

**If doesn't exist:**

Check `has_jobs` and `job_count` from init. **If `has_jobs` is true:**

Use AskUserQuestion:
- header: "Plans exist"
- question: "Objective [X] already has {job_count} plan(s) created without user context. Your decisions here won't affect existing jobs unless you replan."
- options:
  - "Continue and replan after" — Capture context, then run /df:plan-objective {X} to replan
  - "View existing jobs" — Show plans before deciding
  - "Cancel" — Skip discuss-objective

If "Continue and replan after": Continue to analyze_objective.
If "View existing jobs": Display job files, then offer "Continue" / "Cancel".
If "Cancel": Exit workflow.

**If `has_jobs` is false:** Continue to analyze_objective.
</step>

<step name="analyze_objective">
Analyze the objective to identify gray areas worth discussing.

**Read the objective description from ROADMAP.md and determine:**

1. **Domain boundary** — What capability is this objective delivering? State it clearly.

2. **Gray areas by category** — For each relevant category (UI, UX, Behavior, Empty States, Content), identify 1-2 specific ambiguities that would change implementation.

3. **Skip assessment** — If no meaningful gray areas exist (pure infrastructure, clear-cut implementation), the objective may not need discussion.

**Output your analysis internally, then present to user.**

Example analysis for "Post Feed" objective:
```
Domain: Displaying posts from followed users
Gray areas:
- UI: Layout style (cards vs timeline vs grid)
- UI: Information density (full posts vs previews)
- Behavior: Loading pattern (infinite scroll vs pagination)
- Empty State: What shows when no posts exist
- Content: What metadata displays (time, author, reactions count)
```
</step>

<step name="present_gray_areas">
Present the domain boundary and gray areas to user.

**First, state the boundary:**
```
Objective [X]: [Name]
Domain: [What this objective delivers — from your analysis]

We'll clarify HOW to implement this.
(New capabilities belong in other objectives.)
```

**Then use AskUserQuestion (multiSelect: true):**
- header: "Discuss"
- question: "Which areas do you want to discuss for [objective name]?"
- options: Generate 3-4 phase-specific gray areas, each formatted as:
  - "[Specific area]" (label) — concrete, not generic
  - [1-2 questions this covers] (description)

**Do NOT include a "skip" or "you decide" option.** User ran this command to discuss — give them real choices.

**Examples by domain:**

For "Post Feed" (visual feature):
```
☐ Layout style — Cards vs list vs timeline? Information density?
☐ Loading behavior — Infinite scroll or pagination? Pull to refresh?
☐ Content ordering — Chronological, algorithmic, or user choice?
☐ Post metadata — What info per post? Timestamps, reactions, author?
```

For "Database backup CLI" (command-line tool):
```
☐ Output format — JSON, table, or plain text? Verbosity levels?
☐ Flag design — Short flags, long flags, or both? Required vs optional?
☐ Progress reporting — Silent, progress bar, or verbose logging?
☐ Error recovery — Fail fast, retry, or prompt for action?
```

For "Organize photo library" (organization task):
```
☐ Grouping criteria — By date, location, faces, or events?
☐ Duplicate handling — Keep best, keep all, or prompt each time?
☐ Naming convention — Original names, dates, or descriptive?
☐ Folder structure — Flat, nested by year, or by category?
```

Continue to discuss_areas with selected areas.
</step>

<step name="discuss_areas">
For each selected area, conduct a focused discussion loop.

**Philosophy: 4 questions, then check.**

Ask 4 questions per area before offering to continue or move on. Each answer often reveals the next question.

**For each area:**

1. **Announce the area:**
   ```
   Let's talk about [Area].
   ```

2. **Ask 4 questions using AskUserQuestion:**
   - header: "[Area]" (max 12 chars — abbreviate if needed)
   - question: Specific decision for this area
   - options: 2-3 concrete choices (AskUserQuestion adds "Other" automatically)
   - Include "You decide" as an option when reasonable — captures Claude discretion

3. **After 4 questions, check:**
   - header: "[Area]" (max 12 chars)
   - question: "More questions about [area], or move to next?"
   - options: "More questions" / "Next area"

   If "More questions" → ask 4 more, then check again
   If "Next area" → proceed to next selected area
   If "Other" (free text) → interpret intent: continuation phrases ("chat more", "keep going", "yes", "more") map to "More questions"; advancement phrases ("done", "move on", "next", "skip") map to "Next area". If ambiguous, ask: "Continue with more questions about [area], or move to the next area?"

4. **After all areas complete:**
   - header: "Done"
   - question: "That covers [list areas]. Ready to create context?"
   - options: "Create context" / "Revisit an area"

**Question design:**
- Options should be concrete, not abstract ("Cards" not "Option A")
- Each answer should inform the next question
- If user picks "Other", receive their input, reflect it back, confirm

**Scope creep handling:**
If user mentions something outside the objective domain:
```
"[Feature] sounds like a new capability — that belongs in its own objective.
I'll note it as a deferred idea.

Back to [current area]: [return to current question]"
```

Track deferred ideas internally.
</step>

<step name="write_context">
Create CONTEXT.md capturing decisions made.

**Find or create objective directory:**

Use values from init: `objective_dir`, `objective_slug`, `padded_objective`.

If `objective_dir` is null (objective exists in roadmap but no directory):
```bash
mkdir -p ".planning/objectives/${padded_objective}-${objective_slug}"
```

**File location:** `${objective_dir}/${padded_objective}-CONTEXT.md`

**Structure the content by what was discussed:**

```markdown
# Objective [X]: [Name] - Context

**Gathered:** [date]
**Status:** Ready for planning

<domain>
## Objective Boundary

[Clear statement of what this objective delivers — the scope anchor]

</domain>

<decisions>
## Implementation Decisions

### [Category 1 that was discussed]
- [Decision or preference captured]
- [Another decision if applicable]

### [Category 2 that was discussed]
- [Decision or preference captured]

### Claude's Discretion
[Areas where user said "you decide" — note that Claude has flexibility here]

</decisions>

<specifics>
## Specific Ideas

[Any particular references, examples, or "I want it like X" moments from discussion]

[If none: "No specific requirements — open to standard approaches"]

</specifics>

<deferred>
## Deferred Ideas

[Ideas that came up but belong in other objectives. Don't lose them.]

[If none: "None — discussion stayed within objective scope"]

</deferred>

---

*Objective: XX-name*
*Context gathered: [date]*
```

Write file.
</step>

<step name="confirm_creation">
Present summary and next steps:

```
Created: .planning/objectives/${PADDED_OBJECTIVE}-${SLUG}/${PADDED_OBJECTIVE}-CONTEXT.md

## Decisions Captured

### [Category]
- [Key decision]

### [Category]
- [Key decision]

[If deferred ideas exist:]
## Noted for Later
- [Deferred idea] — future objective

---

## ▶ Next Up

**Objective ${OBJECTIVE}: [Name]** — [Goal from ROADMAP.md]

`/df:plan-objective ${OBJECTIVE}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:plan-objective ${OBJECTIVE} --skip-research` — plan without research
- Review/edit CONTEXT.md before continuing

---
```
</step>

<step name="git_commit">
Commit objective context (uses `commit_docs` from init internally):

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(${padded_objective}): capture objective context" --files "${objective_dir}/${padded_objective}-CONTEXT.md"
```

Confirm: "Committed: docs(${padded_objective}): capture objective context"
</step>

<step name="update_state">
Update STATE.md with session info:

```bash
node ~/.claude/devflow/bin/df-tools.cjs state record-session \
  --stopped-at "Objective ${OBJECTIVE} context gathered" \
  --resume-file "${objective_dir}/${padded_objective}-CONTEXT.md"
```

Commit STATE.md:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(state): record objective ${OBJECTIVE} context session" --files .planning/STATE.md
```
</step>

<step name="auto_advance">
Check for auto-advance trigger:

1. Parse `--auto` flag from $ARGUMENTS
2. Read `workflow.auto_advance` from config:
   ```bash
   AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present AND `AUTO_CFG` is not true:** Persist auto-advance to config (handles direct `--auto` usage without new-project):
```bash
node ~/.claude/devflow/bin/df-tools.cjs config-set workflow.auto_advance true
```

**If `--auto` flag present OR `AUTO_CFG` is true:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► AUTO-ADVANCING TO JOB PLANNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Context captured. Spawning plan-objective...
```

Spawn plan-objective as Task:
```
Task(
  prompt="Run /df:plan-objective ${OBJECTIVE} --auto",
  subagent_type="general-purpose",
  description="Plan Objective ${OBJECTIVE}"
)
```

**Handle plan-objective return:**
- **PLANNING COMPLETE** → Plan-objective handles chaining to execute-objective (via its own auto_advance step)
- **PLANNING INCONCLUSIVE / CHECKPOINT** → Display result, stop chain:
  ```
  Auto-advance stopped: Planning needs input.

  Review the output above and continue manually:
  /df:plan-objective ${OBJECTIVE}
  ```

**If neither `--auto` nor config enabled:**
Route to `confirm_creation` step (existing behavior — show manual next steps).
</step>

</process>

<success_criteria>
- Objective validated against roadmap
- Gray areas identified through intelligent analysis (not generic questions)
- User selected which areas to discuss
- Each selected area explored until user satisfied
- Scope creep redirected to deferred ideas
- CONTEXT.md captures actual decisions, not vague vision
- Deferred ideas preserved for future objectives
- STATE.md updated with session info
- User knows next steps
</success_criteria>
