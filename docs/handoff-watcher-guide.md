# Seamless Handoff Watcher — User Guide

## What it is

`devflow-watch` is a small local daemon that lets Claude Code keep executing
when it hits a command it can't run itself. Without the watcher, Claude has
to ask you to paste `! cmd` for any TTY-interactive or shell-flow command
(`gh auth login`, `nvm use 18`, `mise install`, `conda activate myenv`).
That breaks Claude's flow and your concentration.

With the watcher running, Claude just queues the command, continues with
other work, and picks up the result on the next turn — automatically.

## When you'd use it

You'll feel the difference whenever Claude wants to run any of these in your
project:

- **TTY-interactive auth**: `doctl auth init`, `gh auth login`, `gcloud auth login`,
  `aws configure`, `aws sso login`, `op signin`, `npm login`, `vault login`
- **Password / passphrase prompts**: `passwd`, `ssh-keygen` (without `-N ""`)
- **Shell-flow tools** that depend on aliases, sourced rc files, or shimmed
  shell sessions: `nvm use`, `nvm install`, `pyenv shell`, `pyenv install`,
  `conda activate`, `direnv exec`, `direnv allow`, `mise use`, `mise install`,
  `mise run`, `asdf shell`, `asdf install`, `rbenv shell`

You can extend the allowlist with your own patterns (see below).

## Quick start

```bash
# Start the daemon for the current project
devflow-watch start

# Verify it's running
devflow-watch status
```

That's it. Now any time Claude tries to run a command in the curated
allowlist, the `gate-interactive` hook will queue it instead of failing,
the daemon will execute it in your interactive shell, and the result will
flow back to Claude on the next turn.

To stop:

```bash
devflow-watch stop
```

## Subcommands

```
devflow-watch start [--project <path>] [--shell <name>] [--foreground]
  Start the daemon. Default project = cwd. Default shell = $SHELL or bash.
  Default = detached background. --foreground keeps it in this terminal
  (useful when iterating on the daemon itself).

devflow-watch stop
  Send SIGTERM, wait up to 5s for clean exit, remove PID file.
  Idempotent: prints "not running" exit 0 when no daemon is recorded.
  Cleans up stale PID files automatically.

devflow-watch status
  Print JSON status: { running, pid, version, started_at, uptime_ms,
  project, shell, pending_count, done_count, allowlist_size }.

devflow-watch logs [--tail N]
  Read the last N lines of ~/.devflow/devflow-watch.log (default 100).

devflow-watch version
  Print "devflow-watch <version>".
```

## Architecture (brief)

```
┌──────────────────────────┐
│ Claude Code              │
│ ─────────                │  PreToolUse(Bash) on `gh auth login`
│ wants to run gh auth     │ ─────────────────────────────────────┐
└────┬─────────────────────┘                                      │
     │                                                            ▼
     │ ┌────────────────────────────────────────────────────────────┐
     │ │ gate-interactive.js                                        │
     │ │ ─ detects interactive/shell-flow patterns                  │
     │ │ ─ writes .devflow-handoff/pending/<id>.json                │
     │ │ ─ if watcher live: deny "queued for daemon, continue"      │
     │ │   if absent:        deny "tell user `! gh auth login`"     │
     │ └────────────────────────────────────────────────────────────┘
     │
     ▼  (watcher-live path)
┌──────────────────────────┐
│ devflow-watch daemon     │  poll .devflow-handoff/pending/
│ ─────────                │  → validate against allowlist
│ runs `bash -i` session   │  → dispatch to shell session via sentinels
│ writes done records      │  → write .devflow-handoff/done/<id>.json
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│ route-results.js (UserPromptSubmit)                          │
│ ─ scans done/ on user's next turn                            │
│ ─ injects unconsumed records as additionalContext            │
│ ─ marks them consumed so they don't re-inject                │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ Claude reads result      │
│ continues deferred work  │
└──────────────────────────┘
```

## Configuration

### Allowlist

