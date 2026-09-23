'use strict';

/**
 * ui-spec-lock — the look-lock (objective 34-07).
 *
 *   shapeHash(spec)              sha256 hex of canonical({routes, controls, states}) — ONLY
 *   canonicalShapeJson(spec)     the exact bytes that hash digests, so a surprise can be READ
 *   writeLock(specPath, opts)    splice `acceptance:` into the spec's front matter
 *   lockStatus(spec)             'held' | 'cleared' | 'absent' | 'MISSING', with a reason
 *
 * ── The asymmetry this module exists to produce ──────────────────────────────
 * §4.1: "any change to `routes`, `controls` or `states` clears `acceptance.locked_sheet`."
 * Both halves are load-bearing and they fail in opposite directions:
 *
 *   * A lock that SURVIVES a shape change is a false approval. The file says a human looked
 *     at this surface; they looked at a different one.
 *   * A lock that DIES on a prose typo fix is unusable. The team re-approves without reading
 *     within a fortnight, and the file still says a human signed it off — strictly worse than
 *     no lock at all.
 *
 * So `locked_shape_hash` covers exactly three keys. Not `design_read` (a reworded design note
 * is not a new surface), not `flows` (a walk over structure already in the hash), not
 * `engine_version` (34-11's version bump would otherwise clear every lock in every repo for a
 * release that changed nothing a human looked at), and not the prose body — which is precisely
 * what §4.1 says must NOT clear a lock.
 *
 * ── ONE canonical serialiser, borrowed rather than re-derived ────────────────
 * `canonicalSheetJson`/`sheetHash` come from `ui-sheet.cjs`. 34-06 built ONE hashing path on
 * purpose: two definitions of what a human's approval covers eventually disagree about whether
 * it still stands. This module supplies a different PAYLOAD (three spec keys instead of the
 * sheet model) to the same recursive key-sorted serialiser and the same digest. A future change
 * to canonicalisation therefore moves `sheet_hash` and `locked_shape_hash` together, which is
 * the only way they can stay comparable.
 *
 * ── Why the section hashes are STORED, not recomputed ───────────────────────
 * `lock: cleared` has to name WHICH of the three changed, or the human is sent back to diff
 * the file by hand. That cannot be recomputed after the fact: telling routes-changed from
 * states-changed needs the per-section value AS AT THE LOCK. So `writeLock` stores
 * `locked_section_hashes: {routes, controls, states}` beside `locked_shape_hash`. A lock
 * written by hand (or by an older engine) that omits them still resolves held/cleared — the
 * reason then says the changed section cannot be named, rather than guessing one.
 *
 * ── Writing YAML back is the risky half ─────────────────────────────────────
 * yaml-lite parses; it does not serialise, and round-tripping the whole front matter through a
 * serialiser would reformat every line the author wrote. `spliceAcceptanceBlock` therefore
 * operates on the RAW TEXT: it finds the `acceptance:` block (or the end of the front matter)
 * and replaces exactly those lines. The prose body and every untouched front-matter line come
 * back byte-identical — case A2. A tool that silently reflows the artifact a human approved has
 * invalidated the approval in the act of recording it.
 *
 * Consumed by: ./ui-spec-cli.cjs (`ui lock`, and the `lock` field on `ui spec validate`).
 * Depends on: ./ui-spec.cjs, ./ui-spec-validate.cjs, ./ui-sheet.cjs. No npm dependencies.
 */

const fs = require('node:fs');

const { parseSurfaceSpec, loadMustNotVocabulary } = require('./ui-spec.cjs');
const { validateSurfaceSpec } = require('./ui-spec-validate.cjs');
const { sheetHash: canonicalHash, canonicalSheetJson } = require('./ui-sheet.cjs');

/** §4.1's three keys, in the order they are reported. The whole design is this list. */
const SHAPE_KEYS = ['routes', 'controls', 'states'];

