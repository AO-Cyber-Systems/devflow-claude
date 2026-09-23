'use strict';

/**
 * Tests for the CI unit-suite gate (issue #89).
 *
 * The gate is the thing that decides whether every other test in this repo
 * counted, so it gets the same treatment it imposes: every branch that can
 * turn a red run green is asserted here.
 *
 * Fixtures are built by generator functions, not pasted blobs — the junit
 * shapes below are produced the same way node's reporter produces them, so a
 * new case is a call, not a copy-paste.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const gate = require('./ci-unit-gate.cjs');
const { tokenize, derivePatterns, globToRegExp, resolveTestFiles,
        parseJunit, loadAllowlist, evaluate, key } = gate;

const REPO_ROOT = path.resolve(__dirname, '..');

// ─── fixture generators ──────────────────────────────────────────────────────

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One <testcase>. status: 'pass' | 'fail' | 'skip'. */
function buildTestCase({ name, file, status = 'pass', message = 'AssertionError' }) {
  // node's junit reporter escapes attribute values twice; mimic that so the
  // parser is exercised against the real shape, not a tidied one.
  const attrs =
    `name="${xmlEscape(xmlEscape(name))}" time="0.001" classname="test" ` +
    `file="${xmlEscape(path.join(REPO_ROOT, file))}"`;
  if (status === 'pass') return `\t\t<testcase ${attrs}/>`;
  if (status === 'skip') {
    return `\t\t<testcase ${attrs}>\n\t\t\t<skipped type="skipped" message="true"/>\n\t\t</testcase>`;
  }
  return `\t\t<testcase ${attrs}>\n\t\t\t<failure type="testCodeFailure" ` +
         `message="${xmlEscape(xmlEscape(message))}"/>\n\t\t</testcase>`;
}

