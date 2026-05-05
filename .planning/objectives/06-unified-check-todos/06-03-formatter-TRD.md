---
objective: 06-unified-check-todos
trd: 06-03
type: tdd
confidence: high
wave: 3
depends_on:
  - 06-02
files_modified:
  - plugins/devflow/devflow/bin/lib/check-todos.cjs
  - plugins/devflow/devflow/bin/lib/check-todos.test.cjs
autonomous: true
requirements:
  - SC-5
must_haves:
  truths:
    - "formatCheckTodosMarkdown(aggregate) produces a single deterministic Markdown string with 4 lane sections"
    - "Each lane section uses urgency emoji prefix (🔥 / ⚡ / 📋 / 💡) + entry count + optional truncation footer"
    - "Each entry carries source attribution as italic suffix (*via <source>: <detail>*)"
    - "Default truncation: top DEFAULT_LANE_TRUNCATE (5) entries per lane; trailing '[showing N; --all for full list]' annotation when truncated"
    - "opts.all=true bypasses truncation"
    - "opts.lane='now' filters to one lane only (other lanes omitted entirely)"
    - "Empty lanes render as '## ⚡ Now (0)\\n\\n_no entries_\\n' (consistent shape, never omitted unless --lane filter)"
    - "Total output bounded by MAX_CHECK_TODOS_OUTPUT_CHARS (8000) under default flags; warned (not truncated) when exceeded"
    - "formatCheckTodosMarkdown is pure: no I/O, no process.exit, no clock-dependent ordering for fixed input"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/check-todos.cjs"
      provides: "Formatter region — formatCheckTodosMarkdown + 4 lane sub-renderers + entry sub-renderer + per-source attribution helper"
      contains: "formatCheckTodosMarkdown"
  key_links:
    - from: "formatCheckTodosMarkdown"
      to: "_renderLane (4 sub-renderers, one per lane)"
      via: "internal composition"
      pattern: "_renderLane|_renderBlocked|_renderNow|_renderSoon|_renderIdeas"
    - from: "_renderEntry"
      to: "_attributionSuffix"
      via: "italic line append per entry"
      pattern: "\\*via "
---

<objective>
Add the markdown formatter to `lib/check-todos.cjs`: `formatCheckTodosMarkdown(aggregate, opts)` is a pure renderer producing terminal-friendly output with emoji urgency markers, per-lane bullets, source attribution, token bounding, `--all` and `--lane` flag handling.

Purpose: SC-5 — terminal-friendly markdown with urgency emoji + lane headers + per-entry attribution.

The formatter is pure (no I/O, no process.exit), deterministic for fixed input, and bounded by `MAX_CHECK_TODOS_OUTPUT_CHARS` (8000). Per-lane truncation defaults to top 5 entries; `opts.all` removes truncation; `opts.lane` filters to one lane.

Output: formatter region in `check-todos.cjs`, ~22 new tests (Groups FF + FE + FT).
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── check-todos.cjs              ← MODIFY (add formatter region)
└── check-todos.test.cjs         ← MODIFY (add Groups FF/FE/FT)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Reference: pure formatter pattern from `lib/dup-detect.cjs` (obj 4 TRD 04-03):**

```js
function formatDetectionMarkdown(detection, opts = {}) {
  if (!detection) return '_(no detection result)_\n';
  if (
    (!detection.matches || detection.matches.length === 0) &&
    (!detection.advisory || detection.advisory.length === 0) &&
    (!detection.warnings || detection.warnings.length === 0)
  ) {
    return '_(no overlap detected)_\n';
  }

  const sections = [];
  sections.push(_renderTitle(detection, opts));
  if (detection.matches && detection.matches.length > 0) {
    sections.push(_renderMatches(detection.matches, opts));
  }
  if (detection.advisory && detection.advisory.length > 0) {
    sections.push(_renderAdvisory(detection.advisory, opts));
  }
  // ...
  return sections.join('\n\n');
}
```

