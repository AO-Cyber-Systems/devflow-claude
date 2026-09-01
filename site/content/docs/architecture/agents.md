---
title: "Agents"
weight: 10
lede: "The 13 subagents skills dispatch to, what each is for, and which model tier each runs at."
---

Skills are thin orchestrators. They load state, decide what to dispatch, and spawn
agents — the work happens in the agents, each in its own fresh context window.

{{< agents >}}

## How an agent is defined

Each agent is a single markdown file in `plugins/devflow/agents/` with YAML
frontmatter and an XML-structured body:

```markdown
---
name: executor
description: Executes planned tasks with atomic git commits...
effort: xhigh
tools: Read, Write, Edit, Bash, Grep, Glob, ...
color: yellow
maxTurns: 50
isolation: worktree
---

<role>...</role>
<philosophy>...</philosophy>
<execution_flow>
  <step name="...">...</step>
</execution_flow>
```

| Frontmatter field | Purpose |
|---|---|
| `tools` | The tool allowlist. An agent cannot call outside it. |
| `effort` | Reasoning effort. Set here, not in the profile table — `Task()` takes no effort argument. |
| `maxTurns` | Hard turn ceiling. `executor` 50, `verifier` 30. |
| `isolation` | `worktree` gives the agent its own git worktree. |
| `memory` | `project` accumulates learned patterns across runs. |
| `color` | Status-line colour. |

{{< callout title="Haiku rejects `effort`" type="warn" >}}
Haiku 4.5 rejects the `effort` parameter entirely. An agent that might resolve to
Haiku under the budget profile must not declare `effort` in its frontmatter.
{{< /callout >}}

## The agents by phase

### Discovery

**`project-researcher`** — researches the domain ecosystem for a new project:
stack options, architecture patterns, features, common pitfalls.

**`objective-researcher`** — researches how to implement one specific objective.
Narrower than the project researcher and runs much more often.

**`research-synthesizer`** — combines findings from parallel research agents into
one summary the roadmapper can use. Exists because three research agents produce
three overlapping documents, and the roadmapper should read one.

**`codebase-mapper`** — analyses an existing codebase from one angle (stack,
architecture, quality, or concerns). Dispatched in parallel, one per angle.

### Planning

**`roadmapper`** — breaks requirements into ordered objectives with success
criteria and dependency mapping.

**`planner`** — creates the execution plan for one objective: task breakdown,
dependency ordering, built-in quality checks. Reads the
[intent model](/docs/concepts/intent-model/) resolution and applies it.

**`job-checker`** — reviews plans *before* they run. Its only question is whether
executing this plan would actually achieve the objective's goal. Catching a bad
plan here costs one agent call; catching it after execution costs a build.

### Execution

**`executor`** — the one that writes code. Executes planned tasks with atomic git
commits, handles deviations from the plan, and manages checkpoints. Runs with
`isolation: worktree` and a 50-turn ceiling.

### Verification

**`verifier`** — verifies the built code achieves the objective's goal, not that
the tasks were completed. Carries `memory: project`, so verification patterns
accumulate at `.claude/agent-memory/verifier/`.

**`integration-checker`** — verifies separately-built features actually connect and
end-to-end workflows work. Waves build things in isolation; this checks the seams.

**`ui-evaluator`** — machine-judges visual correctness by capturing each declared
UI surface and scoring it through the offline visual-eval engine.

### Cross-cutting

**`debugger`** — structured scientific-method investigation with state that
survives context resets.

**`security-auditor`** — scans one security domain: secrets, auth flows, or
dependency risk.

## Confidence tagging

`codebase-mapper` and `security-auditor` must tag every concern:

```text
Confidence: VERIFIED   — confirmed by reading the code
Confidence: SUSPECTED  — pattern-matched, not confirmed
```

Downstream planners act only on `VERIFIED`. This is a deliberate constraint against
the failure mode where an agent speculates confidently and generates remediation
work for problems that do not exist.

## Model assignment

Which model an agent runs at comes from the active profile, resolved at dispatch
time:

```bash
df-tools resolve-model planner      # → the model alias for the current profile
```

`opus` resolves to `inherit`, meaning the agent keeps the session's model rather
than being pinned. See [model profiles](/docs/configuration/model-profiles/).
