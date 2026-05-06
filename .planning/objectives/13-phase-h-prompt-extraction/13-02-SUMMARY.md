---
objective: 13-phase-h-prompt-extraction
job: 02
subsystem: agents
tags: [prompt-extraction, agents, references, token-reduction]

requires:
  - objective: 13-phase-h-prompt-extraction
    trd: 01
    provides: "6 shared reference/template files at plugins/devflow/devflow/references/"
provides:
  - "planner.md with TRD spec + goal-backward externalized"
  - "job-checker.md with goal-backward externalized (verifier-vs-job-checker distinction preserved)"
  - "debugger.md with 4 debugging methodology sections merged into single <debugging_methods> wrapper"
  - "objective-researcher.md with research tooling (3 sections) externalized"
  - "verifier.md with stub_detection_patterns externalized"
affects: [13-03, 13-04, execute-trd, plan-objective]

tech-stack:
  added: []
  patterns:
    - "@~-reference pattern in XML wrapper tags for externalized methodology sections"
    - "Option B collapse: multiple related sections merged into single named wrapper with @-ref"
    - "Partial extraction: keep agent-specific context inline, externalize generic methodology"

key-files:
  created: []
  modified:
    - plugins/devflow/agents/planner.md
    - plugins/devflow/agents/job-checker.md
    - plugins/devflow/agents/debugger.md
    - plugins/devflow/agents/objective-researcher.md
    - plugins/devflow/agents/verifier.md

key-decisions:
  - "debugger.md Option B: 4 original wrapper tags collapsed into single <debugging_methods> wrapper with HTML comment listing originals — cleaner than Option A (keep all 4 wrappers)"
  - "verifier.md VERIFICATION.md inline template: kept inline (path 3 — substantively different from on-disk verification-report.md; inline has re_verification/gaps/human_verification frontmatter fields absent from on-disk template)"
  - "job-checker.md partial extraction: goal-backward methodology replaced with @-ref; verifier-vs-job-checker distinction kept inline (job-checker-specific, not in shared reference)"

patterns-established:
  - "Option B collapse pattern: multiple related methodology sections → single named wrapper with @-ref + comment listing originals"
  - "Partial extraction: inline text split into job-specific (stays) vs generic methodology (externalized)"

requirements-completed:
  - PHASE-H2-PLANNER
  - PHASE-H2-JOB-CHECKER
  - PHASE-H2-DEBUGGER
  - PHASE-H2-OBJECTIVE-RESEARCHER
  - PHASE-H2-VERIFIER-STUB
  - PHASE-H3-VERIFIER-TEMPLATE

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 25min
completed: 2026-05-06
---

# Objective 13 TRD 02: Edit Agents Group A Summary

**5 agent files edited to replace inline methodology blocks with @-references; 1010 lines cut from per-spawn token cost (planner 256 + job-checker 8 + debugger 617 + objective-researcher 84 + verifier 45).**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-05-06
- **Tasks:** 3/3
- **Files modified:** 5

## Pre/Post Line Counts

| Agent | Before | After | Cut |
|---|---|---|---|
| planner.md | 1420 | 1164 | 256 |
| job-checker.md | 689 | 681 | 8 |
| debugger.md | 1198 | 581 | 617 |
| objective-researcher.md | 488 | 404 | 84 |
| verifier.md | 697 | 652 | 45 |
| **Total** | **4492** | **3482** | **1010** |

## Accomplishments

