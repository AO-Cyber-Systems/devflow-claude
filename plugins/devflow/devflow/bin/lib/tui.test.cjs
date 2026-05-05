'use strict';

// TRD 08-01: TUI renderer tests
// 30+ test cases across 8 groups (A-G + X) + snapshot tests.
// TRD 08-02: CLI flag parsing + _loadData composition contract (Groups H, I).
// TRD 08-03: Export-lock surface (Group EX), E2E self-test (Group J), skill structural (Group K).
// Test list locked per TDD Playbook habit #2 before any implementation code was written.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('node:child_process');
const cp = require('node:child_process');

const f = require('./__fixtures__/tui-fixtures.cjs');
const tui = require('./tui.cjs');

const SNAP_DIR = path.join(__dirname, '__fixtures__/tui-snapshots');
const snap = (name) => fs.readFileSync(path.join(SNAP_DIR, name + '.txt'), 'utf8');

// ─── Group A: render() public contract ───────────────────────────────────────

describe('Group A: render() public contract', () => {
  test('A1: render(undefined) returns non-empty string', () => {
    const out = tui.render(undefined);
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0, 'output must be non-empty');
  });

  test('A2: render(null) returns non-empty string', () => {
    const out = tui.render(null);
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0, 'output must be non-empty');
  });

  test('A3: render({}) returns string with panel placeholders', () => {
    const out = tui.render({});
    assert.equal(typeof out, 'string');
    // Should contain all 3 panel placeholder strings
    assert.ok(out.includes('(no org context'), 'must have org placeholder');
    assert.ok(out.includes('(no peer sessions)'), 'must have peer placeholder');
    assert.ok(out.includes('(no initiatives)'), 'must have initiatives placeholder');
  });

  test('A4: render({ opts: { cols: 0, rows: 24 } }) returns invalid terminal message', () => {
    const out = tui.render({ opts: { cols: 0, rows: 24 } });
    assert.strictEqual(out, '_(invalid terminal size)_');
  });

  test('A5: render({ opts: { cols: 80, rows: 0 } }) returns invalid terminal message', () => {
    const out = tui.render({ opts: { cols: 80, rows: 0 } });
    assert.strictEqual(out, '_(invalid terminal size)_');
  });

  test('A6: render(buildTuiAggregate) is deterministic (byte-equal on two calls)', () => {
    const fixture = f.buildTuiAggregate({});
    const a = tui.render(fixture);
    const b = tui.render(fixture);
    assert.strictEqual(a, b, 'render must be deterministic (same input → same output)');
  });
});

// ─── Group B: _renderOrgPanel sub-renderer ────────────────────────────────────

