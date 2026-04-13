---
name: gh-sync
description: |
  Sync DevFlow planning state to GitHub — create/update issues for objectives, post verification gaps as comments, generate release notes from SUMMARY files.
  Use when the user wants to push DevFlow state to GitHub or recover from a missed sync.
  Triggers on: "sync to github", "create github issues", "push objectives to github", "github release notes"
argument-hint: "[objectives|release <tag>|status]"
allowed-tools:
  - Read
  - Bash
  - Write
---
<objective>
One-way push from `.planning/` -> GitHub. Planning files remain authoritative. All operations are no-ops when GitHub integration is disabled or `gh` is not authenticated.

Three modes (parsed from $ARGUMENTS):
- `objectives` (default) — create/update one issue per roadmap objective, ensure milestone exists
- `release <tag>` — generate release notes from SUMMARY.md files since the previous tag and create or edit the GitHub release
- `status` — report whether GitHub integration is enabled and reachable
</objective>

<execution_context>
@~/.claude/.planning/config.json
</execution_context>

<process>
1. Check `.planning/config.json` for `github.enabled` and `github.repo`. If missing or false, ask the user whether to enable now (offer to set both interactively). Do not proceed without explicit confirmation.

2. Run the requested operation:

```bash
# Default — sync objectives
node ~/.claude/devflow/bin/df-tools.cjs gh sync-objectives

# Release notes for a tag
node ~/.claude/devflow/bin/df-tools.cjs gh sync-release "$TAG"

# Status check
node ~/.claude/devflow/bin/df-tools.cjs gh status
```

3. If sync-objectives created or updated `.planning/.gh-mapping.json`, commit it:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "chore: sync GitHub mapping" --files .planning/.gh-mapping.json
```

4. Report the result to the user — include issue numbers created/updated, milestone link, or release URL. If the operation was skipped, explain why (disabled, gh not installed, etc.) and how to fix it.
</process>

<context>
- The mapping file `.planning/.gh-mapping.json` is the source of truth for objective-to-issue numbers. Commit it.
- This skill never edits issues that DevFlow did not create — only those tracked in the mapping.
- Failures (network, rate limit, auth expired) never block the user's workflow. They are reported and the planning state remains authoritative.
- For automatic syncing, the new-project workflow already calls `gh sync-objectives` after roadmap creation, and the verifier agent calls `gh comment` on verification gaps. This skill is for manual fire / recovery.
</context>
