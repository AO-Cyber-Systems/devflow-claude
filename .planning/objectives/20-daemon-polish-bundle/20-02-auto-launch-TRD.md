---
objective: 20-daemon-polish-bundle
trd: "02"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/service-installer.cjs
  - plugins/devflow/devflow/bin/lib/service-installer.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/launchctl-shim.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/systemctl-shim.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
  - plugins/devflow/devflow/bin/devflow-watch.cjs
  - plugins/devflow/devflow/bin/devflow-watch.test.cjs
  - plugins/devflow/devflow/templates/config.json
  - docs/handoff-watcher-guide.md
autonomous: true
requirements:
  - DAEMON-AUTO-LAUNCH
must_haves:
  truths:
    - "lib/service-installer.cjs exports installService({platform, projectRoot, shell, ...}) that writes platform-appropriate service file + invokes launchctl/systemctl"
    - "On darwin: writes ~/Library/LaunchAgents/com.aocyber.devflow-watch.plist with correct ProgramArguments + RunAtLoad + KeepAlive.SuccessfulExit=false"
    - "On linux: writes ~/.config/systemd/user/devflow-watch.service with [Unit]/[Service]/[Install] sections, Type=simple, Restart=on-failure"
    - "installService is idempotent: running twice does not error; second invocation re-loads the service cleanly"
    - "uninstallService stops + unloads + removes the service file; idempotent (safe to call when not installed)"
    - "Plist generation escapes XML special chars (& < > ' \") in path values via xmlEscape helper"
    - "devflow-watch CLI accepts `start --install-service` (install + start), `stop --uninstall-service` (stop + uninstall), or standalone `install-service` / `uninstall-service` subcommands"
    - "Service file ProgramArguments / ExecStart points to the running devflow-watch.cjs absolute path (resolved via path.resolve)"
    - "Service file uses --foreground flag (not detached) so launchd/systemd own the lifecycle"
    - "On platform other than darwin/linux (win32 etc.), CLI exits with code 1 + clear 'unsupported platform' message; service-installer module throws platform error"
    - "All 1911 pre-existing tests still pass (allow E2E1 + novel-domain known failures unchanged)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/service-installer.cjs"
      provides: "Cross-platform service file generation + launchctl/systemctl orchestration"
      exports: ["installService", "uninstallService", "renderLaunchdPlist", "renderSystemdUnit", "_setRunExec", "_resetMocks"]
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/service-installer.test.cjs"
      provides: "Service installer tests with shim-based launchctl/systemctl mocking"
      min_lines: 250
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/launchctl-shim.cjs"
      provides: "Executable shim recording launchctl invocations to marker file"
      min_lines: 15
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/systemctl-shim.cjs"
      provides: "Same as launchctl-shim.cjs but for systemctl"
      min_lines: 15
    - path: "plugins/devflow/devflow/bin/devflow-watch.cjs"
      provides: "install-service / uninstall-service subcommands + --install-service / --uninstall-service flags"
      contains: "install-service"
    - path: "plugins/devflow/devflow/templates/config.json"
      provides: "daemon.auto_launch config block"
      contains: "\"auto_launch\""
    - path: "docs/handoff-watcher-guide.md"
      provides: "Auto-launch subsection added under Configuration"
      contains: "Auto-launch"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/service-installer.cjs"
      to: "child_process.execFile (launchctl, systemctl)"
      via: "_runExec injection hook"
      pattern: "_runExec|execFile"
    - from: "plugins/devflow/devflow/bin/lib/service-installer.cjs"
      to: "fs.writeFileSync (service file)"
      via: "atomic tmp+rename in user-domain dir (~/Library/LaunchAgents or ~/.config/systemd/user)"
      pattern: "writeFileSync|renameSync"
    - from: "plugins/devflow/devflow/bin/devflow-watch.cjs"
      to: "lib/service-installer.cjs"
      via: "subcommand dispatch in main()"
      pattern: "install-service|uninstall-service"
---

<objective>
Add auto-launch support: `devflow-watch install-service` generates platform-appropriate service file (launchd plist on macOS, systemd-user unit on Linux) and registers it; `devflow-watch uninstall-service` stops + unloads + removes. Convenience flags `--install-service` (on `start`) and `--uninstall-service` (on `stop`) chain the operations. Tested via launchctl/systemctl shim fixtures.

Purpose: Today's daemon dies on logout. Users must `devflow-watch start` per session. Auto-launch makes the watcher survive logout/reboot, becoming part of the desktop environment.

