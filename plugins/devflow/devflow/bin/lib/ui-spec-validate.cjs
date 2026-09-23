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
 *
 * Appended by 34-04 (I4-I8):
 *   STATE001 a state with no `seed`
 *   STATE002 outage.content.must_show INTERSECTS empty.content.must_show (disjoint, not
 *            merely unequal — the amended §4.4 / §4.5 I4)
 *   STATE003 §4.4's minimum state set is incomplete (ONE error listing every missing state)
 *   PAT000   the pattern catalogue is UNREACHABLE -> status MISSING, does NOT flip `ok`
 *   PAT001   a referenced pattern is not in the catalogue
 *   PAT002   a control of a pattern kind drops one of that pattern's `must_not` defaults
 *   HIT000   the hit-rect invariant could not run -> status MISSING, does NOT flip `ok`
 *   HIT001   a `hit_rect.disjoint_from` entry that does not resolve, names its own control,
 *            or is not reciprocal
 *   HIT002   a `hit_rect.within` entry that does not resolve, or that ALSO appears in this
 *            control's `disjoint_from`
 *   FLOW001  a flow step names a control or route that does not exist (and that this
 *            single-spec engine was entitled to resolve — see `isNamespaceLocal`)
 *   FLOW002  a flow's last step is neither a `back` nor a route declared `root: true`
 *   GUARD001 a route guard that names no denied state (see `resolveGuardDeniedState`)
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

/**
 * A check that COULD NOT RUN. It carries the extra `status: 'MISSING'` key, it is reported in
 * `errors` so no caller can miss it, and it does NOT flip `ok`.
 *
 * The rule, stated once for 34-08 ("refuse to compose without a valid spec") and for W2's
 * verifier replay: `ok` reflects REAL VIOLATIONS only. A MISSING row is neither a pass nor a
 * failure — it is the honest answer for a question this engine could not ask, and it stays on
 * the human-verify list. An unreachable pattern catalogue must not block composition on every
 * surface in the repo; it must also never read as "patterns check passed".
 */
