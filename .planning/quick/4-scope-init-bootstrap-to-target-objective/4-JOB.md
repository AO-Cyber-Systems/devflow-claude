---
type: quick
slug: 4-scope-init-bootstrap-to-target-objective
tasks: 2
context_target: ~30%
---

<objective>
Scope `init plan-objective` and `init execute-objective` bootstrap to ONLY the
target objective directory, instead of stamping stub OBJECTIVE.md files into
every objective dir under `.planning/objectives/`.

Why: `cmdInitPlanObjective` (init.cjs:412) and `cmdInitExecuteObjective`
(init.cjs:311) both call `backfillAllObjectives(cwd)` at lines 528 and 407
respectively. That walks every objective dir and stamps a stub OBJECTIVE.md
into any that lacks one — regardless of which objective is being initialized.
Result: a single `df-tools init plan-objective 018` invocation has been
observed to drop 18 untracked OBJECTIVE.md stubs into unrelated objective
dirs in one session. (Item 5 from `~/.claude/devflow-efficiency-handoff.md`.)

Output: scoped behavior — bootstrap touches only the target objective dir.
Downstream consumers see the same `bootstrap_objectives` shape
(`{ scanned, applied, skipped, errors }`), synthesized from the
single-objective return value.
</objective>

<embedded_context>

<codebase_examples>
The `bootstrapObjectiveMd` helper already exists at
`plugins/devflow/devflow/bin/lib/project-bootstrap.cjs:122` and is exported
at line 222. Its return shape:

```js
// project-bootstrap.cjs:122-183
function bootstrapObjectiveMd(cwd, objectiveId) {
  // ...
  // returns one of:
  //   { applied: false, added_fields: [], path: null, reason: 'objective dir not found' }
  //   { applied: false, added_fields: [], path: '<path>', reason: 'already exists' }
  //   { applied: true,  added_fields: ['work'], path: '<path>', reason: null }
}
```

The current call sites use `backfillAllObjectives` which returns:

```js
// project-bootstrap.cjs:194-216
{ scanned: <int>, applied: <int>, skipped: <int>, errors: [] }
```

Existing call sites (the bug):

```js
// init.cjs:407 (inside cmdInitExecuteObjective)
result.bootstrap = bootstrapProjectMd(cwd);
result.bootstrap_objectives = backfillAllObjectives(cwd);  // ← walks ALL objectives

// init.cjs:528 (inside cmdInitPlanObjective)
result.bootstrap = bootstrapProjectMd(cwd);
result.bootstrap_objectives = backfillAllObjectives(cwd);  // ← walks ALL objectives
```

Both functions take `objective` as the second parameter, already in scope.
</codebase_examples>

<anti_patterns>
- DO NOT remove `backfillAllObjectives` from `project-bootstrap.cjs`. Keep the
  function exported and intact in case future callers want the bulk-backfill
  semantic explicitly.
- DO NOT change `cmdInitNewProject`. It does not call `backfillAllObjectives`
  (correct — new projects have no objectives yet).
- DO NOT touch any pre-existing uncommitted state in `.planning/` while
  testing the change.
- DO NOT change the JSON shape of `bootstrap_objectives` in the init output —
  downstream skills/agents read `.applied`, `.scanned`, `.skipped`, `.errors`.
  Synthesize the same shape from the single-objective return.
</anti_patterns>

<error_recovery>
If `findObjectiveInternal(cwd, objective)` returns null (objective not found),
`objectiveInfo` is null and the bootstrap call should still succeed without
crashing. `bootstrapObjectiveMd` already handles a missing objective dir
gracefully — returns `{ applied: false, ..., reason: 'objective dir not found' }`.
Pass `objective` (the user-supplied id, e.g. `'1'` or `'01-foo'`) directly;
`bootstrapObjectiveMd` resolves the dir name itself. If `objectiveInfo` exists
and exposes a canonical directory name (e.g. `objectiveInfo.directory` —
`.planning/objectives/01-foo`), prefer the canonical id derived from the
directory's basename so dir-not-found is rare.
</error_recovery>

</embedded_context>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── init.cjs                  ← MODIFY (require + 2 call sites)
├── init.test.cjs             ← MODIFY (1 assertion + add scoping check)
└── project-bootstrap.cjs     ← UNCHANGED (already exports bootstrapObjectiveMd)
</file_tree>

<task type="auto">
  <name>Scope bootstrap to target objective in init.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/init.cjs</files>
  <action>
Replace the unscoped `backfillAllObjectives(cwd)` call at the two init paths
with a scoped `bootstrapObjectiveMd(cwd, objective)` call, synthesizing the
expected `bootstrap_objectives` shape so downstream consumers don't break.

Steps:

1. **Update the destructured require at line 10.** Add `bootstrapObjectiveMd`:

   ```js
   // BEFORE (init.cjs:10)
   const { bootstrapProjectMd, backfillAllObjectives } = require('./project-bootstrap.cjs');

   // AFTER
   const { bootstrapProjectMd, bootstrapObjectiveMd, backfillAllObjectives } = require('./project-bootstrap.cjs');
   ```

   Keep `backfillAllObjectives` in the destructure — we are not removing the
   import; we just stop calling it from these two paths. Other code paths
   (or future callers) may still want it.

