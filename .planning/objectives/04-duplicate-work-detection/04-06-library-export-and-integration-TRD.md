---
objective: 04-duplicate-work-detection
trd: 04-06
title: Library export lock + e2e integration tests covering all 4 resolution paths (Merge/Defer/Coordinate/Proceed-anyway)
type: tdd
confidence: high
wave: 5
depends_on: [04-01, 04-02, 04-03, 04-04, 04-05]
files_modified:
  - plugins/devflow/devflow/bin/lib/dup-detect.cjs
  - plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
autonomous: true
requirements: [SC-10]
verification_commands:
  - "npm test 2>&1 | grep -E 'EX1|E2E|integration|all 4 resolution paths' | head -10"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/dup-detect.cjs\"); const expected=[\"DEFERRED_DIR_REL\",\"DUP_DETECT_LOG_REL\",\"HARD_MATCH_THRESHOLD\",\"STRONG_FILE_OVERLAP_THRESHOLD\",\"STRONG_KEYWORD_OVERLAP_THRESHOLD\",\"_detectHardMatch\",\"_detectStrongMatch\",\"_detectWeakMatch\",\"_readPeerFilesModified\",\"_resetMocks\",\"_setRunFs\",\"_setRunOrgOverlap\",\"_setRunPeer\",\"_writeCoordinationNote\",\"_writeDeferredState\",\"applyResolution\",\"detectDuplicates\",\"formatDetectionMarkdown\",\"recordResolution\"]; const actual=Object.keys(a).sort(); require(\"assert\").deepStrictEqual(actual,expected.sort()); console.log(\"export surface OK (\" + actual.length + \" entries)\");'"
  - "npm test 2>&1 | tail -10"

must_haves:
  truths:
    - "lib/dup-detect.cjs module.exports surface is LOCKED at the full 19-entry surface (4 public + 6 internal helpers + 4 test hooks + 5 constants); asserted by EX1 export-lock test via Object.keys(module.exports).sort() deepStrictEqual against an explicit array"
    - "Banner comment marks the export block as 'LOCKED by TRD 04-06' (mirroring obj 2 / obj 3 pattern)"
    - "Integration test E2E1 — full path 'coordinate' — fixture: peer with hard match → user picks Coordinate → CONTEXT.md gets Coordination Note + JSONL gets resolution entry + execution-side workflow continues (simulated by calling applyResolution + recordResolution sequentially as the skill workflow would)"
    - "Integration test E2E2 — full path 'proceed-anyway' — same fixture → user picks Proceed-anyway → CONTEXT.md gets Coordination Note WITH **WARNING** line + JSONL entry"
    - "Integration test E2E3 — full path 'defer' — fixture with blocking match → user picks Defer → .planning/.deferred/<id>.json written with locked schema + JSONL entry"
    - "Integration test E2E4 — full path 'merge' — fixture with blocking match → user picks Merge → applyResolution returns { aborted: true, suggestion: 'git checkout ...' } + NO file writes EXCEPT JSONL entry"
    - "All E2E tests use tmpdir-isolated fixtures (no real .planning/ pollution)"
    - "All E2E tests reset mocks via _resetMocks() in finally blocks (no leakage between tests)"
    - "All test groups from prior TRDs (04-01 through 04-03) still pass — no regressions introduced by export lock"
    - "RED → GREEN → REFACTOR: test commit precedes feat commit; refactor commit only if helper renames / cleanup needed"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/dup-detect.cjs"
      provides: "Final module.exports block with 19-entry locked surface; banner comment marking the export block as 'LOCKED by TRD 04-06' (mirroring obj 2/obj 3 pattern)."
      contains: "module.exports = {"
    - path: "plugins/devflow/devflow/bin/lib/dup-detect.test.cjs"
      provides: "Final integration tests: Group EX (export-lock EX1), Group E2E (E2E1-E2E4 covering all 4 resolution paths)."
      contains: "deepStrictEqual"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.test.cjs::EX (export-lock test)"
      to: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::module.exports"
      via: "deepStrictEqual on Object.keys(module.exports).sort()"
      pattern: "deepStrictEqual.*module.exports"
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.test.cjs::E2E (resolution path tests)"
      to: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::detectDuplicates + applyResolution + recordResolution"
      via: "compose end-to-end test scenario per resolution path"
      pattern: "detectDuplicates.*applyResolution.*recordResolution"
---

<objective>
Lock the `lib/dup-detect.cjs` export surface and run end-to-end integration tests that simulate all 4 resolution paths (Merge / Defer / Coordinate / Proceed-anyway).

This is the final TRD: it asserts the module's public contract is stable (every TRD before added EXACTLY the symbols documented in CONTEXT.md), and exercises the full detection → resolution → persistence pipeline for each user choice.

