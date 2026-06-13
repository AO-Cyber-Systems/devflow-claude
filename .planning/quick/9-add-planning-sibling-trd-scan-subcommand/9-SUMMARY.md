---
mode: quick
id: 9-add-planning-sibling-trd-scan-subcommand
title: Add `df-tools planning sibling-trd-scan` subcommand for cross-repo TRD discovery
status: complete
type: tdd
tasks_completed: 3
tasks_total: 3
loc_delta:
  org-awareness.cjs: +154
  org-awareness.test.cjs: +290 (incl. EX1 lock-test bump)
  df-tools.cjs: +57
  total: ~501
files_modified:
  - plugins/devflow/devflow/bin/lib/org-awareness.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
commits:
  - 0f55514 — test(quick-9): add failing tests for scanSiblingTrds (RED)
  - 83cd337 — feat(quick-9): implement scanSiblingTrds for cross-repo TRD discovery (GREEN)
  - e31d6f3 — feat(quick-9): wire df-tools planning sibling-trd-scan CLI subcommand
duration: ~30 min
completed: 2026-05-08
---

# Quick 9 — Add `df-tools planning sibling-trd-scan` Subcommand Summary

## One-liner

Cross-repo TRD discovery: orchestrator can now query sibling repos for TRDs already drafted/in-flight against an objective number, surfaced as structured JSON the planner agent can include as `<sibling_warnings>` in its prompt to prevent duplicate-work collisions like 018-03 vs 018-FE-01.

## What Shipped

### `lib/org-awareness.cjs` (+154 LOC)

- **New exported function `scanSiblingTrds({ objective_id, cwd, config_paths })`** — iterates configured sibling repos via `_discoverSiblings`, finds `.planning/objectives/<dir>/` whose leading numeric prefix normalizes (leading zeros stripped) to the target, reads each `*-TRD.md` and extracts `{ objective, trd, files_modified, confidence, supersedes, prerequisite_for }` from frontmatter.
- **New helper `_normalizeObjNum(s)`** — strips leading zeros from numeric prefix (`"018"` → `"18"`, `"180"` → `"180"`). Exported for tests.
- All filesystem calls go through `_runFs.X(...)` (Iron Law).
- Reuses `_discoverSiblings` (no duplication of sibling validation/walk logic).
- Reuses `extractFrontmatter` from `lib/frontmatter.cjs`.

### `lib/org-awareness.test.cjs` (+290 LOC)

- **7 new ST1–ST7 tests** covering: no-config short-circuit, no-matching-dir, single-TRD full-shape, multi-TRD alphabetical order, multi-sibling collation, malformed frontmatter detection, leading-zero tolerant matching.
- **EX1 lock-test bumped 21 → 23 entries** to reflect new exports.
- Tests use real-fs scaffolding via `os.tmpdir()` per CLAUDE.md TDD Playbook habit 4 (no LLM-generated fixtures).

### `df-tools.cjs` (+57 LOC)

- **New `case 'planning':` arm** in main switch, adjacent to `'org-awareness':`.
- `sibling-trd-scan <objective-num> [--raw]`:
  - Reads `.planning/config.json` `awareness.sibling_repos` (matches org-awareness-cli pattern).
  - `--raw` emits the structured JSON shape directly.
  - Default emits human-readable summary with TRD paths, files, confidence/supersedes/prereq tags, warnings.
- Unknown subcommands print `Available: sibling-trd-scan`.
- **Usage banner (line 229) updated** — appended `planning` to the comma-separated commands list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Updated EX1 lock-test surface count from 21 to 23**
- **Found during:** Task 2 (GREEN) — running tests after adding `scanSiblingTrds` + `_normalizeObjNum` to `module.exports` caused EX1 to fail (asserted 21 entries; we had 23).
- **Fix:** Updated EX1's expected list in-place to include both new exports.
- **Rationale:** EX1 is a lock-test that's intentionally coupled to the export surface — when the surface legitimately grows, EX1 must follow. This is a 1:1 sync change, not a deviation in spirit.
- **Files modified:** `plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` (within the GREEN commit, alongside the new function).
- **Commit:** `83cd337`.

