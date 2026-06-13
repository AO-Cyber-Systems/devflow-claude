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
- [Objective 10-phase-e-agent-audit]: subagent_type=general-purpose is correct ONLY for workflow invocations (Task prompt='Run /devflow:<skill> ...'); all agent-class work must use a dedicated df-* agent
- [Objective 10-phase-e-agent-audit]: Single atomic commit for all 6 workflow files: uniform mechanical subagent_type replacements, no behavioral divergence between files
- [Objective 10-phase-e-agent-audit]: Convention established: general-purpose is correct ONLY for Task(prompt='Run /devflow:...') workflow-invocation trampolines; all other spawns use dedicated df-* agents
- [Objective 16-phase-b-micro-skill]: Cutoff numbers for /devflow:quick are advisory (<5 files, <200 LOC, no new abstractions) — exact wording from issue #27, preserved for 16-04 classifier consistency
- [Objective 16-phase-b-micro-skill]: quick triggers drop tiny/quick-fix/can-you-just — those route to /devflow:micro; workflow.md process steps are unchanged
- [Objective 16-phase-b-micro-skill]: 16-04: Trivial-noun whitelist approach for micro INTENT_MAP entry prevents collision with build/debug/quick
- [Objective 16-phase-b-micro-skill]: 16-04: classifier.cjs case 9 inverted to 4-assertion gate proving Phase B shipped state
- [Objective 16]: gitRunner injection in commitMicro avoids coupling to cmdCommit's loadConfig/isGitIgnored checks that fail in test tmpdir fixtures
- [Objective 16]: .micro-description sidecar for cross-invocation description persistence (skill-active marker has no description field by design)
- [Objective 16]: No Task tool in SKILL.md allowed-tools: micro's value is single-context execution; agent spawn excluded to enforce no-ceremony promise
- [Objective 17-phase-c-auto-init]: Time injected as ISO string param in decline-tracker for deterministic test assertions
- [Objective 17-phase-c-auto-init]: clearDecline writes {} when last entry removed (avoids TOCTOU race vs file delete)
- [Objective 17-phase-c-auto-init]: global-config: forward-compat merge uses {...DEFAULT_CONFIG, ...parsed} — user values win; unknown v1.3+ keys survive unchanged
- [Objective 17-phase-c-auto-init]: global-config shouldAutoInit uses strict === true, not truthy — guards against string 'true' from hand-edited config
- [Objective 17-phase-c-auto-init]: Non-scratch tmpdir via ~/.devflow-test-fixtures/ for Phase C fixtures: macOS os.tmpdir() returns /var/folders/ (scratch prefix) — all non-scratch fixtures must use homedir-relative path
- [Objective 17-phase-c-auto-init]: Backdated git commits in fixtures: GIT_AUTHOR_DATE/GIT_COMMITTER_DATE must be on 'git commit' command, not 'git add' — env vars only apply to the process they prefix
- [Objective 17-phase-c-auto-init]: isSubstantive=true default preserves 15-01 back-compat without test modification
- [Objective 17-phase-c-auto-init]: Mode promotion post-classifySession: hook promotes init-offer to auto-init keeping classifier pure
- [Objective 18-v1-1-polish-bundle]: sync-roadmap runs before gh sync and before final commit in update_roadmap — ensures ROADMAP drift captured in same atomic commit
- [Objective 18]: JSDoc block comments must not contain */ glob patterns — terminates comment early in Node.js parser; use prose description instead
- [Objective 18]: bootstrapObjectiveMd mirrors bootstrapProjectMd return shape { applied, added_fields, path, reason } — consistent contract across all bootstrap helpers
- [Objective 18]: backfillAllObjectives uses sorted fs.readdirSync for cross-platform determinism; per-dir try/catch with errors[] aggregation
- [Objective 18]: Cache-only preview helpers in init.cjs — _buildCheckTodosPreview reads parsed.now array, _buildAwarenessPreview filters current branch from peer.branches; advisories_warnings always emitted as [] for stable JSON shape
- [Objective 10-autonomous-mode-overhaul]: Blocked-set computation at orchestrator level from already-loaded wave/depends_on data; computeBlockedSet reserved for resume-time recomputation
- [Objective 10-autonomous-mode-overhaul]: Rule 4 returns parked as type: rule-4-deviation using same decision-queue add path as checkpoint:decision
- [Objective 10]: Pending decisions in Stop hook use 3-cap bound rather than bypass: pending ids appear in the reason string on every block attempt; the cap ends the loop regardless
- [Objective 10]: executor.md hardened: maxTurns:50, isolation:worktree; permissionMode omitted with comment (silently ignored for plugin agents)
- [Objective 10]: verifier.md hardened: maxTurns:30, memory:project; executor intentionally omits memory (fresh context per plan)
- [Objective 10]: execute-objective.md: TRD content embedded inline in executor spawn prompts + step 5b post-wave worktree merge before spot-checks
- [Objective 10]: unattended-operation.md documents all shipped autonomous-mode mechanics as operator card; mode question added to settings SKILL.md
- [Objective 23]: gate-commits initialization check uses ROADMAP.md or objectives/ presence rather than STATE.md
- [Objective 23]: route-intent renderDirective compact rewrite: 5-line adaptive-width box, 396 bytes (was 1564)
- [Objective 23]: 23-04: Moved trigger lists into ## Triggers body sections rather than deleting; help SKILL.md at 265 chars already compliant
- [Objective 23]: execute-trd.md cross-ref phrases removed inline (option b) — no content added, just stale execute-job refs deleted
- [Objective 23]: check-todos E2E3 test updated to assert skill dir removed in v2.2 rather than restoring deleted dir
- [Objective 23]: Extracted executor deviation Rules 1-4 byte-faithful to references/deviation-rules.md; RULE PRIORITY kept inline
- [Objective 24]: build/SKILL.md left unchanged — decision 6 locks build-flavored triggers to build skill only; execute-objective now uses execution-only phrasing with zero trigger overlap
- [Objective 24]: quick/help generic triggers tightened — 'do this'→'do this small task', 'tackle this'→'tackle this small change', bare 'help'→'devflow help' (decision 7 description part complete)
- [Objective 24-natural-language-routing-trigger-fixes]: OVERRIDE_PHRASES single source in hooks/lib/edit-override.js; gate-edits re-exports for back-compat with route-intent and tests
- [Objective 24-natural-language-routing-trigger-fixes]: consumeEditOverrideMarker deletes marker in BOTH fresh and stale cases (consume-on-read + stale cleanup); TTL = 5 minutes
- [Objective 24-natural-language-routing-trigger-fixes]: gate-edits.js main() drops dead input.user_message read; overrideActive now computed via consumeEditOverrideMarker(planningDir) only
- [Objective 24]: BUILD suppression post-filter (option c): apply suppressBuild on matched labels before Set/map; smallest diff, multi-intent preserved
- [Objective 24]: matchIntent pure opts.skillActive: fs read stays in main(), matchIntent stays pure — mirrors gate-edits shouldGate pattern
- [Objective 24]: Override marker write before early-return in main(): override prompts return [] but MUST arm gate bypass (decisions 1+4 from 24-CONTEXT.md)
- [Objective 10-flutter-ui-verification-process]: 10-02: Flutter state-pattern catalog shipped (295 lines); HIGH=blocker/MEDIUM-LOW=advisory model; web verification via flutter drive (not Maestro, mobile-only-by-design due to #2591); setState patterns never block
- [Objective 10-flutter-ui-verification-process]: Tests assert actual extractFrontmatter parser output for nested-object-in-block-array fields (api_contract, artifacts): parser captures dash-prefixed items as strings, not structured objects. Tests document this behavior accurately per TRD error recovery guidance.
- [Objective 10-flutter-ui-verification-process]: FRONTMATTER_SCHEMAS.trd.required left unchanged at 8 fields — Flutter UI field enforcement is semantic (planner emits PLANNING INCONCLUSIVE), not schema-based. Case 12 regression guard protects this.
- [Objective 10-flutter-ui-verification-process]: platform: [mobile, web] documented as canonical DEFAULT for Flutter UI TRDs. tests.maestro is mobile-only BY DESIGN (upstream issue mobile-dev-inc/maestro#2591). tests.integration is single path used by both platforms via different drivers.
- [Objective 10]: derivePlatform always returns ['mobile', 'web'] — no pubspec.platforms.web gating (user correction 2026-05-24)
- [Objective 10]: Planner break_into_tasks now invokes detect flutter-ui-scope and emits PLANNING INCONCLUSIVE on missing type=ui fields (states/tests.widget/tests.integration/tests.maestro)
- [Objective 10]: SETUP_TASK_TEMPLATE extracted as top-level constant in flutter-ui-bootstrap.cjs for legibility; marker path is per-project (.planning/.flutter-ui-bootstrap-done inside projectDir); test_driver/integration_test.dart scaffold embedded verbatim in setup_task for single-source-of-truth
- [Objective 10-flutter-ui-verification-process]: TRD 10-04b: Maestro is mobile-only BY DESIGN in executor gates — no maestro_web opt-in; web verification via flutter drive --driver=test_driver/integration_test.dart
- [Objective 10-flutter-ui-verification-process]: TRD 10-04b: Bootstrap detector invoked in load_project_state (before task execution per Pitfall #10); flutter analyze uses baseline-diff not exit-code gate to avoid pre-existing warning false negatives
- [Objective 10]: Used YAML-key-first parsing strategy in loadCatalog: each yaml block's first line identifies the library — more robust than heading-matching
- [Objective 10]: setState patterns are all MEDIUM/LOW so setState misses route to advisories not blockers, matching flutter-state-patterns.md confidence model

## Performance Metrics

| Objective | Duration | Tasks | Files |
|-----------|----------|-------|-------|
| Objective 09-roadmap-disk-reconciliation P09-01 | 6min | - tasks | - files |
| Objective 06 P04 | 6 | 3 tasks | 5 files |
| Objective 08 P08-01 | 360 | 3 tasks | 13 files |
| Objective 08 P08-02 | 6 | 2 tasks | 3 files |
| Objective 08 P08-03 | 226 | - tasks | - files |
| Objective 10-phase-e-agent-audit P02 | 2 | 1 tasks | 1 files |
| Objective 16-phase-b-micro-skill P03 | 2 | 1 tasks | 2 files |
| Objective 16 P01 | 9min | 3 tasks | 3 files |
| Objective 17-phase-c-auto-init P04 | 5min | 2 tasks | 4 files |
| Objective 18 P18-01 | 6 | 3 tasks | 20 files |
| Objective 24 P03 | 354 | 2 tasks | 3 files |
| Objective 24-natural-language-routing-trigger-fixes P01 | 949 | 2 tasks | 4 files |
| Objective 24 P02 | 13 | 2 tasks | 3 files |
| Objective 10-flutter-ui-verification-process P01 | 9 | 2 tasks | 2 files |
| Objective 10 P03 | 13min | 2 tasks | 7 files |
| Objective 10 P10-04a | 7min | 2 tasks | 3 files |
| Objective 10 P05 | 12min | 2 tasks | 8 files |

