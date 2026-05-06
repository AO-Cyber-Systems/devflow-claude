---
objective: 19-pty-handoff-watcher
trd: "01"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - package.json
  - plugins/devflow/devflow/bin/lib/watcher-shell.cjs
  - plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs
autonomous: true
requirements:
  - PTY-BACKEND
must_haves:
  truths:
    - "ShellSession with interactive:true uses node-pty.spawn for shell allocation"
    - "ShellSession with interactive:false continues to use child_process.spawn (existing behavior, byte-identical)"
    - "All 11 existing watcher-shell.test.cjs tests pass unchanged with interactive:false"
    - "PTY-mode dispatch returns the same {stdout, stderr, exit_code, status} shape as pipe mode"
    - "PTY-mode echo command (`echo hello`) returns stdout='hello\\n', exit_code=0, status='done'"
    - "PTY-mode failed command (`false`) returns exit_code=1, status='failed'"
    - "PTY-mode dispatch writes commands with carriage-return terminator (\\r), not newline (\\n)"
    - "PTY tests skip cleanly with t.skip when node-pty native binary unavailable on test machine"
    - "package.json declares node-pty as a dependency with a pinned version"
    - "ShellSession.kill() is idempotent on PTY procs (no throw on double-kill)"
  artifacts:
    - path: "package.json"
      provides: "node-pty dependency declaration"
      contains: "\"node-pty\""
    - path: "plugins/devflow/devflow/bin/lib/watcher-shell.cjs"
      provides: "Dual-mode ShellSession: PTY (interactive:true) + pipe (interactive:false)"
      exports: ["ShellSession", "ShellSessionClosed", "splitDispatchOutput"]
      min_lines: 320
    - path: "plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs"
      provides: "All 11 existing pipe-mode tests + PTY-mode tests gated on node-pty availability"
      min_lines: 200
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/watcher-shell.cjs"
      to: "node-pty"
      via: "conditional require inside spawn() when this.interactive === true"
      pattern: "require\\(['\"]node-pty['\"]\\)"
    - from: "plugins/devflow/devflow/bin/lib/watcher-shell.cjs"
      to: "child_process.spawn"
      via: "preserved require + spawn call when this.interactive === false"
      pattern: "child_process"
    - from: "plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs"
      to: "ShellSession with interactive:true"
      via: "describe('watcher-shell — PTY mode', ...) block gated on node-pty availability"
      pattern: "interactive:\\s*true"
---

<objective>
Replace `child_process.spawn` with `node-pty` in `watcher-shell.cjs` for the `interactive: true` path. Preserve the `interactive: false` path verbatim so all 11 existing tests pass byte-identical. Add PTY-mode tests gated on node-pty availability. Add `node-pty` to `package.json` dependencies.

Purpose: TTY-required commands (`gh auth login`, `doctl auth init`, `gpg --decrypt`) need a real PTY to pass their `isatty(stdin)` check. The pipe-based dispatch in v1.1 fails them silently. This TRD swaps the dispatch backend without changing the sentinel-based output protocol.

Output: Dual-mode `ShellSession` that the daemon (interactive:true production) and tests (interactive:false) both consume. New PTY-mode test suite. Updated package.json.
</objective>

<file_tree>
package.json                                                     ← MODIFY
plugins/devflow/devflow/bin/lib/
├── watcher-shell.cjs                                            ← MODIFY (dual-mode)
└── watcher-shell.test.cjs                                       ← MODIFY (add PTY suite)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing pipe-mode ShellSession (preserve verbatim under `interactive: false`)

`plugins/devflow/devflow/bin/lib/watcher-shell.cjs` lines 70-101 — current spawn:

