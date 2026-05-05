---
objective: 04-duplicate-work-detection
trd: 04-03
title: formatDetectionMarkdown — pure formatter for AskUserQuestion display + CONTEXT.md note body
type: tdd
confidence: high
wave: 3
depends_on: [04-01, 04-02]
files_modified:
  - plugins/devflow/devflow/bin/lib/dup-detect.cjs
  - plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
autonomous: true
requirements: [SC-5, SC-6]
verification_commands:
  - "npm test -- --grep 'formatDetectionMarkdown|FD'"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/dup-detect.cjs\"); if(typeof a.formatDetectionMarkdown!==\"function\") throw new Error(\"formatDetectionMarkdown not exported\"); console.log(\"OK\");'"

must_haves:
  truths:
    - "formatDetectionMarkdown(detection_result, opts) takes the structured output of detectDuplicates() + display options and returns a Markdown string suitable for two purposes: (a) displayed verbatim to the user before AskUserQuestion to explain the detected match (skill workflow uses it); (b) used as the signal-summary portion when a Coordination Note is appended to CONTEXT.md."
    - "Output format: title line ('## Duplicate-Work Match Detected' or '## Duplicate-Work Recheck'), section per match (matches first, then advisory if mode='plan'), bullet entries with strength + source + peer + signal + score. Bounded length (≤ 1500 chars typical, MAX 3000)."
    - "Empty matches AND empty advisory → renders single placeholder line: '_(no duplicate-work signals detected — proceeding without coordination note)_'"
    - "warnings array (infrastructure errors) rendered as '> **Note:** <warning text>' blockquote AFTER matches/advisory but before the suggested-resolution footer"
    - "Mode='execute' rendering NEVER includes advisory section (matches detectDuplicates filter); empty advisory in plan mode renders as '_(no advisory matches)_' under '### Advisory (informational)' header"
    - "opts.purpose ∈ { 'askuser' | 'context' } — askuser variant adds a '### Resolution options:' section with 4 numbered options (Merge/Defer/Coordinate/Proceed-anyway) for user readability before AskUserQuestion; context variant omits the resolution options (the Coordination Note in CONTEXT.md doesn't need them — they're already chosen)"
    - "Renderer is pure — no fs / network / process side effects; deterministic output for fixed input"
    - "All new tests follow RED → GREEN: test commit precedes feat commit per TDD Playbook habit 3"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/dup-detect.cjs"
      provides: "Extended with formatDetectionMarkdown + sub-renderer helpers (TRD 04-03 region). Module.exports extended with this 1 entry."
      exports: ["formatDetectionMarkdown"]
    - path: "plugins/devflow/devflow/bin/lib/dup-detect.test.cjs"
      provides: "Test group FD (formatDetectionMarkdown happy/edge cases — purpose=askuser, purpose=context, empty, warnings, mode=execute)."
      contains: "formatDetectionMarkdown"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::formatDetectionMarkdown"
      to: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::detectDuplicates result shape"
      via: "consumes { blocking, matches, advisory, warnings, mode, timestamp }"
      pattern: "matches.*advisory.*warnings"
---

<objective>
Add the `formatDetectionMarkdown(detection_result, opts)` pure renderer to `lib/dup-detect.cjs`. This TRD provides the human-readable output that:

1. The skill workflow displays to the user BEFORE invoking AskUserQuestion (so the user sees what was detected and can make an informed choice).
2. Could be embedded into a Coordination Note (TRD 04-02 already builds its own simpler note format; this renderer is primarily for the AskUserQuestion display).

Pure formatter — no side effects. Test against fixture detection results; assert exact-match on rendered markdown chunks.

