---
objective: 20-daemon-polish-bundle
trd: "03"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/watcher-state.cjs
  - plugins/devflow/devflow/bin/lib/watcher-state.test.cjs
  - plugins/devflow/devflow/bin/lib/watcher-daemon.cjs
  - plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs
  - plugins/devflow/devflow/bin/devflow-watch.cjs
  - plugins/devflow/devflow/bin/devflow-watch.test.cjs
  - plugins/devflow/devflow/templates/config.json
  - docs/handoff-watcher-guide.md
autonomous: true
requirements:
  - DAEMON-MULTI-PROJECT
must_haves:
  truths:
    - "watcher-state.cjs exports addWatchedProject(path) and removeWatchedProject(path) — atomic mutations of the live PID file's watching: [] array"
    - "addWatchedProject writes via tmp+rename pattern; safe for concurrent reads by the daemon"
    - "watcher-daemon.cjs runLoop iterates ALL paths in watching: [] each tick (not just the first)"
    - "When watching: [] is empty, runLoop tick is a silent no-op (no error)"
    - "Daemon dispatch remains serial (one command at a time across all projects, not per-project parallel)"
    - "Re-reads watching: [] on every tick — additions/removals visible to the running daemon without restart"
    - "devflow-watch CLI: `start --project p1,p2,p3` accepts comma-separated list (multi-project initial start)"
    - "devflow-watch CLI: `add-project <path>` mutates running daemon's watching: [] (hard-fails if daemon not running)"
    - "devflow-watch CLI: `remove-project <path>` removes path from watching: []; idempotent (no-op if not watched)"
    - "devflow-watch CLI: `status` shows ALL watched projects + per-project pending_count + done_count"
    - "PID file schema is additive — single-project daemons continue to work byte-identical (watching: [path] is unchanged shape)"
    - "Pre-existing 1911 tests pass unchanged"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/watcher-state.cjs"
      provides: "Multi-project mutation helpers + extends existing PID file API"
      exports: ["pidFilePath", "writePidFile", "readPidFile", "removePidFile", "isWatcherLive", "makeDoneRecord", "markConsumed", "listUnconsumed", "addWatchedProject", "removeWatchedProject"]
      contains: "addWatchedProject"
    - path: "plugins/devflow/devflow/bin/lib/watcher-daemon.cjs"
      provides: "runLoop iterates watching: [] each tick"
      contains: "watching"
    - path: "plugins/devflow/devflow/bin/devflow-watch.cjs"
      provides: "add-project / remove-project subcommands + --project comma-list support"
      contains: "add-project"
    - path: "plugins/devflow/devflow/templates/config.json"
      provides: "daemon.multi_project flag (informational; multi-project always works at runtime)"
      contains: "\"multi_project\""
    - path: "docs/handoff-watcher-guide.md"
      provides: "Multi-project subsection added under Configuration + add-project/remove-project documented under Subcommands"
      contains: "Multi-project"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/watcher-state.cjs"
      to: "atomic tmp+rename"
      via: "addWatchedProject / removeWatchedProject mutate PID file via tmp+rename"
      pattern: "writeFileSync.*\\.tmp|renameSync"
    - from: "plugins/devflow/devflow/bin/lib/watcher-daemon.cjs"
      to: "watcher-state.readPidFile"
      via: "tick() re-reads watching: [] every poll cycle"
      pattern: "readPidFile|watching"
    - from: "plugins/devflow/devflow/bin/devflow-watch.cjs"
      to: "lib/watcher-state.cjs"
      via: "cmdAddProject / cmdRemoveProject invoke addWatchedProject / removeWatchedProject"
      pattern: "addWatchedProject|removeWatchedProject"
---

<objective>
Extend the daemon to watch multiple project directories from a single process. PID file's `watching: []` array (already in schema) becomes the authoritative source — daemon re-reads on every tick and iterates pending dirs across all watched projects. New CLI subcommands `add-project` / `remove-project` mutate the live PID file atomically. `start --project p1,p2,p3` accepts comma-separated list for initial multi-project start.

Purpose: Today users with multiple checkouts must run a daemon per worktree (or remember to switch). One daemon, many projects = "set it and forget it" UX.

Output: Additive helpers in `lib/watcher-state.cjs`; modified `runLoop` in `lib/watcher-daemon.cjs`; new CLI subcommands in `bin/devflow-watch.cjs`; updated `cmdStatus` to show multi-project state; doc additions; config flag.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── devflow-watch.cjs                                         ← MODIFY (add-project / remove-project subcommands + --project comma-list)
├── devflow-watch.test.cjs                                    ← MODIFY (additive — multi-project CLI tests)
└── lib/
    ├── watcher-state.cjs                                     ← MODIFY (additive — addWatchedProject + removeWatchedProject)
    ├── watcher-state.test.cjs                                ← MODIFY (additive — mutation tests)
    ├── watcher-daemon.cjs                                    ← MODIFY (runLoop iterates watching: [])
    └── watcher-daemon.test.cjs                               ← MODIFY (additive — multi-project tick tests)

