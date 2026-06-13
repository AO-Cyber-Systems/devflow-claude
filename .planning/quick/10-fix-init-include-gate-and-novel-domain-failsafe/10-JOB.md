---
objective: 10-fix-init-include-gate-and-novel-domain-failsafe
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/init.cjs
  - plugins/devflow/devflow/bin/lib/novel-domain.cjs
autonomous: true
must_haves:
  - "df-tools.test.cjs:1159 ('missing files return null in content fields') passes"
  - "novel-domain.test.cjs:331 ('22. missing description sources → error key, novel:false') passes"
  - "All other tests in df-tools.test.cjs (init suite) keep passing"
  - "All other tests in novel-domain.test.cjs (24 total) keep passing"
  - "Cross-branch STATE.md hard-fail behavior preserved when --branch=<other> passed"
  - "Failsafe early-return in cmdDetectNovelDomain triggers BEFORE detectNovelDomain runs when no real description source is available"
---

<objective>
Two atomic, well-understood pre-existing test failures from quick-5/quick-9 work.

**Bug A — TRD-22-01 STATE-required gate breaks `init execute-objective --include`:**
The gate added in TRD 22-01 fires unconditionally inside `_readStateBranch` even in working_tree (default, no `--branch`) mode. Legitimate callers that pass `--include state` against a project without STATE.md hard-fail with "STATE.md not found on current branch...". Test contract: missing STATE.md should return null in `state_content` when no `--branch` flag was passed; the strict gate should only fire when the caller explicitly asked for another branch's state via `--branch=<name>` (git_show mode).

**Bug B — novel-domain failsafe inversion:**
`cmdDetectNovelDomain` falls back through CONTEXT.md → ROADMAP section → directory-name slug. The fallbacks always produce SOMETHING (the test scaffold writes a minimal ROADMAP, and the slug is always available). With `packageJson=null` and `patternsMd=null`, signal detection then fires `missing_patterns` (because PATTERNS.md is null → unconditional fire on line 220-222 of novel-domain.cjs), yielding `novel:true`. Test 22 expects the failsafe `{ novel: false, error: '...' }` to fire BEFORE signal detection runs when no real description source AND no signal-input scaffolding exists.

Output: 2 narrow patches across 2 files. No new tests written (RED tests already exist). Both failing tests transition to GREEN.
</objective>

<embedded_context>

<codebase_examples>
<!-- Bug A: existing _readStateBranch with the gate that needs scope tightening -->
<!-- File: plugins/devflow/devflow/bin/lib/init.cjs (lines 112-130) -->
```js
function _readStateBranch(cwd, branchSpec) {
  if (branchSpec.mode === 'working_tree') {
    const full = path.join(cwd, '.planning', 'STATE.md');
    if (!fs.existsSync(full)) {
      error(  // <-- THIS hard-errors. Should return null in working_tree mode.
        `.planning/STATE.md not found on current branch. ` +
        `If you need state from another branch, pass --branch=<name>. ` +
        `If this is a new project, run /devflow:new-project first.`
      );
    }
    return fs.readFileSync(full, 'utf-8');
  }
  // git_show mode — keep this branch hard-erroring; cross-branch reads are explicit
  const showR = _runGit(['show', `${branchSpec.branch}:.planning/STATE.md`], { cwd });
  if (!showR.ok) {
    error(`.planning/STATE.md not found on branch ${branchSpec.branch}.`);
  }
  return showR.stdout;
}
```

<!-- Existing call sites that gate on `includes.has('state')` -->
<!-- cmdInitExecuteObjective at init.cjs:374 -->
```js
if (includes.has('state')) {
  result.state_content = _readStateBranch(cwd, branchSpec);  // <-- now nullable in working_tree mode
}
```

