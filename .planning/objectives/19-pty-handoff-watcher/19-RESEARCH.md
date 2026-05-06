# Objective 19 — PTY support for handoff watcher (RESEARCH)

**Scope:** node-pty integration patterns, prebuilt-binary distribution, platform caveats, mock-auth-server prior art.

This is a Level 1 discovery (single known library, confirming syntax/version + platform behavior) with one Level 2 sub-investigation (mock auth server cassette pattern). No DISCOVERY.md is required at the orchestrator level; this RESEARCH.md captures the findings the planner used.

## 1. Standard Stack (locked)

| Concern | Choice | Why |
|---|---|---|
| PTY backend | `node-pty` | De-facto standard. Used by VS Code, Hyper, tmux.js. Active maintenance. |
| Prebuild distribution | `prebuild-install` (built-in to node-pty) | node-pty publishes prebuilt binaries for darwin x64/arm64, linux x64/arm64, win32 x64. `npm install` falls back to source build only when prebuild-install fails. |
| ANSI strip | inline ~10 LOC OR `strip-ansi` (small, no deps) | sentinels are plain ASCII on dedicated lines but bash interactive output may interleave PS1 noise + control codes; strip-ANSI before sentinel match. Planner picks. |
| Mock HTTP server | Vanilla `http.createServer` | No Express. Tests should be dependency-free. |
| Cassette format | JSON-Lines (one record per request/response pair) | Conventional. Easy to grep. Easy to regen. |

## 2. Architecture Patterns

### node-pty surface (relevant API)

```js
const pty = require('node-pty');

const ptyProc = pty.spawn(shell, args, {
  name: 'xterm-color',           // TERM env
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env,
});

ptyProc.onData((data) => { /* stdout+stderr merged */ });
ptyProc.onExit(({ exitCode, signal }) => { /* ... */ });

ptyProc.write('echo hello\r');   // Note: \r not \n on PTY
ptyProc.resize(120, 40);
ptyProc.kill('SIGTERM');
```