plugins/devflow/devflow/templates/config.json                 ← MODIFY (additive — daemon.multi_project flag)
docs/handoff-watcher-guide.md                                 ← MODIFY (additive — Multi-project subsection + Subcommands extension)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing PID file shape (extend additively)

`plugins/devflow/devflow/bin/lib/watcher-state.cjs:35-47`:

```js
function writePidFile({ pid, version, shell, watching }) {
  const file = pidFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    pid,
    version: version || '0.0.0',
    shell: shell || null,
    watching: Array.isArray(watching) ? watching : [],  // ← already array; we just populate with multiple entries
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}
```

The `watching: []` array EXISTS today; v1.1 + obj 19 only ever wrote `watching: [projectRoot]` (single entry). 20-03 adds multi-entry support — schema unchanged.

### Pattern: Existing runLoop tick (extend to iterate watching[])

`plugins/devflow/devflow/bin/lib/watcher-daemon.cjs:333-376`:

```js
function runLoop(opts) {
  const { projectRoot, session, allowlist, log, pollIntervalMs, timeoutMs } = opts;

  let stopped = false;
  let inFlight = null;

  async function tick() {
    if (stopped) return;
    if (inFlight) return; // serial dispatch — one command at a time
    const pending = readPending(projectRoot);
    if (pending.length === 0) return;
    const next = pending[0];
    inFlight = processOnce(next, {
      session, allowlist, projectRoot, log, timeoutMs,
    }).catch(/* ... */).finally(/* ... */);
  }

  const interval = setInterval(tick, pollIntervalMs);
  // ...
}
```

20-03 changes `tick()`:

```js
async function tick() {
  if (stopped) return;
  if (inFlight) return;
  // 20-03: re-read live watching: [] from PID file every tick
  const pidInfo = state.readPidFile();
  const watching = (pidInfo && Array.isArray(pidInfo.watching) && pidInfo.watching.length > 0)
    ? pidInfo.watching
    : [opts.projectRoot];  // back-compat fallback when no PID info (test path)

  // Iterate all watched projects; pick first pending across them all
  for (const projRoot of watching) {
    const pending = readPending(projRoot);
    if (pending.length === 0) continue;
    const next = pending[0];
    inFlight = processOnce(next, {
      session, allowlist, projectRoot: projRoot, log, timeoutMs,
      // forward 20-01 fields if present
      ...(opts.notifier ? { notifier: opts.notifier, notify_on_start: opts.notify_on_start, notify_on_complete: opts.notify_on_complete } : {}),
    }).catch(/* ... */).finally(/* ... */);
    return;  // serial dispatch — one project's command at a time
  }
}
```

### Pattern: Existing atomic write (mirror for PID mutation)

`plugins/devflow/devflow/bin/lib/watcher-daemon.cjs:62-71` — atomic tmp+rename used for done records.

Apply same pattern to PID mutations:

```js
function addWatchedProject(projectPath) {
  const file = pidFilePath();
  const current = readPidFile();
  if (!current) throw new Error('no PID file — daemon not running');
  const watching = Array.isArray(current.watching) ? [...current.watching] : [];
  const norm = path.resolve(projectPath);
  if (!watching.includes(norm)) watching.push(norm);
  const next = { ...current, watching };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return next;
}
```

### Pattern: Existing cmdStatus (extend to show multi-project)

`plugins/devflow/devflow/bin/devflow-watch.cjs:78-117`:

Today's status report:
```js
project: info && Array.isArray(info.watching) && info.watching.length > 0
  ? info.watching[0]
  : null,
// ...
result.pending_count = fs.existsSync(pendingDir) ? ... : 0;
result.done_count = ...;
```

Extend to:
```js
projects: info ? (Array.isArray(info.watching) ? info.watching : []) : [],
// keep `project` (singular) as deprecated alias for back-compat
project: info && Array.isArray(info.watching) && info.watching.length > 0
  ? info.watching[0]
  : null,
// pending_count / done_count summed across all projects:
result.pending_counts = {}; // per-project map
result.done_counts = {};
for (const proj of result.projects) {
  result.pending_counts[proj] = countJsonFiles(path.join(proj, '.devflow-handoff/pending'));
  result.done_counts[proj] = countJsonFiles(path.join(proj, '.devflow-handoff/done'));
}
result.pending_count = Object.values(result.pending_counts).reduce((a,b) => a+b, 0);
result.done_count = Object.values(result.done_counts).reduce((a,b) => a+b, 0);
```

</codebase_examples>

<anti_patterns>

### Anti-pattern: Worker pool / per-project parallel dispatch

DON'T add concurrency. The daemon's serial-dispatch invariant is load-bearing:
- ShellSession can only dispatch one command at a time (in-flight tracking)
- Token-passing (obj 19 TRD 19-02) assumes single in-flight dispatch
- Notifier dispatch ordering matters

