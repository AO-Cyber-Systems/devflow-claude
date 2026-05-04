# Defaults Table — `(kind, work) → defaults`

Machine-readable lookup table mapping every (`kind`, `work`) pair to a recommended testing/planning posture. Read by `df-tools intent resolve` during planning.

**Schema:** YAML inside the fenced block below. Keyed by `defaults.<kind>.<work>`. Each leaf is an object with nine string fields:

- `tdd` — TDD posture for this combination
- `depth` — Planning depth: `quick | standard | comprehensive`
- `model_profile` — Model tier: `quality | balanced | budget`
- `verification` — Post-implementation verification approach
- `security_isolation` — Multitenancy posture: `multi_tenant_required | single_tenant | n/a`
- `back_compat` — Parity target for ports/refactors: `api_parity | ui_parity | library_parity | visual_parity | io_parity | contract_parity | behavioral | none`
- `tdd_default` — Default TDD posture absent CLAUDE.md playbook: `strict | auto | skip`
- `test_list_first` — Whether the planner emits a behavior-cases checklist: `required | optional`
- `fixture_strategy` — Test data approach: `generators | cassettes | inline | n/a`
- `outside_in` — Boolean: `true` when the cell mandates outside-in test ordering (E2E → integration → unit). Only set on specific cells; absent/false otherwise.

**Precedence:** This table is **level 4** in the resolution chain. TRD frontmatter, OBJECTIVE.md `overrides`, and CLAUDE.md user playbooks all win over these defaults.

**Rationale and pedigree:** See `docs/PROPOSAL-kind-and-work.md` for the full rationale on each cell, validation against ~33 real objectives, and citations to industry sources (Feathers, Beck, Fowler, ThoughtWorks, contract-testing consensus).

**Open structural notes:** Cells now carry 9 fields each (4 original + 5 new from the 2026-04-29 codebase-survey research).

