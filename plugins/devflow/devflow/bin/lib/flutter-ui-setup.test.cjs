'use strict';

/**
 * Paired tests for flutter-ui-setup.cjs (TRD 10-09).
 *
 * Per ~/.claude/CLAUDE.md TDD Playbook:
 *  - habit 4: hand-built fixture builders, no LLM-generated test data
 *  - habit 5: outside-in — subprocess invocation tests at the integration layer,
 *    plus module unit tests for the pure helpers
 *  - habit 3: one test at a time (RED→GREEN), atomic commits per case
 *
 * Fixture builders live at the top; behavior tests follow.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  detectMissingTools,
  buildInstallPlan,
  dispatchInstalls,
  detectFlutterRepo,
  // cmdFlutterUISetup — exercised via subprocess in integration tests below
} = require('./flutter-ui-setup.cjs');

const { validateInputsSchema } = require('./handoff.cjs');

// ───── Fixture builders (hand-built; no LLM-generated data) ──────────────────

/**
 * Create a temp PATH directory containing executable shims for each tool whose
 * value is `true`. Returns the absolute path of the temp dir.
 *
 * Example: buildFakePATH({ jq: true, maestro: false, chromedriver: true }) creates a
 * tmpdir with `jq` and `chromedriver` files (each chmod 0o755). `maestro` is omitted.
 */
function buildFakePATH(tools) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-PATH-'));
  for (const [name, present] of Object.entries(tools)) {
    if (!present) continue;
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(filePath, 0o755);
  }
  return dir;
}

/**
 * Create an empty `.devflow-handoff/{pending,done}/` subtree under tmpdir.
 * Returns { root, pending, done } absolute paths.
 */
function buildHandoffPendingDir(tmpdir) {
  const root = path.join(tmpdir, '.devflow-handoff');
  const pending = path.join(root, 'pending');
  const done = path.join(root, 'done');
  fs.mkdirSync(pending, { recursive: true });
  fs.mkdirSync(done, { recursive: true });
  return { root, pending, done };
}

/**
 * Build a temp Flutter-shaped project root with optional pubspec/integration_test/
 * .maestro/marker. Mirror of flutter-ui-bootstrap.test.cjs::makeProject.
 *
 * opts:
 *   pubspecHasIntegrationTest — when truthy, writes pubspec.yaml with the dep;
 *                                when falsy-but-defined, writes pubspec.yaml without it;
 *                                when omitted, no pubspec.yaml is written.
 *   hasIntegrationTestDir, hasMaestroDir, hasMarker — booleans (default false).
 */
function buildBootstrapTarget(tmpdir, opts) {
  const o = opts || {};
  const root = fs.mkdtempSync(path.join(tmpdir, 'flutter-ui-setup-target-'));
  if (o.pubspecHasIntegrationTest !== undefined) {
    fs.writeFileSync(
      path.join(root, 'pubspec.yaml'),
      o.pubspecHasIntegrationTest
        ? 'name: x\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n  integration_test:\n    sdk: flutter\n'
        : 'name: x\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n'
    );
  }
  if (o.hasIntegrationTestDir) fs.mkdirSync(path.join(root, 'integration_test'), { recursive: true });
  if (o.hasMaestroDir) fs.mkdirSync(path.join(root, '.maestro'), { recursive: true });
  if (o.hasMarker) {
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning', '.flutter-ui-bootstrap-done'), '');
  }
  return root;
}

/**
 * Build a directory tree that exercises Flutter-repo detection. Each opt is
 * independent so tests can build precisely the failure case they need.
 *
 *   pubspec        : 'flutter' | 'plain' | 'absent'  — pubspec.yaml shape
 *   libDir         : boolean                          — create lib/ as a dir
 *   flutterVersion : string | null                    — environment.flutter constraint (e.g. '>=3.16.0', '>=3.0.0')
 */
