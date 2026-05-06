# TRD 22-02 SUMMARY — project-hygiene check CLI

**Status:** DONE 2026-05-06

## What shipped

- `lib/project-hygiene.cjs` (NEW): `scanForMisfiled()` + `cmdProjectHygieneCheck()` + `_checkObjectiveRefs()`
- `lib/project-hygiene.test.cjs` (NEW): 15 tests for Group 22B + subprocess CLI integration
- `df-tools.cjs`: `case 'project-hygiene':` arm with `check`/`move`/`archive` subcommand dispatch (move/archive land in 22-03/22-04)

## Behavior

- Scans `.planning/objectives/*/OBJECTIVE.md` for `parent_issue` or `github_issue` refs
- Flags as `misfiled` when ref's repo differs from PROJECT.md's `github_repo`
- Classifies as `no_link` when no ref or only shorthand (`#NN`)
- Excludes `.planning/milestones/*-objectives/*` (archived)
- Pure ref-extraction; no `gh` CLI needed (graceful default)
- Surfaces `project_archived: true` from PROJECT.md frontmatter (informational)
- Read-only — never mutates

## JSON contract

```json
{
  "ok": true,
  "project_repo": "AO-Cyber-Systems/devflow-claude",
  "project_archived": false,
  "objectives_scanned": 22,
  "misfiled": [{ "objective", "directory", "current_repo", "resolved_repo", "via", "ref" }],
  "no_link": [{ "objective", "directory", "reason" }],
  "errors": [],
  "skipped": false,
  "warnings": []
}
```

## Tests: 15 pass
