'use strict';
// Tests for ui-spec-lock.cjs — the look-lock: writing a human's approval into the spec's own
// front matter, and clearing it on a SHAPE change only (objective 34-07).
//
// ── The one asymmetry this file exists to pin ────────────────────────────────
// §4.1: "any change to `routes`, `controls` or `states` clears `acceptance.locked_sheet`."
// Both halves have to be proven, and neither alone is worth anything:
//
//   * a lock that SURVIVES a shape change is a false approval — it reports that a human
//     looked at a surface they have never seen;
//   * a lock that DIES on a prose typo fix is unusable — the team learns to re-approve
//     without reading, which is strictly worse than no lock, because the file still says
//     "a human signed this off".
//
// S1 (nothing outside the three keys moves the hash) and S2-S4 (each of the three does) are
// therefore BOTH required: either alone passes on a constant. L2/L3 then prove the same
// asymmetry end to end, by really editing a spec and re-reading the status.
//
// ── Fixtures are GENERATED, never pasted ─────────────────────────────────────
// The spec-shaped objects below come from hand-built `route()`/`control()`/`state()`/`spec()`
// factories, and the on-disk specs are derived from the committed positive control by explicit
// line surgery (`withoutAcceptance`, `acceptanceMovedBeforeFlows`). CLAUDE.md habit 4:
// generate the script, not the data.
//
// ── This file NEVER writes a lock into a committed fixture ───────────────────
// Every `writeLock` call in here targets a copy in a temp directory. The committed positive
// control's `acceptance:` block is a TRANSCRIPTION of proposal §4.2's illustration — nobody
// has approved that sheet, and 34-06's human-verify checkpoint is still outstanding.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseSurfaceSpec } = require('./ui-spec.cjs');
const { validateSurfaceSpec } = require('./ui-spec-validate.cjs');
const lock = require('./ui-spec-lock.cjs');

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'ui-spec');
const POSITIVE_CONTROL = path.join(FIXTURE_DIR, 'projects-rail.md');
const BROKEN_DIR = path.join(FIXTURE_DIR, 'broken');

const SHEET_HASH = 'a'.repeat(64);
const BY = 'mark@aocyber.ai';
const AT = '2026-09-22';

const TMP_DIRS = [];

