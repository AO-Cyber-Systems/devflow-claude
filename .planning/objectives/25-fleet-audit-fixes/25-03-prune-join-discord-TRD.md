---
objective: 25-fleet-audit-fixes
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/skills/join-discord/SKILL.md
  - plugins/devflow/devflow/workflows/help.md
  - docs/USER-GUIDE.md
autonomous: true
requirements: []   # ad-hoc audit objective — roadmap Objective 25 SC-3 (prune half) is the contract

must_haves:
  truths:
    - "plugins/devflow/skills/join-discord/ no longer exists — the skill is not installable"
    - "help.md catalog contains no /devflow:join-discord entry; docs/USER-GUIDE.md command table contains no join-discord row"
    - "grep -rn 'join-discord' (excluding .git) matches ONLY historical/self-referential text: CHANGELOG.md, .planning/ROADMAP.md, .planning/objectives/25-*"
    - "tui and awareness skills are untouched (LOCKED: do NOT prune them)"
    - "npm test still passes (no test references the skill)"
  artifacts:
    - "plugins/devflow/skills/join-discord/ — DELETED"
    - "plugins/devflow/devflow/workflows/help.md — join-discord block removed"
    - "docs/USER-GUIDE.md — join-discord table row removed"
  key_links:
    - "help.md is the /devflow:help catalog source — removing the block removes the user-visible listing"
    - "Skill dirs are NOT enumerated in .claude-plugin manifests (verified) — no manifest edit needed or allowed"
---

<objective>
Prune the never-invoked `join-discord` skill and its live-doc references. Audit item 6a; LOCKED decision 1: prune join-discord ONLY — keep `tui` and `awareness` as manual-only skills.

Purpose: roadmap SC-3 (prune half) — "join-discord skill removed".
Output: skill directory deleted, help catalog + user guide cleaned, one atomic commit in devflow-claude.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Full reference list (repo-wide grep, verified 2026-07-22):

| File | Lines | Disposition |
|---|---|---|
| plugins/devflow/skills/join-discord/SKILL.md | whole file | DELETE directory |
| plugins/devflow/devflow/workflows/help.md | ~262-270 | REMOVE block |
| docs/USER-GUIDE.md | 164 | REMOVE row |
| CHANGELOG.md | 748 | LEAVE (historical record) |
| .planning/ROADMAP.md | 796, 802 | LEAVE (this objective's own plan text) |

help.md block to remove (verbatim — the `/devflow:help` entry above it and the `## Files & Structure` heading below it must both survive):

```markdown
**`/devflow:join-discord`**
Join the DevFlow Discord community.

- Get help, share what you're building, stay updated
- Connect with other DevFlow users

Usage: `/devflow:join-discord`
```

USER-GUIDE.md row to remove (line 164):
```markdown
| `/devflow:join-discord` | Open Discord community invite | Questions or community |
```
</codebase_examples>

<anti_patterns>
- Do NOT edit CHANGELOG.md or .planning/ROADMAP.md — changelogs are historical record; the ROADMAP mentions are this objective describing itself (research Pitfall 3).
- Do NOT touch the other stale USER-GUIDE.md rows (resume-work/progress/pause-work/add-objective, lines 159-161, 170, 437+). Orchestrator disposition: bundling allowed ONLY if the total docs diff stays ≤10 lines — removing them would blow that budget (12+ scattered references). Leave for a future docs-cleanup; note in SUMMARY.
- Do NOT edit .claude-plugin/marketplace.json or plugins/devflow/.claude-plugin/plugin.json — skill dirs are not enumerated there (verified); touching manifests risks version-sync drift.
</anti_patterns>

<error_recovery>
- If the sweep grep reveals an unexpected live reference (e.g. a skill or workflow not in the table above), remove it only if it is a live doc/code reference; if historical, leave and document in SUMMARY.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/25-fleet-audit-fixes/25-CONTEXT.md
@.planning/objectives/25-fleet-audit-fixes/25-RESEARCH.md
</context>

<gotchas>
- HARD CONSTRAINT: port 8080 forbidden; no version bump/tag/release/deploy. The `~/.claude/devflow/` mirror keeps a stale help.md copy until the next release (sync-runtime fires on version change) — expected; do not force a mirror refresh or bump the version.
- Use `git rm -r plugins/devflow/skills/join-discord` so the deletion stages cleanly; commit via df-tools commit as usual.
- Deletion is pre-approved by LOCKED decision 1 — no checkpoint needed.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Delete the skill directory and its help.md catalog block</name>
  <files>plugins/devflow/skills/join-discord/SKILL.md, plugins/devflow/devflow/workflows/help.md</files>
  <action>
`git rm -r plugins/devflow/skills/join-discord` (LOCKED decision 1 — join-discord ONLY; do not touch tui/ or awareness/). In plugins/devflow/devflow/workflows/help.md remove the join-discord block quoted in codebase_examples (heading line through its `Usage:` line, plus the blank separator so spacing stays consistent). Verify the `/devflow:help` entry above and `## Files & Structure` below remain intact.
  </action>
  <verify>test ! -d plugins/devflow/skills/join-discord; grep -c "join-discord" plugins/devflow/devflow/workflows/help.md returns 0</verify>
  <done>Skill dir gone from working tree + index; help catalog has no join-discord entry; surrounding help.md content intact</done>
  <recovery>git checkout -- plugins/devflow/devflow/workflows/help.md and re-apply if the block removal ate adjacent entries</recovery>
</task>

<task type="auto">
  <name>Task 2: Remove USER-GUIDE row, sweep-verify, commit</name>
  <files>docs/USER-GUIDE.md</files>
  <action>
Remove the single join-discord table row (docs/USER-GUIDE.md line 164). Touch nothing else in the file (≤10-line total docs diff constraint — the other stale rows are explicitly out of scope). Sweep: `grep -rn "join-discord" --exclude-dir=.git --exclude-dir=node_modules .` — remaining matches must be ONLY CHANGELOG.md, .planning/ROADMAP.md, and .planning/objectives/25-* files. Run `npm test` (expect green — no test references the skill). Commit everything as one atomic `chore(25-03): prune join-discord skill and references` via df-tools commit.
  </action>
  <verify>grep -rn "join-discord" --exclude-dir=.git --exclude-dir=node_modules . | grep -v "CHANGELOG.md\|.planning/ROADMAP.md\|.planning/objectives/25-" returns nothing; npm test green; git log -1 shows the prune commit</verify>
  <done>Only historical/self-referential mentions remain; docs diff for USER-GUIDE.md is exactly one removed row</done>
  <recovery>If npm test surprisingly fails on a skill-count or catalog assertion, locate the test, confirm it hardcodes join-discord, and update that single expectation (document as deviation in SUMMARY)</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `test ! -d plugins/devflow/skills/join-discord` — gone.
2. Sweep grep clean (only CHANGELOG/ROADMAP/objective-25 self-references).
3. `npm test` green; `git show --stat HEAD` lists the deletion + 2 doc edits in one commit.
</verification>

<success_criteria>
- Roadmap SC-3 (prune half): join-discord skill removed with all live references; tui + awareness untouched.
</success_criteria>

<output>
After completion, create `.planning/objectives/25-fleet-audit-fixes/25-03-SUMMARY.md`
</output>
