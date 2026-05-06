---
objective: 10-phase-e-agent-audit
trd: 02
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - docs/agent-spawning-convention.md
autonomous: true
requirements:
  - PHASE-E-CONVENTION-DOC

must_haves:
  truths:
    - "docs/agent-spawning-convention.md exists at repo root (not inside .planning/)"
    - "Doc states the rule: dedicated agent when work matches a df-* role; general-purpose only for ad-hoc Tasks (and workflow invocations)"
    - "Doc lists all 12 dedicated agents with one-line role + when-to-use"
    - "Doc shows ≥2 worked examples: one switch case (e.g., debug spawn → debugger) and one document case (workflow invocation → keep generic)"
    - "Doc references the audit (10-RESEARCH.md) as the historical justification"
  artifacts:
    - path: "docs/agent-spawning-convention.md"
      provides: "Convention rule + decision tree + agent index + worked examples"
      min_lines: 80
      contains: "## Rule"
  key_links:
    - from: "docs/agent-spawning-convention.md"
      to: "plugins/devflow/agents/*.md"
      via: "Agent index lists each dedicated agent by file basename"
      pattern: "debugger|security-auditor|planner|project-researcher|objective-researcher|executor|verifier|job-checker|integration-checker|codebase-mapper|roadmapper|research-synthesizer"
    - from: "docs/agent-spawning-convention.md"
      to: ".planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md"
      via: "Doc references the audit as background"
      pattern: "10-RESEARCH.md|Phase E"
---

<objective>
Write `docs/agent-spawning-convention.md` codifying the rule for `subagent_type` selection so future workflows don't regress to generic-agent misuse. The doc lives at repo root in `docs/` (NOT inside `.planning/`) per #30 spec — externally discoverable.

Purpose: The audit (TRD 10-01) fixes the current 14 misuse sites. Without a written convention, the next workflow author has no signal on which agent to spawn — and the regression returns. This doc is the durable artifact that lets reviewers reject misuse on PR review.

Output:
- `docs/agent-spawning-convention.md` — single-file documentation
- One git commit: `docs(10): add agent-spawning convention`
</objective>

<file_tree>
docs/
└── agent-spawning-convention.md   ← CREATE

(reference only — DO NOT modify)
plugins/devflow/agents/
├── codebase-mapper.md
├── debugger.md
├── executor.md
├── integration-checker.md
├── job-checker.md
├── objective-researcher.md
├── planner.md
├── project-researcher.md
├── research-synthesizer.md
├── roadmapper.md
├── security-auditor.md
└── verifier.md
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
<!-- Existing repo-root docs/ pattern — for tone and structure reference -->
<!-- (executor: ls docs/ to see siblings; CLAUDE.md mentions docs/PROPOSAL-kind-and-work.md) -->

<!-- Pattern: agent frontmatter (the source of truth for agent names + roles) -->
<!-- From plugins/devflow/agents/debugger.md (first 5 lines) -->
```
---
name: debugger
description: Investigates bugs using a structured scientific method with persistent session state across context resets.
tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch
color: orange
---
```

The doc's agent index pulls from these `description:` lines verbatim (or lightly compressed).
</codebase_examples>

<anti_patterns>
- **DO NOT** put the doc inside `.planning/`. Issue #30 explicitly says `docs/agent-spawning-convention.md` (repo-rooted). External contributors discover it via repo browse, not by walking `.planning/`.
- **DO NOT** duplicate the full audit table here. Reference `10-RESEARCH.md` for the historical audit; this doc is forward-looking convention, not retrospective inventory.
- **DO NOT** prescribe model selection or prompt content. Convention scope: which `subagent_type` value to choose. Model resolution and prompt design are separate concerns.
- **DO NOT** invent new agents. The doc indexes the 12 that exist; if a future workflow needs work that fits no existing agent, the answer is "use general-purpose AND open an issue to consider a new dedicated agent" — but inventing one in this doc is out-of-scope.
</anti_patterns>

<error_recovery>
- **If `docs/` does not exist at repo root:** create it (`mkdir -p docs`). Per CLAUDE.md mention of `docs/PROPOSAL-kind-and-work.md`, the dir likely exists; verify with `ls docs/` first.
- **If an agent's `description:` field is unclear:** use the agent's first paragraph or `<role>` block summary instead. The doc's index should be skimmable; a verbose description from frontmatter is fine to compress.
- **If the doc gets too long:** trim worked examples. The Rule + Agent Index are load-bearing; examples are illustrative. Target 80-200 lines total.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/10-phase-e-agent-audit/10-CONTEXT.md
@.planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md

# Agent files — read frontmatter for name + description
@plugins/devflow/agents/codebase-mapper.md
@plugins/devflow/agents/debugger.md
@plugins/devflow/agents/executor.md
@plugins/devflow/agents/integration-checker.md
@plugins/devflow/agents/job-checker.md
@plugins/devflow/agents/objective-researcher.md
@plugins/devflow/agents/planner.md
@plugins/devflow/agents/project-researcher.md
@plugins/devflow/agents/research-synthesizer.md
@plugins/devflow/agents/roadmapper.md
@plugins/devflow/agents/security-auditor.md
@plugins/devflow/agents/verifier.md
</context>