Output: New `lib/service-installer.cjs` (plist/unit generation + launchctl/systemctl orchestration) + `bin/devflow-watch.cjs` subcommand additions + handoff-watcher-guide.md `### Auto-launch (launchd / systemd)` subsection + `templates/config.json` `daemon.auto_launch` block.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── devflow-watch.cjs                                         ← MODIFY (additive — install-service / uninstall-service subcommands + flags)
├── devflow-watch.test.cjs                                    ← MODIFY (additive — CLI subcommand integration tests)
└── lib/
    ├── service-installer.cjs                                 ← CREATE
    ├── service-installer.test.cjs                            ← CREATE
    └── __fixtures__/
        ├── launchctl-shim.cjs                                ← CREATE
        ├── systemctl-shim.cjs                                ← CREATE
        └── daemon-polish-fixtures.cjs                        ← MODIFY (extend if exists from 20-01; create if not)

plugins/devflow/devflow/templates/config.json                 ← MODIFY (additive — daemon.auto_launch)
docs/handoff-watcher-guide.md                                 ← MODIFY (additive — `### Auto-launch (launchd / systemd)` section)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing CLI subcommand dispatch (mirror this for install-service / uninstall-service)

`plugins/devflow/devflow/bin/devflow-watch.cjs:308-323` — current main():

```js
async function main(argv) {
  const flags = parseFlags(argv);
  const sub = flags._[0];

  if (sub === 'start') return cmdStart(flags);
  if (sub === 'stop') return cmdStop();
  if (sub === 'status') return cmdStatus();
  if (sub === 'logs') return cmdLogs(flags);
  if (sub === 'version' || flags.version === true) {
    printOut(`devflow-watch ${VERSION}`);
    return 0;
  }

  printErr('Usage: devflow-watch <start|stop|status|logs|version> [flags]');
  return 1;
}
```

Extend to:

```js
if (sub === 'install-service') return cmdInstallService(flags);
if (sub === 'uninstall-service') return cmdUninstallService(flags);
// And in cmdStart: if (flags['install-service']) cmdInstallService first, then proceed
// And in cmdStop: if (flags['uninstall-service']) cmdUninstallService after stop
```

### Pattern: Existing atomic write (mirror for service file generation)

`plugins/devflow/devflow/bin/lib/watcher-daemon.cjs:62-71`:

```js
function writeDoneRecord(projectRoot, record) {
  const dir = doneDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${record.id}.json`);
  // Atomic-ish write
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
  return filePath;
}
```

Same pattern for plist/unit file:

```js
function writeServiceFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
  return filePath;
}
```

### Pattern: Existing _setRunGh injection (mirror as _setRunExec for service-installer)

Same as TRD 20-01 — `_runExec` injection hook with `_setRunExec(fn)` / `_resetMocks()`. Tests inject mock; production uses real execFile.

</codebase_examples>

<anti_patterns>

### Anti-pattern: Generating service files via XML/INI library

DON'T:
```js
const plist = require('plist');  // npm dep
const xml = plist.build({...});
```

DO: template string + `xmlEscape()` for plist (5 entities, ~5 LOC). For systemd, plain string concatenation — no escaping needed (systemd unit format has no escape semantics for normal characters).

We never PARSE plists/units; we only GENERATE. Generation is trivial template interpolation.

### Anti-pattern: Privilege-elevated install paths

DON'T:
```
/Library/LaunchDaemons/com.aocyber.devflow-watch.plist  // requires sudo
/etc/systemd/system/devflow-watch.service                // requires sudo
```

DO:
```
~/Library/LaunchAgents/com.aocyber.devflow-watch.plist   // user domain
~/.config/systemd/user/devflow-watch.service             // user domain
```

User-domain installs require no privilege escalation. v1.3+ may add system-domain option behind explicit opt-in flag.

### Anti-pattern: Service file references relative path

DON'T:
```
ProgramArguments: ['node', './devflow-watch.cjs', 'start', '--foreground']
```

DO:
```
ProgramArguments: ['/usr/bin/env', 'node', '/abs/path/devflow-watch.cjs', 'start', '--foreground']
```

launchd/systemd resolve paths from a clean environment; relative paths fail. Use `path.resolve(__dirname, 'devflow-watch.cjs')` at install time to get the absolute path.

### Anti-pattern: Forgetting daemon-reload after systemd unit edit

```bash
# WRONG — stale unit cached
systemctl --user enable devflow-watch.service
systemctl --user start devflow-watch.service