function buildFlutterRepoFixture(tmpdir, opts) {
  const o = opts || {};
  const root = fs.mkdtempSync(path.join(tmpdir, 'flutter-repo-fixture-'));
  if (o.pubspec === 'flutter') {
    const versionLine = o.flutterVersion === null
      ? ''
      : `environment:\n  sdk: ">=3.2.0 <4.0.0"\n  flutter: "${o.flutterVersion || '>=3.16.0'}"\n`;
    fs.writeFileSync(
      path.join(root, 'pubspec.yaml'),
      `name: test_repo\n${versionLine}dependencies:\n  flutter:\n    sdk: flutter\n`
    );
  } else if (o.pubspec === 'plain') {
    // pubspec exists but has NO flutter SDK dep — dart-only package
    fs.writeFileSync(
      path.join(root, 'pubspec.yaml'),
      'name: pure_dart\nenvironment:\n  sdk: ">=3.2.0 <4.0.0"\ndependencies:\n  http: ^1.0.0\n'
    );
  } // 'absent' → no pubspec written
  if (o.libDir) fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  return root;
}

/**
 * Write a fake devflow-watch PID file inside the given temp HOME.
 *
 *   live=true  → pid points at the current test process (process.kill(pid,0) succeeds)
 *   live=false → pid points at 999999 (unlikely to exist; process.kill throws)
 *
 * Returns the absolute path of the pid file.
 */
function buildFakePidFile(tmpHome, opts) {
  const o = opts || {};
  const pid = o.live ? process.pid : 999999;
  const dir = path.join(tmpHome, '.devflow');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'devflow-watch.pid');
  const payload = {
    pid,
    version: '0.0.0-test',
    shell: null,
    watching: [],
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

// ───── Behavior tests ────────────────────────────────────────────────────────

test.describe('detectMissingTools (TRD 10-09 cases 1-2)', () => {

  test('Case 1 — detector-jq-missing: only jq absent → result includes jq, excludes maestro+chromedriver', () => {
    const pathDir = buildFakePATH({ jq: false, maestro: true, chromedriver: true });
    const missing = detectMissingTools({ pathDir });
    assert.ok(Array.isArray(missing), 'missing must be an array');
    assert.ok(missing.includes('jq'), `expected missing to include 'jq'; got ${JSON.stringify(missing)}`);
    assert.ok(!missing.includes('maestro'), `did not expect 'maestro' in missing; got ${JSON.stringify(missing)}`);
    assert.ok(!missing.includes('chromedriver'), `did not expect 'chromedriver' in missing; got ${JSON.stringify(missing)}`);
  });

  test('Case 2 — detector-all-present: all 3 tools present → empty array', () => {
    const pathDir = buildFakePATH({ jq: true, maestro: true, chromedriver: true });
    const missing = detectMissingTools({ pathDir });
    assert.deepStrictEqual(missing, []);
  });

  test('Case 1c — detector-maestro-missing: only maestro absent → result includes maestro', () => {
    const pathDir = buildFakePATH({ jq: true, maestro: false, chromedriver: true });
    const missing = detectMissingTools({ pathDir });
    assert.deepStrictEqual(missing, ['maestro']);
  });

});

test.describe('buildInstallPlan (TRD 10-09 cases 3-4)', () => {

  test("Case 3 — plan-darwin-brew: missing jq on darwin → ['brew install jq'] in input order", () => {
    const plan = buildInstallPlan({ missing: ['jq'], platform: 'darwin' });
    assert.ok(Array.isArray(plan), 'plan must be an array');
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0], 'brew install jq');
  });

  test("Case 3b — plan-darwin-brew: chromedriver on darwin uses --cask flag", () => {
    const plan = buildInstallPlan({ missing: ['chromedriver'], platform: 'darwin' });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0], 'brew install --cask chromedriver');
  });

  test("Case 3c — plan-darwin-maestro: maestro on darwin uses curl installer (no brew formula or cask)", () => {
    const plan = buildInstallPlan({ missing: ['maestro'], platform: 'darwin' });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0], 'curl -fsSL "https://get.maestro.mobile.dev" | bash');
  });

  test("Case 4 — plan-linux-apt: missing jq on linux → 'sudo apt-get install -y jq', input order preserved", () => {
    const plan = buildInstallPlan({ missing: ['jq'], platform: 'linux' });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0], 'sudo apt-get install -y jq');
  });

  test("Case 4c — plan-linux-maestro: maestro on linux uses the same curl installer (platform-agnostic)", () => {
    const plan = buildInstallPlan({ missing: ['maestro'], platform: 'linux' });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0], 'curl -fsSL "https://get.maestro.mobile.dev" | bash');
  });

  test("Case 4b — empty missing → empty plan, any platform", () => {
    assert.deepStrictEqual(buildInstallPlan({ missing: [], platform: 'darwin' }), []);
    assert.deepStrictEqual(buildInstallPlan({ missing: [], platform: 'linux' }), []);
  });

});

