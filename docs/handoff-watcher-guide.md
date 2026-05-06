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

devflow-watch add-project <path>
  Add <path> to the running daemon's watching list. Mutates the live PID
  file atomically. Hard-fails (exit 2) if the daemon is not running.

devflow-watch remove-project <path>
  Remove <path> from the watching list. Idempotent (no-op if not watched).
  In-flight dispatches for the removed project complete; subsequent ticks
  skip it.

devflow-watch install-service [--project <path>]
  Install daemon as user-domain background service (launchd on macOS,
  systemd-user on Linux). Atomic + idempotent.

devflow-watch uninstall-service
  Stop, disable, and remove the user-domain service. Idempotent.

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
| `NOTIFIER_DISABLE=1` | Disable OS notifications regardless of `daemon.notifications` config |

### OS notifications

The daemon can dispatch OS desktop notifications when it picks up a handoff
(`dispatch-start`) and when it completes one (`dispatch-complete`). Disabled
by default; opt in via `.planning/config.json`:

```json
{
  "daemon": {
    "notifications": true,
    "notify_on_start": true,
    "notify_on_complete": true
  }
}
```

Notification dispatch uses system binaries — no extra npm dependencies:

| Platform | Tool | Install if missing |
|---|---|---|
| macOS | `osascript` | First-class (system-shipped) |
| Linux | `notify-send` | `apt install libnotify-bin` / `dnf install libnotify` |
| Windows | unsupported in v1.2 | Deferred to v1.3+ |

If the platform's binary is not on PATH, the daemon logs a warning ONCE per
session and disables notifications for the remainder of the session. Set
`NOTIFIER_DISABLE=1` in the daemon's environment to disable notifications
entirely without editing config.

`notify-send` on headless / SSH sessions without `$DISPLAY` may fail with
DBus errors — these are logged per-occurrence (the user may switch to a
local terminal mid-session and want notifications resumed).

macOS notifications are silent in fullscreen mode and Do Not Disturb. This
is a system-level setting, not a daemon limitation.

### Auto-launch (launchd / systemd)

The daemon can register as a user-domain background service that survives
logout and starts automatically on login. Disabled by default; opt in with
the install-service subcommand:

```bash
# macOS / Linux: install + start
devflow-watch install-service [--project <path>]

# Stop + uninstall
devflow-watch uninstall-service

# Combined: uninstall during stop
devflow-watch stop --uninstall-service
```

Service file locations (user domain only — no privilege elevation):

| Platform | Path |
|---|---|
| macOS | `~/Library/LaunchAgents/com.aocyber.devflow-watch.plist` |
| Linux | `~/.config/systemd/user/devflow-watch.service` |
| Windows | unsupported in v1.2 (deferred to v1.3+) |

The service file references the absolute path of the running `devflow-watch.cjs`
binary at install time. If you move the install (e.g. plugin update with a
different path), re-run `install-service`.

**Linux headless / SSH note:** `systemctl --user` requires lingering for the
service to run when no user session is active. Enable once per machine:

```bash
loginctl enable-linger $USER
```

`install-service` does NOT run this for you — it requires sudo and is a
machine-wide setting; document only.

**macOS note:** `launchctl load` is deprecated in 10.10+ in favor of
`launchctl bootstrap gui/$(id -u)`. v1.2 uses `launchctl load` for
backward compat with macOS 10.13+. v1.3+ may switch to bootstrap.

### Multi-project watching

A single daemon can watch multiple project checkout directories
concurrently. The PID file's `watching: []` array holds all watched paths.

```bash
# Start watching multiple projects from the get-go (comma-separated)
devflow-watch start --project /path/to/p1,/path/to/p2,/path/to/p3

# Add a project to a running daemon
devflow-watch add-project /path/to/p4

# Remove a project from a running daemon (in-flight dispatch completes)
devflow-watch remove-project /path/to/p1

# `status` shows all watched projects + per-project pending/done counts
devflow-watch status
```

Dispatch model: round-robin across watched projects, one command at a time
(serial across all projects, not concurrent). `daemon.multi_project: true`
in `.planning/config.json` is informational; the multi-project capability
always works at runtime.

Adding a project the daemon doesn't yet know about does NOT require a
restart. Removing a project that has an in-flight dispatch does NOT abort
the dispatch — it completes and writes its done record; subsequent ticks
skip the removed path.

### Cross-shell support

The daemon dispatches commands through the user's interactive shell. v1.2
supports four shells:

| Shell | Status | Notes |
|---|---|---|
| bash | First-class | Default; tested; preserved byte-identical from v1.1 |
| zsh | First-class | Routes through bash wrapper (zsh is bash-compatible for our sentinel pattern) |
| fish 3.0+ | Supported | Native fish syntax wrapper (`set VAR (cmd)`, `$status`) |
| pwsh 7+ | Supported | PowerShell Core; native pwsh syntax (`$LASTEXITCODE`, `*>`) |
| nushell | Deferred | Not in v1.2 (low usage; revisit in v1.3+) |
| Windows powershell.exe (5.x) | Best-effort | Routes through pwsh wrapper; not in CI matrix |

Auto-detection: the daemon reads `$SHELL` at startup; basename determines
the wrapper. Override with `devflow-watch start --shell fish` (or `pwsh`
etc.).

Unsupported shells throw `UnsupportedShell` at session construction time.
The CLI prints the error and exits with guidance to set `$SHELL` to a
supported value.

The sentinel-fenced output protocol is identical across all shells:

```
__DFW_BEGIN_<id>__
<stdout content>
__DFW_DELIM_<id>__
<stderr content>
__DFW_END_<id>__:<exit_code>
```

The parser in `lib/watcher-shell.cjs` is shell-agnostic — only the
wrapper's `wrapCommand` differs per shell.

