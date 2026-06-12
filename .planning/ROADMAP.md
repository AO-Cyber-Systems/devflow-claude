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
- [x] 01-01-frontmatter-fields-and-templates-TRD.md — document new optional GH-link frontmatter fields + back-compat parse tests (Wave 1, standard)
- [x] 01-02-resolver-chain-walk-TRD.md — `df-tools gh resolve <objective>` + lib/gh.cjs chain helpers + per-process cache (Wave 2, tdd)
- [x] 01-03-auth-and-error-handling-TRD.md — hard-fail with remediation on missing/expired gh auth (Wave 3, tdd)
- [x] 01-04-gh-sync-skill-and-cli-TRD.md — idempotent disk → GitHub state push + sticky comment + Project v2 fields (Wave 4, tdd)
- [x] 01-05-pm-backend-seam-TRD.md — scaffold abstraction for v1.2+ Linear/Jira backends (Wave 5, standard)
- [x] 01-06-dogfood-and-integration-TRD.md — backfill obj 0 frontmatter, capture cassettes, live round-trip (Wave 6, tdd)

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
- [x] 02-02-peer-scanner-TRD.md — scanPeer + git-branch walker + _setRunGit injection (Wave 3, tdd)
- [x] 02-03-org-scanner-TRD.md — walkProject (lib/gh.cjs) + scanOrg + task-list fallback (Wave 4, tdd)
- [x] 02-04-cache-layer-TRD.md — readCache + writeCache + isStale + .gitignore (Wave 2, tdd)
- [x] 02-05-skill-and-cli-TRD.md — /devflow:awareness skill + df-tools awareness CLI router (Wave 5, standard)
- [x] 02-06-lifecycle-integration-TRD.md — SessionStart hook + plan/execute init refresh wiring (Wave 6, tdd) — DONE 2026-05-04, 710/719 tests pass, commits f35aaa3 + 5ddb3b6
- [x] 02-07-library-export-and-integration-TRD.md — export surface lock + integration tests + cassette capture (Wave 7, tdd)

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

**TRDs:** 7 plans across 6 waves
- [x] 03-01-sibling-scanner-and-fixtures-TRD.md — scanSiblings + tokenize/score + fs fixtures + CLI scaffold (Wave 1, tdd)
- [x] 03-02-eden-libs-scanner-TRD.md — scanLibs + camelSplit + parseExports + lexical match heuristic (Wave 2, tdd)
- [x] 03-03-org-overlap-and-misfiling-TRD.md — scanOrgOverlap (graceful auth degrade) + misfiling detection (Wave 3, tdd)
- [x] 03-04-format-considerations-TRD.md — formatConsiderations Markdown renderer + considerations CLI orchestrator (Wave 4, tdd)
- [x] 03-05-research-skill-integration-TRD.md — /df:research-objective writes Cross-Repo Considerations section to CONTEXT.md (Wave 5, standard)
- [x] 03-06-plan-skill-integration-TRD.md — /df:plan-objective workflow + planner agent read Cross-Repo Considerations (Wave 5, standard, parallel with 03-05)
- [x] 03-07-library-export-and-dogfood-TRD.md — module.exports lock (21-entry surface) + integration tests + dogfood capture (Wave 6, tdd)

### Objective 4: Duplicate-work detection + resolution flow

**Goal:** Detect when a planned or about-to-execute objective overlaps with another session's in-flight or recently-shipped work; surface the overlap to the user with a 4-option resolution flow (Merge / Defer / Coordinate / Proceed-anyway). Consumes obj 2's peer scanner + obj 3's org-overlap output. Plan-time + execute-time checks; no new storage backend.

**Tracks:** devflow-claude#13 (sub-issue of #9 [Roadmap]). Depends on obj 0 ✓ + obj 2 ✓ + obj 3 ✓.

**Inputs (research complete):**
- `.planning/research/cross-session-coordination.md` — §"Duplicate detection" — plan-time + execute-time checkpoints, signal weights, 4-option resolution
- `.planning/research/github-coordination-layer.md` — chain primitives reused

**Locked decisions:**
1. **Two checkpoints:** plan-time (`/df:plan-objective` entry, after researcher runs) + execute-time (`/df:execute-objective` entry, before first wave). Match strength differs by checkpoint — execute-time is stricter.
2. **Three signal classes (lexical, no LLM scoring):**
   - **Hard match (block):** same `github_issue` ref between current objective and a peer session OR an obj 3 org-overlap top match
   - **Strong match (block):** ≥2 file path overlap with a peer's `files_modified` (from peer STATE.md), OR ≥3 keyword overlap with a peer's objective title
   - **Weak match (advise):** 1-2 keyword overlap, or single shared file in different concerns — log a one-line warning, do not block
3. **4-option resolution flow** (presented via AskUserQuestion when blocking match found):
   - **Merge:** abort current planning, point at the existing objective on the matched branch
   - **Defer:** save current planning state to .planning/.deferred/<objective_id>.json, exit
   - **Coordinate:** continue planning but emit a `## Coordination Note` section in CONTEXT.md naming the matched session + suggesting handoff points
   - **Proceed-anyway:** continue with full warning logged in CONTEXT.md (escape hatch)
4. **No new storage backend.** Reads from obj 2's peer scanner cache + obj 3's org-overlap output. No daemon, no separate registry.
5. **Read-only at execute-time when no blocking match.** If recheck at execute-time finds NO blocking match, no prompt — just a one-line log entry. Friction-minimal.
6. **Plan-time match → CONTEXT.md note (always).** Whether resolved as Coordinate or Proceed-anyway, the matched-session metadata gets recorded in CONTEXT.md so downstream agents see the coordination context.
7. **Resolution choices are loggable.** A `.planning/.dup-detect-log.jsonl` (gitignored) captures every detection + the user's choice for retrospective analysis (no PII; just objective_id, match strength, resolution).
8. **Hard fails on infrastructure errors are silent.** If obj 2's awareness cache is corrupt or obj 3's resolver fails, dup-detect logs a warning + continues without blocking. Plan-time consultation never blocks on infrastructure.

**Success Criteria:**

*Detection logic*
1. `lib/dup-detect.cjs` exports `detectDuplicates({ objective, projectCtx, mode: 'plan' | 'execute' })` returning `{ blocking: bool, matches: [{strength, source, peer_objective, peer_branch, signal, score}], advisory: [...] }`. Hand-built fixtures; `_setRunPeer` + `_setRunOrgOverlap` injection mirrors obj 1+2+3 patterns.
2. Hard match (same `github_issue` ref) is detected from peer scanner output AND from obj 3's `scan-org-overlap` output; both paths covered.
3. Strong file-overlap matching: lexical comparison of current objective's `files_modified` (from OBJECTIVE.md or TRD frontmatter) against each peer's `files_modified` (from peer STATE.md); ≥2 path overlap = strong; tested with realistic paths.
4. Weak match logging — 1-keyword overlaps surface in `result.advisory` but not `result.blocking`.

*Plan-time integration*
5. `/df:plan-objective` workflow runs `df-tools dup-detect --mode plan <objective_id>` after researcher completes. If `blocking: true`, surface AskUserQuestion with 4 options (Merge / Defer / Coordinate / Proceed-anyway). User's choice routes the workflow accordingly.
6. CONTEXT.md gets a `## Coordination Note` section when match resolved as Coordinate or Proceed-anyway, naming the peer objective + branch + suggested handoff.

