'use strict';

// ─── 08-01: ANSI helpers ──────────────────────────────────────────────────────
// Determinism contract: render() is a PURE function.
//   - No Date.now(), no Math.random(), no env reads, no process.stdout.columns.
//   - All variability comes through opts.
//   - Output normalization: LF-only (\n), no trailing whitespace on lines.

const ESC = '\x1b';
const RESET = ESC + '[0m';
const BOLD = ESC + '[1m';
const DIM = ESC + '[2m';

/** Return FG color escape, or '' when no_color is set. */
function _color(n, no_color) {
  return no_color ? '' : ESC + '[3' + n + 'm';
}

/**
 * Sanitize a user-supplied string:
 *   - Coerces to string
 *   - Replaces ESC bytes (0x1b) with '?' — prevents ANSI injection from user data
 *   - Collapses embedded newlines to a single space
 */
function _sanitize(s) {
  if (s == null) return '';
  return String(s).replace(/\x1b/g, '?').replace(/[\r\n]+/g, ' ');
}

/**
 * Truncate a string to at most n code points (emoji-safe).
 * Uses '…' (U+2026) as the truncation indicator.
 */
function _truncate(s, n) {
  const arr = [...s]; // code-point safe; handles emoji + CJK
  if (arr.length <= n) return s;
  return arr.slice(0, n - 1).join('') + '…';
}

// Thresholds
const NARROW_THRESHOLD = 80;  // cols < 80 → single-column stacked layout
const PANEL_TRUNCATE_LIMIT = 5;  // peer branches shown per panel
const ORG_TRUNCATE_LIMIT = 3;    // org items per quarter + initiatives shown

// ─── 08-01: Sub-renderers ─────────────────────────────────────────────────────

/**
 * Render the Org Context panel.
 * @param {object|null} orgChain - Product×Quarter map from aggregateOrgByProductQuarter
 * @param {object} opts - { cols, no_color }
 * @returns {string}
 */
