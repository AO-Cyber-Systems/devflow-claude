---
objective: 15-phase-a-routing-keystone
trd: "02"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/route-intent.js
  - plugins/devflow/hooks/route-intent.test.js
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
autonomous: true
requirements:
  - A2
must_haves:
  truths:
    - "route-intent.js INTENT_MAP regex matches 10 hand-curated fire-prompts (each maps to a consolidated-skill recommendation)"
    - "route-intent.js INTENT_MAP regex does NOT match 5 hand-curated no-fire prompts (Q&A, explanation, meta-questions)"
    - "Injection text is a box-drawn directive containing 'OBLIGATORY' and 'gate-edits.js will DENY'"
    - "Injection references the consolidated skill names (e.g. /devflow:status NOT /devflow:progress)"
    - "Hook returns no output (silent) when prompt invokes a /devflow: or /df: skill explicitly"
    - "Hook returns no output when no .planning/ directory exists (non-DevFlow project)"
    - "Hook returns no output when prompt matches no INTENT_MAP entry"
    - "INTENT_MAP is exported for unit testing (test does not spawn subprocess for every fixture)"
  artifacts:
    - path: "plugins/devflow/hooks/route-intent.js"
      provides: "Tightened INTENT_MAP regexes + box-drawn directive injection + INTENT_MAP export"
      min_lines: 100
      exports: ["INTENT_MAP", "matchIntent", "renderDirective"]
    - path: "plugins/devflow/hooks/route-intent.test.js"
      provides: "10 fire / 5 no-fire fixture-driven tests + INTENT_MAP shape + subprocess e2e + box-drawn render"
      min_lines: 130
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs"
      provides: "Hand-built fire/no-fire fixture lists (10 + 5) with expected skill mapping per case"
      min_lines: 60
  key_links:
    - from: "plugins/devflow/hooks/route-intent.test.js"
      to: "plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs"
      via: "require fixture builder"
      pattern: "intent-fixtures"
    - from: "plugins/devflow/hooks/route-intent.js"
      to: "exported INTENT_MAP + matchIntent"
      via: "module.exports"
      pattern: "module\\.exports.*INTENT_MAP"
---

<objective>
Strengthen `route-intent.js` from advisory to authoritative. Three changes:
1. Tighten the INTENT_MAP regexes — require imperative or possessive form, drop bare-verb matches that fire on Q&A
2. Update mappings to consolidated skill names from Phase G (e.g. `/devflow:status` not `/devflow:progress`)
3. Replace the one-paragraph injection with a box-drawn obligatory directive that references the gate-edits DENY behavior

Purpose: A2 from issue #26. The current regex over-fires (matches `what's the bug` as bug intent) and the injection is advisory ("You MUST" without enforcement context). Both contribute to the 0% obedience baseline. This TRD drops false positives and gives the model a stronger directive.

Output: Modified `route-intent.js` with exported `INTENT_MAP` + `matchIntent` + `renderDirective` + new `intent-fixtures.cjs` extension (10 fire prompts + 5 no-fire prompts) + `route-intent.test.js` exercising the fixture suite.
</objective>

<file_tree>
plugins/devflow/
├── hooks/
│   ├── route-intent.js                                ← MODIFY (tighten regexes + new directive + exports)
│   └── route-intent.test.js                           ← CREATE
└── devflow/bin/lib/__fixtures__/
    └── intent-fixtures.cjs                            ← MODIFY (extend with fire/no-fire suite)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: hook with exported pure function (mirror gate-interactive.js)

