# Defaults Table — `(kind, work) → defaults`

Machine-readable lookup table mapping every (`kind`, `work`) pair to a recommended testing/planning posture. Read by `df-tools intent resolve` during planning.

**Schema:** YAML inside the fenced block below. Keyed by `defaults.<kind>.<work>`. Each leaf is an object with four string fields:

- `tdd` — TDD posture for this combination
- `depth` — Planning depth: `quick | standard | comprehensive`
- `model_profile` — Model tier: `quality | balanced | budget`
- `verification` — Post-implementation verification approach

**Precedence:** This table is **level 4** in the resolution chain. TRD frontmatter, OBJECTIVE.md `overrides`, and CLAUDE.md user playbooks all win over these defaults.

**Rationale and pedigree:** See `docs/PROPOSAL-kind-and-work.md` for the full rationale on each cell, validation against ~33 real objectives, and citations to industry sources (Feathers, Beck, Fowler, ThoughtWorks, contract-testing consensus).

**Open structural notes:** ~40% of cells (specifically the `refactor`, `bugfix`, `prototype`, and `spike` rows) are nearly identical across all six `kind` values — only `ui-lib` introduces meaningful variance via visual tooling. The full 42-cell table is preserved for symmetry and machine-readability; collapsing is deferred until usage data justifies it.

```yaml
defaults:

  # ─────────────────────────────────────────────────────────────
  # api — backend API/service consumed by clients
  # ─────────────────────────────────────────────────────────────
  api:
    feature:
      tdd: "strict + multi-tenancy assertion"
      depth: comprehensive
      model_profile: quality
      verification: "full integration + API contract"
    port:
      tdd: "spec-match (source's tests as fixtures)"
      depth: comprehensive
      model_profile: quality
      verification: "API contract parity"
    refactor:
      tdd: "characterization first"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "integration > unit"
      depth: comprehensive
      model_profile: balanced
      verification: "smoke + connectivity"
    bugfix:
      tdd: "regression test required"
      depth: quick
      model_profile: balanced
      verification: "bug-specific verification"
    prototype:
      tdd: "skip"
      depth: quick
      model_profile: budget
      verification: "smoke only"
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none — writeup deliverable"

  # ─────────────────────────────────────────────────────────────
  # app — end-user application (web, mobile, desktop)
  # ─────────────────────────────────────────────────────────────
  app:
    feature:
      tdd: "strict; integration > unit"
      depth: comprehensive
      model_profile: quality
      verification: "golden-path E2E + system"
    port:
      tdd: "spec-match"
      depth: comprehensive
      model_profile: quality
      verification: "UI parity tests"
    refactor:
      tdd: "characterization (visual + behavioral)"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "integration > unit"
      depth: comprehensive
      model_profile: balanced
      verification: "navigation + auth smoke"
    bugfix:
      tdd: "regression per bug"
      depth: quick
      model_profile: balanced
      verification: "reproduce + verify fix"
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
  # library — code consumed by other code via API
  # ─────────────────────────────────────────────────────────────
  library:
    feature:
      tdd: "strict; comprehensive edge cases"
      depth: comprehensive
      model_profile: quality
      verification: "API contract + edges"
    port:
      tdd: "spec-match"
      depth: comprehensive
      model_profile: quality
      verification: "API contract parity"
    refactor:
      tdd: "characterization first"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "unit > integration"
      depth: comprehensive
      model_profile: balanced
      verification: "API contract + dependency injection"
    bugfix:
      tdd: "regression test on API surface"
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
      tdd: "strict; visual + a11y + API"
      depth: comprehensive
      model_profile: quality
      verification: "visual regression + a11y + contract"
    port:
      tdd: "spec-match (visual diff vs. source)"
      depth: comprehensive
      model_profile: quality
      verification: "visual parity"
    refactor:
      tdd: "visual characterization first"
      depth: standard
      model_profile: balanced
      verification: "visual regression"
    foundation:
      tdd: "unit + visual"
      depth: standard
      model_profile: balanced
      verification: "base components render"
    bugfix:
      tdd: "visual regression for bug"
      depth: quick
      model_profile: balanced
      verification: "visual diff verification"
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
      tdd: "strict; I/O snapshot + exit codes"
      depth: comprehensive
      model_profile: quality
      verification: "argument parsing + I/O"
    port:
      tdd: "spec-match (I/O parity)"
      depth: comprehensive
      model_profile: quality
      verification: "output diff vs. source"
    refactor:
      tdd: "characterization first"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "unit + integration"
      depth: standard
      model_profile: balanced
      verification: "command tree + parsing"
    bugfix:
      tdd: "regression per bug"
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
      tdd: "strict; host contract + mocked host"
      depth: comprehensive
      model_profile: quality
      verification: "contract + host integration"
    port:
      tdd: "spec-match"
      depth: comprehensive
      model_profile: quality
      verification: "contract parity"
    refactor:
      tdd: "characterization first"
      depth: standard
      model_profile: balanced
      verification: "regression suite"
    foundation:
      tdd: "unit + contract"
      depth: standard
      model_profile: balanced
      verification: "plugin loads + minimal contract"
    bugfix:
      tdd: "regression per bug"
      depth: quick
      model_profile: balanced
      verification: "bug-specific"
    prototype:
      tdd: "minimal contract test (host load + init only)"
      depth: quick
      model_profile: budget
      verification: "plugin loads + host init contract"
    spike:
      tdd: "none"
      depth: quick
      model_profile: budget
      verification: "none"
```

## Recurring Postures (Glossary)

The cells above use a small vocabulary of named postures. Each maps to a known industry pattern:

- **"strict"** — Iron Law TDD per `references/tdd.md`. RED → GREEN → REFACTOR with command + exit-code evidence at each step.
- **"spec-match"** — Treat the source implementation (or source's tests) as the specification. Reuse fixtures and assertions from the source where possible. Standard practice for ports and consumer-driven contract testing (Pact-style).
- **"characterization first"** — Write tests that capture current behavior *before* changing internal structure. Source: Michael Feathers, *Working Effectively with Legacy Code* (2004). Required before any refactor.
- **"integration > unit"** — Lean toward integration tests over unit tests for this combination. Foundation/scaffolding work is hard to unit-test in isolation; integration tests catch the wiring that matters.
- **"unit > integration"** — Lean toward unit tests first. Libraries with public APIs benefit from comprehensive unit coverage of the API surface.
- **"regression test required"** — Per Katalon/SmartBear/industry consensus: every bug fix produces a test that reproduces the bug pre-fix and verifies the fix post-fix.
- **"visual regression"** — Use a tool like Percy, Chromatic, or equivalent to capture and compare rendered output across changes.
- **"a11y"** — Accessibility testing (axe, Pa11y, or equivalent).
- **"contract test"** — Test against a documented contract (host plugin API, public library API, HTTP API spec).
- **"skip"** — No automated tests required for this work. Use sparingly; document rationale via `<!-- TDD-EXCEPTION: {reason} -->` markers in TRDs.
- **"none"** — Output is not code. Tests do not apply (e.g., spikes producing writeups).

## Versioning

This file is the **source of truth** for the defaults table. Changes here propagate immediately to all running planners (no rebuild needed — references are read at planning time).

When updating cells, also update:
- `docs/PROPOSAL-kind-and-work.md` (the "Defaults Table" section, for the human-readable rationale)
- `CHANGELOG.md` if the change ships in a release
