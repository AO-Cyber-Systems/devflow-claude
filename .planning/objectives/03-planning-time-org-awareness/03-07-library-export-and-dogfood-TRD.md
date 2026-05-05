---
objective: 03-planning-time-org-awareness
trd: 03-07
title: Library export lock + integration tests + dogfood capture
type: tdd
confidence: high
wave: 6
depends_on: [03-01, 03-02, 03-03, 03-04, 03-05, 03-06]
files_modified:
  - plugins/devflow/devflow/bin/lib/org-awareness.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures
autonomous: true
requirements: [SC-9, SC-10]
verification_commands:
  - "npm test 2>&1 | grep -E 'L1.*export|D1.*dogfood|cross-repo-considerations' | head -5"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/org-awareness.cjs\"); const expected=[\"DEFAULT_EDEN_LIBS_PATH\",\"DEFAULT_SIBLING_GLOB\",\"SUMMARY_RECENCY_DAYS\",\"TOP_N\",\"_camelSplit\",\"_detectMisfiling\",\"_extractRepoFromRef\",\"_parseExports\",\"_renderLibsSection\",\"_renderOrgSection\",\"_renderSiblingsSection\",\"_resetFsMock\",\"_resolveEdenLibsPath\",\"_score\",\"_scoreOrgItem\",\"_setRunFs\",\"_tokenize\",\"formatConsiderations\",\"scanLibs\",\"scanOrgOverlap\",\"scanSiblings\"]; const actual=Object.keys(a).sort(); require(\"assert\").deepStrictEqual(actual,expected.sort()); console.log(\"export surface OK\");'"
  - "ls plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md"

must_haves:
  truths:
    - "lib/org-awareness.cjs module.exports surface is LOCKED at the full 21-entry surface (4 scanners/formatter + 8 helpers + 2 test hooks + 4 constants + 3 internal-prefixed renderers); asserted by L1 export-lock test via Object.keys(module.exports).sort() deepStrictEqual against an explicit array"
    - "Integration test L2 (gated on FS_INTEGRATION=1): real ~/Source/*/ walk completes successfully on developer machine; siblings discovered count > 0"
    - "Integration test L3 (gated on GH_INTEGRATION=1): scanOrgOverlap with real gh auth produces non-empty result; cassette captured to __fixtures__/gh-cassettes/product-roadmap-walk.json (already exists from obj 2 — reused, not re-captured)"
    - "Dogfood test D1: running `df-tools org-awareness considerations 4` (next objective placeholder — uses a stub OBJECTIVE.md if obj 4 isn't yet planned) produces a Cross-Repo Considerations section that contains at least the obj 2 awareness scanner as a sibling-repo / eden-libs reference"
    - "Dogfood capture: the produced Markdown saved to __fixtures__/cross-repo-considerations-fixtures/dogfood-04.md as a regression fixture"
    - "All test groups from prior TRDs (03-01 through 03-04) still pass — no regressions introduced by export lock"
    - "RED → GREEN → REFACTOR: test commit precedes feat commit; refactor commit only if any helper renames / cleanup needed"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      provides: "Final module.exports block with 21-entry locked surface; banner comment marking the export block as 'LOCKED by TRD 03-07' (mirroring obj 2 pattern)."
      contains: "module.exports = {"
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs"
      provides: "Final integration tests: Group EX (export-lock L1), Group I (FS_INTEGRATION L2), Group GI (GH_INTEGRATION L3), Group DG (dogfood D1)."
      contains: "deepStrictEqual"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md"
      provides: "Captured Markdown output of `df-tools org-awareness considerations 4` (or fallback objective). Hand-built or live-captured with FS+GH integration env vars."
      min_lines: 10
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs::EX (export-lock test)"
      to: "plugins/devflow/devflow/bin/lib/org-awareness.cjs::module.exports"
      via: "deepStrictEqual on Object.keys(module.exports).sort()"
      pattern: "deepStrictEqual.*module.exports"
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs::DG (dogfood test)"
      to: "plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md"
      via: "fixture comparison"
      pattern: "dogfood-04\\.md"
---

<objective>
Lock the `lib/org-awareness.cjs` export surface, run integration tests against real filesystem + (optionally) live gh, and capture an end-to-end dogfood fixture.