<gotchas>
- **`docs/` is NOT `plugins/devflow/devflow/references/`.** The references dir is for runtime-mirrored agent-readable docs. `docs/` at repo root is for human-readable contributor docs (PROPOSAL-kind-and-work.md style). This convention doc goes in repo-root `docs/`.
- **Agent count = 12** (codebase-mapper, debugger, executor, integration-checker, job-checker, objective-researcher, planner, project-researcher, research-synthesizer, roadmapper, security-auditor, verifier). CLAUDE.md mentions "12 subagent prompts" — confirm with `ls plugins/devflow/agents/`.
- **The "DOCUMENT" disposition is a real thing** — workflow-invocation Tasks (`Task(prompt="Run /devflow:..." ...)`) are correct as `general-purpose`. The doc must call this out explicitly so reviewers don't over-correct in the other direction.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Write docs/agent-spawning-convention.md</name>
  <files>docs/agent-spawning-convention.md</files>
  <action>
Create `docs/agent-spawning-convention.md` with the following structure (executor adapts wording but preserves all sections):

```markdown
# Agent Spawning Convention

DevFlow ships 12 dedicated `df-*` agents in `plugins/devflow/agents/`. Each is specialized for a specific kind of work — its prompt encodes role-specific methodology, output format, and guardrails. When a workflow spawns a Task with `subagent_type="general-purpose"` for work that matches a dedicated agent's role, the specialization is bypassed and downstream phases (verification, prompt extraction, safety nets) lose their footing.

This document defines the rule for choosing `subagent_type` and indexes the 12 dedicated agents.

## The Rule

> When work matches a dedicated agent's role, use that agent's `subagent_type`.
> Use `subagent_type="general-purpose"` only for:
> - **Workflow invocations** — `Task(prompt="Run /devflow:<skill> ...")` calls that trampoline into a slash command. The slash command's body internally spawns dedicated agents; the outer Task is just a workflow runner, not agent work.
> - **Ad-hoc Tasks** that genuinely don't fit any DevFlow agent role.

## Decision tree

```
Is the Task prompt "Run /devflow:<skill> ..."?
  └── Yes → subagent_type="general-purpose"  (workflow invocation)
  └── No → continue
       │
       Does the work fit a dedicated agent's role? (see index below)
         └── Yes → subagent_type="<that-agent>"
         └── No  → subagent_type="general-purpose"  (ad-hoc — consider opening an
                                                     issue for a new dedicated agent
                                                     if this pattern recurs)
```

## Agent index

| Agent | When to use |
|---|---|
| `codebase-mapper` | Analyzing a codebase from a specific angle (stack/architecture/quality/concerns) and writing structured findings |
| `debugger` | Investigating a bug; root-cause analysis with scientific method; gap-closure debug spawns |
| `executor` | Executing a planned TRD with atomic commits, checkpoint handling, deviation logging |
| `integration-checker` | Verifying separately-built features connect end-to-end (cross-TRD integration) |
| `job-checker` | Reviewing an execution plan before it runs to verify it will achieve the objective goal |
| `objective-researcher` | Researching how to implement a specific objective — best practices, patterns, pitfalls |
| `planner` | Creating execution plans for objectives (TRD breakdown, dependency ordering, must-haves) |
| `project-researcher` | Researching the domain ecosystem for a NEW project — stack options, features, architecture |
| `research-synthesizer` | Combining findings from parallel research agents into a unified summary for roadmap creation |
| `roadmapper` | Creating project roadmaps; breaking requirements into ordered objectives with dependencies |
| `security-auditor` | Scanning a codebase for security vulnerabilities (secrets, auth, dependencies) |
| `verifier` | Verifying built code achieves the objective goal (not just task completion) |

## Worked examples

### Switch case — debug spawn

**Wrong:**
```
Task(
  prompt=filled_debug_subagent_prompt,
  subagent_type="general-purpose",
  description="Debug: {truth_short}"
)
```

**Right:**
```
Task(
  prompt=filled_debug_subagent_prompt,
  subagent_type="debugger",
  description="Debug: {truth_short}"
)
```

The work — root-cause investigation — matches `debugger.md`'s role exactly. The dedicated agent loads the scientific-method preamble and persistent-session-state behavior; the generic agent does not.

### Document case — workflow invocation

**Right (do not change):**
```
Task(
  prompt="Run /devflow:execute-objective ${OBJECTIVE} --auto",
  subagent_type="general-purpose",
  description="Execute Objective ${OBJECTIVE}"
)
```

This Task is a workflow trampoline — it invokes a slash command whose body internally spawns dedicated agents (executor, verifier, etc.). There is no "skill-runner" agent, and dedicating one would just add a layer. Generic is correct.

## How `subagent_type` resolves to an agent

The value of `subagent_type` matches the `name:` field in the agent's frontmatter (which equals the filename without `.md`). Source files live at `plugins/devflow/agents/{name}.md` and are mirrored to `~/.claude/agents/` at session start by the `sync-runtime` hook. Claude Code's Task tool resolves `subagent_type="<name>"` by loading the corresponding agent file.

## Adding a new dedicated agent

If a recurring pattern of `general-purpose` Tasks emerges that doesn't fit any existing agent:

1. Open an issue describing the work pattern, frequency, and why it doesn't fit existing agents.
2. If approved, add `plugins/devflow/agents/{new-name}.md` with frontmatter (`name`, `description`, `tools`, `color`) and an XML-structured body (`<role>`, `<process>`, etc.) following the existing agent template.
3. Update this document's agent index.
4. Switch the relevant Task call(s) from `general-purpose` to `{new-name}`.

## Background

The current convention was codified in [Phase E of the v1.2 milestone](../.planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md), which audited every `subagent_type` call in `plugins/devflow/devflow/workflows/` and found 14 sites across 6 files using `general-purpose` for work that matched a dedicated agent. Those sites were switched in the same pass; this document captures the rule going forward.

Session telemetry across 498 sessions (pre-fix) showed 88 `general-purpose` spawns vs 200 dedicated — about 30% of subagent invocations were bypassing specialization. Tracking issue: [#30](https://github.com/AO-Cyber-Systems/devflow-claude/issues/30).
```

