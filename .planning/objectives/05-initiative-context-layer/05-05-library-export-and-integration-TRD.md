---
objective: 05-initiative-context-layer
trd: 05-05
type: tdd
confidence: high
wave: 5
depends_on:
  - 05-04
files_modified:
  - plugins/devflow/devflow/bin/lib/initiatives.cjs
  - plugins/devflow/devflow/bin/lib/initiatives.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
autonomous: true
requirements:
  - SC-8
  - SC-9
  - SC-10
must_haves:
  truths:
    - "lib/initiatives.cjs module.exports is locked at the documented N-entry surface (deepStrictEqual asserted)"
    - "Round-trip integration test gated on GH_INTEGRATION=1 syncs against live org Product Roadmap and asserts ≥1 file written"
    - "Round-trip test loads + matches + formats; format step verified bounded ≤ MAX_FORMATTED_PLANNER_CHARS"
    - "Token-budget test (default-run, no env gate) asserts formatInitiativeForPlanner output ≤ 1500 chars per initiative"
    - "Multi-initiative composition asserted ≤ 6 KB total"
    - "Banner comment 'LOCKED by TRD 05-05 (N-entry surface; SC-8)' present on module.exports block"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/initiatives.cjs"
      provides: "Final locked module.exports with banner comment"
      contains: "LOCKED by TRD 05-05"
    - path: "plugins/devflow/devflow/bin/lib/initiatives.test.cjs"
      provides: "Export-lock test (EX1) + token-budget test (TB1-TB3) + integration test (IT1-IT4)"
      contains: "deepStrictEqual"
  key_links:
    - from: "lib/initiatives.cjs::module.exports"
      to: "EX1 deepStrictEqual against expected key list"
      via: "Object.keys(module.exports).sort()"
      pattern: "deepStrictEqual"
    - from: "IT1 round-trip test"
      to: "live org Product Roadmap walkProject"
      via: "syncInitiatives without mocks (GH_INTEGRATION=1 only)"
      pattern: "GH_INTEGRATION"
    - from: "TB1 token-budget test"
      to: "formatInitiativeForPlanner with adversarial-large initiative"
      via: "asserts result.length <= MAX_FORMATTED_PLANNER_CHARS"
      pattern: "MAX_FORMATTED_PLANNER_CHARS"
---

<objective>
Final integration TRD for objective 5. Three deliverables:

1. **Export surface lock (SC-8):** `module.exports` finalized with banner comment `LOCKED by TRD 05-05 (N-entry surface; SC-8)`. EX1 deepStrictEqual test asserts the exact key list — future TRDs touching `lib/initiatives.cjs` MUST update both the module export AND the test atomically. Mirror obj 2 TRD 02-07 (14-entry), obj 3 TRD 03-07 (21-entry), obj 4 TRD 04-06 (19-entry) banner pattern.

2. **Round-trip integration test (SC-9):** gated on `GH_INTEGRATION=1`. Syncs against live org Product Roadmap, asserts ≥1 initiative file written to a tmpdir home, calls `loadInitiatives` + `matchByRepo` + `formatInitiativeForPlanner` end-to-end. Skipped cleanly when env unset.

3. **Token-budget assertion (SC-10):** default-run, no env gate. `formatInitiativeForPlanner(initiative)` output ≤ 1500 chars per initiative regardless of input size. Multi-initiative composition stays under 6 KB. Tests use adversarial-large fixtures (Why = 10000 chars, sub_issues = 50, open_questions = 20) and assert hard cap.

Purpose: SC-8 (export-surface lock), SC-9 (live round-trip), SC-10 (token budget enforcement).
Output: Locked `module.exports` block + 3 test groups (EX, IT, TB).
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── initiatives.cjs                            ← MODIFY (final module.exports + banner)
├── initiatives.test.cjs                       ← MODIFY (add EX/IT/TB groups)
└── __fixtures__/
    └── awareness-fixtures.cjs                 ← MODIFY (add buildAdversarialInitiative)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Export-lock banner pattern (from `lib/awareness.cjs` TRD 02-07):**

