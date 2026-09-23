'use strict';
// Tests for ui-sheet.cjs — the §8.3 review sheet, and the `sheet_hash` that survives a
// template edit (objective 34-06).
//
// ── Why the hash cases come first ────────────────────────────────────────────
// §8.3 records the sheet hash into `acceptance.locked_sheet`, and 34-07's look-lock clears
// only on a `routes`/`controls`/`states` change. If the hash tracked the rendered HTML, every
// CSS tweak would invalidate a human's approval — and within two weeks the lock would be
// re-approved without being read, which is strictly worse than no lock at all. H1 and H2
// together pin it: H1 that a template edit does NOT move the hash, H2 that a spec change DOES.
// H1 alone passes on a constant.
//
// ── Fixtures are GENERATED, never pasted ─────────────────────────────────────
// `makePng()` below builds a real, valid PNG byte-for-byte (signature, IHDR, a deflated IDAT,
// IEND, each with its own CRC32). CLAUDE.md habit 4: generate the script, not the data. It is
// what lets H4 write DIFFERENT PIXELS to the SAME PATH and assert the hash did not move —
// which a checked-in blob could not do without a second checked-in blob.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const { parseSurfaceSpec } = require('./ui-spec.cjs');
const sheet = require('./ui-sheet.cjs');

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'ui-spec');
const POSITIVE_CONTROL = path.join(FIXTURE_DIR, 'projects-rail.md');

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

function loadSpec() {
  return parseSurfaceSpec(fs.readFileSync(POSITIVE_CONTROL, 'utf-8'), { source: POSITIVE_CONTROL }).frontMatter;
}

// ─── The render fixture generator ────────────────────────────────────────────
//
// A hand-built PNG encoder: 8-bit truecolour, one solid colour, one filter byte per row.
// ~30 lines and no dependency, against a checked-in binary blob that nobody can vary.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** A real PNG of one solid colour. `makePng(240, 160, [0x2e, 0x5b, 0xff])`. */
function makePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type 2 = truecolour RGB
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const off = y * stride;
    raw[off] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      raw[off + 1 + x * 3] = rgb[0];
      raw[off + 2 + x * 3] = rgb[1];
      raw[off + 3 + x * 3] = rgb[2];
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * A renders directory holding a PNG per named capture_id, and nothing for the rest.
 * `missing` is documentation, not behaviour: a capture with no file is MISSING by absence,
 * and naming it here is what makes the intent of a case readable.
 */
function makeRenders({ present = [], missing = [], rgb = [0x2e, 0x5b, 0xff] } = {}) {
  const dir = tmpDir('df-ui-sheet-renders-');
  for (const id of present) fs.writeFileSync(path.join(dir, `${id}.png`), makePng(64, 40, rgb));
  void missing;
  return dir;
}

/** A refs directory with `<kind>/<file>` laid out the way §4.2's `references` block reads. */
function makeRefs(entries = []) {
  const dir = tmpDir('df-ui-sheet-refs-');
  for (const rel of entries) {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, makePng(64, 40, [0x18, 0xa0, 0x62]));
  }
  return dir;
}

/** Every capture_id the positive control declares, in capture-list order. */
function captureIds(spec) {
  const { renderSurfaceSpec } = require('./ui-spec-render.cjs');
  return renderSurfaceSpec(spec, { validate: false }).captureList.map((c) => c.capture_id);
}

/** A deep copy whose object keys are inserted in the REVERSE order. H3's subject. */
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).reverse()) out[k] = reverseKeys(value[k]);
    return out;
  }
  return value;
}

// ─── H1: the plan's first RED case — a template edit must not move the hash ──

