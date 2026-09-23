'use strict';

/**
 * ui-spec-validate — the Surface Spec static invariants (objective 34-03 / 34-04).
 *
 *   validateSurfaceSpec(spec, {patterns, vocabulary}) -> {ok, errors, engine_version, schema_version}
 *
 * One export does the work and it NEVER throws. The verdict is structured — an array of
 * `{code, path, msg}` — because 34-04's `df-tools ui spec validate` arm turns `errors` into an
 * exit code and a thrown string turns that into a stack trace. `bin/lib/validate.cjs` is the
 * house precedent for the shape; the code SPACE is separate (`SPEC*`, `ROUTE*`, `CTRL*`,
 * `STATE*`, `PAT*`, `HIT*`, `FLOW*`, `GUARD*`), never `validate.cjs`'s `E`/`W`/`I` numbering.
 *
 * Shipped in this module (34-03):
 *   SPEC000  the input is not a readable spec object (null, a scalar, an empty front matter,
 *            or a yaml-lite parse failure — whose `.line` is carried into the message)
 *   SPEC001  the spec violates the declared STRUCTURE of surface-spec.schema.json
 *   SPEC002  `schema_version` is outside the engine's supported range (short-circuits)
 *   ROUTE001 `route.entry` is absent or empty
 *   ROUTE002 a route declares no `back` and is not `root: true`
 *   ROUTE003 an `entry: [{control: id}]` names a control this spec does not declare
 *   CTRL001  a control declares BOTH a top-level `does` and a `behaviors[]` list
 *   CTRL002  a control declares NEITHER
 *   CTRL003  two behaviours match the same observed combination (exclusivity)
 *   CTRL004  a combination is matched by no behaviour (coverage)
 *   CTRL005  an `effect` value outside the §7.5 effect classes
 *   CTRL006  `visible_in` names a state id absent from `states`
 * I4-I8 (states/seeds, outage != empty, patterns, hit_rect, flows, guards) are TRD 34-04 and
 * append to this table. The codes above are fixed; 34-04 must not collide with them.
 *
 * ── The behaviour-coverage model (BINDING — 34-05's control table and W2's `effect` check
 *    resolve the active behaviour by this same rule; if they diverge, the spec says one thing
 *    and the probe asserts another) ─────────────────────────────────────────────────────────
 *
 * §4.3 requires `behaviors[].when` clauses to be mutually exclusive and together cover every
 * `visible_in` state. `when` is a map over {control_state, viewport, theme, data_state, guard}.
 *
 *  1. A `when` key that is ABSENT is a WILDCARD. `{viewport: narrow}` matches every
 *     control_state, theme, data_state and guard.
 *  2. The domain of each dimension is CLOSED-WORLD, derived from the spec:
 *     - data_state    — the control's `visible_in` list.
 *     - viewport      — `narrow` when the state declares a `viewport` whose width is
 *                       < NARROW_MAX_WIDTH (600), or when the state's id is `narrow`;
 *                       otherwise `desktop`.
 *     - theme         — the state's `theme`, defaulting to `light`.
 *     - guard         — `denied` when the state is named as a route guard's denied state,
 *                       else `allowed`.
 *     - control_state — the union of every `control_state` value appearing in THIS control's
 *                       own `behaviors[].when`, plus every value in its `a11y.announces`.
 *                       If that union is empty, the dimension has the single value `default`.
 *  3. A behaviour MATCHES a combination when, for every key present in its `when`, the value
 *     equals the combination's value for that dimension.
 *  4. CTRL003 (exclusivity) fires when any combination is matched by two or more behaviours.
 *  5. CTRL004 (coverage)    fires when any combination is matched by zero behaviours.
 *
 * Worked against §4.2's `rail.project.header` — visible_in [populated, long-content, narrow],
 * control_state domain {collapsed, expanded}, six combinations, exactly one match on every row
 * (case I3g pins the table). Drop B3 -> the two `narrow` rows are uncovered -> CTRL004. Change
 * B3's `when` to `{control_state: collapsed}` -> it also matches rows 1 and 3 -> CTRL003.
 *
 * ── Three precedence rules, each written down because each is a decision ─────────────────────
 *
 *  a. SPEC002 SHORT-CIRCUITS. An engine that cannot read the spec's version has no basis for a
 *     verdict on its contents, so it reports the version and stops (the MISSING-not-pass rule
 *     applied to versions). Case I1c pins it.
 *  b. CTRL003 SHORT-CIRCUITS CTRL004 *within one control*. When two behaviours match the same
 *     combination the active behaviour is unresolvable, so a coverage verdict over that control
 *     has no basis; the CTRL003 message says so rather than leaving it silent.
 *  c. A SPECIFIC code beats the generic SPEC001 AT THE SAME PATH. The schema declares the
 *     `effect` enum and `route.entry`'s presence, and CTRL005/ROUTE001 own those same rules for
 *     a reader; reporting both would make every known-broken fixture fail with two codes and
 *     prove nothing about the invariant it is named for (proposal §17). One node, one verdict —
 *     the most specific one.
 *
 * And one deliberate NON-implementation: the schema's `minItems` is not checked. "At least one
 * declared way in" is ROUTE001's rule, and a rule with two homes is the drift objective 33
 * existed to close.
 *
 * Consumed by: 34-04 (the `df-tools ui spec validate` arm), 34-05 (render), 34-06 (sheet).
 * Depends on: ./ui-spec.cjs (the schema + vocabulary LOADERS — never a second fs read of the
 * JSON) and ./helpers.cjs (`pluginVersion()`). No npm dependencies.
 */

