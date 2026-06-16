---
objective: UI-VISUAL-EVAL-DEVFLOW
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/agents/ui-evaluator.md
  - plugins/devflow/skills/ui-eval/SKILL.md
  - plugins/devflow/devflow/workflows/ui-eval.md
  - plugins/devflow/agents/verifier.md
requirements: [P3]
autonomous: true
allow_generated_test_data: false
use_property_based: false
use_gherkin: false

must_haves:
  truths:
    - "A new ui-evaluator agent exists that loads a manifest, runs the capture adapter, calls `df-tools verify flutter-ui-eval`, judges non-skipped states, writes evidence, and returns a <=300-token rollup."
    - "A new /devflow:ui-eval skill exists, standalone-invocable, that @-references the new ui-eval workflow."
    - "A new ui-eval workflow body exists with `status: active` frontmatter."
    - "verifier.md contains a Step 8c (between Step 8b and Step 9) that calls `df-tools verify flutter-ui-eval \"$OBJECTIVE\" --raw` and routes fail->gaps / review->notes / pass->drop-from-human-verification."
    - "verifier.md Step 9 is amended so visual UX escalates to a human ONLY on `review`/SKIPPED, not on `pass`."
    - "The `df-ui-evaluator` model-profile row is confirmed present (Phase 2) — NOT duplicated."
  artifacts:
    - path: plugins/devflow/agents/ui-evaluator.md
      provides: "ui-evaluator subagent prompt (authored like verifier.md)"
    - path: plugins/devflow/skills/ui-eval/SKILL.md
      provides: "/devflow:ui-eval slash command (authored like verify-work/SKILL.md)"
    - path: plugins/devflow/devflow/workflows/ui-eval.md
      provides: "ui-eval workflow body (status: active)"
    - path: plugins/devflow/agents/verifier.md
      provides: "Step 8c insert + Step 9 amend (the primary integration seam)"
  key_links:
    - from: skills/ui-eval/SKILL.md
      to: devflow/workflows/ui-eval.md
      via: "@~/.claude/devflow/workflows/ui-eval.md in <execution_context>"
    - from: agents/verifier.md Step 8c
      to: df-tools verify flutter-ui-eval
      via: "Bash call `node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-eval \"$OBJECTIVE\" --raw`"
    - from: agents/ui-evaluator.md
      to: df-tools verify flutter-ui-eval
      via: "Bash call into the Phase-2 engine consumer API"
---

<objective>
P3 — Integration wiring: make DevFlow *consume* the already-shipped Phase-2 scoring engine
(`flutter-ui-eval.cjs` + `df-tools verify flutter-ui-eval` / `flutter-ui eval` + the
`df-ui-evaluator` model profile). Three new prose artifacts (agent, skill, workflow) plus a
surgical edit to `verifier.md` that wires the visual gate into the existing verify pipeline.

Purpose: visual correctness that the verifier *always* escalated to a human (verifier.md Step 9)
becomes machine-judged. A clean surface drops off the human-verification list; a real defect lands
as a `gaps:` entry — the consumer the `evidence/` dir was always missing.

Output: ui-evaluator.md, skills/ui-eval/SKILL.md, workflows/ui-eval.md, and the verifier Step 8c
insert + Step 9 amendment.
</objective>

<context>
**This is a DevFlow exception to the TDD playbook (per OBJECTIVE.md "TDD posture").** Agent, skill,
and workflow markdown are PROMPT files (generated/prose) — NOT unit-TDD'd. The verifier Step 8c edit
is prose too. There is therefore NO `## Test list` and NO `tdd="true"` task in this TRD; verification
is "files parse + structural greps", not `node --test`. The unit-TDD'd glue (bootstrap scaffold,
planner auto-emit) lives in TRD-02 and TRD-03.

**Consumer API (already shipped, Phase 2 — do NOT re-implement):** the engine is
`plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs`. Its df-tools arms are:
- `node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-eval <manifest> [--raw]`
- `node ~/.claude/devflow/bin/df-tools.cjs flutter-ui eval <manifest> [--raw]`
Both emit a scoreRun rollup: `{ verdict: 'pass'|'pass-with-reviews'|'fail', counts, reviews[], fails[], states[] }`
using the OFFLINE label-echo judge (network:false). The `df-ui-evaluator` model-profile row already exists
(`references/model-profiles.json:20`) — Task 1 CONFIRMS it, never adds a duplicate.

