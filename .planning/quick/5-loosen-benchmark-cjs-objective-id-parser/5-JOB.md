---
type: quick
slug: 5-loosen-benchmark-cjs-objective-id-parser
tasks: 2
context_target: ~30%
---

<objective>
Loosen the `extractObjectiveId` and `canonicalize` helpers in
`plugins/devflow/devflow/bin/lib/benchmark.cjs` to recognize bare-number
objective references (e.g. "Plan Objective 18"), so `df-tools benchmark
per-objective` attributes those spawns to the right objective instead of
dropping them into the "Untagged" bucket.

Why: workflow prompt templates substitute `{objective}` with the bare number,
so real Task() spawns produce prompts like "Plan Objective 18" or
"Execute Objective 18 wave 2". The current regex at benchmark.cjs:72 requires
the `<num>-<slug>` form (e.g. `objective 18-mangomint-parity`), which never
matches those prompts. Result: per-objective rollups show $0 / "Untagged" for
active objectives despite real spend. (Item 1 from
`~/.claude/devflow-efficiency-handoff.md`.)

Output: `extractObjectiveId` returns the bare numeric id (e.g. `'18'`) for
prompts of the form "Objective <num>" when no fuller form matches; `canonicalize`
maps that bare number to `obj-<num>` via the `dirToObjMap` lookup, and falls
through to the raw bare number when the map has no entry — strictly better
than dropping into 'untagged'. All existing test cases continue to pass.
</objective>

<embedded_context>

<codebase_examples>
The current `extractObjectiveId` (benchmark.cjs:69-83) layers patterns from
most-specific to least-specific. Each pattern returns immediately on match;
order is therefore load-bearing:

```js
// benchmark.cjs:69-83 (current)
function extractObjectiveId(prompt, description) {
  const text = (prompt || '') + ' ' + (description || '');
  let m;
  m = text.match(/objective\s+(\d{1,3}-[a-z][a-z0-9-]+)/i);   // "objective 19-pty-handoff-watcher"
  if (m) return m[1];
  m = text.match(/(\d{1,3}-[a-z][a-z0-9-]+)\s+wave/i);         // "19-pty-handoff-watcher wave 2"
  if (m) return m[1];
  m = text.match(/v1\.(\d+)\s+obj\s+(\d{1,3})\b/i);            // "v1.2 obj 10"
  if (m) return `v1.${m[1]}-obj-${m[2]}`;
  m = text.match(/TRD\s+(\d{1,3})-\d{2}/i);                    // "TRD 19-01"
  if (m) return `obj-${m[1]}`;
  m = text.match(/Phase\s+([A-Z])/i);                          // "Phase E"
  if (m) return `v1.1-phase-${m[1].toUpperCase()}`;
  return 'untagged';
}
```

The current `canonicalize` (benchmark.cjs:90-99) handles three id shapes:

```js
// benchmark.cjs:90-99 (current)
function canonicalize(id, dirToObjMap = {}) {
  let m;
  m = id.match(/^v1\.\d+-obj-(\d+)$/);
  if (m) return `obj-${m[1]}`;
  m = id.match(/^obj-(\d+)$/);
  if (m) return `obj-${m[1]}`;
  m = id.match(/^(\d+)-/);                       // dir-prefix shape '19-pty-...'
  if (m && dirToObjMap[m[1]]) return dirToObjMap[m[1]];
  return id;
}
```

Existing test file uses Node native test runner with `describe`/`it` style
(benchmark.test.cjs):

```js
// benchmark.test.cjs:3-5
const { test, describe } = require('node:test');
const assert = require('node:assert');
const bm = require('./benchmark.cjs');

describe('extractObjectiveId', () => {
  test('matches "objective N-slug" pattern', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Execute plan for objective 19-pty-handoff-watcher.', ''),
      '19-pty-handoff-watcher'
    );
  });
  // ... more tests
});
```

The module exports `extractObjectiveId`, `canonicalize`, `dollars`,
`parseSince` — verified by the test file's existing `bm.canonicalize(...)`,
`bm.extractObjectiveId(...)` calls.
</codebase_examples>

<anti_patterns>
- DO NOT reorder the existing regex patterns. The bare-number fallback MUST
  come AFTER the existing `<num>-<slug>`, `wave`, `v1.x obj`, `TRD`, and
  `Phase` patterns — those are more specific and must match first when present.
- DO NOT merge the bare-number regex into the existing `objective\s+...`
  regex (line 72). Keep them as separate patterns; merging risks accidental
  capture-group changes that break existing tests.