test.after(() => {
  for (const dir of TMP_DIRS) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function tmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  TMP_DIRS.push(dir);
  return dir;
}

// ─── Spec-object generators (S cases) ────────────────────────────────────────
//
// Hand-built factories, each taking an override map. shapeHash validates nothing, so these
// need only be spec-SHAPED — the point is which keys the hash reads, not whether the spec
// would pass §4.5.

function route(over = {}) {
  return {
    id: 'one.root',
    path: '/one',
    entry: ['deeplink'],
    root: true,
    reachable_from_nav: true,
    title: 'One',
    ...over
  };
}

function control(over = {}) {
  return {
    id: 'one.button',
    kind: 'button',
    visible_in: ['populated'],
    does: 'opens the thing',
    effect: ['navigation'],
    ...over
  };
}

function state(over = {}) {
  return {
    id: 'populated',
    seed: 'one-thing',
    content: { must_show: ['One'], must_not_show: [] },
    ...over
  };
}

function spec(over = {}) {
  return {
    surface: 'one',
    schema_version: 1,
    patterns: ['navigation/section-caption'],
    references: { mockup: 'refs/one/mockup.png' },
    design_read: 'utility rail; expression low',
    mode: 'redesign',
    routes: [route()],
    controls: [control()],
    states: [state()],
    flows: [{ id: 'f', steps: [{ click: 'one.button', expect: { route: 'one.root' } }] }],
    scope_rules: [{ on: 'workspace-switch', reset: ['selected'] }],
    ...over
  };
}

// ─── On-disk spec generators (A cases) ───────────────────────────────────────

/** The raw bytes of the committed positive control. Never modified in place. */
function positiveControlText() {
  return fs.readFileSync(POSITIVE_CONTROL, 'utf-8');
}

/** Split raw spec text into its front-matter LINES and the byte-exact remainder. */
function splitRaw(text) {
  const lines = text.split('\n');
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  assert.ok(close !== -1, 'the fixture must have a closing front-matter fence');
  return { front: lines.slice(1, close), body: lines.slice(close + 1).join('\n') };
}

function joinRaw(front, body) {
  return ['---', ...front, '---', body].join('\n');
}

/** The index range of the top-level `acceptance:` block within front-matter lines. */
function acceptanceRange(front) {
  const start = front.findIndex((l) => /^acceptance:/.test(l));
  if (start === -1) return null;
  let end = start + 1;
  while (end < front.length && /^\s+\S/.test(front[end])) end += 1;
  return { start, end };
}

/** The positive control with its `acceptance:` block removed — the INSERT path. */
function withoutAcceptance(text) {
  const { front, body } = splitRaw(text);
  const range = acceptanceRange(front);
  assert.ok(range, 'the positive control must carry an acceptance block to remove');
  return joinRaw([...front.slice(0, range.start), ...front.slice(range.end)], body);
}

/**
 * The positive control with its `acceptance:` block MOVED to sit before `flows:`.
 *
 * Needed because in the committed fixture `acceptance:` is the LAST front-matter key, so
 * "every line after the block is byte-identical" would assert over an empty list — a green
 * assertion proving nothing. With the block in the middle, A2's tail comparison is real.
 */
function acceptanceMovedBeforeFlows(text) {
  const { front, body } = splitRaw(text);
  const range = acceptanceRange(front);
  assert.ok(range, 'the positive control must carry an acceptance block to move');
  const block = front.slice(range.start, range.end);
  const rest = [...front.slice(0, range.start), ...front.slice(range.end)];
  const flowsAt = rest.findIndex((l) => /^flows:/.test(l));
  assert.ok(flowsAt !== -1, 'the positive control must declare `flows:` for this generator');
  return joinRaw([...rest.slice(0, flowsAt), ...block, '', ...rest.slice(flowsAt)], body);
}

/** Write `text` into a fresh temp dir and return the path. */
function specFile(name, text) {
  return (() => {
    const file = path.join(tmpDir('ui-spec-lock-'), name);
    fs.writeFileSync(file, text, 'utf-8');
    return file;
  })();
}

function frontMatterOf(file) {
  return parseSurfaceSpec(fs.readFileSync(file, 'utf-8'), { source: file }).frontMatter;
}

// ═════════════════════════════════════════════════════════════════════════════
// S — the shape hash: three keys, and nothing else
// ═════════════════════════════════════════════════════════════════════════════

test('Case S1 — nothing OUTSIDE {routes, controls, states} moves the shape hash', () => {
  const base = spec();
  const baseline = lock.shapeHash(base);

  // Each of these is a real edit to a real key the schema declares — and none of them is one
  // of §4.1's three. A human who approved the sheet does not need to look again because the
  // design read was reworded.
  const variants = {
    design_read: spec({ design_read: 'CHANGED — expression high, motion generous' }),
    references: spec({ references: { mockup: 'refs/one/other.png', donor: 'refs/one/donor/' } }),
    patterns: spec({ patterns: ['navigation/disclosure-group'] }),
    mode: spec({ mode: 'greenfield' }),
    flows: spec({ flows: [] }),
    scope_rules: spec({ scope_rules: [] }),
    surface: spec({ surface: 'renamed' }),
    acceptance: spec({ acceptance: { locked_by: 'someone@else.test' } })
  };

  for (const [key, variant] of Object.entries(variants)) {
    assert.strictEqual(
      lock.shapeHash(variant), baseline,
      `editing \`${key}\` must NOT move the shape hash — it is not one of §4.1's three keys`
    );
  }
});

test('Case S2 — a ROUTE change moves the shape hash', () => {
  const baseline = lock.shapeHash(spec());

  const added = spec({ routes: [route(), route({ id: 'two', path: '/two', root: false, back: { target: 'one.root' } })] });
  const repathed = spec({ routes: [route({ path: '/one-renamed' })] });
  const backRemoved = spec({ routes: [route({ back: { target: 'one.root' } })] });

  assert.notStrictEqual(lock.shapeHash(added), baseline, 'adding a route must move the hash');
  assert.notStrictEqual(lock.shapeHash(repathed), baseline, 'changing a `path` must move the hash');
  assert.notStrictEqual(lock.shapeHash(backRemoved), baseline, 'changing `back` must move the hash');
});

test('Case S3 — a CONTROL change moves the shape hash', () => {
  const baseline = lock.shapeHash(spec());

  const added = spec({ controls: [control(), control({ id: 'one.chevron', kind: 'toggle' })] });
  const doesEdited = spec({ controls: [control({ does: 'opens the OTHER thing' })] });
  const behaviorsAdded = spec({
    controls: [control({
      does: undefined,
      behaviors: [{ when: { viewport: 'desktop' }, does: 'opens the thing', effect: ['navigation'] }]
    })]
  });

  assert.notStrictEqual(lock.shapeHash(added), baseline, 'adding a control must move the hash');
  assert.notStrictEqual(lock.shapeHash(doesEdited), baseline, 'editing a `does` must move the hash');
  assert.notStrictEqual(lock.shapeHash(behaviorsAdded), baseline, 'adding `behaviors` must move the hash');
});

test('Case S4 — a STATE change moves the shape hash', () => {
  const baseline = lock.shapeHash(spec());

  const added = spec({ states: [state(), state({ id: 'empty', seed: 'zero-things' })] });
  const reseeded = spec({ states: [state({ seed: 'two-things' })] });
  const contentEdited = spec({ states: [state({ content: { must_show: ['Two'], must_not_show: [] } })] });

  assert.notStrictEqual(lock.shapeHash(added), baseline, 'adding a state must move the hash');
  assert.notStrictEqual(lock.shapeHash(reseeded), baseline, 'changing a `seed` must move the hash');
  assert.notStrictEqual(lock.shapeHash(contentEdited), baseline, 'editing `content.must_show` must move the hash');
});

test('Case S5 — key INSERTION ORDER does not move the shape hash', () => {
  // Same three sections, authored in a different key order at both levels. `JSON.stringify`
  // alone is insertion-ordered, so without a sorted-key serialiser two identical specs would
  // hash differently and clear each other's locks (34-06 case H3, same reasoning).
  const a = { routes: [{ id: 'r', path: '/r', root: true }], controls: [{ id: 'c', kind: 'button' }], states: [{ id: 's', seed: 'x' }] };
  const b = { states: [{ seed: 'x', id: 's' }], controls: [{ kind: 'button', id: 'c' }], routes: [{ root: true, path: '/r', id: 'r' }] };

  assert.strictEqual(lock.shapeHash(a), lock.shapeHash(b));
});

test('Case S6 — `flows` is deliberately OUTSIDE the shape hash', () => {
  // NOT an oversight. §4.1's re-lock rule names `routes`, `controls` and `states` and nothing
  // else, and a flow is a walk over structure a reviewer has already seen — the routes it
  // visits and the controls it clicks are all in the hash already. "Flows are surely part of
  // the shape" is the obvious wrong intuition; this case is here so the next person to have it
  // finds a pinned decision rather than a gap. If W1★ rules the other way it is a one-line
  // change to `shapePayload` and this assertion inverts.
  const withFlow = spec({ flows: [{ id: 'open', steps: [{ click: 'one.button', expect: { route: 'one.root' } }] }] });
  const noFlows = spec({ flows: [] });
  const otherFlow = spec({ flows: [{ id: 'different', steps: [{ back: 'app-back', expect: { route: 'one.root' } }] }] });

  assert.strictEqual(lock.shapeHash(withFlow), lock.shapeHash(noFlows));
  assert.strictEqual(lock.shapeHash(withFlow), lock.shapeHash(otherFlow));

  // And the payload really contains no `flows` key — read it, do not infer it.
  const payload = JSON.parse(lock.canonicalShapeJson(withFlow));
  assert.deepStrictEqual(Object.keys(payload).sort(), ['controls', 'routes', 'states']);
});

// ═════════════════════════════════════════════════════════════════════════════
// A — writeLock: the acceptance block, spliced in, with the prose untouched
// ═════════════════════════════════════════════════════════════════════════════

test('Case A1 — writeLock records sheet, by, at and the shape hash, and the spec still validates', () => {
  const file = specFile('rail.md', withoutAcceptance(positiveControlText()));

  const res = lock.writeLock(file, { sheetHash: SHEET_HASH, by: BY, at: AT });
  assert.strictEqual(res.ok, true, `writeLock refused: ${res.msg}`);

  const fm = frontMatterOf(file);
  assert.ok(fm.acceptance, 'an `acceptance` block must exist after the lock');
  assert.strictEqual(fm.acceptance.locked_sheet, `sha256:${SHEET_HASH}`);
  assert.strictEqual(fm.acceptance.locked_by, BY);
  assert.strictEqual(fm.acceptance.locked_at, AT);
  assert.match(fm.acceptance.locked_at, /^\d{4}-\d{2}-\d{2}$/, 'locked_at is an ISO date');
  assert.strictEqual(fm.acceptance.locked_shape_hash, `sha256:${lock.shapeHash(fm)}`);

  // The lock must not break the thing it approves. A spec that stops validating the moment it
  // is signed is a tool that edits the artifact out from under the human.
  const verdict = validateSurfaceSpec(fm, {});
  assert.strictEqual(verdict.ok, true, `the locked spec must still validate: ${JSON.stringify(verdict.errors)}`);
});

test('Case A2 — the prose body and every untouched front-matter line are BYTE-identical', () => {
  // `acceptance:` sits mid-front-matter here, so the "lines after the block" comparison is a
  // real one rather than an empty-list green.
  const file = specFile('rail.md', acceptanceMovedBeforeFlows(positiveControlText()));
  const before = fs.readFileSync(file, 'utf-8');

  const res = lock.writeLock(file, { sheetHash: SHEET_HASH, by: BY, at: AT });
  assert.strictEqual(res.ok, true, `writeLock refused: ${res.msg}`);
  const after = fs.readFileSync(file, 'utf-8');

  const b = splitRaw(before);
  const a = splitRaw(after);

  assert.strictEqual(a.body, b.body, 'the prose body must come back byte-identical');

  const rb = acceptanceRange(b.front);
  const ra = acceptanceRange(a.front);
  assert.ok(rb && ra, 'both versions carry an acceptance block');
  assert.ok(rb.end < b.front.length, 'the generator must leave lines AFTER the block');

  assert.deepStrictEqual(a.front.slice(0, ra.start), b.front.slice(0, rb.start),
    'front-matter lines BEFORE the acceptance block must be byte-identical');
  assert.deepStrictEqual(a.front.slice(ra.end), b.front.slice(rb.end),
    'front-matter lines AFTER the acceptance block must be byte-identical');
});

test('Case A3 — writeLock REFUSES a spec that does not validate, and writes nothing', () => {
  const broken = fs.readFileSync(path.join(BROKEN_DIR, 'route-without-back.md'), 'utf-8');
  const file = specFile('broken.md', broken);
  const before = fs.readFileSync(file, 'utf-8');

  const res = lock.writeLock(file, { sheetHash: SHEET_HASH, by: BY, at: AT });

  assert.strictEqual(res.ok, false, 'a signature on a broken spec is worse than no signature');
  assert.ok(res.verdict && Array.isArray(res.verdict.errors), 'the refusal carries the verdict');
  assert.ok(res.verdict.errors.some((e) => e.code === 'ROUTE002'), 'the verdict names the real violation');
  assert.strictEqual(fs.readFileSync(file, 'utf-8'), before, 'the file must be untouched, byte for byte');
});

test('Case A4 — a bad or absent --sheet-hash, and an absent --by, are refusals', () => {
  const text = withoutAcceptance(positiveControlText());

  const cases = [
    ['sheet hash absent', { by: BY, at: AT }, /sheet-hash/],
    ['sheet hash too short', { sheetHash: 'abc', by: BY, at: AT }, /64 hex/],
    ['sheet hash not hex', { sheetHash: 'z'.repeat(64), by: BY, at: AT }, /64 hex/],
    ['by absent', { sheetHash: SHEET_HASH, at: AT }, /--by/],
    ['by empty', { sheetHash: SHEET_HASH, by: '   ', at: AT }, /--by/],
    ['at not an ISO date', { sheetHash: SHEET_HASH, by: BY, at: 'yesterday' }, /--at/]
  ];

  for (const [label, opts, pattern] of cases) {
    const file = specFile('rail.md', text);
    const before = fs.readFileSync(file, 'utf-8');
    const res = lock.writeLock(file, opts);
    assert.strictEqual(res.ok, false, `${label}: must refuse`);
    assert.match(res.msg, pattern, `${label}: the refusal names the requirement`);
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), before, `${label}: nothing written`);
  }

  // `at` defaults to today and is overridable — a test that asserted today's literal date
  // would fail at midnight, so this asserts the SHAPE and that the override wins.
  const file = specFile('rail.md', text);
  const res = lock.writeLock(file, { sheetHash: SHEET_HASH, by: BY });
  assert.strictEqual(res.ok, true, `writeLock refused: ${res.msg}`);
  assert.strictEqual(frontMatterOf(file).acceptance.locked_at, new Date().toISOString().slice(0, 10));
});

