---
objective: 03-planning-time-org-awareness
trd: 03-03
title: scanOrgOverlap + misfiling detection (graceful auth degradation)
subsystem: org-awareness
tags: [org-awareness, tdd, auth-degradation, misfiling, scoring]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [scanOrgOverlap, _detectMisfiling, _scoreOrgItem, _extractRepoFromRef]
  affects: [org-awareness.cjs, org-awareness-cli.cjs, org-awareness.test.cjs]
tech_stack:
  added: []
  patterns: [catch-GhAuthError-graceful-degrade, chain-match-scoring-boost, advisory-misfiling]
key_files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/org-awareness.cjs
    - plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
    - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
decisions:
  - "GhAuthError caught at scanOrgOverlap level; non-auth errors re-thrown (locked decision #8)"
  - "resolveChain failure during misfiling check independently try/caught; items still returned"
  - "sibling_repos=[] in CLI invocation; composition with scanSiblings deferred to TRD 03-04"
  - "CLI exits 0 regardless of auth state; skipped:true surfaces via JSON not exit code"
metrics:
  duration: "4 minutes"
  completed: "2026-05-05"
  tasks_total: 2
  tasks_completed: 2
  files_modified: 4
  tests_added: 25
  tests_before: 790
  tests_after: 813
requirements: [SC-5, SC-6]
---

# Objective 03 TRD 03: scanOrgOverlap + Misfiling Detection Summary

## One-Liner

Org-Project overlap scanner with chain-match scoring (+10 per sibling sub-issue ref) and advisory misfiling detection, with graceful auth degradation (GhAuthError → skipped:true, never thrown).

## What Was Built

### `scanOrgOverlap(opts)` — `lib/org-awareness.cjs`

Composes obj 2's `aw.scanOrg()` to fetch Product Roadmap items, scores each item using:
- **Chain-match boost (+10):** if any sub-issue ref's repo appears in `sibling_repos` array
- **Keyword overlap (+1 each):** shared tokens between item title/body and `current_tokens`

Returns top-3 by score desc, with shape: `{ items: [...], warnings: [...], skipped: bool, misfiling: object|null }`.

**Critical auth inversion:** wraps `aw.scanOrg()` in try/catch. On `GhAuthError`, returns `{ items: [], warnings: [...], skipped: true, misfiling: null }` — does NOT propagate. Non-auth errors re-thrown. This is the explicit inversion of obj 1/obj 2's hard-fail pattern (CONTEXT.md locked decision #8).

### `_detectMisfiling(chain, projectCtx)` — advisory only

Parses `chain.roadmap_issue` ref to extract owner/repo, compares against `projectCtx.github_repo`. Returns `{ current_repo, resolved_repo, message }` on mismatch, `null` on match or any missing field. Never throws, never blocks.

### `_scoreOrgItem(item, currentTokens, siblingRepos)` — pure scoring logic

Returns `{ total, chain_match, matched_keywords }`. Chain match set on first matching sibling sub-issue ref. Keyword overlap via `_tokenize` on item title+body.

### `_extractRepoFromRef(ref)` — repo extraction helper

Handles full refs (`Owner/repo#N`), HTTP refs (`https://github.com/Owner/repo#N`), shorthand (`#N` → null), null/non-string → null.

### CLI `scan-org-overlap` — replaces 03-01 stub

Reads `PROJECT.md` frontmatter (best-effort), calls `scanOrgOverlap`, emits JSON. Exits 0 whether scan ran or skipped.

## Commits

| Hash | Type | Description |
|---|---|---|
| `cf65e28` | test | RED phase — 25 failing tests for SOI/MF/OO/AD/CLI3 groups |
| `20e5786` | feat | GREEN phase — implement scanOrgOverlap + helpers + CLI wiring |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — failing tests | `npm test 2>&1 \| grep -E 'SOI\|MF[0-9]\|OO[0-9]\|AD[0-9]\|CLI3'` | see below | PASS (RED confirmed) |
| 2: GREEN — implementation | `npm test 2>&1 \| tail -5` | 0 | PASS |

RED verification: all 25 new tests showed `✖` (TypeError: not a function) before implementation.
GREEN verification: 813 passing, 0 failing, 15 skipped.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| export check | `node -e 'const a=require("./..."); if(typeof a.scanOrgOverlap!=="function") throw new Error(...)'` | 0 | PASS |
| CLI JSON output | `df-tools org-awareness scan-org-overlap 03 --raw \| head -1` | 0 | PASS |
| no-AskUserQuestion | `grep -n 'AskUserQuestion' lib/org-awareness.cjs` | 1 (not found) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test 2>&1 \| grep -E 'SOI\|MF\|OO\|AD\|CLI3'` | all ✖ | FAIL (correct) |
| GREEN | `npm test 2>&1 \| tail -5` | 0 | PASS (correct) |

## Deviations from Plan

### Auto-fixed Issues

None — TRD executed exactly as written.

**Notable implementation choices:**
- `resolveChain` misfiling check independently try/caught with its own warning: per TRD error_recovery spec (OO8 test covers this).
- `gh.resolveChain` exported property is writable in CommonJS module surface, enabling the OO8 mock pattern.
- `_extractRepoFromRef` exported as a separate helper (per TRD must_haves artifacts) — useful for TRD 03-07 integration tests.
- The `chain.warnings` propagation uses `Array.isArray(chain && chain.warnings)` guard to handle null/empty chain response.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 11/11
- Gate failures: None

## Self-Check: PASSED

All files present. All commits verified. 813 tests passing.
