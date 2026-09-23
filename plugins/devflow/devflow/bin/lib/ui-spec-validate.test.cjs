'use strict';
// Tests for ui-spec-validate.cjs (objective 34-03 — the Surface Spec static invariants).
//
// `validateSurfaceSpec(spec, ctx)` returns a STRUCTURED verdict — `{ok, errors:[{code,path,msg}],
// engine_version, schema_version}` — and never throws. 34-04's CLI arm turns `errors` into an
// exit code; a thrown string turns it into a stack trace and that contract dies. Case V3 pins it.
//
// Hand-written fixtures only (CLAUDE.md habit 4 / fixture_strategy: generators). Every negative
// case here is either a `mutate()` of the ONE positive control — `__fixtures__/ui-spec/
// projects-rail.md`, hand-transcribed from proposal §4.2 in 34-02 — or a hand-built known-broken
// document under `__fixtures__/ui-spec/broken/`. Nothing is generated, and no fixture is written
// from scratch: a spec written from scratch trips four invariants at once and its case then
// passes for the wrong reason.
//
// RED (task 1): this require fails until ui-spec-validate.cjs is created.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { parseSurfaceSpec, loadMustNotVocabulary } = require('./ui-spec.cjs');
const {
  validateSurfaceSpec,
  enumerateBehaviorCombinations,
  NARROW_MAX_WIDTH
} = require('./ui-spec-validate.cjs');

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'ui-spec');
const POSITIVE_CONTROL = path.join(FIXTURE_DIR, 'projects-rail.md');

// ─── The spec factory (built before the first behaviour case) ─────────────────

/** The parsed front matter of the positive control — a fresh object per call. */
function loadPositiveControl() {
  return parseSurfaceSpec(fs.readFileSync(POSITIVE_CONTROL, 'utf-8'), { source: POSITIVE_CONTROL })
    .frontMatter;
}

/** A deep-cloned copy of `spec` with `fn` applied. `structuredClone` is a node builtin. */
function mutate(spec, fn) {
  const copy = structuredClone(spec);
  fn(copy);
  return copy;
}

/** The validation context a caller supplies: the pattern ids and the must_not vocabulary. */
function ctx() {
  return {
    patterns: ['navigation/disclosure-group', 'navigation/section-caption'],
    vocabulary: loadMustNotVocabulary().terms
  };
}

/** The SET of codes in a verdict, sorted — the unit every "this code and no other" case reads. */
function codesOf(result) {
  return [...new Set(result.errors.map((e) => e.code))].sort();
}

/** A spec carrying exactly three distinct STRUCTURAL violations, for V2 and V4. */
function threeViolationSpec() {
  return mutate(loadPositiveControl(), (s) => {
    delete s.states; // required top-level key absent          -> SPEC001 @ states
    delete s.flows; // required top-level key absent           -> SPEC001 @ flows
    s.routes[1].id = 'Rail.Header'; // id pattern violation    -> SPEC001 @ routes[1].id
  });
}

// ─── V: the verdict shape, the positive control, and never-throws ─────────────

test('Case V1 — the positive control validates ok:true with no errors at all', () => {
  const result = validateSurfaceSpec(loadPositiveControl(), ctx());

  // Printed on failure: an empty `errors` is the assertion, so the diff must name the codes.
  assert.deepStrictEqual(result.errors, [], `unexpected errors: ${JSON.stringify(result.errors)}`);
  assert.strictEqual(result.ok, true);

  // Honest output (§ Runtime model): every verdict says which engine produced it and which
  // schema version it read. `pluginVersion()` may legitimately be '0.0.0' off-tree — presence
  // is the contract, not a particular string.
  assert.strictEqual(typeof result.engine_version, 'string');
  assert.ok(result.engine_version.length > 0, 'engine_version must be a non-empty string');
  assert.strictEqual(result.schema_version, 1);
});

