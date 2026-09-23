'use strict';
// Tests for ui-spec-cli.cjs — the `df-tools ui spec validate <file>` arm (objective 34-04).
//
// These cases execute the REAL BINARY. That is the whole point of writing them first: the
// plan's W1b gate for this row is literally "`df-tools ui spec validate <file>` exit 1 with
// codes", and `helpers.cjs`'s `output()` calls `process.exit(0)` unconditionally — an arm that
// reaches for it is structurally incapable of failing, and a library-level unit test would
// never notice. Every case below reads the process exit code, not a return value.
//
// CRITICAL: the LOCAL df-tools.cjs, never `~/.claude/devflow/bin/df-tools.cjs` — the mirror is
// the PREVIOUSLY-INSTALLED engine and testing it would prove nothing about this worktree
// (precedent: verifier-ui-eval-invocation.test.cjs:42).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const LIB_DIR = __dirname;
const FIXTURE_DIR = path.join(LIB_DIR, '__fixtures__', 'ui-spec');
const POSITIVE_CONTROL = path.join(FIXTURE_DIR, 'projects-rail.md');
const BROKEN_DIR = path.join(FIXTURE_DIR, 'broken');
const PATTERN_CATALOGUE = path.join(FIXTURE_DIR, 'pattern-catalogue.json');

const TMP_FILES = [];

/**
 * Run the real binary. `execSync` THROWS on a non-zero exit, so the catch is where the
 * interesting half of this suite lives: `e.status` is the exit code the gate contract is
 * about, and `e.stdout`/`e.stderr` are still readable on the error object.
 */
