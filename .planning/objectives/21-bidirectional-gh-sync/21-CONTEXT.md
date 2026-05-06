# Objective 21 — CONTEXT

Planning context for **Bidirectional GH sync + configurable kind/work defaults table**.

## Why this objective exists

Two unfinished v1.2 polish items folded into a single objective because they share the (kind, work) intent-model substrate and ship together as the v1.2 closer:

1. **Bidirectional GH sync** — v1.1 ships one-way push (`df-tools gh sync-objectives`, `gh comment`, `gh close-issue`). When users edit GitHub issues directly (close, relabel, change milestone), `.planning/` doesn't see it. Discrepancies accumulate; planning state diverges from GitHub state.

2. **Defaults-table override** — the (kind, work) defaults table is the resolution-chain level 4 (table). Currently it's a single file at `plugins/devflow/devflow/references/defaults-table.md`. Orgs that want different defaults (different TDD posture for `(api, foundation)`, different fixture strategy for `(plugin, feature)`) must fork the plugin. This blocks adoption by orgs whose conventions differ from AO-Cyber-Systems.

Both fall under "v1.2 polish bundle" — the v1.1 surface works but has rough edges.

## Anchor decisions (locked at plan time)

### Sync direction

- **Poll, not webhook** — webhooks require a hosted listener and a public ingress. Solo-dev scope ≠ webhook listener. Poll is sufficient: `gh pull` runs when user asks, reports drift, applies safe changes.
- **Opt-in pull** — automatic pull on session start adds noise + surprise. v1.2 ships explicit invocation only. `templates/config.json` gets a `github.auto_pull_on_init: false` slot for future v1.3+ work.

### Conflict policy

- **Surface, don't auto-merge** — when both disk and GH changed, the safe default is to refuse the merge and show the user a 3-way diff. Auto-merge is a footgun: GH labels are flat, planning frontmatter is structured; resolving "what wins when both changed `status:`" requires user judgement.
- **3 resolution paths** — `--resolve=disk` (keep planning, push to GH), `--resolve=gh` (overwrite planning), `--resolve=merge` (manually edit then re-run with `--resolved` flag).

### Defaults-table tier ordering

- **Project > org > bundled** — same as CLAUDE.md absorption (project CLAUDE.md > user CLAUDE.md > none). Familiar to users.
- **Cell-level merge, not file-level** — if project table omits the `(api, prototype)` cell but org table provides it, the org cell is used. Avoids requiring users to copy the entire 42-cell table just to override one entry.
- **No cell-level override tracking on disk** — provenance is *computed* at `intent resolve` time by tracking which file supplied each cell during the merge. No `.planning/.defaults-overrides.json` needed.

### Sync state shape

```json
{
  "version": 1,
  "objectives": {
    "21-bidirectional-gh-sync": {
      "issue_ref": "AO-Cyber-Systems/devflow-claude#NN",
      "etag": "W/\"abc123def\"",
      "gh_updated_at": "2026-05-06T14:23:11Z",
      "label_set": ["devflow:objective", "devflow:in-progress"],
      "last_synced_at": "2026-05-06T15:00:00Z",
      "last_synced_disk_hash": "sha256:..."
    }
  }
}
```

`last_synced_disk_hash` — sha256 of canonicalized OBJECTIVE.md frontmatter. Used to detect disk-side changes since last sync without diffing structure.

## Files this objective will touch

### Created