Closes SC-10 (export surface lock + integration test covering all 4 resolution paths).

Output:
1. Updated `lib/dup-detect.cjs` with banner-commented + locked module.exports
2. Test groups EX (export lock) + E2E (E2E1-E2E4) in test file
3. Verification that 04-01 through 04-05 baseline tests all still pass
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── dup-detect.cjs                                ← MODIFY  (banner-comment + lock module.exports)
└── dup-detect.test.cjs                           ← MODIFY  (add EX + E2E groups)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing export-lock pattern** — `lib/awareness.cjs` (obj 2 TRD 02-07 final):

```js
// ─── module.exports — LOCKED by TRD 02-07 (14-entry surface; SC-9) ───────────
//
// This block is the AUTHORITATIVE export surface for lib/awareness.cjs.
// Asserted by L1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the L1 test + CONTEXT.md §"Module surface".

module.exports = {
  parseStateMd, aggregateOrgByProductQuarter, parseTaskListFallback,
  scanPeer, scanOrg, readCache, writeCache, isStale,
  _setRunGit, _resetGitMock,
  DEFAULT_TTL_MINUTES, DEFAULT_STALE_DAYS, DEFAULT_BRANCH_PATTERNS, AWARENESS_CACHE_REL,
};
```

**Mirror for `lib/dup-detect.cjs`** — locked at 19-entry surface:

```js
// ─── module.exports — LOCKED by TRD 04-06 (19-entry surface; SC-10) ──────────
//
// This block is the AUTHORITATIVE export surface for lib/dup-detect.cjs.
// Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the EX1 test + CONTEXT.md §"Module surface".

module.exports = {
  // Public API (TDD'd):
  detectDuplicates,
  formatDetectionMarkdown,
  recordResolution,
  applyResolution,

  // Test hooks:
  _setRunPeer,
  _setRunOrgOverlap,
  _setRunFs,
  _resetMocks,

  // Internal helpers (exposed for tests):
  _detectHardMatch,
  _detectStrongMatch,
  _detectWeakMatch,
  _readPeerFilesModified,
  _writeCoordinationNote,
  _writeDeferredState,

  // Constants:
  HARD_MATCH_THRESHOLD,
  STRONG_FILE_OVERLAP_THRESHOLD,
  STRONG_KEYWORD_OVERLAP_THRESHOLD,
  DUP_DETECT_LOG_REL,
  DEFERRED_DIR_REL,
};
```

**Existing export-lock test pattern** — `lib/awareness.test.cjs::L1` (obj 2):

```js
test('L1 — export surface locked', () => {
  const expected = [
    'parseStateMd', 'aggregateOrgByProductQuarter', 'parseTaskListFallback',
    'scanPeer', 'scanOrg', 'readCache', 'writeCache', 'isStale',
    '_setRunGit', '_resetGitMock',
    'DEFAULT_TTL_MINUTES', 'DEFAULT_STALE_DAYS', 'DEFAULT_BRANCH_PATTERNS', 'AWARENESS_CACHE_REL',
  ].sort();
  const actual = Object.keys(require('./awareness.cjs')).sort();
  assert.deepStrictEqual(actual, expected);
});
```

**Existing E2E pattern** — obj 3's TRD 03-07 dogfood test gives the shape; obj 4 adapts to in-process E2E (no live CLI subprocess, no live git/gh):

```js
test('E2E1 — coordinate path: detect → ask → resolve → CONTEXT note + JSONL', () => {
  const tmp = _mkTmpRepo(); // helper from 04-02 tests
  const objDir = path.join(tmp, '.planning', 'objectives', '04-test');
  fs.mkdirSync(objDir, { recursive: true });
  const padded = '04';

  // 1. Mock peer + org-overlap returning a hard match
  const fix_ = fix.buildDupDetectFixtures('hard_github_issue');
  dd._setRunPeer(() => fix_.peer_scan);
  dd._setRunOrgOverlap(() => fix_.org_overlap);

  try {
    // 2. detectDuplicates
    const detection = dd.detectDuplicates({
      objective_id: '04', mode: 'plan', cwd: tmp,
      current_github_issue: fix_.current_github_issue,
      current_files_modified: fix_.current_files_modified,
      current_keywords: fix_.current_keywords,
    });
    assert.strictEqual(detection.blocking, true);
    assert.ok(detection.matches.length > 0);

    // 3. Simulate user picking Coordinate
    const result = dd.applyResolution({
      resolution: 'coordinate',
      objective_id: '04',
      peer_branch: detection.matches[0].peer_branch,
      peer_objective: detection.matches[0].peer_objective,
      cwd: tmp,
      detection,
      objective_dir: objDir,
      padded_objective: padded,
    });
    assert.strictEqual(result.wrote_coordination_note, true);

    // 4. Record resolution
    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: true,
      top_match: { strength: 'hard', peer: detection.matches[0].peer_branch, score: 100 },
      resolution: 'coordinate', cwd: tmp,
    });

    // 5. Assert CONTEXT.md has Coordination Note
    const ctx = fs.readFileSync(path.join(objDir, '04-CONTEXT.md'), 'utf-8');
    assert.match(ctx, /## Coordination Note/);
    assert.match(ctx, /Coordinate/);

    // 6. Assert JSONL has 1 line with resolution=coordinate
    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim();
    assert.strictEqual(log.split('\n').length, 1);
    const rec = JSON.parse(log);
    assert.strictEqual(rec.resolution, 'coordinate');
  } finally {
    dd._resetMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
```

