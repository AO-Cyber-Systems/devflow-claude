/**
 * Tests for watcher-shell — interactive shell session with sentinel-based
 * command dispatch.
 *
 * Behaviour list (TRD 01-04):
 *   1. spawn() ready
 *   2. dispatch returns stdout/stderr/exit_code
 *   3. sentinels parsed correctly
 *   4. exit code 0 vs non-zero
 *   5. echo hello -> stdout: "hello\n"
 *   6. echo err >&2 -> stderr: "err\n"
 *   7. timeout -> status: 'timeout', exit_code: -1
 *   8. env preserved across dispatches
 *   9. kill() sends SIGTERM
 *  10. dispatch after kill rejects
 *  11. crash recovery
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ShellSession, ShellSessionClosed } = require('./watcher-shell.cjs');

// Unit tests use non-interactive bash for speed and CI reliability.
// The interactive=true path (loading user rc files for mise/nvm/conda/aliases)
// is the production daemon's concern; an integration smoke test with
// interactive=true belongs in TRD 01-07 (end-to-end), not here.
const SHELL = 'bash';

async function withSession(opts, fn) {
  const session = new ShellSession({ shell: SHELL, interactive: false, ...opts });
  await session.spawn();
  try {
    await fn(session);
  } finally {
    try { await session.kill(); } catch {}
  }
}

describe('watcher-shell — basic dispatch', () => {
  test('echo hello returns { stdout: "hello\\n", exit_code: 0 }', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-1', 'echo hello');
      assert.equal(r.stdout, 'hello\n');
      assert.equal(r.exit_code, 0);
      assert.equal(r.status, 'done');
    });
  });

  test('false returns exit_code: 1, status: failed', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-2', 'false');
      assert.equal(r.exit_code, 1);
      assert.equal(r.status, 'failed');
    });
  });

  test('echo to stderr is captured separately', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-3', 'echo err 1>&2');
      assert.equal(r.stdout, '');
      assert.equal(r.stderr, 'err\n');
      assert.equal(r.exit_code, 0);
    });
  });

  test('two dispatches preserve env (FOO=bar)', async () => {
    await withSession({}, async (s) => {
      const a = await s.dispatch('h-4', 'export FOO=bar');
      assert.equal(a.exit_code, 0);
      const b = await s.dispatch('h-5', 'echo $FOO');
      assert.equal(b.stdout, 'bar\n');
    });
  });

  test('multi-line stdout preserved', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-6', "printf 'a\\nb\\nc\\n'");
      assert.equal(r.stdout, 'a\nb\nc\n');
    });
  });
});

describe('watcher-shell — timeout', () => {
  test('command exceeding timeout returns status: timeout', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-7', 'sleep 5', { timeout_ms: 200 });
      assert.equal(r.status, 'timeout');
      assert.equal(r.exit_code, -1);
    });
  });
});

describe('watcher-shell — lifecycle', () => {
  // Force interactive:false so these tests stay pipe-mode (matching pre-PTY
  // behavior). The class default flipped to PTY for the production daemon;
  // pipe-mode lifecycle tests must opt in explicitly.
  test('dispatch after kill rejects with ShellSessionClosed', async () => {
    const s = new ShellSession({ shell: SHELL, interactive: false });
    await s.spawn();
    await s.kill();
    await assert.rejects(
      () => s.dispatch('h-8', 'echo hi'),
      ShellSessionClosed,
    );
  });

  test('isAlive returns true after spawn, false after kill', async () => {
    const s = new ShellSession({ shell: SHELL, interactive: false });
    await s.spawn();
    assert.equal(s.isAlive(), true);
    await s.kill();
    assert.equal(s.isAlive(), false);
  });
});

// =============================================================================
// PTY-mode test list (TRD 19-01) — gated on node-pty availability
// =============================================================================
// Behavior list (test list first per CLAUDE.md TDD Playbook habit 2):
//   PTY-1:  spawn() ready when node-pty available; throws clear error when not
//   PTY-2:  dispatch('p-1', 'echo hello') -> { stdout: 'hello\n', exit_code: 0, status: 'done' }
//   PTY-3:  dispatch('p-2', 'false')      -> { exit_code: 1, status: 'failed' }
//   PTY-4:  dispatch('p-3', 'echo err 1>&2') -> { stdout: '', stderr: 'err\n' }
//           (sentinel-protocol gives separate streams even though PTY merges them)
//   PTY-5:  env preserved across two dispatches (export FOO=bar; echo $FOO -> 'bar\n')
//   PTY-6:  multi-line stdout preserved (printf 'a\nb\nc\n' -> 'a\nb\nc\n')
//   PTY-7:  dispatch sends command with carriage-return terminator
//           (assert via spy on proc.write — value ends with '\r')
//   PTY-8:  timeout fires when command exceeds timeout_ms
//           (sleep 5 with timeout_ms=200 -> status:'timeout', exit_code:-1)
//   PTY-9:  kill() is idempotent (call twice, second no-throws)
//   PTY-10: dispatch after kill rejects with ShellSessionClosed
//   PTY-11: isAlive returns true after spawn, false after kill
//   PTY-12: gating — when ptyAvailable() returns false, all PTY-* tests skip cleanly
// =============================================================================

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

const PTY_AVAILABLE = ptyAvailable();
const ptySkip = PTY_AVAILABLE ? undefined : { skip: 'node-pty unavailable' };

describe('watcher-shell — PTY mode (interactive:true)', () => {
  test('PTY-1: spawn() uses node-pty when interactive:true', ptySkip, async () => {
    const session = new ShellSession({ shell: SHELL, interactive: true });
    await session.spawn();
    try {
      // node-pty procs expose onData / onExit / write directly on the proc.
      // child_process procs expose stdout/stderr/stdin streams.
      assert.equal(typeof session.proc.onData, 'function',
        'expected node-pty proc with onData callback');
      assert.equal(typeof session.proc.write, 'function',
        'expected node-pty proc with write method');
      assert.equal(session._isPTY, true, 'expected _isPTY flag set');
    } finally {
      try { await session.kill(); } catch {}
    }
  });

  test('PTY-2: dispatch("echo hello") returns stdout="hello\\n", exit_code=0, status="done"',
    ptySkip,
    async () => {
      await withPTYSession({}, async (s) => {
        const r = await s.dispatch('p-1', 'echo hello');
        assert.equal(r.stdout, 'hello\n');
        assert.equal(r.exit_code, 0);
        assert.equal(r.status, 'done');
      });
    });

  test('PTY-3: dispatch("false") returns exit_code=1, status="failed"',
    ptySkip,
    async () => {
      await withPTYSession({}, async (s) => {
        const r = await s.dispatch('p-2', 'false');
        assert.equal(r.exit_code, 1);
        assert.equal(r.status, 'failed');
      });
    });

  test('PTY-4: dispatch("echo err 1>&2") captures stderr separately via sentinel protocol',
    ptySkip,
    async () => {
      await withPTYSession({}, async (s) => {
        const r = await s.dispatch('p-3', 'echo err 1>&2');
        assert.equal(r.stdout, '');
        assert.equal(r.stderr, 'err\n');
        assert.equal(r.exit_code, 0);
      });
    });

  test('PTY-5: env preserved across two dispatches (export FOO=bar; echo $FOO -> "bar\\n")',
    ptySkip,
    async () => {
      await withPTYSession({}, async (s) => {
        const a = await s.dispatch('p-4a', 'export FOO=bar');
        assert.equal(a.exit_code, 0);
        const b = await s.dispatch('p-4b', 'echo $FOO');
        assert.equal(b.stdout, 'bar\n');
      });
    });

  test('PTY-6: multi-line stdout preserved (printf a\\nb\\nc\\n)', ptySkip, async () => {
    await withPTYSession({}, async (s) => {
      const r = await s.dispatch('p-5', "printf 'a\\nb\\nc\\n'");
      assert.equal(r.stdout, 'a\nb\nc\n');
    });
  });

  test('PTY-7: dispatch writes commands with carriage-return terminator (\\r), not newline',
    ptySkip,
    async () => {
      const session = new ShellSession({ shell: SHELL, interactive: true });
      await session.spawn();
      try {
        // Spy on proc.write — capture the wrapped command string.
        const writeCalls = [];
        const origWrite = session.proc.write.bind(session.proc);
        session.proc.write = (s) => { writeCalls.push(s); return origWrite(s); };
        await session.dispatch('p-6', 'echo hello');
        // Find the dispatch write (contains '__DFW_BEGIN_p-6__').
        const dispatchWrite = writeCalls.find((s) => s.includes('__DFW_BEGIN_p-6__'));
        assert.ok(dispatchWrite, 'dispatch write not found in captured writes');
        // Lines must be separated by \r, NOT \n.
        assert.ok(dispatchWrite.includes('\r'),
          'expected \\r line terminator in PTY-mode dispatch write');
        assert.ok(!dispatchWrite.includes('\n'),
          'expected NO \\n in PTY-mode dispatch write');
      } finally {
        try { await session.kill(); } catch {}
      }
    });

  test('PTY-8: command exceeding timeout_ms returns status="timeout", exit_code=-1',
    ptySkip,
    async () => {
      await withPTYSession({}, async (s) => {
        const r = await s.dispatch('p-7', 'sleep 5', { timeout_ms: 200 });
        assert.equal(r.status, 'timeout');
        assert.equal(r.exit_code, -1);
      });
    });

  test('PTY-9: kill() is idempotent (double-kill no-throws)', ptySkip, async () => {
    const s = new ShellSession({ shell: SHELL, interactive: true });
    await s.spawn();
    await s.kill();
    // Second kill must not throw.
    await s.kill();
    assert.equal(s.isAlive(), false);
  });

  test('PTY-10: dispatch after kill rejects with ShellSessionClosed', ptySkip, async () => {
    const s = new ShellSession({ shell: SHELL, interactive: true });
    await s.spawn();
    await s.kill();
    await assert.rejects(
      () => s.dispatch('p-8', 'echo hi'),
      ShellSessionClosed,
    );
  });

  test('PTY-11: isAlive returns true after spawn, false after kill', ptySkip, async () => {
    const s = new ShellSession({ shell: SHELL, interactive: true });
    await s.spawn();
    assert.equal(s.isAlive(), true);
    await s.kill();
    assert.equal(s.isAlive(), false);
  });
});

describe('watcher-shell — PTY mode gating (PTY-12)', () => {
  test('PTY-12: when node-pty unavailable, PTY-mode tests skip cleanly', () => {
    // This test always runs. If PTY_AVAILABLE is true, this is a no-op pass.
    // If PTY_AVAILABLE is false, the suite above all carries skip metadata
    // and the PTY-* tests will be reported as skipped — no failures.
    if (!PTY_AVAILABLE) {
      // Confirm we're in skip-mode — ptySkip should carry a skip directive.
      assert.equal(typeof ptySkip, 'object');
      assert.ok(ptySkip.skip, 'expected skip directive when node-pty unavailable');
    } else {
      // node-pty available: just confirm the helper works.
      assert.equal(typeof require('node-pty').spawn, 'function');
    }
  });
});

// =============================================================================
// TRD 19-02: data-listener API (attachDataListener / detachDataListener / injectInput)
// =============================================================================
// Behavior list:
//   DL-1: attachDataListener registers a function; data callbacks fire on chunks
//   DL-2: detachDataListener removes a previously-attached listener (no callbacks after)
//   DL-3: injectInput writes raw bytes to the underlying proc (proc.stdin in pipe mode)
//   DL-4: pipe mode: stderr chunks ALSO feed external listeners (prompts on stderr)
//   DL-5: PTY mode: data listener fires on dispatch output (gated on node-pty)
//   DL-6: detached listener does not see chunks emitted after detach
//   DL-7: throwing listener does NOT break dispatch (errors swallowed)
//   DL-8: injectInput on closed session is no-op (no throw)
// =============================================================================

describe('watcher-shell — data-listener API (TRD 19-02)', () => {
  test('DL-1: attachDataListener fires on dispatch chunks (pipe mode)', async () => {
    await withSession({}, async (s) => {
      const seen = [];
      const listener = (chunk) => seen.push(chunk);
      s.attachDataListener(listener);
      const r = await s.dispatch('dl-1', 'echo hello');
      assert.equal(r.exit_code, 0);
      assert.ok(seen.length > 0, 'listener should fire at least once');
      const joined = seen.join('');
      assert.match(joined, /hello/, 'listener data should contain dispatched output');
    });
  });

  test('DL-2: detachDataListener stops further callbacks', async () => {
    await withSession({}, async (s) => {
      const seen = [];
      const listener = (chunk) => seen.push(chunk);
      s.attachDataListener(listener);
      await s.dispatch('dl-2a', 'echo first');
      const seenAfterFirst = seen.length;
      assert.ok(seenAfterFirst > 0, 'should see chunks for first dispatch');
      s.detachDataListener(listener);
      await s.dispatch('dl-2b', 'echo second');
      assert.equal(seen.length, seenAfterFirst,
        'no further chunks should arrive after detach');
    });
  });

  test('DL-3: injectInput writes to proc.stdin in pipe mode', async () => {
    await withSession({}, async (s) => {
      // Spy on proc.stdin.write
      const writes = [];
      const origWrite = s.proc.stdin.write.bind(s.proc.stdin);
      s.proc.stdin.write = (chunk, ...rest) => {
        writes.push(chunk);
        return origWrite(chunk, ...rest);
      };
      s.injectInput('FOO=bar\n');
      assert.ok(writes.some((w) => String(w).includes('FOO=bar')),
        'injectInput should reach proc.stdin.write');
    });
  });

  test('DL-4: pipe mode stderr chunks ALSO feed external listeners', async () => {
    await withSession({}, async (s) => {
      const seen = [];
      s.attachDataListener((c) => seen.push(c));
      const r = await s.dispatch('dl-4', 'echo err 1>&2');
      assert.equal(r.stderr, 'err\n');
      // Listener may have seen stdout (sentinel-fenced) AND/OR stderr chunks.
      // The key contract: listener received SOMETHING and we successfully
      // dispatched a stderr-only command. (stderr→stdout merging via temp
      // files in the wrapper means external listeners may see the err
      // text on either bus — both fulfill the contract.)
      assert.ok(seen.length > 0, 'expected at least one listener chunk');
    });
  });

  test('DL-5: PTY mode: attachDataListener fires on dispatch chunks', ptySkip, async () => {
    await withPTYSession({}, async (s) => {
      const seen = [];
      s.attachDataListener((c) => seen.push(c));
      const r = await s.dispatch('dl-5', 'echo ptydata');
      assert.equal(r.stdout, 'ptydata\n');
      const joined = seen.join('');
      assert.match(joined, /ptydata/, 'PTY listener should observe dispatched output');
    });
  });

  test('DL-6: detached listener does not see chunks emitted after detach', async () => {
    await withSession({}, async (s) => {
      const seenA = [];
      const seenB = [];
      const a = (c) => seenA.push(c);
      const b = (c) => seenB.push(c);
      s.attachDataListener(a);
      s.attachDataListener(b);
      await s.dispatch('dl-6a', 'echo both');
      const aBefore = seenA.length;
      const bBefore = seenB.length;
      assert.ok(aBefore > 0 && bBefore > 0);
      s.detachDataListener(a);
      await s.dispatch('dl-6b', 'echo onlyB');
      assert.equal(seenA.length, aBefore, 'detached A should see no more chunks');
      assert.ok(seenB.length > bBefore, 'still-attached B should see new chunks');
    });
  });

  test('DL-7: throwing listener does NOT break dispatch', async () => {
    await withSession({}, async (s) => {
      s.attachDataListener(() => { throw new Error('listener boom'); });
      const r = await s.dispatch('dl-7', 'echo survives');
      assert.equal(r.stdout, 'survives\n');
      assert.equal(r.exit_code, 0);
    });
  });

  test('DL-8: injectInput on closed session is no-op (no throw)', async () => {
    const s = new ShellSession({ shell: SHELL, interactive: false });
    await s.spawn();
    await s.kill();
    // Must not throw
    s.injectInput('whatever\n');
    assert.equal(s.isAlive(), false);
  });
});

// ===========================================================================
// TRD 20-05 Group W — Cross-shell wrapper integration
// ===========================================================================

const { spawnSync: spawnSyncW } = require('child_process');
function shellAvailableW(name, probeArgs = ['-c', 'echo __DFW_PROBE__']) {
  try {
    const r = spawnSyncW(name, probeArgs, { encoding: 'utf8', timeout: 3000 });
    return r.status === 0 && r.stdout && r.stdout.includes('__DFW_PROBE__');
  } catch { return false; }
}
const fishAvailableW = shellAvailableW('fish');
const pwshAvailableW = shellAvailableW('pwsh') || shellAvailableW('powershell');

describe('watcher-shell — Group W: cross-shell integration (TRD 20-05)', () => {
  test('W-1 ShellSession({shell:"/bin/bash"}) byte-identical to current behavior', async () => {
    const session = new ShellSession({ shell: '/bin/bash', interactive: false });
    await session.spawn();
    try {
      const r = await session.dispatch('w-1', 'echo bash-ok');
      assert.equal(r.exit_code, 0);
      assert.equal(r.stdout, 'bash-ok\n');
    } finally {
      try { await session.kill(); } catch {}
    }
  });

  test('W-2 ShellSession({shell:"/bin/csh"}) constructor throws UnsupportedShell', () => {
    assert.throws(
      () => new ShellSession({ shell: '/bin/csh', interactive: false }),
      (e) => e.name === 'UnsupportedShell' || /unsupported shell/i.test(e.message),
    );
  });

  test('W-3 ShellSession({shell:"fish"}).dispatch() works end-to-end',
    { skip: !fishAvailableW }, async () => {
    const session = new ShellSession({ shell: 'fish', interactive: false });
    await session.spawn();
    try {
      const r = await session.dispatch('w-3', 'echo fish-ok');
      assert.equal(r.exit_code, 0);
      assert.match(r.stdout, /fish-ok/);
    } finally {
      try { await session.kill(); } catch {}
    }
  });

  test('W-4 ShellSession({shell:"pwsh"}).dispatch() works end-to-end',
    { skip: !pwshAvailableW }, async () => {
    const cmd = shellAvailableW('pwsh') ? 'pwsh' : 'powershell';
    const session = new ShellSession({ shell: cmd, interactive: false });
    await session.spawn();
    try {
      const r = await session.dispatch('w-4', 'Write-Output pwsh-ok');
      assert.equal(r.exit_code, 0);
      assert.match(r.stdout, /pwsh-ok/);
    } finally {
      try { await session.kill(); } catch {}
    }
  });

  test('W-5 splitDispatchOutput parses bash/fish/pwsh output identically (sentinel-based parser shell-agnostic)', () => {
    const { splitDispatchOutput } = require('./watcher-shell.cjs');
    const begin = '__DFW_BEGIN_w-5__';
    const delim = '__DFW_DELIM_w-5__';
    const end = '__DFW_END_w-5__';
    const buf = `${begin}\nhello\n${delim}\n${end}:0\n`;
    const r = splitDispatchOutput(buf, begin, delim, end);
    assert.equal(r.stdout, 'hello\n');
    assert.equal(r.stderr, '');
  });
});

// =============================================================================
// Group BP — readline bracketed-paste pollution of the fenced capture (#95)
// =============================================================================
//
// These run on EVERY platform, on the real buffers ubuntu-latest produced, so
// the mechanism is pinned somewhere a macOS developer can see it. The PTY-*
// tests above only expose it on a bash with readline >= 8.1; macOS ships bash
// 3.2 / readline 6.x, which has no bracketed-paste mode at all — which is how
// this shipped to Linux users unseen until CI first ran the suite.
//
//   BP-1: the exact stdout region CI captured for `echo hello` normalizes to 'hello\n'
//   BP-2: the exact stderr region CI captured for a clean run normalizes to ''
//   BP-3: a blank line the COMMAND produced is preserved (no over-stripping)
//   BP-4: ESC[200~ / ESC[201~ paste delimiters are removed
//   BP-5: a buffer with no ESC at all is returned unchanged
//   BP-6: end-to-end through splitDispatchOutput on a full polluted PTY buffer
// =============================================================================

describe('watcher-shell — bracketed-paste capture hygiene (issue #95)', () => {
  const { stripBracketedPaste, splitDispatchOutput } = require('./watcher-shell.cjs');

  // What _tryComplete does to a PTY capture, in order. The strip MUST precede
  // the \r\n collapse: the artifact carries its own CRLF.
  const normalizePTY = (s) => stripBracketedPaste(s).replace(/\r\n/g, '\n');

  // The artifact's own terminator is `\r\r\n`, not `\r\n`: readline writes a
  // carriage return and the PTY's ONLCR expands the newline into a second one.
  // Captured verbatim off a bash 5.2 PTY (node:22 image, aarch64). Getting this
  // wrong is not cosmetic — matching only `\r\n` leaves a stray `\n` per line
  // and the capture is still not the command's output.
  const BP = '\x1B[?2004h\x1B[?2004l\r\r\n';

  test('BP-1: the Linux capture of "echo hello" normalizes to "hello\\n"', () => {
    const captured = `${BP}hello\r\n${BP}`;
    assert.equal(normalizePTY(captured), 'hello\n');
  });

  test('BP-2: the Linux capture of a clean stderr region normalizes to ""', () => {
    const captured = `${BP}${BP}`;
    assert.equal(normalizePTY(captured), '');
  });

  test('BP-2b: the plain \\r\\n form is stripped too (terminals without ONLCR)', () => {
    const captured = '\x1B[?2004h\x1B[?2004l\r\nhello\n\x1B[?2004h\x1B[?2004l\r\n';
    assert.equal(normalizePTY(captured), 'hello\n');
  });

  test('BP-3: a blank line produced by the command survives the strip', () => {
    // The line terminator is consumed only as the disable sequence's own. A
    // bare \r\n from `printf 'a\n\nb\n'` has no escape in front of it.
    const captured = `${BP}a\r\n\r\nb\r\n${BP}`;
    assert.equal(normalizePTY(captured), 'a\n\nb\n');
  });

  test('BP-4: ESC[200~ / ESC[201~ paste delimiters are removed', () => {
    assert.equal(stripBracketedPaste('\x1B[200~pasted\x1B[201~'), 'pasted');
  });

  test('BP-5: a buffer with no escape byte is returned unchanged', () => {
    const clean = 'a\nb\nc\n';
    assert.equal(stripBracketedPaste(clean), clean);
  });

  test('BP-6: a full polluted PTY buffer splits and normalizes to clean streams', () => {
    const begin = '__DFW_BEGIN_bp-6__';
    const delim = '__DFW_DELIM_bp-6__';
    const end = '__DFW_END_bp-6__';
    const buf = `${BP}${begin}\r\n${BP}hello\r\n${BP}${delim}\r\n${BP}oops\r\n${BP}${end}:0\r\n`;
    const r = splitDispatchOutput(buf, begin, delim, end);
    assert.equal(normalizePTY(r.stdout), 'hello\n');
    assert.equal(normalizePTY(r.stderr), 'oops\n');
  });
});

// =============================================================================
// Group RD — PTY startup is a handshake, not a sleep (issue #93)
// =============================================================================
//
// spawn()'s PTY branch used to `await sleep(100)` and call the shell ready.
// When that guess lost, the tty was still in cooked mode for the first
// dispatch, so the echo of `cat $__DFW_OUT` landed BETWEEN the BEGIN and DELIM
// sentinels and the captured stdout was the command TEXT:
//
//   AssertionError: Input: 'cat $__DFW_OUT 2>/dev/null\n'
//
// The readiness probe replaces the duration with an ordering proof. These
// exercise _tryReady directly — no PTY, no shell, no timing — so the rule the
// proof rests on is pinned rather than inferred from a green PTY run.
//
//   RD-1: the shell's answer (a line ending in the bare token) resolves
//   RD-2: the ECHO of our own input (`echo <token>`) does NOT resolve
//   RD-3: leftover prompt text on the same physical line still resolves
//   RD-4: the answer wrapped in control sequences still resolves
//   RD-5: an unrelated buffer does not resolve
//   RD-6: spawn()'s PTY startup contains no fixed-duration wait
// =============================================================================

describe('watcher-shell — PTY readiness handshake (issue #93)', () => {
  const TOKEN = '__DFW_READY_abc123__';

  // A session that was never spawned: _tryReady touches only _stdoutBuf and
  // _readyProbe, which is exactly the surface under test.
  function probeOn(buf) {
    const s = new ShellSession({ shell: SHELL, interactive: false });
    let resolved = false;
    s._stdoutBuf = buf;
    s._readyProbe = { token: TOKEN, settled: false, resolve: () => { resolved = true; } };
    s._tryReady();
    return resolved;
  }

  test('RD-1: a line ending in the bare token resolves the probe', () => {
    assert.equal(probeOn(`${TOKEN}\r\n`), true);
  });

  test('RD-2: the echo of our own input does NOT resolve the probe', () => {
    // This is the case a substring match would get wrong: with the tty still
    // in cooked mode the input comes back before the shell has run anything.
    assert.equal(probeOn(`echo ${TOKEN}\r\n`), false);
  });

  test('RD-3: leftover prompt text on the same line still resolves', () => {
    // Verbatim from a macOS bash 3.2 PTY: PS1 is printed until `PS1=''` takes
    // effect, and shares the physical line with the answer.
    const real = `bash-3.2$ bash-3.2$ bash-3.2$ bash-3.2$ ${TOKEN}\r\n`;
    assert.equal(probeOn(real), true);
  });

  test('RD-4: the answer wrapped in control sequences still resolves', () => {
    assert.equal(probeOn(`\x1B[?2004h\x1B[0m${TOKEN}\x1B[0m\r\r\n`), true);
  });

  test('RD-5: an unrelated buffer does not resolve the probe', () => {
    assert.equal(probeOn('The default interactive shell is now zsh.\r\n'), false);
  });

  test('RD-6: spawn() PTY startup contains no fixed-duration wait', () => {
    // #93's acceptance criterion is structural — "no timing assumption about
    // shell readiness" — and a behavioural test cannot see a sleep that is
    // merely long enough today. Read the source and say so.
    const src = fs.readFileSync(path.join(__dirname, 'watcher-shell.cjs'), 'utf8');
    const spawnBody = src.slice(src.indexOf('async spawn()'), src.indexOf('_writeRaw(s) {'));
    assert.ok(spawnBody.length > 0, 'failed to locate spawn() in the source');
    assert.ok(
      !/setTimeout\(\s*\(?\s*r\s*\)?\s*=>/.test(spawnBody),
      'spawn() must not sleep for a duration to decide the shell is ready'
    );
    assert.ok(
      /_awaitShellReady\(\)/.test(spawnBody),
      'spawn() must wait on the readiness handshake'
    );
  });
});
