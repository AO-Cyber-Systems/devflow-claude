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
    if (a === '--once')           flags.once = true;
    else if (a === '--raw')       { flags.raw = true; flags.once = true; }  // --raw implies --once
    else if (a === '--no-color')  flags.no_color = true;
    else if (a === '--reset-only') flags.reset_only = true;
    else if (a.startsWith('--')) {
      // forward-compat: unknown flag becomes boolean true; not an error
      flags[a.slice(2)] = true;
    }
    // positional args silently ignored
  }
  return flags;
}

// ─── Data loader (testable seam) ─────────────────────────────────────────────

function _loadData(cwd) {
  let awareness = null, orgChain = null, inits = [];
  const warnings = [];

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
      process.stdout.write('\x1b[H\x1b[2J');   // home + clear screen
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
      if (ch === 'q' || ch === 'Q')    { _cleanup(); process.exit(0); }
      else if (ch === 'r' || ch === 'R') { _renderOnce(); }
      else if (ch === '\x03')            { _cleanup(); process.exit(130); }  // Ctrl-C
      // Other keys: ignored (locked decision #6: r/q only in v1.1)
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
    flags.once = true;
    flags.raw = true;
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
  // Cleanup hook exposed for tests:
  _cleanup,
  // runTui alias for must_haves compliance (runTui = interactive session runner):
  runTui: _runInteractive,
};
