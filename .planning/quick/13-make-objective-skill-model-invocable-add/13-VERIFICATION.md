---
status: passed
task: 13-make-objective-skill-model-invocable-add
date: 2026-08-25
verified_by: orchestrator (verifier agent stopped mid-flow without writing an artifact — see Limits)
method: executed — the CLI was driven against live fixtures, not statically inspected
---

# Verification — quick task 13

**Goal:** make `/devflow:objective` model-invocable, and gate the destructive
`objective remove` cascade behind an explicit `--confirm` (dry-run by default).

**Verdict: PASSED.** Both halves work when driven. No new test failures.

## Golden path — executed, not inspected

Fixture: `01-alpha`, `02-beta`, `03-gamma` with `03-gamma/03-01-JOB.md`.

| Command | Exit | Disk | JSON |
|---|---|---|---|
| `objective remove 2` | 0 | **unchanged** | `dry_run:true, confirmed:false, mutated:false` |
| `objective remove 2 --confirm` | 0 | `02-beta` deleted, `03-gamma`→`02-gamma`, `03-01-JOB.md`→`02-01-JOB.md` | `mutated:true, roadmap_updated:true` |

The dry-run printed the human-readable plan to **stderr** while **stdout stayed pure JSON** —
the split the plan required.

**Consume-don't-recompute invariant proven empirically.** The confirmed run's
`renamed_directories` and `renamed_files` are identical to the dry-run plan's. A printed
plan that diverges from the actual mutation is the exact failure this rail exists to
prevent; it does not diverge.

## Adversarial — gate ordering (the load-bearing case)

Fixture: `01-done` containing `01-01-SUMMARY.md` (an executed job), plus `02-next`.

| Case | Exit | Disk | Verdict |
|---|---|---|---|
| `remove 1` (bare) | 1 | unchanged | executed-jobs rail fires |
| `remove 1 --confirm` | 1 | unchanged | **`--confirm` does NOT bypass the rail** |
| `remove 1 --force` | 0 | unchanged | overrides the rail, still dry-runs |
| `remove 1 --force --confirm` | 0 | mutated + renumbered | both flags required to destroy |

This confirms the ordering the plan called load-bearing: the executed-jobs rail is
evaluated **before** the `--confirm` short-circuit. Had it been the other way round, the
bare case would have exited 0 as a dry-run and silently downgraded a pre-existing refusal.

## Adversarial — boundary and malformed input

| Input | Exit | Disk | stdout |
|---|---|---|---|
| `remove 99` (nonexistent) | 0 | unchanged | valid JSON |
| `remove abc` (non-numeric) | 0 | unchanged | valid JSON |
| `remove --help` (flag-like) | 0 | unchanged | valid JSON |

No stack traces, no state corruption, no bogus objective created.

## Un-gating

- `disable-model-invocation: true` removed from `skills/objective/SKILL.md`.
- `classifier.cjs` `CONSOLIDATED_SKILLS`: `objective` → `userOnly: false`; `milestone` and
  the rest unchanged.
- **Scope fence held** — exactly 7 skills still carry the flag (was 8).
- `AMBIENT_PREAMBLE` moved `/devflow:objective` out of "USER-TYPED ONLY". This string is
  marked LOCKED TEXT; it was edited deliberately because leaving it would ship a session
  preamble contradicting shipped behavior. **Flagged for human review.**

## Tests

Main, post-merge: **2849 tests / 2789 pass / 10 fail / 50 skip.**

All 10 failures are in `devflow-watch`, `handoff-e2e`, and `awareness/scanPeer`.
`git diff --name-only db3ea1b..HEAD` touches none of those files, so **zero new failures**.
The `objective remove` block is green.

Note: the job-checker measured 8 pre-existing failures, the executor 10. These are
daemon/PID/timing tests running 18–72s each; the count varies by environment. The
file-level argument above is what establishes "no regression", not the raw count.

## Known findings, not defects

**Error paths emit no stdout.** On the refusal path, stdout is empty and exit is 1, so
`JSON.parse(stdout)` throws there. Verified this is **global, pre-existing df-tools
behavior** — an unrelated `objective bogus-subcommand` behaves identically. Not introduced
by this change. The stdout-purity requirement holds on all success paths.

## Limits — what was NOT verified

Stating these explicitly so absence does not read as a pass:

- **`partial: true` was never triggered.** Forcing a mid-cascade `renameSync` failure needs
  permission manipulation. The key's presence/absence is coherent across the paths tested,
  but the partial-failure path itself is unexercised.
- **The decimal `07-` sibling case was not driven by hand.** It is covered by automated test
  case 9, which passes, but I did not independently execute it.
- **`renderPlanText` output format is pinned only by test case 11's substring assertion.**
  It settled on `[02-gamma] 03-01-JOB.md -> 02-01-JOB.md`.
- **Two harness errors occurred during verification and were corrected.** (1) An initial
  zsh loop passed `1 --force` as a single argv entry — zsh does not word-split unquoted
  expansions — which produced a spurious "flags absorbed into objective name" reading. (2) A
  later helper executed each mutating command twice. Both were test-harness defects, not
  product defects; the results above are from corrected runs.
- **The verifier subagent did not produce this artifact.** It ran 39 tool calls and stopped
  mid-flow without writing `13-VERIFICATION.md`. This file was written by the orchestrator
  from directly gathered evidence. That failure mode — verification work performed, no
  artifact recorded — is itself the defect this repo's objective 32 is scoped to fix.
