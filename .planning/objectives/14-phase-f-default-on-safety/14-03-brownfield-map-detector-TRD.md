---
objective: 14-phase-f-default-on-safety
trd: "03"
type: tdd
wave: 3
depends_on:
  - "14-02"
files_modified:
  - plugins/devflow/devflow/bin/lib/brownfield-detector.cjs
  - plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/brownfield-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - F3
must_haves:
  truths:
    - "df-tools detect brownfield-map <cwd> returns structured signal block"
    - "Detector identifies projects where .planning/ exists but .planning/codebase/ does not"
    - "Detector counts source files (excluding node_modules/.git/dist/.planning) and applies 50-file threshold"
    - "Detector returns should_offer_map:true when all three conditions hold (planning exists, codebase missing, source count ≥ threshold)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/brownfield-detector.cjs"
      provides: "cmdDetectBrownfieldMap command + detectBrownfieldMap pure function"
      min_lines: 90
      exports: ["cmdDetectBrownfieldMap", "detectBrownfieldMap"]
    - path: "plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs"
      provides: "Unit tests for all four input combinations + threshold edge cases"
      min_lines: 150
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/brownfield-fixtures.cjs"
      provides: "Hand-built factory for tmpdir scaffolds (empty / planning-only / planning+codebase / N source files)"
      min_lines: 50
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/brownfield-detector.cjs"
      via: "require + dispatcher case"
      pattern: "brownfield-map"
---

<objective>
Add a pure-logic brownfield detector that tells callers when a project (1) has `.planning/`, (2) lacks `.planning/codebase/`, AND (3) has substantial source code. When all three hold, the recommendation is to offer `/devflow:map-codebase`.

Purpose: F3 from issue #31. This is the **detector helper only** — Phase A (objective for #26) will wire it into `classify-session.js` SessionStart hook to produce the brownfield map offer. By shipping the detector now, Phase A's wiring becomes a one-line integration.

Output: New `lib/brownfield-detector.cjs` module + tests + dispatcher hook.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                    ← MODIFY (extend `detect` dispatcher)
└── lib/
    ├── brownfield-detector.cjs                     ← CREATE
    ├── brownfield-detector.test.cjs                ← CREATE
    └── __fixtures__/
        └── brownfield-fixtures.cjs                 ← CREATE
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: pure-logic two-tier API (mirror TRD 14-01 / 14-02)

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');

// Pure function — testable without filesystem (takes already-counted inputs)
function detectBrownfieldMap({ planningExists, codebaseMapExists, sourceFileCount, threshold = 50 }) {
  return {
    should_offer_map: planningExists && !codebaseMapExists && sourceFileCount >= threshold,
    planning_exists: planningExists,
    codebase_map_exists: codebaseMapExists,
    source_file_count: sourceFileCount,
    threshold,
  };
}

// I/O wrapper — counts files, calls pure function, emits via output(...)
function cmdDetectBrownfieldMap(cwd, targetCwd, raw) {
  const root = targetCwd ? path.resolve(targetCwd) : cwd;
  const planningExists = fs.existsSync(path.join(root, '.planning'));
  const codebaseMapExists = fs.existsSync(path.join(root, '.planning', 'codebase'));
  const sourceFileCount = countSourceFiles(root);
  const result = detectBrownfieldMap({ planningExists, codebaseMapExists, sourceFileCount });
  output(result, raw, result.should_offer_map ? 'should_offer_map' : 'skip');
}