# RIGHT
systemctl --user daemon-reload
systemctl --user enable devflow-watch.service
systemctl --user start devflow-watch.service
```

`systemctl --user daemon-reload` MUST run AFTER writing/editing the unit file, BEFORE enable/start. Forgetting → "Unit file changed on disk" warnings + stale config used.

</anti_patterns>

<error_recovery>

### When launchctl load returns "service already loaded"

Idempotent install: unload first (ignore errors), then load:

```js
try { await _runExec('launchctl', ['unload', plistPath]); } catch { /* may not be loaded */ }
await _runExec('launchctl', ['load', plistPath]);
```

### When systemctl --user enable already-enabled

`systemctl --user enable` is idempotent — re-enabling an enabled service is a no-op (exit 0). Same for `start` on already-running. NO try-first-then-fallback needed.

### When launchctl / systemctl not on PATH

Treat as platform mismatch. macOS without launchctl is impossible (system tool); Linux without systemctl means non-systemd init system (Alpine with OpenRC, Devuan with sysvinit). Document as unsupported in v1.2; uninstall returns success (no service to uninstall); install returns error with guidance.

### When user.config dir doesn't exist (Linux)

`~/.config/systemd/user/` may not exist on minimal Linux installs. `fs.mkdirSync(dir, { recursive: true })` handles. systemd's daemon-reload picks up new dirs automatically.

### When LaunchAgents dir has odd permissions

On some macOS installs, `~/Library/LaunchAgents` is owned by root after Time Machine restores. `fs.writeFileSync` will EACCES. Detect and emit guidance: "fix with `sudo chown $USER ~/Library/LaunchAgents`" — do NOT execute sudo for user.

### When service file write succeeds but launchctl/systemctl fails

State is half-installed (file exists; not loaded). Don't auto-rollback; user can inspect the file. Print the error + path so user can debug. Re-running install retries; uninstall handles half-installed state via "ignore errors on unload, always remove file."

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/20-daemon-polish-bundle/20-CONTEXT.md
@.planning/objectives/20-daemon-polish-bundle/20-RESEARCH.md

@plugins/devflow/devflow/bin/devflow-watch.cjs
@plugins/devflow/devflow/templates/config.json
@docs/handoff-watcher-guide.md
</context>

<research_context>

### From 20-RESEARCH.md §2 Pattern B — launchd plist generation

Minimal user-domain LaunchAgent template. `KeepAlive.SuccessfulExit=false` = respawn on failure but don't loop on clean exit (intentional stops via `launchctl unload`). `Label` MUST be reverse-DNS namespaced — use `com.aocyber.devflow-watch`.

### From 20-RESEARCH.md §2 Pattern C — systemd unit file

`Type=simple` (foreground daemon). `Restart=on-failure` mirrors launchd's KeepAlive.SuccessfulExit=false. `%h` specifier = user home. `WantedBy=default.target` = enabled in user session graph.

### From 20-RESEARCH.md §4 Common Pitfalls — launchd

- Plist `Label` MUST be unique system-wide (collision silently breaks).
- `launchctl load -w` deprecated → use `launchctl load <plist>` (still works).
- `StandardOutPath` / `StandardErrorPath` directory must pre-exist; mkdirSync first.

### From 20-RESEARCH.md §4 Common Pitfalls — systemd

- `daemon-reload` required after unit edit.
- `Type=simple` correct (we don't fork).
- `loginctl enable-linger $USER` required for headless servers — document, don't auto-execute.

</research_context>

<gotchas>

- **Reverse-DNS Label** — `com.aocyber.devflow-watch` is the locked label per CONTEXT decision 7. Tests assert exact string. Future TRDs that change this MUST update the uninstall path's Label match.

- **chmod +x on shim files** — same as TRD 20-01; commit shims with executable bit OR `fs.chmodSync(0o755)` in fixture builder.

- **`/usr/bin/env node` vs absolute node path** — service files use `/usr/bin/env node` for portability (works with nvm/asdf/system Node). Test asserts this exact prefix in ProgramArguments[0..1] / ExecStart prefix.

- **devflow-watch.cjs absolute path resolution** — at install time, use `path.resolve(__filename)` to get the running CLI's absolute path. Bake into service file. If user moves the install, they must re-run install-service.

- **`--install-service` on `start` vs standalone `install-service`** — both work. Standalone subcommand is the documented form; the flag is shorthand. Tests cover both.

- **Atomic plist edits** — write tmp, rename. launchd watches `~/Library/LaunchAgents/` for changes; partial writes (without atomic rename) can race the watcher.

- **Systemd unit file owner** — must be the running user (NOT root). `fs.writeFileSync` uses process uid/gid; correct by default for `~/.config/systemd/user/`.

- **uninstall-service when daemon is running** — uninstall stops the daemon (via launchctl unload / systemctl stop), then removes service file. Don't error if daemon already stopped.

- **Plist body indentation** — launchd accepts any whitespace inside dict/array elements. Don't waste effort on pretty-printing; minimal indentation is fine. Test assertions match on key/value presence, not on whitespace.

</gotchas>

<test_list_first>

Per CLAUDE.md TDD playbook habit 2: explicit checklist BEFORE any test code.

### Group P — Plist rendering (renderLaunchdPlist)

- [ ] **P-1** Renders valid XML with `<?xml version=...>` + `<!DOCTYPE plist ...>` + `<plist version="1.0">` headers
- [ ] **P-2** Contains `<key>Label</key>` followed by `<string>com.aocyber.devflow-watch</string>`
- [ ] **P-3** ProgramArguments array contains `/usr/bin/env`, `node`, the absolute devflow-watch.cjs path, `start`, `--foreground`, `--project`, projectRoot
- [ ] **P-4** Contains `<key>RunAtLoad</key><true/>`
- [ ] **P-5** Contains `<key>KeepAlive</key>` with nested `<dict>` + `SuccessfulExit` `<false/>`
- [ ] **P-6** xmlEscape renders `&` as `&amp;`, `<` as `&lt;`, `>` as `&gt;`, `'` as `&apos;`, `"` as `&quot;`
- [ ] **P-7** projectRoot containing special chars (e.g. "Tom's Project & Co.") is properly escaped in output
- [ ] **P-8** StandardOutPath / StandardErrorPath point to ~/.devflow/launchd-stdout.log / launchd-stderr.log

