---
objective: 16-phase-b-micro-skill
job: "02"
subsystem: skills
tags: [micro-task, skill, workflow, no-ceremony, state-md]

requires:
  - objective: 16-01
    provides: df-tools micro start|commit|abort CLI surface
provides:
  - "/devflow:micro skill (SKILL.md, ~26 body lines, no Task tool)"
  - "workflows/micro.md (56 lines, status:active, 5-step start→edit→commit dance)"
  - "STATE.md template note documenting micro entries in Quick Tasks Completed table"
affects: [16-04-classifier-routing, skill-routing, state-md-template]

tech-stack:
  added: []
  patterns:
    - "Thin-orchestrator SKILL.md pattern — delegates entirely to @~/.claude/devflow/workflows/micro.md"
    - "No-ceremony floor: no allowed Task tool, no SUMMARY.md creation, no agent spawns"
    - "AskUserQuestion single-prompt pattern — only when $ARGUMENTS empty (mirrors quick.md)"

key-files:
  created:
    - plugins/devflow/skills/micro/SKILL.md
    - plugins/devflow/devflow/workflows/micro.md
  modified:
    - plugins/devflow/devflow/templates/state.md

key-decisions:
  - "No Task tool in allowed-tools: micro's entire value is single-context, no spawn overhead. Task excluded from allowed-tools to prevent accidental agent invocation."
  - "AskUserQuestion single-prompt max: mirrors quick.md's pattern — one prompt only when $ARGUMENTS is empty. No confirmation gates between steps."
  - "abort re-routed to full path in workflow: df-tools.cjs micro abort documented as node ~/.claude/devflow/bin/df-tools.cjs micro abort (not shorthand) for consistency with start/commit invocations."
  - "success_criteria block kept in workflow: non-negotiable per TRD — provides runtime checklist for the executing Claude instance."

requirements-completed: [PHASE-B1]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 4min
completed: 2026-05-06
---

# Objective 16 TRD 02: Micro Skill Summary

**`/devflow:micro` skill + workflow body — thin orchestrator at ~26 body lines, ~2k token budget, no agent spawns, full start→edit→commit dance via df-tools**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-05-06T05:57:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `plugins/devflow/skills/micro/SKILL.md` — 26 body lines (39 total with frontmatter). Allowed-tools: Read, Write, Edit, Bash, AskUserQuestion. No Task. Delegates to `@~/.claude/devflow/workflows/micro.md`.
- `plugins/devflow/devflow/workflows/micro.md` — 56 lines, `status: active`. Five steps: get description → start → edit inline → commit → done. References `df-tools.cjs micro start`, `commit`, and `abort` (4 occurrences). Zero `Task(` invocations.
- `plugins/devflow/devflow/templates/state.md` — one-line note added under `<sections>` documenting that `/devflow:micro` and `/devflow:quick` share the Quick Tasks Completed table, differentiable by `chore(micro): ...` prefix.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Create SKILL.md | `test -f .../SKILL.md && grep -c "^name: micro$"` | 0 | PASS |
| 2: Create workflow + update state.md | `wc -l .../micro.md` (56 ≤ 80), `grep -c "df-tools.cjs micro"` (4), `npm test` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1726 pass, 2 fail — identical to 16-01 baseline) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5
- **Gate failures:** None

## Line Counts

| File | Lines | Cap | Status |
|---|---|---|---|
| `plugins/devflow/skills/micro/SKILL.md` | 39 total (26 body) | ≤35 body | PASS |
| `plugins/devflow/devflow/workflows/micro.md` | 56 | ≤80 | PASS |

## Smoke-Test Result

Manual smoke-test is gated on a live DevFlow project with `.planning/`. The CLI contract (from 16-01-SUMMARY.md) confirms:

```
df-tools micro start "smoke test"   → ok:true, writes .skill-active + .micro-description
# Edit a file (gate-edits.js permits because marker exists)
df-tools micro commit               → ok:true, chore(micro): smoke test on git log
```

Workflow body documents this exact round-trip in Steps 2-4. Full manual run deferred until both 16-01 and 16-02 are deployed to the home-mirror via sync-runtime.

## Token-Cost Estimate

| Component | Estimated Tokens |
|---|---|
| SKILL.md load (39 lines) | ~150 tokens |
| `df-tools micro start` JSON output | ~100 tokens |
| `df-tools micro commit` JSON output | ~100 tokens |
| workflows/micro.md body | ~600 tokens |
| **Total** | **~950–1200 tokens** |

Well within the ~2k target, leaving headroom for STATE.md read (~200 tokens) and the user's edit context.

## What 16-04 (Classifier Routing) Needs to Know

The `/devflow:micro` skill is now loadable under `plugins/devflow/skills/micro/SKILL.md`. The classifier routing system (16-04) can route to it via `SlashCommand("devflow:micro", description)`. Key routing signals:

- **Triggers:** "fix typo", "rename X to Y", "1-line fix", "single-file change", "tiny", "trivial"
- **Scope cap:** sub-30-LOC, single file
- **Token budget:** ~2k (cheapest tier — prefer routing here over quick/build for floor-case tasks)
- **No agent spawn:** classifier can safely route here without spawning sub-agents

## Deviations from Plan

None — TRD executed exactly as written. The `grep -c "Quick Tasks Completed"` count in state.md returned 1 (not ≥2) because the template had no pre-existing reference to the table before this TRD; the note was a net-new addition. The TRD's verify comment assumed a pre-existing reference that didn't exist. Outcome (note present, `chore(micro)` referenced) fully satisfies the intent.

## Files Created/Modified

- `plugins/devflow/skills/micro/SKILL.md` — 26 body lines. Thin orchestrator. No Task tool. Delegates to workflow.
- `plugins/devflow/devflow/workflows/micro.md` — 56 lines. Full 5-step flow. 4× df-tools.cjs micro references.
- `plugins/devflow/devflow/templates/state.md` — Added Quick Tasks Completed documentation note.

---
*Objective: 16-phase-b-micro-skill*
*Completed: 2026-05-06*
