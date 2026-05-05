---
objective: 03-planning-time-org-awareness
title: Planning-time org awareness — Research synthesis pointer
created: 2026-05-04
status: pointer
parent_research:
  - .planning/research/github-coordination-layer.md
  - .planning/research/cross-session-coordination.md
---

# Objective 3 — Research

This objective's design was completed during the v1.1 milestone research phase (2026-04-29). The two parent research docs below are the source of truth for the architecture; this file is a pointer doc plus a one-paragraph synthesis of the plan-time-only locked design.

## Source documents

- **`.planning/research/github-coordination-layer.md`** — §"Implications for v1.1 milestone planning" + §"Where org-awareness shows up". The "plan org-aware, execute repo-focused" core principle is stated there. The specific org-awareness consultation surface (sibling repos, eden-libs, org Project) is enumerated under "During planning (`df:plan-objective`, `df:research-objective`)".
- **`.planning/research/cross-session-coordination.md`** — runtime layer. Obj 3 does NOT consume the heartbeat schema (per obj 2 locked decision: heartbeat replaced with read-side aggregation), but the doc's framing of "live state across the org" informs the org-Project-walk reuse in `scanOrgOverlap`.

## Synthesis

Obj 3 surfaces three plan-time signals in a bounded, advisory `## Cross-Repo Considerations` section in CONTEXT.md, written by `/df:research-objective` and read by `/df:plan-objective`. Sibling-repo and eden-libs signals are pure filesystem walks (no auth needed); the org-Project signal reuses obj 2's `scanOrg` (which calls obj 1's `requireGhAuth` — graceful-degraded here, not hard-fail per locked decision #8). Lexical match heuristic only — token-intersection / Jaccard — no LLM scoring. Top 3 per signal source, one line each. Misfiling detection compares `resolveChain`'s resolved `roadmap_issue` repo to the current PROJECT.md repo and surfaces a one-line warning when they diverge. Execution stays unchanged: no runtime org-polling, no execution-time scans. All the brains land at planning time, persisted to CONTEXT.md as durable advisory context.

## Standard Stack (decision matrix)

No new dependencies. Obj 3 is composition over existing modules:

| Component | Source | Status |
|---|---|---|
| `resolveChain` | `lib/gh.cjs` (obj 1) | shipped, in feature/v1.1 |
| `requireGhAuth` | `lib/gh.cjs` (obj 1) | shipped |
| `findRoadmapIssue` | `lib/gh.cjs` (obj 1) | shipped |
| `scanOrg` | `lib/awareness.cjs` (obj 2) | shipped, in feature/v1.1-obj-2-heartbeat |
| `parseStateMd` | `lib/awareness.cjs` (obj 2) | shipped |
| `_setRunGh`, `_setRunGit` | `lib/{gh,awareness}.cjs` (obj 1, 2) | shipped |
| `lib/org-awareness.cjs` | NEW (this objective) | TRDs 03-01 → 03-04, 03-07 |

## Architecture Patterns (lifted from obj 1 + obj 2)