**Key differences from `child_process.spawn`:**
- Single `onData` stream (PTYs don't separate stdout/stderr at the OS layer; the in-shell wrapping `> $__DFW_OUT 2> $__DFW_ERR` + cat-back already accounts for this in our sentinel protocol).
- Writes need `\r` (carriage return) instead of `\n` for shell-interactive mode. Multi-line writes use `\r` between lines.
- No separate `proc.stdin` / `proc.stdout` / `proc.stderr` properties; just `onData` + `write`.
- `onExit` provides `{exitCode, signal}` directly (not via separate `'exit'` and `'error'` events).

### Sentinel protocol compatibility

Our existing protocol writes:

```
__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)
{ <cmd> ; } > $__DFW_OUT 2> $__DFW_ERR
__DFW_RC=$?
echo __DFW_BEGIN_<id>__
cat $__DFW_OUT 2>/dev/null
echo __DFW_DELIM_<id>__
cat $__DFW_ERR 2>/dev/null
echo __DFW_END_<id>__:$__DFW_RC
rm -f $__DFW_OUT $__DFW_ERR
```

This protocol survives the PTY transport because:
- Sentinels are plain ASCII (no escape-sequence collision).
- Each sentinel is on its own `\n`-terminated line.
- The final `__DFW_END_<id>__:$rc` line is the dispatch terminator, not the EOF.

The PTY *will* echo the input back (typical TTY echo behavior) which appears in the output stream BEFORE the BEGIN sentinel. Two safe handling strategies:

1. **Find sentinels by scanning forward from EOF** (current behavior): the BEGIN regex still matches on the line we wrote it to even if echo prefix is present. The current `splitDispatchOutput` already starts from `buf.indexOf(begin)` so prefix garbage is harmless.

2. **Disable PTY echo in shell init** (`stty -echo` early in the spawn) — cleaner output, but adds shell dependency.

Recommendation: keep strategy 1 (zero shell dependency, regex-driven). Document in TRD 19-01.

### `interactive: false` test path preservation

Existing `watcher-shell.test.cjs` (11 tests) uses `interactive: false` which sets `args = []` (no `-i` flag) and uses `child_process.spawn`. That path stays. The PTY swap is gated on `this.interactive === true`. Pseudocode:

```js
async spawn() {
  if (this.interactive) {
    const pty = require('node-pty');
    this.proc = pty.spawn(this.shell, ['-i'], { cols: 80, rows: 24, env: this.env, cwd: this.cwd });
    this.proc.onData((chunk) => { this._stdoutBuf += chunk; this._tryComplete(); });
    this.proc.onExit(() => this._onExit());
    // PTY shells need a slightly different prompt-quieting init sequence — see below
  } else {
    // existing spawn path — UNCHANGED
    this.proc = spawn(this.shell, [], { stdio: ['pipe','pipe','pipe'], env: this.env, cwd: this.cwd });
    // ... existing wiring
  }
}
```

The `dispatch()`, `kill()`, `_tryComplete()` methods need conditional branches for `proc.stdin.write` (pipe) vs `proc.write` (PTY). Keep both branches readable rather than over-abstracting.

### Token-passing wire format (NEW for v1.2)

Pending record schema extension:

```jsonc
{
  "id": "h-abc123",
  "cmd": "doctl auth init",
  "cwd": "/path/to/project",
  "status": "pending",
  "created_at": "2026-...",
  "source": "hook",
  "inputs": {                              // NEW (optional)
    "secrets": [
      {
        "prompt_match": "Enter your access token:",
        "value_source": "stash",           // "stash" | "env" | "keyring"
        "value_ref": "do-token"            // stash key OR env var name
      }
    ]
  }
}
```

Daemon behavior on dispatch:
1. Build sentinel-wrapped command as today.
2. Maintain a per-handoff "secrets pending" map.
3. As PTY data arrives, scan accumulated buffer for any `prompt_match` regex. On match: write the resolved value (followed by `\r`) to the PTY.
4. Resolution:
   - `stash`: in-memory Map populated by a separate command (e.g. `devflow-watch stash add <id> <key> <value>`) — out of scope for v1.2 schema-validation TRD; planner can defer the stash-CLI to a sub-task or future objective. **For v1.2 we accept the schema slot but the runtime can return a "stash backend not yet wired" error if the user populates it before the CLI ships.** Alternatively the planner ships a minimal stash-CLI as part of 19-02.
   - `env`: `process.env[value_ref]` at dispatch time. Empty string treated as absent (rejected).
   - `keyring`: rejected at validation time with `"keyring backend deferred to v1.3+ — use stash or env in v1.2"`.

## 3. Don't Hand-Roll

| Capability | Use this | Don't write |
|---|---|---|
| PTY allocation | `node-pty` | Direct `posix_openpt` ioctl bindings |
| Prebuilt binary install | `prebuild-install` (auto via node-pty) | Custom postinstall script |
| Mock OAuth server | `http.createServer` + cassette JSON | Express, msw, nock (heavy / runtime-only) |
| ANSI strip (if needed) | inline regex `/\x1b\[[0-9;]*[a-zA-Z]/g` OR `strip-ansi` | A general ANSI parser |

## 4. Common Pitfalls

### node-pty install pitfalls

- **Missing build tools on Linux without prebuilt binary fallback** — `apt install build-essential python3` required when prebuild-install fails. Document.
- **macOS Apple Silicon (arm64)** — node-pty publishes arm64 prebuilt binaries from version 1.0+. Pin a version with arm64 prebuilds (verify on npmjs.com at planning time).
- **Windows** — requires `windows-build-tools` historically; modern node-pty bundles `winpty-agent` automatically. Document the "best-effort" status.
- **Electron vs Node mismatch** — n/a here (we're pure Node), but worth a sentence in the doc so contributors don't get confused.

### PTY runtime pitfalls

- **PTY echo doubles input** — typing `echo hello\r` on a PTY produces output `echo hello\r\nhello\n` (the shell echoes the line, then prints output). Sentinel parser must scan from BEGIN forward, ignoring echoed input — current implementation already does this.
- **PTY block buffering on stdout** — bash inside a PTY uses line-buffering by default (because isatty(stdout) is true). This is GOOD for our case — we used to fight block-buffering on the pipe path. Document.
- **Resize signals (SIGWINCH)** — n/a for our use case (we set fixed cols/rows once).
- **Carriage return semantics** — `\r` is the input terminator on PTYs, NOT `\n`. Common bug source. Tests must verify `proc.write(cmd + '\r')` not `'\n'`.
- **PTY closure leaves zombie PIDs** — node-pty's `onExit` fires on process exit. Ensure `proc.kill()` is idempotent (try/catch in the existing `kill()` method already handles this).

### Token-passing pitfalls

- **Regex over-match** — `prompt_match: ":"` would match every prompt and every shell PS1. Force regex anchors and document well: tests must include adversarial cases where the regex is too loose.
- **Echoed secrets in done record** — when a tool prompts for a token then echoes the value (uncommon but happens), the secret value lands in `done.stdout`. Mitigation: scan done record for any `value` from resolved secrets and replace with `***REDACTED***` before writing the done record. Tests must include this case.
- **Race: prompt detected, value written, prompt detected again** — daemon must mark each `secrets[]` entry as "consumed" after one successful answer. Repeated prompt = error (typo case → bail with `status: 'failed'` and the actual prompt text in stderr).

### Mock auth server pitfalls

- **gh's OAuth flow uses GitHub's actual host headers** — the mock must respond to `Host: github.com` (gh sets this), not just localhost. Use `--hostname <host>` flag or override `GH_HOST` env var to redirect gh at the mock.
- **doctl pulls API URL from `DIGITALOCEAN_API_URL` env var** — set in test env to `http://127.0.0.1:<port>/`.
- **TLS not required for local mock** — both `gh` and `doctl` accept HTTP when env vars point at HTTP URLs. Avoid certificate complexity.
- **Cassette drift** — recorded cassettes go stale when upstream API shape changes. Mark cassettes with capture date in the JSON, periodically re-record. Pattern locked in obj 1 (TRD 01-06): `_captured: true` + `captured_at: <iso>` keys.

## 5. Refined Defaults

Per `(kind: plugin, work: feature)` in defaults-table.md:

| Default | Value | Resolved provenance |
|---|---|---|
| `tdd_default` | `strict` | table |
| `test_list_first` | `required` | table |
| `fixture_strategy` | `generators` | table |
| `outside_in` | n/a (plugin kind) | table |
| `security_isolation` | n/a (plugin kind, single-tenant) | table |
| `back_compat` | `required` (zero regressions on non-PTY path) | CLAUDE.md TDD playbook + locked decision 4 |

## 6. Constraints

- **Zero regressions on the existing 1852 tests.** Locked decision 4 + CONTEXT.md §7. Verified via `npm test` after each TDD TRD's GREEN commit.
- **PTY tests gated on node-pty availability.** If `require('node-pty')` throws (missing native binary on the test machine), PTY tests skip with clear message; non-PTY tests run normally. Pattern: `try { require('node-pty'); } catch { return t.skip('node-pty not available'); }`.
- **No live network in tests.** All e2e auth tests use mock servers + cassettes. CI must pass without `GH_TOKEN`, `DIGITALOCEAN_TOKEN`, or any real credential.

## 7. Anti-Patterns Already Present in Codebase (avoid repeating)

- `lib/tui-cli.cjs` line 15 explicitly avoided node-pty in TUI work ("hand-rolled ANSI: no terminal libraries"). That decision was for the TUI viewer (display-only). It does NOT apply here — the watcher daemon needs PTY for tool input/output, which hand-rolled escape codes cannot provide. Cross-link in the PR description so reviewers don't think we contradicted ourselves.
- `docs/PROPOSAL-handoff-watcher.md` line 153 deferred node-pty to v1.2 explicitly; v1.2 is now. We are CLOSING that defer, not relitigating it.

## 8. Error Recovery Patterns (for executors)

- **`require('node-pty')` throws on test machine** → tests skip cleanly via `t.skip('node-pty unavailable')`. Production `spawn()` re-throws with a wrapped error message: `"node-pty not installed (run npm install) — or set interactive:false on ShellSession for non-PTY mode"`.
- **PTY spawn fails** → fall back to error mode: emit a done record with `status: 'pty_unavailable'` and a clear stderr message; user can retry with `interactive:false` mode by restarting the daemon with a flag (deferred — v1.3+ ergonomic).
- **Sentinel never arrives** → existing timeout fires (current behavior, unchanged). Done record `status: 'timeout'`, `exit_code: -1`.
- **Secret regex matches but value resolution fails** (env var unset, stash empty) → write `\x03` (Ctrl+C) to PTY to abort the prompt; emit done record `status: 'failed'` with stderr `"secret resolution failed for '<value_ref>' (source: <value_source>)"`. Tests cover this path.
- **Mock auth server fails to bind port** → tests skip cleanly with `t.skip('mock server port unavailable')`; CI logs the conflict. Pattern: ephemeral port via `server.listen(0, () => { const port = server.address().port; ... })`.

---
*Created: 2026-05-04 (planner research synthesis for v1.2 obj 10 PTY work)*