test('Case A5 — re-locking OVERWRITES the acceptance block and does not duplicate keys', () => {
  // Re-locking after a shape change is the NORMAL path, not an edge case: that is what §4.1's
  // re-lock rule produces every time a control is edited.
  const file = specFile('rail.md', positiveControlText()); // already carries an acceptance block

  assert.strictEqual(lock.writeLock(file, { sheetHash: SHEET_HASH, by: BY, at: AT }).ok, true);
  const second = 'b'.repeat(64);
  assert.strictEqual(lock.writeLock(file, { sheetHash: second, by: 'someone@else.test', at: '2026-09-23' }).ok, true);

  const raw = fs.readFileSync(file, 'utf-8');
  const { front } = splitRaw(raw);

  assert.strictEqual(front.filter((l) => /^acceptance:/.test(l)).length, 1, 'exactly one acceptance key');
  for (const key of ['locked_sheet', 'locked_by', 'locked_at', 'locked_shape_hash']) {
    assert.strictEqual(
      front.filter((l) => new RegExp(`^\\s+${key}:`).test(l)).length, 1,
      `exactly one \`${key}\` line after a re-lock`
    );
  }

  const fm = frontMatterOf(file);
  assert.strictEqual(fm.acceptance.locked_sheet, `sha256:${second}`);
  assert.strictEqual(fm.acceptance.locked_by, 'someone@else.test');
  assert.strictEqual(fm.acceptance.locked_at, '2026-09-23');
});

