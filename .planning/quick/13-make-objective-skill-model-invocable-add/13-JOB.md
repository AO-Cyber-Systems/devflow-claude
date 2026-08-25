---
objective: 13-make-objective-skill-model-invocable-add
job: 13
trd: 13
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/df-tools.test.cjs
  - plugins/devflow/skills/objective/SKILL.md
  - plugins/devflow/devflow/workflows/remove-objective.md
autonomous: true
mode: quick
kind: plugin
work: feature
tdd_posture: strict
test_list_first: required
fixture_strategy: generators
must_haves:
  truths:
    - A model can invoke /devflow:objective (add and remove) without the user typing the slash command
    - Running `df-tools objective remove N` with no --confirm leaves the filesystem, ROADMAP.md and STATE.md byte-identical
    - Running `df-tools objective remove N` with no --confirm prints the complete set of directory and file renames that WOULD happen, and exits 0
    - Running `df-tools objective remove N --confirm` performs exactly the deletion and renames that the dry-run printed
    - An objective with executed SUMMARY.md jobs still refuses removal without --force, exactly as today
    - Removing an objective with executed jobs requires BOTH --force and --confirm
    - The skill help text for `remove` tells the reader it is dry-run by default and names --confirm
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/objective.cjs
      contains: computeRemovalPlan() pure function + --confirm gate in cmdObjectiveRemove
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      contains: --confirm flag parsed and passed to cmdObjectiveRemove; usage line updated
    - path: plugins/devflow/devflow/bin/df-tools.test.cjs
      contains: 4 new tests (a-d) + 3 migrated pre-existing remove tests
    - path: plugins/devflow/skills/objective/SKILL.md
      contains: no disable-model-invocation key; remove usage documents dry-run + --confirm
    - path: plugins/devflow/devflow/workflows/remove-objective.md
      contains: df-tools invocation examples carry --confirm
  key_links:
    - cmdObjectiveRemove MUST execute the plan object returned by computeRemovalPlan, not recompute the renames independently — otherwise the printed dry-run and the actual mutation can diverge, which is the exact failure mode this rail exists to prevent
    - computeRemovalPlan MUST be called BEFORE fs.rmSync of the target directory
    - The executed-jobs rail MUST be evaluated BEFORE the --confirm dry-run short-circuit, or the pre-existing "rejects removal ... unless --force" test flips from exit 1 to exit 0
    - The human-readable plan MUST go to stderr; stdout MUST stay pure JSON, because every remove test does JSON.parse(result.output) where output is stdout
---

<objective>
Two halves that must ship together:

1. Remove `disable-model-invocation: true` from `plugins/devflow/skills/objective/SKILL.md` so a model can reach `/devflow:objective add|remove` without the user typing it.
2. Add a `--confirm` rail to `df-tools objective remove` so the newly model-reachable destructive path is dry-run by default.

**Why the flag can go (settled — do not re-litigate).** `disable-model-invocation: true` entered SKILL.md on 2026-05-05 in commit `1fff3db`, the v1.2 three-skill consolidation. It was NOT a response to the 2026-06-12 incident that renamed ~144 files — that incident happened five weeks *after* the flag landed. Both hazards from that incident are already fixed in `objective.cjs`: the slug ENAMETOOLONG at lines 281-284 (slug capped at 60 chars, trailing hyphens stripped) and the flag-like-description bug at line 269 (`--help` rejected before any file is touched). `objective add` is safe today.

**Why the rail is mandatory.** `objective remove` is still genuinely dangerous, and un-gating the skill makes it model-reachable for the first time. Today it:
- hard-deletes with `fs.rmSync(..., { recursive: true, force: true })` (objective.cjs:399),
- then cascade-renumbers EVERY objective above N — directories, every TRD/SUMMARY/JOB file inside them, and ROADMAP.md — unconditionally,
- with no dry-run, no preview, no confirmation. Its only rail (objective.cjs:388-393) refuses when SUMMARY.md files exist, and `--force` bypasses that.

The cascade renumber is the part that renamed 144 files. It gets its own independent gate.

