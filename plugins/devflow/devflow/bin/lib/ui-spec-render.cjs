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
 * Neither `NARROW_MAX_WIDTH` nor the state -> (theme, width) rule is re-declared here: both
 * have one home, in `ui-spec-validate.cjs` (`resolveCaptureDimensions`), because this file
 * decides what is RENDERED and that file decides what is REASONED ABOUT — and when those two
 * derived the rule separately they disagreed about the two states §4.4 makes mandatory.
 *
 * Consumed by: ui-spec-cli.cjs (`ui spec render`), 34-06 (the sheet), W2 (`ui probe`).
 * Depends on: ./ui-spec-validate.cjs, ./helpers.cjs (`pluginVersion()`). No npm dependencies —
 * in particular no mermaid library and no markdown-table library: both outputs are string
 * building, and a dependency for string building is a dependency for nothing.
 */

const {
  validateSurfaceSpec,
  resolveGuardDeniedState,
  resolveCaptureDimensions
} = require('./ui-spec-validate.cjs');
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

// ─── The plain-language control table (§8.3) ──────────────────────────────────
//
// Prose for a HUMAN. §8.3's target sentence is
//   "Clicking the project header toggles its children and selects the project. It never
//    navigates on close."
// so the templates below exist to produce English, not a key/value dump. The committed
// snapshot is read once by a person, who can then object to the wording — which is the only
// review this artifact can actually receive.
//
// Two must_not SCOPES, kept apart:
//   behaviour-level  -> inline, on that behaviour's own line
//   control-level    -> ONCE per control, on its own `*Always:*` line (§4.2 annotates it as
//                       applying to every behaviour, so a per-behaviour copy would both repeat
//                       itself and put the per-`when` line count off by one)
// `manual: true` (§4.3) marks either scope `[human-verify]`: free text stays on the human list
// instead of pretending to be machine-checkable.

/**
 * Third-person singular of a `must_not` term's leading verb: "change route" -> "changes route".
 * The vocabulary (`schemas/must_not_vocabulary.json`) is phrased as bare verb phrases, and only
 * the FIRST word is conjugated — "cover sibling hit rects" -> "covers sibling hit rects".
 */
function conjugate(term) {
  const text = String(term).trim();
  if (text.length === 0) return text;
  const space = text.indexOf(' ');
  const verb = space === -1 ? text : text.slice(0, space);
  const rest = space === -1 ? '' : text.slice(space);
  let inflected;
  if (/(s|x|z|ch|sh)$/i.test(verb)) inflected = `${verb}es`;
  else if (/[^aeiou]y$/i.test(verb)) inflected = `${verb.slice(0, -1)}ies`;
  else inflected = `${verb}s`;
  return inflected + rest;
}

/** `["change route", "lose selection"]` -> `It never changes route; it never loses selection.` */
function negations(mustNot, manual) {
  const list = (Array.isArray(mustNot) ? mustNot : []).filter((t) => typeof t === 'string' && t.trim());
  if (list.length === 0) return '';
  const sentence = list
    .map((t, i) => `${i === 0 ? 'It never' : 'it never'} ${conjugate(t)}`)
    .join('; ');
  return `${manual === true ? '[human-verify] ' : ''}${sentence}.`;
}

/**
 * A `when` map in words. An ABSENT key is a WILDCARD (`ui-spec-validate.cjs`'s coverage model,
 * rule 1) — it says nothing about that dimension, so it contributes no phrase.
 * `control_state` LEADS ("When collapsed, on desktop: …"); with no control_state the first
 * remaining phrase is capitalised ("On narrow: …"); an entirely empty `when` is "In every state".
 */
function conditionPhrase(when) {
  const w = isPlainObject(when) ? when : {};
  const phrases = [];
  if (typeof w.viewport === 'string') phrases.push(`on ${w.viewport}`);
  if (typeof w.theme === 'string') phrases.push(`in ${w.theme} theme`);
  if (typeof w.data_state === 'string') phrases.push(`in the ${w.data_state} state`);
  if (typeof w.guard === 'string') {
    phrases.push(w.guard === 'denied' ? 'when access is denied' : 'when access is allowed');
  }

  if (typeof w.control_state === 'string') {
    return [`When ${w.control_state}`, ...phrases].join(', ');
  }
  if (phrases.length === 0) return 'In every state';
  return phrases[0].charAt(0).toUpperCase() + phrases[0].slice(1) + phrases.slice(1).map((p) => `, ${p}`).join('');
}

function effectSuffix(effect) {
  const list = (Array.isArray(effect) ? effect : []).filter((e) => typeof e === 'string');
  return list.length === 0 ? '' : ` (${list.join(', ')})`;
}