```js
// ─── module.exports — LOCKED by TRD 02-07 (14-entry surface; SC-9) ───────────
//
// This block is the authoritative export surface for lib/awareness.cjs.
// Asserted by L1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the L1 test + CONTEXT.md §"Module surface".

module.exports = {
  // Pure logic (TRD 02-01):
  parseStateMd,
  aggregateOrgByProductQuarter,
  parseTaskListFallback,
  // ...
};
```

Mirror exactly: banner with `LOCKED by TRD 05-05 (N-entry surface; SC-8)`, comment grouping by TRD that introduced each export, alphabetical or grouped-logical order within each section.

**Export-lock test (from `lib/awareness.test.cjs` TRD 02-07 L1):**

```js
test('L1: module.exports surface is locked (deepStrictEqual on Object.keys)', () => {
  const expected = [
    // Pure logic
    'aggregateOrgByProductQuarter', 'parseStateMd', 'parseTaskListFallback',
    // Scanners
    'scanOrg', 'scanPeer',
    // Cache
    'isStale', 'readCache', 'writeCache',
    // Test hooks
    '_resetGitMock', '_setRunGit',
    // Constants
    'AWARENESS_CACHE_REL', 'DEFAULT_BRANCH_PATTERNS', 'DEFAULT_STALE_DAYS', 'DEFAULT_TTL_MINUTES',
  ].sort();
  const aw = require('./awareness.cjs');
  assert.deepStrictEqual(Object.keys(aw).sort(), expected);
});
```

For TRD 05-05 EX1: build the expected list exactly matching `lib/initiatives.cjs::module.exports` post-final-lock.

**GH_INTEGRATION-gated test pattern (from obj 1 TRD 01-06 + obj 2 TRD 02-07):**

```js
test('IT1: round-trip live walk + sync + load + format', { skip: process.env.GH_INTEGRATION !== '1' && 'GH_INTEGRATION=1 not set' }, async () => {
  // Use a tmpdir home — never write to ~/.claude/devflow/initiatives/ during tests
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it-'));
  const result = await init.syncInitiatives({ home }); // no mocks; real gh + walkProject
  assert.strictEqual(result.ok, true, `sync failed: ${JSON.stringify(result.warnings)}`);
  assert.ok(result.written.length >= 1, `expected ≥1 initiative; got ${result.written.length}`);
  // load back
  const loaded = init.loadInitiatives({ home });
  assert.ok(loaded.length >= 1);
  // match + format
  const matched = init.matchByRepo(loaded, 'AO-Cyber-Systems/devflow-claude');
  if (matched.length > 0) {
    const formatted = init.formatInitiativeForPlanner(matched[0]);
    assert.ok(formatted.length > 0);
    assert.ok(formatted.length <= init.MAX_FORMATTED_PLANNER_CHARS);
  }
  fs.rmSync(home, { recursive: true, force: true });
});
```

**Token-budget assertion pattern (from obj 3 TRD 03-04 F5):**

```js
test('F5: bounded total chars ≤ 2000 (regression guard)', () => {
  const considerations = orgAw.formatConsiderations(scans);
  assert.ok(considerations.length <= 2000, `exceeded char budget: ${considerations.length}`);
});
```

For TRD 05-05 TB1-TB3: assert `formatInitiativeForPlanner(adversarial)` ≤ 1500 chars; assert multi-initiative composition ≤ 6 KB.
</codebase_examples>

