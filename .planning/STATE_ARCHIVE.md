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