The daemon refuses to run anything outside its combined allowlist. The
default allowlist covers the patterns listed under "When you'd use it"
above. To add your own:

1. Create `~/.devflow/devflow-watch-allow.json`:

```json
{
  "commands": [
    { "pattern": "^my-internal-tool ", "label": "my-tool" },
    { "pattern": "^kubectl-prod ",     "label": "kubectl-prod",
      "skipIf": "--context=test" }
  ]
}
```

2. Restart the daemon (`devflow-watch stop && devflow-watch start`).

3. Verify with `devflow-watch status` — `allowlist_size` will reflect the
   added patterns.

`pattern` is a JS RegExp (anchor with `^` if you want command-position-only).
`skipIf` is optional — if its regex matches, the daemon refuses (treats it
as "non-interactive form not needed for handoff").

### Deny list

Beyond the allowlist, certain commands are **always** rejected as a sanity
check:

- `sudo` (would fail without TTY, and we don't want the daemon to elevate
  silently anyway)
- `su -`
- `rm -rf /` (and direct child of `/`)
- Fork bombs (`:(){ :|: & };:`)
- `curl ... | bash` and `curl ... | sh` (and `wget` variants)

Even if you add these to a custom allowlist, the deny-list still rejects
them.

### Environment overrides

| Variable | Purpose |
|---|---|
| `DEVFLOW_HANDOFF_PID_FILE` | Override `~/.devflow/devflow-watch.pid` location (used by tests) |
| `DEVFLOW_WATCH_ALLOW_FILE` | Override `~/.devflow/devflow-watch-allow.json` path |
| `DEVFLOW_HANDOFF_RESULT_TTL_MS` | route-results TTL for done records (default 1h) |
| `DEVFLOW_SKIP_INTERACTIVE_GATE=1` | Bypass `gate-interactive` hook entirely |
| `DEVFLOW_SKIP_HANDOFF_RESULTS=1` | Bypass `route-results` hook entirely |

## Watcher-off mode (still useful)

If you don't want a daemon running, the seamless-handoff feature still
helps you. Without the watcher:

- `gate-interactive` still detects interactive/shell-flow commands and
  prevents Claude from wasting retries against a no-TTY environment
- The deny message tells Claude the exact `! cmd` line to surface to you
- You paste, output flows back, Claude continues

This is "Approach A" — disruptive (you have to paste) but no install.
"Approach B" (watcher-on) is a strict superset: same detection, smoother
handoff.

## Troubleshooting

**"daemon refused this command"**
- The command isn't in the allowlist. Either run it manually, or extend
  the allowlist (see Configuration above).

**Watcher seems hung**
- Check `devflow-watch logs --tail 50` for the latest activity.
- Some interactive commands genuinely need a real TTY (`sudo`, `gpg`
  passphrase) — these are NOT in the allowlist for that reason.
- If the daemon's bash session crashed, `devflow-watch stop && start` to
  respawn it.

**"already running" when starting**
- Another daemon is recorded as alive. `devflow-watch stop` first, then
  start fresh.

**Stale PID file**
- `devflow-watch start` and `stop` both clean these automatically.
  Manual fix: `rm ~/.devflow/devflow-watch.pid`.

## Security model

- Daemon executes any command matching the allowlist in your interactive
  shell. The allowlist is the trust boundary.
- Default allowlist excludes anything that elevates privileges (`sudo`),
  pipes-from-internet (`curl|bash`), or modifies `/` recursively.
- The daemon does not bind any network sockets — communication is
  file-based (`.devflow-handoff/{pending,done}/`).
- PID file lives in `~/.devflow/devflow-watch.pid` — readable by you only
  (default umask).
- Logs at `~/.devflow/devflow-watch.log`. Rotate manually if needed.

## Future (v1.2+)

Out of scope for v1.1, on the roadmap:

- OS desktop notifications when a command starts / completes
- Auto-launch via launchd / systemd
- Multi-project watching from a single daemon
- Status-line indicator showing pending count
- Cross-shell support (fish, nushell, pwsh)
