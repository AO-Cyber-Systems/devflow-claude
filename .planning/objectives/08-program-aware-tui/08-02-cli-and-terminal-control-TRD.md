---
objective: 08-program-aware-tui
trd: "08-02"
type: standard
confidence: medium
wave: 2
depends_on: ["08-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/tui-cli.cjs
  - plugins/devflow/devflow/bin/lib/tui.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - SC-4
  - SC-5

must_haves:
  truths:
    - "`df-tools tui` opens an interactive raw-mode session with alternate screen + hidden cursor"
    - "`r` keypress re-fetches data and re-renders without leaving the alternate screen"
    - "`q` keypress exits cleanly: cursor restored, alternate screen released, raw mode released, exit code 0"
    - "SIGINT (Ctrl-C) exits cleanly with the same teardown + exit code 130"
    - "EOF on stdin (input pipe closed) exits cleanly with exit code 0"
    - "When stdout is non-TTY, `df-tools tui` auto-switches to --once --raw mode (no alt-screen, no raw mode)"
    - "`df-tools tui --once` runs the renderer once + exits without entering raw mode (test surface)"
    - "`df-tools tui --raw` writes the rendered ANSI to stdout WITHOUT entering alt-screen (pipe-friendly)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/tui-cli.cjs"
      provides: "CLI router + raw-mode session + signal handlers + cleanup"
      exports: ["cmdTuiRoute", "runTui", "_parseFlags"]
      min_lines: 120
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'tui': route to cmdTuiRoute"
      contains: "case 'tui'"
  key_links:
    - from: "df-tools.cjs main()"
      to: "lib/tui-cli.cjs cmdTuiRoute"
      via: "case 'tui': cmdTuiRoute(cwd, args.slice(1), raw);"
      pattern: "case 'tui'"
    - from: "lib/tui-cli.cjs runTui"
      to: "lib/tui.cjs render"
      via: "require + render() invocation"
      pattern: "tui\\.render\\("
    - from: "lib/tui-cli.cjs cleanup"
      to: "process.on('exit'|SIGINT|SIGTERM')"
      via: "signal handlers + idempotent cleanup function"
      pattern: "process\\.on\\(['\"](exit|SIGINT|SIGTERM)"
---

<objective>
Wire the pure renderer (TRD 08-01) into an interactive terminal session: alternate screen, hidden cursor, raw-mode stdin, key handling for `r`/`q`/Ctrl-C, idempotent cleanup, signal handlers, and a `--once --raw` test surface.

Purpose: SC-4 + SC-5 — make the TUI runnable. This TRD is `type: standard` (not tdd) because the work is terminal-control side effects: alt-screen toggles, raw-mode toggles, signal trapping. Verification is "run the binary and it works"; tests are limited to flag parsing + composition contract (which are unit-testable).

Output:
- `lib/tui-cli.cjs` — CLI router + interactive session loop + cleanup
- `df-tools.cjs` — `case 'tui':` arm
- `lib/tui.test.cjs` — 4-6 new flag-parsing + composition tests (added to existing test file)
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                         ← MODIFY (add `case 'tui':`)
└── lib/
    ├── tui.cjs                          ← (TRD 08-01; no modifications here)
    ├── tui-cli.cjs                      ← CREATE (CLI + terminal control)
    └── tui.test.cjs                     ← MODIFY (add Group H: CLI flag parsing)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: CLI router + flag parser (lib/check-todos-cli.cjs)

```js
'use strict';
const ct = require('./check-todos.cjs');
const { output, error } = require('./helpers.cjs');

function _parseFlags(args) {
  const flags = {};
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--all' || a === '--refresh' || a === '--raw') {
      flags[a.slice(2)] = true;
      i++;
    } else if (a === '--lane') {
      flags['lane'] = args[i + 1] || null;
      i += 2;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true; i++;        // forward-compat: unknown flag → boolean
    } else {
      i++;                                   // positional silently ignored
    }
  }
  return flags;
}

function cmdCheckTodosRoute(cwd, args, raw) {
  const flags = _parseFlags(args);
  // ... handler body ...
}

module.exports = { cmdCheckTodosRoute, _parseFlags };
```

### Pattern: case arm in df-tools.cjs

```js
case 'check-todos': {
  cmdCheckTodosRoute(cwd, args.slice(1), raw);
  break;
}
```

The `tui` arm is identical:

```js
case 'tui': {
  cmdTuiRoute(cwd, args.slice(1), raw);
  break;
}
```

The require for `tui-cli.cjs` goes near the top of df-tools.cjs alongside the other CLI requires (search for `require('./lib/check-todos-cli`):

```js
const { cmdTuiRoute } = require('./lib/tui-cli.cjs');
```

### Pattern: composition (data load → render) — see CONTEXT.md §8

```js
const aw = require('./awareness.cjs');
const initiatives = require('./initiatives.cjs');
const tui = require('./tui.cjs');

function _loadData(cwd) {
  const cache = aw.readCache(cwd);
  const peer = (cache && cache.peer) ? cache.peer : aw.scanPeer({ cwd, no_fetch: true });
  const org = (cache && cache.org) ? cache.org : null;
  const orgChain = org ? aw.aggregateOrgByProductQuarter(org.items || []) : null;
  const inits = initiatives.loadInitiatives({});
  return { awareness: peer, initiatives: inits, orgChain, todos: null };
}
```

`_loadData` is the testable seam — pass injected awareness/initiatives modules in for tests.

### Pattern: helpers output() / error() (lib/helpers.cjs)

```js
const { output, error } = require('./helpers.cjs');
output(rawObj, true, customString);   // raw=true writes customString to stdout; raw=false JSON-pretty-prints rawObj
error('something broke');             // writes to stderr + process.exit(1)
```

For `--raw` mode: `output(rendered, true, rendered)` writes the ANSI string verbatim. (For interactive mode, we bypass `output()` and write to stdout directly inside the render loop.)

</codebase_examples>

<anti_patterns>

### Anti-pattern 1: Forgetting to restore terminal state on uncaught exception

**Bad:**
```js
function runTui() {
  enterAltScreen();
  hideCursor();
  setRawMode(true);
  // ... main loop with potential exception ...
}
```

If anything throws inside the main loop, the user is stranded in alternate screen with hidden cursor and raw mode on. They have to type `reset` blind.

**Good:** register cleanup on `process.on('exit')` so it runs no matter how the process ends.

```js
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
process.on('uncaughtException', (err) => { cleanup(); console.error(err); process.exit(1); });
```

### Anti-pattern 2: Non-idempotent cleanup

**Bad:**
```js
function cleanup() {
  process.stdin.setRawMode(false);                  // throws if stdin is paused
  process.stdout.write('\x1b[?25h');
  process.stdout.write('\x1b[?1049l');
}
```

Multiple signals can fire (SIGINT during exit handler). Second call to `setRawMode(false)` on a paused stream throws inside the cleanup, leaving alt-screen on.

**Good:**
```js
let _cleaned = false;
function cleanup() {
  if (_cleaned) return;
  _cleaned = true;
  try {
    if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false);
  } catch (_) {}
  try { process.stdin.pause(); } catch (_) {}
  process.stdout.write('\x1b[?25h\x1b[?1049l');
}
```

### Anti-pattern 3: Hanging on non-TTY stdout

**Bad:**
```js
function runTui() {
  // unconditionally enter raw mode
  process.stdin.setRawMode(true);
  // ...
}
```

When stdout is piped (`df-tools tui | head`), there's no useful interactive session. The user wants the rendered output as a stream. Without a non-TTY guard, the process either hangs (waiting for keypress) or throws (raw mode unsupported on non-TTY stdin).

**Good:**
```js
function cmdTuiRoute(cwd, args, raw) {
  const flags = _parseFlags(args);
  const isOneShot = flags.once || raw || flags.raw || !process.stdout.isTTY;
  if (isOneShot) return _runOneShot(cwd, flags);
  return _runInteractive(cwd, flags);
}
```

### Anti-pattern 4: Reading process.stdout.columns inside the render call

The renderer is pure (TRD 08-01 contract). The CLI reads `process.stdout.columns` ONCE and passes via `opts`. On `r` keypress, re-read columns/rows in case the terminal was resized between renders.

</anti_patterns>

<error_recovery>

### Cleanup runs but terminal still broken

Symptom: user reports cursor missing or screen weird after `df-tools tui` exits.

Recovery (user-facing): document `reset` or `tput reset` in the `df-tools tui --help` output. The tool can't help itself if it died via `kill -9` (signal 9 isn't trappable).

