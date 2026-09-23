'use strict';

/**
 * ui-spec-render — the four artifacts DERIVED from one Surface Spec (objective 34-05).
 *
 *   renderSurfaceSpec(spec, {validate}) -> {manifest, navGraphMermaid, controlTableMd, captureList}
 *
 * §4.1's one-file rule: the spec is the only hand-authored artifact. The ui-eval manifest the
 * existing `flutter-ui-eval` engine consumes, the mermaid navigation graph (§8.2 — "can the
 * reader get back from here", answered before code exists), the plain-language control table a
 * human reads on the review sheet (§8.3) and the capture list 34-06's sheet grid and W2's
 * `ui probe` iterate are all DERIVED. Nothing downstream is hand-edited.
 *
 * ── PURE. No file I/O lives here ──────────────────────────────────────────────
 * One parsed front matter in, four values out. The CLI arm (`ui-spec-cli.cjs`) reads and
 * writes. That is what makes determinism (two calls are byte-identical) and the committed
 * snapshots cheap to assert, and it is why this module never learns a path.
 *
 * ── Render REFUSES an invalid spec ────────────────────────────────────────────
 * `validate: true` (the default) runs the full I1-I8 set and throws `RenderRefused` when the
 * spec carries a real violation. A manifest, a graph and a table derived from a spec nobody
 * checked look authoritative and are not — everything downstream treats them as the truth.
 * `validate: false` exists for the unit cases that deliberately feed a broken spec to pin a
 * FIELD convention rather than an invariant, and for nothing else.
 *
 * ── MISSING is not a pass (read `ui-spec-validate.cjs`'s header first) ────────
 * `ok` counts REAL violations. A `*000` row (PAT000 — the pattern catalogue is unreachable;
 * HIT000 — the hit-rect check could not run) carries `status: 'MISSING'`: the check did not
 * run, so it is neither pass nor failure and it does NOT flip `ok`. Render therefore proceeds
 * past a MISSING row — but it must never LAUNDER one into a pass. The verdict is returned on
 * `renderSurfaceSpec(...).validation` and the CLI arm prints MISSING rows to stderr as an
 * advisory; 34-06's sheet renders them as MISSING cells. Silently dropping them is the
 * silent-green class this program exists to kill.
 *
 * ── Three constants 34-06's grid columns and W1c's identity set read ──────────
 *   DEFAULT_IDENTITY = 'primary'  — §7.4's identity set is (primary, workspace-member,
 *                                   non-member, platform-admin, support-agent); §4.2 annotates
 *                                   `as` "default: primary user".
 *   DEFAULT_THEME    = 'light'    — the same default `ui-spec-validate.cjs`'s coverage model
 *                                   uses for a state that declares no `theme`.
 *   DEFAULT_WIDTH    = 1280       — the desktop capture width. A state that declares a
 *                                   `viewport` contributes ITS width instead.
 * `NARROW_MAX_WIDTH` is NOT re-declared here: it has one home, in `ui-spec-validate.cjs`.
 *
 * Consumed by: ui-spec-cli.cjs (`ui spec render`), 34-06 (the sheet), W2 (`ui probe`).
 * Depends on: ./ui-spec-validate.cjs, ./helpers.cjs (`pluginVersion()`). No npm dependencies —
 * in particular no mermaid library and no markdown-table library: both outputs are string
 * building, and a dependency for string building is a dependency for nothing.
 */

const { validateSurfaceSpec, resolveGuardDeniedState } = require('./ui-spec-validate.cjs');
const { pluginVersion } = require('./helpers.cjs');

const DEFAULT_IDENTITY = 'primary';
const DEFAULT_THEME = 'light';
const DEFAULT_WIDTH = 1280;

const DEFAULT_SCHEMA_VERSION = 1;

/**
 * Thrown by `renderSurfaceSpec` when `validate` is on and the spec carries a real violation.
 * Carries the verdict's `errors` so the caller prints the codes rather than a stack trace.
 */
