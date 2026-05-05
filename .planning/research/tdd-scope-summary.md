---
title: TDD Scope by (kind, work) — Executive Summary
date: 2026-04-29
purpose: Short summary of the codebase-survey research. Big picture, top deltas, key open decisions, recommended next move.
status: research-summary
related:
  - tdd-scope-by-kind-work.md (framing)
  - tdd-scope-codebase-survey.md (evidence)
  - tdd-scope-refined-defaults.md (synthesis + proposed table)
---

# TDD Scope by (kind, work) — Executive Summary

## Big picture

The shipped 42-cell defaults table at `plugins/devflow/devflow/references/defaults-table.md` is **more aspirational than descriptive**. The survey of 6 sibling AOCyber repos (aodex-go, aosentry, aohealth-go, aodex-flutter, eden-libs, eden-ui, eden-ui-flutter, eden-cli, devflow-claude) shows real codebases are pragmatic, test-light, and lean heavily on integration/E2E harnesses rather than classical TDD.

Specifically:

- **TDD adoption is rare**. Across 80+ TRDs sampled: aodex-flutter 0/24 TDD, aosentry 1/16, eden-libs 3/64 (and those 3 are an explicit *test-coverage retrofit* objective, not pre-feature TDD). The only consistent TDD adopter is **devflow-claude itself** (8/8 TRDs in the handoff-watcher objective).
- **Ports do not treat source tests as fixtures**. The shipped table's recurring "spec-match (source's tests as fixtures)" recommendation contradicts every observed port. aosentry's Rails→Go port did not reuse Rails tests; tests were retrofitted later by a separate test-coverage initiative. Same pattern for eden-libs/eden-cli.
- **ui-lib has zero visual-regression tooling** in this org. eden-ui has 2 test files for ~400 ERB partials (config logic only). eden-ui-flutter has 21 widget tests, **zero `matchesGoldenFile` calls**. The shipped table recommends "visual + a11y + API" — half of which is unimplementable today.
- **The user's TDD Playbook habits are not org defaults**. Multitenancy guards: 2 explicit "wrong-tenant" assertions across 3 sampled aodex-go test files. Outside-in stack: real for kind=app (Maestro + Playwright + integration_test exists in aodex-flutter); not for api or others. Fixture builders: only seen in devflow-claude (`__fixtures__/intent-fixtures.cjs`).

The table doesn't need a holistic rewrite — it needs **honesty calibration** plus structured surfacing of the user's playbook habits as machine-readable fields.

## Top deltas (ranked by impact)

1. **All 6 `port` cells**: drop "spec-match (source's tests as fixtures)"; replace with "build first, test after; verify parity at the contract layer". Add structured `back_compat` column with kind-specific values (api_parity, ui_parity, library_parity, visual_parity, io_parity, contract_parity). *Why*: contradicts every observed port behavior in the org.
2. **All 4 `(ui-lib, *)` non-skip cells**: drop "visual regression" / "visual + a11y" recommendations. Replace with "behavioral testing; visual deferred until tooling lands; opt-in via TRD frontmatter". *Why*: zero golden-file or visual-diff tooling exists in eden-ui or eden-ui-flutter. Cells currently recommend tooling that doesn't exist.
3. **3 `(api, *)` cells gain `security_isolation: multi_tenant_required`** as a structured field. *Why*: the user's CLAUDE.md "multitenancy guard" habit is the most consistently violated in the codebase (only 2 explicit cross-tenant assertions across 3 sampled aodex-go handler tests). Making it structured lets the resolver enforce it per cell.
4. **`(app, feature)` and `(api, feature)` gain `outside_in: true`** as a structured field. *Why*: aodex-flutter's Maestro YAML + Playwright + integration_test stack IS the outside-in pattern; the table should name it as a structured field, not just freeform text.
5. **`(plugin, feature)` gains `fixture_strategy: generators`**. *Why*: devflow-claude's `__fixtures__/intent-fixtures.cjs` is the org's only example of explicit fixture-builder modules. Codifying it makes it the plugin-default.

## The single most consequential decision (RQ2)

**Two new structured columns earn their place in the table; three other candidate dimensions stay as TRD-level concerns or anti-pattern constraints.**

In:
- `security_isolation` (values: `multi_tenant_required` | `single_tenant` | `n/a`) — surfaces the user's multitenancy habit per cell.
- `back_compat` (values: `api_parity` | `ui_parity` | `library_parity` | `visual_parity` | `io_parity` | `contract_parity` | `behavioral` | `none`) — replaces the misleading "spec-match" hand-wave with a concrete parity-target per port/refactor cell.