```js
// plugins/devflow/hooks/route-intent.js (after refactor)
'use strict';

const fs = require('fs');
const path = require('path');

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

// EXPORTED for unit tests — tests call matchIntent(prompt) directly
const INTENT_MAP = [
  // ── BUILD intent: imperative + article + noun
  {
    rx: /\b(?:build|implement|ship|make|create|add)\s+(?:the|a|an|this|that|some)\s+\w+/i,
    skill: '/devflow:build',
    label: 'build',
  },
  // ── DEBUG intent: imperative + bug-noun
  {
    rx: /\b(?:fix|debug|investigate|diagnose|troubleshoot)\s+(?:the|this|that|a|an)\s+(?:bug|error|crash|failure|issue|problem|test|build|ci)\b/i,
    skill: '/devflow:debug',
    label: 'debug',
  },
  // ── PLAN intent
  {
    rx: /\b(?:plan|break\s+down|design)\s+(?:the|this|an|a|next)\s+(?:objective|feature|task|work|milestone)\b/i,
    skill: '/devflow:plan-objective',
    label: 'plan',
  },
  // ── VERIFY intent
  {
    rx: /\b(?:verify|test|validate|check)\s+(?:the\s+)?(?:work|build|objective|feature|implementation)\b/i,
    skill: '/devflow:verify-work',
    label: 'verify',
  },
  // ── STATUS intent (consolidated skill)
  {
    rx: /\b(?:what'?s?\s+(?:our|the)\s+(?:progress|status))|\b(?:show|check)\s+(?:progress|status)|\bwhere\s+are\s+we\b/i,
    skill: '/devflow:status',
    label: 'status',
  },
  // ── RESUME intent (consolidated form)
  {
    rx: /\b(?:resume|continue|pick\s+up)\s+(?:the\s+)?(?:work|project|objective)\b|\bwhere\s+(?:we|I)\s+left\s+off\b/i,
    skill: '/devflow:status resume',
    label: 'resume',
  },
  // ── PAUSE intent (consolidated form)
  {
    rx: /\b(?:pause|stop)\s+(?:the\s+)?(?:work|project|for\s+(?:now|today|tonight))\b|\bsave\s+context\b/i,
    skill: '/devflow:status pause',
    label: 'pause',
  },
  // ── OBJECTIVE add intent (consolidated)
  {
    rx: /\b(?:add|create)\s+(?:an?|the)\s+objective\b/i,
    skill: '/devflow:objective add',
    label: 'objective-add',
  },
  // ── NEW PROJECT intent
  {
    rx: /\b(?:new\s+project|start\s+a\s+(?:new\s+)?project|initialize\s+(?:devflow|planning))\b/i,
    skill: '/devflow:new-project',
    label: 'new-project',
  },
  // ── RESEARCH intent
  {
    rx: /\b(?:research|investigate|explore\s+options\s+for)\s+(?:the\s+)?(?:objective|approach|library|framework)\b/i,
    skill: '/devflow:research-objective',
    label: 'research',
  },
];

function matchIntent(prompt) {
  if (!prompt || /^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  const matches = INTENT_MAP.filter(e => e.rx.test(prompt));
  return [...new Set(matches.map(m => m.skill))];
}

function renderDirective(skills) {
  const skillList = skills.join(' or ');
  // Box-drawn template — survives additionalContext channel verbatim
  return [
    '╔══════════════════════════════════════════════════════════════════════╗',
    '║                  DEVFLOW ROUTING DIRECTIVE — OBLIGATORY              ║',
    '╠══════════════════════════════════════════════════════════════════════╣',
    '║ This is a DevFlow project (.planning/ exists).                       ║',
    `║ The user's request matches intent: ${padEnd(skillList, 35)}║`,
    '║                                                                      ║',
    `║ You MUST invoke ${padEnd(skillList, 51)} ║`,
    '║ via the Skill tool BEFORE editing any code.                          ║',
    '║                                                                      ║',
    '║ Do NOT call Edit, Write, or MultiEdit first — gate-edits.js will     ║',
    '║ DENY direct edits in ambient mode without an active skill marker.    ║',
    '║                                                                      ║',
    '║ If the request is genuinely out of scope for DevFlow (a question,    ║',
    '║ a tiny ad-hoc fix), you may proceed — but prefer /devflow:quick      ║',
    '║ for any code change touching <5 files.                               ║',
    '╚══════════════════════════════════════════════════════════════════════╝',
  ].join('\n');
}

