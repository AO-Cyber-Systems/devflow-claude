# Proposal: Seamless Handoff Watcher (Approach B)

Status: in-flight on `feature/seamless-handoff`
Builds on: Approach A (the existing `gate-interactive.js` deny-and-paste flow shipped in 2026-04 commits)
Replaces user-friction: pasted `! cmd` interruption when the harness can't run interactive or shell-flow commands

---

## Goal

When Claude Code attempts a Bash command that needs a TTY or the user's full shell environment (aliases, mise/nvm/conda activations, sourced env, login shell features), Claude must be able to **continue executing** without instructing the user to paste anything. A locally running daemon picks up queued commands, runs them in the user's interactive shell, captures the result, and the result is fed back into Claude's next turn as injected context. Claude resumes the deferred work without the user typing.

This is the foundation feature for devflow-claude's "Claude continues executing" promise.

## Non-goals (deferred to v1.2+)

- OS desktop notifications when a command starts/completes
- Auto-launch of the watcher via launchd / systemd
- Detection of arbitrary "this needs a TTY" commands beyond the curated allowlist (heuristics get noisy fast)
- Support for non-zsh/non-bash shells (fish, nushell, pwsh) — treated as future work; daemon is shell-agnostic at the contract level but ships zsh+bash defaults

## Architecture

```
+--------------------+    1. Bash deny      +-----------------------+
|  Claude Code       | -------------------> | gate-interactive.js   |
|  PreToolUse(Bash)  |                      | detects watcher live? |
+--------------------+                      +-----------+-----------+
                                                        |
                                  watcher live?         | yes -> writes pending record,
                                                        |        denies with "queued" reason
                                                        |
                                                        | no  -> writes pending record,
                                                        |        denies with paste-! reason
                                                        v
                                            .devflow-handoff/pending/<id>.json
                                                        |
                          +-----------------------------+
                          | (out of process)
                          v
+----------------------------+   2. picks up record    +-----------------------+
| devflow-watch daemon       | ---------------------> | shell session         |
| - file-watch pending/      |   3. runs cmd in       | (zsh -i / bash -i)    |
| - validates allowlist      |      interactive shell | - keeps user env      |
| - writes done/<id>.json    |   4. captures stdout/  | - aliases, mise, etc. |
+----------------------------+      stderr/exit       +-----------------------+
                          |
                          v
                .devflow-handoff/done/<id>.json (with consumed: false)
                          |
                          v
+----------------------------+   5. on next user turn
| route-results.js           | <-----------+
| (UserPromptSubmit hook)    |             |
| - reads done/ records      |             |
| - injects additionalContext|             |
| - marks consumed: true     |             |
+----------------------------+
                          |
                          v
                  Claude reads context, resumes deferred work
```

### File-format contracts

#### `pending/<id>.json` (written by hook or `df-tools handoff create`)

```json
{
  "id": "h-<hex8>",
  "cmd": "gh auth login",
  "cwd": "/Users/me/proj",
  "reason": "gh auth login is interactive without --with-token",
  "created_at": "2026-04-29T14:00:00.000Z",
  "status": "pending",
  "source": "hook" | "skill" | "cli",
  "shell": "zsh" | "bash" | null,
  "timeout_ms": 600000
}
```

- `shell` is optional. Default = the user's `$SHELL` or `zsh` on macOS.
- `timeout_ms` defaults to 10 minutes.
- `source` lets the daemon distinguish auto-queued (hook) from user-issued (skill/cli) records — only `hook` records are auto-validated against the allowlist; `skill` and `cli` records also go through the allowlist but with a clearer error message ("you used /devflow:handoff with a non-allowlisted command").

#### `done/<id>.json` (written by daemon)

```json
{
  "id": "h-<hex8>",
  "cmd": "gh auth login",
  "cwd": "/Users/me/proj",
  "reason": "gh auth login is interactive without --with-token",
  "created_at": "2026-04-29T14:00:00.000Z",
  "status": "done" | "failed" | "rejected" | "timeout",
  "source": "hook",
  "shell": "zsh",
  "started_at": "2026-04-29T14:00:01.000Z",
  "completed_at": "2026-04-29T14:00:05.123Z",
  "exit_code": 0,
  "stdout": "Logged in as alice\n",
  "stderr": "",
  "consumed": false
}
```

