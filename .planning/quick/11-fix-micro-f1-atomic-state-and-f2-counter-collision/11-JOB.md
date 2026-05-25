---
objective: 11-fix-micro-f1-atomic-state-and-f2-counter-collision
trd: 11
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/micro.cjs
  - plugins/devflow/devflow/bin/lib/micro.test.cjs
autonomous: true
must_haves:
  - "After df-tools micro commit returns ok, working tree is clean — no `M .planning/STATE.md`"
  - "df-tools micro commit produces two atomic git commits: source + STATE.md row"
  - "After df-tools micro start, .planning/quick/<N>-<slug>/ directory exists on disk"
  - "After df-tools micro abort, the placeholder dir from start is removed"
  - "Two consecutive starts (micro then init quick, or vice versa) get distinct N values"
  - "STATE.md row records the source-files commit hash, not the STATE.md commit hash"
  - "All micro.test.cjs tests pass; init.test.cjs has no regressions"
---

<objective>
Fix two micro-task state-tracking bugs in `plugins/devflow/devflow/bin/lib/micro.cjs`:

**F1 — atomic STATE.md commit:** `commitMicro` writes the STATE.md row AFTER the source-file commit, leaving STATE.md dirty in the working tree. Fix by issuing a SECOND atomic commit for STATE.md alone (mirrors `/devflow:quick`'s 2-commit pattern).

**F2 — counter collision:** `_nextQuickNum` (micro) and `cmdInitQuick` (init.cjs) both scan `.planning/quick/` for `^\d+-` directories. Micro never creates a physical dir, only allocates a slot, so the next `init quick` collides on the same N. Fix by having `startMicro` create the placeholder dir on start, and `abortMicro` remove it.

Both bugs share state-tracking root cause; fix together for atomicity. User hits these every `/devflow:micro` invocation.

Purpose: TDD on a small, well-bounded refactor — clear fixture builders, behavior assertions on commit shape, two-commit ordering, and dir-existence side effects.
Output: micro CLI returns clean working tree on commit; counter is collision-free.
</objective>

<embedded_context>
  <codebase_examples>
    <example name="2-commit pattern reference (already in codebase via /devflow:quick)">
      The 2-commit shape is the established convention. Mirror it:
        Commit 1: `chore(micro): {description}` — source files only
        Commit 2: `chore(micro): record STATE.md row for {description}` — STATE.md only

      Both via the same gitRunner abstraction (line ~290 in micro.cjs):
        `const runner = gitRunner || ((cwd, opts) => _defaultGitRunner(cwd, opts));`
    </example>

    <example name="Existing _appendQuickTaskRow (DO NOT MODIFY)">
      File: plugins/devflow/devflow/bin/lib/micro.cjs lines 89-145.
      Writing logic is correct — it's just called too late (after the source commit, before any STATE.md commit). Move the second-commit logic AROUND it; don't change it.
    </example>

    <example name="_nextQuickNum (line 49)">
      Currently scans dirs but micro doesn't create one — root cause of F2.
      Fix: have startMicro physically mkdir the slot.
    </example>

    <example name="Test fixture pattern (mkGitAmbient)">
      File: plugins/devflow/devflow/bin/lib/micro.test.cjs line 25.
      Hand-built fixture builder — exactly what the user's CLAUDE.md TDD Playbook habit 4 mandates.
      Inits a real git repo + writes a 5-col STATE.md. Reuse for new tests; no LLM-generated test data.
    </example>
  </codebase_examples>

  <anti_patterns>
    <pattern name="git commit --amend">
      DO NOT use --amend to fold STATE.md into the source commit. Interacts unpredictably with gate-commits.js + tag-gate hooks. The 2-commit shape is the locked answer (matches /devflow:quick).
    </pattern>

    <pattern name="LLM-generated test data">
      Forbidden by user playbook (no_llm_test_data constraint). All fixtures hand-built via mkGitAmbient/mkAmbient or extend those builders. No "generate me 50 sample state files" — write factories instead.
    </pattern>

    <pattern name="Touching _appendQuickTaskRow">
      DO NOT modify _appendQuickTaskRow itself. Its writing logic is correct. The bug is the call site, not the function.
    </pattern>

    <pattern name="Touching skill-active marker semantics or endSkill">
      DO NOT touch .planning/.skill-active marker semantics or endSkill cleanup logic. Those are pre-existing contracts.
    </pattern>

    <pattern name="Property-based testing">
      Forbidden by user playbook (no_property_based_default constraint). Descriptive named test cases only.
    </pattern>
  </anti_patterns>

  <error_recovery>
    <scenario name="Second commit (STATE.md) fails after first commit succeeded">
      First commit landed (source files), STATE.md row was appended to disk but second commit failed.
      Recovery: log warning to stderr, leave STATE.md dirty for user inspection, still return `ok:true` with `commit_hash` set and `state_commit_hash` null. Marker is still removed (don't strand the user mid-flow).
      Rationale: first commit is the user-meaningful unit. Losing STATE.md tracking is bad but recoverable; refusing to clean up the marker would leave them stuck.
    </scenario>

    <scenario name="abortMicro called when placeholder dir doesn't exist">
      Idempotent — try to rmdir, swallow ENOENT. Don't error on "already gone".
    </scenario>

    <scenario name="startMicro mkdir fails (disk full, permissions)">
      Return `ok:false, reason: 'mkdir-failed'` BEFORE writing the .skill-active marker. Don't allocate the slot if the dir can't be created — keeps state consistent.
    </scenario>
  </error_recovery>
</embedded_context>

<gotchas>
  - **Two distinct hashes:** The STATE.md row records the SOURCE commit hash, not the STATE.md commit hash. Capture the source hash via `git rev-parse --short HEAD` BEFORE the second commit lands.
  - **Mock gitRunner called twice:** Tests injecting a mock gitRunner must expect it called twice (once per commit). Existing test 9 ("happy with files: passes files list to gitRunner") asserts on a single call — update its expectation, or split the assertion across both calls.
  - **`.micro-description` file vs placeholder dir:** Existing code stores description at `.planning/.micro-description` (line 226). The new placeholder dir is independent — keep the .micro-description file as-is (commit/abort still read it). Optionally also drop a `.description` file inside the placeholder dir for symmetry with /devflow:quick, but not required.
  - **dir-vs-marker ordering on abort:** `abortMicro` should remove BOTH the marker (existing behavior via endSkill) AND the placeholder dir. Order: remove dir first (pure fs op), then marker (existing endSkill call). If dir removal fails, still call endSkill — leaving the dir behind is recoverable, leaving the marker is not.
  - **Test 5 reference (existing test 132 in micro.test.cjs):** `existing .planning/quick/0042-foo dir makes next_num === 43` — relies on a hand-created dir. After this fix, that contract holds AND extends: now startMicro itself creates the dir, so a second start (without commit/abort) would see N+1. Verify the existing test still passes.
</gotchas>

<validation_gates>
  <gate name="micro tests pass" required="true">
    `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` — all green.
  </gate>
  <gate name="init tests no regression" required="true">
    `node --test plugins/devflow/devflow/bin/lib/init.test.cjs` — same pass count as before.
  </gate>
  <gate name="manual smoke" required="false">
    `cd ~/Source/devflow-claude && node plugins/devflow/devflow/bin/df-tools.cjs micro start "test fix" && touch /tmp/x && node plugins/devflow/devflow/bin/df-tools.cjs micro commit --files /tmp/x && git status --short` — should show clean tree.
  </gate>
</validation_gates>

## Test list

Behavior cases for the failing tests (RED) phase. Each test maps to one assertion of the new contract. Outside-in is N/A here (pure-logic feature, not UI/portal); ordering: dir-side-effects → commit-shape → integration.

### F2 — counter collision (startMicro + abortMicro)

1. **happy:** `startMicro({description: 'fix x'})` creates `.planning/quick/<next_num>-fix-x/` directory on disk.
2. **happy:** `startMicro` then `abortMicro` removes the placeholder dir from disk.
3. **happy:** consecutive starts → distinct N. After `startMicro({description: 'first'})` (no commit, no abort), invoking `_nextQuickNum` from a fresh init.cjs scan returns N+1, not N.
4. **edge:** `abortMicro` is idempotent — calling on a dir that doesn't exist (already cleaned up) returns `ok:true` without throwing.
5. **regression:** existing test 5 (`existing .planning/quick/0042-foo dir makes next_num === 43`) still passes — placeholder-dir creation in startMicro doesn't break the pre-existing dir-scan logic.

### F1 — atomic STATE.md commit (commitMicro)

6. **happy (THE bug):** after `commitMicro` returns `ok:true`, working tree is clean — `git status --porcelain` returns empty (no `M .planning/STATE.md`).
7. **happy:** `commitMicro` produces two commits — the most recent two `git log --format=%s -2` entries match `chore(micro): record STATE.md row for fix typo in readme` then `chore(micro): fix typo in readme` (newest first).
8. **happy:** STATE.md row records the SOURCE commit hash, NOT the STATE.md commit hash. Assert the hash in the appended row matches `git rev-parse --short HEAD~1` (the first of the two commits).
9. **happy:** return shape includes both hashes — `result.commit_hash` (source) and `result.state_commit_hash` (STATE.md).
10. **edge (graceful degradation):** if the second commit (STATE.md) fails — e.g. STATE.md write threw, nothing to stage — `result.ok` is still `true`, `result.commit_hash` is set, `result.state_commit_hash` is `null`, `result.removed_marker` is `true`, and a warning is emitted to stderr.
11. **regression:** test 11 (`gitRunner failure returns ok:false, reason commit-failed, marker stays`) still passes — first-commit failure still hard-fails the whole operation. Marker MUST stay on disk.
12. **regression:** test 9 (`happy with files: passes files list to gitRunner`) still passes — `files` param is still threaded through the first commit; the second commit (STATE.md) explicitly stages `.planning/STATE.md` regardless of the `files` arg.

<task type="auto" tdd="true">
  <name>RED — write failing tests for F1 (atomic STATE.md) and F2 (counter collision + placeholder dir)</name>
  <files>
    plugins/devflow/devflow/bin/lib/micro.test.cjs
  </files>
  <action>
Add 7-9 new tests to micro.test.cjs covering the 12-item Test list above. Reuse `mkAmbient` and `mkGitAmbient` fixture builders — DO NOT introduce new fixture libraries or LLM-generated data.

Approach:

1. **F2 dir-creation tests** — add a `describe('startMicro: placeholder dir', ...)` block after the existing startMicro tests (line ~158). Tests 1-4 from the Test list. Use `mkAmbient` (no git needed). Assert via `fs.existsSync(path.join(env.planningDir, 'quick', '<N>-<slug>'))`.

2. **F2 abortMicro dir-cleanup tests** — extend the existing `describe('abortMicro', ...)` block (line 322). Add test 4 (idempotent removal) using `mkAmbient`.

3. **F2 collision-prevention test** — add Test 3 (consecutive starts → distinct N). Either call `_nextQuickNum` directly (export it from micro.cjs for test) OR call `startMicro` twice and assert the second `result.next_num === first.next_num + 1`. Prefer the latter — black-box, no new export needed.

4. **F1 atomic-commit tests** — add `describe('commitMicro: atomic STATE.md', ...)` block. Tests 6-10 from the Test list. Use `mkGitAmbient` (real git repo). Use `spawnSync('git', ['log', '--format=%s', '-2'], ...)` to assert the two commit messages. Use `git status --porcelain` to assert clean tree.

5. **Update existing test 9** (`happy with files: passes files list to gitRunner`) to expect mockGitRunner called TWICE — once with `files: ['a.txt']`, once with `files: ['.planning/STATE.md']`. Track all calls in an array.

# CRITICAL: All tests must FAIL when run against the unmodified micro.cjs.
#           Run `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` after writing.
#           Confirm the new tests are red. Pre-existing tests should still pass (except updated test 9).
# GOTCHA: For F1 happy test 6, the source-files commit needs something to commit — use the existing pattern from test 8 (write `fix.txt` and `git add` it) before calling commitMicro.
# GOTCHA: For F1 test 7, when asserting commit messages via git log, the second-most-recent (HEAD~1) is the source commit; HEAD is the STATE.md commit. Order matters in assertions.
# PATTERN: Hand-built test fixtures only — see mkGitAmbient (line 25) for the canonical builder.

Commit RED with: `test(11): add failing tests for F1 atomic STATE.md commit and F2 placeholder dir`
  </action>
  <verify>
`node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` — new tests fail with messages indicating the missing behavior (e.g. "expected dir to exist, got false"; "expected 2 commits, got 1"; "expected clean tree, got M .planning/STATE.md"). Pre-existing tests (other than the updated test 9) still pass.
  </verify>
  <done>
7-9 new failing tests committed under message `test(11): ...`. Working tree clean after commit. Each new test maps to a specific Test-list item from the TRD body.
  </done>
</task>

<task type="auto" tdd="true">
  <name>GREEN — implement F1 (2-commit atomic STATE.md) and F2 (placeholder dir lifecycle) to make tests pass</name>
  <files>
    plugins/devflow/devflow/bin/lib/micro.cjs
  </files>
  <action>
Make the failing tests from Task 1 pass. Two changes to `plugins/devflow/devflow/bin/lib/micro.cjs`:

### F2: placeholder dir lifecycle

In `startMicro` (line ~195), AFTER computing `taskDir` (line 215) and BEFORE the `startSkill` call (line 218), physically create the dir:

```
const absTaskDir = path.join(planningDir, 'quick', `${nextNum}-${slug}`);
try {
  fs.mkdirSync(absTaskDir, { recursive: true });
} catch (e) {
  return { ok: false, reason: 'mkdir-failed', message: `Failed to create placeholder dir: ${e.message}` };
}
```

Order matters: mkdir BEFORE startSkill. If mkdir fails, no marker is written — clean fail.

In `abortMicro` (line ~359), BEFORE the `endSkill` call (line 368), find and remove the placeholder dir. Use the marker to identify which dir (the marker has no slug field, so we infer from the .micro-description file's slug, OR we re-derive). Cleanest path: re-read .micro-description to get the description, slug it, then look up matching `<N>-<slug>` in `.planning/quick/`.

Actually simpler: scan `.planning/quick/` for any dir whose mtime matches the marker's started_at, OR — easiest — just record the task_dir in the marker payload. But marker semantics are READ-ONLY per the DO NOT touch list.

Use: read `.micro-description`, compute slug, scan `.planning/quick/` for `*-<slug>` matches, take the highest-numbered one (the one this micro just created), rmdir it. Wrap in try/catch for ENOENT idempotency.

```
try {
  const descFile = path.join(planningDir, '.micro-description');
  if (fs.existsSync(descFile)) {
    const desc = fs.readFileSync(descFile, 'utf8').trim();
    const slug = generateSlugInternal(desc)?.substring(0, 40) || 'task';
    const quickDir = path.join(planningDir, 'quick');
    if (fs.existsSync(quickDir)) {
      const matches = fs.readdirSync(quickDir).filter(d => d.endsWith(`-${slug}`));
      // Pick the highest-N match (the one this micro created)
      const target = matches.sort((a, b) => parseInt(b.split('-')[0], 10) - parseInt(a.split('-')[0], 10))[0];
      if (target) fs.rmSync(path.join(quickDir, target), { recursive: true, force: true });
    }
  }
} catch { /* idempotent — ignore */ }
```

### F1: 2-commit atomic STATE.md

In `commitMicro` (line ~255), after the existing first commit + STATE.md row append + endSkill (lines 295-341), insert a second commit BEFORE the return statement.

Concretely:
1. After `_appendQuickTaskRow(...)` succeeds (line 328), but BEFORE `endSkill(...)` (line 341), call the runner a second time:
   ```
   let stateCommitHash = null;
   try {
     const stateCommitResult = runner(projectRoot, {
       message: `chore(micro): record STATE.md row for ${commitDesc}`,
       files: ['.planning/STATE.md'],
     });
     if (stateCommitResult.exitCode === 0) {
       const h = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
         cwd: projectRoot, encoding: 'utf8',
         env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' },
       });
       if (h.status === 0) stateCommitHash = h.stdout.trim();
     } else {
       process.stderr.write(`[micro] warning: STATE.md commit failed (${stateCommitResult.stderr}); STATE.md left dirty in working tree\n`);
     }
   } catch (e) {
     process.stderr.write(`[micro] warning: STATE.md commit threw (${e.message}); STATE.md left dirty\n`);
   }
   ```
2. If `_appendQuickTaskRow` itself threw (existing catch at line 335), skip the second commit entirely — there's nothing to commit. Set `stateCommitHash = null`.
3. Update return shape to include `state_commit_hash`:
   ```
   return { ok: true, commit_hash: commitHash, state_commit_hash: stateCommitHash, removed_marker: true };
   ```

# CRITICAL: STATE.md row's commit-hash field uses commitHash (source commit), NOT stateCommitHash. _appendQuickTaskRow is called BEFORE the second commit, with commitHash already populated — no change needed there.
# GOTCHA: The second commit's `files: ['.planning/STATE.md']` is a relative path from projectRoot. _defaultGitRunner's `git add ['.planning/STATE.md']` from projectRoot resolves correctly. Don't use absolute paths.
# GOTCHA: If the user's `--files` arg to first commit included `.planning/STATE.md` accidentally, the second commit's `git add` is a no-op (already staged + committed). The git commit on no-staged-changes returns exit 1 — handle gracefully via the `if (stateCommitResult.exitCode === 0)` branch already shown.
# PATTERN: Reuse the same runner abstraction. Tests inject a mock gitRunner; it MUST be called twice in the happy path. Do not bypass the runner for the second commit.

Run `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` after each edit. Iterate until all tests pass.

Commit GREEN with: `fix(11): atomic STATE.md commit (F1) and placeholder dir lifecycle (F2)`
  </action>
  <verify>
`node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` — ALL tests pass (new + pre-existing).
`node --test plugins/devflow/devflow/bin/lib/init.test.cjs` — no regression (same pass count as before this objective).

Manual smoke (run from /Users/markemerson/Source/devflow-claude):
```
node plugins/devflow/devflow/bin/df-tools.cjs micro start "smoke test"
ls -d .planning/quick/*-smoke-test  # should exist
echo x > /tmp/smoke && node plugins/devflow/devflow/bin/df-tools.cjs micro commit --files /tmp/smoke
git status --short  # should be empty
git log --format=%s -2  # should show two chore(micro): commits
node plugins/devflow/devflow/bin/df-tools.cjs micro abort  # idempotent (no active marker)
```
  </verify>
  <done>
All micro.test.cjs and init.test.cjs tests pass. Manual smoke shows clean tree and two commits. Single atomic GREEN commit under message `fix(11): ...`. STATE.md row contains source commit hash. Working tree clean after commitMicro.
  </done>
  <recovery>
If init.test.cjs regresses (cmdInitQuick scan logic broken by placeholder-dir creation): the dir-scan in init.cjs:651-661 is identical to micro's _nextQuickNum and should be unaffected — placeholder dirs from micro just become valid quick dirs that init's scan also sees. If a specific init test breaks, it likely asserts on dir contents (e.g. expects empty quick/), in which case audit the test fixture isolation. Do NOT modify init.cjs's _nextQuickNum logic — F2 fix relies on both code paths reading the same dir-scan source of truth.
  </recovery>
</task>

<verification>
  <command id="micro_tests" required="true">
    node --test plugins/devflow/devflow/bin/lib/micro.test.cjs
  </command>
  <command id="init_tests_no_regression" required="true">
    node --test plugins/devflow/devflow/bin/lib/init.test.cjs
  </command>
  <command id="full_test_suite" required="true">
    npm test
  </command>
  <command id="manual_smoke" required="false">
    node plugins/devflow/devflow/bin/df-tools.cjs micro start "smoke" && touch /tmp/smoke-x && node plugins/devflow/devflow/bin/df-tools.cjs micro commit --files /tmp/smoke-x && test -z "$(git status --porcelain)" && echo OK
  </command>
</verification>

<success_criteria>
- F1: After `df-tools micro commit` returns ok, `git status --porcelain` is empty.
- F1: `git log --format=%s -2` shows two `chore(micro):` commits (newest is "record STATE.md row for ...").
- F1: STATE.md row records source commit hash (HEAD~1), not STATE.md commit hash (HEAD).
- F1: `commitMicro` return shape includes `commit_hash` AND `state_commit_hash`.
- F1: Graceful degradation — if STATE.md commit fails, first commit still landed, marker still removed, `ok:true` returned with warning to stderr.
- F2: After `df-tools micro start <desc>`, `.planning/quick/<N>-<slug>/` exists on disk.
- F2: After `df-tools micro abort`, that dir is removed (idempotent — no error if already gone).
- F2: Two consecutive starts allocate distinct numbers (no collision with `init quick`'s next-num scan).
- All tests pass: micro.test.cjs (all new + pre-existing) and init.test.cjs (no regression).
- Two atomic commits per RED-GREEN cycle: one `test(11): ...` + one `fix(11): ...`.
</success_criteria>

<output>
- `plugins/devflow/devflow/bin/lib/micro.cjs` — F1 (2-commit shape) + F2 (placeholder dir mkdir/rmdir) implemented
- `plugins/devflow/devflow/bin/lib/micro.test.cjs` — 7-9 new tests covering the 12-item Test list, plus 1 updated test (test 9 — gitRunner-call-count)
- 2 atomic commits: `test(11):` (RED) + `fix(11):` (GREEN)
- `df-tools micro` UX: clean working tree post-commit, no counter collisions with `init quick`
</output>