</codebase_examples>

<anti_patterns>

- **DO NOT add new public exports beyond the 19 listed.** If the implementation in 04-01/04-02/04-03 had more exports than locked, fix the implementation (remove unintended exports). The lock test is authoritative.
- **DO NOT skip the export lock test.** It's a regression guard for future TRDs.
- **DO NOT use real CLI subprocess in E2E tests.** The CLI tests (CLI1-CLI9 from prior TRDs) cover spawn-based flow. E2E here exercises the LIBRARY surface in-process so failures point at the right module.
- **DO NOT mock `applyResolution` or `recordResolution` in E2E tests.** Tests verify their REAL behavior (file writes, JSONL append).
- **DO NOT skip the `_resetMocks()` cleanup.** Mock leakage across E2E tests will cause flaky behavior.
- **DO NOT modify CONTEXT.md prose** to claim 18 or 20 entries — the export count is 19 and CONTEXT.md is the source of truth for the module surface.

</anti_patterns>

<error_recovery>

- **EX1 fails because surface count differs from 19** → check whether prior TRDs accidentally exported extras (e.g., `_runFs`, `_sanitize`). Audit `module.exports` of each prior TRD's region; remove unintended exports.
- **E2E test fails because `_resetMocks` doesn't reset all hooks** → patch `_resetMocks` in dup-detect.cjs to reset ALL three hooks (`_runFs`, `_runPeer`, `_runOrgOverlap`).
- **tmpdir cleanup fails** → tests use try/finally with `fs.rmSync(tmp, { recursive: true, force: true })`; orphaned dirs auto-prune on system reboot.
- **CONTEXT.md path or padded_objective mismatch in E2E** → ensure tests pass `objective_dir` and `padded_objective` consistent with the test's tmpdir layout (`.planning/objectives/04-test/04-CONTEXT.md`).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/04-duplicate-work-detection/04-CONTEXT.md
@.planning/objectives/04-duplicate-work-detection/04-RESEARCH.md
@.planning/objectives/04-duplicate-work-detection/04-01-detection-engine-and-fixtures-TRD.md
@.planning/objectives/04-duplicate-work-detection/04-02-resolution-recorder-TRD.md
@.planning/objectives/04-duplicate-work-detection/04-03-format-detection-markdown-TRD.md
@.planning/objectives/04-duplicate-work-detection/04-04-plan-skill-integration-TRD.md
@.planning/objectives/04-duplicate-work-detection/04-05-execute-skill-integration-TRD.md

# File this TRD locks:
@plugins/devflow/devflow/bin/lib/dup-detect.cjs
@plugins/devflow/devflow/bin/lib/dup-detect.test.cjs

# Pattern reference (export-lock + integration test):
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/awareness.test.cjs
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
@plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
</context>

<gotchas>

- **`Object.keys(module.exports).sort()`** is the deterministic comparator. Tests must alphabetize.
- **`deepStrictEqual` rejects extra/missing keys** — exactly the assertion needed for the lock test.
- **`_resetMocks` must reset ALL three hooks** (`_runFs`, `_runPeer`, `_runOrgOverlap`). Verify in 04-01's implementation that it does (it should). If not, patch in this TRD.
- **`_mkTmpRepo` helper** is defined in 04-02's test additions. E2E tests reuse it (or redefine in 04-06's test additions if 04-02 didn't export it).
- **Reading CONTEXT.md after applyResolution** requires `fs.readFileSync` (real fs, not mock) since `_writeCoordinationNote` writes to disk via `_runFs` (which defaults to realFs). Tests rely on real fs reads after the write.
- **JSONL parse**: `JSON.parse(log_content.trim())` works only when there's exactly one line. For multi-line logs, split on '\n' first.
- **Defer test (E2E3) writes to `.planning/.deferred/<id>.json`** — assert via `fs.existsSync` + `JSON.parse(fs.readFileSync(...))`. Schema check: objective_id, deferred_at, mode, blocking_match.
- **Merge test (E2E4) does NOT write coordination note or defer state** — assert via `fs.existsSync(...) === false` for both files. JSONL log entry IS written.

