---
objective: quick-3
job: 1
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/objective.cjs
  - plugins/devflow/devflow/bin/lib/misc.cjs
  - plugins/devflow/devflow/bin/lib/verify.cjs
  - plugins/devflow/devflow/bin/df-tools.test.cjs
autonomous: true
must_haves:
  truths:
    - "objective add with a very long description succeeds; created directory slug is capped (~60 chars), no ENAMETOOLONG"
    - "objective add --help exits non-zero with a clear error; no directory named --help is created and ROADMAP.md is untouched"
    - "objective add assigns max(ROADMAP headings, existing objective dir prefixes) + 1 — no collision when a dir exists without a ROADMAP heading"
    - "df-tools commit --files <paths> commits ONLY the named paths; unrelated staged changes remain staged, not swept into the commit"
    - "verify job-structure reports valid:true for TRD-format plans using `trd:` instead of `job:` in frontmatter"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/objective.cjs
      provides: hardened cmdObjectiveAdd (slug cap, flag rejection, dir+roadmap number scan)
    - path: plugins/devflow/devflow/bin/lib/misc.cjs
      provides: pathspec-isolated cmdCommit
    - path: plugins/devflow/devflow/bin/lib/verify.cjs
      provides: cmdVerifyJobStructure accepting job OR trd identifier field
    - path: plugins/devflow/devflow/bin/df-tools.test.cjs
      provides: regression tests for all three fixes
  key_links:
    - from: df-tools.cjs case 'commit' (line ~304)
      to: misc.cjs cmdCommit(cwd, message, files, raw, amend)
      via: existing files[] arg — commit args gain `-- <paths>` when files non-empty
---

<objective>
Fix three df-tools bugs surfaced during objectives 10/23, each with regression tests:
1. `objective add` crashes/misbehaves on long descriptions, flag-like args, and assigns colliding numbers.
2. `df-tools commit --files` sweeps unrelated staged changes from parallel executors into the commit.
3. `verify job-structure` rejects TRD-format plans that use `trd:` instead of `job:` frontmatter.

Output: three small surgical fixes + tests in `df-tools.test.cjs`, committed atomically per fix.
</objective>

<embedded_context>

<codebase_examples>
**Dispatch for `objective add`** (df-tools.cjs:558) joins everything after the subcommand:
```js
cmdObjectiveAdd(cwd, args.slice(2).join(' '), raw);
```
So `df-tools objective add --help` arrives as `description === '--help'`.

**Slug generation** (helpers.cjs:84-87) — shared helper, used by other callers; do NOT change it globally:
```js
function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
```

**Number assignment today** (objective.cjs:277-286) scans ONLY ROADMAP headings:
```js
const objectivePattern = /#{2,4}\s*Objective\s+(\d+)(?:\.\d+)?:/gi;
// ... maxObjective from ROADMAP only — misses .planning/objectives/11-... dirs
const newObjectiveNum = maxObjective + 1;
```

**cmdCommit today** (misc.cjs:446-454) — stages named files but commits the WHOLE index:
```js
const filesToStage = files && files.length > 0 ? files : ['.planning/'];
for (const file of filesToStage) { execGit(cwd, ['add', file]); }
const commitArgs = amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message];
```

**verify job-structure required fields** (verify.cjs:116):
```js
const required = ['objective', 'job', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'];
```

**Test conventions** (df-tools.test.cjs): node native runner, `createTempProject()` makes a tmp dir with `.planning/objectives/`, `runGsdTools('<cmd string>', tmpDir)` shells out and returns `{ success, output, error }`. Existing `describe('objective add command', ...)` block at line ~1283 is the model to extend. `loadConfig` defaults `commit_docs: true`, so cmdCommit tests need no config.json — but they DO need a real git repo (`git init`, user.name/user.email set) inside the tmp dir, and `.planning` must not be gitignored.
</codebase_examples>

<anti_patterns>
- Do NOT modify `generateSlugInternal` in helpers.cjs — it has other callers (findPlanFiles, init paths). Cap at the call site in cmdObjectiveAdd.
- Do NOT switch cmdCommit to `git stash` / `git reset` dances to isolate paths — `git commit -m <msg> -- <paths>` already commits only the named pathspecs regardless of what else is staged.
- Do NOT touch the 12 pre-existing failing tests (daemon/watcher/peer-scan/novel-domain). Don't fix, don't worsen.
- No LLM-generated test fixture data — hand-build minimal ROADMAP/JOB markdown strings inline, matching existing test style.
- Never use or reference port 8080 anywhere (sanctioned local port is 8091 — not needed for this work, but binding for any subprocess/test server).
</anti_patterns>

