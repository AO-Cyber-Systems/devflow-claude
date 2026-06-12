---
objective: 23-claude-compatibility-cleanup
trd: 04
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/skills/tui/SKILL.md
  - plugins/devflow/skills/handoff/SKILL.md
  - plugins/devflow/skills/status/SKILL.md
  - plugins/devflow/skills/initiatives/SKILL.md
  - plugins/devflow/skills/awareness/SKILL.md
  - plugins/devflow/skills/gh-sync/SKILL.md
  - plugins/devflow/skills/sync-roadmap/SKILL.md
  - plugins/devflow/skills/help/SKILL.md
autonomous: true
requirements: [SCOPE-3]
must_haves:
  truths:
    - "Each of the 8 target skill descriptions is <=350 chars"
    - "Every trigger phrase, mode, and flag/subcommand form removed from a description is preserved in that skill's body — no documentation is lost"
    - "Routing behavior unchanged: route-intent and skill-route test suites stay green (descriptions are not read by INTENT_MAP routing)"
  artifacts:
    - "8 trimmed SKILL.md files with mode/trigger documentation relocated into their bodies"
  key_links:
    - "status SKILL.md body documents the resume/pause/check subcommand forms previously carried in its description"
---

<objective>
Trim the 8 oversized skill descriptions to <=350 chars each, relocating trigger lists, mode documentation, and flag references into the skill bodies.

Purpose: skill descriptions load every session for all skills (~3,400 tokens today across 42 skills); these 8 carry verbose trigger/mode prose that belongs in the body.
Output: 8 SKILL.md files with terse descriptions (strongest 3-4 trigger phrases kept) and complete bodies.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
SKILL.md frontmatter shape (all skills):

```yaml
---
name: status
description: |
  <the text being trimmed — measured from after "description:" to the next frontmatter key>
argument-hint: ...
allowed-tools: ...
---
```

Measurement one-liner (use for before/after verification of a skill S):

```bash
node -e "
const t=require('fs').readFileSync('plugins/devflow/skills/S/SKILL.md','utf8');
const fm=t.match(/^---\n([\s\S]*?)\n---/)[1];
const d=fm.match(/description:\s*\|?\n?([\s\S]*?)(?=\n[a-z_-]+:|$)/);
console.log((d?d[1]:'').length);"
```

Measured 2026-06-12 baselines: tui 968, handoff 674, status 647, initiatives 613, awareness 588, gh-sync 467, sync-roadmap 461, help 265 (help may already be compliant — measure, trim only if >350).
</codebase_examples>

<anti_patterns>
- Do NOT delete subcommand/flag documentation outright (research Pitfall 5): Claude cannot infer `/devflow:status` `--check`/`--pause`/`--resume` forms from a terse description. MOVE the documentation into the skill body (`<process>` or a dedicated `## Modes` section), then trim.
- Do NOT touch `name`, `argument-hint`, or `allowed-tools` frontmatter fields.
- Do NOT edit any of the 13 deprecated skill dirs (TRD 23-03 deletes them in this same wave — file ownership is disjoint and must stay that way).
</anti_patterns>

<error_recovery>
- If a trim accidentally breaks YAML frontmatter parsing (block-scalar indentation), `git diff` the file and restore the `description: |` block shape — every continuation line indented two spaces.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/23-claude-compatibility-cleanup/OBJECTIVE.md
</context>

<research_context>
From 23-RESEARCH.md (HIGH confidence): route-intent.js and classify-session.js do NOT read skill descriptions at runtime — INTENT_MAP regexes match user prompt text. Descriptions feed Claude Code's skill catalog (display + Claude's own skill selection). Trimming has zero functional routing impact, but the strongest 3-4 trigger phrases should stay in each description so Claude's catalog-based skill selection still fires.

Trim recipe per skill: keep skill name + primary function + consolidated subcommand forms (status); move trigger example lists, mode documentation, flag reference into body; drop verbose examples and "Composes obj X + obj Y" internal notes.
</research_context>

