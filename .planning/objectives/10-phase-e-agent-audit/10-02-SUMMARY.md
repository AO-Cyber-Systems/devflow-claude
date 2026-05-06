---
objective: 10-phase-e-agent-audit
trd: "02"
subsystem: docs
tags: [convention, agents, subagent_type, documentation]
dependency_graph:
  requires: []
  provides: [docs/agent-spawning-convention.md]
  affects: [plugins/devflow/agents/, plugins/devflow/devflow/workflows/]
tech_stack:
  added: []
  patterns: [contributor-docs pattern in docs/]
key_files:
  created:
    - docs/agent-spawning-convention.md
  modified: []
decisions:
  - Matched TRD heading case exactly (lowercase after first word) to satisfy grep -F verification
  - Included 4 worked examples (2 switch + 2 document) to exceed the ≥2 minimum
  - Used verbatim agent descriptions from frontmatter, lightly expanded for When-to-use column
metrics:
  duration: "~2 minutes"
  completed_date: "2026-05-06"
---

# Objective 10 TRD 02: Convention Doc Summary

**One-liner:** Contributor doc at `docs/agent-spawning-convention.md` codifying the rule, decision tree, 12-agent index, and 4 worked examples for `subagent_type` selection.

## What Was Built

Created `docs/agent-spawning-convention.md` (152 lines) at the repo root `docs/` directory. The document covers:

- **The Rule**: Dedicated agent when work matches a df-* role; general-purpose only for workflow invocations and genuine ad-hoc tasks.
- **Decision tree**: Three branches — workflow invocation (keep generic), dedicated agent match (use it), ad-hoc (generic, consider issue).
- **Agent index**: Table of all 12 dedicated agents with description (from frontmatter) and when-to-use guidance.
- **Worked examples**: 4 examples — 2 switch cases (debugger, project-researcher) and 2 document cases (execute-objective auto-advance, plan-objective auto-advance).
- **How resolution works**: Explains `subagent_type` → `~/.claude/agents/{name}.md` via sync-runtime hook.
- **Adding a new agent**: Step-by-step process.
- **Background**: Phase E audit summary with pre-fix telemetry numbers and link to `10-RESEARCH.md`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Write docs/agent-spawning-convention.md | `test -f docs/agent-spawning-convention.md` | 0 | PASS |
| 1: Section checks (5 sections) | `grep -F "## The Rule" docs/agent-spawning-convention.md` etc. | 0 each | PASS |
| 1: Agent index (12 agents) | `grep -F "\`{agent}\`"` for all 12 | 0 each | PASS |
| 1: Audit reference | `grep -F "10-RESEARCH.md" docs/agent-spawning-convention.md` | 0 | PASS |
| 1: Line count | `wc -l docs/agent-spawning-convention.md` | 152 | PASS (≥80) |
| 1: npm test | `npm test` | 0 | PASS (1356/1380) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 1 (heading case correction — TRD verify uses `-F` fixed-string matching; adjusted three headings from Title Case to lowercase-after-first-word to satisfy exact grep)
- Must-haves verified: 6/6
- Gate failures: None

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Heading case mismatch vs verify script**
- **Found during:** Task 1 verification
- **Issue:** TRD verify script uses `grep -F "## Decision tree"` / `"## Agent index"` / `"## Worked examples"` (lowercase after first word). Initial write used Title Case headings (`## Decision Tree`, `## Agent Index`, `## Worked Examples`).
- **Fix:** Corrected three headings to exactly match the verify script strings.
- **Files modified:** `docs/agent-spawning-convention.md`
- **Commit:** 4598b92 (same commit — fixed before committing)

## Commits

| Hash | Message |
|---|---|
| `4598b92` | `docs(10): add agent-spawning convention` |

## Self-Check: PASSED

- [x] `docs/agent-spawning-convention.md` exists at repo root
- [x] All 5 required sections present
- [x] All 12 agents indexed
- [x] Audit reference (10-RESEARCH.md) present
- [x] 152 lines (≥80)
- [x] npm test passes (1356/1380)
- [x] Commit `4598b92` present in git log
