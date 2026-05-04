---
objective: 0
title: Refine (kind, work) defaults table from codebase evidence
created: 2026-05-04
status: locked
---

# Objective 0 — Locked Context

This file captures user decisions that are **LOCKED** for the planner. Do not re-litigate. Do not propose alternatives. Implement exactly.

## Locked decisions

### 1. Port cells (all 6 in defaults-table.md)

**DECISION:** Drop "spec-match (source's tests as fixtures)" everywhere. Replace with **contract-list-first**: derive a behavioral parity checklist from the source's *behavior* (read source code + source tests as documentation, not as transplantable fixtures). The checklist becomes the test list per TDD Playbook habit 2. Write failing parity tests against the new stack → port → pass. RED-GREEN-REFACTOR survives; survey reality respected.

**Why:** Survey at `.planning/research/tdd-scope-codebase-survey.md` shows zero observed ports reuse source tests as fixtures (aosentry's Rails→Go port retrofitted tests later; eden-cli's daemon port did the same). The aspirational recommendation contradicts every observed behavior.

### 2. ui-lib cells (all 4 non-skip cells in defaults-table.md)

**DECISION:** Drop "visual regression" from defaults. Defaults become **behavioral + a11y only** (both are TDDable). Visual regression moves to **TRD-level opt-in** via a TRD frontmatter field (`visual_regression: required`). Revisit when/if Chromatic or Flutter golden-files actually ships as a separate objective.

**Why:** Survey shows zero golden-file or visual-diff tooling exists in eden-ui (2 test files for ~400 ERB partials) or eden-ui-flutter (21 widget tests, zero `matchesGoldenFile` calls). Recommending unimplementable tooling makes the table lie.

### 3. Resolver schema — 5 new structured fields + 3 anti-pattern constraints

**DECISION:** `intent.cjs` resolver emits these 5 fields (in addition to existing fields):

| Field | Values | Purpose |
|---|---|---|
| `security_isolation` | `multi_tenant_required` \| `single_tenant` \| `n/a` | Codifies multitenancy guard per cell. |
| `back_compat` | `api_parity` \| `ui_parity` \| `library_parity` \| `visual_parity` \| `io_parity` \| `contract_parity` \| `behavioral` \| `none` | Replaces freeform "spec-match" with concrete parity-target per port/refactor cell. |
| `tdd_default` | `strict` \| `auto` \| `skip` | When CLAUDE.md TDD Playbook is detected, resolver biases `skip` → `auto` and `auto` → `strict`, with provenance tag `user_playbook`. Enforces Playbook habit 1. |
| `test_list_first` | `required` \| `optional` | Required on every `tdd: strict` cell. Planner must emit the test-list checklist in the TRD; verification fails if missing. Enforces Playbook habit 2. |
| `fixture_strategy` | `generators` \| `cassettes` \| `inline` \| `n/a` | Explicit per cell. Planner generates a fixture-builder task ahead of the first behavior test when value=generators or cassettes. Enforces Playbook habit 4. |

Plus 3 anti-pattern resolver constraints (boolean flags, default true; suppress unless TRD opts in):
- `no_llm_test_data` — block LLM-generated test data; require fixture builders or recorded cassettes.
- `no_property_based_default` — suppress property-based testing recommendation unless explicitly opted in for high-cardinality math (refunds, proration, tax).
- `no_gherkin_layer` — suppress BDD/Gherkin syntax recommendation; descriptive test names get the value without the layer.

### 4. Multitenancy hard-enforcement

**DECISION:** When `security_isolation: multi_tenant_required`, the **verification commands array MUST require** a wrong-tenant assertion test. Hard-enforced, not advisory. Codifies TDD Playbook habit 6.

**Why:** Survey found only 2 explicit "wrong-tenant" assertions across 3 sampled aodex-go handler tests despite 23 TeamID/UserID references — most consistently violated habit in the codebase. Making it a required verification command (not a suggestion) closes the gap.

### 5. Testing-strategy matrix soft-bundled

**DECISION:** Author `plugins/devflow/devflow/references/testing-strategy.md` as a **separate reference doc** the planner reads after the resolver returns. **No resolver coupling**. Closes #7.

**Why:** The (kind, work) cell answers "what testing posture?"; the testing-strategy matrix answers "which specific tool at which layer for the project's stack?". Different questions, different axes. Soft bundle (separate docs, both consumed by planner) keeps integration tractable while shipping both together.

### 6. TRD types (locked, not auto-derived)

| TRD | Type | Reason |
|---|---|---|
| 01 — Update defaults-table.md | `standard` | YAML reference doc; verify via `df-tools intent resolve` round-trip on a fixture project. |
| 02 — Extend resolver schema | `tdd` | Pure logic with structured input/output; matches Playbook habits 2 + 4 (test list first, fixture builders). |
| 03 — Update planner agent | `standard` | Markdown prompt; no unit-testable surface. Verify by inspecting planner output on a fixture project. |
| 04 — CLAUDE.md absorption | `tdd` | Pure-logic absorption; fixturable. |
| 05 — Migration + provenance | `tdd` | Pure-logic; verify provenance reporting on fixture objectives. |
| 06 — Author testing-strategy.md | `standard` | Reference doc. |
| 07 — Planner reads testing-strategy.md | `standard` | Markdown prompt update. (May merge with TRD 03 if planner agent decides single-file edit.) |

