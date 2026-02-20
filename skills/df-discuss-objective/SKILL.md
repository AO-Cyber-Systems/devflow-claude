---
name: df:discuss-objective
description: |
  Gather objective context through adaptive questioning before planning.
  Use when the user wants to discuss, design, or clarify an objective before planning it.
  Triggers on: "let's discuss objective", "talk about the approach", "design objective", "clarify objective", "what should objective X look like?"
argument-hint: "<objective> [--auto]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Task
---

<objective>
Extract implementation decisions that downstream agents need — researcher and planner will use CONTEXT.md to know what to investigate and what choices are locked.

**How it works:**
1. Analyze the objective to identify gray areas (UI, UX, behavior, etc.)
2. Present gray areas — user selects which to discuss
3. Deep-dive each selected area until satisfied
4. Create CONTEXT.md with decisions that guide research and planning

**Output:** `{phase_num}-CONTEXT.md` — decisions clear enough that downstream agents can act without asking the user again
</objective>

<execution_context>
@~/.claude/devflow/workflows/discuss-objective.md
@~/.claude/devflow/templates/context.md
</execution_context>

<context>
Objective number: $ARGUMENTS (required)

**Load project state:**
@.planning/STATE.md

**Load roadmap:**
@.planning/ROADMAP.md
</context>

<process>
1. Validate objective number (error if missing or not in roadmap)
2. Check if CONTEXT.md exists (offer update/view/skip if yes)
3. **Analyze objective** — Identify domain and generate phase-specific gray areas
4. **Present gray areas** — Multi-select: which to discuss? (NO skip option)
5. **Deep-dive each area** — 4 questions per area, then offer more/next
6. **Write CONTEXT.md** — Sections match areas discussed
7. Offer next steps (research or plan)

**CRITICAL: Scope guardrail**
- Objective boundary from ROADMAP.md is FIXED
- Discussion clarifies HOW to implement, not WHETHER to add more
- If user suggests new capabilities: "That's its own objective. I'll note it for later."
- Capture deferred ideas — don't lose them, don't act on them

**Domain-aware gray areas:**
Gray areas depend on what's being built. Analyze the objective goal:
- Something users SEE → layout, density, interactions, states
- Something users CALL → responses, errors, auth, versioning
- Something users RUN → output format, flags, modes, error handling
- Something users READ → structure, tone, depth, flow
- Something being ORGANIZED → criteria, grouping, naming, exceptions

Generate 3-4 **phase-specific** gray areas, not generic categories.

**Probing depth:**
- Ask 4 questions per area before checking
- "More questions about [area], or move to next?"
- If more → ask 4 more, check again
- After all areas → "Ready to create context?"

**Do NOT ask about (Claude handles these):**
- Technical implementation
- Architecture choices
- Performance concerns
- Scope expansion
</process>

<success_criteria>
- Gray areas identified through intelligent analysis
- User chose which areas to discuss
- Each selected area explored until satisfied
- Scope creep redirected to deferred ideas
- CONTEXT.md captures decisions, not vague vision
- User knows next steps
</success_criteria>