<gotchas>
- The combined description+when_to_use budget per skill is 1,536 chars (docs) — 350 is this objective's stricter target.
- 12 pre-existing test failures in daemon/watcher/peer-scan/novel-domain — do not fix, do not worsen.
- HARD CONSTRAINT: never use port 8080 in any description/body text or example; use 8091 if a port example is ever needed.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Trim the four largest descriptions (tui, handoff, status, initiatives)</name>
  <files>plugins/devflow/skills/tui/SKILL.md, plugins/devflow/skills/handoff/SKILL.md, plugins/devflow/skills/status/SKILL.md, plugins/devflow/skills/initiatives/SKILL.md</files>
  <action>
For each skill: (1) measure the current description with the one-liner; (2) identify trigger lists / mode docs / flag references in the description; (3) add or extend a body section (e.g., `## Modes` / `## Triggers` inside the existing XML body structure) carrying that content verbatim or improved; (4) rewrite the description to <=350 chars keeping: skill purpose, the 3-4 strongest trigger phrases, and (for status) the one-line note that resume/pause/check subcommands exist (details in body).

status specifically: description keeps "Consolidated status/resume/pause/health — `/devflow:status [resume|pause|check]`"; the full per-subcommand behavior and `--check/--pause/--resume` flag forms move to the body.

Re-measure each — all four <=350.

Commit: `chore(23-04): trim tui/handoff/status/initiatives descriptions to <=350 chars`
  </action>
  <verify>The measurement one-liner prints <=350 for each of the four; grep confirms moved content present in each body (e.g., grep -n "resume" plugins/devflow/skills/status/SKILL.md shows body documentation)</verify>
  <done>Four descriptions <=350 chars; all removed trigger/mode/flag content present in bodies; frontmatter still parses</done>
  <recovery>git checkout -- <file> restores any skill whose frontmatter breaks; re-apply with correct block-scalar indentation.</recovery>
</task>

<task type="auto">
  <name>Task 2: Trim remaining descriptions (awareness, gh-sync, sync-roadmap; help if >350)</name>
  <files>plugins/devflow/skills/awareness/SKILL.md, plugins/devflow/skills/gh-sync/SKILL.md, plugins/devflow/skills/sync-roadmap/SKILL.md, plugins/devflow/skills/help/SKILL.md</files>
  <action>
Same recipe as Task 1 for awareness (588), gh-sync (467), sync-roadmap (461). For help: measure first — baseline shows 265 chars (already compliant); if <=350, leave it untouched and note in the SUMMARY that the audit's 771-char figure included when_to_use content or predates a prior trim.

Final sweep: run the measurement one-liner across ALL 8 target skills and record before/after numbers for the SUMMARY (per-skill chars saved + total).

Run `npm test` — route-intent and skill-route suites green (routing unaffected).

Commit: `chore(23-04): trim awareness/gh-sync/sync-roadmap descriptions to <=350 chars`
  </action>
  <verify>Measurement one-liner prints <=350 for all 8 skills; npm test shows no new failures</verify>
  <done>All 8 descriptions <=350; before/after char table captured for SUMMARY; zero routing-test regressions</done>
  <recovery>git checkout -- <file> per file on frontmatter breakage.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Measurement one-liner <=350 for: tui, handoff, status, initiatives, awareness, gh-sync, sync-roadmap, help
- Body sections contain the relocated trigger/mode/flag documentation (spot-check status and tui)
- `npm test` — zero new failures beyond the 12 known pre-existing
</verification>

<success_criteria>
- 8 descriptions <=350 chars each; per-session always-loaded description cost measurably reduced (record total chars saved)
- No trigger phrase, mode, or flag documentation lost — relocated to bodies
- Routing behavior identical
</success_criteria>

<output>
After completion, create `.planning/objectives/23-claude-compatibility-cleanup/23-04-SUMMARY.md`
</output>