test('Case H1 — editing the template changes the HTML and does NOT change sheet_hash', () => {
  const spec = loadSpec();
  const ids = captureIds(spec);
  const renders = makeRenders({ present: ids.slice(0, 5), missing: ids.slice(5) });
  const refs = makeRefs(['locked/populated.png']);

  const model = sheet.buildSheetModel(spec, { renders, refs });
  const before = sheet.sheetHash(model);

  const template = sheet.loadSheetTemplate();
  const htmlA = sheet.renderSheetHtml(model, template, { renders, refs });

  // The edit a human would actually make: a CSS rule and an HTML comment.
  const edited = template.replace(
    '</style>',
    '  .h1-template-edit-probe { outline: 1px dashed red; }\n</style>'
  ) + '\n<!-- H1 template edit probe -->\n';
  assert.notStrictEqual(edited, template, 'the probe must really have edited the template');

  const htmlB = sheet.renderSheetHtml(model, edited, { renders, refs });
  const after = sheet.sheetHash(model);

  assert.notStrictEqual(htmlA, htmlB, 'the template edit must change the rendered HTML');
  assert.strictEqual(after, before, 'a template edit must NOT change sheet_hash');
  assert.match(before, /^[0-9a-f]{64}$/, 'sheet_hash is a bare sha256 hex digest');

  // The structural half: the hashed payload carries no markup at all, so there is nothing
  // for a template to leak into. (`<br/>` in a mermaid label is the spec's, not the sheet's.)
  const canonical = sheet.canonicalSheetJson(model);
  assert.doesNotMatch(canonical, /<style|<!DOCTYPE|<table|<td|<html/i, canonical.slice(0, 400));
});

// ─── H2: the negative half — a spec change MUST move the hash ────────────────

test('Case H2 — renaming a state in the spec changes sheet_hash', () => {
  const spec = loadSpec();
  const renders = makeRenders({ present: [] });

  const before = sheet.sheetHash(sheet.buildSheetModel(spec, { renders, refs: null }));

  const renamed = JSON.parse(JSON.stringify(spec));
  const dark = renamed.states.find((s) => s.id === 'dark');
  assert.ok(dark, 'the positive control declares a `dark` state');
  dark.id = 'dark-theme';

  const after = sheet.sheetHash(sheet.buildSheetModel(renamed, { renders, refs: null, validate: false }));

  assert.notStrictEqual(after, before, 'a spec change must change sheet_hash');
});

// ─── H3: canonicalisation — key insertion order must not reach the hash ──────

test('Case H3 — two models whose keys were inserted in different orders hash identically', () => {
  const spec = loadSpec();
  const ids = captureIds(spec);
  const renders = makeRenders({ present: ids.slice(0, 3) });

  const model = sheet.buildSheetModel(spec, { renders, refs: null });
  const shuffled = reverseKeys(model);

  assert.notDeepStrictEqual(
    Object.keys(model), Object.keys(shuffled),
    'the probe must really have reordered the keys'
  );
  assert.strictEqual(sheet.sheetHash(shuffled), sheet.sheetHash(model));

  // JSON.stringify alone is insertion-ordered — the bug this case exists for.
  assert.notStrictEqual(JSON.stringify(shuffled), JSON.stringify(model));
});

// ─── H4: the hash covers the render STATUS, not the render BYTES ─────────────

test('Case H4 — different pixels at the same path do not move the hash; a NEW render does', () => {
  const spec = loadSpec();
  const ids = captureIds(spec);
  const renders = makeRenders({ present: ids.slice(0, 4), missing: ids.slice(4) });

  const before = sheet.sheetHash(sheet.buildSheetModel(spec, { renders, refs: null }));

  // (a) re-render: same paths, different pixels. A code change that repaints a screen must
  //     NOT clear a look-lock — §4.1's re-lock rule names routes/controls/states only.
  for (const id of ids.slice(0, 4)) {
    fs.writeFileSync(path.join(renders, `${id}.png`), makePng(64, 40, [0xff, 0x00, 0x99]));
  }
  assert.strictEqual(
    sheet.sheetHash(sheet.buildSheetModel(spec, { renders, refs: null })), before,
    'replacing the pixels at an existing path must not move the hash'
  );

  // (b) a state moving MISSING -> present IS information the human has not seen.
  fs.writeFileSync(path.join(renders, `${ids[4]}.png`), makePng(64, 40, [0x00, 0x00, 0x00]));
  assert.notStrictEqual(
    sheet.sheetHash(sheet.buildSheetModel(spec, { renders, refs: null })), before,
    'a render appearing where there was none MUST move the hash'
  );
});