- `consumed` flips to `true` after the result-injection hook reads it. Records are kept on disk for one session (configurable retention).
- `status: rejected` means the daemon refused the command (not on allowlist, malformed, etc.). `stderr` carries the reason.

#### Daemon PID file: `~/.devflow/devflow-watch.pid`

```json
{
  "pid": 12345,
  "started_at": "2026-04-29T14:00:00.000Z",
  "version": "0.1.0",
  "watching": ["/Users/me/proj/.devflow-handoff/pending"],
  "shell": "zsh"
}
```

Liveness check: PID file exists AND `kill -0 <pid>` succeeds. If PID file exists but the process is dead, callers treat the daemon as not running (fall back to Approach A) and the next `devflow-watch start` cleans the stale file.

### Hook integration points

1. **`gate-interactive.js`** (PreToolUse, Bash) — UPDATED:
   - Detects interactive + shell-flow commands (curated list, expanded)
   - Checks daemon liveness via PID file
   - If daemon live: writes `pending/<id>.json`, denies with reason "queued for daemon; continue with other work; result will arrive in next turn (handoff id: ...)"
   - If daemon not live: writes `pending/<id>.json`, denies with current Approach A reason (paste `! cmd`)
   - Escape hatch unchanged: `DEVFLOW_SKIP_INTERACTIVE_GATE=1`

2. **`route-results.js`** (UserPromptSubmit) — NEW (sibling to `route-intent.js`):
   - Lists `done/<id>.json` records where `consumed: false` AND `cwd` matches a parent of the current `cwd`
   - Builds an `additionalContext` block with each result and instructs Claude to resume the deferred work
   - Marks each record `consumed: true` to prevent re-injection
   - Silent if no unconsumed records or no `.devflow-handoff` dir

3. **No change** to other hooks. `gate-commits`, `gate-edits`, `changelog-on-tag`, `verify-*`, `route-intent` are untouched.

### Shell session management

The technically hard part. Two viable approaches:

