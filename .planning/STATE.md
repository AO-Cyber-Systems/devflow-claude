# DevFlow State

## Project Reference

**Building:** DevFlow Claude — meta-prompting plugin for Claude Code, evolving into program-aware coordination layer for AO-Cyber-Systems org
**Core Value:** AI workflow orchestration + cross-repo program awareness for AI-assisted development
**Ecosystem:** AODex (Rails+Go API) + AOSentry (LLM Gateway) + Flutter (macOS Hub) + DevFlow (local platform CLI/daemon) + DevFlow Claude (this — Claude Code plugin)

## Current Position

**Milestone:** v1.1 — DevFlow Coordination Layer (in flight)
**Branch:** `feature/v1.1`
**Objective complete:** 0 — Refine (kind, work) defaults table from codebase evidence (verified 2026-05-04, 443/443 tests, all 10 SC met)
**Objective complete:** 1 — GitHub coordination layer (verified 2026-05-04, 563/563 tests, all 6 TRDs done, SC-9 + SC-10 met)
**Objective in flight:** 2 — Cross-worktree session telemetry (next)
**Current TRD:** 02-01 (not yet started)
**Status:** Ready to plan

## Branch State (post-merge)

- `main` — has the merged kind/work intent model (PR #8) + seamless-handoff watcher (PR #19). 349/349 tests pass.
- `feature/v1.1` (this branch) — clean off new main; carries v1.1 planning + TDD-scope research framing. 408/408 tests pass (381 + 27 from TRD 0.2 new tests).
- `feature/v1.1-coordination` (superseded) — earlier name for v1.1 work; same content, can be deleted.
- `feature/seamless-handoff`, `handoff-completion-work`, `proposal/kind-and-work` — all merged via PRs #19 and #8; safe to delete.

## Recent Decisions

- **Plan org-aware, execute repo-focused** — devflow-claude consults org state at planning time; execution stays repo-local. Brains at plan time, not exec time. (Project memory: `project_devflow_claude_scope`)
- **Continue executing — no manual paste** — seamless-handoff watcher daemon (Approach B) shipped; daemon executes queued commands in user's interactive shell, injects results back via UserPromptSubmit hook. v1.1 limit: stdio-pipe dispatch can't satisfy true TTY-required prompts (doctl auth init etc.); v1.2 PTY backend closes that gap.
- **Org-level coordination via GitHub** — Product Roadmap project (`PVT_kwDODwqLrc4BRsOP`) is the substrate. devflow-claude#9 [Roadmap] now exists with 9 v1.1 sub-issues (#10–#18). Linked as sub-issue of devflow#30 (DevFlow Internal Alpha Q2 2026 epic).
- **Three research docs anchor v1.1**:
  - `github-coordination-layer.md` — structural (GH Issues + Projects v2 + sub-issues)
  - `cross-session-coordination.md` — runtime (heartbeat + duplicate detection + initiatives + check-todos + handoff)
  - `org-context-resolver.md` — foundational service every other v1.1 capability depends on
- **TDD scope research COMPLETE** — survey ran across 9 sibling repos (aodex-go, aosentry, aohealth-go, aodex-flutter, eden-libs, eden-ui, eden-ui-flutter, eden-cli, devflow-claude). 4 artifacts at `.planning/research/tdd-scope-{by-kind-work,codebase-survey,refined-defaults,summary}.md`. Locked decisions captured in `.planning/objectives/00-refine-defaults-table/00-CONTEXT.md`.
- **GH #7 (testing-levels matrix) folded into objective 0** — soft-bundle: separate reference doc (`references/testing-strategy.md`) the planner reads alongside the resolver output. No resolver coupling. Closes #7 in same PR as #20.
- **kind/work intent model is canonical** — devflow-claude's PROJECT.md uses `kind: plugin, default_work: feature`. Defaults table at `plugins/devflow/devflow/references/defaults-table.md` is the (kind, work) → defaults source of truth.
- **Objective 0 wave structure (LOCKED — see `00-CONTEXT.md` §7):** Wave 1 = TRD 0.1 (table) + 0.6 (testing-strategy doc); Wave 2 = TRD 0.2 (resolver schema, solo soak); Wave 3 = TRD 0.3 (planner) + 0.4 (CLAUDE.md absorption); Wave 4 = TRD 0.5 (migration + provenance). TRD 0.1 ≠ Wave with TRD 0.2 — hard sequencing constraint.
- **TRD 0.6 complete (2026-05-04)** — `references/testing-strategy.md` authored with layer x tool x stack matrix (4 stacks, 7 layers), Flutter-web gotcha, codegen discipline, platform routing. Visual/golden and AI exploratory cells marked deferred per codebase survey. Closes GH #7. Commit: df9fb0e.
- **TRD 0.1 complete (2026-05-04)** — `defaults-table.md` rewritten to 42 cells × 9 fields. All 6 port cells drop spec-match (contract-list-first parity). All 4 non-skip ui-lib cells drop visual regression. api cells carry security_isolation. constraints: block added. Resolver seeded from full tableDefaults so all 9 fields propagate. Commits: 30e6ed2, 57c8be9. Wave 1 now complete.
- **Resolver config seeding fix (TRD 0.1 deviation)** — `intent.cjs` initialized `config = { ...tableDefaults }` so new fields (security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy) surface in `df-tools intent resolve` output. Provenance for new fields deferred to TRD 0.2.
- **TRD 0.2 complete (2026-05-04)** — Extended `intent.cjs` resolver: `loadConstraints()` added; 5 new fields + provenance emitted per field; CLAUDE.md TDD Playbook promotions (skip→auto→strict, optional→required, inline→generators, n/a→multi_tenant_required for api kind); multi-tenant hard-enforcement via `wrong_tenant_assertion` in `verification_commands`; `buildMatrixProject()` fixture added. 408/408 tests pass. Commits: 8847c85 (test:), 6cb0cce (feat:). Wave 2 complete.
- **outside_in boolean field added (TRD 0.2 deviation)** — Field was in TRD 0.2's NEW_FIELDS but omitted from TRD 0.1's cell schema. Added to `(api, feature)` and `(app, feature)`. Parser extended with bool coercion for bare YAML `true`/`false`.
- **TRD 0.3 complete (2026-05-04)** — Planner agent extended: `<constraints>` block, Step 1 JSON (5 new fields + constraints), Step 2 print (9 fields grouped), Step 3 replaced with field-driven emission rules (test_list_first/fixture_strategy/security_isolation/outside_in/back_compat), new Step 4 (testing-strategy.md conditional load), new Step 5 (constraint enforcement), old Step 4 → Step 6. Merged TRDs 03+07 (same file). All 6 verification greps pass. Closes SC-3, SC-6. Commit: 21e150d. Wave 3 partial (0.4 remaining).
- **TRD 0.3+0.7 merge confirmed** — Both TRDs edit planner.md's Intent Resolution section; merged into single TRD per CONTEXT.md discretion note. Content split: TRD-03 supplies field-consumption steps; TRD-07 supplies testing-strategy.md Step 4.
- **TRD 0.4 complete (2026-05-04)** — `claude-md.cjs` extended: `PLAYBOOK_HABITS` constant (6 habits) + extended `deriveOverrides` loop. All 6 TDD Playbook habits detected; 5 structured fields emitted (tdd_default, test_list_first, fixture_strategy, outside_in, security_isolation). Habit 3 freeform-only (field:null). Legacy fields preserved. `realCLAUDEMd()` fixture added. Real `~/.claude/CLAUDE.md` round-trip confirmed. 425/425 tests pass. Commits: 49634dc (test:), cf8a12a (feat:). Wave 3 complete.
- **PLAYBOOK_HABITS design (TRD 0.4)** — 6-entry constant: field:null for habit 3 (freeform-only); /i-flagged patterns on original body text (not lowercased); legacy patterns retained unchanged alongside new loop. tdd_default:'auto' emitted by absorber; promotion to strict is resolver's job.
- **TRD 0.5 complete (2026-05-04)** — `result.provenance` enum-normalized map added to resolver output; `normalizeProvenance()` helper maps freeform sources→{table|user_playbook|objective_override|trd_override}. OBJECTIVE.md and TRD frontmatter override loops extended to all 6 new structured fields (Wave-2 gap-repair). 18 new integration tests (Groups A-F + C migration regression against real 01-handoff-watcher). 443/443 tests pass. Commits: 120bc7d (test:), df9f8fa (feat:). Wave 4 complete. Objective 0 DONE.
- **Wave-2 gap-repair (TRD 0.5)** — OBJECTIVE.md overrides and TRD frontmatter loops in intent.cjs only covered original 3/2 fields; extended to security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy, outside_in. outside_in bool-coercion added for both paths. Surfaced by Wave-4 integration tests (expected pattern).
- **B2 table truth correction** — (api, foundation) is security_isolation:single_tenant, not multi_tenant_required. Wrong-tenant injection applies to 4 api cells (feature, port, refactor, bugfix), not 5. TRD 0.5 test corrected to match table data.
- **TRD 01-01 complete (2026-05-04)** — GH-link frontmatter fields documented in 3 templates (project.md: github_repo + org_project; objective.md: github_issue + parent_issue + org_initiative + org_project; job-prompt.md: per-TRD github_issue). `frontmatter.test.cjs` created: 8 tests proving back-compat + new-field parse + shorthand round-trip. 449/449 relevant tests pass (2 pre-existing unrelated failures). Commits: 5a11cb5 (docs), 6c3da20 (test). Wave 1 complete.
- **Frontmatter parser is permissive (TRD 01-01 confirmed)** — extractFrontmatter accepts any unknown field without warnings; no parser changes required for GH-link fields. Unquoted #9 and quoted "#9" both parse to literal string; reconstruction wraps # values in quotes (serialization artifact, not a bug).
- **org_project inheritance chain documented (TRD 01-01)** — PROJECT.md sets org_project as default; OBJECTIVE.md can override; TRD frontmatter inherits from objective. Resolution provenance vocabulary locked: frontmatter → inherited_from_project → walked_from_parent → absent.
- **TRD 01-02 complete (2026-05-04)** — `resolveChain(frontmatter, projectCtx)` walks GH-link fields through full org chain with per-field provenance; shorthand `#NN` expansion with graceful warnings; per-process in-memory cache (module-scope Map); `findRoadmapIssue`, `addToProject`, `linkSubIssue` helpers; `cmdGhResolve` + `df-tools gh resolve` CLI routing. 32 new tests (Groups A-I). 483/483 tests pass. Commits: 8ac655c (test:), b91e7e6 (feat:). Wave 2 complete.
- **_setRunGh test injection hook added (TRD 01-02)** — Production code uses `_runGh` (shadows `runGh`); tests inject mock via `_setRunGh(fn)`. Existing cmdGhSync*/cmdGhComment/etc. continue using `runGh` directly (back-compat). TRD 01-03 should follow the same pattern when wrapping runGh with auth checks.
- **Cache provenance transform locked (TRD 01-02)** — `walked_from_parent` and `inherited_from_project` become `'cached'` on hit; `frontmatter` and `absent` stay unchanged. Re-reading frontmatter is free; only walked/fetched values are the "cache value".
- **TRD 01-03 complete (2026-05-04)** — `GhAuthError` class + `requireGhAuth(requiredScopes)` hard-fail auth check added to `lib/gh.cjs`. `cmdGhResolve` now calls `requireGhAuth(['project','read:project','repo'])` as first action; structured JSON to stderr + exit(1) on failure. `parseScopes()` handles single/double-quote and multiline scope formats. 20 new tests (Groups A-E). 503/503 tests pass. Commits: f673a31 (test:), 91289c4 (feat:). Wave 3 complete.
- **Hard-fail vs graceful-skip pattern locked (TRD 01-03)** — `requireGhAuth` throws `GhAuthError` (hard-fail for new resolver/sync subcommands); `ghStatus` returns status dict (graceful-skip for existing cmdGhSyncObjectives/cmdGhComment/cmdGhCloseIssue/cmdGhSyncRelease). Both coexist in same module. Back-compat locked in CONTEXT.md §7.
- **Exact remediation format locked (TRD 01-03)** — `gh auth refresh -h github.com -s scope1,scope2` (comma-joined scopes, `-h` before `-s`). Test B4 enforces this. Future TRDs must use same format.
- **TRD 01-04 complete (2026-05-04)** — `syncObjective` + 6 helpers + `cmdGhSyncObjective` added to `lib/gh.cjs`. Sticky comment idempotency via `<!-- df:state -->` marker + `state_comment_id` persistence in `.gh-mapping.json` schema v2. `PRODUCT_ROADMAP_FIELDS` exported (stub, `_captured=false`). `df-tools gh sync <id>` CLI routed. SKILL.md documents 4-mode docs. 31 new tests (Groups A-G). 534/534 tests pass. Commits: 8f11060 (test:), 783fda4 (feat:). Wave 4 complete.
- **upsertStickyComment three-path fallback locked (TRD 01-04)** — Path 1: PATCH known ID. Path 2: marker scan + PATCH found ID. Path 3: create new. Idempotency contract: D4/F4 assert zero CREATE calls on second invocation.
- **readMappingV2 non-destructive + PRODUCT_ROADMAP_FIELDS export locked (TRD 01-04)** — v2 shape `{ issue_id, state_comment_id }` per objective; v1 number entries migrated on read, written as v2 objects. `PRODUCT_ROADMAP_FIELDS` exported for TRD 01-06 seeding; `_captured=true` guard pattern.
- **Group G tests in-process (TRD 01-04 verifier briefing #2)** — `cmdGhSyncObjective` tested via in-process IO capture, not `spawnSync` subprocess, to preserve `_setRunGh` mock coverage.
- **TRD 01-05 complete (2026-05-04)** — `lib/pm-backend.cjs` scaffolded: `getBackend(projectConfig)` returns `lib/gh.cjs` on github/unset; throws with v1.2+ guidance for linear/jira; throws with backend name for unknown. `VALID_BACKENDS=['github']` exported. 7 new tests. 541/541 tests pass. Single atomic commit: 7616e6a (feat:). Wave 5 complete.
- **pm-backend seam design locked (TRD 01-05)** — Return `require('./gh.cjs')` directly (no facade); explicit case arms for linear+jira give v1.2+ guidance; df-tools.cjs call sites unchanged per CONTEXT.md §6; v1.2 wires call sites through seam.
- **TRD 01-06 complete (2026-05-04)** — obj 0 OBJECTIVE.md backfilled (github_issue + parent_issue); gh-cassettes captured from live API; PRODUCT_ROADMAP_FIELDS populated from cassette (_captured=true, flat structure); updateProjectFields rewritten with addToProject-first pattern; requireGhAuth SCOPE_SUPERSET (project covers read:project). 22 new tests (Groups H-L). 559/563 tests pass default; 563/563 with GH_INTEGRATION=1. Commits: 2c74f9e (test:), 97855d0 (feat:). Wave 6 complete. Objective 1 DONE.
- **PRODUCT_ROADMAP_FIELDS flat structure (TRD 01-06)** — Fields live directly on constant (PRODUCT_ROADMAP_FIELDS.Status = { field_id, options }) not under nested .fields sub-key. Loaded from cassette at module-init time.
- **requireGhAuth SCOPE_SUPERSET (TRD 01-06)** — SCOPE_SUPERSET = { 'read:project': ['project'] }. GitHub's project scope implicitly grants read:project; literal check was a false positive.
- **Cassette-based replay testing pattern (TRD 01-06)** — Committed JSON cassettes in __fixtures__/gh-cassettes/; tests load via fs.readFileSync; NOT regenerated on test runs. Live re-capture only with GH_INTEGRATION=1 in E4/L2 drift-detection tests.

## Blockers / Concerns

- **`feature/v1.1-coordination` is duplicative** — same content as `feature/v1.1`. Should be deleted to avoid confusion. Its worktree at `/Users/markemerson/Source/devflow-claude-v11` can be removed.

## Session Continuity

Last session: 2026-05-04 — TRD 01-06 (dogfood + integration) complete. Wave 6 done. Objective 1 DONE.
Resume file: `.planning/SESSION_PICKUP.md`
Stopped at: Completed 01-06-dogfood-and-integration-TRD.md
Next: Objective 2 — Cross-worktree session telemetry (TRD 02-01)