**TDD posture (strict, from defaults-table cell `(plugin, feature)` + user CLAUDE.md TDD playbook):**
- Test list first (see `## Test list` below), then one RED test at a time.
- Commit rhythm per task: `test:` (RED) → `feat:` (GREEN) → optional `refactor:`. Matches the project's established pattern (see STATE.md, commits 1740dfc/fb9d2c3).
- Hand-built fixtures only. The existing `createTempProject()` helper in df-tools.test.cjs is the fixture builder — extend it inline, do not generate sample data.
- No property-based testing libraries. No .feature files.

**Out of scope (DO NOT touch):**
- The other 7 skills carrying `disable-model-invocation: true` (cleanup, flow, list-objective-assumptions, set-profile, settings, workstreams, milestone). Auditing those is deliberately excluded.
- `cmdObjectiveAdd`, `cmdObjectiveInsert`, `cmdObjectiveComplete`.
- The decimal-objective deprecation (TRD 12-06). Decimal removal keeps its current no-sibling-renumber behavior.
- The `--force` executed-jobs rail's semantics. It keeps working exactly as today.
- Pre-existing dirty state in `.planning/` and the 8 known pre-existing test failures.

</objective>

<embedded_context>

<codebase_examples>

**Current gate + destructive block — `plugins/devflow/devflow/bin/lib/objective.cjs:362-402`:**
```js
function cmdObjectiveRemove(cwd, targetObjective, options, raw) {
  if (!targetObjective) {
    error('objective number required for objective remove');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const force = options.force || false;
  // ...
  const normalized = normalizeObjectiveName(targetObjective);
  const isDecimal = targetObjective.includes('.');

  let targetDir = null;
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    targetDir = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);
  } catch {}

  // Check for executed work (SUMMARY.md files)
  if (targetDir && !force) {
    const targetPath = path.join(objectivesDir, targetDir);
    const files = fs.readdirSync(targetPath);
    const summaries = files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
    if (summaries.length > 0) {
      error(`Objective ${targetObjective} has ${summaries.length} executed job(s). Use --force to remove anyway.`);
    }
  }

  // Delete target directory   ← THE POINT OF NO RETURN
  if (targetDir) {
    fs.rmSync(path.join(objectivesDir, targetDir), { recursive: true, force: true });
  }
```

**The rename collection loop — objective.cjs:408-460 (extract this, verbatim logic, into the pure planner):**
```js
    const removedInt = parseInt(normalized, 10);
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    const toRename = [];
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+)(?:\.(\d+))?-(.+)$/);
      if (!dm) continue;
      const dirInt = parseInt(dm[1], 10);
      if (dirInt > removedInt) {                    // ← NOTE: strictly greater
        toRename.push({ dir, oldInt: dirInt, decimal: dm[2] ? parseInt(dm[2], 10) : null, slug: dm[3] });
      }
    }

    // Sort descending to avoid conflicts
    toRename.sort((a, b) => {
      if (a.oldInt !== b.oldInt) return b.oldInt - a.oldInt;
      return (b.decimal || 0) - (a.decimal || 0);
    });

    for (const item of toRename) {
      const newInt = item.oldInt - 1;
      const newPadded = String(newInt).padStart(2, '0');
      const oldPadded = String(item.oldInt).padStart(2, '0');
      const decimalSuffix = item.decimal !== null ? `.${item.decimal}` : '';
      const oldPrefix = `${oldPadded}${decimalSuffix}`;
      const newPrefix = `${newPadded}${decimalSuffix}`;
      const newDirName = `${newPrefix}-${item.slug}`;
      fs.renameSync(path.join(objectivesDir, item.dir), path.join(objectivesDir, newDirName));
      renamedDirs.push({ from: item.dir, to: newDirName });

      const dirFiles = fs.readdirSync(path.join(objectivesDir, newDirName));  // ← reads AFTER dir rename
      for (const f of dirFiles) {
        if (f.startsWith(oldPrefix)) {
          const newFileName = newPrefix + f.slice(oldPrefix.length);
          fs.renameSync(/* ... */);
          renamedFiles.push({ from: f, to: newFileName });
        }
      }
    }
```

**CLI dispatch — `plugins/devflow/devflow/bin/df-tools.cjs:731-733`:**
```js
      } else if (subcommand === 'remove') {
        const forceFlag = args.includes('--force');
        cmdObjectiveRemove(cwd, args[2], { force: forceFlag }, raw);
```

