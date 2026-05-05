---
objective: 09-roadmap-disk-reconciliation
created: 2026-05-04
status: pointer
---

# Objective 9 — Research Pointer

This objective requires NO net-new research. The reconciliation logic is pure-Node fs/string work against a well-understood format (this repo's own ROADMAP.md). All needed patterns already exist in the codebase:

## Patterns reused (no research needed)

1. **Atomic tmp + rename write** — see `lib/initiatives.cjs::_writeInitiativeFile` (obj 5 TRD 05-02:317-338) and `lib/awareness.cjs::writeCache` (obj 2 TRD 02-04:179-191).
2. **Test injection hook (`_setRunFs` / `_resetMocks`)** — see `lib/initiatives.cjs:47-64`. Same pattern for `lib/roadmap-reconcile.cjs`.
3. **Hand-built fixture builder with tmpdir tree** — see `lib/__fixtures__/awareness-fixtures.cjs::buildSiblingRepoTree` (obj 3 TRD 03-01) and `buildInitiativesHomeTree` (obj 5 TRD 05-01).
4. **CLI subcommand router** — see `lib/initiatives-cli.cjs::cmdInitiativesRoute`. Mirror for `lib/roadmap-reconcile-cli.cjs::cmdSyncRoadmapRoute`.
5. **df-tools.cjs case arm** — see `df-tools.cjs:778-781` (`case 'initiatives'`). Add `case 'sync-roadmap'`.
6. **Skill thin-orchestrator** — see `plugins/devflow/skills/initiatives/SKILL.md`. Mirror for `plugins/devflow/skills/sync-roadmap/SKILL.md`.
7. **Export-surface lock with banner comment + EX1 deepStrictEqual test** — see obj 2 TRD 02-07 (14 entries), obj 3 TRD 03-07 (21 entries), obj 4 TRD 04-06 (19 entries), obj 5 TRD 05-05 (23 entries).

## Direct observation as research input

Every v1.1 objective so far has manually flipped `[ ]` → `[x]` in ROADMAP.md after each TRD ships. The chore is real, repeatable, and cheap to automate. This is the input — the codebase IS the spec.

## TDD Playbook directives applied

Per the planning-context directives:

- **Reconciler logic** (rule helpers, walker, atomic write) — `type: tdd`. Pure-logic with fixture-tree inputs satisfies the "Can I write `expect(fn(input)).toBe(output)`?" heuristic.
- **CLI + skill plumbing** — `type: standard`. Glue code between argv parsing and library calls; not domain logic.
- **Export lock + integration** — `type: tdd`. The export-lock test IS the contract; the e2e integration tests (idempotency + self-test) ARE the acceptance gate.

Anti-patterns to enforce in TRDs:

- `no_llm_test_data` — `buildReconcileFixtures` factory with explicit options
- `no_property_based_default` — deterministic, hand-listed test cases
- `no_gherkin_layer` — descriptive test names

## ROADMAP.md format observations

This repo's current `.planning/ROADMAP.md` (the reconciliation target):

- Top-level: `## Milestone v1.1 — DevFlow Coordination Layer (in flight)` + `**Status:** ...` line
- Per-objective: `### Objective N: Title` + `**Goal:** ...` + `**Tracks:** ...` + `**Status:** ...` (some) + `**TRDs:** N plans across M waves` + bulleted checkbox list
- TRD checkbox format: `- [x] 01-01-foo-TRD.md — description` or `- [ ] 01-01-foo-TRD.md — description`
- Existing failed annotation format: NONE (no precedent yet — locked: ` (failed)` suffix appended to description)
- Progress table: NOT present in this repo's current ROADMAP.md (locked: skip silently when absent)

## Self-Check format observations (in SUMMARY.md)

Two formats observed across `.planning/objectives/*/[0-9]*-SUMMARY.md`:

- `## Self-Check: PASSED` (single line — modern format)
- `## Self-Check\n\n- project.md: FOUND\n...` (section header + body lines — older format)

Both formats are PASSED unless body contains `FAILED`. Detection logic:

```js
function _checkSummaryFailed(summaryContent) {
  // Single-line: ## Self-Check: PASSED | FAILED
  const single = summaryContent.match(/^## Self-Check:\s+(PASSED|FAILED)/m);
  if (single) return single[1] === 'FAILED';
  // Section: ## Self-Check\n...body...
  const section = summaryContent.match(/^## Self-Check\s*\n([\s\S]*?)(?=^## |\z)/m);
  if (section) return /\bFAILED\b/.test(section[1]);
  return false; // no Self-Check section at all → assume PASSED (defensive)
}
```

This logic is locked — TRD 09-01 implements exactly this shape.
