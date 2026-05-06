# Research Tooling

Tool selection priority, verification protocol, and confidence-level conventions for research-time investigations. Used by project-researcher (new-project research) and objective-researcher (per-objective research).

<tool_strategy>

## Tool Priority

| Priority | Tool | Use For | Trust Level |
|----------|------|---------|-------------|
| 1st | Context7 | Library APIs, features, configuration, versions | HIGH |
| 2nd | WebFetch | Official docs/READMEs not in Context7, changelogs | HIGH-MEDIUM |
| 3rd | WebSearch | Ecosystem discovery, community patterns, pitfalls | Needs verification |

## Tool Priority Order

### 1. Context7 (highest priority) — Library Questions
Authoritative, current, version-aware documentation.

```
1. mcp__context7__resolve-library-id with libraryName: "[library]"
2. mcp__context7__query-docs with libraryId: [resolved ID], query: "[question]"
```

Resolve first (don't guess IDs). Use specific queries. Trust over training data.

**Context7 flow:**
1. `mcp__context7__resolve-library-id` with libraryName
2. `mcp__context7__query-docs` with resolved ID + specific query

### 2. Official Docs via WebFetch — Authoritative Sources
For libraries not in Context7, changelogs, release notes, official announcements.

Use exact URLs (not search result pages). Check publication dates. Prefer /docs/ over marketing.

### 3. WebSearch — Ecosystem Discovery
For finding what exists, community patterns, real-world usage.

**Query templates:**
```
Ecosystem: "[tech] best practices [current year]", "[tech] recommended libraries [current year]"
Patterns:  "how to build [type] with [tech]", "[tech] architecture patterns"
Problems:  "[tech] common mistakes", "[tech] gotchas"
```

Always include current year. Use multiple query variations. Mark WebSearch-only findings as LOW confidence.

**WebSearch tips:** Always include current year. Use multiple query variations. Cross-verify with authoritative sources.

### Enhanced Web Search (Brave API)

Check `brave_search` from orchestrator context. If `true`, use Brave Search for higher quality results:

```bash
node ~/.claude/devflow/bin/df-tools.cjs websearch "your query" --limit 10
```

**Options:**
- `--limit N` — Number of results (default: 10)
- `--freshness day|week|month` — Restrict to recent content

If `brave_search: false` (or not set), use built-in WebSearch tool instead.

Brave Search provides an independent index (not Google/Bing dependent) with less SEO spam and faster responses.

## Verification Protocol

**WebSearch findings must be verified:**

```
For each finding:
1. Verify with Context7? YES → HIGH confidence
2. Verify with official docs? YES → MEDIUM confidence
3. Multiple sources agree? YES → Increase one level
   Otherwise → LOW confidence, flag for validation
```

Never present LOW confidence findings as authoritative.

## Confidence Levels

| Level | Sources | Use |
|-------|---------|-----|
| HIGH | Context7, official documentation, official releases | State as fact |
| MEDIUM | WebSearch verified with official source, multiple credible sources agree | State with attribution |
| LOW | WebSearch only, single source, unverified | Flag as needing validation |

**Source priority:** Context7 → Official Docs → Official GitHub → WebSearch (verified) → WebSearch (unverified)

</tool_strategy>

<source_hierarchy>

| Level | Sources | Use |
|-------|---------|-----|
| HIGH | Context7, official docs, official releases | State as fact |
| MEDIUM | WebSearch verified with official source, multiple credible sources | State with attribution |
| LOW | WebSearch only, single source, unverified | Flag as needing validation |

Priority: Context7 > Official Docs > Official GitHub > Verified WebSearch > Unverified WebSearch

</source_hierarchy>

<verification_protocol>

## Research Pitfalls

### Configuration Scope Blindness
**Trap:** Assuming global config means no project-scoping exists
**Prevention:** Verify ALL scopes (global, project, local, workspace)

### Deprecated Features
**Trap:** Old docs → concluding feature doesn't exist
**Prevention:** Check current docs, changelog, version numbers

### Negative Claims Without Evidence
**Trap:** Definitive "X is not possible" without official verification
**Prevention:** Is this in official docs? Checked recent updates? "Didn't find" ≠ "doesn't exist"

### Single Source Reliance
**Trap:** One source for critical claims
**Prevention:** Require official docs + release notes + additional source

## Pre-Submission Checklist

- [ ] All domains investigated (stack, features, architecture, pitfalls)
- [ ] Negative claims verified with official docs
- [ ] Multiple sources for critical claims
- [ ] URLs provided for authoritative sources
- [ ] Publication dates checked (prefer recent/current)
- [ ] Confidence levels assigned honestly
- [ ] "What might I have missed?" review completed

</verification_protocol>
