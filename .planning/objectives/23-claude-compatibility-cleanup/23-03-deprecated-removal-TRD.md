---
objective: 23-claude-compatibility-cleanup
trd: 03
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/skills/add-objective/ (DELETE dir)
  - plugins/devflow/skills/add-todo/ (DELETE dir)
  - plugins/devflow/skills/audit-milestone/ (DELETE dir)
  - plugins/devflow/skills/check-todos/ (DELETE dir)
  - plugins/devflow/skills/complete-milestone/ (DELETE dir)
  - plugins/devflow/skills/health/ (DELETE dir)
  - plugins/devflow/skills/insert-objective/ (DELETE dir)
  - plugins/devflow/skills/new-milestone/ (DELETE dir)
  - plugins/devflow/skills/pause-work/ (DELETE dir)
  - plugins/devflow/skills/plan-milestone-gaps/ (DELETE dir)
  - plugins/devflow/skills/progress/ (DELETE dir)
  - plugins/devflow/skills/remove-objective/ (DELETE dir)
  - plugins/devflow/skills/resume-work/ (DELETE dir)
  - plugins/devflow/devflow/workflows/execute-job.md (DELETE file)
  - plugins/devflow/devflow/templates/job-prompt.md
  - plugins/devflow/devflow/templates/codebase/structure.md
  - plugins/devflow/devflow/templates/user-setup.md
  - plugins/devflow/devflow/workflows/execute-trd.md
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/workflows/discuss-objective.md
  - plugins/devflow/devflow/workflows/check-todos.md
  - plugins/devflow/devflow/workflows/pause-work.md
  - plugins/devflow/devflow/workflows/progress.md
  - plugins/devflow/devflow/workflows/insert-objective.md
  - plugins/devflow/devflow/workflows/help.md
  - plugins/devflow/skills/execute-objective/SKILL.md
  - README.md
autonomous: true
requirements: [SCOPE-2, SCOPE-6A]
must_haves:
  truths:
    - "The 13 deprecated redirect skill directories no longer exist — ~540 tokens of shim descriptions stop loading every session"
    - "DEPRECATION_MAP keeps exactly 13 entries and skill-route test WD1 stays green"
    - "Consolidated dispatch still works: SKILL_ROUTES targets (workflows/add-objective.md, check-todos.md, health.md, pause-work.md, progress.md, etc.) all still exist with status: active"
    - "workflows/execute-job.md is deleted and NO @-reference anywhere resolves to it; templates/job-prompt.md points to execute-trd.md"
    - "help.md appendix and README describe the 13 names as removed (not 'still work')"
  artifacts:
    - "plugins/devflow/devflow/templates/job-prompt.md — lines 60 and 449 repointed to execute-trd.md"
    - "plugins/devflow/devflow/workflows/insert-objective.md — frontmatter status: legacy"
  key_links:
    - "SKILL_ROUTES in bin/lib/skill-route.cjs → workflow .md files: untouched and intact"
    - "templates/job-prompt.md @-reference → workflows/execute-trd.md (was execute-job.md)"
---

<objective>
Delete the 13 deprecated redirect skill directories and the legacy execute-job.md workflow, repointing every load-bearing reference first and updating user-facing deprecation language.

