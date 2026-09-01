---
title: "The handoff watcher"
weight: 30
lede: "A local daemon that runs TTY-bound commands in your shell so Claude never has to stop and ask."
---

Some commands cannot run in an agent's non-interactive Bash. Without a mechanism,
Claude has to stop and ask you to paste `! cmd`, which breaks both its flow and
your concentration.

`devflow-watch` is a small local daemon that closes that loop.

## Quick start

```bash
devflow-watch start      # start the daemon for the current project
devflow-watch status     # verify
devflow-watch stop
```

That is the whole setup. From then on, when Claude tries to run something on the
allowlist, the `gate-interactive` hook queues it instead of failing, the daemon
executes it in your interactive shell, and the `route-results` hook injects the
result into Claude's next turn.

## What gets intercepted

**TTY-interactive auth flows** — cloud and registry CLIs whose login is a browser
or prompt flow: DigitalOcean, GitHub, Google Cloud, AWS (including SSO),
1Password, npm, Vault.

**Password and passphrase prompts** — `passwd`, `ssh-keygen` without `-N ""`.

**Shell-flow tools** that depend on aliases, sourced rc files or shimmed shell
sessions — `nvm use`, `nvm install`, `pyenv shell`, `pyenv install`,
`conda activate`, `direnv exec`, `direnv allow`, `mise use`, `mise install`,
`mise run`, `asdf shell`, `asdf install`, `rbenv shell`.

## How it flows

```text
Claude runs a gated command
        │
        ▼
gate-interactive denies the Bash call
  → writes .devflow-handoff/pending/<id>.json
  → tells Claude "queued for daemon — continue with other work"
        │
        ▼
devflow-watch picks it up, runs it in your interactive shell
  → writes .devflow-handoff/done/<id>.json
        │
        ▼
route-results injects the result on your next prompt
  → Claude resumes without you pasting anything
```

## Without the daemon

Everything still works, just with one manual step. `gate-interactive` prints the
command for you to run with `! cmd`, and Claude picks up the output inline. The
value even in this mode is that Claude recognises which commands need a shell and
does not waste a turn discovering it by failing.

## Configuration

```json
{
  "daemon": {
    "notifications": false,
    "notify_on_start": true,
    "notify_on_complete": true,
    "auto_launch": false,
    "multi_project": false,
    "cross_shell": [],
    "status_line": false
  }
}
```

| Variable | Effect |
|---|---|
| `DEVFLOW_WATCH_ALLOW_FILE` | Path to a custom allowlist |
| `DEVFLOW_HANDOFF_PID_FILE` | Override the PID file location |
| `DEVFLOW_HANDOFF_RESULT_TTL_MS` | How long an unconsumed result stays valid |
| `DEVFLOW_SKIP_INTERACTIVE_GATE=1` | Disable interception entirely |

### Allowlist and deny list

The allowlist is curated rather than open — the daemon runs commands in *your*
shell, so what it will accept is a security boundary, not a convenience setting.
Extend it with your own patterns via `DEVFLOW_WATCH_ALLOW_FILE`. A deny list takes
precedence over the allowlist.

### Auto-launch

The daemon can install itself as a launchd (macOS) or systemd (Linux) unit so it
starts with your session:

```bash
devflow-watch install
devflow-watch uninstall
```

### Multi-project

One daemon can watch several projects, added and removed while it runs.
`devflow-watch status` shows all watched projects with per-project pending and
done counts.

{{< callout title="A known gap" type="warn" >}}
`gate-interactive` matches against the raw command string, so a Bash call whose
*payload* mentions a gated command — a heredoc writing documentation about
`aws sso login`, say — can be intercepted even though nothing interactive would
run.

`gate-commits` solved this class of problem with invocation-aware detection that
strips heredoc bodies and quoted arguments before matching.
`gate-interactive` does not yet do the same. If you hit it, the escape hatch is
`DEVFLOW_SKIP_INTERACTIVE_GATE=1`.
{{< /callout >}}
