---
title: TDD Scope by (kind, work) — Refined Defaults Proposal
date: 2026-04-29
purpose: Step 3 synthesis. Use the codebase-survey evidence to answer RQ1–RQ4 and propose a refined (kind, work) defaults table.
status: research-synthesis
related:
  - tdd-scope-by-kind-work.md (framing, RQs)
  - tdd-scope-codebase-survey.md (evidence)
  - plugins/devflow/devflow/references/defaults-table.md (table being refined)
  - docs/PROPOSAL-kind-and-work.md (open questions 6 + 7)
---

# TDD Scope by (kind, work) — Refined Defaults Proposal

## TL;DR

- **RQ1**: kind-axis variance is real for `feature` and (partially) `foundation`. It collapses for `port`, `refactor`, `bugfix`, `prototype`, `spike`. Recommend collapsing those 5 work types to 1 row each → **27 cells, not 42**, plus a kind-aware verification override that the resolver applies.
- **RQ2**: of the 5 candidate missing dimensions, only 2 deserve in-table columns (`security_isolation`, `back_compat`); 2 deserve TRD-level mention (`perf_baseline`, `outside_in_layering`); 1 stays anti-pattern only (`property_based`). Detail per dimension below.
- **RQ3**: 4 of 6 user-CLAUDE.md habits become structured fields on `result.config`; 2 stay as freeform absorbed text in `result.directives`.
- **RQ4**: 3 anti-patterns surfaced as resolver-level constraints, not cell values: no LLM-generated test data, no property-based tests by default, no Gherkin/BDD layer.

## RQ1 — kind-axis signal strength per work type

| work | Hypothesis | Evidence | Decision |
|---|---|---|---|
| `feature` | Strong: api vs app vs library vs ui-lib vs cli vs plugin all differ structurally | Confirmed. (api, feature) wants integration + multitenancy. (app, feature) wants outside-in + Maestro/Playwright. (library, feature) wants public-API contract. (ui-lib, feature) wants behavior tests; visual regression is *aspirational* not real. (cli, feature) wants daemon contract or I/O snapshot. (plugin, feature) wants host contract. | **Keep 6 rows** |
| `port` | Strong: source's tests as spec | **Refuted**. Survey: aosentry's port did NOT reuse Rails tests; eden-cli did NOT reuse predecessor tests. Only kind-axis signal that survives is "what kind of parity to verify": api → contract, app → UI parity, library → API parity, ui-lib → visual diff (aspirational, no tooling), cli → I/O parity, plugin → contract. The variance is in the `verification` column, not in `tdd`. The `tdd` value collapses to "regression-suite-after-port" universally. | **Collapse `tdd` column to 1 default; keep kind-aware `verification` differences** |
| `refactor` | Weak: characterization-tests-first universal | Confirmed weak. Characterization-test-first is good practice but **not** observed in any sampled refactor. The recommendation is universal across kinds — only `(ui-lib, refactor)` has a "visual" wrinkle and even that is aspirational. | **Collapse to 1 row** |
| `foundation` | Medium: integration > unit universal | Partially confirmed. (api, foundation) really did use integration > unit. (app, foundation) too. (library, foundation) flipped to "unit > integration" (eden-libs orchestration package matches this). (cli, foundation) is a daemon scaffold — integration. (ui-lib, foundation) and (plugin, foundation) cells are nearly identical. **Net**: 2 distinct postures across 6 kinds — not strong enough to keep 6 rows, but a binary kind-tag (`leans_unit` vs `leans_integration`) would. | **Keep 2 effective rows: library separates; rest collapse** |
| `bugfix` | Weak: regression-test-required universal | Confirmed weak. Only `(ui-lib, bugfix)` adds "visual diff verification" — and that tooling doesn't exist in the org. **Net**: regression-test-required is universal. | **Collapse to 1 row** |
| `prototype` | Weak: skip-or-minimal universal | Confirmed. Universal `skip`. Only `(plugin, prototype)` keeps "minimal contract test" because plugins fail-load otherwise — a kind-specific note rather than a row. | **Collapse to 1 row + footnote for plugin** |
| `spike` | Strong null: deliverable is writeup | Confirmed strongly. Universal `none`. | **Collapse to 1 row** |

