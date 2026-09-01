---
title: "Status and navigation"
weight: 20
lede: "Finding out where you are, what's next, and what everyone else is doing."
---

{{< commands group="status,help,todo,decide,awareness,tui" >}}

## /devflow:status

The consolidated status command. Four behaviours, one entry point.

```text
/devflow:status            # progress + the next action
/devflow:status check      # integrity check across planning files
/devflow:status pause      # save session context before you stop
/devflow:status resume     # restore position and continue
```

Both bare (`status resume`) and flag (`status --resume`) forms are accepted.

**`status`** reads every state file and tells you your position and what to do
next. This is the command for "I have no idea where I left off."

**`check`** validates cross-file consistency — roadmap against summaries, state
against objectives — and reports drift. It is also where an intent-model migration
is offered for projects that predate `kind` and `work`.

**`pause` / `resume`** bracket a `/clear`. Pause writes a resume file capturing
what you were mid-thought on; resume restores it. Resume works without a prior
pause — it reconstructs from state files — but pause preserves the nuance.

## /devflow:todo

```text
/devflow:todo add "rate limiter should use a sliding window, not fixed"
/devflow:todo list
```

`add` captures an idea without derailing what you're doing — it lands in
`.planning/todos/pending/`. `list` is the morning standup: it merges local todos,
GitHub issues and peer activity into one "what should I work on?" view.

## /devflow:decide

```text
/devflow:decide                              # show pending decisions
/devflow:decide DECISION-003 option-b
```

Resolves a parked `checkpoint:decision` and resumes autonomous execution. See
[checkpoints](/docs/concepts/waves/#checkpoints) for when decisions get parked
rather than answered inline.

## /devflow:awareness

```text
/devflow:awareness
/devflow:awareness --peer-only
/devflow:awareness --org-only --quarter Q3
/devflow:awareness --refresh peer
```

Two views, both rendered by default:

- **Peer** — who else is working in this repo, derived from branch activity
  matching `branch_patterns` in config.
- **Org** — progress across the organisation's Product Roadmap project.

The cache is warmed in the background at session start by the
`awareness-cache-populate` hook, with a TTL from `awareness.cache_ttl_minutes`
(10 by default). `--refresh` forces a re-scan; `--no-fetch` skips the git fetch
when you want speed over freshness.

## /devflow:tui

```text
/devflow:tui
/devflow:tui --once        # render one frame and exit
/devflow:tui --no-color
```

A read-only terminal UI with three stacked panels: parallel sessions, the org tree,
and active initiatives. tmux-safe and reflows on narrow terminals.

## /devflow:help

```text
/devflow:help
```

Lists every available command with a one-line description. Useful when you know
DevFlow does the thing but not what it's called.