function padEnd(s, width) {
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

function main() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  const prompt = (input.prompt || '').trim();
  if (!prompt) return;

  if (!findPlanningDir(process.cwd())) return;  // not a DevFlow project

  const skills = matchIntent(prompt);
  if (skills.length === 0) return;

  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: renderDirective(skills),
    },
  };
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) main();

module.exports = { INTENT_MAP, matchIntent, renderDirective, findPlanningDir };
```

### Pattern: factory-builder fixture extension (mirror existing intent-fixtures.cjs)

```js
// plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs (extend existing)
'use strict';

// ─── Existing exports (preserve) ─────────────────────────────────────────────
// (read the existing file before editing — DO NOT REPLACE existing factories)

// ─── A2 fire fixtures (10) ───────────────────────────────────────────────────
// Each entry: { prompt, expected_skill, label, why_fires }

const FIRE_FIXTURES = [
  { prompt: 'Fix the login bug',
    expected_skill: '/devflow:debug',
    label: 'imperative + bug noun',
    why_fires: 'matches debug rule: fix + the + bug' },
  { prompt: 'Build the dashboard feature',
    expected_skill: '/devflow:build',
    label: 'imperative + article + noun',
    why_fires: 'matches build rule: build + the + dashboard' },
  { prompt: 'Plan the next objective',
    expected_skill: '/devflow:plan-objective',
    label: 'plan + the + objective',
    why_fires: 'matches plan rule' },
  { prompt: 'Verify the work I just shipped',
    expected_skill: '/devflow:verify-work',
    label: 'verify + work',
    why_fires: 'matches verify rule' },
  { prompt: "What's our progress?",
    expected_skill: '/devflow:status',
    label: 'what is our progress',
    why_fires: 'matches status rule (specific phrase)' },
  { prompt: 'Resume the work',
    expected_skill: '/devflow:status resume',
    label: 'resume + work',
    why_fires: 'matches resume rule (consolidated /devflow:status resume)' },
  { prompt: 'Pause the work for tonight',
    expected_skill: '/devflow:status pause',
    label: 'pause + work',
    why_fires: 'matches pause rule (consolidated /devflow:status pause)' },
  { prompt: 'Debug the crash in the worker',
    expected_skill: '/devflow:debug',
    label: 'debug + the + crash',
    why_fires: 'matches debug rule with crash noun' },
  { prompt: 'Add an objective for the new auth flow',
    expected_skill: '/devflow:objective add',
    label: 'add + an + objective',
    why_fires: 'matches objective-add rule (consolidated)' },
  { prompt: 'Investigate the failure in CI',
    expected_skill: '/devflow:debug',
    label: 'investigate + the + failure',
    why_fires: 'matches debug rule with failure noun' },
];

// ─── A2 no-fire fixtures (5) ─────────────────────────────────────────────────

const NO_FIRE_FIXTURES = [
  { prompt: "What's the bug in the login code?",
    label: 'Q&A about a bug',
    why_no_fire: 'starts with What\'s — interrogative, not imperative' },
  { prompt: 'Why is this failing?',
    label: 'Q&A about failure',
    why_no_fire: 'starts with Why — interrogative' },
  { prompt: 'Can you explain how the auth flow works?',
    label: 'explanation request',
    why_no_fire: 'no imperative verb against a project noun' },
  { prompt: 'Continue reading the spec',
    label: 'continue + reading (not work)',
    why_no_fire: 'continue is not followed by "the work"' },
  { prompt: 'What does fix mean here?',
    label: 'meta-question about a verb',
    why_no_fire: 'fix appears but inside a meta-question, no object' },
];

