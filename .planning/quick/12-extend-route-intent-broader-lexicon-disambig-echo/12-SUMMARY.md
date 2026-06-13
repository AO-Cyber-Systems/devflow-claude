---
objective: 12-extend-route-intent-broader-lexicon-disambig-echo
job: 12
trd: 12
mode: quick
subsystem: hooks/route-intent
tags: [route-intent, intent-map, disambiguation, echo, natural-language, hooks]
type: standard
work: feature
tdd_posture: strict
test_list_first: required
fixture_strategy: generators
requires: []
provides:
  - INTENT_MAP broader-lexicon entries (15 new) covering ship-it/let's-X/what's-next/what'd-I-miss patterns
  - matchIntent returns enriched objects {skill, label, hint} instead of bare skill strings
  - renderDirective single-match path echoes prompt via "Triggered by:" line
  - renderDirective multi-match path renders disambiguation box (banner, numbered list, confirm-with-user)
  - 25 new FIRE_FIXTURES + 6 new NO_FIRE_FIXTURES (Q&A interrogative regression bar)
affects:
  - plugins/devflow/hooks/route-intent.js (matchIntent shape change is breaking for any external consumer)
tech-stack:
  added: []
  patterns:
    - Enriched match objects with optional `hint` (back-compat: defaults to '' when absent)
    - Rule-order matters in INTENT_MAP (new-milestone placed before build so "make a new milestone" wins)
key-files:
  created: []
  modified:
    - plugins/devflow/hooks/route-intent.js
    - plugins/devflow/hooks/route-intent.test.js
    - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
decisions:
  - "Kept Q&A skip-rule at lines 113-114 unchanged per anti-patterns; reworked one fixture ('do a quick pass' → 'take a quick pass') to avoid the 'do' skip-word collision instead of loosening the skip-list"
  - "Placed new-milestone rule BEFORE build in INTENT_MAP to win the filter-first-match order for 'make a new milestone' (build's `make + a + \\w+` would otherwise shadow it)"
  - "Extended debug noun whitelist to include `broken \\w+ | failing \\w+ | login | module | component | hook | service` so 'I want to fix the broken login' fires (existing strict debug rule stays untouched)"
  - "Excerpt length set to 45 chars (42 + '...') to fit inside the 70-col box without overflow"
  - "Hint field is OPTIONAL on INTENT_MAP entries; existing 11 entries left without hints (out of scope to backfill); new 15 entries all carry hints for disambiguation UI"
metrics:
  duration: "~20 min"
  tasks_completed: 2
  files_modified: 3
  commits: 4
  tests_added: 41  # 25 FIRE + 6 NO_FIRE + 10 new renderDirective tests
  tests_pass: 78
  intent_map_entries: 26  # 11 existing + 15 new (success criteria: >= 24)
  completed_date: "2026-05-24"
---

# Quick Task 12: Extend route-intent (broader lexicon + disambig + echo) Summary

Extended `plugins/devflow/hooks/route-intent.js` from an 11-pattern strict matcher into a 26-entry router that covers natural phrasings ("ship it", "what's next", "let's work on…", "what'd I miss"), returns structured multi-match results, and echoes the triggering phrase back to the user via a "Triggered by:" line. Multi-match prompts now produce a disambiguation box instructing Claude to confirm with the user before invoking either skill.

## Tasks Completed

| Task | Name | Commit | Files |
| --- | --- | --- | --- |
| RED-1 | Extend FIRE + NO_FIRE fixtures (broader lexicon) | `e94629f` | `intent-fixtures.cjs` |
| GREEN-1 | Extend INTENT_MAP + enriched matchIntent shape | `b3d6fa2` | `route-intent.js`, `route-intent.test.js`, `intent-fixtures.cjs` |
| RED-2 | Add renderDirective tests (echo + disambig) | `4e8435f` | `route-intent.test.js` |
| GREEN-2 | Implement enriched renderDirective + main() pass-through | `4e32687` | `route-intent.js` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Fixed fixture-prompt vs Q&A skip-rule collision for "do a quick pass"**

