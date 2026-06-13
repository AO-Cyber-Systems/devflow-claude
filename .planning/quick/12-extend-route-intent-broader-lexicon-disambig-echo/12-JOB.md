---
objective: 12-extend-route-intent-broader-lexicon-disambig-echo
job: 12
trd: 12
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/route-intent.js
  - plugins/devflow/hooks/route-intent.test.js
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
autonomous: true
mode: quick
kind: plugin
work: feature
tdd_posture: strict
test_list_first: required
fixture_strategy: generators
must_haves:
  - matchIntent returns enriched objects {skill, label, hint} (not bare skill strings) so disambiguation has display metadata
  - Every existing strict-pattern entry preserved (no regressions on the 11 INTENT_MAP rules in route-intent.js:37-105)
  - All FIRE_FIXTURES and NO_FIRE_FIXTURES in lib/__fixtures__/intent-fixtures.cjs still pass (regression bar)
  - All new natural-phrasing prompts fire to the correct skill; interrogative-prefixed versions of the same prompts still skip (lines 113-114 Q&A skip-rule honored)
  - Single-match renderDirective output includes a "Triggered by:" echo line with a short excerpt of the prompt
  - Multi-match (length >= 2) renderDirective output uses a distinct disambiguation box: banner "MULTIPLE INTENTS MATCHED", numbered list of {skill + hint}, and explicit instruction to confirm with user before invoking
  - `node --test plugins/devflow/hooks/route-intent.test.js` is fully green
  - `node --test` for the whole repo still green (no fixture-shape break in df-tools tests that import intent-fixtures.cjs)
---

<objective>
Extend `plugins/devflow/hooks/route-intent.js` to cover broader natural-language phrasings, return structured multi-match results, and echo the triggering phrase back to the user via the additionalContext directive. This is Item B of the "close the natural-language invocation gap" arc — A (user-global skill refresh) landed earlier; B converts route-intent from an 11-pattern strict matcher into a richer router with disambiguation UX.

**Why now:** Current state is the rate-limiter on natural-language → skill routing in DevFlow projects. The 11 strict patterns reject many natural phrasings, multi-match collapses to a `"skillA or skillB"` joined string (no structured choice), and the user has no echo of WHAT triggered the directive — the routing feels invisible. After this lands, slash menu visibility (from A) plus broader trigger surface (from this objective) should make natural-language → skill routing the default path.

**TDD posture (strict, from user CLAUDE.md playbook + defaults-table (plugin, feature)):**
- Test-list first (see `## Test list` below).
- Hand-built fixture extensions in `intent-fixtures.cjs` — no LLM-generated phrasings.
- One RED test at a time; commit `test:` → `feat:` → optional `refactor:` per task per the playbook.
- Outside-in not applicable (pure unit-level hook logic; no UI/integration layer here).

**Out of scope (DO NOT touch):**
- Q&A interrogative skip-list at lines 113-114 of route-intent.js — deliberate, do NOT loosen.
- `findPlanningDir` walk logic.
- `hooks.json` registration.
- Skills themselves (SKILL.md files).
- Pre-existing dirty state in `.planning/`.

</objective>

<embedded_context>

<codebase_examples>

**Existing INTENT_MAP entry shape (route-intent.js:37-105) — must be preserved + extended:**
```js
const INTENT_MAP = [
  {
    rx: /\b(?:build|implement|ship|make|create|add)\s+(?:the|a|an|this|that|some)\s+\w+/i,
    skill: '/devflow:build',
    label: 'build',
  },
  // ...10 more entries
];
```

**New shape (additive — keep rx/skill/label, add hint):**
```js
{
  rx: /...regex.../i,
  skill: '/devflow:build',
  label: 'build',
  hint: 'plan + execute a multi-subsystem feature', // 4-6 word description
},
```

**Existing matchIntent (route-intent.js:111-117) — current return is dedup'd skill strings:**
```js
function matchIntent(prompt) {
  if (!prompt) return [];
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  if (/^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b/i.test(prompt)) return [];
  const matches = INTENT_MAP.filter(e => e.rx.test(prompt));
  return [...new Set(matches.map(m => m.skill))];
}
```

**New matchIntent — returns enriched objects, dedup'd by skill:**
```js
function matchIntent(prompt) {
  if (!prompt) return [];
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  if (/^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b/i.test(prompt)) return [];
  const matches = INTENT_MAP.filter(e => e.rx.test(prompt));
  // Dedup by skill (preserve first match metadata for that skill)
  const seen = new Set();
  const result = [];
  for (const m of matches) {
    if (seen.has(m.skill)) continue;
    seen.add(m.skill);
    result.push({ skill: m.skill, label: m.label, hint: m.hint || '' });
  }
  return result;
}
```

**renderDirective (route-intent.js:126-150) — current signature: `renderDirective(skills)` where skills is `string[]`.**
New signature accepts the enriched array AND an optional triggering prompt:
```js
function renderDirective(matches, prompt = '') {
  if (matches.length === 0) return '';
  if (matches.length === 1) return renderSingleMatch(matches[0], prompt);
  return renderMultiMatch(matches, prompt);
}
```

**Triggered-by excerpt extraction (single-match path):**
```js
function extractTriggerExcerpt(prompt) {
  const trimmed = (prompt || '').trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + '...';
}
```

