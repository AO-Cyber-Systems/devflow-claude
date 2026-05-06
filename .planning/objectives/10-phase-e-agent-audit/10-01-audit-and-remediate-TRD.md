---
objective: 10-phase-e-agent-audit
trd: 01
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/workflows/diagnose-issues.md
  - plugins/devflow/devflow/workflows/security-audit.md
  - plugins/devflow/devflow/workflows/plan-objective.md
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/workflows/quick.md
  - plugins/devflow/devflow/workflows/new-project.md
autonomous: true
requirements:
  - PHASE-E-AUDIT
  - PHASE-E-REMEDIATE

must_haves:
  truths:
    - "All 17 general-purpose spawns audited with disposition (already in 10-RESEARCH.md)"
    - "All 14 switch sites use the dedicated df-* agent name"
    - "All 3 document-cases (workflow invocations) still use general-purpose"
    - "All 25 already-correct dedicated spawns remain unchanged"
    - "grep verifies post-edit subagent_type distribution matches expected"
  artifacts:
    - path: ".planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md"
      provides: "Audit table — 17 general-purpose sites + 25 dedicated sites with rationale"
      contains: "Section A — `general-purpose` calls"
    - path: "plugins/devflow/devflow/workflows/diagnose-issues.md"
      provides: "diagnose-issues debug spawn switched to debugger agent"
      contains: 'subagent_type="debugger"'
    - path: "plugins/devflow/devflow/workflows/security-audit.md"
      provides: "security-audit spawns switched to security-auditor agent"
      contains: 'subagent_type="security-auditor"'
    - path: "plugins/devflow/devflow/workflows/plan-objective.md"
      provides: "Researcher + planner spawns switched; auto-advance unchanged"
      contains: 'subagent_type="planner"'
    - path: "plugins/devflow/devflow/workflows/execute-objective.md"
      provides: "Gap-closure planner spawn switched to planner agent"
      contains: 'subagent_type="planner"'
    - path: "plugins/devflow/devflow/workflows/quick.md"
      provides: "Quick-flow revision planner spawn switched"
      contains: 'subagent_type="planner"'
    - path: "plugins/devflow/devflow/workflows/new-project.md"
      provides: "4 research spawns switched to project-researcher"
      contains: 'subagent_type="project-researcher"'
  key_links:
    - from: "diagnose-issues.md spawn"
      to: "agents/debugger.md"
      via: "subagent_type='debugger' + @~/.claude/agents/debugger.md preamble"
      pattern: 'subagent_type="debugger"'
    - from: "security-audit.md spawns (×3)"
      to: "agents/security-auditor.md"
      via: "subagent_type='security-auditor' (existing prompts already reference the agent)"
      pattern: 'subagent_type="security-auditor"'
    - from: "plan-objective.md researcher spawn"
      to: "agents/objective-researcher.md"
      via: "subagent_type='objective-researcher'"
      pattern: 'subagent_type="objective-researcher"'
    - from: "plan-objective.md / execute-objective.md / quick.md planner spawns"
      to: "agents/planner.md"
      via: "subagent_type='planner'"
      pattern: 'subagent_type="planner"'
    - from: "new-project.md research spawns (×4)"
      to: "agents/project-researcher.md"
      via: "subagent_type='project-researcher'"
      pattern: 'subagent_type="project-researcher"'
---

<objective>
Audit every `subagent_type` call in `plugins/devflow/devflow/workflows/` and remediate misuse in a single pass. Switch 14 sites across 6 files from `subagent_type="general-purpose"` to the appropriate dedicated `df-*` agent. Leave the 3 workflow-invocation sites (build.md auto-advance, plan-objective.md auto-advance, discuss-objective.md auto-advance) unchanged — those are correct generic uses.

Purpose: Restore the specialization the dedicated agents were built for. Generic-agent spawns skip the dedicated agent's preamble (debugger's scientific method, security-auditor's threat-model framing, project-researcher's stack-survey discipline, planner's TRD anatomy, etc.). Issue #30 telemetry shows ~30% of subagent invocations bypass specialization; this TRD closes that gap on the workflow side.

