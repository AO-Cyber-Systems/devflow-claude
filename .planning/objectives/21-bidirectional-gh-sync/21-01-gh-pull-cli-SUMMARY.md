# TRD 21-01 SUMMARY — gh-pull CLI

**Status:** DONE 2026-05-06
**Commits:** bb9be31 + 5565da4 + a8f4fc3 + 4077265

## What shipped

- `lib/gh-pull.cjs` (new): `fetchGhIssue`, `normalizeGhIssue`, `detectDrift`, `applyDrift`, `cmdGhPull` + `_setRunGh` test seam
- `lib/gh-pull.test.cjs` (new): 19 tests across F1-F3 / D1-D5 / A1-A4 / C1-C7 — all pass
- `lib/__fixtures__/gh-pull-fixtures.cjs`: cassette loader, mock runGh, frontmatter/sync-state factories, buildTempProject helper
- `lib/__fixtures__/gh-pull-cassettes/` (4 JSON cassettes): objective-open-no-drift, objective-closed-on-gh, objective-relabeled-on-gh, objective-not-found
- `df-tools.cjs`: `gh pull <objective> [--apply] [--raw]` subcommand wired

## Drift detection contract

- `last_sync_state == null` → `{ drift: true, first_sync: true }` (any GH state is "new")
- `gh.updatedAt === last_sync.gh_updated_at` → `{ drift: false }` (skip diff)
- Else diff `TRACKED_FIELDS = ['status', 'labels', 'assignees', 'milestone']`
- `conflict_suspected: false` always — TRD 21-03 layers full 3-way diff

## CLI semantics (cmdGhPull)

| Flag | Behavior |
|---|---|
| `<objective>` (required) | Objective ID; missing → exit 1 with usage |
| `--apply` | Write changes to OBJECTIVE.md frontmatter (else: report-only) |
| `--raw` | Emit JSON payload (else: prose) |

| Outcome | Exit |
|---|---|
| usage error / no mapping / 404 / OBJECTIVE.md missing | 1 |
| no drift / drift reported (no --apply) / drift applied | 0 |
| conflict_suspected (with --apply) | 1 (deferred to 21-03) |

## Resolution detail (gotcha caught during execution)

`helpers.output()` always calls `process.exit(0)` and inverts raw semantics (raw=true → prose). cmdGhPull contract requires raw=true→JSON and exit-1-on-error, so a local `_emit(payload, prose, raw, exitCode)` was introduced in lib/gh-pull.cjs. The 6 failing CLI tests (C1-C7) were caused by output()'s eager exit-0 swallowing subsequent process.exit(1) calls.

## Tests

- 19/19 pass on per-file run
- Pre-existing test count baseline preserved (validated post-commit via npm test)
- Cassette fixtures committed to repo; no live network calls
