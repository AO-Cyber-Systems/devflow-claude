---
title: Org-Context Resolver — Design
date: 2026-04-29
purpose: Foundation service for v1.1 program-aware coordination. Walks an objective to its full org context (parent issue → repo Roadmap → org Product milestone → sibling activity → initiative). Consumed by planner, executor preamble, TUI viewer, df:check-todos, duplicate detector.
status: research
related: github-coordination-layer.md, cross-session-coordination.md
---

# Org-Context Resolver — Design

## Why this is the foundation

Every v1.1 capability needs the same primitive: *given a piece of local work (objective, TRD, current session), produce the full org context above it.*

- **Planner (org-aware)** needs sibling repo activity + initiatives to surface overlap and shared-service opportunities
- **Executor preamble** needs parent issue + milestone for SessionStart context
- **TUI viewer** needs the same data plus heartbeats from other sessions
- **df:check-todos** needs cross-repo issue resolution to merge GH state with local todos
- **df:handoff status-line** needs to surface what session is blocked-on-user, with what context
- **Duplicate detector** needs to know which initiative/milestone/parent the candidate work belongs to so it can score overlap correctly

If every consumer reimplements org-walking, we get drift, inconsistent behavior, and N×M debugging. One shared resolver — single source of truth — keeps the rest small.

## Inputs and outputs

### `df-tools resolver context [opts]`

```bash
df-tools resolver context \
  --objective <id> \             # optional; defaults to current objective from STATE.md
  --trd <path> \                 # optional; pulls TRD-level overrides
  --repo <path> \                # optional; defaults to PWD
  --include <facets> \           # optional; comma-separated. Default: all.
                                 # Facets: parent_issue, milestone, siblings,
                                 #         initiative, heartbeats, todos
  --refresh                      # bypass cache; force fresh GH queries
```

Output (JSON):

```json
{
  "repo": {
    "name": "devflow-claude",
    "owner": "AO-Cyber-Systems",
    "path": "/Users/markemerson/Source/devflow-claude",
    "branch": "feature/v1.1-coordination"
  },
  "objective": {
    "id": "01-github-coordination-layer",
    "title": "GitHub Coordination Layer",
    "kind": "plugin",
    "work": "feature",
    "github_issue": "AO-Cyber-Systems/devflow-claude#42",
    "parent_issue": "AO-Cyber-Systems/devflow#15",
    "trd_count": 5,
    "summary_count": 0
  },
  "parent_issue": {
    "ref": "AO-Cyber-Systems/devflow#15",
    "title": "[Epic] DevFlow Coordination Layer v1.1",
    "state": "open",
    "url": "https://github.com/...",
    "sub_issues": [
      {"ref": "AO-Cyber-Systems/devflow-claude#42", "title": "GitHub Coordination Layer", "state": "open"},
      {"ref": "AO-Cyber-Systems/devflow-claude#43", "title": "Cross-worktree session telemetry", "state": "open"}
    ],
    "progress": {"total": 2, "done": 0, "percent": 0}
  },
  "milestone": {
    "project": "Product Roadmap",
    "project_id": "PVT_kwDODwqLrc4BRsOP",
    "draft_or_issue_ref": "AO-Cyber-Systems/devflow#NN",
    "title": "DevFlow Internal Alpha",
    "product": "DevFlow",
    "quarter": "Q2 2026",
    "status": "Todo",
    "url": "https://github.com/orgs/AO-Cyber-Systems/projects/3/views/1?pane=issue&itemId=NN"
  },
  "siblings": [
    {
      "repo": "aodex",
      "objective": "12-mcp-server-go",
      "session": {
        "session_id": "7c3a-...",
        "developer": "justin",
        "branch": "feature/mcp-go",
        "state": "active",
        "intent": "Port MCP server tools to Go",
        "files_touched": ["cmd/mcp/...", "internal/mcp/..."]
      },
      "match_score": 0.62,
      "match_reasons": ["shares parent_epic devflow#15", "both touch MCP surface"]
    }
  ],
  "initiative": {
    "name": "DevFlow Internal Alpha",
    "github_epic": "AO-Cyber-Systems/devflow#NN",
    "key_repos": ["devflow-claude", "devflow", "aodex"],
    "why": "Get devflow-claude to internal alpha by Q2 2026; coordination layer is gating capability.",
    "open_questions": ["heartbeat storage choice", "duplicate-detection threshold tuning"],
    "recent_context": ["2026-04-29: Mark planning v1.1; Justin on aodex MCP port"]
  },
  "todos": {
    "local_pending": 3,
    "gh_assigned_open": 7,
    "mentioned_unread": 2,
    "review_requested": 1
  },
  "warnings": [],
  "cached_at": "2026-04-29T13:00:00Z",
  "ttl_remaining_seconds": 240
}
```