/** A whole junit document from a flat list of case specs. */
function buildJunit(cases, { suiteName = 'suite' } = {}) {
  const body = cases.map(buildTestCase).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n` +
         `\t<testsuite name="${xmlEscape(suiteName)}" time="0.1" disabled="0" errors="0" ` +
         `tests="${cases.length}" failures="0" skipped="0" hostname="ci">\n${body}\n\t</testsuite>\n` +
         `</testsuites>\n`;
}

/** A run object shaped like parseJunit's output, for evaluate() tests. */
function buildRun({ total = 5000, fileCount = 200, failing = [], nameCounts } = {}) {
  const files = new Set();
  for (let i = 0; i < fileCount; i++) files.add(`plugins/devflow/f${i}.test.cjs`);
  for (const f of failing) files.add(f.file);
  const counts = new Map(nameCounts || []);
  for (const f of failing) if (!counts.has(f.test)) counts.set(f.test, 1);
  return { total, failures: failing.length, skipped: 0, files, nameCounts: counts, failing };
}

function buildEntry(over = {}) {
  return {
    file: 'plugins/devflow/devflow/bin/x.test.cjs',
    test: 'T1 does a thing',
    reason: 'binds TCP port 41999 on the loopback interface, which a parallel run already holds',
    ...over,
  };
}

// ─── Group TK — tokenize ─────────────────────────────────────────────────────

test('TK-1 splits a plain command on whitespace', () => {
  assert.deepStrictEqual(tokenize('node --test a b'), ['node', '--test', 'a', 'b']);
});

test('TK-2 keeps single-quoted globs whole and strips the quotes', () => {
  assert.deepStrictEqual(
    tokenize("node --test 'plugins/**/*.test.cjs' 'plugins/**/*.test.js'"),
    ['node', '--test', 'plugins/**/*.test.cjs', 'plugins/**/*.test.js']
  );
});

test('TK-3 handles double quotes and collapses runs of whitespace', () => {
  assert.deepStrictEqual(tokenize('node   --test   "a b"  c'), ['node', '--test', 'a b', 'c']);
});

test('TK-4 an empty quoted argument survives as an empty token', () => {
  assert.deepStrictEqual(tokenize("node ''"), ['node', '']);
});

test('TK-5 an unbalanced quote throws rather than silently truncating', () => {
  assert.throws(() => tokenize("node --test 'oops"), /unbalanced quote/);
});

// ─── Group DP — derivePatterns ───────────────────────────────────────────────

test('DP-1 extracts the glob patterns from a real scripts.test line', () => {
  assert.deepStrictEqual(
    derivePatterns("node --test 'plugins/devflow/**/*.test.cjs' 'plugins/devflow/**/*.test.js'"),
    ['plugins/devflow/**/*.test.cjs', 'plugins/devflow/**/*.test.js']
  );
});

test('DP-2 drops flags, keeps positionals', () => {
  assert.deepStrictEqual(
    derivePatterns("node --test --test-concurrency=2 'a/**/*.test.cjs'"),
    ['a/**/*.test.cjs']
  );
});

test('DP-3 throws when scripts.test is missing', () => {
  assert.throws(() => derivePatterns(undefined), /missing or empty/);
});

test('DP-4 throws when scripts.test is not a node invocation — no guessing', () => {
  assert.throws(() => derivePatterns("jest --ci"), /must start with "node"/);
});

test('DP-5 throws when --test is absent', () => {
  assert.throws(() => derivePatterns("node scripts/run.js 'a/*.test.cjs'"), /does not pass --test/);
});

test('DP-6 throws when the script names no file patterns at all', () => {
  assert.throws(() => derivePatterns('node --test'), /names no test-file patterns/);
});

test('DP-7 this repo\'s own package.json still parses (the gate cannot drift from npm test)', () => {
  const pkg = require(path.join(REPO_ROOT, 'package.json'));
  const patterns = derivePatterns(pkg.scripts.test);
  assert.ok(patterns.length >= 1, 'at least one pattern');
  assert.ok(
    patterns.some((p) => p.includes('plugins/devflow')),
    `expected a plugins/devflow pattern, got ${JSON.stringify(patterns)}`
  );
});

// ─── Group PJ — parseJunit ───────────────────────────────────────────────────

test('PJ-1 counts passes, failures and skips separately', () => {
  const xml = buildJunit([
    { name: 'A', file: 'plugins/devflow/a.test.cjs' },
    { name: 'B', file: 'plugins/devflow/a.test.cjs', status: 'fail' },
    { name: 'C', file: 'plugins/devflow/b.test.cjs', status: 'skip' },
  ]);
  const r = parseJunit(xml);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.failures, 1);
  assert.strictEqual(r.skipped, 1);
  assert.deepStrictEqual([...r.files].sort(), ['plugins/devflow/a.test.cjs', 'plugins/devflow/b.test.cjs']);
});

test('PJ-2 reports failing tests as repo-relative file + name', () => {
  const xml = buildJunit([{ name: 'S1: scanPeer', file: 'plugins/devflow/x.test.cjs', status: 'fail' }]);
  const r = parseJunit(xml);
  assert.deepStrictEqual(r.failing.map((f) => `${f.file}::${f.test}`),
    ['plugins/devflow/x.test.cjs::S1: scanPeer']);
});

test('PJ-3 undoes the reporter\'s double-escaping so names match what a human reads', () => {
  const xml = buildJunit([
    { name: 'BW-5 initLines("pty") starts with stty -echo', file: 'plugins/devflow/w.test.cjs', status: 'fail' },
  ]);
  const r = parseJunit(xml);
  assert.strictEqual(r.failing[0].test, 'BW-5 initLines("pty") starts with stty -echo');
});

test('PJ-4 a skipped test is never counted as a failure', () => {
  const xml = buildJunit([{ name: 'K', file: 'plugins/devflow/s.test.cjs', status: 'skip' }]);
  const r = parseJunit(xml);
  assert.strictEqual(r.failures, 0);
  assert.deepStrictEqual(r.failing, []);
});

test('PJ-5 an empty document yields zero tests (which evaluate() then rejects)', () => {
  const r = parseJunit('<?xml version="1.0"?>\n<testsuites>\n</testsuites>\n');
  assert.strictEqual(r.total, 0);
  assert.strictEqual(r.files.size, 0);
});

test('PJ-6 an <error> child counts as a failure, same as <failure>', () => {
  const xml = buildJunit([{ name: 'E', file: 'plugins/devflow/e.test.cjs' }])
    .replace('<testcase name="E" time="0.001" classname="test"',
             '<testcase name="E" time="0.001" classname="test"');
  const withError = xml.replace(/\/>\n\t<\/testsuite>/,
    '>\n\t\t\t<error type="harness" message="load failed"/>\n\t\t</testcase>\n\t</testsuite>');
  const r = parseJunit(withError);
  assert.strictEqual(r.failures, 1, `expected the <error> case to count; got ${JSON.stringify(r)}`);
});

// ─── Group AL — loadAllowlist ────────────────────────────────────────────────

test('AL-1 accepts a well-formed list', () => {
  const entries = loadAllowlist(JSON.stringify({ entries: [buildEntry()] }));
  assert.strictEqual(entries.length, 1);
});

test('AL-2 an empty list is valid — that is the goal state', () => {
  assert.deepStrictEqual(loadAllowlist(JSON.stringify({ entries: [] })), []);
});

test('AL-3 rejects invalid JSON loudly', () => {
  assert.throws(() => loadAllowlist('{not json'), /not valid JSON/);
});

test('AL-4 rejects a document with no entries array', () => {
  assert.throws(() => loadAllowlist('{"foo":1}'), /must be an object with an "entries" array/);
});

test('AL-5 rejects an entry with no reason', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({ entries: [buildEntry({ reason: undefined })] })),
    /must name a mechanism/
  );
});

test('AL-6 rejects a reason too short to name a mechanism', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({ entries: [buildEntry({ reason: 'known issue' })] })),
    /must name a mechanism/
  );
});

test('AL-7 rejects "flaky" as a reason — the word names no mechanism', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({
      entries: [buildEntry({ reason: 'this test is flaky and fails now and then on CI runners' })],
    })),
    /calls the test flaky/
  );
});

test('AL-8 rejects "intermittent" for the same reason', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({
      entries: [buildEntry({ reason: 'fails intermittently depending on the machine it runs on' })],
    })),
    /calls the test flaky/
  );
});

test('AL-9 rejects a duplicate file::test entry', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({ entries: [buildEntry(), buildEntry()] })),
    /duplicate entry/
  );
});

test('AL-10 rejects an entry missing file or test', () => {
  assert.throws(() => loadAllowlist(JSON.stringify({ entries: [buildEntry({ file: '' })] })), /missing "file"/);
  assert.throws(() => loadAllowlist(JSON.stringify({ entries: [buildEntry({ test: '' })] })), /missing "test"/);
});

test('AL-11 the allowlist committed in this repo is itself valid', () => {
  const fs = require('fs');
  const raw = fs.readFileSync(path.join(REPO_ROOT, '.github', 'known-test-failures.json'), 'utf8');
  assert.doesNotThrow(() => loadAllowlist(raw));
});

// ─── Group EV — evaluate ─────────────────────────────────────────────────────

test('EV-1 a clean run with an empty allowlist passes', () => {
  const r = evaluate(buildRun(), []);
  assert.ok(r.ok, r.errors.join('\n'));
});

test('EV-2 ZERO tests fails — this is the "passed by not running" guard', () => {
  const r = evaluate(buildRun({ total: 0, fileCount: 0 }), []);
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /ZERO tests/);
});

test('EV-3 a run below the test floor fails even with no failures', () => {
  const r = evaluate(buildRun({ total: 12 }), [], { minTests: 3000, minTestFiles: 100 });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /Only 12 tests ran/);
});

test('EV-4 patterns resolving to too FEW files fails, whatever the reporter says', () => {
  // The floor is computed from the patterns by the gate itself, because node 22's
  // junit reporter reports no file attribution at all.
  const r = evaluate(buildRun({ total: 5000 }), [], { minTests: 3000, minTestFiles: 100, matchedFiles: 1 });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /resolve to only 1 file/);
});

test('EV-4b a reporter that omits file attribution entirely does NOT fail the gate', () => {
  // node 22 emits no testcase file=. The glob floor is what carries the weight.
  const run = buildRun({ total: 5000, fileCount: 0 });
  const r = evaluate(run, [], { minTests: 3000, minTestFiles: 100, matchedFiles: 120 });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('EV-5 an undeclared failure fails the gate (regression)', () => {
  const failing = [{ file: 'plugins/devflow/a.test.cjs', test: 'boom', message: 'AssertionError' }];
  const r = evaluate(buildRun({ failing }), []);
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /NOT in \.github\/known-test-failures\.json/);
  assert.match(r.errors.join('\n'), /boom/);
});

test('EV-6 a declared failure that still fails is tolerated', () => {
  const failing = [{ file: 'plugins/devflow/a.test.cjs', test: 'boom', message: '' }];
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'boom' })];
  const r = evaluate(buildRun({ failing }), entries);
  assert.ok(r.ok, r.errors.join('\n'));
});

test('EV-7 RATCHET: a declared failure that PASSED fails the gate until the entry is deleted', () => {
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'boom' })];
  const r = evaluate(buildRun({ failing: [] }), entries);
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /PASSED this run/);
  assert.match(r.errors.join('\n'), /may only shrink/);
});

test('EV-8 the recorded file is checked when the runner reports one', () => {
  // Keys are names, but the documentary `file` must not rot into a lie.
  const failing = [{ file: 'plugins/devflow/OTHER.test.cjs', test: 'boom', message: '' }];
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'boom' })];
  const r = evaluate(buildRun({ failing }), entries);
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /records file "plugins\/devflow\/a\.test\.cjs"/);
});

test('EV-8b when the runner reports NO file, the entry is still honoured', () => {
  const failing = [{ file: '<unknown>', test: 'boom', message: '' }];
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'boom' })];
  const r = evaluate(buildRun({ failing }), entries, { matchedFiles: 120 });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('EV-8c an AMBIGUOUS allowlisted name fails the gate rather than licensing two tests', () => {
  const failing = [{ file: 'plugins/devflow/a.test.cjs', test: 'boom', message: '' }];
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'boom' })];
  const r = evaluate(buildRun({ failing, nameCounts: [['boom', 2]] }), entries);
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /match MORE THAN ONE test/);
});

test('EV-9 key() is the test name — identical on every node version', () => {
  assert.strictEqual(key('T1'), 'T1');
});

test('EV-10 several undeclared failures are all reported, not just the first', () => {
  const failing = [
    { file: 'plugins/devflow/a.test.cjs', test: 'one', message: '' },
    { file: 'plugins/devflow/b.test.cjs', test: 'two', message: '' },
  ];
  const r = evaluate(buildRun({ failing }), []);
  const text = r.errors.join('\n');
  assert.match(text, /one/);
  assert.match(text, /two/);
  assert.match(text, /2 test\(s\) failed/);
});

// ─── Group PJR — parser realism (regression guards on the parser itself) ─────

test('PJR-1 a RAW ">" inside a test name does not drop the testcase', () => {
  // node's junit reporter escapes & and " but leaves > raw. A `[^>]*` tag scan
  // ends the tag at that character and silently skips the whole <testcase>.
  const name = 'BW-2 wrapCommand contains { echo hello ; } > $__DFW_OUT 2> $__DFW_ERR';
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n\t<testsuite name="s">\n' +
    `\t\t<testcase name="${name}" time="0.1" classname="test" ` +
    `file="${path.join(REPO_ROOT, 'plugins/devflow/raw.test.cjs')}"/>\n` +
    '\t</testsuite>\n</testsuites>\n';
  const r = parseJunit(xml);
  assert.strictEqual(r.total, 1, 'the testcase must not be dropped');
  assert.strictEqual([...r.files][0], 'plugins/devflow/raw.test.cjs');
});

test('PJR-2 a RAW ">" in the name of a FAILING test still reports the failure', () => {
  const name = 'T > U';
  const xml =
    '<testsuites><testsuite name="s">' +
    `<testcase name="${name}" classname="test" file="${path.join(REPO_ROOT, 'plugins/devflow/raw.test.cjs')}">` +
    '<failure type="testCodeFailure" message="boom"/></testcase>' +
    '</testsuite></testsuites>';
  const r = parseJunit(xml);
  assert.strictEqual(r.failures, 1);
  assert.strictEqual(r.failing[0].test, 'T > U');
});

test('PJR-3 differential: parseJunit agrees with node\'s own per-suite tests= counts', () => {
  // A differential control, not a restatement: run the real reporter over two
  // real (flat, describe-free) test files and check our leaf count against the
  // counts node itself wrote into the testsuite elements.
  const { execFileSync } = require('child_process');
  const files = [
    'plugins/devflow/devflow/bin/lib/wrappers/bash.test.cjs',
    'plugins/devflow/devflow/bin/lib/wrappers/fish.test.cjs',
  ];
  const xml = execFileSync(
    process.execPath,
    ['--test', '--test-reporter=junit', ...files],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      // node sets NODE_TEST_CONTEXT in the process running a test file. If the
      // grandchild inherits it, it emits the internal child-process protocol
      // instead of junit XML and this differential quietly compares nothing.
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST_'))
      ),
    }
  );
  let nodeTotal = 0;
  for (const m of xml.matchAll(/<testsuite\b[^>]*?\btests="(\d+)"/g)) nodeTotal += Number(m[1]);
  const r = parseJunit(xml);
  assert.ok(nodeTotal > 0, 'the oracle itself must be non-zero');
  assert.strictEqual(r.total, nodeTotal,
    `parseJunit counted ${r.total}, node's own testsuite tests= sum is ${nodeTotal}`);
  // File attribution is version-dependent: node 25 emits testcase file=, node 22
  // does not. Assert it only where the runner actually provides it — this is
  // exactly why allowlist keys are names, not file::name.
  if (r.files.size > 0) {
    assert.deepStrictEqual([...r.files].sort(), files.slice().sort());
  }
});