Recovery (developer-facing): add a `df-tools tui --reset-only` flag that emits `\x1b[?25h\x1b[?1049l\x1b[0m` then exits. Useful for scripted recovery.

### setRawMode throws on non-TTY

Symptom: `Error: setRawMode EIO` when running `df-tools tui` under nohup, in CI, or piped.

Recovery: the non-TTY guard short-circuits to `--once --raw` mode. If the guard is bypassed (user explicitly passed `--interactive`), throw a clear error: `error('--interactive requires a TTY; got non-TTY stdin/stdout')`.

### Re-render flicker on `r` keypress

Symptom: the screen flashes blank between old and new render.

Recovery: write `\x1b[H` (cursor home) BEFORE writing the new render, NOT `\x1b[2J\x1b[H`. The new render overwrites the old; trailing content from longer old render is cleared by writing spaces in the new render's panel boundaries. If that's too complex, accept the flicker for v1.1; v1.2 can use a double-buffer.

### `r` keypress fires multiple times rapidly

Symptom: holding `r` queues many re-renders; UI lags.

Recovery: debounce — track `_rendering = true` while a render is in progress; ignore additional `r` keystrokes until done. Since render is synchronous and fast (< 50ms expected), this matters less, but defensive coding is cheap.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/08-program-aware-tui/08-CONTEXT.md
@plugins/devflow/devflow/bin/lib/check-todos-cli.cjs
@plugins/devflow/devflow/bin/lib/awareness-cli.cjs
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/initiatives.cjs
</context>

