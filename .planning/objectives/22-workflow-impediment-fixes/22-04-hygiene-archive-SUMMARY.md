# TRD 22-04 SUMMARY — project-hygiene archive CLI

**Status:** DONE 2026-05-06

## What shipped

- Extended `lib/project-hygiene.cjs` with `detectArchiveCandidates()` + `applyArchive()` + `cmdProjectHygieneArchive()`

## Behavior

### Detection (default)
- Scans `<workspace>/*/` for sibling repos
- Reads each `<repo>/.planning/PROJECT.md`
- Flags as candidate if:
  - `archived: true` frontmatter, OR
  - last commit timestamp > 6 months old (via `git log -1 --format=%cI`)
- Returns `{ ok, workspace_dir, candidates, scanned, errors }`
- Never mutates

### Apply (`--apply <name>`)
- Moves `<workspace>/<name>/.planning/` to `<workspace>/archived-projects/<name>/.planning/`
- Refuses self-archive (workspace basename match)
- Refuses if archive destination already exists
- Cleans up partial dest on copy failure
- Emits `gh repo archive <repo>` command in result (does NOT execute — preserves user authority over GH-side state)

## CLI

```
df-tools project-hygiene archive                # detect candidates
df-tools project-hygiene archive --apply <name> # apply archive
```

## Tests: 7 pass (Group 22D)
