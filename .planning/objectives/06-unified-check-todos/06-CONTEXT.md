---
objective: 06-unified-check-todos
title: Unified df:check-todos — morning standup view across local todos + GH issues + peer sessions + initiative open questions + dup-detect log
created: 2026-05-04
status: locked
tracks: AO-Cyber-Systems/devflow-claude#15
parent_issue: AO-Cyber-Systems/devflow-claude#9
github_repo: AO-Cyber-Systems/devflow-claude
---

# Objective 6 — Locked Context

This file captures user decisions that are **LOCKED** for the planner. Do not re-litigate. Do not propose alternatives. Implement exactly.

## Goal

Aggregate five sources of pending work into a single morning-standup view grouped by **urgency lane**, not source:

1. Local todos (current repo `.planning/todos/pending/*.md`)
2. GitHub issues — assigned to `@me`, mentions `@me`, review-requested `@me` — across primary repos
3. Active peer sessions (obj 2 `awareness scan-peer`)
4. Initiative open questions (obj 5 `initiatives list` + parse `## Open Questions` sections)
5. Dup-detect resolution log (obj 4 `.planning/.dup-detect-log.jsonl`)

Output is terminal-rendered Markdown with emoji urgency markers + per-entry source attribution. The "what should I work on right now?" answer.

Two reading modes:

1. **Cached read (default).** `.planning/.check-todos-cache.json` (gitignored), 10-min TTL per source namespace. Lazy populate on first invocation; serve from cache on subsequent invocations until TTL expires.
2. **Force-refresh.** `--refresh` flag forces re-fetch of all sources. (Per-source `--refresh <name>` is OUT OF SCOPE for v1.1 — single-flag bulk refresh only; mirrors obj 2 simpler subset.)

## What's already built (obj 1 + obj 2 + obj 4 + obj 5 surface that obj 6 consumes)

Obj 6 is a **read-only aggregator** of obj 2's peer scanner + obj 4's dup-detect log + obj 5's initiative reader + `gh` (via obj 1's `requireGhAuth`/`_setRunGh` primitives) + the existing `cmdListTodos` from `lib/misc.cjs`. **DO NOT recreate any of these.**

### From `lib/gh.cjs` (obj 1):

- `requireGhAuth(scopes)` — hard-fail auth; throws `GhAuthError`. Used by `_fetchGhIssues` ONLY (sync-mode hard-fail). Read-only display path (cache hit) does NOT call this.
- `GhAuthError` — caught by aggregator; surfaces as `warnings[]` entry + skips the gh source. Other 4 sources continue.
- `_setRunGh(fn)` — test injection hook; mocks all `gh` invocations transitively. Re-exported by `lib/check-todos.cjs` for SC-8 surface lock.

### From `lib/awareness.cjs` (obj 2):

- `scanPeer(opts)` — used by `_fetchPeerSessions`. Returns `{ branches: [...], fetched_at }`. Each branch carries `objective`, `trd`, `branch`, `last_commit`, `github_issue`.
- `readCache(cwd)` / `writeCache(cwd, sections)` / `isStale(fetched_at, ttl_minutes)` — **REFERENCE PATTERN, NOT REUSED.** Obj 6 has its OWN cache file (`.check-todos-cache.json`) with five namespaces, not two. Mirror the obj 2 patterns (merge semantics, future-timestamp tolerance, zero-TTL = always stale, missing/malformed = null) but in a separate cache file.
- `DEFAULT_TTL_MINUTES` constant (10) — value reused, but obj 6 has its own constant `CHECK_TODOS_TTL_MINUTES = 10` for clarity.

### From `lib/dup-detect.cjs` (obj 4):

- `DUP_DETECT_LOG_REL` constant — `'.planning/.dup-detect-log.jsonl'`. Used by `_fetchDupDetectLog` to locate the file.
- Log schema (locked per obj 4): `{ timestamp, objective_id, mode, blocking, top_match: {strength, peer, score} | null, resolution }`. Obj 6 reads JSONL line-by-line, surfaces UNRESOLVED entries (resolution === 'coordinate' or 'proceed-anyway' OR mode === 'execute' AND blocking === true) into the Blocked-on-you lane.