Out (stay as TRD-level concerns or constraints):
- Performance baselines — only aodex-go has them; goes in `verification` text for `(api, feature)` and `(api, foundation)`.
- Property-based testing — 0 hits org-wide; becomes a resolver constraint (suppress unless TRD opts in), not a column.
- Outside-in stack — captured as `outside_in: true` field on the cells where it applies; not a generic column.

Adding 2 columns (not 5) keeps the schema readable; the resolver carries the rest.

## Open items the user needs to decide

1. **Confirm the port re-read.** The "spec-match (source's tests as fixtures)" recommendation in the shipped table is opinionated and the survey contradicts it. Does the user want the *aspirational* recommendation to stay (and the resolver to log when it's not honored), or does the user want the table to match observed reality?
2. **ui-lib aspirational-vs-real**. If a Chromatic / Percy / Flutter golden-file rollout is planned for v1.1, the ui-lib cells should keep "visual regression" as the goal with an explicit "deferred until tooling lands" footnote rather than dropping it entirely. Otherwise, drop it.
3. **Should the resolver hard-default `tdd: skip` cells to `strict` when the user playbook is present?** The user's habit 1 ("force TDD TRDs at planning time") implies yes. The proposal honors this via `result.config.tdd_default = "tdd"` plus provenance tagging. Worth confirming the precedence.
4. **Where do the 4 new structured fields (`security_isolation`, `back_compat`, `test_list_first`, `fixture_strategy`, `outside_in`) live in the existing intent.cjs resolver output shape?** They're additive but require schema work. v1.1 issue #12 ("Planning-time org awareness") depends on this shape.

## Recommended next step

Plan a v1.1 objective titled **"Refine (kind, work) defaults table from codebase evidence"** with the following TRDs:

1. **TRD 01 — Update `defaults-table.md`** with the 27 changed cells from `tdd-scope-refined-defaults.md`, preserving the 42-cell file format. *type: standard*. *Why standard, not TDD*: the table is a YAML reference doc, not code; verification is "the planner reads it without errors and the new fields surface in `df-tools intent resolve` output".
2. **TRD 02 — Extend intent.cjs resolver schema** to emit the 5 new structured fields (`security_isolation`, `back_compat`, `test_list_first`, `fixture_strategy`, `outside_in`) and the 3 anti-pattern constraints (`no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer`). *type: tdd*. *Why TDD*: this is pure logic with structured input/output, easy to fixture (matches the user's habits 2 and 4).
3. **TRD 03 — Update planner agent** to read the new fields and emit corresponding TRD sections (test-list checklist, fixture-builder task, wrong-tenant assertion in test list, outside-in TRD ordering). *type: standard*. *Why standard*: the planner is a markdown prompt, not code with a unit-testable surface; verification is "planner output matches expected shape on a fixture project".
4. **TRD 04 — Update CLAUDE.md absorption** to map the user's 6 named habits to the 4 structured fields + 2 freeform directives per the RQ3 mapping. *type: tdd*. *Why TDD*: again pure-logic absorption, fixturable.
5. **TRD 05 — Migration + provenance** so existing PROJECT.md / OBJECTIVE.md don't break. The resolver must report `result.provenance.<field> = "table" | "user_playbook" | "trd_override"` so users can audit decisions. *type: tdd*.

Estimated effort: ~1 week of work for someone familiar with the codebase. Lower if the user accepts the proposed deltas as-is; higher if there's substantive disagreement on the port/ui-lib calls (deltas 1 and 2).

The biggest watch-out: **don't ship the table changes and the resolver schema changes in the same TRD**. The resolver schema needs a soak period before downstream consumers (sub-issues #12, #13) lock onto it.

## Acceptance check (against framing doc)

- [x] Each of 6 kinds has at least one sampled real project with documented TDD patterns.
- [x] Each of 7 work types has at least 3 sampled objectives across the org *(refactor and prototype were below the bar — survey calls this out as a limitation)*.
- [x] RQ1 (kind-axis signal per work type) has yes/no with evidence per work type.
- [x] RQ2 (missing dimensions) has in-table-or-not decision per candidate.
- [x] RQ3 (CLAUDE.md habits) has structured-or-freeform decision per habit.
- [x] A proposed updated `defaults-table.md` exists with each delta justified.
- [ ] User has reviewed and approved (or rejected with redirect). *Pending*.
- [ ] If approved: TRD outline for the table-update objective exists, ready for execution. *Outline above; commit to plan once user signs off*.
