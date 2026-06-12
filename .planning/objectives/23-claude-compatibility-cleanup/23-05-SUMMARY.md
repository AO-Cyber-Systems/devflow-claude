---
objective: 23-claude-compatibility-cleanup
trd: "05"
subsystem: agents
tags: [deduplication, references, executor, planner, token-optimization]
dependency_graph:
  requires: [23-01, 23-02, 23-03, 23-04]
  provides: [deviation-rules-reference, planner-deduplication, executor-deduplication]
  affects: [plugins/devflow/agents/planner.md, plugins/devflow/agents/executor.md, plugins/devflow/devflow/references/deviation-rules.md]
tech_stack:
  added: []
  patterns: [content-move-not-rewrite, @-reference-convention]
key_files:
  created:
    - plugins/devflow/devflow/references/deviation-rules.md
  modified:
    - plugins/devflow/agents/executor.md
    - plugins/devflow/agents/planner.md
    - .planning/objectives/23-claude-compatibility-cleanup/23-05-measurements.md
decisions:
  - "Extracted executor deviation Rules 1-4 to references/deviation-rules.md byte-faithful including obj-10 Rule-4 queueable return format; RULE PRIORITY kept inline in executor.md"
  - "Replaced planner.md checkpoints block (87 lines) with 8-line summary + net-new @-reference to references/checkpoints.md"
  - "Replaced planner.md tdd_integration block (58 lines) with 3-line summary + existing @-reference to references/tdd.md"
  - "Folded Quality Degradation Curve table into scope_estimation Context Budget Rules; replaced philosophy section with 1-line pointer"
  - "Reported 6,798-byte combined reduction honestly; did not cut extra content to hit >=16,000-byte target"
metrics:
  duration: ~20min
  completed: "2026-06-12T20:04:11Z"
  tasks_completed: 3
  files_changed: 4
---

# Objective 23 TRD 05: Agent Deduplication Summary

Deduplicated planner.md and executor.md against authoritative references by extracting executor deviation rules to a new reference file, collapsing planner's checkpoint and TDD blocks to summaries with @-references, and consolidating five overlapping context-budget sections in place.

## Before/After Byte and Token Measurements

Token proxy: bytes / 4 (documented approximation, not exact tokenization)

| File | Before (bytes) | After (bytes) | Delta (bytes) | Before (tokens) | After (tokens) | Delta (tokens) |
|---|---|---|---|---|---|---|
| plugins/devflow/agents/planner.md | 50,631 | 46,497 | -4,134 | 12,658 | 11,624 | -1,034 |
| plugins/devflow/agents/executor.md | 25,892 | 23,228 | -2,664 | 6,473 | 5,807 | -666 |
| **Combined** | **76,523** | **69,725** | **-6,798** | **19,131** | **17,431** | **-1,700** |

### Target vs Actual

- Combined target: >=4k tokens (~16,000 bytes)
- Combined actual: 6,798 bytes / 1,700 tokens
- Shortfall vs 16,000-byte target: 9,202 bytes (~2,300 tokens)

The mapped sections (checkpoints 87 lines, TDD 58 lines, deviation rules ~100 lines) contained multi-line XML examples and code blocks where lines average 30-35 bytes. The research context predicted "~3.2-3.5k tokens may be the honest ceiling from the mapped sections alone" — the actual 1,700-token reduction is below even that range. Per TRD gotchas, no additional content was cut to hit the target.

### Per-Section Breakdown

| Section | File | Bytes Removed | Notes |
|---|---|---|---|
| `<checkpoints>` block | planner.md | ~3,200 | 87-line block → 8-line summary + @-reference |
| `<tdd_integration>` block | planner.md | ~2,200 | 58-line block → 3-line summary + @-reference |
| Quality Degradation Curve in `<philosophy>` | planner.md | ~330 | Table moved to scope_estimation; replaced with 1-line pointer |
| Redundant "2-3 tasks max" bold line | planner.md | ~60 | Folded into prose |
| New content added (summaries + @-references) | planner.md | +1,656 | |
| `<deviation_rules>` full definitions | executor.md | ~3,900 | Moved byte-faithful to deviation-rules.md |
| New content added (summaries + @-reference) | executor.md | +1,236 | RULE PRIORITY kept inline |

