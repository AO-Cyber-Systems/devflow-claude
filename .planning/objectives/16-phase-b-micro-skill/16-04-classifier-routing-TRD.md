---
objective: 16-phase-b-micro-skill
trd: "04"
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/classifier.cjs
  - plugins/devflow/devflow/bin/lib/classifier.test.cjs
  - plugins/devflow/hooks/route-intent.js
  - plugins/devflow/hooks/route-intent.test.js
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
autonomous: true
requirements:
  - PHASE-B4

must_haves:
  truths:
    - "AMBIENT_PREAMBLE no longer says '(in development — for now, route to /devflow:quick)' next to /devflow:micro"
    - "AMBIENT_PREAMBLE routing decision table includes the same explicit cutoffs as /devflow:quick's SKILL.md (<5 files, <200 LOC) and /devflow:micro (sub-30-LOC, single-file)"
    - "route-intent.js INTENT_MAP contains a /devflow:micro entry whose regex fires on trivial-task prompts ('fix the typo', 'rename the foo')"
    - "route-intent.js trivial prompts route specifically to /devflow:micro, NOT to /devflow:quick"
    - "Existing /devflow:quick fire fixtures (NOT trivial-task) still route to /devflow:quick — no false-redirect to micro"
    - "All 1714+ tests pass (including the inverted classifier case 9 assertion and the new route-intent fixtures)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/classifier.cjs
      provides: "AMBIENT_PREAMBLE constant updated; '(in development...)' parenthetical dropped; routing table reflects shipped-micro state"
      contains: "/devflow:micro"
    - path: plugins/devflow/devflow/bin/lib/classifier.test.cjs
      provides: "case 9 assertion inverted: must NOT contain '(in development'"
      contains: "must NOT contain"
    - path: plugins/devflow/hooks/route-intent.js
      provides: "INTENT_MAP entry for /devflow:micro with regex matching trivial-task prompts"
      contains: "/devflow:micro"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
      provides: "New FIRE_FIXTURES entries for /devflow:micro"
      contains: "/devflow:micro"
  key_links:
    - from: plugins/devflow/devflow/bin/lib/classifier.cjs
      to: plugins/devflow/skills/micro/SKILL.md
      via: "AMBIENT_PREAMBLE references /devflow:micro skill name"
      pattern: "/devflow:micro"
    - from: plugins/devflow/hooks/route-intent.js
      to: plugins/devflow/skills/micro/SKILL.md
      via: "INTENT_MAP entry maps trivial-prompt regex to /devflow:micro"
      pattern: "/devflow:micro"
    - from: plugins/devflow/hooks/route-intent.test.js
      to: plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
      via: "FIRE_FIXTURES drives the route-intent fire test loop"
      pattern: "FIRE_FIXTURES"
---

<objective>
Wire `/devflow:micro` into the routing layer:
1. Drop the "(in development)" parenthetical in `classifier.cjs` AMBIENT_PREAMBLE now that the skill ships.
2. Add explicit routing-table entries with the same cutoff numbers used in `/devflow:quick` (16-03) and `/devflow:micro` (16-02).
3. Add an INTENT_MAP entry to `route-intent.js` so trivial-task prompts ("fix the typo", "rename the foo") route specifically to `/devflow:micro`, not `/devflow:quick`.
4. Add hand-built fire fixtures and update tests.

Purpose: The classifier preamble is what Claude reads at SessionStart to decide which skill to use. The route-intent hook is what fires on each user prompt. Without these wiring updates, the skill exists but nothing routes to it — Phase B's adoption thesis (≥30 micro/week) is dead on arrival.

Output: Routing table directs sub-30-LOC prompts to micro, not quick. INTENT_MAP fires on trivial-task verbs. Tests pass.
</objective>