# CRITICAL: Doc lives at `docs/agent-spawning-convention.md` (repo root), NOT `.planning/`
# CRITICAL: Use repo-relative path `../.planning/objectives/...` in the link to the audit (works from `docs/`)
# GOTCHA: Confirm `docs/` directory exists with `ls docs/` before writing; create with `mkdir -p docs` if missing
# PATTERN: Match tone of existing docs/PROPOSAL-kind-and-work.md (per CLAUDE.md mention)

Commit:
```
docs(10): add agent-spawning convention

Codifies subagent_type selection rule. Index of 12 dedicated df-* agents
+ decision tree distinguishing dedicated-agent work from workflow
invocations. Background section references Phase E audit.

Closes part of #30.
```
  </action>
  <verify>
```bash
# Doc exists at repo root
test -f docs/agent-spawning-convention.md && echo "OK: doc exists" || echo "MISSING"

# Doc has the required sections
for section in "## The Rule" "## Decision tree" "## Agent index" "## Worked examples" "## Background"; do
  grep -F "${section}" docs/agent-spawning-convention.md > /dev/null && echo "OK: ${section}" || echo "MISSING: ${section}"
done

# Doc indexes all 12 dedicated agents
for agent in codebase-mapper debugger executor integration-checker job-checker objective-researcher planner project-researcher research-synthesizer roadmapper security-auditor verifier; do
  grep -F "\`${agent}\`" docs/agent-spawning-convention.md > /dev/null && echo "OK: ${agent}" || echo "MISSING: ${agent}"
done

# Doc references the audit
grep -F "10-RESEARCH.md" docs/agent-spawning-convention.md > /dev/null && echo "OK: audit ref" || echo "MISSING: audit ref"

# Length check
wc -l docs/agent-spawning-convention.md
# Expected: ≥80 lines

# Test suite
npm test
```
  </verify>
  <done>
- `docs/agent-spawning-convention.md` exists at repo root
- Contains The Rule, Decision tree, Agent index (all 12 agents), Worked examples (≥2), Background
- ≥80 lines
- References `10-RESEARCH.md` as background
- `npm test` passes
- Single commit with `docs(10):` prefix
  </done>
  <recovery>
- **If `docs/` doesn't exist:** `mkdir -p docs`. Then re-run Write.
- **If verify shows missing sections:** Edit the file to add them. Don't commit until all sections present.
- **If agent count is wrong:** Re-run `ls plugins/devflow/agents/` and reconcile with the index. Source of truth is the directory listing.
- **If doc is too short (<80 lines):** Expand worked examples or add a "Common confusions" mini-FAQ. Don't pad with filler.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. **File exists at correct path:** `docs/agent-spawning-convention.md` at repo root (not `.planning/`).
2. **Required sections present:** The Rule, Decision tree, Agent index, Worked examples, Background.
3. **All 12 dedicated agents indexed** with one-line role description.
4. **≥2 worked examples:** at least one switch case + one document case.
5. **Audit reference present:** doc links to `10-RESEARCH.md`.
6. **`npm test` passes.**
</verification>

<success_criteria>
- [ ] `docs/agent-spawning-convention.md` created at repo root
- [ ] Rule section states the dedicated-agent-when-matches rule
- [ ] Decision tree shows workflow-invocation branch + agent-match branch + ad-hoc branch
- [ ] All 12 agents indexed with role + when-to-use
- [ ] ≥2 worked examples (switch + document)
- [ ] Audit reference (10-RESEARCH.md) present
- [ ] ≥80 lines
- [ ] `npm test` passes
- [ ] Single `docs(10):` commit
- [ ] SUMMARY.md written
</success_criteria>

<output>
After completion, create `.planning/objectives/10-phase-e-agent-audit/10-02-SUMMARY.md` with:
- Confirmation of doc location + final line count
- Section-by-section presence check (output of the verify grep loops)
- Commit hash
</output>