const { loadSurfaceSpecSchema } = require('./ui-spec.cjs');
const { pluginVersion } = require('./helpers.cjs');

/**
 * The single breakpoint constant. A state is `narrow` when its declared viewport width is below
 * this, or when its id is literally `narrow`. 34-05's capture list and 34-06's sheet columns
 * read the same rule — change it here and nowhere else.
 */
const NARROW_MAX_WIDTH = 600;

const DEFAULT_CONTROL_STATE = 'default';
const DIMENSIONS = ['data_state', 'control_state', 'viewport', 'theme', 'guard'];

// ─── The verdict ──────────────────────────────────────────────────────────────

function err(code, path, msg) {
  return { code, path, msg };
}

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function join(ptr, key) {
  return ptr ? `${ptr}.${key}` : String(key);
}

// ─── I1: the structural check, over the schema the loader returns ─────────────
//
// A hand-rolled walk of the declared structure, NOT a JSON Schema engine: this repo carries one
// npm dependency (`node-pty`) on purpose and a validator package is not going to be the second.
// Supported: $ref, type, required, properties, additionalProperties:false, items, enum, pattern,
// minimum, anyOf, oneOf. Everything else in the file (descriptions, minItems, $id) is ignored.

function deref(node, root) {
  let seen = 0;
  while (node && typeof node.$ref === 'string') {
    if (++seen > 16) return {};
    const parts = node.$ref.replace(/^#\//, '').split('/');
    let cur = root;
    for (const p of parts) {
      cur = cur && cur[p.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    node = cur || {};
  }
  return node || {};
}

function typeOk(value, type) {
  switch (type) {
    case 'object': return isPlainObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return true;
  }
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Collects SPEC001 errors for `value` against schema `node`. Returns the error array. */
function checkStructure(value, node, root, ptr) {
  const out = [];
  const s = deref(node, root);

  if (Array.isArray(s.anyOf) || Array.isArray(s.oneOf)) {
    const branches = s.anyOf || s.oneOf;
    const matched = branches.some((b) => checkStructure(value, b, root, ptr).length === 0);
    if (!matched) {
      out.push(err('SPEC001', ptr, `value does not match any form the schema declares for this node (got ${describe(value)})`));
    }
    return out;
  }

  if (s.type && !typeOk(value, s.type)) {
    out.push(err('SPEC001', ptr, `expected type ${s.type} here, got ${describe(value)}`));
    return out; // every further check on this node would be noise about the same defect
  }

  if (Array.isArray(s.enum) && !s.enum.includes(value)) {
    out.push(err('SPEC001', ptr, `value ${JSON.stringify(value)} is not one of the declared values: ${s.enum.join(', ')}`));
    return out;
  }

  if (typeof s.pattern === 'string' && typeof value === 'string') {
    if (!new RegExp(s.pattern).test(value)) {
      out.push(err('SPEC001', ptr, `${JSON.stringify(value)} does not match the pattern the schema declares here: ${s.pattern}`));
      return out;
    }
  }

  if (typeof s.minimum === 'number' && typeof value === 'number' && value < s.minimum) {
    out.push(err('SPEC001', ptr, `value ${value} is below the declared minimum ${s.minimum}`));
  }

  if (Array.isArray(value) && s.items) {
    value.forEach((el, i) => {
      out.push(...checkStructure(el, s.items, root, `${ptr}[${i}]`));
    });
    return out;
  }

  if (isPlainObject(value)) {
    const props = s.properties || {};

    for (const key of s.required || []) {
      if (!(key in value)) {
        out.push(err('SPEC001', join(ptr, key), `required key ${JSON.stringify(key)} is absent — the schema declares it here`));
      }
    }

    for (const [key, v] of Object.entries(value)) {
      if (props[key]) {
        out.push(...checkStructure(v, props[key], root, join(ptr, key)));
      } else if (s.additionalProperties === false) {
        out.push(err('SPEC001', join(ptr, key), `unknown key ${JSON.stringify(key)} — the schema declares no such property here`));
      }
    }
  }

  return out;
}

// ─── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Rule (c): one node, one verdict. Where a specific invariant reports at the SAME path as the
 * generic structural check, the structural error is dropped.
 */
function dropGenericDuplicates(errors) {
  const specific = new Set(errors.filter((e) => e.code !== 'SPEC001').map((e) => e.path));
  return errors.filter((e) => e.code !== 'SPEC001' || !specific.has(e.path));
}

function order(errors) {
  return errors.slice().sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.msg < b.msg ? -1 : a.msg > b.msg ? 1 : 0;
  });
}

function verdict(errors, schema_version) {
  const list = order(dropGenericDuplicates(errors));
  return {
    ok: list.length === 0,
    errors: list,
    engine_version: pluginVersion(),
    schema_version
  };
}

/**
 * Validate one Surface Spec's parsed front matter against invariants I1-I3.
 *
 * @param {object} spec  the `frontMatter` of a parsed Surface Spec
 * @param {{patterns?: string[], vocabulary?: string[]}} [ctx]
 *        `patterns` is read by I5 and `vocabulary` by CTRL007 — both TRD 34-04. Accepted here
 *        so the signature does not change under callers when those invariants land.
 * @returns {{ok: boolean, errors: Array<{code: string, path: string, msg: string}>,
 *            engine_version: string, schema_version: (number|null)}}
 */
function validateSurfaceSpec(spec, ctx = {}) {
  const errors = [];
  let schema_version = null;

  try {
    // SPEC000 — the input is not a spec at all. An EMPTY object counts: front matter that
    // parsed to no keys is the vacuous-pass hazard `ui-spec.cjs` exists to refuse, and every
    // invariant below would pass over it while telling the author their spec is fine.
    if (!isPlainObject(spec) || Object.keys(spec).length === 0) {
      const line = spec && typeof spec === 'object' && typeof spec.line === 'number'
        ? ` (line ${spec.line})`
        : '';
      const what = spec === null
        ? 'null'
        : Array.isArray(spec)
          ? 'a list'
          : isPlainObject(spec)
            ? 'an empty mapping'
            : spec instanceof Error
              ? `a parse failure: ${spec.message}`
              : `a ${typeof spec}`;
      return verdict(
        [err('SPEC000', 'spec', `not a readable Surface Spec: expected the parsed front-matter mapping, got ${what}${line}`)],
        null
      );
    }

    const schema = loadSurfaceSpecSchema();
    const supported = [schema.schema_version == null ? 1 : schema.schema_version];
    schema_version = spec.schema_version == null ? 1 : spec.schema_version;

    // Rule (a): SPEC002 short-circuits. Nothing below it runs.
    if (!supported.includes(schema_version)) {
      return verdict(
        [err('SPEC002', 'schema_version', `schema_version ${JSON.stringify(schema_version)} is outside this engine's supported range [${supported.join(', ')}] — no invariant was evaluated against this spec`)],
        schema_version
      );
    }

    // I1 — the declared structure.
    errors.push(...checkStructure(spec, schema, schema, ''));

    // I2/I3 land in task 3; I4-I8 in TRD 34-04.
  } catch (e) {
    // CRITICAL: an escaped exception becomes a verdict, never a stack trace. 34-04's exit-code
    // contract and case V3 both depend on it.
    errors.push(err('SPEC000', 'spec', `the validator could not read this spec: ${e && e.message ? e.message : String(e)}`));
  }

  return verdict(errors, schema_version);
}

module.exports = {
  validateSurfaceSpec,
  NARROW_MAX_WIDTH
};
