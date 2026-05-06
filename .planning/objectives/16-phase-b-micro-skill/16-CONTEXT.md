---
objective: 16-phase-b-micro-skill
type: context
version: 1
created: 2026-05-04
---

# Phase B — `/devflow:micro` skill — Context

## Why this objective

Phase A (obj 15) made Claude obey routing in DevFlow projects. The classifier preamble already lists `/devflow:micro` in the routing decision table, parenthesised "(in development — for now, route to /devflow:quick)" because the skill itself doesn't exist yet. Phase B is the implementation that lets us drop that parenthetical.

The motivation is token efficiency at the bottom of the routing ladder: `/devflow:quick` (the current floor) costs ~5k tokens because it spawns a planner and an executor. That's too heavy to be the ambient default for a one-line typo fix. Routing will obey, but if obeying costs more than the work itself, users (and Claude) will resist routing on small tasks. **Lowering the floor to ~2k tokens is what makes ambient routing painless.**

Session data (issue #27): `/devflow:quick` was used 355 times — third-most-invoked skill — so the demand for a small-task tier is proven. The work splits into four sub-tasks (B1–B4 from issue #27).

## What's in scope

**B1. New `/devflow:micro` skill (~30-line SKILL.md):**

- `plugins/devflow/skills/micro/SKILL.md` — thin orchestrator, no agent spawn, no SUMMARY.md, no planner, no verifier
- `plugins/devflow/devflow/workflows/micro.md` — workflow body (start → edit inline → commit) referenced via `@~/.claude/devflow/workflows/micro.md`
- Cost target: ~2k tokens total (skill body + df-tools output)

**B2. Three new `df-tools micro` subcommands:**

- `df-tools micro start <description>` — generates `next_num`, slug, writes `.planning/.skill-active` marker via `skill-active --start micro` (just shipped in 15-04), captures intent, returns task tracking info
- `df-tools micro commit [--files <paths>]` — atomic commit with `chore(micro): {description}` message format, appends row to STATE.md "Quick Tasks Completed" table, removes skill-active marker
- `df-tools micro abort` — removes skill-active marker without committing (cancelled work)

**B3. Refactor `/devflow:quick` as the small-feature tier:**

- Today: ~5k tokens, single executor agent spawn (post-Phase G)
- New positioning: explicit "small but not trivial" tier — single executor (Haiku by default), no planner, no verifier
- Explicit cutoff documentation: <5 files, <200 LOC, no new abstractions
- SKILL.md and workflow.md updated to clarify scope vs `micro`

**B4. Classifier + route-intent routing update:**

- `classifier.cjs` `AMBIENT_PREAMBLE`: drop the "(in development — for now, route to /devflow:quick)" parenthetical now that micro ships
- `classifier.test.cjs` case 9: invert assertion — must NO LONGER contain "(in development"
- `route-intent.js` `INTENT_MAP`: add explicit micro entries for trivial-sounding prompts ("fix typo", "rename X to Y", "1-line fix", "single-file change")
- `intent-fixtures.cjs` and `route-intent.test.js`: add fire fixtures for the new micro patterns

## What's out of scope

- Adoption metric tracking (issue #27 calls out ≥30 micro/week after 30 days; that's a measurement task, not an implementation task)
- Token-cost measurement instrumentation (manual measurement via session export is acceptable for the acceptance criterion)
- Cross-skill telemetry / usage dashboards
- Auto-routing from `/devflow:quick` → `/devflow:micro` when the work turns out smaller than expected (de-escalation)
- Multi-tenancy scope (this codebase is not multi-tenant)
- Property-based or fuzz testing (per playbook: skip unless high-cardinality math)

## Locked decisions (from planning_context)

1. **Skill cost target: ~2k tokens** — skill body + df-tools output combined. Concrete bound: `wc -l plugins/devflow/skills/micro/SKILL.md` ≤ 35 (target ~30); `wc -l plugins/devflow/devflow/workflows/micro.md` ≤ 80; df-tools `micro start` and `micro commit` each emit ≤ ~200 chars of human-readable output (raw mode emits compact JSON).
2. **Atomic commit format: `chore(micro): {description}`** — matches the conventional-commit table in CLAUDE.md (chore type already in the allowed set).
3. **STATE.md "Quick Tasks Completed" table receives micro entries** — same table, same column shape. Micro entries are differentiable by commit prefix `chore(micro):` rather than by a separate table or column. (Avoids schema drift across STATE.md instances.)
4. **`micro start` writes `.planning/.skill-active` marker via df-tools `skill-active --start micro`** (just shipped in 15-04). `micro commit` and `micro abort` both end the marker via `skill-active --end`. Workflow integration: `gate-edits.js` allows micro's edits because the marker exists.
5. **No agent spawn, no SUMMARY.md** — micro stays single-context. The workflow body explicitly does NOT spawn planners, executors, verifiers, or job-checkers; explicitly does NOT create JOB.md, TRD.md, or SUMMARY.md.
6. **No CLAUDE.md absorption, no playbook directives** — same as `/devflow:quick`'s no-ceremony promise. TDD posture for the user's edit is the user's call; micro stays out of the way. (The CLI's own implementation IS TDD per playbook — see RESEARCH.md.)

## Project history relevant to this objective

**Obj 15 (Phase A — routing keystone, just-completed):**
- Shipped `classify-session.js` SessionStart hook (15-01) that writes the routing preamble — Phase B updates this preamble.
- Tightened `route-intent.js` regex (15-02) to require imperative + article + noun — Phase B adds new entries to the same `INTENT_MAP`.
- Made `gate-edits.js` strict-deny by default (15-03) keyed on `.planning/.skill-active` marker — Phase B's micro skill writes that marker via df-tools.
- Shipped `df-tools skill-active --start|--end|--status` CLI (15-04) — Phase B's `df-tools micro` subcommands consume it.

**Obj 12 (Phase G+I — skill consolidation, complete):**
- Locked the 14-skill consolidated set + 7 deprecation redirects. `/devflow:micro` is a NEW skill that joins this set; not a consolidation, not a redirect.
- Established the skill-route CLI and the "thin orchestrator + workflow file" pattern that micro inherits.

**Obj 14 (Phase F — default-on safety, planned but in progress):**
- F5 will eventually drop the `confidence` frontmatter field from TRDs in favour of a per-task caution attribute. Phase B's TRDs use the current `confidence` field; back-compat will be handled by F5's migration.

## Files this objective will touch

**New:**
- `plugins/devflow/skills/micro/SKILL.md`
- `plugins/devflow/devflow/workflows/micro.md`
- `plugins/devflow/devflow/bin/lib/micro.cjs`
- `plugins/devflow/devflow/bin/lib/micro.test.cjs`

**Modified:**
- `plugins/devflow/devflow/bin/df-tools.cjs` (add `case 'micro':` switch arm + import)
- `plugins/devflow/skills/quick/SKILL.md` (clarify scope vs micro)
- `plugins/devflow/devflow/workflows/quick.md` (cutoff documentation)
- `plugins/devflow/devflow/templates/state.md` (note: Quick Tasks table accepts micro entries)
- `plugins/devflow/devflow/bin/lib/classifier.cjs` (drop "(in development" parenthetical)
- `plugins/devflow/devflow/bin/lib/classifier.test.cjs` (invert case 9 assertion)
- `plugins/devflow/hooks/route-intent.js` (add INTENT_MAP entries for micro)
- `plugins/devflow/hooks/route-intent.test.js` (fire fixtures for new micro entries)
- `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` (new fire fixtures)
