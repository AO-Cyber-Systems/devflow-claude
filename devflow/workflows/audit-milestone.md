<purpose>
Verify milestone achieved its definition of done by aggregating objective verifications, checking cross-objective integration, and assessing requirements coverage. Reads existing VERIFICATION.md files (objectives already verified during execute-objective), aggregates tech debt and deferred gaps, then spawns integration checker for cross-objective wiring.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

## 0. Initialize Milestone Context

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init milestone-op)
```

Extract from init JSON: `milestone_version`, `milestone_name`, `objective_count`, `completed_objectives`, `commit_docs`.

Resolve integration checker model:
```bash
CHECKER_MODEL=$(node ~/.claude/devflow/bin/df-tools.cjs resolve-model df-integration-checker --raw)
```

## 1. Determine Milestone Scope

```bash
# Get objectives in milestone (sorted numerically, handles decimals)
node ~/.claude/devflow/bin/df-tools.cjs objectives list
```

- Parse version from arguments or detect current from ROADMAP.md
- Identify all objective directories in scope
- Extract milestone definition of done from ROADMAP.md
- Extract requirements mapped to this milestone from REQUIREMENTS.md

## 2. Read All Objective Verifications

For each objective directory, read the VERIFICATION.md:

```bash
# For each objective, use find-objective to resolve the directory (handles archived objectives)
PHASE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs find-objective 01 --raw)
# Extract directory from JSON, then read VERIFICATION.md from that directory
# Repeat for each objective number from ROADMAP.md
```

From each VERIFICATION.md, extract:
- **Status:** passed | gaps_found
- **Critical gaps:** (if any — these are blockers)
- **Non-critical gaps:** tech debt, deferred items, warnings
- **Anti-patterns found:** TODOs, stubs, placeholders
- **Requirements coverage:** which requirements satisfied/blocked

If an objective is missing VERIFICATION.md, flag it as "unverified objective" — this is a blocker.

## 3. Spawn Integration Checker

With objective context collected:

Extract `MILESTONE_REQ_IDS` from REQUIREMENTS.md traceability table — all REQ-IDs assigned to objectives in this milestone.

```
Task(
  prompt="Check cross-objective integration and E2E flows.

Objectives: {phase_dirs}
Objective exports: {from SUMMARYs}
API routes: {routes created}

Milestone Requirements:
{MILESTONE_REQ_IDS — list each REQ-ID with description and assigned objective}

MUST map each integration finding to affected requirement IDs where applicable.

Verify cross-objective wiring and E2E user flows.",
  subagent_type="df-integration-checker",
  model="{integration_checker_model}"
)
```

## 4. Collect Results

Combine:
- Objective-level gaps and tech debt (from step 2)
- Integration checker's report (wiring gaps, broken flows)

## 5. Check Requirements Coverage (3-Source Cross-Reference)

MUST cross-reference three independent sources for each requirement:

### 5a. Parse REQUIREMENTS.md Traceability Table

Extract all REQ-IDs mapped to milestone objectives from the traceability table:
- Requirement ID, description, assigned objective, current status, checked-off state (`[x]` vs `[ ]`)

### 5b. Parse Objective VERIFICATION.md Requirements Tables

For each objective's VERIFICATION.md, extract the expanded requirements table:
- Requirement | Source Plan | Description | Status | Evidence
- Map each entry back to its REQ-ID

### 5c. Extract SUMMARY.md Frontmatter Cross-Check

For each objective's SUMMARY.md, extract `requirements-completed` from YAML frontmatter:
```bash
for summary in .planning/objectives/*-*/*-SUMMARY.md; do
  node ~/.claude/devflow/bin/df-tools.cjs summary-extract "$summary" --fields requirements_completed | jq -r '.requirements_completed'