*Execute-time integration*
7. `/df:execute-objective` workflow runs `df-tools dup-detect --mode execute <objective_id>` before first wave. Stricter (no advisory-only — only blocking signals trigger prompt). Same 4-option resolution.
8. Defer mode persists state to `.planning/.deferred/<objective_id>.json` with: objective metadata, current TRD count, last commit, resolution timestamp. Resumable via separate command (deferred state out of obj 4 scope; just persist).

*Resolution log + library surface*
9. `.planning/.dup-detect-log.jsonl` (gitignored) records each detection with `{ timestamp, objective_id, mode, blocking, top_match: {strength, peer, score}, resolution }`. Append-only; no rotation.
10. `lib/dup-detect.cjs` surface lock: `detectDuplicates`, `formatDetectionMarkdown`, `recordResolution`, `applyResolution`, `_setRunPeer`, `_setRunOrgOverlap`. Module exports stable surface; integration test covers all 4 resolution paths.

**Out of scope (v1.1 — explicit):**
- Resumable defer (state persisted but resume command is separate work)
- Cross-org dup detection — only walks current org's awareness data
- LLM-based semantic similarity — locked deterministic per obj 3 precedent
- Auto-merge of objective directories when user picks Merge — just abort + redirect; manual merge is user's job
- Real-time notifications when a sibling starts overlapping work mid-execute — scoped to entry-point checks

**Gates** (downstream consumers): obj 6 (check-todos shows dup-detect log entries in urgency lane).

**TRDs:** 6 plans across 5 waves
- [x] 04-01-detection-engine-and-fixtures-TRD.md — detectDuplicates + signal scoring + injection helpers + buildDupDetectFixtures (Wave 1, tdd) — SC-1, SC-2, SC-3, SC-4 ✓ (2026-05-04, 903 tests, 47 new)
- [x] 04-02-resolution-recorder-TRD.md — recordResolution (jsonl append) + applyResolution dispatcher + _writeCoordinationNote + _writeDeferredState + .gitignore for log (Wave 2, tdd) — SC-6, SC-8, SC-9
- [x] 04-03-format-detection-markdown-TRD.md — pure formatter for AskUserQuestion display + CONTEXT.md note body (Wave 3, tdd) — SC-5, SC-6 (rendering side)
- [x] 04-04-plan-skill-integration-TRD.md — /df:plan-objective workflow runs dup-detect, surfaces 4-option AskUserQuestion, writes Coordination Note (Wave 4, standard) — SC-5, SC-6
- [x] 04-05-execute-skill-integration-TRD.md — /df:execute-objective workflow runs dup-detect at entry, friction-minimal (Wave 4, standard, parallel with 04-04) — SC-7, SC-8
- [x] 04-06-library-export-and-integration-TRD.md — surface lock + e2e integration tests covering all 4 resolution paths (Wave 5, tdd) — SC-10

### Objective 5: Initiative context layer

**Goal:** Project GitHub Epics (parent issues + linked org Project items) onto disk at `~/.claude/devflow/initiatives/<slug>.md` so the planner can read **strategic context** at plan time without live gh queries. Each initiative file carries Why / Open questions / Key repos / Linked sub-issues. The planner consults matching initiatives by `key_repos` membership when generating TRDs. `df:initiatives sync` command refreshes the on-disk projection from live GitHub state.

**Tracks:** devflow-claude#14 (sub-issue of #9 [Roadmap]). Independent of obj 2-4; consumes obj 1 ✓ + obj 2 ✓ for primitives.

**Inputs (research complete):**
- `.planning/research/cross-session-coordination.md` — §"Initiative context layer"
- `.planning/research/github-coordination-layer.md` — three-tier hierarchy + Epic primitive

