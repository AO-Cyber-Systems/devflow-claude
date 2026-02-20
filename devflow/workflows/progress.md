<purpose>
Check project progress, summarize recent work and what's ahead, then intelligently route to the next action — either executing an existing job or creating the next one. Provides situational awareness before continuing work.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
**Load progress context (with file contents to avoid redundant reads):**

```bash
INIT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs init progress --include state,roadmap,project,config)
# Large payloads are written to a tmpfile — output starts with @file:/path
if [[ "$INIT_RAW" == @file:* ]]; then
  INIT_FILE="${INIT_RAW#@file:}"
  INIT=$(cat "$INIT_FILE")
  rm -f "$INIT_FILE"
else
  INIT="$INIT_RAW"
fi
```

Extract from init JSON: `project_exists`, `roadmap_exists`, `state_exists`, `objectives`, `current_objective`, `next_objective`, `milestone_version`, `completed_count`, `objective_count`, `paused_at`.

**File contents (from --include):** `state_content`, `roadmap_content`, `project_content`, `config_content`. These are null if files don't exist.

If `project_exists` is false (no `.planning/` directory):

```
No planning structure found.

Run /df:new-project to start a new project.
```

Exit.

If missing STATE.md: suggest `/df:new-project`.

**If ROADMAP.md missing but PROJECT.md exists:**

This means a milestone was completed and archived. Go to **Route F** (between milestones).

If missing both ROADMAP.md and PROJECT.md: suggest `/df:new-project`.
</step>

<step name="load">
**Use project context from INIT:**

All file contents are already loaded via `--include` in init_context step:
- `state_content` — living memory (position, decisions, issues)
- `roadmap_content` — objective structure and objectives
- `project_content` — current state (What This Is, Core Value, Requirements)
- `config_content` — settings (model_profile, workflow toggles)

No additional file reads needed.
</step>

<step name="analyze_roadmap">
**Get comprehensive roadmap analysis (replaces manual parsing):**

```bash
ROADMAP=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap analyze)
```

This returns structured JSON with:
- All objectives with disk status (complete/partial/planned/empty/no_directory)
- Goal and dependencies per objective
- Plan and summary counts per objective
- Aggregated stats: total plans, summaries, progress percent
- Current and next objective identification

Use this instead of manually reading/parsing ROADMAP.md.
</step>

<step name="recent">
**Gather recent work context:**

- Find the 2-3 most recent SUMMARY.md files
- Use `summary-extract` for efficient parsing:
  ```bash
  node ~/.claude/devflow/bin/df-tools.cjs summary-extract <path> --fields one_liner
  ```
- This shows "what we've been working on"
  </step>

<step name="position">
**Parse current position from init context and roadmap analysis:**

- Use `current_objective` and `next_objective` from roadmap analyze
- Use objective-level `has_context` and `has_research` flags from analyze
- Note `paused_at` if work was paused (from init context)
- Count pending todos: use `init todos` or `list-todos`
- Check for active debug sessions: `ls .planning/debug/*.md 2>/dev/null | grep -v resolved | wc -l`
  </step>

<step name="report">
**Generate progress bar from df-tools, then present rich status report:**

```bash
# Get formatted progress bar
PROGRESS_BAR=$(node ~/.claude/devflow/bin/df-tools.cjs progress bar --raw)
```

Present:

```
# [Project Name]

**Progress:** {PROGRESS_BAR}
**Profile:** [quality/balanced/budget]

## Recent Work
- [Objective X, Plan Y]: [what was accomplished - 1 line from summary-extract]
- [Objective X, Plan Z]: [what was accomplished - 1 line from summary-extract]

## Current Position
Objective [N] of [total]: [objective-name]
Job [M] of [objective-total]: [status]
CONTEXT: [✓ if has_context | - if not]

## Key Decisions Made
- [decision 1 from STATE.md]
- [decision 2]

## Blockers/Concerns
- [any blockers or concerns from STATE.md]

## Pending Todos
- [count] pending — /df:check-todos to review

## Active Debug Sessions
- [count] active — /df:debug to continue
(Only show this section if count > 0)

## What's Next
[Next objective/plan objective from roadmap analyze]
```

</step>

<step name="route">
**Determine next action based on verified counts.**

**Step 1: Count plans, summaries, and issues in current objective**

List files in the current objective directory:

```bash
ls -1 .planning/objectives/[current-objective-dir]/*-JOB.md 2>/dev/null | wc -l
ls -1 .planning/objectives/[current-objective-dir]/*-SUMMARY.md 2>/dev/null | wc -l
ls -1 .planning/objectives/[current-objective-dir]/*-UAT.md 2>/dev/null | wc -l
```