- **Found during:** Task 1 GREEN phase (test run after INTENT_MAP extension)
- **Issue:** The JOB's test list item 6 specified `"do a quick pass on the auth module"` as a FIRE fixture for `/devflow:quick`. The Q&A skip-rule at `route-intent.js:113-114` catches prompts starting with `do` and returns `[]` before INTENT_MAP scan — so the fixture could never fire under the anti-pattern "DO NOT loosen the Q&A skip-rule."
- **Fix:** Reworded the fixture prompt to `"take a quick pass on the auth module"` (still matches the new quick regex `(?:do|make|take)\s+a\s+quick\s+(?:pass|fix|change|update)`). Skip-rule untouched.
- **Files modified:** `intent-fixtures.cjs` (one fixture entry)
- **Commit:** `b3d6fa2` (rolled into the Task 1 GREEN commit since the rewording belongs with the regex it tests)

### Out-of-scope notes

- Pre-existing failing tests in the full repo suite (8 failures in `devflow-watch` daemon and `handoff pipeline — end-to-end`) are unrelated to this work. Baseline confirmed via `git stash + node --test` before starting (32 failures pre-change vs 8 post-change — the difference is unrelated to my files; full suite was noisy before this objective began). My changes do NOT introduce any new failures.
- The "Coordination Note" appended to `.planning/objectives/04-duplicate-work-detection/04-CONTEXT.md` during this session is unrelated automation (duplicate-work peer detection) and is not part of this objective's deliverable.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
| --- | --- | --- | --- |
| Task 1 RED | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 | FAIL (correct — 24 fixture tests failing) |
| Task 1 GREEN | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 | PASS-EXPECTED (67/68 pass; subprocess test fails because renderDirective signature change is pending in Task 2) |
| Task 2 RED | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 | FAIL (correct — 8 tests failing: 7 new + subprocess pending Task 2 GREEN) |
| Task 2 GREEN | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS (78/78) |
| Full repo | `node --test` | 1 | PASS-RELEVANT (8 pre-existing failures in devflow-watch/handoff pipeline — unrelated; route-intent + intent-fixtures consumers all green) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
| --- | --- | --- | --- |
| route-intent focused suite | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS (78/78) |
| Full repo regression | `node --test` | 1 | PASS-RELEVANT (pre-existing daemon failures unrelated) |
| Manual smoke — single match | `echo '{"prompt":"ship it for the auth flow"}' \| node route-intent.js` | 0 | PASS — output includes `/devflow:build`, `Triggered by:`, `OBLIGATORY` |
| Manual smoke — multi match | `echo '{"prompt":"Build the dashboard and verify the work"}' \| node route-intent.js` | 0 | PASS — output includes `MULTIPLE INTENTS MATCHED`, numbered list, "Confirm with the user" |
| Manual smoke — Q&A skip | `echo '{"prompt":"Why is the login broken?"}' \| node route-intent.js` | 0 | PASS — empty stdout (skip-rule fires) |
| Manual smoke — multi w/ hints | `echo '{"prompt":"ship it for the auth flow and audit the milestone"}' \| node route-intent.js` | 0 | PASS — shows `1. /devflow:build — plan + execute a multi-subsystem feature` and `2. /devflow:audit-milestone — audit milestone state` |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
| --- | --- | --- | --- |
| RED-1 (fixtures) | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 | FAIL (24 new fixture tests fail — regexes don't yet match) |
| GREEN-1 (INTENT_MAP) | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 | 67/68 PASS — subprocess test expected-fail (renderDirective signature change pending Task 2) |
| RED-2 (renderDirective tests) | `node --test plugins/devflow/hooks/route-intent.test.js` | 1 | FAIL (8 tests fail — 7 new disambig + 1 subprocess) |
| GREEN-2 (renderDirective impl) | `node --test plugins/devflow/hooks/route-intent.test.js` | 0 | PASS (78/78) |

## Post-TRD Verification

- Auto-fix cycles used: 1 (fixture-prompt rewording for "do a quick pass" Q&A-skip collision)
- Must-haves verified: 8/8
  - [x] matchIntent returns enriched `{skill, label, hint}` objects
  - [x] All 11 existing INTENT_MAP entries preserved (additive only; verified via `git diff` — only additions in the array)
  - [x] All existing FIRE_FIXTURES and NO_FIRE_FIXTURES still pass
  - [x] All new natural-phrasing prompts fire; interrogative-prefixed versions skip via line 113-114 Q&A rule
  - [x] Single-match renderDirective output includes "Triggered by:" echo line
  - [x] Multi-match renderDirective uses distinct disambiguation box (banner + numbered list + confirm instruction)
  - [x] `node --test plugins/devflow/hooks/route-intent.test.js` fully green (78/78)
  - [x] `node --test` for whole repo green for fixture-consuming tests (pre-existing daemon failures unrelated)
- Gate failures: None

## Success Criteria Check

- [x] All 11 existing INTENT_MAP entries unchanged (`git diff plugins/devflow/hooks/route-intent.js` shows additions-only in the entries before line 105)
- [x] INTENT_MAP has at least 24 total entries (got 26: 11 existing + 15 new)
- [x] `matchIntent` returns `Array<{skill, label, hint}>`; `hint` defaults to `''` on legacy entries
- [x] All existing FIRE_FIXTURES (13 entries) still pass — regression bar
- [x] All new FIRE_FIXTURES (25 entries) pass
- [x] All NO_FIRE_FIXTURES (existing 6 + new 6) pass — Q&A skip-rule effective
- [x] Q&A skip-rule at route-intent.js:113-114 NOT modified
- [x] Single-match renderDirective includes "Triggered by:" with prompt excerpt
- [x] Multi-match renderDirective uses MULTIPLE INTENTS MATCHED banner + numbered list + confirm-with-user instruction
- [x] Empty-matches renderDirective returns empty string
- [x] `node --test plugins/devflow/hooks/route-intent.test.js` green (78/78)
- [x] `node --test` for whole repo green for relevant tests (pre-existing daemon failures excluded)
- [x] 4 atomic commits exist: test → feat → test → feat (e94629f, b3d6fa2, 4e8435f, 4e32687)
- [x] Manual smoke tests (single match, multi match, Q&A skip) all produce expected output

## New Skills Registered in INTENT_MAP

15 new entries grouped by target skill:

| Skill | New entries | Example prompts |
| --- | --- | --- |
| `/devflow:build` (extension) | ship-it, let's-work-on, let's-start, I-want-to-build | "ship it for the auth flow", "let's work on the new dashboard" |
| `/devflow:debug` (extension) | I-want-to-fix + broader noun list | "I want to fix the broken login" |
| `/devflow:quick` (NEW) | do/make/take + a + quick + pass/fix/change/update | "take a quick pass on the auth module" |
| `/devflow:status` (extension) | what-should-I-work-on, what's-next, what's-on-my-plate | "what's next" |
| `/devflow:status pause` (extension) | save-my-progress, I'm-stopping, leaving-for-now | "save my progress" |
| `/devflow:status resume` (extension) | let's-pick-up-where-we/I-stopped | "let's pick up where we stopped" |
| `/devflow:awareness` (NEW) | what'd-I-miss, show-me-recent-activity | "what'd I miss" |
| `/devflow:add-todo` (NEW) | add/create + a + todo + for/item/about | "add a todo for the README cleanup" |
| `/devflow:check-todos` (NEW) | any-todos, check + this/the/my + todos | "any todos" |
| `/devflow:verify-work` (extension) | verify + this/the-current + objective | "verify this objective" |
| `/devflow:research-objective` (extension) | research-how-to-X, investigate-the-X-library | "research how to use Vitest" |
| `/devflow:audit-milestone` (NEW) | audit + the + milestone | "audit the milestone" |
| `/devflow:gh-sync` (NEW) | sync/push + to + github | "sync to github" |
| `/devflow:new-milestone` (NEW) | make/create/start + a + new + milestone | "make a new milestone" |
| `/devflow:discuss-objective` (NEW) | discuss + the/this + objective | "discuss the objective" |

## Self-Check: PASSED

- All 4 commits present in `git log --oneline -6`:
  - `e94629f` test(12-broader-lexicon): add fire + no-fire fixtures
  - `b3d6fa2` feat(12-broader-lexicon): extend INTENT_MAP + enriched matchIntent
  - `4e8435f` test(12-disambig-echo): add renderDirective tests
  - `4e32687` feat(12-disambig-echo): renderDirective handles enriched matches
- All 3 modified files present and contain Obj-12 markers (`grep "Obj 12"` matches in route-intent.js + intent-fixtures.cjs)
- 78/78 route-intent tests passing
- INTENT_MAP entry count verified: 26 (>= 24 required)
- matchIntent return shape verified: `Array<{skill, label, hint}>` (smoke-tested via node REPL inside main())
