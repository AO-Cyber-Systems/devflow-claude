---
name: awareness
description: |
  Show cross-repo awareness: who else is working on what (peer view) and how the work fits into org-wide progress (Product Roadmap view). Renders both views by default.
  Use when the user wants to know if anyone else is working on related stuff, where their work fits in the org's larger progress, or simply "what's in flight".
  Triggers on: "who else is working on this", "what's in flight", "anyone else on this", "show org progress", "show parallel sessions", "what's everyone doing", "what teammates are working on", "is this work overlapping with anyone", "is anyone else on this".
argument-hint: "[--peer-only|--org-only] [--quarter Q] [--product P] [--refresh [peer|org]] [--no-fetch] [--raw]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Render two awareness views side-by-side:

1. **Peer (this repo, git-branch-based)** — branches in `origin/*` with active `.planning/STATE.md` showing teammate's current objective + TRD + last commit.
2. **Org (Product Roadmap project)** — items grouped by Product × Quarter, with each item's direct sub-issues (or task-list bullets when no native sub-issues exist).

Both views are pull-only (no daemon). Cache lives at `.planning/.awareness-cache.json` with 10-minute TTL per section. The cache file is gitignored.

Limitations (locked):
- **Stale = invisible (peer side)**: branches not pushed in 30 days don't show. Push for visibility.
- **Local-repo scope (peer side)**: only branches in THIS repo's origin show — teammates working in other repos appear via the org view, not the peer view.
- **No handoff state**: the `df:handoff` watcher (already shipped) handles "blocked on user" — awareness here is purely informational.
</objective>

<execution_context>
@.planning/STATE.md
@.planning/.awareness-cache.json
</execution_context>

<process>
**Run the awareness CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs awareness show $ARGUMENTS
```

The CLI:
1. Reads `.planning/.awareness-cache.json` (creates if missing).
2. For each section requested (peer, org, or both):
   - If TTL-expired OR `--refresh` flag, re-runs scanner and writes cache.
   - Otherwise, serves from cache.
3. Renders markdown to stdout (or raw JSON with `--raw`).

If org-side gh auth fails:
- With `--org-only`: structured JSON error to stderr + exit 1.
- Default mode (both sections): renders peer-only with a warning about org failure.

**After the command runs, present the output to the user.** Don't summarize — show the markdown verbatim so the user can scan branches + projects.
</process>

<context>
The cache file `.planning/.awareness-cache.json` is gitignored (TRD 02-04). It's safe to commit accidentally — the gitignore prevents it.

Subcommand options:
- `df-tools awareness scan-peer [--no-fetch]` — Walk origin/*, emit JSON. Used directly by tests + the SessionStart cache populator hook.
- `df-tools awareness scan-org` — Walk org Product Roadmap, emit JSON. Requires `gh` auth scopes: project, read:project, repo.
- `df-tools awareness show` — Combined view (this skill's default).

Filter flags:
- `--peer-only` / `--org-only` — Show one section only.
- `--quarter Q2-2026` — Filter org section by quarter (substring match, case-insensitive).
- `--product DevFlow` — Filter org section by product (exact match, case-insensitive).
- `--refresh` — Force re-fetch of both sections (bypass TTL).
- `--refresh peer` / `--refresh org` — Force re-fetch of just one section.
- `--no-fetch` — Skip `git fetch --all --prune` for the peer scanner (offline mode).
- `--raw` — Emit raw JSON to stdout instead of formatted markdown.

This skill is the read-side aggregation layer for cross-repo awareness. It doesn't write anything beyond the cache file. The data lives where it always lived: git refs (peer side) + the org Product Roadmap project (org side).
</context>