</gotchas>

## Test list

### Group EX (export-lock)
- EX1: `Object.keys(require('./dup-detect.cjs')).sort()` deepStrictEqual to the explicit 19-entry array
- EX2: each export entry is a function, an object/Map, or a primitive constant (no undefined leaks)
- EX3: banner comment present (`LOCKED by TRD 04-06`)

### Group E2E (end-to-end resolution paths)
- E2E1: coordinate path — fixture hard match → user picks Coordinate → CONTEXT.md has Coordination Note + JSONL has resolution=coordinate
- E2E2: proceed-anyway path — fixture hard match → user picks Proceed-anyway → CONTEXT.md has Coordination Note WITH **WARNING** line + JSONL has resolution=proceed-anyway
- E2E3: defer path — fixture hard match → user picks Defer → .planning/.deferred/04.json written with locked schema + JSONL has resolution=defer
- E2E4: merge path — fixture hard match → user picks Merge → applyResolution returns { aborted: true, suggestion: ... } + NO CONTEXT.md write + NO defer file + JSONL has resolution=merge
- E2E5: no-match path execute mode — empty fixtures → blocking: false → no AskUserQuestion (simulated by skipping resolve call) → JSONL has resolution=none
- E2E6: no-match path plan mode with advisory — weak fixture → blocking: false, advisory length > 0 → no AskUserQuestion → JSONL has resolution=none

<tasks>

<task type="auto">
  <name>Task 1: RED — write failing tests for export lock + 4 resolution path E2Es</name>
  <files>
    plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
  </files>
  <action>
**RED PHASE PER TDD PLAYBOOK HABIT 3 — one test at a time.**

Append Group EX + Group E2E tests to existing `dup-detect.test.cjs`.

