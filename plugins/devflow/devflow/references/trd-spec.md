# TRD Specification

The structure, frontmatter, and field semantics for TRD.md files. Referenced by planner during plan generation; consulted by executor, verifier, and job-checker during their respective phases.

<plan_format>

## TRD.md Structure

```markdown
---
objective: XX-name
trd: NN
type: standard
confidence: high              # high | medium | low
wave: N                       # Execution wave (1, 2, 3...)
depends_on: []                # Plan IDs this TRD requires
files_modified: []            # Files this TRD touches
autonomous: true              # false if TRD has checkpoints
requirements: []              # REQUIRED — Requirement IDs from ROADMAP this TRD addresses. MUST NOT be empty.
user_setup: []                # Human-required setup (omit if empty)

must_haves:
  truths: []                  # Observable behaviors
  artifacts: []               # Files that must exist
  key_links: []               # Critical connections
---

<objective>
[What this TRD accomplishes]

Purpose: [Why this matters]
Output: [Artifacts created]
</objective>

<file_tree>
<!-- Optional: When TRD creates 2+ new files -->
src/
├── path/to/file.ts     ← CREATE
└── path/to/other.ts    ← MODIFY
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
<!-- Representative code snippets showing existing patterns relevant to this TRD -->
<!-- Naming conventions, import structure, module organization -->
</codebase_examples>

<anti_patterns>
<!-- Anti-patterns already present in codebase to avoid repeating -->
<!-- Patterns from CONCERNS.md or RESEARCH.md relevant to this TRD -->
</anti_patterns>

<error_recovery>
<!-- Error recovery patterns from RESEARCH.md (if exists) -->
<!-- Known failure modes and how to handle them -->
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Only reference prior TRD SUMMARYs if genuinely needed
@path/to/relevant/source.ts
</context>

<research_context>
<!-- Optional: Key findings from RESEARCH.md relevant to THIS TRD -->
</research_context>

<gotchas>
<!-- Optional: Plan-specific warnings from CONCERNS.md, RESEARCH.md -->
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: [Action-oriented name]</name>
  <files>path/to/file.ext</files>
  <action>[Specific implementation]</action>
  <verify>[Command or check]</verify>
  <done>[Acceptance criteria]</done>
  <recovery>[What to do if this task fails — rollback steps, alternative approaches]</recovery>
</task>

</tasks>

<validation_gates>
<!-- Optional: Runnable commands from STACK.md -->
<lint>[e.g., npm run lint]</lint>
<test>[e.g., npm test]</test>
<build>[e.g., npm run build]</build>
</validation_gates>

<verification>
[Overall objective checks]
</verification>

<success_criteria>
[Measurable completion]
</success_criteria>

<output>
After completion, create `.planning/objectives/XX-name/{objective}-{trd}-SUMMARY.md`
</output>
```

## Frontmatter Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `objective` | Yes | Objective identifier (e.g., `01-foundation`) |
| `trd` | Yes | TRD number within objective |
| `type` | Yes | `standard` or `tdd` |
| `confidence` | Yes | `high`, `medium`, or `low` — affects execution behavior |
| `wave` | Yes | Execution wave number |
| `depends_on` | Yes | Plan IDs this TRD requires |
| `files_modified` | Yes | Files this TRD touches |
| `autonomous` | Yes | `true` if no checkpoints |
| `requirements` | Yes | **MUST** list requirement IDs from ROADMAP. Every roadmap requirement ID MUST appear in at least one TRD. |
| `user_setup` | No | Human-required setup items |
| `validation_gates` | No | Runnable lint/test/build commands from STACK.md |
| `must_haves` | Yes | Goal-backward verification criteria |

Wave numbers are pre-computed during planning. Execute-objective reads `wave` directly from frontmatter.

## Confidence Scoring

| Level | Meaning | Execution Behavior |
|---|---|---|
| `high` | Research complete, patterns clear | Standard execution |
| `medium` | Some unknowns, reasonable assumptions | Extra verification at each task |
| `low` | Significant unknowns, exploratory | Quality-tier model, pause before destructive ops |

Set confidence based on: research completeness, codebase familiarity, library maturity.

## Context Section Rules

Only include prior TRD SUMMARY references if genuinely needed (uses types/exports from prior TRD, or prior TRD made decision affecting this one).

**Anti-pattern:** Reflexive chaining (02 refs 01, 03 refs 02...). Independent plans need NO prior SUMMARY references.

## User Setup Frontmatter

When external services involved:

```yaml
user_setup:
  - service: stripe
    why: "Payment processing"
    env_vars:
      - name: STRIPE_SECRET_KEY
        source: "Stripe Dashboard -> Developers -> API keys"
    dashboard_config:
      - task: "Create webhook endpoint"
        location: "Stripe Dashboard -> Developers -> Webhooks"
```

Only include what Claude literally cannot do.

</plan_format>