**Multi-match box shape (NEW — disambiguation):**
```
╔══════════════════════════════════════════════════════════════════════╗
║           DEVFLOW ROUTING — MULTIPLE INTENTS MATCHED                ║
╠══════════════════════════════════════════════════════════════════════╣
║ Triggered by: "ship the dashboard and verify the work"              ║
║                                                                      ║
║ Your prompt matched more than one routing intent:                   ║
║                                                                      ║
║   1. /devflow:build       — plan + execute a multi-subsystem feature║
║   2. /devflow:verify-work — verify a completed objective            ║
║                                                                      ║
║ Confirm with the user which skill to invoke BEFORE editing code.    ║
║ Do NOT call Edit/Write/MultiEdit until the user picks one.          ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Fixture file (lib/__fixtures__/intent-fixtures.cjs:222-340) — current shape:**
```js
const FIRE_FIXTURES = [
  {
    prompt: 'Fix the login bug',
    expected_skill: '/devflow:debug',
    label: 'imperative + bug noun',
    why_fires: 'matches debug rule: fix + the + bug',
  },
  // ...
];
```

This file is consumed by route-intent.test.js (line 29-31) which still asserts on `expected_skill`. Extending FIRE_FIXTURES is additive — existing fixtures keep their shape.

</codebase_examples>

<anti_patterns>

- **DO NOT loosen the Q&A skip-rule at lines 113-114.** Any new regex you add must coexist with `^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b` — i.e., "Can you fix the login bug?" must still NOT fire even though the new debug pattern would otherwise match. The skip-rule fires *before* the regex scan, so this is automatic for prompts starting with those interrogatives — but DO test it explicitly with NO_FIRE_FIXTURES.
- **DO NOT replace strict imperative patterns with their loosened forms.** Add new entries; don't relax existing ones. The existing 11 entries are deliberately strict to prevent false-positives on Q&A; loosening them would regress the lines-113-114 invariant we just leaned on.
- **DO NOT use LLM-generated test prompts.** All new fixtures must be hand-crafted phrasings that you can defend by pointing at a real natural-language phrasing pattern (e.g., "ship it" — common verbal pattern; "what's next" — common standup phrase). Per user CLAUDE.md playbook habit 4.
- **DO NOT change the public shape of `module.exports` such that existing route-intent.test.js tests break silently.** The current test imports `{ INTENT_MAP, matchIntent, renderDirective }`. All three must remain exported. Their *return shapes* change — that's expected — but the names stay.
- **DO NOT introduce a second match-shape (e.g., return `string[]` in some paths and `object[]` in others).** matchIntent always returns `Array<{ skill, label, hint }>` after this change. Tests that previously asserted on `skills.includes('/devflow:debug')` must be updated to `skills.some(s => s.skill === '/devflow:debug')` OR a helper added (`skillNames(matches) => matches.map(m => m.skill)`).
- **DO NOT touch micro-trivial-noun regex.** Micro routing rules (line 41) are already locked.

</anti_patterns>

<gotchas>

- **route-intent.test.js currently asserts `skills.includes(f.expected_skill)` directly** (line 104). This will break the moment matchIntent returns objects instead of strings. Plan: update those assertions to extract `.skill` from each element — touch route-intent.test.js lines 100-107 explicitly.
- **The `INTENT_MAP shape` test on line 47-56 only requires `rx`, `skill`, `label`.** Adding `hint` as a new field doesn't break that test — but if you want `hint` to be *required*, you must extend the test. Decision: make `hint` optional (default to `''`) so existing entries pass; new entries get meaningful hints. Don't backfill hints into the 11 existing entries in this objective — out of scope, would balloon the diff.
- **Fixture file is also imported by other tests.** Run the full `node --test` suite — not just route-intent.test.js — before commit. The `module.exports` block at intent-fixtures.cjs:342-352 is consumed by intent-resolver tests too (those don't use FIRE_FIXTURES but they share the file). Additive changes only.
- **Q&A skip-rule effectiveness for the new patterns.** Specific risk: "what's next" — if we add `\bwhat'?s\s+next\b` → status, that prompt starts with "what" (NOT in skip-list — "what" was deliberately left out per line 109 comment, so "What's our progress?" can fire). So "what's next" WILL fire, as intended. But "Why what's next?" still won't (starts with "why"). Verify each new pattern's interrogative cousin in NO_FIRE_FIXTURES.
- **Excerpt length for "Triggered by:" line.** The box is 70 columns wide; the prefix `║ Triggered by: ""` + closing `║` already consumes ~21 chars, leaving ~47 inside the quotes. 60-char extract will overflow the box. Use 45-char extract with `...` suffix, or expand the box to 80 columns. Decision: 45-char extract, keep box at 70. The padEnd function (line 121-124) handles overflow by slicing, so it won't crash — but the line will look truncated. Pick a length that visually fits.
- **"is anyone else on X" cannot fire under the current Q&A skip-rule** (starts with "is"). Per anti-pattern rule we do NOT loosen the skip-list. Move that test case from FIRE_FIXTURES to NO_FIRE_FIXTURES with `why_no_fire: 'starts with "is" — Q&A interrogative skip'`. The awareness skill still gets coverage via "what'd I miss" and "show me recent activity".

</gotchas>

<validation_gates>

- `node --test plugins/devflow/hooks/route-intent.test.js` — focused suite, must pass after both tasks complete
- `node --test` — full suite, must still pass (no regression in df-tools or fixture-consuming tests)
- Manual smoke: `echo '{"prompt":"ship it for the auth flow"}' | node plugins/devflow/hooks/route-intent.js` from a directory with `.planning/` → expect JSON output with `additionalContext` containing `/devflow:build`, `Triggered by:`, and `OBLIGATORY`

</validation_gates>

## Test list

This is the test-list-first checklist per user CLAUDE.md playbook habit 2. Each entry corresponds to ONE test in route-intent.test.js. Write them in order; one RED commit per entry where indicated.

