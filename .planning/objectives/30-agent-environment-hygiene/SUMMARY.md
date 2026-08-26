---
objective: 30
slug: agent-environment-hygiene
status: complete
work: bugfix
completed: 2026-08-19
commits: [6037be7, 68bd573]
tests_added: 29
regressions: 0
---

# Objective 30: Agent environment hygiene — SUMMARY

| TRD | Change | Commit |
|---|---|---|
| 30-01 | Agent allowlists cover what prompts call | `6037be7` |
| 30-02 | Routing stops advertising un-invocable skills | `6037be7` |
| 30-03 | Anchor paths to worktree root; raise build timeouts | `68bd573` |
| 30-04 | Structured, logged gate overrides | `68bd573` |

## 30-01 — three real gaps, found by the guard not by review

`executor.md` instructs `TaskCreate()`, `TaskUpdate()` and `AskUserQuestion()`
and declared **none** of them. That is the 164 "No such tool available" results
across 45 sessions, in miniature.

`agent-tools.test.cjs` now fails the build when an agent's prompt calls a tool
its `tools:` line omits. Scope is deliberately narrow — only the `ToolName(`
call form counts. A first draft also flagged "declared but unreferenced" and
produced pure noise, because agents use `Read` and `Bash` constantly without
naming them in prose. That direction was dropped rather than shipped as a
failing signal nobody could action.

## 30-02 — the flag was right, the advertising was wrong

68 failed Skill-tool invocations across 22 sessions, all
`disable-model-invocation`. The obvious fix — re-enable invocation — would have
been wrong. `objective`, `milestone` and `workstreams` mutate planning state,
and `objective remove` cascade-renumbers every objective above it. Requiring a
human to type them is a deliberate safety posture.

The actual defect was the routing preamble listing them beside invocable skills.
They now sit under an explicit **USER-TYPED ONLY** heading stating that the
Skill tool will fail, and pointing at `df-tools` for the equivalent operation.
`CONSOLIDATED_SKILLS` carries a `userOnly` flag and `classifier.test.cjs`
asserts it matches each skill's real frontmatter, so the table cannot drift from
reality again.

I hit this defect myself while registering objectives 27–31 — `devflow:objective`
was not callable, so I used `df-tools` directly. The fix is what I wish the
routing table had told me.

## 30-04 — overrides now leave a trace

`df-tools override --gate <edits|commits|changelog> --reason "<why>"` records to
`.planning/.override-log.jsonl` and arms the marker for marker-driven gates. A
reason is **mandatory**: an unexplained override is precisely the signal the
command exists to capture. Five overrides of one gate surface as
`needs_rescoping` — a gate fought repeatedly is mis-scoped, not a user problem.

The prose path (`skip devflow`) still works. This is an additional auditable
entry point, not a break in muscle memory.

## Evidence

- **Suite: 2797 tests, 2737 pass, 10 fail** — same pre-existing failures in
  `devflow-watch`, `handoff-e2e`, `awareness`. Baseline before objective 27:
  2681/2621/10.
- **29 tests added, 0 regressions.**

## Follow-up

`df-tools override --list` output should surface in `/devflow:status` — folded
into objective 31's telemetry view rather than duplicated here.
