# Auto-Behaviors Reference

Reference for automatic behaviors, skill triggering, and safety rules in DevFlow v2.

## Auto-Advance

When `workflow.auto_advance` is true (default), phases chain automatically:

| Completed Phase | Next Phase | Condition |
|---|---|---|
| new-project | plan-objective 1 | Always |
| plan-objective | execute-objective | Always |
| execute-objective | transition | Verification passed |
| execute-objective | STOP | Gaps found after 2 auto-fix cycles |
| transition | plan-objective N+1 | More objectives remain |
| transition | complete-milestone | All objectives done |

**Override:** Use `--pause` flag on any command to stop after that phase.

**Milestone boundary:** Auto-advance is automatically disabled at milestone completion (natural stopping point for human review).

## Auto-Approve (YOLO Mode)

When `mode` is "yolo" (default):

| Action | Behavior |
|---|---|
| Plan verification | Auto-approve |
| Checkpoint: human-verify | Auto-approve |
| Checkpoint: decision | Auto-select first option |
| Checkpoint: human-action | STOP (auth gates cannot be automated) |
| Objective transition | Auto-continue |
| Roadmap approval | Auto-approve |

## Auto Gap-Closure

When verification finds gaps after execution:

1. Auto-generate fix TRDs (spawn planner with `--gaps`)
2. Auto-execute fix TRDs
3. Re-verify
4. If still failing: try once more (max 2 cycles)
5. If still failing after 2 cycles: STOP for human input

## Confidence-Based Model Overrides

TRD confidence level affects execution model selection:

| Confidence | Executor Model | Behavior |
|---|---|---|
| `high` | Profile default | Standard execution |
| `medium` | Profile default | Extra verification at task boundaries |
| `low` | Upgrade to opus | Pause before destructive ops, extra verification |

## TDD Enforcement

When `gates.require_tests` is true (default):

- Type: tdd TRDs enforce RED → GREEN → REFACTOR cycle
- Evidence captured for each phase (command, output, exit code)
- Exception mechanism: `<!-- TDD-EXCEPTION: {reason} -->` required to skip
- Exceptions logged in SUMMARY.md

## Verification Enforcement

When `gates.require_verification` is true (default):

- Every task completion requires evidence (command + output + exit code)
- Prohibited claims: "should work", "probably passes", "I believe this works"
- SUMMARY.md must include Task Evidence table
- Post-TRD verification loop runs after all tasks (max 2 auto-fix cycles)

## Safety Rules

**Never auto-trigger:**
- Destructive operations (file deletion, database drops, force pushes)
- External service modifications (deployments, DNS changes)
- Financial operations (payment processing, subscription changes)

**Always confirm:**
- Checkpoint: human-action (auth gates, manual verification)
- Skipping incomplete objectives
- Milestone completion

**Scope boundaries:**
- Auto-fix only issues caused by current task's changes
- Pre-existing warnings/errors are out of scope
- Max 3 auto-fix attempts per task before stopping