- DO NOT touch `parseSubagentJsonl` or any JSONL-reading logic.
- DO NOT change workflow template files or any orchestrator-side
  `{objective}` substitution. The fix is parser-only.
- DO NOT delete or modify any existing test cases. New tests are additive.
- DO NOT touch any pre-existing uncommitted state in `.planning/` while
  testing the change.
- DO NOT alter the `dollars` or `parseSince` helpers — out of scope.
</anti_patterns>

<error_recovery>
The bare-number regex `/objective\s+(\d{1,3})\b/i` uses `\b` (word boundary)
to avoid greedy capture into trailing words. If a future prompt format like
"Objective 18b" appears, `\b` correctly stops at the digit run, returning
`'18'`. If the prompt is just a digit with no "objective" keyword
(e.g. "wave 2 of 18"), the pattern correctly does NOT match — bare numbers
without context would over-capture and we want them in 'untagged' rather
than misattributed.

For `canonicalize`: when `dirToObjMap[num]` is missing, returning the raw
bare number (rather than dropping to 'untagged') is intentional — at worst
the rollup buckets under "18" instead of "obj-18", which is still
informative and recoverable. The caller can post-process if a stricter
contract is needed.
</error_recovery>

</embedded_context>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── benchmark.cjs           ← MODIFY (extractObjectiveId + canonicalize)
└── benchmark.test.cjs      ← MODIFY (add ~5 new test cases, keep all existing)
</file_tree>

<task type="auto" tdd="true">
  <name>Add bare-number fallback regex to extractObjectiveId and canonicalize</name>
  <files>plugins/devflow/devflow/bin/lib/benchmark.cjs</files>
  <action>
Make two surgical edits to benchmark.cjs.

Steps:

1. **Update `extractObjectiveId` (benchmark.cjs:69-83).** Add a NEW fallback
   pattern AFTER the existing `Phase` pattern (line 80-81) but BEFORE the
   final `return 'untagged'` (line 82):

   ```js
   // INSERT between line 81 and line 82:
   m = text.match(/objective\s+(\d{1,3})\b/i);
   if (m) return m[1];
   ```

   Also update the JSDoc block above (benchmark.cjs:59-68) to document the
   new pattern. Add this line after the `"Phase E"` example, before the
   `"otherwise"` line:

   ```js
   //   - "Plan Objective 18"                → "18"
   ```

   # CRITICAL: order is load-bearing. The bare-number regex MUST be the
   #           LAST pattern before `return 'untagged'`. The existing
   #           `objective\s+(\d{1,3}-[a-z][a-z0-9-]+)` regex on line 72 has
   #           a more specific capture group (`<num>-<slug>`) and must keep
   #           matching first when the slug form is present.
   # GOTCHA:  the `\b` word boundary at the end of the new regex is
   #           required — without it, "objective 18 wave 2" could misbehave
   #           on borderline inputs. Test 2 in Task 2 pins this.
   # PATTERN: case-insensitive `i` flag matches the existing convention
   #           (every other regex in this function uses `/i`).

2. **Update `canonicalize` (benchmark.cjs:90-99).** Add a NEW case for
   bare-number ids AFTER the existing `^(\d+)-` dir-prefix case but BEFORE
   the final `return id`:

   ```js
   // INSERT between line 97 and line 98:
   m = id.match(/^(\d+)$/);
   if (m && dirToObjMap[m[1]]) return dirToObjMap[m[1]];
   ```

   # CRITICAL: when `dirToObjMap[m[1]]` is missing, fall through to
   #           `return id` (the existing line 98) — i.e. emit the raw
   #           bare number. DO NOT add a fallback that returns 'untagged';
   #           the bare number is more informative than discarding the
   #           attribution entirely.
   # GOTCHA:  the regex `^(\d+)$` is anchored on both ends to avoid
   #           accidentally matching dir-prefix ids like "19-pty-..." (the
   #           previous case at line 96 handles those).
   # PATTERN: matches the structure of the existing cases — one regex
   #           match, return mapped value when the lookup succeeds.

3. **Do not modify** any other helper, the JSONL walker, the pricing tables,
   or the CLI command surface.
  </action>
  <verify>