```js
// ─── TRD 04-06: export lock + e2e integration ─────────────────────────────────

test('EX1 — export surface locked at 19 entries', () => {
  const expected = [
    'detectDuplicates', 'formatDetectionMarkdown', 'recordResolution', 'applyResolution',
    '_setRunPeer', '_setRunOrgOverlap', '_setRunFs', '_resetMocks',
    '_detectHardMatch', '_detectStrongMatch', '_detectWeakMatch',
    '_readPeerFilesModified', '_writeCoordinationNote', '_writeDeferredState',
    'HARD_MATCH_THRESHOLD', 'STRONG_FILE_OVERLAP_THRESHOLD', 'STRONG_KEYWORD_OVERLAP_THRESHOLD',
    'DUP_DETECT_LOG_REL', 'DEFERRED_DIR_REL',
  ].sort();
  const actual = Object.keys(require('./dup-detect.cjs')).sort();
  assert.deepStrictEqual(actual, expected);
  assert.strictEqual(actual.length, 19);
});

test('EX2 — every export is non-undefined', () => {
  const m = require('./dup-detect.cjs');
  for (const k of Object.keys(m)) {
    assert.notStrictEqual(typeof m[k], 'undefined', `${k} is undefined`);
  }
});

test('EX3 — banner comment present', () => {
  const src = fs.readFileSync(require.resolve('./dup-detect.cjs'), 'utf-8');
  assert.match(src, /LOCKED by TRD 04-06/);
});

// ─── E2E ──────────────────────────────────────────────────────────────────────

function _e2eSetup() {
  const tmp = _mkTmpRepo(); // defined in 04-02 test additions
  const objDir = path.join(tmp, '.planning', 'objectives', '04-test');
  fs.mkdirSync(objDir, { recursive: true });
  return { tmp, objDir, padded: '04' };
}

test('E2E1 — coordinate path: detect → resolve → CONTEXT note + JSONL', () => {
  const { tmp, objDir, padded } = _e2eSetup();
  const fix_ = fix.buildDupDetectFixtures('hard_github_issue');
  dd._setRunPeer(() => fix_.peer_scan);
  dd._setRunOrgOverlap(() => fix_.org_overlap);
  try {
    const detection = dd.detectDuplicates({
      objective_id: '04', mode: 'plan', cwd: tmp,
      current_github_issue: fix_.current_github_issue,
      current_files_modified: fix_.current_files_modified,
      current_keywords: fix_.current_keywords,
    });
    assert.strictEqual(detection.blocking, true);

    const result = dd.applyResolution({
      resolution: 'coordinate', objective_id: '04',
      peer_branch: detection.matches[0].peer_branch,
      peer_objective: detection.matches[0].peer_objective,
      cwd: tmp, detection, objective_dir: objDir, padded_objective: padded,
    });
    assert.strictEqual(result.wrote_coordination_note, true);

    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: true,
      top_match: { strength: 'hard', peer: detection.matches[0].peer_branch, score: 100 },
      resolution: 'coordinate', cwd: tmp,
    });

    const ctx = fs.readFileSync(path.join(objDir, '04-CONTEXT.md'), 'utf-8');
    assert.match(ctx, /## Coordination Note/);
    assert.match(ctx, /Coordinate/);
    assert.doesNotMatch(ctx, /\*\*WARNING:\*\*/); // no warning in plain coordinate

    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim();
    const rec = JSON.parse(log);
    assert.strictEqual(rec.resolution, 'coordinate');
    assert.strictEqual(rec.blocking, true);
  } finally {
    dd._resetMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('E2E2 — proceed-anyway path: CONTEXT note WITH **WARNING** + JSONL', () => {
  const { tmp, objDir, padded } = _e2eSetup();
  const fix_ = fix.buildDupDetectFixtures('hard_github_issue');
  dd._setRunPeer(() => fix_.peer_scan);
  dd._setRunOrgOverlap(() => fix_.org_overlap);
  try {
    const detection = dd.detectDuplicates({
      objective_id: '04', mode: 'plan', cwd: tmp,
      current_github_issue: fix_.current_github_issue,
      current_files_modified: fix_.current_files_modified,
      current_keywords: fix_.current_keywords,
    });
    const result = dd.applyResolution({
      resolution: 'proceed-anyway', objective_id: '04',
      peer_branch: detection.matches[0].peer_branch,
      peer_objective: detection.matches[0].peer_objective,
      cwd: tmp, detection, objective_dir: objDir, padded_objective: padded,
    });
    assert.strictEqual(result.warning_appended, true);

    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: true,
      top_match: { strength: 'hard', peer: detection.matches[0].peer_branch, score: 100 },
      resolution: 'proceed-anyway', cwd: tmp,
    });

    const ctx = fs.readFileSync(path.join(objDir, '04-CONTEXT.md'), 'utf-8');
    assert.match(ctx, /\*\*WARNING:\*\*/);
    assert.match(ctx, /Proceed-anyway/);

    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim();
    const rec = JSON.parse(log);
    assert.strictEqual(rec.resolution, 'proceed-anyway');
  } finally {
    dd._resetMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('E2E3 — defer path: .planning/.deferred/04.json written + JSONL', () => {
  const { tmp, objDir, padded } = _e2eSetup();
  const fix_ = fix.buildDupDetectFixtures('hard_chain_match');
  dd._setRunPeer(() => fix_.peer_scan);
  dd._setRunOrgOverlap(() => fix_.org_overlap);
  try {
    const detection = dd.detectDuplicates({
      objective_id: '04', mode: 'plan', cwd: tmp,
      current_github_issue: fix_.current_github_issue,
      current_files_modified: fix_.current_files_modified,
      current_keywords: fix_.current_keywords,
    });
    const result = dd.applyResolution({
      resolution: 'defer', objective_id: '04',
      peer_branch: null,  // org-overlap match has no peer_branch
      peer_objective: detection.matches[0].peer_objective,
      cwd: tmp, detection, objective_dir: objDir, padded_objective: padded,
    });
    assert.strictEqual(result.wrote_deferred, true);
    assert.ok(result.defer_path && result.defer_path.endsWith('04.json'));

    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: true,
      top_match: { strength: 'hard', peer: null, score: 100 },
      resolution: 'defer', cwd: tmp,
    });

    const deferPath = path.join(tmp, '.planning', '.deferred', '04.json');
    assert.ok(fs.existsSync(deferPath));
    const state = JSON.parse(fs.readFileSync(deferPath, 'utf-8'));
    assert.strictEqual(state.objective_id, '04');
    assert.strictEqual(state.mode, 'plan');
    assert.ok(state.deferred_at);
    assert.ok(state.blocking_match);
    assert.strictEqual(state.blocking_match.strength, 'hard');

    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim();
    const rec = JSON.parse(log);
    assert.strictEqual(rec.resolution, 'defer');
  } finally {
    dd._resetMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('E2E4 — merge path: aborted + suggestion, NO CONTEXT note, NO defer file', () => {
  const { tmp, objDir, padded } = _e2eSetup();
  const fix_ = fix.buildDupDetectFixtures('hard_github_issue');
  dd._setRunPeer(() => fix_.peer_scan);
  dd._setRunOrgOverlap(() => fix_.org_overlap);
  try {
    const detection = dd.detectDuplicates({
      objective_id: '04', mode: 'plan', cwd: tmp,
      current_github_issue: fix_.current_github_issue,
      current_files_modified: fix_.current_files_modified,
      current_keywords: fix_.current_keywords,
    });

    // Capture stdout to assert the abort message renders (don't assert exact match — just that it ran)
    const result = dd.applyResolution({
      resolution: 'merge', objective_id: '04',
      peer_branch: detection.matches[0].peer_branch,
      peer_objective: detection.matches[0].peer_objective,
      cwd: tmp, detection, objective_dir: objDir, padded_objective: padded,
    });
    assert.strictEqual(result.aborted, true);
    assert.match(result.suggestion, /git checkout/);

    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: true,
      top_match: { strength: 'hard', peer: detection.matches[0].peer_branch, score: 100 },
      resolution: 'merge', cwd: tmp,
    });

    // Assert NO CONTEXT.md note written (file may not exist; if it does, must be empty of Coordination Note)
    const ctxPath = path.join(objDir, '04-CONTEXT.md');
    if (fs.existsSync(ctxPath)) {
      const ctx = fs.readFileSync(ctxPath, 'utf-8');
      assert.doesNotMatch(ctx, /## Coordination Note/);
    }

    // Assert NO defer file
    const deferPath = path.join(tmp, '.planning', '.deferred', '04.json');
    assert.strictEqual(fs.existsSync(deferPath), false);

    // JSONL still recorded
    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim();
    const rec = JSON.parse(log);
    assert.strictEqual(rec.resolution, 'merge');
  } finally {
    dd._resetMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('E2E5 — no-match execute mode: blocking false, JSONL only', () => {
  const { tmp } = _e2eSetup();
  const fix_ = fix.buildDupDetectFixtures('none');
  dd._setRunPeer(() => fix_.peer_scan);
  dd._setRunOrgOverlap(() => fix_.org_overlap);
  try {
    const detection = dd.detectDuplicates({
      objective_id: '04', mode: 'execute', cwd: tmp,
      current_github_issue: fix_.current_github_issue,
      current_files_modified: fix_.current_files_modified,
      current_keywords: fix_.current_keywords,
    });
    assert.strictEqual(detection.blocking, false);
    assert.deepStrictEqual(detection.advisory, []);

    dd.recordResolution({
      objective_id: '04', mode: 'execute', blocking: false,
      top_match: null, resolution: 'none', cwd: tmp,
    });

    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim();
    const rec = JSON.parse(log);
    assert.strictEqual(rec.resolution, 'none');
    assert.strictEqual(rec.blocking, false);
    assert.strictEqual(rec.mode, 'execute');
  } finally {
    dd._resetMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('E2E6 — no-match plan mode with advisory', () => {
  const { tmp } = _e2eSetup();
  const fix_ = fix.buildDupDetectFixtures('weak_keyword');
  dd._setRunPeer(() => fix_.peer_scan);
  dd._setRunOrgOverlap(() => fix_.org_overlap);
  try {
    const detection = dd.detectDuplicates({
      objective_id: '04', mode: 'plan', cwd: tmp,
      current_github_issue: fix_.current_github_issue,
      current_files_modified: fix_.current_files_modified,
      current_keywords: fix_.current_keywords,
    });
    assert.strictEqual(detection.blocking, false);
    assert.ok(detection.advisory.length > 0);

    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: false,
      top_match: null, resolution: 'none', cwd: tmp,
    });

    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim();
    const rec = JSON.parse(log);
    assert.strictEqual(rec.resolution, 'none');
  } finally {
    dd._resetMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
```

