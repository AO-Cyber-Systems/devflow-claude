---
title: TDD Scope by (kind, work) — Research Framing
date: 2026-05-04
purpose: Validate and refine the TDD posture column of the (kind, work) defaults table. Drives a v1.1 objective that grounds the table's recommendations in real-codebase evidence rather than abstract reasoning.
status: research-framing
related:
  - docs/PROPOSAL-kind-and-work.md (open questions 6 and 7 are direct inputs)
  - plugins/devflow/devflow/references/defaults-table.md (the table being validated)
---

# TDD Scope by (kind, work) — Research Framing

## Why now

The merged kind/work intent model (PR #8) ships a 42-cell defaults table with a `tdd` column per cell. The values there were arrived at by reasoning, not by looking at how AOCyber projects actually test today. Two concrete concerns from the original proposal:

> **Open Question 6**: ~40% of cells (refactor/bugfix/prototype/spike rows) have nearly-identical TDD treatment across all six kinds. Either keep the symmetry or collapse to ~28 cells.

> **Open Question 7**: Missing dimensions — performance baselines, property-based testing, explicit security/RBAC, backward-compat for port/refactor — are not captured.

Plus a third concern surfacing from the seamless-handoff watcher merge: the user's TDD Playbook (in `~/.claude/CLAUDE.md`) says "Force TDD TRDs at planning time" but **only six explicit habits were named there**. The defaults table doesn't yet honor those habits literally — it has its own recommendations. Risk: planner picks defaults from the table that conflict with the user's stated playbook, and the absorption layer has to reconcile.

This research closes those gaps before we plan v1.1's objectives, which will themselves use the planner's intent resolution.

## Scope of the research

**In scope:**
- Validate or refine each cell's `tdd` value against real codebases in the AOCyber org (one per kind minimum)
- Decide on the redundancy question: keep 42 cells or collapse to ~28
- Decide which missing dimensions (perf, property-based, RBAC, back-compat) earn columns in the table vs stay as TRD-level concerns
- Cross-check against the user's `~/.claude/CLAUDE.md` TDD Playbook — defaults must not contradict it without a clear "your playbook overrides this" provenance line

**Out of scope:**
- Other defaults columns (`depth`, `model_profile`, `verification`) — separate research if needed
- New `kind` or `work` enum values — the 6×7 axes are settled
- TDD enforcement mechanism (Iron Law, RED→GREEN→REFACTOR) — that's the shipped substrate; this research only changes what gets routed to TDD vs not

## Research questions

### RQ1 — kind-axis signal strength per work type

For each of the 7 work types, how much TDD variance does `kind` actually drive in real practice?

- **Feature**: Strong hypothesis. Visual regression for ui-lib differs from API contract for api, differs from package contract for library. Validate.
- **Port**: Strong hypothesis. "Source IS the spec" varies — for api/library, the source's tests ARE the spec; for ui-lib, visual diff vs the source IS the spec.
- **Refactor**: Weak hypothesis. Characterization-tests-first is the universal answer regardless of kind. Validate by sampling refactor objectives.
- **Foundation**: Medium. Integration > unit is universal, but specific foundations (db migration vs design-system base components vs CLI command tree) have different shapes.
- **Bugfix**: Weak. Regression test required is universal. Validate.
- **Prototype**: Weak. Skip-or-minimal is universal. Validate.
- **Spike**: Strong null. No tests, output is writeup. Probably collapses to a single row.

If the weak/null hypotheses hold, the table can collapse refactor/bugfix/prototype/spike to single rows (4 × 1 = 4 cells instead of 4 × 6 = 24 cells), netting a 28-cell table.

### RQ2 — missing dimensions

For each candidate dimension absent from today's table, where does it actually carry weight?

| Dimension | Suspected (kind, work) cells where it matters |
|---|---|
| Performance baselines | (api, feature), (api, foundation), maybe (cli, feature) for hot CLIs |
| Property-based testing | (library, feature) for math-heavy/parser libs; (api, feature) for refunds/proration/tax |
| Security/RBAC explicit | (api, feature) where the user CLAUDE.md "multitenancy guard" already lives — could be a separate column |
| Back-compat (port/refactor) | (api, port), (library, port), (api, refactor), (library, refactor) — need explicit before/after parity assertions |
| Outside-in stack discipline | (app, feature) — Capybara→controller→model; (api, feature) — HTTP→handler→service |

Decision per dimension: dedicated column in the table, mention in `verification` column, or TRD-level concern. The user's TDD Playbook already names some of these (multitenancy guard, outside-in for UI/portal flows, fixture generators, no property-based unless math-heavy) — table should align.

### RQ3 — CLAUDE.md absorption interaction

The user's `~/.claude/CLAUDE.md` has six named TDD habits:

1. Force TDD TRDs at planning time (bias toward `type=tdd`)
2. Test list first per TRD
3. One test at a time RED→GREEN→REFACTOR
4. Fixture generators (no LLM-generated test data)
5. Outside-in for UI/portal flows
6. Multitenancy guard in every test (multi-tenant codebases)

For each habit, where in the (kind, work) defaults table does it apply? And does the table need a way to express each habit machine-readably, or do they live as freeform text in the user playbook that the planner absorbs as a free-form override?

This affects the resolver's output shape — if a habit becomes a structured field, the resolver should expose it as `result.config.<habit>`. Otherwise it stays in `result.directives` as a freeform absorbed snippet.

### RQ4 — anti-patterns the user has called out as "skip"

User's TDD Playbook explicitly de-prioritizes:
- Property-based testing unless genuinely math-heavy
- Gherkin / BDD syntax layer (descriptive test names get the value)

Plus from the seamless-handoff session:
- LLM-generated test data (use fixture generators)

These should be **constraints surfaced by the resolver**, not cell values. They constrain what TDD looks like everywhere, not what TDD scope applies per cell.

## Methodology

### Step 1 — Sample real codebases per kind

One project per `kind` value, sampled to understand its actual TDD patterns:

| kind | sample project | what to look at |
|---|---|---|
| api | aodex-go | `internal/*_test.go`, `cmd/*_test.go` — coverage, structure, fixtures |
| api | aosentry | same — second sample for the api kind |
| app | aodex-flutter | `test/`, `integration_test/` — golden tests, system tests |
| library | eden-libs/eden-ai-go | API contract tests, edge-case coverage |
| ui-lib | eden-ui | visual regression suite, story-driven tests |
| cli | devflow | I/O snapshots, exit-code contracts |
| plugin | devflow-claude | the test files we just wrote — sentinel-based, fixture generators |

Per project, capture:
1. TDD adherence: estimated fraction of code-paths with tests written before vs after
2. Test taxonomy: unit / integration / e2e / visual / contract — what's the actual mix?
3. Fixture strategy: hand-built generators? recorded cassettes? data factories? raw inline?
4. Notable patterns the kind seems to enforce structurally

### Step 2 — Sample objectives by `work` value

From the ~33 objectives surveyed in the original proposal across aodex, aosentry, aodex-flutter, aodex-dev — sample 3-5 per work type and look at:

1. What test coverage actually shipped?
2. Was the TDD posture proportional to risk?
3. Where did the existing `auto`/`tdd`/`standard` heuristic feel wrong in retrospect?

### Step 3 — Synthesize

Produce a refined defaults table proposal:

- 42 cells or 28 cells
- Specific `tdd` value per kept cell, grounded in step 1+2 evidence
- Decision on each missing dimension
- Mapping table: each user CLAUDE.md habit ↔ how the resolver surfaces it

### Step 4 — Validate

Walk each refined cell against:
- 2-3 real recent objectives from a project of that kind
- The user's TDD Playbook habits
- The shipped 42-cell table to identify deltas

Each delta gets a one-line justification ("evidence: X; current value: Y; proposed value: Z; reasoning: W").

## Working artifacts

This research will produce:

| Path | Content |
|---|---|
| `.planning/research/tdd-scope-by-kind-work.md` | This doc — framing |
| `.planning/research/tdd-scope-codebase-survey.md` | Step 1 + 2 raw findings |
| `.planning/research/tdd-scope-refined-defaults.md` | Step 3 synthesis (proposed table) |
| `plugins/devflow/devflow/references/defaults-table.md` | UPDATED if the synthesis lands |
| `plugins/devflow/devflow/bin/lib/intent.cjs` | UPDATED if new dimensions become structured fields |
| `plugins/devflow/devflow/bin/lib/claude-md.cjs` | UPDATED if new absorption rules emerge |

## Connection to v1.1 milestone

This becomes a v1.1 milestone objective (provisionally **objective 0** since it's prerequisite to several others):

- **#10 GitHub coordination layer** — unaffected
- **#11 Cross-worktree session telemetry** — unaffected
- **#12 Planning-time org awareness** — depends on resolver output shape; if RQ3 changes that shape, #12's design follows from this research
- **#13 Duplicate-work detection** — depends on heartbeat + planner consumption; modest dependency
- **#14 Initiative context layer** — depends on planner consumption; modest dependency
- **#15 Unified df:check-todos** — independent
- **#16 df:handoff watcher** — done (merged)
- **#17 Program-aware TUI** — independent
- **#18 Roadmap ↔ disk reconciliation** — independent

Recommend running this research **before** sub-issues #12 and #13 are TRD-planned, because their definition of "what the planner consults" depends on resolver shape, which depends on this research's RQ3 output.

## Open questions for the planner / human

1. **Scope of step-1 survey** — how many projects per kind is "enough"? The 1-2 listed above is minimum; more samples gives confidence but takes longer.
2. **Methodology for "TDD adherence" estimation** — visual eyeballing vs git log analysis vs commit-message keyword scan? Inexact methodology is fine for triangulation but should be documented.
3. **Decision authority** — when refined defaults disagree with the shipped 42-cell table, who arbitrates? Probably the user, after seeing the evidence.
4. **Should the research itself follow TDD?** Meta-question. This is a `(kind=plugin, work=spike)` cell — defaults table says `tdd: none`, deliverable is writeup. Suggests no.
5. **Cell-by-cell refinement vs holistic rewrite** — incremental diffs preserve confidence in unchanged cells; holistic rewrite is cleaner. Recommend incremental: each changed cell justified separately.

## Acceptance criteria for the research objective

The research is "done" when the following are true:

- [ ] Each of the 6 kinds has at least one sampled real project with documented TDD patterns
- [ ] Each of the 7 work types has at least 3 sampled objectives across the org
- [ ] RQ1 (kind-axis signal per work type) has a yes/no with evidence for each work type
- [ ] RQ2 (missing dimensions) has an in-table-or-not decision per candidate dimension
- [ ] RQ3 (CLAUDE.md habits) has a structured-or-freeform decision per habit
- [ ] A proposed updated `defaults-table.md` exists with each delta justified
- [ ] User has reviewed and approved (or rejected with redirect)
- [ ] If approved: TRD outline for the table-update objective exists, ready for execution