<file_tree>
plugins/devflow/
├── devflow/bin/lib/
│   ├── classifier.cjs                          ← MODIFY (AMBIENT_PREAMBLE)
│   ├── classifier.test.cjs                     ← MODIFY (case 9 invert + cutoff assertions)
│   └── __fixtures__/
│       └── intent-fixtures.cjs                 ← MODIFY (add 3 FIRE_FIXTURES for micro)
└── hooks/
    ├── route-intent.js                         ← MODIFY (add INTENT_MAP entry)
    └── route-intent.test.js                    ← MODIFY (extend required-skills assertion to include /devflow:micro)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Current AMBIENT_PREAMBLE (`plugins/devflow/devflow/bin/lib/classifier.cjs:48-77`):**

```javascript
/**
 * Routing decision table preamble for ambient mode (DevFlow project with .planning/).
 *
 * LOCKED TEXT — from 15-RESEARCH.md. Update only in a dedicated TRD.
 * Note: /devflow:micro is IN DEVELOPMENT (Phase B, obj 7). Do NOT remove the
 * parenthetical note until Phase B ships.
 */
const AMBIENT_PREAMBLE = `DEVFLOW PROJECT DETECTED — ROUTING DIRECTIVE

This project has .planning/ — DevFlow ambient mode is active.

ROUTING DECISION TABLE:
  • Q&A / explanation / exploration       → respond directly, no skill
  • 1-2 line change, single file          → /devflow:micro (in development —
                                              for now, route to /devflow:quick)
  • <5 files, <200 LOC                    → /devflow:quick
  • Multi-file feature                    → /devflow:build
  • Bug investigation                     → /devflow:debug
  • Plan an objective                     → /devflow:plan-objective
  • Verify work                           → /devflow:verify-work
  • Status check                          → /devflow:status
  • Resume work                           → /devflow:status resume
  • Pause work                            → /devflow:status pause

CONSOLIDATED SKILLS (Phase G, v1.2 obj 12):
  /devflow:objective    add | remove
  /devflow:milestone    new | audit | complete | gaps
  /devflow:workstreams  setup | status | merge | run
  /devflow:todo         add | list
  /devflow:status       (no arg) | check | pause | resume

GATE: gate-edits.js will DENY direct Edit/Write/MultiEdit in ambient mode
unless an active skill marker (.planning/.skill-active) is present, or the
user prompt contains an explicit override phrase ("skip devflow", "just edit",
"bypass devflow", "force edit").

You MUST route through the appropriate skill BEFORE editing code.`;
```

**Existing classifier test case 9 (`plugins/devflow/devflow/bin/lib/classifier.test.cjs:102-106`):**

```javascript
test('case 9: mode ambient contains /devflow:micro AND (in development', () => {
  const result = renderRoutingPreamble({ mode: 'ambient' });
  assert.ok(result.includes('/devflow:micro'), 'must contain /devflow:micro');
  assert.ok(result.includes('(in development'), 'must contain (in development parenthetical — Phase B not yet shipped');
});
```

**Existing INTENT_MAP shape (`plugins/devflow/hooks/route-intent.js:37-98`):**

```javascript
const INTENT_MAP = [
  // BUILD: imperative + article + noun
  {
    rx: /\b(?:build|implement|ship|make|create|add)\s+(?:the|a|an|this|that|some)\s+\w+/i,
    skill: '/devflow:build',
    label: 'build',
  },
  // DEBUG: imperative + article + optional-adjectives + bug-noun
  {
    rx: /\b(?:fix|debug|investigate|diagnose|troubleshoot)\s+(?:the|this|that|a|an)\s+(?:\w+\s+){0,3}(?:bug|error|crash|failure|issue|problem|test|build|ci)\b/i,
    skill: '/devflow:debug',
    label: 'debug',
  },
  // ... more entries
];
```

Note: route-intent.js takes the FIRST or ALL matching entries (current code uses `filter` + dedup at line 108). Order in INTENT_MAP doesn't determine priority — multiple matches return multiple skills.

**Existing route-intent test fixture loader (`plugins/devflow/hooks/route-intent.test.js:29`):**

```javascript
const { FIRE_FIXTURES, NO_FIRE_FIXTURES } = require(
  '../devflow/bin/lib/__fixtures__/intent-fixtures.cjs'
);
```

**Existing route-intent test consumed-skills assertion (`route-intent.test.js:58-76`):**