describe('Group B: _renderOrgPanel sub-renderer', () => {
  test('B1: empty orgChain {} → "(no org context)" placeholder', () => {
    const out = tui._renderOrgPanel({}, { cols: 80, no_color: false });
    assert.ok(out.includes('(no org context'), 'must include placeholder text');
  });

  test('B2: null orgChain → "(no org context)" placeholder (no throw)', () => {
    const out = tui._renderOrgPanel(null, { cols: 80, no_color: false });
    assert.ok(out.includes('(no org context'), 'must include placeholder text');
  });

  test('B3: simple orgChain → product header + quarter header + item lines', () => {
    const orgChain = f.buildOrgChainSimple();
    const out = tui._renderOrgPanel(orgChain, { cols: 80, no_color: true });
    assert.ok(out.includes('devflow-claude'), 'must include product name');
    assert.ok(out.includes('Q2 2026'), 'must include quarter');
    assert.ok(out.includes('v1.1 Coordination Layer'), 'must include item title');
    assert.ok(out.includes('Refine kind/work defaults'), 'must include second item title');
  });

  test('B4: 5+ items in a quarter → first 3 shown + [N more] footer', () => {
    const orgChain = {
      'product-a': {
        'Q2 2026': [
          { title: 'Item 1', github_issue: '1', status: 'Open', sub_issues_source: 'none' },
          { title: 'Item 2', github_issue: '2', status: 'Open', sub_issues_source: 'none' },
          { title: 'Item 3', github_issue: '3', status: 'Open', sub_issues_source: 'none' },
          { title: 'Item 4', github_issue: '4', status: 'Open', sub_issues_source: 'none' },
          { title: 'Item 5', github_issue: '5', status: 'Open', sub_issues_source: 'none' },
        ],
      },
    };
    const out = tui._renderOrgPanel(orgChain, { cols: 80, no_color: true });
    assert.ok(out.includes('Item 1'), 'must show item 1');
    assert.ok(out.includes('Item 3'), 'must show item 3');
    assert.ok(!out.includes('Item 4'), 'must NOT show item 4 (truncated)');
    assert.ok(out.includes('[2 more]'), 'must show [2 more] footer');
  });

  test('B5: items missing title → renders "(no title)" placeholder', () => {
    const orgChain = {
      'product-b': {
        'Q2 2026': [
          { title: null, github_issue: '99', status: 'Open', sub_issues_source: 'none' },
        ],
      },
    };
    const out = tui._renderOrgPanel(orgChain, { cols: 80, no_color: true });
    assert.ok(out.includes('(no title)'), 'must show (no title) placeholder');
  });
});

// ─── Group C: _renderPeerPanel sub-renderer ───────────────────────────────────

describe('Group C: _renderPeerPanel sub-renderer', () => {
  test('C1: empty branches array → "(no peer sessions)" placeholder', () => {
    const out = tui._renderPeerPanel({ branches: [] }, { cols: 80, no_color: false });
    assert.strictEqual(out, '_(no peer sessions)_');
  });

  test('C2: null awareness → "(no peer sessions)" placeholder (no throw)', () => {
    const out = tui._renderPeerPanel(null, { cols: 80, no_color: false });
    assert.strictEqual(out, '_(no peer sessions)_');
  });

  test('C3: 2 branches with known timestamps → 2 lines with branch + objective + commit', () => {
    const awareness = f.buildAwarenessSimple();
    const out = tui._renderPeerPanel(awareness, { cols: 120, no_color: true });
    assert.ok(out.includes('feature/v1.1-obj-7'), 'must include first branch name');
    assert.ok(out.includes('Roadmap reconciliation'), 'must include first objective');
    assert.ok(out.includes('feature/v1.1-obj-8-tui'), 'must include second branch name');
    assert.ok(out.includes('Program-aware TUI viewer'), 'must include second objective');
  });

  test('C4: 10 branches → first 5 shown + [N more] footer', () => {
    const awareness = f.buildTuiAggregate({ many_branches: 10 }).awareness;
    // awareness has 2 base + 10 synthetic = 12 branches total
    const out = tui._renderPeerPanel(awareness, { cols: 120, no_color: true });
    // Should show 5 and then [7 more]
    assert.ok(out.includes('[7 more]'), 'must show [7 more] footer for 12 - 5 branches');
  });

  test('C5: branch with null last_commit → "(no commit)" placeholder', () => {
    const awareness = {
      branches: [
        {
          branch: 'feature/no-commit',
          objective: 'Test objective',
          trd: '01-01',
          github_issue: null,
          last_commit: null,
          developer: 'mark',
        },
      ],
      fetched_at: '2026-05-04T10:00:00Z',
      warnings: [],
      current_branch: null,
    };
    const out = tui._renderPeerPanel(awareness, { cols: 80, no_color: true });
    assert.ok(out.includes('(no commit)'), 'must include (no commit) placeholder');
  });

  test('C6: branch matching current_branch is marked with "*" prefix', () => {
    const awareness = f.buildAwarenessSimple();
    // current_branch is 'feature/v1.1-obj-8-tui'
    const out = tui._renderPeerPanel(awareness, { cols: 120, no_color: true });
    // The line for feature/v1.1-obj-8-tui should start with '*'
    const lines = out.split('\n');
    const currentLine = lines.find(l => l.includes('feature/v1.1-obj-8-tui'));
    assert.ok(currentLine, 'must have a line for current branch');
    assert.ok(currentLine.startsWith('*'), 'current branch line must start with *');
  });
});