**Output helpers — `plugins/devflow/devflow/bin/lib/helpers.cjs:16-38`:**
```js
function output(result, raw, rawValue) { /* writes JSON to STDOUT */ process.exit(0); }
function error(message) { process.stderr.write('Error: ' + message + '\n'); process.exit(1); }
```

**Test harness — `df-tools.test.cjs:14-29` (`output` is stdout, `error` is stderr):**
```js
function runGsdTools(args, cwd = process.cwd()) {
  try {
    const result = execSync(`node "${TOOLS_PATH}" ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] });
    return { success: true, output: result.trim() };
  } catch (err) {
    return { success: false, output: err.stdout?.toString().trim() || '', error: err.stderr?.toString().trim() || err.message };
  }
}
```

</codebase_examples>

<gotchas>

**G1 — Three pre-existing tests WILL go red unless migrated in the same commit.** These call remove with no `--confirm` and assert mutation happened:
- `df-tools.test.cjs:1558` — `objective remove 2` → add `--confirm`
- `df-tools.test.cjs:1625` — `objective remove 6.2` → add `--confirm`
- `df-tools.test.cjs:1652` — `objective remove 2` → add `--confirm`
- `df-tools.test.cjs:1607` — `objective remove 1 --force` → becomes `--force --confirm`

`df-tools.test.cjs:1602` (`objective remove 1`, no flags, asserts exit≠0) stays **byte-identical** — it is the regression bar for gate ordering (see G2).

**G2 — Gate order is load-bearing.** Evaluate the executed-jobs rail BEFORE the `--confirm` short-circuit. If the dry-run returns first, `objective remove 1` on an objective with a SUMMARY.md exits 0 instead of 1 and the untouched test at line 1602 breaks. Correct order:
1. arg validation → 2. ROADMAP exists → 3. resolve targetDir → 4. **executed-jobs rail (exit 1)** → 5. compute plan → 6. **`--confirm` gate (exit 0, no mutation)** → 7. execute → 8. output.

**G3 — Computing the plan before deletion is safe, and this is why.** The rename filter is `dirInt > removedInt` (strictly greater). The target directory sits at `=== removedInt`, so it can never appear in the rename set. Deleting it first or last does not change the plan. Do not "fix" this by deleting first.

**G4 — File-rename planning reads the OLD directory name.** The current code reads `readdirSync(newDirName)` *after* renaming the directory. The planner runs before any rename, so it must read the OLD `item.dir`. Directory contents are identical either way; only the path used to reach them differs.

**G5 — stdout must stay pure JSON.** Every remove test does `JSON.parse(result.output)` on stdout. Put the human-readable plan on **stderr** via `process.stderr.write`, and carry the machine-readable plan inside the JSON result on stdout. Do not interleave.

**G6 — Decimal removal has an empty rename set.** `isDecimal === true` skips renumbering entirely (TRD 12-06 dropped sibling renumber). The plan is then `{ target_directory: '06.2-fix-b', renamed_directories: [], renamed_files: [] }`. The `--confirm` gate still applies — it is still deleting a directory.

**G7 — `--force` and `--confirm` are orthogonal.** `--force` overrides the executed-jobs refusal. `--confirm` authorizes the cascade. Neither implies the other. Do not collapse them into one flag or make one default the other.

**G8 — `output()` and `error()` both call `process.exit`.** They never return. Structure the function as a straight-line sequence of guards, not as branches that fall through.

</gotchas>

<anti_patterns>

- **Do NOT recompute the renames at execution time.** Execution consumes the plan object. A second independent computation is exactly how printed-plan and actual-mutation diverge.
- **Do NOT make `--confirm` default to true when stdin is a TTY** or any other implicit-consent heuristic. Explicit flag only.
- **Do NOT touch the 7 other skills** carrying `disable-model-invocation: true`.
- **Do NOT add an interactive readline prompt.** df-tools is non-interactive by design and is invoked from hooks and subagents where a TTY prompt would hang. The flag IS the confirmation.
- **Do NOT change the shape of existing JSON result keys** (`removed`, `directory_deleted`, `renamed_directories`, `renamed_files`, `roadmap_updated`, `state_updated`). Add new keys alongside them.
- **Do NOT introduce a test framework.** Node native `node --test`, `describe`/`test`/`assert`, `.test.cjs` suffix.

</anti_patterns>

</embedded_context>

## Test list

Behavior cases to write before implementation, outermost (CLI contract) inward:

1. **(a)** `objective remove 2` with no `--confirm` on a 3-objective fixture → exits 0; `02-auth/` still exists; `03-features/` still exists and is NOT renumbered; ROADMAP.md byte-identical to before; STATE.md byte-identical to before.
2. **(a')** Same invocation → stdout JSON has `dry_run: true`, `mutated: false`, and `renamed_directories` listing `{from: '03-features', to: '02-features'}`.
3. **(b)** `objective remove 2 --confirm` → exits 0; `02-auth/` gone; `03-features/` renamed to `02-features/`; inner `03-01-JOB.md` → `02-01-JOB.md`; ROADMAP shows `Objective 2: Features`; stdout JSON has `dry_run: false`, `mutated: true`.
4. **(b')** The `renamed_directories` printed by the (a) dry-run equals the `renamed_directories` returned by the (b) execution on the same fixture — plan/action parity.
5. **(c)** Objective with a `01-01-SUMMARY.md`, invoked as `objective remove 1` (no flags) → exits non-zero, stderr contains `executed job`. (Pre-existing test, unchanged — the gate-ordering regression bar.)
6. **(c')** Same fixture, `objective remove 1 --confirm` (no `--force`) → still exits non-zero with `executed job`. `--confirm` does not bypass the summaries rail.
7. **(c'')** Same fixture, `objective remove 1 --force` (no `--confirm`) → exits 0, directory still present, `dry_run: true`. `--force` does not authorize the cascade.
8. **(d)** Same fixture, `objective remove 1 --force --confirm` → exits 0, directory deleted, `mutated: true`.
9. **Decimal** `objective remove 6.2 --confirm` → `06.2-fix-b/` deleted, `06.3-fix-c/` unchanged; plan showed empty `renamed_directories`.
10. **Decimal dry-run** `objective remove 6.2` (no `--confirm`) → `06.2-fix-b/` still present.

<tasks>

<task type="auto" tdd="true">
<name>Add --confirm dry-run rail to objective remove</name>

<files>
plugins/devflow/devflow/bin/lib/objective.cjs
plugins/devflow/devflow/bin/df-tools.cjs
plugins/devflow/devflow/bin/df-tools.test.cjs
</files>

<action>
Test-first. Write the RED tests, commit `test:`, then implement to green and commit `feat:`.

**Step 1 — RED.** In `df-tools.test.cjs`, inside the existing `describe('objective remove command', ...)` block (starts line 1517), add the cases from `## Test list` above: 1, 2, 3, 4, 6, 7, 8, 10. Reuse the existing `createTempProject()` fixture helper and the same inline ROADMAP/directory setup style already used in that describe block — hand-built, no generated data.