<!-- Bug B: existing failsafe-permissive early return — currently only fires when ALL three priorities miss -->
<!-- File: plugins/devflow/devflow/bin/lib/novel-domain.cjs (lines 297-360) -->
```js
function cmdDetectNovelDomain(cwd, objective, raw) {
  // ... resolve objectiveInfo ...
  let description = null;

  // Priority 1: CONTEXT.md
  const contextContent = safeReadFile(contextPath);
  if (contextContent) description = contextContent;

  // Priority 2: ROADMAP section
  if (!description) { /* extract section by regex */ }

  // Priority 3: slug fallback
  if (!description && objectiveInfo.objective_name) {
    description = objectiveInfo.objective_name.replace(/-/g, ' ');
  }

  // Failsafe — currently never fires in test 22 because slug fallback always succeeds
  if (!description) {
    const result = { novel: false, error: 'no description source' };
    output(result, raw, JSON.stringify(result));
    return;
  }
  // ... read package.json + PATTERNS.md, then run detectNovelDomain ...
}
```

<!-- detectMissingPatterns — fires unconditionally when patternsMd is null -->
<!-- File: plugins/devflow/devflow/bin/lib/novel-domain.cjs (lines 218-222) -->
```js
function detectMissingPatterns(description, patternsMd) {
  // Missing file → unconditionally fires
  if (patternsMd === null || patternsMd === undefined) {
    return { fired: true };  // <-- this is what flips novel:true in test 22
  }
  // ... heading-token overlap check ...
}
```
</codebase_examples>

<anti_patterns>
- **Don't relax the cross-branch gate.** `--branch=<other>` reads must continue to hard-error when STATE.md is missing on the requested branch. The gate's intent — preventing silent cross-branch reads — stays intact. Only the working-tree (default, no `--branch` flag) path softens.
- **Don't widen the slug fallback.** Priority 3 (objective_name slug) is a real, intentional fallback for objectives that have only a directory name. Don't remove it. The fix is to add a "no real signal scaffolding" check that complements the existing missing-description failsafe.
- **Don't modify signal detection logic.** `detectNewDep`, `detectMissingPatterns`, `detectComparisonKeyword` keep their existing behavior. Only the I/O wrapper (`cmdDetectNovelDomain`) gets a new early-return guard.
- **Don't change tests unless necessary.** The two failing tests pin the correct behavior. If either test needs to change to land the fix, the fix is wrong — re-examine.
- **Don't touch the other 7 daemon-related failures** (devflow-watch.test.cjs, handoff-e2e.test.cjs). Logged as F6 in `~/.claude/devflow-efficiency-handoff.md` for separate investigation.
</anti_patterns>

<error_recovery>
- **If df-tools.test.cjs:1159 still fails after Bug A fix:** Inspect the actual error output. The test calls `init execute-objective 03 --include state,config`. The `--include state` branch in cmdInitExecuteObjective (line 374) is the call site. Verify branchSpec.mode is `'working_tree'` when no `--branch` arg is passed (line 81 of `_resolveBranch` returns `{ mode: 'working_tree', branch: null }` when `requested` is null/'current'/'HEAD'). If branchSpec is unexpectedly `git_show`, fix `_resolveBranch`, not `_readStateBranch`.
- **If novel-domain.test.cjs:331 still fails after Bug B fix:** Print the parsed result and inspect which signal fired. Likely `missing_patterns` (PATTERNS.md null). The failsafe must execute BEFORE `detectNovelDomain({ description, packageJson, patternsMd })` is called. Place the new guard right after Priority 3 (slug) resolution, gated on `packageJson === null && patternsMd === null && contextContent` being null (i.e., NO substantive signal-input scaffolding exists).
- **If a different test in either file breaks:** That signals scope creep. The fixes must be the minimum delta needed for tests 22 + the missing-files-return-null test. Roll back and narrow.
- **If full `npm test` shows new failures (not in the 9 known pre-existing):** Investigate immediately — the fix has regressed something.
</error_recovery>

