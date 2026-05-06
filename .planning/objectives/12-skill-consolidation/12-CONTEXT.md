---
objective: 12-skill-consolidation
github_issue: AO-Cyber-Systems/devflow-claude#32
parent_issue: AO-Cyber-Systems/devflow-claude#25
sibling_issue: AO-Cyber-Systems/devflow-claude#34
created: 2026-05-04
---

# Objective 12 — Phase G + I: Skill consolidation 28→14 + drop low-leverage

## Vision

Reduce skill count from 28 → 17 by merging 17 sibling skills into 5 subcommand-style consolidated skills. Pair with targeted Phase I cleanups (decimal-objective survey, TDD-as-task-flag collapse, summary-template canonicalization) to remove low-leverage features whose maintenance cost exceeds their value.

The driver is **token efficiency on every invocation**: every session pays the system-prompt cost of the full skill catalog. 17 fewer skill entries shrinks that prompt by an estimated 1500+ tokens per invocation, compounding across the 88% of sessions that bypass DevFlow today and the 12% that already use it.

## Why now

Three signals justify this objective in v1.2's first half:
1. **Typo data:** Users typed `/devflow:objective`, `/devflow:milestone`, `/devflow:todo`, `/devflow:status`, `/devflow:cmd` — all consolidated names that didn't exist. Mental model already groups siblings together.
2. **Routing-table prep for Phase A:** v1.2 obj 6 will wire `classify-session.js` to inject a routing decision table into the system prompt. Smaller skill list = smaller injected table = lower per-session token cost.
3. **v1.1 obj 8 (TUI) precedent:** The workstreams skill already adopted subcommand parsing (`workstreams setup|status|merge`). Pattern is proven on disk; just generalize it.

## Locked decisions (carried in from orchestrator + #32 + #34)

1. **Old skill names preserved as deprecation redirects** for one release window (#32 G2). Each old skill becomes a thin SKILL.md that emits a deprecation warning and forwards to the new consolidated form. Removal target: v3.0 (per #32).
2. **Subcommand parsing in each new skill** (#32 G1). Pattern: SKILL.md parses `$ARGUMENTS`, calls `df-tools skill-route <skill> <args...>` to resolve subcommand → workflow file path, then loads that workflow.
3. **G3 (routing-table update) DEFERRED to v1.2 obj 6 (Phase A)** — that's where `classify-session.js` lands. This objective prepares the routing data (consolidated names + subcommand inventory) but does not wire it.
4. **I1 (drop confidence scoring) DEFERRED to v1.2 obj 5 (Phase F)** per #34 spec note. Out of scope here.
5. **I2 (decimal-objective survey + drop if <5%)** — survey scope = active DevFlow projects accessible from this machine. If usage <5%, drop the feature, simplify `objective.cjs`, simplify roadmap parsing. If ≥5%, document better and keep. Survey method captured in 12-RESEARCH.md.
6. **I3 (TDD collapse to task-level)** — separate TRD; touches `agents/planner.md` + `agents/executor.md` + `references/tdd.md`. Replaces `type: tdd` (TRD-level) with task-level `tdd="true"` flag. Single executor branch handles both. Backward compat: existing `type: tdd` TRDs still resolve.
7. **I4 (canonicalize summary template)** — small cleanup. Pick `summary.md` (the verbose canonical) as the keeper; delete `summary-minimal.md`, `summary-standard.md`, `summary-complex.md`. Update `lib/templates.cjs` `cmdTemplateSelect` to always return `templates/summary.md` (with optional `verbosity` config flag for future).
8. **I5 (drop Brave Search) DEFERRED.** Not in this objective's scope per orchestrator output_files note (the suggested decomposition omits I5).

## Definition of done (alignment with #32 + #34 acceptance criteria)

- [ ] 5 consolidated skills exist with subcommand handlers (`objective`, `milestone`, `todo`, `status`, `workstreams`)
- [ ] All 13 old skill names still work as redirects (deprecation log entries appear)
- [ ] `df-tools skill-route` CLI helper exists, returns JSON `{subcommand, args, workflow}`, has TDD coverage
- [ ] I2 decimal-objective survey complete; disposition documented in `12-RESEARCH.md` § "I2 disposition"
- [ ] I3 TDD-to-task-level flag landed; planner emits `tdd="true"` task attribute; executor branch handles both `type: tdd` and `tdd="true"` for back-compat window
- [ ] I4 summary template canonicalized; `summary.md` is the only template; `lib/templates.cjs` returns it unconditionally
- [ ] `help.md` workflow + README skill table reference only consolidated names (with deprecation note for old names)
- [ ] Routing-table prep documented in `12-RESEARCH.md` § "Phase A handoff" (consumed by v1.2 obj 6)
- [ ] All 1359 pre-existing tests still pass; new tests added for skill-route, decimal survey CLI, TDD collapse, template canonicalization

## Risk: skill rename atomicity

User-facing concern: if execution mid-flow lands a skill rename before its deprecation redirect, ambient mode lookups could break. **Mitigation:** every TRD that creates a consolidated skill MUST land its deprecation redirects in the **same atomic commit** (or the same wave-internal sequence with `git add` + single `git commit`). The TRDs below codify this in `<recovery>` blocks.

## Out of scope

- Wiring `classify-session.js` (v1.2 obj 6 / Phase A)
- Removing old skill files entirely (one release window from now, v3.0)
- Touching `/devflow:settings` or `/devflow:set-profile` (a candidate `/devflow:config` consolidation noted in #32 but not in the locked table; defer to v1.3+)
- Brave Search integration (I5; deferred per orchestrator scope)
- Adding the `/devflow:micro` skill (v1.2 obj 7 / Phase B)