class RenderRefused extends Error {
  constructor(errors) {
    const codes = [...new Set(errors.map((e) => e.code))].join(', ');
    super(`refusing to render an invalid Surface Spec (${codes}) — a manifest derived from a spec nobody checked is worse than no manifest`);
    this.name = 'RenderRefused';
    this.errors = errors;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** `"390x844"` -> 390, anything else -> null. Same parse as `ui-spec-validate.cjs`'s widthOf. */
function widthOf(state) {
  const m = state && typeof state.viewport === 'string' ? /^([0-9]+)x[0-9]+$/.exec(state.viewport) : null;
  return m ? Number(m[1]) : null;
}

function statesOf(spec) {
  return (Array.isArray(spec.states) ? spec.states : []).filter(isPlainObject);
}

// ─── The manifest ─────────────────────────────────────────────────────────────

/**
 * One spec state -> one manifest state.
 *
 * ALL FIVE plan-named keys (`state_id`, `seed`, `as`, `fault`, `references`) are present on
 * EVERY state, with `null` / `[]` rather than absent. A consumer that has to tell "absent" from
 * "empty" is a consumer with two code paths for one condition — and the one that forgets the
 * second path is the silent pass.
 *
 * `theme`, `viewport` and `content` come from §4.2's state block and are carried through for
 * 34-06's sheet. No field is INVENTED: if §4.2 does not carry it and `flutter-ui-eval.cjs` does
 * not read it, it is not here. (`expected` — the judge's anchor — is W2's calibration work and
 * is deliberately NOT synthesised from `content` here.)
 */
function toManifestState(state) {
  return {
    state_id: state.id,
    seed: state.seed === undefined ? null : state.seed,
    as: state.as === undefined ? DEFAULT_IDENTITY : state.as,
    fault: state.fault === undefined ? null : state.fault,
    references: state.ref === undefined ? [] : [state.ref],
    theme: state.theme === undefined ? DEFAULT_THEME : state.theme,
    viewport: state.viewport === undefined ? null : state.viewport,
    content: state.content === undefined ? null : state.content
  };
}

/**
 * The ui-eval manifest. `states[]` order is the SPEC's order, exactly — 34-06's sheet rows and
 * W2's capture order both inherit it, so it is a contract and not an implementation detail.
 * No state is ever filtered out.
 */
function buildManifest(spec) {
  return {
    surface: spec.surface,
    engine_version: pluginVersion(),
    schema_version: spec.schema_version === undefined || spec.schema_version === null
      ? DEFAULT_SCHEMA_VERSION
      : spec.schema_version,
    states: statesOf(spec).map(toManifestState)
  };
}

// ─── The navigation graph (§8.2) ──────────────────────────────────────────────
//
// "Can the reader get back from here" answered before a line of UI exists. Three edge kinds,
// kept visibly apart:
//   entry  solid    `A -- "label" --> B`     one per declared `entry` element
//   back   DASHED   `A -. "label" .-> B`     one per `back`, labelled with the `via` LIST
//   guard  solid    `A -- "guard: …" --> S`  one per guard, to the state 34-04's rule resolves
//
// THE NODE-ID RULE (one rule, applied to nodes AND edges): `<kind>_<id>` where every character
// outside [A-Za-z0-9_] becomes `_`, and kind is `route`, `ctrl` or `state`; plus the single
// synthetic node `external`. Mermaid ids cannot contain dots. The KIND PREFIX is not decoration:
// without it a control `rail.project.header` and a route `rail-project-header` sanitise onto one
// id and two unrelated edges merge into one — a graph that silently under-reports the thing it
// exists to report. Every LABEL carries the real, unsanitised id.

const MERMAID_SHAPES = {
  route: (label) => `["${label}"]`,
  ctrl: (label) => `(["${label}"])`,
  state: (label) => `{{"${label}"}}`,
  external: (label) => `[["${label}"]]`
};

function nodeId(kind, id) {
  return `${kind}_${String(id).replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/** Mermaid label text. A `"` would close the quoted label, so it becomes the HTML entity. */
function label(text) {
  return String(text).replace(/"/g, '#quot;');
}

/**
 * Declarations first (deterministic order), then edges (routes in spec order; within a route,
 * entries in order, then the back, then the guards in order). A registry keyed by node id keeps
 * each node declared exactly once no matter how many edges touch it.
 */
function buildNavGraph(spec) {
  const routes = (Array.isArray(spec.routes) ? spec.routes : []).filter(isPlainObject);
  const statesById = new Map(statesOf(spec).map((s) => [s.id, s]));
  const routeIds = new Set(routes.map((r) => r.id));

  const nodes = new Map(); // id -> declaration line
  const edges = [];

  function declare(id, kind, text) {
    if (!nodes.has(id)) nodes.set(id, `  ${id}${MERMAID_SHAPES[kind](label(text))}`);
  }

  // Pass 1a — the synthetic `external` node, declared only when a bare-string entry needs it.
  const hasExternalEntry = routes.some(
    (r) => Array.isArray(r.entry) && r.entry.some((e) => typeof e === 'string')
  );
  if (hasExternalEntry) declare('external', 'external', 'external');

  // Pass 1b — one node per route, labelled with the real id and the route's visible title.
  for (const route of routes) {
    const title = typeof route.title === 'string' && route.title.length > 0 ? route.title : '(no title)';
    declare(nodeId('route', route.id), 'route', `${route.id}<br/>${title}`);
  }

  // Pass 2 — the edges, declaring control and denied-state nodes as they are first reached.
  for (const route of routes) {
    const to = nodeId('route', route.id);

    for (const entry of Array.isArray(route.entry) ? route.entry : []) {
      if (typeof entry === 'string') {
        edges.push(`  external -- "${label(entry)}" --> ${to}`);
      } else if (isPlainObject(entry) && typeof entry.control === 'string') {
        const from = nodeId('ctrl', entry.control);
        declare(from, 'ctrl', entry.control);
        edges.push(`  ${from} -- "${label(entry.control)}" --> ${to}`);
      }
    }

    if (isPlainObject(route.back) && typeof route.back.target === 'string') {
      const target = route.back.target;
      const targetNode = nodeId('route', target);
      // A back whose target is not a declared route is invariant territory, not the graph's —
      // it is still DRAWN, labelled with the real id, rather than dropped. An edge nobody can
      // see is how a reachability answer becomes wrong quietly.
      if (!routeIds.has(target)) declare(targetNode, 'route', `${target}<br/>(undeclared route)`);
      const via = Array.isArray(route.back.via) ? route.back.via.join(', ') : 'back';
      edges.push(`  ${to} -. "${label(via)}" .-> ${targetNode}`);
    }

    for (const guard of Array.isArray(route.guards) ? route.guards : []) {
      // ONE home for the linkage rule: ui-spec-validate.cjs's resolveGuardDeniedState, shared
      // with invariant I8 (GUARD001) and the behaviour-coverage model's `guard` dimension.
      const hit = resolveGuardDeniedState(guard, statesById);
      // An unresolved guard is GUARD001 — render refuses such a spec, so this branch is only
      // reachable under `validate: false`. No edge is GUESSED for it.
      if (!hit) continue;
      const deniedNode = nodeId('state', hit.id);
      const as = typeof hit.state.as === 'string' ? hit.state.as : DEFAULT_IDENTITY;
      declare(deniedNode, 'state', `${hit.id}<br/>as ${as}`);
      edges.push(`  ${to} -- "guard: ${label(guard)} (as ${label(as)})" --> ${deniedNode}`);
    }
  }

  // G4: no trailing whitespace on any line, exactly one trailing newline. Byte-stability
  // against the committed snapshot is worthless if whitespace can drift under it.
  return ['flowchart TD', ...nodes.values(), ...edges].join('\n') + '\n';
}

// ─── The entry point ──────────────────────────────────────────────────────────

/**
 * Derive every downstream artifact from one Surface Spec.
 *
 * @param {object} spec        the parsed front matter (`parseSurfaceSpec(...).frontMatter`)
 * @param {object} [opts]
 * @param {boolean} [opts.validate=true]  refuse an invalid spec (see the header)
 * @param {Array}  [opts.patterns]        the I5 pattern catalogue, or undefined (UNREACHABLE)
 * @param {Array}  [opts.vocabulary]      the §4.3 must_not vocabulary
 * @returns {{manifest: object, navGraphMermaid: string, validation: (object|null)}}
 * @throws {RenderRefused} the spec carries a real violation
 */
function renderSurfaceSpec(spec, opts = {}) {
  const shouldValidate = opts.validate !== false;

  let validation = null;
  if (shouldValidate) {
    validation = validateSurfaceSpec(spec, { patterns: opts.patterns, vocabulary: opts.vocabulary });
    if (!validation.ok) throw new RenderRefused(validation.errors);
  }

  return {
    manifest: buildManifest(spec),
    navGraphMermaid: buildNavGraph(spec),
    validation
  };
}

module.exports = {
  renderSurfaceSpec,
  RenderRefused,
  DEFAULT_IDENTITY,
  DEFAULT_THEME,
  DEFAULT_WIDTH,
  // Internals exported for the adjacent tests and for 34-06, which resolves the same defaults.
  widthOf,
  resolveGuardDeniedState
};