### From `lib/initiatives.cjs` (obj 5):

- `loadInitiatives({ home })` — reads `~/.claude/devflow/initiatives/*.md`. Used by `_fetchInitiativeQuestions` to enumerate initiative files.
- `matchByRepo(initiatives, github_repo)` — filters to those whose `key_repos` includes the current repo. Obj 6 applies this filter so only-relevant initiatives surface their open questions.
- Initiative.open_questions array — already extracted by `_parseInitiativeFile`. Obj 6 just iterates.

### From `lib/misc.cjs`:

- `cmdListTodos(cwd, area, raw)` — existing handler that walks `.planning/todos/pending/*.md`. **Obj 6's `_fetchLocalTodos` extracts the file-walking logic into a reusable helper** (refactor target — not a new code path, just exposing the data shape that `cmdListTodos` already produces). Recommend: `_fetchLocalTodos(cwd, opts)` returns `[{ file, created, title, area, path }, ...]` matching the `todos` array shape `cmdListTodos` already builds.

### From `__fixtures__/awareness-fixtures.cjs`:

- `buildPeerScanResult({ branches })` — builds a `scanPeer` mock return. **Reused by `_fetchPeerSessions` tests.**
- `buildPeerBranch({ ... })` — single peer-branch entry builder. **Reused.**
- `buildInitiativesHomeTree({ tmpdir, files })` — writes a fixture initiative-projection home dir. **Reused.**
- `buildInitiativeFile({ ... })` — single initiative file builder. **Reused.**

Obj 6 ADDS one new builder: `buildCheckTodosFixtures({ ... })` — a one-stop fixture composer that assembles all 5 sources into a single `{ projectRoot, mockGh, mockFs, cleanup }` bundle. Mirror `buildDupDetectFixtures` (obj 4) pattern.

## Locked decisions (from ROADMAP §"Objective 6: Unified df:check-todos")

### 1. Aggregator pattern (locked decision #1)

`lib/check-todos.cjs::aggregate({ projectRoot, refresh })` is a read-only aggregator. It does NOT mutate any source:

- Does NOT modify `.planning/todos/pending/` files.
- Does NOT post `gh issue comment` or modify any GH issue.
- Does NOT update peer-session state.
- Does NOT delete or annotate dup-detect log entries.
- Does NOT modify initiative files.