**Verdict→action mapping (the load-bearing contract for Step 8c + the agent):**
- `fail` → a `gaps:` entry (defect + screenshot evidence path)
- `pass-with-reviews` / per-state `review` → `notes:` entries + partial section; surface stays on human-verify
- `pass` → REMOVE that surface from Step 9 `human_verification:`

**KNOWN ENV QUIRK (executor):** Edit/Write may be sandboxed to a foreign agent worktree. Write all
files via Bash heredoc to absolute paths under `/Users/markemerson/Source/devflow-claude-ui-eval`,
verify with `git status` (NOT `git checkout` probes on tracked files), commit from repo root via
`node ~/.claude/devflow/bin/df-tools.cjs commit --files ...` (raw `git commit` is hook-blocked).
</context>

<file_tree>
plugins/devflow/
├── agents/
│   ├── ui-evaluator.md                  ← CREATE (author like verifier.md)
│   └── verifier.md                      ← MODIFY (insert Step 8c, amend Step 9)
├── skills/
│   └── ui-eval/
│       └── SKILL.md                     ← CREATE (author like verify-work/SKILL.md)
└── devflow/
    └── workflows/
        └── ui-eval.md                   ← CREATE (status: active)
</file_tree>

<embedded_context>

<codebase_examples>
<!-- Skill shape — mirror verify-work/SKILL.md: YAML frontmatter (name/description/argument-hint/
     allowed-tools incl. Playwright MCP browser tools) + <objective> + <execution_context> with
     @-refs + <context> + <process>. -->
Skill execution_context pattern (verify-work/SKILL.md):
  <execution_context>
  @~/.claude/devflow/workflows/verify-work.md
  @~/.claude/devflow/templates/UAT.md
  </execution_context>

<!-- Workflow shape — mirror workflows/verify-work.md: `---\nstatus: active\n---` then
     <purpose>/<philosophy>/<process> with named <step> elements. -->

<!-- Agent shape — mirror agents/verifier.md frontmatter:
     tools: Read, Write, Bash, Grep, Glob, mcp__plugin_playwright_playwright__browser_*, mcp__maestro__*
     color: green
     The agent loads a manifest -> runs capture adapter -> runs `df-tools verify flutter-ui-eval`
     -> judges non-skipped states -> writes *.judge.json + ui-eval-report.json to
     .planning/objectives/<obj>/evidence/ui_eval/ -> returns <=300-token rollup. -->

<!-- verifier.md anchor points (read before editing):
     Step 8a = Web Playwright (~L364), Step 8b = Flutter Maestro (~L393),
     "Shared evidence contract" (~L468), Step 9 = human verification (~L487, REQ-10-06 sub-step ~L505).
     Step 8c inserts AFTER the Step 8b/orphan-flow block and the Shared-evidence contract,
     BEFORE Step 9. -->
</codebase_examples>

<anti_patterns>
- Do NOT add a model-profile row — `df-ui-evaluator` already exists (Phase 2). Adding a duplicate
  corrupts the JSON profile table.
- Do NOT hardcode a Claude vision model id or image-format in any prose — the engine resolves the
  model via `references/model-profiles.json`; the agent just calls the df-tools arm.
- Do NOT use `${CLAUDE_PLUGIN_ROOT}` in `@path` references in the skill — it does not interpolate.
  Use `@~/.claude/devflow/workflows/ui-eval.md` (home-mirror path, per CLAUDE.md conventions).
- Do NOT make Step 8c blocking on `review` — `review` is advisory (stays on human-verify). Only
  `fail` produces a gap.
- Do NOT renumber existing verifier steps (8a/8b/9/10/11). Insert 8c as a NEW sub-step; leave the rest.
</anti_patterns>

<error_recovery>
- If the verifier objective has no `type: ui` + `stack: flutter` TRD, Step 8c MUST skip silently
  (mirror the "For non-Flutter objectives: skip this subroutine" pattern at verifier.md REQ-10-06).
- If `df-tools verify flutter-ui-eval` returns `{ error: ... }` (no manifest found), Step 8c records
  `? SKIPPED (no ui-eval manifest)` and falls through to existing Step 9 human-verify unchanged —
  never a hard fail.
