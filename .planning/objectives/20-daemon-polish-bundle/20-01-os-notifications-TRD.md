---
objective: 20-daemon-polish-bundle
trd: "01"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/notifier.cjs
  - plugins/devflow/devflow/bin/lib/notifier.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/osascript-shim.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/notify-send-shim.cjs
  - plugins/devflow/devflow/bin/lib/watcher-daemon.cjs
  - plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs
  - plugins/devflow/devflow/templates/config.json
  - docs/handoff-watcher-guide.md
autonomous: true
requirements:
  - DAEMON-NOTIFICATIONS
must_haves:
  truths:
    - "lib/notifier.cjs exports a notify({title, body, urgency?}) function that dispatches via osascript on darwin, notify-send on linux"
    - "notify() is async and returns void; never throws (errors logged via injected logger, not propagated)"
    - "When NOTIFIER_DISABLE=1 env var is set, notify() is a no-op (returns immediately without subprocess)"
    - "When daemon.notifications=false in config (or daemon block absent), watcher-daemon.cjs does NOT call notifier (zero subprocess overhead)"
    - "When daemon.notifications=true, watcher-daemon.cjs calls notifier on dispatch-start AND dispatch-complete (configurable via notify_on_start / notify_on_complete sub-flags)"
    - "Subprocess invocation uses execFile with separate argv (NOT exec with shell-string composition) to avoid quoting bugs"
    - "On darwin: notify() invokes `osascript -e 'display notification \"<body>\" with title \"<title>\"'` via execFile"
    - "On linux: notify() invokes `notify-send <title> <body>` via execFile"
    - "When osascript/notify-send not on PATH, notify() logs warning ONCE per process lifetime and disables itself for remaining calls"
    - "All 1911 pre-existing tests still pass (allow E2E1 + novel-domain known failures unchanged)"
    - "Fixture pattern: executable shim drops marker file with argv+env JSON; tests read marker file to assert dispatch shape — no real OS notifications during test runs"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/notifier.cjs"
      provides: "OS notification dispatcher (osascript/notify-send subprocess)"
      exports: ["notify", "_setRunExec", "_resetMocks"]
      min_lines: 60
    - path: "plugins/devflow/devflow/bin/lib/notifier.test.cjs"
      provides: "Notifier unit tests with shim-based subprocess mocking"
      min_lines: 150
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs"
      provides: "Fixture builders for obj 20 (initial: buildNotifierShimEnv, buildMockExecFile)"
      min_lines: 40
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/osascript-shim.cjs"
      provides: "Executable shim that drops marker file with argv+env JSON instead of dispatching real osascript"
      min_lines: 15
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/notify-send-shim.cjs"
      provides: "Same as osascript-shim.cjs but for notify-send"
      min_lines: 15
    - path: "plugins/devflow/devflow/bin/lib/watcher-daemon.cjs"
      provides: "processOnce wired to notifier on dispatch-start / dispatch-complete via injected hook"
      contains: "notifier"
    - path: "plugins/devflow/devflow/templates/config.json"
      provides: "daemon.notifications config block"
      contains: "\"notifications\""
    - path: "docs/handoff-watcher-guide.md"
      provides: "OS notifications subsection added under Configuration"
      contains: "OS notifications"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/notifier.cjs"
      to: "child_process.execFile"
      via: "_runExec injection hook (testable via _setRunExec)"
      pattern: "_runExec|execFile"
    - from: "plugins/devflow/devflow/bin/lib/watcher-daemon.cjs"
      to: "lib/notifier.cjs"
      via: "deps.notifier injected into processOnce; called on dispatch-start/complete"
      pattern: "deps\\.notifier|require.*notifier"
    - from: "plugins/devflow/devflow/bin/lib/notifier.test.cjs"
      to: "__fixtures__/osascript-shim.cjs + __fixtures__/notify-send-shim.cjs"
      via: "PATH override in test setup; shims drop marker JSONL files"
      pattern: "OSASCRIPT_SHIM_MARKER_FILE|NOTIFY_SEND_SHIM_MARKER_FILE"
---

<objective>
Add OS desktop notifications to the watcher daemon, behind the `daemon.notifications` config flag (default OFF). Notifications dispatch via `osascript` (macOS) / `notify-send` (Linux) when the daemon picks up a handoff (dispatch-start) or completes one (dispatch-complete). Module-level disable via `NOTIFIER_DISABLE=1` env var. Subprocess invocation tested via executable-shim fixtures (no real notifications in CI).

