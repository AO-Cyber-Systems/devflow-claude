'use strict';

/**
 * ui-sheet — the §8.3 review sheet, and the `sheet_hash` that survives a template edit
 * (objective 34-06).
 *
 *   buildSheetModel(spec, {renders, refs})  -> the canonical model (JSON, no markup, no bytes)
 *   sheetHash(model)                        -> sha256 hex of that model, key-sorted
 *   renderSheetHtml(model, template, opts)  -> one static, self-contained HTML page
 *   loadSheetTemplate()                     -> templates/ui-sheet.html, __dirname-anchored
 *
 * ── THREE FUNCTIONS, AND THE ORDER OF DEPENDENCY BETWEEN THEM IS THE POINT ────
 * The hash is taken over the MODEL. `renderSheetHtml` is a separate function that the hash
 * never sees, and the model contains no markup — so a template edit CANNOT move the hash. It
 * is structurally true rather than accidentally true, and case H1 executes it.
 *
 * Why it matters: §8.3 records `sheet_hash` into `acceptance.locked_sheet` and 34-07's
 * look-lock clears only on a `routes`/`controls`/`states` change. If the hash tracked the
 * rendered HTML, every CSS tweak would invalidate a human's approval — and a lock that is
 * re-approved weekly without being read is strictly worse than no lock, because it still
 * reports "a human signed this off".
 *
 * ── THE HASH COVERS STATUS, NOT BYTES ────────────────────────────────────────
 * A row carries the render's PATH (relative to the renders root) and its `status`; it never
 * carries the render's contents. Re-rendering a screen after a code change writes different
 * pixels at the same path and must NOT clear a look-lock. A state moving `MISSING` ->
 * `present` IS something the human has not seen, so that transition DOES move the hash.
 * Case H4 pins both halves; 34-07's re-lock rule is built on them and must not re-derive them.
 *
 * ── THE HASHED PATHS ARE RELATIVE, ALWAYS ────────────────────────────────────
 * `render` is a bare filename under the renders root and `ref` is the path §4.2's state block
 * declares. Neither the renders root nor the refs root reaches the model. An absolute path in
 * the hashed payload would make `sheet_hash` depend on which machine (and which checkout) ran
 * the tool — every CI run would then clear every lock, which is the same failure as hashing
 * the HTML wearing a different hat.
 *
 * ── `engine_version` IS OMITTED FROM THE HASH ────────────────────────────────
 * It is stamped on the model and printed in the sheet footer (a reader must be able to see
 * which engine produced what they are approving) but it is NOT hashed: 34-11's version bump
 * would otherwise silently clear every look-lock in every repo, for a release that changed
 * nothing a human looked at. `schema_version` IS hashed — a schema change is a shape change.
 *
 * ── MISSING IS NEVER A DROPPED ROW ───────────────────────────────────────────
 * Every capture-list entry becomes a row, always. A sheet that omits the row for an
 * unrendered state shows a human a complete-looking grid of a surface that was never fully
 * rendered — the exact silent-pass class this program exists to kill. The template renders
 * the literal word MISSING with the path it looked for; case G2 asserts it on the GENERATED
 * HTML, because the natural template idiom (skip when falsy) is the natural way to be wrong.
 *
 * ── NOTHING IS RE-DERIVED HERE ───────────────────────────────────────────────
 * The nav graph, the control table and the capture list all come from `renderSurfaceSpec`.
 * This module adds the render/ref lookup and the presentation, and no spec semantics at all.
 *
 * Consumed by: ui-spec-cli.cjs (`df-tools ui sheet`), 34-07 (`ui lock`).
 * Depends on: ./ui-spec-render.cjs, ./helpers.cjs, node:crypto. No npm dependencies — no
 * templating engine, no HTML builder, no hashing library.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const { renderSurfaceSpec } = require('./ui-spec-render.cjs');
const { pluginVersion } = require('./helpers.cjs');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'ui-sheet.html');

/**
 * Render file extensions, tried in this order. `.png` first because it is what every capture
 * path in this program writes; the rest exist so a hand-supplied reference set does not have
 * to be converted. The ORDER is a contract — the first hit is what lands in the hashed model.
 */
const RENDER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

/** The reference kinds §4.2's `references` block names, used to LABEL a ref pane. */
const REF_KINDS = ['mockup', 'donor', 'locked'];

// ─── The template ─────────────────────────────────────────────────────────────

/**
 * The sheet template, resolved `__dirname`-relative.
 *
 * Skills run the MIRROR at `~/.claude/devflow/`, where `bin/` and `templates/` are SIBLINGS
 * with no repo above them. A `process.cwd()`-relative or repo-root-walking lookup passes every
 * test in this checkout and is dead on the path that actually runs — the W0 retrospective's
 * headline defect. Case M1 builds that layout and executes the load in it.
 */
function loadSheetTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf-8');
}

// ─── Canonical JSON and the hash ──────────────────────────────────────────────

/**
 * Key-sorted serialisation. `JSON.stringify` alone is INSERTION-ordered, which would make the
 * hash depend on how the YAML happened to parse — two identical specs authored in a different
 * key order would hash differently and clear each other's locks. Case H3.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** The exact bytes `sheetHash` digests. Exported so a failing H1 can be READ, not guessed. */
