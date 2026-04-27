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