Multi-project = round-robin across watched projects, NOT concurrent. Fairness can be improved later (round-robin with priority) but v1.2 is "first project with pending work wins this tick."

### Anti-pattern: Mutating watching: [] without atomic write

DON'T:
```js
const info = readPidFile();
info.watching.push(newPath);
fs.writeFileSync(pidFilePath(), JSON.stringify(info, null, 2));  // partial write race
```

DO: tmp + rename atomic pattern. Daemon may be reading at any moment.

### Anti-pattern: add-project silently editing dead PID file

DON'T:
```js
function cmdAddProject(flags) {
  state.addWatchedProject(flags._[1]);  // succeeds even if daemon dead
}
```

DO:
```js
function cmdAddProject(flags) {
  if (!state.isWatcherLive()) {
    printErr('devflow-watch: daemon not running. Start it first.');
    return 2;
  }
  // ... mutate
}
```

User feedback is critical here — silent edit of stale PID file produces "daemon never picks up new project" mystery.

### Anti-pattern: remove-project that aborts in-flight dispatch

DON'T abort dispatches mid-flight. If a project is removed while one of its commands is dispatching, the dispatch completes; subsequent ticks skip the removed project. The `inFlight` Promise resolves naturally; `done` record is written; user sees the result on next prompt.

### Anti-pattern: Per-project state divergence

DON'T accumulate per-project allowlists or per-project notifier flags. The daemon has ONE allowlist (combined default + user file) and ONE notifier config. Multi-project = many pending dirs, ONE policy.

</anti_patterns>

<error_recovery>

### When add-project called while daemon dead

Hard-fail with code 2 + clear message + start guidance. Do NOT mutate the stale PID file. User runs `devflow-watch start --project <path>` to fresh-start.

### When remove-project called for a path not in watching: []

Silent success (idempotent). Same pattern as `devflow-watch stop` when daemon already stopped.

### When add-project called with non-existent path

`path.resolve` succeeds; the directory may not exist yet. Daemon's tick will see no `.devflow-handoff/pending` (because dir doesn't exist) → graceful no-op via `if (!fs.existsSync(dir)) return [];` in readPending(). User can `mkdir -p <path>/.devflow-handoff/pending` later.

### When PID file mutation race (very rare — daemon writes own PID file at startup)

Daemon only writes its own PID file at `runForeground` startup (line 259 in devflow-watch.cjs). After that, the daemon does NOT mutate the PID file — it only reads. CLI mutations have no contention.

### When `start --project p1,p2,p3` includes invalid path