```js
async spawn() {
  if (this.proc) throw new Error('already spawned');
  const args = this.interactive ? ['-i'] : [];
  this.proc = spawn(this.shell, args, {
    env: this.env,
    cwd: this.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  this.proc.stdout.setEncoding('utf8');
  this.proc.stderr.setEncoding('utf8');
  this.proc.stdout.on('data', (chunk) => {
    this._stdoutBuf += chunk;
    this._tryComplete();
  });
  this.proc.stderr.on('data', (chunk) => {
    this._stderrBuf += chunk;
    this._tryComplete();
  });
  this.proc.on('exit', () => this._onExit());
  this.proc.on('error', () => this._onExit());
  this.proc.stdin.write([
    'set +o monitor 2>/dev/null',
    "PS1=''",
    "PS2=''",
    "PROMPT_COMMAND=''",
    'unset PROMPT_DIRTRIM',
    '',
  ].join('\n'));
}
```

### Pattern: Existing dispatch protocol (preserve — protocol-level, not transport-level)

Lines 191-202 — sentinel-fenced wrapper:

```js
const wrapped = [
  '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
  `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
  '__DFW_RC=$?',
  `echo ${begin}`,
  'cat $__DFW_OUT 2>/dev/null',
  `echo ${delim}`,
  'cat $__DFW_ERR 2>/dev/null',
  `echo ${end}:$__DFW_RC`,
  'rm -f $__DFW_OUT $__DFW_ERR',
  '',
].join('\n');
this.proc.stdin.write(wrapped);
```

For PTY mode: replace the join character with `'\r'` (carriage return) and use `this.proc.write(wrapped)` (no `.stdin`).

### Pattern: Existing test factory (extend with PTY-aware variant)

`watcher-shell.test.cjs` lines 30-38 — `withSession` helper:

```js
async function withSession(opts, fn) {
  const session = new ShellSession({ shell: SHELL, interactive: false, ...opts });
  await session.spawn();
  try {
    await fn(session);
  } finally {
    try { await session.kill(); } catch {}
  }
}
```

**Add for PTY mode** (gated on availability):

```js
function ptyAvailable() {
  try { require('node-pty'); return true; } catch { return false; }
}

