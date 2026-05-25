---
work: feature
overrides:
  work: feature
  tdd: strict
---

# Flutter UI verification process

## Goal

Add a devflow process layer that reduces Flutter UI bug rate by enforcing state coverage, integration_test verification, and Maestro automation at plan + execute + verify stages. Stack-focused: Flutter mobile + Flutter web. Establishes a three-layer testing pyramid (widget tests → integration_test → Maestro) with schema-enforced coverage requirements per artifact.

## Overrides

This objective explicitly overrides defaults:

- `work: feature` — comprehensive planning depth, opus model profile per `defaults-table.md` row `(plugin, feature)`.
- `tdd: strict` — every TRD that introduces behavior MUST follow RED → GREEN → REFACTOR with atomic commits. CLAUDE.md TDD Playbook applies: test-list-first per TRD, hand-built fixtures (no LLM-generated test data), one test at a time. Multitenancy guard rule does NOT apply (devflow-claude is not multi-tenant).

The "outside-in for UI flows" habit from CLAUDE.md does NOT apply to the *implementation* of this objective — the implementation is Node.js + markdown (devflow-claude internals). It DOES apply to the *process this objective ships* (which mandates outside-in Maestro → integration_test → widget → unit for downstream Flutter UI TRDs).

---
*Created: 2026-05-24 (auto-scaffold via bootstrapObjectiveMd)*
*Overrides added: 2026-05-24 (via /devflow:plan-objective --work feature --tdd strict)*