2. **Replace the call site in `cmdInitExecuteObjective` (around line 407).**

   ```js
   // BEFORE
   result.bootstrap = bootstrapProjectMd(cwd);
   result.bootstrap_objectives = backfillAllObjectives(cwd);

   // AFTER
   result.bootstrap = bootstrapProjectMd(cwd);
   // Scoped bootstrap: only touch the target objective's dir, not every
   // objective under .planning/objectives/. Synthesize the legacy shape so
   // downstream consumers (skills/agents reading bootstrap_objectives) work
   // unchanged.
   const _bootstrapObjId = objectiveInfo?.directory
     ? path.basename(objectiveInfo.directory)
     : objective;
   const _bootstrapR = bootstrapObjectiveMd(cwd, _bootstrapObjId);
   result.bootstrap_objectives = {
     scanned: 1,
     applied: _bootstrapR.applied ? 1 : 0,
     skipped: _bootstrapR.applied ? 0 : 1,
     errors: [],
   };
   ```

   # CRITICAL: prefer the canonical dir basename from `objectiveInfo.directory`
   #           when available — `objective` may be a number ('1') while the
   #           dir is '01-foo'. `bootstrapObjectiveMd` does NOT do that
   #           number→dir resolution itself.
   # GOTCHA:  `objectiveInfo` may be null if the objective is not found;
   #          fall back to the raw `objective` arg so behavior matches today
   #          (graceful no-op via 'objective dir not found').
   # PATTERN: `path` is already required at the top of init.cjs; reuse it.

3. **Replace the call site in `cmdInitPlanObjective` (around line 528).**
   Same replacement, same synthesis. Both functions have `objective` and
   `objectiveInfo` in scope from earlier in the function body.

4. **Do not modify** `cmdInitNewProject`, `backfillAllObjectives` itself, or
   any other call site.
  </action>
  <verify>
```bash
# Syntactic sanity: file parses
node --check plugins/devflow/devflow/bin/lib/init.cjs

# Both call sites updated, neither still references backfillAllObjectives
# inside the two cmd functions
grep -n "backfillAllObjectives" plugins/devflow/devflow/bin/lib/init.cjs
# Expect: only the destructured require at line 10. No call site hits.

# bootstrapObjectiveMd is now imported and called twice
grep -n "bootstrapObjectiveMd" plugins/devflow/devflow/bin/lib/init.cjs
# Expect: 1 require + 2 call sites = 3 hits.
```
  </verify>
  <done>
- `init.cjs` line 10 require destructures `bootstrapObjectiveMd` alongside
  `bootstrapProjectMd` and `backfillAllObjectives`.
- The two call sites (in `cmdInitPlanObjective` and `cmdInitExecuteObjective`)
  invoke `bootstrapObjectiveMd(cwd, <objId>)` with the canonical objective dir
  basename (or `objective` arg fallback) and synthesize the
  `{ scanned, applied, skipped, errors }` shape.
- `node --check plugins/devflow/devflow/bin/lib/init.cjs` exits 0.
  </done>
  <recovery>
If the test suite (Task 2) reveals the call site picked the wrong id
(e.g. number vs dir name), revisit step 2's `_bootstrapObjId` resolution.
`findObjectiveInternal` is the canonical resolver — log
`objectiveInfo?.directory` to confirm it's a path like
`.planning/objectives/01-foo` so `path.basename` yields `01-foo`.
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Update FIX-1 tests to pin scoped bootstrap behavior</name>
  <files>plugins/devflow/devflow/bin/lib/init.test.cjs</files>
  <action>
The existing FIX-1 tests at init.test.cjs:222 and :255 pin the BUGGY behavior
(walks all objective dirs). Update them to pin the new scoped contract.

Pre-step: read the surrounding context (lines 222-276) to confirm the test
scenarios match the description below before editing.

1. **Test at line 222 ('FIX-1: init execute-objective triggers backfillAllObjectives, ...').**

   This test creates TWO objective dirs (`01-foo`, `02-bar`), runs
   `init execute-objective 1`, and asserts `applied >= 2`. Under the new
   contract, only `01-foo` (the target) gets backfilled.

   Edits:
   - Update test name + comment: it no longer triggers `backfillAllObjectives`;
     it triggers `bootstrapObjectiveMd` scoped to the target.
   - Change line 245's assertion from `>= 2` to `=== 1`:
     ```js
     // BEFORE
     assert.ok(json.bootstrap_objectives.applied >= 2,
       `expected at least 2 applied, got: ${json.bootstrap_objectives.applied}`);

     // AFTER
     assert.strictEqual(json.bootstrap_objectives.applied, 1,
       `expected exactly 1 applied (target objective only), got: ${json.bootstrap_objectives.applied}`);
     assert.strictEqual(json.bootstrap_objectives.scanned, 1,
       'expected scanned=1 — bootstrap is now scoped to target objective only');
     ```
   - Update the post-condition file checks to assert that `01-foo`'s
     OBJECTIVE.md exists AND `02-bar`'s OBJECTIVE.md does NOT exist (proving
     the scoping):
     ```js
     // BEFORE
     assert.strictEqual(fs.existsSync(path.join(repo, '.planning', 'objectives', '01-foo', 'OBJECTIVE.md')), true);
     assert.strictEqual(fs.existsSync(path.join(repo, '.planning', 'objectives', '02-bar', 'OBJECTIVE.md')), true);

     // AFTER
     assert.strictEqual(
       fs.existsSync(path.join(repo, '.planning', 'objectives', '01-foo', 'OBJECTIVE.md')),
       true,
       'target objective 01-foo should have been backfilled'
     );
     assert.strictEqual(
       fs.existsSync(path.join(repo, '.planning', 'objectives', '02-bar', 'OBJECTIVE.md')),
       false,
       'non-target objective 02-bar must NOT be backfilled (regression: bug item 5 from devflow-efficiency-handoff)'
     );
     ```