test('Case A6 — a `--by` carrying YAML punctuation round-trips; the signed spec still parses', () => {
  const text = withoutAcceptance(positiveControlText());

  // Every signer below is a legal thing to type after `--by`, and every one of them is
  // YAML-SIGNIFICANT when the value is emitted BARE. This is the worst failure shape this
  // command has: `ui lock` exits 0 and prints a success record, and the very next
  // `ui spec validate` of the file it just signed reports SPEC000 + `lock: MISSING` — which
  // reads as a parser bug or an authoring mistake, never as a lock bug.
  const signers = [
    "O'Brien",            // an apostrophe — read as an opening single quote
    'mark # 2',           // ` #` — truncates the value at the hash
    'Say "hi"',           // a double quote — closes whatever quoting is emitted
    'ops: release',       // a `: ` — a SECOND key appears on the line
    '{not a map}',        // a flow head — parsed as a mapping, not as a name
    '*alias-looking',     // refused outright as an alias
    '&anchor-looking',    // refused outright as an anchor
    'back\\slash',        // a backslash — an escape inside a double-quoted scalar
    '   padded   '        // trimmed by writeLock, so the round-trip target is the TRIMMED form
  ];

  for (const raw of signers) {
    const by = raw.trim();
    const label = JSON.stringify(raw);
    const file = specFile('rail.md', text);

    const res = lock.writeLock(file, { sheetHash: SHEET_HASH, by: raw, at: AT });
    assert.strictEqual(res.ok, true, `${label}: writeLock refused: ${res.msg}`);

    let fm;
    try {
      fm = frontMatterOf(file);
    } catch (e) {
      assert.fail(`${label}: the spec ui lock just signed no longer parses — ${e.message}`);
    }

    assert.strictEqual(fm.acceptance.locked_by, by, `${label}: locked_by must round-trip verbatim`);
    assert.strictEqual(fm.acceptance.locked_at, AT, `${label}: locked_at must round-trip`);
    assert.strictEqual(fm.acceptance.locked_sheet, `sha256:${SHEET_HASH}`, `${label}: locked_sheet must round-trip`);

    const verdict = validateSurfaceSpec(fm, {});
    assert.strictEqual(verdict.ok, true,
      `${label}: the signed spec must still validate: ${JSON.stringify(verdict.errors)}`);

    // It must also READ BACK as held. A block that parses but loses `locked_shape_hash` would
    // report MISSING — green on "it still parses", worthless as a lock.
    assert.strictEqual(lock.lockStatus(fm).lock, 'held', `${label}: the fresh lock must read back as held`);
  }
});

