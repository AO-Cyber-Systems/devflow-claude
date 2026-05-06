# Agent Spawning Convention

DevFlow ships 12 dedicated `df-*` agents in `plugins/devflow/agents/`. Each is specialized for a specific kind of work — its prompt encodes role-specific methodology, output format, and guardrails. When a workflow spawns a Task with `subagent_type="general-purpose"` for work that matches a dedicated agent's role, the specialization is bypassed and downstream phases (verification, prompt extraction, safety nets) lose their footing.

This document defines the rule for choosing `subagent_type` and indexes the 12 dedicated agents.

Background: the convention was codified in Phase E of the v1.2 milestone. See [Audit background](#background).

## The Rule

> When work matches a dedicated agent's role, use that agent's `subagent_type`.
> Use `subagent_type="general-purpose"` only for:
> - **Workflow invocations** — `Task(prompt="Run /devflow:<skill> ...")` calls that trampoline into a slash command. The slash command's body internally spawns dedicated agents; the outer Task is just a workflow runner, not agent work.
> - **Ad-hoc Tasks** that genuinely don't fit any DevFlow agent role.

## Decision tree

```
Is the Task prompt "Run /devflow:<skill> ..."?
  └── Yes → subagent_type="general-purpose"  (workflow invocation — correct as-is)
  └── No → continue
       │
       Does the work fit a dedicated agent's role? (see index below)
         └── Yes → subagent_type="<that-agent>"
         └── No  → subagent_type="general-purpose"  (ad-hoc)
                   If this pattern recurs, consider opening an issue
                   for a new dedicated agent (see "Adding a new agent").
```

## Agent index

| Agent | Description | When to use |
|---|---|---|
| `codebase-mapper` | Analyzes a codebase from a specific angle (stack, architecture, quality, or concerns) and writes structured findings. | Analyzing a codebase structure, stack, architecture, or code quality from a defined angle |
| `debugger` | Investigates bugs using a structured scientific method with persistent session state across context resets. | Root-cause investigation; gap-closure debug spawns; UAT failure triage |
| `executor` | Executes planned tasks with atomic git commits, handles deviations, and manages checkpoints during builds. | Running a TRD execution plan (task-by-task commits, checkpoint handling) |
| `integration-checker` | Verifies that separately-built features connect properly and end-to-end user workflows actually work. | Cross-TRD integration verification; confirming separately-built features connect |
| `job-checker` | Reviews execution plans before they run to verify they will actually achieve the objective goal. | Pre-flight review of a TRD plan; validating plan adequacy before execution starts |
| `objective-researcher` | Researches how to implement an objective — discovers best practices, patterns, and pitfalls before planning begins. | Gathering implementation guidance for a specific objective before the planner runs |
| `planner` | Creates detailed execution plans for objectives with task breakdown, dependency ordering, and built-in quality checks. | Creating or revising TRD plans; gap-closure re-planning |
| `project-researcher` | Researches the domain ecosystem for a new project — stack options, architecture patterns, features, and common pitfalls. | Parallel research threads on stack, features, architecture, or pitfalls for a new project |
| `research-synthesizer` | Combines findings from multiple parallel research agents into a unified summary for roadmap creation. | Consolidating outputs from parallel research agents into a single decision artifact |
| `roadmapper` | Creates project roadmaps by breaking requirements into ordered objectives with success criteria and dependency mapping. | Building a new project roadmap; ordering objectives with dependency mapping |
| `security-auditor` | Scans codebase for security vulnerabilities in a specific domain: secrets, auth flows, or dependency risks. | Parallel security audit threads (secrets, auth, config/dependencies) |
| `verifier` | Verifies that built code actually achieves the objective goal, not just that tasks were completed. | Post-execution objective verification; checking that built work meets success criteria |

## Worked examples

### Switch case — debug spawn

**Wrong:**
```python
Task(
    prompt=filled_debug_subagent_prompt,
    subagent_type="general-purpose",
    description="Debug: {truth_short}"
)
```

**Right:**
```python
Task(
    prompt=filled_debug_subagent_prompt,
    subagent_type="debugger",
    description="Debug: {truth_short}"
)
```

The work — root-cause investigation of a failing truth — matches `debugger.md`'s role exactly. The dedicated agent loads the scientific-method preamble, persistent-session-state behavior, and structured hypothesis tracking; the generic agent loads none of that.

### Switch case — research spawn for new project

**Wrong:**
```python
Task(
    prompt=stack_research_prompt,
    subagent_type="general-purpose",
    model=researcher_model,
    description="Research: stack options"
)
```

**Right:**
```python
Task(
    prompt=stack_research_prompt,
    subagent_type="project-researcher",
    model=researcher_model,
    description="Research: stack options"
)
```

Stack, features, architecture, and pitfalls research for a new project all fall squarely within `project-researcher.md`'s scope. Four parallel research threads in `new-project.md` were switched in the Phase E audit.

### Document case — workflow invocation (keep general-purpose)

**Right (do not change):**
```python
Task(
    prompt="Run /devflow:execute-objective ${OBJECTIVE} --auto",
    subagent_type="general-purpose",
    description="Execute Objective ${OBJECTIVE}"
)
```

This Task is a workflow trampoline — it invokes a slash command whose body internally spawns dedicated agents (executor, verifier, etc.). The outer Task itself does no agent-class work; it just starts a skill. There is no "skill-runner" agent, and switching to a dedicated agent would add an irrelevant preamble. General-purpose is correct for all `"Run /devflow:<skill> ..."` invocations.

### Document case — auto-advance pass-through (keep general-purpose)

**Right (do not change):**
```python
Task(
    prompt="Run /devflow:plan-objective ${OBJECTIVE} --auto",
    subagent_type="general-purpose",
    description="Plan Objective ${OBJECTIVE}"
)
```

Same category as above: workflow trampoline, not agent work. Both `discuss-objective.md` and `build.md` use this pattern correctly.

## How `subagent_type` resolves to an agent

The value of `subagent_type` matches the `name:` field in the agent's YAML frontmatter (which equals the filename without `.md`). Source files live at `plugins/devflow/agents/{name}.md` and are mirrored to `~/.claude/agents/` at session start by the `sync-runtime` hook. Claude Code's Task tool resolves `subagent_type="<name>"` by loading the corresponding agent from `~/.claude/agents/{name}.md`.

Implication: if an agent file is missing from `plugins/devflow/agents/`, no amount of `subagent_type` specification will load it. The 12 entries in the index above are the complete set for this milestone.

## Adding a new dedicated agent

If a recurring pattern of `general-purpose` Tasks emerges that doesn't fit any existing agent:

1. Open an issue describing the work pattern, frequency, and why it doesn't fit existing agents.
2. If approved, add `plugins/devflow/agents/{new-name}.md` with YAML frontmatter (`name`, `description`, `tools`, `color`) and an XML-structured body (`<role>`, `<process>`, etc.) following the existing agent template.
3. Update this document's Agent Index.
4. Switch the relevant Task calls from `general-purpose` to `{new-name}`.
5. Re-run `npm test` — the test suite validates agent file structure.

Do not invent agents in this document. The index reflects what exists; forward-looking additions require the PR process above.

## Background

The current convention was codified in [Phase E of the v1.2 milestone](../.planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md), which audited every `subagent_type` call across all workflow files in `plugins/devflow/devflow/workflows/`.

**Audit summary:**

- 40 total `subagent_type` spawns across 16 files
- 17 were `general-purpose` (audit targets)
- 14 of those 17 matched a dedicated agent's role and were switched in TRD 10-01
- 3 of those 17 were correct workflow invocations (`"Run /devflow:<skill> ..."`) — those were documented, not changed

Pre-fix session telemetry (498 sessions): 88 `general-purpose` spawns vs 200 dedicated — approximately 30% of subagent invocations bypassed specialization.

Tracking issue: [#30](https://github.com/AO-Cyber-Systems/devflow-claude/issues/30). Post-fix target: ≥85% dedicated-agent ratio.
