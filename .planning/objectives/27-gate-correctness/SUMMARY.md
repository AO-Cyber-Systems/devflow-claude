---
objective: 27
slug: gate-correctness
status: complete
work: bugfix
completed: 2026-08-18
commits: [9571a11, c13d5db, 786752d, ec83003, 5d0aed8]
tests_added: 28
regressions: 0
---

# Objective 27: Gate correctness — SUMMARY

Closed the three DevFlow gate defects measured in the Autonomy Blocker Audit and
shipped a mitigation for the one harness defect DevFlow cannot fix.

## What shipped

| TRD | Change | Commit |
|---|---|---|
| 27-01 | Marker resolves across git worktrees; TTL added | `9571a11` |
| 27-02 | Targets outside the project root are never gated | `9571a11` |
| 27-04 | Commit gate matches invocation, not substring | `c13d5db` |
| 27-05 | Executor taught worktree command discipline (F-01 mitigation) | `786752d` |
| 27-01a | TTL anchored to the real clock (regression fix) | `ec83003` |
| 27-06 | Stale hook inventory, model-profiles claim, `/df:` prefix | `5d0aed8` |

## Root cause, confirmed

`.planning/.skill-active` is gitignored (`.gitignore:44`). A linked worktree
checks out all 437 tracked `.planning` files but **never the marker**, and
`gate-edits.js:174` resolved it only from `process.cwd()`. Every worktree
subagent therefore failed the check — 77.2% of all edit-gate denials.

The fix parses the worktree's `.git` file (`gitdir: /main/.git/worktrees/<name>`)
to reach the MAIN checkout's `.planning/`, without shelling out to git. Both
locations are checked on read and written on `--start`.

## Evidence

- **Full suite: 2709 tests, 2649 pass, 10 fail.**
- **Baseline (f29ae6e): 2681 tests, 2621 pass, 10 fail.**
- The same 10 pre-existing failures in `devflow-watch`, `handoff-e2e` and
  `awareness` (daemon/timing tests, untouched by this objective).
- **28 tests added, 0 regressions.**
  - `gate-edits.test.js` 55 → 63 (incl. a real git-worktree integration test that
    reproduces the bug and proves the fix)
  - `gate-commits.test.js` 9 → 25 (incl. the live heredoc repro)
  - `skill-active.test.cjs` 21 → 24 (TTL, legacy markers)

## Two defects found while implementing

Neither was in the plan; both were caught by tests.

1. **macOS symlink mismatch.** `process.cwd()` reports `/private/var/...` while
   tool payloads carry `/var/...`, so the first cut of the outside-root check
   called in-project files "outside" and silently opened the gate. Path
   comparison is now symlink-aware and resolves the deepest existing ancestor
   (the target may not exist yet on a `Write`).
2. **TTL born expired.** `micro.cjs` injects a fixed `now` for a deterministic
   `started_at`; deriving `expires_at` from it made every micro marker
   instantly stale (`no-active-micro`, micro 29/29 → 18/29). `started_at` is a
   record, expiry is a wall-clock bound — they no longer share an anchor.

## Deliberately not done

- **TRD 27-03 — gate posture.** The plan proposed making `.planning/` strict and
  source `warn`. Reading the code showed line 129 **already allows**
  `.planning/**` and line 132 allows all `.md`; the gate only ever denied
  non-markdown source. Inverting that would change deliberate long-standing
  behaviour for every DevFlow user. It is also largely moot now: once the marker
  resolves correctly the gate stops firing on sanctioned agents, so the F-03
  bypass pressure (331 Bash-heredoc workarounds) should fall without a posture
  change. **Recommend re-measuring before deciding** — see the decision note.
- **`verifier.md`** carries the same worktree guidance but was left uncommitted:
  that file holds in-flight `deployment_verification` work unrelated to this
  objective, and `df-tools commit` operates at file granularity.

## Follow-ups

- Re-run the audit scanners after a week of real use to confirm the edit-gate
  and commit-gate categories collapse (this is objective 31's acceptance test).
- Decide TRD 27-03 posture on that data.
- Objective 28 (model tier binding) is unblocked.