test('Case A7 — a `--by` that cannot be written on one line is a REFUSAL, not a corrupted spec', () => {
  // The `acceptance:` block is spliced in LINE by line. A newline — or any control character —
  // in the signer would split the block and leave the tail of the name parsed as a key. The
  // contract is `{ok:false, code, msg}` and an untouched file, never a best-effort write.
  const text = withoutAcceptance(positiveControlText());

  for (const by of ['two\nlines', 'tab\there', `nul${String.fromCharCode(0)}byte`]) {
    const label = JSON.stringify(by);
    const file = specFile('rail.md', text);
    const before = fs.readFileSync(file, 'utf-8');

    const res = lock.writeLock(file, { sheetHash: SHEET_HASH, by, at: AT });

    assert.strictEqual(res.ok, false, `${label}: must refuse`);
    assert.match(res.msg, /--by/, `${label}: the refusal names the flag it is about`);
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), before, `${label}: nothing written`);
  }
});

test('Case A8 — a BOM-prefixed spec locks like any other, and keeps its BOM', () => {
  // `parseSurfaceSpec` strips a leading BOM, so a BOM'd spec VALIDATES. The splice then re-read
  // the raw bytes and compared `lines[0] !== '---'` against `"﻿---"`. The two halves
  // disagreed about the same file: validation said yes, the writer threw — and because nothing
  // caught it, `ui lock` died with a stack trace instead of its documented refusal.
  const BOM = '﻿';
  const file = specFile('rail.md', BOM + withoutAcceptance(positiveControlText()));

  const res = lock.writeLock(file, { sheetHash: SHEET_HASH, by: BY, at: AT });
  assert.strictEqual(res.ok, true, `writeLock refused a spec that validates: ${res.code} ${res.msg}`);

  const after = fs.readFileSync(file, 'utf-8');
  assert.ok(after.startsWith(BOM), 'the BOM the author had must survive — the writer edits the block, not the encoding');

  const fm = frontMatterOf(file);
  assert.strictEqual(fm.acceptance.locked_by, BY);
  assert.strictEqual(lock.lockStatus(fm).lock, 'held');
});

