---
objective: 19-pty-handoff-watcher
trd: "04"
subsystem: docs
type: standard
tags: [docs, pty, handoff-watcher, user-guide]
dependency_graph:
  requires:
    - docs/handoff-watcher-guide.md (existing structure)
    - 19-01 SUMMARY (pinned node-pty version + spawn-helper gotcha)
  provides:
    - User-facing PTY caveats + platform install notes
    - inputs.secrets[] schema documentation
  affects:
    - End-user installation expectations
    - Developer onboarding (knowing about spawn-helper chmod)
tech_stack:
  added: []
  patterns:
    - Insert-only edits to handoff-watcher-guide.md (preserve all 9 existing top-level sections)
key_files:
  created: []
  modified:
    - docs/handoff-watcher-guide.md
decisions:
  - "Stash CLI documented as 'slot reserved, populating CLI deferred to v1.3' (matches 19-CONTEXT.md locked decision 5; 19-02 not yet executed in Wave 2)"
  - "macOS-first language: macOS x64+arm64 first-class, Linux first-class, Windows best-effort"
  - "spawn-helper chmod gotcha documented under Platform notes (real-world install issue surfaced during 19-01)"
  - "## Future (v1.2+) retitled to ## Future (v1.3+); PTY moved out of future, stash + keyring still pending"
metrics:
  duration_minutes: 7
  completed_date: 2026-05-06
  task_count: 1
  file_count: 1
  test_delta: 0
requirements:
  - DOC-PTY-CAVEATS
---

# Objective 19 TRD 04: Doc Update Summary

User-facing documentation for PTY backing, platform install caveats, and the new `inputs.secrets[]` token-passing schema. Inserts three new sections into `docs/handoff-watcher-guide.md` while preserving all 9 pre-existing sections verbatim.

## What Shipped

Three new sections inserted between `## Configuration` and `## Watcher-off mode (still useful)`:

- `## PTY support (v1.2+)` (top-level) — explains node-pty backing, links sub-sections
- `### Platform notes` — macOS / Linux / Windows table + spawn-helper executable-bit gotcha
- `### Token-passing for prompts` — `inputs.secrets[]` schema with `value_source` enum table

`## Future (v1.2+)` retitled to `## Future (v1.3+)` with stash + keyring backends explicitly listed as pending.

## File Metrics

- Pre-edit: 224 lines
- Post-edit: 334 lines (+110 lines, target was ≥290)
- `node-pty` mentions: 6 (target was ≥3)
- Top-level sections: 11 (was 10; added "PTY support (v1.2+)")
- All 9 pre-existing sections preserved verbatim: What it is, When you'd use it, Quick start, Subcommands, Architecture (brief), Configuration, Watcher-off mode (still useful), Troubleshooting, Security model

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Add PTY support + Platform notes + Token-passing sections | `wc -l docs/handoff-watcher-guide.md` | 0 (334 lines) | PASS |
| 1: Verify section presence | `grep -n "^## PTY support\|^### Platform notes\|^### Token-passing" docs/handoff-watcher-guide.md` | 0 (3 hits) | PASS |
| 1: Verify existing sections preserved | `grep -n "^## What it is\|^## Quick start\|^## Architecture\|^## Configuration\|^## Watcher-off mode\|^## Troubleshooting\|^## Security model" docs/handoff-watcher-guide.md` | 0 (7 hits) | PASS |
| 1: Verify node-pty references | `grep -c "node-pty" docs/handoff-watcher-guide.md` | 0 (6 hits, ≥3 target) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | PASS conditional — same 1864/1866 pass + 2 pre-existing failures as 19-01. Doc-only change has no test impact |

## Deviations from Plan

None — TRD executed as written. Cross-referenced 19-01 SUMMARY for the spawn-helper chmod gotcha (added to Platform notes); did not need to wait for 19-02 SUMMARY because the 19-CONTEXT.md locked decision already specified stash CLI as deferred.

## Auth Gates

None.

## Cross-References

- **19-01 SUMMARY**: pinned `node-pty: 1.1.0` (referenced in Platform notes); spawn-helper executable-bit issue absorbed into the same section as a real-world gotcha with chmod fallback command for `--ignore-scripts` installs
- **19-02 SUMMARY**: not yet generated (Wave 2 pending). Doc accurately describes stash backend as "slot reserved, populating CLI deferred to v1.3" matching the locked decision in 19-CONTEXT.md §4 — no update needed when 19-02 ships unless its scope changes

## Commits

- `88fe5b5` — `docs(19-04): document PTY backing, platform install, and token-passing schema in handoff-watcher-guide`

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (all truths in frontmatter satisfied)
- Gate failures: 2 pre-existing (unrelated to this doc-only change)

## Self-Check: PASSED

- File `docs/handoff-watcher-guide.md`: FOUND (334 lines, +110 from baseline)
- All 9 existing sections preserved (verified via grep)
- New `## PTY support (v1.2+)` section present
- Sub-sections `### Platform notes` + `### Token-passing for prompts` present
- `## Future` retitled to `v1.3+`
- Commit `88fe5b5`: FOUND