### Frontmatter conventions

OBJECTIVE.md adds optional fields the resolver reads:

```yaml
---
work: feature
github_issue: AO-Cyber-Systems/devflow-claude#42
parent_issue: AO-Cyber-Systems/devflow#15
initiative: devflow-internal-alpha          # filename in ~/.claude/devflow/initiatives/<name>.md
overrides:
  ...
---
```

TRD frontmatter inherits from objective unless explicitly overridden:

```yaml
---
objective: 01-github-coordination-layer
trd: 01
type: tdd
github_issue: AO-Cyber-Systems/devflow-claude#52    # optional; per-TRD if needed
---
```

## Internal architecture

### Layered cache

```
┌──────────────────────────────────────────┐
│ resolver.context()                       │
│   ↓                                      │
│ tier 1: per-process memoization          │  ms — same call within same df-tools invocation
│   ↓                                      │
│ tier 2: session cache (.devflow-cache/)  │  seconds — across df-tools calls in same session
│   ↓                                      │
│ tier 3: shared cache (~/.devflow/cache/) │  minutes — across sessions on same machine
│   ↓                                      │
│ source of truth:                         │
│   - frontmatter (filesystem, fast)       │
│   - GH API (gh CLI; slow, rate-limited)  │
│   - heartbeat store (git or local file)  │
└──────────────────────────────────────────┘
```

TTL per facet:
- `parent_issue` (issue body, sub-issues list): 5 min — issues change occasionally
- `milestone` (project field values): 15 min — quarterly cadence
- `siblings` (active heartbeats): 30 sec — must be near-real-time
- `initiative` (filesystem-backed): no cache — read fresh
- `todos` (assigned/mentioned counts): 1 min

`--refresh` bypasses tiers 2 and 3.

### Source-of-truth precedence

When the resolver finds conflicting info:

| Conflict | Resolution |
|---|---|
| OBJECTIVE.md `parent_issue` ≠ GH parent's actual sub-issue list | OBJECTIVE.md wins for *this* objective; warn user |
| Initiative `key_repos` doesn't include current repo | Surface in warnings; don't load that initiative for this resolution |
| Heartbeat references objective-id that doesn't exist on disk | Skip that heartbeat; log to debug; assume stale |
| GH issue closed but objective still in-progress on disk | Surface as warning |

Warnings always appear in `result.warnings[]` so the planner can show them to the user.

### Failure modes

| Failure | Behavior |
|---|---|
| `gh` not installed or not authed | Skip GH facets; resolver still returns objective + initiative + heartbeats locally |
| GH rate limit | Fall back to last cache entry; mark `result.warnings[]` |
| Heartbeat store unreachable | Skip siblings facet; mark `result.warnings[]` |
| Frontmatter missing required fields | Best-effort resolution; mark missing fields in `result.warnings[]` |
| Objective dir doesn't exist | Hard error |