module.exports = { cmdDetectBrownfieldMap, detectBrownfieldMap };
```

### Pattern: source-file walker (no glob library — pure Node)

```js
function countSourceFiles(root) {
  const EXCLUDE = new Set(['node_modules', '.git', '.planning', 'dist', 'build', '.next', 'out', 'coverage']);
  const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.py', '.go', '.rs', '.rb', '.java']);
  let count = 0;
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (EXCLUDE.has(e.name)) continue;
      if (e.name.startsWith('.') && e.name !== '.') continue; // skip dotdirs other than root
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && EXTS.has(path.extname(e.name))) count++;
    }
  }
  walk(root);
  return count;
}
```

### Pattern: dispatcher case extension in `df-tools.cjs`

After TRD 14-02 lands, `case 'detect':` already exists with `novel-domain` subcommand. Extend it:

```js
case 'detect': {
  const subcommand = args[1];
  if (subcommand === 'novel-domain') {
    cmdDetectNovelDomain(cwd, args[2], raw);
  } else if (subcommand === 'brownfield-map') {
    cmdDetectBrownfieldMap(cwd, args[2], raw);  // NEW
  } else {
    error('Unknown detect subcommand. Available: novel-domain, brownfield-map');
  }
  break;
}
```

</codebase_examples>

<anti_patterns>
- DO NOT add glob/minimatch as a dependency. Use Node's `fs.readdirSync({ withFileTypes: true })` recursively.
- DO NOT count files in `node_modules`, `.git`, `.planning`, `dist`, `build`, `.next`, `out`, `coverage`. The exclude set must be respected at every walk level.
- DO NOT integrate with `classify-session.js`. That is Phase A's work. This TRD ships the detector helper only.
- DO NOT use LLM-generated test data. Hand-built fixtures only.
- DO NOT count files larger than ~10MB or symlinks (defensive — prevents pathological scans).
</anti_patterns>

<error_recovery>
- If `cwd` argument is missing: default to `process.cwd()`.
- If `cwd` does not exist: return `{ should_offer_map: false, error: "cwd not found" }`, exit non-zero.
- If permission denied on a subdirectory during walk: catch ENOENT/EACCES, skip that directory, continue. Never crash the whole walk.
- If `.planning/codebase/` exists but is empty: still treat as `codebase_map_exists: true`. Existence is the signal; content quality is Phase A's concern.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/14-phase-f-default-on-safety/14-CONTEXT.md
@.planning/objectives/14-phase-f-default-on-safety/14-RESEARCH.md
@plugins/devflow/devflow/bin/df-tools.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
</context>

<research_context>

From 14-RESEARCH.md § "F3 — Brownfield codebase map detector":

**Signal logic (locked):**

```
1. Read .planning/ existence at <cwd>.
2. Read .planning/codebase/ existence.
3. Count source files at <cwd>: walk **/*.{ts,tsx,js,jsx,py,go,rs,rb,java,cjs,mjs}
   excluding node_modules, .git, .planning, dist, build, .next.
4. Threshold: ≥ 50 source files = "substantial code"
   (rationale: typical scaffold is < 20 files; 50+ implies real codebase).
```

**Output shape (locked):**

```json
{
  "should_offer_map": true,
  "planning_exists": true,
  "codebase_map_exists": false,
  "source_file_count": 127,
  "threshold": 50
}
```

`should_offer_map === (planning_exists && !codebase_map_exists && source_file_count >= 50)`.

**Phase A integration (deferred):** `classify-session.js` will call this detector on first session per project; no work in THIS objective.
</research_context>

<gotchas>
- `fs.readdirSync` on a non-readable directory throws ENOENT or EACCES. Catch and continue (never crash the walk).
- The exclude set must be checked by directory NAME, not full path. A path like `src/node_modules_demo/foo.ts` (legitimate naming) should still be counted; only literal `node_modules` directory name is excluded.
- This TRD's depends_on points to 14-02 (Wave 2) because both edit `df-tools.cjs` `case 'detect':` block. 14-02 creates the case; 14-03 extends the if/else chain. Sequential not parallel for that file.
- `path.extname()` returns the dot (`.ts` not `ts`). Make sure EXTS set entries include the dot.
- On filesystems with case-insensitive paths (macOS HFS+, default APFS): `node_modules` and `Node_Modules` are the same directory. `Set.has` is case-sensitive. For correctness, lowercase before checking — but practically, every project uses lowercase, so the simpler exact-match is fine.
- Symlinks: `e.isDirectory()` returns false for symlinks even if they point to dirs. Acceptable — we don't need to follow symlinks. `e.isSymbolicLink()` would skip them entirely; the simpler `isDirectory()` check naturally avoids following them.
</gotchas>

<tasks>

<task type="tdd">
  <name>Task 1: Build fixtures and detector tests (RED)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/brownfield-fixtures.cjs, plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs</files>
  <action>
Test-list checklist (comment block at top of test file — TDD playbook habit #2):

```
// Test list:
// detectBrownfieldMap (pure function):
//   1. all three conditions hold → should_offer_map:true
//   2. planning_exists:false → should_offer_map:false
//   3. codebase_map_exists:true → should_offer_map:false
//   4. source_file_count below threshold → should_offer_map:false
//   5. exactly at threshold (50) → should_offer_map:true (>= not >)
//   6. one below threshold (49) → should_offer_map:false
//   7. custom threshold parameter respected
// cmdDetectBrownfieldMap (CLI):
//   8. tmpdir scaffold: empty repo → planning_exists:false, should_offer:false
//   9. tmpdir: .planning/ only, 0 source files → should_offer:false (count below threshold)
//   10. tmpdir: .planning/ only, 60 source files → should_offer:true
//   11. tmpdir: .planning/ + .planning/codebase/ + 100 source files → should_offer:false
//   12. tmpdir: 100 source files but no .planning → should_offer:false
// File counting edge cases:
//   13. node_modules subdir with 200 files → not counted
//   14. .git subdir with 50 files → not counted
//   15. .planning/ subdir contents not counted in source count
//   16. nested src/components/ counted recursively
//   17. mixed extensions (.ts, .py, .go) all counted
//   18. unknown extension (.txt, .md) NOT counted
// Error handling:
//   19. cwd does not exist → error key, exit non-zero
//   20. permission denied on subdir → walks rest of tree, no crash
//   21. --raw mode → JSON only, no human summary
```

Build `__fixtures__/brownfield-fixtures.cjs`:

```js
function makeScaffold(tmpRoot, { hasPlanning, hasCodebaseMap, sourceFiles, otherDirs }) {
  // sourceFiles: { count, exts? } e.g. { count: 60, exts: ['.ts', '.py'] }
  // otherDirs: e.g. { 'node_modules': 200, '.git': 50 }
  // Creates the scaffold under tmpRoot, returns tmpRoot.
}
function makeSourceFile(p, name, ext) { /* writes a small valid file */ }
module.exports = { makeScaffold, makeSourceFile };
```

Build the test file. Tests must FAIL.

Run: `cd plugins/devflow/devflow/bin && node --test lib/brownfield-detector.test.cjs`
Expected: All tests fail.

Commit RED: `test(14-03): add failing tests for brownfield map detector`

# CRITICAL: Tests 13-15 (exclude-set verification) are the most likely place a regression slips in. Make them explicit.
# CRITICAL: Test 5 (boundary at threshold) and Test 6 (one below) pin down the `>=` semantics.
# GOTCHA: Use `os.tmpdir()` and create scaffold per-test in beforeEach, clean up in afterEach.
# PATTERN: Mirror node:test patterns from sibling TRDs (14-01 trd-pre-check.test.cjs, 14-02 novel-domain.test.cjs).
  </action>
  <verify>
`cd plugins/devflow/devflow/bin && node --test lib/brownfield-detector.test.cjs 2>&1 | tail -10` — exits non-zero, all 21 tests fail.
`grep -c "Test list" plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs` returns 1.
`test -f plugins/devflow/devflow/bin/lib/__fixtures__/brownfield-fixtures.cjs` succeeds.
  </verify>
  <done>
Test file with test-list checklist + 21 tests covering pure function + CLI + file counting edge cases + error handling. Fixture factory exports `makeScaffold` + `makeSourceFile`. All tests fail. RED commit landed with `test(14-03):` prefix.
  </done>
  <recovery>
If a test passes accidentally: grep `cmdDetectBrownfieldMap` in `lib/` — must be zero matches before this commit.
If fixture creation hangs or fails: ensure scaffolds are created via `fs.mkdirSync({ recursive: true })` and small dummy file writes — no network, no large files.
  </recovery>
</task>

<task type="tdd">
  <name>Task 2: Implement detector + dispatcher extension (GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/brownfield-detector.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Create `plugins/devflow/devflow/bin/lib/brownfield-detector.cjs` with the structure shown in `<codebase_examples>` above:

- Pure `detectBrownfieldMap({ planningExists, codebaseMapExists, sourceFileCount, threshold = 50 })`.
- Internal `countSourceFiles(root)` walker with hardcoded EXCLUDE + EXTS sets.
- I/O wrapper `cmdDetectBrownfieldMap(cwd, targetCwd, raw)`.
- Module exports both `cmdDetectBrownfieldMap` and `detectBrownfieldMap`.

Implement one piece at a time per TDD playbook habit #3:

1. Pure `detectBrownfieldMap` first → tests 1-7 pass.
2. `countSourceFiles` walker (with exclude + exts) → tests 13-18 pass via the CLI tests.
3. `cmdDetectBrownfieldMap` I/O wrapper → tests 8-12, 19-21 pass.

Wire into `df-tools.cjs`:
- Add `const { cmdDetectBrownfieldMap } = require('./lib/brownfield-detector.cjs');` near other lib requires.
- Extend the existing `case 'detect':` block (created in TRD 14-02) with the new `brownfield-map` subcommand:

```js
} else if (subcommand === 'brownfield-map') {
  cmdDetectBrownfieldMap(cwd, args[2], raw);
}
```

- Update the unknown-subcommand error message: `Available: novel-domain, brownfield-map`.
- Update help comment block to document `detect brownfield-map [<cwd>]`.

Run: `cd plugins/devflow/devflow/bin && node --test lib/brownfield-detector.test.cjs` — all pass.
Run full suite: `npm test` — no regressions.

Commit GREEN: `feat(14-03): implement df-tools detect brownfield-map detector`

# CRITICAL: Walker MUST handle ENOENT/EACCES via try/catch around readdirSync — silent skip, no crash.
# CRITICAL: Threshold semantics: `>=` not `>`. Test 5 pins this down.
# GOTCHA: When the dispatcher case for `detect` already exists (from TRD 14-02), only extend the if/else chain — do not duplicate the case statement. Verify via `grep -c "case 'detect':" plugins/devflow/devflow/bin/df-tools.cjs` returns 1, not 2.
# GOTCHA: The CLI argument is `targetCwd` (optional). When omitted, default to the current `cwd` parameter. This makes both `df-tools detect brownfield-map` and `df-tools detect brownfield-map /some/path` work.
# PATTERN: Mirror error/output style from existing verify subcommands.
  </action>
  <verify>
`cd plugins/devflow/devflow/bin && node --test lib/brownfield-detector.test.cjs 2>&1 | tail -3` — `# pass 21`, `# fail 0`.
`npm test 2>&1 | tail -3` — full suite passes, no regressions.
`node plugins/devflow/devflow/bin/df-tools.cjs detect brownfield-map --raw | jq -e '.should_offer_map,.source_file_count'` — emits structured JSON with all keys.
`grep -c "case 'detect':" plugins/devflow/devflow/bin/df-tools.cjs` returns 1 (no duplicate case).
`grep -c "brownfield-map" plugins/devflow/devflow/bin/df-tools.cjs` returns ≥ 2 (dispatcher + help).
  </verify>
  <done>