// ─── Group GL — pattern globbing (the reporter-independent floor) ────────────

test('GL-1 "**/" matches zero or more directory segments', () => {
  const re = globToRegExp('plugins/devflow/**/*.test.cjs');
  assert.ok(re.test('plugins/devflow/a.test.cjs'), 'zero segments');
  assert.ok(re.test('plugins/devflow/bin/lib/a.test.cjs'), 'several segments');
  assert.ok(!re.test('plugins/other/a.test.cjs'));
  assert.ok(!re.test('plugins/devflow/a.cjs'));
});

test('GL-2 "*" does not cross a path separator', () => {
  const re = globToRegExp('scripts/*.test.cjs');
  assert.ok(re.test('scripts/x.test.cjs'));
  assert.ok(!re.test('scripts/deep/x.test.cjs'));
});

test('GL-3 regex metacharacters in a pattern are literal', () => {
  const re = globToRegExp('a+b/c.test.cjs');
  assert.ok(re.test('a+b/c.test.cjs'));
  assert.ok(!re.test('aab/cXtest.cjs'));
});

test('GL-4 resolveTestFiles finds this repo\'s suite and includes this very file', () => {
  const pkg = require(path.join(REPO_ROOT, 'package.json'));
  const found = resolveTestFiles(derivePatterns(pkg.scripts.test));
  assert.ok(found.length >= 100, `expected >=100 test files, found ${found.length}`);
  assert.ok(found.includes('scripts/ci-unit-gate.test.cjs'),
    'the gate\'s own tests must be inside npm test');
  assert.ok(!found.some((f) => f.startsWith('node_modules/')), 'node_modules must not be walked');
});