test('Case A9 — a document the splice cannot navigate REFUSES; writeLock never throws', () => {
  // The contract every caller codes against is `{ok:false, code, msg}` — `cmdUiLock` prints
  // `msg` and exits 1. A throw escapes that contract entirely and reaches the user as a stack
  // trace, which is the one output shape this CLI promises never to produce.
  //
  // The generator is a REAL divergence between the two halves, not a synthetic one:
  // `parseSurfaceSpec` normalises every line ending before it parses, so a document with MIXED
  // endings VALIDATES; the splice picks ONE end-of-line for the whole file and then cannot find
  // the fence. Same file, two answers — exactly the class the BOM case belongs to.
  const text = withoutAcceptance(positiveControlText());
  const mixed = text.replace('\n## Intent', '\r\n## Intent');
  assert.notStrictEqual(mixed, text, 'the generator must actually have introduced a CRLF');

  const file = specFile('rail.md', mixed);
  const before = fs.readFileSync(file, 'utf-8');

  let res;
  assert.doesNotThrow(() => { res = lock.writeLock(file, { sheetHash: SHEET_HASH, by: BY, at: AT }); },
    'writeLock must return a refusal, never throw');

  assert.strictEqual(res.ok, false, 'a document the splice cannot navigate is a refusal');
  assert.strictEqual(typeof res.code, 'string', 'a refusal carries a code');
  assert.ok(res.msg.length > 0, 'a refusal carries a message a human can act on');
  assert.strictEqual(fs.readFileSync(file, 'utf-8'), before, 'a refusal writes nothing');
});