```javascript
test('INTENT_MAP contains consolidated skills: build, debug, plan-objective, verify-work, status, status resume, status pause, objective add, new-project, research-objective', () => {
  const skills = new Set(INTENT_MAP.map(e => e.skill));
  const required = [
    '/devflow:build',
    '/devflow:debug',
    // ... existing list
  ];
  for (const skill of required) {
    assert.ok(skills.has(skill), `INTENT_MAP missing consolidated skill: ${skill} ...`);
  }
});
```

This assertion needs `/devflow:micro` added to the `required` array.
</codebase_examples>

<anti_patterns>
- **Do NOT** edit the LOCKED TEXT comment at line 41-47 of classifier.cjs in a way that says "do not update" — update it to say "Phase B shipped 2026-MM-DD; routing table is live".
- **Do NOT** put the micro INTENT_MAP entry's regex in a way that matches "fix the bug" (already matched by debug rule). Use specific trivial-task nouns: typo, line, semicolon, import, comment, whitespace.
- **Do NOT** make the micro regex so broad it eats `/devflow:quick`'s territory. Quick still owns "small change", "small feature", "5-file change". Micro owns one-line / single-token changes.
- **Do NOT** use bare-verb regexes — they'll false-positive on Q&A. Mirror the existing pattern of `imperative + article + noun` (see BUILD/DEBUG entries).
- **Do NOT** generate test fixtures with an LLM. Hand-build the FIRE_FIXTURES entries. Per TDD playbook habit 4.
- **Do NOT** invert case 9 of classifier.test.cjs by deleting it. INVERT it: must contain `/devflow:micro` AND must NOT contain `(in development`. Same coverage; opposite assertion.
- **Do NOT** remove existing `/devflow:quick` fixtures from FIRE_FIXTURES. Add micro fixtures alongside — the route-intent test loops over all fixtures and verifies each routes to its expected skill. We need both routing paths still proven.
</anti_patterns>

<error_recovery>
- If a new micro regex unexpectedly matches an existing quick/debug/build fixture's prompt, the route-intent test will report multiple matched skills for that fixture. The test asserts `expected_skill` for each — if a fixture suddenly returns `[/devflow:debug, /devflow:micro]` instead of just `[/devflow:debug]`, the assertion fails. Recovery: tighten the micro regex (more specific noun list, more required surrounding words) until the existing fixtures stop matching.
- If case 9 of classifier.test.cjs goes red because the production AMBIENT_PREAMBLE wasn't updated in the same commit, check that the Edit tool successfully replaced the multi-line template literal. The string is large; partial matches will silently no-op. Use Read after Edit to verify.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/16-phase-b-micro-skill/16-CONTEXT.md
@.planning/objectives/16-phase-b-micro-skill/16-RESEARCH.md

@plugins/devflow/devflow/bin/lib/classifier.cjs
@plugins/devflow/devflow/bin/lib/classifier.test.cjs
@plugins/devflow/hooks/route-intent.js
@plugins/devflow/hooks/route-intent.test.js
@plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
</context>

