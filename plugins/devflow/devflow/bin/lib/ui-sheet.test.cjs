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
  // `references/` is part of the mirrored tree too — `helpers.cjs` reads model-profiles.json at
  // MODULE LOAD, so a tree without it is not the mirror, it is a broken copy of it.
  fs.mkdirSync(path.join(root, 'references'), { recursive: true });
  const refSrc = path.join(__dirname, '..', '..', 'references');
  for (const f of fs.readdirSync(refSrc)) {
    if (f.endsWith('.json')) fs.copyFileSync(path.join(refSrc, f), path.join(root, 'references', f));
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

// ─── The grid (G1-G7) ────────────────────────────────────────────────────────
//
// G2, G4, G5, G6 and G7 assert on the GENERATED HTML, not on the model. A model-only
// assertion passes on a template that silently skips a null render — and "skip when falsy"
// is both the natural way to write the template and the natural way to be wrong.

const { renderSurfaceSpec } = require('./ui-spec-render.cjs');

/** A whole sheet from the positive control, with a chosen subset of renders present. */
function renderFixtureSheet({ present = [], refEntries = [] } = {}) {
  const spec = loadSpec();
  const renders = makeRenders({ present });
  const refs = makeRefs(refEntries);
  const model = sheet.buildSheetModel(spec, { renders, refs });
  return {
    spec,
    model,
    renders,
    refs,
    html: sheet.renderSheetHtml(model, sheet.loadSheetTemplate(), { renders, refs })
  };
}

test('Case G1 — one row per capture-list entry, in capture-list order, with the row keys', () => {
  const spec = loadSpec();
  const captures = renderSurfaceSpec(spec, { validate: false }).captureList;
  const model = sheet.buildSheetModel(spec, { renders: null, refs: null });

  assert.strictEqual(model.rows.length, captures.length, 'one row per capture, never fewer');
  assert.deepStrictEqual(
    model.rows.map((r) => r.capture_id),
    captures.map((c) => c.capture_id),
    'rows follow the capture list ORDER — the sheet does not re-sort 34-05 contract'
  );

  for (const row of model.rows) {
    for (const key of ['capture_id', 'state_id', 'theme', 'width', 'render', 'ref', 'status']) {
      assert.ok(key in row, `row ${row.capture_id} is missing the key \`${key}\``);
    }
    assert.ok(['present', 'MISSING'].includes(row.status), `bad status ${row.status}`);
  }
});

test('Case G2 — a declared state with no render renders a MISSING cell and the row SURVIVES', () => {
  const spec = loadSpec();
  const all = captureIds(spec);
  const denied = all.find((id) => id.includes('guard-denied'));
  assert.ok(denied, 'the positive control declares a guard-denied state');

  // Everything EXCEPT guard-denied has a render, so a template that drops null rows still
  // produces a plausible-looking sheet — which is exactly the failure this case exists for.
  const { html, model } = renderFixtureSheet({ present: all.filter((id) => id !== denied) });

  const row = model.rows.find((r) => r.capture_id === denied);
  assert.strictEqual(row.status, 'MISSING');
  assert.strictEqual(row.render, null);
  assert.match(row.reason, /no render at/);

  // THE HTML, not the model.
  assert.ok(html.includes('MISSING'), 'the generated HTML must contain the literal word MISSING');
  assert.ok(html.includes('guard-denied'), 'the unrendered state id must still appear in the HTML');
  assert.ok(html.includes(denied), `the unrendered capture_id ${denied} must still appear`);
  assert.ok(html.includes(row.reason), 'the MISSING cell carries the path that was looked for');

  // Every declared row is present in the output, not just the rendered ones.
  for (const r of model.rows) {
    assert.ok(html.includes(`id="row-${r.capture_id}"`), `row ${r.capture_id} was dropped from the HTML`);
  }
});

test('Case G3 — a state with a render AND a ref shows both, the ref labelled by its subdirectory', () => {
  const spec = loadSpec();
  const all = captureIds(spec);
  const populated = all.find((id) => id.includes('--populated--'));
  const { html, model } = renderFixtureSheet({
    present: [populated],
    refEntries: ['locked/populated.png']
  });

  const row = model.rows.find((r) => r.capture_id === populated);
  assert.strictEqual(row.status, 'present');
  assert.strictEqual(row.ref, 'locked/populated.png');
  assert.strictEqual(row.ref_kind, 'locked', 'the kind comes from the --refs subdirectory');
  assert.strictEqual(row.ref_status, 'present');

  const start = html.indexOf(`id="row-${populated}"`);
  assert.notStrictEqual(start, -1);
  const end = html.indexOf('</article>', start);
  const block = html.slice(start, end);

  assert.strictEqual(
    (block.match(/<img /g) || []).length, 2,
    'the render and its reference render side by side in the same row'
  );
  assert.ok(block.includes('Reference (locked)'), `the ref pane is labelled locked:\n${block}`);
  assert.ok(block.includes('data:image/png;base64,'), 'images are INLINED, not linked');
});

test('Case G3b — the schema says where `state.ref` resolves, and says the thing the code does', () => {
  // A DOC-DRIFT net, in the P2 style: assert the prose rather than review it.
  //
  // The schema described `state.ref` as "relative to `references.locked`". The code resolves it
  // against `--refs` and reads the ref's FIRST PATH SEGMENT as the reference kind — so an author
  // who followed the schema and wrote `ref: populated.png` got `ref_status: MISSING` and
  // `ref_kind: null` on every row of their sheet, with nothing anywhere naming the mistake.
  // The whole premise of a Surface Spec is that its front matter is machine truth; a schema
  // description pointing at a field NOTHING READS is the drift this objective exists to close.
  const schemaPath = path.join(__dirname, '..', '..', 'schemas', 'surface-spec.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  // `states.items` is a `$ref` into `$defs/state`; resolve it rather than assuming it is inline,
  // or this net reads `undefined.description` and dies instead of judging the prose.
  const stateRef = schema.properties.states.items.$ref;
  assert.strictEqual(stateRef, '#/$defs/state', `unexpected states.items shape: ${JSON.stringify(schema.properties.states.items)}`);
  const refDoc = schema.$defs.state.properties.ref.description;

  assert.ok(refDoc && refDoc.length > 0, 'the guard must have found the description it is about');
  assert.match(refDoc, /--refs/, '`state.ref` resolves against the `--refs` directory — say so');
  assert.doesNotMatch(refDoc, /references\.locked/,
    '`references.locked` is read by NOTHING; a description that names it sends authors to a dead field');

  // The other half of the same fact: `references` is documentation for a human, and the schema
  // has to say that too, or the next reader assumes the resolver reads it.
  const referencesDoc = schema.properties.references.description;
  assert.ok(referencesDoc && referencesDoc.length > 0, 'the references block must carry a description');

  // Executable, not asserted from memory: NO module reads `spec.references`. If one ever does,
  // this net goes red and whoever wrote it gets to decide which half of the contract moves.
  const libDir = __dirname;
  const readers = fs.readdirSync(libDir)
    .filter((f) => /^ui-(spec|sheet).*\.cjs$/.test(f) && !f.endsWith('.test.cjs'))
    .filter((f) => /(^|[^.\w])(spec|frontMatter|front)\.references\b/.test(
      fs.readFileSync(path.join(libDir, f), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')
    ));
  assert.deepStrictEqual(readers, [],
    `a module now reads spec.references (${readers.join(', ')}) — the schema description must follow it`);

  // And the behaviour the description now promises, end to end: a `<kind>/<file>` ref under the
  // --refs root resolves present and carries its kind. (Case G3 asserts the same row; this
  // asserts it as the SCHEMA's contract, so the two cannot be fixed apart.)
  const spec = loadSpec();
  const populated = captureIds(spec).find((id) => id.includes('--populated--'));
  const { model } = renderFixtureSheet({ present: [populated], refEntries: ['locked/populated.png'] });
  const row = model.rows.find((r) => r.capture_id === populated);
  assert.strictEqual(row.ref_status, 'present');
  assert.strictEqual(row.ref_kind, 'locked');
});

test('Case G4 — the sheet lists design_read and mode, in its own header', () => {
  const { html, spec } = renderFixtureSheet({});

  // STRENGTHENED beyond the TRD's literal wording ("both strings appear in the HTML"), because
  // a differential control proved that net cannot fail for its own bug: the control table
  // carries its own `*Design read:*` line, so deleting the sheet header's substitution
  // entirely left `html.includes(design_read)` green. The assertion is therefore scoped to the
  // header — everything before the navigation-graph heading.
  const header = html.slice(0, html.indexOf('<h2>Navigation graph'));
  assert.ok(header.length > 0, 'the sheet has a header section above the navigation graph');
  assert.ok(header.includes(spec.design_read), `design_read is missing from the sheet header: ${spec.design_read}`);
  assert.ok(header.includes(spec.mode), `mode is missing from the sheet header: ${spec.mode}`);
});

test('Case G5 — the nav graph and the control table are TAKEN from renderSurfaceSpec, not re-derived', () => {
  const { html, model, spec } = renderFixtureSheet({});
  const derived = renderSurfaceSpec(spec, { validate: false });

  assert.strictEqual(model.navGraphMermaid, derived.navGraphMermaid, 'the graph is not re-derived here');
  assert.strictEqual(model.controlTableMd, derived.controlTableMd, 'the table is not re-derived here');

  assert.ok(html.includes('flowchart TD'), 'the mermaid graph is in the sheet');
  assert.ok(html.includes('class="mermaid"'), 'the graph is in a mermaid block, so an Artifact draws it');
  assert.ok(html.includes('route_project_conversations'), 'a real node id from the graph is present');
  assert.ok(html.includes('Controls — projects-rail'), 'the control table is in the sheet');
  assert.ok(
    html.includes('expands children; selects the project'),
    'the control table text a human reads is in the sheet'
  );
});

test('Case G6 — the per-state content contract appears in each row', () => {
  const { html, model } = renderFixtureSheet({});

  const empty = model.rows.find((r) => r.state_id === 'empty');
  assert.deepStrictEqual(empty.content.must_show, ['Create a project']);
  assert.ok(html.includes('Create a project'), 'must_show reaches the HTML');
  assert.ok(html.includes('must not show'), 'must_not_show is labelled in the HTML');
  assert.ok(html.includes('names ellipsize; rail width unchanged'), 'a `rule` contract reaches the HTML');

  // Every row that declares a contract renders it inside its OWN row block.
  for (const row of model.rows.filter((r) => r.content && typeof r.content === 'object')) {
    const start = html.indexOf(`id="row-${row.capture_id}"`);
    const block = html.slice(start, html.indexOf('</article>', start));
    assert.ok(block.includes('class="contract"'), `row ${row.capture_id} has no contract block`);
  }
});

test('Case G8 — the control table renders as real HTML elements, not raw markdown syntax dumped into a <pre>', () => {
  // Gap 1b (verifier finding against the 34-06 checkpoint, Q1): the model carries
  // `controlTableMd` as markdown, and the OLD template escaped the whole string into
  // `<pre class="control-table">` — a human reads literal `##`, `###` and `*Design read:*`
  // syntax instead of English. The markup must be real elements; only the markdown SOURCE
  // characters disappear.
  const { html } = renderFixtureSheet({});

  assert.ok(!html.includes('<pre class="control-table">'), 'the control table must not be dumped into a <pre>');
  assert.ok(!html.includes('## Controls —'), 'a literal `##` heading marker must not reach the HTML');
  assert.ok(!html.includes('*Design read:*'), 'a literal `*emphasis*` marker must not reach the HTML');
  assert.ok(!html.includes('*Always:*'), 'a literal `*emphasis*` marker must not reach the HTML');

  assert.ok(html.includes('<h2>Controls — projects-rail</h2>'), 'the surface heading is a real <h2>');
  assert.ok(/<em>\s*Design read:\s*<\/em>/.test(html), 'the *Design read:* label is a real <em>, not literal asterisks');
  assert.ok(html.includes('<h3>'), 'each control heading is a real <h3>');
  assert.ok(html.includes('<ul>') && html.includes('<li>'), 'each behaviour bullet is a real <li> inside a real <ul>');

  // The control id survives — visible, but ONLY inside its own heading (34-05's Case T5), and
  // wrapped in <em> (the *emphasis* markdown span that carries it) so it reads as secondary to
  // the human name.
  assert.ok(
    /<h3>[^<]*project chevron[^<]*<em>rail\.project\.chevron<\/em>[^<]*<\/h3>/.test(html),
    `the chevron heading must show the human name first, the id secondary:\n${html.slice(html.indexOf('project chevron') - 40, html.indexOf('project chevron') + 140)}`
  );
});

test('Case G9 — every text node in the converted control table is still escaped; the spec is hand-authored input', () => {
  // The markdown subset is closed and generated by OUR OWN renderer, so Case G8's converter is a
  // small explicit one rather than a markdown dependency — but `must_not` strings and
  // `{project.name}` interpolations flow into `controlTableMd` from a HAND-AUTHORED spec, so
  // every text node the converter emits must still be escaped, exactly as `esc()` already does
  // for the rest of the sheet.
  const spec = loadSpec();
  const mutated = JSON.parse(JSON.stringify(spec));
  mutated.design_read = 'utility rail; <script>alert(1)</script> & "quoted" <b>bold</b>';

  const model = sheet.buildSheetModel(mutated, { renders: null, refs: null });
  const html = sheet.renderSheetHtml(model, sheet.loadSheetTemplate(), { renders: null, refs: null });

  assert.ok(!html.includes('<script>alert(1)</script>'), 'a spec value must never inject a live <script> tag');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the markup-looking text must be escaped, not stripped');
  assert.ok(html.includes('&amp;'), 'a literal & in the spec text must be escaped');
  assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt;'), 'other tag-looking text is escaped too, not interpreted as markup');
});

// ─── Gap 2 (Q3) — grid legibility at the size it is actually viewed at ───────
//
// The sheet is opened both from disk (a real browser, following the OS/system theme) and pasted
// into a Claude Artifact, whose viewer carries an EXPLICIT `data-theme="dark"|"light"` choice
// that can differ from the system preference. Responding to `prefers-color-scheme` alone means
// the sheet gets the wrong palette — light text on a dark host, or the reverse — whenever a
// viewer's explicit choice disagrees with their OS setting. That is a real "light and dark both
// legible" failure, not a cosmetic one.

test('Case G10 — the sheet responds to an explicit Artifact-viewer theme, not only the system preference', () => {
  const template = sheet.loadSheetTemplate();

  // The light palette is the un-guarded default (bare `:root`) — already true, pinned so a
  // future edit cannot flip the default without this case noticing.
  assert.match(template, /:root\s*\{[^}]*--ink:/s, 'the light palette must be the bare :root default');

  // System preference ("no explicit choice") still applies the dark palette — but ONLY when the
  // viewer has not explicitly chosen light, so an explicit choice always wins over guessing from
  // the OS.
  assert.match(
    template,
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/,
    'the system-preference dark block must be guarded so an explicit data-theme="light" still wins'
  );

  // An EXPLICIT data-theme="dark" must win too, independent of the media query — the artifact
  // viewer stamps this on the root element when a person has toggled the theme themselves.
  assert.match(
    template,
    /:root\[data-theme="dark"\]\s*\{[^}]*--ink:/s,
    'an explicit data-theme="dark" must redefine the palette outside the media query'
  );
});

test('Case G11 — wide content scrolls inside its own container; the page body must never scroll horizontally', () => {
  const template = sheet.loadSheetTemplate();

  // Defensive backstop at the page level — the standard is "wide content may scroll inside its
  // own container; the page body may not" (34-06 gap 2).
  assert.match(template, /body\s*\{[^}]*overflow-x:\s*hidden/s, 'the body must refuse to scroll horizontally itself');

  // Every container that can legitimately grow wide (the mermaid graph, the control table) opts
  // INTO its own horizontal scroll instead, rather than pushing the page wider.
  assert.match(template, /pre\s*\{[^}]*overflow-x:\s*auto/s, 'the mermaid/graph containers must scroll internally');
  assert.match(template, /\.control-table\s*\{[^}]*overflow-x:\s*auto/s, 'the control table must scroll internally');
});

test('Case G7 — the generated HTML is self-contained: no network, no external CSS, no script', () => {
  const { html } = renderFixtureSheet({ present: captureIds(loadSpec()).slice(0, 2), refEntries: ['locked/populated.png'] });

  assert.doesNotMatch(html, /https?:\/\//, 'no absolute URL may appear — the sheet must work offline');
  assert.doesNotMatch(html, /<script/i, 'no script tag at all');
  assert.doesNotMatch(html, /<link[^>]*href=/i, 'no external stylesheet');
  assert.doesNotMatch(html, /url\(\s*['"]?(?!data:)/i, 'no CSS url() that is not a data: URI');
  // The one remaining way to reach the network is an <img src> that is not a data: URI.
  for (const m of html.match(/<img[^>]*>/g) || []) {
    assert.match(m, /src="data:/, `an image is not inlined: ${m.slice(0, 120)}`);
  }
});
