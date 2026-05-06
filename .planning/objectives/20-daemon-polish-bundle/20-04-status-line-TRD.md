---
objective: 20-daemon-polish-bundle
trd: "04"
type: tdd
confidence: high
wave: 2
depends_on:
  - "20-03"
files_modified:
  - plugins/devflow/hooks/statusline.js
  - plugins/devflow/hooks/statusline.test.js
  - plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
  - plugins/devflow/devflow/templates/config.json
  - docs/handoff-watcher-guide.md
autonomous: true
requirements:
  - DAEMON-STATUS-LINE
must_haves:
  truths:
    - "hooks/statusline.js renders a watcher status segment when daemon.status_line=true in config and daemon is alive"
    - "Renders `▶ watcher` (green) when daemon alive with 0 pending across all projects"
    - "Renders `⏸ N pending` (yellow) when daemon alive with N>0 pending across all projects (sums per-project pending)"
    - "Hides watcher segment entirely (zero output) when daemon not running OR config flag false OR config missing"
    - "Reads multi-project PID shape from 20-03 (watching: [...] with 0+ entries)"
    - "Single-project PID file (watching: [path]) renders correctly — back-compat with v1.1 + obj 19"
    - "Watcher status block wrapped in try/catch — statusline NEVER crashes on watcher state errors (devflow not installed, malformed PID file, etc.)"
    - "Sub-200ms hook target preserved — additive cost is bounded by N file reads where N = number of watched projects"
    - "Pre-existing 1911 tests still pass; new statusline.test.js tests pass cleanly"
    - "Statusline test file does NOT exist today — created fresh with this TRD"
  artifacts:
    - path: "plugins/devflow/hooks/statusline.js"
      provides: "Extended statusline render: model | task | dir | watcher-status | ctx"
      contains: "watcherStatus"
    - path: "plugins/devflow/hooks/statusline.test.js"
      provides: "First-ever test file for statusline.js — covers existing render paths + new watcher segment"
      min_lines: 200
    - path: "plugins/devflow/devflow/templates/config.json"
      provides: "daemon.status_line config flag"
      contains: "\"status_line\""
    - path: "docs/handoff-watcher-guide.md"
      provides: "Status-line indicator subsection added under Configuration"
      contains: "Status-line"
  key_links:
    - from: "plugins/devflow/hooks/statusline.js"
      to: "plugins/devflow/devflow/bin/lib/watcher-state.cjs"
      via: "require('~/.claude/devflow/bin/lib/watcher-state.cjs') — sync runtime path"
      pattern: "watcher-state|isWatcherLive|readPidFile"
    - from: "plugins/devflow/hooks/statusline.js"
      to: "config.json"
      via: "read .planning/config.json on every render; gate on daemon.status_line"
      pattern: "config.json|daemon.*status_line"
---

<objective>
Extend `hooks/statusline.js` with a watcher status segment behind the `daemon.status_line` config flag. Reads PID file via `lib/watcher-state.cjs` (synced runtime path), shows `▶ watcher` (idle alive) or `⏸ N pending` (work queued) or hides entirely (off / dead). Multi-project aware (sums per-project pending counts from 20-03's `watching: []`). First-ever statusline test file created.

Purpose: Close the "is the watcher actually doing anything?" feedback gap. Today users read logs to know if the daemon is alive and busy. With the indicator, the answer is one glance away.

Output: Modified `hooks/statusline.js`; new `hooks/statusline.test.js`; `templates/config.json` flag; doc subsection.
</objective>

<file_tree>
plugins/devflow/hooks/
├── statusline.js                                             ← MODIFY (additive watcher status block)
└── statusline.test.js                                        ← CREATE (first-ever test file for statusline)

plugins/devflow/devflow/bin/lib/__fixtures__/
└── daemon-polish-fixtures.cjs                                ← MODIFY (statusline-input fixture builders)

plugins/devflow/devflow/templates/config.json                 ← MODIFY (additive — daemon.status_line)
docs/handoff-watcher-guide.md                                 ← MODIFY (additive — `### Status-line indicator` section)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing statusline structure (extend additively)

`plugins/devflow/hooks/statusline.js` (full file, 91 lines today):

```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    let ctx = '';  // context % bar
    if (remaining != null) { /* ... */ }

    let task = '';  // current task from todos
    const homeDir = os.homedir();
    const todosDir = path.join(homeDir, '.claude', 'todos');
    if (session && fs.existsSync(todosDir)) { /* ... */ }

    let dfUpdate = '';  // df update available
    const cacheFile = path.join(homeDir, '.claude', 'cache', 'df-update-check.json');
    if (fs.existsSync(cacheFile)) { /* ... */ }

    // Output
    const dirname = path.basename(dir);
    if (task) {
      process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}`);
    } else {
      process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}`);
    }
  } catch (e) {
    // Silent fail
  }
});
```

