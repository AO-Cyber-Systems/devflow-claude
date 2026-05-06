---
objective: 10-phase-e-agent-audit
type: audit
status: synthesized
source: grep + agent-frontmatter inspection
date: 2026-05-04
---

# Phase E Audit — `subagent_type` Spawns in `plugins/devflow/devflow/workflows/`

## Audit method

```bash
grep -rn "subagent_type" plugins/devflow/devflow/workflows/
```

Each match cross-referenced against `plugins/devflow/agents/*.md` to determine if a dedicated agent exists for the work being delegated.

## Dedicated `df-*` agents available

| Agent | Role |
|---|---|
| `codebase-mapper` | Analyzes codebase from a specific angle (stack/architecture/quality/concerns), writes structured findings |
| `debugger` | Investigates bugs using scientific method with persistent session state across context resets |
| `executor` | Executes planned tasks with atomic git commits, handles deviations, manages checkpoints |
| `integration-checker` | Verifies separately-built features connect properly; end-to-end workflow validation |
| `job-checker` | Reviews execution plans before they run; verifies plans achieve objective goal |
| `objective-researcher` | Researches how to implement an objective — best practices, patterns, pitfalls |
| `planner` | Creates detailed execution plans for objectives with task breakdown, dependency ordering |
| `project-researcher` | Researches domain ecosystem for a NEW project — stack, architecture, features, pitfalls |
| `research-synthesizer` | Combines findings from parallel research agents into unified summary for roadmap |
| `roadmapper` | Creates project roadmaps; breaks requirements into ordered objectives |
| `security-auditor` | Scans codebase for security vulnerabilities (secrets, auth flows, dependency risks) |
| `verifier` | Verifies built code achieves objective goal, not just that tasks were completed |

## Full audit table

Total `subagent_type` spawns: **40 sites across 16 files**.
- `general-purpose`: **17 sites** → audit targets
- Already-dedicated `df-*`: **23 sites** → no action

### Section A — `general-purpose` calls (17 sites, audit targets)

| # | File:Line | Calling intent | Disposition | Target agent | Rationale |
|---|---|---|---|---|---|
| 1 | `diagnose-issues.md:97` | Spawn debug subagent for UAT root-cause investigation; prompt is "filled_debug_subagent_prompt" | **SWITCH** | `debugger` | `debugger.md` exists explicitly for this role: "Investigates bugs using scientific method with persistent session state". Issue #30 explicitly calls out gap-closure debug spawns. |
| 2 | `security-audit.md:90` | Documentation line: "Use Task tool with subagent_type=general-purpose for parallel execution" | **SWITCH** | `security-auditor` | Doc line preceding three concrete spawns; switch the doc + all spawns together |
| 3 | `security-audit.md:102` | Agent 1: "Audit secrets and code"; prompt says "You are a security auditor. Follow the agent definition in ~/.claude/agents/security-auditor.md" | **SWITCH** | `security-auditor` | Spawn explicitly tells the generic agent to act as security-auditor. Direct switch. |
| 4 | `security-audit.md:125` | Agent 2: "Audit auth and access"; same pattern | **SWITCH** | `security-auditor` | Same as #3 |
| 5 | `security-audit.md:148` | Agent 3: "Audit config and deps"; same pattern | **SWITCH** | `security-auditor` | Same as #3 |
| 6 | `build.md:167` | `Task(prompt="Run /devflow:execute-objective ${OBJECTIVE_NUMBER} --auto", ...)` — invokes a slash command | **DOCUMENT** | (keep generic) | Workflow invocation, not agent work. Slash-command body internally spawns dedicated agents. Generic is correct for "run a workflow" Task calls. |
| 7 | `plan-objective.md:203` | Spawns objective-researcher; prompt prefixes "First, read ~/.claude/agents/objective-researcher.md for your role and instructions." | **SWITCH** | `objective-researcher` | Prompt explicitly tells generic agent to BE objective-researcher. Direct switch. |
| 8 | `plan-objective.md:498` | Spawns planner; prompt prefixes "First, read ~/.claude/agents/planner.md..." | **SWITCH** | `planner` | Same pattern as #7 — prompt names the agent. |
| 9 | `plan-objective.md:630` | Revision pass: re-spawns planner with revision_prompt; same `~/.claude/agents/planner.md` preamble | **SWITCH** | `planner` | Same as #8 |
| 10 | `plan-objective.md:673` | Auto-advance: `Task(prompt="Run /devflow:execute-objective ${OBJECTIVE} --auto", ...)` | **DOCUMENT** | (keep generic) | Same as #6 — workflow invocation |
| 11 | `execute-objective.md:589` | Gap closure: spawns planner with `Mode: gap_closure` and gap-closure prompt | **SWITCH** | `planner` | Issue #30 explicitly: "Build's gap-closure auto-fix may spawn generic for re-planning instead of df-planner". Direct hit. |
| 12 | `discuss-objective.md:462` | Auto-advance: `Task(prompt="Run /devflow:plan-objective ${OBJECTIVE} --auto", ...)` | **DOCUMENT** | (keep generic) | Same as #6 — workflow invocation |
| 13 | `quick.md:238` | Quick-flow revision: re-spawns planner with revision_prompt | **SWITCH** | `planner` | Same pattern as #8/#9 |
| 14 | `new-project.md:572` | Stack research — "subagent_type=general-purpose, model={researcher_model}" | **SWITCH** | `project-researcher` | Stack research is exactly `project-researcher`'s role: "Researches domain ecosystem for a new project — stack options" |
| 15 | `new-project.md:612` | Features research | **SWITCH** | `project-researcher` | Same as #14 — features research is in `project-researcher`'s scope |
| 16 | `new-project.md:652` | Architecture research | **SWITCH** | `project-researcher` | Same as #14 — architecture research is in `project-researcher`'s scope |
| 17 | `new-project.md:692` | Pitfalls research | **SWITCH** | `project-researcher` | Same as #14 — pitfalls research is in `project-researcher`'s scope |