const HEX64 = /^[0-9a-f]{64}$/;
const SHA256_VALUE = /^sha256:[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const FENCE = '---';

// ─── The shape hash ───────────────────────────────────────────────────────────

function isSpecObject(spec) {
  return !!spec && typeof spec === 'object' && !Array.isArray(spec) && !(spec instanceof Error);
}

/** `{routes, controls, states}` and nothing else. A missing key canonicalises as `null`. */
function shapePayload(spec) {
  const source = isSpecObject(spec) ? spec : {};
  const payload = {};
  for (const key of SHAPE_KEYS) payload[key] = source[key];
  return payload;
}

/** The exact bytes `shapeHash` digests. Exported so a failing S-case can be read, not guessed. */
function canonicalShapeJson(spec) {
  return canonicalSheetJson(shapePayload(spec));
}

/** sha256 hex of the canonical three-key payload. Bare hex — §4.2 stores it as `sha256:<hex>`. */
function shapeHash(spec) {
  return canonicalHash(shapePayload(spec));
}

/** One hash per §4.1 key, so a cleared lock can name which section moved. */
function sectionHashes(spec) {
  const source = isSpecObject(spec) ? spec : {};
  const out = {};
  for (const key of SHAPE_KEYS) out[key] = canonicalHash({ [key]: source[key] });
  return out;
}

// ─── Lock status ──────────────────────────────────────────────────────────────

function missing(reason) {
  return { lock: 'MISSING', reason, locked_by: null, locked_at: null };
}

/**
 * Is the recorded lock still good?
 *
 * Four values, never two collapsed into one — `absent` (never locked) and `cleared` (locked,
 * then the shape moved) are different situations for the human reading the output, and
 * `MISSING` (locked, but the engine cannot tell) is neither a pass nor a failure. Reporting an
 * undeterminable lock as `held` is the silent-green class this objective exists to close.
 *
 * NEVER sets `ok`. A spec can be structurally perfect and un-approved; 34-08's refusal to
 * compose reads `lock` explicitly, beside `ok`, because they answer different questions.
 */
function lockStatus(spec) {
  if (!isSpecObject(spec)) {
    return missing('the spec could not be read, so its lock could not be determined');
  }

  const acceptance = spec.acceptance;
  if (acceptance == null) {
    return { lock: 'absent', reason: 'no `acceptance` block — this surface has never been look-locked', locked_by: null, locked_at: null };
  }
  if (typeof acceptance !== 'object' || Array.isArray(acceptance)) {
    return missing('`acceptance` is not a mapping, so its lock could not be determined');
  }

  const by = acceptance.locked_by == null ? null : acceptance.locked_by;
  const at = acceptance.locked_at == null ? null : acceptance.locked_at;
  const stored = acceptance.locked_shape_hash;

  if (stored == null) {
    return {
      lock: 'MISSING',
      reason: 'the `acceptance` block carries no `locked_shape_hash` — this lock predates shape '
        + 'hashing (or was hand-written), so whether it still stands cannot be determined; '
        + 're-lock with `df-tools ui lock`',
      locked_by: by,
      locked_at: at
    };
  }
  if (typeof stored !== 'string' || !SHA256_VALUE.test(stored)) {
    return {
      lock: 'MISSING',
      reason: `\`locked_shape_hash\` is not a \`sha256:<64 hex>\` value (${JSON.stringify(stored)}), `
        + 'so whether the lock still stands cannot be determined',
      locked_by: by,
      locked_at: at
    };
  }

  const current = `sha256:${shapeHash(spec)}`;
  if (current === stored) {
    return { lock: 'held', reason: '`routes`, `controls` and `states` are unchanged since the lock', locked_by: by, locked_at: at };
  }

  // Cleared. Name the section, from the hashes stored AT THE LOCK — the only way to tell
  // routes-changed from states-changed after the fact.
  const storedSections = acceptance.locked_section_hashes;
  let reason;
  if (storedSections && typeof storedSections === 'object' && !Array.isArray(storedSections)) {
    const now = sectionHashes(spec);
    const changed = SHAPE_KEYS.filter((k) => `sha256:${now[k]}` !== storedSections[k]);
    reason = changed.length > 0
      ? `\`${changed.join('`, `')}\` changed since the lock — §4.1 clears acceptance.locked_sheet`
      : 'the shape hash moved but no single section hash did — re-lock with `df-tools ui lock`';
  } else {
    reason = '`routes`, `controls` or `states` changed since the lock, and the block carries no '
      + '`locked_section_hashes`, so which one cannot be named — re-lock with `df-tools ui lock`';
  }

  return { lock: 'cleared', reason, locked_by: by, locked_at: at };
}

// ─── Writing the block back ───────────────────────────────────────────────────

/**
 * The index range `[start, end)` of the top-level `acceptance:` block in front-matter LINES,
 * or null. The block runs from the key line to the last INDENTED non-empty line under it — a
 * blank line or a new top-level key ends it, so a trailing blank before the closing fence is
 * left where the author put it.
 */
function acceptanceRange(front) {
  const start = front.findIndex((l) => /^acceptance:/.test(l));
  if (start === -1) return null;
  let end = start + 1;
  while (end < front.length && /^\s+\S/.test(front[end])) end += 1;
  return { start, end };
}

/**
 * A value emitted as a YAML DOUBLE-QUOTED scalar.
 *
 * EVERY value this module writes goes through here, the free-form ones most of all. The hashes
 * and the ISO date are validated into a known-safe alphabet before they arrive, but `locked_by`
 * is whatever a human typed after `--by`: an apostrophe (`O'Brien`), a ` #` (`mark # 2`), a
 * `: `, a leading `*`/`&`/`{`. Emitted BARE, each of those makes `ui lock` exit 0, print a
 * success record, and leave behind a spec that `ui spec validate` then reports as SPEC000 with
 * `lock: MISSING` — a corruption that reads as a parser or authoring bug, never as a lock bug.
 * Quoting is not cosmetic here; it is the difference between a signature and a broken file.
 *
 * Only `\` and `"` need escaping inside a double-quoted YAML scalar. Anything that would need
 * more than that — a newline, a tab, a control character — never reaches this function:
 * `writeLock` refuses it, because the acceptance block is spliced in LINE by line and a value
 * that cannot be written on one line cannot be written at all.
 */
function yamlQuoted(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The acceptance block's lines, in a fixed order so a re-lock produces a stable diff. */
function acceptanceLines(acceptance) {
  return [
    'acceptance:',
    `  locked_sheet: ${yamlQuoted(acceptance.locked_sheet)}`,
    `  locked_by: ${yamlQuoted(acceptance.locked_by)}`,
    `  locked_at: ${yamlQuoted(acceptance.locked_at)}`,
    `  locked_shape_hash: ${yamlQuoted(acceptance.locked_shape_hash)}`,
    '  locked_section_hashes:',
    ...SHAPE_KEYS.map((k) => `    ${k}: ${yamlQuoted(acceptance.locked_section_hashes[k])}`)
  ];
}

/**
 * Replace (or append) the `acceptance:` block in RAW spec text.
 *
 * CRITICAL: a surgical text edit. The front matter is never re-serialised — every line this
 * function does not own is carried across verbatim, including its comments, its blank lines and
 * its key order, and the prose body is copied byte for byte.
 *
 * THE BOM. `parseSurfaceSpec` strips a leading U+FEFF before it parses, so a BOM'd spec
 * VALIDATES. This function reads the RAW bytes, so if it did not strip the same thing it would
 * compare `"﻿---"` against `"---"`, find no fence, and throw — the two halves answering
 * differently about the SAME file, which is how `ui lock` came to exit 0 on a spec it had just
 * corrupted and, separately, to die on one it should have signed. The BOM is stripped for
 * navigation and PUT BACK on the way out: this function edits the acceptance block, not the
 * document's encoding.
 */
function spliceAcceptanceBlock(raw, blockLines) {
  const bom = raw.startsWith('﻿') ? '﻿' : '';
  const text = bom ? raw.slice(1) : raw;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);

  if (lines[0] !== FENCE) {
    throw new Error('spliceAcceptanceBlock: the document does not open with a `---` fence');
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FENCE) { close = i; break; }
  }
  if (close === -1) {
    throw new Error('spliceAcceptanceBlock: the front-matter block is never closed');
  }

  const front = lines.slice(1, close);
  const range = acceptanceRange(front);
  const nextFront = range
    ? [...front.slice(0, range.start), ...blockLines, ...front.slice(range.end)]
    : [...front, ...blockLines];

  return bom + [lines[0], ...nextFront, ...lines.slice(close)].join(eol);
}