# CRITICAL: All E2E tests use _resetMocks in finally. Mock leakage between tests is the most likely flake.
# PATTERN: Mirror obj 2 TRD 02-07 export-lock test pattern + obj 3 TRD 03-07 dogfood pattern.

Run `npm test 2>&1 | grep -E 'EX|E2E|fail|FAIL' | head -20` — should show:
- EX1 currently FAILING (no banner comment yet, OR exports list mismatched if 04-01/02/03 exported extras)
- EX2 may pass (if all current exports are defined)
- EX3 currently FAILING (banner not added yet)
- E2E1-E2E6 currently PASS or FAIL depending on whether `_resetMocks` properly resets all hooks; if 04-01 implemented `_resetMocks` correctly, these should already pass since they use existing functions.

If E2E tests pass on the RED phase already (because the underlying functions work), that's acceptable — the EX tests are the actual RED for this TRD. EX1 should fail until the export list is finalized; EX3 should fail until the banner is added.

**Commit RED phase:**
```bash
git add plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
git commit -m "test(04-06): add export lock + 6 e2e resolution path tests

RED phase: EX1 fails until 19-entry surface is locked + alphabetized correctly;
EX3 fails until banner comment 'LOCKED by TRD 04-06' is added. E2E1-E2E6 may
pass if 04-01/02/03 implementations are correct (they exercise existing functions
end-to-end), confirming the integration contract.

Test groups: EX (export lock), E2E (Merge/Defer/Coordinate/Proceed-anyway/no-match plan/no-match execute)."
```
  </action>
  <verify>
