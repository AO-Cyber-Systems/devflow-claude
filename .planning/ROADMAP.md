# Roadmap

## Milestone v1.1 — DevFlow Coordination Layer (in flight)

**Goal:** Bring devflow-claude from a per-repo planning helper to a program-aware coordination layer for AI-assisted work across the AO-Cyber-Systems org. Planning becomes org-aware (surveys sibling repos, eden-libs reuse, org Product Roadmap to surface overlap, shared-service opportunities, and misfile risk). Execution stays repo-focused with thin async preamble. Cross-session telemetry, duplicate detection, initiative context, unified todo aggregation, and structured user-handoff complete the runtime layer.

**Status:** Objective 0 formalized 2026-05-04 (planning underway via `/df:plan-objective 0`). Other objectives formalize when they're up. Research and architectural principles captured in:
- `.planning/research/github-coordination-layer.md` — structural layer (GitHub Issues + Projects v2 + sub-issues)
- `.planning/research/cross-session-coordination.md` — runtime layer (heartbeat, duplicate detection, initiatives, unified check-todos, df:handoff)
- `.planning/research/tdd-scope-{summary,refined-defaults,codebase-survey}.md` — TDD scope research synthesis (objective 0 input)

**Objective scope:**

0. **Refine (kind, work) defaults table from codebase evidence** — refine the 42-cell defaults table to match observed AOCyber codebase reality, codify the user's CLAUDE.md TDD Playbook as structured resolver fields, and add a `references/testing-strategy.md` testing-levels matrix (folds in #7). Gates objectives 3 and 4. **Tracks: devflow-claude#20** (research complete; implementation in plan)
1. **GitHub coordination layer** — frontmatter conventions (parent_issue, github_issue, org_milestone), resolver service walking objective → repo [Roadmap] → org Product milestone, gh CLI helpers, df:gh-sync command. Foundation for everything else. **Tracks: devflow-claude#10**
2. **Cross-worktree session telemetry + heartbeat** — hook-driven heartbeat schema (session_id, project, branch, github_issue, objective, job, files_touched, files_planned, state, blocked_on_user). Storage choice TBD (recommend dedicated lightweight git repo). **Tracks: devflow-claude#11**
3. **Planning-time org awareness** — extend df:research-objective + df:plan-objective to consult sibling repos, eden-libs, org Project. Output as Cross-Repo Considerations in CONTEXT.md. **Tracks: devflow-claude#12** (depends on 0)
4. **Duplicate-work detection + resolution flow** — plan-time + execute-time checks against active heartbeats. Strong/hard matches block; weak matches advise. 4-option resolution: Merge / Defer / Coordinate / Proceed-anyway. **Tracks: devflow-claude#13** (depends on 0)
5. **Initiative context layer** — disk projection of GitHub Epics at `~/.claude/devflow/initiatives/` with planner-readable Why + Open questions. Planner reads matching initiatives by key_repos at plan time. df:initiatives sync command. **Tracks: devflow-claude#14**
6. **Unified df:check-todos** — morning-standup view across local todos + GH issues (assigned/mentioned/review-requested) across all repos + active heartbeats + initiative open questions. Output grouped by urgency lane. **Tracks: devflow-claude#15**
7. **df:handoff watcher daemon** — ✅ shipped via PR #19 (2026-05-04). v1.2 PTY backend will close the TTY-interactive gap. **Tracks: devflow-claude#16**
8. **Program-aware TUI viewer** — renders parallel sessions + their position in the org tree (parent epic, milestone, sibling progress). Read-only viewer doesn't gate execution. tmux-pane friendly. **Tracks: devflow-claude#17**
9. **Roadmap ↔ disk reconciliation** — df:sync-roadmap reconciles ROADMAP.md checkboxes ↔ on-disk SUMMARY.md presence. **Tracks: devflow-claude#18**

Dependency order:

```
0 (TDD-scope research) ──┬──> 3 (planning awareness)
                         └──> 4 (dup-detect — depends on resolver shape)

1 (GitHub layer) ──┬──> 2 (heartbeat) ──┬──> 4 (dup-detect) ──> 6 (check-todos)
                   │                    │
                   │                    └──> 8 (TUI)
                   │
                   └──> 5 (initiatives — independent, can land in parallel)

7 (df:handoff watcher) — ✅ shipped (PR #19); v1.2 PTY upgrade tracked separately
9 (roadmap-disk reconcile) — independent of runtime layer; can land any time
```