For the byte-identical assertions in case 1, snapshot with `fs.readFileSync(..., 'utf-8')` before the call and `assert.strictEqual` after.

In the same commit, migrate the three pre-existing tests per gotcha G1:
- line ~1558 `runGsdTools('objective remove 2', tmpDir)` → `'objective remove 2 --confirm'`
- line ~1607 `runGsdTools('objective remove 1 --force', tmpDir)` → `'objective remove 1 --force --confirm'`
- line ~1625 `runGsdTools('objective remove 6.2', tmpDir)` → `'objective remove 6.2 --confirm'`
- line ~1652 `runGsdTools('objective remove 2', tmpDir)` → `'objective remove 2 --confirm'`

Leave line ~1602 (`objective remove 1`, no flags, asserts failure) **untouched** — it is the gate-ordering regression bar.

Run `npm test`. New tests fail. Commit `test:`.

**Step 2 — GREEN, planner extraction.** In `objective.cjs`, add a pure function above `cmdObjectiveRemove`:

```
function computeRemovalPlan(objectivesDir, normalized, isDecimal, targetDir)
  -> { target_directory, renamed_directories: [{from,to}], renamed_files: [{directory,from,to}] }
```

Approach:
1. If `isDecimal` → return `{ target_directory: targetDir, renamed_directories: [], renamed_files: [] }` (G6).
2. Otherwise lift the collection + sort logic verbatim from objective.cjs:408-437 — same `/^(\d+)(?:\.(\d+))?-(.+)$/` regex, same `dirInt > removedInt` filter, same descending sort.
3. For each item compute `oldPrefix`/`newPrefix`/`newDirName` exactly as lines 439-446 do.
4. For file renames, `readdirSync` the **OLD** `item.dir` (G4), filter `f.startsWith(oldPrefix)`, and record `{ directory: newDirName, from: f, to: newPrefix + f.slice(oldPrefix.length) }`.
5. Wrap the readdir in the same `try {} catch {}` the original uses, so a missing objectives dir yields an empty plan rather than throwing.