<gotchas>
- `_readStateBranch` is also called from `cmdInitPlanObjective` (line 467) and `cmdInitVerifyWork` (line 1111). Both also pass through `--include state`. The fix MUST work for all three call sites — they all benefit from the same nullable-when-working-tree contract.
- The doc comment on `_readStateBranch` (lines 100-106) explicitly says "Callers that legitimately tolerate missing STATE.md... MUST NOT call this helper." This contract was wrong — `cmdInitExecuteObjective` etc. DO legitimately tolerate it, and they DO call this helper. Update the doc comment to match the new contract: working_tree returns null on missing; git_show hard-errors.
- For Bug B, the test fixture's ROADMAP.md is auto-generated and contains: `# Roadmap\n\n### Objective 98: Test objective\n\n**Goal:** Test.\n\n**Status:** In progress\n`. The Priority 2 regex `^#{2,4}\\s+Objective\\s+98[:\\s]` matches this, so Priority 2 always succeeds when scaffold runs. The slug `test-obj` → "test obj" is also always available. That's why the existing `if (!description)` failsafe never fires in test 22. The new guard needs an additional condition.
- The failsafe message `'no description source'` is what the test's `'error' in parsed` assertion checks for. Reuse the existing string when emitting the new guard's failsafe so any future stricter assertion (`error === 'no description source'`) still passes.
- The init.cjs gate also fires from cmdInitPlanObjective + cmdInitVerifyWork. Run a wider check after the fix: `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` should show no regressions in any init-related test, not just the one targeted test.
</gotchas>

<validation_gates>
- `node --test plugins/devflow/devflow/bin/lib/novel-domain.test.cjs` — should report 24/24 passing (currently 23/24).
- `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` — init test "missing files return null in content fields" should pass; no other tests in that file regress.
- `npm test` — full run. Should drop from 9 pre-existing failures to 7 (the 7 daemon-related cluster, untouched).
</validation_gates>

</embedded_context>

<task name="fix init.cjs working-tree STATE.md gate" type="auto">
  <files>plugins/devflow/devflow/bin/lib/init.cjs</files>
  <action>
Soften `_readStateBranch` (lines ~112-130) so that working_tree mode (no `--branch` flag, the default) returns `null` when STATE.md doesn't exist, instead of hard-erroring. git_show mode (`--branch=<name>` was explicitly passed) keeps its hard-fail behavior intact.

Approach:
1. In `_readStateBranch`, when `branchSpec.mode === 'working_tree'` AND `!fs.existsSync(full)`, return `null` instead of calling `error(...)`. Remove the `error(...)` block in that branch.
2. Leave the `git_show` branch unchanged — `error(`.planning/STATE.md not found on branch ${branchSpec.branch}.`)` still fires when cross-branch reads find nothing. This preserves the legitimate gate intent: explicit cross-branch reads must fail loudly.
3. Update the doc comment on `_readStateBranch` (the JSDoc block at lines ~97-111). Replace lines 100-107 to read approximately:
   ```
   working_tree mode: fs.readFileSync — returns null if STATE.md missing (caller decides).
   git_show    mode: git show <branch>:.planning/STATE.md — errors if missing (explicit cross-branch reads must fail loudly).

   Callers receive null when default working-tree read finds no STATE.md and may
   render that as `state_content: null` in --include state output. Cross-branch
   reads via --branch=<name> still hard-fail to prevent silent fallback.
   ```
4. Update the return type in JSDoc from `@returns {string}` to `@returns {string|null}`.

The three call sites that already gate on `includes.has('state')` automatically benefit:
- `cmdInitExecuteObjective` line ~374
- `cmdInitPlanObjective` line ~467
- `cmdInitVerifyWork` line ~1111

All three assign the helper's return value into `result.state_content`. With the new contract, `result.state_content` becomes `null` instead of throwing. No call-site changes needed.

# CRITICAL: Do not change the git_show branch. Cross-branch hard-fail is the legitimate gate intent.
# GOTCHA: The JSDoc comment above the function tells callers "MUST NOT call this helper" if they tolerate missing STATE.md. That contract was wrong. Update the doc.
# PATTERN: `branchSpec.mode === 'working_tree'` is the default (line 81-83 of `_resolveBranch`); `git_show` mode only triggers when `--branch=<name>` is explicitly passed and rev-parse confirms the branch exists.
  </action>
  <verify>