// ───── Integration test helpers (subprocess invocation) ─────────────────────

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

/**
 * Spawn `node df-tools.cjs flutter-ui setup [...args]` as a fresh subprocess.
 * Controls HOME (for PID-file resolution) and PATH (for tool detection).
 *
 * opts:
 *   home    — value to set as HOME env var (default: a brand-new empty tmpdir)
 *   pathDir — single PATH entry (default: a brand-new empty tmpdir — no tools)
 *   cwd     — working directory for the subprocess (default: tmpEmpty)
 *   extraArgs — additional CLI args after 'flutter-ui setup'
 *   stdinClosed — when true, set stdio:'pipe' and immediately end stdin
 */
function spawnSetup(opts) {
  const o = opts || {};
  const tmpHome = o.home || fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-HOME-'));
  const tmpPath = o.pathDir || buildFakePATH({}); // empty PATH → all tools missing
  const cwd = o.cwd || tmpHome;
  const args = ['flutter-ui', 'setup', ...(o.extraArgs || [])];
  const env = {
    ...process.env,
    HOME: tmpHome,
    PATH: tmpPath,
    // Watcher-state honors DEVFLOW_HANDOFF_PID_FILE override; clear it so HOME-derived path wins.
    DEVFLOW_HANDOFF_PID_FILE: '',
  };
  const result = spawnSync(process.execPath, [DF_TOOLS, ...args], {
    cwd,
    env,
    encoding: 'utf-8',
    stdio: o.stdinClosed ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    input: o.stdinClosed ? '' : undefined,
    timeout: 10000,
  });
  return result;
}

test.describe('dispatchInstalls (TRD 10-09 case 5)', () => {

  test('Case 5 — dispatch-shape-valid: N plan items → N pending JSON files, each schema-valid', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-dispatch-'));
    const { pending } = buildHandoffPendingDir(tmp);
    const plan = ['brew install jq', 'brew install gh'];
    const cwd = tmp;

    const result = dispatchInstalls(plan, { pendingDir: pending, cwd });

    assert.strictEqual(result.dispatched, 2);
    assert.ok(Array.isArray(result.ids), 'result.ids must be an array');
    assert.strictEqual(result.ids.length, 2);

    const files = fs.readdirSync(pending).filter((f) => f.endsWith('.json'));
    assert.strictEqual(files.length, 2);

    for (const file of files) {
      const rec = JSON.parse(fs.readFileSync(path.join(pending, file), 'utf-8'));
      // Required handoff-record fields
      assert.match(rec.id, /^h-[0-9a-f]{8}$/, `id should match /^h-[0-9a-f]{8}$/; got ${rec.id}`);
      assert.strictEqual(typeof rec.cmd, 'string');
      assert.ok(plan.includes(rec.cmd), `record.cmd must be one of the plan commands; got ${rec.cmd}`);
      assert.strictEqual(rec.cwd, cwd);
      assert.strictEqual(rec.status, 'pending');
      assert.match(rec.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'created_at must be ISO-shaped');

      // Schema gate: validateInputsSchema must say ok:true.
      // Records dispatched here carry no `inputs` field at all (no secrets needed
      // for plain installs), so we pass the canonical empty-secrets stand-in.
      const inputs = rec.inputs || { secrets: [] };
      const v = validateInputsSchema(inputs);
      assert.strictEqual(v.ok, true, `validateInputsSchema rejected: ${v.reason || '(no reason)'}`);
    }
  });

});