**Locked decisions:**
1. **Disk projection at `~/.claude/devflow/initiatives/<slug>.md`** — global, not per-repo. Single source readable by every devflow session across worktrees.
2. **Schema:** YAML frontmatter (slug, github_issue, parent_project, key_repos[], updated_at) + body sections (## Why / ## Open Questions / ## Linked Sub-issues / ## Status).
3. **Read-only consumer at plan time** — planner reads matching initiatives (filtered by key_repos containing current PROJECT.md github_repo). No mutation during planning.
4. **`df:initiatives sync` is the only writer.** Walks org Product Roadmap project + each item's tracked sub-issues + parent Epic chains. One file per initiative. Idempotent — re-sync produces same content modulo `updated_at`.
5. **Reuse obj 1 + obj 2 primitives.** `gh.cjs::resolveChain` walks the chain; `awareness.cjs::scanOrg` walks the project. No new GraphQL queries beyond what obj 1/2 already issue.
6. **Hard-fail on missing gh auth (sync command only).** Plan-time read is always file-only; never blocks on gh.
7. **Idempotent + safe.** Sync writes via tmp + rename; never partial write. Files removed when their source GitHub issue is closed (with confirmation prompt unless `--force`).
8. **Token-bounded body.** Each initiative file capped at ~4KB (Why + Open Questions truncated if longer); avoids exploding planner context.

**Success Criteria:**

*Initiative writer*
1. `df-tools initiatives sync [--initiative <slug>]` walks org Product Roadmap project, identifies items that qualify as "Initiatives" (have ≥1 sub-issue OR are tagged with `type:epic` label OR are draft Project items in `Status: In Progress`), and writes one file per initiative to `~/.claude/devflow/initiatives/<slug>.md`. Optional `--initiative <slug>` syncs single initiative.
2. Initiative files have locked YAML frontmatter (slug, github_issue, parent_project, key_repos[], updated_at) + body (## Why / ## Open Questions / ## Linked Sub-issues / ## Status).
3. Sync is idempotent: running twice produces no diff in second run except `updated_at`. Atomic write via tmp + rename.

*Initiative reader (planner integration)*
4. `lib/initiatives.cjs` exports `loadInitiatives({ home })`, `matchByRepo(initiatives, github_repo)`, `formatInitiativeForPlanner(initiative)`. Pure logic; no fs writes from reader.
5. `/df:plan-objective` workflow loads initiatives at entry, filters to those whose `key_repos` includes current `PROJECT.md::github_repo`, includes formatted body in planner agent's `<additional_context>` block. Advisory — planner can override.

*CLI surface*
6. `/devflow:initiatives` skill + `df-tools initiatives <subcommand>` CLI. Subcommands: `sync` (writer), `list` (read-only enumeration), `show <slug>` (read-only detail). Hard-fails sync on missing gh auth via `requireGhAuth`; never fails list/show.
7. Sync deletes initiative files when source GitHub issue is closed; with `--force` flag. Without `--force`, prompts for confirmation per stale file (or skips with warning if non-interactive).

*Library + tests*
8. `lib/initiatives.cjs` exports stable surface: `syncInitiatives`, `loadInitiatives`, `matchByRepo`, `formatInitiativeForPlanner`, `_writeInitiativeFile`, `_setRunGh`. Hand-built fixtures; injection mirrors obj 1+2+3+4 patterns.
9. Round-trip test gated on `GH_INTEGRATION=1`: sync against live org Product Roadmap → assert ≥1 initiative file written → load + match → format. Skipped cleanly when env unset.
10. Token-budget test: `formatInitiativeForPlanner(initiative)` output ≤ 1500 chars per initiative. Multi-initiative composition stays under 6 KB.

**Out of scope (v1.1 — explicit):**
- Bidirectional sync (initiative file edits flow back to GitHub) — v1.2+
- Initiative templates / scaffolding for new Epics — separate work
- Initiative dependency graph rendering — obj 8 (TUI) territory
- Auto-creation of initiatives from local objectives — manual-only in v1.1

**Gates** (downstream consumers): obj 6 (check-todos shows initiative open questions in urgency lane), obj 8 (TUI renders initiative tree).

**TRDs:** 5 plans across 5 waves
- [x] 05-01-reader-and-fixtures-TRD.md — loadInitiatives + matchByRepo + formatInitiativeForPlanner + token-budget primitives + CLI list/show + fixtures (Wave 1, tdd) — SC-4, SC-6 list/show side
- [x] 05-02-writer-sync-TRD.md — syncInitiatives + _writeInitiativeFile (atomic tmp + rename) + qualification + slug + render (Wave 2, tdd) — SC-1, SC-2, SC-3
- [x] 05-03-stale-deletion-TRD.md — _detectStaleInitiatives + _deleteStaleFile + --force + TTY readline confirmation + non-TTY skip (Wave 3, tdd) — SC-7
- [x] 05-04-skill-and-plan-integration-TRD.md — /devflow:initiatives skill + format-for-planner CLI + plan-objective workflow + planner agent INITIATIVES block (Wave 4, standard) — SC-5, SC-6 sync side
- [x] 05-05-library-export-and-integration-TRD.md — module.exports surface lock + EX1 deepStrictEqual + GH_INTEGRATION=1 round-trip + token-budget assertion (Wave 5, tdd) — SC-8, SC-9, SC-10

### Objective 9: Roadmap ↔ disk reconciliation

**Goal:** `df:sync-roadmap` walks `ROADMAP.md` and reconciles its checkbox state against on-disk reality (which TRDs have SUMMARY.md, which objectives are complete, etc.). Drift between ROADMAP claims and actual filesystem state is silently corrected (or surfaced for review). Eliminates the recurring chore of manually flipping `[ ]` → `[x]` after each TRD ships.

**Tracks:** devflow-claude#18 (sub-issue of #9 [Roadmap]). Independent of all other v1.1 objectives — can land any time.

**Inputs (research complete):**
- `.planning/research/cross-session-coordination.md` — passing reference
- Direct observation: every v1.1 objective so far has manually updated ROADMAP TRD checkboxes after each wave; this objective automates that

**Locked decisions:**
1. **Walk + write — no questions asked when reconciling drift.** Default mode rewrites ROADMAP checkboxes to match on-disk truth. `--dry-run` shows diff without writing. `--interactive` prompts per drift.
2. **Three reconciliation rules:**
   - TRD has `<TRD-id>-SUMMARY.md` on disk → mark `[x]` in ROADMAP
   - TRD has `Self-Check: FAILED` in SUMMARY → mark `[ ]` and add `(failed)` annotation
   - TRD listed in ROADMAP but no TRD file exists → leave `[ ]` and surface a warning (don't auto-delete)
3. **Objective-level rollup:** when ALL TRDs in an objective are checked, mark the objective complete in §"Progress" table (if it exists) AND in §"Status:" line.
4. **Single ROADMAP.md only.** Doesn't cross repos. Multi-repo reconciliation is obj 6 territory.
5. **Atomic write (tmp + rename).** Same pattern as obj 2 awareness cache + obj 5 initiatives.
6. **Idempotent.** Running twice produces no diff in second run.
7. **Read-only at plan-time + execute-time.** `df:sync-roadmap` is invoked manually OR as a post-execute hook. Never mutates during planning.
8. **No GitHub side effects.** ROADMAP.md is local; this objective doesn't touch GH issues. (GH sync is obj 1's `df-tools gh sync` — separate command.)

**Success Criteria:**

*Reconciler*
1. `lib/roadmap-reconcile.cjs` exports `reconcile({ projectRoot, mode: 'write' | 'dry-run' | 'interactive' })` returning `{ changes: [{ kind, path, before, after }], warnings: [] }`. Hand-built fixtures; pure logic.
2. Three rule kinds enforced: trd_summary_exists, trd_summary_failed, trd_orphan_warning.
3. Atomic write via tmp + rename; idempotent (second run = empty changes).

*Objective-level rollup*
4. When all TRDs in an objective have SUMMARYs, `### Objective N` section's `**Status:**` line gets updated (e.g., "Status: in flight" → "Status: complete 2026-05-05"). Frontmatter Progress table (if present) updated similarly.

*CLI surface*
5. `df-tools sync-roadmap [--dry-run] [--interactive]` runs reconcile + writes (or shows diff). Default: write mode.
6. `/devflow:sync-roadmap` skill invokes the CLI.

*Library + tests*
7. `lib/roadmap-reconcile.cjs` exports stable surface: `reconcile`, `_walkTrdLines`, `_checkSummaryExists`, `_checkSummaryFailed`, `_writeReconciledRoadmap`. Unit-testable with fixture trees.
8. Round-trip integration test: create fixture project with mismatched ROADMAP + SUMMARYs → run reconcile → assert ROADMAP matches disk truth.
9. Self-test: `df-tools sync-roadmap --dry-run` against THIS repo's ROADMAP shows zero drift (since we maintain it manually); after a fake breakage (`sed` an `[x]` to `[ ]`), `--dry-run` shows the drift; `write` fixes it.
10. Idempotency test: running twice produces zero second-run changes.

**Out of scope (v1.1 — explicit):**
- Cross-repo reconciliation (obj 6 territory)
- Auto-deletion of orphan TRDs (warn only — never delete user files)
- GitHub issue state sync (that's obj 1's `df-tools gh sync`)
- ROADMAP.md schema migration (assumes current format)

**Gates:** none — pure utility. Available immediately for use across v1.1+.

**TRDs:** 3 plans across 3 waves
- [x] 09-01-reconciler-engine-and-fixtures-TRD.md — reconcile() + 3 rule helpers + atomic write + buildReconcileFixtures (Wave 1, tdd) — SC-1, SC-2, SC-3
- [x] 09-02-objective-rollup-TRD.md — _rollupObjectiveStatus + Status line + Progress table updater + reconcile integration (Wave 2, tdd) — SC-4
- [ ] 09-03-cli-skill-and-integration-TRD.md — df-tools sync-roadmap CLI + /devflow:sync-roadmap skill + module.exports lock + e2e self-test/idempotency (Wave 3, tdd+standard) — SC-5, SC-6, SC-7, SC-8, SC-9, SC-10

### Objective 6: Unified df:check-todos

**Goal:** Morning-standup view aggregating local todos + GH issues (assigned/mentioned/review-requested) + active peer sessions (obj 2) + initiative open questions (obj 5) + dup-detect log (obj 4) into a single command grouped by urgency lane. The "what should I work on right now?" answer.

**Tracks:** devflow-claude#15. Depends on obj 2 ✓, obj 4 ✓, obj 5 ✓.

**Inputs (research complete):**
- `.planning/research/cross-session-coordination.md` — §"Unified df:check-todos"

**Locked decisions:**
1. **Aggregator pattern** — read-only consumer of multiple sources; no mutation of any source
2. **Urgency lanes (top to bottom):**
   - 🔥 Blocked-on-you (active peer waiting + dup-detect resolutions waiting)
   - ⚡ Now (assigned GH issues with high priority + in-flight objectives + active TRDs)
   - 📋 Soon (mentioned GH issues + review-requested + initiative open questions)
   - 💡 Ideas (local todos via TodoWrite + low-priority GH issues)
3. **Five sources:**
   - Local todos via existing `df-tools state get todos`
   - GH issues across primary repos (`gh issue list --assignee @me` + `--mentions @me` + `--review-requested @me`)
   - Active peer sessions (obj 2 `awareness scan-peer`)
   - Initiative open questions (obj 5 `initiatives list` + parse Open Questions section)
   - Dup-detect resolution log (obj 4 `.dup-detect-log.jsonl`)
4. **Cache mirrors obj 2's awareness pattern** — `.planning/.check-todos-cache.json` (gitignored), 10-min TTL, force-refresh via `--refresh`
5. **Hard-fail on gh auth (sync mode only)** — read-only display falls back to file-only sources gracefully
6. **Output format: terminal-rendered Markdown with emoji urgency markers + per-lane bullets + source attribution** (which obj surfaced it)
7. **Token-bounded** — max 5 entries per lane in default render; `--all` flag shows everything

**Success Criteria:**

*Aggregator*
1. `lib/check-todos.cjs` exports `aggregate({ projectRoot, refresh })` returning `{ blocked: [], now: [], soon: [], ideas: [], warnings: [], cached: bool }`. Hand-built fixtures.
2. Five source fetchers: `_fetchLocalTodos`, `_fetchGhIssues`, `_fetchPeerSessions`, `_fetchInitiativeQuestions`, `_fetchDupDetectLog` — all with injection hooks (`_setRunGh`, `_setRunFs`).
3. Lane assignment is deterministic + tested: each entry routes to exactly one lane based on rules.

*Cache*
4. `.planning/.check-todos-cache.json` (gitignored) namespaces sources; 10-min TTL; `--refresh` forces re-fetch.

*Renderer + CLI*
5. `formatCheckTodosMarkdown(aggregate, opts)` produces terminal-friendly output with urgency emoji + lane headers + per-entry attribution.
6. `df-tools check-todos [--all] [--refresh] [--lane <name>]` runs aggregate + renders; `--all` removes per-lane truncation; `--lane <name>` filters single lane.
7. `/devflow:check-todos` skill invokes the CLI.

*Library + tests*
8. `lib/check-todos.cjs` exports stable surface: `aggregate`, `formatCheckTodosMarkdown`, `_fetchLocalTodos`, `_fetchGhIssues`, `_fetchPeerSessions`, `_fetchInitiativeQuestions`, `_fetchDupDetectLog`, `_setRunGh`, `_setRunFs`, `_resetMocks`. Module surface locked.
9. Round-trip integration test gated on `GH_INTEGRATION=1`: live aggregate against this repo + user's actual GH state. Skipped cleanly when env unset.
10. Self-test: `df-tools check-todos --raw` against this repo returns valid JSON with all 5 sources surfacing data (since obj 2/4/5 all populated this repo's state).

**Out of scope (v1.1 — explicit):**
- Cross-org GH issue aggregation (only walks current org)
- AI-powered prioritization / lane re-routing (deterministic rules only)
- Persistent action history (this is read-only)
- Mutation operations (e.g., `check-todos resolve <id>`) — separate work

**Gates:** none — closes the v1.1 runtime layer.

**TRDs:** 4 plans across 4 waves
- [x] 06-01-aggregator-and-fixtures-TRD.md — aggregate() + 5 _fetch* helpers + lane assignment + buildCheckTodosFixtures + injection hooks (Wave 1, tdd) — SC-1, SC-2, SC-3
- [x] 06-02-cache-layer-TRD.md — readCheckTodosCache + writeCheckTodosCache + isCheckTodosCacheStale + aggregate cache wiring + .gitignore (Wave 2, tdd) — SC-4 — DONE 2026-05-04, 1254/1254 tests pass, commits f2ad36f + 6c14638
- [x] 06-03-formatter-TRD.md — formatCheckTodosMarkdown pure renderer + 4 lane sub-renderers + token bounding + --lane filter (Wave 3, tdd) — SC-5
- [x] 06-04-cli-skill-and-integration-TRD.md — df-tools check-todos full flag wiring + /devflow:check-todos skill REWRITE + module.exports lock + e2e self-test + GH_INTEGRATION round-trip (Wave 4, mixed) — SC-6, SC-7, SC-8, SC-9, SC-10 — DONE 2026-05-05, 1290/1291 tests pass, commits d1125a6 + 08907d1 + cc1dcbd

### Objective 8: Program-aware TUI viewer

**Goal:** Read-only terminal UI rendering parallel sessions + their position in the org tree. Composes obj 2 (peer awareness) + obj 5 (initiatives) + obj 6 (check-todos) + obj 1 (gh chain) into a single screen. tmux-pane friendly. Doesn't gate execution. Refresh on key press; auto-refresh disabled by default.

**Tracks:** devflow-claude#17. Depends on obj 2 ✓, obj 5 ✓, obj 6 ✓.

**Inputs (research complete):**
- `.planning/research/cross-session-coordination.md` — passing reference (TUI mentioned as v1.1 deliverable)

**Locked decisions:**
1. **Hand-rolled ANSI rendering — no TUI library dependency.** Keeps install footprint small, avoids node-pty/blessed/ink complexity. Pure stdout escape codes + cursor positioning + key handling via `readline` raw mode.
2. **Read-only.** No mutation ops surfaced via TUI. View only.
3. **Three panels (vertically stacked, 80×24 default):**
   - **Top:** Org tree (Product Roadmap project entries grouped by Product × Quarter)
   - **Middle:** Peer awareness (from obj 2 — branches with author + objective + last commit)
   - **Bottom:** Active initiatives (from obj 5 — slug + Why summary + open question count)
4. **Refresh model:** initial render + manual `r` key refresh. No auto-refresh poll. `q` quits.
5. **tmux-pane safe.** Detects narrow terminals (< 80 cols) and re-flows rather than crashing. Restores cursor + screen on exit (handles SIGINT cleanly).
6. **No keystroke side effects beyond r/q.** Future TUI features (selection, drill-down) are v1.2+.
7. **Reuses every existing data source.** No new fetchers; just composes obj 2 scanPeer + obj 5 loadInitiatives + obj 6 aggregate (cached path) + obj 1 resolveChain.
8. **Token-bounded.** TUI render code stays under ~600 lines; pure logic + ANSI helpers.

**Success Criteria:**
1. `lib/tui.cjs` exports `render({ awareness, initiatives, todos, orgChain, opts })` — pure function returning ANSI string (no I/O).
2. `_renderOrgPanel`, `_renderPeerPanel`, `_renderInitiativesPanel` — three sub-renderers, each tested independently with hand-built fixtures.
3. `_layoutPanels(rows, cols, panels)` — terminal-size-aware layout helper. Re-flows for narrow terminals (< 80 cols → single-column stack).
4. `df-tools tui` CLI — opens TUI mode (raw stdin, alternate screen, hides cursor). `r` refreshes data; `q` exits cleanly (restores cursor, leaves alternate screen).
5. Clean exit handling: SIGINT, EOF on stdin, `q` keypress all restore terminal state via `process.on('exit')` cleanup.
6. `/devflow:tui` skill invokes the CLI.
7. Snapshot tests: render against fixed fixture aggregates, assert exact ANSI output (deterministic). Compare against `__fixtures__/tui-snapshots/<scenario>.txt`.
8. Resilience: missing data source (e.g., obj 5 cache absent) → renders empty panel with "(no initiatives)" placeholder; never crashes.
9. `lib/tui.cjs` exports stable surface: `render`, `_renderOrgPanel`, `_renderPeerPanel`, `_renderInitiativesPanel`, `_layoutPanels`, `_setRunStdout`, `_resetMocks`. Module locked.
10. Self-test: `df-tools tui --once --raw` (one-shot mode for testing) renders this repo's actual state to stdout as ANSI; exits 0; exits cleanly even when piped to a non-TTY.

**Out of scope (v1.1 — explicit):**
- Interactive selection / drill-down (just r/q)
- Auto-refresh poll (manual only)
- Mouse support
- Multi-pane layouts beyond the 3 stacked panels
- Detailed initiative view / sub-issue expansion
- TUI-driven mutations (resolve issues, update todos, etc.)

**Gates:** none — closes the v1.1 deliverable.

**TRDs:** 3 plans across 3 waves
- [x] 08-01-renderer-and-fixtures-TRD.md — render + _renderOrgPanel/_renderPeerPanel/_renderInitiativesPanel + _layoutPanels + ANSI helpers + 9 hand-built snapshot fixtures (Wave 1, tdd) — SC-1, SC-2, SC-3, SC-7, SC-8
- [x] 08-02-cli-and-terminal-control-TRD.md — df-tools tui CLI + raw stdin + alt-screen + cursor restore + signal handlers + non-TTY auto-fallback (Wave 2, standard) — SC-4, SC-5
- [x] 08-03-skill-and-export-lock-TRD.md — /devflow:tui skill + module.exports LOCKED + composition tests + e2e self-test (Wave 3, tdd) — SC-6, SC-9, SC-10


---

## Milestone v1.2 — Token Efficiency + Ambient Mode + Handoff Polish (in flight)

**Goal:** Three threads. (1) Cut per-invocation token cost (300-600k → 200-400k target) by consolidating skills, extracting prompts to references, and dropping low-leverage features. (2) Convert routing from advisory to authoritative (0% → 90% obedience target) so DevFlow gets used in the 88% of sessions that currently bypass it. (3) Close the "Claude continues executing" promise for TTY-interactive auth (PTY) + polish the coordination layer.

**Status:** In flight 2026-05-05. Sequencing chosen efficiency-first per user directive: efficiency wins compound on every invocation today; adoption gains layer on top later.

**Inputs:** GitHub roadmap issue #25 (Plan B ambient mode, 11 phases #26–#36). v1.1 leveraging-gap audit (4 v1.1 surfaces not yet auto-wired). Existing v1.2 PTY/polish design (preserved below as scope).

**Objective scope (13 objectives, ordered by sequencing):**

*Phase 1 — Token efficiency (priority):*

1. **Phase E — Agent-spawn audit** — diagnose general-purpose vs dedicated agent invocations across recent sessions; identify shelf-ware specialized agents; produce remediation table for Phases F/G/H. **Tracks: devflow-claude#30**
   - **Status:** Planned 2026-05-04 (objective 10 / branch `feature/v1.2-obj-1-agent-audit`)
   - **TRDs:** 2 plans
     - [ ] 10-01-audit-and-remediate-TRD.md — Apply 14 switches across 6 workflow files; audit table in 10-RESEARCH.md
     - [ ] 10-02-convention-doc-TRD.md — Write `docs/agent-spawning-convention.md` codifying the rule
2. **Phase D — Fix /devflow:build → df-verifier wiring** — quick wiring fix (currently 0/22 verifier spawns from /devflow:build); unblocks Phase F. **Tracks: devflow-claude#29**
   - **Status:** Planned 2026-05-04 (objective 11 / branch `feature/v1.2-obj-2-verifier-fix`)
   - **TRDs:** 1 plan
     - [ ] 11-01-diagnose-and-fix-TRD.md — Add explicit verifier spawn to build.md § 8 + regression test in df-tools.test.cjs
3. **Phase G+I — Skill consolidation 28→14 + drop low-leverage** — `/devflow:objective <add|remove>`, `/devflow:milestone <new|audit|complete|gaps>`, `/devflow:status [check|pause|resume]`, etc. Drops features identified as low-leverage by Phase E. **Tracks: devflow-claude#32 + #34**
   - **Status:** DONE 2026-05-06 — all 7 TRDs complete, 7/7 SUMMARYs written (objective 12 / branch `feature/v1.2-obj-3-skill-consolidation`)
   - **TRDs:** 7/7 complete across 3 waves
     - [x] 12-01-skill-route-and-objective-TRD.md — Build df-tools skill-route CLI + consolidated /devflow:objective skill + 3 deprecation redirects (Wave 1, tdd) — PHASE-G1, PHASE-G2, PHASE-A-HANDOFF — DONE
     - [x] 12-05-i3-tdd-collapse-TRD.md — Collapse type:tdd TRD-level → task-level tdd attribute; planner + executor + tdd.md updated; back-compat preserved (Wave 1, tdd) — PHASE-I3 — DONE
     - [x] 12-06-i2-i4-cleanup-TRD.md — df-tools survey decimal-objectives + I2 disposition; canonicalize summary template (delete 3, keep summary.md) (Wave 1, standard) — PHASE-I2, PHASE-I4 — DONE
     - [x] 12-02-milestone-skill-TRD.md — Consolidated /devflow:milestone <new|audit|complete|gaps> + 4 deprecation redirects (Wave 2, tdd) — PHASE-G1, PHASE-G2 — DONE
     - [x] 12-03-todo-and-status-skills-TRD.md — Consolidated /devflow:todo + /devflow:status (incl. --flag normalization + default subcommand) + 6 deprecation redirects (Wave 2, tdd) — PHASE-G1, PHASE-G2 — DONE
     - [x] 12-04-workstreams-extension-TRD.md — Update /devflow:workstreams to use skill-route + add `run` subcommand stub for v1.2 obj 6 (Wave 2, tdd) — PHASE-G1 — DONE
     - [x] 12-07-docs-and-routing-prep-TRD.md — Rewrite help.md + README skill table + Phase A handoff JSON snapshot (Wave 3, standard) — PHASE-G4, PHASE-A-HANDOFF — DONE 2026-05-06, 1471/1496 tests pass
4. **Phase H — Prompt extraction to references/templates** — move duplicated agent-prompt content (debugging methodology, goal-backward methodology, TRD spec) to shared references. ~25-55k tokens saved per `/devflow:build`. **Tracks: devflow-claude#33**
   - **Status:** Planned 2026-05-04 (objective 13 / branch `feature/v1.2-obj-4-prompt-extraction`)
   - **TRDs:** 4 plans across 3 waves
     - [ ] 13-01-create-shared-references-TRD.md — Create 5 reference files (trd-spec, research-tooling, goal-backward, debugging-methods, stub-patterns) + 1 template (codebase/patterns) (Wave 1, standard) — PHASE-H1
     - [ ] 13-02-edit-agents-group-a-TRD.md — Edit planner + job-checker + debugger + objective-researcher + verifier to externalize inline content (Wave 2, standard) — PHASE-H2-PLANNER, PHASE-H2-JOB-CHECKER, PHASE-H2-DEBUGGER, PHASE-H2-OBJECTIVE-RESEARCHER, PHASE-H2-VERIFIER-STUB, PHASE-H3-VERIFIER-TEMPLATE
     - [ ] 13-03-edit-agents-group-b-TRD.md — Edit project-researcher + codebase-mapper to externalize inline templates (Wave 2, standard) — PHASE-H2-PROJECT-RESEARCHER, PHASE-H3-PROJECT-RESEARCHER, PHASE-H3-CODEBASE-MAPPER
     - [ ] 13-04-token-savings-and-verify-TRD.md — Compute line-count delta + token-savings estimate + back-compat verification (1471 tests pass, @-ref resolvability) (Wave 3, standard) — PHASE-H-MEASUREMENT, PHASE-H-BACKCOMPAT
5. **Phase F — Default-on safety nets** — flip currently opt-in safety features to default-on under Plan B's ambient model: cheap CLI pre-checker, novel-domain auto-research trigger, brownfield map detector, and confidence-scoring removal in favor of per-task caution flag. F4 (verifier always-on) already satisfied by Phase D. Depends on D + E. **Tracks: devflow-claude#31**
   - **Status:** Planned 2026-05-04 (objective 14 / branch `feature/v1.2-obj-5-default-on-safety`)
   - **Requirements:** [F1, F1-CONFIG, F2, F3, F4, F5]
   - **TRDs:** 5 plans across 3 waves
     - [ ] 14-01-cheap-trd-pre-checker-TRD.md — `df-tools verify trd-pre <objective>` cheap-CLI checker covering req coverage, task completeness, dep cycles, scope sanity (Wave 1, tdd) — F1
     - [ ] 14-04-config-defaults-flip-TRD.md — Flip `templates/config.json` job_checker_enabled default + F4 acceptance regression test (Wave 1, standard) — F1-CONFIG, F4
     - [ ] 14-02-novel-domain-detection-TRD.md — `df-tools detect novel-domain` (NEW_DEP/MISSING_PATTERNS/COMPARISON_KEYWORD signals) + planner auto-trigger (Wave 2, tdd) — F2
     - [ ] 14-03-brownfield-map-detector-TRD.md — `df-tools detect brownfield-map` helper (Phase A wires the SessionStart hook) (Wave 3, tdd) — F3
     - [ ] 14-05-confidence-scoring-removal-TRD.md — Drop confidence frontmatter; add per-task caution attribute; back-compat for in-flight TRDs (Wave 3, standard) — F5

*Phase 2 — Ambient mode (adoption):*

6. **Phase A — Authoritative routing keystone** — convert `route-intent.js` from advisory to authoritative; new `classify-session.js` SessionStart hook; routing decision table injected as system context. **Tracks: devflow-claude#26**
   - **Status:** Planned 2026-05-04 (objective 15 / branch `feature/v1.2-obj-6-routing-keystone`)
   - **Requirements:** [A1, A2, A3, A4]
   - **TRDs:** 5 plans across 1 wave (all parallel-safe — disjoint files)
     - [ ] 15-01-classifier-and-session-hook-TRD.md — New `lib/classifier.cjs` pure-logic helper + `classify-session.js` SessionStart hook + hooks.json registration (Wave 1, tdd) — A1
     - [ ] 15-02-route-intent-tightening-TRD.md — Tighten `route-intent.js` regex (10 fire / 5 no-fire fixtures) + box-drawn directive injection + consolidated skill names (Wave 1, tdd) — A2
     - [ ] 15-03-gate-edits-strict-TRD.md — Convert `gate-edits.js` to strict-by-default DENY with skill-active marker + override-phrase escapes (Wave 1, tdd) — A3
     - [ ] 15-04-skill-active-cli-TRD.md — `df-tools skill-active --start <name> | --end | --status` CLI for skill marker writes/removes (Wave 1, tdd) — A3 (supporting)
     - [ ] 15-05-audit-log-and-completion-TRD.md — `verify-completion.js` Stop-hook audit log emission to ~/.claude/devflow/audit.log (Wave 1, standard) — A4
7. **Phase B — `/devflow:micro` skill** — sub-30-LOC, single-file changes, ~2k token target; cheap target for ambient routing. Depends on A. **Tracks: devflow-claude#27**
   - **Status:** Planned 2026-05-04 (objective 16 / branch `feature/v1.2-obj-7-micro-skill`)
   - **Requirements:** [PHASE-B1, PHASE-B2, PHASE-B3, PHASE-B4]
   - **TRDs:** 4 plans across 2 waves
     - [ ] 16-01-micro-cli-TRD.md — `df-tools micro start|commit|abort` CLI with paired test suite (Wave 1, tdd) — PHASE-B2
     - [ ] 16-03-quick-refactor-TRD.md — Refactor `/devflow:quick` SKILL.md/workflow `<purpose>` to document <5 files, <200 LOC, no new abstractions cutoff; remove trivial-task triggers (Wave 1, standard) — PHASE-B3
     - [ ] 16-04-classifier-routing-TRD.md — Drop "(in development)" from `classifier.cjs` AMBIENT_PREAMBLE; invert classifier test case 9; add `/devflow:micro` INTENT_MAP entry + 3 fire fixtures + 1 no-fire fixture (Wave 1, standard) — PHASE-B4
     - [ ] 16-02-micro-skill-TRD.md — `/devflow:micro` SKILL.md (~30 LOC) + workflows/micro.md + STATE.md template note for Quick Tasks shared table (Wave 2, standard) — PHASE-B1
8. **Phase C — Auto-init detection for non-DevFlow projects** — detect `.planning/` absence; offer init flow. Depends on A. **Tracks: devflow-claude#28**
   - **Status:** Planned 2026-05-04 (objective 17 / branch `feature/v1.2-obj-8-auto-init`)
   - **Requirements:** [C1, C2, C3, C4]
   - **TRDs:** 4 plans across 3 waves
     - [ ] 17-02-decline-tracker-TRD.md — `df-tools project-decline` / `project-accept` CLI + `lib/decline-tracker.cjs` with 30-day expiry + atomic write to `~/.claude/devflow/declined-projects.json` (Wave 1, tdd) — C3
     - [ ] 17-04-global-config-TRD.md — `df-tools global-config get|set` CLI + `lib/global-config.cjs` with `auto_init_substantive_projects` key (default off) + `shouldAutoInit()` helper (Wave 1, tdd) — C4
     - [ ] 17-01-project-state-detector-TRD.md — `df-tools project-state` CLI + `lib/project-state.cjs` with isSubstantive heuristic (git>7d OR >10 files; manifest; not scratch) + 5 acceptance fixtures (Wave 2, tdd) — C1
     - [ ] 17-03-init-offer-mode-TRD.md — Extend `classifier.cjs` with isSubstantive + previouslyDeclined inputs; new auto-init mode; updated INIT_OFFER_PREAMBLE; classify-session.js wires getProjectState + shouldAutoInit (Wave 3, tdd) — C2

*Phase 3 — v1.1 leveraging (closes shelf-ware gap):*

9. **v1.1 polish bundle** — OBJECTIVE.md auto-scaffold + backfill objs 1-9; auto-run `df-tools sync-roadmap` and `df-tools gh sync` at objective complete; surface check-todos + awareness in plan/execute init output. Closes the gaps where v1.1 tools require manual invocation.
   - **Status:** Planned 2026-05-04 (objective 18 / branch `feature/v1.2-obj-9-polish-bundle`)
   - **Requirements:** [POLISH-OBJ-MD-SCAFFOLD, POLISH-OBJ-MD-BACKFILL, POLISH-AUTO-SYNC-ROADMAP, POLISH-AUTO-GH-SYNC, POLISH-CHECK-TODOS-PREVIEW, POLISH-AWARENESS-PREVIEW]
   - **TRDs:** 3 plans across 1 wave (all parallel-safe — disjoint files)
     - [ ] 18-01-objective-md-scaffold-TRD.md — Extend `lib/project-bootstrap.cjs` with `bootstrapObjectiveMd` + `backfillAllObjectives`; backfill objectives 01-17 (Wave 1, tdd) — POLISH-OBJ-MD-SCAFFOLD, POLISH-OBJ-MD-BACKFILL
     - [ ] 18-02-objective-complete-auto-hooks-TRD.md — Wire `df-tools sync-roadmap` + `df-tools gh sync` into `execute-objective.md` `update_roadmap` step (non-blocking, gated on github_issue) (Wave 1, standard) — POLISH-AUTO-SYNC-ROADMAP, POLISH-AUTO-GH-SYNC
     - [ ] 18-03-init-output-preview-TRD.md — Add `check_todos_preview` + `awareness_preview` (cache-only, one-line advisories) to `init plan-objective` and `init execute-objective` JSON output (Wave 1, tdd) — POLISH-CHECK-TODOS-PREVIEW, POLISH-AWARENESS-PREVIEW

*Phase 4 — Handoff watcher polish:*

10. **PTY support for handoff watcher** — `node-pty` integration in `watcher-shell.cjs`; closes TTY-interactive auth gap (`doctl auth init`, `gh auth login`, `gpg --decrypt`). Adds token-passing schema (`inputs.secrets[]`) so the daemon answers prompts from env / stash. Deny-list (`sudo`, `su -`) preserved.
   - **Status:** Planned 2026-05-04 (objective 19 / branch `feature/v1.2-obj-10-pty-watcher`)
   - **Requirements:** [PTY-BACKEND, TOKEN-PASSING, GATE-PTY-MESSAGE, DOC-PTY-CAVEATS, E2E-MOCK-AUTH]
   - **TRDs:** 5 plans across 3 waves
     - [x] 19-01-pty-backend-TRD.md — Replace child_process.spawn with node-pty in watcher-shell.cjs interactive:true path; preserve interactive:false for tests (Wave 1, tdd) — PTY-BACKEND — DONE 2026-05-06, 1864/1866 tests pass (+12 PTY tests), commits bf290ba + 310fdb4
     - [x] 19-04-doc-update-TRD.md — Update docs/handoff-watcher-guide.md with PTY caveats + platform install notes (macOS/Linux/Windows) + token-passing schema (Wave 1, standard) — DOC-PTY-CAVEATS — DONE 2026-05-06, 224→334 lines, commit 88fe5b5
     - [x] 19-02-token-passing-TRD.md — Extend pending record schema with inputs.secrets[]; wire processOnce with prompt-detection + secret-resolution + redaction (Wave 2, tdd) — TOKEN-PASSING — DONE 2026-05-06, 1898/1900 tests pass (+33 new tests across handoff/watcher-shell/daemon), commits 348dd91 + ead5811 + 69397d6 + 998b42e
     - [x] 19-03-gate-interactive-update-TRD.md — Update gate-interactive.js buildDenyReason watcher-live branch to mention PTY-backed daemon (Wave 2, tdd) — GATE-PTY-MESSAGE — DONE 2026-05-06, 1907/1909 tests pass (+9 BD-* tests), commits 1313dc7 + 7cf0203
     - [x] 19-05-mock-auth-e2e-TRD.md — Mock gh + doctl auth servers + cassettes; e2e tests for PTY-path auth flows without real credentials (Wave 3, tdd) — E2E-MOCK-AUTH — DONE 2026-05-06, 1911/1940 tests pass (+7 new MA-* tests: 4 mock-server pass, 3 architectural-gap skip with documented reasons for v1.3+), commits e795a87 + 5439e37
11. **Daemon polish bundle** — status-line indicator + auto-launch (launchd/systemd) + OS notifications + cross-shell support (fish/PowerShell; nushell deferred) + multi-project watching.
   - **Status:** Done 2026-05-06 (objective 20 / branch `feature/v1.2-obj-11-daemon-polish`). All 5 TRDs complete across 2 waves. 2089 tests / 2053 pass / 2 pre-existing failures unchanged / 34 skipped.
   - **Requirements:** [DAEMON-NOTIFICATIONS ✅, DAEMON-AUTO-LAUNCH ✅, DAEMON-MULTI-PROJECT ✅, DAEMON-CROSS-SHELL ✅, DAEMON-STATUS-LINE ✅]
   - **TRDs:** 5 plans across 2 waves
     - [x] 20-01-os-notifications-TRD.md — `lib/notifier.cjs` (osascript/notify-send dispatch) + daemon hook on dispatch-start/complete + feature flag (Wave 1, tdd) — DAEMON-NOTIFICATIONS — DONE 2026-05-06, 14 notifier tests + 7 daemon Group I tests pass, commits 5cb5fe0 + bbb7b64
     - [x] 20-02-auto-launch-TRD.md — `lib/service-installer.cjs` (launchd plist + systemd-user unit gen) + `devflow-watch install-service / uninstall-service` CLI (Wave 1, tdd) — DAEMON-AUTO-LAUNCH — DONE 2026-05-06, 26 service-installer tests + 5 CLI Group C tests pass, commits 914299c + 192dfc9
     - [x] 20-03-multi-project-TRD.md — Daemon iterates `watching: []`; per-project pending dirs; `add-project` / `remove-project` CLI; PID file mutation atomic (Wave 1, tdd) — DAEMON-MULTI-PROJECT — DONE 2026-05-06, 9 watcher-state Group W + 8 daemon Group D + 8 CLI Group C tests pass, commits 5cb5fe0 + bbb7b64 + 914299c + 192dfc9
     - [x] 20-05-cross-shell-TRD.md — `lib/wrappers/{bash,fish,powershell}.cjs` modules; `getWrapper(shellName)` factory; sentinel parser remains shell-agnostic (Wave 1, tdd) — DAEMON-CROSS-SHELL — DONE 2026-05-06, 35 wrapper unit tests pass + 5 fish/pwsh-gated tests skip cleanly + 28 watcher-shell tests byte-identical, commits 39c653d + 22cf3ca
     - [x] 20-04-status-line-TRD.md — Extend `hooks/statusline.js` with `▶ watcher` / `⏸ N pending` segment behind `daemon.status_line` flag; multi-project aware (Wave 2, tdd) — DAEMON-STATUS-LINE — DONE 2026-05-06, 25 new tests in first-ever statusline.test.js (S=6 OFF + A=7 ALIVE + F=4 tolerance + P=5 format + D=3 doc), all pass; 2089 total / 2053 pass / 2 pre-existing failures unchanged / 34 skipped, commits 1740dfc + fb9d2c3
12. **Bidirectional GH sync + configurable kind/work defaults table** — inbound GH state → objective frontmatter (poll-based); 3-tier defaults table override (project > org > bundled). Webhook deferred to v1.3+.
   - **Status:** Complete 2026-05-06 (objective 21 / branch `feature/v1.2-obj-12-bidirectional-gh-sync`) — all 5 TRDs across 2 waves DONE; ~67 new tests added across Wave 1 + 47 in Wave 2 (sync-state 22 + conflict 25); 2053 baseline preserved
   - **Requirements:** [GH-PULL-CLI, GH-PULL-APPLY, SYNC-STATE-SCHEMA, SYNC-STATE-WIRING, CONFLICT-DETECT, CONFLICT-RESOLVE, CONFLICT-EXIT-NONZERO, DEFAULTS-LOADER, DEFAULTS-LOADER-MERGE, DEFAULTS-INIT-CLI, PROVENANCE-CELL, PROVENANCE-VOCAB]
   - **TRDs:** 5 plans across 2 waves
     - [x] 21-01-gh-pull-cli-TRD.md — `df-tools gh pull <objective>` CLI + GH issue read + drift detection + 4 cassette fixtures (Wave 1, tdd) — GH-PULL-CLI, GH-PULL-APPLY — DONE 2026-05-06, 19 tests pass (F1-F3, D1-D5, A1-A4, C1-C7), `lib/gh-pull.cjs` + cassette fixtures, df-tools `gh pull` subcommand wired
     - [x] 21-04-defaults-table-loader-TRD.md — 3-tier defaults-table loader (project > org > bundled) + cell-level merge + `df-tools defaults-table init --scope` CLI (Wave 1, tdd) — DEFAULTS-LOADER, DEFAULTS-LOADER-MERGE, DEFAULTS-INIT-CLI — DONE 2026-05-06
     - [x] 21-05-intent-provenance-TRD.md — extend `intent.cjs` resolve() with per-cell `cell_provenance` field + vocabulary doc update (Wave 1, tdd) — PROVENANCE-CELL, PROVENANCE-VOCAB — DONE 2026-05-06
     - [x] 21-02-sync-state-tracking-TRD.md — `.gh-sync-state.json` schema + atomic read/write + push/pull integration (Wave 2, tdd) — SYNC-STATE-SCHEMA, SYNC-STATE-WIRING — DONE 2026-05-06, 22 tests pass (S1-S6, H1-H7, R1-R4, G1-G2, W1-W3); `lib/sync-state.cjs` exports readSyncState/writeSyncState/recordSync/hashFrontmatter/getLastSync; `_readSyncStateRaw` stub removed; commits 369dd4a + 2545dfc + 20937bc
     - [x] 21-03-conflict-resolution-TRD.md — 3-way diff detection + `--resolve={disk,gh,merge}` flag + non-zero exit on conflict (Wave 2, tdd) — CONFLICT-DETECT, CONFLICT-RESOLVE, CONFLICT-EXIT-NONZERO — DONE 2026-05-06, 25 tests pass (D1-D8, F1-F3, R1-R6+R5b, W1-W7); `lib/conflict.cjs` exports detectConflict/formatThreeWayDiff/resolveDisk/resolveGh/resolveMerge; cmdGhPull wired with --resolve={disk,gh,merge} + --resolved flags; commits 60c823c + 59e2c6a + 337eeba + 52afcb2

*Phase 5 — Workflow polish:*

13. **Workflow-impediment fixes** — `df-tools init --branch` flag (default current; error on missing rather than walking history); project-hygiene tooling (detect/move misfiled objectives, archive retired repos).
   - **Status:** Planned 2026-05-06 (objective 22 / branch `feature/v1.2-obj-13-workflow-impediment`) — 4 TRDs across 2 waves; all type:tdd per TDD playbook; `.planning/objectives/22-workflow-impediment-fixes/` contains 22-CONTEXT.md + 22-RESEARCH.md + 4 TRDs.
   - **Requirements:** [INIT-BRANCH-FLAG, INIT-NO-IMPLICIT-WALK, INIT-MISSING-STATE-ERROR, HYGIENE-CHECK-CLI, HYGIENE-MISFILED-DETECTION, HYGIENE-JSON-CONTRACT, HYGIENE-MOVE-CLI, HYGIENE-MOVE-ATOMIC, HYGIENE-MOVE-VERIFY, HYGIENE-ARCHIVE-DETECT, HYGIENE-ARCHIVE-APPLY, HYGIENE-ARCHIVE-EMIT-GH-CMD]
   - **TRDs:** 4 plans across 2 waves
     - [x] 22-01-init-branch-flag-TRD.md — `--branch=<name>` flag across all `df-tools init *` commands; `_resolveBranch` shared helper; missing-state errors with hint instead of silent fallback (Wave 1, tdd) — INIT-BRANCH-FLAG, INIT-NO-IMPLICIT-WALK, INIT-MISSING-STATE-ERROR — DONE 2026-05-06, 32 init tests pass, commits ad1caf2 + f013fb6
     - [x] 22-02-hygiene-check-TRD.md — `lib/project-hygiene.cjs` + `df-tools project-hygiene check` read-only CLI; misfiled-objective detection via direct ref extraction (no gh CLI required) (Wave 1, tdd) — HYGIENE-CHECK-CLI, HYGIENE-MISFILED-DETECTION, HYGIENE-JSON-CONTRACT — DONE 2026-05-06, 15 tests pass
     - [x] 22-03-hygiene-move-TRD.md — `df-tools project-hygiene move <id> --to=<path>` atomic-ish copy+verify+rm with rollback on verify failure (Wave 2, tdd) — HYGIENE-MOVE-CLI, HYGIENE-MOVE-ATOMIC, HYGIENE-MOVE-VERIFY — DONE 2026-05-06, 12 move tests pass
     - [x] 22-04-hygiene-archive-TRD.md — `df-tools project-hygiene archive [--apply <name>]` retired-repo detection (last commit > 6mo OR `archived: true`) + apply moves `.planning/` to `<workspace>/archived-projects/` and emits `gh repo archive` command (does not execute) (Wave 2, tdd) — HYGIENE-ARCHIVE-DETECT, HYGIENE-ARCHIVE-APPLY, HYGIENE-ARCHIVE-EMIT-GH-CMD — DONE 2026-05-06, 7 archive tests pass

**Dependency graph:**

```
E (audit) ──┬──> G+I (consolidation) ──> H (prompt extraction)
            └──> F (safety nets, also needs D)

D (verifier fix) ──> F

A (routing) ──┬──> B (micro)
              └──> C (auto-init)

PTY → Daemon polish bundle
(other objectives have no hard inter-deps)
```

**Out of scope for v1.2** (deferred to v1.3+):
- Phase J — Claude Code built-in integration (#35) — own milestone-scope work
- Phase K — Agentic estimation engine (#36) — independent; can land any milestone
- System-wide service replacement of the daemon (per-process is fine for v1.2 scope)
- Web/UI dashboard (Hub Flutter app territory)
- Daemon Go rewrite

**Targets (90 days post-completion, per #25):**

| Metric | Today | Target |
|---|---|---|
| DevFlow adoption rate | 12% | ≥75% |
| Route-intent obedience | 0% | ≥90% |
| /devflow:build → df-verifier rate | 0% | ≥90% |
| /devflow:micro invocations/week | 0 | ≥30 |
| Avg DevFlow session token cost | 300-600k | 200-400k |

### Objective 10: Autonomous mode overhaul

**Goal:** Autonomous end-to-end operation — verifier-delegated (machine-verified) checkpoints, a decision queue that parks design choices without halting independent work, auto-resume/retry hooks, hardened agent frontmatter (worktree isolation, maxTurns, memory), wired-or-removed config gates, and a `mode: "autonomous"` preset + unattended runbook. Humans stop only for design/architecture decisions, auth, and destructive actions.
**Depends on:** Objective 9
**Jobs:** 8/9 jobs executed

Jobs:
- [x] 10-01-autonomous-config-foundation-TRD.md — mode "autonomous" preset in loadConfig + template + marker gitignore
- [ ] 10-02-verifier-delegated-checkpoints-TRD.md — human-verify checkpoints delegated to verifier agent (green evidence or escalate)
- [ ] 10-03-decision-queue-TRD.md — decision-queue lib/CLI + /devflow:decide skill + OS notification
- [ ] 10-04-decision-wiring-wave-failures-TRD.md — park decisions/Rule-4 stops, continue independent waves, retry-once + dependency-aware skip
- [ ] 10-05-stop-hook-auto-resume-TRD.md — Stop hook decision:block resume, bounded 3 attempts per objective
- [ ] 10-06-subagent-retry-hook-TRD.md — SubagentStop retries failed executor once with feedback
- [ ] 10-07-agent-hardening-TRD.md — maxTurns/worktree isolation/memory frontmatter + worktree-aware spawn/merge
- [ ] 10-08-config-integrity-destamping-TRD.md — remove dead gates, batch new-project questions, autonomous de-stamping
- [ ] 10-09-unattended-runbook-TRD.md — references/unattended-operation.md + settings exposure

---

## Original v1.2 plan — preserved as scope reference (now folded into objectives 10-13 above)

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
