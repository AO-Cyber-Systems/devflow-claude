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
        parseJunit, loadAllowlist, evaluate, key, expiryInstant,
        notesForRun, MAX_QUARANTINE_DAYS } = gate;

const REPO_ROOT = path.resolve(__dirname, '..');

// ─── fixture generators ──────────────────────────────────────────────────────

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * One <testcase>. status: 'pass' | 'fail' | 'skip' | 'todo' | 'todo-fail'.
 *
 * `todo-fail` is the shape `{ todo: '…' }` on a test that actually throws: node
 * emits BOTH <skipped type="todo"> and <failure> inside one <testcase>, and
 * exits 0. Verified against node 22.23.3 and 25.9.0.
 *
 * `rawMessage: true` emits the message attribute the way node really does — node
 * escapes `&` and `"` in attribute values but leaves `>` RAW, so a failure
 * message containing a shell redirect arrives with a literal `>` mid-attribute.
 */
function buildTestCase({ name, file, status = 'pass', message = 'AssertionError',
                         rawMessage = false, omitFile = false }) {
  // node's junit reporter escapes attribute values twice; mimic that so the
  // parser is exercised against the real shape, not a tidied one.
  const attrs =
    `name="${xmlEscape(xmlEscape(name))}" time="0.001" classname="test"` +
    // node 22 emits no file= at all; node 25 does. Both shapes are fixtures.
    (omitFile ? '' : ` file="${xmlEscape(path.join(REPO_ROOT, file))}"`);
  // node escapes & and " but NOT > inside attribute values.
  const msgAttr = rawMessage
    ? String(message).replace(/&/g, '&amp;').replace(/"/g, '&amp;quot;')
    : xmlEscape(xmlEscape(message));
  const failEl = `<failure type="testCodeFailure" message="${msgAttr}"/>`;
  if (status === 'pass') return `\t\t<testcase ${attrs}/>`;
  if (status === 'skip') {
    return `\t\t<testcase ${attrs}>\n\t\t\t<skipped type="skipped" message="true"/>\n\t\t</testcase>`;
  }
  if (status === 'todo') {
    return `\t\t<testcase ${attrs}>\n\t\t\t<skipped type="todo" message="later"/>\n\t\t</testcase>`;
  }
  if (status === 'todo-fail') {
    return `\t\t<testcase ${attrs}>\n\t\t\t<skipped type="todo" message="later"/>\n` +
           `\t\t\t${failEl}\n\t\t</testcase>`;
  }
  return `\t\t<testcase ${attrs}>\n\t\t\t${failEl}\n\t\t</testcase>`;
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
function buildRun({ total = 5000, fileCount = 200, failing = [], nameCounts,
                    skippedNames = [] } = {}) {
  const files = new Set();
  for (let i = 0; i < fileCount; i++) files.add(`plugins/devflow/f${i}.test.cjs`);
  for (const f of failing) files.add(f.file);
  const counts = new Map(nameCounts || []);
  for (const f of failing) if (!counts.has(f.test)) counts.set(f.test, 1);
  for (const n of skippedNames) if (!counts.has(n)) counts.set(n, 1);
  return {
    total, failures: failing.length, skipped: skippedNames.length,
    skippedNames: new Set(skippedNames), files, nameCounts: counts, failing,
  };
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
  assert.match(r.errors.join('\n'), /Only 12 tests actually EXECUTED/);
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
    // Inside MAX_QUARANTINE_DAYS of the '2026-09-23' the QR cases evaluate at.
    expires: '2026-11-30',
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

// ─── Group RT — real-runner differentials ────────────────────────────────────
//
// The fixtures above restate what we believe node's reporter does. These run the
// real reporter over a throwaway file and check the belief. Every one of them
// was written RED against the previous gate.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');

/**
 * Write `src` to a throwaway .cjs OUTSIDE the repo (so package.json's patterns
 * can never pick it up), run node's real junit reporter over it, and return
 * { xml, status }. The junit destination is a file because node writes the two
 * reporters to different sinks and mixing them into stdout is what the gate
 * itself avoids.
 */
function runRealRunner(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-differential-'));
  const file = path.join(dir, 'fixture.cjs');
  const out = path.join(dir, 'results.xml');
  fs.writeFileSync(file, src, 'utf8');
  let status = 0;
  try {
    execFileSync(
      process.execPath,
      ['--test', '--test-reporter=junit', `--test-reporter-destination=${out}`, file],
      {
        cwd: dir,
        stdio: 'ignore',
        // NODE_TEST_* in the parent makes the grandchild speak node's internal
        // child-process protocol instead of junit — see PJR-3.
        env: Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST_'))
        ),
      }
    );
  } catch (e) {
    status = typeof e.status === 'number' ? e.status : 1;
  }
  const xml = fs.readFileSync(out, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { xml, status };
}

test('RT-1 a throwing describe-scoped after() hook: the gate NEVER disagrees with node', () => {
  // The defect: node can exit non-zero while writing failures="0" and no
  // <failure> element at all, because a suite-level hook failure is attributed
  // to no test. A gate that reads only the XML then prints PASS over a suite
  // node itself reported as failed.
  //
  // The assertion is the invariant, not a hardcoded exit code, because the exit
  // code for THIS shape is version-dependent: node 25.9.0 exits 1, node 22.23.3
  // exits 0 and drops the hook failure from the report entirely. Either way the
  // gate's verdict must equal the runner's.
  const { xml, status } = runRealRunner(`
const test = require('node:test');
const { describe, it, after } = test;
describe('RT-1 suite', () => {
  it('RT-1 inner passes', () => {});
  after(() => { throw new Error('after-hook boom'); });
});
`);
  const run = parseJunit(xml);
  const r = evaluate(run, [], {
    minTests: 1, minTestFiles: 0, matchedFiles: 500,
    runnerExit: status,
  });
  assert.strictEqual(
    r.ok, status === 0,
    `runner exited ${status} with ${run.failures} reported failure(s); ` +
    `gate said ok=${r.ok}. The gate must never be more optimistic than the runner.\n` +
    r.errors.join('\n')
  );
});

test('RT-2 a { todo } test that genuinely FAILS is not laundered past the gate', () => {
  // node emits <skipped type="todo"> AND <failure> in the same <testcase>, and
  // exits 0. Reading the skip first and `continue`ing dropped the failure, so a
  // one-word edit (`test(...)` -> `test(..., { todo: 'x' }, ...)`) turned any red
  // test green with no allowlist entry.
  const { xml, status } = runRealRunner(`
const test = require('node:test');
test('RT-2 failing but marked todo', { todo: 'later' }, () => {
  throw new Error('a real assertion failure');
});
`);
  const run = parseJunit(xml);
  assert.strictEqual(run.failures, 1, 'the failure must survive the todo marking');
  assert.strictEqual(run.skipped, 1, 'and it is still recorded as a todo/skip');
  assert.strictEqual(run.failing[0].message, 'a real assertion failure');
  const r = evaluate(run, [], { minTests: 1, minTestFiles: 0, matchedFiles: 500 });
  assert.ok(!r.ok, 'an undeclared failure must fail the gate whatever its todo status');
  assert.match(r.errors.join('\n'), /NOT in \.github\/known-test-failures\.json/);
  // Node's own exit code does NOT catch this one — which is why the report-side
  // fix has to exist independently of RT-1's exit-code guard.
  assert.strictEqual(status, 0, 'node exits 0 for a todo failure; the gate cannot lean on the exit code here');
});

test('RT-3 a { todo } test that PASSES is a skip, not a failure', () => {
  const { xml } = runRealRunner(`
const test = require('node:test');
test('RT-3 todo that passes', { todo: 'later' }, () => {});
`);
  const run = parseJunit(xml);
  assert.strictEqual(run.failures, 0);
  assert.strictEqual(run.skipped, 1);
});

test('RT-4 a RAW ">" inside a real failure MESSAGE is reported, not blanked', () => {
  // The same defect findTagEnd exists to fix on <testcase>, repeated on the
  // <failure> matcher: node leaves `>` raw inside message="…", so a `[^>]*` scan
  // ends the tag mid-attribute and the message reports as EMPTY. A failure whose
  // message is blank is a failure nobody can act on.
  const { xml } = runRealRunner(`
const test = require('node:test');
const assert = require('node:assert');
test('RT-4 redirect in the message', () => {
  assert.fail('expected { echo hello ; } > $__DFW_OUT to be "x"');
});
`);
  const run = parseJunit(xml);
  assert.strictEqual(run.failures, 1);
  assert.strictEqual(
    run.failing[0].message,
    'expected { echo hello ; } > $__DFW_OUT to be "x"'
  );
});

test('RT-5 a test that SKIPS is neither counted as run nor as passed', () => {
  const { xml, status } = runRealRunner(`
const test = require('node:test');
test('RT-5 platform-gated', { skip: 'no pwsh on PATH' }, () => {});
`);
  const run = parseJunit(xml);
  assert.strictEqual(run.total, 1);
  assert.strictEqual(run.skipped, 1);
  assert.strictEqual(run.failures, 0);
  assert.ok(run.skippedNames.has('RT-5 platform-gated'));
  assert.strictEqual(status, 0, 'a skip does not make node exit non-zero');
});

// ─── Group EX — Guard 0: the report and the process must agree ───────────────

test('EX-1 a non-zero exit with a CLEAN report FAILS the gate', () => {
  const r = evaluate(buildRun({ failing: [] }), [], { matchedFiles: 200, runnerExit: 1 });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /report and the process DISAGREE/);
});

test('EX-2 the SAME clean report with exit 0 passes — the exit code is the only difference', () => {
  const r = evaluate(buildRun({ failing: [] }), [], { matchedFiles: 200, runnerExit: 0 });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('EX-3 a non-zero exit EXPLAINED by a declared failure is not a disagreement', () => {
  // node exits non-zero whenever a <failure> is emitted. That is ordinary and is
  // judged by the allowlist, not by Guard 0 — otherwise every quarantined
  // failure would double-report as a process/report disagreement.
  const failing = [{ file: 'plugins/devflow/a.test.cjs', test: 'known', message: 'boom' }];
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'known' })];
  const r = evaluate(buildRun({ failing }), entries, { matchedFiles: 200, runnerExit: 1 });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('EX-4 a caller that supplies no exit code gets no Guard 0 verdict', () => {
  const r = evaluate(buildRun({ failing: [] }), [], { matchedFiles: 200 });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('EX-5 the signal is reported when there is one', () => {
  const r = evaluate(buildRun({ failing: [] }), [], {
    matchedFiles: 200, runnerExit: null, runnerSignal: 'SIGTERM',
  });
  // No exit code means no verdict; the signal alone does not manufacture one.
  assert.ok(r.ok);
  const r2 = evaluate(buildRun({ failing: [] }), [], {
    matchedFiles: 200, runnerExit: 7, runnerSignal: 'SIGTERM',
  });
  assert.match(r2.errors.join('\n'), /exited 7 \(signal SIGTERM\)/);
});

// ─── Group SK — a skip is its own verdict ────────────────────────────────────

test('SK-1 an allowlisted test that SKIPPED keeps its entry', () => {
  // The live hazard: PW-9 runs only where pwsh is on PATH, and ubuntu-latest's
  // pwsh availability has moved within one image label. Reading the skip as a
  // pass would tell a human to DELETE a quarantine for a test that still fails
  // every time pwsh is present.
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'PW-9 exit 7' })];
  const r = evaluate(buildRun({ skippedNames: ['PW-9 exit 7'] }), entries, { matchedFiles: 200 });
  assert.ok(r.ok, r.errors.join('\n'));
  assert.deepStrictEqual(r.unexercised, ['PW-9 exit 7']);
});

test('SK-2 control: the SAME entry whose test actually PASSED still trips the ratchet', () => {
  // One edit from SK-1 — the name moves out of skippedNames — and the verdict
  // flips. That is what makes SK-1 a policy and not a hole.
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'PW-9 exit 7' })];
  const r = evaluate(buildRun({ skippedNames: [] }), entries, { matchedFiles: 200 });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /PASSED this run/);
});

