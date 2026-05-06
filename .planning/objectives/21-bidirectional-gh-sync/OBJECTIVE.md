---
work: feature
parent_issue: AO-Cyber-Systems/devflow-claude#9
overrides:
  tdd: strict
  test_list_first: required
  fixture_strategy: cassettes
---

# Bidirectional GH sync + configurable kind/work defaults table

## Goal

Close two v1.2 polish gaps that complete the 1.x feature surface:

**Feature A — Bidirectional GitHub sync (poll-based inbound).** v1.1 ships one-way push from `.planning/` → GitHub Issues. v1.2 adds the inbound path: a periodic-poll `df-tools gh pull` reads GitHub issue/PR state for tracked objectives and updates `OBJECTIVE.md` / `PROJECT.md` frontmatter (status, labels, assignees) when GitHub-side changed since last sync. When both sides edited concurrently, surface a 3-way diff (GH state vs disk state vs last-known sync state) and require explicit user decision — never auto-merge. Webhook mode deferred to v1.3+; poll is sufficient and avoids hosting requirements.

**Feature B — Configurable `(kind, work)` defaults table override.** The 42-cell defaults table at `plugins/devflow/devflow/references/defaults-table.md` is currently the single hardcoded source consumed by `lib/intent.cjs`. v1.2 exposes a 3-tier resolution mirroring CLAUDE.md precedence:
1. Project: `.planning/defaults-table.md` (highest)
2. Org: `~/.claude/devflow/defaults-table.md`
3. Bundled: `plugins/devflow/devflow/references/defaults-table.md` (fallback)

`df-tools intent resolve` output gains a per-cell `provenance.tier` field showing which level supplied each (kind, work) cell value. `df-tools defaults-table init [--scope=org|project]` scaffolds an editable copy from the bundled file.

Both features are independent — Feature A touches `lib/gh.cjs`, `lib/sync-state.cjs` (new), and `lib/conflict.cjs` (new); Feature B touches `lib/intent.cjs`, `lib/defaults-loader.cjs` (new). No file overlap → 21-04/21-05 run parallel with 21-01 in Wave 1.

## Locked decisions

1. **Poll-only sync** — webhook deferred to v1.3+ (no hosting commitment in v1.2)
2. **Opt-in pull** — `df-tools gh pull` runs explicitly (no auto-pull on session start in v1.2; `github.auto_pull_on_init` config flag scaffolded for v1.3+ but defaults `false`)
3. **Conflict resolution: surface, do NOT auto-merge** — print 3-way diff, exit non-zero, require user to commit decision (write-back via `df-tools gh pull --resolve=disk|gh|merge`)
4. **3-tier defaults-table resolution** — project > org > bundled; same precedence pattern as CLAUDE.md absorption
5. **Markdown format unchanged** — defaults-table.md schema is already parseable; just expose lookup path through `loadDefaultsTable(tablePath)`
6. **Provenance computed at resolve time** — no persistent cell-level override tracking; `df-tools intent resolve` walks the 3 files at call time and reports which file supplied each cell

## Out of scope (deferred to v1.3+)

- Webhook-driven sync (requires hosted listener — out of solo-dev scope)
- Auto-pull on session start (config scaffolded, default off)
- Per-field merge strategies (only whole-record disk|gh|merge in v1.2)
- Cell-level override tracking (provenance is computed, not stored)
- `df-tools defaults-table validate` (covered by `intent resolve` failure modes)
- `df-tools defaults-table diff` between tiers (deferrable utility)

## Success criteria

| ID | Criterion |
|----|-----------|
| SC-1 | `df-tools gh pull <objective>` reads GH issue/PR state via `gh` CLI and reports drift (no write yet) |
| SC-2 | When GH-side changed AND disk unchanged → `gh pull --apply` updates `OBJECTIVE.md` frontmatter and writes new `.planning/.gh-sync-state.json` |
| SC-3 | When BOTH sides changed → `gh pull` exits non-zero with a 3-way diff; `--resolve={disk,gh,merge}` commits the resolution |
| SC-4 | `.planning/.gh-sync-state.json` records per-objective `{ etag, updated_at, label_set, last_synced_at }` |
| SC-5 | All `gh pull` paths use `gh` CLI subprocess + cassette fixtures in tests; zero live network calls |
| SC-6 | `df-tools defaults-table init --scope=org` writes `~/.claude/devflow/defaults-table.md`; `--scope=project` writes `.planning/defaults-table.md`; both seeded from bundled file |
| SC-7 | `lib/intent.cjs` `loadDefaultsTable()` walks project → org → bundled and merges (later tiers override matching cells) |
| SC-8 | `df-tools intent resolve` output `provenance.tier` field reports `project_table | org_table | bundled_table` for each (kind, work) cell value |
| SC-9 | 2053 pre-existing tests still pass |
| SC-10 | All 5 TRDs ship with paired `.test.cjs` files; cassette fixtures committed under `lib/__fixtures__/gh-pull-cassettes/` and `lib/__fixtures__/defaults-table-fixtures.cjs` |

## Requirements

- **GH-PULL-CLI** — `df-tools gh pull <objective>` CLI: read GH issue/PR state, report drift
- **GH-PULL-APPLY** — `--apply` mode: write frontmatter changes when only GH-side changed
- **SYNC-STATE-SCHEMA** — `.planning/.gh-sync-state.json` schema + read/write helpers
- **SYNC-STATE-WIRING** — push (`gh sync`) + pull (`gh pull`) both update sync state atomically
- **CONFLICT-DETECT** — 3-way diff detection: compare disk + GH + last-known-sync
- **CONFLICT-RESOLVE** — `--resolve={disk,gh,merge}` flag commits user's resolution decision
- **CONFLICT-EXIT-NONZERO** — bare `gh pull` exits non-zero on conflict; CI-safe
- **DEFAULTS-LOADER** — 3-tier file resolution: project > org > bundled
- **DEFAULTS-LOADER-MERGE** — later tiers override matching cells; cells absent in higher tiers fall through
- **DEFAULTS-INIT-CLI** — `df-tools defaults-table init --scope=org|project` scaffolds editable copy
- **PROVENANCE-CELL** — per-cell `provenance.tier` field in `intent resolve` output
- **PROVENANCE-VOCAB** — provenance tier vocabulary: `project_table | org_table | bundled_table` (extends existing `table | user_playbook | objective_override | trd_override` enum)

## TRDs

3 plans in Wave 1 (parallel) + 2 plans in Wave 2 (parallel within wave, depends on 21-01).

- [ ] 21-01-gh-pull-cli-TRD.md — `df-tools gh pull` CLI + GH issue/PR read + drift detection + cassette fixtures (Wave 1, tdd)
- [ ] 21-04-defaults-table-loader-TRD.md — 3-tier defaults-table loader + `defaults-table init` CLI (Wave 1, tdd)
- [ ] 21-05-intent-provenance-TRD.md — extend `intent.cjs` + `intent resolve` with per-cell provenance.tier (Wave 1, tdd)
- [ ] 21-02-sync-state-tracking-TRD.md — `.gh-sync-state.json` schema + atomic read/write + push/pull integration (Wave 2, tdd)
- [ ] 21-03-conflict-resolution-TRD.md — 3-way diff detection + `--resolve` flag + non-zero exit on conflict (Wave 2, tdd)

---
*Created: 2026-05-06 (manual scaffold for objective 21 planning)*
