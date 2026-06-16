# TRD Specification

The structure, frontmatter, and field semantics for TRD.md files. Referenced by planner during plan generation; consulted by executor, verifier, and job-checker during their respective phases.

<plan_format>

## TRD.md Structure

```markdown
---
objective: XX-name
trd: NN
type: standard
wave: N                       # Execution wave (1, 2, 3...)
depends_on: []                # Plan IDs this TRD requires
files_modified: []            # Files this TRD touches
autonomous: true              # false if TRD has checkpoints
requirements: []              # REQUIRED — Requirement IDs from ROADMAP this TRD addresses. MUST NOT be empty.
decision_gate: DECISION-NNN   # Optional — omit when absent; see below
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
| `wave` | Yes | Execution wave number |
| `depends_on` | Yes | Plan IDs this TRD requires |
| `files_modified` | Yes | Files this TRD touches |
| `autonomous` | Yes | `true` if no checkpoints |
| `requirements` | Yes | **MUST** list requirement IDs from ROADMAP. Every roadmap requirement ID MUST appear in at least one TRD. |
| `user_setup` | No | Human-required setup items |
| `decision_gate` | No | Decision id (e.g., `DECISION-001`) that must be resolved before this TRD can start; absent = independent |
| `validation_gates` | No | Runnable lint/test/build commands from STACK.md |
| `must_haves` | Yes | Goal-backward verification criteria |

Wave numbers are pre-computed during planning. Execute-objective reads `wave` directly from frontmatter.

## Per-Task Caution

Tasks may declare a caution attribute: `<task type="auto" caution="pause-before-destructive">`.

| Caution value | Behavior |
|---|---|
| `pause-before-destructive` | Pause before file deletions, schema drops, force pushes, mass-rewrites. Surface what will be destroyed; require confirmation. |
| (absent) | Standard execution. No caution behavior. |

Other values are warned and treated as absent. There is no TRD-level confidence flag — caution is per-task and opt-in.

**Back-compat:** TRDs may still carry a `confidence:` frontmatter field from in-flight planning. Ignore it — do not error, do not branch on it.

## decision_gate Frontmatter Field

`decision_gate` is an optional field that links a TRD to a pending decision in the decision queue. When present, the TRD cannot start until the named decision is resolved.

**Set by:** the planner, when a TRD's implementation path depends on a choice that has been parked (by a `checkpoint:decision` or a Rule 4 architectural stop) during autonomous execution.

**Consumed by:**
- `execute-objective.md`: computes the blocked set when parking a decision (TRDs with a matching `decision_gate` plus their transitive `depends_on` closure).
- `df-tools decision-queue computeBlockedSet`: recomputes the blocked set at resume time for `/devflow:decide`.

**Value format:** A `DECISION-NNN` id matching the filename in `.planning/decisions/pending/`.

**Absent = independent.** A TRD without `decision_gate` is always eligible to execute (subject to normal `depends_on` ordering).

**Example — a TRD gated on a parked architectural decision:**

```yaml
---
objective: 05-payments
trd: "03"
type: standard
wave: 2
depends_on: ["05-02"]
files_modified: [src/payments/processor.ts]
autonomous: true
requirements: [PAY-03]
decision_gate: DECISION-001
---
```

In this example, TRD 05-03 will be skipped during autonomous execution until `DECISION-001` is resolved via `/devflow:decide DECISION-001 <choice>`, which unblocks it for the next `/devflow:execute-objective` run.

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
