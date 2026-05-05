---
objective: 05-initiative-context-layer
title: Research pointer — initiative context layer
created: 2026-05-04
status: pointer
---

# Objective 5 — Research

This objective reuses research already captured at the milestone level. No new spike required: the design is fully constrained by the locked decisions in `05-CONTEXT.md` and the upstream research docs.

## Authoritative inputs

- `.planning/research/cross-session-coordination.md` — §"Initiative context layer" (the original design proposal). Schema, planner-consumption flow, "disk-projected from GitHub Epics rather than disk-only" rationale.
- `.planning/research/github-coordination-layer.md` — three-tier hierarchy (Tier 1: Product Roadmap project; Tier 2: `[Roadmap]` parent issues per repo; Tier 3: sub-issues = epics/objectives). Initiative qualification draws on this hierarchy (initiatives ≈ Tier 2 + drafts in Tier 1).

## What was already proven

- **Obj 1 (`lib/gh.cjs`):** `requireGhAuth`, `resolveChain`, `walkProject`, `PRODUCT_ROADMAP_FIELDS._project_id`, `GhAuthError`. All shipped + battle-tested in obj 1 round-trip + obj 2 dogfood.
- **Obj 2 (`lib/awareness.cjs`):** `walkProject` + Project v2 GraphQL pagination patterns. Cassette infrastructure under `__fixtures__/gh-cassettes/product-roadmap-walk.json` already captured live.
- **Obj 4 (`lib/dup-detect.cjs`):** `_setRunFs` injection pattern + `_setRunGh` re-export pattern. Single-module-multi-wave growth pattern (skeleton → extend → extend → final lock).

## What remains genuinely undecided (executor discretion within CONTEXT.md bounds)

1. Whether `_qualifiesAsInitiative` checks title-prefix `[Epic]` OR body marker `**Type:** epic` first. Both work; CONTEXT.md decision #5b says start with title-prefix.
2. Slug normalization for non-ASCII titles (e.g., emoji, accented chars). CONTEXT.md "Discretion areas" recommends NFKD-strip-non-alphanumeric.
3. Whether the readline confirmation in `_confirmDeleteStale` uses Node's built-in `readline` or `process.stdin` raw read. Both work; CONTEXT.md doesn't constrain.
4. Whether single-initiative `--initiative <slug>` mode also runs stale-deletion or skips it (recommend: skip; documented in CONTEXT.md decision #4 step 6).

## What is explicitly OUT of further research

- Bidirectional sync (deferred to v1.2 per ROADMAP).
- Multi-org support (per obj 2 decision #6).
- Webhook listeners for live updates (not in v1.1 scope).
- Auto-promotion of drafts to real issues (separate program work).

## Cross-references

- Obj 1 SUMMARY chain: `01-01` through `01-06` for GH primitive patterns.
- Obj 2 SUMMARY chain: `02-01` through `02-07` for `walkProject` + cassette patterns.
- Obj 3 SUMMARY chain: `03-01` through `03-07` for `_setRunFs` injection + 21-entry export-lock pattern.
- Obj 4 SUMMARY chain: `04-01` through `04-06` for multi-wave file-region ownership + 19-entry export-lock pattern.