async function withPTYSession(opts, fn) {
  const session = new ShellSession({ shell: SHELL, interactive: true, ...opts });
  await session.spawn();
  try {
    await fn(session);
  } finally {
    try { await session.kill(); } catch {}
  }
}
```

</codebase_examples>

<anti_patterns>

- **DO NOT** abstract pipe-vs-PTY behind a transport interface — keep both branches readable inline. The cost of premature abstraction outweighs the duplication.
- **DO NOT** strip ANSI escapes preemptively — bash with `PS1=''` produces clean output. Only add ANSI handling if a test demonstrates a real failure.
- **DO NOT** change the sentinel protocol (BEGIN/DELIM/END regex shape, line layout, exit-code suffix). The pipe-mode tests assume the existing protocol; touching it will cause regressions in `interactive: false` mode.
- **DO NOT** drop `setEncoding('utf8')` from the pipe path — node-pty returns strings by default; child_process streams need explicit encoding.
- **DO NOT** ship `node-pty` as a peer dependency or optional dependency — list it as a regular `dependencies` entry. Plugin users who run the daemon need it; users who never run `devflow-watch start` still install it but pay only the prebuilt-binary download (small).

</anti_patterns>

<error_recovery>

- **`require('node-pty')` throws** (no prebuilt binary, no build tools): test path uses `t.skip('node-pty unavailable')`; production path re-throws with wrapped message: `"node-pty not installed — set interactive:false on ShellSession or run 'npm install' to fetch the prebuilt binary"`.
- **PTY spawn fails on supported platform** (e.g. shell binary missing): emit `ShellSessionClosed` with the underlying error message. Existing `ShellSessionClosed` class already handles this case for pipe mode.
- **`proc.write(cmd)` on a closed PTY** throws synchronously in some node-pty versions. Wrap in try/catch like the existing `proc.kill('SIGTERM')` calls (lines 213, 219). Set `_closed=true` and resolve the active dispatch with `status: 'shell_died'`.
- **Sentinel never arrives** (PTY echo eats input or shell crashes): existing 600s timeout fires; current `_activeDispatch.timer` logic resolves with `status: 'timeout'`, `exit_code: -1`. No change needed.
- **Echo prefix appears before BEGIN sentinel** (PTY default echo): `splitDispatchOutput` already starts at `buf.indexOf(begin)` — echoed input is harmless prefix garbage. Confirmed in TRD 19-01 RESEARCH §2 "Sentinel protocol compatibility".

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/19-pty-handoff-watcher/19-CONTEXT.md
@.planning/objectives/19-pty-handoff-watcher/19-RESEARCH.md
@plugins/devflow/devflow/bin/lib/watcher-shell.cjs
@plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs
</context>

<research_context>

From 19-RESEARCH.md §2 "Architecture Patterns":

- node-pty surface: `pty.spawn(shell, args, { name: 'xterm-color', cols: 80, rows: 24, cwd, env })` returning `{ onData, onExit, write, resize, kill }`.
- Single `onData` stream (PTYs don't separate stdout/stderr at OS layer; in-shell wrapping `> $__DFW_OUT 2> $__DFW_ERR` already gives separate capture in the sentinel protocol).
- Writes terminate with `\r` (carriage return), NOT `\n`.
- `onExit` provides `{exitCode, signal}` directly.
- PTY echoes input by default — sentinel parser already handles this via `buf.indexOf(begin)` forward scan (no change needed).

From 19-RESEARCH.md §4 "Common Pitfalls":

- macOS arm64: pin a node-pty version with arm64 prebuilt binaries (verify on npmjs.com at planning time; 1.0.0+ is safe).
- PTY block buffering: bash inside a PTY uses line-buffering by default — this is GOOD for our case (we used to fight block-buffering on the pipe path; PTY removes that fight).
- Carriage return semantics: `\r` is the input terminator on PTYs, NOT `\n`. Common bug source. Tests must verify `proc.write(cmd + '\r')`.

From 19-CONTEXT.md §4 "Discretion Areas":

- node-pty version: pin latest stable from npm at planning time (no caret).
- PTY dimensions: default 80×24; configurable via daemon-startup options is OUT OF SCOPE for this TRD — fixed defaults only.
- ANSI strip: not required if PS1='' is set in the init prelude (current code already does this). Skip strip-ansi entirely unless a test fails.

</research_context>

<gotchas>

- **Sentinel protocol vs PTY echo:** PTY echoes the input back BEFORE the shell processes it. The output stream therefore looks like `<echoed cmd>\r\n<BEGIN>\n<stdout>\n<DELIM>\n<stderr>\n<END>:0\n`. The existing `splitDispatchOutput` already starts at `buf.indexOf(begin)` so echoed input is harmless prefix. **Do not "clean up" the echo** — it's load-bearing for the regex-driven sentinel parser to be transport-agnostic.

- **Init-prelude write must use `\r` on PTY:** the existing prelude (lines 94-101 of watcher-shell.cjs) writes `'set +o monitor...\nPS1=...\n...\n'`. On PTY mode, replace `\n` with `\r` for line termination. Bash with `PS1=''` will produce no PS1 noise — confirmed working pattern.

- **`proc.write` vs `proc.stdin.write`:** node-pty's `proc.write` is on the proc itself (no `.stdin` property). child_process's `proc.stdin.write` is on the stdin stream. The two API shapes are NOT unifiable without a wrapper — don't try; just branch.

- **Encoding:** node-pty `onData` callback receives a `string` by default. child_process streams require `setEncoding('utf8')` to do the same. Easy to overlook when writing the conditional.

- **PTY proc has NO `.on('exit', ...)` and `.on('error', ...)`:** node-pty exposes `proc.onExit({exitCode, signal})` and there is no separate error event — failures during spawn throw synchronously from `pty.spawn`. Wrap the conditional spawn in try/catch.

- **`node-pty` install on CI:** if the CI runner doesn't have prebuilt binaries (rare), the install will try to compile from source — this needs `python3` + `make` + a C++ compiler. Document in the README install section AND skip PTY tests cleanly when the require fails.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add node-pty dependency and write the PTY-mode test list (RED)</name>
  <files>package.json, plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs</files>
  <action>
Per CLAUDE.md TDD Playbook habit 2 (test list first), populate the behavior cases as a checklist comment at the top of the new PTY-mode `describe(...)` block BEFORE writing any test bodies. Then write each failing test one at a time (habit 3).

Steps:

1. Pin a `node-pty` version. Run `npm view node-pty version` to find current latest stable. Add to `package.json`:
   ```json
   "dependencies": {
     "node-pty": "<exact-version>"
   }
   ```
   Use exact version (no caret), per locked decision 1.

2. Run `npm install` to fetch the prebuilt binary. Verify with `node -e 'console.log(require("node-pty"))'`. If install fails, troubleshoot (likely missing build tools); document any platform-specific install hassle in 19-RESEARCH.md (real-world data).

3. Append to `watcher-shell.test.cjs` a new `describe('watcher-shell — PTY mode (interactive:true)', ...)` block. Add a `ptyAvailable()` helper:
   ```js
   function ptyAvailable() {
     try { require('node-pty'); return true; } catch { return false; }
   }
   ```
   Add a `withPTYSession({}, fn)` factory mirroring `withSession` but with `interactive: true`.

4. **Behavior list (write as comment block at top of PTY describe — these are the failing tests to add)**:
   - PTY-1: spawn() ready when node-pty available; throws clear error when not
   - PTY-2: dispatch('p-1', 'echo hello') returns { stdout: 'hello\n', exit_code: 0, status: 'done' }
   - PTY-3: dispatch('p-2', 'false') returns { exit_code: 1, status: 'failed' }
   - PTY-4: dispatch('p-3', 'echo err 1>&2') returns { stdout: '', stderr: 'err\n' } (sentinel-protocol gives separate streams even though PTY merges them)
   - PTY-5: env preserved across two PTY-mode dispatches (export FOO=bar; echo $FOO → 'bar\n')
   - PTY-6: multi-line stdout preserved (printf 'a\\nb\\nc\\n' → 'a\nb\nc\n')
   - PTY-7: dispatch sends command with carriage-return terminator (assert via spy on proc.write — value ends with '\r')
   - PTY-8: timeout fires when command exceeds timeout_ms (sleep 5 with timeout_ms=200 → status:'timeout', exit_code:-1)
   - PTY-9: kill() is idempotent (call twice, second call no-throws)
   - PTY-10: dispatch after kill rejects with ShellSessionClosed
   - PTY-11: isAlive returns true after spawn, false after kill
   - PTY-12: gating — when ptyAvailable() returns false, all PTY-* tests skip cleanly via t.skip('node-pty unavailable')

5. Implement PTY-1 first as a failing test. Run `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs`. PTY-1 MUST FAIL (no PTY code path yet). The 11 existing pipe-mode tests MUST still pass.

6. Commit RED: `test(19-01): add failing PTY-mode test list for ShellSession`. Include the dependency bump in the same commit (the test imports from package.json indirectly).

# CRITICAL: Test list goes in BEFORE any test body. Do not skip habit 2.
# CRITICAL: Run existing 11 pipe-mode tests after each step — zero regressions on the pipe path.
# GOTCHA: ptyAvailable() must use try/catch around require — node-pty throws synchronously when prebuilt binary is missing.
# PATTERN: Mirror withSession structure exactly — change only `interactive: true`.
  </action>
  <verify>
1. `cat package.json | grep node-pty` shows pinned version (no caret).
2. `node -e 'console.log(require("node-pty").spawn)'` prints `[Function: spawn]` (or skip with note if test machine has no prebuilt).
3. `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs 2>&1 | head -50` shows: 11 pipe-mode tests PASS + at least PTY-1 FAILING (or all PTY-* skipped if node-pty unavailable).
4. Behavior list comment block exists at top of new `describe('watcher-shell — PTY mode...', ...)` block.
  </verify>
  <done>
- `node-pty` is in `package.json` dependencies with an exact pinned version.
- `watcher-shell.test.cjs` has a new PTY describe block with a 12-item behavior checklist comment.
- At least one PTY test is implemented and FAILS (RED state).
- All 11 existing pipe-mode tests still pass.
- RED commit exists: `test(19-01): add failing PTY-mode test list for ShellSession`.
  </done>
  <recovery>
- If `npm install node-pty` fails on the dev machine: document the failure mode in a comment in 19-RESEARCH.md §4. Try `npm install --build-from-source node-pty` after installing build tools. If still fails: skip PTY install on this machine but proceed with the test code (PTY tests will skip via ptyAvailable() guard) — flag the issue to the user via a checkpoint task IF Wave 3 e2e tests can't run either.
- If pinning the latest version causes test conflicts (e.g. node-pty 2.x has API changes): downgrade to last stable 1.x. Document in 19-RESEARCH.md.
- If `package.json` already has `node-pty` listed (unlikely but possible from a partial earlier attempt): verify the version, run `npm install` to ensure the lockfile is in sync.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Implement PTY-mode spawn + dispatch + kill (GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/watcher-shell.cjs</files>
  <action>
Make the failing PTY-* tests pass by adding the PTY branch to `ShellSession.spawn()`, `dispatch()`, and `kill()`. Preserve the pipe-mode branch verbatim — every existing pipe-mode test must continue to pass.

Approach:

```js
// Top of file — keep existing require, add lazy PTY require
const { spawn } = require('child_process');
let _ptyModule = null;
function _loadPTY() {
  if (_ptyModule) return _ptyModule;
  try {
    _ptyModule = require('node-pty');
    return _ptyModule;
  } catch (e) {
    throw new Error(
      'node-pty not installed — set interactive:false on ShellSession or run "npm install" to fetch the prebuilt binary. ' +
      `Underlying error: ${e.message}`
    );
  }
}