- `plugins/devflow/devflow/bin/lib/gh-pull.cjs` — `cmdGhPull` + drift detection (TRD 21-01)
- `plugins/devflow/devflow/bin/lib/gh-pull.test.cjs` — paired tests (TRD 21-01)
- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/*.json` — recorded `gh issue view --json` responses (TRD 21-01)
- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs` — fixture builders (TRD 21-01)
- `plugins/devflow/devflow/bin/lib/sync-state.cjs` — schema + atomic read/write (TRD 21-02)
- `plugins/devflow/devflow/bin/lib/sync-state.test.cjs` — paired tests (TRD 21-02)
- `plugins/devflow/devflow/bin/lib/__fixtures__/sync-state-fixtures.cjs` — fixture builders (TRD 21-02)
- `plugins/devflow/devflow/bin/lib/conflict.cjs` — 3-way diff + resolution (TRD 21-03)
- `plugins/devflow/devflow/bin/lib/conflict.test.cjs` — paired tests (TRD 21-03)
- `plugins/devflow/devflow/bin/lib/__fixtures__/conflict-fixtures.cjs` — fixture builders (TRD 21-03)
- `plugins/devflow/devflow/bin/lib/defaults-loader.cjs` — 3-tier file resolution (TRD 21-04)
- `plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs` — paired tests (TRD 21-04)
- `plugins/devflow/devflow/bin/lib/__fixtures__/defaults-table-fixtures.cjs` — fixture builders (TRD 21-04)

### Modified

- `plugins/devflow/devflow/bin/df-tools.cjs` — wire `gh pull`, `defaults-table init` subcommands (TRDs 21-01, 21-04)
- `plugins/devflow/devflow/bin/lib/gh.cjs` — push path emits sync-state record (TRD 21-02 cross-cuts; minimal touch)
- `plugins/devflow/devflow/bin/lib/intent.cjs` — `loadDefaultsTable()` calls `defaults-loader.cjs`; per-cell provenance tracking (TRDs 21-04, 21-05)
- `plugins/devflow/devflow/bin/lib/intent.test.cjs` — extend with per-cell provenance assertions (TRD 21-05)
- `plugins/devflow/devflow/templates/config.json` — add `github.auto_pull_on_init: false` slot (TRD 21-01)

## File-level concurrency

Wave 1 file ownership (no overlap):
- 21-01: `gh-pull.cjs`, `gh-pull.test.cjs`, `gh-pull-cassettes/`, `gh-pull-fixtures.cjs`, `df-tools.cjs` (gh pull subcommand only), `templates/config.json`
- 21-04: `defaults-loader.cjs`, `defaults-loader.test.cjs`, `defaults-table-fixtures.cjs`, `df-tools.cjs` (defaults-table subcommand only), `intent.cjs` (loadDefaultsTable seam only)
- 21-05: `intent.cjs` (per-cell provenance fields only — different code paths from 21-04's seam), `intent.test.cjs`

`df-tools.cjs` is touched by both 21-01 and 21-04 — but each adds a *new disjoint subcommand block* (the `case 'gh':` and a new `case 'defaults-table':`). Conflict-free if executors operate via Edit (not Write) and target distinct case blocks. **Sequencing fallback**: if the executor scheduler detects shared-file modification, run 21-04 after 21-01 within Wave 1 (still Wave 1, but sub-sequenced — costs ~10-15 min, no architectural change).

`intent.cjs` is touched by 21-04 (loadDefaultsTable seam swap) and 21-05 (per-cell provenance). These are different code paths — 21-04 changes how the table is *loaded*, 21-05 changes how `resolve()` *records* which cell came from where. Same file, different functions. Sequence 21-05 after 21-04 within Wave 1.

**Final wave structure:**
- Wave 1 parallel: 21-01 (gh pull), 21-04 (defaults loader), 21-05 (provenance)
  - With sub-sequencing inside the wave: 21-04 → 21-05 if scheduler enforces serial intent.cjs writes
- Wave 2 parallel: 21-02 (sync state — depends on 21-01's pull surface), 21-03 (conflict resolution — depends on 21-01's pull surface)

## TDD playbook directives

All 5 TRDs are `type: tdd` per user playbook (`~/.claude/CLAUDE.md` § TDD Playbook habit 1):

- **Test list first** — every TRD includes a behavior-cases checklist before any test code (habit 2).
- **One test at a time** RED → GREEN → REFACTOR (habit 3). Each TRD produces 2-3 atomic commits per task.
- **Fixture builders, not LLM data** (habit 4) — every TRD has a paired `*-fixtures.cjs` with hand-built factory functions. GH responses use cassette JSON files captured once and committed (same pattern as `lib/__fixtures__/gh-cassettes/` from objective 1).
- **No outside-in for these TRDs** — these are pure logic / CLI features, no UI flow to drill in from.
- **No multi-tenant assertion** — single-tenant project (devflow-claude is a plugin, not a multi-tenant API).
- **Skip property-based testing** (habit "what to skip") — no high-cardinality math here.
- **Skip Gherkin layer** (habit "what to skip") — descriptive test names carry meaning.

## Dependencies on prior objectives

- **Objective 1 (GitHub coordination layer)** — provides `gh.cjs` push surface, `cmdGhStatus`, `requireGhAuth`, cassette pattern, `_setRunGh` test injection seam, `extractFrontmatter` from `frontmatter.cjs`. **Must use the same patterns**: `_runGh` injection for tests, cassette JSON committed under `__fixtures__/gh-pull-cassettes/`, `GhAuthError` for auth failures.
- **Objective 0 (defaults table refinement)** — provides the 42-cell table format `defaults-loader.cjs` will load. Schema is locked; v1.2 only adds tier resolution.
- **Existing `lib/intent.cjs`** — already has `loadDefaultsTable(tablePath)` and `loadConstraints(tablePath)`; both accept an optional `tablePath`. The new `defaults-loader.cjs` becomes the path-resolver these helpers consult; minimal seam change.

## Key risks + mitigations

| Risk | Mitigation |
|------|-----------|
| GH API response shape drift breaks tests | Cassette fixtures captured against real GH; commit cassettes; document re-capture procedure in TRD 21-01 |
| Conflict resolution is unbounded (every field could conflict) | v1.2 scope: 4 fields only — `status`, `labels`, `assignees`, `milestone`. Other frontmatter fields are write-from-disk only |
| Defaults-loader merge semantics unclear (deep vs shallow) | Cell-level merge only: `defaults[kind][work]` is the merge unit; replacing one cell does not require copying siblings. Document with test case |
| `intent.cjs` loadDefaultsTable cache breaks tier resolution | Cache key becomes `(projectRoot, userHome)` instead of the literal `tablePath`. Test case for cache invalidation when project table is added/removed |
| df-tools.cjs case-block conflict between 21-01 and 21-04 in Wave 1 | Use Edit (not Write) targeting disjoint case blocks; sequencing fallback documented above if scheduler can't tell |

## Anti-patterns to avoid

- **No live network in tests** — all GH calls go through `_runGh` injection + cassette responses. (Same rule as objective 1.)
- **No LLM-generated test data** — fixtures are hand-built factory functions (per TDD playbook habit 4).
- **No silent merge** — conflict path always exits non-zero unless user provides `--resolve=`.
- **No persistent cell-level override tracking** — provenance is computed; no `.defaults-overrides.json` file. (Avoid creating state we don't need.)
- **No webhook scaffolding in v1.2** — leave `github.auto_pull_on_init: false` slot only; full webhook stack is v1.3+.
- **No bundling the defaults-table init template separately** — `defaults-table init` reads the bundled `references/defaults-table.md` and writes a copy. One source of truth.