### Result

**6 (feature) + 1 (port) + 1 (refactor) + 2 (foundation: library vs other) + 1 (bugfix) + 1 (prototype) + 1 (spike) = 13 effective rows.**

With kind-aware `verification` carried alongside (since port verification varies by kind even when `tdd` doesn't), the table machine-readably becomes:

- 6 cells for `feature` (kept as today)
- 1 row for `port` with a `verification.<kind>` map
- 1 row for `refactor`
- 2 rows for `foundation` (`library` vs others)
- 1 row each for `bugfix`, `prototype`, `spike`

That collapses 42 → ~21 leaf cells (not 28), but for *symmetry with the existing schema* the cleanest path is **27 cells**: keep the (kind, port), (kind, foundation), (kind, refactor) cells as one-line `tdd` values that all reference the same posture name plus a kind-specific `verification` value. Refactor/bugfix/prototype/spike rows become identical strings across the 6 kinds (machine-readable but textually redundant).

**Recommendation: keep 42 cells in the file format** (so the lookup `defaults.<kind>.<work>` keeps a uniform shape) but **drop the `kind` axis from `tdd` for refactor/bugfix/prototype/spike and from `port`** — the `tdd` *string* becomes constant across kinds for those work types. `verification` keeps its kind-aware variance. This preserves the lookup ergonomics without pretending the kind axis carries `tdd`-signal where it doesn't.

## RQ2 — missing dimensions: in-table-or-not

For each candidate dimension, the decision and one-line rationale.

| Dimension | Decision | Rationale |
|---|---|---|
| **Performance baselines** | **TRD-level concern** (mention in `verification` text per cell, not a column). | Only aodex-go has it (k6 thresholds). The rest of the org has zero. Adding a column would be 95% empty. The 5% that matter are clearly `(api, feature)` and `(api, foundation)` — the `verification` cell already names "smoke + connectivity"; extend it to "smoke + connectivity + perf-baseline if hot path" for those two cells. |
| **Property-based testing** | **Anti-pattern by default** (resolver constraint, RQ4). | 0 hits across all repos. User's CLAUDE.md says "skip unless genuinely math-heavy". No reason to add a column. Resolver should *suppress* property-based suggestions unless TRD opts in. |
| **Security / RBAC isolation** | **In-table column: `security_isolation`** for the api row only (others get `n/a`). | aodex-go has 23 TeamID/UserID references but only 2 explicit "wrong-tenant" assertions — that gap is exactly the bug class the user's "multitenancy guard" habit targets. Making it a structured field, defaulted on for `(api, *)` and off elsewhere, lets the resolver enforce the user's habit per cell rather than as freeform absorbed text. |
| **Back-compat (port/refactor)** | **In-table column: `back_compat`** with values `parity` (port) / `behavioral` (refactor) / `none`. | Survey showed port-target tests are *deferred*, not reused — so the existing "spec-match" claim is misleading. A structured `back_compat` field forces the planner to be explicit about what parity means for each port: API-shape parity (api), UI parity (app), API parity (library), visual parity (ui-lib), I/O parity (cli), contract parity (plugin). For refactor it's behavioral parity. For everything else it's `none`. |
| **Outside-in layering** | **TRD-level concern** (mention in `verification` text). | Real for `(app, feature)` and `(api, feature)`. Adding a column is overkill — the user's CLAUDE.md habit covers it as a freeform directive that the planner absorbs. |

**Net additions to the table schema:**

- `security_isolation` — string. Values: `multi_tenant_required`, `single_tenant`, `n/a`. Defaults on for api kind across most work types.
- `back_compat` — string. Values: `api_parity`, `ui_parity`, `library_parity`, `visual_parity`, `io_parity`, `contract_parity`, `behavioral`, `none`. Set per cell.

The other dimensions stay TRD-level (`verification` text) or anti-pattern (resolver constraint).

## RQ3 — CLAUDE.md TDD Playbook habits: structured-or-freeform

The user's `~/.claude/CLAUDE.md` has 6 named TDD habits. For each, decide whether it becomes a structured field on `result.config` (machine-readable, the resolver can act on it) or stays as freeform text on `result.directives` (the planner reads it but the resolver doesn't reason over it).