<gotchas>

- **Idempotent cleanup is non-negotiable.** SIGINT during the exit handler is common; multiple cleanup invocations must not throw or double-toggle.
- **Non-TTY auto-fallback.** Detect `!process.stdout.isTTY || !process.stdin.isTTY` and switch to `--once --raw` automatically. Tests rely on this (test runner has no TTY).
- **Don't `console.log` from the interactive session.** All renderer output goes through `process.stdout.write(rendered)` to avoid the implicit newline `console.log` adds (would push the screen up by 1 row each render).
- **`process.exit(0)` after cleanup, not before.** `process.on('exit', cleanup)` fires on `process.exit()`, but cleanup may write to stdout — if stdout is closed by then, the writes silently fail. Order: trigger cleanup explicitly via `cleanup()`, then `process.exit(code)`.
- **Stdin must be `pause()`d before exit.** Otherwise the Node event loop stays alive waiting for input and the process hangs.
- **Don't import readline/keypress libraries.** Locked decision #1: hand-rolled. Listen on `process.stdin` 'data' event; read first byte; switch on byte value. Single-byte ASCII for `r`/`q`/Ctrl-C is sufficient for v1.1.
- **`SIGWINCH` handling is OPTIONAL.** Terminal resize during a session: nice-to-have for v1.1, but `r` keypress already triggers re-render. Document that resize requires `r`. v1.2 can wire SIGWINCH to auto-re-render.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Create lib/tui-cli.cjs with flag parser, _loadData, and runTui interactive loop</name>
  <files>plugins/devflow/devflow/bin/lib/tui-cli.cjs</files>
  <action>
Create `plugins/devflow/devflow/bin/lib/tui-cli.cjs` implementing the full interactive session + one-shot mode + flag parser.

Approach:

