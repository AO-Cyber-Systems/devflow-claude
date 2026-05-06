# Objective 20 — Daemon polish bundle (RESEARCH)

**Status:** Standing-knowledge; confirmed against existing codebase + CLAUDE.md TDD playbook.

## 1. Standard Stack (locked)

| Concern | Library / Tool | Version | Source |
|---|---|---|---|
| OS notifications (macOS) | `osascript -e 'display notification "msg" with title "DevFlow Watch"'` | system | macOS 10.9+ |
| OS notifications (Linux) | `notify-send "title" "body"` | system | `libnotify-bin` (apt) / `libnotify` (dnf) — common default |
| Auto-launch (macOS) | `launchctl load ~/Library/LaunchAgents/<plist>` | system | LaunchAgents per-user domain |
| Auto-launch (Linux) | `systemctl --user enable devflow-watch.service` | system | `systemd --user` (default on most distros 2018+) |
| Service file format (macOS) | XML plist, BunCom format | spec | Apple `launchd.plist(5)` |
| Service file format (Linux) | `[Unit]/[Service]/[Install]` ini-style | spec | `systemd.service(5)` |
| Cross-shell — fish | fish 3.0+ | system | shipping default for fish-on-PATH detection |
| Cross-shell — PowerShell | pwsh 7.0+ | system | not pre-installed on macOS/Linux; user opt-in |
| Test runner | Node native `node --test` | runtime | matches existing pattern |
| Mock subprocess | Executable shim + PATH override | runtime | obj 19 TRD 19-05 fixture pattern |

NO new npm dependencies. All polish features use OS-level binaries (osascript, notify-send, launchctl, systemctl) invoked via `child_process.execFile` / `spawn`.

## 2. Architecture Patterns

### Pattern A: Subprocess shim with marker-file effect (testable side effects)

For OS notifications — since we don't want CI to actually pop a notification, tests use an executable shim that drops a marker file:

```js
// __fixtures__/osascript-shim.js
#!/usr/bin/env node
const fs = require('fs');
const out = process.env.OSASCRIPT_SHIM_MARKER_FILE;
if (out) fs.appendFileSync(out, JSON.stringify({ argv: process.argv.slice(2), env: { TITLE: process.env.NOTIFY_TITLE } }) + '\n');
process.exit(0);

// Test setup
const shimDir = path.join(__dirname, '__fixtures__');
process.env.PATH = `${shimDir}:${process.env.PATH}`;  // shim wins resolution
process.env.OSASCRIPT_SHIM_MARKER_FILE = path.join(tmpDir, 'notify-marker.jsonl');
// run code under test...
const calls = fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
assert.equal(calls.length, 1);
assert.match(calls[0].argv.join(' '), /display notification/);
```

Same pattern works for `notify-send`, `launchctl`, `systemctl`. Each shim is ~10 lines.

### Pattern B: launchd plist generation

Minimal user-domain LaunchAgent:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aocyber.devflow-watch</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>/path/to/devflow-watch.cjs</string>
    <string>start</string>
    <string>--foreground</string>
    <string>--project</string>
    <string>/path/to/project</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>/path/to/HOME/.devflow/launchd-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/path/to/HOME/.devflow/launchd-stderr.log</string>
</dict>
</plist>
```

`KeepAlive.SuccessfulExit=false` means: respawn on failure, but don't loop on clean exit. (Standard pattern for daemons that may be stopped intentionally via `launchctl unload`.)

Generation: simple template-string interpolation. NO XML library needed — values are interpolated and escaped via `&amp;` / `&lt;` / `&gt;` / `&apos;` / `&quot;` (5 entities, ~5 LOC for `xmlEscape()`).

### Pattern C: systemd unit file

Minimal `~/.config/systemd/user/devflow-watch.service`:

```ini
[Unit]
Description=DevFlow Watch — handoff daemon
After=default.target

[Service]
Type=simple
ExecStart=/usr/bin/env node /path/to/devflow-watch.cjs start --foreground --project /path/to/project
Restart=on-failure
RestartSec=5
StandardOutput=append:%h/.devflow/systemd-stdout.log
StandardError=append:%h/.devflow/systemd-stderr.log