module.exports = {
  // Preserve existing exports — append, don't replace
  // ...existingExports,
  FIRE_FIXTURES, NO_FIRE_FIXTURES,
};
```

### Pattern: fixture-driven test (mirror gate-interactive.test.js cases)

```js
// route-intent.test.js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { INTENT_MAP, matchIntent, renderDirective } = require('./route-intent.js');
const { FIRE_FIXTURES, NO_FIRE_FIXTURES } = require('../devflow/bin/lib/__fixtures__/intent-fixtures.cjs');

describe('matchIntent — 10 fire fixtures', () => {
  for (const f of FIRE_FIXTURES) {
    test(`fires on "${f.prompt}" → ${f.expected_skill}`, () => {
      const skills = matchIntent(f.prompt);
      assert.ok(skills.length > 0, `expected ≥1 match, got: ${JSON.stringify(skills)}`);
      assert.ok(skills.includes(f.expected_skill),
        `expected ${f.expected_skill} in ${JSON.stringify(skills)} (label: ${f.label})`);
    });
  }
});

describe('matchIntent — 5 no-fire fixtures', () => {
  for (const f of NO_FIRE_FIXTURES) {
    test(`does NOT fire on "${f.prompt}"`, () => {
      const skills = matchIntent(f.prompt);
      assert.equal(skills.length, 0,
        `expected 0 matches, got: ${JSON.stringify(skills)} (why_no_fire: ${f.why_no_fire})`);
    });
  }
});

describe('matchIntent — skill prefix exclusion', () => {
  test('returns [] when prompt starts with /devflow:', () => {
    assert.deepEqual(matchIntent('/devflow:build login feature'), []);
  });
  test('returns [] when prompt starts with /df:', () => {
    assert.deepEqual(matchIntent('/df:plan-objective the next thing'), []);
  });
});
```

</codebase_examples>

<anti_patterns>

- **Do NOT use `\b(verb1|verb2)\b` alone.** This was the v1.1 mistake: matches `bug` in `what's the bug` (Q&A). Always require an article + noun OR a possessive form.
- **Do NOT include lookbehinds** in the regex. Some Node versions support them but performance varies. Use article-noun pattern matching directly.
- **Do NOT remove the `/^\s*\/(devflow:|df:)/i` skill-prefix check.** This is the safety mechanism that prevents the hook firing when the user explicitly invoked a skill.
- **Do NOT replace the existing intent-fixtures.cjs file.** It already has factories from earlier objectives. Read first, append `FIRE_FIXTURES` + `NO_FIRE_FIXTURES`, preserve existing exports in `module.exports`.
- **Do NOT hard-code skill names from pre-Phase-G.** `/devflow:progress` → `/devflow:status`. `/devflow:resume-work` → `/devflow:status resume`. `/devflow:pause-work` → `/devflow:status pause`. Test against consolidated names only.
- **Do NOT commit a regex that's so loose it fires on the no-fire fixtures.** RED phase MUST verify each no-fire fixture rejects BEFORE the GREEN phase tightens. If GREEN-phase regex passes a no-fire fixture, the regex is wrong — narrow it.

</anti_patterns>

<error_recovery>

- **Regex doesn't match a fire fixture:** read the regex word-by-word against the prompt. Common cause: missing word boundary `\b`, or `\s+` should be `\s+` (already), or article list missing the article in the prompt (e.g. fixture says `"some new feature"` but rule only allows `the|a|an|this|that`). Add `some` to the alternation if needed.
- **Regex matches a no-fire fixture:** the fixture is a Q&A starting with `What's` or `Why`. The rule fires because it lacks anchoring. Add a negative pre-check: `if (/^(?:what|why|how|can|could|would|should|is|are)\b/i.test(prompt)) return [];` BEFORE iterating INTENT_MAP. This is a pragmatic Q&A skip-rule.
- **Box-drawn directive renders mangled in test snapshot:** the `padEnd` helper width must match the box width (70 chars between `║`). Adjust the constant and re-run the snapshot test.
- **`module.exports` test fails:** the existing route-intent.js doesn't export anything. Add `module.exports = { INTENT_MAP, matchIntent, renderDirective, findPlanningDir };` at the END of the file. The `if (require.main === module) main();` guard ensures `main()` only runs when executed directly, not when required by tests.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/15-phase-a-routing-keystone/15-CONTEXT.md
@.planning/objectives/15-phase-a-routing-keystone/15-RESEARCH.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md

