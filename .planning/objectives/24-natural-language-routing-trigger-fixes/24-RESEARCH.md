# Objective 24 — Research: Natural-Language Routing Trigger Fixes

Research source: empirical routing review run in the main session (2026-06-12).
All regex results below were produced by executing the actual hook code
(`require('./route-intent.js').matchIntent(...)`) — not inferred.

## Finding 1 — gate-edits override phrases are dead at runtime (HIGH)

`plugins/devflow/hooks/gate-edits.js:155` reads the user prompt from
`input.user_message || input.prompt`. Claude Code's PreToolUse hook payload
contains ONLY: `session_id`, `transcript_path`, `cwd`, `permission_mode`,
`hook_event_name`, `tool_name`, `tool_input`. Neither `user_message` nor
`prompt` exists → `hasOverridePhrase()` is always false at runtime → users
typing "just edit" / "skip devflow" are still denied, while the deny message
and the classify-session preamble both advertise the phrase escape.

`gate-edits.test.js` passes because every subprocess e2e case feeds a synthetic
payload that includes `user_message` (lines 245–302) — the tests encode the
wrong payload shape.

**Fix architecture (locked in CONTEXT.md):** UserPromptSubmit DOES receive
`prompt` (route-intent.js already parses it, route-intent.js:142). route-intent
writes a single-turn `.planning/.edit-override` marker when an override phrase
is present; gate-edits consumes (checks + deletes) it. TTL guard against stale
markers. Share OVERRIDE_PHRASES between hooks — single source of truth.

Alternative considered: parse the last user message from `transcript_path`
(.jsonl). Rejected — fragile coupling to transcript format, and the marker
approach keeps both hooks pure-function-testable.

## Finding 2 — flagship phrases don't fire INTENT_MAP (HIGH)

Empirical `matchIntent` results (actual code execution):

| Prompt | Result | Expected |
|---|---|---|
| "build objective 3" | [] | /devflow:build |
| "execute objective 3" | [] | /devflow:execute-objective |
| "run objective 3" | [] | /devflow:execute-objective |
| "build this" | [] | /devflow:build |
| "implement this" | [] | /devflow:build |
| "let's build" | [] | /devflow:build |
| "start building" | [] | /devflow:build |

Root cause: BUILD rule (route-intent.js:47) is
`/(?:build|implement|ship|make|create|add)\s+(?:the|a|an|this|that|some)\s+\w+/i`
— requires article THEN a trailing word. "objective" can't follow the verb
directly, and "this" at end-of-prompt has no trailing `\w+`. There is no
EXECUTE rule at all.

## Finding 3 — BUILD over-matches (MEDIUM)

| Prompt | Actual | Correct |
|---|---|---|
| "add a todo to refactor the parser" | /devflow:build | /devflow:todo add |
| "make a quick pass over the error handling" | /devflow:build | /devflow:quick |
| "add an objective for caching" | build + objective add (double) | objective add only |
| "just edit the config loader to add a retry" | /devflow:build | [] (override) |
| "skip devflow and fix the bug in the auth flow" | /devflow:debug | [] (override) |

## Finding 4 — no override-phrase suppression in matchIntent

`matchIntent` (route-intent.js:111) has skip rules for slash-commands and
interrogative openers but none for OVERRIDE_PHRASES → contradictory signals:
hook injects "OBLIGATORY routing" while the gate (once fixed) allows the edit.

## Finding 5 — build vs execute-objective SKILL.md trigger collision

Both descriptions list "build objective", "let's build", "start building"
verbatim (plugins/devflow/skills/build/SKILL.md,
plugins/devflow/skills/execute-objective/SKILL.md). Model-side routing has no
deterministic tiebreak. classify-session's table says "Multi-file feature →
build" and never mentions execute-objective.

## Finding 6 — no .skill-active suppression

route-intent.js never checks `.planning/.skill-active` (gate-edits does, line
71-74). A follow-up prompt mid-skill gets an OBLIGATORY directive injected
while an executor is already running.

## Finding 7 — coverage gaps + generic triggers

- INTENT_MAP has no rules for quick or todo, though classify-session's routing
  table advertises quick as a primary path. "small change: bump the timeout"
  and "do this: …" fire nothing.
- quick's "do this"/"tackle this" and help's bare "help" description triggers
  are generic enough to shadow other routes at the model level.

## Implementation notes for the planner

- INTENT_MAP and matchIntent are exported (route-intent.js:161) and covered by
  route-intent.test.js — extend, don't restructure exports. Existing test at
  line 58 asserts the exact skill set in INTENT_MAP; it must be updated when
  EXECUTE/TODO/QUICK rules are added.
- gate-edits exports OVERRIDE_PHRASES, shouldGate, hasOverridePhrase
  (gate-edits.js:182). shouldGate is a pure function taking `overrideActive` —
  the marker check slots in at main() level (like skillActive) without changing
  shouldGate's signature.
- Both hooks already implement identical findPlanningDir walkers — the marker
  path derives from the same planningDir.
- Precedence options for INTENT_MAP: (a) per-rule `suppresses: ['build']`
  field, (b) order rules most-specific-first and stop at first match,
  (c) post-filter: if objective-add/todo/quick matched, drop build. Option (c)
  is the smallest diff against the existing `INTENT_MAP.filter(...)`
  implementation; first-match-wins (b) changes multi-intent behavior the
  directive renderer supports ("Use X or Y"). Planner's choice (discretion).
- hooks.json needs NO changes — route-intent and gate-edits are already
  registered on the right events.
- Test runner: `npm test` → node --test over df-tools.test.cjs; hook tests run
  via the same native runner (each hooks/*.test.js is standalone). Verify how
  hook tests are invoked (package.json test glob) — if hooks tests aren't in
  the npm test glob, run them directly with `node --test plugins/devflow/hooks/`.
- Skill description edits (execute-objective, quick, help) are markdown-only;
  remember the home-mirror (`~/.claude/devflow/`) is synced by version bump,
  so local manual testing of description changes requires plugin
  reinstall/sync — out of scope per CONTEXT.md (note it in the SUMMARY).

## RESEARCH COMPLETE