test.describe('cmdFlutterUISetup integration (TRD 10-09 cases 6-10)', () => {

  test('Case 8 — idempotent-already-set-up: tools present + marker + bootstrap skip → status:already-set-up + zero handoff records', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-HOME-idem-'));
    buildFakePidFile(tmpHome, { live: true });

    const tmpPath = buildFakePATH({ jq: true, maestro: true, chromedriver: true });

    const projTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-projparent-idem-'));
    // Fully set up: pubspec + dirs + marker.
    const projectRoot = buildBootstrapTarget(projTmp, {
      pubspecHasIntegrationTest: true,
      hasIntegrationTestDir: true,
      hasMaestroDir: true,
      hasMarker: true,
    });

    const res = spawnSetup({
      home: tmpHome,
      pathDir: tmpPath,
      cwd: projectRoot,
      extraArgs: ['--raw'],
    });

    assert.strictEqual(res.status, 0, `expected exit 0; got ${res.status}. stderr: ${res.stderr}`);
    const stdout = String(res.stdout);
    assert.match(stdout, /"status":"already-set-up"/,
      `expected status:'already-set-up' in stdout; got:\n${stdout}`);

    // Zero handoff records should exist on disk.
    const pendingDir = path.join(projectRoot, '.devflow-handoff', 'pending');
    const records = fs.existsSync(pendingDir)
      ? fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'))
      : [];
    assert.strictEqual(records.length, 0,
      `expected zero handoff records for already-set-up; found ${records.length}: ${records.join(', ')}`);
  });

  test('Case 7 — bootstrap-chain: all tools present + live daemon + bootstrap-needed → JSON includes bootstrap matching checkBootstrapState', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-HOME-live-'));
    buildFakePidFile(tmpHome, { live: true });

    // PATH that satisfies all 3 required tools — bypasses install path.
    const tmpPath = buildFakePATH({ jq: true, maestro: true, chromedriver: true });

    // Bare project root: bootstrap detector should report action:'warn' + setup_task.
    const projTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-projparent-'));
    const projectRoot = buildBootstrapTarget(projTmp, {}); // no pubspec, no dirs, no marker

    const res = spawnSetup({
      home: tmpHome,
      pathDir: tmpPath,
      cwd: projectRoot,
      extraArgs: ['--raw'],
    });

    assert.strictEqual(res.status, 0, `expected exit 0 (all tools present); got ${res.status}. stderr: ${res.stderr}`);
    const payload = JSON.parse(String(res.stdout));
    assert.ok(payload.bootstrap, `expected payload.bootstrap to be present; got: ${JSON.stringify(payload)}`);

    // Compare against the pure-function checkBootstrapState for the same project.
    const { checkBootstrapState } = require('./flutter-ui-bootstrap.cjs');
    const expectedBootstrap = checkBootstrapState({ projectDir: projectRoot });
    assert.deepStrictEqual(payload.bootstrap, expectedBootstrap);
    // Sanity: this fixture should warn (no marker + missing infra).
    assert.strictEqual(payload.bootstrap.action, 'warn');
  });

  test('Case 11 — bootstrap-chain-no-daemon: all tools present + NO daemon + bootstrap-needed → JSON includes bootstrap matching checkBootstrapState (daemon NOT required for bootstrap)', () => {
    // Common adoption scenario: user has tools already, daemon not running, project needs bootstrap.
    // Bootstrap is a pure-detector + setup_task emission — it does NOT need the daemon.
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-HOME-nodaemon-'));
    // NO pid file written — daemon NOT running.

    // PATH that satisfies all 3 required tools — nothing to install.
    const tmpPath = buildFakePATH({ jq: true, maestro: true, chromedriver: true });

    // Bare project root: bootstrap detector should report action:'warn' + setup_task.
    const projTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-projparent-nodaemon-'));
    const projectRoot = buildBootstrapTarget(projTmp, {}); // no pubspec, no dirs, no marker

    const res = spawnSetup({
      home: tmpHome,
      pathDir: tmpPath,
      cwd: projectRoot,
      extraArgs: ['--raw'],
    });

    assert.strictEqual(res.status, 0,
      `expected exit 0 (all tools present, bootstrap chain runs); got ${res.status}. stderr: ${res.stderr}`);
    const payload = JSON.parse(String(res.stdout));
    assert.ok(payload.bootstrap,
      `expected payload.bootstrap to be present in no-daemon-but-tools-present case; got: ${JSON.stringify(payload)}`);

    // Compare against the pure-function checkBootstrapState for the same project.
    const { checkBootstrapState } = require('./flutter-ui-bootstrap.cjs');
    const expectedBootstrap = checkBootstrapState({ projectDir: projectRoot });
    assert.deepStrictEqual(payload.bootstrap, expectedBootstrap);
    // Sanity: this fixture should warn (no marker + missing infra).
    assert.strictEqual(payload.bootstrap.action, 'warn');
  });

  test('Case 9 — print-only-flag: live daemon + --print-only → zero handoff records written, plan printed', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-HOME-printonly-'));
    buildFakePidFile(tmpHome, { live: true });

    const tmpPath = buildFakePATH({}); // all tools missing → plan is non-empty
    const projTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-projparent-printonly-'));
    const projectRoot = buildBootstrapTarget(projTmp, {});

    const res = spawnSetup({
      home: tmpHome,
      pathDir: tmpPath,
      cwd: projectRoot,
      extraArgs: ['--print-only'],
    });

    // --print-only with non-empty plan exits 1 (signals tools missing). The
    // contract for case 9 is "no handoff records written" — exit code is
    // covered by case 6's fallback contract.
    assert.notStrictEqual(res.status, null, `subprocess did not run; signal=${res.signal}, stderr=${res.stderr}`);

    // Zero handoff records on disk despite live daemon.
    const pendingDir = path.join(projectRoot, '.devflow-handoff', 'pending');
    const records = fs.existsSync(pendingDir)
      ? fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'))
      : [];
    assert.strictEqual(records.length, 0,
      `expected zero handoff records with --print-only; found ${records.length}: ${records.join(', ')}`);

    // Stdout has shell-runnable command lines.
    const stdout = String(res.stdout || '');
    assert.match(stdout, /^(brew install |sudo apt-get install -y |# manual install required: )/m,
      `expected an install command line in stdout; got:\n${stdout}`);
  });

  test('Case 10 — auto-flag-no-prompts: --auto + closed stdin → subprocess completes without blocking', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-HOME-auto-'));
    // No pid file → no-daemon path → no chance of interactive prompt.
    const tmpPath = buildFakePATH({});
    const projTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-projparent-auto-'));
    const projectRoot = buildBootstrapTarget(projTmp, {});

    const res = spawnSetup({
      home: tmpHome,
      pathDir: tmpPath,
      cwd: projectRoot,
      extraArgs: ['--auto', '--raw'],
      stdinClosed: true,
    });

    // Completed (didn't time out / hang).
    assert.notStrictEqual(res.signal, 'SIGTERM', `subprocess timed out — likely blocked on stdin`);
    assert.ok(res.status !== null, `expected a numeric exit code; got null (signal=${res.signal})`);

    // --raw output should be parseable JSON containing the flags echo.
    const payload = JSON.parse(String(res.stdout));
    assert.strictEqual(payload.flags.auto, true);
  });

  test('Case 6 — fallback-no-daemon: NO pid file + missing tools → stdout has shell commands AND exit 1', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-HOME-empty-'));
    // No pid file written — daemon NOT running.
    const tmpPath = buildFakePATH({}); // all tools missing
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-proj-'));

    const res = spawnSetup({ home: tmpHome, pathDir: tmpPath, cwd: projectRoot });

    assert.strictEqual(res.status, 1, `expected exit code 1 (no-daemon fallback); got ${res.status}. stderr: ${res.stderr}`);
    // Non-raw default output is human-friendly newline-separated commands.
    // We expect at least one platform-shaped command line in stdout.
    const stdout = String(res.stdout || '');
    const looksLikeInstallLine = /^(brew install |sudo apt-get install -y |# manual install required: )/m;
    assert.match(stdout, looksLikeInstallLine,
      `expected stdout to contain a shell install command; stdout was:\n${stdout}`);
  });

});

