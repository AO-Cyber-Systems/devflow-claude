---
objective: 10-fix-init-include-gate-and-novel-domain-failsafe
trd: 01
subsystem: planning-cli
tags: [bugfix, init, novel-domain, test-contract-revert]
provides:
  - working-tree-permissive-state-read
  - novel-domain-failsafe-on-no-scaffolding
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/init.cjs
    - plugins/devflow/devflow/bin/lib/novel-domain.cjs
    - plugins/devflow/devflow/bin/lib/init.test.cjs
decisions:
  - "Working-tree STATE.md reads return null on missing; cross-branch reads still hard-fail"
  - "novel-domain.cjs guards against phantom missing_patterns when no signal scaffolding exists"
  - "Test 22A7 updated as part of contract reversal — TRD 22-01 pinned old contract; quick-10 reverses it"
metrics:
  duration: "~10m"
  completed: 2026-05-08
---

# Quick Task 10: Fix init `--include` gate and novel-domain failsafe — Summary

Two atomic, well-understood pre-existing test failures from quick-5 / quick-9 work fixed. Two narrow patches in two production files; one test update to match the reversed contract. All three target tests now GREEN.

## One-liner

`_readStateBranch` returns null in working_tree mode (only `--branch=<name>` hard-fails); `cmdDetectNovelDomain` bails permissively when neither CONTEXT.md, package.json, nor PATTERNS.md exist (preventing phantom `missing_patterns` from flipping `novel:true` on a slug-only fallback).

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Fix `init.cjs` working-tree STATE.md gate | b5fbf78 |
| 2 | Fix `novel-domain.cjs` failsafe early-return | 5f605e5 |
| 3 | (deviation) Update `init.test.cjs:22A7` to match reverted contract | ed2b376 |

## Bug A — Init `--include state` working-tree gate

**Symptom:** `init execute-objective --include state` against a project without STATE.md hard-failed with "STATE.md not found on current branch...". Test contract: missing STATE.md should return `null` in `state_content` when no `--branch` flag was passed.

**Fix:** `_readStateBranch` (init.cjs:112-128) now returns `null` instead of calling `error()` when `branchSpec.mode === 'working_tree'` and STATE.md is missing. The `git_show` mode (explicit `--branch=<name>`) keeps its hard-fail behavior — explicit cross-branch reads must still fail loudly.

**JSDoc updated:**
- Return type: `string` → `string|null`
- Contract corrected — prior comment said callers tolerating missing STATE.md "MUST NOT call this helper", which contradicted three production call sites (cmdInitExecuteObjective, cmdInitPlanObjective, cmdInitVerifyWork) that DID call it with `includes.has('state')` gating.

**Call sites unchanged:** All three call sites already assigned the helper's return into `result.state_content`. With the new contract, `result.state_content` becomes `null` instead of throwing. No call-site changes needed.

## Bug B — Novel-domain failsafe inversion

**Symptom:** `cmdDetectNovelDomain` resolved description via Priority 1 (CONTEXT.md) → Priority 2 (ROADMAP section) → Priority 3 (slug fallback). For a scaffold with no real CONTEXT.md / package.json / PATTERNS.md, Priority 2 or 3 always succeeded (test scaffolds always write a minimal ROADMAP, slug is always available), so the existing `if (!description)` failsafe never fired. Then `detectMissingPatterns(description, null)` unconditionally fired (line 220-222: `patternsMd === null → fired:true`), yielding `novel:true` on phantom signal.

**Fix:** Added an additional failsafe in `cmdDetectNovelDomain` (novel-domain.cjs:362-378) that runs AFTER description resolution but BEFORE signal detection. New guard:

```js
const hasContext = !!contextContent;
const hasPackageJson = fs.existsSync(packageJsonPath);
const hasPatternsMd = fs.existsSync(patternsMdPath);
if (!hasContext && !hasPackageJson && !hasPatternsMd) {
  const result = { novel: false, error: 'no description source' };
  output(result, raw, JSON.stringify(result));
  return;
}
```

**Critical positioning:**
- AFTER Priority 1 (CONTEXT.md read) so `contextContent` is available
- AFTER Priority 2/3 fallbacks so the existing description-null failsafe still works for objectives with no findable directory entry
- BEFORE reading packageJson + patternsMd

**Happy path preserved:** Test 21 (CONTEXT.md + package.json + PATTERNS.md present) → `hasContext = true` → guard skips → real signal detection runs.

