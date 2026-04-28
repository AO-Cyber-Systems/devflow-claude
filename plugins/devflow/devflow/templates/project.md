# PROJECT.md Template

Template for `.planning/PROJECT.md` — the living project context document.

<template>

```markdown
---
kind: api                  # REQUIRED — what this project IS. One of:
                           #   api       — backend API/service consumed by clients
                           #   app       — end-user application (web, mobile, desktop)
                           #   library   — code consumed by other code via API
                           #   ui-lib    — UI components consumed by other apps
                           #   cli       — command-line tool consumed by humans in a terminal
                           #   plugin    — extends a host system via plugin contract
default_work: feature      # OPTIONAL — default `work` value inherited by objectives
                           # in this project that don't declare their own. Same enum as
                           # OBJECTIVE.md `work`. Set this when most of the project's
                           # objectives are the same work type (e.g., a Rails→Go port
                           # with 10+ sequential `port` objectives). Omit if work types
                           # vary objective-to-objective.
---

# [Project Name]

## What This Is

[Current accurate description — 2-3 sentences. What does this product do and who is it for?
Use the user's language and framing. Update whenever reality drifts from this description.]

## Core Value

[The ONE thing that matters most. If everything else fails, this must work.
One sentence that drives prioritization when tradeoffs arise.]

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- [Exclusion 1] — [why]
- [Exclusion 2] — [why]

## Context

[Background information that informs implementation:
- Technical environment or ecosystem
- Relevant prior work or experience
- User research or feedback themes
- Known issues to address]

## Constraints

- **[Type]**: [What] — [Why]
- **[Type]**: [What] — [Why]

Common types: Tech stack, Timeline, Budget, Dependencies, Compatibility, Performance, Security

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| [Choice] | [Why] | [✓ Good / ⚠️ Revisit / — Pending] |

---
*Last updated: [date] after [trigger]*
```

</template>

<guidelines>

**`kind` (frontmatter, required):**
- What the project IS and how it is consumed
- Drives the project-side defaults the planner applies via the `(kind, work)` table at `~/.claude/devflow/references/defaults-table.md`
- Set once at project creation; treat as fixed for the project's lifetime
- If the project genuinely changes shape (e.g., a library grows a CLI wrapper), prefer splitting into separate projects over editing `kind`

**`default_work` (frontmatter, optional):**
- Default `work` value for objectives in this project that omit it
- Set when 5+ sequential objectives share the same work type (port, refactor, etc.)
- The planner is **louder** when an objective inherits this default, surfacing the inheritance source and inviting override — so silent inheritance can't mask a wrong default
- Omit when work types vary objective-to-objective; the planner falls back to `work: feature` if nothing else is set

**What This Is:**
- Current accurate description of the product
- 2-3 sentences capturing what it does and who it's for
- Use the user's words and framing
- Update when the product evolves beyond this description

**Core Value:**
- The single most important thing
- Everything else can fail; this cannot
- Drives prioritization when tradeoffs arise
- Rarely changes; if it does, it's a significant pivot

**Requirements — Validated:**
- Requirements that shipped and proved valuable
- Format: `- ✓ [Requirement] — [version/objective]`
- These are locked — changing them requires explicit discussion

**Requirements — Active:**
- Current scope being built toward
- These are hypotheses until shipped and validated
- Move to Validated when shipped, Out of Scope if invalidated

**Requirements — Out of Scope:**
- Explicit boundaries on what we're not building
- Always include reasoning (prevents re-adding later)
- Includes: considered and rejected, deferred to future, explicitly excluded

**Context:**
- Background that informs implementation decisions
- Technical environment, prior work, user feedback
- Known issues or technical debt to address
- Update as new context emerges

**Constraints:**
- Hard limits on implementation choices
- Tech stack, timeline, budget, compatibility, dependencies
- Include the "why" — constraints without rationale get questioned

**Key Decisions:**
- Significant choices that affect future work
- Add decisions as they're made throughout the project
- Track outcome when known:
  - ✓ Good — decision proved correct
  - ⚠️ Revisit — decision may need reconsideration
  - — Pending — too early to evaluate

**Last Updated:**
- Always note when and why the document was updated
- Format: `after Objective 2` or `after v1.0 milestone`
- Triggers review of whether content is still accurate

</guidelines>

<evolution>

PROJECT.md evolves throughout the project lifecycle.

**After each objective transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with objective reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state (users, feedback, metrics)

</evolution>

<brownfield>

For existing codebases:

1. **Map codebase first** via `/devflow:map-codebase`

2. **Infer Validated requirements** from existing code:
   - What does the codebase actually do?
   - What patterns are established?
   - What's clearly working and relied upon?

3. **Gather Active requirements** from user:
   - Present inferred current state
   - Ask what they want to build next

4. **Initialize:**
   - Validated = inferred from existing code
   - Active = user's goals for this work
   - Out of Scope = boundaries user specifies
   - Context = includes current codebase state

</brownfield>

<state_reference>

STATE.md references PROJECT.md:

```markdown
## Project Reference

See: .planning/PROJECT.md (updated [date])

**Core value:** [One-liner from Core Value section]
**Current focus:** [Current objective name]
```

This ensures Claude reads current PROJECT.md context.

</state_reference>