# CRITICAL: pure — performs zero fs mutations.
# GOTCHA G3: safe to call before rmSync because the filter is strictly `>` removedInt.

**Step 3 — GREEN, gate.** Rewrite the body of `cmdObjectiveRemove` to this exact order (G2):

```
1. arg validation (unchanged)
2. roadmapPath / objectivesDir / const force = options.force || false
                                 const confirm = options.confirm || false
3. ROADMAP.md existence check (unchanged)
4. normalized / isDecimal / targetDir resolution (unchanged)
5. executed-jobs rail (unchanged, verbatim — exits 1)
6. const plan = computeRemovalPlan(objectivesDir, normalized, isDecimal, targetDir)
7. if (!confirm):
     process.stderr.write(renderPlanText(targetObjective, plan))     // human-readable, G5
     output({ removed: targetObjective,
              dry_run: true, confirmed: false, mutated: false,
              directory_deleted: null,
              target_directory: plan.target_directory,
              renamed_directories: plan.renamed_directories,
              renamed_files: plan.renamed_files,
              roadmap_updated: false, state_updated: false,
              hint: 'Re-run with --confirm to execute this plan.' }, raw)
     // output() exits 0 — nothing below runs
8. execute: rmSync target, then iterate plan.renamed_directories / plan.renamed_files
   and renameSync from the PLAN (never recompute — key_link)
9. ROADMAP.md rewrite + STATE.md update (unchanged, verbatim)
10. output({ ...existing keys..., dry_run: false, confirmed: true, mutated: true }, raw)
```

Add a small `renderPlanText(target, plan)` helper returning a plain-text block: a `DRY RUN — nothing has been modified.` banner, the directory to be deleted, each `old -> new` directory rename, each `old -> new` file rename, and a closing `Re-run with --confirm to execute.` line. stderr only.

# CRITICAL: step 8 iterates the plan. Do NOT re-run the readdir/sort logic.
# GOTCHA G8: output()/error() call process.exit — straight-line guards, no fallthrough.

**Step 4 — GREEN, CLI wiring.** `df-tools.cjs:731-733`:
```js
      } else if (subcommand === 'remove') {
        const forceFlag = args.includes('--force');
        const confirmFlag = args.includes('--confirm');
        cmdObjectiveRemove(cwd, args[2], { force: forceFlag, confirm: confirmFlag }, raw);
```
And update the usage comment at `df-tools.cjs:37` to:
`objective remove <objective> [--force] [--confirm]  Dry-run by default; --confirm executes delete + renumber`

Run `npm test`. Commit `feat:`.
</action>

<verify>
```bash
npm test 2>&1 | tail -30
```
Expect the `objective remove command` describe block fully green, and total failures no worse than the 8 known pre-existing ones.

Then a live smoke test against a throwaway fixture (never the real `.planning/`):
```bash
D=$(mktemp -d); mkdir -p "$D/.planning/objectives/01-a" "$D/.planning/objectives/02-b" "$D/.planning/objectives/03-c"
printf '# Roadmap\n### Objective 1: A\n### Objective 2: B\n### Objective 3: C\n' > "$D/.planning/ROADMAP.md"
cd "$D" && node /Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs objective remove 2
ls "$D/.planning/objectives"    # MUST still show 01-a 02-b 03-c
```
The command must print a plan naming `03-c -> 02-c`, exit 0, and leave all three directories present.
</verify>

