---
objective: 08-program-aware-tui
trd: "08-01"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/tui.cjs
  - plugins/devflow/devflow/bin/lib/tui.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/default-80x24.txt
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/narrow-60x24.txt
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-org.txt
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-initiatives.txt
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-peer.txt
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/all-empty.txt
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/no-color.txt
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/tall-data.txt
  - plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/unicode-text.txt
autonomous: true
requirements:
  - SC-1
  - SC-2
  - SC-3
  - SC-7
  - SC-8

must_haves:
  truths:
    - "render() produces the same ANSI string for the same input (deterministic)"
    - "render() never throws on null / empty awareness, initiatives, or orgChain"
    - "render() reflows to single-column when opts.cols < 80"
    - "Each sub-renderer (_renderOrgPanel, _renderPeerPanel, _renderInitiativesPanel) returns a string for any input shape"
    - "_layoutPanels(rows, cols, panels) returns a string of exactly rows*cols printable cells (modulo ANSI escapes) when given valid panel content"
    - "render() honors opts.no_color === true by stripping all SGR color sequences"
    - "Every snapshot fixture in __fixtures__/tui-snapshots/ matches render(buildFixture(scenario)) byte-for-byte"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/tui.cjs"
      provides: "Pure renderer + 3 sub-renderers + _layoutPanels + ANSI helpers"
      exports: ["render", "_renderOrgPanel", "_renderPeerPanel", "_renderInitiativesPanel", "_layoutPanels"]
      min_lines: 250
    - path: "plugins/devflow/devflow/bin/lib/tui.test.cjs"
      provides: "Snapshot tests + sub-renderer unit tests + resilience tests"
      contains: "describe.*tui|test.*render"
      min_lines: 150
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs"
      provides: "Hand-built fixture builders (no LLM-generated data)"
      exports: ["buildTuiAggregate", "buildPanelOpts", "buildAwarenessSimple", "buildAwarenessEmpty", "buildInitiativesSimple", "buildInitiativesEmpty", "buildOrgChainSimple", "buildOrgChainEmpty", "buildAdversarialAggregate"]
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/default-80x24.txt"
      provides: "Happy-path 80x24 snapshot (committed expected ANSI)"
      contains: "\\x1b\\["
  key_links:
    - from: "tui.test.cjs"
      to: "tui.cjs render"
      via: "require('./tui.cjs').render(...)"
      pattern: "require\\(['\"]\\./tui\\.cjs['\"]\\)"
    - from: "tui.cjs render"
      to: "_renderOrgPanel + _renderPeerPanel + _renderInitiativesPanel + _layoutPanels"
      via: "internal function calls (composition)"
      pattern: "_layoutPanels\\("
    - from: "tui.test.cjs snapshot tests"
      to: "__fixtures__/tui-snapshots/*.txt"
      via: "fs.readFileSync(snapshotPath, 'utf8')"
      pattern: "tui-snapshots/[a-z0-9-]+\\.txt"
    - from: "tui.test.cjs"
      to: "__fixtures__/tui-fixtures.cjs builders"
      via: "require + builder invocation"
      pattern: "buildTuiAggregate|buildAwareness|buildOrgChain|buildInitiatives"
---

<objective>
Build the pure rendering core for the program-aware TUI: `render()` + three sub-renderers + `_layoutPanels()` + ANSI helpers, with hand-built fixture builders and 9 snapshot tests covering happy path, edge cases, and failure modes.

Purpose: Lock the rendered output as a deterministic, testable artifact before any terminal-control wiring (TRD 08-02) or composition glue (TRD 08-03). TDD discipline (RED → GREEN per snapshot) guarantees the renderer is pure and reproducible.

Output:
- `lib/tui.cjs` — pure renderer module (no I/O, no Date.now, no env reads outside opts)
- `lib/tui.test.cjs` — RED tests first, GREEN one snapshot at a time
- `lib/__fixtures__/tui-fixtures.cjs` — 9 hand-built fixture builders
- `lib/__fixtures__/tui-snapshots/*.txt` — 9 expected ANSI snapshots (committed)
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── tui.cjs                                              ← CREATE (pure renderer; ~300-400 lines)
├── tui.test.cjs                                         ← CREATE (test list of 9+ groups)
└── __fixtures__/
    ├── tui-fixtures.cjs                                 ← CREATE (hand-built builders)
    └── tui-snapshots/                                   ← CREATE (directory)
        ├── default-80x24.txt                            ← CREATE (happy path)
        ├── narrow-60x24.txt                             ← CREATE (reflow)
        ├── empty-org.txt                                ← CREATE (resilience)
        ├── empty-initiatives.txt                        ← CREATE (resilience)
        ├── empty-peer.txt                               ← CREATE (resilience)
        ├── all-empty.txt                                ← CREATE (resilience)
        ├── no-color.txt                                 ← CREATE (NO_COLOR honored)
        ├── tall-data.txt                                ← CREATE (truncation)
        └── unicode-text.txt                             ← CREATE (multibyte handling)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: pure renderer + sub-renderers (lib/check-todos.cjs)

```js
// formatCheckTodosMarkdown is a PURE function: aggregate -> string.
// No fs, no network, no process.exit. Deterministic for fixed input (use opts.date).
function formatCheckTodosMarkdown(aggregate, opts = {}) {
  if (!aggregate) return '_(no aggregate result)_\n';
  const showAll = !!opts.all;
  const dateStr = opts.date || _todayDateString();
  const lines = [`# 📋 DevFlow Standup — ${dateStr}`, ''];
  for (const lane of LANE_NAMES) {
    lines.push(_renderLane(lane, aggregate[lane] || [], showAll));
  }
  return lines.join('\n');
}

function _renderLane(lane, entries, showAll) {
  const meta = _LANE_META[lane];
  const total = entries.length;
  const limit = showAll ? total : Math.min(total, DEFAULT_LANE_TRUNCATE);
  const lines = [`## ${meta.emoji} ${meta.title} (${total})`, ''];
  if (total === 0) { lines.push('_no entries_'); return lines.join('\n'); }
  for (const entry of entries.slice(0, limit)) lines.push(_renderEntry(entry));
  if (limit < total) lines.push(`_[showing ${limit}; --all for full list (${total} total)]_`);
  return lines.join('\n');
}
```

Same idiom for tui.cjs:
- `render(input)` is the public entry; deterministic; never throws
- `_renderOrgPanel(orgChain, opts)` / `_renderPeerPanel(awareness, opts)` / `_renderInitiativesPanel(initiatives, opts)` — three peers
- `_layoutPanels(rows, cols, [topStr, midStr, botStr])` — combines into final ANSI string with framing/positioning

### Pattern: sub-renderers + composition (lib/dup-detect.cjs formatDetectionMarkdown)

```js
function _renderMatchEntry(m) { /* ... */ }
function _renderAdvisoryEntry(m) { /* ... */ }
function _renderWarnings(warnings) { /* ... */ }

