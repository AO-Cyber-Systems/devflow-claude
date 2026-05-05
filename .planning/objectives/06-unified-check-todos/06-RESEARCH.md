---
objective: 06-unified-check-todos
status: pointer
created: 2026-05-04
---

# Objective 6 — Research

This objective's design is fully captured in two upstream documents. There is no new research to land here:

1. **`.planning/research/cross-session-coordination.md` §"Unified `df:check-todos`"** — primary source. Defines the five sources, the urgency-lane semantics, the morning-standup persona, and the implementation notes (caching, "new since" tracking deferred to v1.2, recently-touched repos from heartbeat history).

2. **`.planning/research/github-coordination-layer.md`** — supporting source for the GH-issue subset of source #2. Single-org scope decision is consistent with this doc.

Locked decisions (carried into `06-CONTEXT.md`):

- Aggregator pattern — read-only consumer, no source mutation.
- Four urgency lanes (🔥 Blocked-on-you / ⚡ Now / 📋 Soon / 💡 Ideas) — deterministic rules, lexical only.
- Five sources with independent injection hooks (`_setRunFs`, `_setRunGh`, `_setRunPeer`).
- Cache mirrors obj 2 awareness pattern (10-min TTL, `--refresh` forces re-fetch, gitignored namespaced cache file).
- Hard-fail on gh auth in sync mode only; read-only display falls back gracefully.
- Output: terminal-rendered Markdown with emoji urgency markers + per-entry source attribution.
- Token-bounded — top 5 per lane default, `--all` removes truncation, total ≤ 8KB.

No new external libraries. No new GH primitives. Obj 6 is purely a composition layer over obj 1+2+4+5 + existing `cmdListTodos`.
