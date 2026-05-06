# TRD 22-03 SUMMARY — project-hygiene move CLI

**Status:** DONE 2026-05-06

## What shipped

- Extended `lib/project-hygiene.cjs` with `moveObjective()` + `_walkStats()` + `cmdProjectHygieneMove()`
- `_runFs` injection seam (mirrors dup-detect.cjs pattern) for testability
- `_walkStats` indirection separately mockable for verify-failure rollback testing

## Behavior

- Sequence: resolve source → check target → refuse overwrite → cp → verify (file count + bytes match) → rm source
- Verify-fail: rollback dest, source preserved, `source_removed: false`
- Cp-fail: cleanup partial dest, source untouched
- Rm-source-fail: keep dest, surface manual-cleanup message
- Path normalization: relative `--to=<path>` resolved from cwd
- Reuses `findObjectiveInternal` from `lib/objective.cjs` for source resolution

## CLI

```
df-tools project-hygiene move <objective-id> --to=<target-repo-path>
```

Returns JSON; exits 0 on success, 1 on any failure.

## Tests: 12 pass (Group 22C)