/** `"expands children; selects the project"` -> the same, ending in exactly one full stop. */
function asSentence(does) {
  const text = String(does === undefined || does === null ? '' : does).trim();
  if (text.length === 0) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * A human-readable name for a control id, so the prose never has to print the raw machine id
 * as the SUBJECT of a sentence (34-06 gap 1a — a verifier caught `rail.project.chevron` printed
 * literally in a section titled "Controls, in plain language").
 *
 * THE RULE, deterministic: split on `.`; when the id has THREE OR MORE segments, drop the
 * LEADING (namespace) segment and join what remains with spaces; a 2-segment id keeps both.
 *   `rail.project.header`  -> drop `rail`  -> "project header"
 *   `rail.project.chevron` -> drop `rail`  -> "project chevron"
 *   `foo.bar` (2 segments) -> keep both    -> "foo bar"
 * The id itself still appears — on the control's own heading (`controlBlockMd`, below),
 * wrapped in emphasis so 34-06's HTML converter renders it visually secondary to this name.
 */
function humanName(id) {
  const segments = String(id).split('.');
  const kept = segments.length >= 3 ? segments.slice(1) : segments;
  return kept.join(' ');
}

function controlBlockMd(control) {
  const kind = typeof control.kind === 'string' ? control.kind : '(no kind)';
  const name = humanName(control.id);
  // The id survives on the heading ONLY, wrapped in emphasis (`*...*`) — visible, but secondary
  // to the human name. It must never reach a bullet or `*Always:*` line below (Case T5).
  const lines = [`### ${name} — *${control.id}* (${kind})`, ''];

  const visibleIn = (Array.isArray(control.visible_in) ? control.visible_in : []).join(', ');
  if (visibleIn) lines.push(`*Visible in:* ${visibleIn}`, '');

  const behaviors = Array.isArray(control.behaviors) ? control.behaviors.filter(isPlainObject) : [];
  if (behaviors.length > 0) {
    // ONE LINE PER `when` CLAUSE. Merging two behaviours into one sentence is the render the
    // plan's named case (T2) exists to forbid: it reads fine and hides a rule.
    for (const b of behaviors) {
      const never = negations(b.must_not, b.manual);
      lines.push(
        `- ${conditionPhrase(b.when)}: ${asSentence(b.does)}${never ? ` ${never}` : ''}${effectSuffix(b.effect)}`
      );
    }
  } else {
    // §8.3's shape: "Clicking the project header expands its children …" — `Clicking` when the
    // control is pointer-activated, `Activating` otherwise (keyboard-only / non-pointer controls).
    const verb = control.activation && control.activation.pointer === true ? 'Clicking' : 'Activating';
    lines.push(`- ${verb} the ${name} ${asSentence(control.does)}${effectSuffix(control.effect)}`);
  }

  // ONCE per control, never once per behaviour.
  const always = negations(control.must_not, control.manual);
  if (always) lines.push('', `*Always:* ${always}`);

  lines.push('');
  return lines;
}

function buildControlTable(spec) {
  const lines = [`## Controls — ${spec.surface}`, ''];

  if (typeof spec.design_read === 'string') lines.push(`*Design read:* ${spec.design_read}`);
  if (typeof spec.mode === 'string') lines.push(`*Mode:* ${spec.mode}`);
  lines.push('');

  for (const control of (Array.isArray(spec.controls) ? spec.controls : []).filter(isPlainObject)) {
    lines.push(...controlBlockMd(control));
  }

  // Same whitespace contract as the graph: no trailing blanks, exactly one closing newline.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

// ─── The capture list ─────────────────────────────────────────────────────────
//
// state × theme × width, one triple per declared state today. The (theme, width) of a state is
// NOT decided here: it comes from `resolveCaptureDimensions` in `ui-spec-validate.cjs`, the
// same function that feeds the behaviour-coverage model's `theme` and `viewport` dimensions.
// A declared `theme:`/`viewport:` wins; failing that a state ID of `dark` or `narrow` supplies
// the dimension it is named for; failing both, the desktop light default. 34-06's sheet GRID
// COLUMNS are exactly these two dimensions, and W2's `ui probe` iterates this list in order.
//
// The ORDER is the spec's `states[]` order, then theme, then width — a contract, not an
// implementation detail, because the sheet's rows and the probe's capture order both inherit it.
// (The secondary keys are stable rather than decorative: a state that later fans out to more
// than one theme or width lands somewhere defined.)
//
// NEVER DROP A STATE. One with no `ref`, no `fault` and no `as` is still a capture; 34-06
// renders it as a MISSING cell. Filtering it out is how a gate stops seeing what it was built
// to see.

/** Filename-safe: anything outside [A-Za-z0-9._-] becomes `_`. 34-06 looks files up by this. */
function filenameSafe(part) {
  return String(part).replace(/[^A-Za-z0-9._-]/g, '_');
}

function captureIdOf(surface, stateId, theme, width) {
  return [surface, stateId, theme, width].map(filenameSafe).join('--');
}

function buildCaptureList(spec) {
  const surface = spec.surface;
  return statesOf(spec).map((state) => {
    // `resolveCaptureDimensions` — 34-03's function, not a second copy of its rule. That file's
    // behaviour-coverage model reasons about (theme, viewport) and THIS list decides what is
    // actually rendered; when the two derived it separately they disagreed, and the disagreement
    // was silent: the mandatory `narrow` and `dark` states, which §4.4 lets an author declare by
    // id alone, came back at the desktop width in the light theme while the coverage model said
    // narrow and dark were covered. Case C1c fails if they ever drift apart again.
    const { theme, width } = resolveCaptureDimensions(state);
    return {
      state_id: state.id,
      theme,
      width,
      capture_id: captureIdOf(surface, state.id, theme, width)
    };
  });
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
 * @returns {{manifest: object, navGraphMermaid: string, controlTableMd: string,
 *            captureList: Array<{state_id: string, theme: string, width: number,
 *            capture_id: string}>, validation: (object|null)}}
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
    controlTableMd: buildControlTable(spec),
    captureList: buildCaptureList(spec),
    validation
  };
}

module.exports = {
  renderSurfaceSpec,
  RenderRefused,
  DEFAULT_IDENTITY,
  DEFAULT_THEME,
  DEFAULT_WIDTH,
  // Internals exported for the adjacent tests and for 34-06, which resolves the same defaults
  // and looks renders up by capture_id.
  captureIdOf,
  widthOf,
  resolveGuardDeniedState
};