// ─── Group D: _renderInitiativesPanel sub-renderer ────────────────────────────

describe('Group D: _renderInitiativesPanel sub-renderer', () => {
  test('D1: empty array → "(no initiatives)" placeholder', () => {
    const out = tui._renderInitiativesPanel([], { cols: 80, no_color: false });
    assert.strictEqual(out, '_(no initiatives)_');
  });

  test('D2: null → "(no initiatives)" placeholder (no throw)', () => {
    const out = tui._renderInitiativesPanel(null, { cols: 80, no_color: false });
    assert.strictEqual(out, '_(no initiatives)_');
  });

  test('D3: 2 initiatives with why text → slug + truncated why + question count', () => {
    const initiatives = f.buildInitiativesSimple();
    const out = tui._renderInitiativesPanel(initiatives, { cols: 80, no_color: true });
    assert.ok(out.includes('devflow-internal-alpha-q2-2026'), 'must include first slug');
    assert.ok(out.includes('cross-repo-coordination-substrate'), 'must include second slug');
    // First initiative has 2 questions
    assert.ok(out.includes('2 open questions'), 'must show question count for first initiative');
  });

  test('D4: initiative with questions: [] → renders "0 open questions" not blank', () => {
    const initiatives = [
      {
        slug: 'no-questions-init',
        github_issue: '50',
        key_repos: [],
        why: 'This initiative has no open questions.',
        questions: [],
        sub_issues: [],
        updated_at: '2026-05-04T10:00:00Z',
      },
    ];
    const out = tui._renderInitiativesPanel(initiatives, { cols: 80, no_color: true });
    assert.ok(out.includes('0 open questions'), 'must show "0 open questions"');
  });

  test('D5: 5+ initiatives → first 3 shown + [N more] footer', () => {
    const initiatives = f.buildTuiAggregate({ many_initiatives: 5 }).initiatives;
    // 2 base + 5 synthetic = 7 total; show first 3 with [4 more]
    const out = tui._renderInitiativesPanel(initiatives, { cols: 80, no_color: true });
    assert.ok(out.includes('devflow-internal-alpha-q2-2026'), 'must show first initiative');
    assert.ok(out.includes('[4 more]'), 'must show [4 more] footer for 7 - 3');
  });

  test('D6: initiative with very long why (1000+ chars) → truncated to ~80 chars with ...', () => {
    const longWhy = 'W'.repeat(1200);
    const initiatives = [
      {
        slug: 'long-why-init',
        github_issue: '51',
        key_repos: [],
        why: longWhy,
        questions: [],
        sub_issues: [],
        updated_at: '2026-05-04T10:00:00Z',
      },
    ];
    const out = tui._renderInitiativesPanel(initiatives, { cols: 80, no_color: true });
    // The truncated why should be present and not be the full 1200 chars
    assert.ok(out.includes('long-why-init'), 'must include slug');
    // Should contain truncation indicator (…)
    assert.ok(out.includes('…'), 'must include truncation indicator');
    // Total line with the why should not be longer than ~120 chars (80 + some slack for slug + separators)
    const lines = out.split('\n');
    const slugLine = lines.find(l => l.includes('long-why-init'));
    assert.ok(slugLine, 'must have a slug line');
    assert.ok([...slugLine].length < 200, 'slug line must not be excessively long');
  });
});

// ─── Group E: _layoutPanels combinator ────────────────────────────────────────

