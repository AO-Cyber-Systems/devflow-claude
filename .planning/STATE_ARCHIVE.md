# State Archive

Append-only log. Written by df-tools `add-decision` and `record-metric`.
STATE.md stays lean; this file grows over time.

## Decisions

- *()*
- [Objective 00-refine-defaults-table]: TRD 0.3 complete: Planner agent extended with 5-field consumption + testing-strategy.md routing + constraint enforcement. All 6 greps pass. Closes SC-3, SC-6.
- [Objective 09-roadmap-disk-reconciliation]: ROADMAP.md mutation is regex-only: never YAML-parse, line-level match-and-replace preserves non-TRD content
- [Objective 09-roadmap-disk-reconciliation]: Idempotency via correct-state guards: emit change only when current state differs from target
- [Objective 09-roadmap-disk-reconciliation]: No auto-uncheck on missing SUMMARY: [x] without SUMMARY left alone; orphan_warning only when TRD file also missing
- [Objective ?]: 09-02: objective_num preserved verbatim from ROADMAP header regex capture; rollup co-emits with rule changes in same reconcile call

## Performance Metrics

| Objective | Duration | Tasks | Files |
|-----------|----------|-------|-------|
| Objective 09-roadmap-disk-reconciliation P09-01 | 6min | - tasks | - files |