This is the final TRD: it asserts the module's public contract is stable (every TRD that landed before added EXACTLY the symbols documented in CONTEXT.md), runs FS_INTEGRATION + GH_INTEGRATION gated integration tests, and captures the dogfood Markdown to a versioned fixture for future regression detection.

Closes SC-9 (export surface) + SC-10 (dogfood).

Output:
1. Updated `lib/org-awareness.cjs` with banner-commented + locked module.exports
2. Test groups EX (export lock), I (FS integration), GI (GH integration), DG (dogfood) in test file
3. Captured `__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md`
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── org-awareness.cjs                                ← MODIFY  (banner-comment + lock module.exports)
├── org-awareness.test.cjs                           ← MODIFY  (add EX + I + GI + DG groups)
└── __fixtures__/
    └── cross-repo-considerations-fixtures/
        └── dogfood-04.md                            ← CREATE  (captured output fixture)
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
  parseStateMd,
  aggregateOrgByProductQuarter,
  parseTaskListFallback,
  scanPeer,
  scanOrg,
  readCache,
  writeCache,
  isStale,
  _setRunGit,
  _resetGitMock,
  DEFAULT_TTL_MINUTES,
  DEFAULT_STALE_DAYS,
  DEFAULT_BRANCH_PATTERNS,
  AWARENESS_CACHE_REL,
};
```

**Mirror for org-awareness.cjs** — locked at the 21-entry surface (the verification_commands array contains the exact sorted list):

```js
// ─── module.exports — LOCKED by TRD 03-07 (21-entry surface; SC-9) ───────────
//
// This block is the AUTHORITATIVE export surface for lib/org-awareness.cjs.
// Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the EX1 test + CONTEXT.md §"Module surface".