<gotchas>
- `git commit -- <paths>` only works for TRACKED paths; keep the existing `git add <file>` loop before the commit so brand-new files are tracked first, THEN limit the commit with the pathspec.
- Do not add the pathspec to the `--amend` branch — `git commit --amend --no-edit -- <paths>` changes amend semantics; preserve current amend behavior.
- When capping the slug at 60 chars, strip any trailing `-` left by the cut (e.g., cut mid-word leaves `...-fo-`), otherwise dir names end with a hyphen.
- Directory scan for numbering must tolerate `.planning/objectives/` not existing (use try/catch or existsSync) and must match decimal prefixes too: `/^(\d+)(?:\.\d+)?-/`.
- `runGsdTools` failure case: assert `result.success === false` AND that stderr/error mentions the description-looks-like-a-flag problem; also assert `fs.existsSync(...objectives/--help...)` is false.
</gotchas>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Harden objective add: slug cap, flag rejection, dir+roadmap number scan</name>
  <files>plugins/devflow/devflow/bin/lib/objective.cjs, plugins/devflow/devflow/bin/df-tools.test.cjs</files>
  <action>
RED first: extend `describe('objective add command', ...)` in df-tools.test.cjs with three failing tests, run them to confirm failure, then implement in cmdObjectiveAdd (objective.cjs:264).

Test list (behavior cases):
1. Long description (~150 chars of words) → success; returned `slug.length <= 60`; created directory exists and its name is `NN-<slug>` with slug ≤ 60 chars and no trailing hyphen.
2. `objective add --help` → `result.success === false`; error message states the description must not start with `--` (looks like a flag); NO `.planning/objectives/*--help*` directory created; ROADMAP.md content unchanged.
3. Collision: ROADMAP contains `### Objective 1:` and `### Objective 2:` only, but `.planning/objectives/11-phase-d-verifier-wiring/` exists on disk → new objective number is 12 (not 3), directory `12-<slug>` created, ROADMAP gains `### Objective 12:`.
   Edge: empty objectives dir + empty roadmap → still assigns 1 (existing test must keep passing).