Purpose: Close the "is the daemon doing anything?" feedback gap. When Claude queues a `gh auth login` handoff, the user gets a desktop notification reminding them to switch to the browser tab. When the dispatch completes, a second notification confirms.

Output: New `lib/notifier.cjs` (subprocess shim with platform routing) + injected wire-up in `watcher-daemon.cjs` `processOnce` + shim-based test fixtures + handoff-watcher-guide.md subsection + `templates/config.json` `daemon.notifications` block.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── notifier.cjs                                              ← CREATE
├── notifier.test.cjs                                         ← CREATE
├── watcher-daemon.cjs                                        ← MODIFY (additive — notifier hook in processOnce)
├── watcher-daemon.test.cjs                                   ← MODIFY (additive — notifier integration tests)
└── __fixtures__/
    ├── daemon-polish-fixtures.cjs                            ← CREATE
    ├── osascript-shim.cjs                                    ← CREATE
    └── notify-send-shim.cjs                                  ← CREATE

plugins/devflow/devflow/templates/config.json                 ← MODIFY (additive — daemon.notifications)
docs/handoff-watcher-guide.md                                 ← MODIFY (additive — `### OS notifications` section)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing daemon dispatch hook point (extend, don't rewrite)

`plugins/devflow/devflow/bin/lib/watcher-daemon.cjs:276` — current dispatch site:

```js
// Log the COMMAND, never the resolved secret values. Audit-grep for
// "dispatching " in ~/.devflow/devflow-watch.log should show only cmd lines.
logFn('info', `dispatching ${pending.id}: ${pending.cmd}`);
let result;
try {
  result = await session.dispatch(pending.id, pending.cmd, {
    timeout_ms: timeoutMs || DEFAULT_DISPATCH_TIMEOUT_MS,
  });
} catch (e) { ... }
// ... after dispatch resolution:
logFn('info', `completed ${pending.id} status=${done.status} exit=${done.exit_code}`);
```

Notifier hook points: BEFORE `session.dispatch` (start) and AFTER `writeDoneRecord` (complete). Pattern:

```js
const notifier = deps.notifier;  // injected, may be null
if (notifier) {
  await notifier.notify({ title: 'DevFlow Watch', body: `dispatching ${pending.id}: ${pending.cmd}` });
}
// ... dispatch ...
if (notifier) {
  await notifier.notify({ title: 'DevFlow Watch', body: `completed ${pending.id} (${done.status})` });
}
```

`notifier` is injected into `processOnce(pending, deps)` — symmetric with existing `session` / `allowlist` / `log` injection.

### Pattern: Existing injection-hook style (mirror this)

`plugins/devflow/devflow/bin/lib/gh.cjs` — `_setRunGh` injection hook:

```js
const realRunGh = function (args) { /* spawnSync gh */ };
let _runGh = realRunGh;
function _setRunGh(fn) { _runGh = (fn != null) ? fn : realRunGh; }
function _resetMocks() { _runGh = realRunGh; }
module.exports = { _setRunGh, _resetMocks, /* ... */ };
```

Mirror in `notifier.cjs`:

```js
const { execFile } = require('child_process');
const realRunExec = (cmd, args, opts) => new Promise((resolve, reject) => {
  execFile(cmd, args, opts, (err, stdout, stderr) => {
    if (err) reject(err); else resolve({ stdout, stderr });
  });
});
let _runExec = realRunExec;
function _setRunExec(fn) { _runExec = (fn != null) ? fn : realRunExec; }
function _resetMocks() { _runExec = realRunExec; _notifierDisabled = false; }
```

### Pattern: Executable shim with marker file (from obj 19 TRD 19-05)

`plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/` uses cassette JSON; obj 20's notifier needs subprocess-effect capture. Pattern:

```js
// __fixtures__/osascript-shim.cjs (executable; chmod +x)
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const marker = process.env.OSASCRIPT_SHIM_MARKER_FILE;
if (marker) {
  fs.appendFileSync(marker, JSON.stringify({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    pid: process.pid,
  }) + '\n');
}
process.exit(0);
```

Test setup:

```js
const shimDir = path.join(__dirname, '__fixtures__');
const origPATH = process.env.PATH;
const markerFile = path.join(tmpDir, 'osascript-marker.jsonl');
process.env.PATH = `${shimDir}:${origPATH}`;
process.env.OSASCRIPT_SHIM_MARKER_FILE = markerFile;
// ... call code under test ...
const calls = fs.readFileSync(markerFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
assert.equal(calls.length, 1);
assert.match(calls[0].argv.join(' '), /display notification.*with title/);
// teardown
process.env.PATH = origPATH;
delete process.env.OSASCRIPT_SHIM_MARKER_FILE;
```

CRITICAL: shim file MUST have `chmod +x`. Do this in fixture builder, NOT in the shim file itself. Pattern:

```js
// daemon-polish-fixtures.cjs
function buildNotifierShimEnv(tmpDir) {
  const shimDir = path.join(__dirname, '.');  // already in __fixtures__
  const osascriptShim = path.join(shimDir, 'osascript-shim.cjs');
  const notifySendShim = path.join(shimDir, 'notify-send-shim.cjs');
  // Ensure both shims are present; chmod is handled by build step OR git tracking
  // (commit shims with executable mode bits set via `git update-index --chmod=+x`)
  const markerFile = path.join(tmpDir, 'notify-marker.jsonl');
  return { shimDir, osascriptShim, notifySendShim, markerFile };
}
```

</codebase_examples>

<anti_patterns>

### Anti-pattern: Synchronous subprocess in dispatch hot path

DON'T:
```js
const { execFileSync } = require('child_process');
execFileSync('osascript', ['-e', script]);  // blocks dispatch loop
```

DO:
```js
await _runExec('osascript', ['-e', script]);  // async, doesn't block tick()
```

The dispatch loop polls every 500ms. Synchronous subprocess invocation that takes 50-100ms (osascript startup) compounds across many dispatches. Use async + await; the loop's serial-dispatch-one-at-a-time discipline preserves ordering.

### Anti-pattern: Shell-string composition for subprocess args

DON'T:
```js
exec(`osascript -e 'display notification "${body}" with title "${title}"'`);  // body/title may contain quotes
```

DO:
```js
execFile('osascript', ['-e', `display notification "${esc(body)}" with title "${esc(title)}"`]);
```

`exec` runs through `/bin/sh -c` and is vulnerable to shell injection from user-controlled command names. `execFile` with array argv is safe. Even with execFile, the AppleScript string itself needs internal quoting for double-quotes — write `esc()` that replaces `"` with `\"` and backslashes with `\\`.

### Anti-pattern: Per-dispatch error spam on missing binary

DON'T:
```js
async function notify(...) {
  try { await execFile('osascript', ...); } catch (e) { log('warn', e.message); }
}
// Every dispatch logs "Error: spawn osascript ENOENT" — log file fills up.
```

DO:
```js
let _notifierDisabled = false;
async function notify(...) {
  if (_notifierDisabled) return;
  try { await _runExec('osascript', ...); }
  catch (e) {
    if (e.code === 'ENOENT') {
      _notifierDisabled = true;
      log('warn', 'osascript not found on PATH; OS notifications disabled for this session');
      return;
    }
    log('warn', `notification dispatch failed: ${e.message}`);
  }
}
```

One warning per process lifetime; no per-dispatch noise.

</anti_patterns>

<error_recovery>

### When osascript / notify-send not on PATH

ENOENT → set module-level `_notifierDisabled = true`, log warning ONCE, return early on subsequent calls. Tested by F-1 (PATH cleared, dispatch should not throw, second call should be silent).

### When notify-send fails on Linux headless / SSH session

DBus connection errors → exit code non-zero, NOT ENOENT. Log warning per-dispatch (rare; user is in a degraded environment) but DON'T disable globally — user may switch to local terminal mid-session and want notifications resumed.

### When daemon.notifications=true but config.json malformed

Notifier injection happens at daemon startup (`runForeground` in `bin/devflow-watch.cjs`). If config.json is malformed, notifier construction throws → daemon falls back to no-notifier path (deps.notifier=null). User sees no notifications but daemon still works.

### When daemon stopped mid-notification

Async notifier call may be in-flight when SIGTERM arrives. Don't await it during shutdown — use `Promise.race([notifier.notify(...), shutdownSignal])` OR fire-and-forget with `.catch(() => {})` if not on the dispatch critical path. Notifier failures must NEVER block daemon exit.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/20-daemon-polish-bundle/20-CONTEXT.md
@.planning/objectives/20-daemon-polish-bundle/20-RESEARCH.md

# Source under modification
@plugins/devflow/devflow/bin/lib/watcher-daemon.cjs
@plugins/devflow/devflow/bin/devflow-watch.cjs
@plugins/devflow/devflow/templates/config.json
@docs/handoff-watcher-guide.md
</context>

<research_context>

### From 20-RESEARCH.md §2 Pattern A — Subprocess shim with marker-file effect

The proven test pattern for subprocess effects: executable shim drops marker file (JSONL of `{argv, env, cwd, pid}`); test prepends shim dir to `$PATH`; assertion reads marker file. Mirrors obj 19 TRD 19-05 cassette pattern but for one-shot effects rather than HTTP traffic.

### From 20-RESEARCH.md §3 Don't Hand-Roll

Use `osascript` (macOS) and `notify-send` (Linux) — system binaries. NOT `node-notifier` npm dep (adds native binding + has macOS Catalina bundle-id issues). One less dependency, one less compatibility surface.

### From 20-RESEARCH.md §4 Common Pitfalls

- macOS notifications silent in fullscreen / DnD — out of our control, document.
- `notify-send` on headless / no `$DISPLAY` — fails ENOENT-adjacent (DBus error, not ENOENT). Log per-dispatch but don't disable.
- AppleScript string quoting — internal `"` and `\\` need escape; use `esc()` helper.

</research_context>

<gotchas>

- **Don't hardcode platform check at module load** — read `process.platform` per-call so tests can spoof via env var. Pattern: `const plat = process.env.NOTIFIER_PLATFORM_OVERRIDE || process.platform;` then check `plat === 'darwin'` / `plat === 'linux'`. Test injection point.

- **chmod +x on shim files** — git stores executable bit; commit shims with `git update-index --chmod=+x` OR via the `core.fileMode=true` default. If executor commits shim WITHOUT exec bit, tests fail with EACCES on shim invocation. Verify in fixture-builder test.

- **NOTIFIER_DISABLE env var** — provides a no-shim, no-subprocess path for tests that don't want any notifier overhead at all. Distinct from `daemon.notifications=false` (config gate at injection-time vs. runtime disable).

- **Process-lifetime warning suppression** — `_notifierDisabled` is module-level state. Reset between tests via `_resetMocks()`.

- **Don't fold notifier injection into `runLoop` opts** — inject via `processOnce` deps directly. `runLoop` already plumbs `session, allowlist, log, timeoutMs` through; adding notifier mirrors that.

</gotchas>

<test_list_first>

Per CLAUDE.md TDD playbook habit 2: explicit checklist of behavior cases BEFORE any test code.

### Group N — notify() behavior

- [ ] **N-1** notify({title, body}) on darwin invokes execFile with osascript + AppleScript expression containing both title and body
- [ ] **N-2** notify({title, body}) on linux invokes execFile with notify-send + title + body argv
- [ ] **N-3** notify() with NOTIFIER_DISABLE=1 returns early without invoking execFile
- [ ] **N-4** notify() on platform other than darwin/linux is a no-op (returns early; no warning spam)
- [ ] **N-5** notify() escapes embedded double-quotes and backslashes in body+title (AppleScript)
- [ ] **N-6** notify() resolves/returns even when execFile fails — never throws
- [ ] **N-7** notify() with multiple kwargs ({title, body, urgency: 'critical'}) maps urgency to `notify-send -u critical` on linux; ignored on darwin
- [ ] **N-8** notify() called twice with same payload invokes execFile twice (no dedup; v1.2 simplification)

### Group F — Failure modes

- [ ] **F-1** ENOENT on first call sets _notifierDisabled=true; second call returns early without execFile invocation
- [ ] **F-2** Non-ENOENT error (e.g. DBus failure) logs warning per call; _notifierDisabled stays false
- [ ] **F-3** _resetMocks() clears _notifierDisabled state (test-only API contract)
- [ ] **F-4** notify() captures execFile errors via injected logger (deps.log if provided), falls back to console.warn if not
- [ ] **F-5** Empty title or body — notify() still dispatches (no validation; OS handles)

### Group I — Daemon integration

- [ ] **I-1** processOnce called WITHOUT deps.notifier (deps.notifier=null) does not call any notifier; behavior byte-identical to v1.1+obj19
- [ ] **I-2** processOnce called WITH deps.notifier calls notifier.notify({title, body matching pending.cmd}) BEFORE session.dispatch (dispatch-start signal)
- [ ] **I-3** processOnce calls notifier.notify (with completion message) AFTER writeDoneRecord (dispatch-complete signal)
- [ ] **I-4** Notifier errors during dispatch-start do NOT prevent dispatch from running
- [ ] **I-5** Notifier errors during dispatch-complete do NOT prevent done record from being written
- [ ] **I-6** When daemon.notifications=false in config (or daemon block missing), runForeground constructs deps.notifier=null
- [ ] **I-7** When daemon.notifications=true, runForeground injects notifier; processOnce called with notifier in deps
- [ ] **I-8** notify_on_start=false sub-flag suppresses dispatch-start notification but allows dispatch-complete
- [ ] **I-9** notify_on_complete=false sub-flag suppresses dispatch-complete notification but allows dispatch-start

### Group EX — Export surface lock

- [ ] **EX-1** lib/notifier.cjs module.exports is exactly `{ notify, _setRunExec, _resetMocks }` (deepStrictEqual)

### Group D — Documentation

- [ ] **D-1** docs/handoff-watcher-guide.md contains `### OS notifications` heading
- [ ] **D-2** Section documents osascript/notify-send dependency, NOTIFIER_DISABLE env var, daemon.notifications config block
- [ ] **D-3** Section mentions sub-flags notify_on_start / notify_on_complete and their defaults

</test_list_first>

<feature>
  <name>OS desktop notifications dispatcher</name>
  <files>plugins/devflow/devflow/bin/lib/notifier.cjs, plugins/devflow/devflow/bin/lib/notifier.test.cjs</files>
  <behavior>
    Async notify({title, body, urgency?}) function dispatches via osascript on darwin, notify-send on linux. Subprocess invocation through injected _runExec hook. ENOENT → disable for session. Other errors → log per-call. NOTIFIER_DISABLE=1 env var → unconditional no-op.

    Cases:
    - input: {title: 'X', body: 'Y'} on darwin → execFile('osascript', ['-e', 'display notification "Y" with title "X"'])
    - input: {title: 'X', body: 'Y'} on linux → execFile('notify-send', ['X', 'Y'])
    - input: same with NOTIFIER_DISABLE=1 → no execFile call
    - input: {title: 'X', body: 'has "quotes"'} on darwin → AppleScript string escapes embedded quotes
    - edge: ENOENT first call → _notifierDisabled=true; second call → early return
    - edge: non-ENOENT error → warning logged, _notifierDisabled stays false
    - edge: platform=win32 → no-op (no warning spam)
  </behavior>
  <implementation>
    Single module ~80 LOC. realRunExec wraps child_process.execFile in Promise. _runExec injection hook with _setRunExec / _resetMocks. esc() helper for AppleScript double-quote + backslash. notify() dispatches based on `process.env.NOTIFIER_PLATFORM_OVERRIDE || process.platform`. Module-level _notifierDisabled boolean reset by _resetMocks().
  </implementation>
</feature>

<feature>
  <name>Daemon hook wire-up (additive)</name>
  <files>plugins/devflow/devflow/bin/lib/watcher-daemon.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs</files>
  <behavior>
    processOnce(pending, deps) accepts deps.notifier (optional). Calls notifier.notify on dispatch-start (before session.dispatch) and dispatch-complete (after writeDoneRecord). Notifier errors caught and logged; never propagate. deps.notifier=null preserves v1.1+obj19 byte-identical behavior.

    Cases:
    - input: deps.notifier=null → no notifier calls; existing tests pass byte-identical
    - input: deps.notifier=mock → notifier.notify called twice (start + complete) with title='DevFlow Watch' and body referencing pending.cmd / done.status
    - input: deps.notifier throws → dispatch still executes; done record still written
    - edge: notify_on_start=false → only complete called
    - edge: notify_on_complete=false → only start called
  </behavior>
  <implementation>
    Add 6-12 lines to processOnce: if (deps.notifier && deps.notify_on_start !== false) await notifier.notify(...) before session.dispatch; if (deps.notifier && deps.notify_on_complete !== false) await notifier.notify(...) after writeDoneRecord. Wrap in try/catch — notifier errors do NOT propagate. Existing watcher-daemon.test.cjs tests pass unchanged (deps.notifier omitted → falsy → no calls).

    runForeground in bin/devflow-watch.cjs reads config.json daemon.notifications block; if true, requires('./lib/notifier.cjs') and passes through deps.notifier + deps.notify_on_start + deps.notify_on_complete to runLoop's processOnce calls (runLoop already plumbs deps; add the three new fields).
  </implementation>
</feature>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing tests + shim fixtures + test-list-first checklist</name>
  <files>plugins/devflow/devflow/bin/lib/notifier.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/osascript-shim.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/notify-send-shim.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs</files>
  <action>
Per CLAUDE.md TDD playbook (habits 1-4): write tests FIRST, fixture builders FIRST, no implementation.

Create the 3 fixture files:

1. `__fixtures__/osascript-shim.cjs` (~15 LOC, executable Node script):
   - Shebang `#!/usr/bin/env node`
   - Reads `process.env.OSASCRIPT_SHIM_MARKER_FILE`; if set, appends JSONL line `{argv, cwd, pid, env_subset: {NOTIFY_TITLE, NOTIFY_BODY}}` to that file
   - process.exit(0)

2. `__fixtures__/notify-send-shim.cjs` (~15 LOC):
   - Same pattern as above; reads `NOTIFY_SEND_SHIM_MARKER_FILE`

3. `__fixtures__/daemon-polish-fixtures.cjs` (~50 LOC):
   - Export `buildNotifierShimEnv(tmpDir)` returning `{shimDir, osascriptPath, notifySendPath, markerFile, cleanup}` — sets PATH override + marker file path; cleanup restores PATH
   - Export `buildMockExecFile()` returning a function that records calls into an in-memory array (alternative to shim approach — useful for unit tests that don't need real subprocess fork)
   - Export `readNotifierMarkerCalls(markerFile)` returning parsed JSONL array

Write ALL test cases listed in `<test_list_first>` (Groups N, F, I, EX, D). Tests MUST FAIL because notifier.cjs doesn't exist and watcher-daemon.cjs doesn't yet read deps.notifier.

Test file structure:
- `notifier.test.cjs` covers Groups N (8), F (5), EX (1) = 14 tests using both shim approach (N-1, N-2 — verify real subprocess invocation through PATH) AND mock approach (most others — faster, deterministic via _setRunExec)
- `watcher-daemon.test.cjs` ADDITIVE: appends Group I tests (9 tests) using mock notifier ({notify: async () => {}}) injected via processOnce deps

CRITICAL: chmod +x on the two shim files. Use `fs.chmodSync(path, 0o755)` in fixture builder OR commit with executable bit. Easier: do `fs.chmodSync` at fixture-builder load time (idempotent).

Group D tests are deferred to Task 2's verify step — checked via grep against docs/handoff-watcher-guide.md after the doc edit.

Run tests; verify ALL 23 new tests fail (notifier.cjs missing OR processOnce doesn't accept notifier). Pre-existing 1911 tests still pass.

Commit (single RED commit per playbook habit 3):
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "test(20-01): add failing tests for OS notifications dispatcher and daemon hook" \
  --files plugins/devflow/devflow/bin/lib/notifier.test.cjs \
  plugins/devflow/devflow/bin/lib/__fixtures__/osascript-shim.cjs \
  plugins/devflow/devflow/bin/lib/__fixtures__/notify-send-shim.cjs \
  plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs \
  plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs
```

# CRITICAL: tests must FAIL with the right reason (Cannot find module './notifier.cjs' for notifier tests; deps.notifier ignored for daemon tests). DON'T fall into "test passes because implementation accidentally exists" trap.
# GOTCHA: shim files must have +x bit OR Node will refuse to invoke them. Set in fixture builder via fs.chmodSync.
# PATTERN: mirror obj 19 TRD 19-01 RED commit (bf290ba) — single commit, all RED tests, all fail with the same root cause class.
  </action>
  <verify>
`npm test 2>&1 | grep -E "fail|pass" | tail -20` shows 23 new failures. `npm test -- --test-name-pattern="watcher-daemon|notifier"` shows the new failures clearly. Pre-existing 1911 still pass: `npm test 2>&1 | tail -5` should show passing count ≥1911 (excluding 23 new failures).
  </verify>
  <done>
23 new failing tests committed (RED). Fixture builders + shim files committed. Pre-existing 1911 tests unchanged. Single RED commit on branch.
  </done>
  <recovery>
If shim files lack +x → re-run `fs.chmodSync(path, 0o755)` in fixture-builder load OR commit with `git update-index --chmod=+x`. If tests fail for wrong reason (e.g., syntax error in test) → fix the test, NOT the implementation. If pre-existing tests start failing → revert and review test setup; PATH override should be scoped to test, not global.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement notifier.cjs + wire processOnce + config.json + doc update</name>
  <files>plugins/devflow/devflow/bin/lib/notifier.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.cjs, plugins/devflow/devflow/bin/devflow-watch.cjs, plugins/devflow/devflow/templates/config.json, docs/handoff-watcher-guide.md</files>
  <action>
Per CLAUDE.md TDD playbook habit 3: write MINIMAL code to make all 23 RED tests pass. No extra features. No premature optimization.

Implementation order (outside-in per playbook habit 5):

1. **notifier.cjs (~80 LOC):**

```js
'use strict';
const { execFile } = require('child_process');

const realRunExec = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 5000, ...opts }, (err, stdout, stderr) => {
    if (err) reject(err); else resolve({ stdout, stderr });
  });
});
let _runExec = realRunExec;
let _notifierDisabled = false;

