'use strict';

/**
 * ui-spec — the Surface Spec front door (objective 34-02).
 *
 * Three exports, and nothing else:
 *   parseSurfaceSpec(md)      split a spec's YAML front matter from its prose body, or throw
 *   loadSurfaceSpecSchema()   the versioned Surface Spec JSON Schema (proposal §4.2)
 *   loadMustNotVocabulary()   the fixed `must_not` vocabulary (proposal §4.3)
 *
 * This module VALIDATES nothing (that is 34-03) and RENDERS nothing (34-05). It parses, loads,
 * and pins shape.
 *
 * ── Why not `frontmatter.cjs`? ───────────────────────────────────────────────
 * `bin/lib/frontmatter.cjs` already splits front matter, and a dozen callers depend on its
 * LENIENT contract: a TRD or OBJECTIVE with no `---` block returns `{}` and the caller carries
 * on. That is right for DevFlow's own documents and wrong for a Surface Spec. A spec whose
 * front matter silently parses as `{}` has no routes, no controls and no states — so every
 * static invariant in 34-03 passes VACUOUSLY and the author is told their spec is fine. So
 * `parseSurfaceSpec` is a separate, STRICT parser: a missing or unterminated block throws.
 * `frontmatter.cjs` is not modified and not reused.
 *
 * ── The body rule, decided once ──────────────────────────────────────────────
 * `body` is everything AFTER the terminator line's newline, verbatim. A spec whose front matter
 * is followed by a blank line therefore has a body starting with '\n'. Line endings are
 * normalised (CRLF -> LF) and a leading UTF-8 BOM is stripped before anything else, so the body
 * is LF-terminated regardless of how the file was authored.
 *
 * ── Resource resolution ──────────────────────────────────────────────────────
 * Skills and agents run the MIRROR at `~/.claude/devflow/`, which the `sync-runtime` hook
 * copies from `plugins/devflow/devflow/`. `schemas/` lives under `devflow/` so it is mirrored,
 * and both loaders resolve it relative to `__dirname` — never `process.cwd()`, never a walk to
 * a repo root, neither of which exists on the mirror path. Case P5 executes that layout.
 *
 * Consumed by: 34-03 (validate), 34-05 (render), 34-08 (lock).
 * Depends on: ./yaml-lite.cjs — the only YAML path in this objective. No npm dependencies.
 */

const fs = require('fs');
const path = require('path');
const { parseYamlLite } = require('./yaml-lite.cjs');

const SCHEMA_DIR = path.join(__dirname, '..', '..', 'schemas');
const SURFACE_SPEC_SCHEMA_PATH = path.join(SCHEMA_DIR, 'surface-spec.schema.json');
const MUST_NOT_VOCABULARY_PATH = path.join(SCHEMA_DIR, 'must_not_vocabulary.json');

const FENCE = '---';
const DEFAULT_SCHEMA_VERSION = 1;

class SurfaceSpecError extends Error {
  constructor(message, source) {
    super(source ? `${message} (${source})` : message);
    this.name = 'SurfaceSpecError';
    this.source = source || null;
  }
}

/**
 * Split a Surface Spec markdown document into its parsed front matter and its prose body.
 *
 * @param {string} md          the whole document
 * @param {{source?: string}}  [opts]  a path used in error messages only
 * @returns {{frontMatter: object, body: string, schema_version: number}}
 * @throws {SurfaceSpecError}  no front-matter block, or an unterminated one
 * @throws {YamlLiteError}     the front matter is outside yaml-lite's subset (carries `.line`)
 */
function parseSurfaceSpec(md, opts) {
  const source = opts && opts.source ? opts.source : null;
  const text = String(md).replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');

  if (lines[0] !== FENCE) {
    throw new SurfaceSpecError(
      'no front matter: a Surface Spec must open on line 1 with a `---` fence, then its YAML, '
        + 'then a closing `---`',
      source
    );
  }

  // The FIRST line after the opener that is exactly `---` closes the block. Stopping at the
  // first match is what makes a markdown horizontal rule later in the prose harmless — it is
  // only ever reached after the terminator. (Case P4.)
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FENCE) { close = i; break; }
  }
  if (close === -1) {
    throw new SurfaceSpecError(
      'unterminated front matter: the `---` block opened on line 1 is never closed',
      source
    );
  }

  const yaml = lines.slice(1, close).join('\n');
  const parsed = parseYamlLite(yaml);
  const frontMatter = parsed === null ? {} : parsed;
  if (typeof frontMatter !== 'object' || Array.isArray(frontMatter)) {
    throw new SurfaceSpecError(
      'front matter must be a YAML mapping (`key: value`), not a list or a scalar',
      source
    );
  }

  const body = lines.slice(close + 1).join('\n');
  const schema_version = frontMatter.schema_version == null
    ? DEFAULT_SCHEMA_VERSION
    : frontMatter.schema_version;

  return { frontMatter, body, schema_version };
}

// ─── Loaders ──────────────────────────────────────────────────────────────────
//
// Both return a FRESH deep copy per call. 34-03 hands the vocabulary to a validator and 34-05
// to a renderer; neither may be able to poison the next caller by mutating what it was given.
// `structuredClone` is a node builtin (18+) — no dependency.

function readJson(file, label) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    throw new SurfaceSpecError(`${label} not found at ${file}: ${err.code || err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new SurfaceSpecError(`${label} at ${file} is not valid JSON: ${err.message}`);
  }
}

function loadSurfaceSpecSchema() {
  return structuredClone(readJson(SURFACE_SPEC_SCHEMA_PATH, 'surface-spec.schema.json'));
}

function loadMustNotVocabulary() {
  return structuredClone(readJson(MUST_NOT_VOCABULARY_PATH, 'must_not_vocabulary.json'));
}

module.exports = {
  parseSurfaceSpec,
  loadSurfaceSpecSchema,
  loadMustNotVocabulary,
  SurfaceSpecError,
  SCHEMA_DIR,
  SURFACE_SPEC_SCHEMA_PATH,
  MUST_NOT_VOCABULARY_PATH,
};