@plugins/devflow/hooks/route-intent.js
@plugins/devflow/hooks/gate-interactive.js
@plugins/devflow/hooks/gate-interactive.test.js
@plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
</context>

<research_context>

## Locked regex patterns (from 15-RESEARCH.md "Tightened regex rules")

See codebase_examples block above for the exact INTENT_MAP. Key invariants:
- Each rule requires: imperative verb + (article OR possessive) + project noun
- `/devflow:status` replaces `/devflow:progress` (Phase G consolidation)
- `/devflow:status resume` replaces `/devflow:resume-work`
- `/devflow:status pause` replaces `/devflow:pause-work`
- `/devflow:objective add` replaces `/devflow:add-objective`

## Locked fire fixtures (10) and no-fire fixtures (5)

See codebase_examples block above. These are the EXACT prompts the test asserts. Do NOT add or remove fixtures without updating this TRD's must_haves.

## Locked box-drawn directive

See codebase_examples block above. The directive is 14 lines of box-drawn ASCII. The `<skill-list>` placeholder is filled per-prompt. The directive mentions:
- "OBLIGATORY"
- "DEVFLOW project detected"
- "You MUST invoke <skill> via the Skill tool"
- "Do NOT call Edit, Write, or MultiEdit first"
- "gate-edits.js will DENY"
- "/devflow:quick for any code change touching <5 files"

</research_context>

<gotchas>

- **Existing intent-fixtures.cjs has prior content.** Read the file first via `cat`. Append the FIRE/NO_FIRE constants — do not delete prior factories.
- **Node native test runner does not support fixture parametrization decorators.** Use `for (const f of FIXTURES) { test(\`name $\{f.label\}\`, () => ...) }` pattern. Each fixture becomes a named test case.
- **`route-intent.js` currently has NO exports.** Adding `module.exports` at the end is the breaking change. Verify by `grep "module.exports" plugins/devflow/hooks/route-intent.js` before/after.
- **`if (require.main === module) main();` guard is mandatory.** Without it, requiring the hook from tests will execute `main()` (which reads stdin, blocks, hangs the test). Always wrap.
- **The injection survives newlines.** `additionalContext` is plain text; `\n` characters are preserved. The box-drawn art will render in the model's context as-is.
- **Subprocess test must NOT use real stdin.** Use `spawnSync(node, [HOOK_PATH], { input: JSON.stringify({prompt: '...'}), cwd: tmpProject })`. The `input` option provides stdin.
- **CWD must have `.planning/` for the hook to fire in subprocess tests.** Use the `mkAmbientTmpProject` helper from 15-01's fixtures (require it via relative path) OR mkdtemp+mkdir inline.

</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD INTENT_MAP regex tightening + fixture suite</name>
  <files>
    plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs,
    plugins/devflow/hooks/route-intent.js,
    plugins/devflow/hooks/route-intent.test.js
  </files>
  <action>
RED → GREEN → REFACTOR for the regex tightening + fixture suite.

**Habit 2 — test list FIRST:**

Test list (build BEFORE writing the regex):

Pure-function tests (require the hook module):
1. `INTENT_MAP` exported as array of `{rx, skill, label}` objects
2. `INTENT_MAP` length matches expected (10-12 rules — one per major intent)
3. `INTENT_MAP` contains a rule mapping to each consolidated skill: build, debug, plan-objective, verify-work, status, status resume, status pause, objective add, new-project, research-objective
4. `INTENT_MAP` does NOT contain `/devflow:progress`, `/devflow:resume-work`, `/devflow:pause-work`, `/devflow:add-objective` (post-Phase-G consolidated names only)

