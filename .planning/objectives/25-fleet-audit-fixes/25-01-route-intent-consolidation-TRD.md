---
objective: 25-fleet-audit-fixes
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/route-intent.js
  - plugins/devflow/hooks/route-intent.test.js
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
autonomous: true
requirements: []   # ad-hoc audit objective — roadmap Objective 25 success criteria are the contract (SC-1, SC-2, SC-3 router half)

must_haves:
  truths:
    - "matchIntent('make a new milestone') returns skill '/devflow:milestone new' — a consolidated skill that exists on disk"
    - "matchIntent('any todos') returns '/devflow:todo list'; matchIntent('audit the milestone') returns '/devflow:milestone audit'"
    - "matchIntent('check the build'), matchIntent('test the feature'), matchIntent('check the work') all return [] — generic dev speech no longer routes to verify-work"
    - "matchIntent('verify the work') and matchIntent('verify this objective') still route to '/devflow:verify-work'"
    - "Realistic broadened phrasings route to /devflow:gh-sync, /devflow:discuss-objective, /devflow:milestone new, /devflow:todo list"
    - "npm test passes with zero route-intent failures; INTENT_MAP contains zero phantom skill names"
  artifacts:
    - "plugins/devflow/hooks/route-intent.js — 4 phantom names corrected, VERIFY rule tightened, 4 adoption rules broadened"
    - "plugins/devflow/hooks/route-intent.test.js — shape test + deprecated-name test updated"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs — FIRE/NO_FIRE fixtures moved in lockstep"
  key_links:
    - "route-intent.test.js imports { INTENT_MAP, matchIntent, renderDirective } from ./route-intent.js — these exports must remain"
    - "route-intent.test.js imports { FIRE_FIXTURES, NO_FIRE_FIXTURES } from intent-fixtures.cjs — fixtures MUST change in lockstep with INTENT_MAP or the fixture loop fails"
---