```js
'use strict';

/**
 * CLI for `df-tools tui` — program-aware TUI viewer.
 *
 * Modes:
 *   df-tools tui                — interactive (alt-screen, raw mode, r/q keys)
 *   df-tools tui --once         — render once + exit (no alt-screen, no raw mode)
 *   df-tools tui --raw          — render once + write ANSI to stdout (pipe-friendly; implies --once)
 *   df-tools tui --once --raw   — same as --raw (combo for explicit clarity)
 *
 * Auto-fallback: when stdout/stdin is non-TTY, --once --raw mode is forced (warning to stderr).
 *
 * Locked-decision compliance:
 *   #1 hand-rolled ANSI: no terminal libraries (no blessed, no ink, no node-pty)
 *   #4 manual refresh:   `r` re-fetches; no auto-poll
 *   #5 cursor restore:   process.on('exit') + SIGINT/SIGTERM handlers; idempotent cleanup
 */

const { error } = require('./helpers.cjs');
const tui = require('./tui.cjs');
const aw = require('./awareness.cjs');
const initiatives = require('./initiatives.cjs');
const fs = require('fs');
const path = require('path');

// ─── Flag parser (pure, unit-testable) ───────────────────────────────────────

function _parseFlags(args) {
  const flags = { once: false, raw: false, no_color: false, reset_only: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--once')        flags.once = true;
    else if (a === '--raw')    { flags.raw = true; flags.once = true; }   // --raw implies --once
    else if (a === '--no-color') flags.no_color = true;
    else if (a === '--reset-only') flags.reset_only = true;
    else if (a.startsWith('--')) {
      // forward-compat: unknown flag becomes boolean true; not an error
      flags[a.slice(2)] = true;
    }
    // positional args ignored
  }
  return flags;
}

// ─── Data loader (testable seam) ─────────────────────────────────────────────

function _loadData(cwd) {
  let awareness = null, orgChain = null, inits = [];
  let warnings = [];

  // Peer awareness: prefer cache; fall back to fast local scan (no_fetch)
  try {
    const cache = aw.readCache(cwd);
    if (cache && cache.peer) {
      awareness = cache.peer;
    } else {
      awareness = aw.scanPeer({ cwd, no_fetch: true });
    }
  } catch (e) {
    warnings.push('peer load: ' + (e.message || String(e)));
    awareness = { branches: [], warnings: [], current_branch: null, fetched_at: new Date().toISOString() };
  }

  // Org chain: cache only (live scan requires gh auth; not invoked from TUI)
  try {
    const cache = aw.readCache(cwd);
    if (cache && cache.org) {
      orgChain = aw.aggregateOrgByProductQuarter(cache.org.items || []);
    }
  } catch (e) {
    warnings.push('org load: ' + (e.message || String(e)));
  }

  // Initiatives: global home; never throws
  try {
    inits = initiatives.loadInitiatives({});
  } catch (e) {
    warnings.push('initiatives load: ' + (e.message || String(e)));
    inits = [];
  }

  return { awareness, initiatives: inits, orgChain, todos: null, warnings };
}

// ─── Current repo (read PROJECT.md frontmatter) ──────────────────────────────

function _readCurrentRepo(cwd) {
  try {
    const projectPath = path.join(cwd, '.planning/PROJECT.md');
    const content = fs.readFileSync(projectPath, 'utf8');
    const m = content.match(/^github_repo:\s*([^\s\n]+)/m);
    return m ? m[1] : '';
  } catch (_) {
    return '';
  }
}

// ─── One-shot mode (no alt-screen, no raw mode) ──────────────────────────────

function _runOneShot(cwd, flags) {
  const data = _loadData(cwd);
  const opts = {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
    no_color: !!flags.no_color || !!process.env.NO_COLOR,
    current_repo: _readCurrentRepo(cwd),
  };
  const rendered = tui.render({ ...data, opts });
  process.stdout.write(rendered);
  if (!rendered.endsWith('\n')) process.stdout.write('\n');
  process.exit(0);
}

// ─── Reset-only (recovery hatch) ─────────────────────────────────────────────

function _runResetOnly() {
  process.stdout.write('\x1b[?25h\x1b[?1049l\x1b[0m');
  process.exit(0);
}

// ─── Interactive mode (alt-screen + raw mode + r/q keys) ─────────────────────

let _cleaned = false;

function _cleanup() {
  if (_cleaned) return;
  _cleaned = true;
  try {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
  } catch (_) {}
  try { process.stdin.pause(); } catch (_) {}
  // \x1b[?25h = show cursor; \x1b[?1049l = leave alt-screen; \x1b[0m = reset SGR
  process.stdout.write('\x1b[?25h\x1b[?1049l\x1b[0m');
}

function _runInteractive(cwd, flags) {
  // Enter alt-screen + hide cursor
  process.stdout.write('\x1b[?1049h\x1b[?25l');

  // Register cleanup once
  process.on('exit', _cleanup);
  process.on('SIGINT', () => { _cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { _cleanup(); process.exit(143); });
  process.on('uncaughtException', (err) => {
    _cleanup();
    process.stderr.write('TUI error: ' + (err && err.message || String(err)) + '\n');
    process.exit(1);
  });

  // Raw mode + resume stdin
  try { process.stdin.setRawMode(true); } catch (e) {
    _cleanup();
    error('TUI: failed to enter raw mode: ' + (e.message || String(e)));
    return;
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  // Render closure (re-callable on `r`)
  let rendering = false;
  function _renderOnce() {
    if (rendering) return;
    rendering = true;
    try {
      const data = _loadData(cwd);
      const opts = {
        rows: process.stdout.rows || 24,
        cols: process.stdout.columns || 80,
        no_color: !!flags.no_color || !!process.env.NO_COLOR,
        current_repo: _readCurrentRepo(cwd),
      };
      const rendered = tui.render({ ...data, opts });
      process.stdout.write('\x1b[H\x1b[2J');     // home + clear screen
      process.stdout.write(rendered);
    } finally {
      rendering = false;
    }
  }

  // Initial render
  _renderOnce();

  // Key dispatch (single-byte ASCII)
  process.stdin.on('data', (chunk) => {
    const s = String(chunk);
    for (const ch of s) {
      if (ch === 'q' || ch === 'Q') { _cleanup(); process.exit(0); }
      else if (ch === 'r' || ch === 'R') { _renderOnce(); }
      else if (ch === '\x03') { _cleanup(); process.exit(130); }   // Ctrl-C
      // Other keys: ignored (locked decision #6: r/q only)
    }
  });

  process.stdin.on('end', () => { _cleanup(); process.exit(0); });
}

// ─── Public router ───────────────────────────────────────────────────────────

function cmdTuiRoute(cwd, args, raw) {
  const flags = _parseFlags(args);

  if (flags.reset_only) return _runResetOnly();

  // Auto-fallback: non-TTY → one-shot
  const nonTty = !process.stdout.isTTY || !process.stdin.isTTY;
  if (nonTty && !flags.once) {
    process.stderr.write('df-tools tui: non-TTY environment detected; falling back to --once --raw\n');
    flags.once = true; flags.raw = true;
  }

  // --raw flag from main() arg-strip OR --raw from local parse
  if (raw) flags.raw = flags.once = true;

  if (flags.once || flags.raw) return _runOneShot(cwd, flags);
  return _runInteractive(cwd, flags);
}

module.exports = {
  cmdTuiRoute,
  _parseFlags,
  _loadData,
  _readCurrentRepo,
  // Cleanup hooks exposed for tests:
  _cleanup,
};

// Note: runTui is internal (= _runInteractive); the must_haves spec lists
// `runTui` as exported but tests interact with cmdTuiRoute. Provide alias for
// must_haves compliance:
module.exports.runTui = _runInteractive;
```

