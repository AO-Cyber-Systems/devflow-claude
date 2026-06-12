---
objective: 10-autonomous-mode-overhaul
trd: "09"
subsystem: documentation
tags: [autonomous-mode, runbook, settings, unattended-operation]
dependency_graph:
  requires: ["10-01", "10-02", "10-03", "10-04", "10-05", "10-06"]
  provides: ["unattended-operation-runbook", "settings-autonomous-option"]
  affects: ["references/unattended-operation.md", "skills/settings/SKILL.md"]
tech_stack:
  added: []
  patterns:
    - "operator runbook pattern: all-in-one card covering enablement, launch, monitoring, safety bounds"
    - "settings skill mode question with three-option AskUserQuestion + runbook pointer"
key_files:
  created:
    - "plugins/devflow/devflow/references/unattended-operation.md"
  modified:
    - "plugins/devflow/skills/settings/SKILL.md"
decisions:
  - summary: "All three 8080 occurrences are in the port-rule section explicitly showing what NOT to do — all are prohibitions"
    rationale: "TRD requires 8080 matches only the prohibition sentence; the code-block example also serves as a prohibition demonstration"
  - summary: "Settings workflow (settings.md) not modified; mode question added as explicit process block in SKILL.md per error_recovery guidance"
    rationale: "settings.md has no mode question currently; TRD error_recovery says add minimal Mode section to skill body without restructuring"
metrics:
  duration_minutes: 5
  completed: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Objective 10 TRD 09: Unattended Operation Runbook Summary

**One-liner:** Operator runbook for autonomous headless DevFlow runs — headless launch, decision monitoring, safety bounds, port rule, and Routines pointer; settings skill surfaces autonomous mode with runbook link.

## What Was Built

**plugins/devflow/devflow/references/unattended-operation.md** — 210-line operator card covering:

1. Mode comparison table (interactive / yolo / autonomous) — what each gate does
2. Enablement (`df-tools config-set mode autonomous`, `/devflow:settings` pointer)
3. Headless launch (`claude -p ... --permission-mode acceptEdits`) with the permissionMode-frontmatter-ignored warning
4. Recommended settings.json permissions allowlist example (mechanical allow, destructive prompt)
5. Decision queue monitoring — `.planning/decisions/pending/`, `decision-queue list`, `decision-queue resolve`, `/devflow:decide` flow, OS notification prerequisites
6. Safety bounds table — 3-resume cap (`.planning/.autonomous-resume-{objectiveKey}`), 1 retry/agent (`.planning/.autonomous-retry-{agent-id}`), maxTurns 50/30, wave retry-once then skip dependents
7. Scheduled overnight runs — Routines pointer via `/schedule` with "DevFlow cannot create Routines programmatically" warning
8. Port rule — port 8091 mandatory, port 8080 explicitly forbidden with code example
9. Quick troubleshooting table for common symptoms

**plugins/devflow/skills/settings/SKILL.md** — Added Mode configuration process block to the skill body (objective updated to mention mode; process block extended with `AskUserQuestion` structure for Interactive/Yolo/Autonomous options, `config-set mode` write path, and runbook pointer when Autonomous is selected).

## Commits

| Hash | Message |
|------|---------|
| `7971db1` | `docs(10-09): unattended-operation runbook` |
| `9171778` | `feat(10-09): expose autonomous mode in settings skill` |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|------|----------------|-----------|--------|
| 1: Author runbook | `ls plugins/devflow/devflow/references/unattended-operation.md` | 0 | PASS |
| 1: claude -p present | `grep -n 'claude -p' ...unattended-operation.md` → 4 matches | 0 | PASS |
| 1: devflow:decide present | `grep -n 'devflow:decide' ...unattended-operation.md` → 2 matches | 0 | PASS |
| 1: 8091 present | `grep -n '8091' ...unattended-operation.md` → 5 matches | 0 | PASS |
| 1: 8080 prohibition only | `grep -n '8080' ...unattended-operation.md` → 3 matches, all in port-rule prohibition section | 0 | PASS |
| 1: bypassPermissions warning only | `grep -n 'bypassPermissions' ...unattended-operation.md` → 1 match, in warning context | 0 | PASS |
| 2: autonomous ≥2 in settings | `grep -c 'autonomous' plugins/devflow/skills/settings/SKILL.md` → 2 | 0 | PASS |
| 2: unattended-operation ≥1 in settings | `grep -c 'unattended-operation' ...SKILL.md` → 2 | 0 | PASS |
| 2: existing options present | `grep -n 'yolo\|interactive' ...SKILL.md` → present | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|------|---------|-----------|--------|
| decision-queue CLI live | `node df-tools.cjs decision-queue list` → `[]` | 0 | PASS |
| no 8080 in runbook except prohibition | `grep -n '8080' unattended-operation.md` → port-rule section only | 0 | PASS |
| npm test no regressions | `npm test` → 2273 pass, 13 fail (pre-existing), 50 skip | 1* | PASS |

*npm test exits 1 due to 13 pre-existing failures unrelated to this TRD.

## Deviations from Plan

None — TRD executed exactly as written. Mode question added directly to SKILL.md process block per the error_recovery guidance (settings.md had no existing mode question to modify).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - [x] references/unattended-operation.md exists and covers all required sections: VERIFIED
  - [x] permissionMode-frontmatter-ignored warning documented with session-level alternative: VERIFIED
  - [x] Port 8091 mandatory, port 8080 explicitly forbidden: VERIFIED
  - [x] settings skill exposes autonomous mode with runbook pointer: VERIFIED
  - [x] 2 atomic commits: VERIFIED
- Gate failures: None

## Self-Check

- `plugins/devflow/devflow/references/unattended-operation.md` — FOUND (7236 bytes)
- `plugins/devflow/skills/settings/SKILL.md` — FOUND, contains `autonomous` (2x) and `unattended-operation` (2x)
- Commit `7971db1` — FOUND in git log
- Commit `9171778` — FOUND in git log

## Self-Check: PASSED
