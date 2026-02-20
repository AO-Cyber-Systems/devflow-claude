<purpose>
Surface Claude's assumptions about an objective before planning, enabling users to correct misconceptions early.

Key difference from discuss-objective: This is ANALYSIS of what Claude thinks, not INTAKE of what user knows. No file output - purely conversational to prompt discussion.
</purpose>

<process>

<step name="validate_objective" priority="first">
Objective number: $ARGUMENTS (required)

**If argument missing:**

```
Error: Objective number required.

Usage: /df:list-objective-assumptions [phase-number]
Example: /df:list-objective-assumptions 3
```

Exit workflow.

**If argument provided:**
Validate objective exists in roadmap:

```bash
cat .planning/ROADMAP.md | grep -i "Objective ${OBJECTIVE}"
```

**If objective not found:**

```
Error: Objective ${OBJECTIVE} not found in roadmap.

Available objectives:
[list objectives from roadmap]
```

Exit workflow.

**If objective found:**
Parse objective details from roadmap:

- Objective number
- Objective name
- Objective description/goal
- Any scope details mentioned

Continue to analyze_objective.
</step>

<step name="analyze_objective">
Based on roadmap description and project context, identify assumptions across five areas:

**1. Technical Approach:**
What libraries, frameworks, patterns, or tools would Claude use?
- "I'd use X library because..."
- "I'd follow Y pattern because..."
- "I'd structure this as Z because..."

**2. Implementation Order:**
What would Claude build first, second, third?
- "I'd start with X because it's foundational"
- "Then Y because it depends on X"
- "Finally Z because..."

**3. Scope Boundaries:**
What's included vs excluded in Claude's interpretation?
- "This objective includes: A, B, C"
- "This objective does NOT include: D, E, F"
- "Boundary ambiguities: G could go either way"

**4. Risk Areas:**
Where does Claude expect complexity or challenges?
- "The tricky part is X because..."
- "Potential issues: Y, Z"
- "I'd watch out for..."

**5. Dependencies:**
What does Claude assume exists or needs to be in place?
- "This assumes X from previous objectives"
- "External dependencies: Y, Z"
- "This will be consumed by..."

Be honest about uncertainty. Mark assumptions with confidence levels:
- "Fairly confident: ..." (clear from roadmap)
- "Assuming: ..." (reasonable inference)
- "Unclear: ..." (could go multiple ways)
</step>

<step name="present_assumptions">
Present assumptions in a clear, scannable format:

```
## My Assumptions for Objective ${OBJECTIVE}: ${OBJECTIVE_NAME}

### Technical Approach
[List assumptions about how to implement]

### Implementation Order
[List assumptions about sequencing]

### Scope Boundaries
**In scope:** [what's included]
**Out of scope:** [what's excluded]
**Ambiguous:** [what could go either way]

### Risk Areas
[List anticipated challenges]

### Dependencies
**From prior objectives:** [what's needed]
**External:** [third-party needs]
**Feeds into:** [what future objectives need from this]

---

**What do you think?**

Are these assumptions accurate? Let me know:
- What I got right
- What I got wrong
- What I'm missing
```

Wait for user response.
</step>

<step name="gather_feedback">
**If user provides corrections:**

Acknowledge the corrections:

```
Key corrections:
- [correction 1]
- [correction 2]

This changes my understanding significantly. [Summarize new understanding]
```

**If user confirms assumptions:**

```
Assumptions validated.
```

Continue to offer_next.
</step>

<step name="offer_next">
Present next steps:

```
What's next?
1. Discuss context (/df:discuss-objective ${OBJECTIVE}) - Let me ask you questions to build comprehensive context
2. Plan this objective (/df:plan-objective ${OBJECTIVE}) - Create detailed execution plans
3. Re-examine assumptions - I'll analyze again with your corrections
4. Done for now
```

Wait for user selection.

If "Discuss context": Note that CONTEXT.md will incorporate any corrections discussed here
If "Plan this objective": Proceed knowing assumptions are understood
If "Re-examine": Return to analyze_objective with updated understanding
</step>

</process>

<success_criteria>
- Objective number validated against roadmap
- Assumptions surfaced across five areas: technical approach, implementation order, scope, risks, dependencies
- Confidence levels marked where appropriate
- "What do you think?" prompt presented
- User feedback acknowledged
- Clear next steps offered
</success_criteria>