# CRITICAL: cleanup is idempotent (`_cleaned` guard). DO NOT remove this guard — multiple signals during exit are real.
# CRITICAL: setRawMode is wrapped in try/catch (it throws on non-TTY).
# CRITICAL: Initial alt-screen entry happens BEFORE process.on('exit', cleanup) registration; if registration throws, the user is stuck in alt-screen. Order is: write alt-screen escapes → register handlers → setRawMode (which is also wrapped). The cleanup runs on `exit` regardless of how we got there.
# GOTCHA: `process.stdin.setEncoding('utf8')` so the 'data' chunks are strings not Buffers; key matching is then `ch === 'q'` not `chunk[0] === 0x71`. Multi-byte input (paste, arrow keys) gets iterated char-by-char; non-r/q chars are silently ignored.
# GOTCHA: `\x1b[H\x1b[2J` clears the alt-screen between renders. Order matters: home cursor first, then clear, so the cursor doesn't briefly land at row 24 before the clear scrolls.
# PATTERN: Mirror obj 5's CLI module pattern (initiatives-cli.cjs). Public + private helpers + module.exports at bottom.
  </action>
  <verify>
1. Module loads cleanly:
   `node -e "const c = require('./plugins/devflow/devflow/bin/lib/tui-cli.cjs'); console.log(Object.keys(c).sort());"`

   Expected: `[ '_cleanup', '_loadData', '_parseFlags', '_readCurrentRepo', 'cmdTuiRoute', 'runTui' ]` (or similar — the locked surface for this TRD includes runTui alias).