# PATTERN: Top-level formatter delegates to private sub-renderers per section. Empty input short-circuits early. Sections joined with '\n\n' separator.
# PATTERN: opts is always last param, always optional (`= {}`), always object-typed.

**Reference: lane truncation pattern (obj 6's specific shape):**

```js
// ─── TRD 06-03: formatter ─────────────────────────────────────────────────────

const _LANE_META = {
  blocked: { emoji: '🔥', title: 'Blocked-on-you' },
  now:     { emoji: '⚡', title: 'Now' },
  soon:    { emoji: '📋', title: 'Soon' },
  ideas:   { emoji: '💡', title: 'Ideas' },
};

/**
 * Render the full check-todos markdown.
 * Pure — no I/O, no process.exit. Deterministic for fixed input.
 */
function formatCheckTodosMarkdown(aggregate, opts = {}) {
  if (!aggregate) return '_(no aggregate result)_\n';

  const showAll = !!opts.all;
  const filterLane = opts.lane && LANE_NAMES.includes(opts.lane) ? opts.lane : null;
  const dateStr = (opts.date || _todayDateString());  // injectable for tests

  const lines = [`# 📋 DevFlow Standup — ${dateStr}`, ''];

  // Render lanes in fixed order: blocked → now → soon → ideas
  for (const lane of LANE_NAMES) {
    if (filterLane && filterLane !== lane) continue;  // --lane filter
    lines.push(_renderLane(lane, aggregate[lane] || [], showAll));
  }

  // Render warnings footer if any
  if (aggregate.warnings && aggregate.warnings.length > 0) {
    lines.push(_renderWarningsFooter(aggregate.warnings));
  }

  // Render cached/fresh footer
  lines.push(`_${aggregate.cached ? 'served from cache' : 'freshly fetched'}_`);

  const output = lines.join('\n');

  // Token bound: warn (not truncate) when over MAX
  if (output.length > MAX_CHECK_TODOS_OUTPUT_CHARS) {
    return output + `\n\n_⚠ output exceeds ${MAX_CHECK_TODOS_OUTPUT_CHARS} chars (${output.length}); consider --lane <name> filter_\n`;
  }

  return output + '\n';
}

function _renderLane(lane, entries, showAll) {
  const meta = _LANE_META[lane];
  if (!meta) return '';

  const total = entries.length;
  const limit = showAll ? total : Math.min(total, DEFAULT_LANE_TRUNCATE);
  const shown = entries.slice(0, limit);

  const lines = [`## ${meta.emoji} ${meta.title} (${total})`, ''];

  if (total === 0) {
    lines.push('_no entries_');
    lines.push('');
    return lines.join('\n');
  }

  for (const entry of shown) {
    lines.push(_renderEntry(entry));
  }

  if (limit < total) {
    lines.push('');
    lines.push(`_[showing ${limit}; --all for full list (${total} total)]_`);
  }

  lines.push('');  // trailing blank
  return lines.join('\n');
}

function _renderEntry(entry) {
  // Each entry → bullet line + italic attribution suffix.
  const title = _entryTitle(entry);
  const attr = _attributionSuffix(entry);
  return `- ${title}\n  ${attr}`;
}

function _entryTitle(entry) {
  switch (entry.source) {
    case 'gh':
      return `**${entry.ref || entry.repo + '#' + entry.number}** — ${entry.title || '(no title)'}`;
    case 'peer':
      return `**${entry.branch || '(unknown branch)'}** — ${entry.objective || '(no objective)'}${entry.trd ? ' · TRD ' + entry.trd : ''}`;
    case 'initiative':
      return `**${entry.initiative_slug || '(unknown)'}** — ${entry.question || '(no question)'}`;
    case 'dup-detect':
      return `**dup-detect** — ${entry.objective_id || '(unknown)'}: ${entry.resolution || 'unresolved'}`;
    case 'local':
      return `**${entry.area || 'general'}** — ${entry.title || '(no title)'}`;
    default:
      return `**(unknown source)** — ${JSON.stringify(entry).slice(0, 80)}`;
  }
}