<gotchas>
1. **Classifier test case 9 will go RED the moment AMBIENT_PREAMBLE drops "(in development". Update both files in the SAME commit.** (Anti-pattern: ship preamble change in one commit, leave test failing across commits.)
2. **route-intent.js's `matchIntent` returns ALL matches.** If a prompt fires on TWO entries (e.g., a new micro entry AND the existing build entry), the user gets a multi-skill directive ("invoke /devflow:build OR /devflow:micro"). Avoid this by making the micro regex disjoint from existing entries — specifically NOT matching prompts that already fire on build/debug/quick triggers.
3. **The skip-rule for interrogatives** (`^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b`) is applied BEFORE INTENT_MAP. Micro fixtures must NOT start with these words.
4. **Fixture order in FIRE_FIXTURES doesn't matter for the test loop**, but keep new entries grouped together with a comment header (`// ─── B4: micro fixtures ───`) for readability — mirror the existing `// ─── A2: route-intent.js fire fixtures (10) ───` block at line 217.
5. **The `required` list in route-intent.test.js:60-71 must include `/devflow:micro`.** Otherwise, you can ship an INTENT_MAP without micro and tests still pass — the assertion is "all required skills present"; without micro in `required`, micro's absence from INTENT_MAP wouldn't fail.
6. **AMBIENT_PREAMBLE is asserted by ≥6 classifier tests (cases 7-12).** Beyond case 9, the others assert presence of `/devflow:build`, status resume/pause, consolidated skills, and gate-edits language. Make sure the routing table edit preserves all those tokens.
7. **The CLAUDE.md note about "1-2 line change, single file"** in the existing AMBIENT_PREAMBLE should become "Sub-30-LOC, single-file change" — matches issue #27 and micro's SKILL.md scope statement.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Update classifier.cjs AMBIENT_PREAMBLE + invert classifier test case 9</name>
  <files>
    plugins/devflow/devflow/bin/lib/classifier.cjs
    plugins/devflow/devflow/bin/lib/classifier.test.cjs
  </files>
  <action>
**Part A — `plugins/devflow/devflow/bin/lib/classifier.cjs`:**

1. Update the JSDoc comment at lines 41-47:

Replace:
```
 * LOCKED TEXT — from 15-RESEARCH.md. Update only in a dedicated TRD.
 * Note: /devflow:micro is IN DEVELOPMENT (Phase B, obj 7). Do NOT remove the
 * parenthetical note until Phase B ships.
```

With:
```
 * LOCKED TEXT — from 15-RESEARCH.md (preamble structure) and 16-PHASE-B (micro shipped).
 * Update only in a dedicated TRD.
```

2. Update the AMBIENT_PREAMBLE template literal. Within the ROUTING DECISION TABLE block, replace the two micro lines:

```
  • 1-2 line change, single file          → /devflow:micro (in development —
                                              for now, route to /devflow:quick)
```

With:
```
  • Sub-30-LOC, single-file change        → /devflow:micro (~2k token floor)
```