function formatDetectionMarkdown(detection, opts) {
  if (detection == null) return '_(no detection result available)_';
  const matches = Array.isArray(detection.matches) ? detection.matches : [];
  // ...defensive shape coercion at top, then build sections array, then join
  const sections = [];
  if (matches.length > 0) {
    const matchLines = ['### Matches (blocking)'];
    for (const m of matches.slice(0, 5)) matchLines.push(_renderMatchEntry(m));
    sections.push(matchLines.join('\n'));
  }
  return sections.join('\n\n');
}
```

Same posture for tui.cjs: defensive coercion at top of each function, slice(0, N) caps, deterministic join order.

### Pattern: hand-built fixture builders (lib/__fixtures__/awareness-fixtures.cjs)

```js
function buildOrgScanResult({
  items = [],
  fetched_at = '2026-05-04T10:00:00Z',
  project_id = 'PVT_kwDODwqLrc4BRsOP',
  warnings = [],
} = {}) {
  return { items, fetched_at, project_id, warnings };
}

// Tests use it by composing builders:
//   const result = buildOrgScanResult({ items: [buildOrgItem({ title: 'Foo' })] });
```

This is the locked playbook discipline: no LLM-generated test data; builders take overrideable defaults; tests compose.

### Pattern: snapshot via fs read (mirror obj 1 cassette pattern)

```js
const fs = require('fs');
const path = require('path');

const snap = (name) => fs.readFileSync(
  path.join(__dirname, '__fixtures__/tui-snapshots', name + '.txt'),
  'utf8'
);

test('renders default 80x24 happy path', () => {
  const fixture = buildTuiAggregate({ cols: 80, rows: 24 });
  const expected = snap('default-80x24');
  assert.strictEqual(tui.render(fixture), expected);
});
```

Snapshots are NEVER auto-regenerated. Hand-write them once (use a temporary `console.log(tui.render(fixture))` during initial GREEN, copy stdout to snapshot file, delete the log, commit). Subsequent test runs only assert; intentional changes require manual snapshot update + reviewable diff.

### Pattern: ANSI string assembly (locked cheatsheet — see CONTEXT.md §6)

```js
const ESC = '\x1b';
const ALT_SCREEN_ON  = ESC + '[?1049h';
const CURSOR_HIDE    = ESC + '[?25l';
const CLEAR_SCREEN   = ESC + '[2J';
const CURSOR_HOME    = ESC + '[H';
const RESET          = ESC + '[0m';
const BOLD           = ESC + '[1m';