test('Case V2 — every error record is exactly {code, path, msg}, pointer-ish and one line', () => {
  const result = validateSurfaceSpec(threeViolationSpec(), ctx());

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0, 'the three-violation spec must produce errors');

  for (const e of result.errors) {
    assert.deepStrictEqual(Object.keys(e).sort(), ['code', 'msg', 'path']);

    assert.match(e.code, /^[A-Z]+[0-9]{3}$/, `code ${JSON.stringify(e.code)} is not a stable code`);

    // A JSON-pointer-ish path naming the offending node: `states`, `routes[0].back`,
    // `controls[0].behaviors[2].when`. No whitespace — it is a machine handle, not prose.
    assert.strictEqual(typeof e.path, 'string');
    assert.ok(e.path.length > 0, `error ${e.code} has an empty path`);
    assert.doesNotMatch(e.path, /\s/, `path ${JSON.stringify(e.path)} contains whitespace`);
    assert.match(e.path, /^[a-z_][a-z_0-9]*(\[[0-9]+\]|\.[a-z_0-9]+)*$/i, `path ${e.path}`);

    // One sentence a human reads in a terminal line: no newline, and long enough to say
    // something. A `msg` of 'invalid' is not a diagnosis.
    assert.strictEqual(typeof e.msg, 'string');
    assert.doesNotMatch(e.msg, /\n/, `msg for ${e.code} contains a newline`);
    assert.ok(e.msg.length > 12, `msg for ${e.code} is too short to diagnose: ${e.msg}`);
  }
});

test('Case V3 — never throws: null, {}, a string and a parse failure all return SPEC000', () => {
  // A real yaml-lite refusal, so the line number carried into SPEC000 is a real one.
  let parseFailure = null;
  try {
    parseSurfaceSpec('---\nsurface: demo\nbad: "unterminated\n---\n');
  } catch (err) {
    parseFailure = err;
  }
  assert.notStrictEqual(parseFailure, null, 'the malformed document must have refused to parse');
  // yaml-lite numbers the lines of the front-matter BLOCK, not of the document.
  assert.strictEqual(parseFailure.line, 2);

  const inputs = [
    ['null', null],
    ['an empty object', {}],
    ['a string', 'surface: projects-rail'],
    ['a yaml-lite parse failure', parseFailure]
  ];

  for (const [label, input] of inputs) {
    let result;
    assert.doesNotThrow(() => {
      result = validateSurfaceSpec(input, ctx());
    }, `validateSurfaceSpec threw on ${label}`);

    assert.strictEqual(result.ok, false, `${label} must not validate ok`);
    assert.deepStrictEqual(codesOf(result), ['SPEC000'], `${label} -> ${JSON.stringify(result.errors)}`);
  }

  // The parse failure's line number survives into the message: without it the author is told
  // their spec is malformed and not told where.
  const fromParseFailure = validateSurfaceSpec(parseFailure, ctx());
  assert.match(fromParseFailure.errors[0].msg, /line 2/);
});

test('Case V4 — errors are deterministically ordered by (code, path) across runs', () => {
  const spec = threeViolationSpec();

  const first = validateSurfaceSpec(spec, ctx());
  const second = validateSurfaceSpec(threeViolationSpec(), ctx());

  // Three distinct violations, three errors — so the ordering assertion is not vacuous.
  assert.strictEqual(first.errors.length, 3, JSON.stringify(first.errors, null, 1));
  assert.deepStrictEqual(first.errors, second.errors);

  const keys = first.errors.map((e) => `${e.code} ${e.path}`);
  assert.deepStrictEqual(keys, [...keys].sort(), `errors are not sorted by (code, path): ${keys}`);
});

// ─── I1: schema validity and the version short-circuit ───────────────────────
//
// I1 implements only what §4.2 DECLARES — required keys, the id pattern, enum membership and
// the type of each declared property. Deliberately NOT implemented: `minItems`. `entry`'s
// "at least one declared way in" is invariant I2's rule (ROUTE001) and a rule with two homes
// is exactly the drift objective 33 existed to close.