The ONLY filesystem write is `.planning/.check-todos-cache.json` (and creating `.planning/` if absent, mirroring obj 2's lazy-mkdir pattern).

### 2. Four urgency lanes (locked decision #2)

| Emoji | Lane | Sources |
|---|---|---|
| 🔥 | **Blocked-on-you** | Active peer sessions where current dev is named blocker (peer.state === 'blocked_on_user' OR peer references this user in coordination notes) + dup-detect log entries with resolution === 'coordinate' OR (mode === 'execute' AND blocking === true) within last 7 days |
| ⚡ | **Now** | GH issues assigned to `@me` with priority label (`priority:high` or `P0`/`P1`) + in-flight peer sessions on this repo's branches with `state === 'active'` + current objective's open TRDs (from local STATE.md) |
| 📋 | **Soon** | GH issues mentioning `@me` (not assigned) + GH issues with review-requested + initiative open questions (from matched initiatives only, per obj 5 `matchByRepo`) |
| 💡 | **Ideas** | Local todos via `_fetchLocalTodos` + GH issues assigned to `@me` without priority label |

**Lane assignment is deterministic + tested.** Each entry routes to exactly ONE lane based on the rules above (no double-counting). Tie-breakers locked:

- A GH issue with both `priority:high` AND `mentions:@me` (but not assigned) → 📋 Soon (assignment trumps mention; missing assignment trumps priority).
- A peer branch with `state === 'blocked_on_user'` AND on this repo's origin → 🔥 Blocked-on-you (state trumps repo locality).
- An initiative open question on a matched repo → 📋 Soon (initiatives never flow to Now; they're strategic, not tactical).
- Local todos NEVER flow to Now/Soon — they're personal notes (Ideas lane only) regardless of content.

Lane assignment is a pure function: `_assignLane(entry, currentUser, currentRepo) -> 'blocked'|'now'|'soon'|'ideas'`. Unit-tested with enumerated cases (no LLM scoring; no semantic analysis).

### 3. Five sources with injection hooks (locked decision #3)

Each `_fetch*` helper has its own injection seam so tests can mock independently:

| Source | Helper | Injection | Returns |
|---|---|---|---|
| Local todos | `_fetchLocalTodos(cwd, opts)` | `_setRunFs` | `[{ file, created, title, area, path, source: 'local' }, ...]` |
| GH issues | `_fetchGhIssues(opts)` | `_setRunGh` (transitively) | `[{ ref, title, repo, labels, assignee, mentions, review_requested, source: 'gh' }, ...]` |
| Peer sessions | `_fetchPeerSessions(opts)` | `_setRunPeer` (mirrors obj 4) | `[{ branch, objective, trd, last_commit, state, github_issue, source: 'peer' }, ...]` |
| Initiative open questions | `_fetchInitiativeQuestions(opts)` | `_setRunFs` (transitively reads initiative home) | `[{ initiative_slug, github_issue, question, source: 'initiative' }, ...]` |
| Dup-detect log | `_fetchDupDetectLog(opts)` | `_setRunFs` | `[{ timestamp, objective_id, resolution, top_match, source: 'dup-detect' }, ...]` |

`_setRunPeer(fn)` mirrors obj 4 pattern — wraps `aw.scanPeer` so tests don't need to bypass the scanner. `_setRunGh(fn)` is re-exported from `gh.cjs` (mirrors obj 5 pattern). `_setRunFs(fn)` is the local injection used by `_fetchLocalTodos`, `_fetchInitiativeQuestions`, `_fetchDupDetectLog`.

`_resetMocks()` resets all four hooks back to real implementations + clears the `gh` mock via `gh._setRunGh(null)`.

**`_fetchGhIssues` queries (locked, mirrored from ROADMAP):**

```bash
gh issue list --assignee @me --state open --json number,title,labels,assignees,repository --limit 50
gh issue list --search "mentions:@me is:open" --json number,title,labels,assignees,repository --limit 50
gh issue list --search "review-requested:@me is:open is:pr" --json number,title,labels,repository --limit 25
```

**Three queries, sequential.** Cross-repo via `gh search issues`-style search (avoids enumerating repos manually). Single-org scope per CONTEXT.md decision #6 below.

### 4. Cache layer mirrors obj 2 awareness pattern (locked decision #4)

`.planning/.check-todos-cache.json` (gitignored). 10-min TTL default. **Single-flag refresh** (`--refresh` forces ALL sources to re-fetch; per-source refresh is OUT OF SCOPE).

Cache schema:

```json
{
  "local_todos":          { "data": [...], "fetched_at": "2026-05-05T08:00:00Z" },
  "gh_issues":            { "data": [...], "fetched_at": "2026-05-05T08:00:00Z" },
  "peer_sessions":        { "data": [...], "fetched_at": "2026-05-05T08:00:00Z" },
  "initiative_questions": { "data": [...], "fetched_at": "2026-05-05T08:00:00Z" },
  "dup_detect_log":       { "data": [...], "fetched_at": "2026-05-05T08:00:00Z" }
}
```

Cache helpers (in `lib/check-todos.cjs`, locked names):

- `readCheckTodosCache(cwd)` — returns cache object or `null` (missing/malformed). Never throws.
- `writeCheckTodosCache(cwd, sections)` — merge semantics: writing one section preserves others (Object.assign at namespace level, mirrors obj 2 TRD 02-04).
- `isCheckTodosCacheStale(fetched_at, ttl_minutes)` — same staleness rules as obj 2 `isStale`: zero-TTL → true, future-timestamp → false (clock skew tolerance), null/undefined/invalid → true.

**Cache lifecycle:**

- Lazy populate on first invocation when cache missing or all 5 sections stale.
- Per-section staleness check: any source whose `fetched_at` is missing/expired triggers re-fetch FOR THAT SOURCE ONLY (other sources serve from cache).
- `--refresh` flag: re-fetches ALL 5 sources unconditionally.
- Sources that fail (e.g., `gh` auth error, missing initiative home) → `warnings[]` entry + serve cached data when available + null `data` when not.

**Cache constant:** `CHECK_TODOS_CACHE_REL = '.planning/.check-todos-cache.json'`. `CHECK_TODOS_TTL_MINUTES = 10`.

### 5. Hard-fail on gh auth (sync mode only) (locked decision #5)

Per the ROADMAP locked decision: **GH_INTEGRATION sync mode hard-fails** on missing/expired auth via `requireGhAuth(['repo'])` (only `repo` scope is needed for `gh issue list`). The aggregate path catches `GhAuthError` and:

- Adds `{ kind: 'gh_auth_failure', remediation: 'gh auth refresh -h github.com -s repo' }` to `result.warnings`.
- Skips the `gh_issues` source (returns empty array).
- Continues with other 4 sources — does NOT propagate the error.

The CLI display path (`df-tools check-todos` from cache) succeeds even when gh is unavailable: missing `gh_issues` cache section just renders an empty section with a warning footer. **Never blocks the morning-standup view on gh availability.**

`_fetchGhIssues` is the ONLY path that calls `requireGhAuth`. Other helpers never call gh.

### 6. Output format: terminal-rendered Markdown with emoji + attribution (locked decision #6)

`formatCheckTodosMarkdown(result, opts)` is a pure renderer (no I/O, no process exit). Returns a single string with these sections, in order:

```markdown
# 📋 DevFlow Standup — 2026-05-05

## 🔥 Blocked-on-you (3)

- **AO-Cyber-Systems/aodex#42** — Mark needs Justin's review on backfill query (peer)
  *via dup-detect coordinate (2026-05-04, 04 — strong file overlap)*
- ...

## ⚡ Now (5)

- ...

## 📋 Soon (4)

- ...

## 💡 Ideas (12) [showing 5; --all for full list]

- ...
```

**Source attribution** is a one-line italic suffix: `*via <source>: <detail>*` so the user can trace each entry to its origin.

**Token bounds (locked):**

- Default: top 5 entries per lane shown; trailing `[showing 5; --all for full list]` annotation.
- `--all` flag: shows all entries (no truncation). Useful for full triage.
- `--lane <name>` flag: filters to ONE lane (still applies token bounds unless `--all`).
- Total output bounded by `MAX_CHECK_TODOS_OUTPUT_CHARS = 8000` (≤8KB) under default flags. Larger outputs warned but not truncated mid-entry.

**Empty lanes render:** `## ⚡ Now (0)\n\n_no entries_\n` — never omitted (consistent shape for greppability).

### 7. Token-bounded output (locked decision #7)

Per-lane truncation as above. Composition cap at 8KB. Renderer is deterministic for fixed input — no clock-dependent ordering (timestamps shown but don't affect order: lane-internal order is by `urgency_rank` field assigned by `_assignLane`).

### 8. Single-org scope (out of scope for v1.1)

`_fetchGhIssues` queries the user's `@me` across all repos via gh search syntax, but filters to the configured org. Cross-org aggregation explicitly OUT OF SCOPE per ROADMAP. The org filter is the same one obj 2/3/5 use: derived from current repo's PROJECT.md `github_repo` field's owner segment (e.g., `AO-Cyber-Systems/devflow-claude` → org `AO-Cyber-Systems`).

In v1.1, this is a hard filter applied to `gh issue list` results post-fetch. v1.2+ may add `--org <name>` flag for explicit override.

### 9. Read-only — no mutation operations (out of scope for v1.1)

No `df-tools check-todos resolve <id>`, no `mark-done`, no `snooze`. The skill renders; the user acts in whatever tool surfaced the entry (gh CLI / editor for local todos / coordinate-with-teammate for peer).

### 10. AI prioritization explicitly excluded (locked decision)

Lane assignment is deterministic and lexical. NO embeddings, NO LLM scoring, NO semantic similarity. Re-routing across lanes happens only when source data changes (e.g., issue gets a `priority:high` label → moves Ideas → Now on next refresh). This matches obj 4 dup-detect's deterministic-by-design choice.

## Module surface (locked, per ROADMAP SC-8)

After all v1.1 obj 6 TRDs land, `lib/check-todos.cjs` exports:

```js
module.exports = {
  // Public API (TDD'd):
  aggregate,                      // ({ projectRoot, refresh, opts }) => { blocked, now, soon, ideas, warnings, cached }
  formatCheckTodosMarkdown,       // (aggregate, opts?) => string

  // Source fetchers (each independently testable):
  _fetchLocalTodos,               // (cwd, opts?) => [...]
  _fetchGhIssues,                 // (opts?) => [...]
  _fetchPeerSessions,             // (opts?) => [...]
  _fetchInitiativeQuestions,      // (opts?) => [...]
  _fetchDupDetectLog,             // (cwd, opts?) => [...]

  // Lane assignment (pure):
  _assignLane,                    // (entry, currentUser, currentRepo) => 'blocked'|'now'|'soon'|'ideas'

  // Cache helpers:
  readCheckTodosCache,            // (cwd) => object|null
  writeCheckTodosCache,           // (cwd, sections) => void  (merge semantics)
  isCheckTodosCacheStale,         // (fetched_at, ttl_minutes?) => bool

  // Test hooks:
  _setRunGh,                      // (fn) => void  (re-exported from gh.cjs)
  _setRunFs,                      // (fn) => void
  _setRunPeer,                    // (fn) => void  (wraps awareness.scanPeer)
  _resetMocks,                    // () => void

  // Constants:
  CHECK_TODOS_CACHE_REL,          // '.planning/.check-todos-cache.json'
  CHECK_TODOS_TTL_MINUTES,        // 10
  MAX_CHECK_TODOS_OUTPUT_CHARS,   // 8000
  DEFAULT_LANE_TRUNCATE,          // 5
  LANE_NAMES,                     // ['blocked', 'now', 'soon', 'ideas']
};
```

**Total: 19 entries.** `lib/gh.cjs`, `lib/awareness.cjs`, `lib/dup-detect.cjs`, `lib/initiatives.cjs` add **NO new exports** for obj 6 — obj 6 is purely a consumer.

`lib/check-todos-cli.cjs` exports `cmdCheckTodosRoute(cwd, args, raw)` only. Mirror `dup-detect-cli.cjs` / `initiatives-cli.cjs` shape.

## CLI surface (locked)

`df-tools check-todos [<flags>]`:

- `df-tools check-todos` — default; renders Markdown with default lane truncation (top 5 each), uses cached data when fresh.
- `df-tools check-todos --all` — show all entries per lane (no truncation).
- `df-tools check-todos --refresh` — force re-fetch of ALL 5 sources before render.
- `df-tools check-todos --lane <name>` — filter to one lane (`blocked` | `now` | `soon` | `ideas`).
- `df-tools check-todos --raw` — JSON output (full aggregate object, including warnings + cached flag).

Compose: `--lane now --refresh --raw` is valid.

Router: new `lib/check-todos-cli.cjs` (mirror `dup-detect-cli.cjs`) wired into `df-tools.cjs` via a new `case 'check-todos':` arm. **Replaces the existing `cmdListTodos`-based behavior.**

**Critical migration note:** The existing `/devflow:check-todos` skill (currently a local-todos-only browser delegating to `workflows/check-todos.md`) is REWRITTEN in TRD 06-04 to invoke `df-tools check-todos` instead. The legacy local-only flow is preserved as `df-tools list-todos` (already exists; untouched). Users who want the old local-only browser run `df-tools list-todos` directly — but the skill's morning-standup persona is the unified view.

## File-region ownership for `lib/check-todos.cjs`

`lib/check-todos.cjs` is **created in TRD 06-01** and **EXTENDED across waves**. Each TRD owns a documented region; wave sequencing prevents merge conflicts. **No two TRDs touching `lib/check-todos.cjs` run in the same wave** (per `feedback_planner_proto_conflict` memory).

Region ownership (locked):

| Region | Owner TRD | Wave |
|---|---|---|
| Module skeleton (header, requires, constants, fs/gh/peer injection hooks, `aggregate`, 5 `_fetch*` helpers, `_assignLane`, fixture builder + CLI scaffold with stubs for show/refresh) | 06-01 | 1 |
| Cache layer (`readCheckTodosCache`, `writeCheckTodosCache`, `isCheckTodosCacheStale`) + `.gitignore` entry + cache wiring inside `aggregate` | 06-02 | 2 |
| `formatCheckTodosMarkdown` + 4 sub-renderers (one per lane) + `--lane` filter + `--all` flag wiring inside formatter | 06-03 | 3 |
| CLI flags wiring (replace 06-01 stubs) + `/devflow:check-todos` skill REWRITE + `module.exports` block (final 19-entry lock) + EX1 surface test + GH_INTEGRATION round-trip + self-test | 06-04 | 4 |

TRDs 06-01, 06-02, 06-03 each end their wave with a partial `module.exports` containing ONLY the symbols they introduced (mirror obj 4/5 pattern). TRD 06-04 finalizes the export surface (asserts all 19 expected exports present via `Object.keys().sort()` deepStrictEqual).

## Wave structure (LOCKED)

Per `feedback_planner_proto_conflict` memory: planner under-encodes file-level co-modification. The orchestrator MUST sequence TRDs touching the same file even when `depends_on=[]` would suggest parallelism.

`lib/check-todos.cjs` is touched by all 4 TRDs. **All four TRDs are serialized.**

| Wave | TRD | Files touched | Notes |
|---|---|---|---|
| 1 | 06-01 | check-todos.cjs (skeleton + aggregate + 5 fetchers + lane assignment), check-todos.test.cjs (NEW), check-todos-cli.cjs (NEW; show/refresh stubs), check-todos-cli.test.cjs (NEW), awareness-fixtures.cjs (extend with buildCheckTodosFixtures), df-tools.cjs (case 'check-todos' arm) | Foundation: aggregator + 5 fetchers + deterministic lane assignment + 1 new fixture builder |
| 2 | 06-02 | check-todos.cjs (cache region), check-todos.test.cjs (cache tests), .gitignore (add cache file) | Cache layer; mirrors obj 2 TRD 02-04 pattern |
| 3 | 06-03 | check-todos.cjs (formatter region), check-todos.test.cjs (formatter tests) | Pure renderer + token bounding |
| 4 | 06-04 | check-todos.cjs (export lock + banner), check-todos.test.cjs (EX/IT tests), check-todos-cli.cjs (replace 06-01 stubs with full flag wiring), skills/check-todos/SKILL.md (REWRITE) | Skill + CLI flags + final integration; tests SC-9 + SC-10 |

**Why 4 waves?** Single shared file (`check-todos.cjs`) across all waves — file-conflict serialization dominates parallelism.

## TRD types (locked, not auto-derived)

Per the user's CLAUDE.md TDD Playbook directives: code-shipping work is TDD by default. Skill workflow markdown is standard. The `<tdd_playbook_directives>` from the orchestrator briefing is reproduced below for clarity:

> - aggregator + 5 fetchers + lane assignment — type: tdd; hand-built fixtures
> - formatCheckTodosMarkdown — type: tdd; pure formatter
> - CLI + skill — type: standard
> - export lock + integration — type: tdd

| TRD | Type | Reason |
|---|---|---|
| 06-01 — Aggregator + 5 fetchers + lane assignment + fixtures | `tdd` | Pure parsing + filtering + aggregation logic; testable with hand-built fixtures (`buildCheckTodosFixtures`). Fixture-builder task ahead of first behavior test. |
| 06-02 — Cache layer | `tdd` | Pure logic + filesystem; mirrors obj 2 TRD 02-04 with same staleness rules + merge semantics. |
| 06-03 — Formatter | `tdd` | Pure formatter, no I/O; deterministic output bounded by `MAX_CHECK_TODOS_OUTPUT_CHARS`. |
| 06-04 — CLI + skill + export lock + integration | `mixed` (standard CLI/skill + tdd export lock + tdd integration tests) | CLI flag wiring + skill markdown is standard (single feat commit). Export-lock + GH_INTEGRATION round-trip + self-test against THIS repo are TDD. Two commits at minimum: standard `feat:` for CLI/skill + `test:`/`feat:` cycle for export lock + integration. |

## Anti-pattern constraints (honored across all TDD TRDs)

From the resolver's defaults table + project memory + `<tdd_playbook_directives>` from the orchestrator briefing:

- `no_llm_test_data` — All test fixtures must be hand-built factory functions (`__fixtures__/awareness-fixtures.cjs` extensions) or recorded cassettes. NO AI-generated sample data.
- `no_property_based_default` — Suppress property-based testing recommendations. Tests use enumerated cases.
- `no_gherkin_layer` — No Gherkin/BDD syntax. Use descriptive test names directly.
- **No LLM-based scoring.** Lane assignment is lexical (label/state/repo presence). NO embeddings.
- **Multitenancy guard NOT applicable** — single-user CLI tool, single-org context (AO-Cyber-Systems). No tenant-isolation assertions required.
- **Outside-in NOT applicable** — pure-logic aggregator/formatter + skill-workflow edits; no UI/portal flows.

## TDD discipline for tdd-typed TRDs (apply to 06-01, 06-02, 06-03, 06-04 tdd portion)

Per CLAUDE.md TDD Playbook + orchestrator's `<tdd_playbook_directives>`:

- **Test list first**: include a `## Test list` section in TRD body listing behavior cases (happy + edge + failure) BEFORE any test code is written.
- **Fixture builders as their own task** ahead of the first behavior test. Hand-built factory functions in `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` (extending obj 2+3+4+5's file). NO `faker`, NO LLM-completed sample data.
- **Filesystem fixtures via tmp dirs**: TRD 06-01 needs tmpdir for `_fetchLocalTodos` + `_fetchDupDetectLog`; TRD 06-02 needs tmpdir for cache write/read; TRD 06-04 needs full repo-shaped tmpdir for end-to-end paths.
- **One test at a time** RED → GREEN → REFACTOR. No batching.
- **Atomic commits per TDD TRD**: 2-3 commits (`test:` → `feat:` → optional `refactor:`).

## Discretion areas (planner / executor decides)

- Sub-task granularity within each TRD (within the 2-3 task budget).
- Specific helper organization within each region (so long as the public surface holds).
- Whether `_fetchGhIssues` issues 3 sequential `gh` calls or one bigger query — recommend 3 sequential (matches ROADMAP locked decision; simpler error handling per query).
- Whether `_fetchInitiativeQuestions` re-uses `loadInitiatives` from `lib/initiatives.cjs` directly OR re-implements the file walk — recommend reuse `loadInitiatives` (already proven in obj 5).
- Whether `_assignLane` short-circuits on first lane match or evaluates all (recommend: short-circuit; trivial perf).
- Test runner organization: append to single `check-todos.test.cjs` (mirror obj 2/3/4/5 pattern — single file per module).
- Slug derivation for fixture-paths follows `path.join` — never hard-code `/`.

## Out of scope for v1.1 (planner must NOT include)

- Cross-org GH issue aggregation — single-org scope locked per CONTEXT.md decision #8.
- AI-powered prioritization / lane re-routing — deterministic rules only per CONTEXT.md decision #10.
- Persistent action history (mutation) — read-only per CONTEXT.md decision #9.
- Mutation operations (`check-todos resolve <id>`, `mark-done`, `snooze`) — separate v1.2+ work.
- Per-source `--refresh <name>` flag — single bulk-refresh only in v1.1 (mirrors obj 2 simpler subset).
- Watching the cache file for changes (no inotify, no polling).
- Caching the formatter output (it's already small + deterministic).
- Daemon-driven push notifications — passive read-only view only.
- Configurable lane thresholds via flags — `MAX_CHECK_TODOS_OUTPUT_CHARS` etc. are locked at module level.
- Migration path for the existing `/devflow:check-todos` skill — TRD 06-04 REWRITES it; the `workflows/check-todos.md` legacy workflow file remains untouched (still callable directly if user wants the old browser).
- Real-time peer-state diff ("since last invocation") — last-invocation timestamp tracking is v1.2+.
- Sub-issue-level rollup (only direct sub-issues considered, mirrored from obj 2's locked decision #7).

## Goal-backward verification

Every TRD MUST include `must_haves` mapping to the 10 success criteria below (reproduced from ROADMAP §"Objective 6"). Each requirement ID (SC-1 through SC-10) MUST appear in at least one TRD's `requirements` frontmatter field.

1. **SC-1**: `lib/check-todos.cjs` exports `aggregate({ projectRoot, refresh })` returning `{ blocked, now, soon, ideas, warnings, cached }`. Hand-built fixtures.
2. **SC-2**: Five source fetchers: `_fetchLocalTodos`, `_fetchGhIssues`, `_fetchPeerSessions`, `_fetchInitiativeQuestions`, `_fetchDupDetectLog` — all with injection hooks.
3. **SC-3**: Lane assignment is deterministic + tested: each entry routes to exactly one lane based on rules.
4. **SC-4**: `.planning/.check-todos-cache.json` (gitignored) namespaces sources; 10-min TTL; `--refresh` forces re-fetch.
5. **SC-5**: `formatCheckTodosMarkdown(aggregate, opts)` produces terminal-friendly output with urgency emoji + lane headers + per-entry attribution.
6. **SC-6**: `df-tools check-todos [--all] [--refresh] [--lane <name>]` runs aggregate + renders; `--all` removes per-lane truncation; `--lane <name>` filters single lane.
7. **SC-7**: `/devflow:check-todos` skill invokes the CLI.
8. **SC-8**: `lib/check-todos.cjs` exports stable surface: `aggregate`, `formatCheckTodosMarkdown`, `_fetchLocalTodos`, `_fetchGhIssues`, `_fetchPeerSessions`, `_fetchInitiativeQuestions`, `_fetchDupDetectLog`, `_setRunGh`, `_setRunFs`, `_resetMocks`. Module surface locked.
9. **SC-9**: Round-trip integration test gated on `GH_INTEGRATION=1`: live aggregate against this repo + user's actual GH state. Skipped cleanly when env unset.
10. **SC-10**: Self-test: `df-tools check-todos --raw` against this repo returns valid JSON with all 5 sources surfacing data (since obj 2/4/5 all populated this repo's state).

## GitHub tracking

- **Issue:** [devflow-claude#15](https://github.com/AO-Cyber-Systems/devflow-claude/issues/15) (sub-issue of #9)
- **Gates downstream:** none — closes the v1.1 runtime layer.
- **Branch:** `feature/v1.1-obj-6-check-todos` off `main` (matches orchestrator briefing; do not push to origin until objective complete)