<done>
- `objective remove N` without `--confirm` exits 0, prints the full delete+rename plan to stderr, emits `dry_run: true, mutated: false` JSON on stdout, and mutates nothing on disk.
- `objective remove N --confirm` performs exactly the printed plan and emits `dry_run: false, mutated: true`.
- The executed-jobs rail still exits 1 without `--force`; `--force --confirm` succeeds; `--force` alone only dry-runs; `--confirm` alone still refuses.
- Execution consumes the plan object returned by `computeRemovalPlan` — no second computation exists in the file.
- Two commits present: `test:` (RED) then `feat:` (GREEN).
</done>

<recovery>
If the migrated pre-existing tests fight the new gate order, re-check G2 — the executed-jobs rail must be evaluated before the `--confirm` short-circuit. Do not "fix" it by editing the untouched test at line 1602.

If plan and execution diverge on decimal objectives, confirm `isDecimal` short-circuits `computeRemovalPlan` to an empty rename set (G6) rather than falling through to the integer branch.

To abandon: `git checkout -- plugins/devflow/devflow/bin/lib/objective.cjs plugins/devflow/devflow/bin/df-tools.cjs plugins/devflow/devflow/bin/df-tools.test.cjs`.
</recovery>
</task>

<task type="auto">
<name>Un-gate the objective skill and sync its docs to the new rail</name>

<files>
plugins/devflow/skills/objective/SKILL.md
plugins/devflow/devflow/workflows/remove-objective.md
</files>

<action>
**1. Un-gate the skill.** In `plugins/devflow/skills/objective/SKILL.md`, delete line 9 — `disable-model-invocation: true` — from the YAML frontmatter. Change nothing else in the frontmatter; `name`, `description`, `argument-hint`, and `allowed-tools` stay as-is.

# CRITICAL: this file only. Do not grep-and-sweep the other 7 skills carrying this flag
# (cleanup, flow, list-objective-assumptions, set-profile, settings, workstreams, milestone).
# Auditing those is explicitly out of scope for this objective.

**2. Document the new semantics in SKILL.md.** The `<objective>` block currently reads:
```
- `remove <number>` — Remove an unstarted objective and renumber siblings
```
Replace with wording that states dry-run-by-default and names both flags, e.g.:
```
- `remove <number> [--force] [--confirm]` — Preview the removal + renumber plan.
  Dry-run by default: without `--confirm` nothing is deleted or renamed.
  `--confirm` authorizes the destructive cascade (delete + renumber every
  subsequent objective's directory, files, and ROADMAP references).
  `--force` separately overrides the refusal to remove an objective that has
  executed SUMMARY.md jobs. Removing an executed objective needs BOTH flags.
```
Also update the `argument-hint` to `"<add|remove> [args...]"` → keep as-is if already generic; do not narrow it.

**3. Sync the workflow doc.** In `plugins/devflow/devflow/workflows/remove-objective.md`:
- Line ~85: `df-tools.cjs objective remove "${target}"` → append `--confirm`.
- Line ~88-91: the `--force` note becomes: df-tools errors on executed jobs; with user confirmation use `--force --confirm` together.
- Add a short step before the execution step describing the dry-run preview: run without `--confirm` first, show the plan to the user, then re-run with `--confirm`. This makes the existing `<step name="confirm_removal">` (line 64) backed by a real machine-checked preview rather than a narrated one.
- Line ~143 anti-pattern list: add "Don't pass `--confirm` before showing the user the dry-run plan."

Commit `docs:`.
</action>

<verify>
```bash
# Flag is gone from the target skill, and ONLY the target skill changed
rg -n 'disable-model-invocation' plugins/devflow/skills/objective/SKILL.md   # expect: no matches
rg -l 'disable-model-invocation' plugins/devflow/skills/ | sort              # expect: exactly 7 files, none named objective
git diff --name-only                                                          # expect: only the 2 files in <files>

# Frontmatter still parses and help text mentions the flag
sed -n '1,20p' plugins/devflow/skills/objective/SKILL.md
rg -n -- '--confirm' plugins/devflow/skills/objective/SKILL.md plugins/devflow/devflow/workflows/remove-objective.md

npm test 2>&1 | tail -20
```
</verify>

