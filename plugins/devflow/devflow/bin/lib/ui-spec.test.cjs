'use strict';
// Tests for ui-spec.cjs (objective 34-02 — the Surface Spec front door).
//
// `parseSurfaceSpec(md)` splits a Surface Spec's YAML front matter from its prose body, or
// THROWS. It never returns `{frontMatter: {}}` for a document with no front matter — that is
// exactly the lenient behaviour `frontmatter.cjs` has (deliberately, for TRD/OBJECTIVE files)
// and exactly the behaviour a spec must not inherit: a spec that silently parses as `{}` then
// passes every 34-03 invariant vacuously.
//
// Hand-written fixtures only (CLAUDE.md habit 4 / fixture_strategy: generators): every markdown
// document below is a literal typed by hand. The one fixture FILE — `__fixtures__/ui-spec/
// projects-rail.md` — is a hand transcription of the proposal's §4.2 example, not generated.
//
// RED (task 1): this require fails until ui-spec.cjs is created.

const test = require('node:test');
const assert = require('node:assert');

const { parseSurfaceSpec } = require('./ui-spec.cjs');

// ─── P: the front-matter split, and the two ways it must refuse ───────────────

test('Case P1 — a well-formed spec: front matter parsed, body verbatim after the terminator', () => {
  const P1_DOC = [
    '---',
    'surface: demo',
    'routes: []',
    '---',
    '',
    '## Intent',
    '',
    'One paragraph of prose.',
    ''
  ].join('\n');

  const result = parseSurfaceSpec(P1_DOC);

  assert.deepStrictEqual(result.frontMatter, { surface: 'demo', routes: [] });

  // Asserted with strictEqual against the EXACT string, not `body.includes(...)`: an
  // `includes` assertion passes on a body that silently dropped its first line.
  assert.strictEqual(result.body, '\n## Intent\n\nOne paragraph of prose.\n');

  assert.strictEqual(result.schema_version, 1);
});

test('Case P2 — no front-matter block at all: THROWS, never returns {frontMatter: {}}', () => {
  const P2_DOC = [
    '# Projects rail',
    '',
    'This document has no front matter at all.',
    ''
  ].join('\n');

  assert.throws(
    () => parseSurfaceSpec(P2_DOC),
    /front matter/i,
    'a spec with no front matter must throw, naming the missing block'
  );

  // The lenient-`{}` guard, asserted explicitly rather than implied by the throw above: if a
  // future refactor turns the throw into a return, THIS is the assertion that catches it.
  let returned = 'THREW';
  try {
    returned = parseSurfaceSpec(P2_DOC);
  } catch {
    /* expected */
  }
  assert.strictEqual(returned, 'THREW', 'parseSurfaceSpec must not return a value here');
  assert.notDeepStrictEqual(returned, { frontMatter: {} });
});

test('Case P3 — front matter opened and never closed: THROWS, naming the opening line', () => {
  const P3_DOC = [
    '---',
    'surface: demo',
    'routes: []',
    '',
    '## Intent',
    '',
    'The fence was never closed.',
    ''
  ].join('\n');

  assert.throws(
    () => parseSurfaceSpec(P3_DOC),
    (err) => {
      assert.match(err.message, /unterminated/i, 'names the unterminated block');
      assert.match(err.message, /line 1/, 'names the opening line number');
      return true;
    }
  );
});

test('Case P4 — BOM, CRLF, and a markdown `---` rule inside the prose body', () => {
  const P4_DOC = '﻿' + [
    '---',
    'surface: demo',
    'mode: redesign',
    '---',
    '',
    'Intro paragraph.',
    '',
    '---',
    '',
    'A markdown horizontal rule is NOT a front-matter terminator.',
    ''
  ].join('\r\n');

  const result = parseSurfaceSpec(P4_DOC);

  assert.deepStrictEqual(result.frontMatter, { surface: 'demo', mode: 'redesign' });

  // Only the FIRST two `---` lines delimit. The rule in the body survives, verbatim, and line
  // endings are normalised to \n (stated once in the module header, asserted once here).
  assert.strictEqual(
    result.body,
    '\nIntro paragraph.\n\n---\n\nA markdown horizontal rule is NOT a front-matter terminator.\n'
  );
});