[Install]
WantedBy=default.target
```

`%h` = user home directory (systemd specifier). `Type=simple` (foreground daemon). `Restart=on-failure` matches launchd's `KeepAlive.SuccessfulExit=false` semantics.

Install flow:
```bash
systemctl --user daemon-reload
systemctl --user enable devflow-watch.service
systemctl --user start devflow-watch.service
```

Uninstall:
```bash
systemctl --user stop devflow-watch.service
systemctl --user disable devflow-watch.service
rm ~/.config/systemd/user/devflow-watch.service
systemctl --user daemon-reload
```

### Pattern D: PID file atomic mutation

Today's `watcher-state.cjs` writes the PID file once at daemon start. For multi-project watching we need to ADD/REMOVE entries from `watching: []` while the daemon is alive. Pattern:

```js
function mutateWatching(mutator) {
  const file = pidFilePath();
  const current = readPidFile();
  if (!current) throw new Error('no PID file');
  const next = mutator({ ...current, watching: [...(current.watching || [])] });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return next;
}
// caller:
mutateWatching((p) => { p.watching.push(newPath); return p; });
```

Atomic via `tmp + rename` — same pattern as `writeDoneRecord` in `watcher-daemon.cjs:62-71` (already proven). NO file locking — single daemon process is the only writer; CLI invocations of `add-project` mutate via the daemon over IPC OR by editing the file directly (the running daemon re-reads on every poll iteration; mutating the file directly is the simpler v1.2 path).

Read-on-every-poll is the simplest design: the daemon re-reads `watching: []` at the top of each `tick()` and processes pending dirs in the current list. If a project is removed mid-flight, the in-flight dispatch completes; subsequent ticks skip the removed project.

### Pattern E: Cross-shell wrapper module shape

Per-shell wrapper exports:

```js
// lib/wrappers/bash.cjs
module.exports = {
  shellName: 'bash',
  shellArgs: (interactive) => interactive ? ['-i'] : [],
  // Sentinel-fenced wrapper — same protocol as today's watcher-shell.cjs
  wrapCommand: (cmd, id) => [
    '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
    `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
    '__DFW_RC=$?',
    `echo __DFW_BEGIN_${id}__`,
    'cat $__DFW_OUT 2>/dev/null',
    `echo __DFW_DELIM_${id}__`,
    'cat $__DFW_ERR 2>/dev/null',
    `echo __DFW_END_${id}__:$__DFW_RC`,
    'rm -f $__DFW_OUT $__DFW_ERR',
    '',
  ].join('\n'),  // bash uses \n; PTY mode separately handles \r conversion
  lineSep: '\n',
  // Init lines sent at session spawn to quiet PS1 / job control
  initLines: [
    'set +o monitor 2>/dev/null',
    "PS1=''",
    "PS2=''",
    "PROMPT_COMMAND=''",
    'unset PROMPT_DIRTRIM',
  ],
};
```

Fish equivalent (different syntax — no `$?` / `set +o monitor` / `PROMPT_COMMAND` etc.):

```fish
# fish doesn't have $?; use $status
set __DFW_OUT (mktemp 2>/dev/null); set __DFW_ERR (mktemp 2>/dev/null)
begin; <cmd>; end > $__DFW_OUT 2> $__DFW_ERR
set __DFW_RC $status
echo __DFW_BEGIN_<id>__
cat $__DFW_OUT 2>/dev/null
echo __DFW_DELIM_<id>__
cat $__DFW_ERR 2>/dev/null
echo __DFW_END_<id>__:$__DFW_RC
rm -f $__DFW_OUT $__DFW_ERR
```

Fish init: `function fish_prompt; end` (silence prompt) + `set fish_greeting ''` (silence greeting).

PowerShell equivalent (Windows-flavored even on macOS/Linux pwsh; very different):

```pwsh
$dfwOut = [System.IO.Path]::GetTempFileName()
$dfwErr = [System.IO.Path]::GetTempFileName()
& { <cmd> } *> $dfwOut 2> $dfwErr
$dfwRc = $LASTEXITCODE
Write-Output "__DFW_BEGIN_<id>__"
Get-Content $dfwOut -ErrorAction SilentlyContinue
Write-Output "__DFW_DELIM_<id>__"
Get-Content $dfwErr -ErrorAction SilentlyContinue
Write-Output "__DFW_END_<id>__`:$dfwRc"
Remove-Item $dfwOut, $dfwErr -Force -ErrorAction SilentlyContinue
```

PowerShell init: `$Function:prompt = { '' }` (silence prompt) + `$global:ProgressPreference = 'SilentlyContinue'`.

The factory `getWrapper(shellName)` returns the appropriate module based on shell basename detection. `watcher-shell.cjs` consumes the wrapper interface unchanged — sentinel parsing remains shell-agnostic (BEGIN/DELIM/END are plain ASCII on dedicated lines in all three shells).

### Pattern F: Status-line PID-file read

`hooks/statusline.js` already reads JSON files (todos, df-update-check.json). Adding PID-file read fits the same pattern:

```js
// after existing dfUpdate block in statusline.js
let watcherStatus = '';
try {
  const state = require(path.join(homeDir, '.claude', 'devflow', 'bin', 'lib', 'watcher-state.cjs'));
  if (state.isWatcherLive()) {
    const info = state.readPidFile();
    const watching = Array.isArray(info.watching) ? info.watching : [];
    let pendingCount = 0;
    for (const projRoot of watching) {
      const pendDir = path.join(projRoot, '.devflow-handoff', 'pending');
      try {
        if (fs.existsSync(pendDir)) {
          pendingCount += fs.readdirSync(pendDir).filter(f => f.endsWith('.json')).length;
        }
      } catch {}
    }
    watcherStatus = pendingCount > 0
      ? `\x1b[33m⏸ ${pendingCount} pending\x1b[0m │ `
      : `\x1b[32m▶ watcher\x1b[0m │ `;
  }
} catch {
  // Watcher state module not loadable (devflow not installed) — no-op
}
```

Gating: `daemon.status_line` flag. Read config.json once per render (cheap; existing statusline already reads multiple JSON files). If config missing or flag false, skip the entire watcher block — zero cost when disabled.

## 3. Don't Hand-Roll

| Feature | Use this, NOT this | Why |
|---|---|---|
| OS notifications | `osascript` / `notify-send` (system), NOT `node-notifier` npm | One less native dep; reliability (node-notifier has macOS Catalina+ bundle-id issues) |
| Plist parsing | NEVER parse plist (we only generate) — template string + xmlEscape | Avoid `plist` npm dep; we never read user-edited plists |
| Systemd unit parsing | NEVER parse — generate from template | Same; we own the file shape |
| PID file mutation | Atomic tmp+rename (existing pattern in `watcher-daemon.cjs`) | NO `lockfile` lib; daemon is sole writer |
| Subprocess invocation in tests | Executable shim + PATH override | NO `sinon` / `proxyquire`; existing project pattern |
| Statusline render | Extend existing `hooks/statusline.js` | Locked decision 5 — no parallel render path |

## 4. Common Pitfalls

### macOS notification pitfalls

- **`osascript` returns 0 even on user-dismissed notification** — that's fine (we don't care about response). DON'T add interactive `with buttons` / `default button` — escalates to a dialog requiring user click.
- **macOS Notification Center silent in fullscreen mode / Do Not Disturb** — out of our control. Document.
- **`osascript` quoting nightmare** — `"display notification \"$body\" with title \"$title\""` becomes painful with special chars. Use `execFile` with separate argv args, not `exec` with shell-string composition.

### Linux notification pitfalls

- **`notify-send` on headless / SSH session** — fails silently or with "Cannot autolaunch D-Bus without X11 \$DISPLAY". Detect: `notify-send` exit code non-zero → log warning once per daemon lifetime, don't retry per-dispatch.
- **GNOME 40+ ignores some notify-send urgency levels** — accept; don't try to work around.
- **Linux distros without libnotify** — minimal containers, server installs. `notify-send` not on PATH → graceful skip with one-time warning.

### launchd pitfalls

- **Plist `Label` MUST be unique system-wide** — collision with user's other plists silently breaks load. Use `com.aocyber.devflow-watch` (reverse-DNS, vendor-namespaced).
- **`launchctl load -w` deprecated in macOS 10.10+** — use `launchctl bootstrap gui/$(id -u) <plist>` for new code. We need backward-compat to 10.13+, so use `launchctl load <plist>` (still works, just deprecated). Test against `launchctl list | grep <label>`.
- **`StandardOutPath` / `StandardErrorPath` directory must pre-exist** — launchd doesn't mkdir. We `fs.mkdirSync(logDir, { recursive: true })` BEFORE `launchctl load`.

### systemd pitfalls

- **`systemctl --user` requires user lingering for headless servers** — `loginctl enable-linger $USER`. Document; don't auto-execute.
- **Reload required after edit** — `systemctl --user daemon-reload` MUST run after writing/changing the unit file. Forgetting → "Unit file changed on disk" warning + stale config used.
- **`Type=simple` vs `Type=forking`** — our daemon is foreground (`--foreground` flag); `Type=simple` is correct. `Type=forking` requires `PIDFile=` and a fork — we don't fork.

### Multi-project pitfalls

- **PID file race when CLI mutates while daemon polls** — daemon re-reads on every tick (500ms). CLI mutation via atomic tmp+rename is safe — daemon will see either the pre-mutation or post-mutation file, never a torn write.
- **Project removed mid-dispatch** — in-flight dispatch must complete (don't abort). After completion, daemon's next tick re-reads `watching: []`, sees the project gone, and stops polling its pending dir.
- **Project added with `add-project` but daemon not running** — CLI must check `state.isWatcherLive()` and exit-1 with "daemon not running, run `devflow-watch start` first" if not. NO silent edit of dead PID file.

### Status-line pitfalls

- **Sub-200ms hook target** — existing statusline does up to 4 file reads (session, todos dir, cache file, etc.). Adding PID file read + per-project pending dir scan = up to N+2 reads. Keep N small (typical multi-project usage <5 projects). Bail on first error — never crash statusline.
- **Path resolution for `lib/watcher-state.cjs`** — `~/.claude/devflow/bin/lib/watcher-state.cjs` is the synced runtime location. statusline.js can `require(path.join(homeDir, '.claude/devflow/bin/lib/watcher-state.cjs'))`. Wrap in try/catch — devflow may not be installed for the user reading the statusline.

### Cross-shell pitfalls

- **fish `cd` is a function, not builtin** — sourcing user's `config.fish` may take longer than bash's `.bashrc`. 100ms drain in PTY init may need tuning per shell.
- **PowerShell exit code via `$LASTEXITCODE`, NOT `$?`** — `$?` in pwsh is a boolean (true/false). Wrapper must use `$LASTEXITCODE`.
- **fish has `set -l` (local), `set -g` (global), `set -x` (export)** — don't carry bash habits. Use `set` (local) for our temp vars.
- **Sentinel pattern `__DFW_BEGIN_<id>__` is shell-agnostic** — plain ASCII, dedicated line, all three shells emit it correctly via their respective `echo` / `Write-Output` / `echo`.
- **Shell binary detection** — `which fish` / `command -v fish` returning 0 ≠ fish actually works. Test: `fish -c "echo test"` and check exit. CI uses `t.skip()` if any of those probes fail.

## 5. Refined Defaults (per CLAUDE.md TDD playbook + obj 19 precedent)

| Field | Value | Rationale |
|---|---|---|
| `tdd_default` | `tdd` (strict) | Per playbook habit 1 — features default to tdd TRDs |
| `test_list_first` | `true` | Per playbook habit 2 — explicit checklist before code |
| `fixture_strategy` | `generators` | Per playbook habit 4 — factory functions, not LLM data |
| `outside_in` | `true` | Per playbook habit 5 — start at user-observable layer |
| `multi_tenant_isolation` | `n/a` | Single-tenant project (devflow-claude plugin) |
| `property_based` | `false` | Per playbook §"What to skip" |
| `gherkin` | `false` | Per playbook §"What to skip" |
| `verification_strict` | `true` | All TRDs verify against pre-existing 1911 test count |

## 6. Constraints (carried into TRDs)

- **No new npm dependencies.** All polish features use system binaries (`osascript`, `notify-send`, `launchctl`, `systemctl`, `fish`, `pwsh`). Test infrastructure uses Node-only shims.
- **PID file schema additive.** `watching: []` array exists; we just populate it with multiple entries. No field renames, no removals, no breaking changes.
- **Feature flags default OFF.** Existing v1.1 + obj 19 behavior is "all flags off" baseline. Byte-identical when no `daemon` config block present.
- **macOS-first; Linux out-of-box; Windows best-effort.** Test matrix darwin + linux. Windows path documented-only.
- **No privilege elevation.** User-domain LaunchAgents and systemd-user units only. `sudo` / system-domain installs deferred to v1.3+.
- **Sentinel-protocol unchanged.** Cross-shell wrappers emit the same `__DFW_BEGIN_<id>__` / `__DFW_DELIM_<id>__` / `__DFW_END_<id>__:$rc` fence pattern. Parser in `watcher-shell.cjs` is shell-agnostic.

## 7. Anti-Patterns Already Present in Codebase (avoid repeating)

- **Reading config.json on every hook invocation without try/catch** — gates that crash on malformed config.json have caused user pain in past objectives. Always wrap in try/catch with a graceful default.
- **Sync `child_process.execFileSync` in hot paths** — statusline runs on every Claude render; even 50ms of synchronous subprocess overhead is felt. Statusline uses ONLY file reads (no exec). Notifier uses async `execFile` with detached unref so it doesn't block the daemon's poll loop.
- **Fire-and-forget without error handling** — obj 2 SessionStart hook had a fire-and-forget pattern that swallowed all errors. Notification dispatches MUST log on failure (one-time warning per daemon lifetime, not per-dispatch).
- **Hardcoded paths to `~/.devflow/`** — use `state.pidFilePath()` etc. (already abstracts $HOME for tests). Auto-launch service files use `path.join(os.homedir(), 'Library/LaunchAgents', ...)` for symmetry.

## 8. Error Recovery Patterns (for executors)

### When `osascript` / `notify-send` not on PATH

```js
async function notify({ title, body }) {
  const cmd = process.platform === 'darwin' ? 'osascript' : 'notify-send';
  try {
    await execFile(cmd, /* args */);
  } catch (e) {
    if (e.code === 'ENOENT') {
      // Binary not on PATH — log warning ONCE per daemon lifetime, then disable
      _notifierDisabled = true;
      log('warn', `${cmd} not found on PATH; OS notifications disabled for this session`);
      return;
    }
    // Other errors (Linux DBus failures etc.) — log and continue
    log('warn', `notification dispatch failed: ${e.message}`);
  }
}
```

### When launchd plist already loaded

```js
// `launchctl load <plist>` returns non-zero if already loaded.
// Idempotent install: unload first (ignore errors), then load.
try { await execFile('launchctl', ['unload', plistPath]); } catch {}
await execFile('launchctl', ['load', plistPath]);
```

### When systemd service already enabled

```bash
# `systemctl --user enable` is idempotent — re-running on already-enabled is a no-op.
# `systemctl --user start` on already-running returns 0.
# So just run both in sequence; no try-first-then-fallback needed.
systemctl --user daemon-reload
systemctl --user enable devflow-watch.service
systemctl --user start devflow-watch.service
```

### When PID file mutation conflicts (rare)

Sole writer = the daemon. `add-project` CLI is invoked by the user; it reads → mutates in-memory → atomic-write. If the daemon writes the file between read and write, the CLI's write wins (last-write-wins). Acceptable for v1.2: the CLI is run interactively; race window is microseconds; user retries on failure.

### When cross-shell binary present but unhealthy

```js
// Probe shell health BEFORE constructing ShellSession.
async function probeShell(name) {
  try {
    const { stdout } = await execFile(name, ['-c', 'echo __DFW_PROBE__']);
    return stdout.trim() === '__DFW_PROBE__';
  } catch { return false; }
}
// Caller:
if (!await probeShell('fish')) {
  log('warn', 'fish on PATH but probe failed; falling back to bash');
  shell = 'bash';
}
```

### When `add-project` called but daemon not running

```js
// Hard-fail: do NOT silently edit a stale PID file.
if (!state.isWatcherLive()) {
  printErr('devflow-watch: daemon not running. Start it first: `devflow-watch start --project ' + projectPath + '`');
  return 2;
}
```

### When status-line config missing

```js
// Wrap entire watcher-status block in try/catch. Statusline must NEVER crash.
try {
  const cfg = readConfig();
  if (!cfg.daemon || !cfg.daemon.status_line) return '';
  // ... watcher status logic
} catch {
  return '';
}
```
