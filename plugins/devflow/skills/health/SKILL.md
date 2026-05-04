---
name: health
description: |
  Check project integrity and fix any issues with the planning files.
  Use when the user wants to check project integrity or troubleshoot DevFlow state.
  Triggers on: "is the project healthy?", "check project health", "any issues?", "something seems wrong with planning"
argument-hint: [--repair] [--migrate] [--dry-run]
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
---
<objective>
Validate `.planning/` directory integrity and report actionable issues. Checks for missing files, invalid configurations, inconsistent state, and orphaned jobs.

**`--migrate` flag:** Run a one-time migration to add `kind` to PROJECT.md and `work` to OBJECTIVE.md frontmatter for projects created before the kind/work intent model. Interactive: prompts for `kind` and (optionally) `default_work` and `work` per objective. Always creates a backup at `.planning/.migrate-backup-{timestamp}/` before writing. Idempotent — safe to run repeatedly.

**`--dry-run` flag:** With `--migrate`, shows planned changes without writing.
</objective>

<execution_context>
@~/.claude/devflow/workflows/health.md
</execution_context>

<process>
**If `--migrate` flag is set:** Use `df-tools migrate plan` to inspect the project, then prompt the user via AskUserQuestion for any missing `kind` (and optionally `default_work` and per-objective `work` choices). Pass collected answers to `df-tools migrate apply` (with `--dry-run` if requested) and report results, including the backup directory path.

**Otherwise:** Execute the health workflow from @~/.claude/devflow/workflows/health.md end-to-end. Parse --repair flag from arguments and pass to workflow.
</process>