**Fish 3.0+ requirement:** The wrapper uses `function fish_prompt; end`
syntax; fish < 3.0 will fail with shell-side syntax errors captured in
the done record's stderr.

**pwsh availability:** Not pre-installed on macOS or Linux. Install via
`brew install --cask powershell` (macOS) or distro package manager (Linux).

## PTY support (v1.2+)

The daemon allocates a real pseudo-terminal (PTY) for the user's shell when
running interactively. This closes the gap that v1.1 had with TTY-required
commands — `gh auth login`, `doctl auth init`, `gcloud auth login`,
`gpg --decrypt`, and similar tools that fail with "unknown terminal" or hang
silently when run on plain pipes.

Under the hood: the daemon uses [`node-pty`](https://www.npmjs.com/package/node-pty)
to allocate the PTY. The sentinel-fenced output protocol is unchanged — PTY
only swaps the dispatch backend, not the wire format the daemon writes to the
`.devflow-handoff/done/<id>.json` records.

The pipe-mode dispatch (used by tests and any caller that opts into
`interactive: false`) is preserved byte-identical. Production daemon defaults
to PTY; unit tests stay on pipes for speed and to avoid native-binary load
in CI environments.

Sub-sections:

- [Platform notes](#platform-notes)
- [Token-passing for prompts](#token-passing-for-prompts)

### Platform notes

`node-pty` is a native Node module with prebuilt binaries published for the
common platforms. `npm install` should fetch a binary for your platform
without a build step. If prebuild-install fails, `npm install` falls back to
compiling from source — which needs the platform's build tools.

| Platform | Status | Build tools needed if prebuilt fails |
|---|---|---|
| macOS (x64 + arm64) | First-class | Xcode Command Line Tools (`xcode-select --install`) |
| Linux (x64 + arm64) | First-class | `build-essential`, `python3` |
| Windows (x64) | Best-effort | `windows-build-tools`; node-pty ships `winpty-agent` automatically |

If your `devflow-watch start` fails with `Error: Cannot find module 'node-pty'`,
run `npm install` again — the prebuilt binary fetch may have been skipped on
the original install. If install genuinely fails (rare on supported
platforms), file an issue with the npm log.

**macOS / Linux gotcha — spawn-helper executable bit**: node-pty's prebuilt
download on darwin-arm64 (and occasionally darwin-x64 / linux-x64) does not
preserve the executable bit on the bundled `spawn-helper` binary. Symptom is
`Error: posix_spawnp failed.` from `pty.spawn(...)`. The repo's `package.json`
includes a `postinstall` script that chmods the helper after `npm install`;
if you ever delete `node_modules` and re-install with `npm install
--ignore-scripts`, run the chmod manually:

```bash
chmod +x node_modules/node-pty/prebuilds/$(node -e 'console.log(process.platform+"-"+process.arch)')/spawn-helper
```

The deny-list (`sudo`, `su -`, `rm -rf /`, fork bombs, `curl|bash`) is
unchanged under PTY. Even though PTY makes `sudo` *runnable* (it has a real
TTY now), the deny-list still rejects it because silent privilege elevation
in a long-running daemon is not a trade-off we want.

### Token-passing for prompts

When a tool the daemon runs prompts for a secret (token, password,
passphrase), the daemon can answer the prompt automatically using the new
optional `inputs.secrets[]` field on a pending record. The hook
(`gate-interactive.js`) doesn't populate this today; it's available for
clients that write pending records directly via `df-tools handoff create
--inputs-json '...'`.

Schema:

```json
{
  "id": "h-abc123",
  "cmd": "doctl auth init",
  "cwd": "/path/to/project",
  "status": "pending",
  "created_at": "...",
  "inputs": {
    "secrets": [
      {
        "prompt_match": "Enter your access token:",
        "value_source": "env",
        "value_ref": "DIGITALOCEAN_TOKEN"
      }
    ]
  }
}
```

`prompt_match` is a JS RegExp source; the daemon compiles it and scans the
accumulated PTY buffer for matches. On match, the daemon writes the resolved
value (followed by carriage-return) to the PTY.

`value_source` enum:

| value_source | v1.2 status | Notes |
|---|---|---|
| `env` | shipped | Resolved from `process.env[value_ref]` at dispatch time. Fails if env var unset/empty. |
| `stash` | slot reserved | In-memory per-handoff stash. Stash-populating CLI deferred to v1.3 — schema accepts the field but the runtime fails the dispatch with a clear error if v1.2 sees `stash` without a populated stash. |
| `keyring` | rejected | Deferred to v1.3+. Daemon refuses pending records that use this. |

Resolved secret values are redacted (replaced with `***REDACTED***`) in the
done record's `stdout` and `stderr` fields before persistence. Only values
≥ 8 characters are redacted to avoid eating legitimate short strings.

If a prompt is matched twice (e.g. tool re-prompts after a wrong answer), the
daemon writes Ctrl+C to the PTY and emits `status: failed` with stderr
`duplicate prompt match for "<value_ref>"`. This prevents stuck dispatches
when the resolved value is wrong.

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

## Future (v1.3+)

Out of scope for v1.2, on the roadmap:

- `stash` value_source backend — populate via `devflow-watch stash add <handoff-id> <key> <value>` CLI (schema slot is reserved in v1.2; runtime rejects it until the populating CLI lands)
- `keyring` value_source backend — read secrets from the OS keyring (macOS Keychain, Linux Secret Service, Windows Credential Manager)
- OS desktop notifications when a command starts / completes
- Auto-launch via launchd / systemd
- Multi-project watching from a single daemon
- Status-line indicator showing pending count
- Cross-shell support (fish, nushell, pwsh)