function missing(code, path, msg) {
  return { code, path, msg, status: 'MISSING' };
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

// ─── I2: routes ───────────────────────────────────────────────────────────────

/**
 * ROUTE001 entry absent or empty · ROUTE002 no `back` and not `root: true` ·
 * ROUTE003 an `{control: id}` entry names a control this spec does not declare.
 *
 * A bare string in `entry` (`deeplink`, `browser-back`) is a declared NON-control entry and is
 * valid — §4.2's own example mixes the two forms in one list. Resolving it as a control id is
 * the single easiest way to break the positive control (case I2e).
 */
function checkRoutes(spec, errors) {
  if (!Array.isArray(spec.routes)) return; // structure is SPEC001's to report, not ours

  const controlIds = new Set(
    (Array.isArray(spec.controls) ? spec.controls : [])
      .filter(isPlainObject)
      .map((c) => c.id)
      .filter((id) => typeof id === 'string')
  );
  const surface = typeof spec.surface === 'string' ? spec.surface : null;

  spec.routes.forEach((route, i) => {
    if (!isPlainObject(route)) return;
    const at = `routes[${i}]`;
    const rid = typeof route.id === 'string' ? route.id : `#${i}`;

    if (!Array.isArray(route.entry) || route.entry.length === 0) {
      errors.push(err('ROUTE001', `${at}.entry`,
        `route ${rid} declares no way in — §4.5 I2 requires at least one \`entry\`, a control or an entry kind such as deeplink`));
    }

    if (!isPlainObject(route.back) && route.root !== true) {
      errors.push(err('ROUTE002', `${at}.back`,
        `route ${rid} declares no \`back\` and is not the declared root — §4.5 I2 requires one or the other, so add \`back: {target: ...}\` or \`root: true\``));
    }

    if (Array.isArray(route.entry)) {
      route.entry.forEach((entry, j) => {
        if (!isPlainObject(entry) || typeof entry.control !== 'string') return; // a bare string is valid
        const id = entry.control;
        if (controlIds.has(id)) return;

        // Cross-surface honesty (§4.5 I2): an entry control "may live in another spec of the
        // same repo". W1b validates ONE spec with no repo scan, so an id this surface does not
        // prefix is reported as MISSING — visible, never silently passed and never claimed
        // absent. W2's repo-wide resolution replaces this branch.
        const isLocalId = surface !== null && (id === surface || id.startsWith(`${surface}.`));
        errors.push(err('ROUTE003', `${at}.entry[${j}]`, isLocalId
          ? `route ${rid} entry[${j}] names control ${id}, which surface ${surface} declares no control for — resolution: UNRESOLVED`
          : `route ${rid} entry[${j}] names control ${id}, which is not declared in this spec and is not prefixed by surface ${surface || '(unnamed)'} — resolution: MISSING (cross-surface entries are resolved in W2, not by this engine)`));
      });
    }
  });
}

// ─── I3: controls, and the §4.3 exclusivity/coverage model ───────────────────

/** `WxH` -> W, or null when the state declares no viewport. */
function widthOf(state) {
  const m = state && typeof state.viewport === 'string' ? /^([0-9]+)x[0-9]+$/.exec(state.viewport) : null;
  return m ? Number(m[1]) : null;
}

/**
 * THE GUARD -> DENIED-STATE LINKAGE RULE. One home, two readers: invariant I8 (GUARD001) and
 * the behaviour-coverage model's `guard` dimension. 34-05's nav graph draws its guard edge
 * from this same function — if it re-implements the rule, the spec says one thing and the
 * graph draws another.
 *
 * §4.5 I8 reads "`guards` name the denied state each renders", but §4.2's own example does NOT
 * name it directly: the route declares `guards: [member-of-workspace]` and the state is called
 * `guard-denied`. So a guard `G` is resolved against `states[].id` in ORDER:
 *
 *   1. `G` itself          — the direct form the invariant's wording describes;
 *   2. `${G}-denied`       — the per-guard form;
 *   3. `guard-denied`      — the canonical single-denied-state form §4.2 uses. A surface with
 *                            one denied state serves every guard on it.
 *
 * The resolved state must ALSO declare an `as:` identity. That is the field which makes it a
 * DENIED state rather than another data state, and it is what labels the guard edge: `as`
 * names who is being refused. A resolved state with no `as` is GUARD001, not a pass.
 *
 * @returns {{state: object, id: string}|null}
 */
function resolveGuardDeniedState(guard, statesById) {
  if (typeof guard !== 'string') return null;
  for (const candidate of [guard, `${guard}-denied`, 'guard-denied']) {
    if (statesById.has(candidate)) return { state: statesById.get(candidate), id: candidate };
  }
  return null;
}

function statesByIdOf(spec) {
  return new Map(
    (Array.isArray(spec.states) ? spec.states : [])
      .filter(isPlainObject)
      .filter((st) => typeof st.id === 'string')
      .map((st) => [st.id, st])
  );
}

/** The state ids a route guard denies, by the linkage rule above. */
function deniedStateIds(spec) {
  const statesById = statesByIdOf(spec);
  const denied = new Set();
  for (const route of Array.isArray(spec.routes) ? spec.routes : []) {
    if (!isPlainObject(route) || !Array.isArray(route.guards)) continue;
    for (const g of route.guards) {
      const hit = resolveGuardDeniedState(g, statesById);
      // A guard that resolves to nothing is invariant I8's problem (GUARD001), not this
      // model's: it is left alone rather than guessed into the guard dimension.
      if (hit) denied.add(hit.id);
    }
  }
  return denied;
}

/**
 * The closed-world combination table for one control, and the behaviour indexes matching each
 * row. Exported because 34-05's control table and W2's active-behaviour resolution must use
 * THIS function rather than a second implementation of the same rule.
 *
 * @returns {Array<{combo: object, matched: number[]}>}
 */
function enumerateBehaviorCombinations(control, spec) {
  const behaviors = Array.isArray(control.behaviors) ? control.behaviors : [];
  const statesById = new Map(
    (Array.isArray(spec.states) ? spec.states : [])
      .filter(isPlainObject)
      .map((s) => [s.id, s])
  );
  const denied = deniedStateIds(spec);

  // control_state: the union of this control's own `when` values and its a11y.announces.
  const controlStates = [];
  for (const b of behaviors) {
    const v = isPlainObject(b) && isPlainObject(b.when) ? b.when.control_state : undefined;
    if (typeof v === 'string' && !controlStates.includes(v)) controlStates.push(v);
  }
  const announces = isPlainObject(control.a11y) && Array.isArray(control.a11y.announces)
    ? control.a11y.announces
    : [];
  for (const v of announces) {
    if (typeof v === 'string' && !controlStates.includes(v)) controlStates.push(v);
  }
  if (controlStates.length === 0) controlStates.push(DEFAULT_CONTROL_STATE);

  const dataStates = Array.isArray(control.visible_in) ? control.visible_in : [];
  const table = [];

  for (const dataState of dataStates) {
    const state = statesById.get(dataState);
    const width = widthOf(state);
    const combo = {
      data_state: dataState,
      control_state: null,
      viewport: (width !== null && width < NARROW_MAX_WIDTH) || dataState === 'narrow' ? 'narrow' : 'desktop',
      theme: (state && typeof state.theme === 'string' ? state.theme : null) || 'light',
      guard: denied.has(dataState) ? 'denied' : 'allowed'
    };

    for (const controlState of controlStates) {
      const row = { ...combo, control_state: controlState };
      const matched = [];
      behaviors.forEach((b, k) => {
        const when = isPlainObject(b) && isPlainObject(b.when) ? b.when : {};
        // An ABSENT `when` key is a WILDCARD. Get this backwards and the positive control
        // fails coverage on every row.
        const hit = DIMENSIONS.every((d) => when[d] === undefined || when[d] === row[d]);
        if (hit) matched.push(k);
      });
      table.push({ combo: row, matched });
    }
  }

  return table;
}

function renderCombo(combo) {
  return DIMENSIONS.map((d) => `${d}=${combo[d]}`).join(', ');
}

/**
 * CTRL001 both `does` and `behaviors` · CTRL002 neither · CTRL003 exclusivity ·
 * CTRL004 coverage · CTRL005 effect vocabulary · CTRL006 visible_in resolves to a state.
 */
function checkControls(spec, effects, errors) {
  if (!Array.isArray(spec.controls)) return;

  const haveStates = Array.isArray(spec.states);
  const stateIds = new Set(
    (haveStates ? spec.states : []).filter(isPlainObject).map((s) => s.id)
  );

  spec.controls.forEach((control, i) => {
    if (!isPlainObject(control)) return;
    const at = `controls[${i}]`;
    const cid = typeof control.id === 'string' ? control.id : `#${i}`;

    const hasDoes = typeof control.does === 'string';
    const hasBehaviors = Array.isArray(control.behaviors) && control.behaviors.length > 0;

    if (hasDoes && hasBehaviors) {
      errors.push(err('CTRL001', at,
        `control ${cid} declares BOTH a top-level \`does\` and a \`behaviors[]\` list — §4.3 allows either one does+effect pair or a behaviors list, not two competing statements of what it does`));
    } else if (!hasDoes && !hasBehaviors) {
      errors.push(err('CTRL002', at,
        `control ${cid} declares NEITHER a \`does\` + \`effect\` pair nor a \`behaviors[]\` list — §4.3 requires one of the two, so the spec does not say what this control does`));
    }

    // CTRL005 — the §7.5 effect classes, read off the schema's own enum.
    const effectLists = [['effect', control.effect]];
    if (Array.isArray(control.behaviors)) {
      control.behaviors.forEach((b, j) => {
        if (isPlainObject(b)) effectLists.push([`behaviors[${j}].effect`, b.effect]);
      });
    }
    for (const [where, list] of effectLists) {
      if (!Array.isArray(list)) continue;
      list.forEach((value, k) => {
        if (effects.includes(value)) return;
        errors.push(err('CTRL005', `${at}.${where}[${k}]`,
          `control ${cid} declares effect ${JSON.stringify(value)}, which is not one of the §7.5 effect classes: ${effects.join(', ')}`));
      });
    }

    // CTRL006 — visible_in resolves. Skipped entirely when `states` is not a list: that is
    // SPEC001's to report, and a verdict reached with no state list has no basis.
    let visibleResolves = true;
    if (haveStates && Array.isArray(control.visible_in)) {
      control.visible_in.forEach((id, k) => {
        if (stateIds.has(id)) return;
        visibleResolves = false;
        errors.push(err('CTRL006', `${at}.visible_in[${k}]`,
          `control ${cid} is declared visible in ${JSON.stringify(id)}, which is not a state this spec declares — \`visible_in\` is a subset of states[].id`));
      });
    }

    if (!hasBehaviors || !haveStates || !visibleResolves) return;

    const table = enumerateBehaviorCombinations(control, spec);

    // CTRL003 — exclusivity. One error per colliding behaviour PAIR, at the later behaviour.
    const collisions = new Map();
    for (const row of table) {
      if (row.matched.length < 2) continue;
      for (let a = 0; a < row.matched.length; a++) {
        for (let b = a + 1; b < row.matched.length; b++) {
          const key = `${row.matched[a]}:${row.matched[b]}`;
          if (!collisions.has(key)) collisions.set(key, { a: row.matched[a], b: row.matched[b], first: row.combo, count: 0 });
          collisions.get(key).count += 1;
        }
      }
    }

    if (collisions.size > 0) {
      for (const c of collisions.values()) {
        errors.push(err('CTRL003', `${at}.behaviors[${c.b}].when`,
          `control ${cid}: behaviours ${c.a} and ${c.b} both match (${renderCombo(c.first)})${c.count > 1 ? ` and ${c.count - 1} further combination(s)` : ''} — §4.3 requires \`when\` clauses to be mutually exclusive, and CTRL004 coverage is NOT evaluated for this control while the active behaviour is unresolvable`));
      }
      // Rule (b): exclusivity short-circuits coverage WITHIN this control.
      return;
    }

    // CTRL004 — coverage. One error per control, naming the uncovered combinations.
    const uncovered = table.filter((row) => row.matched.length === 0);
    if (uncovered.length > 0) {
      const shown = uncovered.slice(0, 3).map((row) => `(${renderCombo(row.combo)})`).join('; ');
      errors.push(err('CTRL004', `${at}.behaviors`,
        `control ${cid}: no behaviour matches ${shown}${uncovered.length > 3 ? ` and ${uncovered.length - 3} more` : ''} — §4.3 requires the \`when\` clauses to together cover every \`visible_in\` state`));
    }
  });
}

// ─── I4: states, seeds, and the outage/empty distinction ─────────────────────

/**
 * §4.4's minimum state set. `loading` is DELIBERATELY absent: §4.4 declares it only when the
 * surface owns an async fetch, so requiring it would redden every surface that does not.
 * 34-05's capture list reads this constant rather than re-listing the states.
 */
const MINIMUM_STATES = ['populated', 'empty', 'error', 'outage', 'long-content', 'narrow', 'dark'];

/**
 * STATE001 a state with no `seed` · STATE002 `outage.must_show` INTERSECTS `empty.must_show` ·
 * STATE003 §4.4's minimum set is incomplete (ONE error listing every missing state).
 *
 * STATE002 is an INTERSECTION test, not an equality test. The amended §4.4 and §4.5 I4 both
 * read `outage.must_show ∩ empty.must_show = ∅` — disjoint, not merely unequal — and equality
 * is one instance of a non-empty intersection, so the stronger rule satisfies both documents.
 * Cases I4b (equal) and I4c (overlapping, not equal) pin the two halves.
 */
function checkStates(spec, errors) {
  if (!Array.isArray(spec.states)) return; // no basis for a verdict; SPEC001 owns the shape

  const declared = new Set();

  spec.states.forEach((state, i) => {
    if (!isPlainObject(state)) return;
    const sid = typeof state.id === 'string' ? state.id : `#${i}`;
    if (typeof state.id === 'string') declared.add(state.id);

    if (typeof state.seed !== 'string' || state.seed.length === 0) {
      errors.push(err('STATE001', `states[${i}].seed`,
        `state ${sid} declares no \`seed\` — §4.4 requires one per state, and without it the e2e entrypoint has nothing to seed this state from, so it can never be captured`));
    }
  });

  // STATE003 — ONE error listing every missing state. One error PER state would make a short
  // spec fail with five codes and redden the fixture-hygiene loop for every minimal fixture.
  const missing = MINIMUM_STATES.filter((id) => !declared.has(id));
  if (missing.length > 0) {
    errors.push(err('STATE003', 'states',
      `§4.4's minimum state set is incomplete — this surface declares no ${missing.join(', ')}. Every surface declares populated, empty, error, outage, long-content, narrow and dark; \`loading\` only when the surface owns an async fetch`));
  }

  // STATE002 — the outage/empty distinction.
  const byId = new Map(spec.states.filter(isPlainObject).map((st) => [st.id, st]));
  const outage = byId.get('outage');
  const empty = byId.get('empty');
  const showsOf = (st) => (isPlainObject(st) && isPlainObject(st.content) && Array.isArray(st.content.must_show)
    ? st.content.must_show.filter((v) => typeof v === 'string')
    : null);
  const outageShows = showsOf(outage);
  const emptyShows = showsOf(empty);

  if (outageShows && emptyShows) {
    const shared = outageShows.filter((v) => emptyShows.includes(v));
    if (shared.length > 0) {
      const at = spec.states.indexOf(outage);
      errors.push(err('STATE002', `states[${at}].content.must_show`,
        `\`outage\` and \`empty\` both declare must_show ${shared.map((v) => JSON.stringify(v)).join(', ')} — §4.4 requires the two sets to be DISJOINT, not merely unequal: an outage and an emptiness may never be evidenced by the same sentence`));
    }
  }
}

// ─── I5: patterns, and the three states of the catalogue ─────────────────────

/** A catalogue entry is either a bare id string or `{id, kind?, must_not?}`. */
function patternIdOf(entry) {
  if (typeof entry === 'string') return entry;
  if (isPlainObject(entry) && typeof entry.id === 'string') return entry.id;
  return null;
}

/**
 * PAT000 the catalogue is UNREACHABLE -> MISSING · PAT001 a referenced pattern is not in the
 * catalogue · PAT002 a control of a pattern kind drops one of that pattern`s `must_not`
 * defaults.
 *
 * `ctx.patterns` has THREE states and the invariant turns on keeping them apart:
 *   undefined (or null)  the pinned eden-ui-flutter release could not be read  -> PAT000
 *   []                   read, and it declares no patterns                     -> PAT001 each
 *   [...]                read                                                  -> PAT001/PAT002
 * Collapsing `undefined` into `[]` reports every pattern of every real spec as unknown;
 * collapsing it into "skip" turns an unreachable catalogue into a silent pass. W1b has no
 * pinned release, so the CLI arm passes `undefined` and every real run carries one MISSING row.
 */
function checkPatterns(spec, catalogue, errors) {
  const referenced = Array.isArray(spec.patterns)
    ? spec.patterns.filter((v) => typeof v === 'string')
    : [];
  if (referenced.length === 0) return; // nothing referenced: nothing to check, and no MISSING

  if (catalogue === undefined || catalogue === null) {
    errors.push(missing('PAT000', 'patterns',
      `the pattern catalogue is unreachable, so ${referenced.length} referenced pattern(s) could not be resolved and no \`must_not\` defaults could be inherited — §4.5 I5 is UNCHECKED for this spec, which is not the same as passing (supply one with \`--patterns\`)`));
    return;
  }

  const entries = Array.isArray(catalogue) ? catalogue : [];
  const byId = new Map();
  for (const entry of entries) {
    const id = patternIdOf(entry);
    if (id !== null) byId.set(id, entry);
  }

  spec.patterns.forEach((id, i) => {
    if (typeof id !== 'string' || byId.has(id)) return;
    errors.push(err('PAT001', `patterns[${i}]`,
      `pattern ${JSON.stringify(id)} is not in the pinned catalogue, which declares ${byId.size === 0 ? 'no patterns at all' : [...byId.keys()].join(', ')} — §4.5 I5 requires every referenced pattern to exist in the pinned eden-ui-flutter release`));
  });

  // PAT002 — the inherited `must_not` defaults of every REFERENCED pattern, by control kind.
  const defaultsByKind = new Map();
  for (const id of referenced) {
    const entry = byId.get(id);
    if (!isPlainObject(entry) || typeof entry.kind !== 'string' || !Array.isArray(entry.must_not)) continue;
    const list = defaultsByKind.get(entry.kind) || [];
    for (const term of entry.must_not) {
      if (typeof term === 'string') list.push({ pattern: id, term });
    }
    defaultsByKind.set(entry.kind, list);
  }
  if (defaultsByKind.size === 0 || !Array.isArray(spec.controls)) return;

  spec.controls.forEach((control, i) => {
    if (!isPlainObject(control) || typeof control.kind !== 'string') return;
    const defaults = defaultsByKind.get(control.kind) || [];
    if (defaults.length === 0) return;

    const own = new Set(Array.isArray(control.must_not) ? control.must_not.filter((v) => typeof v === 'string') : []);
    const dropped = defaults.filter((d) => !own.has(d.term));
    if (dropped.length === 0) return;

    const cid = typeof control.id === 'string' ? control.id : `#${i}`;
    errors.push(err('PAT002', `controls[${i}].must_not`,
      `control ${cid} is of kind ${control.kind} and therefore inherits ${dropped.map((d) => `${JSON.stringify(d.term)} (from ${d.pattern})`).join(', ')}, which its own \`must_not\` drops — §4.5 I5: a surface may not silently drop a pattern's defaults`));
  });
}

// ─── I6: hit rects — resolvability and consistency, NEVER overlap ────────────

/**
 * HIT000 the check could not run -> MISSING · HIT001 a `disjoint_from` entry that does not
 * resolve, is not reciprocal, or names its own control · HIT002 a `within` entry that does not
 * resolve, or that also appears in this control's `disjoint_from`.
 *
 * ── The I6 decision, implemented here (recorded in 34-04-SUMMARY.md, resolved 2026-09-22,
 *    options (a) AND (b) together) ──────────────────────────────────────────────────────────
 * A Surface Spec carries hand-authored INTENT; geometry is the probe's job. §4.2 gives
 * `hit_rect` no coordinates, so there is no field from which a static overlap could be
 * computed — and inventing one would mean asserting a layout the spec never states. So:
 *
 *   * `hit_rect.within: <control-id>` IS part of the schema (option a) — the declarable form
 *     of the aodex#544 defect, where a 40x40 chevron's semantics node spanned the whole 360px
 *     row. `hit_rect.max: "WxH"` is an upper bound the PROBE asserts, not a layout instruction.
 *   * The static half is RESOLVABILITY + CONSISTENCY only (option b, which is cheap and
 *     correct under (a) as well): every `disjoint_from` entry resolves to a control in this
 *     spec, is reciprocal, and never names its own control; every `within` entry resolves and
 *     does not ALSO appear in that control's `disjoint_from` — a control cannot be both inside
 *     another's area and disjoint from it.
 *   * OVERLAP ITSELF IS NOT CHECKED HERE. W2's probe measures the rects: §7.5 `disjoint`
 *     ("rects of a `disjoint_from` pair overlap"), `hit-target`, and the new `within` row
 *     ("a control declaring `hit_rect.within` has a rect not contained by that control's, or
 *     exceeding a declared `max`"). This function is what that probe inherits.
 *
 * Two failure modes, two codes, two known-broken fixtures — `hit-rect-overlap.md` (HIT001) and
 * `hit-rect-within-and-disjoint.md` (HIT002).
 */
function checkHitRects(spec, errors) {
  if (!Array.isArray(spec.controls)) {
    errors.push(missing('HIT000', 'controls',
      'the hit-rect invariant could not run: this spec declares no readable `controls` list, so no `disjoint_from` or `within` reference could be resolved — §4.5 I6 is UNCHECKED, which is not the same as passing'));
    return;
  }

  const controls = spec.controls.filter(isPlainObject);
  const ids = new Set(controls.map((c) => c.id).filter((id) => typeof id === 'string'));

  /** The `disjoint_from` list a control declares, as a Set of strings. */
  const disjointOf = (control) => new Set(
    isPlainObject(control.hit_rect) && Array.isArray(control.hit_rect.disjoint_from)
      ? control.hit_rect.disjoint_from.filter((v) => typeof v === 'string')
      : []
  );
  const byId = new Map(controls.filter((c) => typeof c.id === 'string').map((c) => [c.id, c]));

  spec.controls.forEach((control, i) => {
    if (!isPlainObject(control) || !isPlainObject(control.hit_rect)) return;
    const at = `controls[${i}].hit_rect`;
    const cid = typeof control.id === 'string' ? control.id : `#${i}`;
    const mine = disjointOf(control);

    // HIT001 — resolvability, self-reference, reciprocity.
    [...mine].forEach((target, j) => {
      const path = `${at}.disjoint_from[${j}]`;
      if (target === cid) {
        errors.push(err('HIT001', path,
          `control ${cid} lists ITSELF in \`hit_rect.disjoint_from\` — a control cannot be disjoint from itself, and the probe would have no second rect to measure against`));
        return;
      }
      if (!ids.has(target)) {
        errors.push(err('HIT001', path,
          `control ${cid} declares \`hit_rect.disjoint_from: [${target}]\`, which this spec declares no control for — §4.5 I6 requires every entry to resolve to a control in THIS spec (a hit-rect pair the probe can measure is two rects on one surface)`));
        return;
      }
      if (!disjointOf(byId.get(target)).has(cid)) {
        errors.push(err('HIT001', path,
          `control ${cid} declares \`hit_rect.disjoint_from: [${target}]\` but ${target} does not name ${cid} back — §4.5 I6 requires the declaration to be RECIPROCAL, so a separation one control claims is a separation both are held to`));
      }
    });

    // HIT002 — `within` resolves, and is not also declared disjoint.
    const within = control.hit_rect.within;
    if (typeof within !== 'string') return;
    const path = `${at}.within`;
    if (!ids.has(within)) {
      errors.push(err('HIT002', path,
        `control ${cid} declares \`hit_rect.within: ${within}\`, which this spec declares no control for — §4.5 I6 requires a \`within\` entry to resolve to a control in THIS spec`));
      return;
    }
    if (mine.has(within)) {
      errors.push(err('HIT002', path,
        `control ${cid} declares \`hit_rect.within: ${within}\` AND lists ${within} in its own \`disjoint_from\` — a control cannot be both inside another's area and disjoint from it, and W2's probe would be asked to assert containment and separation of the same pair of rects (§7.5 \`within\` vs \`disjoint\`)`));
    }
  });
}

// ─── I7: flows ───────────────────────────────────────────────────────────────

/** The schema's id shape. A value outside it is not an id and therefore not a reference. */
const ID_PATTERN = /^[a-z0-9][a-z0-9.\-]*$/;

/** `rail.project.header` -> `rail`. The namespace a reference is resolved within. */
function namespaceOf(id) {
  return String(id).split('.')[0];
}

/**
 * Is `ref` a reference this SINGLE-SPEC engine is entitled to resolve?
 *
 * ── The decision, written down because the positive control forces it ─────────────────────
 * §4.2's own flow references `rail.conversation[0]` (a runtime INSTANCE of a list item) and
 * `conversation.detail` (a route on ANOTHER surface). A closed-world "every step resolves"
 * check reddens the proposal's own worked example, and a MISSING row per step would bury a
 * real typo under two rows of noise on every well-formed spec. So a reference is IN SCOPE when
 * it is NAMESPACE-LOCAL: it matches the schema id pattern (which excludes `rail.conversation[0]`
 * outright — `[` is not in it) AND its first dot-segment is the first dot-segment of some
 * declared id OF THE SAME KIND. `conversation` is neither `project` nor `conversations`, so
 * `conversation.detail` is another surface's; `rail.project.headr` shares `rail` with
 * `rail.project.header` and is therefore a typo this engine can and does name.
 * Everything out of scope belongs to W2's repo-wide resolution, exactly as ROUTE003's MISSING
 * branch does.
 */
function isNamespaceLocal(ref, declaredIds) {
  if (typeof ref !== 'string' || !ID_PATTERN.test(ref)) return false;
  const ns = namespaceOf(ref);
  for (const id of declaredIds) {
    if (namespaceOf(id) === ns) return true;
  }
  return false;
}

/**
 * FLOW001 a step names a control or route that does not exist (and that this spec was
 * entitled to resolve) · FLOW002 a flow's last step is neither a `back` nor a declared
 * TERMINAL route.
 *
 * TERMINAL ROUTE, as implemented: a route of THIS spec declaring `root: true`. The TRD offers
 * `root: true` or an explicit `terminal: true`; `terminal` is NOT in the schema and
 * `additionalProperties: false` would make any spec using it fail SPEC001, so adding the word
 * here without adding the field would be a rule with no way to satisfy it. `root: true` is the
 * whole rule until a schema revision says otherwise (34-04-SUMMARY.md, "the terminal-route
 * rule").
 */
function checkFlows(spec, errors) {
  if (!Array.isArray(spec.flows)) return; // shape is SPEC001's; a verdict here would have no basis

  const controlIds = (Array.isArray(spec.controls) ? spec.controls : [])
    .filter(isPlainObject).map((c) => c.id).filter((id) => typeof id === 'string');
  const routeIds = (Array.isArray(spec.routes) ? spec.routes : [])
    .filter(isPlainObject).map((r) => r.id).filter((id) => typeof id === 'string');
  const controlSet = new Set(controlIds);
  const routeSet = new Set(routeIds);
  const terminalRoutes = new Set(
    (Array.isArray(spec.routes) ? spec.routes : [])
      .filter((r) => isPlainObject(r) && r.root === true && typeof r.id === 'string')
      .map((r) => r.id)
  );

  spec.flows.forEach((flow, i) => {
    if (!isPlainObject(flow) || !Array.isArray(flow.steps) || flow.steps.length === 0) return;
    const fid = typeof flow.id === 'string' ? flow.id : `#${i}`;

    flow.steps.forEach((step, j) => {
      if (!isPlainObject(step)) return;
      const at = `flows[${i}].steps[${j}]`;

      // `click` names a control. `back` names a back AFFORDANCE (app-back, browser-back), the
      // same vocabulary `route.back.via` uses — never a control, so it is not resolved as one.
      if (typeof step.click === 'string' && !controlSet.has(step.click)
          && isNamespaceLocal(step.click, controlIds)) {
        errors.push(err('FLOW001', `${at}.click`,
          `flow ${fid} step ${j} clicks ${step.click}, which this spec declares no control for — §4.5 I7 requires every step to reference an existing control (the id shares this surface's ${namespaceOf(step.click)} namespace, so it is resolved here rather than deferred to another spec)`));
      }

      const expected = isPlainObject(step.expect) ? step.expect.route : undefined;
      if (typeof expected === 'string' && !routeSet.has(expected)
          && isNamespaceLocal(expected, routeIds)) {
        errors.push(err('FLOW001', `${at}.expect.route`,
          `flow ${fid} step ${j} expects route ${expected}, which this spec declares no route for — §4.5 I7 requires every step to reference an existing route (the id shares this surface's ${namespaceOf(expected)} namespace, so it is resolved here rather than deferred to another spec)`));
      }
    });

    // FLOW002 — the last step.
    const last = flow.steps[flow.steps.length - 1];
    const lastIndex = flow.steps.length - 1;
    if (!isPlainObject(last)) return;
    const endsOnBack = typeof last.back === 'string' && last.back.length > 0;
    const endsRoute = isPlainObject(last.expect) ? last.expect.route : undefined;
    const endsOnTerminal = typeof endsRoute === 'string' && terminalRoutes.has(endsRoute);

    if (!endsOnBack && !endsOnTerminal) {
      errors.push(err('FLOW002', `flows[${i}].steps[${lastIndex}]`,
        `flow ${fid} ends on ${endsRoute ? `route ${endsRoute}` : 'a step with no declared destination'}, which is neither a \`back\` step nor a route this spec declares \`root: true\` — §4.5 I7 requires a flow to end in a back or a declared terminal route, or it never says how the reader gets out`));
    }
  });
}

// ─── I8: guards ──────────────────────────────────────────────────────────────

/**
 * GUARD001 — a route guard that names no denied state, by `resolveGuardDeniedState` above.
 *
 * Skipped entirely when `states` is not a list: a verdict about which state a guard renders,
 * reached with no state list, would have no basis (the same rule CTRL006 follows).
 */
function checkGuards(spec, errors) {
  if (!Array.isArray(spec.routes) || !Array.isArray(spec.states)) return;

  const statesById = statesByIdOf(spec);

  spec.routes.forEach((route, i) => {
    if (!isPlainObject(route) || !Array.isArray(route.guards)) return;
    const rid = typeof route.id === 'string' ? route.id : `#${i}`;

    route.guards.forEach((guard, j) => {
      if (typeof guard !== 'string') return;
      const at = `routes[${i}].guards[${j}]`;
      const hit = resolveGuardDeniedState(guard, statesById);

      if (!hit) {
        errors.push(err('GUARD001', at,
          `route ${rid} declares guard ${guard} but this spec declares no denied state for it — §4.5 I8 requires each guard to name the state it renders when the reader is refused. Declare a state with id ${guard}, ${guard}-denied, or guard-denied, carrying the \`as:\` identity being refused`));
        return;
      }
      if (typeof hit.state.as !== 'string' || hit.state.as.length === 0) {
        errors.push(err('GUARD001', at,
          `route ${rid} guard ${guard} resolves to state ${hit.id}, which declares no \`as:\` identity — §4.5 I8's denied state has to say WHO is refused, and \`as\` is the field that says it (and the label 34-05's nav graph puts on the guard edge)`));
      }
    });
  });
}

// ─── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Rule (c): one node, one verdict. Where a specific invariant reports at the SAME path as the
 * generic structural check, the structural error is dropped.
 */
function dropGenericDuplicates(errors) {
  // A MISSING row never suppresses a structural error: "I could not check this" is not a more
  // specific verdict than "this node is malformed".
  const specific = new Set(
    errors.filter((e) => e.code !== 'SPEC001' && e.status !== 'MISSING').map((e) => e.path)
  );
  return errors.filter((e) => e.code !== 'SPEC001' || !specific.has(e.path));
}

function order(errors) {
  return errors.slice().sort((a, b) => {
    // REAL VIOLATIONS first, MISSING rows after them. A reader (and `errors[0]`, which the CLI
    // cases read) wants what is wrong before what could not be checked; within each group the
    // order is (code, path, msg) and therefore deterministic across runs.
    const am = a.status === 'MISSING' ? 1 : 0;
    const bm = b.status === 'MISSING' ? 1 : 0;
    if (am !== bm) return am - bm;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.msg < b.msg ? -1 : a.msg > b.msg ? 1 : 0;
  });
}

function verdict(errors, schema_version) {
  const list = order(dropGenericDuplicates(errors));
  return {
    // `ok` counts REAL VIOLATIONS. MISSING rows are reported and do not flip it.
    ok: list.every((e) => e.status === 'MISSING'),
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

    // I2 — routes.
    checkRoutes(spec, errors);

    // I3 — controls. The effect classes are read off the SCHEMA's own enum, so §7.5's list
    // has exactly one home.
    const effects = (schema.$defs && schema.$defs.effect && Array.isArray(schema.$defs.effect.enum))
      ? schema.$defs.effect.enum
      : ['navigation', 'toggle', 'select', 'dialog', 'submit', 'inert'];
    checkControls(spec, effects, errors);

    // I4 — states, seeds, and the outage/empty distinction.
    checkStates(spec, errors);

    // I5 — patterns. `ctx.patterns` ABSENT means unreachable, not empty.
    checkPatterns(spec, ctx ? ctx.patterns : undefined, errors);

    // I6 — hit rects: resolvability and consistency. Overlap is the probe's, not ours.
    checkHitRects(spec, errors);

    // I7 — flows.
    checkFlows(spec, errors);

    // I8 — guards.
    checkGuards(spec, errors);
  } catch (e) {
    // CRITICAL: an escaped exception becomes a verdict, never a stack trace. 34-04's exit-code
    // contract and case V3 both depend on it.
    errors.push(err('SPEC000', 'spec', `the validator could not read this spec: ${e && e.message ? e.message : String(e)}`));
  }

  return verdict(errors, schema_version);
}

module.exports = {
  validateSurfaceSpec,
  enumerateBehaviorCombinations,
  resolveGuardDeniedState,
  NARROW_MAX_WIDTH,
  MINIMUM_STATES
};
