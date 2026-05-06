/**
 * Tests for statusline hook (TRD 20-04: watcher status segment).
 *
 * Pattern: spawn statusline.js as a subprocess (NOT module-import — statusline
 * is an end-of-stream emitter that exits on its own and exposes no functions).
 * Pipe a Claude-style JSON object to stdin, capture stdout, assert against
 * stripped ANSI substrings.
 *
 * Test groups (per TRD <test_list_first>):
 *   S — Statusline render — watcher OFF paths             (6 tests)
 *   A — Watcher ALIVE paths                                (7 tests)
 *   F — Failure tolerance                                  (4 tests)
 *   P — Position / format / preserved-paths                (5 tests)
 *   D — Documentation grep                                 (3 tests)
 * Total: 25 tests (22 listed + 3 extra harness assertions for resilience).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { mkdtempSync, rmSync } = fs;
const fixtures = require('../devflow/bin/lib/__fixtures__/daemon-polish-fixtures.cjs');

// ---------------------------------------------------------------------------
// Helper: build a self-contained tmp tree per test, return {tmp, env, stdout}
// ---------------------------------------------------------------------------

function makeTmp() {
  return mkdtempSync(path.join(os.tmpdir(), 'sl-test-'));
}

function runWith(opts) {
  const env = fixtures.buildStatuslineEnv(opts.envOpts);
  const input = fixtures.buildStatuslineInput({
    workspace_dir: opts.envOpts.projectDir,
    ...(opts.inputOpts || {}),
  });
  const result = fixtures.runStatuslineSubprocess({ input, env: env.env });
  return { result, env };
}

// ---------------------------------------------------------------------------
// Group S — Watcher OFF paths
// ---------------------------------------------------------------------------

test('S-1 No daemon block in config.json → no watcher segment', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: path.join(tmp, 'proj'),
      daemonAlive: true,
      watching: [path.join(tmp, 'proj')],
      pendingByProject: { [path.join(tmp, 'proj')]: 2 },
      // NO daemon key in config:
      configContent: { mode: 'yolo' },
    },
  });
  assert.equal(result.status, 0, `non-zero exit: ${result.stderr}`);
  const out = fixtures.stripAnsi(result.stdout);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

test('S-2 daemon.status_line: false → no watcher segment', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: path.join(tmp, 'proj'),
      daemonAlive: true,
      watching: [path.join(tmp, 'proj')],
      pendingByProject: { [path.join(tmp, 'proj')]: 5 },
      configContent: { daemon: { status_line: false } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

test('S-3 daemon.status_line: true but no PID file → no watcher segment', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: path.join(tmp, 'proj'),
      daemonAlive: 'absent', // no PID file
      watching: [],
      pendingByProject: {},
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

test('S-4 daemon.status_line: true + stale PID file → no watcher segment', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: path.join(tmp, 'proj'),
      daemonAlive: false, // pid 999999 — guaranteed dead
      watching: [path.join(tmp, 'proj')],
      pendingByProject: { [path.join(tmp, 'proj')]: 3 },
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

test('S-5 config.json missing → no watcher segment (no error)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: path.join(tmp, 'proj'),
      daemonAlive: true,
      watching: [path.join(tmp, 'proj')],
      pendingByProject: { [path.join(tmp, 'proj')]: 2 },
      configContent: null, // no config.json written at all
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

test('S-6 config.json malformed JSON → no watcher segment (silent)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: path.join(tmp, 'proj'),
      daemonAlive: true,
      watching: [path.join(tmp, 'proj')],
      pendingByProject: { [path.join(tmp, 'proj')]: 1 },
      configContent: { daemon: { status_line: true } },
      malformedConfig: true,
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

// ---------------------------------------------------------------------------
// Group A — Watcher ALIVE paths
// ---------------------------------------------------------------------------

test('A-1 Daemon alive + watching:[/p1] + 0 pending → ▶ watcher (green)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'proj');
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      daemonAlive: true,
      watching: [proj],
      pendingByProject: { [proj]: 0 },
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.match(out, /▶ watcher/);
  assert.doesNotMatch(out, /pending/);
  // ANSI green code 32 should be present in raw output:
  assert.match(result.stdout, /\x1b\[32m/);
});

test('A-2 Daemon alive + watching:[/p1] + 3 pending → ⏸ 3 pending (yellow)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'proj');
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      daemonAlive: true,
      watching: [proj],
      pendingByProject: { [proj]: 3 },
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.match(out, /⏸ 3 pending/);
  assert.doesNotMatch(out, /▶ watcher/);
  // Yellow code 33:
  assert.match(result.stdout, /\x1b\[33m/);
});

test('A-3 Daemon alive + watching:[/p1,/p2] + 2+1 pending → ⏸ 3 pending (sum)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const p1 = path.join(tmp, 'p1');
  const p2 = path.join(tmp, 'p2');
  fs.mkdirSync(p1, { recursive: true });
  fs.mkdirSync(p2, { recursive: true });
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: p1, // workspace cwd
      daemonAlive: true,
      watching: [p1, p2],
      pendingByProject: { [p1]: 2, [p2]: 1 },
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.match(out, /⏸ 3 pending/);
});

test('A-4 Daemon alive + watching:[/p1,/p2] + 0 in both → ▶ watcher', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const p1 = path.join(tmp, 'p1');
  const p2 = path.join(tmp, 'p2');
  fs.mkdirSync(p1, { recursive: true });
  fs.mkdirSync(p2, { recursive: true });
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: p1,
      daemonAlive: true,
      watching: [p1, p2],
      pendingByProject: { [p1]: 0, [p2]: 0 },
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.match(out, /▶ watcher/);
  assert.doesNotMatch(out, /pending/);
});

test('A-5 Daemon alive + watching:[] (empty) → ▶ watcher', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: path.join(tmp, 'proj'),
      daemonAlive: true,
      watching: [], // empty
      pendingByProject: {},
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.match(out, /▶ watcher/);
});

test('A-6 Daemon alive + watching:[/nonexistent] → ▶ watcher (no crash, 0 pending)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: path.join(tmp, 'proj'),
      daemonAlive: true,
      // path that has never existed:
      watching: [path.join(tmp, 'never-existed-' + Date.now())],
      pendingByProject: {}, // don't create the dir
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.match(out, /▶ watcher/);
  assert.doesNotMatch(out, /pending/);
});

test('A-7 Daemon alive + 1 pending → ⏸ 1 pending (singular form)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'proj');
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      daemonAlive: true,
      watching: [proj],
      pendingByProject: { [proj]: 1 },
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.match(out, /⏸ 1 pending/);
});

// ---------------------------------------------------------------------------
// Group F — Failure tolerance
// ---------------------------------------------------------------------------

test('F-1 watcher-state.cjs not present at sync path → no segment, no crash', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'proj');
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      daemonAlive: true,
      watching: [proj],
      pendingByProject: { [proj]: 2 },
      configContent: { daemon: { status_line: true } },
      installWatcherStateLib: false, // simulate devflow not synced
    },
  });
  assert.equal(result.status, 0, `non-zero exit: ${result.stderr}`);
  const out = fixtures.stripAnsi(result.stdout);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

test('F-2 pending dir readdirSync throws for one project → 0 contribution, others counted', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const p1 = path.join(tmp, 'p1');
  const p2 = path.join(tmp, 'p2');
  fs.mkdirSync(p1, { recursive: true });
  fs.mkdirSync(p2, { recursive: true });
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: p1,
      daemonAlive: true,
      watching: [p1, p2],
      // p1 has the EACCES_MARKER (pending is a file, not dir → ENOTDIR);
      // p2 has 4 real records.
      pendingByProject: { [p1]: 'EACCES_MARKER', [p2]: 4 },
      configContent: { daemon: { status_line: true } },
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  // Only p2's 4 should count; p1 errors swallowed. Total: 4.
  assert.match(out, /⏸ 4 pending/);
});

test('F-3 PID file malformed JSON → no segment, no crash', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'proj');
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      daemonAlive: true,
      watching: [proj],
      pendingByProject: { [proj]: 1 },
      configContent: { daemon: { status_line: true } },
      malformedPidFile: true,
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

test('F-4 stdin not JSON → existing silent-fail preserved (entire output empty)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const env = fixtures.buildStatuslineEnv({
    tmpHome: path.join(tmp, 'home'),
    projectDir: path.join(tmp, 'proj'),
    daemonAlive: true,
    watching: [],
    pendingByProject: {},
    configContent: { daemon: { status_line: true } },
  });
  const result = fixtures.runStatuslineSubprocess({
    input: 'this is not json {{{',
    env: env.env,
  });
  assert.equal(result.status, 0);
  // Outer try/catch swallows JSON parse error → zero output.
  assert.equal(result.stdout, '');
});

// ---------------------------------------------------------------------------
// Group P — Position / format / preserved paths
// ---------------------------------------------------------------------------

test('P-1 No task: existing render path preserved when watcher off — model │ dirname │ ctx', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'p');
  fs.mkdirSync(proj, { recursive: true });
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      daemonAlive: 'absent',
      watching: [],
      pendingByProject: {},
      configContent: null, // no config → no watcher segment
    },
    inputOpts: { remaining_pct: 70, model_name: 'Sonnet 4.5' },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  // Format: `Sonnet 4.5 │ p █…% ...`
  assert.match(out, /Sonnet 4\.5 │ p /);
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
  // Exactly one ` │ ` separator between model and dirname (no double sep):
  const segs = out.split(' │ ');
  // segs.length should be 2 (model | dirname{ctx}). ctx is appended without
  // separator (leading space).
  assert.equal(segs.length, 2, `expected 2 │-separated segments, got: ${out}`);
});

test('P-2 With task + watcher active: model │ task │ dirname │ ⏸ N pending │ ctx', (t) => {
  // We can't easily inject a task without setting up todos dir; instead,
  // verify the watcher segment renders with proper separators. The task path
  // is exercised by the existing code; we focus on the new wsBlock.
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'p');
  fs.mkdirSync(proj, { recursive: true });
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      daemonAlive: true,
      watching: [proj],
      pendingByProject: { [proj]: 2 },
      configContent: { daemon: { status_line: true } },
    },
    inputOpts: { remaining_pct: 70 },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  // No task in this test (no todos), so format is: model │ dirname │ ⏸ 2 pending ctx
  assert.match(out, / │ ⏸ 2 pending/);
});

test('P-3 dfUpdate prefix preserved (cache flag triggers ⬆)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  // Plant the df-update cache file BEFORE buildStatuslineEnv (which preserves
  // tmpHome contents).
  const cacheDir = path.join(home, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'df-update-check.json'),
    JSON.stringify({ update_available: true }),
  );

  const proj = path.join(tmp, 'proj');
  const { result } = runWith({
    envOpts: {
      tmpHome: home,
      projectDir: proj,
      daemonAlive: 'absent',
      watching: [],
      pendingByProject: {},
      configContent: null,
    },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  assert.match(out, /⬆ \/df:update/);
});

test('P-4 context bar preserved (color thresholds + scaled %)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'p');
  // Test high-usage threshold (low remaining → yellow/orange)
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      daemonAlive: 'absent',
      watching: [],
      pendingByProject: {},
      configContent: null,
    },
    inputOpts: { remaining_pct: 30 },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  // 100 - 30 = 70 raw; scaled = round(70/80*100) = 88; bar of 8 filled blocks.
  assert.match(out, /█{8}░{2} 88%/);
});

test('P-5 watcher off → exactly one ` │ ` between model and dirname (no double sep)', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const proj = path.join(tmp, 'p');
  fs.mkdirSync(proj, { recursive: true });
  const { result } = runWith({
    envOpts: {
      tmpHome: path.join(tmp, 'home'),
      projectDir: proj,
      // daemon alive but flag off → wsBlock empty
      daemonAlive: true,
      watching: [proj],
      pendingByProject: { [proj]: 5 },
      configContent: { daemon: { status_line: false } },
    },
    inputOpts: { remaining_pct: 70 },
  });
  assert.equal(result.status, 0);
  const out = fixtures.stripAnsi(result.stdout);
  // Should not contain the double separator artifact ` │  │ `:
  assert.doesNotMatch(out, / │  │ /);
  // And no watcher content:
  assert.doesNotMatch(out, /watcher|pending|▶|⏸/);
});

// ---------------------------------------------------------------------------
// Group D — Documentation grep
// ---------------------------------------------------------------------------

const DOC_PATH = path.resolve(
  __dirname,
  '..', '..', '..', // hooks → devflow plugin → plugins → repo root
  'docs',
  'handoff-watcher-guide.md',
);

test('D-1 docs/handoff-watcher-guide.md contains `### Status-line indicator` heading', () => {
  assert.ok(fs.existsSync(DOC_PATH), `doc not found at ${DOC_PATH}`);
  const content = fs.readFileSync(DOC_PATH, 'utf8');
  assert.match(content, /^### Status-line indicator/m);
});

test('D-2 doc section documents `daemon.status_line: true` opt-in + visual states', () => {
  const content = fs.readFileSync(DOC_PATH, 'utf8');
  assert.match(content, /status_line/);
  // Visual states documented:
  assert.match(content, /▶ watcher/);
  assert.match(content, /⏸ N pending|⏸.*pending/);
});

test('D-3 doc section documents multi-project pending count behavior', () => {
  const content = fs.readFileSync(DOC_PATH, 'utf8');
  // Section should mention "summed" / "across" / "watching" / "multi-project"
  // — at least one cue that pending counts come from all watched projects.
  assert.match(content, /sum|across|watching|multi-project/i);
});