function _moveTo(row, col) { return ESC + '[' + row + ';' + col + 'H'; }
function _color(n) { return ESC + '[3' + n + 'm'; }
```

When `opts.no_color === true`, replace all `_color(n)` calls with `''`. Same for BOLD/DIM if SGR-suppression is wanted (decision: keep BOLD/DIM under no_color OFF since they're attribute-only and snapshots can pin them; only strip the FG color codes `\x1b[3{0..7}m`). Document this contract in the no-color snapshot.

</codebase_examples>

<anti_patterns>

### Anti-pattern 1: Auto-regenerating snapshots

**Bad:**
```js
test('snapshot', () => {
  const out = tui.render(fixture);
  if (!fs.existsSync(snapPath)) fs.writeFileSync(snapPath, out);  // never do this
  assert.strictEqual(out, fs.readFileSync(snapPath, 'utf8'));
});
```

Why bad: makes the snapshot meaningless — first run after a regression silently writes the regression as the new expected. Mirrors the cassette discipline locked in obj 1 (E4/L2 drift detection only with GH_INTEGRATION=1).

**Good:** snapshot file MUST exist before the test runs; first failing run produces a real diff the developer reviews.

### Anti-pattern 2: Reading process.stdout.columns inside render()

**Bad:**
```js
function render(input) {
  const cols = input.opts.cols || process.stdout.columns || 80;  // impure
  // ...
}
```

Why bad: breaks determinism in CI (where stdout.columns is undefined or set to 80 by tooling, depending on runner). Snapshot tests become flaky.

**Good:** `cols` and `rows` MUST come from `opts` only. The CLI (TRD 08-02) reads `process.stdout.columns` once and passes it in.

### Anti-pattern 3: LLM-generated test fixture data

**Bad:**
```js
const peerBranches = [
  { branch: 'feature/some-cool-thing', objective: 'Lorem ipsum dolor sit amet', /*...*/ },
  { branch: 'fix/bug-123', objective: 'Quick brown fox jumps', /*...*/ },
  // ... 50 LLM-generated lines
];
```

Why bad: shallow, repetitive, no real-world variety; misses edge cases like multibyte chars, empty strings, very long titles. Per the playbook: hand-build fixtures or generate via deterministic script, not by asking the LLM.

**Good:** small, hand-written, named fixtures that target specific test cases (`buildAwarenessSimple` = 2 branches with known timestamps; `buildAdversarialAggregate` = embedded ANSI + emoji + 200-char strings).

### Anti-pattern 4: Throwing on missing data

**Bad:**
```js
function _renderInitiativesPanel(initiatives, opts) {
  return initiatives.map(i => '...').join('\n');  // crashes when initiatives === null
}
```

Why bad: SC-8 requires non-throwing degradation. CI snapshot tests prove this; production crash on a missing cache file would be a regression.

**Good:** defensive coerce at top: `const arr = Array.isArray(initiatives) ? initiatives : [];`

</anti_patterns>

<error_recovery>

### Snapshot mismatch on first GREEN run

Expected: writing the implementation produces stdout that doesn't match the empty snapshot file.

Recovery:
1. Run the test; capture actual output via `console.log(JSON.stringify(actual))` in the test temporarily.
2. Inspect the actual output by hand. Is it correct? Layout right, text right, ANSI codes right?
3. If correct: copy actual output into the snapshot file (literal byte content, NOT JSON-escaped). Re-run; should pass.
4. If not correct: fix the renderer; iterate.

Do NOT use a write-on-mismatch helper. Each snapshot is locked once and reviewed manually.

### Multibyte width math producing visual glitches

Expected: emoji or CJK characters in branch names cause column math to be 1-2 cols off in `_layoutPanels`.

Recovery: accept the off-by-one for v1.1; pin the behavior in `unicode-text.txt` snapshot. Document in the snapshot's leading comment line (yes, snapshots can have a leading `# scenario: ...` comment that the test strips before comparison — see test pattern below).

### Long content overflow

Expected: a panel's content is taller than its allocated rows; `_layoutPanels` either truncates or breaks frame.

Recovery: each sub-renderer takes `(data, opts)` where `opts.maxRows` is the panel's allocated row budget. Sub-renderer truncates internally with a `_[N more]_` footer line. `_layoutPanels` does NOT truncate — it trusts sub-renderers to honor `maxRows`.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/08-program-aware-tui/08-CONTEXT.md
@plugins/devflow/devflow/bin/lib/check-todos.cjs
@plugins/devflow/devflow/bin/lib/dup-detect.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
</context>

<gotchas>

- **Determinism over convenience.** `render()` MUST be pure. No `Date.now()`, no `Math.random()`, no env reads, no `process.stdout.columns`. All variability comes through `opts`.
- **Snapshots are committed binaries-of-bytes.** Don't add trailing newline by accident. Use `fs.readFileSync(path, 'utf8')` with NO `.trim()`; assert byte-for-byte.
- **Snapshot files MUST exist before the test runs.** The RED phase creates *empty* snapshot files (`fs.writeFileSync(snapPath, '')`) so the test compares actual-vs-empty (FAIL). GREEN phase fills the snapshots manually after reviewing the actual output.
- **No-color contract:** `opts.no_color === true` strips `\x1b[3{0..7}m` foreground colors. Box drawing chars + cursor-position escapes (`\x1b[H`, `\x1b[{r};{c}H`) + alternate-screen toggles are NOT stripped (those aren't "color"). Document this in the leading line of `no-color.txt` snapshot.
- **Box drawing chars are 3-byte UTF-8.** Length-in-bytes ≠ length-in-cells. When measuring "does this fit in N cols", count code points (or, easier: count `[...str].length`), not `str.length`.
- **opts.cols < 1 / opts.rows < 1 are invalid.** Render returns the string `'_(invalid terminal size)_'` — pinned in a test (no snapshot needed; assert.strictEqual is enough).
- **All snapshot files use LF line endings.** No CRLF. Set editor accordingly. The test files use the literal `'\n'` in any inline expectations — never `'\r\n'`.

</gotchas>

## Test list (TDD playbook — required before any test code)

Per the playbook habit #2 ("test list first"), each TDD TRD must include a checklist of behavior cases — happy path, edge cases, failure modes — before any test code is written. This is the reviewable artifact; it locks scope for the RED phase.

**Group A — render() public contract**
- [ ] A1: `render(undefined)` returns a non-empty string (no throw, no crash) — defensive top-level
- [ ] A2: `render(null)` returns a non-empty string (no throw)
- [ ] A3: `render({})` (empty object) returns a string with all 3 panel placeholders
- [ ] A4: `render({ opts: { cols: 0, rows: 24 } })` returns `'_(invalid terminal size)_'`
- [ ] A5: `render({ opts: { cols: 80, rows: 0 } })` returns `'_(invalid terminal size)_'`
- [ ] A6: `render(buildTuiAggregate({}))` produces deterministic output (call twice, byte-equal)

**Group B — _renderOrgPanel sub-renderer**
- [ ] B1: empty orgChain (`{}`) → returns "(no org context)" placeholder line
- [ ] B2: null orgChain → returns "(no org context)" placeholder line (no throw)
- [ ] B3: simple orgChain (1 product, 1 quarter, 2 items) → product header + quarter header + 2 item lines
- [ ] B4: 5+ items in a quarter → first 3 shown + `[N more]` footer (per-panel truncation)
- [ ] B5: items missing title → renders `(no title)` placeholder; doesn't crash

**Group C — _renderPeerPanel sub-renderer**
- [ ] C1: empty branches array → "(no peer sessions)" placeholder
- [ ] C2: null awareness → "(no peer sessions)" placeholder (no throw)
- [ ] C3: 2 branches with known timestamps → 2 lines: branch + objective + last_commit subject + relative time
- [ ] C4: 10 branches → first 5 shown + `[N more]` footer
- [ ] C5: branch with null `last_commit` → renders `(no commit)` placeholder; doesn't crash
- [ ] C6: branch matching `awareness.current_branch` → marked with `*` prefix (so user sees their session)

**Group D — _renderInitiativesPanel sub-renderer**
- [ ] D1: empty array → "(no initiatives)" placeholder
- [ ] D2: null → "(no initiatives)" placeholder (no throw)
- [ ] D3: 2 initiatives with `why` text → 2 entries: slug + truncated why (first sentence) + question count
- [ ] D4: initiative with `questions: []` → renders "0 open questions" not blank
- [ ] D5: 5+ initiatives → first 3 shown + `[N more]` footer
- [ ] D6: initiative with very long `why` (1000+ chars) → truncated to ~80 chars with `...`

**Group E — _layoutPanels combinator**
- [ ] E1: `_layoutPanels(24, 80, ['top', 'mid', 'bot'])` returns a string containing all three panel bodies
- [ ] E2: rows split: 24 rows → top=8, middle=8, bottom=8 (3-way equal split with header lines)
- [ ] E3: cols=60 (< 80 reflow threshold) → returns single-column stacked layout (no horizontal frame)
- [ ] E4: cols=80 → standard layout with horizontal frame between panels
- [ ] E5: panel content overflows allocated rows → sub-renderer is responsible (layoutPanels just composites)

**Group F — opts.no_color contract**
- [ ] F1: `render(fixture)` contains `\x1b[3` substrings (FG color)
- [ ] F2: `render({ ...fixture, opts: { ...opts, no_color: true } })` contains zero `\x1b[3{0..7}m` substrings
- [ ] F3: no_color=true preserves `\x1b[H`, `\x1b[2J`, `\x1b[?25l` (those are not colors)

**Group G — snapshot tests (the SC-7 surface)**
- [ ] G1: `default-80x24.txt` matches `render(buildTuiAggregate({ rows: 24, cols: 80 }))`
- [ ] G2: `narrow-60x24.txt` matches `render(buildTuiAggregate({ rows: 24, cols: 60 }))`
- [ ] G3: `empty-org.txt` matches `render({ awareness: buildAwarenessSimple(), initiatives: buildInitiativesSimple(), orgChain: null, opts: ... })`
- [ ] G4: `empty-initiatives.txt` matches similar with `initiatives: []`
- [ ] G5: `empty-peer.txt` matches similar with `awareness: { branches: [], ... }`
- [ ] G6: `all-empty.txt` matches with all three sources empty/null
- [ ] G7: `no-color.txt` matches `render(buildTuiAggregate({ no_color: true }))`
- [ ] G8: `tall-data.txt` matches `render(buildTuiAggregate({ many_branches: 10, many_initiatives: 8 }))` — exercises truncation
- [ ] G9: `unicode-text.txt` matches `render(buildAdversarialAggregate())`

**Group X — fixture builder smoke tests (so a fixture regression doesn't poison snapshots silently)**
- [ ] X1: `buildTuiAggregate({})` returns object with `awareness`, `initiatives`, `orgChain`, `opts` keys
- [ ] X2: `buildPanelOpts({ cols: 80, rows: 24 })` returns object with the locked shape
- [ ] X3: `buildAwarenessSimple()` returns 2-3 branches with non-null `last_commit.timestamp`
- [ ] X4: `buildAdversarialAggregate()` includes at least one branch with non-ASCII characters

**Total: 30+ test cases across 8 groups + snapshot tests.** Each group is one cycle of the RED→GREEN loop (test list discipline; one test at a time).

<tasks>

<task type="auto">
  <name>Task 1: Hand-write fixture builders (no LLM data)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs</files>
  <action>
Create `plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs` with 9 hand-built fixture builders. Per playbook habit #4: all data is hand-written; no LLM-generated test data; no random/faker.

Approach:
1. Module starts with `'use strict';` then `module.exports = { ... };` block.
2. Each builder takes an `opts = {}` arg with sensible defaults; user can override any field.
3. Reuse builder composition: `buildTuiAggregate` calls `buildAwarenessSimple()`, `buildInitiativesSimple()`, `buildOrgChainSimple()`, `buildPanelOpts()` by default.

Required builders (signatures locked by snapshot tests below):

```js
function buildPanelOpts({
  rows = 24,
  cols = 80,
  no_color = false,
  current_repo = 'AO-Cyber-Systems/devflow-claude',
} = {}) {
  return { rows, cols, no_color, current_repo };
}

function buildAwarenessSimple() {
  return {
    branches: [
      { branch: 'feature/v1.1-obj-7', objective: 'Roadmap reconciliation', trd: '07-02',
        github_issue: '16', last_commit: { sha: 'abc1234', timestamp: '2026-05-03T14:22:00Z', subject: 'feat: reconcile drift' },
        developer: 'mark' },
      { branch: 'feature/v1.1-obj-8-tui', objective: 'Program-aware TUI viewer', trd: '08-01',
        github_issue: '17', last_commit: { sha: 'def5678', timestamp: '2026-05-04T08:31:00Z', subject: 'test: snapshot RED for renderer' },
        developer: 'mark' },
    ],
    fetched_at: '2026-05-04T10:00:00Z',
    warnings: [],
    current_branch: 'feature/v1.1-obj-8-tui',
  };
}

function buildAwarenessEmpty() {
  return { branches: [], fetched_at: '2026-05-04T10:00:00Z', warnings: [], current_branch: null };
}

function buildInitiativesSimple() {
  return [
    { slug: 'devflow-internal-alpha-q2-2026', github_issue: '30',
      key_repos: ['AO-Cyber-Systems/devflow', 'AO-Cyber-Systems/devflow-claude'],
      why: 'Ship a workable internal alpha by end of Q2 2026 so AO-Cyber-Systems devs can dogfood DevFlow.',
      questions: ['Should the alpha include the Hub Flutter app?', 'Do we gate on PTY support or ship without?'],
      sub_issues: ['#9', '#10'],
      updated_at: '2026-05-04T09:15:00Z' },
    { slug: 'cross-repo-coordination-substrate', github_issue: '31',
      key_repos: ['AO-Cyber-Systems/devflow-claude'],
      why: 'GitHub Issues + Projects v2 + sub-issues becomes the org coordination substrate.',
      questions: [],
      sub_issues: [],
      updated_at: '2026-05-03T18:00:00Z' },
  ];
}

function buildInitiativesEmpty() { return []; }

function buildOrgChainSimple() {
  return {
    'devflow-claude': {
      'Q2 2026': [
        { title: 'v1.1 Coordination Layer', github_issue: '9', status: 'In Progress', sub_issues_source: 'tracked_issues' },
        { title: 'Refine kind/work defaults', github_issue: '20', status: 'Done', sub_issues_source: 'task_list' },
      ],
    },
    'devflow': {
      'Q2 2026': [
        { title: 'Internal Alpha', github_issue: '30', status: 'In Progress', sub_issues_source: 'tracked_issues' },
      ],
    },
  };
}

function buildOrgChainEmpty() { return {}; }

function buildTuiAggregate({
  rows = 24, cols = 80, no_color = false,
  many_branches = 0, many_initiatives = 0,
} = {}) {
  const awareness = buildAwarenessSimple();
  if (many_branches > 0) {
    // Pad with deterministic synthetic branches; same shape as buildAwarenessSimple entries.
    for (let i = 0; i < many_branches; i++) {
      awareness.branches.push({
        branch: `feature/synthetic-${i}`, objective: `Synthetic objective ${i}`, trd: `99-${String(i).padStart(2, '0')}`,
        github_issue: String(100 + i),
        last_commit: { sha: 'aaaa' + String(i).padStart(4, '0'), timestamp: '2026-05-02T10:00:00Z', subject: `chore: synthetic commit ${i}` },
        developer: 'mark',
      });
    }
  }
  let initiatives = buildInitiativesSimple();
  if (many_initiatives > 0) {
    for (let i = 0; i < many_initiatives; i++) {
      initiatives.push({
        slug: `synthetic-initiative-${i}`, github_issue: String(200 + i),
        key_repos: ['AO-Cyber-Systems/devflow-claude'], why: `Synthetic why ${i}`,
        questions: [], sub_issues: [], updated_at: '2026-05-01T10:00:00Z',
      });
    }
  }
  return {
    awareness, initiatives, orgChain: buildOrgChainSimple(), todos: null,
    opts: buildPanelOpts({ rows, cols, no_color }),
  };
}

function buildAdversarialAggregate() {
  return {
    awareness: { branches: [
      { branch: 'feature/🚀-emoji-name', objective: '日本語 objective', trd: '01-01', github_issue: '1',
        last_commit: { sha: 'utf8utf', timestamp: '2026-05-04T00:00:00Z', subject: 'feat: 日本語 commit message with emoji 🎉' },
        developer: 'mark' },
      { branch: 'feature/very-long-branch-name-that-overflows-80-cols-in-most-terminals',
        objective: 'A'.repeat(200), trd: '02-02', github_issue: '2',
        last_commit: { sha: 'longlng', timestamp: '2026-05-04T00:00:00Z', subject: 'B'.repeat(200) },
        developer: 'mark' },
    ], fetched_at: '2026-05-04T10:00:00Z', warnings: [], current_branch: 'feature/🚀-emoji-name' },
    initiatives: [
      { slug: 'unicode-slug-日本', github_issue: '99', key_repos: [], why: '🚀 ' + 'C'.repeat(2000),
        questions: [], sub_issues: [], updated_at: '2026-05-04T00:00:00Z' },
    ],
    orgChain: {
      'unicode-product-🌟': { 'Q2 2026': [{ title: 'Embedded ANSI \\x1b[31mfake red\\x1b[0m attack', github_issue: '500', status: 'Open', sub_issues_source: 'none' }] },
    },
    todos: null,
    opts: buildPanelOpts({ rows: 24, cols: 80, no_color: false }),
  };
}
```

Note the `Embedded ANSI` test entry: it's a literal string with backslashes, NOT real escape codes. The renderer's job is to either escape or strip these so output is sanitized. The snapshot test pins the chosen behavior. (Suggested: replace `\x1b` byte (0x1b) in user-supplied text with `?` before rendering — same idiom as `_sanitize` in dup-detect.cjs.)

Final line: `module.exports = { buildPanelOpts, buildAwarenessSimple, buildAwarenessEmpty, buildInitiativesSimple, buildInitiativesEmpty, buildOrgChainSimple, buildOrgChainEmpty, buildTuiAggregate, buildAdversarialAggregate };`

# CRITICAL: NO LLM-generated data in this file. All strings hand-written or built from `'A'.repeat(N)`.
# GOTCHA: Builders return NEW objects on each call (don't share the same array reference) — tests mutate, builders must not leak state.
# PATTERN: Mirror obj 2's `awareness-fixtures.cjs` builder style (see codebase_examples).
  </action>
  <verify>
node -e "const f = require('./plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs'); const a = f.buildTuiAggregate({}); console.log(JSON.stringify(Object.keys(a))); console.log('branches:', a.awareness.branches.length, 'initiatives:', a.initiatives.length);"

Expected: `["awareness","initiatives","orgChain","todos","opts"]` then `branches: 2 initiatives: 2`.

Also: `node -e "const f = require('./plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs'); const a = f.buildAdversarialAggregate(); console.log(a.initiatives[0].why.length);"` should print `2003` (the `'C'.repeat(2000)` plus prefix).
  </verify>
  <done>
Fixtures module loads cleanly. All 9 builders exported. `buildTuiAggregate({})` returns a 5-key object. `buildAdversarialAggregate()` includes embedded ANSI string + multibyte chars + long strings. No LLM-generated data — every string is either hand-typed or a bounded `repeat()` construction.
  </done>
  <recovery>
If the JSON.stringify dump shows a different shape than expected, edit the affected builder to add the missing key. If a downstream snapshot test fails because a builder changed shape, the snapshot must be regenerated by hand (per anti-pattern: never auto-regenerate). Document the shape change in a comment at the top of the affected builder.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: RED — write all test groups (A-G + X) with empty snapshot files</name>
  <files>plugins/devflow/devflow/bin/lib/tui.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/default-80x24.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/narrow-60x24.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-org.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-initiatives.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-peer.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/all-empty.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/no-color.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/tall-data.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/unicode-text.txt</files>
  <action>
Write `lib/tui.test.cjs` with all test cases from the test list above, AND create empty snapshot files for the 9 scenarios.

This is the RED phase: tests must FAIL. `tui.cjs` does not exist yet (next task), and snapshot files are empty (so byte-equality checks fail with a usable diff).

Approach:
1. Top of file: `'use strict';` + `const { test, describe } = require('node:test');` + `const assert = require('node:assert/strict');` + `const fs = require('fs');` + `const path = require('path');`.
2. Require fixtures: `const f = require('./__fixtures__/tui-fixtures.cjs');`.
3. Require renderer: `const tui = require('./tui.cjs');` — this WILL throw at test time because tui.cjs doesn't exist; that's the RED signal. Wrap in `try { ... } catch {}` ONLY IF needed to collect more failing tests in one run; preferred is to let it throw at the require, see the failure, then move to GREEN.

Helper at top:
```js
const SNAP_DIR = path.join(__dirname, '__fixtures__/tui-snapshots');
const snap = (name) => fs.readFileSync(path.join(SNAP_DIR, name + '.txt'), 'utf8');
```

Implement Groups A-G + X. Each test is one `test('description', () => { ... });` block. Use `describe` to group related tests:

```js
describe('Group A: render() public contract', () => {
  test('A1: render(undefined) returns non-empty string', () => {
    const out = tui.render(undefined);
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  });

  test('A2: render(null) returns non-empty string', () => {
    const out = tui.render(null);
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  });

  // ... A3-A6 per test list
});

describe('Group B: _renderOrgPanel sub-renderer', () => { /* B1-B5 */ });
describe('Group C: _renderPeerPanel sub-renderer', () => { /* C1-C6 */ });
describe('Group D: _renderInitiativesPanel sub-renderer', () => { /* D1-D6 */ });
describe('Group E: _layoutPanels combinator', () => { /* E1-E5 */ });
describe('Group F: opts.no_color contract', () => { /* F1-F3 */ });
describe('Group G: snapshot tests', () => {
  test('G1: default-80x24', () => {
    const fixture = f.buildTuiAggregate({ rows: 24, cols: 80 });
    assert.strictEqual(tui.render(fixture), snap('default-80x24'));
  });
  // ... G2-G9
});
describe('Group X: fixture builder smoke', () => { /* X1-X4 */ });
```

Then create the 9 snapshot files as EMPTY files:
```bash
touch plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/default-80x24.txt
# ...etc for all 9
```

Wait — empty file means `snap('default-80x24')` returns `''` (empty string). `tui.render(fixture)` will return SOMETHING (we hope, once Task 3 runs). They won't match → test FAILS. That's the desired RED.

If you want the snapshot test to fail cleanly even without `tui.cjs`, the require at the top will throw — which is also a RED. Either way: tests must fail.

Commit: `test(08-01): add failing test list for tui renderer (30+ cases, 9 snapshots)`

# CRITICAL: Tests MUST fail. If they pass at this stage, the test is wrong.
# GOTCHA: `node --test` recursively discovers `*.test.cjs`. The new test file will be picked up automatically by `npm test`.
# PATTERN: Mirror lib/dup-detect.test.cjs / lib/check-todos.test.cjs structure (describe/test blocks, hand-written assertions, no LLM-shaped expectations).
  </action>
  <verify>
npm test 2>&1 | tail -30

Expected: tests FAIL. Specifically: errors mentioning `Cannot find module './tui.cjs'` (Group A-G can't load) and/or empty-string mismatches (Group X passes since fixtures don't depend on tui.cjs; Groups A-G fail).

Confirm at least 20+ failures total in the new file. If 0 fail, the test list isn't actually testing anything — fix.

Also confirm snapshot files exist (even if empty):
ls plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/

Expected: 9 .txt files listed.
  </verify>
  <done>
Test file exists with 30+ test cases organized in 8 describe blocks (A-G + X). 9 empty snapshot .txt files committed at `__fixtures__/tui-snapshots/`. `npm test` shows the new test file's tests failing (no GREEN passes for snapshot tests; X group may pass since it only tests fixtures).

Test commit: `test(08-01): add failing test list for tui renderer (30+ cases, 9 snapshots)` (this is the RED phase commit).
  </done>
  <recovery>
If `npm test` exits 0 with the new tests passing — that's a defect. Likely cause: the test asserts only that `out.length > 0` and tui.cjs already exists from a different TRD's work. Check: does `lib/tui.cjs` exist? If yes, this TRD is already partially done — investigate state with the user before proceeding.

If `npm test` errors out at module-discovery (parse error in test file) before running anything: fix the syntax error and re-run. The test file MUST parse even if its assertions fail.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: GREEN — implement tui.cjs renderer + sub-renderers + _layoutPanels; one snapshot at a time</name>
  <files>plugins/devflow/devflow/bin/lib/tui.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/default-80x24.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/narrow-60x24.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-org.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-initiatives.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/empty-peer.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/all-empty.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/no-color.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/tall-data.txt, plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/unicode-text.txt</files>
  <action>
Implement `plugins/devflow/devflow/bin/lib/tui.cjs` and fill in the 9 snapshot files. **One test at a time** (playbook habit #3) through the test list — make A1 pass, then A2, then …, all the way to G9.

Approach (RED → GREEN cycle, looped per test):

```
LOOP:
  1. Run npm test; pick the next failing test
  2. Implement just enough in tui.cjs to make it pass (or, for snapshot tests, generate the actual output and copy to snapshot file)
  3. Run npm test; confirm that test passes; confirm no previously passing test regressed
  4. Repeat until all 30+ tests pass
```

`tui.cjs` skeleton (write incrementally, not all at once):

```js
'use strict';

// ─── 08-01: ANSI helpers ─────────────────────────────────────────────────────
const ESC = '\x1b';
const CLEAR_SCREEN = ESC + '[2J';
const CURSOR_HOME = ESC + '[H';
const RESET = ESC + '[0m';
const BOLD = ESC + '[1m';
const DIM = ESC + '[2m';

function _moveTo(row, col) { return ESC + '[' + row + ';' + col + 'H'; }
function _color(n, no_color) { return no_color ? '' : ESC + '[3' + n + 'm'; }
function _sanitize(s) {
  if (s == null) return '';
  // Replace ESC bytes with '?' (prevents user-supplied ANSI injection)
  return String(s).replace(/\x1b/g, '?').replace(/[\r\n]+/g, ' ');
}
function _truncate(s, n) {
  const arr = [...s];                       // code-point safe (handles emoji)
  if (arr.length <= n) return s;
  return arr.slice(0, n - 1).join('') + '…';
}

const NARROW_THRESHOLD = 80;
const PANEL_TRUNCATE_LIMIT = 5;             // peer + initiatives top-N
const ORG_TRUNCATE_LIMIT = 3;               // org tree per-quarter top-N

// ─── 08-01: Sub-renderers ────────────────────────────────────────────────────

function _renderOrgPanel(orgChain, opts) {
  const safe = (orgChain && typeof orgChain === 'object') ? orgChain : null;
  const products = safe ? Object.keys(safe) : [];
  if (!safe || products.length === 0) {
    return '_(no org context — run /devflow:awareness)_';
  }
  const lines = [];
  for (const product of products) {
    lines.push(_color(6, opts.no_color) + BOLD + _sanitize(product) + RESET);
    const quarters = Object.keys(safe[product] || {});
    for (const quarter of quarters) {
      const items = safe[product][quarter] || [];
      lines.push('  ' + DIM + _sanitize(quarter) + RESET);
      const shown = items.slice(0, ORG_TRUNCATE_LIMIT);
      for (const item of shown) {
        const title = _truncate(_sanitize(item.title) || '(no title)', opts.cols - 8);
        const issue = item.github_issue ? '#' + item.github_issue : '';
        lines.push('    ' + title + ' ' + DIM + issue + RESET);
      }
      if (items.length > ORG_TRUNCATE_LIMIT) {
        lines.push('    ' + DIM + '[' + (items.length - ORG_TRUNCATE_LIMIT) + ' more]' + RESET);
      }
    }
  }
  return lines.join('\n');
}

function _renderPeerPanel(awareness, opts) {
  const branches = (awareness && Array.isArray(awareness.branches)) ? awareness.branches : [];
  if (branches.length === 0) return '_(no peer sessions)_';
  const current = awareness.current_branch || null;
  const lines = [];
  const shown = branches.slice(0, PANEL_TRUNCATE_LIMIT);
  for (const b of shown) {
    const star = (b.branch === current) ? '*' : ' ';
    const subj = b.last_commit ? _sanitize(b.last_commit.subject) : '(no commit)';
    const ts = b.last_commit ? _sanitize(b.last_commit.timestamp) : '';
    const line = star + ' ' + BOLD + _sanitize(b.branch) + RESET + ' — ' +
                 _sanitize(b.objective || '(no objective)') + ' ' +
                 DIM + '· ' + subj + ' (' + ts + ')' + RESET;
    lines.push(_truncate(line, opts.cols - 2));
  }
  if (branches.length > PANEL_TRUNCATE_LIMIT) {
    lines.push(DIM + '[' + (branches.length - PANEL_TRUNCATE_LIMIT) + ' more]' + RESET);
  }
  return lines.join('\n');
}

function _renderInitiativesPanel(initiatives, opts) {
  const arr = Array.isArray(initiatives) ? initiatives : [];
  if (arr.length === 0) return '_(no initiatives)_';
  const lines = [];
  const shown = arr.slice(0, ORG_TRUNCATE_LIMIT);
  for (const init of shown) {
    const slug = _sanitize(init.slug) || '(no slug)';
    const why = init.why ? _truncate(_sanitize(init.why).split(/[.!?]\s/)[0], 80) : '';
    const qcount = (init.questions && Array.isArray(init.questions)) ? init.questions.length : 0;
    lines.push(BOLD + slug + RESET + ' — ' + why);
    lines.push('  ' + DIM + qcount + ' open question' + (qcount === 1 ? '' : 's') + RESET);
  }
  if (arr.length > ORG_TRUNCATE_LIMIT) {
    lines.push(DIM + '[' + (arr.length - ORG_TRUNCATE_LIMIT) + ' more]' + RESET);
  }
  return lines.join('\n');
}

// ─── 08-01: Layout combinator ────────────────────────────────────────────────

function _layoutPanels(rows, cols, panels) {
  if (rows < 1 || cols < 1) return '_(invalid terminal size)_';
  const [top, mid, bot] = panels;
  const narrow = cols < NARROW_THRESHOLD;
  if (narrow) {
    // Single-column stacked layout — no horizontal frame
    return [
      BOLD + '── Org Context ──' + RESET, top, '',
      BOLD + '── Peer Sessions ──' + RESET, mid, '',
      BOLD + '── Active Initiatives ──' + RESET, bot,
    ].join('\n');
  }
  // 80-col layout: header line + body + separator per panel
  const sep = '─'.repeat(Math.max(cols - 2, 1));
  return [
    BOLD + '┌─ Org Context ' + sep.slice(15) + RESET, top,
    BOLD + '├─ Peer Sessions ' + sep.slice(17) + RESET, mid,
    BOLD + '├─ Active Initiatives ' + sep.slice(22) + RESET, bot,
    BOLD + '└' + sep + RESET,
  ].join('\n');
}

// ─── 08-01: Public renderer ──────────────────────────────────────────────────

function render(input) {
  // Defensive top-level coercion (Group A1-A3)
  const safe = (input && typeof input === 'object') ? input : {};
  const opts = (safe.opts && typeof safe.opts === 'object') ? safe.opts : { rows: 24, cols: 80, no_color: false };
  const rows = Number.isFinite(opts.rows) ? opts.rows : 24;
  const cols = Number.isFinite(opts.cols) ? opts.cols : 80;
  if (rows < 1 || cols < 1) return '_(invalid terminal size)_';
  const renderOpts = { rows, cols, no_color: !!opts.no_color, current_repo: opts.current_repo || '' };

  const top = _renderOrgPanel(safe.orgChain, renderOpts);
  const mid = _renderPeerPanel(safe.awareness, renderOpts);
  const bot = _renderInitiativesPanel(safe.initiatives, renderOpts);

  return _layoutPanels(rows, cols, [top, mid, bot]);
}

// ─── 08-01: Test hooks (placeholders — finalized in TRD 08-03) ──────────────

let _runStdout = (s) => process.stdout.write(s);     // FOR FUTURE CLI WIRING (TRD 08-02)
function _setRunStdout(fn) { _runStdout = (fn != null) ? fn : ((s) => process.stdout.write(s)); }
function _resetMocks() { _runStdout = (s) => process.stdout.write(s); }

// ─── 08-01: Exports (LOCKED in TRD 08-03; this is the working set) ──────────

module.exports = {
  render,
  _renderOrgPanel,
  _renderPeerPanel,
  _renderInitiativesPanel,
  _layoutPanels,
  _setRunStdout,
  _resetMocks,
};
```

**Snapshot generation (one at a time):**

For each `Gn` snapshot test:
1. Run `npm test -- --test-name-pattern='G1'` (or similar). It fails with empty-string mismatch.
2. Add a temporary `console.log(JSON.stringify(actual))` line in the test; re-run.
3. The actual output appears in test stdout, JSON-quoted (so escape codes are visible as `[...`).
4. Decode the JSON in your head OR run `node -e "console.log(JSON.parse('...'))"` to get the raw string.
5. Inspect the raw output. Is it correct? (Frame right? Box drawing right? Color codes right? Truncation right?)
6. If correct: write the raw bytes to `__fixtures__/tui-snapshots/{scenario}.txt` (use `node -e "fs.writeFileSync('...', actual)"` OR a one-shot test helper that's deleted afterwards).
7. Remove the `console.log`. Re-run; test passes.
8. Move to the next snapshot.

If the actual output is WRONG (logic bug in renderer), fix the renderer first, then regenerate.

Commit cadence (per playbook + DevFlow's standard):
- After Groups A-F all pass + most G snapshots filled: `feat(08-01): implement tui renderer + sub-renderers + layout`
- After all G snapshots filled + Group X passes: `feat(08-01): complete tui snapshot suite`
- (Optional) `refactor(08-01): clean up tui module structure` if final cleanup needed.

# CRITICAL: ONE TEST AT A TIME. Do not write the whole renderer in a single shot. Per playbook habit #3.
# CRITICAL: Snapshots are written manually after inspection. Do NOT auto-write on mismatch.
# GOTCHA: `process.stdout.write` is fine in production but NEVER in pure render. Snapshot tests rely on `render()` returning a string, not writing to stdout.
# GOTCHA: Box drawing chars ('─' '│' '┌' …) are 3-byte UTF-8 each. `'─'.repeat(80)` produces 240 bytes but 80 cells. Always count cells via [...str].length.
# PATTERN: When `opts.no_color` is true, _color() returns ''. BOLD/DIM stay (per CONTEXT.md §6). The no_color snapshot fixture pins this exactly.
  </action>
  <verify>
1. `npm test 2>&1 | grep -E '(pass|fail).*tui'` — expect all tui tests passing.

2. `npm test 2>&1 | tail -5` — expect no tui-related failures.

3. Snapshot files non-empty:
   `for f in plugins/devflow/devflow/bin/lib/__fixtures__/tui-snapshots/*.txt; do echo "$f: $(wc -c < $f) bytes"; done`

   Expected: every snapshot has > 0 bytes (no empty files). The all-empty.txt may be smallest (~few hundred bytes for the frame + placeholders); default-80x24.txt is largest (~1-3 KB).

4. Determinism check:
   `node -e "const t = require('./plugins/devflow/devflow/bin/lib/tui.cjs'); const f = require('./plugins/devflow/devflow/bin/lib/__fixtures__/tui-fixtures.cjs'); const fix = f.buildTuiAggregate({}); const a = t.render(fix); const b = t.render(fix); console.log('deterministic:', a === b);"`

   Expected: `deterministic: true`.

5. Resilience check (SC-8):
   `node -e "const t = require('./plugins/devflow/devflow/bin/lib/tui.cjs'); console.log(t.render(null).length > 0); console.log(t.render({}).length > 0); console.log(t.render({ opts: { rows: 24, cols: 80 } }).length > 0);"`

   Expected: three `true` lines.

6. Total test count: `npm test 2>&1 | grep -E '^# (tests|pass|fail)' | tail`

   Expected: count increased by ~30+ (matches the test list above). 0 failures in the new file.
  </verify>
  <done>
- `lib/tui.cjs` exports the 7 locked names (`render`, `_renderOrgPanel`, `_renderPeerPanel`, `_renderInitiativesPanel`, `_layoutPanels`, `_setRunStdout`, `_resetMocks`).
- All 30+ test cases in `lib/tui.test.cjs` PASS.
- All 9 snapshot files at `__fixtures__/tui-snapshots/*.txt` are non-empty and committed.
- `render()` is deterministic (verify check #4).
- `render(null)` / `render({})` / `render({ opts: { rows: 24, cols: 80 } })` all return non-empty strings (SC-8 resilience).
- No regressions in the existing test suite (1097/1097 baseline + the new tests = ~1130 total).
- Commits: `test(08-01): ...` (RED, Task 2) + `feat(08-01): ...` (GREEN, Task 3) + optional refactor commit. Per TDD playbook: 2-3 atomic commits.
  </done>
  <recovery>
If a snapshot test passes BEFORE you've manually written its expected content: that's a bug — the snapshot file was auto-populated somewhere. Check git diff; if the snapshot file got autopopulated, manually inspect its content and confirm it's the desired output, then re-commit with a comment. If it's wrong, regenerate manually.

If the renderer produces output that's "right" but doesn't match the snapshot due to whitespace differences (trailing spaces, trailing newline, CRLF): normalize the renderer to LF-only with no trailing whitespace, then regenerate. Document the normalization rule in a leading comment in tui.cjs.

If `npm test` runs forever (hang): the new code is reading process.stdin somewhere. The renderer must be PURE — no I/O. Find and remove the offending read.

If a Group F (no_color) test fails because color codes leak through: grep for `_color(` calls that don't pass `opts.no_color`. Every `_color()` invocation must take `no_color`.

If multibyte tests crash due to `s.length` math being wrong: switch to `[...s].length` everywhere width is computed.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- All 30+ tests in `lib/tui.test.cjs` pass.
- 9 snapshot files exist and are non-empty.
- `lib/tui.cjs` exports exactly: `render`, `_renderOrgPanel`, `_renderPeerPanel`, `_renderInitiativesPanel`, `_layoutPanels`, `_setRunStdout`, `_resetMocks` (7 entries; 08-03 will add the locked banner comment).
- `render()` is pure (verified by determinism + resilience checks).
- No regressions in the existing test suite.
- Commits follow TDD playbook cadence: at least one `test(08-01):` (RED) + at least one `feat(08-01):` (GREEN). Optional `refactor(08-01):` if cleanup happened.
</verification>

<success_criteria>
- SC-1: ✓ `lib/tui.cjs` exports `render({ awareness, initiatives, todos, orgChain, opts })` — pure, returns ANSI string.
- SC-2: ✓ Three sub-renderers (`_renderOrgPanel`, `_renderPeerPanel`, `_renderInitiativesPanel`) exist; each independently tested in Groups B/C/D.
- SC-3: ✓ `_layoutPanels(rows, cols, panels)` exists; reflows < 80 cols → single-column (Group E3).
- SC-7: ✓ 9 snapshot tests pass against committed `__fixtures__/tui-snapshots/*.txt` files (Group G).
- SC-8: ✓ Resilience verified: `render(null)`, `render({})`, missing-data fixtures all return non-empty strings without throwing (Groups A1-A5, G3-G6).

CLI surface (SC-4, SC-5) and skill + export-lock + e2e (SC-6, SC-9, SC-10) are out of scope for this TRD; covered by 08-02 and 08-03.
</success_criteria>

<output>
After completion, create `.planning/objectives/08-program-aware-tui/08-01-renderer-and-fixtures-SUMMARY.md` with:
- Final renderer line count + sub-renderer breakdown
- Test count by group (A: N, B: N, ..., X: N)
- Snapshot file sizes (default-80x24.txt: N bytes, etc.)
- Any deviations from the test list (e.g., a test that was renamed or split)
- Commit hashes for the 2-3 atomic commits
- Confirmation that `lib/tui.cjs` is ready for TRD 08-02 to import (renderer surface is stable; only the export-lock banner remains for 08-03)
</output>
