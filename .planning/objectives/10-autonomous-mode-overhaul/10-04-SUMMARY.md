---
objective: 10-autonomous-mode-overhaul
trd: "04"
subsystem: orchestration-decisions
tags: [autonomous-mode, decision-queue, wave-failures, trd-spec]
dependency_graph:
  requires: ["10-02", "10-03"]
  provides: ["decision-parking-protocol", "autonomous-failure-handling", "rule-4-queue-shape"]
  affects: ["execute-objective.md", "executor.md", "trd-spec.md"]
tech_stack:
  added: []
  patterns:
    - "PARK/NOTIFY/CONTINUE-INDEPENDENT decision protocol replacing forward-reference placeholder"
    - "retry-once with failure_feedback block then dependency-aware transitive skip"
    - "queueable Rule 4 return with decision/context/options/recommendation fields"
    - "decision_gate frontmatter field linking TRDs to pending decisions"
key_files:
  created: []
  modified:
    - "plugins/devflow/devflow/workflows/execute-objective.md"
    - "plugins/devflow/agents/executor.md"
    - "plugins/devflow/devflow/references/trd-spec.md"
decisions:
  - summary: "Blocked-set computation is done at orchestrator level using already-loaded wave/depends_on data — no shell-out to computeBlockedSet during parking"
    rationale: "The orchestrator holds objective-job-index data in context; computeBlockedSet exists for resume-time recomputation by /devflow:decide only"
  - summary: "Rule 4 returns are parked as type: rule-4-deviation using the same decision-queue add path as checkpoint:decision"
    rationale: "Symmetric handling simplifies the orchestrator and ensures all mid-run decision gates use the same /devflow:decide resolution flow"
  - summary: "retry-once uses a failure_feedback block in the fresh executor prompt rather than state mutation"
    rationale: "Stateless re-spawn is more reliable than attempting to resume a failed agent; the feedback block provides context without shared state"
metrics:
  duration_minutes: 12
  completed: "2026-06-12"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Objective 10 TRD 04: Decision Wiring + Wave Failures Summary

**One-liner:** Decision-queue wiring into the execution orchestrator: checkpoint:decision parks with full context and continues independent waves; wave failures retry-once then skip only dependents; Rule 4 returns are queueable; trd-spec gains decision_gate field.

## What Was Built

**execute-objective.md — decision parking branch (Task 1):**
Replaced the 10-02 forward-reference placeholder in the autonomous checkpoint block with the full PARK/NOTIFY/CONTINUE-INDEPENDENT protocol. The `checkpoint:decision` handler now runs `df-tools decision-queue add` with all required flags (`--objective`, `--trd`, `--wave`, `--title`, `--context`, `--options`, `--recommendation`, `--blocks`, `--independent`). The blocked set is computed from the already-loaded objective-job-index wave/depends_on data plus any TRDs carrying a matching `decision_gate` frontmatter field. The parked plan is marked `⏸ parked on DECISION-NNN` in the wave table and independent TRDs continue without interruption. Rule 4 deviation returns from executors are handled identically with `type: rule-4-deviation`. The `aggregate_results` step includes a `### Pending Decisions` table (id, title, blocked TRDs, `/devflow:decide` resolve command) when `.planning/decisions/pending/` is non-empty.

**execute-objective.md — autonomous failure protocol (Task 2):**
Added the autonomous wave-failure protocol to step 7. When `MODE` is `"autonomous"`: (1) RETRY ONCE — re-spawn a fresh executor with a `<failure_feedback>` block containing spot-check results, error output, and partial commits from the failed attempt; (2) if retry also fails, compute the transitive dependent set from the depends_on map; (3) SKIP only dependents, continue all independent TRDs; (4) final report table with completed/failed/skipped/parked rows. The non-autonomous `"Continue?" or "Stop?"` prompt is preserved byte-for-byte. Step 6 spot-check failure routing now branches on MODE before prompting.

**executor.md — structured Rule 4 return (Task 3):**
Extended the Rule 4 Action block with a mandatory queueable return format: `decision:` (one-line), `context:` (what/why/impact), `options:` (2+ named options with pros/cons — current approach as option-a, proposed as option-b), `recommendation:` (id + rationale). Added a note clarifying that in autonomous mode the orchestrator parks this return and options must be self-contained.

**trd-spec.md — decision_gate field (Task 3):**
Added `decision_gate: DECISION-NNN` to the frontmatter example, the Frontmatter Fields table, and a dedicated `## decision_gate Frontmatter Field` section explaining set-by (planner), consumed-by (execute-objective + computeBlockedSet), value format, absent-means-independent semantics, and a 3-line frontmatter example of a gated TRD.