2. _parseFlags happy path:
   `node -e "const c = require('./plugins/devflow/devflow/bin/lib/tui-cli.cjs'); console.log(c._parseFlags(['--once', '--raw']));"`

   Expected: `{ once: true, raw: true, no_color: false, reset_only: false }`.

3. _parseFlags --raw implies --once:
   `node -e "const c = require('./plugins/devflow/devflow/bin/lib/tui-cli.cjs'); console.log(c._parseFlags(['--raw']));"`

   Expected: `once: true, raw: true`.

4. _loadData runs without throwing in this repo:
   `node -e "const c = require('./plugins/devflow/devflow/bin/lib/tui-cli.cjs'); const d = c._loadData(process.cwd()); console.log('keys:', Object.keys(d).sort()); console.log('warnings:', d.warnings.length);"`

   Expected: `keys: [ 'awareness', 'initiatives', 'orgChain', 'todos', 'warnings' ]`. Warnings count varies (cache may be absent → 0 warnings since fallback succeeded silently; but never throws).
  </verify>
  <done>
- `lib/tui-cli.cjs` exists with the documented surface (cmdTuiRoute, runTui, _parseFlags, _loadData, _readCurrentRepo, _cleanup).
- `_parseFlags` correctly handles --once, --raw, --no-color, --reset-only, and unknown flags.
- `_loadData` returns the locked 5-key shape and never throws.
- Module loads cleanly via `require()`.
- No regressions: `npm test` still passes (this task adds no tests).
  </done>
  <recovery>
If `_loadData` throws on require: check that `awareness.cjs`, `initiatives.cjs`, `tui.cjs` all export the expected names. If `initiatives.loadInitiatives` is missing, an obj 5 regression has occurred — investigate before proceeding.

If `_parseFlags` produces unexpected output: the parser logic is straightforward; trace through with the args array and confirm each branch.

If `process.stdout.rows` is undefined in the verify command (no TTY): that's expected and benign; the OneShot path uses `|| 24` fallback.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Wire df-tools.cjs case 'tui' arm + add Group H tests</name>
  <files>plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/tui.test.cjs</files>
  <action>
Two changes:

**(a) df-tools.cjs:** Add the `case 'tui':` arm in main() so `df-tools tui` routes to the new CLI module.

Approach:

1. Find the line near the top of df-tools.cjs that imports the other CLI modules. Add:
   ```js
   const { cmdTuiRoute } = require('./lib/tui-cli.cjs');
   ```

2. In the main() switch statement, add a new case after `case 'check-todos':` (alphabetical-ish ordering):
   ```js
   case 'tui': {
     cmdTuiRoute(cwd, args.slice(1), raw);
     break;
   }
   ```

3. If df-tools.cjs has a built-in `--help` text or a help command listing supported subcommands, add `tui` to it. (If no such help exists, skip — no scope creep.)

**(b) tui.test.cjs:** Add Group H — CLI flag parsing + composition contract tests.

Approach:

```js
const tuiCli = require('./tui-cli.cjs');

describe('Group H: CLI flag parsing', () => {
  test('H1: empty args produces default flags', () => {
    const f = tuiCli._parseFlags([]);
    assert.equal(f.once, false);
    assert.equal(f.raw, false);
  });

  test('H2: --once sets once', () => {
    const f = tuiCli._parseFlags(['--once']);
    assert.equal(f.once, true);
    assert.equal(f.raw, false);
  });

  test('H3: --raw implies --once', () => {
    const f = tuiCli._parseFlags(['--raw']);
    assert.equal(f.once, true);
    assert.equal(f.raw, true);
  });

  test('H4: --no-color sets no_color', () => {
    const f = tuiCli._parseFlags(['--no-color']);
    assert.equal(f.no_color, true);
  });

  test('H5: --reset-only sets reset_only', () => {
    const f = tuiCli._parseFlags(['--reset-only']);
    assert.equal(f.reset_only, true);
  });

  test('H6: unknown flag becomes boolean true (forward-compat)', () => {
    const f = tuiCli._parseFlags(['--future-feature']);
    assert.equal(f['future-feature'], true);
  });

  test('H7: positional args silently ignored', () => {
    const f = tuiCli._parseFlags(['some-positional', '--once']);
    assert.equal(f.once, true);
  });
});

describe('Group I: _loadData composition contract', () => {
  test('I1: returns shape { awareness, initiatives, orgChain, todos, warnings }', () => {
    const d = tuiCli._loadData(process.cwd());
    assert.deepEqual(Object.keys(d).sort(), ['awareness', 'initiatives', 'orgChain', 'todos', 'warnings']);
  });

  test('I2: never throws on missing cache (degrades to scanPeer no-fetch fallback)', () => {
    // _loadData uses readCache; on cache-miss falls through to scanPeer({no_fetch: true}).
    // scanPeer requires git in cwd; this test runs in the repo so it works.
    assert.doesNotThrow(() => tuiCli._loadData(process.cwd()));
  });

  test('I3: warnings is always an array', () => {
    const d = tuiCli._loadData(process.cwd());
    assert.ok(Array.isArray(d.warnings));
  });

  test('I4: todos is always null in v1.1 (reserved slot)', () => {
    const d = tuiCli._loadData(process.cwd());
    assert.strictEqual(d.todos, null);
  });
});
```