`lib/brownfield-detector.cjs` exports `cmdDetectBrownfieldMap` + `detectBrownfieldMap`. Pure function logic + walker + I/O wrapper implemented. Dispatcher case in df-tools.cjs extended. All TRD-03 tests pass. Full suite passes. Smoke test against this very repo (`df-tools detect brownfield-map`) returns valid JSON with `should_offer_map: false` (since `.planning/codebase/` was created by Phase H if it ran; either way, JSON is well-formed). GREEN commit landed.
  </done>
  <recovery>
If full suite regresses: only df-tools.cjs was edited (additively); revert the dispatcher extension and re-add carefully.
If walker is slow on large repos: profile with `time node ... detect brownfield-map .` against this repo. Should be <1s. If >2s, the EXCLUDE set is missing something; check the actual time-consuming directories via a debug print.
If tests for permission denied don't pass: simulate with `fs.chmodSync(subdir, 0o000)` then revert in afterEach. On systems where chmod isn't enforced, mark that test as platform-conditional.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `df-tools detect brownfield-map [<cwd>]` returns structured JSON with all five fields
- `should_offer_map` boolean is correct under all four input combinations
- File counting respects exclude set (node_modules, .git, .planning, dist, build, .next, out, coverage)
- Threshold semantics are `>=` not `>` (boundary case 50 → should_offer_map true)
- All tests pass; no regressions
</verification>

<success_criteria>
- [ ] `lib/brownfield-detector.cjs` exists, exports both `cmdDetectBrownfieldMap` and `detectBrownfieldMap`
- [ ] `lib/brownfield-detector.test.cjs` exists with test-list checklist + 21 tests
- [ ] `__fixtures__/brownfield-fixtures.cjs` exists with hand-built scaffolds
- [ ] `df-tools.cjs` `case 'detect':` extended with `brownfield-map` (no duplicate case statements)
- [ ] Two commits: RED test, GREEN feat
- [ ] All tests pass
- [ ] Smoke test against this repo emits valid JSON
</success_criteria>

<output>
After completion, create `.planning/objectives/14-phase-f-default-on-safety/14-03-SUMMARY.md`. Include:
- Two commit hashes (RED, GREEN)
- Test count delta
- Sample output of `df-tools detect brownfield-map .` (the values reflect this very repo's state)
- Note that Phase A (#26) integration is deferred — this TRD ships only the detector helper
</output>