### 7. CRITICAL sequencing constraint

**TRD 01 (table changes) and TRD 02 (resolver schema) MUST NOT ship in the same wave or commit.** Resolver schema needs a soak period before downstream consumers (#12, #13) lock onto the field shape.

Recommended waves:
- Wave 1: TRD 01 (table) + TRD 06 (testing-strategy.md) — both reference docs, no resolver dependency
- Wave 2: TRD 02 (resolver schema) — soaks alone
- Wave 3: TRD 03 + TRD 04 + TRD 07 (planner reads new fields + new ref doc) — depend on Wave 2
- Wave 4: TRD 05 (migration + provenance) — final integration test

### 8. TDD discipline for tdd-typed TRDs

Per CLAUDE.md TDD Playbook (apply to TRDs 02, 04, 05):
- **Test list first**: include a checklist of behavior cases (happy path + edge cases + failure modes) BEFORE any test code is written.
- **Fixture builders as their own task** ahead of the first behavior test. Use `__fixtures__/intent-fixtures.cjs` style — hand-built factory functions, not LLM-generated test data.
- **One test at a time** RED → GREEN → REFACTOR. No batching.
- **Resolver tests MUST exercise the multi_tenant_required path** with a fixture object to prove the verification-command injection works (devflow-claude itself is multi-tenant-N/A, but the resolver code path must work).
- **Atomic commits per TDD TRD**: 2-3 commits (`test:` → `feat:` → optional `refactor:`).

## Discretion areas (planner decides)

- Sub-task granularity within each TRD.
- Specific verification command syntax (must include the wrong-tenant assertion path for multi-tenant fixtures, but exact shell invocation up to planner).
- Whether TRD 03 and TRD 07 should merge into a single TRD if the planner agent edit is small (the diffs may overlap).
- Fixture file naming and location within `plugins/devflow/devflow/bin/__fixtures__/`.
- Test runner organization: keep `df-tools.test.cjs` as the single test file, or split intent.cjs tests into a sibling `intent.test.cjs`.

## Out of scope (planner must NOT include)

- Chromatic / Percy / Flutter golden-file rollout (separate future objective).
- Property-based testing infrastructure beyond the `no_property_based_default` constraint flag.
- Bidirectional planner ↔ resolver round-tripping (one-way only: resolver outputs, planner consumes).
- Org-wide rollout of the testing-strategy matrix to other repos' CLAUDE.md (ongoing program work).
- Backwards-compatibility migration for the 4 sub-resolver fields the agent considered out (perf baselines, property-based, outside-in stack details). Resolver simply emits structured fields; downstream behavior change is the consumer's problem.

## Goal-backward verification

Every TRD must include `must_haves` that map to the 10 success criteria in ROADMAP.md objective 0. Reproduced here for planner reference:

1. `defaults-table.md` reflects 27 changed cells + 5 new column headers; format remains valid parseable YAML reference doc.
2. `intent.cjs` resolver emits the 5 new structured fields + 3 anti-pattern constraints; provenance reported per field.
3. Planner agent reads new fields and emits TRD sections (test-list checklist, fixture-builder task, wrong-tenant assertion, outside-in TRD ordering).
4. CLAUDE.md absorption maps all 6 TDD Playbook habits to 5 structured fields + 1 freeform directive.
5. `references/testing-strategy.md` exists with layer×tool×stack matrix + Flutter-web semantics gotcha + codegen discipline + platform routing paragraphs.
6. Planner consults testing-strategy.md when emitting verification commands.
7. Existing PROJECT.md / OBJECTIVE.md / TRD.md don't break — migration validated against `01-handoff-watcher`.
8. TRD 01 and TRD 02 ship in different waves/commits.
9. `df-tools intent resolve --objective <fixture>` round-trips on a fixture project covering all 6 kinds × 7 work types and exercises `multi_tenant_required`.
10. `npm test` passes; new TDD-tagged TRDs (02, 04, 05) ship `test:` commits before `feat:` commits.

## GitHub tracking

- **Issue:** [devflow-claude#20](https://github.com/AO-Cyber-Systems/devflow-claude/issues/20) (sub-issue of #9)
- **Closes in same PR:** [devflow-claude#7](https://github.com/AO-Cyber-Systems/devflow-claude/issues/7) (testing-levels matrix folded into TRD 06)
- **Gates:** #12 (planning-time org awareness), #13 (duplicate-work detection)
- **Branch:** `feature/v1.1` (don't push to origin until objective complete)