function canonicalSheetJson(model) {
  const payload = {};
  for (const key of Object.keys(model)) {
    if (key === 'engine_version') continue; // see the header: a version bump is not a shape change
    payload[key] = model[key];
  }
  return canonical(payload);
}

/** sha256 hex of the canonical model. Bare hex — §4.2 stores it as `sha256:<hex>`. */
function sheetHash(model) {
  return crypto.createHash('sha256').update(canonicalSheetJson(model), 'utf-8').digest('hex');
}

// ─── The render / reference lookup ────────────────────────────────────────────

/**
 * The render for one capture, as a path RELATIVE to the renders root, or null.
 * Only presence is read — never the file's contents (see the header, and case H4).
 */
function findRender(rendersDir, captureId) {
  if (!rendersDir) return null;
  for (const ext of RENDER_EXTENSIONS) {
    const name = `${captureId}${ext}`;
    if (fs.existsSync(path.join(rendersDir, name))) return name;
  }
  return null;
}

/** `locked/populated.png` -> `locked`. An un-prefixed ref has no kind; it is not guessed. */
function refKindOf(rel) {
  if (typeof rel !== 'string') return null;
  const first = rel.split('/')[0];
  return REF_KINDS.includes(first) ? first : null;
}

// ─── The model ────────────────────────────────────────────────────────────────

/**
 * The canonical model behind one sheet.
 *
 * @param {object} spec  the parsed front matter (`parseSurfaceSpec(...).frontMatter`)
 * @param {object} [opts]
 * @param {string|null} [opts.renders]   directory of `<capture_id>.png` renders, or null
 * @param {string|null} [opts.refs]      directory the states' `ref` paths are relative to
 * @param {boolean} [opts.validate=true] refuse an invalid spec (renderSurfaceSpec's own guard)
 * @returns {object} the model — JSON only: no markup, no file contents, no absolute paths
 */
function buildSheetModel(spec, opts = {}) {
  const rendersDir = opts.renders || null;
  const refsDir = opts.refs || null;

  const rendered = renderSurfaceSpec(spec, {
    validate: opts.validate !== false,
    patterns: opts.patterns,
    vocabulary: opts.vocabulary
  });

  const manifestStates = new Map(rendered.manifest.states.map((s) => [s.state_id, s]));

  // ONE ROW PER CAPTURE, in capture-list order (34-05's contract). Never filtered.
  const rows = rendered.captureList.map((capture) => {
    const state = manifestStates.get(capture.state_id) || {};
    const expected = `${capture.capture_id}${RENDER_EXTENSIONS[0]}`;
    const render = findRender(rendersDir, capture.capture_id);

    const refRel = Array.isArray(state.references) && state.references.length > 0
      ? state.references[0]
      : null;
    const refPresent = refRel !== null && refsDir !== null && fs.existsSync(path.join(refsDir, refRel));

    return {
      capture_id: capture.capture_id,
      state_id: capture.state_id,
      theme: capture.theme,
      width: capture.width,
      render,
      // The path looked for, relative — an absolute one would put the machine in the hash.
      render_expected: expected,
      status: render === null ? 'MISSING' : 'present',
      reason: render === null ? `no render at ${expected}` : null,
      ref: refRel,
      ref_kind: refKindOf(refRel),
      // `none` is not `MISSING`: a state that declares no reference is not a state whose
      // reference failed to arrive, and collapsing the two would invent a defect.
      ref_status: refRel === null ? 'none' : (refPresent ? 'present' : 'MISSING'),
      content: state.content === undefined ? null : state.content
    };
  });

  return {
    surface: spec.surface === undefined ? null : spec.surface,
    design_read: spec.design_read === undefined ? null : spec.design_read,
    mode: spec.mode === undefined ? null : spec.mode,
    schema_version: rendered.manifest.schema_version,
    engine_version: pluginVersion(), // stamped, NOT hashed — see the header
    navGraphMermaid: rendered.navGraphMermaid,
    controlTableMd: rendered.controlTableMd,
    rows
  };
}

// ─── The HTML ─────────────────────────────────────────────────────────────────

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * An image as a `data:` URI.
 *
 * INLINED, not linked. §8.3 wants the sheet publishable as a Claude Artifact AND openable
 * from disk offline; a relative `src` breaks in the first case and breaks the moment the file
 * moves in the second, and neither failure is loud — a broken image reads as "nothing
 * rendered here", which is the one thing this sheet must never say by accident. The cost is
 * file size, which is why the committed fixture uses small generated placeholder renders.
 *
 * This is the ONLY place a render's bytes are read, and it is on the HTML side of the line —
 * the model never sees them.
 */