/** The `--sheet-hash` value, bare 64-hex, or null when it is not one. */
function normaliseSheetHash(value) {
  if (typeof value !== 'string') return null;
  const bare = value.startsWith('sha256:') ? value.slice('sha256:'.length) : value;
  return HEX64.test(bare) ? bare : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function refuse(code, msg, verdict) {
  return { ok: false, code, msg, verdict: verdict || null };
}

/**
 * Record a human's approval in the spec's own front matter.
 *
 * @param {string} specPath
 * @param {{sheetHash: string, by: string, at?: string, patterns?: any[], vocabulary?: any}} opts
 * @returns {{ok: true, spec: string, acceptance: object}
 *          |{ok: false, code: string, msg: string, verdict: object|null}}
 *
 * Refuses — and writes NOTHING — when the spec does not validate, when `--sheet-hash` is not 64
 * hex characters, or when `--by` is absent. A lock recorded against a broken spec is a lie with
 * a signature on it, and it is the most authoritative-looking wrong artifact this program can
 * produce.
 */
function writeLock(specPath, opts = {}) {
  const sheet = normaliseSheetHash(opts.sheetHash);
  if (opts.sheetHash == null || opts.sheetHash === '') {
    return refuse('LOCK001', '--sheet-hash <64 hex> is required: a lock records WHICH review sheet was approved');
  }
  if (sheet === null) {
    return refuse('LOCK001', `--sheet-hash must be 64 hex characters, optionally prefixed \`sha256:\` — got ${JSON.stringify(opts.sheetHash)}`);
  }

  const by = typeof opts.by === 'string' ? opts.by.trim() : '';
  if (!by) {
    return refuse('LOCK002', '--by <email> is required: an approval nobody signed is not an approval');
  }
  // The acceptance block is spliced in LINE by line. A newline in the signer would split the
  // block and leave the tail of the name parsed as a key; a control character would survive
  // into the file unprintable. Both are refusals — the documented contract is `{ok:false}` and
  // an untouched file, never a best-effort write that corrupts the spec being signed.
  if (/[\u0000-\u001f\u007f]/.test(by)) {
    return refuse('LOCK002', '--by must be writable on one line: it carries a newline or a control character');
  }

  const at = opts.at == null ? today() : String(opts.at);
  if (!ISO_DATE.test(at)) {
    return refuse('LOCK003', `--at must be an ISO date (YYYY-MM-DD) — got ${JSON.stringify(at)}`);
  }

  let raw;
  try {
    raw = fs.readFileSync(specPath, 'utf-8');
  } catch (e) {
    return refuse('LOCK004', `spec not readable at ${specPath}: ${e.code || e.message}`);
  }

  // A parse failure is a VERDICT, not a crash — `validateSurfaceSpec` turns the thrown
  // yaml-lite error (line number and all) into SPEC000, exactly as the CLI's front half does.
  let frontMatter;
  try {
    frontMatter = parseSurfaceSpec(raw, { source: specPath }).frontMatter;
  } catch (e) {
    frontMatter = e;
  }

  let vocabulary = opts.vocabulary;
  if (vocabulary === undefined) {
    try { vocabulary = loadMustNotVocabulary().terms; } catch { vocabulary = undefined; }
  }

  const verdict = validateSurfaceSpec(frontMatter, { patterns: opts.patterns, vocabulary });
  if (!verdict.ok) {
    return refuse('LOCK005', `the spec does not validate; nothing was written to ${specPath}`, verdict);
  }

  const sections = sectionHashes(frontMatter);
  const acceptance = {
    locked_sheet: `sha256:${sheet}`,
    locked_by: by,
    locked_at: at,
    locked_shape_hash: `sha256:${shapeHash(frontMatter)}`,
    locked_section_hashes: {
      routes: `sha256:${sections.routes}`,
      controls: `sha256:${sections.controls}`,
      states: `sha256:${sections.states}`
    }
  };

  // The LAST refusal. `spliceAcceptanceBlock` navigates the RAW text while everything above it
  // judged the NORMALISED text, so the two can still disagree about a document neither of them
  // is wrong about — mixed line endings being the live example. Whatever the disagreement, the
  // caller's contract is `{ok:false, code, msg}`: `cmdUiLock` turns that into one stderr line
  // and exit 1, and an uncaught throw here would reach the author as a stack trace instead,
  // saying nothing about their spec and everything about this tool. Note the ORDER: the splice
  // is computed BEFORE the write, so a refusal leaves the file untouched.
  let next;
  try {
    next = spliceAcceptanceBlock(raw, acceptanceLines(acceptance));
  } catch (e) {
    return refuse('LOCK006',
      `the spec validates but its raw text cannot be edited in place, so no lock was written to ${specPath}: ${e.message}`);
  }

  try {
    fs.writeFileSync(specPath, next, 'utf-8');
  } catch (e) {
    return refuse('LOCK007', `spec not writable at ${specPath}: ${e.code || e.message}`);
  }

  return { ok: true, spec: specPath, acceptance };
}

module.exports = {
  shapeHash,
  canonicalShapeJson,
  sectionHashes,
  lockStatus,
  writeLock,
  spliceAcceptanceBlock,
  SHAPE_KEYS
};
