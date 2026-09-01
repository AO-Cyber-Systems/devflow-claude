---
title: "Glossary"
weight: 30
lede: "DevFlow vocabulary, defined once."
---

**Ambient mode** — a session in a DevFlow project with no skill currently running.
`gate-edits` denies direct edits in this mode by default.

**Atomic commit** — one commit per task, carrying objective scope and task ID.
Produced by `df-tools commit`, enforced by `gate-commits`.

**Checkpoint** — a formalised stop in an execution plan. Three types:
`human-verify`, `decision`, `human-action`. Behaviour depends on `mode`.

**Confidence tag** — `VERIFIED` or `SUSPECTED` on every finding from
`codebase-mapper` and `security-auditor`. Only `VERIFIED` findings are acted on
downstream.

**Context rot** — the quality degradation that happens as a model fills its context
window. The problem DevFlow's whole architecture answers.

**Decision queue** — where `checkpoint:decision` is parked in autonomous mode
instead of being guessed. Resolved with `/devflow:decide`.

**Defaults table** — the `(kind, work)` lookup that derives TDD posture, planning
depth, model profile and verification rigor. Three tiers: project, org, bundled.

**df-tools** — the central CLI that skills and agents drive. Invoked from the
runtime mirror at `~/.claude/devflow/bin/df-tools.cjs`.

**Gate** — either a confirmation pause configured in `config.json`, or a hook that
blocks a tool call outright. The two are different things.

**Handoff** — passing a TTY-bound or shell-environment-dependent command to your
own shell, via the `devflow-watch` daemon or a printed `! cmd`.

**Intent model** — the `kind` × `work` system that matches rigor to the work.

**Job** — an atomic unit of execution within an objective. One `JOB.md`, one
executor, one `SUMMARY.md`, several atomic commits.

**Kind** — what sort of software the project is: `api`, `app`, `library`,
`ui-lib`, `cli`, `plugin`. Declared once on `PROJECT.md`.

**Marker** — a dotfile in `.planning/` that coordinates hooks. `.skill-active` and
`.edit-override` are the two that matter.

**Milestone** — a set of objectives delivering a version's requirements. Audited
and archived as a unit.

**Mode** — `interactive`, `yolo` or `autonomous`. Governs checkpoint behaviour.

**Objective** — a numbered unit of work on the roadmap, with a goal and success
criteria. What you pass to `/devflow:build`.

**Profile** — `quality`, `balanced` or `budget`. Maps each agent onto a model tier.

**Provenance** — metadata on every resolved intent field saying which level of the
resolution chain supplied it.

**Runtime mirror** — `~/.claude/devflow/`, a copy of the plugin's `devflow/`
directory, refreshed at session start. Exists because `@path` references do not
interpolate `${CLAUDE_PLUGIN_ROOT}`.

**Skill** — a user-invocable slash command, `/devflow:<name>`. A thin orchestrator
that loads state and dispatches agents.

**Summary** — `SUMMARY.md`, written by the executor when a job finishes. Its
presence on disk is the signal that a job actually ran.

**TRD** — the technical requirements document for a job, carrying frontmatter that
can override intent resolution at the highest precedence.

**Wave** — a group of jobs with no dependencies on each other, executed
concurrently in separate context windows.

**Work** — what sort of change an objective is: `feature`, `port`, `refactor`,
`foundation`, `bugfix`, `prototype`, `spike`. Declared per objective.

**Workstream** — a whole objective running in its own git worktree and branch,
merged back when done.