Output:
1. `formatDetectionMarkdown(detection, { purpose: 'askuser' | 'context' })` function in `lib/dup-detect.cjs` (region: formatDetectionMarkdown).
2. Helpers `_renderMatchEntry`, `_renderAdvisoryEntry`, `_renderWarnings`, `_renderResolutionOptions` (internal).
3. Test group FD covering happy path + empty + warnings + execute-mode + purpose variants.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── dup-detect.cjs                  ← MODIFY  (add formatDetectionMarkdown region)
└── dup-detect.test.cjs             ← MODIFY  (add Group FD)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing pure markdown renderer pattern** — `lib/org-awareness.cjs::formatConsiderations` (obj 3 ship):

```js
function _renderSiblingsSection(scans) {
  const lines = ['### Sibling repos'];
  const matches = ((scans && scans.siblings && scans.siblings.matches) || []).slice(0, TOP_N);
  if (matches.length === 0) {
    lines.push('_(no matches)_');
    return lines.join('\n');
  }
  for (const m of matches) {
    const objPart = m.best_objective ? `(objective ${m.best_objective})` : '';
    const scoreStr = (typeof m.score === 'number') ? m.score.toFixed(2) : 'N/A';
    lines.push(`- \`${m.repo}\` ${objPart} — score ${scoreStr}`);
  }
  return lines.join('\n');
}

