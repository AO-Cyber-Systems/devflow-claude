# 23-05 Before/After Byte Measurements

Token proxy: bytes / 4 (documented approximation, not exact tokenization)

## Before (baseline — pre-edit)

| File | Bytes | Tokens (bytes/4) |
|---|---|---|
| plugins/devflow/agents/planner.md | 50631 | 12658 |
| plugins/devflow/agents/executor.md | 25892 | 6473 |
| **Combined** | **76523** | **19131** |

Captured: 2026-06-12 before any edits to TRD 23-05 sections.

## After (post-edit)

| File | Bytes | Tokens (bytes/4) |
|---|---|---|
| plugins/devflow/agents/planner.md | 46497 | 11624 |
| plugins/devflow/agents/executor.md | 23228 | 5807 |
| **Combined** | **69725** | **17431** |

## Deltas

| File | Before (bytes) | After (bytes) | Delta (bytes) | Delta (tokens) |
|---|---|---|---|---|
| planner.md | 50631 | 46497 | -4134 | -1034 |
| executor.md | 25892 | 23228 | -2664 | -666 |
| **Combined** | **76523** | **69725** | **-6798** | **-1700** |

## Per-Section Breakdown

### planner.md sections removed/condensed

| Section | Approx bytes removed | Notes |
|---|---|---|
| `<checkpoints>` block (87 lines) | ~3200 | Full types/examples/guidelines/anti-patterns replaced with 8-line summary + @-reference |
| `<tdd_integration>` block (58 lines) | ~2200 | Full TDD plan structure + cycle docs replaced with 3-line summary + @-reference |
| Quality Degradation Curve in `<philosophy>` | ~330 | Table moved into scope_estimation; replaced with 1-line pointer |
| Restatement of "Each TRD: 2-3 tasks maximum" bold line | ~60 | Folded into single prose statement in Context Budget Rules |
| **Subtotal** | **~5790** | |
| New content added (summaries + @-references) | ~1656 | |
| **Net planner.md delta** | **~4134** | |

### executor.md sections removed/condensed

| Section | Approx bytes removed | Notes |
|---|---|---|
| `<deviation_rules>` full definitions (Rules 1-4, Rule-4 format, SCOPE BOUNDARY, FIX ATTEMPT LIMIT) | ~3900 | Moved byte-faithful to deviation-rules.md |
| New content added (one-line summaries + RULE PRIORITY kept inline + @-reference) | ~1236 | RULE PRIORITY table + edge cases moved to deviation-rules.md |
| **Net executor.md delta** | **~2664** | |

## Target vs Actual

- Combined target: >=4k tokens (~16,000 bytes)
- Combined actual: 6,798 bytes = ~1,700 tokens
- **Shortfall vs 16,000-byte target: 9,202 bytes (~2,300 tokens)**

### Honest assessment

The research context predicted "~3.2-3.5k [tokens] may be the honest ceiling from the mapped sections alone" (i.e., ~12,800-14,000 bytes). The actual 6,798-byte reduction is below even that range.

The discrepancy is partly because the mapped sections (checkpoints 87 lines, TDD 58 lines, deviation rules ~100 lines) contained multi-line XML examples and code blocks where lines average only ~30-35 bytes each. The research ceiling estimates were more optimistic. Per TRD gotchas, no additional content was cut to hit the number — the shortfall is reported honestly here.

The combined token reduction is 1,700 tokens/spawn — meaningful but below the >=4k target.

