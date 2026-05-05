---
name: initiatives
description: |
  Manage strategic initiative context — sync GitHub Epics into a planner-readable disk projection at ~/.claude/devflow/initiatives/, list cached initiatives, or show a single initiative's body. Initiatives are read by /df:plan-objective at plan time so the planner sees Why + Open questions + Linked sub-issues.
  Use when the user wants to refresh initiative context from GitHub, audit what initiatives the planner can see, or inspect a specific initiative file.
  Triggers on: "sync initiatives", "refresh initiatives", "show initiative", "list initiatives", "what initiatives are loaded", "initiative context".
argument-hint: "[sync [--initiative <slug>] [--project-id <id>] [--force]] | [list [--home <path>]] | [show <slug>]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Three modes (parsed from $ARGUMENTS):

- `sync` — refresh `~/.claude/devflow/initiatives/<slug>.md` from the org Product Roadmap project. Walks GitHub via obj 1's resolveChain + obj 2's walkProject; hard-fails on missing gh auth. Optional `--initiative <slug>` syncs ONE; `--force` bypasses stale-file confirmation prompts.
- `list` — read-only enumeration of cached initiatives. Emits JSON array of {slug, github_issue, key_repos, updated_at}.
- `show <slug>` — read-only detail. Emits the rendered initiative body (Why, Open Questions, Linked Sub-issues).

Initiative files have a locked schema: YAML frontmatter (slug, github_issue, parent_project, key_repos[], updated_at) + body sections (## Why / ## Open Questions / ## Linked Sub-issues / ## Status). The planner reads matching initiatives at plan time and includes them in `<additional_context>` advisory.
</objective>

<execution_context>
@~/.claude/devflow/initiatives/
</execution_context>

<process>
**Run the initiatives CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs initiatives $ARGUMENTS
```

The CLI:

1. Parses subcommand + flags.
2. For `sync`: calls `requireGhAuth(['project', 'read:project', 'repo'])`. On failure, emits structured JSON to stderr + exit 1 with `gh auth refresh -h github.com -s ...` remediation.
3. Walks the org Product Roadmap project; qualifies items per CONTEXT.md decision #5 (sub_issues > 0 OR `[Epic]` title prefix OR draft+In Progress).
4. Writes one file per qualifying item to `~/.claude/devflow/initiatives/<slug>.md` (atomic tmp + rename).
5. Detects stale files (issue CLOSED + not in fresh items); without `--force`, prompts per stale file via TTY readline; with `--force`, deletes unconditionally. Non-TTY environments skip with warning.

For `list` / `show`: file-only, never calls gh, never blocks.

**After the command runs, present the output to the user.** For `sync`, summarize: N written, N deleted, N skipped, N warnings. For `list`, render slug + github_issue. For `show`, print the body verbatim.
</process>

<context>
The initiatives home is `~/.claude/devflow/initiatives/<slug>.md` — global, not per-repo. Single source of truth for every devflow session. Edit by hand if needed; the next `sync` will overwrite (one-way disk → GitHub deferred to v1.2).

Subcommand reference:

- `df-tools initiatives sync [--initiative <slug>] [--project-id <id>] [--force]` — Walk org Product Roadmap, write/refresh initiative files. Hard-fails on missing gh auth.
- `df-tools initiatives list [--home <path>]` — Enumerate cached initiatives. Emits JSON array.
- `df-tools initiatives show <slug> [--home <path>]` — Render single initiative body to stdout.
- `df-tools initiatives format-for-planner --repo <github_repo> [--home <path>]` — Emit planner-formatted markdown for initiatives matching the given repo. Used internally by /df:plan-objective; can be run manually to preview what the planner will see.

Flags:

- `--initiative <slug>` — sync mode only; restrict to one initiative; skips stale-deletion.
- `--project-id <id>` — override default org Product Roadmap project ID.
- `--force` — sync mode only; bypass confirmation for stale-file deletion.
- `--home <path>` — override default `~/.claude/devflow/initiatives/`. Useful for testing or alternate org configurations.
- `--raw` — sync/list/show: emit raw JSON to stdout instead of formatted output.

The planner (/df:plan-objective) consumes initiative context automatically at plan time. No user invocation needed for plan-time integration — but `sync` should be re-run periodically (weekly cadence recommended) to keep the projection fresh.
</context>