test('Case I1a — a missing required top-level key is SPEC001, and nothing else', () => {
  const spec = mutate(loadPositiveControl(), (s) => {
    delete s.states;
  });

  const result = validateSurfaceSpec(spec, ctx());

  assert.deepStrictEqual(codesOf(result), ['SPEC001'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].path, 'states');

  // With no `states` there is no basis for CTRL006 or for the coverage model — a check with
  // no basis reports nothing here rather than a verdict it could not have reached.
  assert.ok(!result.errors.some((e) => e.code.startsWith('CTRL')));
});

test('Case I1b — an id outside the schema id pattern is SPEC001 at the offending path', () => {
  const spec = mutate(loadPositiveControl(), (s) => {
    s.routes[1].id = 'Rail.Header'; // upper case, and the schema pattern is lower-case only
  });

  const result = validateSurfaceSpec(spec, ctx());

  assert.deepStrictEqual(codesOf(result), ['SPEC001'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].path, 'routes[1].id');
  assert.match(result.errors[0].msg, /Rail\.Header/);
});

test('Case I1c — schema_version out of range is SPEC002 and SHORT-CIRCUITS everything else', () => {
  // Two further defects the engine must NOT report on: it cannot read this spec's version, so
  // it has no basis for a verdict on the spec's contents (the MISSING-not-pass rule).
  const spec = mutate(loadPositiveControl(), (s) => {
    s.schema_version = 99;
    delete s.states; // would be SPEC001
    delete s.routes[0].back; // would be ROUTE002
  });

  const result = validateSurfaceSpec(spec, ctx());

  assert.strictEqual(result.errors.length, 1, JSON.stringify(result.errors));
  assert.strictEqual(result.errors[0].code, 'SPEC002');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.schema_version, 99);
});

// ─── I2: routes ───────────────────────────────────────────────────────────────
//
// Two of the five known-broken fixtures live here. Each is `cp projects-rail.md` plus ONE edit
// plus its `<!-- BROKEN: … -->` marker, so the ONLY difference from the positive control is the
// invariant under test — and case I3h holds every one of them to a single code.

const BROKEN_DIR = path.join(FIXTURE_DIR, 'broken');

function loadBroken(name) {
  const file = path.join(BROKEN_DIR, name);
  return parseSurfaceSpec(fs.readFileSync(file, 'utf-8'), { source: file });
}

/** The code a fixture's own `<!-- BROKEN: … expected code XXXNNN -->` marker names. */
function declaredCode(body) {
  const m = /BROKEN:[\s\S]*?expected code ([A-Z]+[0-9]{3})/.exec(body);
  return m ? m[1] : null;
}

test('Case I2a — route-without-back.md fails with exactly ROUTE002', () => {
  const result = validateSurfaceSpec(loadBroken('route-without-back.md').frontMatter, ctx());

  assert.deepStrictEqual(codesOf(result), ['ROUTE002'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].path, 'routes[0].back');
  assert.match(result.errors[0].msg, /project\.conversations/);
  assert.match(result.errors[0].msg, /root/);
});

test('Case I2b — a route with root:true and no back is NOT an error (the declared-root exemption)', () => {
  // The positive control's second route is exactly this shape and V1 already covers it; assert
  // it directly too, because ROUTE002 written without the exemption reddens V1 for the wrong
  // reason and the diagnosis then costs an hour.
  const spec = loadPositiveControl();
  assert.strictEqual(spec.routes[1].root, true);
  assert.strictEqual('back' in spec.routes[1], false);

  const result = validateSurfaceSpec(spec, ctx());
  assert.ok(!result.errors.some((e) => e.path.startsWith('routes[1]')), JSON.stringify(result.errors));

  // And the exemption is `root: true` ONLY — not "any truthy root key".
  const notRoot = mutate(spec, (s) => {
    s.routes[1].root = false;
  });
  assert.deepStrictEqual(codesOf(validateSurfaceSpec(notRoot, ctx())), ['ROUTE002']);
});