function dataUri(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(absPath).toString('base64')}`;
}

function imagePane(caption, relPath, root, missingLabel, reason) {
  const head = `    <figure class="pane">\n      <figcaption>${esc(caption)}</figcaption>\n`;
  if (relPath === null) {
    return `${head}      <div class="missing-cell"><strong>${esc(missingLabel)}</strong>`
      + `<span>${esc(reason)}</span></div>\n    </figure>`;
  }
  const abs = root === null ? null : path.join(root, relPath);
  if (abs === null || !fs.existsSync(abs)) {
    // Present in the model but unreachable from here: say so rather than draw a blank box.
    return `${head}      <div class="none-cell">${esc(relPath)} — not embedded`
      + ` (directory not supplied to the renderer)</div>\n    </figure>`;
  }
  return `${head}      <img alt="${esc(relPath)}" src="${dataUri(abs)}">\n`
    + `      <div class="capture-id">${esc(relPath)}</div>\n    </figure>`;
}

/** The per-state content contract (§4.2) — `must_show` / `must_not_show` / `rule`. */
function contractHtml(content) {
  if (!content || typeof content !== 'object') {
    return '    <div class="contract"><em>No content contract declared.</em></div>';
  }
  const parts = [];
  const push = (label, value) => {
    if (value === undefined || value === null) return;
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    if (Array.isArray(value) && value.length === 0) {
      parts.push(`      <dt>${esc(label)}</dt><dd><em>(none)</em></dd>`);
      return;
    }
    if (text === '') return;
    parts.push(`      <dt>${esc(label)}</dt><dd>${esc(text)}</dd>`);
  };
  push('must show', content.must_show);
  push('must not show', content.must_not_show);
  push('rule', content.rule);
  for (const key of Object.keys(content)) {
    if (['must_show', 'must_not_show', 'rule'].includes(key)) continue;
    push(key, content[key]);
  }
  if (parts.length === 0) {
    return '    <div class="contract"><em>No content contract declared.</em></div>';
  }
  return `    <div class="contract"><dl>\n${parts.join('\n')}\n    </dl></div>`;
}

function rowHtml(row, roots) {
  const missing = row.status === 'MISSING';
  const refCaption = row.ref_kind === null ? 'Reference' : `Reference (${row.ref_kind})`;

  const renderPane = imagePane(
    'Render', row.render, roots.renders, 'MISSING', row.reason || `no render at ${row.render_expected}`
  );
  const refPane = row.ref === null
    ? '    <figure class="pane">\n      <figcaption>Reference</figcaption>\n'
      + '      <div class="none-cell">No reference declared for this state.</div>\n    </figure>'
    : imagePane(
      refCaption, row.ref, roots.refs, 'MISSING', `no reference file at ${row.ref}`
    );

  return [
    `  <article class="state-row${missing ? ' is-missing' : ''}" id="row-${esc(row.capture_id)}">`,
    '    <div class="row-head">',
    `      <h3>${esc(row.state_id)}</h3>`,
    `      <span class="badge ${missing ? 'badge-missing">MISSING' : 'badge-present">present'}</span>`,
    `      <span class="capture-id">${esc(row.capture_id)} &middot; ${esc(row.theme)} &middot; ${esc(row.width)}px</span>`,
    '    </div>',
    '    <div class="panes">',
    renderPane,
    refPane,
    '    </div>',
    contractHtml(row.content),
    '  </article>'
  ].join('\n');
}

/**
 * The static sheet.
 *
 * @param {object} model                     from `buildSheetModel`
 * @param {string} [template]                the template STRING (default: the shipped file)
 * @param {{renders?: string, refs?: string}} [opts]  roots used ONLY to inline images
 * @returns {string} one self-contained HTML document
 *
 * `template` is a parameter so a test can edit the markup without writing to the shipped file
 * (H1), and so the hash's independence from it is demonstrable rather than asserted.
 */
function renderSheetHtml(model, template = loadSheetTemplate(), opts = {}) {
  const roots = {
    renders: opts.renders || null,
    refs: opts.refs || null
  };

  const rows = model.rows.map((row) => rowHtml(row, roots)).join('\n');
  const missingCount = model.rows.filter((r) => r.status === 'MISSING').length;

  const substitutions = {
    '{{SURFACE}}': esc(model.surface),
    '{{DESIGN_READ}}': esc(model.design_read === null ? '(not declared)' : model.design_read),
    '{{MODE}}': esc(model.mode === null ? '(not declared)' : model.mode),
    '{{ROW_COUNT}}': esc(model.rows.length),
    '{{MISSING_COUNT}}': esc(missingCount),
    '{{NAV_GRAPH}}': esc(model.navGraphMermaid),
    '{{CONTROL_TABLE}}': esc(model.controlTableMd),
    '{{ROWS}}': rows, // already-escaped markup, built above
    '{{SHEET_HASH}}': esc(sheetHash(model)),
    '{{ENGINE_VERSION}}': esc(model.engine_version),
    '{{SCHEMA_VERSION}}': esc(model.schema_version)
  };

  let out = template;
  for (const [token, value] of Object.entries(substitutions)) {
    out = out.split(token).join(value);
  }
  return out;
}

module.exports = {
  buildSheetModel,
  sheetHash,
  canonicalSheetJson,
  renderSheetHtml,
  loadSheetTemplate,
  TEMPLATE_PATH,
  RENDER_EXTENSIONS
};