function _attributionSuffix(entry) {
  switch (entry.source) {
    case 'gh': {
      const flags = [];
      if (entry.assigned) flags.push('assigned');
      if (entry.mentioned) flags.push('mentioned');
      if (entry.review_requested) flags.push('review-requested');
      const labels = (entry.labels && entry.labels.length > 0) ? ` [${entry.labels.join(', ')}]` : '';
      return `*via gh: ${flags.join('/') || 'unflagged'}${labels}*`;
    }
    case 'peer':
      return `*via peer (${entry.state || 'unknown state'}, ${entry.last_commit && entry.last_commit.timestamp || 'no recent commit'})*`;
    case 'initiative':
      return `*via initiative ${entry.github_issue || ''}*`;
    case 'dup-detect': {
      const score = entry.top_match && typeof entry.top_match.score === 'number'
        ? ` (score ${entry.top_match.score.toFixed(2)})` : '';
      return `*via dup-detect ${entry.mode || ''}${score}*`;
    }
    case 'local':
      return `*via local todo: ${entry.path || ''}*`;
    default:
      return '*via unknown*';
  }
}

function _renderWarningsFooter(warnings) {
  const lines = ['## ⚠ Warnings', ''];
  for (const w of warnings) {
    if (w.kind === 'gh_auth_failure') {
      lines.push(`- **gh auth required:** ${w.remediation || 'gh auth refresh'}`);
    } else {
      lines.push(`- **${w.kind || 'unknown'}** [${w.source || 'system'}]: ${w.message || ''}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function _todayDateString() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}
```

# CRITICAL: `_todayDateString` is injectable via opts.date for deterministic test output. Tests pass `opts.date: '2026-05-05'` to assert on exact rendered string.
# CRITICAL: Lane order MUST be `blocked → now → soon → ideas` — this is the urgency hierarchy. Order is locked. Test FF8 enforces order.
# GOTCHA: Empty lanes render `_no entries_` placeholder UNLESS `--lane <name>` filter is applied to a different lane (then the lane is omitted entirely). Test FF6 + FF7 enforce this.
# GOTCHA: Warnings footer rendered BEFORE the cached/fresh footer. Order matters — test FF13 verifies.
# PATTERN: Italic attribution one-liner is: `*via <source>: <details>*`. The space-after-asterisk is significant for some Markdown renderers — preserve.

**Token-bound test pattern (mirror obj 5 TRD 05-05):**

```js
test('FT3: output ≤ MAX_CHECK_TODOS_OUTPUT_CHARS under default flags', () => {
  const aggregate = {
    blocked: Array(20).fill(null).map((_, i) => buildTestEntry('peer', i)),
    now: Array(50).fill(null).map((_, i) => buildTestEntry('gh', i)),
    soon: Array(30).fill(null).map((_, i) => buildTestEntry('initiative', i)),
    ideas: Array(100).fill(null).map((_, i) => buildTestEntry('local', i)),
    warnings: [],
    cached: false,
  };
  const out = formatCheckTodosMarkdown(aggregate, { date: '2026-05-05' });
  // Default truncation = 5 per lane → 20 entries × ~80 chars ≈ ~1600 chars
  assert.ok(out.length <= MAX_CHECK_TODOS_OUTPUT_CHARS,
    `Output ${out.length} exceeds limit ${MAX_CHECK_TODOS_OUTPUT_CHARS}`);
});

test('FT4: --all flag produces output > MAX with warning suffix', () => {
  const aggregate = {
    blocked: Array(50).fill(null).map((_, i) => buildTestEntry('peer', i)),
    now: Array(100).fill(null).map((_, i) => buildTestEntry('gh', i)),
    soon: Array(50).fill(null).map((_, i) => buildTestEntry('initiative', i)),
    ideas: Array(100).fill(null).map((_, i) => buildTestEntry('local', i)),
    warnings: [],
    cached: false,
  };
  const out = formatCheckTodosMarkdown(aggregate, { all: true, date: '2026-05-05' });
  // 300 entries × ~80 chars > 8000 → warning footer present
  assert.ok(out.length > MAX_CHECK_TODOS_OUTPUT_CHARS);
  assert.match(out, /output exceeds 8000 chars/);
});
```

# PATTERN: `buildTestEntry(source, i)` is a per-test helper (not a fixture builder) — keep it local to the test file. Returns deterministic-by-index entries with source-correct shape.
</codebase_examples>

<anti_patterns>
- **Don't sort entries within a lane.** Order comes from upstream (`aggregate` returns lane buckets in source-fetch order). The formatter is presentation-only.
- **Don't truncate mid-entry.** When output exceeds `MAX_CHECK_TODOS_OUTPUT_CHARS`, append a warning footer — DO NOT slice the string. The user gets the full data + a clear "consider --lane" hint.
- **Don't emit JSON.** `formatCheckTodosMarkdown` is markdown-only. Raw JSON is `--raw` flag handled in TRD 06-04 CLI; that path skips this function entirely.
- **Don't call any I/O.** No `_runFs`, no `_runGh`, no `Date.now()` directly (use `opts.date` or `_todayDateString` once). Pure formatter for testability.
- **Don't change `aggregate` or `_assignLane`.** This TRD only adds the formatter region. Cache wiring (06-02) and lane assignment (06-01) stay untouched.
- **Don't render `--lane` filter UI.** The `opts.lane` filter just omits other lanes entirely. No "filtered to: now" header chrome.
- **Don't add a `--lane all` value.** `opts.lane` is null/undefined OR a valid lane name. Validation lives in the CLI (TRD 06-04 already validates against `LANE_NAMES`); the formatter trusts.
</anti_patterns>

<error_recovery>
- **Empty aggregate object passed:** `formatCheckTodosMarkdown(null)` → `_(no aggregate result)_\n`. Document explicitly in test FF1.
- **Aggregate missing some lane keys:** `formatCheckTodosMarkdown({ blocked: [...], cached: false })` (missing `now`, `soon`, `ideas`, `warnings`) — render with empty arrays for missing lanes. The defensive `aggregate[lane] || []` handles this.
- **Entry with unknown source:** Renders as `**(unknown source)** — <truncated JSON>` per `_entryTitle` default branch. Document in test FE6.
- **Entry with missing fields:** Each `_entryTitle`/`_attributionSuffix` source-arm uses `entry.X || '(default)'` for safety. Test FE7 — entry with `{ source: 'gh' }` only (no other fields) renders without crashing.
- **Output ordering depends on Date.now() (anti-pattern):** Use `opts.date` injection in tests. Production path calls `_todayDateString()` once at the top of `formatCheckTodosMarkdown` so the same call produces a single timestamp for the entire output.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/06-unified-check-todos/06-CONTEXT.md
@.planning/objectives/06-unified-check-todos/06-02-cache-layer-SUMMARY.md
@plugins/devflow/devflow/bin/lib/check-todos.cjs
@plugins/devflow/devflow/bin/lib/dup-detect.cjs
</context>

<gotchas>
- **Emoji width considerations:** 🔥 / ⚡ / 📋 / 💡 are 2-char-wide in most terminals; the formatter doesn't pad for alignment (terminals handle width). Don't try to align columns.
- **`_todayDateString` injection:** Implement as `function _todayDateString() { return new Date().toISOString().split('T')[0]; }` — easy to mock via `opts.date` override (no need to inject the function itself).
- **`MAX_CHECK_TODOS_OUTPUT_CHARS` warning, not truncation:** When exceeded, ADD a warning footer — never slice the string. The user gets full data + hint.
- **Lane order is `blocked → now → soon → ideas`:** locked by urgency. `LANE_NAMES` constant from 06-01 already encodes this order.
- **Source attribution suffix is on its own line:** `- <title>\n  *via <source>*` — two-space indent for the suffix to render as a continuation under the bullet in most Markdown renderers (incl. terminal pretty-printers).
- **Cached/fresh footer on its own line at end:** `_served from cache_` or `_freshly fetched_`. Always present.
- **No file changes outside `check-todos.cjs` + `check-todos.test.cjs`:** This TRD does not touch CLI, df-tools, or fixtures.
</gotchas>

## Test list

Hand-built test cases written FIRST (test:add commit), then implementation (feat: commit). Test groups:

### Group FF — formatCheckTodosMarkdown (top-level)

- **FF1**: `formatCheckTodosMarkdown(null)` → `'_(no aggregate result)_\n'`.
- **FF2**: `formatCheckTodosMarkdown({ blocked: [], now: [], soon: [], ideas: [], warnings: [], cached: false })` (all empty) → output has 4 lane sections each with `_no entries_` placeholder, plus `_freshly fetched_` footer.
- **FF3**: Output starts with `# 📋 DevFlow Standup — <date>` heading.
- **FF4**: `opts.date: '2026-05-05'` → heading reads `# 📋 DevFlow Standup — 2026-05-05` exactly.
- **FF5**: Lane sections render in order: `🔥 Blocked-on-you → ⚡ Now → 📋 Soon → 💡 Ideas` (verify by regex match positions).
- **FF6**: `opts.lane: 'now'` filters to only the Now lane (no other lane sections present).
- **FF7**: `opts.lane: 'invalid-lane-name'` is ignored (formatter trusts CLI validation; renders all 4 lanes).
- **FF8**: Warnings footer renders with `## ⚠ Warnings` heading + per-warning bullet.
- **FF9**: `gh_auth_failure` warning surfaces with remediation command.
- **FF10**: `cached: true` → footer `_served from cache_`.
- **FF11**: `cached: false` → footer `_freshly fetched_`.
- **FF12**: Empty `warnings` array → no warnings section.
- **FF13**: Order: lanes → warnings (if any) → cached/fresh footer (last). Verify by regex position checks.

### Group FE — _renderEntry / _entryTitle / _attributionSuffix

- **FE1**: gh entry `{ ref: 'AO/r#1', title: 'Bug', assigned: true, labels: ['bug'] }` → `- **AO/r#1** — Bug\n  *via gh: assigned [bug]*`.
- **FE2**: gh entry with multiple flags (`assigned: true, mentioned: true`) → suffix lists `assigned/mentioned`.
- **FE3**: peer entry → title shows branch + objective + TRD; attribution shows state + last_commit timestamp.
- **FE4**: initiative entry → title shows slug + question; attribution shows github_issue.
- **FE5**: dup-detect entry → title shows objective_id + resolution; attribution shows mode + score.
- **FE6**: Unknown-source entry → title falls back to `**(unknown source)** — <truncated JSON>`; attribution `*via unknown*`.
- **FE7**: gh entry with NO flags set → title renders, attribution shows `unflagged`.
- **FE8**: local entry → title shows area + title; attribution shows path.
- **FE9**: Entry with missing optional fields renders with `(default)` placeholders (no crash).

### Group FT — Truncation + token bounds

- **FT1**: Default truncation: lane with 10 entries → renders 5 + `_[showing 5; --all for full list (10 total)]_`.
- **FT2**: `opts.all: true` → lane with 10 entries renders all 10, no truncation footer.
- **FT3**: Output under default flags ≤ `MAX_CHECK_TODOS_OUTPUT_CHARS` (8000 chars) for realistic-size input.
- **FT4**: `opts.all: true` with very large input — output exceeds 8000 chars; warning suffix appended (NOT truncated mid-string).
- **FT5**: Empty lane with `--lane <other>` filter → that lane is omitted entirely (not even `_no entries_` placeholder).
- **FT6**: Single-lane filter (`opts.lane: 'now'`) with truncation: shows only that lane's truncation behavior; other lanes absent.

Total: ~28 new tests.

<tasks>

<task type="auto">
  <name>Task 1: RED — append formatter test list (test: commit)</name>
  <files>plugins/devflow/devflow/bin/lib/check-todos.test.cjs</files>
  <action>
RED phase: write Groups FF/FE/FT per the test list. The formatter doesn't exist yet, so all 28 tests should fail with "formatCheckTodosMarkdown is not a function" or undefined.

**Step 1: Append `## Test list — TRD 06-03` block to top-of-file comments** describing Groups FF/FE/FT.

**Step 2: Add Group FF tests (FF1-FF13)** — top-level formatter behavior. Use minimal aggregate fixtures (just plain JS objects, not `buildCheckTodosFixtures` — formatter is pure).

**Step 3: Add Group FE tests (FE1-FE9)** — entry rendering + attribution. Construct sample entries inline. Use `_renderEntry` and `_entryTitle` exports IF the implementation exposes them; otherwise verify via the public `formatCheckTodosMarkdown` output regex.

**Step 4: Add Group FT tests (FT1-FT6)** — truncation + token bounds. Build large arrays inline via `Array(N).fill().map((_, i) => ({...}))` pattern. Define `buildTestEntry(source, i)` as a local helper at the top of the test file.

# CRITICAL: At RED time all 28 tests fail because `formatCheckTodosMarkdown` doesn't exist. Document this in commit body.
# GOTCHA: For deterministic output, ALWAYS pass `opts.date: '2026-05-05'` (or similar fixed string) in test invocations. The default `_todayDateString()` produces drift across midnight.
# GOTCHA: Some tests assert exact substrings; others assert via regex. Be explicit which is which to avoid brittle exact-match tests on dynamic content (e.g., regex for `## 🔥 Blocked-on-you \(\d+\)` accepts any count).

Commit: `test(06-03): add failing tests for formatCheckTodosMarkdown formatter`.
  </action>
  <verify>
1. `npm test 2>&1 | grep -cE "fail|FAIL"` — count ≥ 28 from the new groups.
2. `grep "Test list — TRD 06-03" plugins/devflow/devflow/bin/lib/check-todos.test.cjs` — comment block present.
  </verify>
  <done>
~28 new tests added in RED state. Single `test:` commit.
  </done>
  <recovery>
If tests can't even run because of "formatCheckTodosMarkdown is not a function", that's expected at RED. The test file CAN run — the failures should be assertion failures within each test, not load-time errors. Verify by running the test file directly: `node --test plugins/devflow/devflow/bin/lib/check-todos.test.cjs 2>&1 | head -30`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement formatter region (feat: commit)</name>
  <files>plugins/devflow/devflow/bin/lib/check-todos.cjs</files>
  <action>
GREEN phase: implement the formatter region in `check-todos.cjs` per the embedded patterns.

**Step 1: Add formatter region** after the cache region (TRD 06-02) but before `module.exports`:

- Banner: `// ─── TRD 06-03: formatter ─────────────────────────────────`.
- `_LANE_META` constant (locked emoji + title per lane).
- `_todayDateString()` private helper.
- `formatCheckTodosMarkdown(aggregate, opts)` per embedded skeleton.
- `_renderLane(lane, entries, showAll)` per embedded skeleton.
- `_renderEntry(entry)` per embedded skeleton.
- `_entryTitle(entry)` with switch on `entry.source` per embedded skeleton.
- `_attributionSuffix(entry)` with switch per embedded skeleton.
- `_renderWarningsFooter(warnings)` per embedded skeleton.

**Step 2: Extend `module.exports`** to include `formatCheckTodosMarkdown` (the only public addition; sub-renderers stay private):

```js
module.exports = {
  // ... existing TRD 06-01 + 06-02 exports ...

  // TRD 06-03:
  formatCheckTodosMarkdown,
};
```

**Step 3: Run tests**:

```bash
npm test 2>&1 | tail -10
```

Expected: all ~28 new tests GREEN. Total test count up by 28 from 06-02's GREEN state. No regression.

# CRITICAL: After Task 2, 28 tests must pass. If FT4 (warning footer on overflow) fails, debug the boundary at exactly `MAX_CHECK_TODOS_OUTPUT_CHARS` — the warning emits when `output.length > MAX`, so test must produce strictly more than 8000 chars.
# GOTCHA: `opts.lane: 'invalid-lane-name'` is ignored at the formatter layer (FF7) — but the CLI rejects it earlier (per TRD 06-01 `cmdCheckTodosRoute` validation). Both layers defend; both tests pass independently.
# PATTERN: For FT3 (under 8000 chars under default flags with realistic input), build the test fixture conservatively — 5 entries per lane × 4 lanes × ~100 chars/entry ≈ 2000 chars, comfortably under 8000.

Commit: `feat(06-03): add formatCheckTodosMarkdown formatter with emoji urgency lanes + per-source attribution`.
  </action>
  <verify>
1. `npm test 2>&1 | tail -5` — all GREEN; total pass count up by ~28.
2. `node -e "const ct = require('./plugins/devflow/devflow/bin/lib/check-todos.cjs'); console.log(ct.formatCheckTodosMarkdown({ blocked: [], now: [], soon: [], ideas: [], warnings: [], cached: false }, { date: '2026-05-05' }))"` — prints valid Markdown with 4 empty lane sections + `_freshly fetched_` footer.
3. `grep "_LANE_META" plugins/devflow/devflow/bin/lib/check-todos.cjs` matches.
  </verify>
  <done>
28 new tests GREEN. `formatCheckTodosMarkdown` callable from module exports. Single `feat:` commit.
  </done>
  <recovery>
If FT3 (output under MAX) fails because the test produced too many chars, reduce the per-lane entry count. The test should produce realistic-size output (~5 entries × 4 lanes × default truncation), not maximum theoretical input.

If FE tests fail with "received empty string" instead of expected output, suspect `_renderEntry` is being called but not returning. Verify the function explicitly returns `lines.join('\n')` not just builds and discards.

If FF5 (lane order) fails, verify the loop iterates `LANE_NAMES` in order, not Object.keys(aggregate) (which is hash-order).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `lib/check-todos.cjs` has formatter region with `formatCheckTodosMarkdown` + 4 sub-renderers + entry helpers.
2. `module.exports` includes `formatCheckTodosMarkdown` (other sub-renderers private).
3. ~28 new tests GREEN (Groups FF/FE/FT).
4. No regression in baseline + 06-01 + 06-02 tests.
5. Manual smoke: `formatCheckTodosMarkdown({ blocked: [], now: [], soon: [], ideas: [], warnings: [], cached: false }, { date: '2026-05-05' })` returns valid markdown.
6. Total commits this TRD: 2 (`test:` RED + `feat:` GREEN).
</verification>

<success_criteria>
- [ ] SC-5 satisfied: terminal-friendly markdown with urgency emoji + lane headers + per-entry attribution; deterministic for fixed input.
- [ ] Per-lane truncation works (default 5; `opts.all` removes; `opts.lane` filters).
- [ ] Output bounded by `MAX_CHECK_TODOS_OUTPUT_CHARS` with warning footer on overflow.
- [ ] Pure renderer: no I/O, no process.exit, no clock-dependent ordering for fixed input (date injectable).
- [ ] No regression in baseline.
</success_criteria>

<output>
After completion, create `.planning/objectives/06-unified-check-todos/06-03-formatter-SUMMARY.md`. Record:

- Test count delta (before/after this TRD).
- Both commit hashes (`test:` RED + `feat:` GREEN).
- Any deviations from locked design (especially: lane order, emoji choice if user asks for accessibility, attribution-line indent, treatment of unknown source).
- Manual smoke: render against fixture aggregate; capture the markdown output (compress whitespace into the SUMMARY).
</output>