**Out of scope for v1.1** (deferred):
- PTY support for the handoff watcher (v1.2 — see below)
- OS notifications for handoff (v1.2)
- Auto-start of watcher daemon via launchd/systemd (v1.2 polish)
- Org rollup adoption work (promoting drafts, backfilling sub-issues, standardizing templates/labels) — ongoing program work, not a feature objective

**Prerequisites for v1.1 execution:** ✅ both met
- ~~`proposal/kind-and-work` merged to main~~ — done (PR #8, 2026-05-04)
- ~~`feature/seamless-handoff` successor (watcher daemon variant) merged to main~~ — done (PR #19, 2026-05-04)

### Objective 0: Refine (kind, work) defaults table from codebase evidence

**Goal:** Refine the 42-cell `(kind, work)` defaults table at `plugins/devflow/devflow/references/defaults-table.md` to match observed AOCyber codebase reality, codify the user's CLAUDE.md TDD Playbook as structured fields in the `intent.cjs` resolver, and add a parallel `references/testing-strategy.md` testing-levels matrix (folds in #7). The resolver becomes the enforcement mechanism for the TDD Playbook, not a parallel set of guidelines.

**Tracks:** devflow-claude#20 (closes #7 in same PR)

**Inputs (research complete):**
- `.planning/research/tdd-scope-summary.md` — executive summary, top 5 deltas
- `.planning/research/tdd-scope-refined-defaults.md` — proposed 42-cell table + per-cell deltas
- `.planning/research/tdd-scope-codebase-survey.md` — raw findings across 6 sibling repos

**Locked decisions (from research synthesis + user calls):**
1. **Port cells:** drop "spec-match (source's tests as fixtures)" everywhere; replace with contract-list-first (derive parity checklist from source's *behavior*, not its test files).
2. **ui-lib cells:** drop "visual regression" from defaults; behavioral + a11y only; visual moves to TRD-level opt-in.
3. **Resolver schema:** emit 5 new structured fields (`security_isolation`, `back_compat`, `tdd_default`, `test_list_first`, `fixture_strategy`) + 3 anti-pattern constraints (`no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer`).
4. **Multitenancy hard-enforcement:** when `security_isolation: multi_tenant_required`, the verification commands array must require a wrong-tenant assertion test (not advisory).
5. **Testing-strategy matrix soft-bundled:** ships as separate reference doc the planner reads after the resolver returns. No resolver coupling.

**Success Criteria**:
1. `defaults-table.md` reflects 27 changed cells + 5 new column headers; the file format remains valid YAML reference doc parseable by the planner.
2. `intent.cjs` resolver emits the 5 new structured fields + 3 anti-pattern constraints; provenance is reported per field (`table` / `user_playbook` / `trd_override` / `objective_override`).
3. Planner agent reads new fields and emits corresponding TRD sections (test-list checklist, fixture-builder task, wrong-tenant assertion in test list, outside-in TRD ordering when applicable).
4. CLAUDE.md absorption maps all 6 TDD Playbook habits cleanly to 5 structured fields + 1 freeform directive.
5. `references/testing-strategy.md` exists with the layer×tool×stack matrix from #7 (unit → integration → AI exploratory → Maestro → visual) plus the Flutter-web semantics gotcha, codegen discipline, and platform routing paragraphs.
6. Planner consults testing-strategy.md when emitting verification commands; layer→tool routing reflects detected stack.
7. Existing PROJECT.md / OBJECTIVE.md / TRD.md files don't break — migration path documented and validated against the existing `01-handoff-watcher` objective directory.
8. Critical sequencing constraint honored: TRD 01 (table) and TRD 02 (resolver schema) ship in different waves/commits so the schema has soak time before #12 / #13 lock onto it.
9. `df-tools intent resolve --objective <fixture>` round-trip succeeds on a fixture project containing all 6 kinds × 7 work types and exercises the `multi_tenant_required` path.
10. `npm test` (Node native test runner) passes; new TDD-tagged TRDs (02, 04, 05) ship `test:` commits preceding their `feat:` commits per the user's TDD Playbook.

**Out of scope:**
- Chromatic / Percy / Flutter golden-file rollout (revisit when tooling lands as separate objective)
- Property-based testing infrastructure beyond the constraint flag
- Bidirectional planner ↔ resolver round-tripping (one-way only)
- Org-wide rollout of the testing-strategy matrix to other repos' CLAUDE.md (ongoing program work, not a TRD)

### Objective 1: GitHub coordination layer

**Goal:** Establish the GitHub coordination foundation that v1.1 objectives 2–6 depend on. Three components:
1. **Frontmatter convention** on PROJECT.md / OBJECTIVE.md / TRD.md declaring GH/org links (`parent_issue`, `github_issue`, `org_initiative`, `org_project`). Existing files without these fields parse cleanly (back-compat).
2. **Resolver service** (`df-tools gh resolve <objective>`) walking objective → repo `[Roadmap]` issue → org Product milestone → org Project. Returns a structured org-context object the planner reads at plan time and the SessionStart preamble reads at execution time.
3. **`df:gh-sync` skill + `lib/gh.cjs` helpers** pushing objective state (TRDs total/done, current wave, SUMMARY count, last commit) to linked GH issues + Project v2 custom fields. One-way disk → GitHub for v1.1; bidirectional deferred to v1.2.

**Tracks:** devflow-claude#10 (sub-issue of #9 [Roadmap])

**Inputs (research complete):**
- `.planning/research/github-coordination-layer.md` — spike findings, three-tier hierarchy, gh primitives, sync-model decisions
- `.planning/research/cross-session-coordination.md` — runtime layer (consumes the resolver)

**Locked decisions:**
1. **Plan org-aware, execute repo-focused** (PROJECT.md architectural principle) — resolver runs at plan time + thin SessionStart preamble; never blocks execution inner loop.
2. **Use existing org "Product Roadmap" project (#3)** — do NOT create a parallel "DevFlow Coordination" project. Custom fields Product/Quarter/Status are sufficient.
3. **One-way sync only** (disk → GitHub) for v1.1 — bidirectional + webhooks deferred to v1.2.
4. **Tier 2 = `[Roadmap]` parent issue per primary repo** — 9 exist already (aodex#33, aosentry#20, aodex-flutter#2, etc.); the resolver walks to these even though they don't yet use native sub-issues.
5. **Decoupled from kind/work intent resolver** — both run independently; outputs combine in the planner agent. Preserves objective 0's soak isolation.
6. **`lib/gh.cjs` is the GitHub backend of a (currently single-implementation) PM resolver** — abstraction layer + Linear/Jira backends are explicitly v1.2+ work; no v1.1 deliverable beyond keeping the call sites clean enough that swapping in another backend later doesn't require a rewrite.
7. **Hard fail on missing/expired auth** — no silent degradation when `gh` is missing, token expired, or scopes insufficient; df-tools exits non-zero with the exact `gh auth refresh -s ...` remediation.

**Success Criteria:**
1. Template files (`templates/project.md`, `templates/objective.md`, `templates/job-prompt.md`) document the new optional frontmatter fields with examples; existing files without these fields parse without warnings (back-compat preserved by parser).
2. `df-tools gh resolve <objective>` returns structured JSON: `{ github_issue, parent_issue, org_initiative, org_project, roadmap_issue }` — populated from frontmatter where declared, gracefully empty where absent. Provenance object reports source per field (`frontmatter` / `inherited_from_project` / `walked_from_parent`).
3. Resolver fetches live state via `gh api` / GraphQL at each `/df:plan-objective` and `/df:execute-objective` entry. Cache scope is in-memory per-process — re-used within a single skill invocation, never persisted across invocations. Freshness is enforced by the invocation boundary; no `--refresh` flag needed.
4. New skill `/devflow:gh-sync` (plus `df-tools gh sync <objective>` CLI surface) pushes the linked GH issue's body + sticky comment with current objective state (TRDs total/done, current wave, last commit, SUMMARY count) and updates Project v2 custom fields (Status, Quarter where derivable).
5. `df:gh-sync` is **idempotent** — running it twice in a row produces no diff in the second run; sticky comment is rewritten in-place using its marker (`<!-- df:state -->`).
6. `lib/gh.cjs` exports a stable surface: `resolveChain(frontmatter, projectCtx)`, `syncObjective(objId)`, `findRoadmapIssue(repo)`, `linkSubIssue(parent, child)`, `addToProject(issue, projectId)`. All take parsed objects, not raw paths — unit-testable with fixtures (no live gh calls in unit suite). Module structure leaves room for a sibling `lib/linear.cjs` / `lib/jira.cjs` later without rewriting call sites.
7. Frontmatter parsing supports BOTH `parent_issue: AO-Cyber-Systems/devflow-claude#9` (full ref) AND `parent_issue: #9` (same-repo shorthand resolved against PROJECT.md repo context).
8. Auth/binary failures (missing `gh`, expired token, insufficient scopes) → df-tools exits non-zero with the exact remediation command (e.g. `gh auth refresh -s project,read:project`); does NOT silently degrade or return partial results. Skill invocations stop and surface the error to the user.
9. **Round-trip integration test** (gated on `GH_INTEGRATION=1` env): a fixture objective with `parent_issue: AO-Cyber-Systems/devflow-claude#9` resolves end-to-end against live gh — chain walks parent → repo Roadmap issue → Product Roadmap project entry. Skipped when env unset so CI/local without auth doesn't fail.
10. Resolver+sync flow validated against THIS repo's own state: `df-tools gh resolve 0` (the just-shipped objective 0) returns a chain leading to devflow-claude#20 → #9 → org Product Roadmap. Acts as the dogfood smoke test. Includes backfilling objective 0's OBJECTIVE.md frontmatter with `github_issue: #20, parent_issue: #9` as a TRD task so the dogfood test has real data to walk.

**Out of scope (v1.1 — explicit):**
- Bidirectional sync (GH → disk) — v1.2
- Webhook listeners — v1.2
- PM-backend abstraction with Linear/Jira implementations — v1.2+ (only the structural seam is in v1.1)
- Backfilling sub-issues under existing 9 `[Roadmap]` parents — separate program work
- Promoting 28 draft milestones to real issues — separate program work
- Issue template / label standardization across repos — separate adoption work
- Reconciling 6 misfiled objectives in this repo — separate hygiene work, prerequisite to v1.1 obj 3

**Gates** (from ROADMAP dependency graph): v1.1 obj 2 (heartbeat needs `org_context` field), obj 5 (initiatives needs resolver to walk to Epic), obj 6 (check-todos needs resolver for cross-repo aggregation).

**TRDs:** 6 plans across 6 waves
- [ ] 01-01-frontmatter-fields-and-templates-TRD.md — document new optional GH-link frontmatter fields + back-compat parse tests (Wave 1, standard)
- [ ] 01-02-resolver-chain-walk-TRD.md — `df-tools gh resolve <objective>` + lib/gh.cjs chain helpers + per-process cache (Wave 2, tdd)
- [ ] 01-03-auth-and-error-handling-TRD.md — hard-fail with remediation on missing/expired gh auth (Wave 3, tdd)
- [ ] 01-04-gh-sync-skill-and-cli-TRD.md — idempotent disk → GitHub state push + sticky comment + Project v2 fields (Wave 4, tdd)
- [ ] 01-05-pm-backend-seam-TRD.md — scaffold abstraction for v1.2+ Linear/Jira backends (Wave 5, standard)
- [ ] 01-06-dogfood-and-integration-TRD.md — backfill obj 0 frontmatter, capture cassettes, live round-trip (Wave 6, tdd)

### Objective 2: Cross-repo awareness layer (peer + org views)

**Goal:** Two-fold awareness so a developer at any worktree sees (a) what teammates are working on right now and (b) how their work fits into the org's larger progress. No new storage backend — git is the storage for peer awareness; the org Product Roadmap project (already populated, walkable via obj 1's resolver) is the storage for org progress. A single `df:awareness` skill renders both views.

**Tracks:** devflow-claude#11

**Inputs (research complete):**
- `.planning/research/cross-session-coordination.md` — heartbeat schema repurposed as read-time aggregation (write-side daemon dropped per locked decision)
- `.planning/research/github-coordination-layer.md` — Product Roadmap project (#3, PVT_kwDODwqLrc4BRsOP) is the org-progress source of truth; obj 1 already walks one objective's chain

**Locked decisions:**
1. **Git is the storage for peer awareness.** No new repo, no new schema. `.planning/STATE.md` on each remote branch is the source of truth for that branch's session state.
2. **Read-side aggregation, not write-side daemon.** Developers don't push more than they already do. Both scanners are pull-only.
3. **Org progress reuses obj 1's resolver primitives.** `lib/gh.cjs::resolveChain` walks one objective; obj 2 adds `walkProject(projectId)` that iterates ALL items in the Product Roadmap project, then walks each item's sub-issues one hop deep.
4. **Single skill, two sections.** `/devflow:awareness` renders peer (git-branch) view and org (Project-board) view side by side. Default shows both; `--peer-only` / `--org-only` flags filter.
5. **Single cache file, namespaced.** `.planning/.awareness-cache.json` (gitignored) has `{ peer: {...}, org: {...} }` sections with independent TTLs. 10-min TTL default, configurable.
6. **Local-repo scope for peer awareness.** Walks `origin/*` of the CURRENT repo only. Cross-repo peer awareness (teammate in aodex while you're in devflow-claude) is obj 5/6 territory and explicitly out of scope.
7. **Org-progress scope = Product Roadmap project + 1 hop sub-issues.** Walks the project's items + each item's direct sub-issues. Going deeper (sub-sub-issues, TRD-level rollup) is obj 8 (TUI) territory.
8. **No "blocked_on_user" / handoff state.** That's obj 7 (already shipped). Awareness here is purely informational.
9. **Stale = invisible (peer side).** A dev who hasn't pushed in N hours is invisible. Documented limitation. Push for visibility.
10. **Hard-fail on org-side gh auth.** Reuses obj 1's `requireGhAuth` — same remediation surface. Peer-side has no gh dep so works offline.

**Success Criteria:**

*Peer awareness (git-branch scanner)*
1. `df-tools awareness scan-peer` walks `origin/*` refs (after `git fetch --all --prune` unless `--no-fetch`) and returns structured JSON: per branch with `.planning/STATE.md`, parsed objective-in-flight, current TRD, last commit timestamp, branch name, github_issue ref. Branches matching configurable patterns (`awareness.branch_patterns`, default `["feature/*", "df/*", "fix/*", "proposal/*"]`); ignores branches > 30 days stale; ignores `main`/`master`/`HEAD`.
2. Scanner is fault-tolerant — branches without `.planning/STATE.md` silently skipped; malformed STATE.md logs warning and continues; works offline with `--no-fetch`.

*Org progress (Project-board walker)*
3. `df-tools awareness scan-org` walks the org Product Roadmap project (`PVT_kwDODwqLrc4BRsOP`, configurable via `awareness.org_project_id`) and returns hierarchical JSON: project items grouped by Product × Quarter, each item's direct sub-issues with status. Reuses obj 1's GraphQL chain helpers.
4. Org walker fetches each item's `Status`, `Product`, `Quarter` custom fields + any `Iteration` field if present. Sub-issues fetched via `trackedIssues` GraphQL field; falls back to parsing task-list bullet items in the issue body when sub-issues aren't used (most current `[Roadmap]` issues use prose lists).
5. Hard-fails (via `requireGhAuth`) on missing scopes; silent on items the auth'd user can't see.

*Combined skill + cache*
6. `/devflow:awareness` skill renders both views. Default: peer first (sorted by recency), then org (grouped by Product × Quarter, then sub-issues). Filters: `--peer-only`, `--org-only`, `--quarter Q2-2026`, `--product DevFlow`.
7. Single cache file `.planning/.awareness-cache.json` with `peer` + `org` namespaced sections, each carrying its own `fetched_at` timestamp. Default 10-min TTL each; `--refresh` flag forces re-fetch of both; `--refresh peer` / `--refresh org` for single-namespace refresh.
8. **Cache lifecycle:**
   - SessionStart hook (fire-and-forget, async): populate cache IF missing/expired (TTL-based, lazy)
   - `/df:plan-objective` entry: force-refresh awareness cache before planner spawns (parallels obj 1's gh resolve refresh)
   - `/df:execute-objective` entry: force-refresh awareness cache before first wave (lets obj 4's future dup-detect see fresh state)
   - Manual `/devflow:awareness` invocation: TTL-based read; `--refresh` flag forces re-fetch

*Library surface + tests*
9. `lib/awareness.cjs` exports stable surface: `scanPeer(opts)`, `scanOrg(opts)`, `parseStateMd(content)`, `aggregateOrgByProductQuarter(scans)`, `readCache(path)`, `writeCache(path, sections)`. `scanPeer` uses `_setRunGit` injection for unit tests; `scanOrg` uses obj 1's `_setRunGh` (no live calls in unit suite).
10. Round-trip integration tests gated on `GIT_INTEGRATION=1` (peer side: 2 fixture branches in tmp clones) AND `GH_INTEGRATION=1` (org side: live walk of Product Roadmap; cassettes captured to `__fixtures__/gh-cassettes/product-roadmap-walk.json`).

**Out of scope (v1.1 — explicit):**
- Cross-repo peer awareness (teammate working in another repo) — obj 5/6 territory
- Real-time / push notifications — v1.2 (needs a daemon)
- Duplicate-work detection — obj 4 consumes this scanner's output
- Initiative-level rollup with planner-readable Why/Open-questions — obj 5
- Unified todo aggregation — obj 6
- TUI rendering — obj 8
- Multi-org visibility (only walks the org configured in `awareness.org_project_id`)

**Gates** (downstream consumers): obj 4 (dup-detect reads peer scanner's output), obj 5 (initiatives layer extends org walker), obj 6 (check-todos aggregates this), obj 8 (TUI renders this).

**TRDs:** 7 plans across 7 waves
- [x] 02-01-state-md-parser-and-fixtures-TRD.md — STATE.md parser + awareness-fixtures.cjs scaffold (Wave 1, tdd) — DONE 2026-05-04, 592/592 tests (586 pass), commits d8b3c75 + cddcc7e
- [ ] 02-02-peer-scanner-TRD.md — scanPeer + git-branch walker + _setRunGit injection (Wave 3, tdd)
- [ ] 02-03-org-scanner-TRD.md — walkProject (lib/gh.cjs) + scanOrg + task-list fallback (Wave 4, tdd)
- [ ] 02-04-cache-layer-TRD.md — readCache + writeCache + isStale + .gitignore (Wave 2, tdd)
- [ ] 02-05-skill-and-cli-TRD.md — /devflow:awareness skill + df-tools awareness CLI router (Wave 5, standard)
- [x] 02-06-lifecycle-integration-TRD.md — SessionStart hook + plan/execute init refresh wiring (Wave 6, tdd) — DONE 2026-05-04, 710/719 tests pass, commits f35aaa3 + 5ddb3b6
- [ ] 02-07-library-export-and-integration-TRD.md — export surface lock + integration tests + cassette capture (Wave 7, tdd)

### Objective 3: Planning-time org awareness — surface cross-repo considerations in CONTEXT.md

**Goal:** Extend `/df:research-objective` and `/df:plan-objective` to consult the org's broader state at plan-time and surface findings as a "Cross-Repo Considerations" section in CONTEXT.md. The planner reads it and biases TRDs accordingly. Execution stays unchanged — no runtime org-polling, all the brains land at planning time.

**Tracks:** devflow-claude#12 (sub-issue of #9 [Roadmap]). Depends on obj 0 ✓; consumes obj 1 ✓ (gh resolver) + obj 2 ✓ (org scanner).

**Inputs (research complete):**
- `.planning/research/github-coordination-layer.md` — §"Where org-awareness shows up" (during planning, not execution)
- `.planning/research/cross-session-coordination.md` — runtime layer (informs the "active sessions" check at plan-time)

**Locked decisions:**
1. **Plan-time only.** Consultation runs at `/df:research-objective` and `/df:plan-objective` entry — never at execute-time.
2. **Three signal sources:** sibling repos in this org, eden-libs reuse candidates, org Product Roadmap overlap (reuses obj 2's `scanOrg`).
3. **Output as a NEW `## Cross-Repo Considerations` section in CONTEXT.md** that the researcher writes BEFORE the planner runs. Planner reads it and biases TRDs (advisory).
4. **Read-only consumer of obj 1 + obj 2.** Reuses `lib/gh.cjs::resolveChain` + `lib/awareness.cjs::scanOrg/scanPeer` — no new network primitives.
5. **Sibling-repo discovery via convention.** Default: walks `~/Source/*/` for repos with `.git/` + `.planning/` AND a `PROJECT.md` declaring `org: AO-Cyber-Systems` (or matching the current repo's `org`). Configurable via `awareness.sibling_repos: [<paths>]`.
6. **Token-budget conscious.** Cross-Repo Considerations section bounded — top 3 sibling-repo matches + top 3 eden-libs candidates + top 3 org-project overlaps. Each entry one line.
7. **Misfiling detection advisory.** When the resolved chain leads to a `[Roadmap]` issue in a different primary repo than the current repo, surface a one-line warning. Does NOT block planning.
8. **Skip silently when offline / no auth.** If `gh` isn't available, sibling + eden-libs scans still run (local fs only); only the org-Project portion is omitted with a one-line note. No hard fail at plan-time.

**Success Criteria:**

*Sibling-repo scanner (lib/org-awareness.cjs)*
1. `df-tools org-awareness scan-siblings <objective_id>` walks each sibling repo's `.planning/objectives/` reading PROJECT.md frontmatter + each objective's STATE.md + recent SUMMARY.md (last 90 days). Returns top-3 keyword/file overlaps relative to the current objective's frontmatter. Hand-built fixtures; `_setRunFs` injection mirrors `_setRunGh`.
2. Sibling discovery: walks `~/Source/*/` by default; configurable via `awareness.sibling_repos`. Repos without PROJECT.md or with `org` field mismatching are silently skipped.

*eden-libs reuse scanner*
3. `df-tools org-awareness scan-libs <objective_id>` scans `eden-libs/` (or configured path) for exported surfaces matching keywords from the current objective. Returns top-3 candidates. If absent, returns empty + warning (not in Considerations section).
4. Match heuristic: lexical match on objective title + `files_modified` extensions vs eden-libs's `index.*` / `package.json` main / exported symbols. Hand-built; no LLM scoring.

*Org Project overlap (reuses obj 2)*
5. `df-tools org-awareness scan-org-overlap <objective_id>` calls `scanOrg` and surfaces top-3 Project items where (a) same `parent_issue` chain leads to a sibling repo's [Roadmap], OR (b) title contains ≥2 keywords from current objective.
6. Misfiling detection per locked decision #7 — one-line warning when resolved `parent_issue` lives in a different primary repo than the current repo's PROJECT.md.

*CONTEXT.md integration*
7. `/df:research-objective` skill runs the three scans and writes a `## Cross-Repo Considerations` section to CONTEXT.md (appends if section exists). Format: 3 bulleted subsections (Sibling repos / eden-libs / Org Project), each ≤3 one-line entries.
8. `/df:plan-objective` skill reads the Cross-Repo Considerations section from CONTEXT.md and includes it in the planner agent's `<additional_context>`. Planner biases TRDs accordingly (advisory).

*Library + tests*
9. `lib/org-awareness.cjs` exports stable surface: `scanSiblings`, `scanLibs`, `scanOrgOverlap`, `formatConsiderations(scans)`, `_setRunFs`. Hand-built; unit-testable with fixture trees (no live fs/gh in unit suite). Cassettes for live tests gated on `GH_INTEGRATION=1`.
10. End-to-end dogfood against obj 4: `/df:research-objective 4` generates a Cross-Repo Considerations section that includes at least the obj 2 awareness scanner reference. Captured to `__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md`.

**Out of scope (v1.1 — explicit):**
- Hard-blocking enforcement of cross-repo overlap (advisory only)
- Auto-creating shared-service objectives in eden-libs — v1.2+
- Semantic / LLM-based similarity scoring — keeps v1.1 deterministic
- Cross-repo objective MOVES — separate hygiene work
- Real-time updates as sibling repos change — fits under plan-time-only locked decision

**Gates** (downstream consumers): obj 4 (dup-detect uses scanSiblings + scanOrgOverlap), obj 5 (initiatives consumes scanOrgOverlap), obj 6 (check-todos uses sibling scan for cross-repo todos).

---

## Milestone v1.2 — Handoff Watcher PTY + Coordination-Layer Polish (next)

**Goal:** Close the "Claude continues executing" promise for **TTY-interactive auth** (today's v1.1 limitation), plus polish the coordination layer with the items deferred from v1.1.

**Status:** Open. Plan after v1.1 ships and dogfood data accumulates.

### Headline objective: PTY support for the handoff watcher

v1.1's `devflow-watch` daemon dispatches commands via stdio pipes — that works for shell-flow tools (mise, nvm, conda, direnv) which only need a `bash -i` / `zsh -i` env, but **fails for genuinely TTY-required commands** (`doctl auth init`, `gh auth login`, `sudo`, `gpg --decrypt`). Verified end-to-end: doctl reports "Error: Unable to read DigitalOcean access token: unknown terminal" when dispatched through pipes.

The fix: swap `child_process.spawn` for `node-pty` in `plugins/devflow/devflow/bin/lib/watcher-shell.cjs`. With a real PTY:
- `isatty(stdin)` succeeds → doctl/gh/etc. proceed past their TTY check
- Token-paste prompts work — daemon can either route the prompt to a notification UI or accept tokens via per-handoff metadata
- `sudo` becomes runnable (still allowlist-gated; deny-list keeps `sudo` excluded by default for safety)

**Trade-offs to design through:**
- node-pty is a native dependency with a compile step. Either ship prebuilt binaries (`node-pty` does for major platforms) or document the build requirement.
- macOS-first; Linux works out of the box; Windows needs `winpty-agent` and is best-effort.
- The current sentinel-based output capture stays — PTY just changes the dispatch backend, not the output-parsing protocol.

**Provisional TRD outline** (refine when v1.2 plans):
1. Replace `spawn` with node-pty in `watcher-shell.cjs`. Update `interactive: true` path to use PTY; keep an `interactive: false` non-PTY mode for tests.
2. Token-passing for handoff records — extend pending record schema with optional `inputs: { secrets: [...] }` so the daemon can answer prompts from the user's keyring or a one-shot stash.
3. Update `gate-interactive.js`: TTY-interactive patterns now route to daemon when watcher is live (deny message reflects "PTY-backed daemon"); deny-list still blocks `sudo`/`su -` from the curated path.
4. Update `handoff-watcher-guide.md` with PTY caveats and platform notes.
5. Update e2e tests with mock auth servers (test-mode against `gh`'s test backend, doctl's --access-token flag) to validate the full flow without real credentials.

### Deferred polish (also v1.2)

- **OS desktop notifications** — daemon emits via `osascript` (macOS) / `notify-send` (Linux) when a command starts requiring user attention (e.g. browser auth flow needs a click) or completes. Surfaced through a small notification helper module behind a feature flag.
- **Auto-launch of watcher** — `launchctl` plist for macOS, `systemd --user` unit for Linux. `devflow-watch start --install-service` generates and registers; `devflow-watch stop --uninstall-service` removes.
- **Multi-project watching** — single daemon watches multiple `.devflow-handoff/pending/` dirs concurrently. PID file's `watching: []` array (already present in the schema) holds multiple project paths.
- **Status-line indicator** — `statusline.js` shows `⏸ N pending` when the watcher has un-dispatched records, `▶ running` when actively dispatching.
- **Cross-shell support** — fish (different syntax for env), nushell, PowerShell. Each gets its own sentinel/wrapper module behind a `shell` argument.
- **Bidirectional GitHub sync** — v1.1 pushes objective state to GH issues one-way. v1.2 adds the inbound path: GH label/state changes pull down into objective frontmatter via webhook or periodic poll. Requires conflict-resolution UX when both sides edit.
- **Configurable kind/work defaults table** — open question from `proposal/kind-and-work`. Currently the 42-cell defaults table is hardcoded; v1.2 lets orgs override globally via `~/.claude/devflow/defaults-table.md` (file format already supports it; just need to expose the override path).

### Workflow-impediment improvements (also v1.2)

Items flagged during v1.1 development that earn dedicated TRDs:

- **`df-tools init` reads from current branch only** — currently falls back to other branches via `git show`, which produced misleading state during v1.1 planning (init reported a misfiled-objective ROADMAP that didn't exist on the working branch). Fix: explicit `--branch` arg defaulting to current branch, error if state is missing rather than walking history.
- **Project-hygiene tooling** — helpers to detect/move objectives that don't belong in their current repo. Surfaces "this objective's `parent_issue` lives in a different repo than the objective directory; move it?" warnings. Auto-archive support for retired repos (e.g. aosentry-rails).

### Out of scope for v1.2

- Replacing the per-process daemon with a system-wide service (defer to v1.3+ if multi-user / shared-machine demand emerges)
- Web/UI dashboard for the daemon (Hub Flutter app territory, owned by aodex-flutter)
- Rewriting the daemon in Go for distribution (Node version is fine; revisit only if startup latency hits user pain)
