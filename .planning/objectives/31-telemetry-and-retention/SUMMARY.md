---
objective: 31
slug: telemetry-and-retention
status: complete
work: feature
completed: 2026-08-19
commits: [51c7766, 81796d6]
tests_added: 42
regressions: 0
---

# Objective 31: Telemetry and retention — SUMMARY

This objective is what makes 27–30 verifiable. Without it, the next audit is
another manual forensic exercise against a corpus that is actively being
deleted.

| TRD | Change | Commit |
|---|---|---|
| 31-03 | `df-tools session-audit` — blocking-event classification | `51c7766` |
| 31-02 | `df-tools transcript-export` — compact index before retention | `51c7766` |
| 31-01 | `df-tools telemetry` — one status-facing view with advisories | `81796d6` |

## 31-03 is the acceptance test for the whole programme

Objectives 27–30 claim specific block categories are gone. The only honest
confirmation is to re-measure. `session-audit` classifies blocking events and
separates **`devflow_owned_events`** from the total.

`DEVFLOW_OWNED` deliberately **excludes** `worktree-isolation`. That guard is the
harness's, not DevFlow's — counting it would make this programme look better
than it is. A test pins that exclusion.

Classification runs **only** on structured failed `tool_result`s, never on free
text. That is not incidental: the original audit's first pass keyword-matched
raw transcripts and counted 899 "hook-blocked" hits that were planning documents
*discussing* the gates. A dedicated test asserts prose about a gate is never
counted as a gate event.

## 31-02 — the window was closing

164 sessions between 2026-04-24 and 2026-07-13 are already unrecoverable.
`transcript-export` writes a compact per-session index — identity, span, turn
counts, model mix, block tallies. **60 sessions compressed to 19KB** against
multi-MB sources, preserving what the audit actually needed to reach its
conclusions. `--full` copies raw transcripts when content rather than
measurement is required.

**Bug caught while testing:** the incremental skip compared `row.bytes` (string
*length*) against `statSync().size` (*bytes*). Those differ for multi-byte
UTF-8, so every scheduled re-run re-indexed the whole corpus while appearing to
work — precisely the failure a scheduled job hides best. Both sides now use stat
size, pinned by a test.

## 31-01 — advisories, not counts

Raw numbers nobody reads are how these problems stayed invisible for three
months. `telemetry` turns each real signal into a sentence:

- a gate overridden 5× → *"a gate fought repeatedly is mis-scoped, not a user
  problem"*
- a repeated identical call → *"check for a stuck loop"*
- DevFlow-owned blocks remaining → names the objectives that target them

A clean project says *"nothing needs attention"* and nothing else. Transcript
scanning is opt-in (`--scan`) so the default call stays fast enough for a status
view.

## Evidence

- **Suite: 2839 tests, 2780 pass, 9 fail** — same pre-existing failures in
  `devflow-watch`, `handoff-e2e`, `awareness` (daemon/timing; flake 9–10 between
  runs). Baseline before objective 27: 2681/2621/10.
- **42 tests added, 0 regressions.**

## Important caveat — the fixes are not live yet

`session-audit` run today still reports DevFlow-owned blocks, and that is
expected. Hooks execute from the **plugin cache**
(`~/.claude/plugins/cache/aocyber/devflow/2.4.0/hooks/`), not from this
repository. Every fix in objectives 27–30 lands only when the plugin version is
bumped and `sync-runtime` re-mirrors.

This was demonstrated live: the commit gate blocked a test file during this
objective for containing the raw-commit phrase — exactly the false positive TRD
27-04 fixes — because the cached hook still has the old substring matcher.

**Re-run `df-tools session-audit --since <release-date>` after the version bump.**
That comparison, not this summary, is the programme's real verdict.

## Follow-ups

- Bump the plugin version so 27–30 actually take effect, then re-measure.
- Schedule `transcript-export` so the retention window stops eating evidence.
- Surface `telemetry` output inside `/devflow:status`.
