---
objective: 24-natural-language-routing-trigger-fixes
trd: 03
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/skills/execute-objective/SKILL.md
  - plugins/devflow/skills/quick/SKILL.md
  - plugins/devflow/skills/help/SKILL.md
autonomous: true
requirements: [CTX24-D6, CTX24-D7]
must_haves:
  truths:
    - "execute-objective's description no longer contains 'build objective', \"let's build\", or 'start building' — its triggers are execution-only phrasing"
    - "build's SKILL.md description is unchanged and still carries the build-flavored triggers (build this, build objective, let's build, start building, implement this)"
    - "quick's description no longer lists bare 'do this' or 'tackle this' — replaced with small-scope-qualified phrasing"
    - "help's description no longer lists bare 'help' as a trigger — replaced with devflow-qualified phrasing"
    - "No two DevFlow SKILL.md descriptions share an identical trigger phrase between build and execute-objective"
  artifacts:
    - "plugins/devflow/skills/execute-objective/SKILL.md — disambiguated frontmatter description"
    - "plugins/devflow/skills/quick/SKILL.md — tightened triggers"
    - "plugins/devflow/skills/help/SKILL.md — tightened triggers"
  key_links:
    - "execute-objective triggers ('execute objective', 'run objective') align with the new EXECUTE INTENT_MAP rule landing in TRD 24-02 — hook layer and model layer point at the same skill for the same phrases"
---

<objective>
Fix CONTEXT.md locked decisions 6 and 7 (description part): build and execute-objective SKILL.md frontmatter currently list identical trigger phrases ("build objective", "let's build", "start building"), giving model-side routing no deterministic tiebreak; quick's "do this"/"tackle this" and help's bare "help" are generic enough to shadow other routes.

Purpose: SKILL.md descriptions are the model-facing routing layer — they must be mutually disambiguated and consistent with the hook-layer INTENT_MAP (TRD 24-02 maps execute/run+objective → execute-objective, build-flavored phrases → build).
Output: three edited SKILL.md frontmatter descriptions. Markdown-only; no code, no tests; verification by grep.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Current colliding frontmatter (verbatim):

execute-objective/SKILL.md:
```
  Use when the user wants to build, run, or execute a planned objective.
  Triggers on: "execute objective", "run objective", "build objective", "start building", "run the jobs", "let's build"
```

build/SKILL.md (KEEP UNCHANGED):
```
  Triggers on: "build this", "build objective", "let's build", "implement this", "ship this", "make this work", "build the", "work on objective", "start building", "let's implement"
```

quick/SKILL.md:
```
  Triggers on: "small change", "small feature", "5-file change", "isolated bug fix", "do this", "tackle this", "make a quick pass"
```

help/SKILL.md:
```
  Triggers on: "what can you do?", "how do I use DevFlow?", "show commands", "help", "what commands are available?"
```
</codebase_examples>

<anti_patterns>
- Do NOT touch build/SKILL.md — decision 6 says build keeps the build-flavored triggers; only execute-objective sheds the shared ones.
- Do NOT modify anything outside the YAML frontmatter `description:` blocks — skill bodies are out of scope.
- Do NOT touch classify-session.js routing table — out of scope per CONTEXT.md unless a trigger rename strictly requires it (none of these phrases appear in classify-session.js; verified by grep during planning).
- Do NOT bump plugin version or attempt a home-mirror sync — release concern, out of scope (note in SUMMARY that live description changes require plugin reinstall/sync to take effect).
</anti_patterns>

<error_recovery>
- gate-edits allows .md edits unconditionally, so no skill-active marker is needed for these files.
- If a YAML lint/parse concern arises, validate with `node -e "console.log(require('js-yaml')...)"` only if js-yaml is available; otherwise visually confirm the block scalar (`description: |`) indentation is preserved — every line stays indented two spaces under the key.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/24-natural-language-routing-trigger-fixes/24-CONTEXT.md
@.planning/objectives/24-natural-language-routing-trigger-fixes/24-RESEARCH.md
@plugins/devflow/skills/execute-objective/SKILL.md
@plugins/devflow/skills/quick/SKILL.md
@plugins/devflow/skills/help/SKILL.md
</context>