**Task 1 fixtures (extend FIRE_FIXTURES + NO_FIRE_FIXTURES first):**

FIRE fixtures to add (one test each, all asserting `matches.some(m => m.skill === expected_skill)`):

1. `"ship it for the auth flow"` → `/devflow:build` (verb particle "it" + prep phrase)
2. `"let's work on the new dashboard"` → `/devflow:build` (let's + work-on + the + noun)
3. `"let's start the migration"` → `/devflow:build` (let's + start + the + noun)
4. `"I want to fix the broken login"` → `/devflow:debug` (I want to + fix + the + bug-ish noun)
5. `"can you fix the failing test"` → **NO-FIRE** (regression — starts with "can", interrogative skip)
6. `"do a quick pass on the auth module"` → `/devflow:quick` (quick-routing — note: `/devflow:quick` not in current INTENT_MAP)
7. `"make a quick fix to the README"` → `/devflow:quick`
8. `"what should I work on"` → `/devflow:status`
9. `"what's next"` → `/devflow:status`
10. `"what's on my plate"` → `/devflow:status`
11. `"save my progress"` → `/devflow:status pause`
12. `"I'm stopping for the day"` → `/devflow:status pause`
13. `"leaving for now"` → `/devflow:status pause`
14. `"let's pick up where we stopped"` → `/devflow:status resume`
15. `"what'd I miss"` → `/devflow:awareness` (NEW skill in INTENT_MAP)
16. `"show me recent activity"` → `/devflow:awareness`
17. `"is anyone else on the auth refactor"` → **NO-FIRE** (Q&A skip; moved to NO_FIRE_FIXTURES per the gotchas section)
18. `"add a todo for the README cleanup"` → `/devflow:add-todo`
19. `"any todos"` → `/devflow:check-todos`
20. `"verify this objective"` → `/devflow:verify-work`
21. `"check the work"` → `/devflow:verify-work` (regression — already covered by existing verify rule at line 65; included as assertion only to confirm no break)
22. `"research how to use Vitest"` → `/devflow:research-objective`
23. `"investigate the Vitest library"` → `/devflow:research-objective` (regression — likely covered by existing research rule at line 101; assertion confirms)
24. `"audit the milestone"` → `/devflow:audit-milestone` (NEW skill)
25. `"sync to github"` → `/devflow:gh-sync` (NEW skill)
26. `"make a new milestone"` → `/devflow:new-milestone` (NEW skill)
27. `"discuss the objective"` → `/devflow:discuss-objective` (NEW skill)

NO-FIRE fixtures to add (regression — interrogative-prefixed versions of the above must still skip):

28. `"can you ship it for the auth flow"` → no fire (starts with "can")
29. `"why are we stopping"` → no fire (starts with "why")
30. `"is anyone else working on this"` → no fire (starts with "is")
31. `"should I sync to github"` → no fire (starts with "should")

**Task 2 tests (route-intent.test.js — disambiguation + echo):**

32. `matchIntent('Build the dashboard')` returns array of objects, each with `{skill, label, hint}` — shape regression
33. `matchIntent('Build the dashboard and verify the work')` returns >= 2 entries (build + verify) — multi-match shape
34. `renderDirective([{skill: '/devflow:debug', label: 'debug', hint: 'fix a bug'}], 'Fix the login bug')` includes `Triggered by: "Fix the login bug"`
35. `renderDirective([single])` includes the existing single-match box content (`OBLIGATORY`, `gate-edits.js will DENY`) — regression
36. `renderDirective([a, b])` includes `MULTIPLE INTENTS MATCHED`
37. `renderDirective([a, b])` includes numbered list (`1.` and `2.` substrings)
38. `renderDirective([a, b])` includes each match's `hint` text
39. `renderDirective([a, b])` includes `Confirm with the user`
40. `renderDirective([])` returns empty string (regression — no output when no matches)
41. Existing 7 `renderDirective` shape tests (route-intent.test.js:151-189) still pass with the new signature (single-match path preserves OBLIGATORY / DEVFLOW / gate-edits / box-corners)

This list is the contract. Don't skip; don't batch.

</embedded_context>

<task type="auto" tdd="true">
  <name>Extend INTENT_MAP lexicon + fixtures (RED → GREEN cycle 1)</name>
  <files>
    plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
    plugins/devflow/hooks/route-intent.js
    plugins/devflow/hooks/route-intent.test.js
  </files>
  <action>

Broaden route-intent.js's INTENT_MAP to cover natural phrasings while keeping the strict imperative patterns intact. Add the `hint` field to new entries (existing entries stay as-is; `hint` is optional).

**Step 1 — Extend fixtures FIRST (RED setup):**

Open `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs`. Append the FIRE_FIXTURES entries (items 1-4, 6-16, 18-27 from the Test list — skip items 5, 17, 28-31 which are NO_FIRE). Each entry follows the existing shape `{ prompt, expected_skill, label, why_fires }`. Place them after the existing `// ─── B4: micro fixtures (3) ───` block but before the closing `];`. Add a section comment: `// ─── Obj 12: broader-lexicon fixtures (B item) ───`.

Then append the NO_FIRE_FIXTURES entries (items 5, 17, 28-31). Add a section comment: `// ─── Obj 12: interrogative regression (broader lexicon must coexist with Q&A skip) ───`.

# CRITICAL: Use the EXACT prompts from the Test list above. Do NOT rephrase.
# Tests are driven by these fixtures via the `for (const f of FIRE_FIXTURES)` loop in route-intent.test.js:99-108 and route-intent.test.js:115-122. Both loops auto-pick up the new entries.

**Step 2 — Run tests (expect RED):**

```
node --test plugins/devflow/hooks/route-intent.test.js
```

Expect: ~25 new FIRE_FIXTURES tests fail (route-intent.js doesn't yet match those prompts). The ~6 new NO_FIRE_FIXTURES tests should pass if they're truly interrogative-prefixed (Q&A skip-rule catches them). If any NO_FIRE_FIXTURES test fails at this stage, the prompt is matching an *existing* pattern unexpectedly — investigate before continuing (likely means an existing INTENT_MAP entry is over-eager; flag in commit message).

Commit: `test(12-broader-lexicon): add fire + no-fire fixtures for broader natural-language phrasings`

**Step 3 — Extend INTENT_MAP (GREEN):**

Open `plugins/devflow/hooks/route-intent.js`. Add new entries to INTENT_MAP *after* the existing 11. Each new entry has `{ rx, skill, label, hint }` (hint required for new entries; 4-6 word description of when it fires).

Approach:
1. Group new entries by target skill (build / quick / status / status pause / status resume / awareness / add-todo / check-todos / verify-work / research-objective / audit-milestone / gh-sync / new-milestone / discuss-objective)
2. For each group, write ONE regex that covers all the natural phrasings in that group from the Test list
3. Test the regex against each fixture's prompt mentally before committing the entry
4. Keep regexes anchored on key noun/verb pairs — don't over-broaden (e.g., `\bship\s+it\b` is fine; `\bship\b` alone would match "shipping container" in unrelated prompts)

Specific entries to add (one per row — write the rx field to match the listed fixtures and NOT match the listed counterexamples):

- **build (extension):** `rx: /\bship\s+it\b|\blet'?s\s+(?:work\s+on|start)\s+(?:the|a|an)\s+\w+|\bI\s+want\s+to\s+(?:build|implement|make|create)\s+(?:the|a|an)\s+\w+/i`, hint: `'plan + execute a multi-subsystem feature'`
- **debug (extension):** `rx: /\bI\s+want\s+to\s+fix\s+(?:the|this|that)\s+(?:\w+\s+){0,3}(?:bug|error|crash|failure|issue|problem|test|build|ci|broken\s+\w+|failing\s+\w+)\b/i`, hint: `'fix a bug or failing test'`
  - Note: "broken login" / "failing test" need broader noun list — extend the (bug|error|...) noun group.
- **quick (NEW skill in INTENT_MAP):** `rx: /\b(?:do|make|take)\s+a\s+quick\s+(?:pass|fix|change|update)\b/i`, skill: `'/devflow:quick'`, label: `'quick'`, hint: `'small feature, <5 files'`
- **status (extension):** `rx: /\bwhat\s+should\s+I\s+work\s+on\b|\bwhat'?s\s+next\b|\bwhat'?s\s+on\s+my\s+plate\b/i`, hint: `'show current position + next action'`
  - These all start with "what" — the skip-list deliberately omits "what" so this fires.
- **status pause (extension):** `rx: /\bsave\s+my\s+progress\b|\bI'?m\s+stopping\b|\bleaving\s+for\s+now\b/i`, hint: `'snapshot state + pause work'`
- **status resume (extension):** `rx: /\blet'?s\s+pick\s+up\s+where\s+(?:we|I)\s+stopped\b/i`, hint: `'resume work from last snapshot'`
- **awareness (NEW skill):** `rx: /\bwhat'?d\s+I\s+miss\b|\bshow\s+me\s+(?:the\s+)?recent\s+activity\b/i`, skill: `'/devflow:awareness'`, label: `'awareness'`, hint: `'cross-repo + peer activity check'`
  - NOTE: "is anyone else on X" cannot fire (Q&A skip catches "is"). Per the gotchas section, it lives in NO_FIRE_FIXTURES.
- **add-todo (NEW skill):** `rx: /\b(?:add|create)\s+a\s+todo\s+(?:for|item|about)\b/i`, skill: `'/devflow:add-todo'`, label: `'add-todo'`, hint: `'add a new todo item'`
- **check-todos (NEW skill):** `rx: /\b(?:any\s+todos|check\s+(?:this|the|my)\s+todos?)\b/i`, skill: `'/devflow:check-todos'`, label: `'check-todos'`, hint: `'list outstanding todos'`
- **verify-work (extension):** `rx: /\bverify\s+(?:this|the\s+current)\s+objective\b/i`, hint: `'verify objective completion'` (in addition to existing rule)
- **research-objective (extension):** `rx: /\bresearch\s+how\s+to\s+\w+|\binvestigate\s+(?:the\s+)?\w+\s+library\b/i`, hint: `'research approach + libraries'` (in addition to existing rule)
- **audit-milestone (NEW skill):** `rx: /\baudit\s+(?:the\s+)?milestone\b/i`, skill: `'/devflow:audit-milestone'`, label: `'audit-milestone'`, hint: `'audit milestone state'`
- **gh-sync (NEW skill):** `rx: /\bsync\s+to\s+github\b|\bpush\s+to\s+github\b/i`, skill: `'/devflow:gh-sync'`, label: `'gh-sync'`, hint: `'sync planning state to GitHub'`
- **new-milestone (NEW skill):** `rx: /\b(?:make|create|start)\s+a\s+new\s+milestone\b/i`, skill: `'/devflow:new-milestone'`, label: `'new-milestone'`, hint: `'create a new milestone'`
- **discuss-objective (NEW skill):** `rx: /\bdiscuss\s+(?:the|this)\s+objective\b/i`, skill: `'/devflow:discuss-objective'`, label: `'discuss-objective'`, hint: `'interactive objective discussion'`

Also update matchIntent to return enriched objects (see codebase_examples above):

```js
function matchIntent(prompt) {
  if (!prompt) return [];
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  if (/^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b/i.test(prompt)) return [];
  const matches = INTENT_MAP.filter(e => e.rx.test(prompt));
  const seen = new Set();
  const result = [];
  for (const m of matches) {
    if (seen.has(m.skill)) continue;
    seen.add(m.skill);
    result.push({ skill: m.skill, label: m.label, hint: m.hint || '' });
  }
  return result;
}
```

# GOTCHA: Test each regex against BOTH its FIRE prompt AND its interrogative-prefixed NO_FIRE counterpart. The Q&A skip-rule at line 113-114 should catch the interrogative version automatically — but verify by running tests.
# PATTERN: Follow the existing INTENT_MAP entry style: multi-line entries with rx on its own line, then skill, label, hint.

**Step 4 — Update route-intent.test.js to handle new matchIntent return shape:**

The test at line 100-107 currently uses `skills.includes(f.expected_skill)`. matchIntent now returns objects. Update the assertion:

```js
test(`fires on "${f.prompt}" → ${f.expected_skill} (${f.label})`, () => {
  const matches = matchIntent(f.prompt);
  assert.ok(matches.length > 0, ...);
  const skills = matches.map(m => m.skill);
  assert.ok(skills.includes(f.expected_skill), ...);
});
```

Apply to BOTH the FIRE loop (line 100-107) and the NO_FIRE loop (line 116-121) — though NO_FIRE just asserts `length === 0`, which works regardless of element shape.

Also: the skill-prefix-exclusion tests at lines 129-144 use `assert.deepEqual(matchIntent(...), [])` — `[]` works regardless of element shape (empty array is empty array), so those stay as-is.

**Step 5 — Run tests (expect GREEN):**

```
node --test plugins/devflow/hooks/route-intent.test.js
```

Expect: all FIRE_FIXTURES pass (existing + ~25 new). All NO_FIRE_FIXTURES pass. Existing INTENT_MAP shape tests pass (rx/skill/label still required; hint optional). The `renderDirective` tests will still pass because Task 1 didn't change renderDirective's signature yet — `matchIntent` returns objects, but the test calls `renderDirective(['/devflow:debug'])` directly with a string array (line 152). That test will START failing in Task 2 when we change renderDirective; for now it's still green.

If any NEW fire fixture fails at this point: the regex you wrote doesn't match the fixture prompt. Debug by:
1. Copy the failing prompt
2. Copy the regex
3. Test in a Node REPL: `> /your-regex/i.test('your prompt')` — if false, the regex is wrong; iterate.

If any EXISTING fire fixture fails: you broke a regression. Likely the new regex is shadowing an existing rule via dedup (matchIntent dedupes by skill, so two rules pointing at the same skill are fine — but if one new rule accidentally has a typo'd skill name, dedup logic could behave oddly). Investigate.

Commit: `feat(12-broader-lexicon): extend INTENT_MAP with natural-phrasing entries + enriched matchIntent shape`

  </action>
  <verify>
    `node --test plugins/devflow/hooks/route-intent.test.js` — all tests green (existing 30+ tests + ~31 new fixture-driven tests). `node --test` for the whole repo — still green (no fixture-shape regression in df-tools tests that share intent-fixtures.cjs).
  </verify>
  <done>
    INTENT_MAP entry count is `>= 24` (11 existing + 13+ new). All new fixtures pass. Existing 11 INTENT_MAP entries unchanged. matchIntent return type is now `Array<{ skill, label, hint }>`. The 13 existing FIRE_FIXTURES still pass. Q&A skip-rule (lines 113-114) untouched. Two atomic commits exist: `test:` then `feat:`.
  </done>
  <recovery>
    If a new regex causes an existing fixture to mismatch unexpectedly (e.g., the broader build rule matches "Fix the typo in the README" before the micro rule), the cause is rule-order. Micro is FIRST in INTENT_MAP (line 41) — keep it first. New entries go to the END of the array. If a new entry's rx is too greedy, narrow it (require an explicit word boundary, anchor on a specific verb, etc.).
    If a Q&A NO_FIRE fixture suddenly fires, the prompt's leading word is NOT in the skip-list (lines 113-114). Either pick a different prompt phrasing that DOES start with a skip-listed word, or move the fixture out of NO_FIRE_FIXTURES — but DO NOT loosen the skip-list per anti-patterns.
    If `node --test` for the full repo regresses (non-route-intent failures), it's almost certainly intent-fixtures.cjs structural breakage. The fixtures file is consumed by intent-resolver tests as well. `git diff plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` and confirm only additive changes (no field renames, no shape changes).
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Multi-match disambiguation + post-injection echo (RED → GREEN cycle 2)</name>
  <files>
    plugins/devflow/hooks/route-intent.js
    plugins/devflow/hooks/route-intent.test.js
  </files>
  <action>

Update `renderDirective` to (a) accept the enriched match objects from Task 1's matchIntent, (b) render a single-match box with a "Triggered by:" echo line, and (c) render a multi-match disambiguation box when 2+ skills match. Update `main()` to pass the trimmed prompt to renderDirective.

**Step 1 — Write failing tests FIRST (RED):**

In `plugins/devflow/hooks/route-intent.test.js`, add a new `describe` block AFTER the existing `renderDirective — box-drawn directive` block (around line 189). Use the existing patterns for assertion style.

```js
describe('renderDirective — enriched matches + echo + disambiguation', () => {
  const singleMatch = [{ skill: '/devflow:debug', label: 'debug', hint: 'fix a bug or failing test' }];
  const multiMatch = [
    { skill: '/devflow:build', label: 'build', hint: 'plan + execute a multi-subsystem feature' },
    { skill: '/devflow:verify-work', label: 'verify', hint: 'verify a completed objective' },
  ];

  test('single-match: contains "Triggered by:" echo line with prompt excerpt', () => {
    const out = renderDirective(singleMatch, 'Fix the login bug in the auth flow');
    assert.ok(out.includes('Triggered by:'), `missing "Triggered by:" line:\n${out}`);
    assert.ok(out.includes('Fix the login bug'), `missing prompt excerpt:\n${out}`);
  });

  test('single-match: still contains OBLIGATORY (regression)', () => {
    const out = renderDirective(singleMatch, 'Fix the login bug');
    assert.ok(out.includes('OBLIGATORY'), `missing OBLIGATORY:\n${out}`);
  });

  test('single-match: still contains "gate-edits.js will DENY" (regression)', () => {
    const out = renderDirective(singleMatch, 'Fix the login bug');
    assert.ok(out.includes('gate-edits.js will DENY'), `missing gate-edits line:\n${out}`);
  });

  test('multi-match: contains "MULTIPLE INTENTS MATCHED" banner', () => {
    const out = renderDirective(multiMatch, 'Build the dashboard and verify the work');
    assert.ok(out.includes('MULTIPLE INTENTS MATCHED'), `missing banner:\n${out}`);
  });

  test('multi-match: contains numbered list (1. and 2.)', () => {
    const out = renderDirective(multiMatch, 'Build the dashboard and verify the work');
    assert.ok(/\b1\./.test(out), `missing "1." numbered marker:\n${out}`);
    assert.ok(/\b2\./.test(out), `missing "2." numbered marker:\n${out}`);
  });

  test('multi-match: contains each match\'s hint text', () => {
    const out = renderDirective(multiMatch, 'Build the dashboard and verify the work');
    assert.ok(out.includes('plan + execute'), `missing build hint:\n${out}`);
    assert.ok(out.includes('verify a completed objective'), `missing verify hint:\n${out}`);
  });

  test('multi-match: instructs Claude to confirm with user', () => {
    const out = renderDirective(multiMatch, 'Build the dashboard and verify the work');
    assert.ok(/confirm.*user/i.test(out), `missing "confirm with the user":\n${out}`);
  });

  test('multi-match: still warns about gate-edits.js', () => {
    const out = renderDirective(multiMatch, 'Build the dashboard and verify the work');
    assert.ok(out.includes('gate-edits.js will DENY') || /Do NOT call (Edit|Write|MultiEdit)/i.test(out), `missing gate-edits warning:\n${out}`);
  });

  test('empty matches: returns empty string', () => {
    assert.equal(renderDirective([], 'anything'), '');
  });

  test('handles missing hint gracefully (existing entries have no hint)', () => {
    const out = renderDirective([{ skill: '/devflow:build', label: 'build' }], 'Build the dashboard');
    assert.ok(typeof out === 'string', 'should still return a string when hint absent');
    assert.ok(out.length > 0, 'should still render box when hint absent');
  });
});
```

Also UPDATE the existing `renderDirective — box-drawn directive` block (line 151) — currently calls `renderDirective(['/devflow:debug'])` with a string array, which will be invalid after the signature change. Update line 152:

```js
const directive = renderDirective(
  [{ skill: '/devflow:debug', label: 'debug', hint: 'fix a bug' }],
  'Fix the login bug'
);
```

Run tests:
```
node --test plugins/devflow/hooks/route-intent.test.js
```

Expect: all 10 new tests fail. Existing 7 renderDirective tests pass IF you updated line 152 correctly (they're asserting on the single-match box which still exists in the upgraded function — but the signature must accept the object form).

Commit: `test(12-disambig-echo): add renderDirective tests for enriched-match shape, triggered-by echo, multi-match disambiguation`

**Step 2 — Implement renderDirective (GREEN):**

Open `plugins/devflow/hooks/route-intent.js`. Replace the existing `renderDirective` function (lines 126-150) with a multi-branch implementation.

Approach:

```js
function extractTriggerExcerpt(prompt) {
  const trimmed = (prompt || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 45) return trimmed;
  return trimmed.slice(0, 42) + '...';
}

function renderSingleMatch(match, prompt) {
  const skillList = match.skill;
  const excerpt = extractTriggerExcerpt(prompt);
  const BOX_TOP = '╔' + '═'.repeat(70) + '╗';
  const BOX_DIV = '╠' + '═'.repeat(70) + '╣';
  const BOX_BOT = '╚' + '═'.repeat(70) + '╝';
  const L = '║';
  const pad = (s, w) => L + ' ' + padEnd(s, w) + L;
  const lines = [
    BOX_TOP,
    pad('           DEVFLOW ROUTING DIRECTIVE — OBLIGATORY', 68),
    BOX_DIV,
  ];
  if (excerpt) {
    lines.push(pad('Triggered by: "' + excerpt + '"', 68));
    lines.push(pad('', 68));
  }
  lines.push(
    pad('This is a DEVFLOW project (.planning/ exists).', 68),
    pad('Intent matched: ' + skillList, 68),
    pad('', 68),
    pad('You MUST invoke ' + skillList, 68),
    pad('via the Skill tool BEFORE editing any code.', 68),
    pad('', 68),
    pad('Do NOT call Edit, Write, or MultiEdit first.', 68),
    pad('gate-edits.js will DENY edits in ambient mode without a skill.', 68),
    pad('', 68),
    pad('If the request is out of scope (a question, tiny ad-hoc fix),', 68),
    pad('you may proceed -- but prefer /devflow:quick for <5 file changes.', 68),
    BOX_BOT,
  );
  return lines.join('\n');
}

function renderMultiMatch(matches, prompt) {
  const excerpt = extractTriggerExcerpt(prompt);
  const BOX_TOP = '╔' + '═'.repeat(70) + '╗';
  const BOX_DIV = '╠' + '═'.repeat(70) + '╣';
  const BOX_BOT = '╚' + '═'.repeat(70) + '╝';
  const L = '║';
  const pad = (s, w) => L + ' ' + padEnd(s, w) + L;
  const lines = [
    BOX_TOP,
    pad('       DEVFLOW ROUTING — MULTIPLE INTENTS MATCHED', 68),
    BOX_DIV,
  ];
  if (excerpt) {
    lines.push(pad('Triggered by: "' + excerpt + '"', 68));
    lines.push(pad('', 68));
  }
  lines.push(pad('Your prompt matched more than one routing intent:', 68));
  lines.push(pad('', 68));
  matches.forEach((m, i) => {
    const hint = m.hint ? ' — ' + m.hint : '';
    lines.push(pad('  ' + (i + 1) + '. ' + m.skill + hint, 68));
  });
  lines.push(pad('', 68));
  lines.push(pad('Confirm with the user which skill to invoke BEFORE', 68));
  lines.push(pad('editing code. Do NOT call Edit/Write/MultiEdit until', 68));
  lines.push(pad('the user picks one. gate-edits.js will DENY edits', 68));
  lines.push(pad('in ambient mode without a skill.', 68));
  lines.push(BOX_BOT);
  return lines.join('\n');
}

function renderDirective(matches, prompt = '') {
  if (!matches || matches.length === 0) return '';
  if (matches.length === 1) return renderSingleMatch(matches[0], prompt);
  return renderMultiMatch(matches, prompt);
}
```

# CRITICAL: The `pad(string, 68)` helper slices on overflow. If `m.skill + hint` exceeds 64 visible chars (the box-interior minus the leading `  N. ` prefix), it will truncate visually. That's acceptable — but pick hints in INTENT_MAP that stay short (4-6 words / ~30 chars).
# GOTCHA: The existing test at route-intent.test.js:178-187 asserts on `╔` and `╚` corner characters. Both branches (single + multi) include those corners — regression preserved.
# PATTERN: Keep the box-drawing helpers (`BOX_TOP`/`BOX_DIV`/`BOX_BOT`/`pad`) inlined per function for now. Extracting them to module scope is a refactor that's out of scope for this objective.

**Step 3 — Update `main()` to pass the prompt:**

In `route-intent.js`, find the `main()` function (lines 152-172). Update the renderDirective call (line 168) to pass the prompt:

```js
function main() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  const prompt = (input.prompt || '').trim();
  if (!prompt) return;

  if (!findPlanningDir(process.cwd())) return;

  const matches = matchIntent(prompt);  // now returns Array<{ skill, label, hint }>
  if (matches.length === 0) return;

  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: renderDirective(matches, prompt),  // pass prompt for echo
    },
  };
  process.stdout.write(JSON.stringify(out));
}
```

**Step 4 — Run tests (expect GREEN):**

```
node --test plugins/devflow/hooks/route-intent.test.js
```

Expect: all 10 new disambiguation/echo tests pass. All 7 existing renderDirective tests pass (single-match path still produces OBLIGATORY/DEVFLOW/gate-edits/box corners). All FIRE/NO_FIRE fixtures still pass. Subprocess e2e tests at lines 209-238 still pass.

The subprocess e2e test at line 213 expects `additionalContext.includes('/devflow:debug')` and `.includes('OBLIGATORY')` — both still satisfied by the new single-match output.

The new single-match output will ALSO include `Triggered by: "Fix the login bug"` — that's additive, not a regression.

Run the whole repo suite to be safe:
```
node --test
```

If any df-tools test regresses, it's almost certainly because route-intent.js's new behavior leaked somewhere unexpected. Investigate, but expected: no regression.

**Step 5 — Manual smoke (per task verification):**

From a temp directory with `.planning/`:
```
mkdir -p /tmp/df-smoke/.planning && cd /tmp/df-smoke
echo '{"prompt":"ship it for the auth flow"}' | node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/route-intent.js | python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["hookSpecificOutput"]["additionalContext"])'
```

Expect: box-drawn directive with `/devflow:build`, `Triggered by: "ship it for the auth flow"`, and `OBLIGATORY`.

Then test multi-match:
```
echo '{"prompt":"Build the dashboard and verify the work"}' | node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/route-intent.js | python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["hookSpecificOutput"]["additionalContext"])'
```

Expect: `MULTIPLE INTENTS MATCHED` banner, numbered list with build + verify, "Confirm with the user" line.

Clean up: `rm -rf /tmp/df-smoke`

Commit: `feat(12-disambig-echo): renderDirective handles enriched matches with triggered-by echo and multi-match disambiguation`

  </action>
  <verify>
    `node --test plugins/devflow/hooks/route-intent.test.js` — all green, including 10 new disambiguation/echo tests and 7 preserved single-match regression tests. `node --test` for the whole repo — still green. Manual smoke from Step 5 produces expected output for both single-match (with "Triggered by:") and multi-match (with "MULTIPLE INTENTS MATCHED") cases.
  </verify>
  <done>
    `renderDirective` accepts `Array<{skill, label, hint}>` + optional `prompt` string. Single-match output includes `Triggered by: "<excerpt>"` line near the top. Multi-match output uses a distinct box with `MULTIPLE INTENTS MATCHED` banner, numbered list (`1. <skill> — <hint>`, `2. <skill> — <hint>`), and "Confirm with the user" instruction. `main()` passes the prompt through. Empty matches still produce empty string (no regression). Two atomic commits exist: `test:` then `feat:` for this task.
  </done>
  <recovery>
    If the existing renderDirective test at line 152 still fails after updating it to use the object form, double-check that the new renderDirective's single-match path still includes all 7 substrings the old tests check for: `OBLIGATORY`, `DEVFLOW`, `gate-edits.js will DENY`, `/devflow:debug`, `╔`, `╚`, and a newline. The pad/box logic is preserved — fix the test invocation, not the implementation.
    If the multi-match box overflows the 70-column width because a skill+hint combo is too long, shorten the hint in INTENT_MAP (4-6 words max). Don't widen the box — other consumers may rely on the column width.
    If "Triggered by:" overflows on long prompts, verify extractTriggerExcerpt is truncating at 42 chars. Re-test with the longest fixture prompt: "Tackle this small change in the auth flow" (41 chars — fits without truncation).
    If subprocess e2e tests fail with "Cannot read property 'skill' of undefined", main() didn't get updated — confirm line 168 calls `renderDirective(matches, prompt)` with the enriched array, not the old `[...new Set(...)]` skill-string array.
  </recovery>
</task>

<verification>

After both tasks complete, verify objective-level success:

1. **Test suite green:**
   ```
   node --test plugins/devflow/hooks/route-intent.test.js
   node --test
   ```
   Both must pass. Count assertions: pre-objective baseline ~30 in route-intent.test.js; post-objective expect ~71 (30 baseline + ~31 fixture-driven + 10 disambiguation/echo).

2. **Manual smoke — single match:**
   ```
   mkdir -p /tmp/df-route-smoke/.planning && cd /tmp/df-route-smoke
   echo '{"prompt":"what'\''s next"}' | node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/route-intent.js
   ```
   Expect: JSON output, `additionalContext` includes `/devflow:status` + `Triggered by: "what's next"` + `OBLIGATORY`.

3. **Manual smoke — multi match:**
   ```
   echo '{"prompt":"ship it and verify the work"}' | node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/route-intent.js
   ```
   Expect: JSON output, `additionalContext` includes `MULTIPLE INTENTS MATCHED`, numbered list with `1. /devflow:build` and `2. /devflow:verify-work`, "Confirm with the user".

4. **Manual smoke — interrogative still skipped:**
   ```
   echo '{"prompt":"Why is the login broken?"}' | node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/route-intent.js
   ```
   Expect: empty stdout (Q&A skip-rule fired before INTENT_MAP scan).

5. **Cleanup:**
   ```
   rm -rf /tmp/df-route-smoke
   cd -
   ```

6. **Commit hygiene:**
   `git log --oneline -8` should show 4 commits from this objective in order:
   - `test(12-broader-lexicon): add fire + no-fire fixtures...`
   - `feat(12-broader-lexicon): extend INTENT_MAP with natural-phrasing entries...`
   - `test(12-disambig-echo): add renderDirective tests...`
   - `feat(12-disambig-echo): renderDirective handles enriched matches...`

</verification>

<success_criteria>

- [ ] All 11 existing INTENT_MAP entries unchanged (verify via `git diff plugins/devflow/hooks/route-intent.js` — additions only, no deletions in the existing array entries)
- [ ] INTENT_MAP has at least 24 total entries (11 existing + 13+ new) covering the natural phrasings listed in the Test list
- [ ] `matchIntent` returns `Array<{skill, label, hint}>` (objects, not bare strings); `hint` defaults to `''` when absent on legacy entries
- [ ] All existing FIRE_FIXTURES (13 entries from prior objectives) still pass — regression bar
- [ ] All new FIRE_FIXTURES pass (~25 entries from Task 1)
- [ ] All NO_FIRE_FIXTURES (existing 6 + new 6) pass — Q&A skip-rule effective for new patterns
- [ ] Q&A skip-rule at route-intent.js:113-114 NOT modified (`git diff` of those lines should be empty)
- [ ] Single-match renderDirective output includes "Triggered by:" with a short prompt excerpt
- [ ] Multi-match (length >= 2) renderDirective output uses a distinct disambiguation box ("MULTIPLE INTENTS MATCHED" banner, numbered list with `skill — hint`, "Confirm with the user" instruction)
- [ ] Empty-matches renderDirective returns empty string (preserved invariant)
- [ ] `node --test plugins/devflow/hooks/route-intent.test.js` green, all assertions pass
- [ ] `node --test` for the whole repo green — no fixture-shape regression in any other test file that imports `intent-fixtures.cjs`
- [ ] 4 atomic commits exist: test → feat → test → feat (per task per the playbook's "2-3 atomic commits per TDD TRD" pattern)
- [ ] Manual smoke (single match, multi match, interrogative-skipped) all produce expected output

</success_criteria>

<output>
- Updated `plugins/devflow/hooks/route-intent.js` (~70-100 LOC added: 13+ INTENT_MAP entries, renderDirective split into renderSingleMatch + renderMultiMatch + extractTriggerExcerpt helpers, matchIntent return-shape change, main() prompt pass-through)
- Updated `plugins/devflow/hooks/route-intent.test.js` (~80-100 LOC added: 10 new renderDirective tests, updated existing tests to handle object-shape matchIntent return)
- Updated `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` (~50-70 LOC added: new FIRE_FIXTURES + new NO_FIRE_FIXTURES entries, two new section comments)
- 4 atomic commits in series: test → feat (broader lexicon) → test → feat (disambig + echo)
</output>
</content>
</invoke>