function _setRunExec(fn) { _runExec = (fn != null) ? fn : realRunExec; }
function _resetMocks() { _runExec = realRunExec; _notifierDisabled = false; }

function _esc(s) {
  // AppleScript string escape: backslash first, then double-quote
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function notify(opts = {}) {
  if (process.env.NOTIFIER_DISABLE === '1') return;
  if (_notifierDisabled) return;
  const log = opts.log || ((level, msg) => { if (level === 'warn') console.warn(`[notifier] ${msg}`); });
  const plat = process.env.NOTIFIER_PLATFORM_OVERRIDE || process.platform;
  const title = opts.title || 'DevFlow Watch';
  const body = opts.body || '';
  try {
    if (plat === 'darwin') {
      const script = `display notification "${_esc(body)}" with title "${_esc(title)}"`;
      await _runExec('osascript', ['-e', script]);
    } else if (plat === 'linux') {
      const args = [];
      if (opts.urgency) args.push('-u', String(opts.urgency));
      args.push(title, body);
      await _runExec('notify-send', args);
    } else {
      // Other platforms (win32 etc.) — no-op for v1.2
      return;
    }
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      _notifierDisabled = true;
      log('warn', `${plat === 'darwin' ? 'osascript' : 'notify-send'} not found on PATH; OS notifications disabled for this session`);
      return;
    }
    log('warn', `notification dispatch failed: ${e && e.message ? e.message : String(e)}`);
  }
}

