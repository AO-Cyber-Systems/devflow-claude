# Roadmap Template

Template for `.planning/ROADMAP.md`.

## Initial Roadmap (v1.0 Greenfield)

```markdown
# Roadmap: [Project Name]

## Overview

[One paragraph describing the journey from start to finish]

## Objectives

**Objective Numbering:**
- Integer objectives (1, 2, 3): Planned milestone work
- Decimal objectives (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal objectives appear between their surrounding integers in numeric order.

- [ ] **Objective 1: [Name]** - [One-line description]
- [ ] **Objective 2: [Name]** - [One-line description]
- [ ] **Objective 3: [Name]** - [One-line description]
- [ ] **Objective 4: [Name]** - [One-line description]

## Objective Details

### Objective 1: [Name]
**Goal**: [What this objective delivers]
**Depends on**: Nothing (first objective)
**Requirements**: [REQ-01, REQ-02, REQ-03]  <!-- brackets optional, parser handles both formats -->
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
  3. [Observable behavior from user perspective]
**Plans**: [Number of plans, e.g., "3 jobs" or "TBD"]

Jobs:
- [ ] 01-01: [Brief description of first plan]
- [ ] 01-02: [Brief description of second plan]
- [ ] 01-03: [Brief description of third plan]

### Objective 2: [Name]
**Goal**: [What this objective delivers]
**Depends on**: Objective 1
**Requirements**: [REQ-04, REQ-05]
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
**Plans**: [Number of plans]

Jobs:
- [ ] 02-01: [Brief description]
- [ ] 02-02: [Brief description]

### Objective 2.1: Critical Fix (INSERTED)
**Goal**: [Urgent work inserted between objectives]
**Depends on**: Objective 2
**Success Criteria** (what must be TRUE):
  1. [What the fix achieves]
**Plans**: 1 plan

Jobs:
- [ ] 02.1-01: [Description]

### Objective 3: [Name]
**Goal**: [What this objective delivers]
**Depends on**: Objective 1
**Requirements**: [REQ-06, REQ-07, REQ-08]
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
  3. [Observable behavior from user perspective]
**Plans**: [Number of plans]

Jobs:
- [ ] 03-01: [Brief description]
- [ ] 03-02: [Brief description]

> **Non-linear dependency:** Objective 3 depends on Objective 1 (not Objective 2) because it
> doesn't read/modify any Objective 2 output. This means Objectives 2 and 3 can execute
> in parallel via `/df:workstreams`. Objective 4 below is a **join point** — it waits
> for both independent branches to complete.

### Objective 4: [Name]
**Goal**: [What this objective delivers]
**Depends on**: Objective 2, Objective 3
**Requirements**: [REQ-09, REQ-10]
**Success Criteria** (what must be TRUE):
  1. [Observable behavior from user perspective]
  2. [Observable behavior from user perspective]
**Plans**: [Number of plans]

Jobs:
- [ ] 04-01: [Brief description]

## Progress

**Execution Order:**
Objectives execute in numeric order: 2 → 2.1 → 2.2 → 3 → 3.1 → 4

| Objective | Jobs Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. [Name] | 0/3 | Not started | - |
| 2. [Name] | 0/2 | Not started | - |
| 3. [Name] | 0/2 | Not started | - |
| 4. [Name] | 0/1 | Not started | - |
```

<guidelines>
**Initial planning (v1.0):**
- Objective count depends on depth setting (quick: 3-5, standard: 5-8, comprehensive: 8-12)
- Each objective delivers something coherent
- Objectives can have 1+ plans (split if >3 tasks or multiple subsystems)
- Plans use naming: {objective}-{job}-JOB.md (e.g., 01-02-JOB.md)
- No time estimates (this isn't enterprise PM)
- Progress table updated by execute workflow
- Job count can be "TBD" initially, refined during planning

**Success criteria:**
- 2-5 observable behaviors per objective (from user's perspective)
- Cross-checked against requirements during roadmap creation
- Flow downstream to `must_haves` in plan-objective
- Verified by verify-objective after execution
- Format: "User can [action]" or "[Thing] works/exists"

**After milestones ship:**
- Collapse completed milestones in `<details>` tags
- Add new milestone sections for upcoming work
- Keep continuous objective numbering (never restart at 01)
</guidelines>

<status_values>
- `Not started` - Haven't begun
- `In progress` - Currently working
- `Complete` - Done (add completion date)
- `Deferred` - Pushed to later (with reason)
</status_values>

## Milestone-Grouped Roadmap (After v1.0 Ships)

After completing first milestone, reorganize with milestone groupings:

```markdown
# Roadmap: [Project Name]

## Milestones

- ✅ **v1.0 MVP** - Objectives 1-4 (shipped YYYY-MM-DD)
- 🚧 **v1.1 [Name]** - Objectives 5-6 (in progress)
- 📋 **v2.0 [Name]** - Objectives 7-10 (planned)

## Objectives

<details>
<summary>✅ v1.0 MVP (Objectives 1-4) - SHIPPED YYYY-MM-DD</summary>

### Objective 1: [Name]
**Goal**: [What this objective delivers]
**Plans**: 3 jobs

Jobs:
- [x] 01-01: [Brief description]
- [x] 01-02: [Brief description]
- [x] 01-03: [Brief description]

[... remaining v1.0 objectives ...]

</details>

### 🚧 v1.1 [Name] (In Progress)

**Milestone Goal:** [What v1.1 delivers]

#### Objective 5: [Name]
**Goal**: [What this objective delivers]
**Depends on**: Objective 4
**Plans**: 2 jobs

Jobs:
- [ ] 05-01: [Brief description]
- [ ] 05-02: [Brief description]

[... remaining v1.1 objectives ...]

### 📋 v2.0 [Name] (Planned)

**Milestone Goal:** [What v2.0 delivers]

[... v2.0 objectives ...]

## Progress

| Objective | Milestone | Jobs Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | YYYY-MM-DD |
| 2. Features | v1.0 | 2/2 | Complete | YYYY-MM-DD |
| 5. Security | v1.1 | 0/2 | Not started | - |
```

**Notes:**
- Milestone emoji: ✅ shipped, 🚧 in progress, 📋 planned
- Completed milestones collapsed in `<details>` for readability
- Current/future milestones expanded
- Continuous objective numbering (01-99)
- Progress table includes milestone column