function formatConsiderations(scans) {
  const sections = [
    _renderSiblingsSection(scans),
    _renderLibsSection(scans),
    _renderOrgSection(scans),
  ];
  return sections.join('\n\n');
}
```

**Mirror for dup-detect**: pure, no fs/network. Sub-renderer per section. Deterministic output. Uses `lines.join('\n')`.

**Existing AskUserQuestion option list pattern** — `skills/plan-objective/SKILL.md` step 4:

```
AskUserQuestion(
  questions=[{
    header: "Approach",
    question: "For Objective {X}: {objective_name} — any preferences on approach or scope?",
    options: [
      { label: "You decide", description: "Use your best judgment based on research" },
      { label: "Let me specify", description: "I'll provide specific preferences" }
    ],
    multiSelect: false
  }]
)
```

The 4-option dup-detect resolution flow MUST present the same shape. The `formatDetectionMarkdown` renderer's "Resolution options" section is FOR HUMAN READABILITY — the actual AskUserQuestion call is constructed by the SKILL workflow (TRD 04-04 / 04-05) using the locked option list.

</codebase_examples>

<anti_patterns>

- **DO NOT add fs / network / spawnSync / readFileSync calls** — formatter is pure. All inputs come via the `detection` parameter.
- **DO NOT mutate the `detection` object passed in** — render from a deep-read of fields; never reassign or push to caller's arrays.
- **DO NOT include AskUserQuestion option pickup logic here** — only RENDER the option labels for human readability. The skill workflow constructs the actual AskUserQuestion call.
- **DO NOT exceed 3000 chars in typical output** — bounded section per CONTEXT.md decision #6 (token-budget conscious). MAX 5 entries per section to keep markdown readable.
- **DO NOT include detection.timestamp in human-displayed output if absent** — format gracefully when fields missing.
- **DO NOT reformat the warnings array** beyond a `> Note:` blockquote prefix per warning. Warnings come from infrastructure failures and the user should see them verbatim.

</anti_patterns>

<error_recovery>

- **`detection` is null or undefined** → return placeholder `'_(no detection result available)_'`.
- **`detection.matches` is null** → treat as empty array; render placeholder.
- **Unknown `opts.purpose` value** → fall back to 'askuser' (more verbose; safer default).
- **Match entry missing `signal` field** → render `(no signal description)`.
- **Match entry with NaN/Infinity score** → render score as 'N/A'.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/04-duplicate-work-detection/04-CONTEXT.md
@.planning/objectives/04-duplicate-work-detection/04-RESEARCH.md
@.planning/objectives/04-duplicate-work-detection/04-01-detection-engine-and-fixtures-TRD.md
@.planning/objectives/04-duplicate-work-detection/04-02-resolution-recorder-TRD.md

# File this TRD extends:
@plugins/devflow/devflow/bin/lib/dup-detect.cjs

# Pattern reference:
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
</context>

<gotchas>

- **`Array.isArray(x) ? x : []`** is the safe way to default arrays — `(x || []).slice()` works only when null/undefined, not when accidentally given an object.
- **Backticks in signal/peer-branch text break markdown if not escaped** — for v1.1, replace embedded backticks with single quotes via `.replace(/`/g, "'")`. Cheap and adequate.
- **Section ordering is locked**: title → matches (blocking) → advisory (plan-mode only) → warnings → resolution options (askuser only). Do not reorder.
- **Bullet-entry format MUST be readable in narrow terminals** (~80 chars). Strength + source + peer label + score on the bullet line; signal as nested second line indented `  -`.
- **Pure determinism**: do NOT use `new Date().toISOString()` inside the renderer (no process state); rely on `detection.timestamp` if present, else render '(timestamp unavailable)'.
- **`opts` is optional** — default to `{ purpose: 'askuser' }`. Tests that pass no opts should get the askuser variant.

</gotchas>

## Test list

Per CLAUDE.md TDD Playbook habit 2: enumerate behavior cases BEFORE writing test code.

### Group FD (formatDetectionMarkdown — pure formatter)
- FD1: empty detection (no matches, no advisory, no warnings) → renders placeholder `'_(no duplicate-work signals detected — proceeding without coordination note)_'` regardless of mode/purpose
- FD2: 1 hard match in plan mode, purpose=askuser → renders title + matches section with 1 entry showing strength=hard / source / signal / score / peer + Resolution options section with 4 numbered options
- FD3: 1 hard match in plan mode, purpose=context → same as FD2 but NO Resolution options section
- FD4: 1 strong match + 2 weak advisory in plan mode → matches section has 1 entry; advisory section ('### Advisory (informational)') has 2 entries
- FD5: 1 strong match + 2 weak advisory in EXECUTE mode → matches section has 1 entry; advisory section ABSENT (filtered upstream by detectDuplicates; renderer just doesn't render absent section)
- FD6: warnings array with 2 entries → '> **Note:** <warning>' blockquote per warning, AFTER matches/advisory, BEFORE resolution options
- FD7: backticks in signal text → escaped (replaced with single quotes) so markdown doesn't break
- FD8: match with NaN score → renders 'N/A'
- FD9: detection is null → renders '_(no detection result available)_'
- FD10: detection.matches is undefined → treated as empty; placeholder rendered
- FD11: opts.purpose is unknown value (e.g., 'foo') → falls back to askuser variant
- FD12: opts not passed → defaults to askuser variant
- FD13: total output for typical 1-match-1-advisory-1-warning case ≤ 1500 chars
- FD14: deterministic — same input rendered twice yields exact-equal output (no randomness)

<tasks>

<task type="auto">
  <name>Task 1: RED — write failing tests for formatDetectionMarkdown</name>
  <files>
    plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
  </files>
  <action>
**RED PHASE PER TDD PLAYBOOK HABIT 3 — one test at a time.**

Append Group FD tests to existing `dup-detect.test.cjs`.

```js
// ─── TRD 04-03: formatDetectionMarkdown ───────────────────────────────────────

test('FD1 — empty detection renders placeholder', () => {
  const md = dd.formatDetectionMarkdown(
    { blocking: false, matches: [], advisory: [], warnings: [], mode: 'plan', timestamp: '2026-05-04T08:00:00Z' },
    { purpose: 'askuser' }
  );
  assert.match(md, /no duplicate-work signals detected/);
});

test('FD2 — 1 hard match plan mode purpose=askuser', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'hard', source: 'peer', peer_branch: 'feature/peer', peer_objective: '04 — peer', signal: 'github_issue match: #13', score: 100 }],
    advisory: [],
    warnings: [],
    mode: 'plan',
    timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  assert.match(md, /Duplicate-Work Match Detected/i);
  assert.match(md, /hard/);
  assert.match(md, /github_issue/);
  assert.match(md, /feature\/peer/);
  assert.match(md, /Resolution options/i);
  assert.match(md, /Merge/);
  assert.match(md, /Defer/);
  assert.match(md, /Coordinate/);
  assert.match(md, /Proceed/);
});

test('FD3 — purpose=context omits resolution options', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'hard', source: 'peer', peer_branch: 'feature/peer', peer_objective: '04 — peer', signal: 'github_issue match', score: 100 }],
    advisory: [], warnings: [], mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'context' });
  assert.doesNotMatch(md, /Resolution options/i);
  assert.match(md, /hard/);
});

test('FD4 — 1 strong match + 2 weak advisory in plan mode', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'strong', source: 'peer', peer_branch: 'feature/x', peer_objective: 'x', signal: '≥2 file overlap: a, b', score: 50 }],
    advisory: [
      { strength: 'weak', source: 'peer', peer_branch: 'feature/y', peer_objective: 'y', signal: '1 keyword overlap: foo', score: 10 },
      { strength: 'weak', source: 'peer', peer_branch: 'feature/z', peer_objective: 'z', signal: 'single shared file: bar', score: 10 },
    ],
    warnings: [], mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  assert.match(md, /strong/);
  assert.match(md, /Advisory \(informational\)/i);
  assert.match(md, /feature\/y/);
  assert.match(md, /feature\/z/);
});

test('FD5 — execute mode does NOT render advisory section', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'strong', source: 'peer', peer_branch: 'feature/x', peer_objective: 'x', signal: 'shared', score: 50 }],
    advisory: [], // detectDuplicates already filtered
    warnings: [], mode: 'execute', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  assert.doesNotMatch(md, /Advisory \(informational\)/i);
  assert.match(md, /Recheck/i); // execute-mode title differs
});

test('FD6 — warnings rendered as blockquote', () => {
  const det = {
    blocking: false, matches: [], advisory: [],
    warnings: ['peer scan failed: git not found', 'org-overlap unavailable: gh auth missing'],
    mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  assert.match(md, /> \*\*Note:\*\* peer scan failed/);
  assert.match(md, /> \*\*Note:\*\* org-overlap unavailable/);
});

test('FD7 — backticks in signal text escaped', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'hard', source: 'peer', peer_branch: 'feature/x', peer_objective: 'x', signal: 'github_issue match: `#13`', score: 100 }],
    advisory: [], warnings: [], mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  assert.doesNotMatch(md, /`#13`/);  // backticks removed
  assert.match(md, /'#13'/);          // replaced with single quotes
});