**Error string reused:** `'no description source'` — same as the existing `if (!description)` failsafe, so any future stricter `error === 'no description source'` assertion stays compatible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Updated `init.test.cjs:22A7` to match reverted contract**
- **Found during:** Task 1 verification (full `npm test`)
- **Issue:** Test 22A7 explicitly asserted that `_readStateBranch(working_tree, missing_state)` exits with code 1 and emits "STATE.md not found" + "--branch" hint. This pinned the TRD 22-01 contract that quick-10 explicitly reverses (per the job's `<objective>`).
- **Why this is the correct fix, not a regression:**
  - The job's frontmatter must-have list calls out "All other tests in df-tools.test.cjs (init suite) keep passing" — note `df-tools.test.cjs`, NOT `init.test.cjs`.
  - The job's `<objective>` explicitly identifies this gate as the bug: "The gate added in TRD 22-01 fires unconditionally inside `_readStateBranch` even in working_tree (default, no `--branch`) mode. Legitimate callers... hard-fail."
  - 22A7 was the test that pinned the old (now-incorrect) contract; updating it to match the new contract follows from the contract reversal.
  - The cross-branch hard-fail tests (22A8 git_show success / 22A9 git_show fail) are untouched — preserving the must-have "Cross-branch STATE.md hard-fail behavior preserved when --branch=<other> passed."
- **Fix:** Renamed test to "_readStateBranch(cwd, working_tree) missing STATE.md returns null (no hard-fail)" and replaced subprocess-throw assertion with direct `assert.strictEqual(content, null)` against the in-process helper.
- **Files modified:** `plugins/devflow/devflow/bin/lib/init.test.cjs`
- **Commit:** ed2b376

## Authentication Gates

None — fully automated, no human-action checkpoints.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fix init.cjs gate | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS (106/106) |
| 2: Fix novel-domain failsafe | `node --test plugins/devflow/devflow/bin/lib/novel-domain.test.cjs` | 0 | PASS (26/26) |
| 3: Update 22A7 (deviation) | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` | 0 | PASS (34/34) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| novel-domain unit | `node --test plugins/devflow/devflow/bin/lib/novel-domain.test.cjs` | 0 | PASS (26/26 — was 25/26) |
| df-tools full | `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 | PASS (106/106 — was 105/106) |
| init unit | `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` | 0 | PASS (34/34) |
| Full `npm test` | `npm test` | non-zero | 2225 pass / 8 fail / 50 skip |

### Full `npm test` failure breakdown (8 fail = all daemon-related, F6 cluster — flaky)

- 3-4 × `devflow-watch.test.cjs` (foreground daemon, stale PID, multi-project — flaky on `.devflow/devflow-watch.pid` ENOENT)
- 4 × `handoff-e2e.test.cjs` (done record waits, command execution timing — 18s timeouts)

These match the F6 cluster called out in the job's anti-patterns. The cluster oscillates between 7-8 failures across runs depending on daemon timing; pre-fix baseline was 9 (7 daemon + 2 target). Post-fix baseline is 7-8 daemon + 0 target. **Net delta: target fixes both GREEN; F6 cluster unchanged in scope.**

## Post-TRD Verification

- Auto-fix cycles used: 1 (Rule 3 — test 22A7 update)
- Must-haves verified: 6/6
  - [x] `df-tools.test.cjs:1159` ('missing files return null in content fields') passes
  - [x] `novel-domain.test.cjs:331` ('22. missing description sources → error key, novel:false') passes
  - [x] All other tests in `df-tools.test.cjs` (init suite) keep passing — 106/106
  - [x] All other tests in `novel-domain.test.cjs` (24 total) keep passing — 26/26
  - [x] Cross-branch STATE.md hard-fail behavior preserved when `--branch=<other>` passed — 22A8 + 22A9 still pass
  - [x] Failsafe early-return in `cmdDetectNovelDomain` triggers BEFORE `detectNovelDomain` runs when no real description source available
- Gate failures: None new — only F6 daemon cluster (pre-existing, unchanged scope)

## Self-Check: PASSED

- [x] `plugins/devflow/devflow/bin/lib/init.cjs` modified (verified via `git log --oneline plugins/devflow/devflow/bin/lib/init.cjs` shows b5fbf78)
- [x] `plugins/devflow/devflow/bin/lib/novel-domain.cjs` modified (commit 5f605e5)
- [x] `plugins/devflow/devflow/bin/lib/init.test.cjs` modified (commit ed2b376)
- [x] All three commits exist in git history
- [x] Both target tests transition RED → GREEN
- [x] No regression outside the F6 daemon cluster