**2. [Rule 1 — Bug in plan] Added schema-level `files_modified` array check for malformed-detection**
- **Found during:** Task 2 (GREEN) — when implementing per JOB skeleton, ST6 still failed because `extractFrontmatter` (the project's local YAML parser) does NOT throw on `files_modified: [a.go,` — it silently coerces the unterminated array into the string `"[a.go,"`. The JOB skeleton only handled `extractFrontmatter` throwing OR returning empty; neither catches this case.
- **Fix:** Added schema-level check: if `fm.files_modified !== undefined && !Array.isArray(fm.files_modified)`, emit `malformed frontmatter in <path>: files_modified is not an array` warning and skip. This is consistent with TRD-spec.md (files_modified is required and must be an array).
- **Files modified:** `plugins/devflow/devflow/bin/lib/org-awareness.cjs` (within the GREEN commit).
- **Commit:** `83cd337`.
- **Note:** The JOB's `<gotchas>` section assumed `extractFrontmatter` may throw on malformed YAML — but the project's parser is permissive and never throws. Documenting this for future quick tasks: prefer schema-shape checks over relying on parser exceptions when using `lib/frontmatter.cjs`.

### Out-of-scope (deferred)

- **Updating `plan-objective.md` workflow to invoke `df-tools planning sibling-trd-scan` and pass results to the planner agent's prompt as `<sibling_warnings>`.** Flagged in the JOB as File 4 (OPTIONAL); deferred to a follow-on quick to keep this change under 200 LOC of behavior code. This subcommand is now ready for that follow-on to consume.

### Pre-existing test failures (not caused by this change)

The full `npm test` suite has 10 unrelated failures in daemon, watcher, init, handoff, novel-domain test files — flaky time-dependent integration tests with multi-second timeouts. Verified pre-existing by stash-test-then-restore comparison: baseline `main` had 18 failures (mostly the same flaky tests), my changes had 10 — variance within the noise floor of these flaky tests, no new failures introduced. None are in `org-awareness.test.cjs`. Out of scope per Rule scope-boundary; logged here for visibility but no fix attempted.

## Authentication Gates

None. No CLI auth required for this subcommand.

## Decisions Made

- **Inline dispatch (not a separate `lib/planning-cli.cjs` module).** Single subcommand under `planning`; if more land later, refactor.
- **No-config returns explicit warning, not default-glob.** Per JOB spec edge case: when `awareness.sibling_repos` is missing/empty, return the documented `{ ok: true, scanned: 0, matches: [], warnings: ["no sibling repos configured"] }` shape rather than falling through to `_discoverSiblings`'s `~/Source/*` default. This is the correct behavior for orchestrator integration — don't surprise-scan the user's filesystem.
- **Schema-level malformation detection.** `files_modified is not an array` warning + skip — chosen over silently returning `null` so orchestrator gets actionable signal.
- **Real-fs tmpdir scaffolding for ST tests** (not `_setRunFs` mocks). Frontmatter parsing has too many string-content edge cases to mock the readFileSync return values reliably; tmpdir + `_stScaffoldSibling` helper is more robust and matches existing real-fs patterns in `org-awareness.test.cjs` (e.g., D6/D7).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — write 7 failing tests | `node --test plugins/devflow/devflow/bin/lib/org-awareness.test.cjs \| grep "ST[1-7]"` | 0 (filter exit) | PASS — all 7 ST tests showed ✖ as required (RED) |
| 2: GREEN — implement scanSiblingTrds | `node --test plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` | 0 | PASS — 137 tests / 131 pass / 0 fail / 6 skip; +7 ST + +1 EX1 update |
| 3: Wire CLI subcommand | `node plugins/devflow/devflow/bin/df-tools.cjs planning sibling-trd-scan 18 --raw` | 0 | PASS — JSON emitted with `no sibling repos configured` warning |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` | 1 (7 fails) | FAIL (correct — `oa.scanSiblingTrds is not a function`) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` | 0 | PASS (correct — ST1–ST7 + EX1 all green) |
| REFACTOR | (not needed — implementation was minimal/idiomatic on first pass) | — | — |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| org-awareness tests | `node --test plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` | 0 | PASS — 131/137 pass + 6 skip + 0 fail |
| CLI smoke (empty config) | `node bin/df-tools.cjs planning sibling-trd-scan 18 --raw` | 0 | PASS — returns documented JSON shape |
| CLI smoke (missing arg) | `node bin/df-tools.cjs planning sibling-trd-scan` | 1 | PASS — usage error to stderr |
| CLI smoke (unknown sub) | `node bin/df-tools.cjs planning bogus` | 1 | PASS — `Available: sibling-trd-scan` error |
| CLI smoke (banner) | `node bin/df-tools.cjs \| grep -o planning` | 0 | PASS — `planning` present in commands list |
| Module export check | `node -e "...typeof oa.scanSiblingTrds, oa._normalizeObjNum"` | 0 | PASS — both `function` |

## Post-TRD Verification

- **Auto-fix cycles used:** 2 (EX1 lock-test sync, files_modified schema check) — both Rule 1/3 inline fixes within the GREEN commit, not separate cycles.
- **Must-haves verified:** 5/5 observable_truths from JOB frontmatter (sibling-TRD JSON shape, leading-zero matching, no-config warning, malformed-frontmatter resilience, no regression in scanSiblings/_discoverSiblings).
- **Gate failures:** None in scope.
- **Success criteria checklist:**
  1. ✅ `scanSiblingTrds` exported, reuses `_discoverSiblings` + `_runFs`
  2. ✅ All 7 ST tests pass; EX1 updated; 0 regressions in org-awareness
  3. ✅ `df-tools planning sibling-trd-scan` works in `--raw` and human modes
  4. ✅ Leading-zero tolerant (ST7 confirms)
  5. ✅ Malformed frontmatter handled (ST6 confirms)
  6. ✅ Usage banner mentions `planning`
  7. ✅ 3 atomic commits in expected order with expected prefixes
  8. ✅ LOC delta ~501 LOC across 3 files (target was <200 behavior LOC; the bulk is test scaffolding for the 7 ST cases — behavior-code-only is ~140 LOC across `scanSiblingTrds` + `_normalizeObjNum` + CLI arm)

## Self-Check: PASSED

**Files verified to exist:**
- `/Users/markemerson/Source/devflow-claude/plugins/devflow/devflow/bin/lib/org-awareness.cjs` — FOUND (modified)
- `/Users/markemerson/Source/devflow-claude/plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` — FOUND (modified)
- `/Users/markemerson/Source/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs` — FOUND (modified)
- `/Users/markemerson/Source/devflow-claude/.planning/quick/9-add-planning-sibling-trd-scan-subcommand/9-SUMMARY.md` — FOUND (this file)

**Commits verified:**
- `0f55514` — FOUND
- `83cd337` — FOUND
- `e31d6f3` — FOUND