State: "This objective has {X} plans, {Y} summaries."

**Step 1.5: Check for unaddressed UAT gaps**

Check for UAT.md files with status "diagnosed" (has gaps needing fixes).

```bash
# Check for diagnosed UAT with gaps
grep -l "status: diagnosed" .planning/objectives/[current-objective-dir]/*-UAT.md 2>/dev/null
```

Track:
- `uat_with_gaps`: UAT.md files with status "diagnosed" (gaps need fixing)

**Step 2: Route based on counts**

| Condition | Meaning | Action |
|-----------|---------|--------|
| uat_with_gaps > 0 | UAT gaps need fix plans | Go to **Route E** |
| summaries < jobs | Unexecuted jobs exist | Go to **Route A** |
| summaries = jobs AND jobs > 0 | Objective complete | Go to Step 3 |
| jobs = 0 | Objective not yet planned | Go to **Route B** |

---

**Route A: Unexecuted plan exists**

Find the first JOB.md without matching SUMMARY.md.
Read its `<objective>` section.

```
---

## ▶ Next Up

**{objective}-{job}: [Plan Name]** — [objective summary from JOB.md]

`/df:execute-objective {objective}`

<sub>`/clear` first → fresh context window</sub>

---
```

---

**Route B: Objective needs planning**

Check if `{phase_num}-CONTEXT.md` exists in objective directory.

**If CONTEXT.md exists:**

```
---

## ▶ Next Up

**Objective {N}: {Name}** — {Goal from ROADMAP.md}
<sub>✓ Context gathered, ready to plan</sub>

`/df:plan-objective {phase-number}`

<sub>`/clear` first → fresh context window</sub>

---
```

**If CONTEXT.md does NOT exist:**

```
---

## ▶ Next Up

**Objective {N}: {Name}** — {Goal from ROADMAP.md}

`/df:discuss-objective {objective}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:plan-objective {objective}` — skip discussion, plan directly
- `/df:list-objective-assumptions {objective}` — see Claude's assumptions

---
```

---

**Route E: UAT gaps need fix plans**

UAT.md exists with gaps (diagnosed issues). User needs to plan fixes.

```
---

## ⚠ UAT Gaps Found

**{phase_num}-UAT.md** has {N} gaps requiring fixes.

`/df:plan-objective {objective} --gaps`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:execute-objective {objective}` — execute objective plans
- `/df:verify-work {objective}` — run more UAT testing

---
```

---

**Step 3: Check milestone status (only when objective complete)**

Read ROADMAP.md and identify:
1. Current objective number
2. All objective numbers in the current milestone section

Count total objectives and identify the highest objective number.

State: "Current objective is {X}. Milestone has {N} objectives (highest: {Y})."

**Route based on milestone status:**

| Condition | Meaning | Action |
|-----------|---------|--------|
| current objective < highest objective | More objectives remain | Go to **Route C** |
| current objective = highest objective | Milestone complete | Go to **Route D** |

---

**Route C: Objective complete, more objectives remain**

Read ROADMAP.md to get the next objective's name and goal.

```
---

## ✓ Objective {Z} Complete

## ▶ Next Up

**Objective {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/df:discuss-objective {Z+1}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:plan-objective {Z+1}` — skip discussion, plan directly
- `/df:verify-work {Z}` — user acceptance test before continuing

---
```

---

**Route D: Milestone complete**

```
---

## 🎉 Milestone Complete

All {N} objectives finished!

## ▶ Next Up

**Complete Milestone** — archive and prepare for next

`/df:complete-milestone`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:verify-work` — user acceptance test before completing milestone

---
```

---

**Route F: Between milestones (ROADMAP.md missing, PROJECT.md exists)**

A milestone was completed and archived. Ready to start the next milestone cycle.

Read MILESTONES.md to find the last completed milestone version.

```
---

## ✓ Milestone v{X.Y} Complete

Ready to plan the next milestone.

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → roadmap

`/df:new-milestone`

<sub>`/clear` first → fresh context window</sub>

---
```

</step>

<step name="edge_cases">
**Handle edge cases:**

- Objective complete but next objective not planned → offer `/df:plan-objective [next]`
- All work complete → offer milestone completion
- Blockers present → highlight before offering to continue
- Handoff file exists → mention it, offer `/df:resume-work`
  </step>

</process>

<success_criteria>

- [ ] Rich context provided (recent work, decisions, issues)
- [ ] Current position clear with visual progress
- [ ] What's next clearly explained
- [ ] Smart routing: /df:execute-objective if plans exist, /df:plan-objective if not
- [ ] User confirms before any action
- [ ] Seamless handoff to appropriate gsd command
      </success_criteria>
