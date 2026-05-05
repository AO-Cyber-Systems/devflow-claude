---
name: sync-roadmap
description: |
  Reconcile ROADMAP.md checkbox state against on-disk SUMMARY.md presence. Default mode silently corrects drift; --dry-run shows the diff without writing; --interactive prompts per change.
  Use when the user wants to update ROADMAP after a TRD ships, audit drift between ROADMAP claims and disk truth, or perform a one-off cleanup.
  Triggers on: "sync roadmap", "reconcile roadmap", "update roadmap checkboxes", "fix roadmap drift", "is the roadmap accurate".
argument-hint: "[--dry-run] [--interactive] [--raw]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Reconcile `.planning/ROADMAP.md` against on-disk reality:

- TRD has `<id>-SUMMARY.md` on disk → mark `[x]`
- TRD has `Self-Check: FAILED` in SUMMARY → mark `[ ]` and append `(failed)` annotation
- TRD listed in ROADMAP but no TRD file on disk → leave alone, surface warning (never auto-delete)

Plus objective-level rollup: when ALL TRDs in an objective are `[x]`, flip the objective's `**Status:**` line to `complete YYYY-MM-DD` (and update Progress table row if present).

Default behavior: walk + write atomically (tmp + rename). `--dry-run` shows the diff without writing. `--interactive` prompts y/N per drift (TTY only; non-TTY falls back to write mode).

Idempotent: running twice produces zero second-run changes.
</objective>

<execution_context>
@.planning/ROADMAP.md
</execution_context>

<process>
**Run the sync-roadmap CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs sync-roadmap $ARGUMENTS
```

The CLI:

1. Parses flags: `--dry-run`, `--interactive`, `--raw`.
2. Calls `reconcile({ projectRoot: cwd, mode })` from `lib/roadmap-reconcile.cjs`.
3. For `--dry-run`: emits structured changes JSON + warnings; never writes.
4. For default (write): atomically rewrites ROADMAP.md via tmp + rename when changes exist.
5. For `--interactive`: dry-run first → prompt y/N per drift → write only accepted changes.
6. Reports summary: N changes, N warnings, mode used.

**After the command runs, present the output to the user** — show changes table (kind / objective / TRD / before → after), warnings if any, and a one-line summary.

If no drift found, say "No drift detected. ROADMAP matches disk truth." and exit.
</process>

<context>
This skill is for manual recovery + post-TRD-ship cleanup. Future enhancement: post-execute hook auto-invocation (out of v1.1 scope). For now, run manually after a TRD ships if you want the ROADMAP checkbox updated automatically instead of editing by hand.

The reconciliation rules (from 09-CONTEXT.md decision #2):

- `trd_summary_exists`: TRD has SUMMARY → `[x]`
- `trd_summary_failed`: SUMMARY contains `Self-Check: FAILED` → `[ ]` + `(failed)`
- `trd_orphan_warning`: TRD in ROADMAP but no TRD file → warning, no auto-flip

Plus objective-level rollup (decision #3) when ALL TRDs are `[x]`.

Limitations:
- **Single ROADMAP only.** No multi-repo, no nested ROADMAPs.
- **No GitHub side effects.** Use `df:gh-sync` for GH state sync.
- **No auto-deletion.** Orphan TRDs surface as warnings only — user manually decides.
- **Forward-only rollup.** Once an objective Status flips to `complete`, the reconciler doesn't auto-revert even if a TRD becomes `[ ] (failed)`. Edit manually.

Note: The skill takes effect on next session restart (sync-runtime hook mirrors it to `~/.claude/devflow/skills/sync-roadmap/SKILL.md`).
</context>