`matchIntent` fixture-driven tests:
5-14. **10 FIRE fixtures** — each prompt matches its expected skill (loop over FIRE_FIXTURES)
15-19. **5 NO_FIRE fixtures** — each prompt produces empty array (loop over NO_FIRE_FIXTURES)

Skill-prefix exclusion:
20. Prompt starting with `/devflow:` returns `[]`
21. Prompt starting with `/df:` returns `[]`

`renderDirective` shape tests:
22. Returns string containing `'OBLIGATORY'`
23. Returns string containing `'DEVFLOW'`
24. Returns string containing `'gate-edits.js will DENY'`
25. Returns string containing the passed-in skill name(s)
26. Returns multi-line string with box-drawn `╔` + `╚` characters

Subprocess e2e tests (only 2 — keep subprocess overhead low):
27. Hook on ambient tmpdir with `prompt: 'Fix the login bug'` → JSON output with `additionalContext` containing `/devflow:debug` AND `OBLIGATORY`
28. Hook on tmpdir without `.planning/` with same prompt → empty stdout

**Habit 4 — fixtures first:**

1. **READ** existing `lib/__fixtures__/intent-fixtures.cjs` (do not assume content). Verify what exports already exist.
2. **APPEND** `FIRE_FIXTURES` (10 entries) + `NO_FIRE_FIXTURES` (5 entries) per the exact prompts in the codebase_examples block. Do NOT modify existing exports — extend `module.exports` with new fields.

**Habit 5 — outside-in:**

OUTER test (subprocess hook end-to-end) → INNER tests (matchIntent / renderDirective pure functions). The inner tests are most of the suite (~25 of 28); the subprocess tests are 2-3 e2e cases.

**Habit 3 — one test at a time:**

