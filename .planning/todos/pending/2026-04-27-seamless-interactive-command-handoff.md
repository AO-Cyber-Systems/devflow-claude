---
created: 2026-04-27T19:10:24.837Z
title: Seamless interactive command handoff
area: tooling
files: []
---

## Problem

When Claude hits a command it can't execute itself — anything needing a TTY, token paste, sudo prompt, or browser-based auth (e.g. `doctl auth init`, `gcloud auth login`, `gh auth login`, `op signin`) — the only current workaround is asking the user to type `! <command>` so the harness runs it in their shell. That breaks flow:

- User has to context-switch from whatever conversation/task is in progress
- The `!` prefix is non-obvious and easy to forget
- For multi-step interactive flows (token paste → confirm → answer prompts), the friction compounds
- If the user pops to another terminal, output doesn't return to the session

The session loses momentum at exactly the moment it shouldn't — when an action is already queued and just needs human hands.

## Solution

Goal: zero-friction handoff so the session keeps flowing while the interactive command happens out-of-band.

Sketches to explore:

1. **Side-channel handoff command** (e.g. `/df:shell` or `/df:handoff`)
   - Claude flags "I need this run interactively" with the exact command
   - Harness drops the user into a marked sub-shell (or notifies them in a separate pane/window)
   - User runs the command; output is captured and streamed back into Claude's context with a tagged marker (e.g. `<handoff-result id="…">…</handoff-result>`)
   - Claude continues from where it left off without the user retyping or pasting

2. **Pending-interactive queue**
   - Claude keeps working on parallelizable tasks while building up a list of "needs your hands" commands
   - User clears the queue on a break; results flow back in batch

3. **`!` prefix wrapper / auto-injection**
   - Tighter integration so that when Claude proposes a `! cmd`, the harness offers a one-tap "run it" affordance and injects the result automatically tagged

Whichever shape lands, the UX target is: user never has to remember a prefix, never has to copy/paste output back, and the conversation doesn't pause for the human-in-the-loop step.

---

## Decision (2026-04-27)

After surveying Claude Code's hook surface, three approaches are viable:

| Approach | Seamlessness | Plugin can ship it? | User setup |
|---|---|---|---|
| **A. PreToolUse deny → guided `!`** | Low (user still types `! cmd`, but Claude orchestrates) | Yes | None |
| **B. Side-channel watcher** | High (user-side daemon runs queued cmds, results auto-inject) | Partially (watcher needs install) | One-time |
| **C. Harness primitive** | Highest (true mid-tool handoff) | No — needs Claude Code itself | N/A |

**Plan:**
- **MVP = Approach A** — works for every user, no install. Solves the immediate doctl/gcloud/gh-auth pain.
- **V2 = Approach B** — opt-in watcher for users who want zero typing.
- **Upstream = Approach C** — file as a Claude Code feature request once demand is proven.

## MVP Implementation (Approach A)

### Components

1. **`plugins/devflow/hooks/gate-interactive.js`** (new, PreToolUse Bash matcher)
   - Pattern-matches against a curated list of interactive-required commands
   - On match: writes a pending handoff record to `.devflow-handoff/pending/<id>.json` and denies the tool call with a structured reason instructing Claude to tell the user `! <cmd>`
   - Pass-through if no match, or if `DEVFLOW_SKIP_INTERACTIVE_GATE=1`
   - Curated list (initial): `doctl auth init` (without `--access-token`), `gcloud auth login`, `gh auth login` (without `--with-token`), `aws configure`, `op signin`, `npm login`, `vault login`, `passwd`

2. **`plugins/devflow/skills/handoff/SKILL.md`** (new)
   - User-invocable as `/devflow:handoff <command>` for proactive flagging
   - Writes pending record, prints the `! cmd` line, instructs Claude on resume protocol

3. **df-tools subcommand: `handoff <create|complete|list>`**
   - `create <cmd>` → writes pending record, returns id
   - `complete <id>` → marks done (used by V2 watcher)
   - `list` → returns pending/done state

4. **Registration** — add `gate-interactive.js` to `hooks.json` under PreToolUse Bash, alongside existing gate-commits and changelog-on-tag

### UX flow (doctl example)

1. Claude calls Bash with `doctl auth init`
2. `gate-interactive.js` denies with: *"Requires a TTY. Tell the user verbatim: `! doctl auth init`. Do not retry Bash; wait for output."*
3. Claude prints to user: *"Please paste this exactly: `! doctl auth init`"*
4. User pastes; the harness runs it via the `!` prefix; output appears in the next message
5. Claude continues with the (now authenticated) follow-on work

### Why this reduces friction

- User no longer has to remember `!` — Claude tells them the exact line
- Claude doesn't waste retries fighting a non-interactive failure
- Pending records leave a trail for V2 watcher to consume later

### Out of scope for MVP

- The watcher daemon (V2)
- Auto-running commands without user paste (V3 / harness-level)
- Detecting interactive commands beyond the curated list (heuristics get noisy fast)
