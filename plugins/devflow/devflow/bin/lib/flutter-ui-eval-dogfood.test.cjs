'use strict';
// flutter-ui-eval-dogfood.test.cjs (UI-VISUAL-EVAL-JUDGE-02)
// CLI dogfood harness: drives df-tools `verify flutter-ui-eval` over the checked-in
// __fixtures__/flutter-ui-eval/ manifest with the OFFLINE label-echo judge (no network),
// exercising the REAL scoreState/scoreRun pipeline end-to-end. Mirrors flutter-ui-dogfood.test.cjs.
//
// Test list coverage: D1 (--help), D2 (--raw rollup over fixtures), F1 (flutter-ui eval reachable),
// DF1 (good->not-broken->pass), DF2 (broken-overflow->broken/high->fail),
// DF3 (run rollup verdict 'fail' w/ broken state listed), N1 (no real network call on this path),
// U1 (aodex#485 — a state_id absent from labels.json must NOT report pass).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'flutter-ui-eval');
const MANIFEST = path.join(FIXTURE_DIR, 'manifest.json');

// Run df-tools and capture stdout (no --raw appended here so callers control flags exactly).
function runRaw(argStr, opts = {}) {
  return execSync(`node ${DF_TOOLS} ${argStr}`, { encoding: 'utf-8', ...opts });
}
function runJSON(argStr) {
  return JSON.parse(runRaw(`${argStr} --raw`));
}

