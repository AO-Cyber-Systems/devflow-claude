---
objective: 05-initiative-context-layer
trd: 05-01
subsystem: initiatives
tags: [reader, fixtures, cli, token-budget, tdd]
dependency_graph:
  requires: [lib/frontmatter.cjs::extractFrontmatter, lib/gh.cjs::_setRunGh, lib/helpers.cjs::output]
  provides: [lib/initiatives.cjs::loadInitiatives, lib/initiatives.cjs::matchByRepo, lib/initiatives.cjs::formatInitiativeForPlanner, lib/initiatives-cli.cjs::cmdInitiativesRoute]
  affects: [df-tools.cjs::case-initiatives]
tech_stack:
  added: [lib/initiatives.cjs, lib/initiatives-cli.cjs]
  patterns: [_setRunFs injection, subprocess CLI tests, split-on-## section extraction]
key_files:
  created:
    - plugins/devflow/devflow/bin/lib/initiatives.cjs
    - plugins/devflow/devflow/bin/lib/initiatives.test.cjs
    - plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
    - plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
decisions:
  - "Used split-on-## boundary for _extractSection instead of multiline regex (avoids $ end-of-line vs end-of-string ambiguity in multiline mode)"
  - "T2 test construction fixed: p1 must be > 750 chars so paragraph-break truncation path is exercised before MAX_WHY_CHARS boundary"
  - "Sync CLI stub emits 'not yet implemented (TRD 05-02)' — TRD 05-02 replaces this with real implementation"
metrics:
  duration: 9min
  completed: "2026-05-05"
  tasks: 3
  files_modified: 6
  tests_added: 38
  tests_baseline: 967
  tests_final: 1005
requirements: [SC-4, SC-6]
---

# Objective 05 TRD 01: Reader + Fixtures Summary

**One-liner:** Initiative reader with `loadInitiatives`/`matchByRepo`/`formatInitiativeForPlanner`, three fixture builders, CLI list/show, and sync stub — offline-only reader path, 38 new TDD tests.

## Files Created / Modified

### Created
- `lib/initiatives.cjs` — Skeleton + reader region: `loadInitiatives`, `matchByRepo`, `formatInitiativeForPlanner`, `_parseInitiativeFile`, `_truncateWhy`, constants, `_setRunFs`/`_setRunGh`/`_resetMocks` injection hooks. Partial exports (finalized TRD 05-05).
- `lib/initiatives.test.cjs` — 28 named tests: Groups L (7), M (5), F (7), P (5), T (4).
- `lib/initiatives-cli.cjs` — CLI router: `cmdInitiativesRoute`, `cmdInitiativesList` (wired), `cmdInitiativesShow` (wired), `cmdInitiativesSync` (stub → exit 1).
- `lib/initiatives-cli.test.cjs` — 10 named tests: Groups CLI (8), I (2).

### Modified
- `lib/__fixtures__/awareness-fixtures.cjs` — Added `buildInitiativeFile`, `buildInitiativeYaml`, `buildInitiativesHomeTree` (3 builders, appended before module.exports).
- `df-tools.cjs` — Added `const { cmdInitiativesRoute } = require('./lib/initiatives-cli.cjs')` import + `case 'initiatives':` arm.

## Test Groups and Counts

| Group | Description | Count | Status |
|---|---|---|---|
| L | loadInitiatives (L1-L7) | 7 | PASS |
| M | matchByRepo (M1-M5) | 5 | PASS |
| F | formatInitiativeForPlanner (F1-F7) | 7 | PASS |
| P | _parseInitiativeFile (P1-P5) | 5 | PASS |
| T | _truncateWhy (T1-T4) | 4 | PASS |
| CLI | CLI router list/show/sync/unknown (CLI1-CLI8) | 8 | PASS |
| I | Integration + router arm (I1-I2) | 2 | PASS |
| **Total** | | **38** | **PASS** |

## Locked Behaviors Confirmed

- **L1 graceful-empty contract:** `loadInitiatives({ home: '/missing' })` returns `[]` with no stderr output — mirrors obj3 `scanSiblings` pattern.
- **L5 malformed-frontmatter skipping:** stderr warning emitted containing offending slug; well-formed siblings returned.
- **L7 fault-tolerant read:** unreadable file (EACCES via mocked `_runFs`) silently skipped with warning.
- **F2 hard-cap at 1500 chars:** `formatInitiativeForPlanner` with 5000-char Why produces output ≤ MAX_FORMATTED_PLANNER_CHARS.
- **F3 Status section dropped:** `## Status` content (`**GitHub:**`, `Project status:`) never appears in planner format.
- **F5 sub-issue truncation:** 7 sub-issues → shows 5 + "…and 2 more".
- **CLI3 empty JSON for missing home:** `df-tools initiatives list --home /missing` → `[]` + exit 0.
- **CLI6 sync stub:** exits 1 with `{"error": "not yet implemented (TRD 05-02)"}` — TRD 05-02 replaces this.
- **M4 case-sensitive matching:** `AO-Cyber-Systems/devflow` ≠ `ao-cyber-systems/devflow`.
- **No gh calls in reader:** `grep "_runGh\|gh\." lib/initiatives.cjs` shows only re-export shim + require.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed _extractSection multiline regex ambiguity**
- **Found during:** Task 3 (P5 test failure: only 1 of 3 checkbox sub-issues returned)
- **Issue:** Original `_extractSection` used `(?=^## |$)` in multiline mode. In Node multiline regex, `$` matches end-of-line (not end-of-string), so the lookahead terminated after the first body line.
- **Fix:** Replaced regex with a `body.split(/(?=^## )/m)` boundary approach — iterates sections, finds the matching header, returns content after the header line.
- **Files modified:** `lib/initiatives.cjs`
- **Commit:** 862ca1a (included in feat commit)

**2. [Rule 1 - Bug] Fixed T2 test paragraph-break construction**
- **Found during:** Task 3 (T2 test failure: C-chars appeared in truncated output)
- **Issue:** T2 test used `paragraph1` (24 chars) + `paragraph2` (200 chars) + `paragraph3` (2000 chars). With MAX_WHY_CHARS=1500, p3 starts at position 228 — well within the 1500-char window. The test assertion `!result.includes('C'.repeat(100))` was always false.
- **Fix:** Changed p1 to 800 chars. Now paragraph break at position 800 is > 50% of 1500 (the threshold in `_truncateWhy`), so truncation stops at the p1/p2 boundary and p3 (Cs) never appears in output.
- **Files modified:** `lib/initiatives.test.cjs`
- **Commit:** 862ca1a (included in feat commit)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Add fixture builders | `node -e "const f = require('./...awareness-fixtures.cjs'); const md = f.buildInitiativeFile({slug:'foo'}); console.log(md.split('\\n').length, md.includes('## Why'), typeof f.buildInitiativesHomeTree);"` | 0 | PASS (32, true, function) |
| 2: Write RED tests | `npm test -- --test-name-pattern="initiatives"` | 1 | PASS (RED - Cannot find module) |
| 3: Implement GREEN | `npm test` | 0 | PASS (1005/1005 tests) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| full test suite | `npm test` | 0 | PASS (1005 pass, 0 fail, 20 skip) |
| no-gh-in-reader | `grep "_runGh\|gh\." lib/initiatives.cjs` | — | PASS (re-export only) |
| exports present | `node -e "require('./lib/initiatives.cjs')"` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (fixtures) | `npm test -- --test-name-pattern="initiatives"` | 1 | FAIL (Cannot find module — correct) |
| GREEN | `npm test` | 0 | PASS 1005 — correct |

## Post-TRD Verification

- Auto-fix cycles used: 1 (Rule 1: multiline regex + T2 test construction, same fix cycle)
- Must-haves verified: 7/7 (reader contract, matchByRepo, formatInitiativeForPlanner, CLI list/show, sync stub, token-budget, no regressions)
- Gate failures: None

## Where TRD 05-02 Picks Up

- **`cmdInitiativesSync` stub** at `lib/initiatives-cli.cjs:cmdInitiativesSync` → replaced by real `syncInitiatives` implementation.
- **Writer region** in `lib/initiatives.cjs` (after the TRD 05-01 reader region) → adds `syncInitiatives`, `_writeInitiativeFile`, `_qualifiesAsInitiative`, `_slugifyInitiativeTitle`, `_renderInitiativeMarkdown`.
- **`realFs` extension** — write methods (`writeFileSync`, `mkdirSync`, `renameSync`, `unlinkSync`) added by TRD 05-02 (locked out of this TRD per anti-patterns).
- **`initiatives.test.cjs`** — TRD 05-02 adds Group S (sync) and Group W (writer) test groups.

## Self-Check: PASSED