test('FD8 — NaN score renders as N/A', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'hard', source: 'peer', peer_branch: 'feature/x', peer_objective: 'x', signal: 's', score: NaN }],
    advisory: [], warnings: [], mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  assert.match(md, /N\/A/);
});

test('FD9 — null detection', () => {
  const md = dd.formatDetectionMarkdown(null);
  assert.match(md, /no detection result available/);
});

test('FD10 — undefined matches', () => {
  const md = dd.formatDetectionMarkdown({ blocking: false, mode: 'plan', timestamp: '2026-05-04T08:00:00Z' });
  assert.match(md, /no duplicate-work signals detected/);
});

test('FD11 — unknown purpose falls back to askuser', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'hard', source: 'peer', peer_branch: 'feature/x', peer_objective: 'x', signal: 's', score: 100 }],
    advisory: [], warnings: [], mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'foo' });
  assert.match(md, /Resolution options/i);
});

test('FD12 — opts not passed defaults to askuser', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'hard', source: 'peer', peer_branch: 'feature/x', peer_objective: 'x', signal: 's', score: 100 }],
    advisory: [], warnings: [], mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det);
  assert.match(md, /Resolution options/i);
});

test('FD13 — output bounded ≤ 1500 chars typical', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'strong', source: 'peer', peer_branch: 'feature/x', peer_objective: 'x', signal: '≥2 file overlap: a.ts, b.ts', score: 50 }],
    advisory: [{ strength: 'weak', source: 'peer', peer_branch: 'feature/y', peer_objective: 'y', signal: '1 keyword overlap: foo', score: 10 }],
    warnings: ['scanPeer warning: git fetch slow'],
    mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  assert.ok(md.length <= 1500, `expected <= 1500, got ${md.length}`);
});