### Group U — Systemd unit rendering (renderSystemdUnit)

- [ ] **U-1** Contains [Unit], [Service], [Install] sections in that order
- [ ] **U-2** [Service] contains `Type=simple`, `Restart=on-failure`, `RestartSec=5`
- [ ] **U-3** ExecStart is `/usr/bin/env node <absPath> start --foreground --project <projectRoot>`
- [ ] **U-4** [Install] contains `WantedBy=default.target`
- [ ] **U-5** StandardOutput / StandardError use `append:%h/.devflow/systemd-stdout.log` / -stderr.log

### Group I — installService / uninstallService

- [ ] **I-1** installService on darwin writes plist to ~/Library/LaunchAgents/com.aocyber.devflow-watch.plist
- [ ] **I-2** installService on darwin invokes launchctl unload (ignored on first run) THEN launchctl load
- [ ] **I-3** installService on linux writes unit to ~/.config/systemd/user/devflow-watch.service
- [ ] **I-4** installService on linux invokes systemctl --user daemon-reload, then enable, then start (in that order)
- [ ] **I-5** installService on win32 throws platform error
- [ ] **I-6** installService twice in a row succeeds both times (idempotent)
- [ ] **I-7** uninstallService on darwin invokes launchctl unload (errors ignored) then deletes plist file
- [ ] **I-8** uninstallService on linux invokes systemctl stop + disable (errors ignored) then deletes unit file + daemon-reload
- [ ] **I-9** uninstallService when service file doesn't exist returns success (idempotent)
- [ ] **I-10** Service file path uses os.homedir() — test by overriding HOME env var
- [ ] **I-11** mkdir -p on parent dir before writeFileSync (~/.config/systemd/user/ may not exist)
- [ ] **I-12** Atomic write via tmp + rename (assert tmp file does not persist after success)

### Group C — CLI subcommand integration (devflow-watch.test.cjs)

- [ ] **C-1** `devflow-watch install-service` invokes service-installer.installService with current platform + cwd
- [ ] **C-2** `devflow-watch uninstall-service` invokes service-installer.uninstallService
- [ ] **C-3** `devflow-watch start --install-service` runs install-service THEN proceeds to start
- [ ] **C-4** `devflow-watch stop --uninstall-service` runs stop THEN uninstall-service
- [ ] **C-5** `devflow-watch install-service` on unsupported platform exits 1 with "unsupported platform" message
- [ ] **C-6** `devflow-watch install-service --project /custom/path` passes /custom/path to installer
- [ ] **C-7** `devflow-watch help` (or no args) lists install-service / uninstall-service in usage

### Group EX — Export surface lock

- [ ] **EX-1** lib/service-installer.cjs module.exports is exactly `{ installService, uninstallService, renderLaunchdPlist, renderSystemdUnit, _setRunExec, _resetMocks }` (deepStrictEqual)

### Group D — Documentation

- [ ] **D-1** docs/handoff-watcher-guide.md contains `### Auto-launch (launchd / systemd)` heading
- [ ] **D-2** Section documents install-service / uninstall-service subcommands + --install-service / --uninstall-service flags
- [ ] **D-3** Section documents user-domain install paths + linger requirement for headless Linux

</test_list_first>

