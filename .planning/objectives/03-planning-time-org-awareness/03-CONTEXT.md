---
objective: 03-planning-time-org-awareness
title: Planning-time org awareness — Cross-Repo Considerations in CONTEXT.md
created: 2026-05-04
status: locked
tracks: AO-Cyber-Systems/devflow-claude#12
parent_issue: AO-Cyber-Systems/devflow-claude#9
---

# Objective 3 — Locked Context

This file captures user decisions that are **LOCKED** for the planner. Do not re-litigate. Do not propose alternatives. Implement exactly.

## Goal

Extend `/df:research-objective` and `/df:plan-objective` to consult the org's broader state at plan-time and surface findings as a `## Cross-Repo Considerations` section in CONTEXT.md. The planner reads it and biases TRDs accordingly. **Execution stays unchanged** — no runtime org-polling, all the brains land at planning time.

Three signal sources combine into one section:

1. **Sibling repos** — `~/Source/*/` repos in the same org with related work (recent SUMMARY.md keyword/file overlaps).
2. **eden-libs reuse candidates** — exported surfaces in `eden-libs/` that match this objective's domain.
3. **Org Project overlap** — Product Roadmap items where the chain leads to a sibling repo's `[Roadmap]` or where the title shares ≥2 keywords with the current objective.

Output is bounded (top 3 per source, one-line entries) and advisory only — never blocks planning.

## What's already built (obj 1 + obj 2 surface that obj 3 consumes)

Obj 3 is a **read-only consumer** of obj 1's GH primitives + obj 2's awareness scanners. **DO NOT recreate any of these:**

### From `lib/gh.cjs` (obj 1 ship — feature/v1.1, merged via PR #21):

- `resolveChain(frontmatter, projectCtx)` — walks ONE objective's chain (parent_issue → roadmap → org_project). Obj 3's misfiling detection compares the resolved `roadmap_issue` repo vs the current PROJECT.md repo to flag mismatches.
- `requireGhAuth(requiredScopes)` — hard-fail auth check throwing `GhAuthError`. Obj 3's `scanOrgOverlap` MUST handle this gracefully (catch + return empty + warning per locked decision #8).
- `_setRunGh(fn)` — test injection hook. Obj 3's tests reuse this exact pattern via `gh._setRunGh()`.
- `walkProject(projectId)` — Project v2 GraphQL walker. Obj 3's `scanOrgOverlap` calls `awareness.scanOrg()` (which composes this) — does NOT call `walkProject` directly.
- `findRoadmapIssue(repo)` — repo-level `[Roadmap]` lookup. Reusable for misfiling detection.

### From `lib/awareness.cjs` (obj 2 ship — feature/v1.1-obj-2-heartbeat, in PR #23):

