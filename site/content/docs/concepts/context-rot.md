---
title: "Context rot"
weight: 10
lede: "The problem DevFlow exists to solve, and why the answer is structural rather than a prompting trick."
---

## What it is

Context rot is the quality degradation that happens as an LLM fills its context
window. It is not a single failure — it is a slow slide:

- Early reconnaissance (files read, commands run, dead ends explored) stays in the
  window forever, crowding out the information that matters now.
- Instructions given at turn 3 compete with 200 turns of tool output by turn 200.
- The model starts repeating itself, re-reading files it already has, and
  re-deriving conclusions it already reached.
- Errors compound, because a wrong assumption made early is now "established
  context" that later turns treat as settled.

A single Claude Code session that researches, plans, builds and verifies a feature
will hit this. Not because the model is bad, but because by the time it writes the
code that matters, the signal it needs is buried under everything it did to get
there.

## The usual answers, and why they fall short

**`/compact`** summarises the conversation. It is lossy by construction, and it
lands at the worst possible moment — you compact when you are already deep in a
task, which is exactly when losing detail hurts.

**`/clear`** throws the window away. That works, but only if the state you needed
was written down somewhere. Otherwise you have just deleted your project's memory.

**Better prompting** helps at the margin and does nothing about the mechanism. You
cannot prompt your way out of a full window.

## DevFlow's answer

Keep the important state *outside* the context window in the first place, and give
every unit of work a fresh one.

### 1. State lives on disk

`.planning/` holds the project's memory: what you're building, the roadmap, the
decisions and their rationale, open blockers, and the position in the plan. None
of it is in the conversation, so losing the conversation costs nothing.

`/clear` becomes a routine hygiene step rather than an act of destruction. Run
`/devflow:status resume` afterwards and you are back where you were.

### 2. Every job gets a clean window

The planner breaks an objective into atomic jobs. Each job is dispatched to a
subagent with a *fresh* context window containing only:

- the job's own `JOB.md` — its tasks and success criteria
- `PROJECT.md` — what the project is
- whatever references that job actually needs

The executor for job 3 never sees the 40,000 tokens of research the planner read.
That is the whole trick, and it is why DevFlow parallelises so aggressively: a
wave of three jobs is three clean windows, not one dirty one.

### 3. Work is atomic and committed as it goes

One task, one commit, with objective scope and task ID in the message. If a job
goes wrong you revert its commits — you do not reconstruct what happened from a
transcript.

### 4. The orchestrator stays thin

Skills are deliberately not where the work happens. A skill loads state via
`df-tools`, decides what to dispatch, and spawns agents. Keeping the orchestrating
session small is what lets it stay coherent across a long build.

## The measured version

DevFlow's context guidance is not folklore. It comes from an audit of roughly 93
million tokens of real message blocks:

| Component | Share of window | Who produces it |
|---|---|---|
| Tool results | 59.3% | the environment |
| **Tool-call inputs** | **33.8%** | **the agent** — file bodies, heredocs, patches |
| Assistant text | 5.5% | prose |
| Images | 1.5% | screenshots |

The surprise is the second row. A third of the window is text the agent *writes
into tool calls* — most of it whole files being rewritten when a three-line edit
would have done.

See [context discipline](/docs/concepts/context-discipline/) for what follows
from that.

> DevFlow is built so that no agent ever has to work in a dirty context window.
> Everything else — the state files, the waves, the atomic commits — is downstream
> of that one commitment.