<feature>
  <name>Service file generation + orchestration</name>
  <files>plugins/devflow/devflow/bin/lib/service-installer.cjs, plugins/devflow/devflow/bin/lib/service-installer.test.cjs</files>
  <behavior>
    Render and install user-domain service files on darwin (launchd plist) + linux (systemd-user unit). Idempotent install/uninstall. Subprocess invocation through injected _runExec hook. xmlEscape for plist string values; no escaping needed for systemd unit body.

    Cases:
    - input: installService({platform: 'darwin', projectRoot: '/p'}) → writes plist with absolute path, calls launchctl unload (ignored) + load
    - input: installService({platform: 'linux', projectRoot: '/p'}) → writes unit, calls systemctl daemon-reload + enable + start
    - input: installService({platform: 'win32'}) → throws PlatformError
    - input: uninstallService({platform: 'darwin'}) when not installed → success (idempotent)
    - edge: projectRoot contains '<' or '&' → escaped in plist via xmlEscape
    - edge: ~/.config/systemd/user/ doesn't exist → mkdirSync recursive creates it
  </behavior>
  <implementation>
    ~200 LOC. exports: installService, uninstallService, renderLaunchdPlist, renderSystemdUnit, _setRunExec, _resetMocks. xmlEscape helper (5-entity replace). Atomic tmp+rename for service file writes. Reverse-DNS Label = `com.aocyber.devflow-watch` constant. Service-file paths derived from os.homedir() (test-overridable via HOME env).
  </implementation>
</feature>

<feature>
  <name>devflow-watch CLI subcommands + flags</name>
  <files>plugins/devflow/devflow/bin/devflow-watch.cjs, plugins/devflow/devflow/bin/devflow-watch.test.cjs</files>
  <behavior>
    New subcommands `install-service` / `uninstall-service` dispatch to lib/service-installer.cjs. Convenience flags `--install-service` (on `start`) and `--uninstall-service` (on `stop`) chain with the existing operation. Help message updated.

    Cases:
    - input: argv=['install-service'] → cmdInstallService → invokes installer with process.platform + cwd
    - input: argv=['uninstall-service'] → cmdUninstallService → invokes installer.uninstallService
    - input: argv=['start', '--install-service'] → install-service first (synchronous on async path), THEN cmdStart
    - input: argv=['stop', '--uninstall-service'] → cmdStop, THEN cmdUninstallService
    - input: argv=['install-service'] on win32 → exit 1 + "unsupported platform"
  </behavior>
  <implementation>
    Add `cmdInstallService(flags)` + `cmdUninstallService(flags)` to bin/devflow-watch.cjs. Extend main() dispatch. Extend cmdStart/cmdStop to chain on flag detection. Update Usage line to list new subcommands.
  </implementation>
</feature>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing tests + shim fixtures + extend daemon-polish-fixtures.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/service-installer.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/launchctl-shim.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/systemctl-shim.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs, plugins/devflow/devflow/bin/devflow-watch.test.cjs</files>
  <action>
Per CLAUDE.md TDD playbook (habits 1-4): write tests FIRST, fixture builders FIRST, no implementation.

Create the 2 shim files:

1. `__fixtures__/launchctl-shim.cjs` (~15 LOC):
```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const marker = process.env.LAUNCHCTL_SHIM_MARKER_FILE;
if (marker) {
  fs.appendFileSync(marker, JSON.stringify({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    pid: process.pid,
  }) + '\n');
}
// Optional: simulate "service already loaded" error on second invocation
const exitCodeFromEnv = parseInt(process.env.LAUNCHCTL_SHIM_EXIT_CODE || '0', 10);
process.exit(exitCodeFromEnv);
```

2. `__fixtures__/systemctl-shim.cjs` (~15 LOC, same shape but env var SYSTEMCTL_SHIM_MARKER_FILE / SYSTEMCTL_SHIM_EXIT_CODE).

