---
objective: 29
slug: context-discipline
work: feature
kind: plugin
status: in-progress
depends_on: [27]
source: Autonomy Blocker Audit (2026-08-18), finding F-10
---

# Objective 29: Context discipline

## Goal

Cut the context DevFlow agents consume, targeting the two components that
actually dominate it — whole-file `Read` calls and full file bodies written into
tool-call arguments — and make the measurement repeatable so the improvement is
observed rather than assumed.

## Evidence

Measured across the local corpus, ~93M tokens of message blocks:

| Component | Share | Tokens |
|---|---|---|
| Tool results (text) | 59.3% | 54.9M |
| **Tool-call inputs** (model-written) | **33.8%** | 31.3M |
| Assistant text | 5.5% | 5.1M |
| Images | 1.5% | 1.4M |

Within tool results, two tools are 94%:

| Tool | Calls | Share of result tokens | Avg/call |
|---|---|---|---|
| `Read` | 12,150 | 49.9% | 2,311 |
| `Bash` | 84,505 | 43.9% | 292 |

`Bash` ran 7× the calls for less total context — roughly **8× leaner per call**.

Context per turn: subagent p50 135K / p90 252K; main-thread p50 382K / p90 751K.

## Scope corrections made during planning

- **No output-cap work.** Result sizes are p50 100, p90 1,110, p99 5,987, largest
  26K. The existing caps are not binding, so tightening them buys nothing. The
  plan's instinct to cap harder was wrong.
- **29-04 rescoped.** `hooks/statusline.js` already renders live context usage
  with a scaled bar and colour thresholds, so "surface headroom in status" is
  already served. The genuine gap is a *repeatable* composition measurement —
  the audit's numbers came from a throwaway script. 29-04 becomes
  `df-tools context`, which doubles as this objective's regression test.
- **Dependency correction.** The plan listed 29-02 as depending on TRD 27-03
  (gate posture), which was deferred. It actually depends on 27-01 — fixing the
  marker is what re-permits `Edit` for in-skill agents. That landed.

## Must-haves

- [ ] Agents locate with grep/rg and read with `offset`/`limit`, not whole files
- [ ] Executor prefers a targeted `Edit` over rewriting a whole file
- [ ] Guardrails documented as deliberate policy, not defaults-by-accident
- [ ] Context composition is measurable on demand and repeatably
- [ ] `npm test` green, no regressions against baseline

## Measurement trap (do not repeat)

`chars/4` over-counts base64 image blocks by ~25×. Price images by dimension
(~1.5K tokens each), not by base64 length. A first pass wrongly reported
screenshots as 19% of context; the corrected figure is 1.5%. The tool built in
29-04 must encode this, or it will reproduce the same wrong answer.
