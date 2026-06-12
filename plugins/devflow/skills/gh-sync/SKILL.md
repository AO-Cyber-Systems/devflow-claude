---
name: gh-sync
description: |
  Sync DevFlow planning state to GitHub — create/update objective issues, generate release notes, or push a single objective's state (body + sticky comment + Project v2 fields).
  Triggers on: "sync to github", "push objectives to github", "github release notes", "sync objective".
argument-hint: "[objectives|release <tag>|status|<objective_id>]"
allowed-tools:
  - Read
  - Bash
  - Write
---
<objective>
One-way push from `.planning/` -> GitHub. Planning files remain authoritative. All operations are no-ops when GitHub integration is disabled or `gh` is not authenticated.

Four modes (parsed from $ARGUMENTS):
- `objectives` (default for empty args) — create/update one issue per roadmap objective, ensure milestone exists
- `release <tag>` — generate release notes from SUMMARY.md files since the previous tag and create or edit the GitHub release
- `status` — report whether GitHub integration is enabled and reachable
- `sync <objective>` (`<objective_id>`, e.g. `01-github-coordination-layer`) — sync ONE objective: rewrite linked issue body to canonical form, upsert sticky state comment in-place, update Project v2 fields (Status, Quarter). Idempotent — safe to run repeatedly.

If $ARGUMENTS does not match `objectives`, `release <tag>`, or `status`, treat it as an objective ID and run the single-objective sync mode.
</objective>

<execution_context>
@~/.claude/.planning/config.json
</execution_context>

<process>
1. Check `.planning/config.json` for `github.enabled` and `github.repo`. If missing or false, ask the user whether to enable now (offer to set both interactively). Do not proceed without explicit confirmation.

2. Run the requested operation:

```bash
# Default — sync all objectives (creates/updates issues + milestone)
node ~/.claude/devflow/bin/df-tools.cjs gh sync-objectives

# Release notes for a tag
node ~/.claude/devflow/bin/df-tools.cjs gh sync-release "$TAG"

# Status check
node ~/.claude/devflow/bin/df-tools.cjs gh status

# Sync a single objective's state to its linked GH issue (idempotent)
node ~/.claude/devflow/bin/df-tools.cjs gh sync "$OBJECTIVE_ID"
```

The single-objective sync (`gh sync <objective_id>`) is idempotent — running it twice in a row produces no semantic difference on GitHub. The sticky comment uses marker `<!-- df:state -->` and is edited in-place (not a new comment). The comment ID is persisted in `.planning/.gh-mapping.json` so subsequent syncs find the same comment to patch.

3. If sync-objectives or the single-objective sync created or updated `.planning/.gh-mapping.json`, commit it:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "chore: sync GitHub mapping" --files .planning/.gh-mapping.json
```

4. Report the result to the user — include issue numbers created/updated, milestone link, release URL, or single-objective sync result (comment action, project fields updated). If the operation was skipped, explain why (disabled, gh not installed, missing github_issue frontmatter, etc.) and how to fix it.
</process>

<context>
- The mapping file `.planning/.gh-mapping.json` is the source of truth for objective-to-issue numbers and sticky comment IDs. Commit it.
- This skill never edits issues that DevFlow did not create — only those tracked in the mapping.
- Failures (network, rate limit, auth expired) never block the user's workflow. They are reported and the planning state remains authoritative.
- For automatic syncing, the new-project workflow already calls `gh sync-objectives` after roadmap creation, and the verifier agent calls `gh comment` on verification gaps. This skill is for manual fire / recovery.
- The single-objective sync (`<objective_id>` mode) requires the objective to have a `github_issue` field in its OBJECTIVE.md frontmatter. If absent, run `objectives` mode first to create the issue, then backfill the `github_issue` field.

## Triggers

Use when the user wants to push DevFlow state to GitHub or recover from a missed sync. Also fires on: "create github issues", "sync state".
</context>