test('Case I2c — an empty entry list is exactly ROUTE001; an ABSENT one is ROUTE001 too', () => {
  const empty = mutate(loadPositiveControl(), (s) => {
    s.routes[0].entry = [];
  });
  const emptyResult = validateSurfaceSpec(empty, ctx());
  assert.deepStrictEqual(codesOf(emptyResult), ['ROUTE001'], JSON.stringify(emptyResult.errors));
  assert.strictEqual(emptyResult.errors[0].path, 'routes[0].entry');

  // Absent is the same rule at the same node, and the schema's `required` says so too. One
  // node, one verdict: the specific code wins and SPEC001 is dropped at that path.
  const absent = mutate(loadPositiveControl(), (s) => {
    delete s.routes[0].entry;
  });
  const absentResult = validateSurfaceSpec(absent, ctx());
  assert.deepStrictEqual(codesOf(absentResult), ['ROUTE001'], JSON.stringify(absentResult.errors));
  assert.strictEqual(absentResult.errors[0].path, 'routes[0].entry');
});

test('Case I2d — entry-control-unknown.md is exactly ROUTE003, naming route and entry index', () => {
  const result = validateSurfaceSpec(loadBroken('entry-control-unknown.md').frontMatter, ctx());

  assert.deepStrictEqual(codesOf(result), ['ROUTE003'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);

  const e = result.errors[0];
  assert.strictEqual(e.path, 'routes[0].entry[0]'); // the offending route and entry INDEX
  assert.match(e.msg, /project\.conversations/); // ... and the route by ID, for a human
  assert.match(e.msg, /rail\.project\.missing/);

  // The honest answer for an id this engine cannot resolve: MISSING, not silence and not a
  // claim the control does not exist. W2's repo-wide resolution replaces this branch.
  assert.match(e.msg, /MISSING/);
});

test('Case I2e — a bare string in `entry` (deeplink) is VALID, not an unresolvable control', () => {
  const spec = loadPositiveControl();
  assert.strictEqual(spec.routes[0].entry[1], 'deeplink');
  assert.strictEqual(spec.routes[1].entry[0], 'deeplink');

  // Both routes' bare-string entries, and no {control: …} left anywhere to resolve.
  const onlyStrings = mutate(spec, (s) => {
    s.routes[0].entry = ['deeplink', 'browser-back'];
  });
  assert.deepStrictEqual(codesOf(validateSurfaceSpec(onlyStrings, ctx())), [], JSON.stringify(validateSurfaceSpec(onlyStrings, ctx()).errors));
});

test('Case I2f — a local unresolvable control reports UNRESOLVED, not MISSING', () => {
  // Prefixed by this surface's own id, so it cannot be living in another spec: this engine
  // KNOWS it is absent, and says so in different words from the cross-surface case.
  const spec = mutate(loadPositiveControl(), (s) => {
    s.routes[0].entry[0] = { control: 'projects-rail.nope' };
  });
  const result = validateSurfaceSpec(spec, ctx());

  assert.deepStrictEqual(codesOf(result), ['ROUTE003'], JSON.stringify(result.errors));
  assert.match(result.errors[0].msg, /UNRESOLVED/);
  assert.doesNotMatch(result.errors[0].msg, /MISSING/);
});

// ─── I3: controls, and the §4.3 exclusivity/coverage model ───────────────────
//
// The coverage model is the one interpretive decision in this objective. It is written out in
// ui-spec-validate.cjs's header because 34-05's control table and W2's `effect` check both
// resolve the active behaviour by the same rule — if they diverge, the spec says one thing and
// the probe asserts another. Case I3g pins the passing table; the two broken fixtures pin the
// two ways it fails.

test('Case I3a — control-two-does.md (both `does` and `behaviors`) is exactly CTRL001', () => {
  const result = validateSurfaceSpec(loadBroken('control-two-does.md').frontMatter, ctx());

  assert.deepStrictEqual(codesOf(result), ['CTRL001'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].path, 'controls[0]');
  assert.match(result.errors[0].msg, /rail\.project\.header/);
});

test('Case I3b — a control with NEITHER `does` nor `behaviors` is exactly CTRL002', () => {
  const spec = mutate(loadPositiveControl(), (s) => {
    delete s.controls[1].does;
    delete s.controls[1].effect;
  });

  const result = validateSurfaceSpec(spec, ctx());
  assert.deepStrictEqual(codesOf(result), ['CTRL002'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors[0].path, 'controls[1]');
});

test('Case I3c — behaviors-overlapping-when.md is exactly CTRL003, naming both indexes', () => {
  const result = validateSurfaceSpec(loadBroken('behaviors-overlapping-when.md').frontMatter, ctx());

  assert.deepStrictEqual(codesOf(result), ['CTRL003'], JSON.stringify(result.errors));

  const e = result.errors[0];
  assert.strictEqual(e.path, 'controls[0].behaviors[2].when');
  assert.match(e.msg, /behaviours 0 and 2/); // BOTH overlapping behaviour indexes
  assert.match(e.msg, /control_state=collapsed/); // ... and the combination they collide at
  assert.match(e.msg, /data_state=populated/);

  // The overlap leaves (narrow, expanded) uncovered too. CTRL003 short-circuits CTRL004 within
  // one control — the active behaviour is unresolvable, so a coverage verdict has no basis —
  // and the message must SAY so rather than leaving the reader to assume coverage passed.
  assert.match(e.msg, /CTRL004/);
});

test('Case I3d — behaviors-missing-narrow.md is exactly CTRL004, naming the uncovered rows', () => {
  const result = validateSurfaceSpec(loadBroken('behaviors-missing-narrow.md').frontMatter, ctx());

  assert.deepStrictEqual(codesOf(result), ['CTRL004'], JSON.stringify(result.errors));

  const e = result.errors[0];
  assert.strictEqual(e.path, 'controls[0].behaviors');
  assert.match(e.msg, /data_state=narrow/);
  assert.match(e.msg, /control_state=collapsed/);
  assert.match(e.msg, /control_state=expanded/);
});

test('Case I3e — an effect outside the §7.5 effect classes is exactly CTRL005', () => {
  const spec = mutate(loadPositiveControl(), (s) => {
    s.controls[0].behaviors[0].effect = ['toggle', 'teleport'];
  });

  const result = validateSurfaceSpec(spec, ctx());
  assert.deepStrictEqual(codesOf(result), ['CTRL005'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors[0].path, 'controls[0].behaviors[0].effect[1]');
  assert.match(result.errors[0].msg, /teleport/);

  // The control-level `effect` is the same rule at the other shape of control.
  const onControl = mutate(loadPositiveControl(), (s) => {
    s.controls[1].effect = ['levitate'];
  });
  const r2 = validateSurfaceSpec(onControl, ctx());
  assert.deepStrictEqual(codesOf(r2), ['CTRL005'], JSON.stringify(r2.errors));
  assert.strictEqual(r2.errors[0].path, 'controls[1].effect[0]');
});

test('Case I3f — visible_in naming a state that is not in `states` is exactly CTRL006', () => {
  const spec = mutate(loadPositiveControl(), (s) => {
    s.controls[1].visible_in = ['populated', 'long-content', 'no-such-state'];
  });

  const result = validateSurfaceSpec(spec, ctx());
  assert.deepStrictEqual(codesOf(result), ['CTRL006'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors[0].path, 'controls[1].visible_in[2]');
  assert.match(result.errors[0].msg, /no-such-state/);
});

test('Case I3g — the positive control header: 6 combinations, each matched by exactly one behaviour', () => {
  const spec = loadPositiveControl();
  const header = spec.controls[0];
  assert.strictEqual(header.id, 'rail.project.header');

  const table = enumerateBehaviorCombinations(header, spec);

  // visible_in (3) x control_state domain (2, from a11y.announces and the behaviours' own
  // `when`) = 6. If the control_state domain came out empty the table would be 3 rows of
  // `default` and the model would be self-consistent but WRONG — this is the assertion that
  // catches it.
  assert.strictEqual(table.length, 6, JSON.stringify(table, null, 1));
  assert.deepStrictEqual(
    [...new Set(table.map((r) => r.combo.control_state))].sort(),
    ['collapsed', 'expanded']
  );

  // The §4.2 worked table, row for row (data_state, control_state, viewport -> the ONE
  // behaviour index that matches).
  const rendered = table.map((r) => [r.combo.data_state, r.combo.control_state, r.combo.viewport, r.matched].join(' '));
  assert.deepStrictEqual(rendered, [
    'populated collapsed desktop 0',
    'populated expanded desktop 1',
    'long-content collapsed desktop 0',
    'long-content expanded desktop 1',
    'narrow collapsed narrow 2',
    'narrow expanded narrow 2'
  ]);

  // Every non-data dimension is resolved from the state, not guessed: `narrow` is narrow
  // because its 390x844 viewport is below NARROW_MAX_WIDTH, and nothing here is `denied`
  // because no route guard names a declared state.
  assert.strictEqual(NARROW_MAX_WIDTH, 600);
  assert.deepStrictEqual([...new Set(table.map((r) => r.combo.theme))], ['light']);
  assert.deepStrictEqual([...new Set(table.map((r) => r.combo.guard))], ['allowed']);
});

// ─── Fixture hygiene — the case that guards all the others ───────────────────

test('Case I3h — every broken fixture fails with exactly ONE code, the one its marker names', () => {
  const files = fs.readdirSync(BROKEN_DIR).filter((f) => f.endsWith('.md')).sort();

  // Written as a loop over the directory so 34-04's six new fixtures inherit the check and
  // cannot skip it. Five today.
  assert.ok(files.length >= 5, `expected the five known-broken fixtures, found ${files.join(', ')}`);

  for (const file of files) {
    const parsed = loadBroken(file);
    const expected = declaredCode(parsed.body);
    assert.ok(expected, `${file} carries no <!-- BROKEN: … expected code XXXNNN --> marker`);

    const result = validateSurfaceSpec(parsed.frontMatter, ctx());
    const observed = codesOf(result);

    // A fixture that trips three invariants proves nothing about the one it is named for.
    assert.strictEqual(observed.length, 1, `${file} -> ${JSON.stringify(result.errors, null, 1)}`);
    assert.strictEqual(observed[0], expected, `${file}: marker says ${expected}, validator says ${observed[0]}`);
  }
});

// ─── I4: states, seeds, and the outage/empty distinction (TRD 34-04) ─────────
//
// §4.4 (amended): every surface declares at minimum populated, empty, error, outage,
// long-content, narrow and dark; `loading` only when the surface owns an async fetch. Every
// state has a seed. `outage.must_show ∩ empty.must_show = ∅` — DISJOINT, not merely unequal.
// The amendment states the intersection rule in BOTH §4.4 and §4.5 I4, so there is nothing to
// reconcile: equality is one INSTANCE of an intersection, and I4b/I4c pin both.

test('Case I4a — state-without-seed.md fails with exactly STATE001, naming the state', () => {
  const result = validateSurfaceSpec(loadBroken('state-without-seed.md').frontMatter, ctx());

  assert.deepStrictEqual(codesOf(result), ['STATE001'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].path, 'states[3].seed');
  assert.match(result.errors[0].msg, /error/);
});

test('Case I4b — outage.must_show EQUAL to empty.must_show is exactly STATE002', () => {
  const spec = mutate(loadPositiveControl(), (s) => {
    const outage = s.states.find((st) => st.id === 'outage');
    const empty = s.states.find((st) => st.id === 'empty');
    outage.content.must_show = [...empty.content.must_show]; // the §4.4 "equal" half
    outage.content.must_not_show = [];
  });

  const result = validateSurfaceSpec(spec, ctx());

  assert.deepStrictEqual(codesOf(result), ['STATE002'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.match(result.errors[0].msg, /Create a project/);
});

test('Case I4c — a NON-equal intersection is STATE002 too (the stronger, amended rule)', () => {
  // The fixture: outage shows ["unavailable", "Create a project"], empty shows
  // ["Create a project"]. NOT equal — an equality-only implementation passes this and an
  // outage then evidences itself with the emptiness sentence. That is the whole point of the
  // amendment, so the FIXTURE carries the strong case and I4b carries the weak one.
  const result = validateSurfaceSpec(loadBroken('outage-equals-empty.md').frontMatter, ctx());

  assert.deepStrictEqual(codesOf(result), ['STATE002'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.match(result.errors[0].msg, /Create a project/);

  // And it is the INTERSECTION that is named, not the whole list.
  assert.doesNotMatch(result.errors[0].msg, /unavailable/);
});

test('Case I4d — a missing minimum state is exactly STATE003, ONE error naming every one', () => {
  const noDark = mutate(loadPositiveControl(), (s) => {
    s.states = s.states.filter((st) => st.id !== 'dark');
  });

  const result = validateSurfaceSpec(noDark, ctx());

  assert.deepStrictEqual(codesOf(result), ['STATE003'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].path, 'states');
  assert.match(result.errors[0].msg, /dark/);

  // CRITICAL: ONE error listing every missing state, never one error per state — otherwise a
  // minimal spec produces five errors and the fixture-hygiene loop (I3h) reddens for every
  // fixture that happens to be short of states.
  const twoMissing = mutate(loadPositiveControl(), (s) => {
    s.states = s.states.filter((st) => st.id !== 'dark' && st.id !== 'narrow');
    // `narrow` is in the header control's visible_in; drop it there too so this case is about
    // STATE003 alone and not about CTRL006.
    s.controls.forEach((c) => { c.visible_in = c.visible_in.filter((v) => v !== 'narrow'); });
    // With `narrow` gone the header's third behaviour matches nothing it needs to cover, but
    // exclusivity/coverage still hold: B3 (`when: {viewport: narrow}`) simply never matches.
  });

  const two = validateSurfaceSpec(twoMissing, ctx());
  const state003 = two.errors.filter((e) => e.code === 'STATE003');
  assert.strictEqual(state003.length, 1, `expected ONE STATE003: ${JSON.stringify(two.errors)}`);
  assert.match(state003[0].msg, /dark/);
  assert.match(state003[0].msg, /narrow/);
});

test('Case I4e — `loading` is NOT in the minimum set (the negative, so I4d cannot over-fire)', () => {
  // The positive control declares no `loading` state at all and V1 is green; assert the rule
  // directly too, because "seven states plus loading" written by mistake reddens V1 and the
  // diagnosis then costs an hour.
  const spec = loadPositiveControl();
  assert.ok(!spec.states.some((st) => st.id === 'loading'), 'the positive control declares no loading state');

  const result = validateSurfaceSpec(spec, ctx());
  assert.ok(!result.errors.some((e) => e.code === 'STATE003'), JSON.stringify(result.errors));

  // And declaring one is equally fine — `loading` is allowed, just never required.
  const withLoading = mutate(spec, (s) => {
    s.states.push({ id: 'loading', seed: 'projects-3-conversations-12' });
  });
  assert.deepStrictEqual(validateSurfaceSpec(withLoading, ctx()).errors, []);
});

// ─── I5: patterns, and the MISSING case (TRD 34-04) ──────────────────────────
//
// `ctx.patterns` is the pattern catalogue of the pinned eden-ui-flutter release. THREE states,
// and the whole invariant turns on keeping them apart:
//   undefined  the catalogue is UNREACHABLE          -> PAT000, status MISSING, `ok` unchanged
//   []         reachable and declares no patterns    -> PAT001 for every referenced pattern
//   [...]      reachable                             -> PAT001 / PAT002 as the entries say
// Collapsing `undefined` into `[]` makes an unreachable catalogue read as "checked, and every
// pattern is unknown"; collapsing it into "skip" makes it read as a pass. Neither is true.

const PATTERN_CATALOGUE = path.join(FIXTURE_DIR, 'pattern-catalogue.json');

/** The ctx of `ctx()`, but with the hand-built catalogue that carries `kind` + `must_not`. */
function ctxWithCatalogue() {
  const file = JSON.parse(fs.readFileSync(PATTERN_CATALOGUE, 'utf-8'));
  return { patterns: file.patterns, vocabulary: loadMustNotVocabulary().terms };
}

test('Case I5a — unknown-pattern.md fails with exactly PAT001, naming the pattern', () => {
  const result = validateSurfaceSpec(loadBroken('unknown-pattern.md').frontMatter, ctx());

  assert.deepStrictEqual(codesOf(result), ['PAT001'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].path, 'patterns[0]');
  assert.match(result.errors[0].msg, /navigation\/does-not-exist/);

  // And the same fixture through the RICHER catalogue reaches the same one code — the shape of
  // the entries (bare id vs {id, kind, must_not}) is not what decides PAT001.
  assert.deepStrictEqual(
    codesOf(validateSurfaceSpec(loadBroken('unknown-pattern.md').frontMatter, ctxWithCatalogue())),
    ['PAT001']
  );
});

test('Case I5b — a control dropping one of its pattern`s must_not defaults is exactly PAT002', () => {
  const dropped = mutate(loadPositiveControl(), (s) => {
    const header = s.controls.find((c) => c.id === 'rail.project.header');
    header.must_not = header.must_not.filter((m) => m !== 'cover sibling hit rects');
  });

  const result = validateSurfaceSpec(dropped, ctxWithCatalogue());

  assert.deepStrictEqual(codesOf(result), ['PAT002'], JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].path, 'controls[0].must_not');
  assert.match(result.errors[0].msg, /cover sibling hit rects/);
  assert.match(result.errors[0].msg, /navigation\/disclosure-group/);

  // The positive control keeps the default, so the SAME catalogue leaves it green — PAT002
  // fires for a dropped default, not for having a pattern at all.
  assert.deepStrictEqual(validateSurfaceSpec(loadPositiveControl(), ctxWithCatalogue()).errors, []);
});

test('Case I5c — an UNREACHABLE catalogue is PAT000/MISSING, never PAT001, and never flips ok', () => {
  const spec = loadPositiveControl();

  const unreachable = validateSurfaceSpec(spec, { vocabulary: loadMustNotVocabulary().terms });
  assert.deepStrictEqual(codesOf(unreachable), ['PAT000'], JSON.stringify(unreachable.errors));
  assert.strictEqual(unreachable.errors[0].status, 'MISSING');
  assert.strictEqual(unreachable.errors[0].path, 'patterns');

  // A check that could not run is not a failure. `ok` reflects real violations only — 34-08's
  // "refuse to compose" reads `ok`, and a MISSING catalogue must not block every surface.
  assert.strictEqual(unreachable.ok, true, 'a MISSING row must not flip ok');

  // An EMPTY catalogue is a different fact: it was reachable and declares no patterns, so every
  // referenced pattern is genuinely unknown.
  const emptyCatalogue = validateSurfaceSpec(spec, { patterns: [], vocabulary: loadMustNotVocabulary().terms });
  assert.deepStrictEqual(codesOf(emptyCatalogue), ['PAT001'], JSON.stringify(emptyCatalogue.errors));
  assert.strictEqual(emptyCatalogue.errors.length, 2, 'one PAT001 per referenced pattern');
  assert.strictEqual(emptyCatalogue.ok, false);

  // And a spec that references NO patterns has nothing to check: no MISSING row, no error.
  const noPatterns = mutate(spec, (s) => { delete s.patterns; });
  assert.deepStrictEqual(validateSurfaceSpec(noPatterns, { vocabulary: loadMustNotVocabulary().terms }).errors, []);
});