## Artifacts Produced

- `plugins/devflow/devflow/references/deviation-rules.md` — NEW: full Rules 1-4 definitions, Rule-4 queueable return format, SCOPE BOUNDARY, FIX ATTEMPT LIMIT
- `plugins/devflow/agents/executor.md` — slimmed: deviation_rules block replaced with one-line summaries + RULE PRIORITY inline + @-reference
- `plugins/devflow/agents/planner.md` — deduplicated: checkpoints/TDD blocks replaced with summaries + @-references; context-budget sections consolidated

## Key Links Established

| Source | Target | Type |
|---|---|---|
| executor.md `<deviation_rules>` | `@~/.claude/devflow/references/deviation-rules.md` | NET-NEW (new file + new reference) |
| planner.md `<checkpoints>` | `@~/.claude/devflow/references/checkpoints.md` | NET-NEW reference (file existed, reference added) |
| planner.md `<tdd_integration>` | `@~/.claude/devflow/references/tdd.md` | Pre-existing reference kept |

## Preservation Verification

| Check | Result |
|---|---|
| `maxTurns: 50` in executor.md frontmatter | PRESENT |
| `isolation: worktree` in executor.md frontmatter | PRESENT |
| `recommendation: option-b` in deviation-rules.md | PRESENT |
| `RULE PRIORITY` inline in executor.md | PRESENT (line 126) |
| verifier.md unmodified | CONFIRMED |
| Zero dangling @-references in both agent files | CONFIRMED |
| deviation-rules.md passes mirror exclusion check | CONFIRMED (`false`) |

## Deviations from Plan

None — TRD executed exactly as written. Byte shortfall reported honestly per TRD gotchas.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Extract executor deviation rules | `grep -c "recommendation: option-b" plugins/devflow/devflow/references/deviation-rules.md` | 0 (returns 1) | PASS |
| 1: RULE PRIORITY inline | `grep -n "RULE PRIORITY" plugins/devflow/agents/executor.md` | 0 (line 126) | PASS |
| 1: @-reference present | `grep -n "deviation-rules.md" plugins/devflow/agents/executor.md` | 0 (line 133) | PASS |
| 1: maxTurns preserved | `grep -n "maxTurns" plugins/devflow/agents/executor.md` | 0 (line 6) | PASS |
| 2: checkpoints.md @-reference | `grep -n "references/checkpoints.md" plugins/devflow/agents/planner.md` | 0 (line 493) | PASS |
| 2: tdd.md @-reference | `grep -n "references/tdd.md" plugins/devflow/agents/planner.md` | 0 (line 499) | PASS |
| 2: exactly one 50% rule | `grep -c "complete within ~50% context" plugins/devflow/agents/planner.md` | 0 (returns 1) | PASS |
| 3: dangling @-reference sweep | `grep -ho '@~/.claude/devflow/...' \| sed \| while read f; do test -f...` | 0 (no output) | PASS |
| 3: mirror exclusion check | `node -e "... references/deviation-rules.md"` | 0 (prints false) | PASS |
| 3: npm test | `npm test` | 1 (pre-existing failures only) | PASS (no regression) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | PASS (pre-existing failures unchanged) |

Pre-existing failures (13 tests, unchanged): daemon/watcher/peer-scan/novel-domain/handoff-pipeline/E2E1-roadmap-drift — all present before and after this TRD.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - planner.md no longer inlines full checkpoint/TDD sections: PASS
  - executor.md Rules 1-4 definitions in deviation-rules.md with Rule-4 queueable format: PASS
  - All @-references resolve to existing files: PASS
  - Obj-10 additions preserved (maxTurns/isolation + Rule-4 format): PASS
  - SUMMARY contains before/after measurements: PASS
- Gate failures: None (pre-existing test failures unchanged)

## Self-Check: PASSED

- `plugins/devflow/devflow/references/deviation-rules.md`: FOUND
- `plugins/devflow/agents/executor.md`: FOUND (modified)
- `plugins/devflow/agents/planner.md`: FOUND (modified)
- Commits 3938715, e32c004, 416fa00: FOUND