20-04 adds a `watcherStatus` block parallel to `dfUpdate` / `task` / `ctx`. Position in output: between dirname and ctx (most useful adjacency since both are "live state"):

```js
let watcherStatus = '';
try {
  const cwdConfig = path.join(data.workspace?.current_dir || process.cwd(), '.planning', 'config.json');
  if (fs.existsSync(cwdConfig)) {
    const cfg = JSON.parse(fs.readFileSync(cwdConfig, 'utf8'));
    if (cfg.daemon && cfg.daemon.status_line === true) {
      const stateLib = require(path.join(homeDir, '.claude', 'devflow', 'bin', 'lib', 'watcher-state.cjs'));
      if (stateLib.isWatcherLive()) {
        const info = stateLib.readPidFile();
        const watching = (info && Array.isArray(info.watching)) ? info.watching : [];
        let pendingCount = 0;
        for (const projRoot of watching) {
          try {
            const pendDir = path.join(projRoot, '.devflow-handoff', 'pending');
            if (fs.existsSync(pendDir)) {
              pendingCount += fs.readdirSync(pendDir).filter(f => f.endsWith('.json')).length;
            }
          } catch {}
        }
        watcherStatus = pendingCount > 0
          ? `\x1b[33m⏸ ${pendingCount} pending\x1b[0m │ `
          : `\x1b[32m▶ watcher\x1b[0m │ `;
      }
    }
  }
} catch {
  // statusline must NEVER crash on watcher state errors
}

// Updated output (insert watcherStatus after dirname):
if (task) {
  process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m │ ${watcherStatus}${ctx}`);
} else {
  process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m │ ${watcherStatus}${ctx}`);
}
```

Note: `watcherStatus` includes its OWN trailing ` │ ` separator (when non-empty). When empty, the existing `│` chain still renders correctly (no double-separator). Refactor: emit watcherStatus only when non-empty:

```js
const wsSep = watcherStatus ? `${watcherStatus}` : '';
// (watcherStatus already contains trailing ` │ ` when non-empty)
process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m │ ${wsSep}${ctx}`);
```

Wait — that double-separates when watcherStatus is empty. Cleaner: don't include trailing separator in watcherStatus; let the output line position it:

```js
watcherStatus = pendingCount > 0
  ? `\x1b[33m⏸ ${pendingCount} pending\x1b[0m`  // no trailing separator
  : `\x1b[32m▶ watcher\x1b[0m`;
// In output:
const wsBlock = watcherStatus ? ` │ ${watcherStatus}` : '';
process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${wsBlock}${ctx}`);
```

### Pattern: Existing test pattern for hooks (mirror in new statusline.test.js)

`plugins/devflow/hooks/gate-interactive.test.js` exists already (referenced in obj 19). Pattern:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

test('statusline — watcher off / config flag false → no watcher segment', () => {
  // Setup: run statusline.js as subprocess, pipe Claude-style JSON input, capture stdout
  const result = spawnSync(process.execPath, [path.join(__dirname, 'statusline.js')], {
    input: JSON.stringify({
      model: { display_name: 'Sonnet 4.5' },
      workspace: { current_dir: '/tmp/test-project' },
      session_id: 'sess-1',
      context_window: { remaining_percentage: 70 },
    }),
    encoding: 'utf8',
    env: { ...process.env, HOME: '/tmp/test-home' },
  });
  assert.equal(result.status, 0);
  assert.notMatch(result.stdout, /watcher|⏸|pending|▶/);
});
```

This is the proven pattern: subprocess + JSON stdin + assert on stdout. Tests don't import statusline.js (it's an end-of-stream emitter, not a function-export module).

</codebase_examples>

<anti_patterns>

### Anti-pattern: Synchronous subprocess in statusline render

DON'T:
```js
const status = execSync('devflow-watch status').toString();  // 50-100ms per render
```

DO: file-system reads only. PID file read = single fs.readFileSync (sub-millisecond). Per-project pending dir read = fs.readdirSync (sub-millisecond per project). Sum across watched projects: <5ms even with 10 projects.

### Anti-pattern: Crash statusline on parse errors

DON'T let any watcher-status code throw out of the try/catch. Statusline must remain renderable even when:
- `~/.claude/devflow/bin/lib/watcher-state.cjs` doesn't exist (devflow not synced)
- PID file is malformed JSON
- Project paths in `watching: []` no longer exist on disk
- config.json is malformed
- A pending dir's readdirSync throws

Wrap the ENTIRE block in one outer try/catch + per-project inner try/catch.

### Anti-pattern: Reading config.json from $HOME instead of cwd

The user's project-local `.planning/config.json` is the source of truth. Read from `data.workspace?.current_dir`, NOT from `homeDir`. Different projects can have different daemon settings.

### Anti-pattern: Polluting statusline cwd from test

Tests MUST override HOME via env, NOT mutate process.cwd(). cwd is a global; mutating it leaks across tests.

### Anti-pattern: Caching watcher state across renders

Don't cache. Each render is independent; if the daemon dies between two renders, the second render must reflect that. fs reads are cheap enough; no cache needed.

</anti_patterns>

<error_recovery>

### When `lib/watcher-state.cjs` not found at sync runtime path

User may have devflow plugin not yet synced (first session) OR the path resolution differs across plugin install methods. Catch require error → fall through to no-watcher-status. NO warning printed (statusline silent on errors).

### When PID file points to dead daemon (stale)

`isWatcherLive()` returns false → skip the watcher segment entirely. Stale PID files are handled separately by `devflow-watch start/stop`; statusline doesn't try to clean them up.

### When watching: [] contains paths that don't exist

`fs.existsSync(pendingDir)` returns false → contribute 0 to the sum. Multi-project tolerance: a renamed/deleted project doesn't break the count.

### When config.json missing daemon block

Treat as `daemon.status_line: false` (default). Don't print warning. Statusline is silent.

### When config.json is malformed JSON

Outer try/catch swallows. Statusline silent.

### When data.workspace?.current_dir is undefined

Fall back to `process.cwd()`. statusline already does this (line 17).

### When pendingCount is large (1000+ pending — pathological case)

Render `⏸ 1000+ pending` to keep statusline width bounded. Practical: if you have 1000+ pending, your daemon has been off for a while and the count is informative. Cap optional; v1.2 ships uncapped (just renders the number).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/20-daemon-polish-bundle/20-CONTEXT.md
@.planning/objectives/20-daemon-polish-bundle/20-RESEARCH.md
@.planning/objectives/20-daemon-polish-bundle/20-03-multi-project-TRD.md

@plugins/devflow/hooks/statusline.js
@plugins/devflow/devflow/bin/lib/watcher-state.cjs
@plugins/devflow/devflow/templates/config.json
@docs/handoff-watcher-guide.md
</context>

<research_context>

### From 20-RESEARCH.md §2 Pattern F — Status-line PID-file read

Read PID file via `lib/watcher-state.cjs` (synced runtime location: `~/.claude/devflow/bin/lib/watcher-state.cjs`). Wrap the require + read in try/catch — statusline runs even if devflow isn't installed. Render `▶ watcher` (idle) or `⏸ N pending` (work queued).

### From 20-RESEARCH.md §4 Common Pitfalls — Status-line

- Sub-200ms hook target — statusline already does up to 4 file reads. Adding PID file + per-project readdirSync = N+2 reads (cheap).
- Path resolution: `~/.claude/devflow/bin/lib/watcher-state.cjs` is the synced location.
- Wrap in try/catch — statusline must NEVER crash.

</research_context>

<gotchas>

- **Statusline runs as a subprocess of Claude Code on every render** — sub-200ms target is a hard constraint. PID file read + N readdirSync calls is sub-5ms even for N=10. Safe.

- **Test file doesn't exist today** — `statusline.test.js` is NEW. Tests use subprocess pattern (spawnSync + JSON stdin + assert stdout), NOT module-import (statusline is an end-of-stream emitter that exits on its own; it has no exported functions).

- **ANSI color codes in test assertions** — match against the visible substring (e.g., `⏸ 3 pending`) NOT the full ANSI sequence. Use `.includes()` or strip ANSI before assertion.

- **Synced runtime path** — `~/.claude/devflow/bin/lib/watcher-state.cjs`. Tests override HOME and place a fixture watcher-state.cjs at that location OR use a copy of the real one. Simpler: tests put HOME at the actual project root's plugin dir for path-finding to succeed. Caveat: must work BEFORE plugin sync runs (first-session edge case) — we accept that statusline shows no watcher status until next session post-sync.

- **Reading config.json from cwd, not HOME** — `data.workspace?.current_dir + '/.planning/config.json'`. Project-local config.

- **Color choice** — `\x1b[32m` (green) for `▶ watcher`, `\x1b[33m` (yellow) for `⏸ N pending`. These match the existing statusline color vocabulary (green = healthy, yellow = warning).

- **No watcher segment when no daemon** — render NOTHING (zero bytes added to statusline output). Don't render `(no watcher)` or similar — visual noise.

- **Config flag default OFF** — opt-in feature. Existing users who don't add `daemon.status_line: true` see no change.

</gotchas>

<test_list_first>

Per CLAUDE.md TDD playbook habit 2: explicit checklist BEFORE any test code.

### Group S — Statusline render — watcher OFF paths

- [ ] **S-1** No daemon block in config.json → no watcher segment in stdout
- [ ] **S-2** daemon.status_line: false → no watcher segment
- [ ] **S-3** daemon.status_line: true but no PID file → no watcher segment (daemon not running)
- [ ] **S-4** daemon.status_line: true + stale PID file (process.kill 0 fails) → no watcher segment
- [ ] **S-5** config.json missing → no watcher segment (no error)
- [ ] **S-6** config.json malformed JSON → no watcher segment (no error; silent)

### Group A — Watcher ALIVE paths

- [ ] **A-1** Daemon alive + watching: [/p1] + 0 pending in /p1 → renders `▶ watcher` (green)
- [ ] **A-2** Daemon alive + watching: [/p1] + 3 pending in /p1 → renders `⏸ 3 pending` (yellow)
- [ ] **A-3** Daemon alive + watching: [/p1, /p2] + 2 pending in /p1 + 1 in /p2 → renders `⏸ 3 pending` (sum)
- [ ] **A-4** Daemon alive + watching: [/p1, /p2] + 0 in both → renders `▶ watcher`
- [ ] **A-5** Daemon alive + watching: [] (empty array) → renders `▶ watcher` (alive but watching nothing)
- [ ] **A-6** Daemon alive + watching: [/nonexistent-path] → renders `▶ watcher` (path missing → 0 pending; no crash)
- [ ] **A-7** Daemon alive + 1 pending in /p1 (singular form) → renders `⏸ 1 pending`

### Group F — Failure tolerance

- [ ] **F-1** lib/watcher-state.cjs not present at sync path → no watcher segment, no crash
- [ ] **F-2** Pending dir readdirSync throws (EACCES) for one project → 0 contribution, no crash, others still counted
- [ ] **F-3** PID file malformed JSON → no watcher segment
- [ ] **F-4** Stdin not parsable as JSON → existing silent-fail behavior preserved (entire statusline outputs nothing)

### Group P — Position / format / preserved-paths

- [ ] **P-1** Existing render path WITHOUT task: `model │ dirname │ ▶ watcher │ ctx` (or no watcher block when off)
- [ ] **P-2** Existing render path WITH task: `model │ task │ dirname │ ⏸ N pending │ ctx` when active
- [ ] **P-3** Existing dfUpdate prefix preserved
- [ ] **P-4** Existing context bar preserved (color thresholds + scaled %)
- [ ] **P-5** No watcher segment renders no extra ` │ ` separator (verify exactly one `│` before ctx when watcher off)

### Group D — Documentation

- [ ] **D-1** docs/handoff-watcher-guide.md contains `### Status-line indicator` heading
- [ ] **D-2** Section documents `daemon.status_line: true` opt-in + visual states (▶ vs ⏸)
- [ ] **D-3** Section documents multi-project pending count behavior

</test_list_first>

<feature>
  <name>Statusline watcher segment</name>
  <files>plugins/devflow/hooks/statusline.js, plugins/devflow/hooks/statusline.test.js</files>
  <behavior>
    Extend statusline.js to optionally render a watcher status segment. Reads project-local `.planning/config.json` for `daemon.status_line` flag, requires `lib/watcher-state.cjs` at synced runtime path, queries `isWatcherLive()` + `readPidFile()`, sums per-project pending counts. Renders `▶ watcher` (green idle) or `⏸ N pending` (yellow active) or nothing (off / dead). Never crashes.

    Cases:
    - flag off / missing → no segment
    - flag on + dead daemon → no segment
    - flag on + alive + 0 pending → `▶ watcher`
    - flag on + alive + N>0 pending (sum across projects) → `⏸ N pending`
    - any error in watcher-state require / readPidFile / readdirSync → no segment, no crash
  </behavior>
  <implementation>
    Add ~30 LOC to statusline.js wrapped in try/catch. New variable `watcherStatus`. Position: between dirname and ctx. Render with ` │ ` separator only when non-empty.

    Tests in statusline.test.js use spawnSync + JSON stdin + assert on stdout. Fixture builders (in __fixtures__/daemon-polish-fixtures.cjs) generate input JSON, write fake PID files, mock watcher-state.cjs path resolution.
  </implementation>
</feature>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing tests for statusline watcher segment + extend fixtures</name>
  <files>plugins/devflow/hooks/statusline.test.js, plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs</files>
  <action>
Per CLAUDE.md TDD playbook habits 1-4: tests first, fixtures first.

Extend `__fixtures__/daemon-polish-fixtures.cjs` with statusline-specific helpers:

- `buildStatuslineInput(opts)` returns Claude-style JSON for statusline stdin: `{model, workspace: {current_dir}, session_id, context_window: {remaining_percentage}}`. Defaults sensible.
- `buildStatuslineEnv({tmpHome, projectDir, daemonAlive, watching, pendingByProject, configContent})` sets up:
  - tmpHome with `.devflow/devflow-watch.pid` containing the requested watching: [] / pid (alive vs stale)
  - `.claude/devflow/bin/lib/watcher-state.cjs` symlinked or copied from real source so statusline.js can require it
  - projectDir/.planning/config.json with the requested `daemon` block
  - per-project `.devflow-handoff/pending/<id>.json` files matching the requested counts
  - Returns `{home, projectDir, env, cleanup}` for spawnSync invocation
- `runStatuslineSubprocess({input, env})` returns `{stdout, status}` from spawnSync
- `stripAnsi(s)` returns string with ANSI escape codes removed (for assertion convenience)

CRITICAL: use real running daemon's PID? NO — spoof via `process.kill(pid, 0)` semantics. Tests use the test runner's own PID as a "live" PID (always alive during test). For "dead" PID, use a clearly-dead PID like 999999 (high range; vanishingly unlikely to collide with real process).

Write ALL test cases listed in `<test_list_first>` (Groups S=6, A=7, F=4, P=5, D=3 grep-verified) = 22 tests in `statusline.test.js` (D=3 verified at GREEN time via grep against handoff-watcher-guide.md).

Test setup pattern (from gate-interactive.test.js):

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { mkdtempSync, rmSync } = require('fs');
const os = require('os');
const fixtures = require('../devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs');

test('statusline — daemon.status_line: false → no watcher segment', (t) => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'sl-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const env = fixtures.buildStatuslineEnv({
    tmpHome: tmp,
    projectDir: path.join(tmp, 'proj'),
    daemonAlive: false,
    watching: [],
    pendingByProject: {},
    configContent: { daemon: { status_line: false } },
  });
  const { stdout } = fixtures.runStatuslineSubprocess({
    input: fixtures.buildStatuslineInput({ workspace_dir: env.projectDir }),
    env: env.env,
  });
  assert.notMatch(fixtures.stripAnsi(stdout), /(watcher|pending|▶|⏸)/);
});
```

Run tests; verify 22 new failures + pre-existing 1911 still pass. Failures coherent: existing statusline.js doesn't read config or PID file, so tests for "renders ▶ watcher" all fail because that string isn't in stdout.

# CRITICAL: do NOT depend on the real ~/.claude/devflow/bin/lib/watcher-state.cjs being synced. Tests must work in a clean checkout. Fixture builder copies the source file into the tmp HOME tree.
# GOTCHA: HOME override + cwd override differ — statusline reads config from data.workspace.current_dir (project-local), reads watcher-state from HOME/.claude/devflow. Both must be set in the test env.
# PATTERN: spawnSync subprocess + JSON stdin + stdout assertion. Existing gate-interactive.test.js uses this pattern.

Commit:
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "test(20-04): add failing tests for statusline watcher segment + fixtures" \
  --files plugins/devflow/hooks/statusline.test.js \
  plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
```
  </action>
  <verify>
`npm test 2>&1 | grep -E "fail|pass" | tail -10` shows 22 new failures + 1911 pre-existing pass. Failures are about missing watcher segments in stdout, not about syntax errors.
  </verify>
  <done>
22 failing tests committed. Fixture builders extended for statusline. Pre-existing 1911 unchanged.
  </done>
  <recovery>
If tests pass at RED → an implementation accidentally exists; bisect. If tests fail with file-not-found errors on watcher-state.cjs → fixture is not copying source file correctly; verify the cp/symlink in buildStatuslineEnv. If pre-existing tests fail → HOME override leaked; ensure each test has its own tmp dir + cleanup hook.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Add watcher segment to statusline.js + config + doc</name>
  <files>plugins/devflow/hooks/statusline.js, plugins/devflow/devflow/templates/config.json, docs/handoff-watcher-guide.md</files>
  <action>
Per CLAUDE.md TDD playbook habit 3: minimal code to make all 22 RED tests pass.

1. **statusline.js (additive ~30 LOC):**

Insert the watcher block AFTER the existing `dfUpdate` block (around line 80), BEFORE the output:

```js
    // 20-04: Watcher status segment (opt-in via daemon.status_line)
    let watcherStatus = '';
    try {
      const cwdLocal = data.workspace?.current_dir || process.cwd();
      const cwdConfig = path.join(cwdLocal, '.planning', 'config.json');
      if (fs.existsSync(cwdConfig)) {
        const cfg = JSON.parse(fs.readFileSync(cwdConfig, 'utf8'));
        if (cfg.daemon && cfg.daemon.status_line === true) {
          const stateLibPath = path.join(homeDir, '.claude', 'devflow', 'bin', 'lib', 'watcher-state.cjs');
          if (fs.existsSync(stateLibPath)) {
            const stateLib = require(stateLibPath);
            if (stateLib.isWatcherLive()) {
              const info = stateLib.readPidFile();
              const watching = (info && Array.isArray(info.watching)) ? info.watching : [];
              let pendingCount = 0;
              for (const projRoot of watching) {
                try {
                  const pendDir = path.join(projRoot, '.devflow-handoff', 'pending');
                  if (fs.existsSync(pendDir)) {
                    pendingCount += fs.readdirSync(pendDir).filter(f => f.endsWith('.json')).length;
                  }
                } catch { /* per-project errors swallowed */ }
              }
              watcherStatus = pendingCount > 0
                ? `\x1b[33m⏸ ${pendingCount} pending\x1b[0m`
                : `\x1b[32m▶ watcher\x1b[0m`;
            }
          }
        }
      }
    } catch {
      // statusline must NEVER crash on watcher state errors
    }
```

Update the output composition (replace the existing two-branch output with):

```js
    const dirname = path.basename(dir);
    const wsBlock = watcherStatus ? ` │ ${watcherStatus}` : '';
    if (task) {
      process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${wsBlock}${ctx}`);
    } else {
      process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${wsBlock}${ctx}`);
    }
```

2. **templates/config.json (additive):**

Add to the daemon block (which 20-01 + 20-02 + 20-03 collectively populate):

```json
"status_line": false
```

Final daemon block after all four TRDs:
```json
"daemon": {
  "notifications": false,
  "notify_on_start": true,
  "notify_on_complete": true,
  "auto_launch": false,
  "multi_project": false,
  "status_line": false
}
```

3. **docs/handoff-watcher-guide.md (additive):**

Add `### Status-line indicator` subsection under `## Configuration`:

```markdown
### Status-line indicator

When `daemon.status_line: true` in `.planning/config.json` AND the daemon
is running, the Claude Code statusline shows a watcher segment between the
project name and the context bar:

| Visual | Meaning |
|---|---|
| (nothing) | Daemon not running OR flag off OR config missing |
| `▶ watcher` (green) | Daemon alive, no pending work |
| `⏸ N pending` (yellow) | Daemon alive, N records queued (summed across all watched projects) |

The indicator is opt-in (`status_line: false` is the default). When enabled,
the statusline reads the daemon's PID file (`~/.devflow/devflow-watch.pid`)
and sums pending counts across the multi-project `watching: []` array
(see "Multi-project watching" above).

```json
{
  "daemon": {
    "status_line": true
  }
}
```

The indicator updates on every Claude Code render (typically each user
turn or model thinking transition). Hidden costs: one PID file read +
one `readdirSync` per watched project per render. Sub-millisecond even
for 10+ projects.

Statusline NEVER crashes on watcher state errors — malformed PID files,
missing project paths, or devflow not yet synced all degrade gracefully
to no segment.
```

Run `npm test` — all 22 RED tests should pass. Pre-existing 1911 unchanged.

Commit:
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "feat(20-04): add watcher status segment to statusline (▶ idle / ⏸ N pending)" \
  --files plugins/devflow/hooks/statusline.js \
  plugins/devflow/devflow/templates/config.json \
  docs/handoff-watcher-guide.md
```

# CRITICAL: position the watcher block INSIDE the existing try/catch (line 14-90 wraps the whole stdin handler). The new try/catch is a NESTED safety net for the watcher-specific failure modes; the outer try/catch still catches anything that escapes.
# GOTCHA: ` │ ` separator MUST be at the START of wsBlock (not the end), and only when watcherStatus is non-empty. Otherwise an empty watcher state produces a double ` │  │ ` artifact.
# PATTERN: same color vocabulary as existing statusline (32=green, 33=yellow, 31=red).
  </action>
  <verify>
`npm test` shows all 22 new tests pass + 1911 pre-existing unchanged. `grep -c "Status-line indicator" docs/handoff-watcher-guide.md` returns 1+. Manual smoke: `echo '{"workspace":{"current_dir":"/tmp"}}' | node plugins/devflow/hooks/statusline.js` produces output ending with the existing format (no watcher segment because no config + no daemon).
  </verify>
  <done>
statusline.js extended with watcher segment block (~30 LOC additive). statusline.test.js exists for the first time with 22 passing tests. Config flag added. Doc subsection added. Pre-existing 1911 tests pass. Single GREEN commit.
  </done>
  <recovery>
If statusline crashes on any test → check the outer try/catch wrapping the entire stdin handler is still present. If output format breaks (existing tests fail) → verify wsBlock empty case produces zero added bytes. If watcher segment doesn't render despite alive daemon + flag on → check the synced runtime path; tests need to put a copy of watcher-state.cjs at `~/.claude/devflow/bin/lib/watcher-state.cjs` (relative to the tmp HOME).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>

- [ ] All 22 new tests pass (S=6, A=7, F=4, P=5, D=3 grep-verified)
- [ ] Pre-existing 1911 tests pass unchanged
- [ ] statusline.js modified ADDITIVELY — existing render paths unchanged when watcher off
- [ ] statusline.test.js exists (first-ever test file for statusline) with 22 passing tests
- [ ] Multi-project pending sum works (reads watching: [] from 20-03 PID schema)
- [ ] Watcher segment hidden entirely when off / dead — zero output bytes added
- [ ] templates/config.json has daemon.status_line field
- [ ] handoff-watcher-guide.md has `### Status-line indicator` subsection

</verification>

<success_criteria>

- [ ] **SC-1** Watcher segment renders correctly per visual table (off / ▶ / ⏸)
- [ ] **SC-2** Multi-project aware (pending count sums across watching: [])
- [ ] **SC-3** Statusline never crashes on watcher state errors (try/catch coverage)
- [ ] **SC-4** Sub-200ms hook target preserved (additive cost <5ms typical)
- [ ] **SC-5** First-ever statusline.test.js with comprehensive coverage
- [ ] **SC-6** All 1911 pre-existing tests pass byte-identical

</success_criteria>

<output>
After completion, create `.planning/objectives/20-daemon-polish-bundle/20-04-status-line-SUMMARY.md` per the standard SUMMARY template.
</output>