// ═════════════════════════════════════════════════════════════════════════════
// P — the prose, ASSERTED rather than reviewed
//
// The wave-0 retrospective's failure class was prose that named a command which did not
// exist. Proposal §21 amendment 1 makes the check executable, so P2 below extracts every
// `df-tools.cjs …` string out of the sections this TRD added and RUNS each one's subcommand.
//
// EXTRACTION GUARD FIRST (`verifier-ui-eval-invocation.test.cjs`'s V4 pattern): a regex that
// matches zero times and a loop that iterates zero times is a green test proving nothing. Each
// case below asserts that the section exists and that the extraction found something, BEFORE
// asserting anything about the content.
// ═════════════════════════════════════════════════════════════════════════════

const { spawnSync } = require('node:child_process');

const DEVFLOW_ROOT = path.join(__dirname, '..', '..');
const DF_TOOLS = path.join(DEVFLOW_ROOT, 'bin', 'df-tools.cjs');
const CHECKPOINTS_MD = path.join(DEVFLOW_ROOT, 'references', 'checkpoints.md');
const EXECUTOR_MD = path.join(DEVFLOW_ROOT, '..', 'agents', 'executor.md');

const LOOK_LOCK_HEADING = '### look-lock variant';

/** The `look-lock` section of checkpoints.md, bounded by the next heading of any level. */
function lookLockSection() {
  const md = fs.readFileSync(CHECKPOINTS_MD, 'utf-8');
  const start = md.indexOf(LOOK_LOCK_HEADING);
  assert.ok(start !== -1, `checkpoints.md must contain a "${LOOK_LOCK_HEADING}" heading`);
  const rest = md.slice(start + LOOK_LOCK_HEADING.length);
  const nextHeading = rest.search(/\n#{1,6} /);
  const nextCloseTag = rest.search(/\n<\/[A-Za-z_][A-Za-z0-9_-]*>\s*\n/);
  const ends = [nextHeading, nextCloseTag].filter((i) => i !== -1);
  const end = ends.length ? Math.min(...ends) : rest.length;
  return LOOK_LOCK_HEADING + rest.slice(0, end);
}

test('Case P1 — checkpoints.md documents the look-lock variant, end to end', () => {
  const section = lookLockSection();
  assert.ok(section.length > 200, 'the look-lock section must actually say something');

  // It is a VARIANT of human-verify, not a fourth checkpoint type — the three-type taxonomy
  // is load-bearing for the orchestrator.
  const md = fs.readFileSync(CHECKPOINTS_MD, 'utf-8');
  assert.ok(
    md.indexOf('## checkpoint:human-verify') < md.indexOf(LOOK_LOCK_HEADING)
      && md.indexOf(LOOK_LOCK_HEADING) < md.indexOf('## checkpoint:decision'),
    'the look-lock section must sit INSIDE the human-verify section, not beside it as a fourth type'
  );
  assert.doesNotMatch(section, /checkpoint:look-lock/, 'look-lock is a variant, never its own `type=`');

  // What approval runs, what the human is shown, and what rejection does.
  assert.match(section, /df-tools\.cjs ui lock/, 'it must name the command approval runs');
  assert.match(section, /sheet_hash/, 'it must name the hash the human is approving');
  assert.match(section, /missing/i, 'it must name the MISSING capture list the human is shown');
  assert.match(section, /reject/i, 'it must state what a rejection does');
  assert.match(section, /not\s+written|no\s+lock\s+is\s+written/i, 'a rejection must write no lock');

  // Autonomous mode: never blind-approved. A look-lock is a design decision, not a functional
  // verification — the verifier agent cannot stand in for the human here.
  assert.match(section, /autonomous/i, 'it must state the autonomous-mode rule');
  assert.match(section, /never\s+(blind-)?approved|falls?\s+through\s+to\s+the\s+user/i,
    'the autonomous-mode rule must say a look-lock is never blind-approved');
});

test('Case P2 — every `df-tools.cjs` command the new prose names is a REAL arm', () => {
  const sources = {
    'checkpoints.md': lookLockSection(),
    'executor.md': (() => {
      const md = fs.readFileSync(EXECUTOR_MD, 'utf-8');
      const hits = [...md.matchAll(/^.*look-lock.*$/gm)].map((m) => m[0]);
      assert.ok(hits.length > 0, 'executor.md must reference the look-lock variant');
      return hits.join('\n');
    })()
  };

  // Extract `df-tools.cjs ui <subcommand>` occurrences. The `ui` family is the one this TRD
  // touches; a bare `df-tools.cjs <other>` in the same prose is out of scope for this net.
  //
  // `ui spec` is a TWO-LEVEL arm, so the chain is captured whole. Capturing only the first
  // word would run `ui spec /nonexistent.md` and read back "Unknown ui spec subcommand" — the
  // net would then fail for correct prose and, worse, could never tell a real missing
  // second-level arm (`ui spec lock`, say) from that artefact.
  const found = [];
  for (const [label, text] of Object.entries(sources)) {
    for (const m of text.matchAll(/df-tools\.cjs\s+ui\s+(spec\s+[a-z-]+|[a-z-]+)/g)) {
      found.push({ label, sub: m[1].replace(/\s+/g, ' ') });
    }
  }
  assert.ok(found.length > 0, 'the extraction found no `df-tools.cjs ui …` command — P2 cannot pin what it cannot find');
  assert.ok(found.some((f) => f.sub === 'lock'), 'the approval command `ui lock` must be among them');

  // RUN each one, with a nonexistent spec. A REGISTERED arm refuses with "spec not found";
  // an unregistered one refuses with "Unknown ui subcommand" — which is exactly the wave-0
  // failure class, one level up.
  for (const { label, sub } of found) {
    const argv = ['ui', ...sub.split(' '), '/nonexistent/spec-that-does-not-exist.md'];
    const r = spawnSync('node', [DF_TOOLS, ...argv], { encoding: 'utf-8' });
    const stderr = r.stderr || '';
    assert.doesNotMatch(
      stderr, /Unknown ui (spec )?subcommand/,
      `${label} names \`ui ${sub}\`, which df-tools does not register`
    );
    assert.match(stderr, /not found/, `\`ui ${sub}\` should refuse a nonexistent spec by name (${label}); got: ${stderr}`);
  }
});

test('Case P3 — 34-10\'s agent-shell harness suite is still green after the executor.md edit', () => {
  // This TRD edits an agent file, so 34-10's gate applies. Run it; do not assume. The harness
  // is the authority on what `agents/executor.md` may contain.
  const r = spawnSync('node', ['--test', 'agent-shell-harness.test.cjs'], { cwd: __dirname, encoding: 'utf-8' });
  assert.strictEqual(r.status, 0, `the harness suite went red:\n${r.stdout}\n${r.stderr}`);
});