# CRITICAL: Group I uses real `process.cwd()` (this repo). It's an integration test against the live awareness/initiatives modules. Acceptable here because both are well-tested elsewhere; this just confirms composition.
# GOTCHA: `_loadData` calls `aw.scanPeer({ no_fetch: true })` which spawns `git` subprocesses. Slow-ish (~50-200ms). Test should pass within the default node:test 30s timeout.
# PATTERN: Mirror Group H from check-todos and awareness CLI tests (they have similar flag-parse coverage).
  </action>
  <verify>
1. Test count increased:
   `npm test 2>&1 | grep -E '^# (tests|pass|fail)' | tail`

   Expected: tests increased by ~11 (7 in Group H + 4 in Group I); 0 new failures.

2. CLI router smoke test:
   `node plugins/devflow/devflow/bin/df-tools.cjs tui --once --raw 2>&1 | head -10`

   Expected: prints rendered ANSI to stdout (you'll see the panel headers and content); exits 0.

3. Non-TTY auto-fallback:
   `node plugins/devflow/devflow/bin/df-tools.cjs tui 2>&1 | head -3`

   Expected: stderr line "df-tools tui: non-TTY environment detected; falling back to --once --raw" then the render output. Process exits cleanly.

4. Reset-only:
   `node plugins/devflow/devflow/bin/df-tools.cjs tui --reset-only`

   Expected: writes 3 escape sequences (cursor show + alt-screen leave + SGR reset) and exits 0. (Visible only via `od -c` or similar; user sees nothing printed in normal terminal.)

5. Pipe-friendly:
   `node plugins/devflow/devflow/bin/df-tools.cjs tui --once --raw | wc -l`

   Expected: positive line count; no hang. Process completes in < 1s.

6. Existing tests still pass:
   `npm test 2>&1 | tail -3`

   Expected: total count = baseline (1097 from STATE.md) + 30+ from 08-01 + 11 from 08-02 ≈ 1138+. No failures.
  </verify>
  <done>
- `df-tools.cjs` has `case 'tui':` arm + import of `cmdTuiRoute`.
- `df-tools tui --once --raw` runs end-to-end against this repo's actual data; emits ANSI to stdout; exits 0.
- `df-tools tui` (no args) in a non-TTY environment auto-falls back to `--once --raw` mode (warning to stderr) and exits 0 — does NOT hang.
- Group H (7 tests) + Group I (4 tests) added to `lib/tui.test.cjs`; all pass.
- No regressions in baseline test suite.
- Commit: `feat(08-02): wire df-tools tui CLI + interactive raw-mode session`.
  </done>
  <recovery>
If `df-tools tui --once --raw | wc -l` hangs: the auto-fallback isn't triggering. Check that the non-TTY guard in cmdTuiRoute correctly evaluates `!process.stdout.isTTY`. When piped, stdout.isTTY is undefined/false → guard fires → `_runOneShot` runs → `process.exit(0)` is hit. If still hangs, check that `_runOneShot` ends with `process.exit(0)`.

If `df-tools tui --reset-only` doesn't exit: it should call `process.exit(0)` after writing the escape sequences. Check `_runResetOnly`.

If interactive mode hangs and you need to recover your terminal: `printf '\x1b[?25h\x1b[?1049l\x1b[0m'` in the parent shell (or close + reopen the terminal).

If df-tools.cjs case 'tui' arm conflicts with another command: search for `case 'tui'` to confirm uniqueness; if conflict, the work is on the wrong branch — abort and resync.
  </recovery>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Manual verification of interactive TUI session (5 min)</name>
  <what-built>Interactive `df-tools tui` session with alt-screen, raw mode, `r`/`q`/Ctrl-C key handling, and idempotent cleanup. Tasks 1-2 wired the CLI; this checkpoint confirms it works visually in a real terminal.</what-built>
  <how-to-verify>

Run each of these in a real interactive terminal (NOT through Claude's bash tool, since the tool environment isn't a TTY):

1. **Happy path:**
   ```
   node plugins/devflow/devflow/bin/df-tools.cjs tui
   ```
   Expected:
   - Screen clears (alt-screen entered)
   - Cursor disappears (hidden)
   - 3 panels render: org context (top), peer sessions (middle), active initiatives (bottom)
   - Press `r` → screen briefly flickers, re-renders (data may be unchanged)
   - Press `q` → returns to your shell prompt; screen restored to where it was before; cursor visible

2. **Ctrl-C exit:**
   Re-run; press Ctrl-C. Expected: same clean exit (cursor visible, original screen content restored). Exit code 130 (`echo $?` after).

3. **Non-TTY:**
   ```
   node plugins/devflow/devflow/bin/df-tools.cjs tui | head -20
   ```
   Expected: ~20 lines of output; no hang; warning on stderr "non-TTY environment detected".

4. **Reset-only (recovery hatch):**
   ```
   node plugins/devflow/devflow/bin/df-tools.cjs tui --reset-only
   ```
   Expected: cursor visible (was likely already visible), no visible output, exit 0.

5. **--no-color:**
   ```
   node plugins/devflow/devflow/bin/df-tools.cjs tui --no-color --once --raw
   ```
   Expected: rendered output WITHOUT ANSI color codes (no `\x1b[3{0..7}m` sequences); box drawing + cursor-position escapes still present.

6. **Resilience: missing cache (optional):**
   ```
   mv .planning/.awareness-cache.json /tmp/awareness-cache-backup.json 2>/dev/null
   node plugins/devflow/devflow/bin/df-tools.cjs tui --once
   mv /tmp/awareness-cache-backup.json .planning/.awareness-cache.json 2>/dev/null
   ```
   Expected: still renders; org panel shows "(no org context)" placeholder; doesn't crash.

  </how-to-verify>
  <resume-signal>Type "approved" to confirm interactive mode works, or describe what failed (e.g., "screen stayed blank on Ctrl-C", "cursor stayed hidden after q", "r keypress crashed").</resume-signal>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `df-tools tui --once --raw` runs to completion against this repo's data, emits ANSI, exits 0.
- `df-tools tui` (no args) in non-TTY auto-falls back to `--once --raw` (does not hang).
- `df-tools tui` in real TTY enters alt-screen, hides cursor, accepts `r`/`q`/Ctrl-C; cleans up on exit.
- `df-tools tui --reset-only` emits recovery escapes; useful when the user's previous session was killed -9.
- Group H (7 flag-parse tests) + Group I (4 composition tests) all pass.
- Existing test suite passes with no regressions.
- Manual verification checkpoint approved by user.
</verification>

<success_criteria>
- SC-4: ✓ `df-tools tui` opens TUI mode (raw stdin, alternate screen, hides cursor); `r` refreshes; `q` exits cleanly.
- SC-5: ✓ Clean exit handling: SIGINT, EOF, `q` keypress all restore terminal state via `process.on('exit')` cleanup. Cleanup is idempotent.
</success_criteria>

<output>
After completion, create `.planning/objectives/08-program-aware-tui/08-02-cli-and-terminal-control-SUMMARY.md` with:
- CLI surface verified (--once, --raw, --no-color, --reset-only, default interactive)
- Test count added (Group H: 7, Group I: 4)
- Manual verification result (approved or failures noted)
- Any escape-sequence behavior pinned during real-terminal verification (e.g., "tested in iTerm2 + tmux + Terminal.app, all clean exits")
- Commit hash for the feat commit
- Confirmation that `lib/tui.cjs` was NOT modified (renderer surface stable from 08-01; the only changes are in tui-cli.cjs + df-tools.cjs)
</output>
