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
const { spawnSync } = require('node:child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const LIB_DIR = __dirname;
const FIXTURE_DIR = path.join(LIB_DIR, '__fixtures__', 'ui-spec');
const POSITIVE_CONTROL = path.join(FIXTURE_DIR, 'projects-rail.md');
const BROKEN_DIR = path.join(FIXTURE_DIR, 'broken');
const PATTERN_CATALOGUE = path.join(FIXTURE_DIR, 'pattern-catalogue.json');

const TMP_FILES = [];

/**
 * Run the real binary and return BOTH streams plus the exit code, on every path.
 *
 * `spawnSync`, not `execSync`: execSync returns only stdout and throws on a non-zero exit, so
 * stderr on a SUCCESSFUL run was silently discarded — and case R5 is about exactly that stream
 * on exactly that path (the arm renders, exit 0, and reports a check that did not run). A
 * harness that cannot see stderr on success cannot fail for a missing advisory, which is the
 * same class of blind gate this objective exists to close.
 */
function splitArgv(argv) {
  // Call sites quote paths with JSON.stringify (tmp dirs contain no spaces today, but the
  // quoting is there so one can). spawnSync takes an argv ARRAY and does no shell parsing, so
  // the quotes have to come off here or they reach the binary as literal characters.
  return (argv.match(/"(?:[^"\\]|\\.)*"|\S+/g) || []).map((tok) => (
    tok.startsWith('"') && tok.endsWith('"') ? JSON.parse(tok) : tok
  ));
}