test.describe('detectFlutterRepo (TRD 10-09 Case 12 — Flutter-repo guard)', () => {

  const FIX_BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-repo-fixture-base-'));

  test('Case 12a — no pubspec → isFlutterRepo:false, failure mentions pubspec', () => {
    const repo = buildFlutterRepoFixture(FIX_BASE, { pubspec: 'absent', libDir: true });
    const result = detectFlutterRepo({ cwd: repo });
    assert.strictEqual(result.isFlutterRepo, false);
    assert.strictEqual(result.checks.pubspec, false);
    assert.ok(result.failures.some((f) => /pubspec/i.test(f)),
      `expected a failure mentioning pubspec; got ${JSON.stringify(result.failures)}`);
  });

  test('Case 12b — pubspec present but no flutter SDK dep → isFlutterRepo:false, failure mentions flutter', () => {
    const repo = buildFlutterRepoFixture(FIX_BASE, { pubspec: 'plain', libDir: true });
    const result = detectFlutterRepo({ cwd: repo });
    assert.strictEqual(result.isFlutterRepo, false);
    assert.strictEqual(result.checks.pubspec, true);
    assert.strictEqual(result.checks.flutterDep, false);
    assert.ok(result.failures.some((f) => /flutter.*sdk|flutter.*dep/i.test(f)),
      `expected a failure mentioning flutter SDK dep; got ${JSON.stringify(result.failures)}`);
  });

  test('Case 12c — pubspec with flutter dep but no lib/ → isFlutterRepo:false, failure mentions lib', () => {
    const repo = buildFlutterRepoFixture(FIX_BASE, { pubspec: 'flutter', libDir: false });
    const result = detectFlutterRepo({ cwd: repo });
    assert.strictEqual(result.isFlutterRepo, false);
    assert.strictEqual(result.checks.libDir, false);
    assert.ok(result.failures.some((f) => /\blib\b/i.test(f)),
      `expected a failure mentioning lib/ dir; got ${JSON.stringify(result.failures)}`);
  });

  test('Case 12d — Flutter version constraint below 3.16 → isFlutterRepo:false, failure mentions version', () => {
    const repo = buildFlutterRepoFixture(FIX_BASE, { pubspec: 'flutter', libDir: true, flutterVersion: '>=3.0.0' });
    const result = detectFlutterRepo({ cwd: repo });
    assert.strictEqual(result.isFlutterRepo, false);
    assert.strictEqual(result.checks.minVersion, false);
    assert.ok(result.failures.some((f) => /version|3\.16/i.test(f)),
      `expected a failure mentioning version; got ${JSON.stringify(result.failures)}`);
  });

  test('Case 12e — all checks pass → isFlutterRepo:true, empty failures', () => {
    const repo = buildFlutterRepoFixture(FIX_BASE, { pubspec: 'flutter', libDir: true, flutterVersion: '>=3.16.0' });
    const result = detectFlutterRepo({ cwd: repo });
    assert.strictEqual(result.isFlutterRepo, true,
      `expected isFlutterRepo:true with all checks satisfied; got ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.failures, []);
    assert.strictEqual(result.checks.pubspec, true);
    assert.strictEqual(result.checks.flutterDep, true);
    assert.strictEqual(result.checks.libDir, true);
    assert.strictEqual(result.checks.minVersion, true);
  });

  test('Case 12f — pubspec with flutter dep but NO version constraint at all → minVersion:null (advisory pass), isFlutterRepo:true', () => {
    const repo = buildFlutterRepoFixture(FIX_BASE, { pubspec: 'flutter', libDir: true, flutterVersion: null });
    const result = detectFlutterRepo({ cwd: repo });
    // No constraint → can't verify min version; don't block. Treat as advisory pass.
    assert.strictEqual(result.isFlutterRepo, true,
      `expected isFlutterRepo:true when version constraint absent (advisory); got ${JSON.stringify(result)}`);
    assert.strictEqual(result.checks.minVersion, null);
  });

});

test.describe('cmdFlutterUISetup Flutter-repo gate (TRD 10-09 Case 13 — guard integration)', () => {

  test('Case 13 — non-Flutter cwd → status:"not-a-flutter-project" + exit 1 + does NOT install or scaffold', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-HOME-nonflutter-'));
    const tmpPath = buildFakePATH({}); // tools missing — doesn't matter, gate should fire first
    const nonFlutterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'not-flutter-')); // empty dir

    const res = spawnSetup({
      home: tmpHome,
      pathDir: tmpPath,
      cwd: nonFlutterDir,
      extraArgs: ['--raw'],
    });

    assert.strictEqual(res.status, 1,
      `expected exit 1 (non-Flutter refusal); got ${res.status}. stderr: ${res.stderr}`);
    const payload = JSON.parse(String(res.stdout));
    assert.strictEqual(payload.status, 'not-a-flutter-project');
    assert.ok(Array.isArray(payload.failures) && payload.failures.length > 0,
      `expected non-empty failures[]; got ${JSON.stringify(payload)}`);

    // Negative assertion: no handoff records dispatched
    const pendingDir = path.join(nonFlutterDir, '.devflow-handoff', 'pending');
    const records = fs.existsSync(pendingDir)
      ? fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'))
      : [];
    assert.strictEqual(records.length, 0,
      `expected zero handoff records when gate fires; found ${records.length}`);
  });

});

// Re-export fixture builders so later tests (and other test files, if any) can
// reuse, and so static-analysis treats them as live.
module.exports = {
  buildFakePATH,
  buildHandoffPendingDir,
  buildBootstrapTarget,
  buildFakePidFile,
  buildFlutterRepoFixture,
};