function runArm(argv, opts = {}) {
  const cmd = `node ${JSON.stringify(DF_TOOLS)} ${argv}`;
  try {
    const stdout = execSync(cmd, { cwd: opts.cwd || LIB_DIR, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

function parseStdout(result) {
  try {
    return JSON.parse(result.stdout);
  } catch (e) {
    assert.fail(`stdout is not JSON (exit ${result.status}):\n${result.stdout}\n--- stderr ---\n${result.stderr}`);
  }
}

function codesOf(payload) {
  return [...new Set((payload.errors || []).map((e) => e.code))].sort();
}

function tmpSpec(name, content) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ui-spec-cli-')), name);
  fs.writeFileSync(file, content, 'utf-8');
  TMP_FILES.push(file);
  return file;
}

test.after(() => {
  for (const f of TMP_FILES) {
    try { fs.rmSync(path.dirname(f), { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ─── C1: the positive control exits 0 ────────────────────────────────────────

test('Case C1 — the positive control exits 0 with ok:true, engine_version and schema_version', () => {
  const result = runArm('ui spec validate __fixtures__/ui-spec/projects-rail.md');

  assert.strictEqual(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  const payload = parseStdout(result);
  assert.strictEqual(payload.ok, true, JSON.stringify(payload.errors, null, 1));
  assert.strictEqual(typeof payload.engine_version, 'string');
  assert.ok(payload.engine_version.length > 0, 'engine_version must be a non-empty string');
  assert.strictEqual(payload.schema_version, 1);
  assert.strictEqual(payload.spec, POSITIVE_CONTROL);

  // The pattern catalogue is UNREACHABLE for W1b (no pinned eden-ui-flutter release), so the
  // arm passes `undefined` and I5 reports PAT000/MISSING. Passing `[]` "for now" would fire
  // PAT001 on every real spec; reporting nothing would turn an unreachable catalogue into a
  // silent pass. A MISSING row is neither, and it does NOT flip `ok`.
  const pat000 = (payload.errors || []).filter((e) => e.code === 'PAT000');
  assert.strictEqual(pat000.length, 1, `expected one PAT000 MISSING row: ${JSON.stringify(payload.errors)}`);
  assert.strictEqual(pat000[0].status, 'MISSING');
  assert.ok(!codesOf(payload).includes('PAT001'), 'an unreachable catalogue must NOT read as an unknown pattern');
});

// ─── C2: a broken spec exits 1 with its code — the plan's literal gate ───────

test('Case C2 — a broken spec exits 1 and prints ok:false with the code', () => {
  const result = runArm('ui spec validate __fixtures__/ui-spec/broken/route-without-back.md');

  assert.strictEqual(result.status, 1, `exit 1 is the plan's W1b gate; got ${result.status}. stderr: ${result.stderr}`);

  const payload = parseStdout(result);
  assert.strictEqual(payload.ok, false);
  assert.ok(payload.errors.length > 0);
  assert.strictEqual(payload.errors[0].code, 'ROUTE002');
});

test('Case C2b — every known-broken fixture exits 1 through the real binary', () => {
  const files = fs.readdirSync(BROKEN_DIR).filter((f) => f.endsWith('.md')).sort();
  assert.ok(files.length >= 5, `expected the known-broken fixtures, found ${files.join(', ')}`);

  for (const file of files) {
    // The catalogue is supplied here so `unknown-pattern.md` can reach PAT001 through the real
    // arm; without it that ONE fixture's defect is unreachable from the binary (see SUMMARY,
    // "the --patterns flag" deviation).
    const result = runArm(`ui spec validate __fixtures__/ui-spec/broken/${file} --patterns ${JSON.stringify(PATTERN_CATALOGUE)}`);
    assert.strictEqual(result.status, 1, `${file}: expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
    const payload = parseStdout(result);
    assert.strictEqual(payload.ok, false, `${file} validated ok through the binary`);
  }
});

// ─── C3: the two failure modes that are not a verdict ────────────────────────

test('Case C3 — a missing path exits 1 with one stderr line and no stack trace', () => {
  const result = runArm('ui spec validate __fixtures__/ui-spec/does-not-exist.md');

  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /does-not-exist\.md/);
  assert.ok(result.stderr.trim().split('\n').length === 1, `stderr is not one line: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /at [A-Za-z]+ \(/, `a stack trace leaked: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /node:internal/, `a stack trace leaked: ${result.stderr}`);
});

test('Case C3b — a spec whose front matter will not parse exits 1 with SPEC000 and the line', () => {
  // A real yaml-lite refusal: an unterminated single-quoted string on line 2 of the BLOCK.
  const file = tmpSpec('unparseable.md', '---\nsurface: demo\nbad: "unterminated\n---\n\nbody\n');

  const result = runArm(`ui spec validate ${JSON.stringify(file)}`);

  assert.strictEqual(result.status, 1, `stderr: ${result.stderr}`);
  const payload = parseStdout(result);
  assert.strictEqual(payload.ok, false);
  assert.deepStrictEqual(codesOf(payload), ['SPEC000'], JSON.stringify(payload.errors));
  assert.match(payload.errors[0].msg, /line 2/);
});

// ─── C4: unknown subcommands ─────────────────────────────────────────────────

test('Case C4 — unknown `ui` and `ui spec` subcommands exit 1 and list what is available', () => {
  const unknownUi = runArm('ui nonesuch');
  assert.strictEqual(unknownUi.status, 1);
  assert.match(unknownUi.stderr, /Unknown ui subcommand\. Available: metrics, spec/);

  const unknownSpec = runArm('ui spec nonesuch');
  assert.strictEqual(unknownSpec.status, 1);
  assert.match(unknownSpec.stderr, /Unknown ui spec subcommand\. Available: validate/);

  // `ui spec` with no subcommand at all is the same refusal, not a crash.
  const bare = runArm('ui spec');
  assert.strictEqual(bare.status, 1);
  assert.match(bare.stderr, /Unknown ui spec subcommand\. Available: validate/);

  // `ui spec validate` with no file is a one-line usage refusal, not a stack trace.
  const noFile = runArm('ui spec validate');
  assert.strictEqual(noFile.status, 1);
  assert.match(noFile.stderr, /ui spec validate <file>/);
  assert.doesNotMatch(noFile.stderr, /node:internal/);
});

// ─── C5 (added): the catalogue flag, so I5's codes are reachable from the binary ──
//
// Not in the TRD's C1-C4 list. Added because the TRD's own eleven-fixture probe runs every
// broken fixture THROUGH THE REAL ARM and requires exit 1 with exactly one code — which
// `unknown-pattern.md` (PAT001) can never reach while the arm's catalogue is unconditionally
// `undefined`. A gate that cannot fail for one of its eleven fixtures is the exact class of
// verification trap this objective exists to close. Recorded as a deviation in the SUMMARY.

test('Case C5 — --patterns supplies the catalogue; without it I5 is MISSING, not PAT001', () => {
  const withCatalogue = runArm(`ui spec validate __fixtures__/ui-spec/broken/unknown-pattern.md --patterns ${JSON.stringify(PATTERN_CATALOGUE)}`);
  assert.strictEqual(withCatalogue.status, 1, `stderr: ${withCatalogue.stderr}`);
  assert.deepStrictEqual(codesOf(parseStdout(withCatalogue)), ['PAT001']);

  const without = runArm('ui spec validate __fixtures__/ui-spec/broken/unknown-pattern.md');
  assert.strictEqual(without.status, 0, 'an UNREACHABLE catalogue is MISSING, never a violation');
  const payload = parseStdout(without);
  assert.strictEqual(payload.ok, true);
  assert.deepStrictEqual(codesOf(payload), ['PAT000']);

  // A catalogue file that cannot be read is a one-line refusal, not a silent `undefined`:
  // the caller ASKED for a catalogue, so falling back to MISSING would hide the typo.
  const bad = runArm('ui spec validate __fixtures__/ui-spec/projects-rail.md --patterns /nope/patterns.json');
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stderr, /patterns/);
  assert.doesNotMatch(bad.stderr, /node:internal/);
});
