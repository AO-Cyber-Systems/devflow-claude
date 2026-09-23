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

// ─── F: the positive control ──────────────────────────────────────────────────
//
// `__fixtures__/ui-spec/projects-rail.md` is a hand transcription of proposal §4.2 (AMENDED
// text — see the fixture's own header for the three normalisations the amendment made
// unnecessary and the one transcription choice that remains). It is this objective's positive
// control: 34-03, 34-04, 34-05, 34-06 and 34-07 all assert against it. If it is wrong, five
// TRDs go green against a wrong artifact — so its shape is pinned here, field by field.

const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_PATH = path.join(__dirname, '__fixtures__', 'ui-spec', 'projects-rail.md');

function loadFixture() {
  return parseSurfaceSpec(fs.readFileSync(FIXTURE_PATH, 'utf-8'), { source: FIXTURE_PATH });
}

test('Case F1 — the projects-rail fixture parses without throwing', () => {
  const spec = loadFixture();
  assert.strictEqual(typeof spec.frontMatter, 'object');
  assert.notStrictEqual(spec.frontMatter, null);
  // The body carries the transcription note plus Intent and Walkthrough (§4.2 closing note).
  assert.match(spec.body, /## Intent/);
  assert.match(spec.body, /## Walkthrough/);
});

test('Case F2 — its shape: 2 routes, 2 controls, 3 header behaviours, 8 states, 3 flow steps', () => {
  const f = loadFixture().frontMatter;

  assert.strictEqual(f.surface, 'projects-rail');
  assert.strictEqual(f.routes.length, 2);
  assert.strictEqual(f.controls.length, 2);
  assert.strictEqual(f.controls[0].id, 'rail.project.header');
  assert.strictEqual(f.controls[1].id, 'rail.project.chevron');
  assert.strictEqual(f.controls[0].behaviors.length, 3);

  // 34-05's capture list and 34-06's sheet rows are ordered by THIS array.
  assert.deepStrictEqual(
    f.states.map((s) => s.id),
    ['populated', 'long-content', 'empty', 'error', 'outage', 'guard-denied', 'narrow', 'dark']
  );

  assert.strictEqual(f.flows[0].steps.length, 3);
  assert.strictEqual(f.acceptance.locked_by, 'mark@aocyber.ai');

  // I2 ("every route has a back or is the declared root") needs a root to point at.
  assert.strictEqual(f.routes[0].id, 'project.conversations');
  assert.strictEqual(f.routes[0].back.target, 'conversations.all');
  assert.strictEqual(f.routes[1].id, 'conversations.all');
  assert.strictEqual(f.routes[1].root, true);
});

test('Case F3 — the amended §4.2 constructs survive transcription (activation map, block states, hit_rect pair)', () => {
  const f = loadFixture().frontMatter;

  // Amended §4.2: `activation` is a MAP, not the list form yaml-lite refuses (34-01 Y11b).
  assert.deepStrictEqual(f.controls[0].activation, {
    pointer: true,
    keyboard: ['Enter', 'Space']
  });

  // Amended §4.2: `narrow` and `dark` use BLOCK syntax, so their keys are real keys — not a
  // string that happens to look like a map.
  const narrow = f.states.find((s) => s.id === 'narrow');
  assert.deepStrictEqual(narrow, {
    id: 'narrow',
    viewport: '390x844',
    seed: 'projects-3-conversations-12'
  });
  const dark = f.states.find((s) => s.id === 'dark');
  assert.deepStrictEqual(dark, {
    id: 'dark',
    theme: 'dark',
    seed: 'projects-3-conversations-12'
  });

  // Amended §4.2 / the I6 ruling: the reciprocal disjoint_from pair, plus `within` and `max`
  // on the chevron. 34-04's I6 asserts resolvability, reciprocity and non-self-reference
  // against exactly this.
  assert.deepStrictEqual(f.controls[0].hit_rect, {
    disjoint_from: ['rail.project.chevron']
  });
  assert.deepStrictEqual(f.controls[1].hit_rect, {
    max: '40x40',
    within: 'rail.project.header',
    disjoint_from: ['rail.project.header']
  });

  // Amended §4.2: locked_sheet is a quoted full digest, not a bare `sha256:...` truncation.
  assert.strictEqual(
    f.acceptance.locked_sheet,
    'sha256:9f2c1b7e4a6d0835c1e9b4f7a2d6c8e013b5a7f9d2c4e6081a3b5c7d9e1f3a5b7'
  );
});

test('Case F4 — the scalars yaml-lite is most likely to get wrong, on the REAL fixture', () => {
  const f = loadFixture().frontMatter;

  // A colon inside a bare scalar is CONTENT, not a key separator.
  assert.strictEqual(f.routes[0].path, '/projects/:id/conversations');
  // Quoted braces stay a string; the braces are a placeholder, not a flow map.
  assert.strictEqual(f.routes[0].title, '{project.name}');

  const empty = f.states.find((s) => s.id === 'empty');
  assert.deepStrictEqual(empty.content.must_not_show, ['unavailable', 'error']);

  // `null` is the YAML null, not the string 'null' — §4.2 spells the alternative as a map.
  assert.strictEqual(f.controls[0].disabled_when, null);

  // §4.4 / I4: outage.must_show and empty.must_show must be DISJOINT. Pinned on the fixture so
  // the positive control cannot drift into violating the invariant 34-03 enforces.
  const outage = f.states.find((s) => s.id === 'outage');
  const overlap = outage.content.must_show.filter((t) => empty.content.must_show.includes(t));
  assert.deepStrictEqual(overlap, []);
});