function runArm(argv, opts = {}) {
  const r = spawnSync('node', [DF_TOOLS, ...splitArgv(argv)], {
    cwd: opts.cwd || LIB_DIR,
    encoding: 'utf-8'
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
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
  assert.match(unknownUi.stderr, /Unknown ui subcommand\. Available: metrics, spec, sheet, lock/);

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

// ─── R: the `render` arm (objective 34-05) ───────────────────────────────────
//
// A second subcommand beside `validate`, sharing the parse+validate front half. The whole
// reason it shares that half is R3: deriving a manifest, a graph and a table from a spec nobody
// checked produces three artifacts that look authoritative and are not, and everything
// downstream treats them as the truth.
//
// Same exit-code discipline as `validate`: `process.exitCode`, never `process.exit()` and never
// `helpers.output()` (which calls `process.exit(0)` UNCONDITIONALLY and would make this arm
// structurally incapable of failing).

test('Case R1 — `render --manifest` exits 0 and prints a manifest with a states array', () => {
  const result = runArm('ui spec render __fixtures__/ui-spec/projects-rail.md --manifest');

  assert.strictEqual(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  const manifest = parseStdout(result);
  assert.ok(Array.isArray(manifest.states), `no states array:\n${result.stdout}`);
  assert.strictEqual(manifest.states.length, 8);
  assert.strictEqual(manifest.surface, 'projects-rail');
  assert.ok(manifest.engine_version.length > 0, 'the manifest says which engine produced it');
});

test('Case R2 — `--graph` prints mermaid, `--table` prints markdown, no flag prints all four', () => {
  const graph = runArm('ui spec render __fixtures__/ui-spec/projects-rail.md --graph');
  assert.strictEqual(graph.status, 0, `--graph exit ${graph.status}: ${graph.stderr}`);
  assert.match(graph.stdout, /^(graph|flowchart)\b/, `--graph did not print mermaid:\n${graph.stdout}`);

  const table = runArm('ui spec render __fixtures__/ui-spec/projects-rail.md --table');
  assert.strictEqual(table.status, 0, `--table exit ${table.status}: ${table.stderr}`);
  assert.match(table.stdout, /^#{1,3} /, `--table did not open with a heading:\n${table.stdout}`);

  // The DEFAULT (no flag) is all four artifacts under named keys, so a caller that wants
  // everything does not have to run the arm three times and hope the three runs agree.
  const all = runArm('ui spec render __fixtures__/ui-spec/projects-rail.md');
  assert.strictEqual(all.status, 0, `bare render exit ${all.status}: ${all.stderr}`);
  const payload = parseStdout(all);
  assert.deepStrictEqual(
    Object.keys(payload).sort(),
    ['captureList', 'controlTableMd', 'manifest', 'navGraphMermaid', 'spec'],
    `unexpected default keys: ${Object.keys(payload).join(', ')}`
  );
  assert.strictEqual(payload.navGraphMermaid, graph.stdout, 'the bare render and --graph must agree');
  assert.strictEqual(payload.controlTableMd, table.stdout, 'the bare render and --table must agree');
});

test('Case R3 — render REFUSES an invalid spec: exit 1, the codes, and no artifact at all', () => {
  const result = runArm('ui spec render __fixtures__/ui-spec/broken/route-without-back.md --manifest');

  assert.strictEqual(result.status, 1, `an invalid spec must exit 1, got ${result.status}`);

  const payload = parseStdout(result);
  assert.ok(codesOf(payload).includes('ROUTE002'), `expected ROUTE002: ${JSON.stringify(payload.errors)}`);
  assert.strictEqual(payload.ok, false);

  // NOTHING was rendered. A manifest printed beside its own validation errors is a manifest
  // someone downstream will read and believe.
  assert.strictEqual(payload.manifest, undefined, 'a refused render must print no manifest');
  assert.strictEqual(payload.navGraphMermaid, undefined, 'a refused render must print no graph');
  assert.strictEqual(payload.controlTableMd, undefined, 'a refused render must print no table');
});

test('Case R4 — an unknown render flag exits 1 naming --manifest, --graph and --table', () => {
  const result = runArm('ui spec render __fixtures__/ui-spec/projects-rail.md --mainfest');

  assert.strictEqual(result.status, 1, `expected exit 1, got ${result.status}`);
  const text = `${result.stdout}${result.stderr}`;
  for (const flag of ['--manifest', '--graph', '--table']) {
    assert.ok(text.includes(flag), `the refusal must name ${flag}:\n${text}`);
  }
});

test('Case R6 — a VALUELESS flag before the spec path does not swallow the path', () => {
  // `positionals()` skipped the argv element after EVERY `--flag`, so `--graph <file>` ate the
  // file and the arm printed its usage error without ever reading the spec. Flag-then-path is
  // the ordering half of every CLI in the world produces, and the failure looks like "you
  // forgot the file" — the user re-types the command they already typed.
  const spec = '__fixtures__/ui-spec/projects-rail.md';

  for (const flag of ['--manifest', '--graph', '--table']) {
    const before = runArm(`ui spec render ${flag} ${spec}`);
    const after = runArm(`ui spec render ${spec} ${flag}`);

    assert.strictEqual(before.status, 0,
      `\`${flag} <file>\` must render: exit ${before.status}\n${before.stdout}${before.stderr}`);
    assert.strictEqual(before.stdout, after.stdout,
      `\`${flag} <file>\` and \`<file> ${flag}\` must produce the same artifact`);
  }

  // A VALUED flag keeps its value wherever it sits — the fix must not turn `--patterns` into a
  // valueless flag and start reading its catalogue path as the spec.
  const withCatalogue = runArm(`ui spec validate --patterns ${JSON.stringify(PATTERN_CATALOGUE)} ${spec}`);
  assert.strictEqual(withCatalogue.status, 0, `${withCatalogue.stdout}${withCatalogue.stderr}`);
  const payload = parseStdout(withCatalogue);
  assert.strictEqual(payload.ok, true, JSON.stringify(payload.errors));
  assert.ok(!codesOf(payload).includes('PAT000'),
    `the catalogue must have been READ, not consumed as the spec path: ${JSON.stringify(payload.errors)}`);

  // And a flag whose value is MISSING still refuses rather than eating the path silently.
  const danglingValue = runArm(`ui spec validate --patterns ${spec}`);
  assert.strictEqual(danglingValue.status, 1,
    'a --patterns pointing at the spec (and so no spec left) must refuse');
});

test('Case R5 — a MISSING row is reported on stderr, never laundered into a silent pass', () => {
  // W1b has no pinned eden-ui-flutter release, so EVERY real run carries a PAT000/MISSING row:
  // the pattern check COULD NOT RUN. `ok` does not flip (a MISSING row is not a violation), so
  // render proceeds — but it says so. Rendering four artifacts while silently swallowing "one
  // of my checks did not run" is the silent-green class this objective exists to close.
  const result = runArm('ui spec render __fixtures__/ui-spec/projects-rail.md --graph');

  assert.strictEqual(result.status, 0, 'a MISSING row is not a failure');
  assert.ok(result.stderr.includes('PAT000'), `the MISSING row must be reported:\n${result.stderr}`);
  assert.ok(result.stderr.includes('MISSING'), `the row must be named MISSING:\n${result.stderr}`);
  // …and it must NOT contaminate stdout, which the byte-stability probe diffs.
  assert.ok(!result.stdout.includes('PAT000'), 'the advisory belongs on stderr, not in the artifact');
});

// ─── A1-A4: the `ui sheet` arm (34-06) ───────────────────────────────────────
//
// `df-tools ui sheet <spec> --renders <dir> --refs <dir> --out <file>` — a THIRD `ui`
// subcommand beside `metrics` and `spec`, not a fourth `ui spec` one: §8.3 names it
// `df-tools ui sheet <surface>`.
//
// A4 is the one that matters structurally: the hash the arm prints must be the hash
// `sheetHash(buildSheetModel(...))` computes. A CLI with its own hashing path is a second
// definition of what a look-lock covers, and the two will eventually disagree about whether
// a human's approval still stands.

const sheetLib = require('./ui-sheet.cjs');
const { parseSurfaceSpec } = require('./ui-spec.cjs');

const SHEET_TMP_DIRS = [];

test.after(() => {
  for (const d of SHEET_TMP_DIRS) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function sheetTmpDir(prefix) {
  const d = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  SHEET_TMP_DIRS.push(d);
  return d;
}

test('Case A1 — `ui sheet` writes the file and prints {sheet_hash, out, states, missing}, exit 0', () => {
  const renders = sheetTmpDir('df-sheet-arm-renders-');
  const refs = sheetTmpDir('df-sheet-arm-refs-');
  const outDir = sheetTmpDir('df-sheet-arm-out-');
  const out = path.join(outDir, 'sheet.html');

  const result = runArm(
    `ui sheet __fixtures__/ui-spec/projects-rail.md --renders ${JSON.stringify(renders)} `
    + `--refs ${JSON.stringify(refs)} --out ${JSON.stringify(out)}`
  );

  assert.strictEqual(result.status, 0, `exit ${result.status}. stderr: ${result.stderr}`);
  assert.ok(fs.existsSync(out), 'the arm wrote the sheet');

  const payload = parseStdout(result);
  assert.match(payload.sheet_hash, /^[0-9a-f]{64}$/);
  assert.strictEqual(payload.out, out);
  assert.strictEqual(payload.states, 8, 'one row per declared capture');
  assert.ok(Array.isArray(payload.missing), 'missing[] is a list of capture_ids');
  assert.strictEqual(payload.missing.length, 8, 'no renders supplied, so every row is MISSING');
  assert.strictEqual(typeof payload.engine_version, 'string');
  assert.ok(payload.schema_version !== undefined, 'the sheet says which schema it was built against');

  const html = fs.readFileSync(out, 'utf-8');
  assert.ok(html.includes('MISSING'), 'the written sheet shows MISSING cells');
  assert.ok(html.includes('guard-denied'), 'and still carries every declared state');
});

test('Case A2 — a missing --out, a nonexistent --renders dir and a nonexistent spec each exit 1', () => {
  const renders = sheetTmpDir('df-sheet-arm-renders2-');

  const noOut = runArm(`ui sheet __fixtures__/ui-spec/projects-rail.md --renders ${JSON.stringify(renders)}`);
  assert.strictEqual(noOut.status, 1, `stdout: ${noOut.stdout}`);
  assert.match(noOut.stderr, /--out/, 'the refusal names the flag that is missing');
  assert.strictEqual(noOut.stderr.trim().split('\n').length, 1, `stderr is not one line: ${noOut.stderr}`);
  assert.doesNotMatch(noOut.stderr, /node:internal/, 'no stack trace');

  const outDir = sheetTmpDir('df-sheet-arm-out2-');
  const ghost = path.join(outDir, 'no-such-renders-dir');
  const badRenders = runArm(
    `ui sheet __fixtures__/ui-spec/projects-rail.md --renders ${JSON.stringify(ghost)} `
    + `--out ${JSON.stringify(path.join(outDir, 's.html'))}`
  );
  assert.strictEqual(badRenders.status, 1);
  assert.ok(badRenders.stderr.includes(ghost), `the refusal names the directory: ${badRenders.stderr}`);
  assert.ok(!fs.existsSync(path.join(outDir, 's.html')), 'nothing was written');

  const noSpec = runArm(`ui sheet __fixtures__/ui-spec/nope.md --out ${JSON.stringify(path.join(outDir, 't.html'))}`);
  assert.strictEqual(noSpec.status, 1);
  assert.match(noSpec.stderr, /not found/);
  assert.ok(!fs.existsSync(path.join(outDir, 't.html')), 'nothing was written');
});

test('Case A3 — an INVALID spec exits 1 and writes no sheet at all', () => {
  const outDir = sheetTmpDir('df-sheet-arm-out3-');
  const out = path.join(outDir, 'sheet.html');

  const result = runArm(
    `ui sheet __fixtures__/ui-spec/broken/route-without-back.md --out ${JSON.stringify(out)}`
  );

  assert.strictEqual(result.status, 1, `stdout: ${result.stdout}`);
  assert.ok(!fs.existsSync(out), 'a sheet derived from a spec nobody checked must not exist');

  const payload = parseStdout(result);
  assert.strictEqual(payload.ok, false);
  assert.ok(codesOf(payload).includes('ROUTE002'), JSON.stringify(payload.errors));
});

test('Case A4 — the hash the arm prints is the one sheetHash(buildSheetModel(...)) computes', () => {
  const renders = sheetTmpDir('df-sheet-arm-renders4-');
  const refs = sheetTmpDir('df-sheet-arm-refs4-');
  // One real render present, so the compared hash is not the trivial all-MISSING one.
  const spec = parseSurfaceSpec(fs.readFileSync(POSITIVE_CONTROL, 'utf-8')).frontMatter;
  const inProcess = sheetLib.buildSheetModel(spec, { renders, refs });
  fs.writeFileSync(path.join(renders, `${inProcess.rows[0].capture_id}.png`), Buffer.from('not really a png'));

  const outDir = sheetTmpDir('df-sheet-arm-out4-');
  const out = path.join(outDir, 'sheet.html');
  const result = runArm(
    `ui sheet __fixtures__/ui-spec/projects-rail.md --renders ${JSON.stringify(renders)} `
    + `--refs ${JSON.stringify(refs)} --out ${JSON.stringify(out)}`
  );
  assert.strictEqual(result.status, 0, result.stderr);

  const expected = sheetLib.sheetHash(sheetLib.buildSheetModel(spec, { renders, refs }));
  assert.strictEqual(parseStdout(result).sheet_hash, expected, 'the CLI must not have its own hashing path');
  assert.strictEqual(parseStdout(result).missing.length, 7, 'the one present render is not MISSING');
});

// ═════════════════════════════════════════════════════════════════════════════
// The look-lock, END TO END through the real binary (objective 34-07)
//
// ── Why these cases run the binary and MUTATE a real file ────────────────────
// The Definition of Done for this row is an ASYMMETRY: a `routes`/`controls`/`states` edit
// clears the lock, a prose edit does not. Asserting that the hash payload contains three keys
// does not prove it — that is the same claim restated. So every case below writes a lock into
// a temp copy of the positive control, EDITS that copy the way an author would, and re-reads
// the status out of `ui spec validate`'s own JSON.
//
// ── Nothing here touches a committed fixture ─────────────────────────────────
// `lockTmpSpec()` copies into a temp dir. The committed positive control's `acceptance:` block
// is a transcription of proposal §4.2's illustration — nobody approved that sheet, and 34-06's
// human-verify checkpoint is still outstanding. L5 reads it precisely BECAUSE it carries no
// `locked_shape_hash`: an unsigned illustration must report MISSING, not `held`.

const LOCK_SHEET_HASH = 'a'.repeat(64);
const LOCK_BY = 'mark@aocyber.ai';
const LOCK_AT = '2026-09-22';

function lockTmpSpec(name, transform) {
  const text = fs.readFileSync(POSITIVE_CONTROL, 'utf-8');
  return tmpSpec(name, typeof transform === 'function' ? transform(text) : text);
}

/** The positive control with its `acceptance:` block removed — never look-locked (L4). */
function stripAcceptance(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^acceptance:/.test(l));
  assert.ok(start !== -1, 'the positive control must carry an acceptance block to strip');
  let end = start + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) end += 1;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

/** `ui lock` through the real binary. */
function runLock(file, extra = '') {
  return runArm(
    `ui lock ${JSON.stringify(file)} --sheet-hash ${LOCK_SHEET_HASH} --by ${LOCK_BY} --at ${LOCK_AT} ${extra}`.trim()
  );
}

/** The `lock` object `ui spec validate` reports for `file`. */
function lockOf(file) {
  const result = runArm(`ui spec validate ${JSON.stringify(file)}`);
  const payload = parseStdout(result);
  assert.ok(payload.lock, `\`ui spec validate\` must report a top-level \`lock\` field: ${result.stdout}`);
  return { ...payload.lock, ok: payload.ok, status: result.status };
}

/** Edit one of §4.1's three keys, the way an author would, in the raw file. */
function edit(file, from, to) {
  const before = fs.readFileSync(file, 'utf-8');
  assert.ok(before.includes(from), `the fixture must contain ${JSON.stringify(from)} to edit`);
  fs.writeFileSync(file, before.replace(from, to), 'utf-8');
}

test('Case L1 — `ui lock` writes the block and `ui spec validate` then reports lock: held', () => {
  const file = lockTmpSpec('l1.md', stripAcceptance);
  assert.strictEqual(lockOf(file).lock, 'absent', 'precondition: no lock yet');

  const locked = runLock(file);
  assert.strictEqual(locked.status, 0, `stderr: ${locked.stderr}`);
  const payload = parseStdout(locked);
  assert.strictEqual(payload.locked_sheet, `sha256:${LOCK_SHEET_HASH}`);
  assert.strictEqual(payload.locked_by, LOCK_BY);
  assert.strictEqual(payload.locked_at, LOCK_AT);
  assert.match(payload.locked_shape_hash, /^sha256:[0-9a-f]{64}$/);

  const after = lockOf(file);
  assert.strictEqual(after.lock, 'held');
  assert.strictEqual(after.locked_by, LOCK_BY);
  assert.strictEqual(after.locked_at, LOCK_AT);
});

test('Case L2 — editing a CONTROL clears the lock, and the reason names `controls`', () => {
  const file = lockTmpSpec('l2.md', stripAcceptance);
  assert.strictEqual(runLock(file).status, 0);
  assert.strictEqual(lockOf(file).lock, 'held');

  edit(file, 'kind: disclosure-header', 'kind: button');

  const after = lockOf(file);
  assert.strictEqual(after.lock, 'cleared', 'a control change MUST clear a human approval');
  assert.match(after.reason, /controls/, 'the reason must name WHICH of the three changed');
  assert.doesNotMatch(after.reason, /routes/, 'and must not name a section that did not change');
  assert.doesNotMatch(after.reason, /states/);
});

test('Case L3 — editing ONLY the prose body leaves the lock HELD', () => {
  const file = lockTmpSpec('l3.md', stripAcceptance);
  assert.strictEqual(runLock(file).status, 0);
  const before = lockOf(file);
  assert.strictEqual(before.lock, 'held');

  // A real prose edit: a new paragraph in the body, and a typo fix in an existing one.
  const text = fs.readFileSync(file, 'utf-8');
  assert.ok(text.includes('## Intent'), 'the positive control must have a prose body to edit');
  fs.writeFileSync(
    file,
    `${text.replace('## Intent', '## Intent (revised)')}\n\nAn extra paragraph a reviewer asked for.\n`,
    'utf-8'
  );

  const after = lockOf(file);
  assert.strictEqual(after.lock, 'held', 'a prose edit must NOT clear a lock — §4.1 names three keys');
  assert.strictEqual(after.locked_at, before.locked_at, 'and must not silently re-date the approval');
});

test('Case L3b — editing `design_read`, `references` or `flows` also leaves the lock HELD', () => {
  // The three front-matter keys most likely to be reworded between reviews. If any of them
  // cleared a lock, the team would re-approve weekly without reading, which is the failure
  // mode this asymmetry exists to prevent.
  for (const [label, from, to] of [
    ['design_read', 'design_read: "utility rail; expression low, motion minimal, density compact"',
      'design_read: "utility rail; expression low, motion minimal, density comfortable"'],
    ['references', 'mockup: refs/projects-rail/mockup.png', 'mockup: refs/projects-rail/mockup-v2.png'],
    ['flows', 'id: open-project-conversation', 'id: open-project-conversation-v2']
  ]) {
    const file = lockTmpSpec(`l3b-${label}.md`, stripAcceptance);
    assert.strictEqual(runLock(file).status, 0);
    assert.strictEqual(lockOf(file).lock, 'held', `${label}: precondition`);
    edit(file, from, to);
    assert.strictEqual(lockOf(file).lock, 'held', `editing \`${label}\` must NOT clear the lock`);
  }
});

test('Case L3c — editing a ROUTE or a STATE clears it too, each naming its own section', () => {
  // Without this, L2's "names controls" could be satisfied by a constant string.
  const routeFile = lockTmpSpec('l3c-route.md', stripAcceptance);
  assert.strictEqual(runLock(routeFile).status, 0);
  edit(routeFile, 'path: /projects/:id/conversations', 'path: /projects/:id/threads');
  const routeAfter = lockOf(routeFile);
  assert.strictEqual(routeAfter.lock, 'cleared');
  assert.match(routeAfter.reason, /routes/);
  assert.doesNotMatch(routeAfter.reason, /controls/);

  const stateFile = lockTmpSpec('l3c-state.md', stripAcceptance);
  assert.strictEqual(runLock(stateFile).status, 0);
  edit(stateFile, 'seed: projects-0', 'seed: projects-none');
  const stateAfter = lockOf(stateFile);
  assert.strictEqual(stateAfter.lock, 'cleared');
  assert.match(stateAfter.reason, /states/);
  assert.doesNotMatch(stateAfter.reason, /routes/);
});

test('Case L4 — a spec with no `acceptance` block reports `absent`, not `cleared`', () => {
  // Never-locked and lock-broken are different situations for the human reading the output:
  // one needs a first review, the other needs a re-review. Collapsing them produces a message
  // that cannot be acted on.
  const file = lockTmpSpec('l4.md', stripAcceptance);
  const status = lockOf(file);
  assert.strictEqual(status.lock, 'absent');
  assert.match(status.reason, /never been look-locked/);
  assert.strictEqual(status.locked_by, null);
});

test('Case L5 — an acceptance block with no `locked_shape_hash` reports MISSING, never held', () => {
  // The committed positive control is exactly this case: its block is a transcription of
  // §4.2's illustration, carrying a sheet digest and a name but no shape hash. An
  // undeterminable lock is not a valid lock, and reporting it as `held` would launder an
  // illustration into a human approval.
  const status = lockOf(POSITIVE_CONTROL);
  assert.strictEqual(status.lock, 'MISSING');
  assert.match(status.reason, /locked_shape_hash/);
  assert.strictEqual(status.locked_by, 'mark@aocyber.ai', 'the recorded name is still reported');
});

test('Case L6 — `lock: cleared` does NOT set ok: false', () => {
  // A spec can be structurally perfect and un-approved. 34-08's refusal to compose reads the
  // two fields separately; collapsing them would make `ui spec validate` unusable as a
  // structural check during authoring, before any sheet exists.
  const file = lockTmpSpec('l6.md', stripAcceptance);
  assert.strictEqual(runLock(file).status, 0);
  edit(file, 'kind: disclosure-header', 'kind: button');

  const after = lockOf(file);
  assert.strictEqual(after.lock, 'cleared');
  assert.strictEqual(after.ok, true, 'a cleared lock is a STATUS, not a structural violation');
  assert.strictEqual(after.status, 0, 'and it must not flip the exit code either');
});

test('Case L7 — `ui lock` refuses an invalid spec, a bad --sheet-hash and an absent --by', () => {
  const broken = tmpSpec('l7-broken.md', fs.readFileSync(path.join(BROKEN_DIR, 'route-without-back.md'), 'utf-8'));
  const brokenBefore = fs.readFileSync(broken, 'utf-8');
  const invalid = runLock(broken);
  assert.strictEqual(invalid.status, 1, `stdout: ${invalid.stdout}`);
  assert.ok(codesOf(parseStdout(invalid)).includes('ROUTE002'), 'the verdict is printed, in validate\'s own shape');
  assert.strictEqual(fs.readFileSync(broken, 'utf-8'), brokenBefore, 'a lock on a broken spec writes nothing');

  const file = lockTmpSpec('l7.md', stripAcceptance);
  const before = fs.readFileSync(file, 'utf-8');

  const noHash = runArm(`ui lock ${JSON.stringify(file)} --by ${LOCK_BY}`);
  assert.strictEqual(noHash.status, 1);
  assert.match(noHash.stderr, /--sheet-hash/);

  const badHash = runArm(`ui lock ${JSON.stringify(file)} --sheet-hash deadbeef --by ${LOCK_BY}`);
  assert.strictEqual(badHash.status, 1);
  assert.match(badHash.stderr, /64 hex/);

  const noBy = runArm(`ui lock ${JSON.stringify(file)} --sheet-hash ${LOCK_SHEET_HASH}`);
  assert.strictEqual(noBy.status, 1);
  assert.match(noBy.stderr, /--by/);

  const noSpec = runArm(`ui lock __fixtures__/ui-spec/nonesuch.md --sheet-hash ${LOCK_SHEET_HASH} --by ${LOCK_BY}`);
  assert.strictEqual(noSpec.status, 1);
  assert.match(noSpec.stderr, /not found/);

  assert.strictEqual(fs.readFileSync(file, 'utf-8'), before, 'every refusal writes nothing');
  assert.doesNotMatch(noHash.stderr, /node:internal/, 'refusals are one line, not a stack trace');
});

test('Case L8 — `--at` defaults to today, and a locked spec still validates', () => {
  const file = lockTmpSpec('l8.md', stripAcceptance);
  const result = runArm(`ui lock ${JSON.stringify(file)} --sheet-hash ${LOCK_SHEET_HASH} --by ${LOCK_BY}`);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(parseStdout(result).locked_at, new Date().toISOString().slice(0, 10));

  // The lock must not break the thing it signs.
  const validated = runArm(`ui spec validate ${JSON.stringify(file)}`);
  assert.strictEqual(validated.status, 0, validated.stdout);
  assert.strictEqual(parseStdout(validated).ok, true);
});

test('Case L9 — `ui lock` NEVER dies with a stack trace on a spec `ui spec validate` accepts', () => {
  // Two documents that validate but that the raw-text splice used to choke on. Whatever the
  // arm decides about them, the one thing it may not do is escape its own refusal contract:
  // `{ok:false, code, msg}` -> one stderr line and exit 1. A stack trace tells the author
  // nothing about the spec and everything about the tool.
  const documents = {
    // A BOM: `parseSurfaceSpec` strips it, so validation passed while the writer compared the
    // first raw line against `---` and found `"﻿---"`.
    bom: (text) => '﻿' + text,
    // Mixed line endings: `parseSurfaceSpec` normalises them, the splice picks ONE.
    mixedEol: (text) => text.replace('\n## Intent', '\r\n## Intent')
  };

  for (const [label, transform] of Object.entries(documents)) {
    const file = lockTmpSpec(`l9-${label}.md`, (text) => transform(stripAcceptance(text)));

    // Precondition, asserted rather than assumed: the arm that JUDGES the spec says it is fine.
    const validated = runArm(`ui spec validate ${JSON.stringify(file)}`);
    assert.strictEqual(parseStdout(validated).ok, true, `${label}: precondition — the spec must validate`);

    const locked = runLock(file);
    assert.doesNotMatch(locked.stderr, /node:internal|\bat [A-Za-z]+ \(/,
      `${label}: ui lock must never print a stack trace — got:\n${locked.stderr}`);
    assert.ok(locked.status === 0 || locked.status === 1,
      `${label}: exit must be 0 (written) or 1 (refused), got ${locked.status}`);
    if (locked.status === 1) {
      assert.match(locked.stderr, /^Error: .+/m, `${label}: a refusal is a one-line Error: message`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// G: INCOMPLETE gets its own exit code — issue #90
//
// ── The defect ───────────────────────────────────────────────────────────────
// `ui spec validate` on the positive control, with no `--patterns`, printed a PAT000 row whose
// own message reads "§4.5 I5 is UNCHECKED for this spec, which is not the same as passing" —
// and then exited 0. A real violation exits 1. So the two outcomes a gate must tell apart —
// CHECKED AND CLEAN versus NEVER CHECKED — were the same number, and the shell idiom every gate
// is written with, `validate "$spec" || exit 1`, read an unchecked invariant as verified.
//
// ── The contract these cases pin ─────────────────────────────────────────────
//   0  every check ran, nothing violated
//   1  a real violation (unchanged — this is the plan's W1b gate and it does not move)
//   2  nothing violated, but one or more checks did not run
//
// `|| exit 1` now fails on 2, and a caller who genuinely accepts an incomplete check has to say
// so — `[ $? -eq 2 ]` — rather than inheriting it by accident.
//
// Exit 2 from `render`, `sheet` and `lock` means the artifact WAS produced. Only a 1 refuses.

const GATE_SENTINEL = 'GATE_FAILED';

/**
 * Run the obvious gate idiom — `cmd || fail` — in a REAL shell and report whether it failed.
 *
 * Not `result.status !== 0`: that is the assertion restated in the test's own words. The claim
 * is about what `sh` does with the code, so `sh` is what runs it.
 */
function gateFails(argv) {
  const cmd = `node ${JSON.stringify(DF_TOOLS)} ${argv} >/dev/null 2>&1 || echo ${GATE_SENTINEL}`;
  const r = spawnSync('sh', ['-c', cmd], { cwd: LIB_DIR, encoding: 'utf-8' });
  return (r.stdout || '').includes(GATE_SENTINEL);
}

test('Case G1 — an UNCHECKED invariant cannot pass a gate written the obvious way', () => {
  const spec = '__fixtures__/ui-spec/projects-rail.md';

  assert.strictEqual(
    gateFails(`ui spec validate ${spec}`), true,
    'a spec whose §4.5 I5 was never checked must NOT pass `ui spec validate "$spec" || exit 1`'
  );

  // The one-edit differential. Same spec, same gate, same shell — the ONLY change is that the
  // pattern catalogue is now reachable, i.e. that I5 was actually evaluated. Without this half
  // the case above passes for a tool that fails on everything.
  assert.strictEqual(
    gateFails(`ui spec validate ${spec} --patterns ${JSON.stringify(PATTERN_CATALOGUE)}`), false,
    'the same spec, CHECKED against a catalogue, must still pass the same gate'
  );

  // And the third outcome stays where it was: a real violation fails the gate too.
  assert.strictEqual(gateFails('ui spec validate __fixtures__/ui-spec/broken/route-without-back.md'), true);
});

test('Case G2 — the three exit codes are 0, 1 and 2, and they are distinguishable', () => {
  const spec = '__fixtures__/ui-spec/projects-rail.md';

  const checked = runArm(`ui spec validate ${spec} --patterns ${JSON.stringify(PATTERN_CATALOGUE)}`);
  assert.strictEqual(checked.status, 0, `checked and clean is 0: ${checked.stdout}${checked.stderr}`);

  const violation = runArm('ui spec validate __fixtures__/ui-spec/broken/route-without-back.md');
  assert.strictEqual(violation.status, 1, 'a real violation is 1 — the plan`s W1b gate, unchanged');

  const incomplete = runArm(`ui spec validate ${spec}`);
  assert.strictEqual(incomplete.status, 2, `an unchecked invariant is 2: ${incomplete.stdout}`);

  // 1 outranks 2: a broken spec whose I5 also did not run still reports the violation, because a
  // caller that only sorts zero from non-zero has to see the worse of the two.
  const both = runArm('ui spec validate __fixtures__/ui-spec/broken/route-without-back.md');
  assert.strictEqual(both.status, 1);
  assert.strictEqual(parseStdout(both).complete, false, 'and it still says it was incomplete');
});

test('Case G3 — the JSON cannot be misread by a consumer that reads only `ok`', () => {
  const spec = '__fixtures__/ui-spec/projects-rail.md';

  const incomplete = parseStdout(runArm(`ui spec validate ${spec}`));
  assert.strictEqual(incomplete.ok, true, 'nothing violated — `ok` is honestly named and does not move');
  assert.strictEqual(incomplete.complete, false, 'and `complete` sits beside it saying a check did not run');
  assert.deepStrictEqual(incomplete.unchecked, ['PAT000'], 'naming which one, joinable to errors[]');

  const checked = parseStdout(runArm(`ui spec validate ${spec} --patterns ${JSON.stringify(PATTERN_CATALOGUE)}`));
  assert.strictEqual(checked.ok, true);
  assert.strictEqual(checked.complete, true);
  assert.deepStrictEqual(checked.unchecked, []);

  // `complete` is adjacent to `ok` in the printed object, not buried after `errors` — a reader
  // scanning the first lines of the payload sees both halves of the answer.
  const keys = Object.keys(incomplete);
  assert.strictEqual(keys[0], 'ok');
  assert.strictEqual(keys[1], 'complete');
  assert.strictEqual(keys[2], 'unchecked');
});

test('Case G4 — `render` exits 2 on an incomplete verdict and still prints the artifact', () => {
  const spec = '__fixtures__/ui-spec/projects-rail.md';

  const incomplete = runArm(`ui spec render ${spec} --graph`);
  assert.strictEqual(incomplete.status, 2, `exit ${incomplete.status}: ${incomplete.stderr}`);
  assert.ok(incomplete.stdout.includes('flowchart') || incomplete.stdout.includes('graph'),
    `exit 2 is "incomplete", never "refused" — the artifact is still on stdout:\n${incomplete.stdout.slice(0, 200)}`);
  assert.ok(incomplete.stderr.includes('PAT000'), 'and the advisory still names the check that did not run');

  // The differential: the same render with the catalogue supplied is a 0, and the artifact bytes
  // are IDENTICAL — the exit code changed, the output did not.
  const checked = runArm(`ui spec render ${spec} --graph --patterns ${JSON.stringify(PATTERN_CATALOGUE)}`);
  assert.strictEqual(checked.status, 0, `exit ${checked.status}: ${checked.stderr}`);
  assert.strictEqual(checked.stdout, incomplete.stdout, 'exit 2 must not change one byte of the artifact');

  // A real violation is still a 1, and still renders nothing.
  const refused = runArm('ui spec render __fixtures__/ui-spec/broken/route-without-back.md --graph');
  assert.strictEqual(refused.status, 1);
});

test('Case G5 — `ui sheet` exits 2 when a state was never rendered, and still writes the sheet', () => {
  const renders = sheetTmpDir('df-sheet-g5-renders-');
  const refs = sheetTmpDir('df-sheet-g5-refs-');
  const outDir = sheetTmpDir('df-sheet-g5-out-');
  const out = path.join(outDir, 'sheet.html');
  const cat = JSON.stringify(PATTERN_CATALOGUE);

  // No renders at all: every declared state is a cell nobody has looked at. checkpoints.md's
  // look-lock variant says so in prose ("a MISSING cell is a state nobody has looked at"); the
  // exit code has to say it too, or `ui sheet … || fail` signs off on an empty sheet.
  const empty = runArm(
    `ui sheet __fixtures__/ui-spec/projects-rail.md --renders ${JSON.stringify(renders)} `
    + `--refs ${JSON.stringify(refs)} --out ${JSON.stringify(out)} --patterns ${cat}`
  );
  assert.strictEqual(empty.status, 2, `exit ${empty.status}: ${empty.stdout}${empty.stderr}`);
  assert.ok(fs.existsSync(out), 'exit 2 is "incomplete", never "refused" — the sheet WAS written');
  const emptyPayload = parseStdout(empty);
  assert.strictEqual(emptyPayload.complete, false);
  assert.strictEqual(emptyPayload.missing.length, 8);

  // Now supply a render for every declared capture. One edit — the renders — and the same
  // command is a 0.
  const spec = parseSurfaceSpec(fs.readFileSync(POSITIVE_CONTROL, 'utf-8')).frontMatter;
  for (const row of sheetLib.buildSheetModel(spec, { renders, refs }).rows) {
    fs.writeFileSync(path.join(renders, `${row.capture_id}.png`), Buffer.from('not really a png'));
  }
  const full = runArm(
    `ui sheet __fixtures__/ui-spec/projects-rail.md --renders ${JSON.stringify(renders)} `
    + `--refs ${JSON.stringify(refs)} --out ${JSON.stringify(out)} --patterns ${cat}`
  );
  assert.strictEqual(full.status, 0, `every state rendered and every check run is a 0: ${full.stdout}${full.stderr}`);
  const fullPayload = parseStdout(full);
  assert.strictEqual(fullPayload.complete, true);
  assert.deepStrictEqual(fullPayload.missing, []);

  // …and the spec half of completeness counts too: drop the catalogue and the SAME fully
  // rendered sheet is a 2 again, because §4.5 I5 was not evaluated for the spec behind it.
  const noCatalogue = runArm(
    `ui sheet __fixtures__/ui-spec/projects-rail.md --renders ${JSON.stringify(renders)} `
    + `--refs ${JSON.stringify(refs)} --out ${JSON.stringify(out)}`
  );
  assert.strictEqual(noCatalogue.status, 2, `stdout: ${noCatalogue.stdout}`);
  assert.deepStrictEqual(parseStdout(noCatalogue).unchecked, ['PAT000']);
});

test('Case G6 — `ui lock` over a spec with an unchecked invariant exits 2, and the lock IS written', () => {
  const file = lockTmpSpec('g6.md', stripAcceptance);

  const locked = runArm(`ui lock ${JSON.stringify(file)} --sheet-hash ${LOCK_SHEET_HASH} --by ${LOCK_BY}`);
  assert.strictEqual(locked.status, 2,
    `a signature recorded against a spec whose I5 never ran is incomplete: ${locked.stdout}${locked.stderr}`);
  assert.strictEqual(parseStdout(locked).locked_by, LOCK_BY, 'exit 2 is not a refusal — the lock was written');
  assert.match(fs.readFileSync(file, 'utf-8'), /locked_shape_hash/);

  // The differential: the same lock over the same spec, with the catalogue supplied, is a 0.
  const file2 = lockTmpSpec('g6b.md', stripAcceptance);
  const checked = runArm(
    `ui lock ${JSON.stringify(file2)} --sheet-hash ${LOCK_SHEET_HASH} --by ${LOCK_BY} `
    + `--patterns ${JSON.stringify(PATTERN_CATALOGUE)}`
  );
  assert.strictEqual(checked.status, 0, `${checked.stdout}${checked.stderr}`);

  // And a spec that does not validate is still a 1 that writes nothing.
  const outDir = sheetTmpDir('df-lock-g6-');
  const badCopy = path.join(outDir, 'broken.md');
  fs.copyFileSync(path.join(BROKEN_DIR, 'route-without-back.md'), badCopy);
  const refused = runArm(`ui lock ${JSON.stringify(badCopy)} --sheet-hash ${LOCK_SHEET_HASH} --by ${LOCK_BY}`);
  assert.strictEqual(refused.status, 1);
  assert.doesNotMatch(fs.readFileSync(badCopy, 'utf-8'), /locked_shape_hash/, 'nothing was written');
});