Also update the `<5 files, <200 LOC` line to add the missing "no new abstractions" qualifier (matches 16-03's quick refactor):

Replace:
```
  • <5 files, <200 LOC                    → /devflow:quick
```

With:
```
  • <5 files, <200 LOC, no new abstractions → /devflow:quick
```

LEAVE everything else in AMBIENT_PREAMBLE unchanged (consolidated skills block, GATE block, "You MUST route" closing line). Cases 7, 8, 10, 11, 12 of classifier.test.cjs all assert on these unchanged tokens.

**Part B — `plugins/devflow/devflow/bin/lib/classifier.test.cjs`:**

Find case 9 (lines 102-106) and INVERT the second assertion:

Replace:
```javascript
test('case 9: mode ambient contains /devflow:micro AND (in development', () => {
  const result = renderRoutingPreamble({ mode: 'ambient' });
  assert.ok(result.includes('/devflow:micro'), 'must contain /devflow:micro');
  assert.ok(result.includes('(in development'), 'must contain (in development parenthetical — Phase B not yet shipped');
});
```

With:
```javascript
test('case 9: mode ambient contains /devflow:micro and NO (in development parenthetical (Phase B shipped)', () => {
  const result = renderRoutingPreamble({ mode: 'ambient' });
  assert.ok(result.includes('/devflow:micro'), 'must contain /devflow:micro');
  assert.ok(!result.includes('(in development'), 'must NOT contain (in development — Phase B has shipped, parenthetical removed');
  assert.ok(result.includes('Sub-30-LOC'), 'must contain Sub-30-LOC qualifier (cutoff documentation)');
  assert.ok(result.includes('~2k token floor'), 'must contain ~2k token floor cost reference');
});
```

Run `npm test -- --test-name-pattern="renderRoutingPreamble"` to verify case 9 passes (with the inverted assertion) and cases 7, 8, 10, 11, 12 still pass (other AMBIENT_PREAMBLE tokens unchanged).

# CRITICAL: Update preamble AND test in the SAME commit. If only one lands, npm test breaks.
# CRITICAL: The inverted case 9 strengthens, not weakens, the test — it now asserts BOTH that micro is present AND that the dev-stub parenthetical is gone AND that the cutoff (Sub-30-LOC) and cost (~2k token floor) appear. This is the gate that proves Phase B routing is live.
# GOTCHA: Don't accidentally edit the INIT_OFFER_PREAMBLE constant (lines 84-95) — that's a different mode and must stay untouched.
# PATTERN: Mirror the existing case 9 commentary style ("Phase B not yet shipped" → "Phase B shipped").
  </action>
  <verify>
    grep -c "(in development" plugins/devflow/devflow/bin/lib/classifier.cjs  # expect 0
    grep -c "Sub-30-LOC" plugins/devflow/devflow/bin/lib/classifier.cjs  # expect ≥1
    grep -c "~2k token floor" plugins/devflow/devflow/bin/lib/classifier.cjs  # expect ≥1
    grep -c "no new abstractions" plugins/devflow/devflow/bin/lib/classifier.cjs  # expect ≥1
    grep -c "must NOT contain" plugins/devflow/devflow/bin/lib/classifier.test.cjs  # expect ≥1 (the new inverted assertion)
    npm test -- --test-name-pattern="renderRoutingPreamble" 2>&1 | grep -E "^# pass|^# fail|^ℹ pass|^ℹ fail"  # expect ≥6 pass, 0 fail
    npm test 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail" | head -3  # full suite still green
  </verify>
  <done>
    classifier.cjs AMBIENT_PREAMBLE has Sub-30-LOC + ~2k token floor + no new abstractions; "(in development" is gone. classifier.test.cjs case 9 asserts the inverted state. All classifier tests pass.
  </done>
  <recovery>
    If the Edit tool fails on the multi-line template literal: re-read classifier.cjs lines 48-77 with the Read tool, copy the EXACT current text (preserve trailing whitespace + indentation), then retry.
    If a non-case-9 classifier test breaks (case 7, 8, 10, 11, or 12): you accidentally removed a token those tests assert on. Compare the new AMBIENT_PREAMBLE against the old line-by-line — every token referenced in classifier.test.cjs lines 91-129 must still appear in the new preamble.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Add /devflow:micro INTENT_MAP entry + fixtures + test assertion</name>
  <files>
    plugins/devflow/hooks/route-intent.js
    plugins/devflow/hooks/route-intent.test.js
    plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
  </files>
  <action>
**Part A — `plugins/devflow/hooks/route-intent.js`:**

Add a new entry to INTENT_MAP. Place it AFTER the existing BUILD entry (line ~46) and BEFORE the DEBUG entry. The regex must match trivial-task prompts WITHOUT colliding with build / debug / quick territory.

```javascript
  // MICRO: imperative + article + trivial-noun (typo / line / semicolon / import / comment / whitespace / property name)
  // Routes ONLY trivial single-token changes; "small change" stays with quick.
  {
    rx: /\b(?:fix|correct|update|change|rename)\s+(?:the|this|that|a|an)\s+(?:typo|spelling|misspelling|comment|whitespace|indent(?:ation)?|semicolon|import|line|prop(?:erty)?\s+name|variable\s+name|function\s+name|filename)\b/i,
    skill: '/devflow:micro',
    label: 'micro',
  },
```

Anchored to specific trivial nouns (typo, semicolon, import, single line, etc.). Will NOT match "fix the bug" (debug owns it), "build the auth flow" (build owns it), "tackle this small change" (quick owns it).

**Part B — `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs`:**

Add 3 hand-built FIRE_FIXTURES entries for the new micro rule. Insert them into the FIRE_FIXTURES array (around line 282, before the closing `];`). Group them under a comment header:

```javascript
  // ─── B4: micro fixtures (3) ───
  {
    prompt: 'Fix the typo in the README',
    expected_skill: '/devflow:micro',
    label: 'fix + the + typo',
    why_fires: 'matches micro rule: fix + the + typo (trivial-noun whitelist)',
  },
  {
    prompt: 'Rename the prop name from foo to bar',
    expected_skill: '/devflow:micro',
    label: 'rename + the + prop name',
    why_fires: 'matches micro rule: rename + the + prop name',
  },
  {
    prompt: 'Update the import in the worker module',
    expected_skill: '/devflow:micro',
    label: 'update + the + import',
    why_fires: 'matches micro rule: update + the + import (trivial-noun whitelist)',
  },
```

Also add 1 NO_FIRE fixture proving the rule does NOT eat quick territory:

```javascript
  // ─── B4: micro no-fire (1) — prevent micro from eating quick territory ───
  {
    prompt: 'Tackle this small change in the auth flow',
    label: 'small change (quick territory)',
    why_no_fire: 'no trivial-noun match (small change is not in micro whitelist)',
  },
```

(Insert in the NO_FIRE_FIXTURES array around line 314 before closing `];`.)

**Part C — `plugins/devflow/hooks/route-intent.test.js`:**

Update the `required` array in the test at lines 58-76 to include `/devflow:micro`:

Replace:
```javascript
    const required = [
      '/devflow:build',
      '/devflow:debug',
      '/devflow:plan-objective',
      '/devflow:verify-work',
      '/devflow:status',
      '/devflow:status resume',
      '/devflow:status pause',
      '/devflow:objective add',
      '/devflow:new-project',
      '/devflow:research-objective',
    ];
```

With:
```javascript
    const required = [
      '/devflow:build',
      '/devflow:debug',
      '/devflow:plan-objective',
      '/devflow:verify-work',
      '/devflow:status',
      '/devflow:status resume',
      '/devflow:status pause',
      '/devflow:objective add',
      '/devflow:new-project',
      '/devflow:research-objective',
      '/devflow:micro',
    ];
```

Also update the test name string at line 58 to mention micro:
```
  test('INTENT_MAP contains consolidated skills: build, debug, plan-objective, verify-work, status, status resume, status pause, objective add, new-project, research-objective, micro', () => {
```

The fixture-driven fire test already loops over all FIRE_FIXTURES, so the 3 new micro fixtures get exercised automatically — no additional test code needed for those.

Run the full suite: `npm test`. Expected count: 1714 (end of 16-01) + 3 new fire fixture tests + 1 new no-fire fixture test = 1718+ tests pass, 0 fail.

# CRITICAL: The micro regex MUST NOT fire on existing FIRE_FIXTURES from rules other than micro itself. Run the test suite — if a build/debug/quick fixture suddenly matches micro, tighten the regex (remove broad nouns, add stricter surroundings).
# CRITICAL: Use \b word boundaries on every regex term. The existing INTENT_MAP entries do — match the style.
# GOTCHA: "prop name" requires `\s+` between words; can't be `prop\s*name` (would match "propname" which isn't English). The regex above uses `prop(?:erty)?\s+name` — captures both "prop name" and "property name".
# GOTCHA: Don't use `^` anchors in the regex — fire prompts may have leading words ("Quick: fix the typo"). Existing entries use `\b` word boundaries throughout.
# PATTERN: Mirror the existing BUILD entry's "imperative + article + noun" structure. Don't invent a new shape.
  </action>
  <verify>
    grep -c "/devflow:micro" plugins/devflow/hooks/route-intent.js  # expect 1
    grep -c "label: 'micro'" plugins/devflow/hooks/route-intent.js  # expect 1
    grep -c "/devflow:micro" plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs  # expect 3 (the 3 new FIRE entries)
    grep -c "B4:" plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs  # expect 2 (FIRE header + NO_FIRE header)
    grep -c "/devflow:micro" plugins/devflow/hooks/route-intent.test.js  # expect 1 (in the required array)
    npm test -- --test-name-pattern="INTENT_MAP" 2>&1 | grep -E "^# pass|^ℹ pass" | head -3
    npm test 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail" | head -3  # full suite — expect ≥1718 pass, 0 fail
  </verify>
  <done>
    INTENT_MAP has the new micro entry. FIRE_FIXTURES has 3 new micro fire fixtures + 1 new quick-territory NO_FIRE fixture. route-intent.test.js `required` array includes `/devflow:micro`. All tests pass with no regressions.
  </done>
  <recovery>
    If the regex fires on an existing FIRE_FIXTURE (e.g., 'Fix the login bug' suddenly returns [/devflow:debug, /devflow:micro]): tighten the micro noun list. The minimal safe set is: typo, semicolon, import, comment, whitespace, indent(ation), prop name, variable name, function name. If even those collide, prefix with the trivial-prompt boundary check: `\b(?:fix|correct|update|change|rename)\s+(?:the|this|that|a|an)\s+(?:typo|...)` — do NOT add looser verbs (no "fix" + bare nouns).
    If the test loop reports "expected_skill mismatch" on a NEW micro fixture: the regex doesn't match. Test the regex in isolation — `INTENT_MAP.find(e => e.label === 'micro').rx.test('Fix the typo in the README')` should return true.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
End-state checks:

1. **classifier.cjs AMBIENT_PREAMBLE updated:**
   - `grep -c "(in development" plugins/devflow/devflow/bin/lib/classifier.cjs` == 0.
   - `grep -c "Sub-30-LOC" plugins/devflow/devflow/bin/lib/classifier.cjs` ≥ 1.
   - `grep -c "~2k token floor" plugins/devflow/devflow/bin/lib/classifier.cjs` ≥ 1.
   - `grep -c "no new abstractions" plugins/devflow/devflow/bin/lib/classifier.cjs` ≥ 1.

2. **classifier.test.cjs case 9 inverted:**
   - `grep -c "must NOT contain (in development" plugins/devflow/devflow/bin/lib/classifier.test.cjs` ≥ 1.
   - `grep -c "Phase B shipped" plugins/devflow/devflow/bin/lib/classifier.test.cjs` ≥ 1.

3. **route-intent.js INTENT_MAP has micro:**
   - `grep -c "label: 'micro'" plugins/devflow/hooks/route-intent.js` == 1.
   - `grep -c "/devflow:micro" plugins/devflow/hooks/route-intent.js` == 1.

4. **Fixture file has new entries:**
   - `grep -c "/devflow:micro" plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` ≥ 3.

5. **Test required-list includes micro:**
   - `grep -c "/devflow:micro'" plugins/devflow/hooks/route-intent.test.js` ≥ 1 (within the `required` array).

6. **No regression — all tests pass:**
   - `npm test 2>&1 | grep "^ℹ pass"` shows pass count ≥ 1718 (16-01: +12, 16-04: +4, no other changes from 16-02/16-03 markdown-only).

7. **Manual smoke (post-merge):** Submit prompt "Fix the typo in the README" to a Claude Code session in a `.planning/` project. Confirm the route-intent.js hook injects a directive pointing to `/devflow:micro` (visible via `additionalContext` in the session).
</verification>

<success_criteria>
- [ ] AMBIENT_PREAMBLE drops "(in development" parenthetical, adds "Sub-30-LOC", "~2k token floor", "no new abstractions" qualifiers.
- [ ] classifier.test.cjs case 9 inverted (must NOT contain "(in development"; must contain Sub-30-LOC + ~2k token floor).
- [ ] INTENT_MAP has a single new `label: 'micro'` entry with regex matching the trivial-noun whitelist.
- [ ] FIRE_FIXTURES has 3 new micro entries + 1 new no-fire fixture proving quick territory is preserved.
- [ ] route-intent.test.js `required` array includes `/devflow:micro`.
- [ ] All tests pass (≥1718 total, 0 fail).
- [ ] At least 1 atomic commit lands: `feat(16-04): wire /devflow:micro into classifier preamble + route-intent INTENT_MAP`.
</success_criteria>

<output>
After completion, create `.planning/objectives/16-phase-b-micro-skill/16-04-SUMMARY.md` summarising:
- New AMBIENT_PREAMBLE excerpt
- New INTENT_MAP entry verbatim (regex + skill + label)
- Fixture additions (counts, examples)
- Test count delta (1714 → 1718+)
- Manual smoke-test outcome
</output>