- If a foreign-worktree sandbox blocks Edit on verifier.md, re-apply the edit via Bash heredoc to the
  absolute path and confirm with `git status` / `git diff --stat`.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Create the ui-evaluator agent + ui-eval skill + ui-eval workflow</name>
  <files>plugins/devflow/agents/ui-evaluator.md, plugins/devflow/skills/ui-eval/SKILL.md, plugins/devflow/devflow/workflows/ui-eval.md</files>
  <action>
Author three new prose files. Mirror the existing authoring models exactly.

1. `plugins/devflow/devflow/workflows/ui-eval.md` — workflow body. Frontmatter `---\nstatus: active\n---`.
   Sections: `<purpose>` (run the visual-eval pipeline on a surface/objective), `<process>` with named
   `<step>` elements:
     - initialize: resolve objective dir + locate the ui_eval manifest (`flutter/ui_eval/manifests/*.yaml`
       in the consumer repo, or the objective's manifest stub).
     - capture: run the capture adapter (Playwright web adapter) to produce CaptureResult[] + screenshots
       into `.planning/objectives/<obj>/evidence/ui_eval/`.
     - score: `node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-eval <manifest> --raw` → parse
       the scoreRun rollup.
     - judge non-skipped states + write `*.judge.json` + `ui-eval-report.json` to evidence/ui_eval/.
     - report: emit verdict + per-state detail.
   Reference the verdict→action mapping from <context>.

2. `plugins/devflow/skills/ui-eval/SKILL.md` — mirror `skills/verify-work/SKILL.md` shape:
   YAML frontmatter (`name: ui-eval`, description, `argument-hint: "[objective number or manifest path]"`,
   `allowed-tools:` incl. Read/Bash/Glob/Grep + the Playwright MCP browser_* tools used by verify-work),
   then `<objective>`, `<execution_context>` containing exactly:
     @~/.claude/devflow/workflows/ui-eval.md
   then `<context>` and `<process>` ("Execute the ui-eval workflow ... end-to-end").
   Standalone-invocable for dogfooding a single surface.

3. `plugins/devflow/agents/ui-evaluator.md` — mirror `agents/verifier.md` frontmatter:
   `tools: Read, Write, Bash, Glob, Grep, mcp__plugin_playwright_playwright__browser_*, mcp__maestro__*`,
   `color: green`. Body: `<role>` (visual-eval agent), `<execution_flow>` named steps that
   load manifest → run capture adapter → `df-tools verify flutter-ui-eval` → judge non-skipped states →
   write `*.judge.json` + `ui-eval-report.json` to `.planning/objectives/<obj>/evidence/ui_eval/` →
   return a `## UI-EVAL COMPLETE` rollup capped at <=300 tokens (verdict + counts + report path only).
   Do NOT add a model-profile row (it exists). Do NOT hardcode a vision model id.

# PATTERN: copy frontmatter + section skeletons verbatim from verify-work/SKILL.md, verify-work.md,
#          and verifier.md, then swap the body. Keeps the executor from inventing shapes.
# CRITICAL: write via Bash heredoc to absolute paths; verify with `git status` (sandbox quirk).
  </action>
  <verify>
All three files exist and parse as valid YAML frontmatter:
`for f in plugins/devflow/agents/ui-evaluator.md plugins/devflow/skills/ui-eval/SKILL.md plugins/devflow/devflow/workflows/ui-eval.md; do head -1 "$f" | grep -q '^---' && echo "$f OK"; done`
Workflow has `status: active`: `grep -q '^status: active' plugins/devflow/devflow/workflows/ui-eval.md`.
Skill @-refs the workflow: `grep -q '@~/.claude/devflow/workflows/ui-eval.md' plugins/devflow/skills/ui-eval/SKILL.md`.
Agent calls the engine arm: `grep -q 'verify flutter-ui-eval' plugins/devflow/agents/ui-evaluator.md`.
Agent did NOT add a profile row: `! grep -q 'MODEL_PROFILES\|model-profiles.json.*df-ui-evaluator.*opus' plugins/devflow/agents/ui-evaluator.md` (it may *mention* df-ui-evaluator but must not redefine the table).
  </verify>
  <done>ui-evaluator agent, /devflow:ui-eval skill, and ui-eval workflow exist; skill @-refs the workflow; agent calls `df-tools verify flutter-ui-eval`; no duplicate model-profile row.</done>
  <recovery>If a file fails the frontmatter parse, re-emit it via heredoc; diff against verify-work/SKILL.md structure. If the @-ref grep fails, the skill's <execution_context> block is malformed — re-author that block only.</recovery>
</task>

<task type="auto">
  <name>Insert verifier Step 8c and amend Step 9 human-escalation</name>
  <files>plugins/devflow/agents/verifier.md</files>
  <action>
Surgically edit `agents/verifier.md`. Two changes, no renumbering of existing steps.

CHANGE 1 — Insert a new `### Step 8c: Visual UI eval (P3)` block AFTER the Step 8b Maestro
orphan-flow section + the "Shared evidence contract" block (~L468) and BEFORE `## Step 9` (~L487).

Step 8c content (prose):
  - Gate: run ONLY when the objective has >=1 TRD with `type: ui` + `stack: flutter`. Otherwise skip
    silently (mirror REQ-10-06's non-Flutter skip).
  - Call:
    ```bash
    UI_EVAL=$(node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-eval "$OBJECTIVE" --raw)
    ```
  - Parse the scoreRun rollup `{ verdict, counts, reviews, fails, states }`.
  - Route per verdict (the load-bearing contract):
      * any state in `fails[]` (verdict `fail`) → append a `gaps:` entry: the defect type/severity +
        the screenshot evidence path under `evidence/ui_eval/`.
      * `verdict: pass-with-reviews` or any state in `reviews[]` → append `notes:` entries + a partial
        section; that surface STAYS on the Step 9 human-verification list.
      * `verdict: pass` (no fails, no reviews) → REMOVE that surface from the Step 9
        `human_verification:` list (the payoff: machine-judged visual correctness).
  - On `{ error: ... }` (no manifest) → record `? SKIPPED (no ui-eval manifest)`; fall through to
    Step 9 unchanged. NEVER a hard fail.

CHANGE 2 — Amend `## Step 9` so visual UX escalates to a human ONLY on `review`/SKIPPED. Add a bullet
near the top of Step 9: "Surfaces that Step 8c scored `pass` are visual-correctness-verified by the
machine judge and MUST NOT appear in this human-verification list. Only Step 8c `review`/SKIPPED
surfaces escalate here for visual UX."

# CRITICAL: do NOT touch Step 8a/8b/10/11 numbering. Step 8c is additive.
# GOTCHA: verifier.md uses `### Step 8b:` twice (Maestro + orphan-flow) — insert 8c after BOTH and
#         after the "### Shared evidence contract" / "### Functional verification status" blocks.
# PATTERN: match the heading style `### Step 8c: ...` and the ```bash fence style already in 8a/8b.
  </action>
  <verify>
Step 8c present and calls the engine: `grep -q 'Step 8c' plugins/devflow/agents/verifier.md && grep -q 'verify flutter-ui-eval "\$OBJECTIVE" --raw' plugins/devflow/agents/verifier.md`.
8c is between 8b and 9 (ordering): `awk '/### Step 8b/{b=NR} /Step 8c/{c=NR} /## Step 9/{n=NR} END{exit !(c>b && c<n)}' plugins/devflow/agents/verifier.md`.
Step 9 amended for pass-drop: `grep -qi 'scored .pass.*MUST NOT\|only.*review.*SKIPPED.*escalate' plugins/devflow/agents/verifier.md`.
File still parses: `head -1 plugins/devflow/agents/verifier.md | grep -q '^---'`.
No step renumber regression: `grep -c '## Step 1[01]' plugins/devflow/agents/verifier.md` still returns the pre-edit count (Step 10 + Step 11 intact).
  </verify>
  <done>verifier.md has a Step 8c (between 8b and 9) calling `df-tools verify flutter-ui-eval "$OBJECTIVE" --raw` with fail→gaps / review→notes / pass→drop routing; Step 9 escalates visual UX to human only on review/SKIPPED; existing steps unrenumbered.</done>
  <recovery>If the edit lands outside the 8b→9 window, `git restore plugins/devflow/agents/verifier.md` and re-apply, anchoring the insert on the literal "### Functional verification status" heading that immediately precedes Step 9. If sandboxed, re-apply via heredoc and confirm with `git diff plugins/devflow/agents/verifier.md`.</recovery>
</task>

<task type="auto">
  <name>Confirm df-ui-evaluator model-profile row + commit P3 wiring</name>
  <files>plugins/devflow/devflow/references/model-profiles.json</files>
  <action>
CONFIRM-only (no edit) that the Phase-2 model-profile row exists, then commit the P3 prose changes.

1. Confirm the row is present and well-formed (do NOT add/modify):
   ```bash
   grep -q '"df-ui-evaluator"' plugins/devflow/devflow/references/model-profiles.json \
     && node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/devflow/references/model-profiles.json','utf8'))" \
     && echo "profile row present + JSON valid"
   ```
   If the grep fails, STOP and surface — Phase 2 was expected to have added it; do not fabricate.

2. Commit from repo root (single docs/feat commit — prose files, no test cycle):
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs commit "feat(UI-VISUAL-EVAL-DEVFLOW): P3 integration wiring — ui-evaluator agent, ui-eval skill+workflow, verifier Step 8c" \
     --files plugins/devflow/agents/ui-evaluator.md plugins/devflow/skills/ui-eval/SKILL.md plugins/devflow/devflow/workflows/ui-eval.md plugins/devflow/agents/verifier.md
   ```

# GOTCHA: df-tools commit treats ANY arg (incl --help) as the message and stages the WHOLE index —
#         pass explicit --files and ensure the index is clean of unrelated changes first
#         (`git status --short` should show only this TRD's four files staged).
# CRITICAL: model-profiles.json is NOT in --files (we only confirmed it). Do not stage it.
  </action>
  <verify>
`grep -q '"df-ui-evaluator"' plugins/devflow/devflow/references/model-profiles.json && echo OK`.
Commit landed with the four P3 files: `git show --stat HEAD | grep -E 'ui-evaluator.md|ui-eval/SKILL.md|workflows/ui-eval.md|verifier.md'` shows all four and NOT model-profiles.json.
  </verify>
  <done>The `df-ui-evaluator` profile row is confirmed present (not duplicated); the four P3 prose artifacts are committed in a single feat: commit; model-profiles.json untouched.</done>
  <recovery>If the index has bled unrelated files, `git restore --staged <unrelated>` before commit. If df-ui-evaluator row is genuinely absent, halt and report — that is a Phase-2 regression, out of scope to fix here.</recovery>
</task>

</tasks>

<verification>
- Files parse: all three new files + verifier.md begin with `---` and have valid YAML frontmatter.
- Workflow `status: active`; skill `@~/.claude/devflow/workflows/ui-eval.md`; agent + verifier call `df-tools verify flutter-ui-eval`.
- verifier Step 8c sits between Step 8b and Step 9; Step 9 drops `pass` surfaces from human-verify.
- `df-ui-evaluator` profile row confirmed present (NOT duplicated).
- No regression: `npm test` still green (this TRD adds no tests; it must not break existing ones) —
  `node --test 'plugins/devflow/**/*.test.cjs'` exit 0 vs baseline (known ~1 pre-existing awareness flake; add none).
</verification>

<validation_gates>
```bash
# Structural (this TRD is prose — gates are greps, not node --test):
head -1 plugins/devflow/agents/ui-evaluator.md | grep '^---'
grep -q '^status: active' plugins/devflow/devflow/workflows/ui-eval.md
grep -q '@~/.claude/devflow/workflows/ui-eval.md' plugins/devflow/skills/ui-eval/SKILL.md
grep -q 'Step 8c' plugins/devflow/agents/verifier.md
# Regression (must stay green):
npm test
```
</validation_gates>

<success_criteria>
- [ ] ui-evaluator.md, skills/ui-eval/SKILL.md, workflows/ui-eval.md created with valid frontmatter
- [ ] workflows/ui-eval.md has `status: active`
- [ ] skill @-references the ui-eval workflow
- [ ] agent + verifier Step 8c both call `df-tools verify flutter-ui-eval`
- [ ] verifier Step 8c inserted between 8b and 9; routes fail/review/pass correctly
- [ ] verifier Step 9 escalates visual UX to human only on review/SKIPPED
- [ ] df-ui-evaluator profile row confirmed (not duplicated)
- [ ] Single feat: commit of the four P3 files; npm test still green
</success_criteria>

<output>
Append to SUMMARY.md: the four files touched, the Step 8c verdict→action contract, and confirmation
the model-profile row was pre-existing.
</output>
