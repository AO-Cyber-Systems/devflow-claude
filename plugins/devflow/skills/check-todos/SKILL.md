---
name: check-todos
description: |
  Morning-standup view across local todos + GitHub issues + active peer sessions + initiative open questions + dup-detect log. Aggregates 5 sources into 4 urgency lanes (🔥 Blocked-on-you / ⚡ Now / 📋 Soon / 💡 Ideas) and renders a single terminal-friendly Markdown view.
  Use when the user wants the "what should I work on right now?" answer, a morning standup view, a cross-source overview of pending work, or to confirm whether they've missed any GH-issue assignments / mentions / review requests.
  Triggers on: "what should I work on?", "what's on my todo list?", "morning standup", "check todos", "what's pending?", "what should I do today?", "any review requests?", "what's blocking me?", "show pending todos", "what's in flight for me?", "any GitHub mentions?".
argument-hint: "[--all] [--refresh] [--lane blocked|now|soon|ideas] [--raw]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Render a single morning-standup Markdown view across 5 sources, grouped by urgency lane:

| Emoji | Lane | Sources |
|---|---|---|
| 🔥 | Blocked-on-you | Active peer sessions blocked on this user + dup-detect coordinate/blocking-execute resolutions (last 7 days) |
| ⚡ | Now | GH issues assigned to `@me` with priority labels + active peer sessions on this repo |
| 📋 | Soon | GH issues mentioning `@me` (not assigned) + review-requested issues + initiative open questions |
| 💡 | Ideas | Local todos + GH issues assigned without priority |

Cache lives at `.planning/.check-todos-cache.json` (gitignored), 10-min TTL per source. `--refresh` forces re-fetch. `--all` removes per-lane truncation (default top 5). `--lane <name>` filters to one lane. `--raw` emits the full aggregate JSON instead of Markdown.

Limitations (locked in v1.1):
- **Single-org scope** — only walks the org configured in PROJECT.md `github_repo`. Cross-org aggregation is v1.2+.
- **Read-only** — no mutation operations. Click into the right tool (gh CLI, editor) to act on entries.
- **gh-auth degrades gracefully** — missing/expired auth surfaces a warning + skips the gh source; other 4 sources still render.
- **Deterministic lane assignment** — no AI/LLM scoring; lane rules are lexical-only.

The legacy local-only browser is preserved as `df-tools list-todos` for users who want the old workflow.
</objective>

<execution_context>
@.planning/STATE.md
@.planning/.check-todos-cache.json
</execution_context>

<process>
**Run the check-todos CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs check-todos $ARGUMENTS
```

The CLI:

1. Parses flags: `--all`, `--refresh`, `--lane <name>`, `--raw`.
2. Calls `aggregate({ projectRoot, refresh })` from `lib/check-todos.cjs`.
3. For each of 5 sources: cache hit (within TTL) serves cached data; cache miss / refresh fetches fresh.
4. `_assignLane` routes each entry into one of 4 lanes deterministically.
5. For default render: `formatCheckTodosMarkdown` produces emoji-prefixed Markdown with per-entry source attribution.
6. For `--raw`: emits the full aggregate JSON.

**After the command runs, present the output to the user verbatim** — show the Markdown so urgency emoji renders. Don't summarize.

If gh auth is missing, the gh source is skipped with a warning footer; the other 4 sources still surface. If the user wants gh issues, run `gh auth refresh -h github.com -s repo` first.
</process>

<context>
The cache file `.planning/.check-todos-cache.json` is gitignored (TRD 06-02). It's safe to ignore accidentally — the gitignore prevents commit.

Subcommand options:
- `df-tools check-todos` — default; Markdown render, top 5 per lane, cached when fresh.
- `df-tools check-todos --all` — show all entries (no truncation).
- `df-tools check-todos --refresh` — force re-fetch all 5 sources.
- `df-tools check-todos --lane <name>` — filter to one lane (`blocked` | `now` | `soon` | `ideas`).
- `df-tools check-todos --raw` — emit full aggregate JSON.

**Read-only contract:** the skill never mutates any source. To act on an entry, the user navigates to the right tool (gh CLI for issues, editor for local todos, coordinate-with-teammate for peer/dup-detect entries).
</context>
