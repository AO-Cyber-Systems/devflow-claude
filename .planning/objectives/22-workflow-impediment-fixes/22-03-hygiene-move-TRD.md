---
objective: 22-workflow-impediment-fixes
trd: 03
type: tdd
confidence: high
wave: 2
depends_on: [22-02]
files_modified:
  - plugins/devflow/devflow/bin/lib/project-hygiene.cjs
  - plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - HYGIENE-MOVE-CLI
  - HYGIENE-MOVE-ATOMIC
  - HYGIENE-MOVE-VERIFY
user_setup: []

must_haves:
  truths:
    - "df-tools project-hygiene move <objective-id> --to=<target-repo-path> copies objective directory to target then removes from source"
    - "Move is atomic-ish: copy + verify (file count + bytes match) BEFORE removing source"
    - "Verify failure aborts before rm-r — source dir preserved"
    - "Refuses to overwrite existing destination — errors with explicit message"
    - "Refuses to move when target-repo-path doesn't have a .planning/objectives/ directory (target must be a devflow project)"
    - "Returns JSON contract: { ok, source_path, target_path, files_copied, bytes_copied, source_removed, warnings }"
    - "Does NOT execute git operations — user commits source-side delete and dest-side add separately"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs"
      provides: "moveObjective() + cmdProjectHygieneMove() + _walkStats() helper"
      contains: "function moveObjective"
    - path: "plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs"
      provides: "Group 22C tests covering atomic move + verify failure rollback + refusal cases"
      contains: "moveObjective"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'project-hygiene' / subcommand 'move' arm"
      contains: "subcommand === 'move'"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs"
      to: "fs.cpSync + fs.rmSync"
      via: "atomic-ish move via _runFs injection hook"
      pattern: "cpSync|rmSync.*recursive"
    - from: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs (moveObjective)"
      to: "_walkStats verification"
      via: "filesystem walk diff before rm"
      pattern: "_walkStats"
---

<objective>
Add `df-tools project-hygiene move <objective-id> --to=<target-repo-path>` CLI to relocate a misfiled objective from current repo's `.planning/objectives/` to a target repo's `.planning/objectives/`. Atomic-ish (cp + verify + rm). Returns structured JSON.

Purpose: Make the misfile-fix workflow concrete and reliable. After 22-02's `check` reports `misfiled: [{...}]`, user runs `move <objective-id> --to=<other-repo>` to relocate it.

Output: `lib/project-hygiene.cjs` extended with `moveObjective` + `_walkStats`. CLI surface `df-tools project-hygiene move`. 2 atomic commits per TDD cycle.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── lib/
│   ├── project-hygiene.cjs        ← MODIFY (add moveObjective + _walkStats + cmdProjectHygieneMove)
│   └── project-hygiene.test.cjs   ← MODIFY (add Group 22C tests)
└── df-tools.cjs                   ← MODIFY (extend case 'project-hygiene': with subcommand === 'move')
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
## Existing _setRunFs injection pattern (dup-detect.cjs lines 50-70)

```js
const fs = require('fs');
const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  appendFileSync: (p, data, opts) => fs.appendFileSync(p, data, opts),
  writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
```

This TRD ADDS `cpSync` and `rmSync` to the realFs surface in project-hygiene.cjs.

## fs.cpSync recursive mode (Node 16.7+, supported in project's Node 20+ baseline)

```js
fs.cpSync(src, dst, { recursive: true });
// Deep-copies directory tree; throws on partial failure (good for atomic semantics)
```

## fs.rmSync force+recursive (Node 14.14+)

```js
fs.rmSync(target, { recursive: true, force: true });
// force: true → no throw on missing path (idempotent)
// recursive: true → directories
```
</codebase_examples>

