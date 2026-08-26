---
objective: 29
slug: context-discipline
status: complete
work: feature
completed: 2026-08-19
commits: [e0a2c81, 173c7f0]
tests_added: 13
regressions: 0
---

# Objective 29: Context discipline — SUMMARY

## What shipped

| TRD | Change | Commit |
|---|---|---|
| 29-01 | Read narrowly — locate with `rg`, read with `offset`/`limit` | `e0a2c81` |
| 29-02 | Prefer targeted `Edit` over writing whole files into tool args | `e0a2c81` |
| 29-03 | Guardrail policy recorded as a pointer, not a section | `173c7f0` |
| 29-04 | `df-tools context` — repeatable composition measurement | `173c7f0` |

## The tool reproduces the audit independently

`df-tools context --limit 150` run against local transcripts:

| Metric | Audit (original script) | `df-tools context` |
|---|---|---|
| `Read` share of result tokens | 49.9% | 53.6% |
| `Read` avg per call | 2,311 | 2,301 |
| `Bash` avg per call | 292 | 334 |
| Images | 1.5% | 1.4% |
| Subagent p50 context | 135K | 117K |
| Main-thread p50 context | 382K | 329K |

Different file sample, same conclusions. The measurement is no longer a
one-off.

It currently reports `read_share_ok: false` at 53.6% against the 40% target.
That is the correct baseline — the prompt changes in 29-01 cannot retroactively
affect historical transcripts. Re-run after a week of real use; that delta is
the acceptance test.

## The trap is now a test, not a footnote

Counting `chars/4` on base64 image payloads over-states images by ~25×. The
first pass at this analysis did exactly that and reported screenshots as **19%
of context**; the true figure is **1.5%**. That error pointed the remediation at
the wrong target.

`context-audit.cjs` prices images per block (~1.5K tokens) by dimension. A
dedicated test asserts a 600KB base64 payload cannot dominate a transcript — if
that test ever passes while base64 is being counted, the tool is lying again.

## Three scope corrections made during planning

1. **No output-cap work.** The plan's instinct was to tighten caps. The data
   says they are not binding: p99 ~6K, largest single result 26K against a 25K
   MCP cap. Tightening buys nothing, so it was dropped and the *reason* recorded
   in CLAUDE.md so it is not re-proposed.
2. **29-04 rescoped.** `hooks/statusline.js` already renders live context usage
   with a scaled bar and colour thresholds — "surface headroom in status" was
   already served. The real gap was repeatability, so 29-04 became the
   measurement tool rather than a duplicate display.
3. **Dependency corrected.** The plan listed 29-02 as depending on TRD 27-03
   (gate posture, deferred). It actually depends on 27-01 — the marker fix is
   what re-permits `Edit`. That landed, so 29-02 was unblocked.

## `CLAUDE.md` audited, not refactored

156 lines / ~3.2K tokens, resident on every turn of every session. Measured
rather than assumed: that is not bloated, so no refactor was manufactured. The
number is now recorded in the file itself so it can be watched, and the new
guidance went to `references/context-discipline.md` — practising what the
objective preaches rather than adding 40 lines to the always-resident file.

## Evidence

- **Suite: 2761 tests, 2701 pass, 10 fail** — the same pre-existing failures in
  `devflow-watch`, `handoff-e2e`, `awareness` (daemon/timing; they flake between
  9 and 10 between runs). Baseline before objective 27: 2681/2621/10.
- **13 tests added, 0 regressions.**

## Left uncommitted, deliberately

`plugins/devflow/agents/verifier.md` carries the same read-discipline block, but
that file holds in-flight `deployment_verification` work of the user's plus the
27-05 worktree guidance. `df-tools commit` is file-granular, so committing would
sweep unrelated work into this objective. Three DevFlow additions are now
pending in that one file — worth landing the user's work soon so they can be
committed together.

## Follow-ups

- Re-run `df-tools context` after real use; `read_share_pct` below 40% is the
  acceptance signal for 29-01.
- Objective 31 should schedule this tool periodically so context growth is
  tracked rather than rediscovered.