```bash
# Syntactic sanity: file parses
node --check plugins/devflow/devflow/bin/lib/benchmark.cjs

# Both new patterns added
grep -n 'objective\\s+(\\\\d{1,3})\\\\b' plugins/devflow/devflow/bin/lib/benchmark.cjs
# Expect: 1 hit (the new bare-number regex inside extractObjectiveId)

grep -nE '\\^\\(\\\\d\\+\\)\\$' plugins/devflow/devflow/bin/lib/benchmark.cjs
# Expect: 1 hit (the new bare-number regex inside canonicalize)

# Existing slug-form regex still present (must not be reordered or removed)
grep -n 'objective\\\\s+(\\\\d{1,3}-' plugins/devflow/devflow/bin/lib/benchmark.cjs
# Expect: 1 hit on the original line ~72
```
  </verify>
  <done>
- `extractObjectiveId` has a new bare-number fallback regex placed AFTER the
  Phase pattern and BEFORE `return 'untagged'`.
- The function's JSDoc lists the new `"Plan Objective 18" → "18"` example.
- `canonicalize` has a new bare-number case placed AFTER the `^(\d+)-`
  dir-prefix case and BEFORE `return id`.
- `node --check plugins/devflow/devflow/bin/lib/benchmark.cjs` exits 0.
- No other helpers or call sites are modified.
  </done>
  <recovery>
If `node --check` fails, the most likely cause is a stray comma or missing
semicolon around the inserted regex blocks — diff the file against git HEAD
and confirm the inserts sit cleanly between the marked lines. If the new
test in Task 2 fails on the bare-number-with-trailing-word case, confirm the
`\b` word boundary is present in the regex; without it, "objective 18 wave"
would still match (returning '18') but borderline inputs like "objective
18a" would over-capture.
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Add test cases pinning bare-number recognition</name>
  <files>plugins/devflow/devflow/bin/lib/benchmark.test.cjs</files>
  <action>
## Test list (behavior cases for this fix)

Per the user's TDD Playbook habit 2, here is the full behavior list this
task pins. All cases are additive — DO NOT delete or modify the 17
existing tests in benchmark.test.cjs.

`extractObjectiveId` cases:
1. Bare-number form in prompt: `'Plan Objective 18'`, `''` → `'18'`
2. Bare-number with trailing word: `'Plan Objective 18 wave 2'`, `''` → `'18'`
3. Bare-number in description field: `''`, `'Plan Objective 18'` → `'18'`
4. Slug form still wins over bare-number: `'objective 19-pty-handoff-watcher'`, `''` → `'19-pty-handoff-watcher'` (regression guard for ordering — the existing test at line 8 covers this but adding a redundant assertion in the new describe block makes the contract explicit)

`canonicalize` cases:
5. Bare number with dirToObjMap match: `'18', { '18': 'obj-18' }` → `'obj-18'`
6. Bare number without dirToObjMap match: `'18', {}` → `'18'` (passthrough — better than 'untagged')

## Implementation steps

1. **Locate the insertion points.** The `describe('extractObjectiveId', ...)`
   block ends at line 56 (closing `});`). The `describe('canonicalize', ...)`
   block ends at line 77.

