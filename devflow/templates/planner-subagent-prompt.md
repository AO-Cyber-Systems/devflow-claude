# Planner Subagent Prompt Template

Template for spawning df-planner agent. The agent contains all planning expertise - this template provides planning context only.

---

## Template

```markdown
<planning_context>

**Objective:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:**
@.planning/STATE.md

**Roadmap:**
@.planning/ROADMAP.md

**Requirements (if exists):**
@.planning/REQUIREMENTS.md

**Objective Context (if exists):**
@.planning/objectives/{phase_dir}/{phase_num}-CONTEXT.md

**Research (if exists):**
@.planning/objectives/{phase_dir}/{phase_num}-RESEARCH.md

**Gap Closure (if --gaps mode):**
@.planning/objectives/{phase_dir}/{phase_num}-VERIFICATION.md
@.planning/objectives/{phase_dir}/{phase_num}-UAT.md

</planning_context>

<downstream_consumer>
Output consumed by /df:execute-objective
Plans must be executable prompts with:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
Before returning PLANNING COMPLETE:
- [ ] JOB.md files created in objective directory
- [ ] Each job has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from objective goal
</quality_gate>
```

---

## Placeholders

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{phase_number}` | From roadmap/arguments | `5` or `2.1` |
| `{phase_dir}` | Objective directory name | `05-user-profiles` |
| `{objective}` | Objective prefix | `05` |
| `{standard \| gap_closure}` | Mode flag | `standard` |

---

## Usage

**From /df:plan-objective (standard mode):**
```python
Task(
  prompt=filled_template,
  subagent_type="df-planner",
  description="Plan Objective {objective}"
)
```

**From /df:plan-objective --gaps (gap closure mode):**
```python
Task(
  prompt=filled_template,  # with mode: gap_closure
  subagent_type="df-planner",
  description="Plan gaps for Objective {objective}"
)
```

---

## Continuation

For checkpoints, spawn fresh agent with:

```markdown
<objective>
Continue planning for Objective {phase_number}: {phase_name}
</objective>

<prior_state>
Objective directory: @.planning/objectives/{phase_dir}/
Existing jobs: @.planning/objectives/{phase_dir}/*-JOB.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
Continue: {standard | gap_closure}
</mode>
```

---

**Note:** Planning methodology, task breakdown, dependency analysis, wave assignment, TDD detection, and goal-backward derivation are baked into the df-planner agent. This template only passes context.