<anti_patterns>
- DO NOT use `git mv` — move is a filesystem operation; git-side commits happen on user's terms.
- DO NOT auto-commit anywhere. The CLI is a filesystem mover; user manages git state.
- DO NOT update ROADMAP.md entries — out of scope for v1.2 (CONTEXT.md decision #4: `--update-roadmaps` flag deferred). Surface a one-line reminder in JSON output instead.
- DO NOT skip the verify step — that's the difference between "atomic-ish move" and "potentially-corrupting copy".
- DO NOT rm source if verify fails — leave source intact, return error with both paths populated so user can decide.
- DO NOT overwrite existing destination — errors out cleanly. User must rename or delete dest first.
- DO NOT auto-clean .gh-mapping.json or .gh-sync-state.json (CONTEXT.md decision: "stale entries are harmless" for v1.2).
- DO NOT scan archived milestone dirs (`.planning/milestones/v*-objectives/*`) for the source — current objectives only.
</anti_patterns>

<error_recovery>
### Recovery: dest already exists

```js
if (_runFs.existsSync(targetDir)) {
  return {
    ok: false,
    error: `destination already exists: ${targetDir}. Refusing to overwrite. Rename or delete the existing directory first.`,
    source_path: srcDir,
    target_path: targetDir,
  };
}
```

### Recovery: target repo not a devflow project

```js
const targetPlanning = path.join(targetRepoPath, '.planning', 'objectives');
if (!_runFs.existsSync(targetPlanning)) {
  return {
    ok: false,
    error: `target repo at '${targetRepoPath}' has no .planning/objectives/ — is it a devflow project? Run /df:new-project there first.`,
    source_path: srcDir,
    target_path: null,
  };
}
```

### Recovery: copy failed mid-way

`fs.cpSync` either succeeds fully or throws. If it throws, dest may have partial content. Roll back:

```js
try {
  _runFs.cpSync(srcDir, targetDir, { recursive: true });
} catch (e) {
  // Cleanup partial dest
  try { _runFs.rmSync(targetDir, { recursive: true, force: true }); } catch {}
  return { ok: false, error: `copy failed: ${e.message}`, source_path: srcDir, target_path: targetDir };
}
```

### Recovery: verify failed

```js
const srcStats = _walkStats(srcDir);
const dstStats = _walkStats(targetDir);
if (srcStats.files !== dstStats.files || srcStats.bytes !== dstStats.bytes) {
  // Roll back: remove dst
  _runFs.rmSync(targetDir, { recursive: true, force: true });
  return {
    ok: false,
    error: `verify failed: src ${srcStats.files}f/${srcStats.bytes}b vs dst ${dstStats.files}f/${dstStats.bytes}b. Source preserved.`,
    source_path: srcDir,
    target_path: targetDir,
    files_copied: 0,
    bytes_copied: 0,
    source_removed: false,
  };
}
```

### Recovery: rm source failed

Bad case — dest is good, source remains. Return ok:false but with source_removed:false so user knows manual cleanup needed:

```js
try {
  _runFs.rmSync(srcDir, { recursive: true, force: true });
} catch (e) {
  return {
    ok: false,
    error: `move copy succeeded but source removal failed: ${e.message}. Manual cleanup needed: ${srcDir}`,
    source_path: srcDir,
    target_path: targetDir,
    files_copied: srcStats.files,
    bytes_copied: srcStats.bytes,
    source_removed: false,
  };
}
```
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/22-workflow-impediment-fixes/22-CONTEXT.md
@.planning/objectives/22-workflow-impediment-fixes/22-RESEARCH.md
@.planning/objectives/22-workflow-impediment-fixes/22-02-hygiene-check-TRD.md
</context>

<research_context>
- 22-02 establishes `lib/project-hygiene.cjs`. This TRD EXTENDS that module with mutation operations.
- `_setRunFs` injection pattern from `dup-detect.cjs` lines 50-70 — REUSE EXACTLY (same `realFs` shape + `_runFs` indirection + `_setRunFs(fn)` setter).
- `_walkStats(dir)` helper — internal — returns `{ files: number, bytes: number }`. Implementation: recursive readdirSync, sum stat sizes for regular files. Skip symlinks (regular files only — count + bytes simple comparison is enough for verify).
- Test fixture: hand-build BOTH source and target temp dirs in test setup. Mirror the dup-detect / awareness fixture-builder pattern. NO real-repo paths.
- JSON contract:
  ```json
  {
    "ok": true,
    "source_path": ".planning/objectives/05-misfiled-thing",
    "target_path": "/path/to/other/repo/.planning/objectives/05-misfiled-thing",
    "files_copied": 12,
    "bytes_copied": 45678,
    "source_removed": true,
    "warnings": ["Remember to update ROADMAP.md in both repos to reflect the move"],
    "next_steps": [
      "cd /path/to/other/repo && git add .planning/objectives/05-misfiled-thing && git commit",
      "cd <current-repo> && git add -A && git commit -m 'chore: move objective 05 to other-repo'"
    ]
  }
  ```
</research_context>

<gotchas>
- **Windows symlinks:** macOS/Linux dev environment only — symlinks unlikely. If encountered, _walkStats skips them (regular files only). Document in JSDoc.
- **Hidden files:** `_walkStats` MUST traverse all entries including dotfiles (`.gitkeep`, `.gh-mapping.json` if it ever lives inside an objective dir). Use `readdirSync` without filter.
- **Permissions:** `fs.cpSync` preserves mode by default. Don't override.
- **Empty objective dir:** `files: 0, bytes: 0` is a valid state; verify still passes (0 === 0). Edge case worth a test.
- **Path normalization:** Use `path.resolve()` on `--to=<target-repo-path>` to handle relative paths from cwd. Test with both absolute and relative target paths.
- **Source-objective resolution:** `<objective-id>` matches the directory name (or its prefix). Reuse `findObjectiveInternal(cwd, objectiveId)` from `lib/objective.cjs` for consistency. Fall back: if `findObjectiveInternal` returns null, error with "objective not found in current repo".
- **`source_removed: false` cases:** verify-fail rollback OR rm-source-fail. Both are recoverable (dest may need manual cleanup, OR source needs manual cleanup) — never both at once.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing test list for project-hygiene move</name>
  <files>plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs</files>
  <action>
Add new test group `Group 22C` to `project-hygiene.test.cjs` (file already exists from 22-02). Test list (write BEFORE implementation per TDD playbook habit 2):

22C1 — `moveObjective({ cwd, objectiveId: '05-foo', targetRepoPath: '<temp-repo-2>' })` with valid setup returns `{ ok: true, source_path, target_path, files_copied, bytes_copied, source_removed: true, warnings: [...], next_steps: [...] }`
22C2 — After successful move, `fs.existsSync(source_path)` is false AND `fs.existsSync(target_path)` is true AND target contents match source pre-move byte-for-byte
22C3 — Move with target dir already existing returns `{ ok: false, error: <msg containing 'destination already exists'> }`; source preserved (still exists)
22C4 — Move with target repo lacking `.planning/objectives/` returns `{ ok: false, error: <msg containing 'devflow project'> }`; source preserved
22C5 — Move with non-existent objective-id returns `{ ok: false, error: <msg containing 'not found'> }`
22C6 — Move with empty objective dir (no files inside) returns `{ ok: true, files_copied: 0, bytes_copied: 0, source_removed: true }` (edge case)
22C7 — Move with verify failure (mocked `_walkStats` returning mismatched stats for src vs dst) returns `{ ok: false, error: <msg containing 'verify failed'>, source_removed: false }` AND source still exists AND dest is removed (rollback)
22C8 — Move with rm-source failure (mocked `_runFs.rmSync` throwing on source) returns `{ ok: false, error: <msg containing 'source removal failed'>, source_removed: false }` AND dest still exists
22C9 — Move with cp failure (mocked `_runFs.cpSync` throwing) returns `{ ok: false, error: <msg containing 'copy failed'> }` AND source still exists AND dest is cleaned up (partial state removed)
22C10 — `_walkStats(emptyDir)` returns `{ files: 0, bytes: 0 }`
22C11 — `_walkStats(dirWithFiles)` returns `{ files: <count>, bytes: <sum> }` matching real fs.statSync sums
22C12 — `_walkStats(nestedDir)` traverses recursively (file in subdir counted)
22C13 — `_walkStats(dirWithDotfiles)` includes `.gitkeep` and other dotfiles
22C14 — `_walkStats(missingPath)` returns `{ files: 0, bytes: 0 }` (graceful — missing path = empty)
22C15 — End-to-end subprocess: `df-tools project-hygiene move 05-foo --to=<path>` returns ok:true JSON; assert via execSync + JSON.parse
22C16 — End-to-end subprocess: `df-tools project-hygiene move` (no args) errors with stderr containing "objective-id required"
22C17 — End-to-end subprocess: `df-tools project-hygiene move 05-foo` (no --to) errors with stderr containing "--to required"
22C18 — Move with relative `--to=../other-repo` resolves to absolute path correctly (path.resolve from cwd)

Implementation tips:
- Reuse `buildHygieneFixture` from 22-02 to build SOURCE repo. Add new helper `buildTargetRepo(targetName)` that creates `{ dir, cleanup }` with empty `.planning/objectives/` ready to receive moved objectives.
- For 22C7 (verify-fail rollback): mock `_walkStats` to return `{ files: 999 }` for source AND `{ files: 1 }` for dest, forcing mismatch. Confirm rm-dest is called.
- For 22C8 (rm-source-fail): mock `_runFs.rmSync` to throw on the SECOND call (cleanup of source); first call (within copy-failure path) shouldn't trigger.
- For 22C9 (cp-fail): mock `_runFs.cpSync` to throw. Verify the catch block calls `rmSync` on the (potentially partial) target.
- Don't use real-repo paths anywhere. Build `tempSource` and `tempTarget` per test, cleanup in afterEach.

# CRITICAL: Test list documented BEFORE writing test code (TDD playbook habit 2). Single commit: `test(22-03): add failing tests for project-hygiene move (Group 22C)`.
# GOTCHA: 22C18 absolute-vs-relative path resolution — set test cwd to a known parent dir.
# PATTERN: Test naming `'22Cn — description'` mirrors 22A/22B convention.
  </action>
  <verify>
`npm test -- --test-name-pattern='22C'` shows 18 tests; ALL fail with expected RED-state errors (function moveObjective not defined / function _walkStats not defined). No syntax errors.
  </verify>
  <done>
18 Group 22C tests added to `plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs`. All 18 fail with expected RED-state errors. Single atomic commit: `test(22-03): add failing tests for project-hygiene move (Group 22C)`.
  </done>
  <recovery>
If syntax error rather than expected RED-state error, fix before proceeding. If test passes unexpectedly, audit assertion completeness.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement moveObjective + _walkStats + cmdProjectHygieneMove + df-tools router extension</name>
  <files>plugins/devflow/devflow/bin/lib/project-hygiene.cjs,plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Implement minimum production code to turn Group 22C tests GREEN.

**Stage 2a: Extend `lib/project-hygiene.cjs` with _runFs injection + _walkStats + moveObjective**

Add at top of project-hygiene.cjs (after existing imports from 22-02):

```js
// _runFs injection hook (mirrors dup-detect.cjs pattern)
const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  cpSync: (src, dst, opts) => fs.cpSync(src, dst, opts),
  rmSync: (p, opts) => fs.rmSync(p, opts),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetFsMock() { _runFs = realFs; }

// _runWalkStats indirection — separate from _runFs so tests can mock walking without
// mocking every fs call. Production callers always go through _walkStats.
let _walkStatsImpl = _walkStatsReal;
function _setWalkStats(fn) { _walkStatsImpl = (fn != null) ? fn : _walkStatsReal; }
function _resetWalkStats() { _walkStatsImpl = _walkStatsReal; }
function _walkStats(dir) { return _walkStatsImpl(dir); }
```

Implement `_walkStatsReal`:

```js
/**
 * Walk a directory recursively and return { files, bytes }.
 * Regular files only (skip symlinks, sockets, etc.). Includes dotfiles.
 * Missing path returns { files: 0, bytes: 0 } gracefully.
 */
function _walkStatsReal(dir) {
  const acc = { files: 0, bytes: 0 };
  if (!_runFs.existsSync(dir)) return acc;

  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = _runFs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        try {
          const st = _runFs.statSync(full);
          acc.files++;
          acc.bytes += st.size;
        } catch {
          // skip unreadable
        }
      }
      // Skip symlinks/sockets/etc.
    }
  }
  return acc;
}
```

Implement `moveObjective`:

```js
const { findObjectiveInternal } = require('./objective.cjs');

/**
 * Atomic-ish move of an objective directory from cwd's .planning/objectives/
 * to targetRepoPath's .planning/objectives/.
 *
 * Sequence: pre-checks → cp → verify (walkStats match) → rm source.
 * Verify failure rolls back dest. cp failure cleans up partial dest.
 *
 * @param {{ cwd?: string, objectiveId: string, targetRepoPath: string }} opts
 * @returns {object} JSON contract — see TRD for shape
 */
function moveObjective({ cwd = process.cwd(), objectiveId, targetRepoPath }) {
  const result = {
    ok: false,
    source_path: null,
    target_path: null,
    files_copied: 0,
    bytes_copied: 0,
    source_removed: false,
    warnings: [],
    next_steps: [],
  };

  // 1. Resolve source
  const objInfo = findObjectiveInternal(cwd, objectiveId);
  if (!objInfo) {
    result.error = `objective '${objectiveId}' not found in current repo's .planning/objectives/`;
    return result;
  }
  const srcDir = path.join(cwd, objInfo.directory);
  result.source_path = objInfo.directory;

  // 2. Resolve target
  const absTarget = path.resolve(cwd, targetRepoPath);
  const targetPlanning = path.join(absTarget, '.planning', 'objectives');
  if (!_runFs.existsSync(targetPlanning)) {
    result.error = `target repo at '${targetRepoPath}' (resolved: ${absTarget}) has no .planning/objectives/ — is it a devflow project? Run /df:new-project there first.`;
    return result;
  }

  const targetDir = path.join(targetPlanning, path.basename(srcDir));
  result.target_path = targetDir;

  // 3. Refuse overwrite
  if (_runFs.existsSync(targetDir)) {
    result.error = `destination already exists: ${targetDir}. Refusing to overwrite. Rename or delete the existing directory first.`;
    return result;
  }

  // 4. Copy
  try {
    _runFs.cpSync(srcDir, targetDir, { recursive: true });
  } catch (e) {
    try { _runFs.rmSync(targetDir, { recursive: true, force: true }); } catch {}
    result.error = `copy failed: ${e.message}`;
    return result;
  }

  // 5. Verify
  const srcStats = _walkStats(srcDir);
  const dstStats = _walkStats(targetDir);
  if (srcStats.files !== dstStats.files || srcStats.bytes !== dstStats.bytes) {
    try { _runFs.rmSync(targetDir, { recursive: true, force: true }); } catch {}
    result.error = `verify failed: src ${srcStats.files}f/${srcStats.bytes}b vs dst ${dstStats.files}f/${dstStats.bytes}b. Source preserved.`;
    return result;
  }
  result.files_copied = dstStats.files;
  result.bytes_copied = dstStats.bytes;

  // 6. Remove source
  try {
    _runFs.rmSync(srcDir, { recursive: true, force: true });
    result.source_removed = true;
  } catch (e) {
    result.error = `move copy succeeded but source removal failed: ${e.message}. Manual cleanup needed: ${srcDir}`;
    return result;
  }

  // 7. Success
  result.ok = true;
  result.warnings.push('Remember to update ROADMAP.md in both repos to reflect the move');
  result.next_steps = [
    `cd ${absTarget} && git add .planning/objectives/${path.basename(srcDir)} && git commit -m 'chore: receive objective ${objectiveId} from ${path.basename(cwd)}'`,
    `cd ${cwd} && git add -A && git commit -m 'chore: move objective ${objectiveId} to ${path.basename(absTarget)}'`,
  ];
  return result;
}