- Externalized TRD spec + goal-backward from planner.md (256 lines cut)
- Externalized 4 debugging methodology sections from debugger.md using Option B collapse (617 lines cut)
- Externalized 3 research tooling sections from objective-researcher.md (84 lines cut)
- Externalized stub patterns from verifier.md; kept VERIFICATION.md inline template (45 lines cut)
- Preserved all wrapper tags, frontmatter, and agent-specific context throughout

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: planner + job-checker | `grep -c "@~/.claude/devflow/references/trd-spec.md" plugins/devflow/agents/planner.md` | 0 (returns 1) | PASS |
| 1: planner + job-checker | `grep -c "@~/.claude/devflow/references/goal-backward.md" plugins/devflow/agents/job-checker.md` | 0 (returns 1) | PASS |
| 1: planner + job-checker | `wc -l plugins/devflow/agents/planner.md` (1164 ≤ 1180) | 0 | PASS |
| 1: planner + job-checker | `grep "verifier.*Verifies code DID" plugins/devflow/agents/job-checker.md` | 0 (found) | PASS |
| 2: debugger | `grep -c "@~/.claude/devflow/references/debugging-methods.md" plugins/devflow/agents/debugger.md` | 0 (returns 1) | PASS |
| 2: debugger | `wc -l plugins/devflow/agents/debugger.md` (581 ≤ 585) | 0 | PASS |
| 2: debugger | `grep "<debug_file_protocol>" plugins/devflow/agents/debugger.md` | 0 (found) | PASS |
| 3: objective-researcher + verifier | `grep -c "@~/.claude/devflow/references/research-tooling.md" plugins/devflow/agents/objective-researcher.md` | 0 (returns 1) | PASS |
| 3: objective-researcher + verifier | `grep -c "@~/.claude/devflow/references/stub-patterns.md" plugins/devflow/agents/verifier.md` | 0 (returns 1) | PASS |
| 3: objective-researcher + verifier | `wc -l plugins/devflow/agents/objective-researcher.md` (404 ≤ 405) | 0 | PASS |

## Task Commits

1. **Task 1: planner + job-checker** — `77e758a` (feat)
2. **Task 2: debugger** — `d1c6150` (feat)
3. **Task 3: objective-researcher + verifier** — `81ecd13` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1471 pass, 1 pre-existing fail — E2E1 self-test, unchanged from TRD 01 baseline) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 8/8 (all truths and artifacts confirmed)
- **Gate failures:** None (pre-existing E2E1 failure is out-of-scope, confirmed pre-dates this TRD)

## Files Modified

- `plugins/devflow/agents/planner.md` — `<plan_format>` body → @trd-spec.md; `<goal_backward>` body → @goal-backward.md
- `plugins/devflow/agents/job-checker.md` — goal-backward steps replaced with @-ref; verifier/job-checker distinction kept inline
- `plugins/devflow/agents/debugger.md` — 4 sections collapsed to single `<debugging_methods>` wrapper with @-ref
- `plugins/devflow/agents/objective-researcher.md` — 3 sections collapsed to single `<research_tooling>` wrapper with @-ref
- `plugins/devflow/agents/verifier.md` — `<stub_detection_patterns>` body → @stub-patterns.md; VERIFICATION.md inline kept (see Decisions)

## Decisions Made

### debugger.md Option B vs Option A

Chose Option B: replace all 4 wrapper tags (`<hypothesis_testing>`, `<investigation_techniques>`, `<verification_patterns>`, `<research_vs_reasoning>`) with a single `<debugging_methods>` wrapper containing the @-reference plus an HTML comment listing the 4 original tag names. Option A (keep all 4 wrappers, @-ref in first only) would have left 3 vestigial empty wrappers cluttering the file. Option B is the preferred approach per TRD gotchas.

### verifier.md VERIFICATION.md inline template — Path 3 decision

The inline template (lines 471-557 in original verifier.md) and the on-disk `plugins/devflow/devflow/templates/verification-report.md` have substantively different structures:

- **Inline template**: Compact operator-facing format with `re_verification`, `gaps`, and `human_verification` frontmatter blocks used by verifier.md's step-by-step logic. Missing from on-disk template.
- **On-disk template**: Reference template with expanded tables, guidelines, example, severity legend, and recommended fix plan sections. Serves as a standalone reference document.

These serve different purposes. Replacing inline with the on-disk @-ref would remove runtime-relevant frontmatter fields. Per the TRD decision tree (path 3), the inline stays unchanged.

**Line-range drift note:** TRD estimated ≥57 lines from stub_detection_patterns extraction. Actual cut was 45 lines (section was 50 lines, replacement is 5 lines). The TRD estimate was slightly high. Documented here; no impact on functionality.

**Total line cut delta:** Expected ≥1100 (TRD estimate), achieved 1010. Delta of ~90 lines = verifier VERIFICATION.md inline kept (path 3) + minor estimate drift in stub patterns.

## Deviations from Plan

None — TRD executed exactly as written. Path 3 decision for verifier.md VERIFICATION.md template was explicitly anticipated by the TRD's decision tree and error_recovery section. Debugger.md Option B was the TRD's preferred approach.

## Issues Encountered

None. All section boundaries matched 13-RESEARCH.md exactly (no line-range drift in planner, debugger, objective-researcher sections). The only drift was the stub-patterns section being 50 lines vs the TRD's ~57 estimate.