test('GL-5 a pattern that matches nothing resolves to an empty list, not a throw', () => {
  assert.deepStrictEqual(resolveTestFiles(['nope/**/*.test.cjs']), []);
});

// ─── Group QR — bounded quarantine (nondeterministic entries) ────────────────

function buildQuarantine(over = {}) {
  return buildEntry({
    nondeterministic: true,
    tracking: 'https://github.com/AO-Cyber-Systems/devflow-claude/issues/91',
    expires: '2099-01-01',
    ...over,
  });
}

test('QR-1 a nondeterministic entry needs a tracking reference', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({ entries: [buildQuarantine({ tracking: undefined })] })),
    /need a "tracking" issue reference/
  );
});

test('QR-2 a nondeterministic entry needs an expiry date', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({ entries: [buildQuarantine({ expires: 'someday' })] })),
    /need an "expires" ISO date/
  );
});

test('QR-3 tracking/expires on a DETERMINISTIC entry is rejected as misleading', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({ entries: [buildEntry({ expires: '2099-01-01' })] })),
    /only apply when "nondeterministic" is true/
  );
});

test('QR-4 a quarantined test that PASSES does not trip the ratchet', () => {
  const entries = [buildQuarantine({ file: 'plugins/devflow/a.test.cjs', test: 'racy' })];
  const r = evaluate(buildRun({ failing: [] }), entries, { now: '2026-09-23' });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('QR-5 a quarantined test that FAILS is still tolerated', () => {
  const failing = [{ file: 'plugins/devflow/a.test.cjs', test: 'racy', message: '' }];
  const entries = [buildQuarantine({ file: 'plugins/devflow/a.test.cjs', test: 'racy' })];
  const r = evaluate(buildRun({ failing }), entries, { now: '2026-09-23' });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('QR-6 an EXPIRED quarantine fails the gate even when the test passes', () => {
  const entries = [buildQuarantine({
    file: 'plugins/devflow/a.test.cjs', test: 'racy', expires: '2026-01-01',
  })];
  const r = evaluate(buildRun({ failing: [] }), entries, { now: '2026-09-23' });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /EXPIRED/);
});

test('QR-7 an unexpired quarantine on the boundary day is still valid', () => {
  const entries = [buildQuarantine({
    file: 'plugins/devflow/a.test.cjs', test: 'racy', expires: '2026-12-31',
  })];
  const r = evaluate(buildRun({ failing: [] }), entries, { now: '2026-09-23' });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('QR-8 a quarantine still cannot use "flaky" as its reason', () => {
  assert.throws(
    () => loadAllowlist(JSON.stringify({
      entries: [buildQuarantine({ reason: 'this one is flaky on busy continuous-integration machines' })],
    })),
    /calls the test flaky/
  );
});