function _renderOrgPanel(orgChain, opts) {
  const nc = opts.no_color;
  const safe = (orgChain && typeof orgChain === 'object' && !Array.isArray(orgChain)) ? orgChain : null;
  const products = safe ? Object.keys(safe) : [];

  if (!safe || products.length === 0) {
    return '_(no org context — run /devflow:awareness)_';
  }

  const lines = [];
  for (const product of products) {
    lines.push(_color(6, nc) + BOLD + _sanitize(product) + RESET);
    const quarters = Object.keys(safe[product] || {});
    for (const quarter of quarters) {
      const items = Array.isArray(safe[product][quarter]) ? safe[product][quarter] : [];
      lines.push('  ' + DIM + _sanitize(quarter) + RESET);
      const shown = items.slice(0, ORG_TRUNCATE_LIMIT);
      for (const item of shown) {
        const rawTitle = item.title != null ? _sanitize(item.title) : '';
        const title = _truncate(rawTitle || '(no title)', Math.max(opts.cols - 10, 10));
        const issue = item.github_issue ? '#' + item.github_issue : '';
        lines.push('    ' + title + (issue ? ' ' + DIM + issue + RESET : ''));
      }
      if (items.length > ORG_TRUNCATE_LIMIT) {
        lines.push('    ' + DIM + '[' + (items.length - ORG_TRUNCATE_LIMIT) + ' more]' + RESET);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Render the Peer Sessions panel.
 * @param {object|null} awareness - from scanPeer; contains .branches array
 * @param {object} opts - { cols, no_color }
 * @returns {string}
 */
function _renderPeerPanel(awareness, opts) {
  const nc = opts.no_color;
  const branches = (awareness && Array.isArray(awareness.branches)) ? awareness.branches : [];

  if (branches.length === 0) {
    return '_(no peer sessions)_';
  }

  const current = (awareness && awareness.current_branch) ? awareness.current_branch : null;
  const lines = [];
  const shown = branches.slice(0, PANEL_TRUNCATE_LIMIT);

  for (const b of shown) {
    const star = (b.branch === current) ? '*' : ' ';
    const commitSubj = (b.last_commit && b.last_commit.subject)
      ? _sanitize(b.last_commit.subject)
      : '(no commit)';
    const ts = (b.last_commit && b.last_commit.timestamp)
      ? _sanitize(b.last_commit.timestamp)
      : '';
    const branchStr = BOLD + _sanitize(b.branch) + RESET;
    const objStr = _sanitize(b.objective || '(no objective)');
    const metaStr = DIM + '· ' + commitSubj + (ts ? ' (' + ts + ')' : '') + RESET;
    const fullLine = star + ' ' + branchStr + ' — ' + objStr + ' ' + metaStr;
    lines.push(_truncate(fullLine, opts.cols - 2));
  }

  if (branches.length > PANEL_TRUNCATE_LIMIT) {
    lines.push(DIM + '[' + (branches.length - PANEL_TRUNCATE_LIMIT) + ' more]' + RESET);
  }

  return lines.join('\n');
}

/**
 * Render the Active Initiatives panel.
 * @param {Array|null} initiatives - from loadInitiatives
 * @param {object} opts - { cols, no_color }
 * @returns {string}
 */
function _renderInitiativesPanel(initiatives, opts) {
  const nc = opts.no_color;
  const arr = Array.isArray(initiatives) ? initiatives : [];

  if (arr.length === 0) {
    return '_(no initiatives)_';
  }

  const lines = [];
  const shown = arr.slice(0, ORG_TRUNCATE_LIMIT);

  for (const init of shown) {
    const slug = _sanitize(init.slug) || '(no slug)';
    // Truncate why: take first sentence (split on sentence-ending punctuation followed by space),
    // then cap at 80 code points to keep lines manageable.
    let why = '';
    if (init.why) {
      const sanitizedWhy = _sanitize(init.why);
      // Split on sentence-ending punctuation followed by whitespace; take first segment
      const firstSentence = sanitizedWhy.split(/[.!?]\s/)[0] || sanitizedWhy;
      why = _truncate(firstSentence, 80);
    }
    const qcount = (init.questions && Array.isArray(init.questions)) ? init.questions.length : 0;
    const qStr = qcount === 1 ? '1 open question' : qcount + ' open questions';

    lines.push(BOLD + slug + RESET + (why ? ' — ' + why : ''));
    lines.push('  ' + DIM + qStr + RESET);
  }

  if (arr.length > ORG_TRUNCATE_LIMIT) {
    lines.push(DIM + '[' + (arr.length - ORG_TRUNCATE_LIMIT) + ' more]' + RESET);
  }

  return lines.join('\n');
}

// ─── 08-01: Layout combinator ─────────────────────────────────────────────────

/**
 * Combine three panel strings into a final ANSI frame.
 *
 * When cols < NARROW_THRESHOLD (80): single-column stacked layout with simple
 * section headers (no horizontal box-drawing frame spanning full width).
 *
 * When cols >= NARROW_THRESHOLD: standard layout with box-drawing frame.
 *
 * @param {number} rows - terminal row count
 * @param {number} cols - terminal column count
 * @param {string[]} panels - [top, mid, bot] panel body strings
 * @returns {string}
 */
function _layoutPanels(rows, cols, panels) {
  if (rows < 1 || cols < 1) return '_(invalid terminal size)_';

  const [top, mid, bot] = panels;
  const narrow = cols < NARROW_THRESHOLD;

  if (narrow) {
    // Single-column stacked layout — simple section headers
    return [
      BOLD + '── Org Context ──' + RESET,
      top,
      '',
      BOLD + '── Peer Sessions ──' + RESET,
      mid,
      '',
      BOLD + '── Active Initiatives ──' + RESET,
      bot,
    ].join('\n');
  }

  // Standard 80+-col layout: box-drawing frame with panel headers
  // Build separator line: dashes to fill remaining width after label
  const dashLine = (label) => {
    const dashCount = Math.max(cols - label.length - 2, 1);
    return '─'.repeat(dashCount);
  };

  return [
    BOLD + '┌─ Org Context ' + dashLine('┌─ Org Context ') + RESET,
    top,
    BOLD + '├─ Peer Sessions ' + dashLine('├─ Peer Sessions ') + RESET,
    mid,
    BOLD + '├─ Active Initiatives ' + dashLine('├─ Active Initiatives ') + RESET,
    bot,
    BOLD + '└' + '─'.repeat(Math.max(cols - 1, 1)) + RESET,
  ].join('\n');
}

// ─── 08-01: Public renderer ───────────────────────────────────────────────────

/**
 * Render the full TUI view.
 *
 * Pure function — no I/O, no Date.now(), no env reads, no process.stdout access.
 * Every variable comes from the input aggregate.
 *
 * @param {object|null|undefined} input - { awareness, initiatives, orgChain, todos, opts }
 * @returns {string} ANSI-formatted terminal string
 */
function render(input) {
  // Defensive top-level coercion (Groups A1-A3)
  const safe = (input != null && typeof input === 'object') ? input : {};
  const rawOpts = (safe.opts && typeof safe.opts === 'object') ? safe.opts : {};

  const rows = Number.isFinite(rawOpts.rows) && rawOpts.rows > 0 ? rawOpts.rows : 24;
  const cols = Number.isFinite(rawOpts.cols) && rawOpts.cols > 0 ? rawOpts.cols : 80;

  // Validate terminal size (Groups A4-A5)
  if (!Number.isFinite(rawOpts.rows) || rawOpts.rows < 1) {
    if (safe.opts && Object.prototype.hasOwnProperty.call(safe.opts, 'rows') && rawOpts.rows < 1) {
      return '_(invalid terminal size)_';
    }
  }
  if (!Number.isFinite(rawOpts.cols) || rawOpts.cols < 1) {
    if (safe.opts && Object.prototype.hasOwnProperty.call(safe.opts, 'cols') && rawOpts.cols < 1) {
      return '_(invalid terminal size)_';
    }
  }

  const renderOpts = {
    rows,
    cols,
    no_color: !!rawOpts.no_color,
    current_repo: rawOpts.current_repo || '',
  };

  const top = _renderOrgPanel(safe.orgChain != null ? safe.orgChain : null, renderOpts);
  const mid = _renderPeerPanel(safe.awareness != null ? safe.awareness : null, renderOpts);
  const bot = _renderInitiativesPanel(safe.initiatives != null ? safe.initiatives : null, renderOpts);

  return _layoutPanels(rows, cols, [top, mid, bot]);
}

// ─── 08-01: Test hooks (for CLI wiring in TRD 08-02) ─────────────────────────

let _runStdout = (s) => process.stdout.write(s);

function _setRunStdout(fn) {
  _runStdout = (fn != null) ? fn : ((s) => process.stdout.write(s));
}

function _resetMocks() {
  _runStdout = (s) => process.stdout.write(s);
}

// ─── 08-01: Exports (surface locked in TRD 08-03) ────────────────────────────

module.exports = {
  render,
  _renderOrgPanel,
  _renderPeerPanel,
  _renderInitiativesPanel,
  _layoutPanels,
  _setRunStdout,
  _resetMocks,
};