<anti_patterns>
- **DO NOT** add new exports in this TRD outside the locked surface. If a missing export surfaces during test writing, that's a SC-8 surface-lock revisit — must reach back to TRD 05-01/02/03 conceptually but be added here with a documented `// LATE-ADD by TRD 05-05` comment.
- **DO NOT** make IT1 a default-run test. It MUST be gated on `GH_INTEGRATION=1` per CONTEXT.md decision #4 (writer requires real gh) and SC-9 (skipped cleanly when env unset).
- **DO NOT** write to `~/.claude/devflow/initiatives/` during tests. ALWAYS use `fs.mkdtempSync` for tmpdir home. Even IT1 (live round-trip) uses tmpdir to avoid clobbering user state.
- **DO NOT** use `assert.equal` with non-strict equality. Use `deepStrictEqual` for arrays/objects, `strictEqual` for primitives.
- **DO NOT** depend on a SPECIFIC initiative existing live (e.g., "DevFlow Internal Alpha"). The org Product Roadmap content drifts. Test asserts EXISTENCE of ≥1 initiative — not specific content.
- **DO NOT** capture cassettes for IT1. The test is GATED on a flag; capture is manual when needed (mirror obj 2 TRD 02-07's cassette discipline).
</anti_patterns>

<error_recovery>
- **EX1 fails (deepStrictEqual mismatch):** print `Object.keys(module.exports).sort()` actual vs expected. Likely cause: a TRD added/removed an export without updating the test. Fix by aligning the expected array with the actual surface IF the surface change was intentional + documented; else revert the unintended export change.
- **IT1 fails when GH_INTEGRATION=1 set:** check gh auth scopes (`gh auth status`); ensure `project, read:project, repo` are granted. If walkProject returns empty: org Product Roadmap may have been emptied — surface as test environment issue, not TRD failure.
- **TB1 fails:** `formatInitiativeForPlanner` is producing too-long output. Inspect: is the truncation logic in `_truncateWhy` working? Are sub_issues being trimmed at MAX_PLANNER_FORMAT_SUBISSUES=5? Is the final hard-cap (`result.slice(0, MAX_FORMATTED_PLANNER_CHARS - 1) + '…'`) present? Add an `assert.ok(result.length <= 1500)` immediately after format-fn completes.
- **TB2 (multi-init composition) fails:** total > 6 KB. Either reduce per-initiative cap OR reduce multi-init composition cap. Per CONTEXT.md decision #8: per-initiative ≤ 1500; composition ≤ 6 KB. Both locked.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@.planning/objectives/05-initiative-context-layer/05-CONTEXT.md
@.planning/objectives/05-initiative-context-layer/05-01-SUMMARY.md
@.planning/objectives/05-initiative-context-layer/05-02-SUMMARY.md
@.planning/objectives/05-initiative-context-layer/05-03-SUMMARY.md
@.planning/objectives/05-initiative-context-layer/05-04-SUMMARY.md

# Reference patterns
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/awareness.test.cjs
@plugins/devflow/devflow/bin/lib/dup-detect.cjs
@plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
</context>

<gotchas>
- **Final export count:** Tally all symbols introduced by 05-01 (15) + 05-02 (5 new) + 05-03 (4 new) = 24 entries (some 05-02 additions overlapped 05-01 placeholders). Re-count from actual files; the locked count is whatever the post-05-03 partial export shows. **Approximate target: 22-24 entries.** Banner reads "LOCKED by TRD 05-05 (24-entry surface; SC-8)" or whatever the actual count is.
- **Order in module.exports:** group by TRD that introduced each entry, with comment dividers. Example:
  ```js
  module.exports = {
    // Reader (TRD 05-01):
    loadInitiatives, matchByRepo, formatInitiativeForPlanner, _parseInitiativeFile, _truncateWhy,
    // Writer (TRD 05-02):
    syncInitiatives, _writeInitiativeFile, _qualifiesAsInitiative, _slugifyInitiativeTitle, _renderInitiativeMarkdown,
    // Stale-deletion (TRD 05-03):
    _detectStaleInitiatives, _deleteStaleFile, _confirmDeleteStale, _setRunReadline,
    // Test hooks:
    _setRunFs, _setRunGh, _resetMocks,
    // Constants:
    INITIATIVES_HOME_REL, MAX_WHY_CHARS, MAX_QUESTIONS_BULLETS, MAX_SUBISSUES_LINES,
    MAX_FORMATTED_PLANNER_CHARS, defaultInitiativesHome,
  };
  ```
- **`buildAdversarialInitiative` fixture:** hand-built parsed-initiative shape with extreme content (Why = 10000 chars, sub_issues array of 50 entries, open_questions array of 20 entries). Tests pass this directly to `formatInitiativeForPlanner` — no fs writes needed.
- **Multi-initiative composition test:** simulate planner reading N initiatives. `const composed = initiatives.map(i => formatInitiativeForPlanner(i)).join('\n\n---\n\n')`. Assert `composed.length <= 6 * 1024`.
- **GH_INTEGRATION test independence:** if multiple test runs interleave (e.g., obj 2's OT1 + obj 5's IT1 in same test invocation), each tmpdir is isolated. No cross-contamination concerns.
- **Re-capture cassette workflow (deferred to v1.2 unless drift detected):** if a future change to `walkProject` or initiative qualification breaks IT1 against live data, the dogfood test surfaces the drift. Don't capture obj 5 cassettes proactively — IT1 is a "drift detector," not a fixture.
</gotchas>

</embedded_context>

## Test list

### Group EX — Export-surface lock

- **EX1**: `Object.keys(require('./initiatives.cjs')).sort()` deepStrictEqual the expected locked list (~22-24 entries depending on final tally).
- **EX2**: Banner comment `LOCKED by TRD 05-05` is present in `initiatives.cjs` (regex match).
- **EX3**: All exported test hooks (`_setRunFs`, `_setRunGh`, `_setRunReadline`, `_resetMocks`) are functions (typeof check).
- **EX4**: All exported constants are non-null primitives matching expected types (number for MAX_*, string for INITIATIVES_HOME_REL).

### Group TB — Token budget enforcement (SC-10)

- **TB1**: `formatInitiativeForPlanner(adversarial)` returns string ≤ MAX_FORMATTED_PLANNER_CHARS (1500 chars). Adversarial input: Why = 10000 chars, sub_issues = 50, open_questions = 20.
- **TB2**: Multi-initiative composition (5 adversarial initiatives joined) ≤ 6 KB.
- **TB3**: Empty initiative (`{}` minimal) returns short non-throwing string.
- **TB4**: Initiative with all sections empty (no Why, no Open Questions, no sub_issues) returns string with header + slug only.
- **TB5**: Truncation appends ellipsis (`…`) when content exceeded budget.

### Group IT — Integration round-trip (SC-9, gated)

- **IT1**: GH_INTEGRATION=1 — `syncInitiatives({ home: tmpdir })` against live org Product Roadmap returns `{ ok: true, written: [...] }` with ≥1 entry. (Skipped cleanly when env unset.)
- **IT2**: GH_INTEGRATION=1 — Files written by IT1 round-trip through `loadInitiatives` → `matchByRepo` → `formatInitiativeForPlanner`. Each formatted output ≤ MAX_FORMATTED_PLANNER_CHARS.
- **IT3**: GH_INTEGRATION=1 — Re-running sync produces byte-equal files (modulo updated_at). Idempotency contract end-to-end.
- **IT4**: Without GH_INTEGRATION (default run): IT1-IT3 are skipped via `t.skip()`; suite still passes.
- **IT5**: Default-run integration: `syncInitiatives` with mocked walkProject (empty items) returns `{ ok: true, written: [], deleted: [], skipped: [], warnings: [] }`. Confirms code path executes end-to-end without live gh.

<tasks>

<task type="auto">
  <name>Task 1: Lock module.exports + add banner comment + write export-lock + token-budget tests (combined RED + GREEN)</name>
  <files>
plugins/devflow/devflow/bin/lib/initiatives.cjs
plugins/devflow/devflow/bin/lib/initiatives.test.cjs
plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
This is a hybrid task because EX1 + TB1-TB5 require BOTH the locked exports and the new fixture. We RED them first, then GREEN by adding the banner + final exports.

Step 1: Tally the actual export surface from initiatives.cjs (after 05-01/02/03 partial exports). Confirm with:

```bash
node -e "console.log(Object.keys(require('./plugins/devflow/devflow/bin/lib/initiatives.cjs')).sort().join('\\n'))"
```

Step 2: Add `buildAdversarialInitiative` to `awareness-fixtures.cjs`:

```js
// ─── TRD 05-05: Adversarial initiative fixture for token-budget tests ────────

/**
 * Build a parsed-initiative shape with extreme content for token-budget tests.
 * Why = 10000 chars, sub_issues = 50 entries, open_questions = 20.
 *
 * Used by formatInitiativeForPlanner to verify hard caps hold under stress.
 *
 * @param {object} opts
 * @returns {object} - parsed initiative (matches loadInitiatives output shape)
 */
function buildAdversarialInitiative({
  slug = 'adversarial',
  github_issue = 'AO-Cyber-Systems/devflow#999',
  parent_project = 'AO-Cyber-Systems/PVT_kwDODwqLrc4BRsOP',
  key_repos = ['AO-Cyber-Systems/devflow-claude'],
  why_chars = 10000,
  sub_issues_count = 50,
  questions_count = 20,
  updated_at = '2026-05-05T18:30:00Z',
} = {}) {
  const why = 'a'.repeat(why_chars);
  const sub_issues = [];
  for (let i = 0; i < sub_issues_count; i++) {
    sub_issues.push({
      ref: `AO-Cyber-Systems/devflow-claude#${1000 + i}`,
      title: `Sub-issue ${i} with a verbose title that takes up real estate`,
      state: 'OPEN',
    });
  }
  const open_questions = [];
  for (let i = 0; i < questions_count; i++) {
    open_questions.push(`Question ${i} that asks something fairly long and explanatory?`);
  }
  return {
    slug, github_issue, parent_project, key_repos, updated_at,
    body: '',
    why,
    open_questions,
    sub_issues,
    status: '- **GitHub:** OPEN\n- **Project status:** In Progress',
  };
}
```

Add to module.exports.

Step 3: Append test groups EX/TB/IT to `initiatives.test.cjs`:

```js
// ─── Group EX — Export-surface lock ─────────────────────────────────────────

