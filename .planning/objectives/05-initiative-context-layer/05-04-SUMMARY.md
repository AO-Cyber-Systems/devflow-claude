---
objective: 05-initiative-context-layer
trd: 05-04
subsystem: initiatives
tags: [skill, plan-objective, planner-agent, format-for-planner, advisory-context]
dependency_graph:
  requires: [05-01, 05-02, 05-03]
  provides: [/devflow:initiatives skill, format-for-planner CLI, INITIATIVES planner block]
  affects: [initiatives-cli.cjs, plan-objective.md, planner.md]
tech_stack:
  added: []
  patterns: [format-for-planner passthrough subcommand, bash-var advisory injection, SKILL.md thin-orchestrator]
key_files:
  created:
    - plugins/devflow/skills/initiatives/SKILL.md
  modified:
    - plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
    - plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/agents/planner.md
decisions:
  - "_parseFlags bug: --repo was parsed as boolean; added to key-value list alongside --home, --initiative, --project-id"
  - "research-objective.md skipped: researcher focuses on technical patterns; planner integration alone satisfies SC-5"
  - "format-for-planner joins multiple matching initiatives with '\\n\\n---\\n\\n' separator for clean planner rendering"
metrics:
  duration: "5 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  tests_added: 3
  files_modified: 4
  files_created: 1
requirements: [SC-5, SC-6]
---

# Objective 05 TRD 04: Skill and Plan Integration Summary

**One-liner:** `/devflow:initiatives` SKILL.md + `format-for-planner` CLI subcommand + INITIATIVES advisory block wired into `plan-objective` workflow and `planner.md` agent prompt.

## What Was Built

### `plugins/devflow/skills/initiatives/SKILL.md` (CREATE)

Thin-orchestrator skill with locked frontmatter (name, description, argument-hint, allowed-tools). Three modes documented (sync, list, show) with `$ARGUMENTS` passthrough to `df-tools initiatives`. Includes `format-for-planner` subcommand in the Subcommand Reference section of `<context>` for completeness. Mirrors the `awareness` SKILL.md structural pattern exactly.

### `cmdInitiativesFormatForPlanner` in `initiatives-cli.cjs`

New subcommand that:
1. Requires `--repo <github_repo>` — exits 1 with JSON error if missing
2. Calls `init.loadInitiatives({ home })` with `--home` override support
3. Filters via `init.matchByRepo(initiatives, repo)`
4. If no matches: emits `_(no matching initiatives for this repo)_` + exit 0
5. If matches: maps each through `init.formatInitiativeForPlanner(i)`, joins with `\n\n---\n\n`, writes to stdout + exit 0

Also fixed `_parseFlags` bug: `--repo` was not in the key-value list, so it parsed as boolean `true` instead of the repo string. Added `--repo` alongside `--home`, `--initiative`, `--project-id`.

Updated `cmdInitiativesRoute` to dispatch `format-for-planner` case. Updated `module.exports` to include `cmdInitiativesFormatForPlanner`.

### `plan-objective.md` Step 8 extension

Inserted INITIATIVES extraction block directly after the CROSS_REPO extraction block (same code section, Step 8). Bash block:

1. Reads `PROJECT_GITHUB_REPO` from `.planning/PROJECT.md` via awk (strips quotes via `tr -d '"'`)
2. If repo is set: calls `df-tools initiatives format-for-planner --repo "$PROJECT_GITHUB_REPO" 2>/dev/null`
3. If empty: falls back to placeholder `_(none — initiatives not synced or no matches...)_`

Planner prompt `<additional_context>` heredoc extended with:
```
**Active Initiatives (from ~/.claude/devflow/initiatives/, advisory):**

{INITIATIVES}
```

### `planner.md` `<user_preferences>` extension

Added 4th advisory bias entry "Active Initiatives" alongside "Cross-Repo Considerations". Documents:
- Align with initiative's Why/Open Questions direction
- Cross-reference initiative `github_issue` ref in TRD frontmatter/context
- Non-blocking: empty/missing section → proceed without it

### `research-objective.md` — SKIPPED

The researcher focuses on technical patterns (library choices, API surface, existing code patterns). Initiative context is strategic direction (Why, Open Questions, sub-issues) and is most useful to the planner when making TRD-level decisions. Injecting strategic context into research would add noise without proportional value. Documented here per TRD output spec.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `--repo` flag parsing in `_parseFlags`**
- **Found during:** Task 1 (FP1 test failure: format-for-planner returned placeholder when file matched)
- **Issue:** `_parseFlags` only treated `--home`, `--initiative`, `--project-id` as key-value flags. `--repo VALUE` was parsed as boolean `true` instead of capturing the string value.
- **Fix:** Added `--repo` to the key-value condition: `a === '--home' || a === '--initiative' || a === '--project-id' || a === '--repo'`
- **Files modified:** `plugins/devflow/devflow/bin/lib/initiatives-cli.cjs`
- **Commit:** 21ac35b

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: SKILL.md + format-for-planner CLI | `ls plugins/devflow/skills/initiatives/SKILL.md` | 0 | PASS |
| 1: format-for-planner smoke (empty home) | `df-tools initiatives format-for-planner --repo ... --home /tmp/empty` | 0 | PASS |
| 1: Full test suite | `npm test` (1086 pass, 3 new FP tests) | 0 | PASS |
| 2: INITIATIVES block in workflow | `grep -A5 INITIATIVES plan-objective.md` | 0 | PASS |
| 2: Active Initiatives in planner | `grep "Active Initiatives" planner.md` | 0 | PASS |
| 2: Full test suite regression check | `npm test` (1086 pass, 0 fail) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 1 (--repo flag parsing bug)
- Must-haves verified: 6/6
  - `/devflow:initiatives` SKILL.md exists with locked frontmatter
  - `format-for-planner` subcommand dispatched in router
  - 3 CLI4-equivalent (FP1/FP2/FP3) tests pass
  - plan-objective.md Step 8 extracts INITIATIVES via bash + df-tools
  - Planner prompt heredoc references `{INITIATIVES}` placeholder
  - planner.md `<user_preferences>` lists Active Initiatives advisory bias (4th entry)
- Gate failures: None

## Where TRD 05-05 Picks Up

TRD 05-05 handles:
1. `module.exports` finalization/lock for `initiatives.cjs`
2. Integration tests (token-budget assertion, end-to-end plan-time read with realistic fixtures)
3. dogfood test: verify `/df:plan-objective 5` reads initiatives correctly with this repo's `github_repo` field

## Self-Check: PASSED

Files verified:
- `/Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/skills/initiatives/SKILL.md` — FOUND
- `/Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/lib/initiatives-cli.cjs` — FOUND (format-for-planner dispatched)
- `/Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/workflows/plan-objective.md` — FOUND (INITIATIVES block present)
- `/Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/agents/planner.md` — FOUND (Active Initiatives advisory bias present)
- Commits: `21ac35b` (feat: skill + CLI), `4b99531` (feat: workflow + planner) — both in git log

Final test counts: 1086 pass, 20 skip, 0 fail (3 new FP tests added)