Pre-flight validation: `for (const p of projects) { if (!fs.existsSync(path.resolve(p))) printErr; return 1; }`. Reject the entire start (don't partially start with valid subset). User fixes and retries.

### When watching: [] becomes empty after remove-project

Daemon's tick is a silent no-op when watching is empty. User must add a project (or the daemon was started with one). NO auto-shutdown — daemon stays alive waiting for `add-project` or SIGTERM.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/20-daemon-polish-bundle/20-CONTEXT.md
@.planning/objectives/20-daemon-polish-bundle/20-RESEARCH.md

@plugins/devflow/devflow/bin/lib/watcher-state.cjs
@plugins/devflow/devflow/bin/lib/watcher-daemon.cjs
@plugins/devflow/devflow/bin/devflow-watch.cjs
@plugins/devflow/devflow/templates/config.json
@docs/handoff-watcher-guide.md
</context>

<research_context>

### From 20-RESEARCH.md §2 Pattern D — PID file atomic mutation

`tmp + rename` pattern. Single writer (the CLI mutation invocation; daemon doesn't mutate post-startup). Atomic = daemon read sees either pre-mutation or post-mutation file, never torn write.

### From 20-RESEARCH.md §4 Common Pitfalls — Multi-project

- PID file race window microseconds; CLI atomic-write makes torn reads impossible.
- Project removed mid-dispatch: in-flight completes, subsequent ticks skip.
- Project added with daemon dead: hard-fail, don't silently edit stale file.

### From 20-CONTEXT.md §2 Locked Decision 8

One Node process, one `runLoop`, but loop iterates `watching: []` paths in turn. NO worker pool. NO concurrent dispatch (still serial — one command at a time across all projects).

</research_context>

<gotchas>

- **Re-read on every tick** is the simplest design (and cheapest — PID file is small JSON, ~200 bytes; reading once per 500ms tick is sub-millisecond). Daemon doesn't need to "subscribe" to changes; lazy re-read is sufficient.

- **Path normalization matters** — `path.resolve()` for both add and remove so `add-project ./foo` and `remove-project /abs/path/to/foo` work as expected. Tests cover relative→absolute equivalence.

- **Back-compat fallback in tick()** — when `readPidFile()` returns null (test path that constructs runLoop directly without a PID file), fall back to `[opts.projectRoot]`. Existing tests pass byte-identical.

- **Don't change `project` (singular) field in cmdStatus output** — Claude / external tools may parse `status` JSON expecting `project` field. Add new `projects` (plural) field; keep `project` as the first entry of `projects` for back-compat.

- **inFlight tracking unchanged** — module-level `inFlight = null` still serializes dispatches. Round-robin happens at tick boundary, not within a tick.

- **`add-project` validates path exists** — emit warning if `path.resolve(p)` doesn't exist (but don't refuse — user may be about to mkdir). `remove-project` accepts any path silently (idempotent).

- **Status output field names** — locked: `projects: [...]`, `pending_counts: {projRoot: N}`, `done_counts: {projRoot: N}`. Singular `project`, `pending_count`, `done_count` retained as back-compat aliases (project=projects[0]; counts = sum across projects).

- **Existing `--project <single>` usage** — `start --project /p` still works (treated as single-element comma list). Both `start --project /p1,/p2` and `start --project /p1 --project /p2` (last-wins) are supported in tests.

</gotchas>

<test_list_first>

Per CLAUDE.md TDD playbook habit 2: explicit checklist BEFORE any test code.

### Group W — Watcher-state mutation helpers

- [ ] **W-1** addWatchedProject(path) appends path.resolve(path) to existing watching: []
- [ ] **W-2** addWatchedProject is a no-op when path already in watching: [] (no duplicates)
- [ ] **W-3** addWatchedProject throws when no PID file exists (daemon not running)
- [ ] **W-4** addWatchedProject writes via tmp+rename (assert tmp file does not persist)
- [ ] **W-5** removeWatchedProject removes path from watching: []
- [ ] **W-6** removeWatchedProject is idempotent (no-op when path not in watching: [])
- [ ] **W-7** removeWatchedProject preserves other watching: [] entries
- [ ] **W-8** addWatchedProject + removeWatchedProject preserve all other PID file fields (pid, version, shell, started_at)
- [ ] **W-9** Single-project PID file (watching: [path]) is unchanged shape — back-compat verified

### Group D — Daemon runLoop multi-project iteration

- [ ] **D-1** runLoop tick reads watching: [] from PID file each call (re-read confirmed via mock)
- [ ] **D-2** When watching: [path1, path2], tick processes pending in path1 first, then path2 next tick
- [ ] **D-3** When path1 has pending but path2 doesn't, tick still completes (skips empty)
- [ ] **D-4** When watching: [] is empty, tick is silent no-op
- [ ] **D-5** When PID file readable returns null (test path), tick falls back to opts.projectRoot
- [ ] **D-6** Dispatch remains serial — only one inFlight at a time across all projects
- [ ] **D-7** addWatchedProject mid-runLoop visible to next tick (no restart needed)
- [ ] **D-8** removeWatchedProject of project with in-flight dispatch — dispatch completes, next tick skips
- [ ] **D-9** processOnce called with correct projectRoot per pending record (matches the project path the pending file was found in)

### Group C — CLI subcommands

- [ ] **C-1** `devflow-watch start --project /p1,/p2,/p3` writes PID file with watching: [/p1, /p2, /p3]
- [ ] **C-2** `devflow-watch start --project /p` (single) writes watching: [/p] — back-compat
- [ ] **C-3** `devflow-watch add-project /p` mutates running daemon's PID file via addWatchedProject
- [ ] **C-4** `devflow-watch add-project` when daemon dead exits 2 + "daemon not running" message
- [ ] **C-5** `devflow-watch remove-project /p` mutates PID file via removeWatchedProject
- [ ] **C-6** `devflow-watch remove-project /p` when /p not watched exits 0 (idempotent)
- [ ] **C-7** `devflow-watch status` JSON contains `projects: [...]` (plural) AND `project` (back-compat singular)
- [ ] **C-8** `devflow-watch status` JSON contains `pending_counts: {/p1: N, /p2: M}` per-project
- [ ] **C-9** `devflow-watch status` JSON contains `pending_count` (sum) for back-compat
- [ ] **C-10** `devflow-watch start --project p1,p2` with non-existent path warns but doesn't reject (path may be created later)
- [ ] **C-11** Help / usage line lists add-project / remove-project subcommands

### Group EX — watcher-state export surface

- [ ] **EX-1** lib/watcher-state.cjs module.exports adds `addWatchedProject` and `removeWatchedProject` to existing 8-entry surface (10 total). deepStrictEqual

### Group D2 — Documentation

- [ ] **D2-1** docs/handoff-watcher-guide.md `## Subcommands` section lists add-project / remove-project
- [ ] **D2-2** New `### Multi-project watching` subsection under Configuration
- [ ] **D2-3** Subsection documents `start --project p1,p2,p3` syntax + add/remove subcommands

</test_list_first>

<feature>
  <name>watcher-state multi-project mutations</name>
  <files>plugins/devflow/devflow/bin/lib/watcher-state.cjs, plugins/devflow/devflow/bin/lib/watcher-state.test.cjs</files>
  <behavior>
    addWatchedProject(path) and removeWatchedProject(path) mutate the live PID file's watching: [] array via tmp+rename atomic write. Path normalized via path.resolve. Idempotent on add (no duplicates) and remove (no-op if absent).

    Cases:
    - input: watching=[/a], addWatchedProject('/b') → watching=[/a, /b]
    - input: watching=[/a, /b], addWatchedProject('/a') → watching=[/a, /b] (no dup)
    - input: watching=[/a, /b], removeWatchedProject('/a') → watching=[/b]
    - input: watching=[/a], removeWatchedProject('/c') → watching=[/a] (idempotent)
    - input: no PID file, addWatchedProject('/a') → throws Error
    - edge: relative path resolves to absolute via path.resolve before insert/match
  </behavior>
  <implementation>
    ~30 LOC. Both functions read PID file, mutate in-memory watching array, write back via tmp+rename. Throw on missing PID file (caller handles graceful messaging).
  </implementation>
</feature>

<feature>
  <name>runLoop multi-project iteration</name>
  <files>plugins/devflow/devflow/bin/lib/watcher-daemon.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs</files>
  <behavior>
    Each tick re-reads watching: [] from PID file, iterates projects, picks first pending record across them. Serial dispatch invariant preserved (inFlight gating unchanged). Back-compat fallback when readPidFile returns null.

    Cases:
    - input: watching=[/a, /b], pending in /a → tick processes /a's pending; next tick may process /b's
    - input: watching=[/a, /b], pending in /b only → tick processes /b's pending
    - input: watching=[], pending anywhere → tick is no-op
    - input: PID file null (test path) → fallback to opts.projectRoot
    - edge: mid-tick add-project — added project visible to next tick
    - edge: mid-tick remove-project of in-flight project — dispatch completes; next tick skips removed
  </behavior>
  <implementation>
    Modify tick() in runLoop. require('./watcher-state.cjs') at top of module. Re-read PID file each tick (cheap; <1ms). Fall back to [opts.projectRoot] when readPidFile null. Forward optional 20-01 deps (notifier, notify_on_*) if present in opts.
  </implementation>
</feature>

<feature>
  <name>devflow-watch CLI multi-project subcommands</name>
  <files>plugins/devflow/devflow/bin/devflow-watch.cjs, plugins/devflow/devflow/bin/devflow-watch.test.cjs</files>
  <behavior>
    `start --project p1,p2,p3` parses comma-list. `add-project <path>` and `remove-project <path>` subcommands invoke watcher-state helpers. `status` shows per-project counts. `add-project` hard-fails when daemon dead.

    Cases:
    - input: argv=['start', '--project', '/p1,/p2'] → writePidFile with watching=[resolve('/p1'), resolve('/p2')]
    - input: argv=['add-project', '/c'] with daemon alive → addWatchedProject('/c') succeeds
    - input: argv=['add-project', '/c'] with daemon dead → exit 2 + clear message
    - input: argv=['remove-project', '/c'] → removeWatchedProject('/c') always succeeds
    - input: argv=['status'] → JSON with projects: [...] + per-project counts
  </behavior>
  <implementation>
    cmdAddProject(flags) / cmdRemoveProject(flags) in bin/devflow-watch.cjs. Extend cmdStart to accept comma-list (split on ','). Extend cmdStatus to surface multi-project shape. Update Usage line.
  </implementation>
</feature>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing tests for state mutations + multi-project tick + CLI subcommands</name>
  <files>plugins/devflow/devflow/bin/lib/watcher-state.test.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs, plugins/devflow/devflow/bin/devflow-watch.test.cjs</files>
  <action>
Per CLAUDE.md TDD playbook (habits 1-4): test list first, fixture builders first, no implementation.

Extend `__fixtures__/daemon-polish-fixtures.cjs` (created/extended in 20-01 / 20-02; coordinate via wave-1 file ownership):

- `buildMultiProjectFixture(tmpDir)` returns `{home, projects: [/abs/p1, /abs/p2, /abs/p3], pendingFiles: {projRoot: [recordId, ...]}, cleanup}` — creates per-project `.devflow-handoff/pending/` dirs with N synthetic pending records each
- `buildPidFileFixture({pid, watching, ...})` writes a fixture PID file to tmp HOME's `.devflow/devflow-watch.pid`
- `withMockedRunLoop({watching, pendingByProject})` returns a thin runLoop wrapper that injects mocked `state.readPidFile` + readPending so unit tests don't need real daemon

Write ALL test cases listed in `<test_list_first>` (Groups W=9, D=9, C=11, EX=1, D2=3 grep-verified) = 30 tests across 3 test files.

Test file distribution:
- `watcher-state.test.cjs` ADDITIVE — Group W (9 tests) + EX (1 test) = 10 tests
- `watcher-daemon.test.cjs` ADDITIVE — Group D (9 tests) covering multi-project tick behavior
- `devflow-watch.test.cjs` ADDITIVE — Group C (11 tests) covering CLI subcommands

D2 (doc tests) verified via grep at GREEN time.

Run tests; verify 30 new failures + pre-existing 1911 still pass. Failures coherent: "addWatchedProject is not a function" for W tests; "expected projects in status JSON" for C tests; etc.

# CRITICAL: tests must isolate via HOME override + DEVFLOW_HANDOFF_PID_FILE override. Real ~/.devflow/devflow-watch.pid pollution is a debugging nightmare across test runs.
# GOTCHA: pre-existing watcher-state.test.cjs tests use single-project shape. Verify they still pass after adding watching: [path] is unchanged.
# PATTERN: mirror obj 19 fixture pattern — factory builders, not LLM-generated test data.

Commit:
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "test(20-03): add failing tests for multi-project watching (state mutations, runLoop iteration, CLI subcommands)" \
  --files plugins/devflow/devflow/bin/lib/watcher-state.test.cjs \
  plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs \
  plugins/devflow/devflow/bin/devflow-watch.test.cjs \
  plugins/devflow/devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs
```
  </action>
  <verify>
`npm test` shows 30 new failures + 1911 pre-existing pass. Failure messages coherent. `grep -c "addWatchedProject" plugins/devflow/devflow/bin/lib/watcher-state.test.cjs` returns 5+. No accidental implementation snuck in.
  </verify>
  <done>
30 new failing tests committed. Fixture builders extended. Pre-existing 1911 unchanged. Single RED commit.
  </done>
  <recovery>
If tests pollute real PID file → check DEVFLOW_HANDOFF_PID_FILE override scope (must be set before each test, restored after). If a test passes at RED → bisect; an early implementation may have leaked in.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement watcher-state mutations + runLoop iteration + CLI subcommands + config + doc</name>
  <files>plugins/devflow/devflow/bin/lib/watcher-state.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.cjs, plugins/devflow/devflow/bin/devflow-watch.cjs, plugins/devflow/devflow/templates/config.json, docs/handoff-watcher-guide.md</files>
  <action>
Per CLAUDE.md TDD playbook habit 3: minimal code to make all 30 RED tests pass.

Implementation order (outside-in per playbook habit 5):

1. **lib/watcher-state.cjs (additive ~30 LOC):**

```js
function addWatchedProject(projectPath) {
  const file = pidFilePath();
  const current = readPidFile();
  if (!current) {
    const err = new Error('no PID file — daemon not running');
    err.code = 'ENOPIDFILE';
    throw err;
  }
  const watching = Array.isArray(current.watching) ? [...current.watching] : [];
  const norm = path.resolve(projectPath);
  if (!watching.includes(norm)) watching.push(norm);
  const next = { ...current, watching };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return next;
}

function removeWatchedProject(projectPath) {
  const file = pidFilePath();
  const current = readPidFile();
  if (!current) {
    const err = new Error('no PID file — daemon not running');
    err.code = 'ENOPIDFILE';
    throw err;
  }
  const watching = Array.isArray(current.watching) ? [...current.watching] : [];
  const norm = path.resolve(projectPath);
  const idx = watching.indexOf(norm);
  if (idx === -1) return current;  // idempotent — no-op
  watching.splice(idx, 1);
  const next = { ...current, watching };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return next;
}

module.exports = {
  // ... existing exports unchanged ...
  addWatchedProject,
  removeWatchedProject,
};
```

2. **lib/watcher-daemon.cjs (modify tick() in runLoop):**

```js
const state = require('./watcher-state.cjs');  // already imported

function runLoop(opts) {
  const {
    projectRoot, session, allowlist: allow, log = () => {},
    pollIntervalMs = POLL_INTERVAL_MS, timeoutMs,
    notifier, notify_on_start, notify_on_complete,  // 20-01 fields (forward if present)
  } = opts;

  let stopped = false;
  let inFlight = null;

  async function tick() {
    if (stopped) return;
    if (inFlight) return;
    // 20-03: re-read watching: [] from PID file each tick
    const pidInfo = state.readPidFile();
    const watching = (pidInfo && Array.isArray(pidInfo.watching) && pidInfo.watching.length > 0)
      ? pidInfo.watching
      : [projectRoot];  // back-compat: fall back to opts.projectRoot
    for (const projRoot of watching) {
      const pending = readPending(projRoot);
      if (pending.length === 0) continue;
      const next = pending[0];
      const deps = {
        session, allowlist: allow, projectRoot: projRoot, log, timeoutMs,
      };
      if (notifier) {
        deps.notifier = notifier;
        deps.notify_on_start = notify_on_start;
        deps.notify_on_complete = notify_on_complete;
      }
      inFlight = processOnce(next, deps).catch((e) => {
        log('error', `processOnce threw: ${e && e.message ? e.message : String(e)}`);
      }).finally(() => { inFlight = null; });
      return;  // serial: only one project per tick
    }
  }

  const interval = setInterval(tick, pollIntervalMs);
  tick();
  return { /* same stop() as before */ };
}
```

3. **bin/devflow-watch.cjs (additive subcommands + extended cmdStart/cmdStatus):**

Extend `parseFlags` if needed (current implementation supports `--project <val>`; no changes needed). The comma-split happens in cmdStart:

```js
function cmdStart(flags) {
  if (state.isWatcherLive()) { /* existing already-running guard */ }
  if (state.readPidFile() && !state.isWatcherLive()) state.removePidFile();

  // 20-03: parse --project as comma-list (single value still supported)
  const projectArg = flags.project || process.cwd();
  const projects = String(projectArg).split(',').map(p => path.resolve(p.trim())).filter(Boolean);
  for (const p of projects) {
    if (!fs.existsSync(p)) {
      printErr(`devflow-watch: warning: project path not found: ${p} (will be polled when created)`);
    }
  }
  const shell = flags.shell || process.env.SHELL || 'bash';

  if (flags['install-service']) return cmdInstallService(flags);  // from 20-02
  if (flags.foreground) return runForeground({ projects, shell });
  return startDetached({ projects, shell });
}
```

Update `runForeground({ projects, shell })`:

```js
state.writePidFile({
  pid: process.pid,
  version: VERSION,
  shell,
  watching: projects,  // ← multi-project
});
log('info', `started pid=${process.pid} projects=${projects.join(',')} shell=${shell}`);
```

Add cmdAddProject / cmdRemoveProject:

```js
function cmdAddProject(flags) {
  const projectPath = flags._[1];
  if (!projectPath) { printErr('Usage: devflow-watch add-project <path>'); return 1; }
  if (!state.isWatcherLive()) {
    printErr(`devflow-watch: daemon not running. Start it first: devflow-watch start --project ${projectPath}`);
    return 2;
  }
  try {
    const next = state.addWatchedProject(projectPath);
    printOut(`devflow-watch: added ${path.resolve(projectPath)} (now watching ${next.watching.length} project(s))`);
    return 0;
  } catch (e) {
    printErr(`devflow-watch: add-project failed: ${e.message}`);
    return 3;
  }
}

function cmdRemoveProject(flags) {
  const projectPath = flags._[1];
  if (!projectPath) { printErr('Usage: devflow-watch remove-project <path>'); return 1; }
  try {
    const next = state.removeWatchedProject(projectPath);
    printOut(`devflow-watch: removed ${path.resolve(projectPath)} (now watching ${next.watching.length} project(s))`);
    return 0;
  } catch (e) {
    if (e.code === 'ENOPIDFILE') { printOut('devflow-watch: not running (no-op)'); return 0; }
    printErr(`devflow-watch: remove-project failed: ${e.message}`);
    return 3;
  }
}
```

Extend cmdStatus output:

```js
function cmdStatus() {
  const info = state.readPidFile();
  const live = state.isWatcherLive();
  const watching = info && Array.isArray(info.watching) ? info.watching : [];
  const result = {
    running: live,
    pid: info && live ? info.pid : null,
    version: info ? info.version : null,
    started_at: info ? info.started_at : null,
    uptime_ms: info && live && info.started_at ? Date.now() - new Date(info.started_at).getTime() : null,
    projects: watching,                             // ← new (plural)
    project: watching[0] || null,                   // ← back-compat (singular)
    shell: info ? info.shell : null,
    pending_counts: {},                             // ← new (per-project)
    done_counts: {},                                // ← new
  };
  for (const p of watching) {
    try {
      const pendDir = path.join(p, '.devflow-handoff', 'pending');
      const doneDir = path.join(p, '.devflow-handoff', 'done');
      result.pending_counts[p] = fs.existsSync(pendDir) ? fs.readdirSync(pendDir).filter(f => f.endsWith('.json')).length : 0;
      result.done_counts[p] = fs.existsSync(doneDir) ? fs.readdirSync(doneDir).filter(f => f.endsWith('.json')).length : 0;
    } catch {
      result.pending_counts[p] = 0;
      result.done_counts[p] = 0;
    }
  }
  // Back-compat scalars
  result.pending_count = Object.values(result.pending_counts).reduce((a, b) => a + b, 0);
  result.done_count = Object.values(result.done_counts).reduce((a, b) => a + b, 0);

  const { allowlist } = allowlistLib.loadAllowlist();
  result.allowlist_size = allowlist.length;
  if (info && !live) result.stale_pid_file = true;
  printOut(JSON.stringify(result, null, 2));
  return 0;
}
```

Extend main() dispatch:
```js
if (sub === 'add-project') return cmdAddProject(flags);
if (sub === 'remove-project') return cmdRemoveProject(flags);
```

Update Usage line:
```js
printErr('Usage: devflow-watch <start|stop|status|logs|add-project|remove-project|install-service|uninstall-service|version> [flags]');
```

4. **templates/config.json (additive):**

Add to the daemon block (which 20-01 + 20-02 already populate):
```json
"multi_project": false
```

This flag is informational — multi-project always works at runtime. The flag may be used by future skills to nudge users toward `add-project` instead of running multiple daemons.

5. **docs/handoff-watcher-guide.md (additive):**

Extend the existing `## Subcommands` section (around line 50) — add to the existing block:

```
devflow-watch add-project <path>
  Add <path> to the running daemon's watching list. Mutates the live PID
  file atomically. Hard-fails if the daemon is not running.

devflow-watch remove-project <path>
  Remove <path> from the watching list. Idempotent (no-op if not watched).
  In-flight dispatches for the removed project complete; subsequent ticks
  skip it.
```

Add `### Multi-project watching` subsection under `## Configuration`, near (but logically separate from) Auto-launch + OS notifications:

```markdown
### Multi-project watching

A single daemon can watch multiple project checkout dirs concurrently. The
PID file's `watching: []` array holds all watched paths.

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
```

Run `npm test` — all 30 RED tests should pass. Pre-existing 1911 unaffected.

Commit (single GREEN commit):
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "feat(20-03): add multi-project watching (PID mutation + runLoop iteration + add/remove CLI subcommands)" \
  --files plugins/devflow/devflow/bin/lib/watcher-state.cjs \
  plugins/devflow/devflow/bin/lib/watcher-daemon.cjs \
  plugins/devflow/devflow/bin/devflow-watch.cjs \
  plugins/devflow/devflow/templates/config.json \
  docs/handoff-watcher-guide.md
```

# CRITICAL: existing tests using runLoop with single project (test path) must pass byte-identical. The fallback `[projectRoot]` when readPidFile returns null preserves this.
# GOTCHA: cmdStatus's `project` (singular) field MUST be preserved as `watching[0] || null` — external scripts may parse status JSON expecting that field.
# PATTERN: mutations atomic via tmp+rename; daemon reads on every tick; no IPC needed.
  </action>
  <verify>
`npm test` shows 1976 tests pass (1911 + 30 + 35 from 20-02), 2 pre-existing failures unchanged. `node plugins/devflow/devflow/bin/devflow-watch.cjs status` (with mocked PID file) shows `projects: [...]` JSON field. `grep -c "Multi-project watching" docs/handoff-watcher-guide.md` returns 1+. `grep -c "add-project" docs/handoff-watcher-guide.md` returns 2+ (subcommand listing + section heading).
  </verify>
  <done>
addWatchedProject + removeWatchedProject in lib/watcher-state.cjs. runLoop iterates watching: [] each tick. CLI add-project / remove-project subcommands + comma-list parsing in `start --project`. cmdStatus shows multi-project shape. Config + docs updated. 30 RED tests now GREEN. Pre-existing 1911 tests pass byte-identical. Single GREEN commit.
  </done>
  <recovery>
If existing watcher-daemon.test.cjs tests fail → check the back-compat fallback in tick(): `if (readPidFile() === null) use [opts.projectRoot]`. If devflow-watch.test.cjs subprocess tests fail → make sure DEVFLOW_HANDOFF_PID_FILE env is propagated to the spawned subprocess. If status JSON shape differs → preserve `project` (singular) and `pending_count` / `done_count` (scalar sums) for back-compat.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>

- [ ] All 30 new tests pass (W=9, D=9, C=11, EX=1, D2=3 grep-verified)
- [ ] Pre-existing 1911 tests pass unchanged
- [ ] watcher-state.cjs exports include addWatchedProject + removeWatchedProject (10-entry surface)
- [ ] runLoop tick iterates watching: [] each call; serial dispatch invariant preserved
- [ ] CLI: `start --project p1,p2,p3` works; `add-project` + `remove-project` work; `status` shows multi-project JSON
- [ ] PID file schema additive — single-project daemons still work
- [ ] templates/config.json has daemon.multi_project flag
- [ ] handoff-watcher-guide.md has Multi-project subsection + add-project/remove-project documented under Subcommands

</verification>

<success_criteria>

- [ ] **SC-1** Single daemon watches multiple projects via watching: [] array
- [ ] **SC-2** add-project / remove-project mutations atomic (tmp+rename); daemon sees changes on next tick
- [ ] **SC-3** Dispatch remains serial (one command at a time across all projects)
- [ ] **SC-4** PID file schema additive — back-compat preserved for single-project daemons
- [ ] **SC-5** add-project hard-fails when daemon not running (clear message)
- [ ] **SC-6** remove-project idempotent (no-op when path not watched)
- [ ] **SC-7** status JSON shows per-project counts + back-compat scalars
- [ ] **SC-8** All 1911 pre-existing tests pass byte-identical

</success_criteria>

<output>
After completion, create `.planning/objectives/20-daemon-polish-bundle/20-03-multi-project-SUMMARY.md` per the standard SUMMARY template. Note: 20-04 (status-line) depends on this TRD's PID schema (multi-entry watching: []) shipping.
</output>