test('EX1: module.exports surface is locked (deepStrictEqual)', () => {
  const expected = [
    // Reader (TRD 05-01)
    '_parseInitiativeFile',
    '_truncateWhy',
    'formatInitiativeForPlanner',
    'loadInitiatives',
    'matchByRepo',
    // Writer (TRD 05-02)
    '_qualifiesAsInitiative',
    '_renderInitiativeMarkdown',
    '_slugifyInitiativeTitle',
    '_writeInitiativeFile',
    'syncInitiatives',
    // Stale-deletion (TRD 05-03)
    '_confirmDeleteStale',
    '_deleteStaleFile',
    '_detectStaleInitiatives',
    '_setRunReadline',
    // Test hooks
    '_resetMocks',
    '_setRunFs',
    '_setRunGh',
    // Constants
    'INITIATIVES_HOME_REL',
    'MAX_FORMATTED_PLANNER_CHARS',
    'MAX_QUESTIONS_BULLETS',
    'MAX_SUBISSUES_LINES',
    'MAX_WHY_CHARS',
    'defaultInitiativesHome',
  ].sort();
  // Adjust expected array to match actual final surface — count after 05-01/02/03 ships.
  assert.deepStrictEqual(Object.keys(init).sort(), expected);
});

test('EX2: banner comment LOCKED by TRD 05-05 present in source', () => {
  const src = fs.readFileSync(path.join(__dirname, 'initiatives.cjs'), 'utf-8');
  assert.ok(/LOCKED by TRD 05-05/.test(src), 'banner comment missing');
});