test('FD14 — deterministic output', () => {
  const det = {
    blocking: true,
    matches: [{ strength: 'hard', source: 'peer', peer_branch: 'feature/x', peer_objective: 'x', signal: 's', score: 100 }],
    advisory: [], warnings: [], mode: 'plan', timestamp: '2026-05-04T08:00:00Z',
  };
  const md1 = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  const md2 = dd.formatDetectionMarkdown(det, { purpose: 'askuser' });
  assert.strictEqual(md1, md2);
});
```

# CRITICAL: Tests must FAIL with "formatDetectionMarkdown is not a function" (function not yet exported).
# PATTERN: Mirror obj 3's renderer test pattern (groups RS, RL, RO in org-awareness.test.cjs).

Run `npm test 2>&1 | grep -E 'FD\d+|fail|FAIL' | head -20` — should show FD1-FD14 failing.

**Commit RED phase:**
```bash
git add plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
git commit -m "test(04-03): add failing tests for formatDetectionMarkdown

RED phase: tests fail because formatDetectionMarkdown is not yet exported by
lib/dup-detect.cjs. Group FD covers 14 cases: empty detection, hard match
askuser/context purpose, strong+advisory plan/execute mode, warnings,
backtick escape, NaN score, null detection, opts fallback, bounded output,
determinism."
```
  </action>
  <verify>
`npm test 2>&1 | grep -E 'FD\d+' | head -20` shows 14 failing FD tests.
  </verify>
  <done>
test commit lands. Group FD test cases (FD1-FD14) written and failing on missing function.
  </done>
  <recovery>
If a test passes accidentally because formatDetectionMarkdown is partially defined: ensure no premature stub. Delete and re-RED commit.
If 1500-char bound test fails because the typical output is genuinely larger: tune the bullet format to be more concise (drop redundant labels). The bound is a regression guard, not a hard external constraint.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement formatDetectionMarkdown + sub-renderer helpers</name>
  <files>
    plugins/devflow/devflow/bin/lib/dup-detect.cjs
  </files>
  <action>
**GREEN PHASE PER TDD PLAYBOOK HABIT 3 — minimal code to pass the RED tests.**

Add the new region BELOW the existing TRD 04-02 logic, ABOVE the `module.exports` block. Replace the `module.exports` block to extend with `formatDetectionMarkdown`.

```js
// ─── TRD 04-03: formatDetectionMarkdown — pure renderer ──────────────────────

/**
 * Sanitize text for safe inclusion in markdown bullets:
 *   - replace backticks with single quotes (v1.1 cheap escape)
 *   - replace newlines with spaces (one-line bullet contract)
 *
 * @param {*} s
 * @returns {string}
 */
function _sanitize(s) {
  if (s == null) return '';
  return String(s).replace(/`/g, "'").replace(/[\r\n]+/g, ' ');
}

function _formatScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'N/A';
  return String(Math.round(score));
}

function _renderMatchEntry(m) {
  const peer = m.peer_branch || m.peer_objective || '(unknown peer)';
  const lines = [];
  lines.push(`- **${_sanitize(m.strength)}** match — source: \`${_sanitize(m.source)}\` — peer: \`${_sanitize(peer)}\` — score: ${_formatScore(m.score)}`);
  lines.push(`  - signal: ${_sanitize(m.signal) || '(no signal description)'}`);
  return lines.join('\n');
}