The resolver is best-effort by default. Hard errors only on inputs (objective doesn't exist).

### CLI surface for direct queries

For ad-hoc inspection without the full context bundle:

```bash
df-tools resolver parent --objective 01-foo
df-tools resolver siblings --objective 01-foo --threshold strong
df-tools resolver milestone --objective 01-foo
df-tools resolver initiative --name devflow-internal-alpha
df-tools resolver todos --me               # respects current GitHub user
df-tools resolver heartbeats --active
```

Each is a thin slice over the same internal `context()` call.

## Consumer integration

### Planner agent (`plugins/devflow/agents/planner.md`)

Add a new step before TRD generation:

> **Step N — Load org context.** Call `df-tools resolver context --objective <id>`. Read the JSON. Use:
> - `parent_issue` and `milestone` to populate the objective's `[Cross-Repo Considerations]` section
> - `siblings.match_score >= 0.6` entries to surface overlap warnings — recommend Merge / Defer / Coordinate / Proceed-anyway
> - `initiative.open_questions` to bias the questioning phase toward strategic uncertainty
> - `initiative.recent_context` to ground the planner's understanding of why this objective exists
> - If `siblings` has any `match_score >= 0.85`: HALT planning, surface to user with the resolution flow

### Executor preamble (`SessionStart` hook)

When a session starts in a worktree with an active objective:

```
[org context]
You are working on objective 01-github-coordination-layer in devflow-claude.
This objective is part of [Epic] DevFlow Coordination Layer v1.1
(devflow#15 — 2/8 sub-issues done) which serves the
DevFlow Internal Alpha milestone (Q2 2026, In Progress).

Sibling activity: justin's session on aodex#12 (MCP Go port) overlaps
on parent epic. files_touched diverges (cmd/mcp/...). Score: 0.62 — advisory.
```

Generated from `resolver context --include parent_issue,milestone,siblings`.

### df:check-todos

Calls `resolver todos` for GH counts + reads local `.planning/todos/` + reads `resolver heartbeats --waiting-on-me`. Merges into urgency lanes.

### TUI viewer (`devflow watch` — separate from seamless-handoff watcher)

Polls `resolver heartbeats --active` every 5 seconds. Renders sessions grouped by `parent_issue` so you see the program tree, not just a flat list of sessions.

### Duplicate detector

`resolver siblings` returns scored matches. Detector applies thresholds and routes to resolution flow.

## Build order within v1.1

The resolver is the **first** v1.1 deliverable. Other objectives depend on it.

1. **TRD: resolver foundation** — `resolver context` returning local-only facets (objective, frontmatter, initiative). No GH yet.
2. **TRD: GH integration** — adds `parent_issue`, `milestone`, `todos` facets via `gh` CLI. Includes layered cache.
3. **TRD: heartbeat integration** — adds `siblings` facet. Depends on heartbeat store from objective 2.
4. **TRD: consumer wiring** — planner agent, SessionStart hook, df:check-todos all switch to using resolver.

After TRD 4 lands, downstream objectives (duplicate detector, TUI viewer, df:handoff status-line) all use resolver as their data layer.

## Performance targets

- Local-only resolution (no GH): < 50ms
- Full resolution with warm cache: < 200ms
- Full resolution with cold cache (one round of GH calls): < 2s
- `--refresh` (cold): < 5s

If GH calls take longer, the resolver returns partial result with `warnings: ["GH timeout — siblings facet stale"]` rather than hanging.

## Open design questions for the planner

1. **Where does the resolver cache live?** Options: `.devflow-cache/` per-project (gitignored), `~/.devflow/cache/<project>/` (machine-global), `~/.devflow/cache.sqlite` (single sqlite for all projects). Recommendation: per-project gitignored for tier 2; machine-global for tier 3. Avoid sqlite for v1.1 — file-per-key is simpler.
2. **Should the resolver call also write heartbeats?** Or strictly read-only? Recommendation: read-only. Heartbeat writes belong to the heartbeat skill / SessionStart hook, not the resolver.
3. **What's the GH auth flow?** `gh auth status` should be called at resolver init to detect and warn early. If unauth'd, GH facets degrade gracefully.
4. **Does the resolver run on remote-execution sessions** (e.g., Claude Code via Claude Desktop with no local FS)? If yes, `gh` may not be available. Defer this — v1.1 assumes local sessions; remote support is v1.2+.
5. **`work` and `kind` are upstream from this proposal** — resolver assumes `proposal/kind-and-work` has merged. Order this work after that merge lands on main.
6. **How does the duplicate detector get tuned?** `Proceed anyway` overrides should log somewhere (`~/.devflow/detector-tuning.jsonl`?) for offline analysis. Defer to detector's own TRD.

## Why this is a single objective, not a library

It would be tempting to extract this as `eden-libs/coordination-resolver` or similar. Don't — yet. Reasons:

- Resolver is tightly coupled to devflow-claude's frontmatter conventions, planning state layout, and skill ecosystem
- Other AO-Cyber repos consume the *output* (via `gh` issues and heartbeat store) but don't need the resolver code
- Premature extraction adds versioning overhead with one consumer

Revisit at v1.3+ if a non-devflow-claude tool (e.g., Hub Flutter app) needs to walk the same hierarchy independently.

## Validation

The resolver is the kind of code where unit tests over schemas + integration tests over real GH responses both matter:

- **Unit (TDD)**: per-facet resolution logic, conflict resolution, cache TTL, warnings emission, schema shape
- **Fixture-based integration**: hand-built GH response cassettes (gh CLI output captured to JSON files) replay through the resolver
- **End-to-end**: a test fixture project with two heartbeats, one frontmatter-linked GH issue, one initiative file → assert full resolver output matches a golden snapshot

Multitenancy guard not applicable (single-user CLI tool).

## Out of scope

- Mutation API (writing back to GH issues, heartbeats, initiatives) — separate skills/commands own that
- Org-Project mutations beyond field reads — handled by `df:gh-sync` and `df:initiatives sync`
- Authentication management — relies on `gh` CLI being authed
- Multi-tenant or multi-org support — AO-Cyber-Systems is the single org for v1.1