| Habit | Decision | Resolver shape |
|---|---|---|
| 1. Force TDD TRDs at planning time | **Structured.** | `result.config.tdd_default = "tdd"` (overrides table's `tdd: skip` cells when the user playbook is present). |
| 2. Test list first per TRD | **Structured.** | `result.config.test_list_first = true` — planner emits a "Behavior cases" checklist section in every TDD TRD when this is true. |
| 3. One test at a time (RED→GREEN→REFACTOR) | **Freeform.** | This is a how-to-execute habit, not a planning-time decision. Stays as a directive the executor agent reads. |
| 4. Fixture generators (no LLM-generated test data) | **Structured.** | `result.config.fixture_strategy = "generators"` (vs `inline` / `cassettes` / `factories`) — planner emits an explicit "Fixture builder task" before the first test task in each TDD TRD. |
| 5. Outside-in for UI/portal flows | **Structured.** | `result.config.outside_in = true` *when kind ∈ {app, ui-lib} AND work = feature* — the planner orders TRD steps from outermost (Capybara/Maestro/Playwright) inward. |
| 6. Multitenancy guard in every test | **Structured (but it's the same field as RQ2's `security_isolation`).** | `result.config.security_isolation = "multi_tenant_required"` — the resolver flips this on when kind=api AND user playbook says so. The planner emits the wrong-tenant assertion in the test list. |

**Net `result.config` shape additions:**

```
result.config = {
  tdd: "<table cell or override>",
  depth: "...",
  model_profile: "...",
  verification: "...",
  // NEW from this research:
  security_isolation: "multi_tenant_required" | "single_tenant" | "n/a",
  back_compat: "api_parity" | "ui_parity" | ... | "behavioral" | "none",
  test_list_first: bool,
  fixture_strategy: "generators" | "inline" | "cassettes" | "factories",
  outside_in: bool,
}
result.directives = [
  // freeform text snippets absorbed from CLAUDE.md sections
  "One test at a time RED→GREEN→REFACTOR",
  // ... etc
]
```

## RQ4 — anti-patterns surfaced as resolver constraints

Three anti-patterns from the user's playbook (and the seamless-handoff session memory). These should be resolver-level constraints applied uniformly, **not** cell-level values:

1. **No LLM-generated test data.** Resolver constraint: when emitting test plans, planner must include a "fixture builder" task ahead of the first behavior test, marked `must_be_handwritten: true`. Honors RQ3 habit 4.
2. **No property-based testing by default.** Resolver constraint: planner does not suggest `rapid` / `gopter` / `hypothesis` unless the TRD explicitly opts in via `frontmatter.use_property_based: true`. The cell-level `tdd` text never names property-based.
3. **No Gherkin / BDD syntax layer.** Resolver constraint: planner does not emit `.feature` files or Cucumber-shaped scaffolds; descriptive `t.Run(...)` / `testWidgets('...', ...)` / `test('...', ...)` names carry the meaning.

These belong as a `result.constraints` array in the resolver output, separate from `result.config` (which is per-objective) and `result.directives` (freeform absorbed text).

## Per-cell deltas vs the shipped table

Reading the shipped 42-cell table at `plugins/devflow/devflow/references/defaults-table.md` left-to-right, here are the cells that change with rationale.

### api row (6 cells)

- `(api, feature)` — was `"strict + multi-tenancy assertion"`; now `"strict; outside-in (HTTP→handler→service); multi-tenant isolation required; perf baseline if hot path"`. Reason: aodex-go has the perf baseline (k6) and explicit "wrong-tenant" assertions are the gap; both should be in the cell text. *Tag*: `security_isolation: multi_tenant_required`, `outside_in: true`, `back_compat: none`.
- `(api, port)` — was `"spec-match (source's tests as fixtures)"`; now `"build first, test after; verify API contract parity vs source"`. Reason: aosentry's Rails→Go port shows source tests are NOT reused as fixtures; the port reality is "ship working code, retrofit tests + parity-check at the contract layer". *Tag*: `back_compat: api_parity`, `tdd: standard-with-test-coverage-followup`.
- `(api, refactor)` — was `"characterization first"`; keep, with a stronger note: `"characterization first if existing tests don't cover the surface; otherwise rely on existing suite + go vet"`. Reason: characterization-tests-first is rare in practice but is the right call when the surface is untested.
- `(api, foundation)` — was `"integration > unit"`; keep, append "perf baseline for hot foundations". Reason: scheduler/db connections fit; aodex-go's k6 is the model.
- `(api, bugfix)` — was `"regression test required"`; keep, no change.
- `(api, prototype)` — was `"skip"`; keep, no change.
- `(api, spike)` — was `"none"`; keep, no change.

### app row (6 cells)

- `(app, feature)` — was `"strict; integration > unit"`; now `"strict; outside-in (Maestro/Playwright→integration_test→widget→unit)"`. Reason: aodex-flutter's Maestro YAML + Playwright + integration_test layering IS the outside-in pattern; the table should name it. *Tag*: `outside_in: true`, `back_compat: none`.
- `(app, port)` — was `"spec-match"`; now `"build first, test after; verify UI parity via Maestro/Playwright flows"`. Reason: same as api port — source tests not reused. *Tag*: `back_compat: ui_parity`.
- `(app, refactor)` — was `"characterization (visual + behavioral)"`; now `"characterization (behavioral only — golden-file tooling absent in org)"`. Reason: zero golden-file usage observed in aodex-flutter; the "visual" claim is unsupported.
- `(app, foundation)` — was `"integration > unit"`; keep.
- `(app, bugfix)` — was `"regression per bug"`; keep, append "with explicit reproduction comment in test header" (matches aodex-flutter/12-github-issue-triage's actual practice).
- `(app, prototype)` — was `"skip"`; keep.
- `(app, spike)` — was `"none"`; keep.

### library row (6 cells)

- `(library, feature)` — was `"strict; comprehensive edge cases"`; keep but soften to `"public-API contract tests; edge cases at API surface; unit > integration"`. Reason: eden-ai-go tests are happy-path heavy; "comprehensive edge cases" overstates reality.
- `(library, port)` — was `"spec-match"`; now `"build first, test after; verify public-API parity vs source"`. Reason: same port pattern. *Tag*: `back_compat: library_parity`.
- `(library, refactor)` — was `"characterization first"`; keep.
- `(library, foundation)` — was `"unit > integration"`; keep.
- `(library, bugfix)` — was `"regression test on API surface"`; keep.
- `(library, prototype)` — was `"skip"`; keep.
- `(library, spike)` — was `"none"`; keep.

### ui-lib row (6 cells)

- `(ui-lib, feature)` — was `"strict; visual + a11y + API"`; now `"behavior + a11y where applicable; visual regression skipped (no tooling in org)"`. Reason: zero golden-file usage in eden-ui or eden-ui-flutter; the "visual" recommendation is unimplementable. *Tag*: this is the single most consequential delta of the survey.
- `(ui-lib, port)` — was `"spec-match (visual diff vs. source)"`; now `"build first; verify behavioral parity via widget tests"`. Reason: visual-diff tooling absent; behavioral parity is the achievable goal. *Tag*: `back_compat: visual_parity` (aspirational target the user can opt into when tooling is added).
- `(ui-lib, refactor)` — was `"visual characterization first"`; now `"behavioral characterization first"`. Reason: same — no visual tooling.
- `(ui-lib, foundation)` — was `"unit + visual"`; now `"unit only (visual regression deferred until tooling lands)"`. Reason: same.
- `(ui-lib, bugfix)` — was `"visual regression for bug"`; now `"behavioral regression for bug"`. Reason: same.
- `(ui-lib, prototype)` — was `"skip"`; keep.
- `(ui-lib, spike)` — was `"none"`; keep.

### cli row (6 cells)

- `(cli, feature)` — was `"strict; I/O snapshot + exit codes"`; now `"contract tests for daemon-shape OR I/O snapshot for command-shape; exit codes always"`. Reason: eden-cli is daemon-shaped (DNS responder, reverse proxy) and tests internal modules unit-style — I/O snapshots don't apply. The cell should branch on daemon-vs-command shape.
- `(cli, port)` — was `"spec-match (I/O parity)"`; now `"build first; verify I/O parity (command-shape) or contract parity (daemon-shape)"`. *Tag*: `back_compat: io_parity` or `contract_parity`.
- `(cli, refactor)` — was `"characterization first"`; keep.
- `(cli, foundation)` — was `"unit + integration"`; keep.
- `(cli, bugfix)` — was `"regression per bug"`; keep.
- `(cli, prototype)` — was `"skip"`; keep.
- `(cli, spike)` — was `"none"`; keep.

### plugin row (6 cells)

- `(plugin, feature)` — was `"strict; host contract + mocked host"`; keep, add "fixture builders for host stub". Reason: matches devflow-claude's actual practice — `__fixtures__/intent-fixtures.cjs` is the model. *Tag*: `fixture_strategy: generators`.
- `(plugin, port)` — was `"spec-match"`; keep, but acknowledge same caveat as elsewhere — source tests rarely reused. *Tag*: `back_compat: contract_parity`.
- `(plugin, refactor)` — was `"characterization first"`; keep.
- `(plugin, foundation)` — was `"unit + contract"`; keep.
- `(plugin, bugfix)` — was `"regression per bug"`; keep.
- `(plugin, prototype)` — was `"minimal contract test (host load + init only)"`; keep — this is the only kind-specific prototype note worth keeping.
- `(plugin, spike)` — was `"none"`; keep.

## Proposed refined defaults table

```yaml
defaults:

  # ─────────────────────────────────────────────────────────────
  # api — backend API/service consumed by clients
  # ─────────────────────────────────────────────────────────────
  api:
    feature:
      tdd: "strict; outside-in (HTTP→handler→service); multi-tenant isolation; perf baseline if hot path"
      security_isolation: multi_tenant_required
      back_compat: none
      outside_in: true
      depth: comprehensive
      model_profile: quality
      verification: "full integration + API contract + tenant-isolation assertions; perf baseline if hot path"
    port:
      tdd: "build first, test after; verify API contract parity vs source"
      security_isolation: multi_tenant_required
      back_compat: api_parity
      outside_in: false
      depth: comprehensive
      model_profile: quality
      verification: "API contract parity + retrofit-test-coverage objective"
    refactor:
      tdd: "characterization first if surface untested; otherwise existing suite + go vet"
      security_isolation: multi_tenant_required
      back_compat: behavioral
      outside_in: false
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "integration > unit; perf baseline for hot foundations"
      security_isolation: single_tenant
      back_compat: none
      outside_in: false
      depth: comprehensive
      model_profile: balanced
      verification: "smoke + connectivity; perf baseline if hot foundation"
    bugfix:
      tdd: "regression test required"
      security_isolation: multi_tenant_required
      back_compat: none
      outside_in: false
      depth: quick
      model_profile: balanced
      verification: "bug-specific verification + reproduction case"
    prototype:
      tdd: "skip"
      security_isolation: n/a
      back_compat: none
      outside_in: false
      depth: quick
      model_profile: budget
      verification: "smoke only"
    spike:
      tdd: "none"
      security_isolation: n/a
      back_compat: none
      outside_in: false
      depth: quick
      model_profile: budget
      verification: "none — writeup deliverable"

  # ─────────────────────────────────────────────────────────────
  # app — end-user application (web, mobile, desktop)
  # ─────────────────────────────────────────────────────────────
  app:
    feature:
      tdd: "strict; outside-in (Maestro/Playwright→integration_test→widget→unit)"
      security_isolation: n/a
      back_compat: none
      outside_in: true
      depth: comprehensive
      model_profile: quality
      verification: "Maestro/Playwright flow + integration + widget render"
    port:
      tdd: "build first, test after; verify UI parity via Maestro/Playwright flows"
      back_compat: ui_parity
      outside_in: true
      depth: comprehensive
      model_profile: quality
      verification: "UI parity flows"
    refactor:
      tdd: "characterization (behavioral only — golden-file tooling absent in org)"
      back_compat: behavioral
      outside_in: false
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "integration > unit"
      back_compat: none
      outside_in: false
      depth: comprehensive
      model_profile: balanced
      verification: "navigation + auth smoke"
    bugfix:
      tdd: "regression per bug; explicit reproduction comment in test header"
      back_compat: none
      outside_in: false
      depth: quick
      model_profile: balanced
      verification: "reproduce + verify fix"
    prototype:
      tdd: "skip"
      back_compat: none
      depth: quick
      model_profile: budget
      verification: "manual smoke"
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"

  # ─────────────────────────────────────────────────────────────
  # library — code consumed by other code via API
  # ─────────────────────────────────────────────────────────────
  library:
    feature:
      tdd: "public-API contract tests; edge cases at API surface; unit > integration"
      back_compat: none
      depth: comprehensive
      model_profile: quality
      verification: "API contract + happy-path edges"
    port:
      tdd: "build first, test after; verify public-API parity vs source"
      back_compat: library_parity
      depth: comprehensive
      model_profile: quality
      verification: "API contract parity + retrofit-test-coverage objective"
    refactor:
      tdd: "characterization first"
      back_compat: behavioral
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "unit > integration"
      back_compat: none
      depth: comprehensive
      model_profile: balanced
      verification: "API contract + dependency injection"
    bugfix:
      tdd: "regression test on API surface"
      back_compat: none
      depth: quick
      model_profile: balanced
      verification: "bug-specific"
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "smoke"
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"

  # ─────────────────────────────────────────────────────────────
  # ui-lib — UI components consumed by other apps
  # ─────────────────────────────────────────────────────────────
  ui-lib:
    feature:
      tdd: "behavior + a11y where applicable; visual regression skipped (no tooling in org — opt-in via TRD)"
      back_compat: none
      depth: comprehensive
      model_profile: quality
      verification: "behavioral widget tests + a11y; visual diff if tooling present"
    port:
      tdd: "build first; verify behavioral parity via widget tests"
      back_compat: visual_parity
      depth: comprehensive
      model_profile: quality
      verification: "behavioral widget parity"
    refactor:
      tdd: "behavioral characterization first"
      back_compat: behavioral
      depth: standard
      model_profile: balanced
      verification: "behavioral regression"
    foundation:
      tdd: "unit only (visual regression deferred until tooling lands)"
      back_compat: none
      depth: standard
      model_profile: balanced
      verification: "base components render"
    bugfix:
      tdd: "behavioral regression for bug"
      back_compat: none
      depth: quick
      model_profile: balanced
      verification: "behavioral diff verification"
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "manual smoke"
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"

  # ─────────────────────────────────────────────────────────────
  # cli — command-line tool consumed by humans in a terminal
  # ─────────────────────────────────────────────────────────────
  cli:
    feature:
      tdd: "contract tests for daemon-shape OR I/O snapshot for command-shape; exit codes always"
      back_compat: none
      depth: comprehensive
      model_profile: quality
      verification: "argument parsing + I/O contract or daemon contract"
    port:
      tdd: "build first; verify I/O parity (command) or contract parity (daemon)"
      back_compat: io_parity
      depth: comprehensive
      model_profile: quality
      verification: "output diff vs. source or contract parity"
    refactor:
      tdd: "characterization first"
      back_compat: behavioral
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "unit + integration"
      back_compat: none
      depth: standard
      model_profile: balanced
      verification: "command tree + parsing"
    bugfix:
      tdd: "regression per bug"
      back_compat: none
      depth: quick
      model_profile: balanced
      verification: "bug-specific"
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "manual smoke"
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"

  # ─────────────────────────────────────────────────────────────
  # plugin — extends a host system via plugin contract
  # ─────────────────────────────────────────────────────────────
  plugin:
    feature:
      tdd: "strict; host contract + mocked host; fixture builders for host stub"
      fixture_strategy: generators
      back_compat: none
      depth: comprehensive
      model_profile: quality
      verification: "contract + host integration"
    port:
      tdd: "build first; verify host contract parity"
      back_compat: contract_parity
      depth: comprehensive
      model_profile: quality
      verification: "contract parity"
    refactor:
      tdd: "characterization first"
      back_compat: behavioral
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "unit + contract"
      back_compat: none
      depth: standard
      model_profile: balanced
      verification: "plugin loads + minimal contract"
    bugfix:
      tdd: "regression per bug"
      back_compat: none
      depth: quick
      model_profile: balanced
      verification: "bug-specific"
    prototype:
      tdd: "minimal contract test (host load + init only)"
      back_compat: none
      depth: quick
      model_profile: budget
      verification: "plugin loads + host init contract"
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"

# Resolver-level constraints (NOT cell values). The resolver applies these
# uniformly across all cells unless a TRD opts out via frontmatter.
constraints:
  - id: no_llm_test_data
    description: "Test fixtures must be hand-built (or use recorded cassettes for external APIs). Never accept generated test data as canonical."
    opt_out_field: "frontmatter.allow_generated_test_data"
  - id: no_property_based_default
    description: "Property-based testing (rapid/gopter/Hypothesis) is not suggested by default. Opt in only for genuinely high-cardinality math (refunds, proration, tax)."
    opt_out_field: "frontmatter.use_property_based"
  - id: no_gherkin_layer
    description: "Do not emit .feature files or Cucumber-shaped scaffolds. Descriptive test names carry the meaning."
    opt_out_field: "frontmatter.use_gherkin"
```

## Summary of deltas

The largest groups of cells changing:

1. **All 6 `port` cells**: shipped table claims "spec-match (source tests as fixtures)"; reality is "build first, test after; verify parity at the contract layer". Net change: same direction, more honest words, plus a structured `back_compat` field.
2. **All 4 `(ui-lib, *)` non-skip cells**: shipped table assumes visual-regression tooling that doesn't exist in this org. Cells now name "behavioral" testing as the achievable target with visual as opt-in.
3. **3 `(api, *)` cells**: gain explicit `security_isolation: multi_tenant_required` tagging — surfacing the user's "multitenancy guard" habit as a structured field.
4. **2 `(app, *)` and `(api, feature)` cells**: gain `outside_in: true` tagging — codifying the user's "outside-in for UI/portal flows" habit as a structured field with kind-aware default.
5. **`(plugin, feature)` cell**: gains `fixture_strategy: generators` tagging — devflow-claude's `__fixtures__/intent-fixtures.cjs` becomes the org pattern.

Two cells worth a second look from the user before committing:

- `(api, port)` — moving away from "spec-match" is opinionated. Worth confirming the user agrees with the survey's read.
- `(ui-lib, *)` — the ui-lib row changes 4 of 7 cells. If the user plans to *add* visual tooling (Chromatic / Percy / Flutter golden files) in the next milestone, the cells should keep the visual recommendation as aspirational and document it as "opt-in until tooling lands". The proposed text already hedges this.

## What didn't change

- All 6 `spike` cells (universally `none`).
- All 6 `prototype` cells, except `(plugin, prototype)` which stays as the existing "minimal contract test".
- The `depth`, `model_profile` columns — those are out of scope for this research.

## Validation against user's TDD Playbook

- Habit 1 ("force TDD TRDs") — honored via resolver overriding `tdd: skip` cells when `~/.claude/CLAUDE.md` has the playbook section. Provenance carried in the resolver output (`result.provenance.tdd = "user_playbook"`).
- Habit 2 ("test list first") — honored via `result.config.test_list_first = true` flag, planner emits checklist section.
- Habit 3 ("one test at a time") — honored as freeform directive read by the executor agent; not a structured field.
- Habit 4 ("fixture generators") — honored via `result.config.fixture_strategy = "generators"` flag, planner emits "fixture builder" task ahead of first test.
- Habit 5 ("outside-in") — honored via `outside_in: true` field on `(app, feature)` and `(api, feature)`; planner orders TRDs from outermost layer inward.
- Habit 6 ("multitenancy guard") — honored via `security_isolation: multi_tenant_required` field on api row; planner emits wrong-tenant assertion in test list.

The user's playbook drives 4 of 6 habits as structured fields and 2 as freeform directives. No habit is silently overridden by the table.