test('EX3: all _set* test hooks are functions', () => {
  assert.strictEqual(typeof init._setRunFs, 'function');
  assert.strictEqual(typeof init._setRunGh, 'function');
  assert.strictEqual(typeof init._setRunReadline, 'function');
  assert.strictEqual(typeof init._resetMocks, 'function');
});

test('EX4: all MAX_* constants are positive numbers', () => {
  assert.strictEqual(typeof init.MAX_WHY_CHARS, 'number');
  assert.ok(init.MAX_WHY_CHARS > 0);
  assert.strictEqual(typeof init.MAX_FORMATTED_PLANNER_CHARS, 'number');
  assert.ok(init.MAX_FORMATTED_PLANNER_CHARS > 0);
});

// ─── Group TB — Token budget ─────────────────────────────────────────────────

test('TB1: formatInitiativeForPlanner adversarial input ≤ MAX_FORMATTED_PLANNER_CHARS', () => {
  const adv = fixtures.buildAdversarialInitiative();
  const result = init.formatInitiativeForPlanner(adv);
  assert.ok(result.length <= init.MAX_FORMATTED_PLANNER_CHARS,
    `exceeded budget: ${result.length} > ${init.MAX_FORMATTED_PLANNER_CHARS}`);
});

test('TB2: multi-initiative composition ≤ 6 KB', () => {
  const initiatives = [];
  for (let i = 0; i < 5; i++) {
    initiatives.push(fixtures.buildAdversarialInitiative({ slug: `adv-${i}` }));
  }
  const composed = initiatives.map(i => init.formatInitiativeForPlanner(i)).join('\n\n---\n\n');
  assert.ok(composed.length <= 6 * 1024, `exceeded multi-init budget: ${composed.length}`);
});

