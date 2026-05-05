---
objective: 05-initiative-context-layer
title: Initiative context layer — disk projection of GitHub Epics for planner-time strategic context
created: 2026-05-04
status: locked
tracks: AO-Cyber-Systems/devflow-claude#14
parent_issue: AO-Cyber-Systems/devflow-claude#9
github_repo: AO-Cyber-Systems/devflow-claude
---

# Objective 5 — Locked Context

This file captures user decisions that are **LOCKED** for the planner. Do not re-litigate. Do not propose alternatives. Implement exactly.

## Goal

Project GitHub Epics (parent issues + linked org Project items) onto disk at `~/.claude/devflow/initiatives/<slug>.md` so the planner can read **strategic context** at plan time without live `gh` queries. Each initiative file carries Why / Open questions / Key repos / Linked sub-issues. The planner consults matching initiatives by `key_repos` membership when generating TRDs. `df:initiatives sync` command refreshes the on-disk projection from live GitHub state.

Two reading modes:

1. **Plan-time (always file-only).** `/df:plan-objective` and `/df:research-objective` read `~/.claude/devflow/initiatives/*.md` synchronously, filter by `key_repos` matching the current `PROJECT.md::github_repo`, format for the planner prompt. **Never blocks on `gh`** — files are the cache.
2. **Sync-time (writer only).** `df:initiatives sync` is the SINGLE writer; calls `gh` via obj 1's `requireGhAuth` + obj 2's `walkProject` + obj 1's `resolveChain`; hard-fails on missing/expired auth.

## What's already built (obj 1 + obj 2 + obj 3 surface that obj 5 consumes)

Obj 5 is a **read-only consumer** of obj 1's GH primitives + obj 2's org walker. **DO NOT recreate any of these.**

### From `lib/gh.cjs` (obj 1 ship — feature/v1.1, merged via PR #21):

- `resolveChain(frontmatter, projectCtx)` — walks ONE objective's chain (parent_issue → roadmap → org_project). Used by `syncInitiatives` to resolve each initiative's parent Epic + Project linkage.
- `requireGhAuth(requiredScopes)` — hard-fail auth check throwing `GhAuthError`. Obj 5's `syncInitiatives` calls this as first action with scopes `['project', 'read:project', 'repo']`. Obj 5's READ path NEVER calls this.
- `walkProject(projectId)` — Project v2 walker; returns `{ items, warnings }`. **Obj 5's primary input for `syncInitiatives`.** Reused as-is; no new GraphQL.
- `PRODUCT_ROADMAP_FIELDS` — exported constant carrying `_project_id` (org Product Roadmap project node ID, captured live in obj 1 TRD 01-06). Obj 5 reads `PRODUCT_ROADMAP_FIELDS._project_id` as the default `--project-id` when not supplied.
- `GhAuthError` class — caught by `cmdInitiativesSync` to emit structured JSON error + exit(1) per obj 1 hard-fail pattern.
- `_setRunGh(fn)` — test injection hook. Reused by obj 5 tests via the `_setRunGh` re-export pattern (same as obj 2 TRD 02-03 + obj 3 TRD 03-03).

### From `lib/awareness.cjs` (obj 2 ship — merged via PR #23):

- `scanOrg(opts)` — orchestrates `requireGhAuth` + `walkProject` + task-list fallback. **Obj 5's `syncInitiatives` may call `scanOrg` for the same reason** (uniform code path for project walking with body-fallback) OR call `walkProject` directly when initiative qualification doesn't need task-list fallback. Discretion to executor — recommend `walkProject` direct because initiatives qualify on `trackedIssues > 0` OR `type:epic` label (not on body parsing).
- `parseStateMd(content)` — STATE.md parser. Obj 5 does NOT use STATE.md; this is irrelevant.

### From `__fixtures__/awareness-fixtures.cjs`:

- `buildOrgItem({ issue_ref, title, body, product, quarter, status, sub_issues })` — builds a single `walkProject.items[]` entry. **Obj 5 reuses for sync tests** (mock `walkProject` return).
- `buildSubIssue({ ref, title, state })` — for sub_issues array entries.
- `buildOrgScanResult({ items, project_id, fetched_at, warnings })` — wraps items for `walkProject` mock returns.

