---
name: handoff
description: |
  Hand off an interactive or shell-flow command to the user's shell so the session keeps flowing.
  Use proactively when a command will need a TTY (doctl auth init, gcloud auth login, gh auth login, op signin, npm login) OR the user's interactive shell environment (nvm use, mise use, conda activate, direnv, pyenv shell).
  When the devflow-watch daemon is running, the handoff is fully non-disruptive — Claude continues executing while the daemon runs the command and returns the result on the next turn.
  Triggers on: "auth init", "log in to", "interactive command", "needs my password", "I need to paste a token", "needs my shell environment", "nvm/mise/conda activate"
argument-hint: <command to run interactively or via user shell>
allowed-tools:
  - Bash
  - Write
---
<objective>
Route a command that needs the user's shell — either because it requires a TTY (auth flows, password prompts) or because it depends on the user's interactive shell env (aliases, mise/nvm/conda activations, sourced rc files) — through that shell without losing session context.

Use this when:
- A command will prompt for credentials, a token, a passphrase, or open a browser flow
- A command depends on shell-init state Claude's sub-shell doesn't have (nvm, mise, conda, direnv, pyenv, asdf, rbenv)
- A previous Bash attempt was denied by `gate-interactive.js` (PreToolUse hook)
- You want to pre-empt the friction before the harness fights an interactive prompt

Out of scope: commands that can run non-interactively via flags or env vars (e.g. `gh auth login --with-token < tokenfile`). Prefer the non-interactive form when available.
</objective>

<execution_context>
$ARGUMENTS
</execution_context>

<process>

<step name="detect_watcher_mode">
This skill behaves differently based on whether the `devflow-watch` daemon is running:

```bash
node ~/.claude/devflow/bin/devflow-watch.cjs status
```

The status JSON has a `running: true|false` field. Branch on that for the next steps.

- If `running: true` → **Approach B (non-disruptive)**: write pending record, continue with other work, expect result on next turn.
- If `running: false` → **Approach A (paste-driven)**: write pending record AND instruct user to paste `! cmd`.
</step>

<step name="record_pending">
Write a pending handoff record:

```bash
node ~/.claude/devflow/bin/df-tools.cjs handoff create "$ARGUMENTS"
```

The command returns JSON with `{id, path, record}`. Capture the `id`.

If df-tools is unavailable, fall back to writing the record manually:

```bash
mkdir -p .devflow-handoff/pending
id="h-$(date +%s)-$RANDOM"
cat > ".devflow-handoff/pending/${id}.json" <<EOF
{"id":"${id}","cmd":"$ARGUMENTS","cwd":"$(pwd)","status":"pending","source":"hook","created_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
echo "$id"
```
</step>

<step name="branch_a_paste">
**ONLY when watcher is NOT running.**

Print the user-facing instruction in a single short message. Use this exact shape so the user can copy with one click:

```
I need to run this in your shell. Please paste:

! $ARGUMENTS

(The `!` prefix runs it in your shell — output returns inline and I'll continue from there. Tip: run `devflow-watch start` once to skip this paste step in future.)
```

Do not retry the command via the Bash tool. Wait for the user's next message containing the command's output.
</step>

<step name="branch_b_continue">
**ONLY when watcher IS running.**

The daemon will pick up the pending record from `.devflow-handoff/pending/<id>.json`, run it in the user's interactive shell, write the result to `.devflow-handoff/done/<id>.json`, and the `route-results.js` UserPromptSubmit hook will inject the result into your next turn as `additionalContext`.

What you should do RIGHT NOW:
1. Acknowledge in one line that the command was queued: e.g. `"Queued \`gh auth login\` to the watcher (handoff id: h-abc123). Continuing with other work."`
2. **Do NOT instruct the user to paste anything.**
3. **Do NOT retry the Bash tool for this command.**
4. Continue with any non-blocking work you can do without the result.
5. On the user's next turn, the result will appear automatically as `additionalContext` from the route-results hook. Pick up whatever depended on this command at that point.
</step>

<step name="resume">
On the user's next turn:

- **Approach B** (most common when watcher is running): the result arrives as `additionalContext` from the route-results hook, marked under `## Deferred command results`. Read the stdout/stderr/exit_code, validate success, and continue the deferred work.
- **Approach A** (fallback): the result is in the user's message body (whatever the harness echoed back from `! cmd`). Same continuation logic.

In either case:
1. Read the output as if you had run the command yourself
2. Continue with whatever follow-on work was queued (e.g. for `doctl auth init`, the next step would be `doctl account get` or `doctl apps list`)
3. If the command failed (`exit_code != 0`) or was cancelled, ask the user what they'd like to do — do not silently retry
4. If the daemon **rejected** the command (status: rejected), do NOT retry — the allowlist excluded it. Ask the user to either run it manually or extend the allowlist.

</step>

</process>

<success_criteria>
- [ ] Pending handoff record written to `.devflow-handoff/pending/<id>.json`
- [ ] Watcher-on path: user gets a one-line "queued" acknowledgement, no paste instruction, no Bash retry
- [ ] Watcher-off path: user receives a one-line copy-paste instruction
- [ ] Session continues from the captured output without the user retyping context
- [ ] No wasted Bash retries against the interactive/shell-flow command
</success_criteria>