<objective>
Fix the three route-intent.js defects from the 2026-07-22 fleet audit: (1) four INTENT_MAP entries route to phantom pre-consolidation skill names that no longer exist; (2) the VERIFY rule is a 4-verb × 5-noun combinatorial match that fired 15× and was followed 0× (audit's widest gap: verify-work 0/8 sessions); (3) the milestone/todo/gh-sync/discuss-objective adoption rules matched zero prompts in two months because trigger phrases are too narrow.

Purpose: audit items 1, 5, and 6b (router half). Roadmap SC: "route-intent.js references only skills that exist post-Phase-G; unit tests cover the corrected names", "verify-work rule fires only on explicit objective-verification intent", "milestone/todo/gh-sync/discuss-objective have realistic router rules".
Output: corrected + broadened INTENT_MAP, updated tests + fixtures, all committed atomically in devflow-claude.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Current phantom entries (exact, verified 2026-07-22):

```js
// route-intent.js line 147:  skill: '/devflow:new-milestone',   → fix to '/devflow:milestone new'
// route-intent.js line 203:  skill: '/devflow:add-todo',        → fix to '/devflow:todo add'
// route-intent.js line 210:  skill: '/devflow:check-todos',     → fix to '/devflow:todo list'
// route-intent.js line 231:  skill: '/devflow:audit-milestone', → fix to '/devflow:milestone audit'
```

Current noisy VERIFY rule (route-intent.js lines 96-101):
```js
{
  rx: /\b(?:verify|test|validate|check)\s+(?:the\s+)?(?:work|build|objective|feature|implementation)\b/i,
  skill: '/devflow:verify-work',
  label: 'verify',
},
```

Current too-narrow adoption rules:
```js
// line ~146 NEW-MILESTONE: /\b(?:make|create|start)\s+a\s+new\s+milestone\b/i
// line ~209 CHECK-TODOS:   /\b(?:any\s+todos|check\s+(?:this|the|my)\s+todos?)\b/i
// line ~237 GH-SYNC:       /\b(?:sync|push)\s+to\s+github\b/i
// line ~244 DISCUSS:       /\bdiscuss\s+(?:the|this)\s+objective\b/i
```

Fixture entry shape (intent-fixtures.cjs — FIRE_FIXTURES entries around lines 349, 466-522 assert the phantom names):
```js
{ prompt: 'audit the milestone', expected_skill: '/devflow:audit-milestone', label: '...', why_fires: '...' },
```

Shape test (route-intent.test.js line 58) lists required consolidated skills; deprecated-name test at line 82 lists names that must NOT appear. Fixture loop asserts `skills.includes(f.expected_skill)` (membership, not first-match), and NO_FIRE asserts `matches.length === 0`.
</codebase_examples>

<anti_patterns>
- Do NOT change fixture files without the matching INTENT_MAP change in the same commit pair — route-intent.test.js consumes intent-fixtures.cjs directly and fails on any drift.
- Do NOT reorder INTENT_MAP entries carelessly: the NEW-MILESTONE rule must stay BEFORE the build rule (documented comment at line 143-144 — filter-first-match order lets milestone win for "make a new milestone").
- Do NOT touch the narrower VERIFY extension rule at lines 214-220 (`/\bverify\s+(?:this|the\s+current)\s+objective\b/i`) — it is possessive/specific and not the noisy one.
- Do NOT invent test prompts from thin air — fixture prompts must be hand-authored realistic phrasings (no_llm_test_data constraint); base them on the audit-evidence phrasing in 25-CONTEXT.md / 25-RESEARCH.md.
</anti_patterns>

<error_recovery>
- If a broadened rule accidentally matches an existing NO_FIRE fixture (e.g. 'should I sync to github' is protected by the Q&A interrogative skip — starts with "should"), run `node --test plugins/devflow/hooks/route-intent.test.js` and narrow the regex until all NO_FIRE fixtures are green again.
- If dedupe behavior surprises you (two rules now both emit '/devflow:todo add' after the line-203 fix), that is expected — matchIntent returns a deduplicated array; identical skills collapse.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/25-fleet-audit-fixes/25-CONTEXT.md
@.planning/objectives/25-fleet-audit-fixes/25-RESEARCH.md
@plugins/devflow/hooks/route-intent.js
@plugins/devflow/hooks/route-intent.test.js
@plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
</context>

<research_context>
- LOCKED decision 5 (exact renames): new-milestone → `milestone new`, add-todo → `todo add`, check-todos → `todo list`, audit-milestone → `milestone audit`. Consolidated skills confirmed on disk: `skills/milestone/SKILL.md` routes new|audit|complete|gaps; `skills/todo/SKILL.md` routes add|list.
- LOCKED decision 2: drive adoption of exactly four skills — milestone, todo, gh-sync, discuss-objective — via realistic router rules. Exact regex wording is Claude's discretion, but must be evidenced by real phrasing (audit note: "sync to github", "discuss the objective", "what'd I miss" were too narrow and matched zero prompts in two months).
- Audit evidence for item 5: verify rule fired 15×, followed 0× (verify-work 0/8 sessions — worst follow rate in the audit). Root cause: `test|check` verbs × `work|build|feature|implementation` nouns match ordinary developer speech.
- A newer broad TODO rule already exists at line ~74 (`/\b(?:add|create)\s+(?:a\s+)?todo\b|\bremember\s+to\b/i` → '/devflow:todo add'); after the line-203 fix both todo-add rules emit the same skill and dedupe collapses them — keep both (minimal change per locked decision 5).
</research_context>

<gotchas>
- HARD CONSTRAINT: port 8080 is forbidden in every task and verification step (use 8091 if a server were ever needed — it is not for this TRD). No version bump, tag, release, or deploy.
- The FIRE fixture `{ prompt: 'check the work', expected_skill: '/devflow:verify-work', label: 'check the work (regression)' }` (intent-fixtures.cjs ~line 483) asserts the OLD noisy behavior. Task 2 must MOVE it to NO_FIRE_FIXTURES, not leave it in FIRE.
- Shape test at route-intent.test.js line 58 currently requires `/devflow:todo add` but NOT `milestone new` / `milestone audit` / `todo list` / `gh-sync` / `discuss-objective` — Task 1 and Task 3 must extend both the test name string and the `required` array.
- hooks run from `${CLAUDE_PLUGIN_ROOT}` — no `~/.claude/devflow/` mirror refresh needed for hook-only changes; `npm test` runs against the repo working tree directly.
</gotchas>

## Test list

Behavior cases (hand-authored fixtures; RED before GREEN, one task at a time):

Phantom-name correction (Task 1):
1. 'make a new milestone' → matches include `/devflow:milestone new`
2. 'audit the milestone' → matches include `/devflow:milestone audit`
3. 'add a todo for the README cleanup' → matches include `/devflow:todo add`
4. 'any todos' → matches include `/devflow:todo list`
5. Shape test: INTENT_MAP contains `/devflow:milestone new`, `/devflow:milestone audit`, `/devflow:todo list` (extend line-58 required array + test name)
6. Deprecated test: INTENT_MAP does NOT contain `/devflow:new-milestone`, `/devflow:add-todo`, `/devflow:check-todos`, `/devflow:audit-milestone` (extend line-82 deprecated array)

VERIFY tightening (Task 2):
7. 'verify the work' → matches include `/devflow:verify-work` (explicit intent still fires)
8. 'validate this feature' → matches include `/devflow:verify-work`
9. 'verify this objective' → still fires (existing fixture, unchanged — extension rule)
10. 'check the work' → [] (MOVED from FIRE to NO_FIRE)
11. 'check the build' → [] (new NO_FIRE)
12. 'test the feature' → [] (new NO_FIRE)

Adoption broadening (Task 3):
13. 'start a milestone for v2.0' → `/devflow:milestone new`
14. 'list my todos' → `/devflow:todo list`
15. 'sync the roadmap to github' → `/devflow:gh-sync`
16. 'push this to github issues' → `/devflow:gh-sync`
17. "let's talk through this objective" → `/devflow:discuss-objective`
18. 'walk me through the plan for the next objective' → `/devflow:discuss-objective`
19. Regression: all existing NO_FIRE fixtures stay green (notably 'should I sync to github' — Q&A skip)
20. Shape test: required array also contains `/devflow:gh-sync`, `/devflow:discuss-objective`

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Correct the 4 phantom skill names (INTENT_MAP + fixtures + shape/deprecated tests in lockstep)</name>
  <files>plugins/devflow/hooks/route-intent.js, plugins/devflow/hooks/route-intent.test.js, plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs</files>
  <action>
RED first: in intent-fixtures.cjs update every FIRE_FIXTURES `expected_skill` that names a phantom (`/devflow:add-todo` ~line 470, `/devflow:check-todos` ~line 476, `/devflow:audit-milestone` ~line 500, `/devflow:new-milestone` ~line 512) to the consolidated form per LOCKED decision 5. In route-intent.test.js: extend the line-58 shape test's `required` array (and its test-name string) with '/devflow:milestone new', '/devflow:milestone audit', '/devflow:todo list'; extend the line-82 deprecated-name test's array with '/devflow:new-milestone', '/devflow:add-todo', '/devflow:check-todos', '/devflow:audit-milestone'. Run tests — they must FAIL against the current INTENT_MAP. Commit RED (`test(25-01): ...`).

GREEN: in route-intent.js change exactly four `skill:` strings — line 147 → '/devflow:milestone new', line 203 → '/devflow:todo add', line 210 → '/devflow:todo list', line 231 → '/devflow:milestone audit'. Also update each entry's `label`/`hint` only if the old label text names the phantom form (labels are free text; minimal change). Do NOT reorder entries. Run tests — green. Commit GREEN (`fix(25-01): ...`).
  </action>
  <verify>node --test plugins/devflow/hooks/route-intent.test.js → all pass; grep -n "new-milestone\|add-todo\|check-todos\|audit-milestone" plugins/devflow/hooks/route-intent.js returns no `skill:` matches</verify>
  <done>INTENT_MAP routes only to skills that exist post-Phase-G; shape + deprecated tests pin the corrected names; fixtures assert consolidated forms</done>
  <recovery>If an unrelated fixture starts failing, the fixture loop caught a lockstep gap — grep intent-fixtures.cjs for the phantom name and fix the missed entry; never weaken the shape test to pass</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Tighten the VERIFY rule to explicit verification intent</name>
  <files>plugins/devflow/hooks/route-intent.js, plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs</files>
  <action>
RED first: in intent-fixtures.cjs MOVE the `'check the work'` entry from FIRE_FIXTURES to NO_FIRE_FIXTURES (why_no_fire: "check/test verbs dropped from verify rule — generic dev speech, audit item 5"). Add NO_FIRE entries for 'check the build' and 'test the feature'. Add FIRE entries for 'verify the work' and 'validate this feature' (→ '/devflow:verify-work'). Run tests — new NO_FIRE entries must FAIL against the current broad regex. Commit RED.

GREEN: replace the line-98 regex with a verbs-restricted form that keeps only explicit-verification verbs and requires an article:

  /\b(?:verify|validate)\s+(?:the|this)\s+(?:work|build|objective|feature|implementation)\b/i

Rationale (embed as a comment above the rule): audit fired 15×/followed 0×; `test|check` verbs are ordinary dev speech; `verify|validate + article` is explicit intent. The narrower extension rule at lines 214-220 stays untouched. Run tests — green. Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/hooks/route-intent.test.js → all pass, including moved/added fixtures; node -e "const {matchIntent}=require('./plugins/devflow/hooks/route-intent.js'); console.log(matchIntent('check the build').length===0 && matchIntent('verify the work').length>0)" prints true</verify>
  <done>verify-work rule fires only on explicit verification intent (verify/validate + article + noun); generic check/test phrasing returns []</done>
  <recovery>If some OTHER rule starts matching 'test the feature' (unexpected multi-match), inspect matchIntent output to find the offending rule; do not add suppression logic — adjust only the fixtures' why_no_fire or the verify regex</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Broaden adoption rules for milestone / todo list / gh-sync / discuss-objective</name>
  <files>plugins/devflow/hooks/route-intent.js, plugins/devflow/hooks/route-intent.test.js, plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs</files>
  <action>
RED first: add FIRE fixtures 13-18 from the Test list (two realistic phrasings per adoption skill, hand-authored — mirror real audit phrasing, e.g. "sync the roadmap to github", "push this to github issues", "let's talk through this objective"). Extend the shape test's required array with '/devflow:gh-sync' and '/devflow:discuss-objective'. Run — new fixtures FAIL. Commit RED.

GREEN: broaden the four rules in place (keep positions; NEW-MILESTONE must stay before build). Recommended regexes (discretion allowed if all fixtures pass):

  // MILESTONE NEW (line ~146):
  /\b(?:make|create|start|kick\s+off)\s+a\s+(?:new\s+)?milestone\b|\bnew\s+milestone\s+for\b/i
  // TODO LIST (line ~209):
  /\b(?:any\s+(?:open\s+)?todos|check\s+(?:this|the|my)\s+todos?|list\s+(?:the\s+|my\s+)?todos?|show\s+(?:me\s+)?(?:the\s+|my\s+)?todos?|what\s+todos?\s+(?:do\s+I\s+have|are\s+(?:open|left)))\b/i
  // GH-SYNC (line ~237):
  /\b(?:sync|push)\s+(?:\w+\s+){0,3}to\s+(?:github|gh)\b|\bsync\s+(?:the\s+)?(?:objectives?|issues?|roadmap|planning)\b/i
  // DISCUSS-OBJECTIVE (line ~244):
  /\b(?:discuss|talk\s+through|walk\s+me\s+through|think\s+through)\s+(?:the|this|an?)\s+(?:next\s+)?objective\b|\blet'?s\s+(?:talk|chat)\s+(?:about|through)\s+(?:the|this)\s+objective\b|\bwalk\s+me\s+through\s+the\s+plan\b/i

Verify NO_FIRE regressions still pass (Q&A skip protects 'should I sync to github'). Run full suite. Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/hooks/route-intent.test.js → all fixtures pass (fire + no-fire); npm test → no regressions elsewhere</verify>
  <done>All four adoption-target skills have realistic multi-phrasing router rules; shape test pins gh-sync + discuss-objective presence</done>
  <recovery>If a broadened regex collides with the build rule (e.g. "start a milestone" also matching build), rely on entry ordering + existing dedupe/disambig behavior — multi-match with distinct skills renders the disambig box, which is acceptable; only fix if a NO_FIRE fixture breaks</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `npm test` — full suite green (route-intent.test.js + all others; no new failures vs baseline).
2. `grep -n "skill: '/devflow:" plugins/devflow/hooks/route-intent.js | sort -u` — every skill name corresponds to a directory in plugins/devflow/skills/ (with subcommand args stripped).
3. Manual smoke: `echo '{"prompt":"sync the roadmap to github","cwd":"'$PWD'"}' | node plugins/devflow/hooks/route-intent.js` renders a directive naming /devflow:gh-sync (run from repo root; never on port 8080 — no server involved).
</verification>

<success_criteria>
- Roadmap SC-1: route-intent.js references only post-Phase-G skills; unit tests cover corrected names (shape + deprecated + fixtures).
- Roadmap SC-2: verify-work rule fires only on explicit objective-verification intent; 'check the build'/'test the feature'/'check the work' are pinned NO_FIRE.
- Roadmap SC-3 (router half): milestone/todo/gh-sync/discuss-objective have realistic, fixture-pinned rules.
</success_criteria>

<output>
After completion, create `.planning/objectives/25-fleet-audit-fixes/25-01-SUMMARY.md`
</output>