Obj 5 ADDS to `awareness-fixtures.cjs` — does NOT duplicate. New builders introduced in obj 5 (planned in 05-01):

- `buildInitiativeFile({ slug, github_issue, parent_project, key_repos, why, open_questions, sub_issues, status, updated_at })` — builds the projected file content (frontmatter + body sections) for both reader fixtures (load tests) and writer assertions.
- `buildInitiativeYaml({ slug, github_issue, parent_project, key_repos, updated_at })` — builds just the frontmatter portion (used for round-trip parse tests).
- `buildInitiativesHomeTree({ tmpdir, files })` — writes a fixture initiative-projection home dir with multiple `<slug>.md` files. Returns `{ home, slugs }`.

### From `lib/org-awareness.cjs` (obj 3 ship):

- **NOT consumed.** Obj 3 is plan-time advisory; obj 5 is plan-time strategic. Different concerns, different surfaces.

## Locked decisions (from ROADMAP §"Objective 5: Initiative context layer")

### 1. Disk projection at `~/.claude/devflow/initiatives/<slug>.md` (global)

NOT per-repo. NOT under `.planning/`. Single global location readable by every devflow session across worktrees.

The path resolves via `os.homedir() + '/.claude/devflow/initiatives'`:

```js
const path = require('path');
const os = require('os');
const INITIATIVES_HOME_REL = path.join('.claude', 'devflow', 'initiatives');
function defaultInitiativesHome() {
  return path.join(os.homedir(), INITIATIVES_HOME_REL);
}
```

Tests inject `home` parameter to point at a tmpdir; production code defaults to `defaultInitiativesHome()`.

### 2. Schema (locked)

Each initiative file: YAML frontmatter + body sections.

```markdown
---
slug: devflow-internal-alpha
github_issue: AO-Cyber-Systems/devflow#30
parent_project: AO-Cyber-Systems/PVT_kwDODwqLrc4BRsOP   # org Product Roadmap project node id
key_repos:
  - AO-Cyber-Systems/devflow
  - AO-Cyber-Systems/devflow-claude
updated_at: 2026-05-05T18:30:00Z
---

# DevFlow Internal Alpha

## Why

(prose paragraph from issue body, truncated to ~1500 chars)

## Open Questions

- (bullet items extracted from issue body section "Open Questions" if present)
- (otherwise empty)

## Linked Sub-issues

- AO-Cyber-Systems/devflow-claude#9 — DevFlow Coordination Layer (OPEN)
- AO-Cyber-Systems/aodex#33 — Go Backend Migration (OPEN)
- AO-Cyber-Systems/aosentry#20 — Commercial Launch (OPEN)

## Status

- **GitHub:** OPEN
- **Project status:** In Progress
- **Quarter:** Q2 2026
- **Updated:** 2026-05-05T18:30:00Z
```

**Frontmatter field order is locked** (slug, github_issue, parent_project, key_repos, updated_at). YAML parser handles arbitrary order; tests assert presence + values, not insertion order.

**Body section order is locked** (Why, Open Questions, Linked Sub-issues, Status).

**File naming:** `<slug>.md` where `slug` is derived from initiative title via lowercased hyphen-joined ASCII-safe form (e.g., "DevFlow Internal Alpha" → `devflow-internal-alpha`). Slug derivation lives in `_slugifyInitiativeTitle` (TRD 05-02).

### 3. Read-only consumer at plan time

`/df:plan-objective` and `/df:research-objective` read initiative files synchronously. They do NOT call `gh`. They do NOT call `syncInitiatives`.

The reader's job:

1. `loadInitiatives({ home })` — list `.md` files in `home`, parse frontmatter, return `[{ slug, github_issue, parent_project, key_repos, updated_at, body }, ...]`. Files with malformed frontmatter are silently skipped + logged to stderr (warning, not error).
2. `matchByRepo(initiatives, github_repo)` — filter to initiatives where `github_repo ∈ key_repos`. Returns matching subset. Empty array when no matches (no error).
3. `formatInitiativeForPlanner(initiative)` — render the matching initiative for the planner's `<additional_context>` block. Pure formatter — no I/O. Token-bounded per locked decision #8.

Plan-time reader runs even when `~/.claude/devflow/initiatives/` doesn't exist (returns empty array silently). Plan-time NEVER blocks on missing home dir.