2. **Test at line 255 ('FIX-1: init plan-objective triggers backfillAllObjectives same as execute-objective').**

   This test creates ONE objective dir (`03-baz`), runs `init plan-objective 3`,
   and asserts `applied >= 1`. The current assertion is loose enough to keep
   passing under the new contract, but tighten it for clarity.

   Edits:
   - Update test name to reflect scoped semantics (e.g. drop
     'backfillAllObjectives' from the name, replace with 'bootstrapObjectiveMd').
   - Tighten line 271's assertion:
     ```js
     // BEFORE
     assert.ok(json.bootstrap_objectives.applied >= 1);

     // AFTER
     assert.strictEqual(json.bootstrap_objectives.applied, 1,
       'expected exactly 1 applied for scoped bootstrap');
     assert.strictEqual(json.bootstrap_objectives.scanned, 1,
       'expected scanned=1 — bootstrap is now scoped to target objective only');
     ```

# CRITICAL: do not delete or rename the test functions — keep the FIX-1
#           prefix and node:test signature intact so any external tooling
#           that filters tests by name still finds them.
# PATTERN:  per the user's TDD playbook habit 4, keep test data hand-built
#           via the existing `makeFixture` factory; do NOT introduce
#           LLM-generated fixture data.
  </action>
  <verify>
```bash
# Run the targeted test file
cd /Users/markemerson/Source/devflow-claude && node --test plugins/devflow/devflow/bin/lib/init.test.cjs

# Both FIX-1 tests pass
node --test plugins/devflow/devflow/bin/lib/init.test.cjs 2>&1 | grep -E "FIX-1|# pass|# fail"

# Full suite still green
npm test
```

Expected: all tests pass, including the two updated FIX-1 cases. The new
post-condition (`02-bar/OBJECTIVE.md` must NOT exist) is the regression guard
for the scoping bug.
  </verify>
  <done>
- Test at init.test.cjs:222 asserts `applied === 1`, `scanned === 1`, AND
  that `02-bar/OBJECTIVE.md` does NOT exist after `init execute-objective 1`.
- Test at init.test.cjs:255 asserts `applied === 1`, `scanned === 1`.
- `npm test` exits 0.
  </done>
  <recovery>
If the assertion `02-bar/OBJECTIVE.md does NOT exist` fails, the call-site
edit in Task 1 leaked: confirm Task 1 stopped calling `backfillAllObjectives`
and that the synthesized scope only invokes `bootstrapObjectiveMd` once with
the target objective id. If the `applied === 1` assertion fails with
`applied === 0`, the canonical dir-id resolution in Task 1 picked a
nonexistent dir — log `_bootstrapObjId` to confirm it equals `01-foo` (not
`'1'`) for the execute-objective case.
  </recovery>
</task>

<verification>
Final acceptance:

1. **Unit:** `npm test` passes (covers both updated FIX-1 tests + full suite).
2. **Behavioral:** running `node plugins/devflow/devflow/bin/df-tools.cjs init plan-objective 1`
   in a fixture with multiple empty objective dirs creates OBJECTIVE.md only
   in the target dir.
3. **Shape preserved:** the JSON output of init still has
   `bootstrap_objectives: { scanned, applied, skipped, errors }`.
4. **No regressions:** `cmdInitNewProject`, `backfillAllObjectives` export,
   and all unrelated init.cjs paths are unchanged.
</verification>

<success_criteria>
- [ ] init.cjs:10 requires `bootstrapObjectiveMd`
- [ ] init.cjs:407 (cmdInitExecuteObjective) calls `bootstrapObjectiveMd(cwd, <id>)` and synthesizes legacy shape
- [ ] init.cjs:528 (cmdInitPlanObjective) calls `bootstrapObjectiveMd(cwd, <id>)` and synthesizes legacy shape
- [ ] FIX-1 test at line 222 asserts `applied === 1` AND `02-bar/OBJECTIVE.md` does NOT exist
- [ ] FIX-1 test at line 255 asserts `applied === 1`
- [ ] `npm test` passes
- [ ] `cmdInitNewProject` unchanged
- [ ] `backfillAllObjectives` still exported from `project-bootstrap.cjs`
</success_criteria>