Implementation in cmdObjectiveAdd:
1. After the `!description` guard: `if (description.trim().startsWith('--')) error('description must not start with "--" — got a flag-like argument: ' + description)`. (helpers' `error()` prints and exits non-zero.)
2. Cap slug at call site: `let slug = generateSlugInternal(description); if (slug.length > 60) slug = slug.slice(0, 60).replace(/-+$/, '');`
3. Number assignment: keep the ROADMAP heading scan, then also scan `.planning/objectives/` directory entries for prefix matches `/^(\d+)(?:\.\d+)?-/` (guard with fs.existsSync; readdirSync withFileTypes, directories only) and fold integer parts into the same `maxObjective`. `newObjectiveNum = maxObjective + 1` as today.

GREEN: run tests, all three pass plus the two existing objective-add tests.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/df-tools.test.cjs 2>&1 | grep -A2 "objective add" — 5 passing tests in the block; full run shows no NEW failures beyond the 12 pre-existing (daemon/watcher/peer-scan/novel-domain)</verify>
  <done>Long descriptions produce ≤60-char slugs without mkdir errors; flag-like first arg is rejected with a clear message and no side effects; number = max(ROADMAP, dirs) + 1 so 11-on-disk yields 12</done>
  <recovery>If `error()` in helpers throws differently than expected (writes JSON vs plain text), match the assertion to its actual output format rather than changing helpers.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Isolate commit --files with git pathspec</name>
  <files>plugins/devflow/devflow/bin/lib/misc.cjs, plugins/devflow/devflow/bin/df-tools.test.cjs</files>
  <action>
RED first: add a new `describe('commit command pathspec isolation', ...)` block, confirm failure, then fix cmdCommit (misc.cjs:425).

Test list:
1. Isolation (core bug): tmp project; `git init`, set user.name/user.email via execSync; create and commit an initial file so HEAD exists. Then create `.planning/STATE.md` (the target) AND an unrelated file `other.txt`; `git add other.txt` to simulate a parallel executor's staged change. Run `runGsdTools('commit "test(quick-3): isolation" --files .planning/STATE.md', tmpDir)`. Assert: commit succeeded; `git show --name-only --format= HEAD` lists ONLY `.planning/STATE.md`; `git diff --cached --name-only` still lists `other.txt` (left staged, not swept).
2. Untracked named file still commits: a brand-new file passed via --files gets added and committed (proves the add loop is preserved).
3. No --files → existing default behavior unchanged (stages `.planning/`, plain `git commit -m`); a smoke assertion that the commit succeeds.

Implementation in cmdCommit:
- Keep the `git add` loop exactly as-is (needed so untracked named files become tracked).
- Change only the non-amend commit args: when `files && files.length > 0`, use `['commit', '-m', message, '--', ...files]`; otherwise keep `['commit', '-m', message]`. Leave the amend branch untouched.
- The "nothing to commit" detection: `git commit -- <paths>` with clean paths emits "nothing to commit" variants too; verify the existing stdout/stderr check still catches it (adjust the match only if the test for it fails).

GREEN: run the new block; commit isolation test proves `other.txt` did not ride along.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/df-tools.test.cjs 2>&1 | grep -A2 "commit command" — new tests pass; no new failures in full run</verify>
  <done>`df-tools commit -m <msg> --files <paths>` commits only the named paths; concurrently staged unrelated changes remain staged untouched; default (no --files) behavior unchanged</done>
  <recovery>If `git commit -- <pathspec>` errors on a path with no changes mixed with changed paths ("pathspec did not match"), filter the pathspec list to paths that exist on disk before appending; document why in a comment.</recovery>
</task>

<task type="auto" tdd="true">
  <name>verify job-structure accepts trd as plan identifier field</name>
  <files>plugins/devflow/devflow/bin/lib/verify.cjs, plugins/devflow/devflow/bin/df-tools.test.cjs</files>
  <action>
RED first: add `describe('verify job-structure trd field', ...)` tests, confirm failure, then fix cmdVerifyJobStructure (verify.cjs:105-119).

Test list (write a minimal valid plan body once as a helper string: frontmatter + one `<task>` with name/files/action/verify/done):
1. Frontmatter with `trd: 01` (and objective/type/wave/depends_on/files_modified/autonomous/must_haves, no `job:`) → `valid: true`, zero errors. This is the TRD-format regression.
2. Frontmatter with `job: 01` (legacy) → still `valid: true`.
3. Frontmatter with NEITHER `job` nor `trd` → `valid: false` with error mentioning `job (or trd)`.

Implementation:
- verify.cjs:116 — remove `'job'` from the `required` array.
- After the required-field loop: `if (fm.job === undefined && fm.trd === undefined) errors.push('Missing required frontmatter field: job (or trd)');`

GREEN: all three pass. Check the rest of cmdVerifyJobStructure for any other hard `fm.job` reads (grep within the function) and mirror the job-or-trd fallback if found.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/df-tools.test.cjs 2>&1 | grep -A2 "job-structure" — tests pass; `node plugins/devflow/devflow/bin/df-tools.cjs verify job-structure <a real TRD from .planning/objectives/>` returns valid:true</verify>
  <done>TRD-format plans (frontmatter `trd:` instead of `job:`) validate as valid:true; legacy `job:` plans unaffected; missing both yields a clear single error</done>
</task>

</tasks>

<verification>
Full gate before final commit:
1. `npm test` from repo root — no NEW failures; the 12 pre-existing failures (daemon/watcher/peer-scan/novel-domain) are the only red.
2. Smoke: in a throwaway tmp dir with `.planning/ROADMAP.md`, run `node plugins/devflow/devflow/bin/df-tools.cjs objective add $(python3 -c "print('very long description '*10)")` — succeeds, dir name ≤ ~63 chars total.
3. Smoke: `verify job-structure` against an existing TRD file in this repo's `.planning/objectives/` returns valid:true.
</verification>

<commit_plan>
Three atomic commits via the fixed tooling itself where possible (raw git is gated; use df-tools commit or DEVFLOW_ALLOW_RAW_COMMIT=1 for source files since df-tools commit targets planning docs — source commits here should use the project's normal commit path):
1. `fix(df-tools): harden objective add — slug cap, flag rejection, dir-aware numbering`
2. `fix(df-tools): limit commit --files to named pathspecs`
3. `fix(df-tools): verify job-structure accepts trd identifier field`
Each commit pairs implementation + its tests.
</commit_plan>

<success_criteria>
- [ ] All three bugs fixed with the surgical changes described (no helper-wide slug change, no amend-branch change)
- [ ] 8+ new tests added to df-tools.test.cjs covering happy, edge, and failure cases per task
- [ ] `npm test` shows zero NEW failures vs the 12 pre-existing
- [ ] Three conventional commits, one per fix, tests paired with implementation
</success_criteria>