RED commit: write fixtures + ALL test cases (they all fail because route-intent.js doesn't export anything yet)
GREEN commit: refactor route-intent.js to export INTENT_MAP/matchIntent/renderDirective with TIGHTENED regexes
REFACTOR (optional): extract Q&A skip-rule into a helper if used in multiple places

Critical: The Q&A skip-rule (`if /^(?:what|why|how|can|could|would|should|is|are)\b/i.test(prompt)`) MUST be added if any no-fire fixture leaks through the regex. Test-driven design — let the failing no-fire test drive the addition.

# CRITICAL: 15 fixtures from RESEARCH are LOCKED. Do not invent new ones. Do not skip any.
# GOTCHA: existing intent-fixtures.cjs already has factories. cat the file FIRST, append, don't replace.
# PATTERN: gate-interactive.test.js for fixture-loop pattern + INTERACTIVE_PATTERNS shape assertion.

Commits:
- `test(15-02): add 10 fire / 5 no-fire intent fixtures + failing route-intent tests`
- `feat(15-02): tighten route-intent regex + box-drawn directive + exports`
- (REFACTOR optional) `refactor(15-02): extract Q&A skip-rule helper`
  </action>
  <verify>
# Run the test suite for this hook
node --test plugins/devflow/hooks/route-intent.test.js
# Must pass all 28+ test cases.

# Verify INTENT_MAP shape
node -e "
  const { INTENT_MAP, matchIntent } = require('./plugins/devflow/hooks/route-intent.js');
  console.log('INTENT_MAP length:', INTENT_MAP.length);
  console.log('Skills:', [...new Set(INTENT_MAP.map(e => e.skill))].sort());
  console.log('matchIntent(Fix the login bug):', matchIntent('Fix the login bug'));
  console.log('matchIntent(What is the bug):', matchIntent('What is the bug?'));
  console.log('matchIntent(/devflow:build x):', matchIntent('/devflow:build x'));
"
# Expected:
#   INTENT_MAP length: 10  (or 11/12 if you split rules — must be ≥10)
#   Skills: includes /devflow:debug, /devflow:status, /devflow:status resume, /devflow:status pause, /devflow:objective add, etc.
#   matchIntent(Fix the login bug): [ '/devflow:debug' ]
#   matchIntent(What is the bug): []
#   matchIntent(/devflow:build x): []

# Verify NO references to deprecated skill names
grep -E "/devflow:(progress|resume-work|pause-work|add-objective|check-todos|new-milestone|audit-milestone)" plugins/devflow/hooks/route-intent.js
# Expected: NO MATCHES (exit 1 from grep). If any line matches, the regex still references pre-Phase-G names.
  </verify>
  <done>
- 3 files modified/created (route-intent.js, route-intent.test.js, intent-fixtures.cjs)
- 28+ tests pass: 10 fire + 5 no-fire + 4 INTENT_MAP shape + 5 renderDirective + 2 subprocess + 2 skill-prefix
- INTENT_MAP exports correctly; route-intent.js can be required without running main()
- All consolidated skill names from Phase G referenced; zero deprecated names
- Box-drawn directive contains required substrings
- 2-3 atomic commits per RED-GREEN-REFACTOR
  </done>
  <recovery>
If the regex changes break an existing test elsewhere in the repo: identify the test (`grep -r "route-intent\|INTENT_MAP" --include="*.test.*"`), update its assertion to match new shape. Likely candidate: none today (route-intent.js has no existing test).

If the no-fire fixtures still match because of regex looseness: add the Q&A skip-rule at the top of `matchIntent`:
```js
function matchIntent(prompt) {
  if (!prompt) return [];
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  if (/^\s*(?:what|why|how|can|could|would|should|is|are|does|did|do)\b/i.test(prompt)) return [];
  // ...
}
```
This is a pragmatic safety net; the regex tightening should be the primary fix.

If `intent-fixtures.cjs` already has `FIRE_FIXTURES` / `NO_FIRE_FIXTURES` from a previous task: rename to `A2_FIRE_FIXTURES` / `A2_NO_FIRE_FIXTURES` to disambiguate, and update test imports accordingly.

If subprocess test hangs: the `input` option to `spawnSync` is mandatory — if missing, the hook reads from a closed stdin and may hang on some Node versions. Always pass `input: '{}'` or `input: JSON.stringify({prompt:...})`.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test>node --test plugins/devflow/hooks/route-intent.test.js</test>
<lint>grep -E "/devflow:(progress|resume-work|pause-work|add-objective|check-todos|new-milestone|audit-milestone)" plugins/devflow/hooks/route-intent.js && exit 1 || exit 0</lint>
</validation_gates>

<verification>
Acceptance criterion from #26 (this TRD covers A2):
- [ ] `route-intent.js` regex passes 10 fixture prompts, fails 5 false-positives — Task 1 tests 5-19
- [ ] Pre-existing 1551 tests still pass

Truth coverage:
- Truth #1 (10 fire prompts match expected skills): Task 1 tests 5-14
- Truth #2 (5 no-fire prompts produce no match): Task 1 tests 15-19
- Truth #3 (box-drawn directive contains OBLIGATORY + DENY): Task 1 tests 22-24
- Truth #4 (consolidated skill names only): Task 1 tests 3-4 + lint grep
- Truth #5 (skill-prefix exclusion): Task 1 tests 20-21
- Truth #6 (no .planning → no output): Task 1 test 28
- Truth #7 (no match → no output): implicit from `matchIntent.length === 0` short-circuit
- Truth #8 (INTENT_MAP exported): Task 1 test 1
</verification>

<success_criteria>
- 3 files modified, all in `files_modified` frontmatter list
- 28+ new tests pass
- `npm test` full suite: 1551 + ~28 = ~1579 total
- 2-3 atomic commits per RED-GREEN-REFACTOR
- Lint check (no deprecated skill names) passes
- SUMMARY.md captures: test counts, commit hashes, before/after regex diffs, sample box-drawn directive output
</success_criteria>

<output>
After completion, create `.planning/objectives/15-phase-a-routing-keystone/15-02-SUMMARY.md`
</output>