test('SK-3 a skipped allowlisted entry is REPORTED, not silently kept', () => {
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'PW-9 exit 7' })];
  const run = buildRun({ skippedNames: ['PW-9 exit 7'] });
  const notes = notesForRun(run, evaluate(run, entries, { matchedFiles: 200 }));
  assert.match(notes.join('\n'), /SKIPPED rather than ran/);
  assert.match(notes.join('\n'), /PW-9 exit 7/);
});

test('SK-4 skipped tests do NOT count toward the executed floor', () => {
  // 3,200 reported but 300 of them skipped is 2,900 executed — below the floor.
  // Counting skips toward "the suite ran" reproduces the exact hole the floor
  // exists to close.
  const r = evaluate(
    buildRun({ total: 3200, skippedNames: Array.from({ length: 300 }, (_, i) => `s${i}`) }),
    [], { minTests: 3000, minTestFiles: 100, matchedFiles: 200 }
  );
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /Only 2900 tests actually EXECUTED \(3200 reported, 300 skipped\)/);
});

test('SK-5 control: the same 3,200 with nothing skipped clears the floor', () => {
  const r = evaluate(buildRun({ total: 3200 }), [], {
    minTests: 3000, minTestFiles: 100, matchedFiles: 200,
  });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('SK-6 every skipped name is listed on every run, so a NEW skip is a log diff', () => {
  const run = buildRun({ skippedNames: ['alpha skipped', 'beta skipped'] });
  const notes = notesForRun(run, evaluate(run, [], { matchedFiles: 200 }));
  assert.match(notes.join('\n'), /alpha skipped/);
  assert.match(notes.join('\n'), /beta skipped/);
});

// ─── Group TD — todo cannot launder a failure (fixture side) ─────────────────

test('TD-1 a testcase carrying BOTH <skipped type="todo"> and <failure> counts as a failure', () => {
  const xml = buildJunit([
    { name: 'laundered', file: 'plugins/devflow/a.test.cjs', status: 'todo-fail', message: 'real boom' },
  ]);
  const r = parseJunit(xml);
  assert.strictEqual(r.failures, 1);
  assert.strictEqual(r.skipped, 1);
  assert.strictEqual(r.failing[0].message, 'real boom');
});

test('TD-2 a todo that did not fail is a skip and nothing else', () => {
  const xml = buildJunit([
    { name: 'honest todo', file: 'plugins/devflow/a.test.cjs', status: 'todo' },
  ]);
  const r = parseJunit(xml);
  assert.strictEqual(r.failures, 0);
  assert.strictEqual(r.skipped, 1);
  assert.ok(r.skippedNames.has('honest todo'));
});

// ─── Group AF — Guard 2c works on EVERY node version ─────────────────────────

test('AF-1 an entry whose file is not in the selected suite fails the gate', () => {
  // Checked statically against the resolved pattern set, so it runs on node 22 —
  // the version CI pins and the only environment the allowlist describes.
  const entries = [buildEntry({ file: 'plugins/devflow/moved-away.test.cjs', test: 'T1 does a thing' })];
  const r = evaluate(buildRun({ failing: [] }), entries, {
    matchedFiles: 200,
    matchedFileSet: new Set(['plugins/devflow/a.test.cjs']),
  });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /not \s*one of the 1 test files/);
});

test('AF-2 control: the same entry pointing at a selected file passes the static check', () => {
  const entries = [buildEntry({ file: 'plugins/devflow/a.test.cjs', test: 'T1 does a thing' })];
  const failing = [{ file: '<unknown>', test: 'T1 does a thing', message: '' }];
  const r = evaluate(buildRun({ failing }), entries, {
    matchedFiles: 200,
    matchedFileSet: new Set(['plugins/devflow/a.test.cjs']),
  });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('AF-3 the static check runs even when the reporter gives NO file attribution', () => {
  // node 22 emits no testcase file=, which is precisely why the old
  // runner-attribution cross-check could never fire on the pinned runner.
  const xml = buildJunit([
    { name: 'T1 does a thing', file: 'plugins/devflow/a.test.cjs', status: 'fail', omitFile: true },
  ]);
  const run = parseJunit(xml);
  assert.strictEqual(run.files.size, 0, 'the fixture must reproduce node 22\'s missing file=');
  const entries = [buildEntry({ file: 'plugins/devflow/gone.test.cjs', test: 'T1 does a thing' })];
  const r = evaluate(run, entries, {
    minTests: 1, minTestFiles: 0, matchedFiles: 200,
    matchedFileSet: new Set(['plugins/devflow/a.test.cjs']),
  });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /not one of the 1 test files/);
});

test('AF-4 every file in THIS repo\'s committed allowlist is a file the patterns select', () => {
  const fsx = require('fs');
  const pkg = require(path.join(REPO_ROOT, 'package.json'));
  const selected = new Set(resolveTestFiles(derivePatterns(pkg.scripts.test)));
  const entries = loadAllowlist(
    fsx.readFileSync(path.join(REPO_ROOT, '.github', 'known-test-failures.json'), 'utf8')
  );
  for (const e of entries) {
    assert.ok(selected.has(e.file), `allowlist entry "${e.test}" points at ${e.file}, which the patterns do not select`);
  }
});

// ─── Group QC — the quarantine meter has a maximum reading ───────────────────

test('QC-1 a quarantine expiring past the ceiling is rejected', () => {
  // "nondeterministic: true" + any parseable date was a PERMANENT exemption:
  // 2099-01-01 parses.
  const entries = [buildQuarantine({
    file: 'plugins/devflow/a.test.cjs', test: 'racy', expires: '2099-01-01',
  })];
  const r = evaluate(buildRun({ failing: [] }), entries, { now: '2026-09-23' });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /expire more than 180 days from now/);
});

test('QC-2 control: the same entry inside the ceiling is accepted', () => {
  const entries = [buildQuarantine({
    file: 'plugins/devflow/a.test.cjs', test: 'racy', expires: '2026-11-30',
  })];
  const r = evaluate(buildRun({ failing: [] }), entries, { now: '2026-09-23' });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('QC-3 the ceiling is configurable and binds at the edge', () => {
  const entries = [buildQuarantine({
    file: 'plugins/devflow/a.test.cjs', test: 'racy', expires: '2026-10-03',
  })];
  assert.ok(evaluate(buildRun({}), entries, { now: '2026-09-23', maxQuarantineDays: 11 }).ok);
  assert.ok(!evaluate(buildRun({}), entries, { now: '2026-09-23', maxQuarantineDays: 9 }).ok);
});

test('QC-4 MAX_QUARANTINE_DAYS is exported so the ceiling is discoverable', () => {
  assert.strictEqual(typeof MAX_QUARANTINE_DAYS, 'number');
  assert.ok(MAX_QUARANTINE_DAYS > 0 && MAX_QUARANTINE_DAYS <= 365);
});

test('QC-5 the committed allowlist satisfies the ceiling as of today', () => {
  const fsx = require('fs');
  const entries = loadAllowlist(
    fsx.readFileSync(path.join(REPO_ROOT, '.github', 'known-test-failures.json'), 'utf8')
  );
  const r = evaluate(buildRun({ failing: entries.map((e) => ({ file: e.file, test: e.test, message: '' })) }),
                     entries, { matchedFiles: 200 });
  const ceiling = r.errors.filter((e) => /expire more than/.test(e));
  assert.deepStrictEqual(ceiling, [], ceiling.join('\n'));
});

// ─── Group XD — expiry is measured in DAYS, not midnights ────────────────────

test('XD-1 a date-only expiry is valid through the END of its named day', () => {
  // `2026-12-31` names a day. Comparing against Date.parse (midnight UTC) killed
  // the quarantine at 00:00:01 on the day it was licensed through.
  const entries = [buildQuarantine({
    file: 'plugins/devflow/a.test.cjs', test: 'racy', expires: '2026-12-31',
  })];
  const r = evaluate(buildRun({ failing: [] }), entries, { now: '2026-12-31T12:00:00Z' });
  assert.ok(r.ok, r.errors.join('\n'));
});

test('XD-2 control: one second into the NEXT day it is expired', () => {
  const entries = [buildQuarantine({
    file: 'plugins/devflow/a.test.cjs', test: 'racy', expires: '2026-12-31',
  })];
  const r = evaluate(buildRun({ failing: [] }), entries, { now: '2027-01-01T00:00:01Z' });
  assert.ok(!r.ok);
  assert.match(r.errors.join('\n'), /EXPIRED/);
});

test('XD-3 expiryInstant: date-only gets end-of-day, an explicit time is taken literally', () => {
  assert.strictEqual(expiryInstant('2026-12-31'), Date.parse('2027-01-01T00:00:00Z') - 1);
  assert.strictEqual(expiryInstant('2026-12-31T09:00:00Z'), Date.parse('2026-12-31T09:00:00Z'));
  assert.ok(Number.isNaN(expiryInstant('someday')));
});
