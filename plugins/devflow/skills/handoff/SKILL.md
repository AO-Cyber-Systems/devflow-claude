---
name: handoff
description: |
  Hand off an interactive command (TTY/token paste/browser auth) to the user's shell so the session keeps flowing.
  Use proactively when a command will need a TTY (doctl auth init, gcloud auth login, gh auth login, op signin, npm login, etc.).
  Triggers on: "auth init", "log in to", "interactive command", "needs my password", "I need to paste a token"
argument-hint: <command to run interactively>
allowed-tools:
  - Bash
  - Write
---
<objective>
Cleanly route a command that requires a TTY through the user's shell via the `!` prefix, without losing session context.

Use this when:
- A command will prompt for credentials, a token, a passphrase, or open a browser flow
- A previous Bash attempt was denied by `gate-interactive.js` (PreToolUse hook)
- You want to pre-empt the friction before the harness fights an interactive prompt

Out of scope: commands that can run non-interactively via flags or env vars (e.g. `gh auth login --with-token < tokenfile`). Prefer the non-interactive form when available.
</objective>

<execution_context>
$ARGUMENTS
</execution_context>

<process>

<step name="record_pending">
Write a pending handoff record so a future side-channel watcher (V2) can pick it up:

```bash
node ~/.claude/devflow/bin/df-tools.cjs handoff create "$ARGUMENTS"
```

The command returns JSON with `{id, path}`. Capture the `id` for the next step.

If df-tools doesn't yet support `handoff create` (early MVP), fall back to writing the record manually:

```bash
mkdir -p .devflow-handoff/pending
id="h-$(date +%s)-$RANDOM"
cat > ".devflow-handoff/pending/${id}.json" <<EOF
{"id":"${id}","cmd":"$ARGUMENTS","cwd":"$(pwd)","status":"pending","created_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
echo "$id"
```
</step>

<step name="instruct_user">
Print the user-facing instruction in a single short message. Use this exact shape so the user can copy with one click:

```
I need to run this interactively. Please paste:

! $ARGUMENTS

(The `!` prefix runs it in your shell — output returns inline and I'll continue from there.)
```

Do not retry the command via the Bash tool. Wait for the user's next message containing the command's output.
</step>

<step name="resume">
When the output appears in the next user message:
1. Read it as if you had run the command yourself
2. Continue with whatever follow-on work was queued (e.g. for `doctl auth init`, the next step would be `doctl account get` or `doctl apps list`)
3. If the command failed or was cancelled, ask the user what they'd like to do — do not silently retry

If the user has a side-channel watcher running (V2), the output may instead arrive as `additionalContext` injected by `handoff-reinject.js` rather than in a user message. Either way, continue from the result.
</step>

</process>

<success_criteria>
- [ ] Pending handoff record written to `.devflow-handoff/pending/<id>.json`
- [ ] User received a one-line copy-paste instruction
- [ ] No wasted Bash retries against the interactive command
- [ ] Session continues from the captured output without the user retyping context
</success_criteria>