test('TB3: empty initiative returns short non-throwing string', () => {
  const result = init.formatInitiativeForPlanner({});
  assert.strictEqual(typeof result, 'string');
});

test('TB4: initiative with empty sections renders header + slug', () => {
  const result = init.formatInitiativeForPlanner({
    slug: 'minimal',
    github_issue: 'AO-Cyber-Systems/example#1',
    why: '',
    open_questions: [],
    sub_issues: [],
  });
  assert.ok(result.includes('minimal'));
});

test('TB5: truncated output ends in ellipsis', () => {
  const adv = fixtures.buildAdversarialInitiative({ why_chars: 10000 });
  const result = init.formatInitiativeForPlanner(adv);
  // Content was truncated, so the format should hit the hard cap and append ellipsis OR be exactly the hard cap
  assert.ok(/…/.test(result) || result.length === init.MAX_FORMATTED_PLANNER_CHARS,
    'expected ellipsis or exact-cap result');
});

// ─── Group IT — Integration round-trip ──────────────────────────────────────

test('IT1: GH_INTEGRATION live round-trip — sync writes ≥1 file', { skip: process.env.GH_INTEGRATION !== '1' && 'GH_INTEGRATION=1 not set' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it1-'));
  init._resetMocks();
  try {
    const result = await init.syncInitiatives({ home });
    assert.strictEqual(result.ok, true, `sync failed: ${JSON.stringify(result.warnings)}`);
    assert.ok(result.written.length >= 1, `expected ≥1 initiative; got ${result.written.length}`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('IT2: GH_INTEGRATION end-to-end load + match + format', { skip: process.env.GH_INTEGRATION !== '1' && 'GH_INTEGRATION=1 not set' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it2-'));
  init._resetMocks();
  try {
    await init.syncInitiatives({ home });
    const loaded = init.loadInitiatives({ home });
    assert.ok(loaded.length >= 1);
    const matched = init.matchByRepo(loaded, 'AO-Cyber-Systems/devflow-claude');
    if (matched.length > 0) {
      const formatted = init.formatInitiativeForPlanner(matched[0]);
      assert.ok(formatted.length > 0);
      assert.ok(formatted.length <= init.MAX_FORMATTED_PLANNER_CHARS);
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('IT3: GH_INTEGRATION idempotency end-to-end', { skip: process.env.GH_INTEGRATION !== '1' && 'GH_INTEGRATION=1 not set' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it3-'));
  init._resetMocks();
  try {
    await init.syncInitiatives({ home });
    const firstFiles = {};
    for (const f of fs.readdirSync(home)) {
      firstFiles[f] = fs.readFileSync(path.join(home, f), 'utf-8').replace(/^updated_at: .*$/m, 'updated_at: STRIPPED');
    }
    await init.syncInitiatives({ home });
    for (const f of fs.readdirSync(home)) {
      const second = fs.readFileSync(path.join(home, f), 'utf-8').replace(/^updated_at: .*$/m, 'updated_at: STRIPPED');
      assert.strictEqual(second, firstFiles[f], `idempotency broken for ${f}`);
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('IT5: default-run end-to-end with mocked empty walkProject', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it5-'));
  init._setRunGh(fixtures.buildMockRunGhForInitiatives({ walkProjectItems: [], authOk: true }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.written, []);
    assert.deepStrictEqual(result.deleted, []);
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
```

Step 4: Update `lib/initiatives.cjs` final `module.exports` with banner:

```js
// ─── module.exports — LOCKED by TRD 05-05 (24-entry surface; SC-8) ───────────
//
// This block is the authoritative export surface for lib/initiatives.cjs.
// Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the EX1 test + 05-CONTEXT.md §"Module surface".

module.exports = {
  // Reader (TRD 05-01):
  loadInitiatives,
  matchByRepo,
  formatInitiativeForPlanner,
  _parseInitiativeFile,
  _truncateWhy,

  // Writer (TRD 05-02):
  syncInitiatives,
  _writeInitiativeFile,
  _qualifiesAsInitiative,
  _slugifyInitiativeTitle,
  _renderInitiativeMarkdown,

  // Stale-deletion (TRD 05-03):
  _detectStaleInitiatives,
  _deleteStaleFile,
  _confirmDeleteStale,
  _setRunReadline,

  // Test hooks:
  _setRunFs,
  _setRunGh,
  _resetMocks,

  // Constants:
  INITIATIVES_HOME_REL,
  MAX_WHY_CHARS,
  MAX_QUESTIONS_BULLETS,
  MAX_SUBISSUES_LINES,
  MAX_FORMATTED_PLANNER_CHARS,
  defaultInitiativesHome,
};
```

Re-run tests. Iterate on EX1 expected array if surface count doesn't match. The ACTUAL surface from 05-03 is the source of truth; EX1 expected array MUST match it byte-for-byte.

Run and commit:

- Test commit: `test(05-05): add export-lock + token-budget + integration tests`
- Feat commit: `feat(05-05): lock initiatives module.exports surface (LOCKED by TRD 05-05)`

# CRITICAL: EX1 expected array order matters. Use `.sort()` on both sides — locks alphabetical comparison regardless of source-code order.
# GOTCHA: If EX1 fails with "missing entry", the surface doesn't include something this TRD expected. Investigate: is the symbol exported? Is there a typo? Did 05-02/03 omit it?
# PATTERN: hybrid TDD — single commit pair (test: + feat:) because the test and the lock-fixture are co-introduced. Banner comment + locked exports IS the GREEN.
  </action>
  <verify>
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test 2>&1 | tail -20
# Default run: all EX/TB/IT5 tests pass. IT1/IT2/IT3 are skipped (env not set).
# Run again with integration:
GH_INTEGRATION=1 npm test 2>&1 | tail -30
# Expected: IT1/IT2/IT3 PASS against live org Product Roadmap.
# Smoke test export count:
node -e "const i = require('./plugins/devflow/devflow/bin/lib/initiatives.cjs'); console.log('Surface count:', Object.keys(i).length); console.log(Object.keys(i).sort().join(','));"
  </verify>
  <done>
- `module.exports` block in initiatives.cjs has banner comment `LOCKED by TRD 05-05 (N-entry surface; SC-8)`
- EX1 deepStrictEqual asserts the locked key list
- Token-budget tests TB1-TB5 pass with adversarial fixture
- IT5 (default-run integration with mocked empty walkProject) passes
- IT1-IT3 (GH_INTEGRATION-gated) skip cleanly when env unset; pass when set
- `buildAdversarialInitiative` added to fixtures
- 5+5+5 = 15 new tests pass (EX 4 + TB 5 + IT 5; IT1-IT3 skipped by default)
- Final test count delta: ~150 new tests added across all of obj 5 (38 + 51 + 28 + 15 + adjustments)
- 2 atomic commits land: `test(05-05): ...` + `feat(05-05): ...`
- SC-8 closed (export-surface lock + banner comment)
- SC-9 closed (round-trip integration test gated correctly)
- SC-10 closed (token-budget enforcement asserted)
- **Objective 5 DONE.**
  </done>
  <recovery>
If EX1 fails: print actual vs expected; align test array with actual surface (the surface IS the contract; if executor accidentally added a symbol in 05-02 or 05-03, decide whether to keep it or remove it before locking).

If TB1 fails (output > 1500): trace through formatInitiativeForPlanner — identify which section is contributing. Add tighter truncation OR reduce sub_issues display further. The MAX_FORMATTED_PLANNER_CHARS is a hard ceiling.

If IT1/IT2/IT3 fail with GH_INTEGRATION=1: gh auth issue or org Product Roadmap empty. Surface in summary as test environment issue; obj 5 implementation is still correct.

If banner regex fails (EX2): ensure `LOCKED by TRD 05-05` appears verbatim in the source. Banner is not free-form — it's the contract that future TRDs check.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test</test>
</validation_gates>

<verification>
1. **Export-surface lock (SC-8):** EX1 deepStrictEqual passes; banner comment present in source.
2. **Token-budget assertion (SC-10):** TB1 (single adversarial) ≤ MAX_FORMATTED_PLANNER_CHARS; TB2 (multi-init composition) ≤ 6 KB; truncation appends ellipsis.
3. **Round-trip integration (SC-9):** IT1-IT3 skip cleanly when env unset; pass against live data when GH_INTEGRATION=1.
4. **Default-run mocked integration (IT5):** sync end-to-end works without live gh, returns expected structured result.
5. **Surface contract:** `module.exports` is the authoritative API for `lib/initiatives.cjs`. Future TRDs MUST update both module + EX1 test atomically.
6. **No regressions:** full test suite passes (842 baseline + ~150 obj 5 = ~990 tests, allowing for skip variations).
</verification>

<success_criteria>
- [ ] `module.exports` finalized with banner comment
- [ ] EX1 deepStrictEqual asserts locked key list
- [ ] EX2 asserts banner present in source
- [ ] EX3 + EX4 sanity-check test hooks + constants
- [ ] TB1-TB5 enforce per-initiative + multi-initiative token budgets
- [ ] IT1-IT3 gated on GH_INTEGRATION; IT5 covers default-run path with mocks
- [ ] `buildAdversarialInitiative` fixture added
- [ ] No regressions
- [ ] 2 atomic commits land: `test(05-05): ...` + `feat(05-05): ...`
- [ ] SC-8, SC-9, SC-10 closed
- [ ] **Objective 5 DONE** — STATE.md updated to reflect completion
</success_criteria>

<output>
After completion, create `.planning/objectives/05-initiative-context-layer/05-05-SUMMARY.md` documenting:
- Final export-surface count + banner verbatim
- TB1-TB5 budget enforcement results
- IT1-IT3 round-trip behavior (with `GH_INTEGRATION=1` notes; capture sample output if helpful)
- Total obj 5 test count delta
- Any LATE-ADD entries documented (additions this TRD made beyond the partial exports of 05-01/02/03)
- Confirmation that SC-1 through SC-10 are all closed

Then ALSO update `.planning/STATE.md`:
- "Objective complete: 5 — Initiative context layer (verified <date>, <test count> tests, all 10 SC met, 5 TRDs done)"
- Move objective 5 entry from "in-flight" to "complete"
</output>