function _renderAdvisoryEntry(m) {
  const peer = m.peer_branch || m.peer_objective || '(unknown peer)';
  return `- _${_sanitize(m.strength)}_ — peer \`${_sanitize(peer)}\` — ${_sanitize(m.signal) || '(no signal)'}`;
}

function _renderWarnings(warnings) {
  const arr = Array.isArray(warnings) ? warnings : [];
  if (arr.length === 0) return '';
  return arr.map(w => `> **Note:** ${_sanitize(w)}`).join('\n');
}

function _renderResolutionOptions() {
  return [
    '### Resolution options',
    '',
    '1. **Merge** — abort planning, switch to peer branch and continue there.',
    '2. **Defer** — pause this objective; save state to `.planning/.deferred/<id>.json`.',
    '3. **Coordinate** — continue planning; record a Coordination Note in CONTEXT.md.',
    '4. **Proceed-anyway** — continue with full warning logged in CONTEXT.md.',
  ].join('\n');
}

/**
 * Render a detectDuplicates() result as Markdown for human display.
 *
 * @param {object|null} detection - the structured result from detectDuplicates()
 * @param {object} [opts]
 * @param {'askuser'|'context'} [opts.purpose='askuser']
 * @returns {string}
 */
function formatDetectionMarkdown(detection, opts = {}) {
  if (detection == null) return '_(no detection result available)_';
  const purpose = (opts && (opts.purpose === 'context' || opts.purpose === 'askuser')) ? opts.purpose : 'askuser';

  const matches = Array.isArray(detection.matches) ? detection.matches : [];
  const advisory = Array.isArray(detection.advisory) ? detection.advisory : [];
  const warnings = Array.isArray(detection.warnings) ? detection.warnings : [];
  const mode = detection.mode || 'plan';

  // Empty case
  if (matches.length === 0 && advisory.length === 0 && warnings.length === 0) {
    return '_(no duplicate-work signals detected — proceeding without coordination note)_';
  }

  const sections = [];

  // Title
  const title = (mode === 'execute')
    ? '## Duplicate-Work Recheck (execute-time)'
    : '## Duplicate-Work Match Detected';
  sections.push(title);

  // Matches section
  if (matches.length > 0) {
    const matchLines = ['### Matches (blocking)'];
    for (const m of matches.slice(0, 5)) {
      matchLines.push(_renderMatchEntry(m));
    }
    sections.push(matchLines.join('\n'));
  }

  // Advisory section (plan-mode only and when present)
  if (mode === 'plan' && advisory.length > 0) {
    const advLines = ['### Advisory (informational)'];
    for (const m of advisory.slice(0, 5)) {
      advLines.push(_renderAdvisoryEntry(m));
    }
    sections.push(advLines.join('\n'));
  }

  // Warnings
  const warningsBlock = _renderWarnings(warnings);
  if (warningsBlock) sections.push(warningsBlock);

  // Resolution options (askuser variant only, and only when there's something to resolve)
  if (purpose === 'askuser' && matches.length > 0) {
    sections.push(_renderResolutionOptions());
  }

  return sections.join('\n\n');
}
```

**Replace the existing `module.exports` block** with the extended version listing 04-01 + 04-02 + 04-03 entries:

```js
module.exports = {
  // TRD 04-01:
  detectDuplicates,
  _detectHardMatch,
  _detectStrongMatch,
  _detectWeakMatch,
  _readPeerFilesModified,
  _setRunPeer,
  _setRunOrgOverlap,
  _setRunFs,
  _resetMocks,
  HARD_MATCH_THRESHOLD,
  STRONG_FILE_OVERLAP_THRESHOLD,
  STRONG_KEYWORD_OVERLAP_THRESHOLD,
  DUP_DETECT_LOG_REL,
  DEFERRED_DIR_REL,
  // TRD 04-02:
  recordResolution,
  applyResolution,
  _writeCoordinationNote,
  _writeDeferredState,
  // TRD 04-03:
  formatDetectionMarkdown,
};
```

**Run tests until green:**
```bash
npm test 2>&1 | grep -E 'FD\d+|fail|FAIL' | head -20
```

Expect FD1-FD14 to pass.

**Commit GREEN phase:**
```bash
git add plugins/devflow/devflow/bin/lib/dup-detect.cjs
git commit -m "feat(04-03): implement formatDetectionMarkdown pure renderer