```yaml
defaults:

  # ─────────────────────────────────────────────────────────────
  # api — backend API/service consumed by clients
  # ─────────────────────────────────────────────────────────────
  api:
    feature:
      tdd: "strict; outside-in (HTTP→handler→service); multi-tenant isolation; perf baseline if hot path"
      depth: comprehensive
      model_profile: quality
      verification: "full integration + API contract + tenant-isolation assertions; perf baseline if hot path"
      security_isolation: multi_tenant_required
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
      outside_in: true
    port:
      tdd: "build first, test after; verify API contract parity vs source"
      depth: comprehensive
      model_profile: quality
      verification: "API contract parity + retrofit-test-coverage objective"
      security_isolation: multi_tenant_required
      back_compat: api_parity
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    refactor:
      tdd: "characterization first if surface untested; otherwise existing suite + go vet"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
      security_isolation: multi_tenant_required
      back_compat: behavioral
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    foundation:
      tdd: "integration > unit; perf baseline for hot foundations"
      depth: comprehensive
      model_profile: balanced
      verification: "smoke + connectivity; perf baseline if hot foundation"
      security_isolation: single_tenant
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    bugfix:
      tdd: "regression test required"
      depth: quick
      model_profile: balanced
      verification: "bug-specific verification + reproduction case"
      security_isolation: multi_tenant_required
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "smoke only"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none — writeup deliverable"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a

  # ─────────────────────────────────────────────────────────────
  # app — end-user application (web, mobile, desktop)
  # ─────────────────────────────────────────────────────────────
  app:
    feature:
      tdd: "strict; outside-in (Maestro/Playwright→integration_test→widget→unit)"
      depth: comprehensive
      model_profile: quality
      verification: "Maestro/Playwright flow + integration + widget render"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
      outside_in: true
    port:
      tdd: "build first, test after; verify UI parity via Maestro/Playwright flows"
      depth: comprehensive
      model_profile: quality
      verification: "UI parity flows"
      security_isolation: n/a
      back_compat: ui_parity
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    refactor:
      tdd: "characterization (behavioral only — golden-file tooling absent in org)"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
      security_isolation: n/a
      back_compat: behavioral
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    foundation:
      tdd: "integration > unit"
      depth: comprehensive
      model_profile: balanced
      verification: "navigation + auth smoke"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    bugfix:
      tdd: "regression per bug; explicit reproduction comment in test header"
      depth: quick
      model_profile: balanced
      verification: "reproduce + verify fix"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "manual smoke"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a

  # ─────────────────────────────────────────────────────────────
  # library — code consumed by other code via API
  # ─────────────────────────────────────────────────────────────
  library:
    feature:
      tdd: "public-API contract tests; edge cases at API surface; unit > integration"
      depth: comprehensive
      model_profile: quality
      verification: "API contract + happy-path edges"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    port:
      tdd: "build first, test after; verify public-API parity vs source"
      depth: comprehensive
      model_profile: quality
      verification: "API contract parity + retrofit-test-coverage objective"
      security_isolation: n/a
      back_compat: library_parity
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    refactor:
      tdd: "characterization first"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
      security_isolation: n/a
      back_compat: behavioral
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    foundation:
      tdd: "unit > integration"
      depth: comprehensive
      model_profile: balanced
      verification: "API contract + dependency injection"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    bugfix:
      tdd: "regression test on API surface"
      depth: quick
      model_profile: balanced
      verification: "bug-specific"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "smoke"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a

  # ─────────────────────────────────────────────────────────────
  # ui-lib — UI components consumed by other apps
  # ─────────────────────────────────────────────────────────────
  ui-lib:
    feature:
      tdd: "behavior + a11y where applicable; visual regression skipped (no tooling in org — opt-in via TRD)"
      depth: comprehensive
      model_profile: quality
      verification: "behavioral widget tests + a11y; visual diff if tooling present"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    port:
      tdd: "build first; verify behavioral parity via widget tests"
      depth: comprehensive
      model_profile: quality
      verification: "behavioral widget parity"
      security_isolation: n/a
      back_compat: visual_parity
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    refactor:
      tdd: "behavioral characterization first"
      depth: standard
      model_profile: balanced
      verification: "behavioral regression"
      security_isolation: n/a
      back_compat: behavioral
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    foundation:
      tdd: "unit only (visual regression deferred until tooling lands)"
      depth: standard
      model_profile: balanced
      verification: "base components render"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    bugfix:
      tdd: "behavioral regression for bug"
      depth: quick
      model_profile: balanced
      verification: "behavioral diff verification"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "manual smoke"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a

  # ─────────────────────────────────────────────────────────────
  # cli — command-line tool consumed by humans in a terminal
  # ─────────────────────────────────────────────────────────────
  cli:
    feature:
      tdd: "contract tests for daemon-shape OR I/O snapshot for command-shape; exit codes always"
      depth: comprehensive
      model_profile: quality
      verification: "argument parsing + I/O contract or daemon contract"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    port:
      tdd: "build first; verify I/O parity (command) or contract parity (daemon)"
      depth: comprehensive
      model_profile: quality
      verification: "output diff vs. source or contract parity"
      security_isolation: n/a
      back_compat: io_parity
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    refactor:
      tdd: "characterization first"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
      security_isolation: n/a
      back_compat: behavioral
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    foundation:
      tdd: "unit + integration"
      depth: standard
      model_profile: balanced
      verification: "command tree + parsing"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    bugfix:
      tdd: "regression per bug"
      depth: quick
      model_profile: balanced
      verification: "bug-specific"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "manual smoke"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a

  # ─────────────────────────────────────────────────────────────
  # plugin — extends a host system via plugin contract
  # ─────────────────────────────────────────────────────────────
  plugin:
    feature:
      tdd: "strict; host contract + mocked host; fixture builders for host stub"
      depth: comprehensive
      model_profile: quality
      verification: "contract + host integration"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: generators
    port:
      tdd: "build first; verify host contract parity"
      depth: comprehensive
      model_profile: quality
      verification: "contract parity"
      security_isolation: n/a
      back_compat: contract_parity
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    refactor:
      tdd: "characterization first"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
      security_isolation: n/a
      back_compat: behavioral
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    foundation:
      tdd: "unit + contract"
      depth: standard
      model_profile: balanced
      verification: "plugin loads + minimal contract"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    bugfix:
      tdd: "regression per bug"
      depth: quick
      model_profile: balanced
      verification: "bug-specific"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: inline
    prototype:
      tdd: "minimal contract test (host load + init only)"
      depth: quick
      model_profile: budget
      verification: "plugin loads + host init contract"
      security_isolation: n/a
      back_compat: none
      tdd_default: strict
      test_list_first: required
      fixture_strategy: n/a
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"
      security_isolation: n/a
      back_compat: none
      tdd_default: skip
      test_list_first: optional
      fixture_strategy: n/a

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

## Recurring Postures (Glossary)

The cells above use a small vocabulary of named postures. Each maps to a known industry pattern:

- **"strict"** — Iron Law TDD per `references/tdd.md`. RED → GREEN → REFACTOR with command + exit-code evidence at each step.
- **"spec-match"** — (Historical) Treat the source implementation (or source's tests) as the specification. Replaced by "contract-list-first parity" in the 2026-04-29 codebase survey — source tests are rarely reusable as fixtures in practice.
- **"characterization first"** — Write tests that capture current behavior *before* changing internal structure. Source: Michael Feathers, *Working Effectively with Legacy Code* (2004). Required before any refactor.
- **"integration > unit"** — Lean toward integration tests over unit tests for this combination. Foundation/scaffolding work is hard to unit-test in isolation; integration tests catch the wiring that matters.
- **"unit > integration"** — Lean toward unit tests first. Libraries with public APIs benefit from comprehensive unit coverage of the API surface.
- **"regression test required"** — Per Katalon/SmartBear/industry consensus: every bug fix produces a test that reproduces the bug pre-fix and verifies the fix post-fix.
- **"a11y"** — Accessibility testing (axe, Pa11y, or equivalent).
- **"contract test"** — Test against a documented contract (host plugin API, public library API, HTTP API spec).
- **"skip"** — No automated tests required for this work. Use sparingly; document rationale via `<!-- TDD-EXCEPTION: {reason} -->` markers in TRDs.
- **"none"** — Output is not code. Tests do not apply (e.g., spikes producing writeups).
- **"outside-in"** — Plan outside-the-system layer first (E2E / system tests), then drill in (integration → unit). User's CLAUDE.md TDD Playbook habit 5; defaults on for `(app, feature)` and `(api, feature)`.
- **"contract-list-first parity"** — Replaces the older "spec-match" recommendation for ports. Derive a behavioral parity checklist from the source's *behavior* (read source code + tests as documentation, not transplantable fixtures). Write failing parity tests against the new stack, port, pass. RED-GREEN-REFACTOR survives; survey reality respected.
- **"behavioral parity"** — Verify functional equivalence at the public observable surface (HTTP contract, library API, CLI I/O, plugin contract). Distinct from "visual parity" which compares rendered output pixel-by-pixel.

## Versioning

This file is the **source of truth** for the defaults table. Changes here propagate immediately to all running planners (no rebuild needed — references are read at planning time).

When updating cells, also update:
- `docs/PROPOSAL-kind-and-work.md` (the "Defaults Table" section, for the human-readable rationale)
- `CHANGELOG.md` if the change ships in a release
