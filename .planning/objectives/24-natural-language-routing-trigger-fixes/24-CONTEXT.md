# Objective 24 — Context & Locked Decisions

Source: natural-language routing review (2026-06-12, main session). User directive:
"build a plan for all of these items" — ALL seven findings are in scope, including
the optional item 7.

## Decisions (LOCKED)

1. **Override-phrase fix uses a single-turn marker file.** PreToolUse payloads
   carry NO user prompt field (`user_message`/`prompt` do not exist in the real
   harness payload — only session_id, transcript_path, cwd, permission_mode,
   tool_name, tool_input). The fix: `route-intent.js` (UserPromptSubmit — which
   DOES receive `prompt`) detects gate-edits OVERRIDE_PHRASES and writes
   `.planning/.edit-override` (single-turn scope); `gate-edits.js` checks the
   marker, allows, and deletes it (consume-on-read). Stale-marker safety: marker
   must be consumed or aged out (e.g., mtime older than a few minutes → ignore +
   delete) so an old marker can't silently disable the gate forever.
   `OVERRIDE_PHRASES` must be shared between the two hooks (export from one,
   require from the other, or a shared lib) — no duplicated literal lists.

2. **INTENT_MAP gains article-optional objective alternatives and an EXECUTE
   rule.** Must fire: "build objective 3", "execute objective 3",
   "run objective 3", "build this", "implement this", "let's build",
   "start building". EXECUTE routes to /devflow:execute-objective.

3. **BUILD over-match fixes.** "add a todo …" routes to /devflow:todo add (new
   TODO rule wins over BUILD); "make a quick pass …" routes to /devflow:quick
   (new QUICK rule); "add a/an/the objective" fires ONLY objective-add, not
   BUILD+objective-add (precedence/exclusion: more-specific rules suppress
   BUILD).

4. **matchIntent returns [] when the prompt contains any OVERRIDE_PHRASE.**
   No OBLIGATORY directive when the user explicitly opted out.

5. **matchIntent returns [] when `.planning/.skill-active` exists.** No
   directive injection mid-skill.

6. **SKILL.md trigger disambiguation.** execute-objective's description drops
   "build objective", "let's build", "start building" and keeps execution-only
   phrasing ("execute objective", "run objective", "run the jobs", "run the
   planned objective"). build keeps the build-flavored triggers.

7. **Generic-trigger tightening (item 7, in scope).** Add INTENT_MAP coverage
   for quick and todo (per decision 3). Tighten quick's "do this"/"tackle this"
   and help's bare "help" description triggers to less-generic phrasing.

8. **Test realism.** route-intent.test.js and gate-edits.test.js gain cases
   using REAL PreToolUse payload shapes (no user_message/prompt field) proving
   the marker path works end-to-end; keep existing pure-function tests.

## Discretion areas

- Exact regex construction, rule ordering, and precedence mechanism inside
  INTENT_MAP (filter-with-suppression vs first-match-wins vs priority field).
- Marker file name/location under `.planning/` and TTL value.
- Whether OVERRIDE_PHRASES lives in a new shared lib file or is exported from
  gate-edits.js and required by route-intent.js.
- Exact rewording of quick/help trigger phrases.

## Out of scope

- Reinstalling/bumping the live plugin version (release concern, not this objective).
- classify-session.js routing-table changes beyond what trigger renames require.
- Objective 22 scaffolding drift (separate concern).
- Any change to gate-commits.js / changelog-on-tag.js.