- **Test injection hook pattern** — `_setRunFs` mirrors `_setRunGh`/`_setRunGit`. Production calls `_runFs.readFileSync(...)`; tests inject `(fn) => ({ readFileSync: () => '...' })`. See `lib/awareness.cjs::_setRunGit` for the canonical pattern.
- **Hand-built fixture builders** — extends `lib/__fixtures__/awareness-fixtures.cjs` (obj 2's file). New builders: `buildSiblingRepoTree`, `buildEdenLibsTree`, `buildMockRunFs`. Locked-signature factory pattern: every param optional with default, output contains ONLY explicitly-passed fields.
- **CLI subcommand router pattern** — `lib/org-awareness-cli.cjs` mirrors `lib/awareness-cli.cjs`. Single `case 'org-awareness':` arm in `df-tools.cjs` dispatches to a router function.
- **Region ownership across waves** — TRDs touching `lib/org-awareness.cjs` declare which region they own; CONTEXT.md table is the source of truth. Each wave's TDD cycle gets a stable baseline.

## Don't Hand-Roll

- **Don't reimplement STATE.md parsing** — use `aw.parseStateMd(content)` from obj 2.
- **Don't reimplement `gh api graphql` walks** — use `aw.scanOrg()` from obj 2.
- **Don't reimplement chain resolution** — use `gh.resolveChain(frontmatter, projectCtx)` from obj 1.
- **Don't reimplement frontmatter extraction** — use `lib/frontmatter.cjs::extractFrontmatter` (existing).
- **Don't add an LLM scoring layer** — token-intersection only. Per locked decision #2.

## Common Pitfalls

- **Pitfall: silently throwing on auth failure.** `scanOrgOverlap` MUST catch `GhAuthError` and return `{ skipped: true, ... }`. Hard-failing breaks the whole `/df:research-objective` flow when gh isn't auth'd — that's an obj 1/obj 2 hard-fail pattern but EXPLICITLY INVERTED for obj 3 (locked decision #8).
- **Pitfall: false-positive misfiling.** When `projectCtx.github_repo` is null/empty, do NOT emit a misfiling warning — most legacy repos lack this field. Skip silently.
- **Pitfall: re-walking eden-libs on every test.** Test setups should construct `buildEdenLibsTree()` once per test or once per `before()` block; resolving real fs paths is slow.
- **Pitfall: token extraction noise.** Stop-word stripping is critical — without it, "the auth flow" matches everything. The locked stop-word list in CONTEXT.md must be applied uniformly across all three scanners.

## Code Examples (existing patterns to mirror)

### Test injection hook (mirror this for `_setRunFs`)
```js
// From lib/awareness.cjs (obj 2)
function runGit(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf-8', ... });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: (r.stderr || '').trim() };
}
let _runGit = runGit;
function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGit; }
function _resetGitMock() { _runGit = runGit; }
```

### Graceful auth degradation (mirror this for scanOrgOverlap)
```js
// From lib/awareness-cli.cjs (obj 2 — show command)
try {
  sections.org = aw.scanOrg();
} catch (e) {
  if (e && e.name === 'GhAuthError') {
    sections.org = { items: [], warnings: [`unavailable: ${e.message}. Run: ${e.remediation}`] };
  } else {
    throw e;
  }
}
```

### Lexical token extraction (build-from-scratch for org-awareness.cjs)
```js
// Locked algorithm per CONTEXT.md
const STOP_WORDS = new Set(['a','an','the','of','for','in','on','with','to','from','by','at','is','are','was','were','be','been','being','have','has','had']);

function tokenize(text) {
  if (!text || typeof text !== 'string') return new Set();
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s_/-]/g, ' ')
      .split(/[\s\-_/]+/)
      .filter(t => t.length >= 3 && !STOP_WORDS.has(t))
  );
}
```

## State of the art

- The obj 1 + obj 2 ships locked the planner-readable, advisory pattern (CONTEXT.md as the persistence target). Obj 3 extends that pattern; nothing about the underlying architecture is novel.
- The token-intersection scoring is intentionally crude. Future work (v1.2+) may swap in embeddings, but v1.1 is deterministic-only.

## Open Questions

1. **Should `scanSiblings` consider OPEN GitHub issues, not just SUMMARY.md?**
   - What we know: SUMMARY.md is fixed-format and easy to parse; GH issues need an extra walk.
   - What's unclear: how much value GH issue titles add beyond SUMMARY.md keywords.
   - Recommendation: defer to v1.2; v1.1 ships SUMMARY.md only.
2. **Should the misfiling check also fire when sibling-repo overlap score is very high?**
   - What we know: high-overlap is a misfiling SIGNAL but not proof.
   - What's unclear: false-positive rate.
   - Recommendation: out of scope for v1.1 (would require a calibration phase). Misfiling check is chain-based only.

## Sources

### Primary (HIGH confidence)
- `.planning/research/github-coordination-layer.md` (2026-04-29 spike) — §"Where org-awareness shows up", §"Implications for v1.1 milestone planning"
- `.planning/research/cross-session-coordination.md` (2026-04-29 spike) — §"Mapping to v1.1 milestone objectives"
- `.planning/objectives/01-github-coordination-layer/01-CONTEXT.md` — locked decisions for resolver primitives obj 3 reuses
- `.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md` — locked decisions for `scanOrg` + `_setRunGit` patterns obj 3 reuses
- `plugins/devflow/devflow/bin/lib/gh.cjs`, `plugins/devflow/devflow/bin/lib/awareness.cjs` — concrete shipped surfaces

### Metadata

**Confidence breakdown:**
- Standard stack: HIGH — entirely composition over shipped modules
- Architecture: HIGH — mirrors obj 1 + obj 2 patterns exactly
- Pitfalls: HIGH — both pitfalls (auth degradation, misfiling false-positive) called out in locked decisions

**Research date:** 2026-05-04 (synthesis from 2026-04-29 spike)
**Valid until:** 2026-08-04 (3 months — design is stable; only invalidated by upstream obj 1/obj 2 contract changes)