`npm test 2>&1 | grep -E 'EX1|EX3|E2E\d' | head -10` shows at minimum EX1 and EX3 failing. E2E tests may pass if 04-01/02/03 are correct.
  </verify>
  <done>
test commit lands. EX1 (export lock) and EX3 (banner) fail; E2E1-E2E6 cover all 4 resolution paths + no-match cases.
  </done>
  <recovery>
If E2E tests fail because `_resetMocks` doesn't reset all hooks: that's a 04-01 bug — patch in this TRD's GREEN phase by extending `_resetMocks` to reset _runFs as well as _runPeer + _runOrgOverlap. Document the fix in the GREEN commit message.
If EX1 fails because the actual exports include extras (e.g., `_runFs`, `_sanitize`): identify which TRD added them; remove unintended extras in the GREEN phase by trimming `module.exports` to the locked list.
If `_e2eSetup` or `_mkTmpRepo` is not in scope: define them in 04-06's test additions if 04-02 didn't (likely they were inline in 04-02 tests; copy/define them at the top of the 04-06 region).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — lock module.exports (banner + 19-entry surface) + verify E2E pass</name>
  <files>
    plugins/devflow/devflow/bin/lib/dup-detect.cjs
  </files>
  <action>
**GREEN PHASE PER TDD PLAYBOOK HABIT 3 — minimal change to pass the RED tests.**

**Replace the module.exports block at the bottom of `lib/dup-detect.cjs`** with the locked + banner-commented version:

```js
// ─── module.exports — LOCKED by TRD 04-06 (19-entry surface; SC-10) ──────────
//
// This block is the AUTHORITATIVE export surface for lib/dup-detect.cjs.
// Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the EX1 test + CONTEXT.md §"Module surface".

module.exports = {
  // Public API (TDD'd):
  detectDuplicates,
  formatDetectionMarkdown,
  recordResolution,
  applyResolution,

  // Test hooks:
  _setRunPeer,
  _setRunOrgOverlap,
  _setRunFs,
  _resetMocks,

  // Internal helpers (exposed for tests):
  _detectHardMatch,
  _detectStrongMatch,
  _detectWeakMatch,
  _readPeerFilesModified,
  _writeCoordinationNote,
  _writeDeferredState,

  // Constants:
  HARD_MATCH_THRESHOLD,
  STRONG_FILE_OVERLAP_THRESHOLD,
  STRONG_KEYWORD_OVERLAP_THRESHOLD,
  DUP_DETECT_LOG_REL,
  DEFERRED_DIR_REL,
};
```

**Verify `_resetMocks` resets all three hooks**. Audit `_resetMocks` in dup-detect.cjs (added in 04-01); it should be:

```js
function _resetMocks() {
  _runFs = realFs;
  _runPeer = (opts) => aw.scanPeer(opts);
  _runOrgOverlap = (opts) => orgaw.scanOrgOverlap(opts);
}
```

If 04-01's implementation only resets some of these, patch it. (Likely 04-01 already resets all three per the spec — verify.)

**Run tests until green:**
```bash
npm test 2>&1 | grep -E 'EX1|EX2|EX3|E2E\d|fail|FAIL' | head -20
```

Expect EX1, EX2, EX3, E2E1-E2E6 all PASS.

**Commit GREEN phase:**
```bash
git add plugins/devflow/devflow/bin/lib/dup-detect.cjs
git commit -m "feat(04-06): lock dup-detect.cjs export surface + banner

GREEN phase: module.exports block at lib/dup-detect.cjs is now banner-commented
'LOCKED by TRD 04-06' and contains exactly 19 entries:
- 4 public (detectDuplicates, formatDetectionMarkdown, recordResolution, applyResolution)
- 4 test hooks (_setRunPeer, _setRunOrgOverlap, _setRunFs, _resetMocks)
- 6 internal helpers (signal detectors + readers + writers)
- 5 constants (thresholds + path constants)

EX1 export-lock test: deepStrictEqual on Object.keys(module.exports).sort().
EX2 + EX3 verify all exports defined and banner present.
E2E1-E2E4 cover all 4 resolution paths in-process (Merge/Defer/Coordinate/
Proceed-anyway). E2E5-E2E6 cover no-match cases (execute / plan with advisory).

Closes SC-10. Objective 4 DONE — module surface stable; integration tests
proving end-to-end behavior across all 4 resolution paths."
```
  </action>
  <verify>
