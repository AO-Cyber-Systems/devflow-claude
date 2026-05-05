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
- [Objective 06]: _fetchDupDetectLog propagates readFileSync errors so aggregate routes to warnings[]; gh._runGh exported as wrapper function for injection hook; buildCheckTodosFixtures auth mock puts Token scopes in stdout
- [Objective 06-02]: readCheckTodosCache/writeCheckTodosCache/isCheckTodosCacheStale route through _runFs (not bare fs) — injection-hook consistent with obj 4/5; realFs extended in-place with writeFileSync+mkdirSync; cached:true only when zero sources re-fetched
- [Objective 06-unified-check-todos]: formatCheckTodosMarkdown sub-renderers stay private; only public formatter exported to preserve clean API boundary
- [Objective 06-unified-check-todos]: Token bound is warn-not-truncate: appends footer when output > 8000 chars; never slices string mid-entry
- [Objective 06-unified-check-todos]: Surface count locked at 20 (not 19): 2 public + 5 fetchers + 1 lane + 3 cache + 4 hooks + 5 constants = 20 entries. CONTEXT.md claimed 19 but recount corrected.
- [Objective 06-unified-check-todos]: SKILL.md REWRITE: /devflow:check-todos now delegates to df-tools check-todos $ARGUMENTS (thin-orchestrator); legacy workflows/check-todos.md preserved for df-tools list-todos.
- [Objective 08-01]: Snapshots written manually after visual ANSI inspection; never auto-regenerated (mirrors obj 1 cassette discipline)
- [Objective 08-01]: _sanitize() replaces ESC byte with '?' in user-supplied text to prevent ANSI injection from branch names/org titles
- [Objective 08-01]: no_color contract: strips FG color codes only (\x1b[3xm); BOLD/DIM/RESET structural escapes preserved
- [Objective 08-program-aware-tui]: tui-cli.cjs: idempotent _cleanup via _cleaned guard; non-TTY auto-fallback on !isTTY; hand-rolled key dispatch; --raw implies --once in parser
- [Objective 08]: EX1 passed at RED (08-01/08-02 produced exact 7-entry surface); EX3 banner-absent was the true RED gate for TRD 08-03
- [Objective 08]: SKILL_PATH path math corrected: 3 ups from lib/ (not 4) to reach plugins/devflow/skills/; used ../../../skills/tui/SKILL.md

## Performance Metrics

| Objective | Duration | Tasks | Files |
|-----------|----------|-------|-------|
| Objective 09-roadmap-disk-reconciliation P09-01 | 6min | - tasks | - files |
| Objective 06 P04 | 6 | 3 tasks | 5 files |
| Objective 08 P08-01 | 360 | 3 tasks | 13 files |
| Objective 08 P08-02 | 6 | 2 tasks | 3 files |
| Objective 08 P08-03 | 226 | - tasks | - files |