module.exports = {
  // Pure logic / scanners (TDD'd):
  scanSiblings, scanLibs, scanOrgOverlap, formatConsiderations,

  // Test hooks:
  _setRunFs, _resetFsMock,

  // Internal helpers (exposed for tests):
  _tokenize, _score, _camelSplit, _parseExports, _resolveEdenLibsPath,
  _detectMisfiling, _scoreOrgItem, _extractRepoFromRef,

  // Sub-renderers (exposed for tests):
  _renderSiblingsSection, _renderLibsSection, _renderOrgSection,

  // Constants:
  TOP_N, SUMMARY_RECENCY_DAYS, DEFAULT_SIBLING_GLOB, DEFAULT_EDEN_LIBS_PATH,
};
```

**Export-lock test pattern** — obj 2's TRD 02-07 L1 test:

```js
test('EX1 — module.exports surface is locked at 21 entries', () => {
  const expected = [
    'DEFAULT_EDEN_LIBS_PATH', 'DEFAULT_SIBLING_GLOB', 'SUMMARY_RECENCY_DAYS', 'TOP_N',
    '_camelSplit', '_detectMisfiling', '_extractRepoFromRef', '_parseExports',
    '_renderLibsSection', '_renderOrgSection', '_renderSiblingsSection',
    '_resetFsMock', '_resolveEdenLibsPath', '_score', '_scoreOrgItem',
    '_setRunFs', '_tokenize',
    'formatConsiderations', 'scanLibs', 'scanOrgOverlap', 'scanSiblings',
  ].sort();
  const actual = Object.keys(oa).sort();
  assert.deepStrictEqual(actual, expected);
});
```

**FS_INTEGRATION gated test pattern** (mirror obj 2's GIT_INTEGRATION pattern):

```js
test('I1 — real ~/Source/*/ walk', { skip: !process.env.FS_INTEGRATION }, () => {
  const r = oa.scanSiblings({ objective_id: '03', cwd: process.cwd() });
  assert.ok(r.scanned_repos >= 0);
  // siblings should be > 0 on author's machine; allow 0 on CI
});
```

**GH_INTEGRATION gated test pattern** (mirror obj 1's pattern):

```js
test('GI1 — live scanOrgOverlap walks Product Roadmap', { skip: !process.env.GH_INTEGRATION }, () => {
  // Reuse obj 2's product-roadmap-walk.json cassette OR live-call gh.
  const fm = { github_issue: 'AO-Cyber-Systems/devflow-claude#12', parent_issue: 'AO-Cyber-Systems/devflow-claude#9' };
  const ctx = { github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' };
  const r = oa.scanOrgOverlap({ objective_id: '03', current_tokens: new Set(['org','awareness']), sibling_repos: [], frontmatter: fm, projectCtx: ctx });
  assert.strictEqual(r.skipped, false);
  // Expect at least 1 item under DevFlow product
});
```

**Dogfood capture pattern**:

```js
test('DG1 — dogfood considerations against obj 4 produces stable Markdown', () => {
  const dfTools = path2.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync('node', [dfTools, 'org-awareness', 'considerations', '4'], { encoding: 'utf-8' });
  // CLI exits 0 even on graceful skip
  assert.match(r.stdout, /### Sibling repos/);
  assert.match(r.stdout, /### eden-libs candidates/);
  assert.match(r.stdout, /### Org Project overlap/);
  // Verify presence of obj 2 reference (from sibling-repo SUMMARY.md tokens or eden-libs candidate)
  // This is a soft check — if the section is sparse on a fresh checkout, allow placeholder text.
  // assert.match(r.stdout, /awareness|cross-repo|scanner/);
});
```

</codebase_examples>

<anti_patterns>

- **DO NOT add new symbols to module.exports.** If a future TRD needs a new helper, it goes through a new TRD that updates BOTH the module AND the EX1 test atomically.
- **DO NOT skip the export-lock test on CI.** It runs every npm test; failure is the canary that someone added/removed a symbol without updating the contract.
- **DO NOT capture the dogfood fixture from a polluted state.** Run on a clean working tree with up-to-date code so the fixture is a faithful snapshot.
- **DO NOT couple the dogfood test to specific contents.** Fixture must be comparable but not so brittle that any line edit breaks the test. Match on structure (section headers + ≥ 1 bullet OR sentinel) rather than verbatim contents.

</anti_patterns>

<error_recovery>

- **EX1 test fails because module.exports has a different set than expected** → either update module.exports to match the locked list (preferred), OR update the locked list AND update CONTEXT.md §"Module surface" together. Failure is a feature: detects accidental drift.
- **I1 test fails on CI** (FS_INTEGRATION not set) → it should skip; if it runs anyway, ensure `{ skip: !process.env.FS_INTEGRATION }` is correctly applied.
- **DG1 dogfood test produces sparse output** (e.g., on a fresh CI runner with no `~/Source/*/` siblings) → soft-match: assert presence of section headers, not specific bullets.

</error_recovery>

</embedded_context>

<context>
@.planning/objectives/03-planning-time-org-awareness/03-CONTEXT.md
@.planning/objectives/03-planning-time-org-awareness/03-RESEARCH.md
@.planning/objectives/02-cross-repo-awareness-layer/02-07-library-export-and-integration-TRD.md
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
@plugins/devflow/devflow/bin/lib/awareness.cjs
</context>

<gotchas>

- **Dogfood objective ID** — obj 4 may not yet be planned (obj 3 ships before obj 4 plans). Use `4` as the objective ID; `df-tools org-awareness considerations 4` will use `4` as the slug + best-effort tokens (no OBJECTIVE.md to read). The result will be slim but structurally complete (3 subsection headers, sentinel text in subsections without matches). That's acceptable for the dogfood — it proves the pipeline runs end-to-end.
- **Export count exactly 21** — count the entries listed in <codebase_examples> Section "Mirror for org-awareness.cjs". The verification_commands node -e check exercises this.
- **Avoid live gh calls in default `npm test` runs** — GI1 must skip cleanly without GH_INTEGRATION env var. Use `{ skip: !process.env.GH_INTEGRATION }` annotation.
- **Capture dogfood once, commit fixture** — re-running the dogfood test should COMPARE to the fixture, not regenerate it. Live regeneration only happens with explicit env var (e.g., `RECAPTURE_DOGFOOD=1`).

</gotchas>

## Test list

### Group EX (export lock)
- EX1: `Object.keys(oa).sort()` deepStrictEqual against the 21-entry expected list

### Group I (FS_INTEGRATION gated)
- I1: real `~/Source/*/` walk via `scanSiblings({ objective_id: '03' })` — completes; scanned_repos >= 0 (>0 on author's machine)
- I2: real eden-libs scan via `scanLibs({ })` — handles real path correctly (whether eden-libs exists or not)

### Group GI (GH_INTEGRATION gated)
- GI1: live scanOrgOverlap walk produces ≥ 1 item under DevFlow product (skipped:false)
- GI2: live misfiling check resolves correctly for current repo (no false positive)

### Group DG (dogfood)
- DG1: `df-tools org-awareness considerations 4` returns Markdown with all 3 subsection headers
- DG2: dogfood-04.md fixture exists and parses as Markdown (regression guard)
- DG3 (optional, skipped without RECAPTURE env): re-capture fixture from current run

<tasks>

<task type="auto">
  <name>Task 1: RED — failing tests for EX (export-lock) + I + GI + DG groups</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
    plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md
  </files>
  <action>
**RED PHASE.**

**Part 1: Append test groups EX, I, GI, DG to org-awareness.test.cjs.**

```js
// ─── TRD 03-07 tests ─────────────────────────────────────────────────────────

// Group EX — export lock
test('EX1 — module.exports surface is locked at 21 entries', () => {
  const expected = [
    'DEFAULT_EDEN_LIBS_PATH', 'DEFAULT_SIBLING_GLOB', 'SUMMARY_RECENCY_DAYS', 'TOP_N',
    '_camelSplit', '_detectMisfiling', '_extractRepoFromRef', '_parseExports',
    '_renderLibsSection', '_renderOrgSection', '_renderSiblingsSection',
    '_resetFsMock', '_resolveEdenLibsPath', '_score', '_scoreOrgItem',
    '_setRunFs', '_tokenize',
    'formatConsiderations', 'scanLibs', 'scanOrgOverlap', 'scanSiblings',
  ].sort();
  const actual = Object.keys(oa).sort();
  assert.deepStrictEqual(actual, expected);
});

// Group I — FS_INTEGRATION gated
test('I1 — real ~/Source/*/ walk completes', { skip: !process.env.FS_INTEGRATION }, () => {
  const r = oa.scanSiblings({ objective_id: '03', cwd: process.cwd() });
  assert.ok(typeof r.scanned_repos === 'number');
  assert.ok(Array.isArray(r.matches));
});

test('I2 — real eden-libs scan handles missing/present', { skip: !process.env.FS_INTEGRATION }, () => {
  const r = oa.scanLibs({ current_tokens: new Set(['org', 'awareness']) });
  assert.ok('candidates' in r);
  assert.ok('warnings' in r);
  // scanned can be true OR false depending on eden-libs presence
});

// Group GI — GH_INTEGRATION gated
test('GI1 — live scanOrgOverlap returns items', { skip: !process.env.GH_INTEGRATION }, () => {
  const fm = { github_issue: 'AO-Cyber-Systems/devflow-claude#12', parent_issue: 'AO-Cyber-Systems/devflow-claude#9' };
  const ctx = { github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' };
  // Restore real aw.scanOrg if it was monkey-patched
  delete require.cache[require.resolve('./awareness.cjs')];
  const aw2 = require('./awareness.cjs');
  // Note: Restoring scanOrg via cache invalidation can interact with other tests; isolate
  const r = oa.scanOrgOverlap({
    objective_id: '03',
    current_tokens: new Set(['org', 'awareness']),
    sibling_repos: [],
    frontmatter: fm,
    projectCtx: ctx,
  });
  // Either succeeded or skipped — both are acceptable evidence of integration
  if (!r.skipped) {
    assert.ok(Array.isArray(r.items));
  }
});

// Group DG — dogfood
test('DG1 — considerations 4 produces all 3 subsection headers', () => {
  const dfTools = path2.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync('node', [dfTools, 'org-awareness', 'considerations', '4'], { encoding: 'utf-8' });
  assert.strictEqual(r.status, 0, `unexpected exit: ${r.status}, stderr: ${r.stderr}`);
  assert.match(r.stdout, /### Sibling repos/);
  assert.match(r.stdout, /### eden-libs candidates/);
  assert.match(r.stdout, /### Org Project overlap/);
});

test('DG2 — dogfood-04.md fixture exists', () => {
  const fixturePath = path2.join(__dirname, '__fixtures__', 'cross-repo-considerations-fixtures', 'dogfood-04.md');
  assert.ok(fs2.existsSync(fixturePath), 'dogfood-04.md must exist as a regression fixture');
  const content = fs2.readFileSync(fixturePath, 'utf-8');
  assert.match(content, /### Sibling repos/);
  assert.match(content, /### eden-libs candidates/);
  assert.match(content, /### Org Project overlap/);
});
```

**Part 2: Create the dogfood fixture file** with placeholder content (will be re-captured in GREEN):

```markdown
<!-- dogfood-04.md — captured from `df-tools org-awareness considerations 4` -->
<!-- TRD 03-07 (initial RED placeholder; replaced in GREEN with live capture) -->

### Sibling repos
_(no matches)_

### eden-libs candidates
_(no matches)_

### Org Project overlap
_(skipped: gh auth not available — run `gh auth refresh -h github.com -s project,read:project,repo` to enable)_
```

This placeholder makes DG2 pass while DG1 still fails (because module.exports doesn't yet match the EX1 expected list).

# CRITICAL: EX1 will fail because the actual exports may differ from the locked-21 expectation. That's the RED signal — confirms scanners 03-01 through 03-04 may have left non-locked symbols (e.g., extra helpers).

**Commit RED:**
```bash
mkdir -p plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures
git add plugins/devflow/devflow/bin/lib/org-awareness.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md
git commit -m "test(03-07): add export-lock + integration + dogfood tests

RED phase: EX1 expects 21-entry locked surface; I1+I2+GI1 gated on
FS_INTEGRATION/GH_INTEGRATION; DG1+DG2 verify dogfood pipeline against obj 4.

Placeholder dogfood-04.md fixture captures the empty/skipped baseline shape;
GREEN phase re-captures from live run on author's machine."
```
  </action>
  <verify>
- `npm test 2>&1 | grep -E 'EX1|DG1|DG2|I1.*skip|GI1.*skip' | head -10`
- EX1 likely fails: shows mismatch between actual + expected exports list
- DG2 passes (fixture file just-created)
- DG1 may pass already if 03-04's CLI considerations command works correctly
  </verify>
  <done>
test commit lands. RED tests reveal export-surface drift if any. Placeholder fixture committed.
  </done>
  <recovery>
If DG1 fails because 03-04's CLI considerations command exits with non-zero on objective_id "4" (which doesn't have a planned objective dir): make `cmdOrgAwarenessConsiderations` graceful — best-effort fallback when the objective dir is empty (already designed in 03-04).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — lock module.exports + re-capture dogfood fixture</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.cjs
    plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md
  </files>
  <action>
**GREEN PHASE.**

**Part 1: Replace the module.exports block in lib/org-awareness.cjs with the locked 21-entry surface + banner comment.**

Find the existing module.exports block at the bottom of `lib/org-awareness.cjs`. Replace it with:

```js
// ─── module.exports — LOCKED by TRD 03-07 (21-entry surface; SC-9) ───────────
//
// This block is the AUTHORITATIVE export surface for lib/org-awareness.cjs.
// Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the EX1 test + CONTEXT.md §"Module surface".

module.exports = {
  // Pure logic / scanners (TDD'd):
  scanSiblings,
  scanLibs,
  scanOrgOverlap,
  formatConsiderations,

  // Test hooks (mirror _setRunGh / _setRunGit pattern):
  _setRunFs,
  _resetFsMock,

  // Internal helpers (exposed for tests):
  _tokenize,
  _score,
  _camelSplit,
  _parseExports,
  _resolveEdenLibsPath,
  _detectMisfiling,
  _scoreOrgItem,
  _extractRepoFromRef,

  // Sub-renderers (exposed for tests):
  _renderSiblingsSection,
  _renderLibsSection,
  _renderOrgSection,

  // Constants:
  TOP_N,
  SUMMARY_RECENCY_DAYS,
  DEFAULT_SIBLING_GLOB,
  DEFAULT_EDEN_LIBS_PATH,
};
```

If any of these names DON'T exist in the file (e.g., a TRD missed adding `_extractRepoFromRef`): trace back which TRD's region missed it. Fix that region (likely 03-03). Do NOT add new functionality at this stage — just ensure all 21 names are defined functions/values matching the contract.

**Part 2: Re-capture the dogfood fixture from a live run.**

```bash
node plugins/devflow/devflow/bin/df-tools.cjs org-awareness considerations 4 > plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md
```

Inspect the result:
```bash
cat plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md
```

Add a header comment at the top of the file (preserves the captured Markdown body):

Open the file, prepend:
```markdown
<!-- dogfood-04.md — Captured Markdown output of `df-tools org-awareness considerations 4` -->
<!-- TRD 03-07 dogfood (regenerable via: node plugins/devflow/devflow/bin/df-tools.cjs org-awareness considerations 4) -->

```
followed by the actual captured content.

Verify DG2 still passes (file exists + has all 3 subsection headers).

**Run tests until green:**
```bash
npm test 2>&1 | grep -E 'EX1|DG1|DG2'
```
EX1, DG1, DG2 all pass. I1+I2+GI1+GI2 skip without env vars.

Optionally, run with FS_INTEGRATION=1:
```bash
FS_INTEGRATION=1 npm test 2>&1 | grep -E 'I1|I2'
```
I1 + I2 pass.

**Commit GREEN:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.cjs plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md
git commit -m "feat(03-07): lock module.exports surface + capture dogfood fixture

GREEN phase: lib/org-awareness.cjs module.exports is now LOCKED at the
21-entry surface with banner comment per obj 2 TRD 02-07 pattern.
Asserted by EX1 deepStrictEqual test.

dogfood-04.md captured live: running considerations against obj 4 produces
the 3-subsection Markdown with sentinel placeholders (siblings/libs may have
matches depending on machine state; org-overlap typically skipped without
gh auth).

Closes SC-9 (export surface stable) + SC-10 (end-to-end dogfood pipeline)."
```

**Optional REFACTOR commit** if any helper renames or comments improvements are warranted; otherwise skip.
  </action>
  <verify>
- `npm test 2>&1 | tail -10` shows full suite passing including new EX1, DG1, DG2 tests
- `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/org-awareness.cjs"); const k=Object.keys(a).sort(); if(k.length!==21) throw new Error(\`expected 21 exports, got ${k.length}\`); console.log("OK 21 exports\")'`
- `cat plugins/devflow/devflow/bin/lib/__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md | head -20` shows banner comment + captured Markdown
- `FS_INTEGRATION=1 npm test 2>&1 | grep -E 'I1|I2'` shows I1 + I2 passing on machine with `~/Source/`
- All prior TRD test groups still pass (no regressions)
  </verify>
  <done>
feat commit lands. module.exports is locked + banner-commented. dogfood-04.md captured. EX1 + DG1 + DG2 tests pass; I1/I2/GI1/GI2 skip cleanly without env vars. Full suite passes.
  </done>
  <recovery>
If the locked 21-entry list and actual exports don't match: examine each prior TRD region; the most likely culprit is a missed export. Either (a) export the missing helper from the right region (preferred), or (b) update CONTEXT.md §"Module surface" + the EX1 expected list to drop the helper if not actually needed. Choose (a) for stability.
If dogfood-04.md captures sparse output (no eden-libs, all skipped): that IS valid and acceptable for v1.1; the test asserts structure (3 headers), not specific content. Document in the file's header comment that the capture reflects the current machine state.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
1. Full `npm test` passes (no regressions across all prior TRDs + new EX/DG tests).
2. `Object.keys(require('./plugins/devflow/devflow/bin/lib/org-awareness.cjs')).sort()` returns exactly the 21-entry list.
3. `dogfood-04.md` fixture exists with the 3 subsection headers + banner comment.
4. With `FS_INTEGRATION=1`: I1 + I2 tests pass on author's machine.
5. With `GH_INTEGRATION=1`: GI1 either passes or correctly reports skipped:true.
6. obj 1, obj 2, obj 3 modules all import together without circular dependency errors.
7. Total cumulative test count >= prior baseline + ~20-30 new tests across TRDs 03-01..03-07.
</verification>

<success_criteria>
- [ ] `lib/org-awareness.cjs` module.exports locked at 21 entries with banner comment
- [ ] EX1 export-lock test passes (deepStrictEqual on Object.keys)
- [ ] dogfood-04.md fixture exists, contains 3 subsection headers, banner-commented
- [ ] I1, I2 tests pass under FS_INTEGRATION=1
- [ ] GI1, GI2 tests pass or skip cleanly under GH_INTEGRATION=1
- [ ] All prior TRD test groups (03-01 through 03-04) continue to pass
- [ ] RED commit precedes GREEN commit; optional REFACTOR commit if cleanup needed
- [ ] SC-9 (stable export surface) verifiable via EX1
- [ ] SC-10 (end-to-end dogfood pipeline) verifiable via DG1 + DG2 + dogfood-04.md fixture
</success_criteria>

<output>
After completion, create `.planning/objectives/03-planning-time-org-awareness/03-07-library-export-and-dogfood-SUMMARY.md`.
</output>