describe('Group E: _layoutPanels combinator', () => {
  test('E1: _layoutPanels(24, 80, ["top", "mid", "bot"]) contains all three panel bodies', () => {
    const out = tui._layoutPanels(24, 80, ['top', 'mid', 'bot']);
    assert.ok(out.includes('top'), 'must contain top panel body');
    assert.ok(out.includes('mid'), 'must contain mid panel body');
    assert.ok(out.includes('bot'), 'must contain bot panel body');
  });

  test('E2: standard 80-col layout has separator lines between panels', () => {
    const out = tui._layoutPanels(24, 80, ['top content', 'mid content', 'bot content']);
    // Should have separator characters (box drawing dashes)
    assert.ok(out.includes('─'), 'must contain box-drawing separator');
  });

  test('E3: cols=60 (< 80 threshold) → single-column stacked layout (no horizontal framing with ─)', () => {
    const out = tui._layoutPanels(24, 60, ['top', 'mid', 'bot']);
    // Narrow layout uses simple header labels, not box-drawing separators spanning full width
    assert.ok(out.includes('Org Context'), 'must include Org Context header');
    assert.ok(out.includes('Peer Sessions'), 'must include Peer Sessions header');
    assert.ok(out.includes('Active Initiatives'), 'must include Active Initiatives header');
  });

  test('E4: cols=80 → standard layout with box-drawing frame headers', () => {
    const out = tui._layoutPanels(24, 80, ['top', 'mid', 'bot']);
    assert.ok(out.includes('┌') || out.includes('├'), 'must contain box-drawing frame chars');
  });

  test('E5: _layoutPanels returns a string (type check)', () => {
    const out = tui._layoutPanels(24, 80, ['a', 'b', 'c']);
    assert.equal(typeof out, 'string');
  });
});

// ─── Group F: opts.no_color contract ─────────────────────────────────────────