class ShellSession extends EventEmitter {
  // ... constructor unchanged ...

  async spawn() {
    if (this.proc) throw new Error('already spawned');

    if (this.interactive) {
      // PTY path
      const pty = _loadPTY();
      try {
        this.proc = pty.spawn(this.shell, ['-i'], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd: this.cwd,
          env: this.env,
        });
      } catch (e) {
        throw new Error(`PTY spawn failed: ${e.message}`);
      }
      this._isPTY = true;
      this.proc.onData((chunk) => {
        this._stdoutBuf += chunk;
        this._tryComplete();
      });
      this.proc.onExit(() => this._onExit());
      // Init prelude — newlines become carriage returns on PTY
      this._writeRaw([
        'set +o monitor 2>/dev/null',
        "PS1=''",
        "PS2=''",
        "PROMPT_COMMAND=''",
        'unset PROMPT_DIRTRIM',
        '',
      ].join('\r'));
    } else {
      // Pipe path — existing behavior, UNCHANGED
      const args = [];  // interactive:false → no -i flag
      this.proc = spawn(this.shell, args, {
        env: this.env,
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this._isPTY = false;
      this.proc.stdout.setEncoding('utf8');
      this.proc.stderr.setEncoding('utf8');
      this.proc.stdout.on('data', (chunk) => {
        this._stdoutBuf += chunk;
        this._tryComplete();
      });
      this.proc.stderr.on('data', (chunk) => {
        this._stderrBuf += chunk;
        this._tryComplete();
      });
      this.proc.on('exit', () => this._onExit());
      this.proc.on('error', () => this._onExit());
      this._writeRaw([
        'set +o monitor 2>/dev/null',
        "PS1=''",
        "PS2=''",
        "PROMPT_COMMAND=''",
        'unset PROMPT_DIRTRIM',
        '',
      ].join('\n'));
    }
  }

  _writeRaw(s) {
    if (this._isPTY) this.proc.write(s);
    else this.proc.stdin.write(s);
  }

  // dispatch() — extract the wrapped command join into a helper
  dispatch(id, cmd, opts = {}) {
    // ... existing guards (isAlive, _activeDispatch) ...
    // ... existing Promise + timeout setup ...
    const wrappedLines = [
      '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
      `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
      '__DFW_RC=$?',
      `echo ${begin}`,
      'cat $__DFW_OUT 2>/dev/null',
      `echo ${delim}`,
      'cat $__DFW_ERR 2>/dev/null',
      `echo ${end}:$__DFW_RC`,
      'rm -f $__DFW_OUT $__DFW_ERR',
      '',
    ];
    const sep = this._isPTY ? '\r' : '\n';
    this._writeRaw(wrappedLines.join(sep));
    this._tryComplete();
    // ... return Promise ...
  }

  async kill() {
    if (!this.proc) return;
    if (this._closed) return;
    this._closed = true;
    try { this.proc.kill('SIGTERM'); } catch {}
    // ... existing 500ms grace + SIGKILL ...
  }
}
```

Steps:

1. Open `watcher-shell.cjs`. Add the lazy-load helper `_loadPTY` at top.
2. Refactor `spawn()` to branch on `this.interactive`. Preserve the pipe-mode block byte-identical (including the prelude).
3. Add `_writeRaw(s)` private method routing to `proc.write` or `proc.stdin.write`.
4. Refactor `dispatch()` to use `_writeRaw` + the conditional separator.
5. Verify `kill()` works for both proc types — node-pty's `proc.kill(sig)` accepts the same signal string. The try/catch already handles double-kill.
6. Run `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs`. ALL 12 PTY tests must pass. ALL 11 pipe-mode tests must still pass.
7. Run `npm test` from repo root. Total: ≥1852 pre-existing + 12 new = ≥1864 tests, all passing.
8. Commit GREEN: `feat(19-01): add PTY backend to ShellSession via node-pty`.

# CRITICAL: Pipe-mode branch must be byte-identical for the 11 existing tests. Diff carefully.
# CRITICAL: Use lazy require of node-pty inside _loadPTY — module-load-time failures break all imports of watcher-shell.cjs.
# GOTCHA: PTY's proc.kill('SIGTERM') accepts the same signal string as child_process — the try/catch already handles edge cases.
# PATTERN: _isPTY private flag set during spawn() — single source of truth for branching elsewhere.
  </action>
  <verify>
1. `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs 2>&1 | tail -20` shows all 23 tests passing (11 pipe + 12 PTY) OR all PTY tests skipping cleanly when node-pty unavailable.
2. `npm test 2>&1 | tail -20` shows total test count ≥1864 with 0 failing.
3. `grep -n "this._isPTY" plugins/devflow/devflow/bin/lib/watcher-shell.cjs` shows the flag is set in both branches.
4. `git diff plugins/devflow/devflow/bin/lib/watcher-shell.cjs | grep "^-" | grep -v "^---"` shows the only deletions are the conditional refactor (no removal of pipe-mode behavior).
  </verify>
  <done>
- All 12 new PTY-mode tests pass (or skip cleanly with node-pty unavailable).
- All 11 existing pipe-mode tests pass byte-identical.
- `npm test` reports zero failures vs. baseline.
- `_loadPTY` lazy-loader pattern works (require failure on a machine without node-pty doesn't crash module load).
- GREEN commit exists: `feat(19-01): add PTY backend to ShellSession via node-pty`.
  </done>
  <recovery>
- If pipe-mode tests regress: diff the pipe branch against the original `watcher-shell.cjs` lines 70-101. The prelude write, the `setEncoding('utf8')` calls, and the stdout/stderr listeners must match exactly. Restore byte-identical and retry.
- If PTY tests hang: most likely cause is `\n` instead of `\r` in the dispatch wrapper. Also verify the init prelude uses `\r`. Run a single dispatch with a `console.log(this._stdoutBuf)` debug line to inspect the raw PTY output and confirm sentinels are arriving on dedicated lines.
- If PTY tests produce unexpected stderr (PS1 noise, job-control output): re-verify the init prelude was written before the first dispatch. Add a 50ms `await new Promise(r => setTimeout(r, 50))` after spawn to let the prelude settle if needed (document the choice in code comment).
- If node-pty's `onExit` doesn't fire on kill on macOS: check node-pty version. Versions <0.10 have known macOS bugs. Bump to a more recent version.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: REFACTOR — extract sentinel-write helper, document PTY contract (REFACTOR)</name>
  <files>plugins/devflow/devflow/bin/lib/watcher-shell.cjs</files>
  <action>
Per RED-GREEN-REFACTOR. Only commit if cleanup actually improves the code.

Candidate refactors:

1. Extract the wrapped-command builder into a `_buildDispatchCommand(id, cmd)` helper that returns the array of lines. Keeps `dispatch()` smaller.

2. Add a top-of-file JSDoc block explaining the dual-mode design (pipe for tests, PTY for production daemon). 5-10 lines. Reference 19-RESEARCH.md §2 sentinel-protocol-compatibility.

3. Update the existing module-level JSDoc (lines 3-41) to reflect that node-pty is now used for `interactive:true`, removing or rephrasing the "Trade-offs vs node-pty" section since it's no longer a trade-off.

4. Confirm exports unchanged: `{ ShellSession, ShellSessionClosed, splitDispatchOutput }`. No new exports required for this TRD.

Run all tests once more after refactor to confirm zero regression.

Commit only if changes are non-trivial: `refactor(19-01): extract sentinel-write helper, update JSDoc for PTY mode`.

# RULE: Skip this task entirely (no commit) if no improvement worth shipping. TDD says REFACTOR is optional.
# CRITICAL: Tests must still pass byte-identical after refactor.
# PATTERN: Match existing code style — CommonJS, no destructuring on require, JSDoc on classes only.
  </action>
  <verify>
1. `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` shows zero failures (all 23 tests pass or PTY-12 skip).
2. `npm test` shows zero failures vs. baseline.
3. `git log --oneline | head -3` shows the commit chain: REFACTOR (optional) ← GREEN ← RED.
  </verify>
  <done>
- If refactor was committed: code reads cleaner without behavior change. Tests still pass.
- If refactor was skipped: SUMMARY.md notes "No REFACTOR pass needed — implementation already clean."
- File-level JSDoc accurately describes dual-mode behavior.
  </done>
  <recovery>
- If refactor introduces test failures: revert with `git reset --hard HEAD~1` and either retry with smaller scope or skip the refactor pass entirely.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none — no lint command in this repo per CLAUDE.md)</lint>
<test>npm test</test>
<build>(none — plugin distribution; no build step)</build>
</validation_gates>

<verification>
- `node-pty` listed in `package.json` dependencies with exact version
- `ShellSession({ interactive: true }).spawn()` allocates a PTY via `node-pty.spawn` (verified by spy or post-spawn inspection)
- `ShellSession({ interactive: false }).spawn()` allocates pipes via `child_process.spawn` (existing behavior, byte-identical)
- All 11 existing `watcher-shell.test.cjs` tests pass unchanged
- All 12 new PTY-mode tests pass when node-pty is installed; skip cleanly when it isn't
- Total test count: ≥1864 (1852 baseline + 12 new), all passing
- Sentinel protocol output (BEGIN/DELIM/END regex) reaches `splitDispatchOutput` correctly on both transports
</verification>

<success_criteria>
- [ ] `package.json` declares `node-pty` as a regular dependency with a pinned exact version (no caret)
- [ ] `watcher-shell.cjs` branches on `this.interactive` for spawn/dispatch/kill
- [ ] Pipe-mode (interactive:false) behavior is byte-identical to v1.1
- [ ] PTY-mode (interactive:true) tests pass: 12 behaviors covered (spawn-ready, echo, fail-cmd, stderr-capture, env-preserved, multi-line, CR-terminator, timeout, idempotent-kill, dispatch-after-kill-rejects, isAlive, gating-skip)
- [ ] Tests skip cleanly when node-pty native binary unavailable on test machine
- [ ] `npm test` from repo root reports ≥1864 tests, 0 failing
- [ ] At least 2 atomic commits (RED, GREEN); REFACTOR optional
</success_criteria>

<output>
After completion, create `.planning/objectives/19-pty-handoff-watcher/19-01-pty-backend-SUMMARY.md` per @/Users/markemerson/.claude/devflow/templates/summary.md. Document:
- Pinned node-pty version
- New test count (12) and total project test count
- Whether REFACTOR pass was needed
- Any platform-specific install issues encountered (for 19-04 doc-update TRD to absorb)
- Commit hashes for RED, GREEN, optional REFACTOR
</output>
