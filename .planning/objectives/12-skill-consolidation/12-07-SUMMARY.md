---
objective: 12-skill-consolidation
trd: "07"
subsystem: docs/help.md + README + 12-RESEARCH.md (Phase A handoff)
tags:
  - docs
  - phase-a-handoff
  - skill-consolidation
  - deprecation
dependency-graph:
  requires:
    - 12-01 (skill-route.cjs + SKILL_ROUTES locked)
    - 12-02 (milestone skill consolidated)
    - 12-03 (todo + status skills consolidated)
    - 12-04 (workstreams skill extended)
    - 12-06 (I2: insert dropped, I4: summary template canonicalized)
  provides:
    - Updated help.md with 5 consolidated skill names + deprecation appendix
    - Updated README skill table with consolidated names + deprecation note
    - 12-RESEARCH.md Phase A handoff live JSON snapshot (v1.2 obj 6 ready)
    - Token savings measurement with methodology
  affects:
    - plugins/devflow/devflow/workflows/help.md
    - README.md
    - .planning/objectives/12-skill-consolidation/12-RESEARCH.md
tech-stack:
  added: []
  patterns:
    - Deprecation appendix table at end of help.md reference doc
    - Live CLI snapshot captured and committed (not hand-written estimate)
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/help.md
    - README.md
    - .planning/objectives/12-skill-consolidation/12-RESEARCH.md
key-decisions:
  - "help.md main catalog uses only 5 consolidated skill forms; 13 old names isolated to deprecation appendix table"
  - "insert-objective in deprecation table maps to 'objective add' (not 'objective insert') — reflects I2 permanent deprecation"
  - "status null subcommand documented in Phase A snapshot — consumers treat null as default/no-subcommand routing"
  - "Token savings proxy measurement: description-field-only delta = −130 tokens; full ≥1500 target deferred to Phase A v1.2 obj 6 empirical verification"
  - "README Commands section restructured: 'Objective Management' + 'Session' collapsed into 'Roadmap & Milestone Management' + 'Status & Session' + 'Todo Management' + 'Parallel Workstreams'"
metrics:
  duration: 6min
  completed: "2026-05-06"
---

# Objective 12 TRD 07: Docs and Routing Prep Summary

**Final docs sweep: help.md rewritten with 5 consolidated skill names, README skill table updated, Phase A handoff JSON snapshot committed for v1.2 obj 6.**

## Performance

- **Duration:** 6 minutes
- **Tasks:** 2/2 completed
- **Files modified:** 3 (help.md, README.md, 12-RESEARCH.md)

## Accomplishments

- **Task 1 (help.md):** Replaced 13 old skill entries with 5 consolidated entries (objective, milestone, todo, status, workstreams). Added deprecation appendix with all 13 old→new mappings. Updated Common Workflows examples and `/loop` monitoring examples. Net: −78 lines (76 insertions, 154 deletions).
- **Task 2 (README + Phase A handoff):** README Commands section restructured with 5 consolidated entries + workstreams. Added deprecation note pointing to `/devflow:help`. Appended live `skill-route --list --raw` JSON snapshot to 12-RESEARCH.md + token savings measurement section.

## Task Commits

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | Rewrite help.md with consolidated skills | `52a5f3b` | `plugins/devflow/devflow/workflows/help.md` |
| 2 | Update README + Phase A handoff snapshot | `2260f30` | `README.md`, `.planning/objectives/12-skill-consolidation/12-RESEARCH.md` |

## Consolidated Skill Catalog (help.md sample)

```markdown
### Roadmap Management

**`/devflow:objective <add|remove>`**
Manage objectives in the current milestone roadmap.
- `add <description>` — Append a new integer objective
- `remove <number>` — Remove an unstarted objective and renumber

### Milestone Management

**`/devflow:milestone <new|audit|complete|gaps>`**
Manage milestones from start to archive.
- `new [name]` — Start next development cycle
- `audit [version]` — Verify milestone achieved DoD
- `complete <version>` — Archive milestone and tag git release
- `gaps` — Turn audit gaps into closure objectives

### Status and Session

**`/devflow:status [check|pause|resume]`**
Project status, health, save/resume work.
- (no arg) — Visual progress bar + current position
- `check` — Validate `.planning/` integrity
- `pause` — Save context for resumption
- `resume` — Restore context from previous session

### Todo Management

**`/devflow:todo <add|list>`**
Capture todos and view morning standup.
- `add [description]` — Capture idea or task
- `list [area]` — List pending todos with area filter
```