GREEN phase: extends lib/dup-detect.cjs with TRD 04-03 region:
- formatDetectionMarkdown(detection, { purpose }): pure markdown renderer
- _renderMatchEntry / _renderAdvisoryEntry / _renderWarnings / _renderResolutionOptions

purpose='askuser' renders 4-option Resolution options section for human
readability before AskUserQuestion. purpose='context' omits resolution
options (Coordination Note in CONTEXT.md doesn't need them — already chosen).

Mode='execute' uses 'Recheck' title and skips advisory section. Bounded
output (≤ 1500 chars typical). Deterministic.

Closes SC-5 + SC-6 (rendering side — workflow integration in 04-04 / 04-05)."
```
  </action>
  <verify>
- `npm test 2>&1 | grep -E 'FD\d+' | head -20` — FD1-FD14 all pass.
- `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/dup-detect.cjs"); if (typeof a.formatDetectionMarkdown !== "function") throw new Error("not exported"); const md = a.formatDetectionMarkdown({matches:[],advisory:[],warnings:[],mode:"plan"}); if (!/no duplicate-work signals/.test(md)) throw new Error("placeholder missing"); console.log("OK");'`
- `npm test 2>&1 | grep -E "FAIL|fail" | grep -v "FD" | head -5` — no other regressions.
  </verify>
  <done>
feat commit lands. RED tests are now GREEN. Module exports 19 entries (14 from 04-01 + 4 from 04-02 + 1 from 04-03). formatDetectionMarkdown is pure, deterministic, bounded. SC-5 + SC-6 rendering closed (workflow wiring in 04-04 + 04-05).
  </done>
  <recovery>
If FD13 (1500-char bound) test fails because the typical output is too verbose: trim the bullet format. Drop the score from advisory entries (just strength + peer + signal). Re-run.
If FD7 (backtick escape) fails because `_sanitize` was bypassed somewhere: ensure ALL fields fed to bullet templates go through `_sanitize`.
If FD11/FD12 (purpose fallback) fails because the truthy check let 'foo' through: tighten the `?:` chain to explicit `(opts.purpose === 'context' || opts.purpose === 'askuser')`.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none — repo has no lint command per CLAUDE.md)</lint>
<test>npm test</test>
<build>(none — no build step)</build>
</validation_gates>

<verification>
1. `npm test` passes (no regressions in 04-01 + 04-02 baseline + new FD tests pass).
2. `lib/dup-detect.cjs` exports 19 entries.
3. `formatDetectionMarkdown` is pure (no fs / network / process side effects).
4. Empty detection renders placeholder.
5. AskUserQuestion variant includes Resolution options section; context variant omits it.
6. Execute-mode title differs and advisory section absent.
7. Output bounded ≤ 1500 chars typical.
8. Deterministic output for fixed input.
</verification>

<success_criteria>
- [ ] `lib/dup-detect.cjs` extended with TRD 04-03 region (1 new function + 4 internal helpers)
- [ ] `lib/dup-detect.test.cjs` extended with Group FD (FD1-FD14)
- [ ] All FD tests pass
- [ ] RED commit (test:) precedes GREEN commit (feat:) per TDD Playbook habit 3
- [ ] SC-5 (rendering side) verifiable via FD2 + FD12 (Resolution options always included for askuser)
- [ ] SC-6 (rendering side) verifiable via FD3 (purpose=context omits resolution options — needed for Coordination Note body)
</success_criteria>

<output>
After completion, create `.planning/objectives/04-duplicate-work-detection/04-03-format-detection-markdown-SUMMARY.md`.
</output>