module.exports = { notify, _setRunExec, _resetMocks };
```

2. **watcher-daemon.cjs (additive — 6-12 LOC):**

Inside `processOnce`, around line 276 (the `dispatching` log line):

```js
// 20-01: dispatch-start notification (if notifier injected)
if (deps.notifier && deps.notify_on_start !== false) {
  try {
    await deps.notifier.notify({
      title: 'DevFlow Watch',
      body: `dispatching ${pending.id}: ${pending.cmd}`,
      log: deps.log,
    });
  } catch { /* notifier errors must not block dispatch */ }
}
logFn('info', `dispatching ${pending.id}: ${pending.cmd}`);
```

After `writeDoneRecord` (around line 315):

```js
// 20-01: dispatch-complete notification (if notifier injected)
if (deps.notifier && deps.notify_on_complete !== false) {
  try {
    await deps.notifier.notify({
      title: 'DevFlow Watch',
      body: `completed ${pending.id} status=${done.status} exit=${done.exit_code}`,
      log: deps.log,
    });
  } catch { /* notifier errors must not block dispatch */ }
}
```

Also propagate `deps.notifier`, `deps.notify_on_start`, `deps.notify_on_complete` through `runLoop` opts → `processOnce` deps. Add the three fields to `runLoop`'s destructured opts and pass-through.

3. **bin/devflow-watch.cjs (in `runForeground` ~5-15 LOC):**

```js
// Read config.json for notification settings (graceful default: all off)
let notifier = null;
let notify_on_start = true;
let notify_on_complete = true;
try {
  const configPath = path.join(projectRoot, '.planning', 'config.json');
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (cfg.daemon && cfg.daemon.notifications === true) {
      notifier = require('./lib/notifier.cjs');
      if (cfg.daemon.notify_on_start === false) notify_on_start = false;
      if (cfg.daemon.notify_on_complete === false) notify_on_complete = false;
      log('info', `notifications enabled (start=${notify_on_start}, complete=${notify_on_complete})`);
    }
  }
} catch (e) {
  log('warn', `notifications config load failed: ${e.message}; continuing without notifications`);
}
// Pass to runLoop:
loop = daemon.runLoop({ projectRoot, session, allowlist, log, notifier, notify_on_start, notify_on_complete });
```

4. **templates/config.json (additive):**

Add inside the top-level config object:

```json
"daemon": {
  "notifications": false,
  "notify_on_start": true,
  "notify_on_complete": true
}
```

NOTE: subsequent TRDs (20-02, 20-03, 20-04, 20-05) will add MORE keys to the daemon block. Each TRD adds its own keys; this TRD adds only notifications/notify_on_start/notify_on_complete. Do NOT add fields that belong to other TRDs.

5. **docs/handoff-watcher-guide.md (additive — new `### OS notifications` subsection under `## Configuration`):**