function cmdProjectHygieneMove(cwd, objectiveId, targetRepoPath, raw) {
  if (!objectiveId) error('objective-id required for project-hygiene move');
  if (!targetRepoPath) error('--to=<target-repo-path> required for project-hygiene move');
  const result = moveObjective({ cwd, objectiveId, targetRepoPath });
  output(result, raw);
}
```

Update module.exports:
```js
module.exports = {
  // ... existing from 22-02
  moveObjective,
  cmdProjectHygieneMove,
  _walkStats,
  _walkStatsReal,
  _setRunFs,
  _resetFsMock,
  _setWalkStats,
  _resetWalkStats,
};
```

**Stage 2b: Extend df-tools.cjs router**

Add to existing `case 'project-hygiene':` arm (from 22-02):

```js
case 'project-hygiene': {
  const subcommand = args[1];
  if (subcommand === 'check') {
    const { cmdProjectHygieneCheck } = require('./lib/project-hygiene.cjs');
    cmdProjectHygieneCheck(cwd, raw);
  } else if (subcommand === 'move') {
    const { cmdProjectHygieneMove } = require('./lib/project-hygiene.cjs');
    const objectiveId = args[2];
    // --to=value or --to value
    let targetRepoPath = null;
    for (const a of args.slice(2)) {
      if (typeof a === 'string' && a.startsWith('--to=')) {
        targetRepoPath = a.slice('--to='.length);
        break;
      }
    }
    if (!targetRepoPath) {
      const toIdx = args.indexOf('--to');
      if (toIdx !== -1) targetRepoPath = args[toIdx + 1];
    }
    cmdProjectHygieneMove(cwd, objectiveId, targetRepoPath, raw);
  } else if (!subcommand) {
    error('Unknown project-hygiene subcommand. Available: check, move (archive in 22-04)');
  } else {
    error(`Unknown project-hygiene subcommand: ${subcommand}. Available: check, move`);
  }
  break;
}
```

# CRITICAL: Run RED tests FIRST, confirm 18 fail. Then implement until all 18 PASS.
# GOTCHA: 22C7 verify-rollback test requires `_setWalkStats` mock — make sure the indirection is in place.
# GOTCHA: 22C9 cp-fail test mocks `_runFs.cpSync` to throw, then verifies `_runFs.rmSync` is called on dest — track call order in mock.
# PATTERN: `_setRunFs` and `_setWalkStats` are SEPARATE injection hooks — tests can mock just one or both.
  </action>
  <verify>
`npm test -- --test-name-pattern='22C'` shows 18 tests; ALL pass. Full suite: `npm test 2>&1 | tail -5` shows previous baseline + 18 = (Wave 1 baseline 2185 + 18 new 22C) 2203 pass, no regressions. Manual smoke: `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene move` (no args) errors cleanly.
  </verify>
  <done>
All 18 Group 22C tests pass. Full suite: 2203 pass; 0 new regressions vs Wave 1 finish state. Single atomic commit: `feat(22-03): add project-hygiene move CLI with atomic copy+verify+rm`.
  </done>
  <recovery>
If test fails: (a) check `_walkStats` indirection — moveObjective MUST go through `_walkStats(dir)` not direct `_walkStatsReal(dir)`. (b) if rollback test fails, log call order to mock and trace expected sequence. (c) if path resolution fails on relative `--to=`, ensure `path.resolve(cwd, targetRepoPath)` is used.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene move` (no args) exits non-zero with stderr "objective-id required"
- `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene move 99-no-such-objective --to=/tmp/foo` exits non-zero with stderr containing "not found"
- Manual end-to-end: build temp source repo + temp target repo, run `move`, observe atomic behavior (source gone, dest populated, JSON output correct)
- `npm test` shows 2203 tests passing (Wave 1 baseline 2185 + 18 Group 22C)
</verification>

<success_criteria>
- `df-tools project-hygiene move <id> --to=<path>` performs atomic-ish copy + verify + rm
- Verify failure rolls back dest; source preserved
- Refuses overwrite of existing destination
- Refuses move when target repo lacks `.planning/objectives/`
- JSON contract stable: `ok, source_path, target_path, files_copied, bytes_copied, source_removed, warnings, next_steps, error?`
- Empty objective dirs work (0 files, 0 bytes)
- Relative target paths resolve correctly via `path.resolve(cwd, ...)`
- 2 atomic commits per TDD cycle (test + feat)
- 2185 baseline tests preserved + 18 new Group 22C tests pass
</success_criteria>

<output>
After completion, create `.planning/objectives/22-workflow-impediment-fixes/22-03-hygiene-move-SUMMARY.md` documenting: tests added (18), production helpers added (`moveObjective`, `_walkStats`, `_walkStatsReal`, `_setRunFs`, `_setWalkStats`, `cmdProjectHygieneMove`), CLI surface extended (`df-tools project-hygiene move`), commits made (2), test count delta (+18), regressions (0).
</output>