- `scanOrg(opts)` — composes `walkProject` + `requireGhAuth` + task-list fallback. Obj 3's `scanOrgOverlap` calls THIS (not raw GraphQL).
- `scanPeer(opts)` — git-branch state aggregation. Obj 3 does NOT consume this directly (peer awareness is local-repo-scoped per obj 2 decision #6); obj 3 walks **filesystem siblings** instead.
- `parseStateMd(content)` — fault-tolerant STATE.md parser. Obj 3's `scanSiblings` reuses this for each sibling repo's STATE.md.
- `_setRunGit(fn)` — test injection hook. Obj 3's `scanSiblings` does NOT need this (filesystem-only; obj 3 introduces `_setRunFs`).
- `parseTaskListFallback(body)` — task-list bullet parser. Not directly consumed by obj 3.
- Cache helpers (`readCache`, `writeCache`, `isStale`, `AWARENESS_CACHE_REL`) — obj 3 does NOT extend the awareness cache. Cross-Repo Considerations is regenerated on each `/df:research-objective` call (cheap; no caching for v1.1).

### From `__fixtures__/awareness-fixtures.cjs`:

- Hand-built fixture builders (`buildStateMd`, `buildOrgItem`, `buildSubIssue`, `buildOrgScanResult`, `buildMockRunGit`). Obj 3 ADDS to this file — does not duplicate. New builders introduced in obj 3 (planned in 03-01):
  - `buildSiblingRepoTree(opts)` — tmp filesystem fixture: a repo dir with PROJECT.md + objectives/ + STATE.md + SUMMARY.md
  - `buildEdenLibsTree(opts)` — tmp filesystem fixture: eden-libs-shaped dir with package.json + index.cjs + named exports
  - `buildMockRunFs(responses)` — canned filesystem-response builder mirroring `buildMockRunGit`
  - `buildOrgScanResult` extension — cassette-driven results for misfiling tests

## Locked decisions (from ROADMAP §"Objective 3: Planning-time org awareness")

### 1. Plan-time only

Consultation runs at `/df:research-objective` and `/df:plan-objective` entry — **NEVER at execute-time**. Execution remains a heads-down repo-local loop. The CONTEXT.md section is the persistent artifact; once written, executors read it transitively but do not re-scan.

This is the architectural anchor: brains at plan time, not exec time. Mirrored from obj 1 PROJECT.md principle.

### 2. Three signal sources (lexical, not LLM-based)

```
sibling_repos    — ~/Source/*/ filesystem walk (no auth needed)
eden_libs        — eden-libs/ filesystem scan of exports (no auth needed)
org_project      — scanOrg() reuse → keyword/repo overlap (gh auth required)
```

**Lexical match heuristic only.** Compare:
- Objective title tokens (lowercase, stop-word stripped)
- `files_modified` extensions and path segments
- Recent SUMMARY.md content keywords (last 90 days)

Against:
- Sibling repo: each sibling's recent SUMMARY.md content + STATE.md objective field
- eden-libs: exported symbols from `index.*` / `package.json` `main` + `exports` map
- org_project: each item's title + body + sub-issue refs

**No LLM scoring, no semantic similarity, no embeddings.** Hand-built keyword extraction + simple Jaccard overlap or token-intersection scoring. Per locked decision in ROADMAP "Out of scope: Semantic / LLM-based similarity scoring — keeps v1.1 deterministic."

### 3. Output as `## Cross-Repo Considerations` section in CONTEXT.md

`/df:research-objective` writes (or appends to) the section in CONTEXT.md **before** the planner runs. The planner reads CONTEXT.md and includes the section in its `<additional_context>` (advisory).

Section format (locked):

```markdown
## Cross-Repo Considerations

### Sibling repos
- `aodex-go` (objective 12, last summary 2026-04-30): controller-shape parity work — overlaps on `app/controllers/admin/keys_controller.rb`
- `aosentry` (objective 04, last summary 2026-04-25): Grok admin keys flow — same domain (admin auth)
- `eden-biz` (objective 03, last summary 2026-04-22): cross-cutting tenant scoping

### eden-libs candidates
- `@aocyber/state-md-parser` — already exports `parseStateMd`; consider extracting from awareness.cjs
- `@aocyber/gh-resolver` — exports `resolveChain`; if obj 4's dup-detect needs server-side resolver, extract here

### Org Project overlap
- `aodex#33 [Roadmap] Go Backend Migration` (Q2 2026) — sibling work touches Grok credential flow
- `devflow#17 [Roadmap] DevFlow Internal Alpha` (Q2 2026) — parent epic for this objective
- _Misfiling check: this objective's `parent_issue` lives in `devflow-claude` and the resolved `roadmap_issue` is `devflow-claude#9`. **No misfiling detected.**_
```

When `--peer-only` semantics aren't relevant (this is plan-time, not the awareness skill), the three subsections are always rendered together. Empty subsections render as `_(no matches)_`. When org-side scanning fails (offline / no auth), the third subsection renders as `_(skipped: gh auth not available — section will populate when auth is refreshed)_` per locked decision #8.

### 4. Read-only consumer of obj 1 + obj 2

**No new network primitives.** Reuse:
- `lib/gh.cjs::resolveChain` — for misfiling detection
- `lib/gh.cjs::requireGhAuth` — wrapped in try/catch in `scanOrgOverlap` for graceful degradation
- `lib/gh.cjs::findRoadmapIssue` — for misfiling detection
- `lib/awareness.cjs::scanOrg` — for org Project walk
- `lib/awareness.cjs::parseStateMd` — for sibling STATE.md parsing

The new module `lib/org-awareness.cjs` is composition over these primitives, plus the filesystem-walking `scanSiblings` + `scanLibs` (both pure-fs, no network).

### 5. Sibling-repo discovery via convention

**Default:** walks `~/Source/*/` for repos matching ALL of:
- Has `.git/` directory
- Has `.planning/` directory
- Has `PROJECT.md` declaring `org: AO-Cyber-Systems` (or matches the current repo's `org` field, if declared in current PROJECT.md)

Fallback when current PROJECT.md lacks `org`: match all `.planning/`-bearing repos in `~/Source/*/` regardless of org. (Most personal-machine setups have a single org; this fallback is rare.)

**Configurable via `awareness.sibling_repos: [<paths>]`** in `.planning/config.json`. When the array is set, replaces the default `~/Source/*/` glob entirely (no merge). Each path is treated as an absolute path or `~`-prefixed home-relative path.

**Excluded by default:**
- The current repo (compare by `path.resolve()` against `process.cwd()`)
- Repos without `PROJECT.md` (silently skipped)
- Repos with `org` field mismatching (silently skipped)

### 6. Token-budget conscious

Section is **bounded**:
- Top 3 sibling-repo matches
- Top 3 eden-libs candidates
- Top 3 org-project overlaps

Each entry is **one line** (no paragraphs). Total section length: ~25 lines max including subsection headers. Fits in `<additional_context>` without bloating the planner prompt.

**Top-N selection algorithm (locked):**
- Sibling repos: rank by token-intersection score (current objective tokens ∩ sibling SUMMARY tokens), tie-break by SUMMARY recency (most recent first)
- eden-libs: rank by export-name match count (current objective `files_modified` extension/keyword ∩ eden-libs exported symbol names)
- org_project: rank by (a) chain-match to sibling repo `[Roadmap]` (boost +10), then (b) keyword overlap count

### 7. Misfiling detection — advisory only

When `resolveChain` for the current objective walks to a `[Roadmap]` issue in a **different primary repo than the current repo's PROJECT.md `github_repo`**, surface a one-line warning embedded in the org_project subsection:

```
_Misfiling check: this objective's resolved [Roadmap] is `aodex#33` but current repo is `devflow-claude`. **Possible misfile** — consider whether this objective belongs in `aodex` instead._
```

**Does NOT block planning.** Does NOT use AskUserQuestion. Does NOT pause for user response. Pure advisory text in CONTEXT.md.

When NO mismatch detected, render:
```
_Misfiling check: no mismatch detected._
```

When current repo's PROJECT.md lacks `github_repo` field, skip misfiling detection silently (no false-positive warnings on legacy projects).

### 8. Skip silently when offline / no auth

**Sibling + eden-libs scanners** — pure filesystem, NO auth dependency. ALWAYS run. If `~/Source/*/` is empty or eden-libs absent, return empty results + a one-line warning that does NOT bubble to error.

**Org-project scanner** — calls `requireGhAuth` via `scanOrg`. Graceful degradation:

```js
try {
  const orgResult = aw.scanOrg();
  // proceed to overlap analysis
} catch (e) {
  if (e && e.name === 'GhAuthError') {
    return {
      items: [],
      warnings: [`org-project section unavailable: ${e.message}. Run: ${e.remediation}`],
      skipped: true,
    };
  }
  throw e;
}
```

When skipped, the rendered org_project subsection becomes:
```
### Org Project overlap
_(skipped: gh auth not available — run `gh auth refresh -h github.com -s project,read:project,repo` to enable)_
```

**This is a HARD INVERSION of obj 1/obj 2's hard-fail-on-auth pattern.** Plan-time consultation must NOT block the entire planning workflow on missing gh auth (obj 3 is advisory; missing auth means missing one of three sources, not a planning failure). Documented in TRD 03-03's test list.

## Module surface (locked, per ROADMAP SC-9)

After all v1.1 obj 3 TRDs land, `lib/org-awareness.cjs` exports:

```js
module.exports = {
  // Pure logic (TDD'd):
  scanSiblings,                     // (opts) => { matches: [...], warnings, scanned_repos }
  scanLibs,                         // (opts) => { candidates: [...], warnings, scanned: bool }
  scanOrgOverlap,                   // (opts) => { items: [...], warnings, skipped: bool, misfiling: object|null }
  formatConsiderations,             // (scans) => string  (markdown section body, no leading `## ` header)

  // Test hooks:
  _setRunFs,                        // (fn) => void  // mirrors _setRunGh / _setRunGit
  _resetFsMock,                     // () => void

  // Constants:
  DEFAULT_SIBLING_GLOB,             // '~/Source/*/'
  DEFAULT_EDEN_LIBS_PATH,           // '~/Source/eden-libs'
  TOP_N,                            // 3
  SUMMARY_RECENCY_DAYS,             // 90
};
```

`lib/gh.cjs` and `lib/awareness.cjs` add **NO new exports** for obj 3 — obj 3 is purely a consumer.

The `_setRunFs` hook is for test injection of filesystem operations (readFileSync, readdirSync, statSync, existsSync). Production code calls `_runFs.readFileSync(...)` etc.; tests inject mocks.

## CLI surface (locked)

`df-tools org-awareness <subcommand>`:

- `df-tools org-awareness scan-siblings <objective_id> [--raw]` — runs `scanSiblings`, emits structured JSON
- `df-tools org-awareness scan-libs <objective_id> [--raw]` — runs `scanLibs`, emits structured JSON
- `df-tools org-awareness scan-org-overlap <objective_id> [--raw]` — runs `scanOrgOverlap` (skips gracefully on auth failure), emits structured JSON
- `df-tools org-awareness considerations <objective_id> [--raw]` — runs all three scans + `formatConsiderations`, emits Markdown section body (or raw JSON of all three scan results)

The new `df-tools org-awareness` subcommand router lives in `lib/org-awareness-cli.cjs` (mirror obj 2's `awareness-cli.cjs` pattern). Wired into `df-tools.cjs` via a single `case 'org-awareness':` arm in TRD 03-01.

The `/df:research-objective` skill (TRD 03-05) calls `df-tools org-awareness considerations <objective_id>` and writes the result into CONTEXT.md.

The `/df:plan-objective` skill (TRD 03-06) reads the `## Cross-Repo Considerations` section out of CONTEXT.md and includes it in the planner agent's `<additional_context>`.

## Sibling-repo objective tokenization (locked, per ROADMAP SC-1)

`scanSiblings(objective_id)` works as follows:

1. Read current objective's `OBJECTIVE.md` frontmatter — extract:
   - `title` (or fallback to objective_name)
   - `files_modified` (if present in any TRD frontmatter, union them)
   - Recent SUMMARY tokens (objective_id's existing SUMMARY.md content if any)
2. For each sibling repo from `discoverSiblings()`:
   - Read sibling's `PROJECT.md` to confirm `org` match
   - Walk `sibling/.planning/objectives/*/` for objectives modified in last `SUMMARY_RECENCY_DAYS` (90 days)
   - Per recent objective, read `STATE.md` (`parseStateMd`) + most recent SUMMARY.md
   - Extract tokens (title, summary content, status)
3. Compute token overlap scores (current ∩ sibling)
4. Return top 3 by score, tie-break by recency

**Token extraction (locked):**
- Lowercase
- Strip stop-words (a, an, the, of, for, in, on, with, to, from, by, at, is, are, was, were, be, been, being, have, has, had)
- Strip punctuation
- Split on whitespace + hyphen + underscore
- Filter tokens with length < 3
- Deduplicate

**Scoring formula:** `|current_tokens ∩ sibling_tokens| / max(|current_tokens|, |sibling_tokens|)` (Jaccard-like; bounded [0,1]).

## eden-libs scanner (locked, per ROADMAP SC-3)

`scanLibs(objective_id)` works as follows:

1. Resolve eden-libs path: `awareness.eden_libs_path` config OR `DEFAULT_EDEN_LIBS_PATH` (`~/Source/eden-libs`)
2. If path doesn't exist, return `{ candidates: [], warnings: ['eden-libs not found at <path>'], scanned: false }`
3. Read `package.json` (`main`, `exports` map) and `index.*` (top-level files like `index.cjs`, `index.js`, `index.ts`)
4. Extract exported symbol names (regex: `module.exports\.<name>`, `exports\.<name>`, `export (function|const|class) <name>`, `export\s*{\s*<name>...`)
5. Tokenize current objective (same algorithm as scanSiblings)
6. Score each export by: token-intersection between symbol-name tokens and objective tokens (camelCase split: `parseStateMd` → `parse`, `state`, `md`)
7. Return top 3 candidates with their tokens-matched count + symbol name + module path
8. If no exports detected (eden-libs is empty per spike findings), return `{ candidates: [], warnings: ['eden-libs has no exported surface'], scanned: true }`

## Org-overlap scanner (locked, per ROADMAP SC-5, SC-6)

`scanOrgOverlap(objective_id, frontmatter, projectCtx)`:

1. **Try-catch around `aw.scanOrg()`** — if `GhAuthError`, return `{ items: [], warnings, skipped: true, misfiling: null }` (locked decision #8).
2. For each item from `scanOrg`:
   - Boost +10 if any sub-issue ref's repo matches a sibling repo (chain-match)
   - Add +1 per shared keyword between item title/body tokens and current objective tokens
3. Return top 3 by score
4. **Misfiling check (locked decision #7):**
   - Call `gh.resolveChain(frontmatter, projectCtx)` to get the resolved `roadmap_issue`
   - Parse repo from resolved `roadmap_issue` ref (`owner/repo#NN`)
   - Compare to `projectCtx.github_repo` from current PROJECT.md
   - If mismatch AND `projectCtx.github_repo` is non-empty → set `misfiling: { current_repo, resolved_repo, message }`
   - Else → `misfiling: null`
   - Skip silently when current `github_repo` is absent

## File-region ownership for `lib/org-awareness.cjs`

`lib/org-awareness.cjs` is **created in TRD 03-01** and **EXTENDED across waves**. Each TRD owns a documented region; wave sequencing prevents merge conflicts. **No two TRDs touching `lib/org-awareness.cjs` run in the same wave** (per `feedback_planner_proto_conflict` memory).

Region ownership (locked):

| Region | Owner TRD | Wave |
|---|---|---|
| Module skeleton (header, requires, constants, `_setRunFs` hook) | 03-01 | 1 |
| `scanSiblings` + token extraction helpers | 03-01 | 1 |
| `scanLibs` + lexical match heuristic | 03-02 | 2 |
| `scanOrgOverlap` + misfiling detection | 03-03 | 3 |
| `formatConsiderations` markdown renderer | 03-04 | 4 |
| `module.exports` block (final lock) | 03-07 | 6 |

TRDs 03-01, 03-02, 03-03, 03-04 each end their wave with a partial `module.exports` containing ONLY the symbols they introduced. TRD 03-07 finalizes the export surface (asserts all 11 expected exports present via `Object.keys().sort()` deepStrictEqual).

## Wave structure (LOCKED)

Per `feedback_planner_proto_conflict` memory: planner under-encodes file-level co-modification. The orchestrator MUST sequence TRDs touching the same file even when `depends_on=[]` would suggest parallelism.

`lib/org-awareness.cjs` is touched by 5 TRDs (03-01, 03-02, 03-03, 03-04, 03-07). Two skill TRDs (03-05, 03-06) touch non-overlapping skill files and can run parallel.

| Wave | TRD | Files touched | Notes |
|---|---|---|---|
| 1 | 03-01 | org-awareness.cjs (skeleton + scanSiblings), org-awareness.test.cjs (NEW), awareness-fixtures.cjs (extend), df-tools.cjs (case 'org-awareness') | Foundation: scanSiblings + fixtures + CLI router |
| 2 | 03-02 | org-awareness.cjs (scanLibs region), org-awareness.test.cjs, awareness-fixtures.cjs (extend) | scanLibs; solo |
| 3 | 03-03 | org-awareness.cjs (scanOrgOverlap region), org-awareness.test.cjs, awareness-fixtures.cjs (extend) | scanOrgOverlap + misfiling; solo |
| 4 | 03-04 | org-awareness.cjs (formatConsiderations region), org-awareness.test.cjs | Markdown renderer; solo |
| 5 | 03-05 + 03-06 | skills/research-objective/SKILL.md, skills/plan-objective/SKILL.md (separate files; PARALLEL) | Skill integrations; non-overlapping |
| 6 | 03-07 | org-awareness.cjs (export lock), org-awareness.test.cjs (integration tests + dogfood capture) | Final integration |

**Why 6 waves?** Five TRDs touch `lib/org-awareness.cjs` and the two skill TRDs touch non-overlapping files (research-objective/SKILL.md vs plan-objective/SKILL.md), so they parallelize in Wave 5. Total objective execution time is dominated by the file-conflict serialization.

## TRD types (locked, not auto-derived)

Per the user's CLAUDE.md TDD Playbook directives: code-shipping work is TDD by default. Skill markdown is standard.

| TRD | Type | Reason |
|---|---|---|
| 03-01 — Sibling scanner + fixtures + CLI scaffold | `tdd` | Pure parser+scanner logic; testable with hand-built fs fixtures (`_setRunFs` injection). Fixture-builder task ahead of first behavior test. |
| 03-02 — eden-libs scanner | `tdd` | Pure logic; lexical match heuristic; tested against fixture eden-libs tree. |
| 03-03 — Org-overlap scanner + misfiling detection | `tdd` | Pure logic; reuses obj 2's `_setRunGh` for upstream mocking; auth-failure graceful-degradation test included. |
| 03-04 — formatConsiderations markdown renderer | `tdd` | Pure formatter; trivial fixture inputs → asserted markdown output. |
| 03-05 — research-objective skill integration | `standard` | SKILL.md prompt update; calls `df-tools org-awareness considerations` + appends to CONTEXT.md. Tested transitively via dogfood test in 03-07. |
| 03-06 — plan-objective skill integration | `standard` | SKILL.md prompt update; reads CONTEXT.md section + injects into planner `<additional_context>`. Tested transitively via dogfood. |
| 03-07 — Library export lock + dogfood test | `tdd` | Export surface integration test (deepStrictEqual on Object.keys); end-to-end dogfood against obj 4 (or current next-objective placeholder). |

## Anti-pattern constraints (honored across all TDD TRDs)

From the resolver's defaults table + project memory:

- `no_llm_test_data` — All test fixtures must be hand-built factory functions (`__fixtures__/awareness-fixtures.cjs` extensions) or recorded cassettes. NO AI-generated sample data.
- `no_property_based_default` — Suppress property-based testing recommendations. Tests use enumerated cases.
- `no_gherkin_layer` — No Gherkin/BDD syntax. Use descriptive test names directly.
- **No LLM-based scoring.** Lexical match heuristic per locked decision #2. NO embeddings, NO semantic similarity, NO LLM calls in scanners.
- **Multitenancy guard NOT applicable** — single-user CLI tool, single-org context (AO-Cyber-Systems).
- **Outside-in NOT applicable** — pure-logic scanners + skill-text edits; no UI/portal flows.

## TDD discipline for tdd-typed TRDs (apply to 03-01, 03-02, 03-03, 03-04, 03-07)

Per CLAUDE.md TDD Playbook:

- **Test list first**: include a `## Test list` section in TRD body listing behavior cases (happy + edge + failure) BEFORE any test code is written.
- **Fixture builders as their own task** ahead of the first behavior test. Hand-built factory functions in `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` (extending obj 2's file). NO `faker`, NO LLM-completed sample data.
- **Recorded gh cassettes for live-API tests** captured once and committed at `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/`. Live tests gated on `GH_INTEGRATION=1`.
- **Filesystem fixtures via tmp dirs**: `buildSiblingRepoTree()` and `buildEdenLibsTree()` factories in 03-01 build tmp directory trees; tests use them via `_setRunFs` injection or, for filesystem-integration tests gated on `FS_INTEGRATION=1`, via real fs reads.
- **One test at a time** RED → GREEN → REFACTOR. No batching.
- **Atomic commits per TDD TRD**: 2-3 commits (`test:` → `feat:` → optional `refactor:`).

## Discretion areas (planner / executor decides)

- Sub-task granularity within each TRD (within the 2-3 task budget).
- Specific token-extraction regex details (so long as the (lowercase + stop-word + length-≥3) contract holds).
- Whether to use a streaming readdir or sync readdir in `discoverSiblings` (sync is fine for `~/Source/*/` cardinality < 50).
- Test cassette format details (recommend: same shape as obj 1/obj 2's cassettes — `{ "data": { ... } }` GraphQL response envelope where applicable).
- Test runner organization: append to single `org-awareness.test.cjs` (mirror `awareness.test.cjs` style — single file per module).
- Whether to add `awareness.sibling_repos` and `awareness.eden_libs_path` config docs to `templates/config.json` (recommend: YES, in TRD 03-01 alongside the CLI scaffold).

## Out of scope for v1.1 (planner must NOT include)

- Hard-blocking enforcement of cross-repo overlap — advisory only.
- Auto-creating shared-service objectives in eden-libs — v1.2+.
- Semantic / LLM-based similarity scoring — keeps v1.1 deterministic.
- Cross-repo objective MOVES — separate hygiene work; v1.2 project-hygiene tooling.
- Real-time updates as sibling repos change — fits under plan-time-only locked decision.
- Cross-repo peer awareness in CONTEXT.md (teammate working in another repo right now) — that's obj 5/6 territory; obj 3 surveys recent SUMMARY.md content (90-day window), not active heartbeats.
- Caching the Cross-Repo Considerations section — regenerated on each `/df:research-objective` call (cheap; section is bounded).
- Updating CONTEXT.md from `/df:plan-objective` — only `/df:research-objective` writes to CONTEXT.md (per locked decision #3); `/df:plan-objective` reads only.
- Heartbeat integration — that's obj 4 territory.

## Goal-backward verification

Every TRD MUST include `must_haves` mapping to the 10 success criteria below (reproduced from ROADMAP §"Objective 3"). Each requirement ID (SC-1 through SC-10) MUST appear in at least one TRD's `requirements` frontmatter field.

1. **SC-1**: `df-tools org-awareness scan-siblings <objective_id>` walks each sibling repo's `.planning/objectives/` reading PROJECT.md frontmatter + each objective's STATE.md + recent SUMMARY.md (last 90 days). Returns top-3 keyword/file overlaps relative to the current objective's frontmatter. Hand-built fixtures; `_setRunFs` injection mirrors `_setRunGh`.
2. **SC-2**: Sibling discovery walks `~/Source/*/` by default; configurable via `awareness.sibling_repos`. Repos without PROJECT.md or with `org` field mismatching are silently skipped.
3. **SC-3**: `df-tools org-awareness scan-libs <objective_id>` scans `eden-libs/` (or configured path) for exported surfaces matching keywords from the current objective. Returns top-3 candidates. If absent, returns empty + warning (not in Considerations section).
4. **SC-4**: Match heuristic: lexical match on objective title + `files_modified` extensions vs eden-libs's `index.*` / `package.json` main / exported symbols. Hand-built; no LLM scoring.
5. **SC-5**: `df-tools org-awareness scan-org-overlap <objective_id>` calls `scanOrg` and surfaces top-3 Project items where (a) same `parent_issue` chain leads to a sibling repo's [Roadmap], OR (b) title contains ≥2 keywords from current objective.
6. **SC-6**: Misfiling detection per locked decision #7 — one-line warning when resolved `parent_issue` lives in a different primary repo than the current repo's PROJECT.md.
7. **SC-7**: `/df:research-objective` skill runs the three scans and writes a `## Cross-Repo Considerations` section to CONTEXT.md (appends if section exists). Format: 3 bulleted subsections (Sibling repos / eden-libs / Org Project), each ≤3 one-line entries.
8. **SC-8**: `/df:plan-objective` skill reads the Cross-Repo Considerations section from CONTEXT.md and includes it in the planner agent's `<additional_context>`. Planner biases TRDs accordingly (advisory).
9. **SC-9**: `lib/org-awareness.cjs` exports stable surface: `scanSiblings`, `scanLibs`, `scanOrgOverlap`, `formatConsiderations(scans)`, `_setRunFs`. Hand-built; unit-testable with fixture trees (no live fs/gh in unit suite). Cassettes for live tests gated on `GH_INTEGRATION=1`.
10. **SC-10**: End-to-end dogfood against obj 4: `/df:research-objective 4` generates a Cross-Repo Considerations section that includes at least the obj 2 awareness scanner reference. Captured to `__fixtures__/cross-repo-considerations-fixtures/dogfood-04.md`.

## GitHub tracking

- **Issue:** [devflow-claude#12](https://github.com/AO-Cyber-Systems/devflow-claude/issues/12) (sub-issue of #9)
- **Gates:** #13 (duplicate-work detection — consumes `scanSiblings` + `scanOrgOverlap`), #14 (initiative context layer — consumes `scanOrgOverlap`), #15 (unified df:check-todos — uses sibling scan for cross-repo todos)
- **Branch:** `feature/v1.1-obj-3-planning-awareness` off `feature/v1.1` (don't push to origin until objective complete)