// ─── M1: the mirror guard — the template must resolve on ~/.claude/devflow ───
//
// Skills run the MIRROR at `~/.claude/devflow/`, where `bin/` and `templates/` are SIBLINGS
// with no package.json, no .git and no repo above them. The W0 retrospective's headline
// defect was a lookup that passed every test in the checkout and was dead on that path — so
// this builds the layout and EXECUTES the load in it, from an unrelated cwd, rather than
// asserting the code "looks __dirname-relative".

function buildMirrorTree() {
  const root = tmpDir('df-ui-sheet-mirror-');
  fs.mkdirSync(path.join(root, 'bin', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'schemas'), { recursive: true });
  fs.mkdirSync(path.join(root, 'templates'), { recursive: true });

  for (const f of fs.readdirSync(__dirname)) {
    if (f.endsWith('.cjs') && !f.endsWith('.test.cjs')) {
      fs.copyFileSync(path.join(__dirname, f), path.join(root, 'bin', 'lib', f));
    }
  }
  const schemaSrc = path.join(__dirname, '..', '..', 'schemas');
  for (const f of fs.readdirSync(schemaSrc)) {
    if (f.endsWith('.json')) fs.copyFileSync(path.join(schemaSrc, f), path.join(root, 'schemas', f));
  }
  fs.copyFileSync(
    path.join(__dirname, '..', '..', 'templates', 'ui-sheet.html'),
    path.join(root, 'templates', 'ui-sheet.html')
  );
  return root;
}

test('Case M1 (the mirror guard) — the sheet template resolves from a ~/.claude/devflow tree', () => {
  const root = buildMirrorTree();
  const spec = loadSpec();
  const specCopy = path.join(root, 'projects-rail.md');
  fs.copyFileSync(POSITIVE_CONTROL, specCopy);

  assert.ok(!fs.existsSync(path.join(root, 'package.json')), 'no package.json in the mirror tree');
  assert.ok(!fs.existsSync(path.join(root, '.git')), 'no .git in the mirror tree');

  const script = [
    'const fs = require("fs");',
    'const lib = process.argv[1];',
    'const specFile = process.argv[2];',
    'const { parseSurfaceSpec } = require(lib + "/ui-spec.cjs");',
    'const s = require(lib + "/ui-sheet.cjs");',
    'const spec = parseSurfaceSpec(fs.readFileSync(specFile, "utf-8")).frontMatter;',
    'const model = s.buildSheetModel(spec, { renders: null, refs: null });',
    'const html = s.renderSheetHtml(model);',
    'process.stdout.write(JSON.stringify({ cwd: process.cwd(), len: html.length,',
    '  hash: s.sheetHash(model), hasStyle: html.includes("<style>") }));'
  ].join('\n');

  const out = execFileSync(
    process.execPath,
    ['-e', script, path.join(root, 'bin', 'lib'), specCopy],
    { cwd: fs.realpathSync(os.tmpdir()), encoding: 'utf-8' }
  );
  const got = JSON.parse(out);

  assert.notStrictEqual(path.resolve(got.cwd), path.resolve(__dirname), 'must not have run from the checkout');
  assert.ok(got.len > 500, `the sheet rendered from the mirror tree (len ${got.len})`);
  assert.ok(got.hasStyle, 'the template loaded — its inline <style> block is in the output');
  assert.strictEqual(got.hash, sheet.sheetHash(sheet.buildSheetModel(spec, { renders: null, refs: null })));
  void makeRenders;
});