<done>
- `disable-model-invocation` no longer appears in `plugins/devflow/skills/objective/SKILL.md`.
- Exactly 7 other skills still carry the flag, untouched.
- SKILL.md's `remove` help text states dry-run-by-default and documents `--confirm` and `--force` as distinct flags.
- `remove-objective.md` invokes df-tools with `--confirm` and describes the preview-then-confirm sequence.
- `npm test` shows no new failures.
</done>

<recovery>
If removing the frontmatter line breaks skill loading, the cause is YAML indentation damage in the surrounding block, not the flag's absence — re-read lines 1-15 and confirm `allowed-tools:` still has its four `- ` entries at the original indent.

To abandon: `git checkout -- plugins/devflow/skills/objective/SKILL.md plugins/devflow/devflow/workflows/remove-objective.md`.
</recovery>
</task>

</tasks>

<validation_gates>

```bash
# Full suite — the only gate this repo has. No lint command exists.
npm test
```

Pass bar: the `objective remove command` describe block is fully green, and total failures are no worse than the 8 known pre-existing ones. Any *new* failure blocks the job.

</validation_gates>

<verification>

Goal-backward check — each truth traced to the artifact that makes it observable:

| Truth | Observable how |
|---|---|
| Model can invoke /devflow:objective | `rg 'disable-model-invocation' plugins/devflow/skills/objective/SKILL.md` returns nothing |
| Other 7 skills untouched | `rg -l 'disable-model-invocation' plugins/devflow/skills/` returns exactly 7 files, none `objective` |
| No-confirm mutates nothing | Test case 1: pre/post `readFileSync` of ROADMAP.md + STATE.md are `strictEqual`; all 3 objective dirs still present |
| No-confirm prints the plan | Test case 2: stdout JSON carries `renamed_directories: [{from:'03-features',to:'02-features'}]`, `dry_run: true` |
| --confirm executes the plan | Test case 3: `02-auth/` gone, `02-features/02-01-JOB.md` exists, `mutated: true` |
| Plan matches action | Test case 4: dry-run `renamed_directories` deep-equals executed `renamed_directories` |
| Executed-jobs rail intact | Test case 5 (untouched pre-existing test) exits 1 with `executed job` on stderr |
| Both flags needed for executed objectives | Cases 6 (`--confirm` alone refuses), 7 (`--force` alone dry-runs), 8 (both succeed) |
| Help text matches behavior | `rg -- '--confirm' plugins/devflow/skills/objective/SKILL.md` matches |

</verification>

<success_criteria>

- [ ] SC-1 — `disable-model-invocation: true` removed from `plugins/devflow/skills/objective/SKILL.md`; the other 7 flagged skills are byte-identical.
- [ ] SC-2 — `df-tools objective remove N` without `--confirm` exits 0 having mutated nothing: no `rmSync`, no `renameSync`, ROADMAP.md and STATE.md unchanged.
- [ ] SC-3 — That same invocation prints the complete plan: target directory to delete, every directory rename, every file rename, as `old -> new` pairs.
- [ ] SC-4 — `--confirm` performs exactly the printed plan, and the execution path consumes `computeRemovalPlan`'s return value rather than recomputing.
- [ ] SC-5 — The executed-jobs rail and its `--force` bypass behave exactly as before; `--force` and `--confirm` are independent and both are required to remove an executed objective.
- [ ] SC-6 — Test coverage for all four required cases (a) no-confirm no-op, (b) confirm executes, (c) executed-jobs refusal without `--force`, (d) `--force --confirm` succeeds.
- [ ] SC-7 — `npm test` green with no new failures against the 8 known pre-existing ones.
- [ ] SC-8 — SKILL.md and `remove-objective.md` describe dry-run-by-default and `--confirm`, so the prose matches the code.

</success_criteria>

<output>

On completion write `.planning/quick/13-make-objective-skill-model-invocable-add/13-SUMMARY.md` recording:
- Commits made (expect `test:`, `feat:`, `docs:`).
- Final `npm test` counts (pass / fail / skip) and the delta in new tests added.
- The exact JSON shape `objective remove` now returns in both dry-run and confirmed modes.
- Any deviation from the planned gate ordering, and why.

</output>