3. Extend `__fixtures__/daemon-polish-fixtures.cjs` (or create if 20-01 hasn't created it yet — coordinate via wave-1 file ownership):
   - `buildLaunchctlShimEnv(tmpDir)` returns `{shimDir, launchctlPath, markerFile, cleanup}` setting PATH override
   - `buildSystemctlShimEnv(tmpDir)` same for systemctl
   - `buildServiceInstallerTmpHome(tmpDir)` creates a tmp HOME dir override returning `{home, launchAgentsDir, systemdUserDir, restoreHome}` — for testing service file write paths without polluting real ~/Library/LaunchAgents
   - `readShimCalls(markerFile)` returns parsed JSONL array

CRITICAL: `fs.chmodSync(shimPath, 0o755)` in fixture-builder load (idempotent). Otherwise tests fail with EACCES.

Write ALL test cases in `<test_list_first>` (Groups P=8, U=5, I=12, C=7, EX=1, D=3) = 36 tests in service-installer.test.cjs (Groups P, U, I, EX) + Group C in devflow-watch.test.cjs (additive). D verified via grep at GREEN time.

Test file structure:
- `service-installer.test.cjs` — Groups P, U, I, EX (28 tests)
- `devflow-watch.test.cjs` ADDITIVE — Group C (7 tests) using subprocess invocation pattern (existing test file already uses execSync to spawn devflow-watch.cjs as subprocess; mirror that for new tests with launchctl/systemctl shims on PATH)

Run tests; verify all 35 fail because service-installer.cjs doesn't exist + devflow-watch.cjs doesn't yet route install-service / uninstall-service. Pre-existing 1911 still pass.

# CRITICAL: do NOT use fs.writeFileSync to write to real ~/Library/LaunchAgents during tests. ALWAYS override HOME to a tmp dir. Tests that pollute the real LaunchAgents dir are unrecoverable nightmares.
# GOTCHA: launchctl-shim and systemctl-shim must have +x bit set BEFORE first test run.
# PATTERN: mirror obj 19 TRD 19-05 cassette pattern but for shim invocations (effects, not HTTP).

Commit (single RED commit):
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "test(20-02): add failing tests for auto-launch (launchd plist + systemd unit + CLI subcommands)" \
  --files plugins/devflow/devflow/bin/lib/service-installer.test.cjs \
  plugins/devflow/devflow/bin/lib/__fixtures__/launchctl-shim.cjs \
  plugins/devflow/devflow/bin/lib/__fixtures__/systemctl-shim.cjs \
  plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs \
  plugins/devflow/devflow/bin/devflow-watch.test.cjs
```
  </action>
  <verify>
`npm test 2>&1 | tail -20` shows 35 new failures + pre-existing 1911 still pass. Failures are coherent: "Cannot find module './service-installer.cjs'" for 28 tests, "Unknown subcommand: install-service" for 7 CLI tests.
  </verify>
  <done>
35 new failing tests committed. Fixture builders + 2 shim files committed with executable bit. Pre-existing 1911 tests unchanged. Single RED commit on branch.
  </done>
  <recovery>
If shim files lack +x → `fs.chmodSync(0o755)` in fixture-builder load OR `git update-index --chmod=+x`. If tests pass at RED → implementation accidentally exists; bisect via `git log -p` and remove. If pre-existing tests fail → HOME override leaked outside test scope; ensure cleanup in afterEach hook.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement service-installer.cjs + extend devflow-watch.cjs + config + doc</name>
  <files>plugins/devflow/devflow/bin/lib/service-installer.cjs, plugins/devflow/devflow/bin/devflow-watch.cjs, plugins/devflow/devflow/templates/config.json, docs/handoff-watcher-guide.md</files>
  <action>
Per CLAUDE.md TDD playbook habit 3: write MINIMAL code to make all 35 RED tests pass.

Implementation order (outside-in per playbook habit 5):

1. **service-installer.cjs (~200 LOC):**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const LABEL = 'com.aocyber.devflow-watch';

const realRunExec = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 10000, ...opts }, (err, stdout, stderr) => {
    if (err) reject(Object.assign(err, { stdout, stderr }));
    else resolve({ stdout, stderr });
  });
});
let _runExec = realRunExec;
function _setRunExec(fn) { _runExec = (fn != null) ? fn : realRunExec; }
function _resetMocks() { _runExec = realRunExec; }

function _xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

function _userHome() { return process.env.HOME || os.homedir(); }
function _launchAgentsDir() { return path.join(_userHome(), 'Library', 'LaunchAgents'); }
function _launchAgentsPath() { return path.join(_launchAgentsDir(), `${LABEL}.plist`); }
function _systemdUserDir() { return path.join(_userHome(), '.config', 'systemd', 'user'); }
function _systemdUnitPath() { return path.join(_systemdUserDir(), 'devflow-watch.service'); }
function _devflowLogDir() { return path.join(_userHome(), '.devflow'); }

function renderLaunchdPlist({ projectRoot, devflowWatchPath }) {
  const args = [
    '/usr/bin/env',
    'node',
    devflowWatchPath,
    'start',
    '--foreground',
    '--project',
    projectRoot,
  ];
  const argsXml = args.map(a => `        <string>${_xmlEscape(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${_xmlEscape(path.join(_devflowLogDir(), 'launchd-stdout.log'))}</string>
    <key>StandardErrorPath</key>
    <string>${_xmlEscape(path.join(_devflowLogDir(), 'launchd-stderr.log'))}</string>
</dict>
</plist>
`;
}

function renderSystemdUnit({ projectRoot, devflowWatchPath }) {
  return `[Unit]
Description=DevFlow Watch — handoff daemon
After=default.target

[Service]
Type=simple
ExecStart=/usr/bin/env node ${devflowWatchPath} start --foreground --project ${projectRoot}
Restart=on-failure
RestartSec=5
StandardOutput=append:%h/.devflow/systemd-stdout.log
StandardError=append:%h/.devflow/systemd-stderr.log

[Install]
WantedBy=default.target
`;
}

function _atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
  return filePath;
}

async function installService({ platform, projectRoot, devflowWatchPath }) {
  fs.mkdirSync(_devflowLogDir(), { recursive: true });
  if (platform === 'darwin') {
    const plistPath = _launchAgentsPath();
    const plist = renderLaunchdPlist({ projectRoot, devflowWatchPath });
    _atomicWrite(plistPath, plist);
    // Idempotent: unload if already loaded, ignore errors
    try { await _runExec('launchctl', ['unload', plistPath]); } catch {}
    await _runExec('launchctl', ['load', plistPath]);
    return { servicePath: plistPath };
  }
  if (platform === 'linux') {
    const unitPath = _systemdUnitPath();
    const unit = renderSystemdUnit({ projectRoot, devflowWatchPath });
    _atomicWrite(unitPath, unit);
    await _runExec('systemctl', ['--user', 'daemon-reload']);
    await _runExec('systemctl', ['--user', 'enable', 'devflow-watch.service']);
    await _runExec('systemctl', ['--user', 'start', 'devflow-watch.service']);
    return { servicePath: unitPath };
  }
  const err = new Error(`unsupported platform: ${platform}`);
  err.code = 'EUNSUPPORTED';
  throw err;
}

async function uninstallService({ platform }) {
  if (platform === 'darwin') {
    const plistPath = _launchAgentsPath();
    try { await _runExec('launchctl', ['unload', plistPath]); } catch {}
    try { fs.unlinkSync(plistPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return { servicePath: plistPath };
  }
  if (platform === 'linux') {
    const unitPath = _systemdUnitPath();
    try { await _runExec('systemctl', ['--user', 'stop', 'devflow-watch.service']); } catch {}
    try { await _runExec('systemctl', ['--user', 'disable', 'devflow-watch.service']); } catch {}
    try { fs.unlinkSync(unitPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { await _runExec('systemctl', ['--user', 'daemon-reload']); } catch {}
    return { servicePath: unitPath };
  }
  const err = new Error(`unsupported platform: ${platform}`);
  err.code = 'EUNSUPPORTED';
  throw err;
}

module.exports = {
  installService,
  uninstallService,
  renderLaunchdPlist,
  renderSystemdUnit,
  _setRunExec,
  _resetMocks,
};
```

2. **bin/devflow-watch.cjs (additive subcommands):**

Add after existing cmdLogs():

```js
async function cmdInstallService(flags) {
  const installer = require('./lib/service-installer.cjs');
  const projectRoot = path.resolve(flags.project || process.cwd());
  const devflowWatchPath = path.resolve(__filename);
  const platform = process.platform;
  if (platform !== 'darwin' && platform !== 'linux') {
    printErr(`devflow-watch: install-service unsupported on ${platform} (v1.2 supports darwin + linux)`);
    return 1;
  }
  try {
    const { servicePath } = await installer.installService({ platform, projectRoot, devflowWatchPath });
    printOut(`devflow-watch: service installed at ${servicePath}`);
    return 0;
  } catch (e) {
    printErr(`devflow-watch: install failed: ${e.message}`);
    return 3;
  }
}

async function cmdUninstallService(flags) {
  const installer = require('./lib/service-installer.cjs');
  const platform = process.platform;
  if (platform !== 'darwin' && platform !== 'linux') {
    printErr(`devflow-watch: uninstall-service unsupported on ${platform}`);
    return 1;
  }
  try {
    const { servicePath } = await installer.uninstallService({ platform });
    printOut(`devflow-watch: service uninstalled (was at ${servicePath})`);
    return 0;
  } catch (e) {
    printErr(`devflow-watch: uninstall failed: ${e.message}`);
    return 3;
  }
}
```

Extend main():

```js
if (sub === 'install-service') return cmdInstallService(flags);
if (sub === 'uninstall-service') return cmdUninstallService(flags);
```

Extend `cmdStart` to chain on `--install-service`:

```js
function cmdStart(flags) {
  // ... existing code ...
  if (flags['install-service']) {
    // Install BEFORE attempting to start; install includes load which starts the daemon via launchd
    return cmdInstallService(flags);  // launchd/systemd start the daemon; we don't need explicit cmdStart
  }
  // ... existing start logic ...
}
```

Extend `cmdStop` to chain on `--uninstall-service` AFTER stop completes.

Extend Usage line:
```
printErr('Usage: devflow-watch <start|stop|status|logs|install-service|uninstall-service|version> [flags]');
```

3. **templates/config.json (additive):**

Add to the `daemon` block (which 20-01 already created):

```json
"auto_launch": false
```

So the merged `daemon` block looks like (after both 20-01 and 20-02):
```json
"daemon": {
  "notifications": false,
  "notify_on_start": true,
  "notify_on_complete": true,
  "auto_launch": false
}
```

If 20-01 hasn't merged yet at this TRD's GREEN time, create the daemon block from scratch with just `auto_launch`. The wave-merge step reconciles.

4. **docs/handoff-watcher-guide.md (additive):**

Add `### Auto-launch (launchd / systemd)` subsection under `## Configuration`, BEFORE `## PTY support (v1.2+)`:

```markdown
### Auto-launch (launchd / systemd)

The daemon can register as a user-domain background service that survives
logout and starts automatically on login. Disabled by default; opt in with
the install-service subcommand:

```bash
# macOS / Linux: install + start
devflow-watch install-service [--project <path>]

# Stop + uninstall
devflow-watch uninstall-service

# Combined: install during start, uninstall during stop
devflow-watch start --install-service
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
```

Run `npm test` — all 35 RED tests should pass. Pre-existing 1911 unaffected.

Commit (single GREEN commit):
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "feat(20-02): add auto-launch via launchd plist + systemd-user unit + CLI subcommands" \
  --files plugins/devflow/devflow/bin/lib/service-installer.cjs \
  plugins/devflow/devflow/bin/devflow-watch.cjs \
  plugins/devflow/devflow/templates/config.json \
  docs/handoff-watcher-guide.md
```

# CRITICAL: install paths use os.homedir() / process.env.HOME — tests override HOME to a tmp dir. Real `~/Library/LaunchAgents/` writes during tests are unrecoverable.
# GOTCHA: ProgramArguments[0] is `/usr/bin/env`, [1] is `node`, NOT `/usr/local/bin/node` (varies by install). Tests assert exact prefix.
# PATTERN: idempotent install via `try { unload } catch {} ; load`. Same pattern works for systemctl with `enable` (idempotent natively).
  </action>
  <verify>
`npm test` shows 1946 tests pass (1911 + 35 new), 2 pre-existing failures unchanged. `node -e "console.log(JSON.stringify(Object.keys(require('./plugins/devflow/devflow/bin/lib/service-installer.cjs')).sort()))"` returns `["_resetMocks","_setRunExec","installService","renderLaunchdPlist","renderSystemdUnit","uninstallService"]`. `grep -c "Auto-launch" docs/handoff-watcher-guide.md` returns 1+. `node plugins/devflow/devflow/bin/devflow-watch.cjs install-service` (with HOME override + shim PATH) succeeds via shim.
  </verify>
  <done>
service-installer.cjs implemented with renderLaunchdPlist, renderSystemdUnit, installService, uninstallService. devflow-watch.cjs has install-service / uninstall-service subcommands + --install-service / --uninstall-service flags. Config + doc updated. 35 RED tests now GREEN. Pre-existing 1911 tests unchanged. Single GREEN commit.
  </done>
  <recovery>
If installService writes to real LaunchAgents/ during tests → check HOME override scope (must be set BEFORE require, restored AFTER each test). If launchctl/systemctl shim not invoked → check PATH override scope. If pre-existing devflow-watch tests fail → review additive-vs-replace boundary in main() dispatch; new branches must be additive `if (sub === ...)` arms, not replacements.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>

- [ ] All 35 new tests pass (P=8, U=5, I=12, C=7, EX=1, D=3 grep-verified)
- [ ] Pre-existing 1911 tests pass unchanged (allow 2 known failures)
- [ ] Service-installer exports exactly the locked surface (EX-1 deepStrictEqual)
- [ ] `xmlEscape` handles all 5 entities + special projectRoot chars
- [ ] Plist renders with correct Label, ProgramArguments, RunAtLoad, KeepAlive
- [ ] Systemd unit renders with correct [Unit]/[Service]/[Install] sections
- [ ] CLI dispatches install-service / uninstall-service subcommands
- [ ] CLI chains start --install-service and stop --uninstall-service
- [ ] templates/config.json has daemon.auto_launch field
- [ ] handoff-watcher-guide.md has `### Auto-launch (launchd / systemd)` subsection

</verification>

<success_criteria>

- [ ] **SC-1** Service file generation correct on darwin (plist) and linux (systemd unit)
- [ ] **SC-2** Idempotent install/uninstall — re-running succeeds
- [ ] **SC-3** User-domain only paths (no privilege elevation)
- [ ] **SC-4** CLI subcommands install-service / uninstall-service work
- [ ] **SC-5** Convenience flags --install-service / --uninstall-service work on start/stop
- [ ] **SC-6** Unsupported platform (win32) → exit 1 + clear message
- [ ] **SC-7** All 1911 pre-existing tests pass byte-identical

</success_criteria>

<output>
After completion, create `.planning/objectives/20-daemon-polish-bundle/20-02-auto-launch-SUMMARY.md` per the standard SUMMARY template.
</output>
