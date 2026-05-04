---
objective: 0
title: Refine (kind, work) defaults table from codebase evidence
created: 2026-05-04
status: research-complete
---

# Objective 0 — Research Synthesis

Research is **complete** for this objective. Three artifacts produced by the background research agent (3 commits on `feature/v1.1` ending `1f56495`):

| File | Purpose |
|---|---|
| `.planning/research/tdd-scope-codebase-survey.md` | Raw findings — Steps 1+2 of the 4-step survey methodology. Sampled 9 sibling repos (aodex-go, aosentry, aohealth-go, aodex-flutter, eden-libs, eden-ui, eden-ui-flutter, eden-cli, devflow-claude). |
| `.planning/research/tdd-scope-refined-defaults.md` | Synthesis — Step 3. Per-cell deltas across all 42 cells of the existing defaults table + the proposed cell layout. |
| `.planning/research/tdd-scope-summary.md` | Executive summary (<600 words) — top deltas, key open decisions, recommended next move. **READ THIS FIRST.** |

The original framing doc (Step 0) is at `.planning/research/tdd-scope-by-kind-work.md` for context on methodology; not required reading for planning.

## Key findings (planner-relevant excerpts)

### TDD adoption is rare in the org

| Repo | TDD TRDs / Total |
|---|---|
| aodex-flutter | 0 / 24 |
| aosentry | 1 / 16 (the one is an explicit test-coverage retrofit) |
| eden-libs | 3 / 64 (all 3 are explicit test-retrofit objectives) |
| **devflow-claude** | **8 / 8** (handoff-watcher objective) |

devflow-claude itself is the org's only consistent TDD adopter. The user's CLAUDE.md TDD Playbook is genuinely uncommon in the rest of the codebase — including the multitenancy-guard habit (only 2 explicit "wrong-tenant" assertions across 3 sampled aodex-go handler tests despite 23 TeamID/UserID references). **This is the gap the resolver schema closes**: by codifying the playbook habits as structured fields, the planner enforces them automatically rather than relying on the user to remember.

### Ports do NOT reuse source tests as fixtures

| Port | Pattern observed |
|---|---|
| aosentry Rails→Go | 5 TRDs all `type: standard`, all `tdd_evidence: false`. Tests retrofitted by separate test-coverage objective. |
| eden-cli daemon port | Same pattern. Build first, test after. |

The shipped table's "spec-match (source's tests as fixtures)" recommendation contradicts every observed port. The contract-list-first replacement preserves TDD posture (test list first per Playbook habit 2) while respecting reality (no one transplants test files across stacks).

### ui-lib has zero visual-regression tooling org-wide

| Repo | Test files | Behavioral coverage | Visual coverage |
|---|---|---|---|
| eden-ui (Rails gem) | 2 test files for ~400 ERB partials | Config logic only | Zero |
| eden-ui-flutter | 21 widget tests | Behavior | Zero `matchesGoldenFile` calls |

The shipped table's "visual + a11y + API" recommendation is unimplementable today. Defaults move to behavioral + a11y; visual is TRD opt-in.

### Sample coverage limitations (from the survey)

- **refactor** and **prototype** work types had < 3 sampled objectives each (acceptance criteria called out as a survey limitation; not a blocker — those cells use kind-driven defaults extrapolated from feature/foundation).
- Performance baselines: only aodex-go has them; not table-worthy as a structured field. Goes in `verification` text for `(api, feature)` and `(api, foundation)`.
- Property-based testing: 0 hits org-wide. Becomes a resolver constraint (suppress unless TRD opts in), not a column.

## RQ resolution (from `tdd-scope-summary.md` §RQ2)

Two structured columns earn the table; three other candidate dimensions stay as TRD-level concerns or anti-pattern constraints.

**In-table (new columns):**
- `security_isolation` — surfaces multitenancy habit per cell.
- `back_compat` — replaces freeform "spec-match" with concrete parity-target per port/refactor cell.

**Out (stay as TRD-level concerns):**
- Performance baselines — `verification` text only.
- Property-based testing — resolver constraint (`no_property_based_default`).
- Outside-in stack — captured as `outside_in: true` field on the cells where it applies; not a generic column.

The user's call (in CONTEXT.md §3) extends the in-table list to **5 fields** total by adding `tdd_default`, `test_list_first`, `fixture_strategy` — these codify CLAUDE.md TDD Playbook habits 1, 2, and 4 directly into the resolver output, making the playbook the enforcement mechanism rather than parallel guidelines.

## Per-cell delta count

From `tdd-scope-refined-defaults.md`:

- **27 cells** change in the body of the 42-cell table.
- **5 new column headers** added (`security_isolation`, `back_compat`, `tdd_default`, `test_list_first`, `fixture_strategy`).
- All 6 `port` rows change (drop spec-match, add `back_compat`).
- All 4 non-skip `ui-lib` rows change (drop visual, add `outside_in: false`).
- 3 `(api, *)` cells gain `security_isolation: multi_tenant_required`.
- `(app, feature)` and `(api, feature)` gain `outside_in: true`.
- `(plugin, feature)` gains `fixture_strategy: generators`.

The remaining 15 cells get only the 5 new column values populated (no behavior change in existing columns).

## Surprises worth flagging to the planner

1. **Ports do NOT reuse source tests as fixtures.** Largest single delta — touches all 6 `port` cells.
2. **Zero visual-regression tooling exists in the org for ui-lib.** Drop the recommendation.
3. **devflow-claude is the org's only consistent TDD adopter.** The resolver schema is the mechanism by which the user's playbook becomes enforced — not a parallel reference doc.

## Out-of-scope dimensions explored but rejected

The survey considered and rejected these as table columns; CONTEXT.md §"Out of scope" repeats the rejection:

- Performance baseline (`perf_baseline: required | optional | none`) — only 1 repo has them; insufficient signal.
- Property-based testing (`property_based: required | optional | none`) — zero org-wide adoption; resolver constraint instead.
- Outside-in stack as standalone field — captured per-cell as `outside_in: true | false` on the 2 cells where it applies; not a generic column.
- Codegen discipline (`mcp_codegen: required | none`) — belongs in `references/testing-strategy.md` as a paragraph, not the (kind, work) table.

## Recommended planner action

Plan 7 TRDs per CONTEXT.md §6 with the wave structure in CONTEXT.md §7. The research synthesis is locked; the user's calls are locked. Don't re-research; don't re-litigate decisions. Do plan implementation tactics (file-level changes, test cases, verification commands, dependency ordering).