| | `child_process.spawn` with `bash -i` / `zsh -i` and stdio pipes | `node-pty` |
|---|---|---|
| Native dep | None (built-in) | Yes (must compile against Node ABI) |
| TTY semantics | Faked (programs that strictly require a TTY won't work) | Real PTY |
| Maintenance | Trivial | High (rebuilds per Node version) |
| Coverage of target commands | ~80% (`gh auth login`, `nvm use`, `mise use`, `direnv exec`, `conda activate`, `aws sso login`, `pyenv shell`) | ~99% |
| Coverage gaps | Programs that read directly from `/dev/tty` (sudo, ssh password prompts, gpg passphrase, full-screen TUIs) | None of the above |

**Decision**: ship with `child_process.spawn` and make `node-pty` an optional upgrade documented in the user guide. The 80% coverage is the entire curated allowlist as of v1.1; the gaps are explicitly out of scope (sudo et al. — never queue these to a long-running daemon for security reasons; `ssh-keygen` we keep on the allowlist but accept it may stall on missing-`-N`, in which case the timeout fires and the user retries).

The daemon spawns one interactive shell per session and dispatches commands via a sentinel-based protocol:

```
echo __DFW_BEGIN_<id>__
<the command>
echo __DFW_END_<id>__:$?
```

The daemon:
1. Writes the wrapper to stdin
2. Reads stdout until it sees `__DFW_BEGIN_<id>__`
3. Captures everything until `__DFW_END_<id>__:<code>`
4. Parses the exit code
5. Writes `done/<id>.json`

Stderr is captured in parallel (separate stream).

### Security / trust model

The daemon refuses any command that does NOT match one of:

- **Curated interactive list** (the existing 9 patterns plus shell-flow additions: `nvm use`, `nvm install`, `pyenv shell`, `pyenv install`, `conda activate`, `direnv exec`, `direnv allow`, `mise use`, `mise install`, `mise run`, `asdf shell`, `asdf install`, `rbenv shell`, `aws sso login`)
- **User-configured allowlist** at `~/.devflow/devflow-watch-allow.json`:
  ```json
  {
    "commands": [
      { "pattern": "^cargo build$", "description": "rust build" }
    ]
  }
  ```
- Records with `source: cli` from the user's own `df-tools handoff create` may bypass the allowlist if the daemon was started with `--trust-user-records` (NOT the default — explicit opt-in)

The daemon will NEVER:

- Run a command not on a known-safe set
- Run as root
- Accept records from outside the watched `pending/` dir
- Run commands as a different user
- Run `sudo`, `su`, `rm -rf /`, or anything containing patterns from a deny list (best-effort guard, not the primary defense — the allowlist is)

### Failure modes & recovery

| Failure | Detection | Recovery |
|---|---|---|
| Daemon crashes | PID file stale | Hook falls back to Approach A on next deny |
| Command times out | `timeout_ms` elapsed | `done/<id>.json` written with `status: timeout`, `exit_code: -1` |
| Shell session dies mid-command | EPIPE on stdin write | Daemon spawns new shell, marks current command failed, continues |
| Disk full when writing done/ | fs error | Log to daemon log, leave pending record in place; next start will retry |
| Allowlist refusal | `validateCommand()` returns reject | Write `done/<id>.json` with `status: rejected`, descriptive `stderr`, hook injects rejection on next turn |
| Two daemons race on same pending/ | filelock contention via `O_EXCL` rename | Loser logs and exits |
| Hook writes pending/ but daemon was killed mid-write | Partial JSON file | Daemon validates JSON on read; skips bad records (logged) |

### Init / teardown lifecycle

```
devflow-watch start [--shell zsh|bash] [--trust-user-records]
  - Validates: PID file absent OR process dead
  - Spawns long-running daemon (forks if --background)
  - Writes ~/.devflow/devflow-watch.pid
  - Begins fs.watch on .devflow-handoff/pending/ (and per-project paths added on demand)

devflow-watch stop
  - Reads PID file
  - kill -TERM <pid>
  - Daemon traps SIGTERM, finishes in-flight command (or kills child if --force), removes PID file, exits cleanly

devflow-watch status
  - Reports: running yes/no, PID, version, uptime, queued count, completed count, last command

devflow-watch logs [--follow] [--tail N]
  - Tails ~/.devflow/devflow-watch.log
```

For v1.1 the daemon runs in foreground by default. `--background` and platform launchers (launchd plist, systemd unit) are v1.2 work.

### Mode detection in `gate-interactive.js`

```
function watcherLive() {
  const pidFile = path.join(os.homedir(), '.devflow', 'devflow-watch.pid');
  if (!fs.existsSync(pidFile)) return false;
  let info; try { info = JSON.parse(fs.readFileSync(pidFile, 'utf8')); } catch { return false; }
  if (!info || !info.pid) return false;
  try { process.kill(info.pid, 0); return true; } catch { return false; }
}
```

When live → the deny reason becomes:

> "Queued for the devflow-watch daemon (handoff id: …). Continue with other work in this turn; the result will arrive as injected context on your next turn. Do NOT instruct the user to paste anything."

When not live → existing Approach A reason (paste `! cmd`).

### Test strategy (per the user's TDD playbook)

- **Unit**: pattern detection, allowlist validation, sentinel parsing, watcher-live detection, result injection content.
- **Integration**: spawn daemon → write pending → assert done/ shape → simulate UserPromptSubmit → assert injection.
- **End-to-end**: full pipeline against a non-interactive command (`echo hello`) to avoid TTY flakiness in CI; the interactive path is exercised by the unit tests for the curated patterns.
- **Fallback**: explicit tests that, with no PID file, the hook returns the Approach A deny message verbatim.
- **Fixtures**: hand-built `makePendingRecord({ overrides })`, `makeDoneRecord({ overrides })`, `makePidFile({ alive: true|false })`. No LLM-generated test data.