- `npm test 2>&1 | grep -E 'EX1|EX2|EX3|E2E\d' | head -10` — all pass.
- `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/dup-detect.cjs"); const expected=["DEFERRED_DIR_REL","DUP_DETECT_LOG_REL","HARD_MATCH_THRESHOLD","STRONG_FILE_OVERLAP_THRESHOLD","STRONG_KEYWORD_OVERLAP_THRESHOLD","_detectHardMatch","_detectStrongMatch","_detectWeakMatch","_readPeerFilesModified","_resetMocks","_setRunFs","_setRunOrgOverlap","_setRunPeer","_writeCoordinationNote","_writeDeferredState","applyResolution","detectDuplicates","formatDetectionMarkdown","recordResolution"]; const actual=Object.keys(a).sort(); require("assert").deepStrictEqual(actual, expected); console.log("OK 19 entries");'`
- `grep -c 'LOCKED by TRD 04-06' plugins/devflow/devflow/bin/lib/dup-detect.cjs` returns ≥ 1.
- `npm test 2>&1 | tail -5` shows full suite passing (842 + 04-01..04-05 + 04-06 tests).
  </verify>
  <done>
feat commit lands. RED tests are now GREEN. dup-detect.cjs module.exports is locked at 19 entries with banner comment. All 4 resolution paths covered by E2E integration tests. Objective 4 DONE.
  </done>
  <recovery>
If EX1 fails because the alphabetized actual list has 18 or 20 entries instead of 19: audit each prior TRD's region exports. Most likely culprit: 04-01 exported `_runGit` (private helper) by accident, OR 04-03 added `_sanitize` / `_renderMatchEntry` / etc. to the export block. Trim to the locked list.
If E2E1 fails because `_writeCoordinationNote` doesn't accept `objective_dir` as a path (vs name): re-read 04-02 implementation. The function signature is `_writeCoordinationNote(objective_dir, padded, note_data)` — first param is the FULL path to the directory.
If E2E4's "NO CONTEXT.md note" assertion fails because some prior test left a CONTEXT.md in tmpdir: ensure each E2E test creates a fresh tmpdir via `_e2eSetup()` and cleans up in finally.
If `_resetMocks` doesn't reset _runFs leading to leakage: extend `_resetMocks` body to include `_runFs = realFs;`. Commit as part of GREEN feat (it's an enabling fix for the lock test).
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none — repo has no lint command per CLAUDE.md)</lint>
<test>npm test</test>
<build>(none — no build step)</build>
</validation_gates>

<verification>
1. `npm test` passes — all 04-01 / 04-02 / 04-03 / 04-04 / 04-05 / 04-06 tests pass; no regressions in 842 obj-3 baseline.
2. `lib/dup-detect.cjs` exports exactly 19 entries (asserted by EX1 deepStrictEqual).
3. Banner comment 'LOCKED by TRD 04-06' present.
4. E2E1-E2E4 cover Merge/Defer/Coordinate/Proceed-anyway resolution paths in-process.
5. E2E5-E2E6 cover no-match cases (execute mode silent + plan-mode advisory present).
6. `_resetMocks()` resets all three hooks (_runFs, _runPeer, _runOrgOverlap).
7. SC-10 (export surface lock + integration covering all 4 resolution paths) closed.
</verification>

<success_criteria>
- [ ] `lib/dup-detect.cjs` module.exports locked at 19 entries with banner comment
- [ ] EX1 export-lock test passes (deepStrictEqual on alphabetized keys)
- [ ] EX2 + EX3 banner / non-undefined assertions pass
- [ ] E2E1 (coordinate path) passes — CONTEXT.md note + JSONL recorded
- [ ] E2E2 (proceed-anyway path) passes — CONTEXT.md note WITH **WARNING** + JSONL recorded
- [ ] E2E3 (defer path) passes — .planning/.deferred/04.json + JSONL recorded
- [ ] E2E4 (merge path) passes — aborted + suggestion + NO CONTEXT note + NO defer file + JSONL recorded
- [ ] E2E5 (no-match execute) passes — JSONL only, no prompts
- [ ] E2E6 (no-match plan with advisory) passes — JSONL only, advisory not blocking
- [ ] RED commit (test:) precedes GREEN commit (feat:) per TDD Playbook habit 3
- [ ] No regressions in 04-01 / 04-02 / 04-03 / 04-04 / 04-05 baseline tests
- [ ] SC-10 (export surface + 4 resolution path integration) closed
</success_criteria>

<output>
After completion, create `.planning/objectives/04-duplicate-work-detection/04-06-library-export-and-integration-SUMMARY.md`. Mark Objective 4 as DONE in STATE.md.
</output>