Output:
- `.planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md` (already exists — produced during planning; executor verifies it's authoritative)
- 6 modified workflow files with `subagent_type` switched in 14 specific sites
- One git commit per file (6 commits) so each change is reviewable in isolation; OR one commit if executor judges the diffs are uniform enough — see "Commit strategy" below
</objective>

<file_tree>
plugins/devflow/devflow/workflows/
├── diagnose-issues.md          ← MODIFY (1 site)
├── security-audit.md           ← MODIFY (4 sites: 1 doc line + 3 spawns)
├── plan-objective.md           ← MODIFY (3 sites — leave auto-advance unchanged)
├── execute-objective.md        ← MODIFY (1 site — gap closure)
├── quick.md                    ← MODIFY (1 site — revision)
└── new-project.md              ← MODIFY (4 sites — research spawns)

.planning/objectives/10-phase-e-agent-audit/
└── 10-RESEARCH.md              ← READ (audit table is the source of truth)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
<!-- Pattern A: dedicated-agent spawn (the target shape) -->
<!-- From plugins/devflow/devflow/workflows/verify-work.md:506 -->
```
Task(
  prompt="First, read ~/.claude/agents/job-checker.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="job-checker",
  model="{checker_model}",
  description="Check plan quality"
)
```

<!-- Pattern B: workflow-invocation spawn (legitimate generic — DO NOT change) -->
<!-- From plugins/devflow/devflow/workflows/build.md:165 -->
```
Task(
  prompt="Run /devflow:execute-objective ${OBJECTIVE_NUMBER} --auto",
  subagent_type="general-purpose",
  description="Execute Objective ${OBJECTIVE_NUMBER}"
)
```

<!-- Pattern C: misuse — current state at switch sites -->
<!-- From plugins/devflow/devflow/workflows/plan-objective.md:498 -->
```
Task(
  prompt="First, read ~/.claude/agents/planner.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",   ← should be "planner"
  model="{planner_model}",
  description="Plan Objective {objective}"
)
```
The fix is mechanical: change `subagent_type` value. Prompt text already names the agent.
</codebase_examples>

<anti_patterns>
- **DO NOT** change the prompt text. The "First, read ~/.claude/agents/{agent}.md..." preamble in switched sites is harmless redundancy when subagent_type already loads the agent — keep it for now (Phase H may dedupe later). Touching prompts adds review surface and risks breaking arg interpolation.
- **DO NOT** change `model="{...}"` parameters. Model resolution is orthogonal; changing it is out-of-scope for this TRD.
- **DO NOT** touch the 3 workflow-invocation sites (build.md:167, plan-objective.md:673, discuss-objective.md:462). Those Task calls invoke slash commands, not agents — generic is correct. Verifying you didn't touch them is part of `<verify>`.
- **DO NOT** add new spawn sites. This TRD edits existing sites only.
- **DO NOT** rename agents. Existing agent files at `plugins/devflow/agents/{name}.md` provide the names to use; do not invent new ones.
</anti_patterns>

<error_recovery>
- **If a switched site uses a description that no longer matches the agent role:** leave the description as-is. Descriptions are free-form; the agent doesn't read them.
- **If `~/.claude/agents/{name}.md` reference in the prompt is stale:** confirm the file exists at `plugins/devflow/agents/{name}.md` (these mirror to `~/.claude/agents/` via sync-runtime hook). If the agent file is missing, STOP and report — this is a planning bug.
- **If grep verification shows unexpected count:** re-run `grep -rn "subagent_type" plugins/devflow/devflow/workflows/` and diff against `10-RESEARCH.md` Section A. The audit table is the source of truth. Any deviation = revert and re-plan.
- **Rollback:** `git restore plugins/devflow/devflow/workflows/{file}.md` per file. All edits are line-level mechanical replacements; no structural risk.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/10-phase-e-agent-audit/10-CONTEXT.md
@.planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md

# Reference for agent names + roles
@plugins/devflow/agents/debugger.md
@plugins/devflow/agents/security-auditor.md
@plugins/devflow/agents/planner.md
@plugins/devflow/agents/objective-researcher.md
@plugins/devflow/agents/project-researcher.md
</context>

<gotchas>
- **Agent file mirror:** `plugins/devflow/agents/{name}.md` is the source; `~/.claude/agents/{name}.md` is a runtime mirror via the `sync-runtime` SessionStart hook. Edit the source. The `subagent_type="{name}"` value matches the `name:` frontmatter field of the agent file (which equals the filename without `.md`).
- **`security-audit.md:90` is prose, not a Task call.** It's a documentation line: "Use Task tool with `subagent_type=\"general-purpose\"`...". Update the prose to say `subagent_type="security-auditor"` to keep doc + code in sync. The 3 actual Task calls are at 102/125/148.
- **`plan-objective.md:673` is the auto-advance Task — leave it.** Don't accidentally edit it while editing 498 and 630. Visually distinct: prompt is `"Run /devflow:execute-objective..."` (workflow invocation) vs the others which start with `"First, read ~/.claude/agents/..."`.
- **`new-project.md` has 7 subagent_type calls total** — 4 are general-purpose research spawns (572/612/652/692) which switch to `project-researcher`; 3 are already correct (`research-synthesizer` at 735, `roadmapper` at 952/1035). Touch only the 4.
- **`quick.md` has 5 subagent_type calls** — 4 already correct (`planner`/`job-checker`/`executor`/`verifier`); 1 misuse at 238 (revision spawn → `planner`). Touch only line 238.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Apply 14 switches across 6 workflow files (audit table is authoritative)</name>
  <files>
    plugins/devflow/devflow/workflows/diagnose-issues.md
    plugins/devflow/devflow/workflows/security-audit.md
    plugins/devflow/devflow/workflows/plan-objective.md
    plugins/devflow/devflow/workflows/execute-objective.md
    plugins/devflow/devflow/workflows/quick.md
    plugins/devflow/devflow/workflows/new-project.md
  </files>
  <action>
For each switch row in `.planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md` Section A (Disposition = SWITCH), perform the edit:

Approach (per file):
1. Read the file.
2. Locate the line(s) called out in the audit table (line numbers are advisory — match by surrounding context: the prompt starts with `"First, read ~/.claude/agents/{agent}.md..."` for switch sites; the prompt starts with `"Run /devflow:..."` for DOCUMENT sites).
3. Use Edit tool with exact-string replacement: change `subagent_type="general-purpose"` to `subagent_type="{target-agent}"` per the table.
4. For `security-audit.md:90` (prose line), update the prose: `Use Task tool with subagent_type="security-auditor"...` (preserve surrounding text).

Mapping (from 10-RESEARCH.md Section A):

| File | Line(s) | New subagent_type |
|---|---|---|
| diagnose-issues.md | 97 | `debugger` |
| security-audit.md | 90 (prose), 102, 125, 148 | `security-auditor` (all 4) |
| plan-objective.md | 203 | `objective-researcher` |
| plan-objective.md | 498 | `planner` |
| plan-objective.md | 630 | `planner` |
| plan-objective.md | 673 | **DO NOT TOUCH** (workflow invocation) |
| execute-objective.md | 589 | `planner` |
| quick.md | 238 | `planner` |
| new-project.md | 572, 612, 652, 692 | `project-researcher` (all 4) |

# CRITICAL: Do not modify line 673 in plan-objective.md (auto-advance workflow invocation — generic is correct)
# CRITICAL: Do not modify line 167 in build.md or line 462 in discuss-objective.md (same pattern; not in your file list, but verify-grep step will confirm)
# GOTCHA: security-audit.md:90 is a documentation prose line, not a Task() call — edit the prose to match
# GOTCHA: Use exact-string Edit calls; do not regex-replace across files (risk of false hits in code-block examples within agent prompts)
# PATTERN: Each switch is a single string replacement. No prompt text changes. No model changes. No new code.

Commit strategy:
- Single commit covering all 6 files: `fix(10): switch 14 misused general-purpose spawns to dedicated df-* agents`
- OR per-file commits if executor judges that easier to review (acceptable; both satisfy DevFlow conventions)
  </action>
  <verify>
After edits, run:

```bash
grep -rn "subagent_type" plugins/devflow/devflow/workflows/ | sort
```

Expected post-edit distribution:
- `general-purpose`: exactly **3 sites** — `build.md:167`, `discuss-objective.md:462`, `plan-objective.md:673` (line numbers may shift slightly post-edit; the count is what matters: 3 occurrences, all in `Task(prompt="Run /devflow:..." ...)` workflow-invocation Tasks)
- `debugger`: 1 site (diagnose-issues.md)
- `security-auditor`: 4 sites (security-audit.md — 1 prose line + 3 spawns)
- `objective-researcher`: 2 sites (plan-objective.md:203 + research-objective.md:66 — pre-existing)
- `planner`: 6 sites (plan-objective.md:498/630, execute-objective.md:589, quick.md:131/238, verify-work.md:460/547 — counts include pre-existing)
- `project-researcher`: 5 sites (new-project.md:572/612/652/692, new-milestone.md:144 — counts include pre-existing)
- `executor`: unchanged (3 sites pre-existing)
- `verifier`: unchanged (2 sites pre-existing)
- `job-checker`: unchanged (3 sites pre-existing)
- `integration-checker`: unchanged (1 site pre-existing)
- `codebase-mapper`: unchanged (5 sites pre-existing)
- `research-synthesizer`: unchanged (2 sites pre-existing)
- `roadmapper`: unchanged (3 sites pre-existing)

Spot-check: Confirm `general-purpose` count dropped from 17 → 3 (delta = 14 switches).

Smoke test:
```bash
# Confirm each switch target exists as an agent file
for agent in debugger security-auditor objective-researcher planner project-researcher; do
  test -f "plugins/devflow/agents/${agent}.md" && echo "OK: ${agent}" || echo "MISSING: ${agent}"
done
```
All 5 should print `OK`.

Test suite:
```bash
npm test
```
Should pass (no test changes; workflow markdown isn't unit-tested).
  </verify>
  <done>
- All 14 switch sites changed from `general-purpose` to the agent name from the audit table
- All 3 workflow-invocation sites (build.md:167, plan-objective.md:673, discuss-objective.md:462) UNCHANGED — still `general-purpose`
- `grep` shows exactly 3 remaining `general-purpose` occurrences in `plugins/devflow/devflow/workflows/`
- All 5 target agent files (debugger.md, security-auditor.md, objective-researcher.md, planner.md, project-researcher.md) exist
- `npm test` passes (no regressions)
- Edits committed (single commit OR 6 per-file commits, executor's call)
  </done>
  <recovery>
- **Per-file rollback:** `git restore plugins/devflow/devflow/workflows/{file}.md`
- **If grep count is wrong:** Re-read `10-RESEARCH.md` Section A. Diff actual edits against the table. Most likely cause: skipped a site or accidentally edited a workflow-invocation Task. Restore + redo.
- **If an agent file is missing:** STOP. Do not invent. Report which agent is missing — this is a planning bug, not an execution issue.
- **If `npm test` fails:** Tests don't cover workflow markdown directly; a failure here is unrelated to this TRD's edits. Investigate the failure independently — but the failure is unlikely to be caused by this TRD.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. **Audit table is on disk:** `.planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md` exists and contains Section A with 17 entries (already produced during planning).
2. **Grep verification:** `grep -rn "subagent_type" plugins/devflow/devflow/workflows/` shows exactly 3 `general-purpose` occurrences post-edit (down from 17).
3. **Agent existence:** All 5 switch-target agent files exist at `plugins/devflow/agents/{name}.md`.
4. **No regressions:** `npm test` still passes (443/443 baseline; this TRD adds zero tests).
5. **Workflow-invocation sites untouched:** build.md, plan-objective.md:673, discuss-objective.md:462 still use `general-purpose` (these are the 3 expected remaining sites).
</verification>

<success_criteria>
- [ ] 14 sites switched in 6 files per `10-RESEARCH.md` Section A mapping
- [ ] 3 workflow-invocation sites preserved (build, plan-objective auto-advance, discuss-objective auto-advance)
- [ ] grep shows 3 `general-purpose` remaining (down from 17 — delta = 14)
- [ ] All target agents exist in `plugins/devflow/agents/`
- [ ] `npm test` passes
- [ ] Edits committed (1 or 6 commits)
- [ ] SUMMARY.md written
</success_criteria>

<output>
After completion, create `.planning/objectives/10-phase-e-agent-audit/10-01-SUMMARY.md` with:
- File-by-file diff summary (which sites switched per file)
- Final grep snapshot (post-edit subagent_type distribution)
- Confirmation that 3 workflow-invocation sites are intentionally preserved
- Commit hash(es)
</output>