<gotchas>
- The home mirror (~/.claude/devflow/) is synced on version bump only; these edits take effect for marketplace users at next release. Out of scope here — record it in the SUMMARY so it isn't forgotten.
- Keep trigger phrases lowercase quoted strings in the same comma-separated style — downstream prompts quote these lines verbatim.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Disambiguate execute-objective triggers from build</name>
  <files>plugins/devflow/skills/execute-objective/SKILL.md</files>
  <action>
Edit ONLY the frontmatter description block of execute-objective/SKILL.md:

1. Change the "Use when" sentence to drop build phrasing:
   `Use when the user wants to run or execute an already-planned objective.`
2. Replace the Triggers line — remove "build objective", "start building", "let's build"; keep/add execution-only phrasing (locked list from decision 6):
   `Triggers on: "execute objective", "run objective", "run the jobs", "run the planned objective", "execute the plan"`

Leave build/SKILL.md untouched (decision 6: build keeps build-flavored triggers). Do not change name, argument-hint, allowed-tools, or the skill body.
  </action>
  <verify>grep -n "build objective\|let's build\|start building" plugins/devflow/skills/execute-objective/SKILL.md → zero hits; grep -n "execute objective" plugins/devflow/skills/execute-objective/SKILL.md → present; git diff --stat shows only execute-objective/SKILL.md</verify>
  <done>execute-objective and build share zero trigger phrases; execute-objective description is execution-only phrasing</done>
  <recovery>If git diff shows changes outside the description block, restore the file (git checkout -- path) and re-apply with a narrower edit.</recovery>
</task>

<task type="auto">
  <name>Task 2: Tighten generic triggers in quick and help</name>
  <files>plugins/devflow/skills/quick/SKILL.md, plugins/devflow/skills/help/SKILL.md</files>
  <action>
quick/SKILL.md frontmatter description — replace bare generic triggers with small-scope-qualified ones (decision 7; exact rewording is discretion, this is the chosen wording):
  `Triggers on: "small change", "small feature", "5-file change", "isolated bug fix", "do this small task", "tackle this small change", "make a quick pass"`
("do this" → "do this small task", "tackle this" → "tackle this small change"; all other phrases unchanged.)

help/SKILL.md frontmatter description — replace bare "help" with devflow-qualified phrasing:
  `Triggers on: "what can you do?", "how do I use DevFlow?", "show commands", "devflow help", "what commands are available?"`

No other lines change in either file.
  </action>
  <verify>grep -n '"do this"\|"tackle this"' plugins/devflow/skills/quick/SKILL.md → zero hits; grep -n '"help"' plugins/devflow/skills/help/SKILL.md → zero hits (the phrase "devflow help" remains); npm test → green (no test asserts these strings; confirms no accidental breakage)</verify>
  <done>quick and help no longer advertise bare generic triggers; all remaining trigger phrases intact</done>
  <recovery>If any test unexpectedly references these strings, check the failure source — only initiatives-cli.test.cjs greps near these phrases and it does not assert SKILL.md content; if it does fail, scope the SKILL.md wording so the test's actual fixture is untouched and report in SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `grep -rn "build objective\|let's build\|start building" plugins/devflow/skills/execute-objective/` → empty.
- `grep -n "Triggers on" plugins/devflow/skills/build/SKILL.md` → unchanged from git HEAD (`git diff plugins/devflow/skills/build/SKILL.md` empty).
- No shared trigger phrase between build and execute-objective descriptions.
- `npm test` green.
</verification>

<success_criteria>
Locked decision 6 complete (build vs execute-objective disambiguated, build untouched) and decision 7's description part complete (quick/help generic triggers tightened). Frontmatter-only diffs across exactly three SKILL.md files.
</success_criteria>

<output>
After completion, create `.planning/objectives/24-natural-language-routing-trigger-fixes/24-03-SUMMARY.md`
</output>