Purpose: pure shims cost ~540 tokens of descriptions every session; execute-job.md (454 lines, status: legacy) is dead weight whose template references would 404 for newly generated JOB.md files.
Output: 13 skill dirs + 1 workflow file deleted; all references repointed or updated; tests stay green with DEPRECATION_MAP untouched.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Workflow frontmatter status convention (every workflows/*.md):

```yaml
---
status: active   # or: legacy
---
```

DEPRECATION_MAP lives in `plugins/devflow/devflow/bin/lib/skill-route.cjs`; test WD1 at `skill-route.test.cjs:771` asserts `assert.strictEqual(count, 13, ...)`. LOCKED BINDING: keep all 13 entries — they power "use X instead" guidance without the skill dirs existing.
</codebase_examples>

<anti_patterns>
- Do NOT delete ANY file under `plugins/devflow/devflow/workflows/` except `execute-job.md`. The deprecated-skill workflow files (add-objective.md, check-todos.md, health.md, pause-work.md, progress.md, audit-milestone.md, ...) are LIVE SKILL_ROUTES dispatch targets (research Pitfall 1). Only the skill DIRECTORIES under `plugins/devflow/skills/` are deleted.
- Do NOT remove or edit DEPRECATION_MAP entries in skill-route.cjs (research Pitfall 2 — WD1 pins 13).
- Do NOT delete execute-job.md before repointing templates/job-prompt.md (research Pitfall 6 — generated JOB.md files would carry a dangling @-reference).
- Do NOT touch the obj-10 three-branch checkpoint handler in workflows/execute-objective.md — the only edits there are the line-9 prose ("execute-job context" → "execute-trd context") and line ~871 (`/devflow:progress` → `/devflow:status`).
</anti_patterns>

<error_recovery>
- All deletions are git-tracked: `git checkout -- <path>` / `git checkout -- plugins/devflow/skills/<name>` restores anything removed in error before commit.
- If npm test fails after deletions, check whether a test references a deleted SKILL.md path by directory scan — research found none, but if one surfaces, update the test deliberately and note it in the SUMMARY (do not restore the skill dir).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/23-claude-compatibility-cleanup/OBJECTIVE.md
</context>

<research_context>
From 23-RESEARCH.md (HIGH confidence — exhaustive grep):

Load-bearing execute-job references (MUST repoint before delete):
- templates/job-prompt.md:60 and :449 — `@~/.claude/devflow/workflows/execute-job.md` → change to `@~/.claude/devflow/workflows/execute-trd.md`

Prose-only references (update for accuracy):
- templates/codebase/structure.md:169 — "Key files: execute-job.md, ..." → execute-trd.md
- templates/user-setup.md:70 — "Generated during execute-job.md after tasks complete" → execute-trd.md
- workflows/execute-objective.md:9 — "loads the full execute-job context" → execute-trd
- skills/execute-objective/SKILL.md:22 — same phrase → execute-trd
- workflows/execute-trd.md:89,106,129,218,238 — "identical to execute-job.md / Same as execute-job.md" cross-refs: DELETE the stale cross-reference phrases (research Open Question 3, option b — execute-trd.md already carries the full content inline)

Deprecated-name references to update (consolidated forms):
- workflows/execute-objective.md:871 — `/devflow:progress` → `/devflow:status`
- workflows/discuss-objective.md:126 — `/devflow:progress` → `/devflow:status`
- workflows/check-todos.md:33 — `/devflow:progress` → `/devflow:status`; :123 and :139 — `/devflow:add-objective` → `/devflow:objective add`
- workflows/pause-work.md:113 — `/devflow:resume-work` → `/devflow:status resume`
- workflows/progress.md:376 — `/devflow:resume-work` → `/devflow:status resume`
- workflows/insert-objective.md:116 — `/devflow:add-objective` → `/devflow:objective add`; ALSO set frontmatter `status: active` → `status: legacy` (dead end since TRD 12-06 removed insert from SKILL_ROUTES)

Deprecation language updates:
- workflows/help.md ~lines 440-460 (appendix says "These old skill names still work but emit a deprecation warning and forward..."): rewrite to past tense — the names are REMOVED in v2.2; the table's "use X instead" mapping stays as migration guidance
- README.md:546 — "13 legacy skill names ... still work as deprecation redirects" → "13 legacy skill names were removed in v2.2; use the consolidated commands (see /devflow:help)"
</research_context>

<gotchas>
- Line numbers above were verified on 2026-06-12; if drift occurred, locate by the quoted text, not the number.
- This session runs from the home mirror — edits land in the repo; do not hand-sync to ~/.claude/devflow (sync-runtime handles that on next session).
- 12 pre-existing test failures in daemon/watcher/peer-scan/novel-domain — do not fix, do not worsen.
- HARD CONSTRAINT: never use port 8080 in any file touched; use 8091 in any example.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Repoint execute-job references, then delete execute-job.md</name>
  <files>plugins/devflow/devflow/templates/job-prompt.md, plugins/devflow/devflow/templates/codebase/structure.md, plugins/devflow/devflow/templates/user-setup.md, plugins/devflow/devflow/workflows/execute-trd.md, plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/skills/execute-objective/SKILL.md, plugins/devflow/devflow/workflows/execute-job.md</files>
  <action>
ORDER MATTERS (research binding): repoint BEFORE delete.

1. templates/job-prompt.md: replace both `@~/.claude/devflow/workflows/execute-job.md` occurrences (lines 60, 449) with `@~/.claude/devflow/workflows/execute-trd.md`.
2. Prose updates: structure.md:169, user-setup.md:70, execute-objective.md:9 AND execute-objective.md:871 (`/devflow:progress` -> `/devflow:status` — owned by this task, NOT task 2), skills/execute-objective/SKILL.md:22 — replace execute-job mentions with execute-trd equivalents (see research_context for exact targets).
3. execute-trd.md lines 89/106/129/218/238: remove the "identical to execute-job.md — see that workflow" / "Same as execute-job.md" cross-reference phrases, leaving the surrounding instructions self-contained (option b — minimal rewording, no content additions).
4. Verify zero remaining references: `grep -rn "execute-job" plugins/ README.md docs/ 2>/dev/null` returns nothing (excluding .planning/ history).
5. Delete: `git rm plugins/devflow/devflow/workflows/execute-job.md`.

Commit: `chore(23-03): repoint execute-job references and delete legacy workflow`
  </action>
  <verify>grep -rn "execute-job" plugins/ README.md returns no matches; test -f plugins/devflow/devflow/workflows/execute-trd.md succeeds; npm test shows no new failures</verify>
  <done>execute-job.md gone; job-prompt.md @-references resolve to execute-trd.md; no dangling references anywhere under plugins/</done>
  <recovery>git checkout -- plugins/devflow/devflow/workflows/execute-job.md restores the file if a missed load-bearing reference surfaces; re-grep, repoint, re-delete.</recovery>
</task>

<task type="auto">
  <name>Task 2: Delete 13 deprecated skill dirs + update deprecation language and stale name references</name>
  <files>plugins/devflow/skills/{add-objective,add-todo,audit-milestone,check-todos,complete-milestone,health,insert-objective,new-milestone,pause-work,plan-milestone-gaps,progress,remove-objective,resume-work}/, plugins/devflow/devflow/workflows/help.md, README.md, plugins/devflow/devflow/workflows/discuss-objective.md, plugins/devflow/devflow/workflows/check-todos.md, plugins/devflow/devflow/workflows/pause-work.md, plugins/devflow/devflow/workflows/progress.md, plugins/devflow/devflow/workflows/insert-objective.md</files>
  <action>
1. `git rm -r` the 13 skill directories listed in frontmatter (skills/ tree ONLY — workflows/ untouched; see anti_patterns).
2. workflows/insert-objective.md: flip frontmatter `status: active` → `status: legacy` and update line 116 `/devflow:add-objective` → `/devflow:objective add`.
3. Update stale consolidated-name references per research_context (execute-objective.md:871 already handled in task 1): discuss-objective.md:126, check-todos.md:33/123/139, pause-work.md:113, progress.md:376.
4. workflows/help.md deprecation appendix (~440-460): change "These old skill names still work but emit a deprecation warning and forward to the consolidated skill" to state the names were removed in v2.2; keep the old-name → consolidated-name table as migration guidance.
5. README.md:546: rewrite the "13 legacy skill names ... still work" callout to "removed in v2.2 — use the consolidated commands; run /devflow:help for the migration map".
6. Confirm DEPRECATION_MAP untouched: `git diff --stat plugins/devflow/devflow/bin/lib/skill-route.cjs` shows no changes.
7. Run `npm test` — skill-route suite green including WD1 (13 entries).

Commit: `chore(23-03): delete 13 deprecated redirect skills, update deprecation docs`
  </action>
  <verify>ls plugins/devflow/skills/ shows none of the 13 names; node --test plugins/devflow/devflow/bin/lib/skill-route.test.cjs passes (WD1 green); grep -n "still work" plugins/devflow/devflow/workflows/help.md README.md returns no deprecation-shim claims</verify>
  <done>13 dirs deleted; DEPRECATION_MAP intact at 13 entries; all SKILL_ROUTES workflow targets present; docs say "removed"</done>
  <recovery>git checkout -- plugins/devflow/skills/<name> restores any dir deleted in error. If WD1 fails, skill-route.cjs was modified — revert it; this TRD never edits it.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `for n in add-objective add-todo audit-milestone check-todos complete-milestone health insert-objective new-milestone pause-work plan-milestone-gaps progress remove-objective resume-work; do test ! -d "plugins/devflow/skills/$n" || echo "STILL EXISTS: $n"; done` — no output
- `for f in add-objective check-todos health pause-work progress audit-milestone; do test -f "plugins/devflow/devflow/workflows/$f.md" || echo "MISSING WORKFLOW: $f"; done` — no output (dispatch targets intact)
- `grep -rn "execute-job" plugins/ README.md` — no matches
- `head -3 plugins/devflow/devflow/workflows/insert-objective.md` — shows status: legacy
- `npm test` — zero new failures beyond the 12 known pre-existing; WD1 green
</verification>

<success_criteria>
- ~540 tokens of shim descriptions removed from every session load
- execute-job.md (14KB) deleted with zero dangling references
- Consolidated routing (`/devflow:objective add`, `/devflow:status`, `/devflow:todo list`) fully functional — SKILL_ROUTES and DEPRECATION_MAP byte-identical
</success_criteria>

<output>
After completion, create `.planning/objectives/23-claude-compatibility-cleanup/23-03-SUMMARY.md`
</output>