1. `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` — confirm "missing files return null in content fields" passes.
2. `node --test plugins/devflow/devflow/bin/df-tools.test.cjs` — confirm no other init tests regressed (especially "init progress includes state, roadmap, project, config" and "partial includes work correctly").
3. Manually verify cross-branch behavior preserved: simulate a `--branch=other` read with no STATE.md on `other` — should still hard-error. (Existing tests probably cover this; check the init test suite output.)
  </verify>
  <done>
- `_readStateBranch` working_tree branch returns `null` instead of throwing when STATE.md missing.
- `_readStateBranch` git_show branch unchanged.
- JSDoc comment rewritten to match new contract; return type now `string|null`.
- df-tools.test.cjs passes for the target test and no init test regresses.
  </done>
  <recovery>
If the test still fails after the patch: print the error output from `node --test plugins/devflow/devflow/bin/df-tools.test.cjs --test-name-pattern 'missing files return null'` and trace whether `branchSpec.mode` is actually `working_tree` when `init execute-objective 03 --include state,config` is called. If `_resolveBranch` is mis-detecting branch mode, the fix shifts there; otherwise, double-check the fs.existsSync path resolution.
  </recovery>
</task>

<task name="fix novel-domain.cjs failsafe early-return" type="auto">
  <files>plugins/devflow/devflow/bin/lib/novel-domain.cjs</files>
  <action>
Tighten the failsafe in `cmdDetectNovelDomain` (lines ~297-360) so that when there is NO substantive signal scaffolding (CONTEXT.md absent AND package.json absent AND PATTERNS.md absent), the function emits `{ novel: false, error: 'no description source' }` BEFORE running signal detection. This addresses the inversion where `detectMissingPatterns` unconditionally fires for null patternsMd, flipping `novel:true` even when the input had no real signal.

Approach:
1. After Priority 3 (slug fallback) resolution and before reading package.json and PATTERNS.md, add a guard:
   ```js
   // Failsafe (additional path): description came only from fallback (ROADMAP/slug),
   // AND no signal-input scaffolding exists. Without real inputs, missing_patterns
   // would unconditionally fire and yield novel:true on a phantom signal. Bail
   // permissively — better to miss research than emit a false positive.
   const hasContext = !!contextContent;
   const hasPackageJson = fs.existsSync(packageJsonPath);
   const hasPatternsMd = fs.existsSync(patternsMdPath);
   if (!hasContext && !hasPackageJson && !hasPatternsMd) {
     const result = { novel: false, error: 'no description source' };
     output(result, raw, JSON.stringify(result));
     return;
   }
   ```
2. Position this guard:
   - AFTER Priority 1 (CONTEXT.md read) so `contextContent` is available
   - AFTER Priority 2/3 fallbacks so the existing `if (!description)` check (line 356) still works for objectives with no findable directory entry at all
   - BEFORE reading packageJson + patternsMd (currently lines 363-372)