### 4. `df:initiatives sync` is the SOLE writer

The only path that writes to `~/.claude/devflow/initiatives/`. Plan-time, execute-time, every other devflow command — read-only.

`syncInitiatives(opts)`:

1. `requireGhAuth(['project', 'read:project', 'repo'])` — hard-fail.
2. `walkProject(opts.project_id || PRODUCT_ROADMAP_FIELDS._project_id)` — get all items.
3. **Initiative qualification** (locked decision #5 below): keep items that qualify; drop the rest.
4. For each qualifying item: derive slug, build file content, atomic-write to `home/<slug>.md`.
5. **Stale deletion** (locked decision #7 below): scan `home/*.md`; for files not corresponding to a qualifying item AND whose source issue is closed, delete (with confirmation unless `--force`).
6. Return `{ written: [...], deleted: [...], skipped: [...], warnings: [...] }`.

Optional `--initiative <slug>` syncs ONE initiative only (filters `walkProject.items` by `_slugifyInitiativeTitle(item.title) === slug`). Stale deletion does NOT run in single-initiative mode.

### 5. Initiative qualification (locked)

A `walkProject.items[]` entry qualifies as an "initiative" when ANY of:

- `item.sub_issues.length > 0` (has tracked sub-issues), OR
- `item.title` (or item-level labels — see locked decision #5b) contains the `type:epic` marker, OR
- `item.status === 'In Progress'` AND `item.item_type === 'draft'` (drafts that are actively being worked on)

#### 5b. Label fetching (TRD 05-02 discretion)

`walkProject` does NOT currently fetch issue labels (the GraphQL query in obj 2 TRD 02-03 omits them). Two paths:

1. **Recommended (no GraphQL change):** detect `type:epic` from item title prefix `[Epic]` (matches existing `[Roadmap]` convention) OR from `item.body` containing `**Type:** epic` line. `_qualifiesAsInitiative` is a pure helper — no extra `gh` calls.
2. **Fallback:** add a lightweight `gh issue view <ref> --json labels` per candidate item only when title/body don't surface the marker. Reserved for v1.2 if dogfood reveals false negatives.

Per CONTEXT.md decision: **start with path 1**. Path 2 is deferred unless the dogfood test (SC-9) shows a real Epic that gets dropped.

### 6. Hard-fail on missing/expired gh auth (sync only)

- `syncInitiatives` first action: `requireGhAuth(['project', 'read:project', 'repo'])`. On `GhAuthError` → `cmdInitiativesSync` emits structured JSON to stderr + exit(1) with remediation command (mirror obj 1 TRD 01-03 pattern + obj 2 TRD 02-03).
- `loadInitiatives` / `matchByRepo` / `formatInitiativeForPlanner` / `cmdInitiativesList` / `cmdInitiativesShow` — **NEVER call gh**. Always succeed (return empty / silent skip on missing dir).

This is the locked split: writer hard-fails, reader silently degrades.

### 7. Idempotent + atomic writes; stale deletion with confirmation

Atomic writes via `fs.writeFileSync(tmp, ...)` + `fs.renameSync(tmp, dest)` (POSIX rename is atomic). Tmp file lives in same directory as dest (mandatory for cross-filesystem rename portability):

```js
const tmpPath = path.join(home, `.${slug}.md.tmp.${process.pid}`);
fs.writeFileSync(tmpPath, content, 'utf-8');
fs.renameSync(tmpPath, path.join(home, `${slug}.md`));
```

**Idempotency contract:** running `syncInitiatives` twice produces the same disk content (modulo the `updated_at` timestamp). Test asserts byte-equal content after stripping `updated_at:` line.

**Stale deletion** (locked decision #7 from ROADMAP):

- Scan `home/*.md`.
- For each file: parse frontmatter, extract `github_issue` ref.
- Re-fetch state via `gh issue view <ref> --json state,closed`.
- If `state === 'CLOSED'` AND the item didn't appear in the fresh `walkProject.items[]` (i.e., the Epic was both closed and removed from the Project): file is stale.
- **Without `--force`:** prompt per stale file via stdin readline (`Delete <slug>.md? [y/N] `). On non-TTY (`!process.stdin.isTTY`): skip with warning, do NOT delete.
- **With `--force`:** delete unconditionally, log to result.

Deletion uses `fs.unlinkSync` (no atomic-rename needed for delete). Locked decision: `unlinkSync` is sufficient — re-running sync regenerates if user changes their mind.

### 8. Token-bounded body (locked)

Each initiative file capped at ~4 KB on disk. The truncation budget:

- Frontmatter: ~250 chars typical, no truncation.
- `## Why` section: TRUNCATED to `MAX_WHY_CHARS = 1500` chars (preserves first paragraph + start of second; appends "…" if truncated).
- `## Open Questions`: TRUNCATED to `MAX_QUESTIONS_BULLETS = 7` bullets max.
- `## Linked Sub-issues`: TRUNCATED to `MAX_SUBISSUES_LINES = 15` lines (one line per sub-issue).
- `## Status`: ~150 chars typical, no truncation.

`formatInitiativeForPlanner(initiative)` further compresses for the planner prompt (locked threshold ≤ 1500 chars per initiative; multi-initiative composition ≤ 6 KB):

- Drops `## Status` section entirely.
- Truncates Why to first paragraph (~500 chars max).
- Lists at most 5 sub-issues.

Token-budget test (SC-10) asserts `formatInitiativeForPlanner` output ≤ 1500 chars per initiative regardless of input size; multi-initiative compositions assert ≤ 6 KB.

## Module surface (locked, per ROADMAP SC-8)

After all v1.1 obj 5 TRDs land, `lib/initiatives.cjs` exports:

```js
module.exports = {
  // Pure logic (TDD'd):
  loadInitiatives,                  // ({ home }) => [{ slug, github_issue, parent_project, key_repos, updated_at, body, why, open_questions, sub_issues, status }]
  matchByRepo,                      // (initiatives, github_repo) => filtered subset
  formatInitiativeForPlanner,       // (initiative, opts?) => string  (token-bounded markdown)

  // Writer (TDD'd):
  syncInitiatives,                  // (opts) => { written, deleted, skipped, warnings }
  _writeInitiativeFile,             // (home, initiative) => void  (atomic tmp + rename)
  _qualifiesAsInitiative,           // (item) => bool  (locked decision #5)
  _slugifyInitiativeTitle,          // (title) => string  (lowercase, hyphenated, ASCII-safe)
  _truncateWhy,                     // (text, max?) => string  (token-budget enforcer)
  _parseInitiativeFile,             // (content) => { frontmatter, body, why, open_questions, sub_issues, status } | null
  _renderInitiativeMarkdown,        // (data) => string  (frontmatter + body sections, locked order)

  // Stale deletion (TRD 05-03):
  _detectStaleInitiatives,          // ({ home, fresh_items }) => [{ slug, github_issue, reason }]
  _deleteStaleFile,                 // (home, slug, opts) => { deleted: bool, reason: string }
  _confirmDeleteStale,              // (slug) => bool  (TTY-gated readline; non-TTY returns false)

  // CLI handlers (TRD 05-04):
  cmdInitiativesSync,               // (cwd, args) => writes home dir
  cmdInitiativesList,               // (cwd, args) => prints slugs
  cmdInitiativesShow,               // (cwd, args, slug) => prints file body

  // Test hooks:
  _setRunGh,                        // (fn) => void  // mocks gh.runGh transitively (re-exported from gh.cjs)
  _setRunFs,                        // (fn) => void  // mocks fs reads/writes
  _setRunReadline,                  // (fn) => void  // mocks readline.question for confirmDeleteStale
  _resetMocks,                      // () => void

  // Constants:
  INITIATIVES_HOME_REL,             // '.claude/devflow/initiatives'
  MAX_WHY_CHARS,                    // 1500
  MAX_QUESTIONS_BULLETS,            // 7
  MAX_SUBISSUES_LINES,              // 15
  MAX_FORMATTED_PLANNER_CHARS,      // 1500
  defaultInitiativesHome,           // () => string  (module-level helper, exported for tests)
};
```

`lib/gh.cjs`, `lib/awareness.cjs` add **NO new exports** for obj 5 — obj 5 is purely a consumer.

## CLI surface (locked)

`df-tools initiatives <subcommand>`:

- `df-tools initiatives sync [--initiative <slug>] [--project-id <id>] [--force] [--raw]` — calls `requireGhAuth`, walks project, qualifies items, writes/deletes files. Hard-fail on auth.
- `df-tools initiatives list [--home <path>] [--raw]` — read-only enumeration; lists slug + github_issue + key_repos.
- `df-tools initiatives show <slug> [--home <path>] [--raw]` — read-only detail; prints file body to stdout.

Router: new `lib/initiatives-cli.cjs` (mirror `dup-detect-cli.cjs` structure) wired into `df-tools.cjs` via a new `case 'initiatives':` arm. The router is added in TRD 05-01 (with `sync` subcommand routing to a stub for 05-02; `list` and `show` wired in 05-01).

## File-region ownership for `lib/initiatives.cjs`

`lib/initiatives.cjs` is **created in TRD 05-01** and **EXTENDED across waves**. Each TRD owns a documented region; wave sequencing prevents merge conflicts. **No two TRDs touching `lib/initiatives.cjs` run in the same wave** (per `feedback_planner_proto_conflict` memory).

Region ownership (locked):

| Region | Owner TRD | Wave |
|---|---|---|
| Module skeleton (header, requires, constants, fs/gh injection hooks, `loadInitiatives`, `matchByRepo`, `formatInitiativeForPlanner`, `_parseInitiativeFile`, `_truncateWhy`, `cmdInitiativesList`, `cmdInitiativesShow`) | 05-01 | 1 |
| `syncInitiatives`, `_writeInitiativeFile`, `_qualifiesAsInitiative`, `_slugifyInitiativeTitle`, `_renderInitiativeMarkdown`, `cmdInitiativesSync` (no stale-deletion branch yet) | 05-02 | 2 |
| `_detectStaleInitiatives`, `_deleteStaleFile`, `_confirmDeleteStale`, `--force` flag wiring in `cmdInitiativesSync`, `_setRunReadline` injection hook | 05-03 | 3 |
| `module.exports` block (final lock at 22-entry surface) | 05-05 | 5 |

Wave 4 (TRD 05-04) does NOT touch `lib/initiatives.cjs` — it only edits skill markdown files (`/devflow:initiatives` SKILL.md + `/df:plan-objective` workflow integration).

TRDs 05-01, 05-02, 05-03 each end their wave with a partial `module.exports` containing ONLY the symbols they introduced (mirror obj 4 pattern). TRD 05-05 finalizes the export surface (asserts all 22 expected exports present via `Object.keys().sort()` deepStrictEqual).

## Wave structure (LOCKED)

Per `feedback_planner_proto_conflict` memory: planner under-encodes file-level co-modification. The orchestrator MUST sequence TRDs touching the same file even when `depends_on=[]` would suggest parallelism.

`lib/initiatives.cjs` is touched by 4 TRDs (05-01, 05-02, 05-03, 05-05). The skill TRD (05-04) touches non-overlapping markdown files. Wave structure:

| Wave | TRD | Files touched | Notes |
|---|---|---|---|
| 1 | 05-01 | initiatives.cjs (skeleton + reader + planner formatter + list/show CLI), initiatives.test.cjs (NEW), initiatives-cli.cjs (NEW), awareness-fixtures.cjs (extend), df-tools.cjs (case 'initiatives' arm) | Foundation: reader + token-budget primitives + CLI router |
| 2 | 05-02 | initiatives.cjs (sync + writer region), initiatives.test.cjs, initiatives-cli.cjs (sync subcommand) | Writer: walkProject orchestration + atomic writes; solo |
| 3 | 05-03 | initiatives.cjs (stale-deletion region), initiatives.test.cjs, initiatives-cli.cjs (--force flag) | Stale-file deletion + TTY confirmation; solo |
| 4 | 05-04 | skills/initiatives/SKILL.md (NEW), workflows/plan-objective.md (extend Step 8), agents/planner.md (extend additional_context) | Skill + plan-time integration; non-overlapping markdown |
| 5 | 05-05 | initiatives.cjs (export lock), initiatives.test.cjs (export-lock + integration tests + token-budget test) | Final integration; tests SC-9 + SC-10 |

**Why 5 waves?** Four TRDs touch `lib/initiatives.cjs`; the skill TRD touches non-overlapping markdown. Total objective execution time is dominated by the file-conflict serialization.

## TRD types (locked, not auto-derived)

Per the user's CLAUDE.md TDD Playbook directives: code-shipping work is TDD by default. Skill workflow markdown is standard.

| TRD | Type | Reason |
|---|---|---|
| 05-01 — Reader + planner formatter + fixtures + CLI scaffold | `tdd` | Pure parsing + filtering + formatting logic; testable with hand-built initiative-file fixtures (`buildInitiativeFile` + `buildInitiativesHomeTree`). Fixture-builder task ahead of first behavior test. |
| 05-02 — Writer + sync orchestration + atomic write | `tdd` | Pure logic + atomic-write to tmpdir; tested with mocked `walkProject` returns + tmpdir-based home. Idempotency contract + writer-side qualification. |
| 05-03 — Stale-deletion + --force + confirmation prompt | `tdd` | Pure logic + tmpdir for delete + readline mock for confirmation; tested with `--force` happy path + non-TTY skip + interactive y/N. |
| 05-04 — `/devflow:initiatives` skill + plan-objective integration | `standard` | Skill markdown + workflow markdown edits; calls `df-tools initiatives list/show` + injects formatted-initiatives into planner prompt's `<additional_context>`. Tested transitively via 05-05 integration test. |
| 05-05 — Library export lock + GH_INTEGRATION round-trip + token-budget enforcement | `tdd` | Export surface integration test (deepStrictEqual on Object.keys); GH_INTEGRATION-gated round-trip against live org Product Roadmap; deterministic token-budget assertion (SC-10). |

## Anti-pattern constraints (honored across all TDD TRDs)

From the resolver's defaults table + project memory + `<tdd_playbook_directives>` from the orchestrator briefing:

- `no_llm_test_data` — All test fixtures must be hand-built factory functions (`__fixtures__/awareness-fixtures.cjs` extensions) or recorded cassettes. NO AI-generated sample data.
- `no_property_based_default` — Suppress property-based testing recommendations. Tests use enumerated cases.
- `no_gherkin_layer` — No Gherkin/BDD syntax. Use descriptive test names directly.
- **No LLM-based scoring.** Initiative qualification is lexical (label/title/sub-issue presence). NO embeddings.
- **Multitenancy guard NOT applicable** — single-user CLI tool, single-org context (AO-Cyber-Systems). No tenant-isolation assertions required.
- **Outside-in NOT applicable** — pure-logic reader/writer + skill-workflow edits; no UI/portal flows.

## TDD discipline for tdd-typed TRDs (apply to 05-01, 05-02, 05-03, 05-05)

Per CLAUDE.md TDD Playbook + orchestrator's `<tdd_playbook_directives>`:

- **Test list first**: include a `## Test list` section in TRD body listing behavior cases (happy + edge + failure) BEFORE any test code is written.
- **Fixture builders as their own task** ahead of the first behavior test. Hand-built factory functions in `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` (extending obj 2+3+4's file). NO `faker`, NO LLM-completed sample data.
- **Filesystem fixtures via tmp dirs**: TRD 05-01 needs tmpdir for `loadInitiatives` home-dir tests; TRD 05-02 needs tmpdir for atomic-write contract; TRD 05-03 needs tmpdir for delete tests + non-TTY assertion; TRD 05-05 needs full repo-shaped tmpdir for end-to-end paths.
- **One test at a time** RED → GREEN → REFACTOR. No batching.
- **Atomic commits per TDD TRD**: 2-3 commits (`test:` → `feat:` → optional `refactor:`).

## Discretion areas (planner / executor decides)

- Sub-task granularity within each TRD (within the 2-3 task budget).
- Specific helper organization within each region (so long as the public surface holds).
- Whether `_parseInitiativeFile` reuses obj 1's `extractFrontmatter` or implements its own minimal parser (recommend: reuse `extractFrontmatter` from `lib/frontmatter.cjs` — already proven in obj 1 + obj 3).
- Whether `_qualifiesAsInitiative` short-circuits on first true condition or evaluates all (recommend: short-circuit; trivial perf).
- Test runner organization: append to single `initiatives.test.cjs` (mirror obj 2/3/4 pattern — single file per module).
- Whether `--force` also bypasses missing-frontmatter file deletion (recommend: NO; --force only bypasses the y/N prompt for files that have a parsed `github_issue` and a confirmed-CLOSED state).
- Slug derivation for unicode titles (recommend: ASCII-safe via simple `.normalize('NFKD').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '')`).

## Out of scope for v1.1 (planner must NOT include)

- Bidirectional sync (initiative file edits flow back to GitHub) — v1.2+.
- Initiative templates / scaffolding for new Epics — separate work.
- Initiative dependency graph rendering — obj 8 (TUI) territory.
- Auto-creation of initiatives from local objectives — manual-only in v1.1.
- A separate `df-tools initiatives create` subcommand — out of scope.
- Watching the home dir for changes (no inotify, no polling).
- Caching the planner-formatted output (it's already small + deterministic).
- Support for non-AOCyber orgs — `key_repos` matching is single-org per obj 2 decision #6.
- Per-user customization of token budgets — constants are locked at module level.
- Migration path for stale obj 4 `feature/v1.1-obj-4-dup-detect` test cassettes — irrelevant, obj 5 captures its own.

## Goal-backward verification

Every TRD MUST include `must_haves` mapping to the 10 success criteria below (reproduced from ROADMAP §"Objective 5"). Each requirement ID (SC-1 through SC-10) MUST appear in at least one TRD's `requirements` frontmatter field.

1. **SC-1**: `df-tools initiatives sync [--initiative <slug>]` walks org Product Roadmap project, identifies items that qualify as "Initiatives" (have ≥1 sub-issue OR are tagged with `type:epic` label OR are draft Project items in `Status: In Progress`), and writes one file per initiative to `~/.claude/devflow/initiatives/<slug>.md`. Optional `--initiative <slug>` syncs single initiative.
2. **SC-2**: Initiative files have locked YAML frontmatter (slug, github_issue, parent_project, key_repos[], updated_at) + body (## Why / ## Open Questions / ## Linked Sub-issues / ## Status).
3. **SC-3**: Sync is idempotent: running twice produces no diff in second run except `updated_at`. Atomic write via tmp + rename.
4. **SC-4**: `lib/initiatives.cjs` exports `loadInitiatives({ home })`, `matchByRepo(initiatives, github_repo)`, `formatInitiativeForPlanner(initiative)`. Pure logic; no fs writes from reader.
5. **SC-5**: `/df:plan-objective` workflow loads initiatives at entry, filters to those whose `key_repos` includes current `PROJECT.md::github_repo`, includes formatted body in planner agent's `<additional_context>` block. Advisory — planner can override.
6. **SC-6**: `/devflow:initiatives` skill + `df-tools initiatives <subcommand>` CLI. Subcommands: `sync` (writer), `list` (read-only enumeration), `show <slug>` (read-only detail). Hard-fails sync on missing gh auth via `requireGhAuth`; never fails list/show.
7. **SC-7**: Sync deletes initiative files when source GitHub issue is closed; with `--force` flag. Without `--force`, prompts for confirmation per stale file (or skips with warning if non-interactive).
8. **SC-8**: `lib/initiatives.cjs` exports stable surface: `syncInitiatives`, `loadInitiatives`, `matchByRepo`, `formatInitiativeForPlanner`, `_writeInitiativeFile`, `_setRunGh`. Hand-built fixtures; injection mirrors obj 1+2+3+4 patterns.
9. **SC-9**: Round-trip test gated on `GH_INTEGRATION=1`: sync against live org Product Roadmap → assert ≥1 initiative file written → load + match → format. Skipped cleanly when env unset.
10. **SC-10**: Token-budget test: `formatInitiativeForPlanner(initiative)` output ≤ 1500 chars per initiative. Multi-initiative composition stays under 6 KB.

## GitHub tracking

- **Issue:** [devflow-claude#14](https://github.com/AO-Cyber-Systems/devflow-claude/issues/14) (sub-issue of #9)
- **Gates:** #15 (unified df:check-todos — shows initiative open questions in urgency lane), #17 (TUI renders initiative tree)
- **Branch:** `feature/v1.1-obj-5-initiatives` off `main` (matches orchestrator briefing; do not push to origin until objective complete)