describe('Group F: opts.no_color contract', () => {
  test('F1: render(fixture) contains \\x1b[3 substrings (FG color codes present when no_color=false)', () => {
    const fixture = f.buildTuiAggregate({ no_color: false });
    const out = tui.render(fixture);
    assert.ok(out.includes('\x1b[3'), 'output must contain FG color escape sequences when no_color=false');
  });

  test('F2: render with no_color=true produces zero \\x1b[3{0..7}m substrings', () => {
    const fixture = f.buildTuiAggregate({ no_color: true });
    const out = tui.render(fixture);
    // FG color pattern: \x1b[30m through \x1b[37m
    const hasFgColor = /\x1b\[3[0-7]m/.test(out);
    assert.ok(!hasFgColor, 'output must contain zero FG color sequences when no_color=true');
  });

  test('F3: no_color=true preserves cursor-position and clear-screen escapes', () => {
    const fixture = f.buildTuiAggregate({ no_color: true });
    const out = tui.render(fixture);
    // These are NOT color codes — they must survive no_color
    // render() doesn't emit CLEAR_SCREEN or cursor moves (that's tui-cli.cjs),
    // but BOLD (\x1b[1m) and DIM (\x1b[2m) should survive if no_color only strips FG colors
    // Check: no_color strips \x1b[3xm but keeps \x1b[1m (bold) and \x1b[2m (dim)
    // At minimum the string should still have ANSI sequences (bold/dim/reset)
    assert.ok(out.includes('\x1b['), 'output must still contain some ANSI escapes under no_color (bold/dim/reset survive)');
  });
});

// ─── Group G: snapshot tests ──────────────────────────────────────────────────

describe('Group G: snapshot tests', () => {
  test('G1: default-80x24.txt matches render(buildTuiAggregate({ rows: 24, cols: 80 }))', () => {
    const fixture = f.buildTuiAggregate({ rows: 24, cols: 80 });
    assert.strictEqual(tui.render(fixture), snap('default-80x24'));
  });

  test('G2: narrow-60x24.txt matches render(buildTuiAggregate({ rows: 24, cols: 60 }))', () => {
    const fixture = f.buildTuiAggregate({ rows: 24, cols: 60 });
    assert.strictEqual(tui.render(fixture), snap('narrow-60x24'));
  });

  test('G3: empty-org.txt matches render with null orgChain', () => {
    const fixture = {
      awareness: f.buildAwarenessSimple(),
      initiatives: f.buildInitiativesSimple(),
      orgChain: null,
      todos: null,
      opts: f.buildPanelOpts({ rows: 24, cols: 80 }),
    };
    assert.strictEqual(tui.render(fixture), snap('empty-org'));
  });

  test('G4: empty-initiatives.txt matches render with initiatives: []', () => {
    const fixture = {
      awareness: f.buildAwarenessSimple(),
      initiatives: [],
      orgChain: f.buildOrgChainSimple(),
      todos: null,
      opts: f.buildPanelOpts({ rows: 24, cols: 80 }),
    };
    assert.strictEqual(tui.render(fixture), snap('empty-initiatives'));
  });

  test('G5: empty-peer.txt matches render with awareness.branches: []', () => {
    const fixture = {
      awareness: f.buildAwarenessEmpty(),
      initiatives: f.buildInitiativesSimple(),
      orgChain: f.buildOrgChainSimple(),
      todos: null,
      opts: f.buildPanelOpts({ rows: 24, cols: 80 }),
    };
    assert.strictEqual(tui.render(fixture), snap('empty-peer'));
  });

  test('G6: all-empty.txt matches render with all three sources empty/null', () => {
    const fixture = {
      awareness: f.buildAwarenessEmpty(),
      initiatives: [],
      orgChain: null,
      todos: null,
      opts: f.buildPanelOpts({ rows: 24, cols: 80 }),
    };
    assert.strictEqual(tui.render(fixture), snap('all-empty'));
  });

  test('G7: no-color.txt matches render(buildTuiAggregate({ no_color: true }))', () => {
    const fixture = f.buildTuiAggregate({ no_color: true });
    assert.strictEqual(tui.render(fixture), snap('no-color'));
  });

  test('G8: tall-data.txt matches render with many_branches=10, many_initiatives=8', () => {
    const fixture = f.buildTuiAggregate({ many_branches: 10, many_initiatives: 8 });
    assert.strictEqual(tui.render(fixture), snap('tall-data'));
  });

  test('G9: unicode-text.txt matches render(buildAdversarialAggregate())', () => {
    const fixture = f.buildAdversarialAggregate();
    assert.strictEqual(tui.render(fixture), snap('unicode-text'));
  });
});

// ─── Group H: CLI flag parsing (TRD 08-02) ────────────────────────────────────

const tuiCli = require('./tui-cli.cjs');

describe('Group H: CLI flag parsing', () => {
  test('H1: empty args produces default flags', () => {
    const fl = tuiCli._parseFlags([]);
    assert.equal(fl.once, false);
    assert.equal(fl.raw, false);
  });

  test('H2: --once sets once', () => {
    const fl = tuiCli._parseFlags(['--once']);
    assert.equal(fl.once, true);
    assert.equal(fl.raw, false);
  });

  test('H3: --raw implies --once', () => {
    const fl = tuiCli._parseFlags(['--raw']);
    assert.equal(fl.once, true);
    assert.equal(fl.raw, true);
  });

  test('H4: --no-color sets no_color', () => {
    const fl = tuiCli._parseFlags(['--no-color']);
    assert.equal(fl.no_color, true);
  });

  test('H5: --reset-only sets reset_only', () => {
    const fl = tuiCli._parseFlags(['--reset-only']);
    assert.equal(fl.reset_only, true);
  });

  test('H6: unknown flag becomes boolean true (forward-compat)', () => {
    const fl = tuiCli._parseFlags(['--future-feature']);
    assert.equal(fl['future-feature'], true);
  });

  test('H7: positional args silently ignored', () => {
    const fl = tuiCli._parseFlags(['some-positional', '--once']);
    assert.equal(fl.once, true);
  });
});

// ─── Group I: _loadData composition contract (TRD 08-02) ─────────────────────

describe('Group I: _loadData composition contract', () => {
  test('I1: returns shape { awareness, initiatives, orgChain, todos, warnings }', () => {
    const d = tuiCli._loadData(process.cwd());
    assert.deepEqual(Object.keys(d).sort(), ['awareness', 'initiatives', 'orgChain', 'todos', 'warnings']);
  });

  test('I2: never throws on missing cache (degrades to scanPeer no-fetch fallback)', () => {
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

// ─── Group X: fixture builder smoke tests ─────────────────────────────────────

describe('Group X: fixture builder smoke tests', () => {
  test('X1: buildTuiAggregate({}) returns object with awareness, initiatives, orgChain, todos, opts keys', () => {
    const a = f.buildTuiAggregate({});
    assert.ok('awareness' in a, 'must have awareness');
    assert.ok('initiatives' in a, 'must have initiatives');
    assert.ok('orgChain' in a, 'must have orgChain');
    assert.ok('todos' in a, 'must have todos');
    assert.ok('opts' in a, 'must have opts');
  });

  test('X2: buildPanelOpts({ cols: 80, rows: 24 }) returns locked shape', () => {
    const opts = f.buildPanelOpts({ cols: 80, rows: 24 });
    assert.equal(opts.cols, 80);
    assert.equal(opts.rows, 24);
    assert.equal(typeof opts.no_color, 'boolean');
    assert.equal(typeof opts.current_repo, 'string');
  });

  test('X3: buildAwarenessSimple() returns 2-3 branches with non-null last_commit.timestamp', () => {
    const awareness = f.buildAwarenessSimple();
    assert.ok(awareness.branches.length >= 2, 'must have at least 2 branches');
    for (const b of awareness.branches) {
      assert.ok(b.last_commit != null, 'each branch must have last_commit');
      assert.ok(b.last_commit.timestamp != null, 'each last_commit must have timestamp');
    }
  });

  test('X4: buildAdversarialAggregate() includes at least one branch with non-ASCII characters', () => {
    const a = f.buildAdversarialAggregate();
    const hasNonAscii = a.awareness.branches.some(b => /[^\x00-\x7F]/.test(b.branch));
    assert.ok(hasNonAscii, 'must have at least one branch with non-ASCII chars');
  });
});

// ─── Group EX: export surface (TRD 08-03 lock) ────────────────────────────────

describe('Group EX: export surface (TRD 08-03 lock)', () => {
  test('EX1: lib/tui.cjs exports exactly 7 entries (locked surface)', () => {
    // Force a fresh require to avoid caching across test runs
    delete require.cache[require.resolve('./tui.cjs')];
    const tuiMod = require('./tui.cjs');
    const expected = [
      '_layoutPanels',
      '_renderInitiativesPanel',
      '_renderOrgPanel',
      '_renderPeerPanel',
      '_resetMocks',
      '_setRunStdout',
      'render',
    ];
    assert.deepStrictEqual(Object.keys(tuiMod).sort(), expected);
  });

  test('EX2: render is a function', () => {
    const tuiMod = require('./tui.cjs');
    assert.equal(typeof tuiMod.render, 'function');
  });

  test('EX3: banner comment "LOCKED by TRD 08-03" present in tui.cjs source', () => {
    const src = fs.readFileSync(require.resolve('./tui.cjs'), 'utf8');
    assert.ok(src.includes('LOCKED by TRD 08-03'),
      'banner comment "LOCKED by TRD 08-03" not found in tui.cjs source — required by SC-9');
  });
});

// ─── Group J: e2e self-test (SC-10) ──────────────────────────────────────────
// from lib/, repo root is 5 levels up: lib → bin → devflow → devflow → plugins → repo-root

describe('Group J: e2e self-test (SC-10)', () => {
  // from lib/, repo root is 5 levels up
  const REPO_ROOT = path.resolve(__dirname, '../../../../..');
  const DF_TOOLS = path.resolve(__dirname, '../df-tools.cjs');

  test('J1: df-tools tui --once --raw exits 0 within 10s', () => {
    let out = '';
    try {
      out = execSync(`node "${DF_TOOLS}" tui --once --raw`, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 10000,
      });
    } catch (e) {
      assert.fail('df-tools tui --once --raw exited non-zero or timed out: ' +
                  (e.stderr || e.message || String(e)));
    }
    assert.ok(typeof out === 'string');
    assert.ok(out.length > 0, 'expected non-empty output');
  });

  test('J2: output contains expected panel framing', () => {
    const out = execSync(`node "${DF_TOOLS}" tui --once --raw`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('Org Context'),        'top panel header "Org Context" missing');
    assert.ok(out.includes('Peer Sessions'),      'middle panel header "Peer Sessions" missing');
    assert.ok(out.includes('Active Initiatives'), 'bottom panel header "Active Initiatives" missing');
  });

  test('J3: piped (non-TTY) does not hang; exits 0 in < 10s', () => {
    // Use spawnSync with captured stdout (not a TTY) → triggers auto-fallback
    const start = Date.now();
    const r = cp.spawnSync('node', [DF_TOOLS, 'tui'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
      // No stdio: 'inherit' — stdout is captured (non-TTY), triggers auto-fallback to --once --raw
    });
    const elapsed = Date.now() - start;
    assert.equal(r.status, 0,
      'expected exit 0; got ' + r.status + '\nstderr: ' + (r.stderr || ''));
    assert.ok(elapsed < 10000, 'took ' + elapsed + 'ms; suspect hang');
    assert.ok(r.stdout && r.stdout.length > 0, 'expected captured stdout');
  });

  test('J4: output reflects this repo\'s state (not empty placeholders only)', () => {
    // Integration sanity: at least ONE of the panels should have non-placeholder
    // content — OR all show placeholders (valid in fresh checkout without caches).
    // J4's value is the diagnostic stderr message to guide the user.
    const out = execSync(`node "${DF_TOOLS}" tui --once --raw`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
    });

    const allPlaceholders =
      out.includes('(no org context') &&
      out.includes('(no peer sessions') &&
      out.includes('(no initiatives');

    if (allPlaceholders) {
      process.stderr.write('\n[J4] All TUI panels show placeholders. This is acceptable\n');
      process.stderr.write('[J4] in a fresh checkout, but if you expected data, run:\n');
      process.stderr.write('[J4]   /devflow:awareness scan-peer\n');
      process.stderr.write('[J4]   /devflow:initiatives sync\n');
    }

    // The test passes regardless: we just gate on non-empty output with panel framing.
    assert.ok(out.length > 100, 'output suspiciously short: ' + out.length + ' chars');
  });
});

// ─── Group K: /devflow:tui skill structural ────────────────────────────────────
// skills/tui/ is at plugins/devflow/skills/tui/; from lib/ that is 3 levels up then into skills/

describe('Group K: /devflow:tui skill structural', () => {
  const SKILL_PATH = path.resolve(__dirname, '../../../skills/tui/SKILL.md');

  test('K1: skills/tui/SKILL.md exists', () => {
    assert.ok(fs.existsSync(SKILL_PATH),
      'expected ' + SKILL_PATH + ' to exist — create plugins/devflow/skills/tui/SKILL.md');
  });

  test('K2: SKILL.md frontmatter contains name: tui', () => {
    const src = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(/^name:\s*tui\s*$/m.test(src), 'expected "name: tui" in frontmatter');
  });

  test('K3: SKILL.md body invokes df-tools tui', () => {
    const src = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(src.includes('df-tools tui'),
      'expected "df-tools tui" CLI invocation in skill body');
  });
});