## Commits

| Hash | Message |
|------|---------|
| `127e6e1` | `feat(10-04): park decisions and continue independent waves in autonomous mode` |
| `77ed505` | `feat(10-04): retry-once then dependency-aware skip for autonomous wave failures` |
| `7453f84` | `docs(10-04): queueable Rule 4 return + decision_gate frontmatter field` |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|------|---------------|-----------|--------|
| 1: Decision parking + dependency-aware continuation | `grep -c 'decision-queue add' execute-objective.md` → 4 | 0 | PASS |
| 1: Decision parking + dependency-aware continuation | `grep -c 'Pending Decisions' execute-objective.md` → 2 | 0 | PASS |
| 1: Decision parking + dependency-aware continuation | `grep -n 'rule-4-deviation' execute-objective.md` → line 488 | 0 | PASS |
| 1: Decision parking + dependency-aware continuation | `grep -c '8080' execute-objective.md` → 1 (prohibition only) | 0 | PASS |
| 1: Decision parking + dependency-aware continuation | `grep -n 'Verifier-approved' execute-objective.md` → line 457 (untouched) | 0 | PASS |
| 2: Autonomous wave-failure protocol | `grep -n 'RETRY ONCE' execute-objective.md` → line 372 in step 7 | 0 | PASS |
| 2: Autonomous wave-failure protocol | `grep -c 'failure_feedback' execute-objective.md` → 3 | 0 | PASS |
| 2: Autonomous wave-failure protocol | `grep -n '"Continue?" or "Stop?"' execute-objective.md` → line 399 | 0 | PASS |
| 2: Autonomous wave-failure protocol | `grep -c '8080' execute-objective.md` → 1 (prohibition only) | 0 | PASS |
| 3: Rule 4 structured return + decision_gate spec | `grep -n 'recommendation' executor.md` → lines 167, 175, 176 | 0 | PASS |
| 3: Rule 4 structured return + decision_gate spec | `grep -c 'decision_gate' trd-spec.md` → 7 | 0 | PASS |
| 3: Rule 4 structured return + decision_gate spec | `npm test` → 105 pass, 1 pre-existing fail | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|------|---------|-----------|--------|
| No 8080 in touched files | `grep -rn '8080' execute-objective.md executor.md trd-spec.md` | 0 (returns 1 line — prohibition) | PASS |
| first option only in yolo branch | `grep -n 'first option' execute-objective.md` → line 496 (yolo branch only) | 0 | PASS |
| npm test no regressions | `node --test df-tools.test.cjs` → 105 pass, 1 pre-existing | 0 | PASS |
| Verifier-approved untouched | `grep -n 'Verifier-approved' execute-objective.md` | 0 | PASS |

## Deviations from Plan

None — TRD executed exactly as written. All three tasks completed in order with no unexpected issues.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - [x] checkpoint:decision parks with full context + notification, independent waves continue: VERIFIED (`127e6e1`)
  - [x] Rule 4 stops parked (queued, not removed) in autonomous mode: VERIFIED (`7453f84` executor.md + `127e6e1` orchestrator rule-4-deviation handler)
  - [x] Wave failure: retry-once → dependency-aware skip → end-of-run report: VERIFIED (`77ed505`)
  - [x] decision_gate documented in trd-spec.md: VERIFIED (`7453f84`, 7 occurrences)
  - [x] Interactive + yolo behavior unchanged: VERIFIED (`"Continue?" or "Stop?"` preserved line 399; yolo Auto-selected: [option] preserved line 496)
- Gate failures: None

## Self-Check

- `127e6e1` — FOUND (git log confirmed)
- `77ed505` — FOUND (git log confirmed)
- `7453f84` — FOUND (git log confirmed)
- `plugins/devflow/devflow/workflows/execute-objective.md` — contains `decision-queue add`, `Pending Decisions`, `rule-4-deviation`, `RETRY ONCE`, `failure_feedback`, preserved `Verifier-approved` and `"Continue?" or "Stop?"`
- `plugins/devflow/agents/executor.md` — contains `recommendation`, `decision:`, `context:`, `options:`, `option-a/option-b` structured return format
- `plugins/devflow/devflow/references/trd-spec.md` — contains `decision_gate` in frontmatter example, fields table, and dedicated section with 3-line example

## Self-Check: PASSED