test.describe('flutter-ui-eval CLI dogfood (UI-VISUAL-EVAL-JUDGE-02)', () => {

  test('Case D1 — verify flutter-ui-eval --help exits 0 and prints usage (no crash, no network)', () => {
    const out = runRaw('verify flutter-ui-eval --help');
    assert.match(out, /flutter-ui-eval/);
    assert.match(out, /verify|usage|Usage/);
  });

  test('Case D2 — verify flutter-ui-eval <manifest> --raw emits a scoreRun rollup JSON', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    assert.ok(rollup && typeof rollup === 'object', 'rollup is an object');
    assert.ok('verdict' in rollup, 'rollup has a verdict');
    assert.ok(rollup.counts && typeof rollup.counts === 'object', 'rollup has counts');
    assert.ok(Array.isArray(rollup.fails), 'rollup has fails[]');
    // Offline-judge provenance: the dogfood path must declare it never hit the network.
    assert.strictEqual(rollup.network, false, 'rollup asserts no network call (offline judge)');
  });

  test('Case F1 — flutter-ui eval is a reachable subcommand (not "Unknown ... Available: setup")', () => {
    // Should route to the same handler; --help is the safe reachability probe.
    const out = runRaw('flutter-ui eval --help');
    assert.match(out, /flutter-ui-eval|eval/);
    assert.doesNotMatch(out, /Unknown flutter-ui subcommand/);
  });

  test('Case DF1 — known-good capture -> state verdict pass', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    const good = rollup.states.find(s => s.state_id === 'good-dashboard');
    assert.ok(good, 'good-dashboard state present in rollup');
    assert.strictEqual(good.verdict, 'pass');
    assert.strictEqual(good.is_broken, false);
  });

  test('Case DF2 — known-broken overflow capture -> is_broken:true, defect overflow/high, verdict fail', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    const broken = rollup.states.find(s => s.state_id === 'broken-overflow');
    assert.ok(broken, 'broken-overflow state present in rollup');
    assert.strictEqual(broken.is_broken, true);
    assert.strictEqual(broken.verdict, 'fail');
    assert.ok(Array.isArray(broken.defects) && broken.defects.length > 0, 'has defects');
    assert.ok(broken.defects.some(d => d.type === 'overflow' && d.severity === 'high'),
      'overflow/high defect recorded');
  });

  test('Case DF3 — scoreRun rollup over the fixture set -> verdict fail, broken state listed', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    assert.strictEqual(rollup.verdict, 'fail');
    assert.deepStrictEqual(rollup.fails, ['broken-overflow']);
    assert.strictEqual(rollup.counts.pass, 1);
    assert.strictEqual(rollup.counts.fail, 1);
  });

  test('Case N1 — dogfood/verify path never reaches the real network judge (offline flag asserted)', () => {
    // The handler's offline/dogfood path injects a label-echo judge; the rollup carries
    // network:false as the machine-checkable no-network guarantee for this path.
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    assert.strictEqual(rollup.network, false);
    assert.strictEqual(rollup.judge, 'offline-label-echo');
  });

  test('Case C5 — every state in the rollup carries an evidence basis (offline path -> "label")', () => {
    // 32-02 (aodex#485 defect 2): a consumer reading a single state's rollup detail must be
    // able to see what basis the verdict rests on, without also reading the run-level
    // `judge` field. Every state on the default (offline) path must declare evidence:'label'.
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    assert.ok(Array.isArray(rollup.states) && rollup.states.length > 0, 'rollup has per-state detail');
    for (const s of rollup.states) {
      assert.strictEqual(s.evidence, 'label',
        `state ${s.state_id} must carry evidence:'label' on the offline default path`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Case U1 (aodex#485, the load-bearing case) — CLI level, outside-in.
//
// flutter-ui-eval.cjs:328 (pre-fix): `(labels && labels[request.state_id]) || { is_broken: false }`
// A state_id absent from labels.json silently became a not-broken JudgeResult -> verdict
// 'pass'. #485 found 40 states reporting pass, 34 of which nothing ever judged. This case
// hand-builds a temp manifest with one labelled state and one UNLABELLED state and asserts
// the unlabelled state can never score 'pass' and is named in a top-level unjudged[] array.
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Case U1 — a state absent from labels.json must not report pass (aodex#485)', () => {
  let tmpDir;

  test.before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-'));

    // Hand-built labels.json: ONLY 'good-dashboard' is labelled. 'never-judged-by-anything'
    // is deliberately absent — this is the exact condition #485 found in production.
    fs.writeFileSync(
      path.join(tmpDir, 'labels.json'),
      JSON.stringify({ 'good-dashboard': { is_broken: false } }, null, 2),
      'utf-8',
    );

    // Copy the two checked-in stub PNGs into the temp dir — the offline judge never reads
    // pixels, but screenshot_path resolution still happens relative to the manifest dir.
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'good-dashboard.png'),
      path.join(tmpDir, 'good-dashboard.png'),
    );
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'broken-overflow.png'),
      path.join(tmpDir, 'never-judged-by-anything.png'),
    );

    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({
        objective: 'UI-VISUAL-EVAL-JUDGE-U1',
        note: 'Hand-built temp manifest (U1) — one labelled state, one absent from labels.json.',
        samples: 3,
        flakeBudget: 1,
        states: [
          {
            state_id: 'good-dashboard',
            route: '/dashboard',
            data_state: 'populated',
            viewport: { width: 1280, height: 800 },
            expected: 'Dashboard shows a populated revenue chart; no overflow, no blank regions.',
            screenshot_path: './good-dashboard.png',
          },
          {
            state_id: 'never-judged-by-anything',
            route: '/dashboard',
            data_state: 'populated',
            viewport: { width: 1280, height: 800 },
            expected: 'Dashboard shows a populated revenue chart; no overflow, no blank regions.',
            screenshot_path: './never-judged-by-anything.png',
          },
        ],
      }, null, 2),
      'utf-8',
    );
  });

  test.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('Case U1 — a state absent from labels.json must NOT report pass (aodex#485)', () => {
    const manifestPath = path.join(tmpDir, 'manifest.json');
    const rollup = runJSON(`verify flutter-ui-eval ${manifestPath}`);

    const ghost = rollup.states.find(s => s.state_id === 'never-judged-by-anything');
    assert.ok(ghost, 'never-judged-by-anything state present in rollup');
    assert.strictEqual(
      ghost.verdict, 'review',
      'a state absent from labels.json must NOT report pass (aodex#485)',
    );

    assert.ok(
      Array.isArray(rollup.unjudged) && rollup.unjudged.includes('never-judged-by-anything'),
      'the unlabelled state must be named in a top-level unjudged[] array',
    );

    assert.notStrictEqual(
      rollup.verdict, 'pass',
      'a run with any unjudged state must never report a clean pass',
    );

    // Proves the fix is targeted: the labelled state is unaffected.
    const good = rollup.states.find(s => s.state_id === 'good-dashboard');
    assert.ok(good, 'good-dashboard state present in rollup');
    assert.strictEqual(good.verdict, 'pass', 'a labelled state still reports pass');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Case A1 (32-02) — a manifest state keyed `id` (the shape the planner's own
// buildManifestStub emits) must be attributable by name in the rollup.
//
// Reproduced live against the unmodified engine: a state keyed `id` instead of
// `state_id` resolves to request.state_id === undefined. The offline judge's label
// lookup then misses (no label is ever keyed "undefined"), so it falls into the
// unjudged marker path -- BEFORE the fix, `st.state_id` (undefined) is threaded
// straight through into stateResults/stateDetail/scoreRun, so `rollup.unjudged`
// comes back `[null]` (JSON.stringify serializes an array-position `undefined` as
// `null`) and the per-state detail carries no name at all -- a finding nobody can
// act on. No `null` may appear in EITHER `reviews[]` or `unjudged[]` after the fix,
// and the per-state detail must carry a non-null `state_id` plus an advisory
// naming the non-canonical key.
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Case A1 — a manifest state keyed `id` is attributable by name (32-02)', () => {
  let tmpDir;

  test.before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-a1-'));

    // Deliberately empty labels.json — isolates the attribution defect from judging;
    // this state is ALSO unjudged (no label), same as U1, but the point under test here
    // is whether it gets a NAME in the rollup, not whether it gets judged.
    fs.writeFileSync(path.join(tmpDir, 'labels.json'), JSON.stringify({}, null, 2), 'utf-8');
    fs.copyFileSync(
      path.join(FIXTURE_DIR, 'good-dashboard.png'),
      path.join(tmpDir, 'mislabeled-state.png'),
    );

    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({
        objective: 'UI-VISUAL-EVAL-JUDGE-A1',
        note: 'Hand-built temp manifest (A1) — one state keyed `id` instead of `state_id`.',
        samples: 3,
        flakeBudget: 1,
        states: [
          {
            id: 'mislabeled-state', // NOT state_id — the exact shape buildManifestStub emits
            route: '/x',
            data_state: 'populated',
            expected: 'shows x',
            screenshot_path: './mislabeled-state.png',
          },
        ],
      }, null, 2),
      'utf-8',
    );
  });

  test.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('Case A1 — a state keyed `id` is named (no null) in the rollup, with an advisory on the non-canonical key', () => {
    const manifestPath = path.join(tmpDir, 'manifest.json');
    const rollup = runJSON(`verify flutter-ui-eval ${manifestPath}`);

    // No null entries in EITHER name-keyed bucket.
    assert.ok(!rollup.reviews.includes(null), 'reviews[] must contain no null entries');
    assert.ok(!rollup.unjudged.includes(null), 'unjudged[] must contain no null entries');

    // The state is nameable in the per-state detail.
    assert.strictEqual(rollup.states.length, 1);
    const st = rollup.states[0];
    assert.strictEqual(st.state_id, 'mislabeled-state',
      'the state must be attributable by name even though the manifest used `id`');

    // An advisory records that the key was non-canonical (the shape mismatch stays visible;
    // the fallback must NOT be silent).
    const allAdvisories = [...(st.advisories || []), ...(st.errors || [])];
    assert.ok(allAdvisories.some(a => /non-canonical|state_id/i.test(a) && /id/.test(a)),
      `expected an advisory naming the non-canonical key, got: ${JSON.stringify(allAdvisories)}`);

    // And the state IS named in the unjudged[] bucket it lands in (since labels.json is empty).
    assert.deepStrictEqual(rollup.unjudged, ['mislabeled-state']);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Case G1-G5 (aodex#485 defect 3, 32-03) — judge selection is explicit, and the
// rollup declares its own STANDING via a new `gate` field: 'binding' only on the
// live path, 'advisory' everywhere else. Only a `binding` pass may retire a
// surface from human verification (verifier.md Step 8c, wired outside this file).
//
// G3 is deliberately run with ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN/ANTHROPIC_BASE_URL
// stripped from the child env — a credential-less live run downgrades every state to
// 'review' (verified during planning), but `gate` reads the CALLER'S request ('live'),
// not the run's outcome. Zero network cost, zero credential dependency, fully deterministic.
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Case G1-G5 — judge selection is explicit; the rollup declares its own gate standing (32-03)', () => {

  test('Case G1 — default invocation (no --judge) declares gate:"advisory"; still network:false + offline judge', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    assert.strictEqual(rollup.gate, 'advisory', 'a labels lookup must not present itself as a gate');
    assert.strictEqual(rollup.network, false);
    assert.strictEqual(rollup.judge, 'offline-label-echo');
  });

  test('Case G2 — --judge labels selects the offline path explicitly: same rollup shape, gate:"advisory"', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST} --judge labels`);
    assert.strictEqual(rollup.gate, 'advisory');
    assert.strictEqual(rollup.network, false);
    assert.strictEqual(rollup.judge, 'offline-label-echo');
  });

  test('Case G3 — --judge live declares gate:"binding" (the run\'s STANDING, asserted credential-less)', () => {
    // Strip credentials so this test cannot make a real network call even if a developer
    // has ANTHROPIC_API_KEY exported in their shell — the whole point of this case is that
    // it is free, deterministic, and CI-safe.
    const strippedEnv = { ...process.env };
    delete strippedEnv.ANTHROPIC_API_KEY;
    delete strippedEnv.ANTHROPIC_AUTH_TOKEN;
    delete strippedEnv.ANTHROPIC_BASE_URL;
    const out = execSync(`node ${DF_TOOLS} verify flutter-ui-eval ${MANIFEST} --judge live --raw`,
      { encoding: 'utf-8', env: strippedEnv });
    const rollup = JSON.parse(out);
    // Every state downgrades to 'review' with no credential (verified during planning) —
    // but `gate` must still read 'binding': the caller asked for the live path, and gate is
    // the run's standing, not its outcome.
    assert.strictEqual(rollup.gate, 'binding', 'gate reflects the requested path, not the credential-less outcome');
    assert.strictEqual(rollup.network, true);
    assert.strictEqual(rollup.judge, 'live-vision');
    assert.strictEqual(rollup.verdict, 'fail', 'credential-less: 2 reviews > flakeBudget 1 on this 2-state fixture');
  });

  test('Case G4 — an unrecognised --judge value is rejected with a usage error, not a silent offline fallthrough', () => {
    assert.throws(() => {
      execSync(`node ${DF_TOOLS} verify flutter-ui-eval ${MANIFEST} --judge nonsense --raw`, { encoding: 'utf-8' });
    }, (err) => {
      assert.ok(err.status && err.status !== 0, `expected a non-zero exit for an unrecognised --judge value, got ${err.status}`);
      const stderr = err.stderr || '';
      assert.match(stderr, /--judge/, `usage error should mention --judge, got: ${stderr}`);
      assert.match(stderr, /live|labels/i, `usage error should name the valid values, got: ${stderr}`);
      return true;
    });
  });

  test('Case G5 — --help usage text states the default is advisory and the gate requires --judge live', () => {
    const out = runRaw('verify flutter-ui-eval --help');
    assert.match(out, /advisory/i, '--help must state the default is advisory');
    assert.match(out, /--judge live/, '--help must name --judge live as the path to a binding gate');
    assert.match(out, /binding/i, '--help must state that the binding gate is opt-in');
  });
});