2. **Add new test cases inside `describe('extractObjectiveId')`** before its
   closing `});` (i.e. between the existing 'uses description when prompt is
   empty' test at line 50-55 and the closing brace at line 56):

   ```js
   test('matches bare "Objective N" form (workflow template substitution)', () => {
     assert.strictEqual(
       bm.extractObjectiveId('Plan Objective 18', ''),
       '18'
     );
   });

   test('bare-number form ignores trailing words via word boundary', () => {
     assert.strictEqual(
       bm.extractObjectiveId('Plan Objective 18 wave 2', ''),
       '18'
     );
   });

   test('bare-number form works in description field', () => {
     assert.strictEqual(
       bm.extractObjectiveId('', 'Plan Objective 18'),
       '18'
     );
   });

   test('slug form still wins over bare-number when both regexes could match', () => {
     // Regression guard: ordering matters. Slug form at line 72 must beat
     // bare-number fallback for prompts that have the fuller form.
     assert.strictEqual(
       bm.extractObjectiveId('objective 19-pty-handoff-watcher', ''),
       '19-pty-handoff-watcher'
     );
   });
   ```

3. **Add new test cases inside `describe('canonicalize')`** before its
   closing `});` (i.e. between the existing 'returns unchanged when no rule
   matches' test at line 74-76 and the closing brace at line 77):

   ```js
   test('maps bare-number id via dirToObjMap when present', () => {
     assert.strictEqual(
       bm.canonicalize('18', { '18': 'obj-18' }),
       'obj-18'
     );
   });

   test('passes bare-number id through when dirToObjMap has no entry', () => {
     // Better than dropping to 'untagged' — the bare number is still
     // informative for the rollup.
     assert.strictEqual(
       bm.canonicalize('18', {}),
       '18'
     );
   });
   ```

4. **Do not touch** the `describe('dollars', ...)` or
   `describe('parseSince', ...)` blocks — those are out of scope.

# CRITICAL: per the user's TDD Playbook habit 4, all test data is hand-built
#           literal values. DO NOT introduce fixture generators, factory
#           functions, or LLM-generated test data — the existing tests use
#           inline literals and the new tests must match that convention.
# GOTCHA:  Node native test runner — confirm the existing `require('node:test')`
#           import on line 3 already covers `test` and `describe`. No new
#           imports needed.
# PATTERN: every existing test uses `assert.strictEqual` for value
#           comparison; match that style.
  </action>
  <verify>
```bash
# Run the targeted test file
cd /Users/markemerson/Source/devflow-claude && node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs

# Confirm all new tests are picked up and pass
node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs 2>&1 | grep -E 'bare|slug form still wins|# pass|# fail'

# Full suite still green (covers any cross-file regressions)
npm test
```

Expected: 6 new tests pass (4 in extractObjectiveId block, 2 in canonicalize
block), 17 existing tests still pass, total 23. `npm test` exits 0.
  </verify>
  <done>
- benchmark.test.cjs has 4 new tests inside `describe('extractObjectiveId')`
  covering bare-number prompt, bare-number with trailing word, bare-number
  in description, and slug-form-still-wins regression guard.
- benchmark.test.cjs has 2 new tests inside `describe('canonicalize')`
  covering bare-number with dirToObjMap match and bare-number passthrough.
- All 17 pre-existing tests are unmodified and still pass.
- `node --test plugins/devflow/devflow/bin/lib/benchmark.test.cjs` exits 0
  with 23 total tests reported.
- `npm test` exits 0.
  </done>
  <recovery>
If the bare-number tests fail with `'untagged'` returned, the regex insert
in Task 1 landed in the wrong spot — confirm it is INSIDE
`extractObjectiveId` and BEFORE `return 'untagged'`. If the slug-form
regression test fails (i.e. returns `'19'` instead of
`'19-pty-handoff-watcher'`), the new bare-number regex was placed BEFORE
the existing slug-form regex on line 72; move it back to the position just
before `return 'untagged'`. If `npm test` fails on an unrelated file,
that is an environmental flake, not caused by this change — re-run once;
if it persists, abandon and surface to the user.
  </recovery>
</task>

<verification>
Final acceptance:

1. **Unit:** `npm test` passes. The benchmark.test.cjs suite reports 23
   total tests (17 pre-existing + 6 new).
2. **Behavioral:** running `df-tools benchmark per-objective --since=1d`
   against a session that includes spawns whose prompts contain
   "Objective <N>" (without slug) attributes those calls to objective
   `obj-<N>` (when `dirToObjMap` has the dir mapping) or to bare `<N>`
   (when the dir mapping is missing) — not to "Untagged".
3. **No regressions:** every existing extractObjectiveId / canonicalize
   test case continues to pass with the same return value.
4. **Order preserved:** slug-form, wave, v1.x obj, TRD, and Phase regexes
   in `extractObjectiveId` still match first for inputs that contain those
   fuller forms — bare-number is strictly the last fallback before
   'untagged'.
</verification>

<success_criteria>
- [ ] benchmark.cjs `extractObjectiveId` has a new bare-number regex
      (`/objective\s+(\d{1,3})\b/i`) placed AFTER the Phase pattern and
      BEFORE `return 'untagged'`
- [ ] benchmark.cjs JSDoc lists the new `"Plan Objective 18" → "18"` example
- [ ] benchmark.cjs `canonicalize` has a new `^(\d+)$` case placed AFTER
      the dir-prefix case and BEFORE `return id`
- [ ] benchmark.test.cjs has 4 new tests in `describe('extractObjectiveId')`
- [ ] benchmark.test.cjs has 2 new tests in `describe('canonicalize')`
- [ ] All 17 pre-existing benchmark.test.cjs tests still pass
- [ ] `node --check plugins/devflow/devflow/bin/lib/benchmark.cjs` exits 0
- [ ] `npm test` exits 0
- [ ] No changes to `parseSubagentJsonl`, `dollars`, `parseSince`, pricing
      tables, or the CLI surface
</success_criteria>