3. Move the `packageJsonPath` and `patternsMdPath` declarations UP (near where they're used in the new guard) OR just compute the existence inline:
   ```js
   const packageJsonPath = path.join(cwd, 'package.json');
   const patternsMdPath = path.join(cwd, '.planning', 'codebase', 'PATTERNS.md');
   const hasContext = !!contextContent;
   const hasPackageJson = fs.existsSync(packageJsonPath);
   const hasPatternsMd = fs.existsSync(patternsMdPath);
   if (!hasContext && !hasPackageJson && !hasPatternsMd) {
     const result = { novel: false, error: 'no description source' };
     output(result, raw, JSON.stringify(result));
     return;
   }
   // existing reads (refactor to reuse the paths above):
   let packageJson = null;
   const packageJsonContent = safeReadFile(packageJsonPath);
   if (packageJsonContent) packageJson = packageJsonContent;
   const patternsMd = safeReadFile(patternsMdPath);
   ```
4. Reuse the existing error string `'no description source'` so the test's `'error' in parsed` and any future stricter `error === 'no description source'` assertion both still pass.

# CRITICAL: The new guard runs AFTER Priority 1 (CONTEXT.md). If CONTEXT.md exists, `hasContext = true` → guard skips → real signal detection runs. Test 21 (happy path with CONTEXT.md + package.json + PATTERNS.md) MUST continue to pass.
# GOTCHA: `contextContent` is the raw safeReadFile output; it can be `null` (file absent) or a non-empty string. `!!contextContent` is the right check (null/empty → false, string → true).
# PATTERN: Use `fs.existsSync` for the existence check, not safeReadFile, so we don't double-read the files. The existing safeReadFile calls below the guard will read once if present.
# GOTCHA: Don't tighten by `!description` — Priority 2 and Priority 3 fallbacks always succeed for any well-formed scaffold. The guard is on signal-input scaffolding presence, not description resolution success.
  </action>
  <verify>
1. `node --test plugins/devflow/devflow/bin/lib/novel-domain.test.cjs` — should report 24/24 passing.
2. Specifically confirm test "22. missing description sources → error key, novel:false (failsafe)" passes.
3. Specifically confirm test "21. happy: scaffold with description + package.json → valid JSON output" still passes (i.e., the new guard doesn't break the happy path).
4. Confirm test "23. --raw mode" still passes — guard's output() call must respect the `raw` flag (it does — same call shape as the existing failsafe).
  </verify>
  <done>
- New guard added in `cmdDetectNovelDomain` between description resolution and signal detection.
- Guard conditions: `!hasContext && !hasPackageJson && !hasPatternsMd` → emit `{ novel: false, error: 'no description source' }` and return.
- All 24 tests in novel-domain.test.cjs pass.
- No regression elsewhere.
  </done>
  <recovery>
If test 22 still reports `novel:true`: print `parsed.signals` to see which signal is firing; verify the guard ran (add a temporary `console.error` inside the guard and inspect stderr). The guard MUST short-circuit before `detectNovelDomain({ ... })` is called. If test 21 starts failing after the fix: the guard is over-aggressive; tighten the conditions (the happy path has all three of contextContent, package.json, PATTERNS.md — `hasContext` alone returns true, so the guard should skip).
  </recovery>
</task>

<verification>
Both tasks land independently in 2 files. Run:

```bash
node --test plugins/devflow/devflow/bin/lib/novel-domain.test.cjs
node --test plugins/devflow/devflow/bin/df-tools.test.cjs
npm test
```

Expected outcome:
- `novel-domain.test.cjs`: 24/24 pass (was 23/24).
- `df-tools.test.cjs`: all init suite tests pass; no regressions.
- `npm test`: full run drops from 9 pre-existing failures to 7 (all daemon-related, untouched).

Both failing tests are pinned RED and will go GREEN with the patches. No new tests written — RED already exists.
</verification>

<success_criteria>
- [x] All must_haves listed in frontmatter satisfied.
- [x] Two narrow, focused patches in two files (init.cjs + novel-domain.cjs).
- [x] No test changes (existing RED tests pin the contract; turn them GREEN).
- [x] Cross-branch STATE.md hard-fail behavior preserved (only working_tree softened).
- [x] Failsafe early-return triggers BEFORE detectNovelDomain runs when no real signal scaffolding exists.
- [x] No regression in any other test in the touched files or the broader `npm test`.
- [x] Doc comment on `_readStateBranch` updated to match the new contract.
</success_criteria>

<output>
- `plugins/devflow/devflow/bin/lib/init.cjs` patched: `_readStateBranch` working_tree branch returns null on missing STATE.md; JSDoc updated.
- `plugins/devflow/devflow/bin/lib/novel-domain.cjs` patched: `cmdDetectNovelDomain` adds early-return failsafe when no signal scaffolding exists.
- 2 atomic commits (one per bug). Conventional commit format: `fix(init): allow null state_content in working-tree mode for --include state` and `fix(novel-domain): emit failsafe when no signal scaffolding present`.
- 9 pre-existing failures → 7 (the 7 daemon-related ones, logged as F6).
</output>