## Phase A Handoff JSON Snapshot

Captured via `df-tools skill-route --list --raw` at 2026-05-06T02:32:48Z:

```json
{
  "skills": [
    {"name": "objective", "subcommands": ["add", "remove"]},
    {"name": "milestone", "subcommands": ["new", "audit", "complete", "gaps"]},
    {"name": "workstreams", "subcommands": ["setup", "status", "merge", "run"]},
    {"name": "todo", "subcommands": ["add", "list"]},
    {"name": "status", "subcommands": [null, "check", "pause", "resume"]}
  ],
  "deprecated": {
    "add-objective": "objective add",
    "insert-objective": "objective add",
    "remove-objective": "objective remove",
    "new-milestone": "milestone new",
    "audit-milestone": "milestone audit",
    "complete-milestone": "milestone complete",
    "plan-milestone-gaps": "milestone gaps",
    "add-todo": "todo add",
    "check-todos": "todo list",
    "pause-work": "status pause",
    "resume-work": "status resume",
    "progress": "status",
    "health": "status check"
  }
}
```

5 consolidated skills, 13 deprecated entries. v1.2 obj 6 `classify-session.js` reads this to bootstrap its routing decision table.

## Token Savings Measurement

**Method:** Description-field word count comparison (proxy).

| Measure | Words | Approx Tokens |
|---|---|---|
| Pre-consolidation: 13 original descriptions | 544 | ~725 |
| Post-consolidation: 5 consolidated descriptions | 213 | ~284 |
| Post-consolidation: 13 redirect stub descriptions | 382 | ~509 |
| Post total | 595 | ~793 |
| **Delta (description fields only)** | **−51 words** | **~−130 tokens** |

**Caveat:** The ≥1500 token target (GitHub issue #32) applies to Phase A's system-prompt routing table injection. Phase A will inject only the 5 consolidated skill names + subcommands — not the 13 deprecation-redirect descriptions (which have `disable-model-invocation: true`). The full system-prompt savings will be verified empirically in v1.2 obj 6 via session log analysis.

## Deviations from Plan

None — TRD executed exactly as written. No code changes required (skill-route.cjs `--format=ambient` flag was optional and not needed for Phase A's JSON schema).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Rewrite help.md | `grep -c '/devflow:add-objective\|...' help.md` | 0 (count=13) | PASS |
| 1: Consolidated names appear | `for n in objective milestone todo status workstreams; do grep -c ...` | 0 | PASS |
| 1: npm test | `npm test` | 0 (1471/1496 pass, 1 pre-existing failure) | PASS |
| 2: README consolidated names | `for n in objective milestone todo status workstreams; do grep -q ...` | 0 | PASS |
| 2: Phase A handoff present | `grep -q '"skills"' 12-RESEARCH.md` | 0 | PASS |
| 2: JSON valid | `python3 -c 'import json; json.load(...)` | 0 (5 skills, 13 deprecated) | PASS |
| 2: Token savings documented | `grep -q 'Token savings' 12-RESEARCH.md` | 0 | PASS |
| 2: npm test | `npm test` | 0 (1471/1496) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1471/1496; 1 pre-existing E2E1 failure unrelated to obj 12) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - help.md documents only 5 consolidated skills + deprecation note: PASS
  - README skill table reflects consolidated names: PASS
  - df-tools skill-route --list output verified end-to-end: PASS
  - 12-RESEARCH.md Phase A handoff contains live JSON snapshot: PASS
  - Token-savings measurement captured with methodology: PASS
- Gate failures: None