done
```

### 5d. Status Determination Matrix

For each REQ-ID, determine status using all three sources:

| VERIFICATION.md Status | SUMMARY Frontmatter | REQUIREMENTS.md | → Final Status |
|------------------------|---------------------|-----------------|----------------|
| passed                 | listed              | `[x]`           | **satisfied**  |
| passed                 | listed              | `[ ]`           | **satisfied** (update checkbox) |
| passed                 | missing             | any             | **partial** (verify manually) |
| gaps_found             | any                 | any             | **unsatisfied** |
| missing                | listed              | any             | **partial** (verification gap) |
| missing                | missing             | any             | **unsatisfied** |

### 5e. FAIL Gate and Orphan Detection

**REQUIRED:** Any `unsatisfied` requirement MUST force `gaps_found` status on the milestone audit.

**Orphan detection:** Requirements present in REQUIREMENTS.md traceability table but absent from ALL objective VERIFICATION.md files MUST be flagged as orphaned. Orphaned requirements are treated as `unsatisfied` — they were assigned but never verified by any objective.

## 6. Aggregate into v{version}-MILESTONE-AUDIT.md

Create `.planning/v{version}-v{version}-MILESTONE-AUDIT.md` with:

```yaml
---
milestone: {version}
audited: {timestamp}
status: passed | gaps_found | tech_debt
scores:
  requirements: N/M
  objectives: N/M
  integration: N/M
  flows: N/M
gaps:  # Critical blockers
  requirements:
    - id: "{REQ-ID}"
      status: "unsatisfied | partial | orphaned"
      objective: "{assigned objective}"
      claimed_by_plans: ["{job files that reference this requirement}"]
      completed_by_plans: ["{job files whose SUMMARY marks it complete}"]
      verification_status: "passed | gaps_found | missing | orphaned"
      evidence: "{specific evidence or lack thereof}"
  integration: [...]
  flows: [...]
tech_debt:  # Non-critical, deferred
  - objective: 01-auth
    items:
      - "TODO: add rate limiting"
      - "Warning: no password strength validation"
  - objective: 03-dashboard
    items:
      - "Deferred: mobile responsive layout"
---
```

Plus full markdown report with tables for requirements, objectives, integration, tech debt.

**Status values:**
- `passed` — all requirements met, no critical gaps, minimal tech debt
- `gaps_found` — critical blockers exist
- `tech_debt` — no blockers but accumulated deferred items need review

## 7. Present Results

Route by status (see `<offer_next>`).

</process>

<offer_next>
Output this markdown directly (not as a code block). Route based on status:

---

**If passed:**

## ✓ Milestone {version} — Audit Passed

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

All requirements covered. Cross-objective integration verified. E2E flows complete.

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Complete milestone** — archive and tag

/df:complete-milestone {version}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

---

**If gaps_found:**

## ⚠ Milestone {version} — Gaps Found

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

### Unsatisfied Requirements

{For each unsatisfied requirement:}
- **{REQ-ID}: {description}** (Objective {X})
  - {reason}

### Cross-Objective Issues

{For each integration gap:}
- **{from} → {to}:** {issue}

### Broken Flows

{For each flow gap:}
- **{flow name}:** breaks at {step}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Plan gap closure** — create objectives to complete milestone

/df:plan-milestone-gaps

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/v{version}-MILESTONE-AUDIT.md — see full report
- /df:complete-milestone {version} — proceed anyway (accept tech debt)

───────────────────────────────────────────────────────────────

---

**If tech_debt (no blockers but accumulated debt):**

## ⚡ Milestone {version} — Tech Debt Review

**Score:** {N}/{M} requirements satisfied
**Report:** .planning/v{version}-MILESTONE-AUDIT.md

All requirements met. No critical blockers. Accumulated tech debt needs review.

### Tech Debt by Objective

{For each objective with debt:}
**Objective {X}: {name}**
- {item 1}
- {item 2}

### Total: {N} items across {M} objectives

───────────────────────────────────────────────────────────────

## ▶ Options

**A. Complete milestone** — accept debt, track in backlog

/df:complete-milestone {version}

**B. Plan cleanup objective** — address debt before completing

/df:plan-milestone-gaps

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] Milestone scope identified
- [ ] All objective VERIFICATION.md files read
- [ ] SUMMARY.md `requirements-completed` frontmatter extracted for each objective
- [ ] REQUIREMENTS.md traceability table parsed for all milestone REQ-IDs
- [ ] 3-source cross-reference completed (VERIFICATION + SUMMARY + traceability)
- [ ] Orphaned requirements detected (in traceability but absent from all VERIFICATIONs)
- [ ] Tech debt and deferred gaps aggregated
- [ ] Integration checker spawned with milestone requirement IDs
- [ ] v{version}-MILESTONE-AUDIT.md created with structured requirement gap objects
- [ ] FAIL gate enforced — any unsatisfied requirement forces gaps_found status
- [ ] Results presented with actionable next steps
</success_criteria>