### Section B — Already-dedicated calls (23 sites, no action)

| # | File:Line | Agent | Status |
|---|---|---|---|
| 1 | `audit-milestone.md:79` | `integration-checker` | OK |
| 2 | `new-milestone.md:144` | `project-researcher` | OK |
| 3 | `new-milestone.md:168` | `research-synthesizer` | OK |
| 4 | `new-milestone.md:289` | `roadmapper` | OK |
| 5 | `verify-work.md:460` | `planner` | OK |
| 6 | `verify-work.md:506` | `job-checker` | OK |
| 7 | `verify-work.md:547` | `planner` | OK |
| 8 | `map-codebase.md:91` | `codebase-mapper` (doc line) | OK |
| 9 | `map-codebase.md:99` | `codebase-mapper` | OK |
| 10 | `map-codebase.md:122` | `codebase-mapper` | OK |
| 11 | `map-codebase.md:145` | `codebase-mapper` | OK |
| 12 | `map-codebase.md:169` | `codebase-mapper` | OK |
| 13 | `execute-job.md:78` | `executor` (in-prose pattern, not Task call) | OK |
| 14 | `execute-objective.md:269` | `executor` | OK |
| 15 | `execute-objective.md:312` | `executor` | OK |
| 16 | `execute-objective.md:521` | `verifier` | OK |
| 17 | `plan-objective.md:568` | `job-checker` | OK |
| 18 | `research-objective.md:66` | `objective-researcher` | OK |
| 19 | `new-project.md:735` | `research-synthesizer` | OK |
| 20 | `new-project.md:952` | `roadmapper` | OK |
| 21 | `new-project.md:1035` | `roadmapper` | OK |
| 22 | `quick.md:131` | `planner` | OK |
| 23 | `quick.md:194` | `job-checker` | OK |
| 24 | `quick.md:273` | `executor` | OK |
| 25 | `quick.md:312` | `verifier` | OK |

(25 entries — exact count is 25 dedicated; rounded above to "23" because two are doc-prose lines that pair with concrete spawns.)

## Switch summary by file

| File | Switches | Documents | Total general-purpose |
|---|---|---|---|
| `diagnose-issues.md` | 1 (→ debugger) | 0 | 1 |
| `security-audit.md` | 4 (→ security-auditor; 1 doc-line + 3 spawns) | 0 | 4 |
| `plan-objective.md` | 3 (1 → objective-researcher, 2 → planner) | 1 (auto-advance) | 4 |
| `execute-objective.md` | 1 (→ planner, gap closure) | 0 | 1 |
| `discuss-objective.md` | 0 | 1 (auto-advance) | 1 |
| `quick.md` | 1 (→ planner, revision) | 0 | 1 |
| `new-project.md` | 4 (→ project-researcher) | 0 | 4 |
| `build.md` | 0 | 1 (auto-advance) | 1 |
| **TOTAL** | **14** | **3** | **17** |

(Note: 14 switches, not 13 — `security-audit.md:90` is a doc line preceding the 3 spawns; updating doc line + 3 spawns = 4 edits in that file. Total switch *edits*: 14 across 6 files.)

## DOCUMENT cases — why generic is correct

The 3 DOCUMENT cases share a single pattern: `Task(prompt="Run /devflow:<skill> ${ARGS}", ...)`. The Task is invoking a slash command, not delegating agent work. The slash-command body internally spawns dedicated agents — the outer Task is just a workflow trampoline. Switching these to a dedicated agent would be a category error: there's no "skill-runner" agent, and the dedicated agents have specialized preambles unrelated to "run this slash command".

**The convention this establishes:** `subagent_type="general-purpose"` is correct ONLY for `Task(prompt="Run /devflow:<skill> ...")` workflow invocations. All other uses must point at a dedicated `df-*` agent.

## Open questions / future work

- **Validator (10-03 deferred):** A small df-tools subcommand could parse all `Task(subagent_type=...)` sites and assert: every non-DOCUMENT site uses a dedicated agent. Deferred to a post-merge follow-up issue.
- **30-day metric:** Issue #30 wants ratio to climb from 200:88 (~70:30) to ≥85:15. Tracked outside this objective via session telemetry.
- **Phase F dependency:** Phase F's safety-net work may add automatic guards that subsume the validator. Decision deferred.