Insert after the "Environment overrides" subsection (around line 167), BEFORE "PTY support (v1.2+)":

```markdown
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
```

Run `npm test` — all 23 RED tests should now pass. Pre-existing 1911 unaffected.

Commit (single GREEN commit):
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "feat(20-01): implement OS notification dispatcher with daemon hook + config gating" \
  --files plugins/devflow/devflow/bin/lib/notifier.cjs \
  plugins/devflow/devflow/bin/lib/watcher-daemon.cjs \
  plugins/devflow/devflow/bin/devflow-watch.cjs \
  plugins/devflow/devflow/templates/config.json \
  docs/handoff-watcher-guide.md
```

# CRITICAL: subprocess invocation MUST use execFile (NOT exec). Shell-string composition with user-controlled `pending.cmd` is shell-injection territory.
# GOTCHA: NOTIFIER_PLATFORM_OVERRIDE env var is the test injection seam — code reads it on every call, not at module load.
# PATTERN: log injection mirrors gh.cjs and other lib modules — opts.log function with (level, msg) signature.
  </action>
  <verify>
`npm test` shows 1934 tests pass (1911 + 23 new), 2 pre-existing failures unchanged. `grep -c "OS notifications" docs/handoff-watcher-guide.md` returns 1+. `node -e "console.log(JSON.stringify(Object.keys(require('./plugins/devflow/devflow/bin/lib/notifier.cjs'))))"` returns `["notify","_setRunExec","_resetMocks"]`. `node ~/.claude/devflow/bin/df-tools.cjs frontmatter validate .planning/objectives/20-daemon-polish-bundle/20-01-os-notifications-TRD.md --schema trd` returns valid:true.
  </verify>
  <done>
notifier.cjs implemented; processOnce wired; config.json updated; handoff-watcher-guide.md has new subsection. All 23 RED tests now GREEN. Pre-existing 1911 tests unchanged. Single GREEN commit on branch. Total tests: 1934 pass + 2 pre-existing failures + 27 skips.
  </done>
  <recovery>
If GREEN tests still fail → check shim PATH override scope (must be set BEFORE require, restored AFTER). If watcher-daemon.test.cjs Group I tests fail → verify deps.notifier is plumbed through runLoop opts AND processOnce deps. If pre-existing tests fail → bisect against `git diff HEAD~1`; the additive changes should NOT touch any line that pre-existing tests depend on. Rollback via `git revert HEAD` if scope creep introduced unintended changes.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>

- [ ] `lib/notifier.cjs` exports exactly `{ notify, _setRunExec, _resetMocks }` (deepStrictEqual EX-1)
- [ ] All 23 new tests pass (Groups N=8, F=5, I=9, EX=1; D-1..D-3 verified via grep against handoff-watcher-guide.md)
- [ ] Pre-existing 1911 tests pass unchanged (allow 2 known E2E1 + novel-domain failures)
- [ ] Subprocess invocation uses `execFile` not `exec` — `grep -nE "(^|[^F])exec\(" plugins/devflow/devflow/bin/lib/notifier.cjs` returns nothing
- [ ] `templates/config.json` includes `daemon.notifications`, `daemon.notify_on_start`, `daemon.notify_on_complete` keys
- [ ] `docs/handoff-watcher-guide.md` has `### OS notifications` subsection
- [ ] Existing watcher-daemon.test.cjs tests pass byte-identical (deps.notifier omitted = no calls = old behavior)
- [ ] Shim files in `__fixtures__/` have executable bit (`stat -f "%Lp" plugins/devflow/devflow/bin/lib/__fixtures__/osascript-shim.cjs` returns 755 or similar)

</verification>

<success_criteria>

- [ ] **SC-1** Notifier dispatches via osascript on darwin, notify-send on linux, no-op elsewhere
- [ ] **SC-2** ENOENT → _notifierDisabled=true, warning logged once per session
- [ ] **SC-3** NOTIFIER_DISABLE=1 env var → unconditional no-op
- [ ] **SC-4** daemon.notifications=false (or absent) → zero subprocess overhead (deps.notifier=null)
- [ ] **SC-5** Existing 1911 tests pass byte-identical
- [ ] **SC-6** New 23 tests pass (RED→GREEN)
- [ ] **SC-7** Documentation section added covering osascript/notify-send dependency, env var, config block

</success_criteria>

<output>
After completion, create `.planning/objectives/20-daemon-polish-bundle/20-01-os-notifications-SUMMARY.md` per the standard SUMMARY template (truths verified, artifacts created, key links observed, deviations from TRD, test counts before/after, commits).
</output>
