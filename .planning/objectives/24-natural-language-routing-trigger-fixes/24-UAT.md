---
status: complete
objective: 24-natural-language-routing-trigger-fixes
source: 24-01-edit-override-marker-SUMMARY.md, 24-02-route-intent-rules-SUMMARY.md, 24-03-skill-trigger-disambiguation-SUMMARY.md
started: 2026-06-13T00:08:30Z
updated: 2026-06-13T00:14:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Override phrase arms gate bypass (cross-hook)
expected: Prompt with an override phrase ("just edit", "skip devflow", "bypass devflow", "force edit") writes .planning/.edit-override; the next Edit is allowed by gate-edits and the marker is deleted after consumption
result: pass
evidence: Live sandbox run — route-intent wrote marker on "just edit the readme header"; gate-edits allowed the next Edit and deleted the marker; subsequent Edit without marker denied with ambient-mode message

### 2. Stale override marker rejected
expected: An .edit-override marker older than 5 minutes does NOT bypass the gate — edit is denied and the stale marker is deleted
result: pass
evidence: Marker backdated 10 minutes via touch -t; gate-edits returned permissionDecision deny and the marker was deleted

### 3. EXECUTE rule routes to execute-objective
expected: A prompt like "execute objective 5" produces a routing directive suggesting /devflow:execute-objective (not /devflow:build)
result: pass
evidence: route-intent emitted "Use /devflow:execute-objective" directive; no build suggestion

### 4. TODO rule routes to todo add
expected: A prompt like "add a todo to fix the header" produces a routing directive suggesting /devflow:todo add
result: pass
evidence: route-intent emitted "Use /devflow:todo add" directive

### 5. QUICK rule + BUILD suppression
expected: A prompt like "make a quick pass at the readme" routes to /devflow:quick, and /devflow:build is NOT suggested alongside it
result: pass
evidence: route-intent emitted "Use /devflow:quick" only; build suppressed

### 6. Skill-active suppresses routing reminders
expected: When .planning/.skill-active exists, route-intent emits no routing directive for prompts that would normally fire
result: pass
evidence: With .skill-active present, "lets build the dashboard" produced no output; without it, the same prompt emitted the /devflow:build directive

### 7. Skill trigger disambiguation
expected: execute-objective/SKILL.md no longer lists "build objective", "let's build", "start building"; quick/SKILL.md no longer lists bare "do this"/"tackle this"; help/SKILL.md no longer lists bare "help"; build/SKILL.md unchanged
result: pass
evidence: grep zero hits for shared/bare triggers in execute-objective/quick/help; execution-only and scope-qualified variants present; build/SKILL.md retains all build-flavored triggers

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
