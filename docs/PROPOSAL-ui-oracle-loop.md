# PROPOSAL — The UI Oracle Loop

**Date:** 2026-09-17
**Status:** design, revised after completeness review (§18) — awaiting review
**Builds on:** DevFlow 2.7 design reference set (`design-craft`, `design-preflight`, `design-tells`,
`design-redesign`, `design-stack-flutter`) and the `eden-flutter:frontend-design` skill — see §5
**Scope:** DevFlow (`devflow-claude`), `eden-ui-flutter`, first consumer `eden-biz` (then `aodex`)
**Trigger:** porting Trades React functionality into Eden Biz (Flutter) without repeating the UI
loop counts of the last four months.

---

## 1. Problem

UI work costs more cycles than anything else we build, and the cycles are not spent where the
process looks. Since 2026-06-01 `flutter/lib` on aodex shows 142 `feat` / 130 `fix` commits
(backend: 199 / 163 with 205 `test`); eden-biz shows 337 / 155. One nav-disclosure widget
(aodex objective 20, TRD 20-02, executed in `eden-ui-flutter`) took ten test/fix pairs over four
days, remains an unmerged branch tip, and aodex pins it by SHA (aodex#585).

The recorded failures (memory notes and open issues) sort into seven classes:

| # | Class | Evidence |
|---|---|---|
| 1 | The RED→GREEN loop runs at a layer that cannot fail for the bug | 8 green widget tests → 215 px overflow; `tester.tap` cannot see a semantics double-fire; goldens render `EdenButton` labels as Ahem blocks (aodex#569) |
| 2 | The only oracle is a human on a live screen, consulted after the objective | nav: indent → containment rule → "closing must not navigate" discovered one at a time |
| 3 | Flutter web is a different runtime than the test runtime | `ensureSemantics()` DOM nodes take the click; `Semantics` without `container:true`; sidebar contributes zero semantics nodes (aodex#529); Playwright `fill()` no-ops; DWDS blank page; a session against a two-week-old bundle served from another checkout |
| 4 | The shared-widget seam has no inner loop | git-SHA pin, PR → merge → bump → re-verify; eden-biz 82 commits behind (eden-biz#753); pin comment and ref disagree (aodex#585); dev catalog has 7 stories for 509 files and CI never renders it |
| 5 | The visual gate exists but is not a loop | ui-eval is verifier Step 8c, post-hoc; 14 orphaned manifests (eden-biz#705); stale engine silently passed unjudged states; default gate is advisory; `testing-strategy.md` says "visual: deferred" and has no React column |
| 6 | Design intent is not machine-readable | obj 161 shipped a plain Material form because the TRD never named the mockup; judge anchored on "expected appearance" |
| 7 | Navigation and state-lifecycle defects surface only in use | four screens unreachable (aodex#517); sub-pages with no header and no back (aodex#450); deep link renders the wrong tab (eden-biz#189); sticky `SelectedProject` (aodex#583); stale pane after move (aodex#586); outage rendered as an empty state (aodex#602) |

Two further observations shape the design:

- A large share of the nav commits were **design iterations**, not defects. No check would have
  failed the indent version; the reviewer wanted something else. Tooling cannot remove design
  iteration; it can move it to where one iteration costs seconds.
- The **Trades React app is a working reference** for every feature being ported. It also carries
  UX debt (`AOCyber-Trades/trades/ux-review/`). It is a completeness oracle, not a look oracle.

## 2. Goals and non-goals

**Goals**

1. Design intent, interaction rules, navigation and state lifecycle are written **once**, in a form
   a human reviews and a machine checks — the *Surface Spec* (§4).
2. The executor consults a **machine oracle after every task** (story render, surface probe,
   deterministic checks) before any human or vision model is asked.
3. Human judgment is spent **once, at the front** (look-lock on a review sheet), not after every
   build.
4. Navigation defects — unreachable, no return, misbehaving control, stale scope — are found by a
   **crawler and an explorer**, reported as issues, and fed back into the spec.
5. Every verdict is **evidence-backed and version-stamped**; a check that did not run reports
   `MISSING`, never `pass`.
6. The shared-widget seam supports **hot iteration** during an objective and **tagged, gated**
   pins after it.

**Non-goals**

- Replacing DevFlow's TDD contract; this adds RENDER/CONFORM after GREEN, it does not change RED→GREEN.
- Pixel parity with Trades React.
- A mobile-native probe adapter in the first three waves (schema is shared; the Maestro adapter is wave 4).
- Any tooling for the React Trades app beyond reading it as the donor: **Trades React is not kept long
  term** — it retires when every donor route is ported (§19). No React test column, no React probe adapter.
- Removing the human from design taste.

## 3. Failure classes → mechanisms

| Class | Mechanism (section) |
|---|---|
| 1 | story harness with geometry/semantics assertions (§6.2); `expectUiSane` for consumer screens (§6.3); surface probe (§7) |
| 2 | Surface Spec interaction contract (§4.3); look-lock (§8.3) |
| 3 | probe bridge in release builds, production semantics mode, bundle-hash check (§7.1–7.3) |
| 4 | path override during objective, tagged pins, bump PRs, reverse-dependency CI (§11); slot-based shell API (§6.5) |
| 5 | RENDER→CONFORM in the executor loop (§9.2); verifier replays (§9.4); one manifest (§12.2) |
| 6 | pattern library + DESIGN.md (§5); judge anchored on locked renders only (§9.3) |
| 7 | `routes`/`scope_rules` in the spec (§4.2, §4.6); directed crawl + explorer (§10) |

## 4. The Surface Spec

### 4.1 Definition and location

A Surface Spec describes how one surface — a feature area with its own routes and controls — is
supposed to function. One file per surface, in the app repository next to the code it constrains:

```
flutter/ui_spec/<surface>.md          # the spec (YAML front matter + prose)
flutter/ui_spec/refs/<surface>/       # mockup, locked renders, donor captures
flutter/ui_spec/schema/surface-spec.schema.json   # copied from devflow at bootstrap; version-stamped
```

Pattern specs (§5) live in `eden-ui-flutter/design/patterns/`. A surface implemented by a library
widget but composed by the consumer is specified in the **consumer** (aodex owns `projects-rail`;
the library owns `navigation/disclosure-group`).

**Granularity.** One spec per navigation destination group — in practice one per
`lib/features/<x>/` folder. A screen belongs to exactly one spec; a shared widget (the rail) is
specified by the consumer that composes it, and the library's pattern spec supplies its defaults.

**Re-lock rule.** Any change to `routes`, `controls` or `states` clears `acceptance.locked_sheet`.
Phase B refuses to run a judge against a surface whose lock is cleared; the sheet must be
re-approved (usually a minute — only the changed states re-render).

**One-file rule.** The front matter is the machine truth. The ui-eval manifest, the capture arm's
state list, the crawl's expected graph and the review sheet are all *derived* from it by tools and
never hand-edited. The existing `<name>_states.yaml` + `manifests/<name>.manifest.json` pair is
retired (eden-biz#705 is a consequence of that pair).

### 4.2 Schema (v1)

Required top-level keys: `surface`, `routes`, `controls`, `states`, `flows`. Optional:
`patterns`, `references`, `scope_rules`, `acceptance`. All ids are `^[a-z0-9][a-z0-9.\-]*$`.

```yaml
surface: projects-rail                # unique within the repo
patterns: [navigation/disclosure-group, navigation/section-caption]   # pattern-library ids
references:
  mockup: refs/projects-rail/mockup.png
  donor:  refs/projects-rail/donor/    # Trades React captures, completeness only
  locked: refs/projects-rail/locked/   # look-locked story renders, one per state × theme × width
design_read: "utility rail; expression low, motion minimal, density compact"   # design-craft §1–2
mode: redesign                          # greenfield | redesign — design-redesign.md §1

routes:
  - id: project.conversations
    path: /projects/:id/conversations
    entry: [{control: rail.project.header}, deeplink]     # ≥1 required
    back: {target: conversations.all, via: [app-back, browser-back]}   # required unless root
    guards: [member-of-workspace]                         # each guard names its denied state
    reachable_from_nav: true                              # false requires `justification:`
    title: "{project.name}"                               # every route has a visible title

controls:
  - id: rail.project.header           # MUST equal the widget's semantics identifier
    kind: disclosure-header           # button | toggle | link | menu | disclosure-header | input | ...
    visible_in: [populated, long-content, narrow]
    behaviors:                        # state-conditional; `when` clauses are exclusive and cover visible_in
      - when: {control_state: collapsed, viewport: desktop}
        does: "expands children; selects the project and scopes the middle pane"
        effect: [toggle, select]      # machine-classifiable effect classes (§7.5)
      - when: {control_state: expanded, viewport: desktop}
        does: "collapses children; selection unchanged"
        effect: [toggle]
        must_not: ["change route", "lose selection"]
      - when: {viewport: narrow}
        does: "opens the project in the drawer"
        effect: [navigation]
    must_not: ["fire twice per activation", "cover sibling hit rects"]   # applies to every behaviour
    activation: [pointer, keyboard: [Enter, Space]]
    disabled_when: null               # or {condition: "...", reason_shown: "..."}
    a11y: {role: button, announces: [expanded, collapsed]}
    hit_rect: {disjoint_from: [rail.project.chevron]}
    destructive: false                # true requires `confirm:` naming the dialog control

states:
  - id: populated
    seed: projects-3-conversations-12  # seed profile the e2e entrypoint honours (§7.4)
    as: workspace-member               # identity from the e2e identity set (§7.4); default: primary user
    ref: locked/populated.png
    content: {must_show: ["{project.name}"], must_not_show: []}
  - id: long-content
    seed: projects-long-names
    content: {rule: "names ellipsize; rail width unchanged"}
  - id: empty
    seed: projects-0
    content: {must_show: ["Create a project"], must_not_show: ["unavailable", "error"]}
  - id: error
    seed: projects-3
    fault: projects-list-500
    content: {must_show: ["Try again"], must_not_show: ["Create a project"]}
  - id: outage
    seed: projects-3
    fault: knowledge-service-503
    content: {must_show: ["unavailable"], must_not_show: ["Create a project"]}
  - id: guard-denied
    seed: projects-3
    as: non-member
    content: {must_show: ["You don't have access"], must_not_show: ["{project.name}"]}
  - id: narrow      {viewport: 390x844, seed: projects-3-conversations-12}
  - id: dark        {theme: dark, seed: projects-3-conversations-12}

flows:
  - id: open-project-conversation
    steps:
      - {click: rail.project.header,   expect: {route: project.conversations, control_state: {rail.project.header: expanded}}}
      - {click: "rail.conversation[0]", expect: {route: conversation.detail}}
      - {back: app-back,                expect: {route: project.conversations, control_state: {rail.project.header: expanded}}}

scope_rules:
  - {on: workspace-switch, reset: [selected-project, expanded-groups]}
  - {on: project-move,     invalidate: [project-pane, project-count-badge]}

acceptance:
  locked_sheet: sha256:...            # hash of the approved review sheet (§8.3)
  locked_by: mark@aocyber.ai
  locked_at: 2026-09-18
```

The prose body carries **Intent** (why the surface exists, in the words of the objective) and
**Walkthrough** (a paragraph per flow). Prose never restates front-matter facts.

### 4.3 The interaction contract

`controls[]` is the interaction contract. Rules the schema and the static invariants (§4.5)
enforce:

- either one `does` + `effect` pair, or a `behaviors[]` list of `{when, does, effect, must_not}`
  whose `when` clauses (over `control_state`, `viewport`, `theme`, `data_state`, `guard`) are
  mutually exclusive and together cover every `visible_in` state — a UI can support several
  behaviours for one control, but never two for the same observed state; the probe resolves the
  active behaviour from the pre-activation state it observes;
- `must_not` items are drawn from a fixed vocabulary so each can be asserted as a negation
  (`navigate on close`, `fire twice per activation`, `cover sibling hit rects`, `change route`,
  `lose selection`, `steal focus`, …); free text is allowed only with a `manual: true` flag, which
  keeps the item on the human-verify list;
- a control that can be disabled names the condition **and** the reason shown to the user
  (no honestly-non-functional control without a surfaced reason);
- a `destructive` control names its confirm dialog control.

### 4.4 States and content contract

Every surface declares at minimum `populated`, `empty`, `error`, `outage`, `long-content`,
`narrow`, and `dark`. `loading` is declared when the surface owns an async fetch. Each state
has a `seed` (§7.4) and a `content` block: `must_show` / `must_not_show` strings, or a `rule`.
`outage` must differ from `empty` in `must_show`; the schema rejects a spec where they are equal.

### 4.5 Static invariants (run on the spec alone, no app needed)

`df-tools ui spec validate <file>`:

1. schema-valid; `schema_version` matches the engine's supported range;
2. every route has ≥1 `entry` and a `back` (or is the declared root); every `entry.control`
   exists in `controls` or in another spec of the same repo (cross-surface entries are resolved);
3. every control has one `does` or an exclusive, covering `behaviors[]`; effects from the vocabulary; `visible_in` ⊆ states;
4. every state has a seed; `outage.must_show ∩ empty.must_show = ∅`;
5. every referenced pattern exists in the pinned `eden-ui-flutter` release; a control of a
   pattern kind inherits that pattern's `must_not` defaults (a surface may not silently drop them);
6. no two controls declare overlapping hit rects unless one lists the other in `disjoint_from`
   (which the probe then asserts);
7. every `flow` step references existing controls and routes and ends in a `back` or a declared
   terminal route;
8. `guards` name the denied state each renders.

A spec that fails validation is not reviewable and cannot seed a TRD.

### 4.6 Scope rules

`scope_rules` state what resets or invalidates on a scope event (`workspace-switch`,
`company-switch`, `project-switch`, `project-move`, `logout`). The planner derives provider
invalidation tests from them; the crawl fires each event and checks the list (§10.1).

## 5. Design references — building on the DevFlow 2.7 design set

DevFlow 2.7.0 shipped a design reference set and the `eden-flutter:frontend-design` skill
(build / review / visual modes). This proposal **extends** that set; it does not add a parallel
one. Where §5 of the first draft named `DESIGN.md`, `UI-CLAUDE.md` and a pattern library, the
homes are now:

| First draft | Actual home | What changes |
|---|---|---|
| `DESIGN.md` tokens | `design-stack-flutter.md` + `eden-ui-flutter/DESIGN.md` **generated** from `lib/src/tokens/` and CI-diffed | the token block becomes generated; the prose rules stay in `design-stack-flutter.md` |
| `UI-CLAUDE.md` composition rules | `design-stack-flutter.md` (new §: "Composition and semantics") + `plugins/eden-ui-flutter/references/eden-ui-flutter-conventions.md` | adds: one tap action per control; `Semantics(container:true)` for controls smaller than their parent; consumer imposes `ConstrainedBox` on unbounded slots; story-first workflow; probe commands |
| pattern library | `eden-ui-flutter/design/patterns/<id>.md`, indexed from `design-stack-flutter.md` | new; rules in the `must_not` vocabulary so Surface Specs inherit them |
| design read / dials | `design_read` and `mode` fields on the Surface Spec | design-craft §1–2 recorded once per surface, not per SUMMARY |
| `design-preflight.md` | unchanged as the *human-readable* gate; its **[R]** items are exactly the checks the probe automates (§7.5) and its **[C]** items become deterministic counts over the `ProbeResult` | preflight stops being a checklist an agent ticks and becomes evidence the sheet shows |
| `design-tells.md` | consumed by the judge's **critique** pass (§9.3), advisory | unchanged |
| `design-redesign.md` | `mode: redesign` on the spec triggers its audit before look-lock | unchanged |
| `frontend-design` **build** mode | gains a step 0: "load or draft the Surface Spec; refuse to compose without one" | Phase A's `/devflow:ui-design` is this step, not a new skill |
| `frontend-design` **review** mode | unchanged | — |
| `frontend-design` **visual** mode (VM-service inspector: `snapshot`, `screenshot`, `get_logs`) | becomes the **mobile/desktop adapter** producing a `ProbeResult`; the web probe (§7) is its release-build complement | one schema, two transports |

Initial pattern set (≈10): `navigation/disclosure-group`, `navigation/section-caption`,
`navigation/shell` (desktop rail ↔ mobile bar), `list-detail`, `state/empty-error-outage-loading`,
`form/validation`, `bulk-action-bar`, `dialog/confirm-destructive`, `density/breakpoints`,
`studio/three-pane`. A pattern spec has: intent; implementing widgets; states; interaction rules
(e.g. "closing never navigates"; "the header owns a hidden child's selection"; "captions and
dividers never appear in the mobile bottom bar"); per-breakpoint behaviour; content rules; a11y
rules; do/don't with story ids. Patterns are themselves look-locked (their stories).

Lint (`custom_lint`) enforces the mechanical rules: no raw `Color(`; no `TextStyle` without a
family outside `tokens/`; no magic spacing outside `tokens/`.

**Installed-plugin lag.** The machine running this work has DevFlow 2.6.0 installed while
`origin/main` is 2.7.1; the design set above is not on the executor's path today. Wave 0 (§13)
includes the upgrade and the `df-tools health` check that reports the lag.

## 6. Catalog as contract (`eden-ui-flutter`)

### 6.1 Stories

Extend the existing `EdenStory` registry (typed knobs, `component/name` ids) rather than adopt a
new catalog. Each widget under `lib/src/widgets/` gets a co-located `<widget>.stories.dart`, one
story per meaningful state. `tool/gen_stories.dart` generates `dev_app/registry/register_all.dart`;
CI fails on drift. Coverage ratchet: every exported widget has ≥1 story; the count may not fall.
Wave 1 scope: shell widgets (layout, nav, buttons, inputs, data grid) plus anything an objective touches.

### 6.2 Story harness — three assertions per story

Every story is a `flutter test` case asserting:

1. **Golden** — light and dark. Platform policy: goldens are generated **in the CI container**
   (Linux) and compared with Alchemist-style platform tagging locally, so macOS rasterisation never
   churns them. Prerequisite: the `EdenButton` family fix (aodex#569) so labels are legible.
2. **A11y guidelines** — `meetsGuideline` for tap target, text contrast, labelled tap targets.
3. **Semantics geometry** — for every node carrying an `identifier`: rect inside the story
   viewport; sibling control rects disjoint; exactly one tap action declared per control (the
   `excludeSemantics` double-fire guard); `tester.takeException()` is null (overflow).

### 6.3 `expectUiSane(tester)` for consumer screens

The three assertions ship as a helper in a small `eden_ui_test` package (also re-exported from
`eden_biz_test_support`) so screen-level widget tests in consumers call it after the final pump.
Without this, 600+ consumer screen files gain nothing from §6.2.

### 6.4 `df-tools ui catalog`

Reads the generated registry plus a `tool/catalog_dump.dart` JSON (constructor APIs via the Dart
analyzer — Node never parses Dart):

- `list` — components, stories, states;
- `show <component>` — API, usage rules from UI-CLAUDE.md, pattern membership, story ids;
- `test <story-id>` — runs §6.2 for that story;
- `render <story-id> [--theme dark] [--width N]` — writes a PNG to a scratch path.

Planner and executor call `show` before writing consumer code that uses a library widget.

### 6.5 Shell API reshaping

`EdenNavItem` grows a flag per consumer need (`expandable`, `caption`, `isDivider`, `badge`), and
each flag is a library change plus a pin bump. Wave 1 reshapes the shell toward **composition**:
item renderers and section builders injected by the consumer, flags kept only for behaviour that
must be uniform across apps. The nav dogfood (§14) exercises the reshaped API.

## 7. Runtime probe on the real surface

### 7.1 Bridge

A JS-interop bridge in `eden-ui-flutter/lib/src/probe/`, compiled in only under
`const bool.fromEnvironment('EDEN_PROBE')` (tree-shaken otherwise; the release workflow asserts
the shipped bundle contains no `__edenProbe`). Exposes on `window.__edenProbe`:

- `find({key|text|type|identifier})` → real rects from the render tree;
- `tree()` → widget/semantics summary with rects and declared actions;
- `settled()` → true when no frames are scheduled and no HTTP requests are in flight;
- `state()` → route, theme, viewport, semantics mode.

Under `EDEN_PROBE` the app disables animations and uses bundled fonts (no runtime fetch).
The bridge is one line in each consumer's `main_e2e.dart`. It deliberately does not use the VM
service: our working browser recipe is release build + static server (DWDS wedges), release builds
have no VM service, and the DTD route for web is broken upstream (dart-lang/ai#356).

### 7.2 Driver

`df-tools ui probe <url> --spec <surface> --state <id> [--flow <id>]` — the zero-dependency Node
CDP client from the aodex browser-E2E recipe, packaged. Clicks are `Input.dispatchMouseEvent` at
rect centres; text is real key events (never `fill()`); keyboard traversal is real `Tab`.
Runs twice per state: in the app's **production semantics mode** (aodex: on; eden-biz: off) and
with semantics on for a11y checks.

### 7.3 Serve step and bundle-hash check

The probe owns serving: `flutter build web --release --dart-define=EDEN_PROBE=true` → static
server from **this worktree's** `build/web` on a port derived from the worktree path hash,
`config.js` copied in. Every `ProbeResult` records the served `main.dart.js` hash and the
worktree build's hash; a mismatch is a hard fail with the remedy printed. Builds are cached by
tree hash.

### 7.4 State seeding contract — and the infrastructure it needs

Each spec state names `seed` (a data profile), optionally `as` (an identity) and `fault` (a
dependency failure). The e2e stack must honour all three:

- **seed** — eden-biz has `SEED_PROFILE` in `web_e2e/scripts/db-reset.sh`; aodex has fixture
  injection. Both need a registry of named profiles the spec can reference and `ui doctor` can list.
- **as** — an identity set per app (`primary`, `workspace-member`, `non-member`, `platform-admin`,
  `support-agent`) provisioned by the seed and selectable through the existing token-injection
  recipe. Guards are untestable without it.
- **fault** — **neither app has any fault-injection layer today** (grep across eden-biz and
  aodex: zero hits). The `outage` state therefore needs an **e2e dependency stub** in each
  consumer: the e2e entrypoint routes named upstreams (knowledge service, billing, AOID) through a
  stub that returns 503/timeout when `EDEN_E2E_FAULT=<service>-503` is set. This is a wave-1
  deliverable per consumer (§14), sized separately, and a prerequisite for `outage` conformance.

A state whose seed, identity or fault the stack does not recognise is `MISSING`, never `pass`.

### 7.5 `ProbeResult` and deterministic checks

`ProbeResult` (JSON-schema'd, surface-agnostic with `surface: web-flutter | mobile`):
screenshot path; semantics tree with rects and `elementFromPoint` hit results; widget rects;
route/URL; console errors; network log; engine and schema versions; bundle hashes.

Checks are pure functions over `ProbeResult` + spec, each named by the rule it enforces:

| Check | Fails when |
|---|---|
| `present` | a spec control visible in this state is absent from the semantics tree (aodex#529 class) |
| `hit-target` | `elementFromPoint` at a control's centre is not that control's node |
| `disjoint` | rects of `disjoint_from` pairs overlap |
| `target-size` | control rect < 24 px on either axis |
| `overflow` | bridge reports a RenderFlex exception or a rect exits the viewport |
| `contrast` | text node contrast below guideline |
| `content` | `must_show` absent or `must_not_show` present |
| `effect` | activating a control yields an effect class ≠ the `effect` of the behaviour whose `when` matches the observed pre-activation state (classified from the before/after diff: `navigation` = route changed; `toggle` = announced state flipped; `select` = selection node changed; `dialog` = new modal node; `submit` = request + result node; `inert` = zero delta) |
| `no-op` | effect is `inert` and the control is not `disabled_when` with `reason_shown` rendered |
| `must-not` | any `must_not` negation fails (e.g. route changed on close) |
| `once` | one activation produced two effects |
| `route-entry` | a route cannot be reached via a declared entry |
| `route-back` | app-back or browser-back does not land on `back.target` |
| `title` | the route renders no title |
| `focus-order` | `Tab` traversal order differs from `controls` order for the state |
| `keyboard-complete` | a flow cannot be completed with keyboard activations only |
| `scope-reset` | after a `scope_rules.on` event, a listed item is not reset/invalidated |
| `console` | any console error |
| `bundle` | served hash ≠ worktree build hash |

A check that could not run (no probe, unknown seed, chrome missing) reports `MISSING` with the
`ui doctor` reason. No check ever narrows itself; a flaky check is fixed or filed.

## 8. Phase A — design and mockup

**Exit criterion: a validated, look-locked Surface Spec before any TRD exists.**

### 8.1 `/devflow:ui-design <surface>` — step 0 of `frontend-design` build mode

Implemented as the first step of the existing `eden-flutter:frontend-design` build mode (§5), also
invocable on its own. Drafts the spec from: the pattern library (default control behaviours, breakpoint, a11y and
content rules), the mockup or donor, the router table (routes that already exist), and the
objective's intent. For ports, it first writes the **pattern mapping** page
(`refs/<surface>/pattern-mapping.md`: donor screen → Eden pattern → deltas, with
`trades/ux-review/` findings applied). Donor captures (Playwright, one per state) are committed
under `refs/<surface>/donor/` as completeness references.

### 8.2 Validation

`ui spec validate` (§4.5) must pass. The navigation graph is rendered (mermaid) from `routes`;
"can the user get back from here" is answered by arrows before code exists.

### 8.3 Look-lock on the review sheet

`df-tools ui sheet <surface>` produces a static HTML **review sheet** (publishable as an
Artifact): every state × theme × width story render beside the mockup/donor; the navigation graph;
the control table in plain language ("Clicking the project header toggles its children and selects
the project. It never navigates on close."); the content contract per state. **Approval channel:** the sheet is published as a Claude Artifact (or served locally when
offline); comments on it are the revision channel; approval is a DevFlow
`checkpoint:human-verify` whose answer records the sheet hash into `acceptance.locked_sheet` and
copies the renders to `refs/<surface>/locked/` — the judge's only anchors and the stories'
goldens. The executor re-renders (seconds — `flutter test`) after each round of comments.

Design iteration happens here, at story-render cost. When there is no mockup and no donor,
look-lock is mandatory; the locked render *is* the design.

## 9. Phase B — implement and verify against the design

**Exit criterion: every spec item has a machine verdict; the human-verify list is only `MISSING`
and judge `review` rows.**

### 9.1 Planner derivation

For a `type: ui` objective the planner derives from the spec: `controls` → story/widget tests
(with §6.2/§6.3 assertions); `flows` → integration tests; `states` → the ui-eval manifest
(generated, not authored); `scope_rules` → provider invalidation tests; `must_not` → negation
assertions. The TRD's test list is the spec. A TRD that adds behaviour not in the spec is a
planning failure: update the spec (Phase A, cheaply) first.

### 9.2 Executor loop per task: RED → GREEN → RENDER → CONFORM

- RED/GREEN unchanged (Iron Law, exit-code evidence, one test at a time).
- RENDER — fast layer: `ui catalog render` for touched stories (seconds). Surface layer: for
  tasks that change a route or a control on one, `ui probe` for each spec state on that route
  (build once per task after GREEN; cached by tree hash).
- CONFORM — §7.5 checks. On failure the executor fixes under deviation Rule 1 with the named rule
  and re-renders; no VLM, no human. Only a clean deterministic pass triggers the judge (§9.3).
- Evidence per task in SUMMARY: a table of state × {golden, probe, checks, judge} with paths.
  A state without a probe is `MISSING`.

Budgets: story render < 30 s; per-task surface probe < 5 min; judge < 1 min. Every arm returns a
≤300-token verdict with paths; the agent reads an image only for a failing check.

### 9.3 Judge

The existing `flutter-ui-eval.cjs` engine gains a required `references[]` per state (the locked
render; for ports also the donor capture flagged `completeness-only`) and rejects anchor-less
states. The question is "list differences from the reference and classify them", never "does this
look fine". The judge is **calibrated**: a labelled regression set (extending eden-biz
`ui_eval/regression`) with known-broken and known-good captures and `expect:fail` cases; any
change to prompt or model reports precision/recall against it, and no `binding` verdict is issued
by an uncalibrated judge.

Design review splits into **conformance** (uses the pattern's widgets and states — checked,
gates) and **critique** (taste — advisory, never gates).

### 9.4 Verifier

Step 8c becomes a **replay**: it re-runs the manifest and must reproduce the executor's verdicts;
a state that passed per-task and fails at verify is a flake finding, filed. Evidence from a
mismatched `engine_version` is rejected. A `binding` clean pass drops the surface from
human-verify; advisory never does. The review sheet regenerates with a spec-vs-actual column
(✓ / ✗ with screenshot and rule / `MISSING`) and is the objective's UI dashboard.

## 10. Phase C — finding UX issues the spec did not anticipate

**Exit criterion: every unreachable route, dead end, inert or misbehaving control on the app is
either an issue with a repro or a line in a spec.**

### 10.1 Directed crawl — `df-tools ui crawl` (deterministic, every UI PR)

Builds the app-level navigation graph as the union of all Surface Specs, extracts the **router
table** from code (`go_router` config) and the nav model from the running app, then reports:

| Finding | Rule |
|---|---|
| `unspecified-route` | route in the router table with no spec entry (aodex#517 class) |
| `unreachable` | spec route the crawl cannot reach via its declared entry |
| `dead-end` | neither app-back nor browser-back lands on `back.target`; or a mobile route with no header/back (aodex#450) |
| `deeplink-mismatch` | deep link renders a different route than `path` (eden-biz#189) |
| `unspecified-control` | control in the semantics tree absent from every spec |
| `misbehaving` | spec control whose effect class ≠ `effect` |
| `inert` | zero-delta control without a rendered reason |
| `stale-scope` | after each `scope_rules.on` event a listed item is not reset (aodex#583, #586, eden-biz#128) |
| `a11y-unreachable` | control missing from the semantics tree or overlapped (aodex#529) |

### 10.2 Undirected exploration — `ui-explorer` agent (release gate + nightly, budgeted)

Drives the app through the probe with no script: every visible control, back from every route,
deep links, resize to narrow, workspace/company switch, offline. Judges against a UX heuristic
checklist: no dead ends; no inert controls; back always returns; error ≠ empty ≠ outage; state
resets on scope change; every screen has a title; one activation, one effect; no console errors.
Returns findings shaped as issues (route, control, rule, repro steps, screenshot).

**Safety:** the explorer refuses any base URL that is not a local or e2e stack; it activates a
`destructive: true` control only on seeded data and only through its declared confirm dialog; it
never submits real credentials or payment forms (Stripe test mode only, through the e2e stub).

### 10.3 Triage and cadence

Findings are fingerprinted by `(route, control, rule)` and deduped against open issues
(aodex#328: clusters filed 4–5×), labelled `ux-explorer`, and triaged: **spec violation → issue**
via gh-sync; **spec gap → spec line** (Phase A, cheaply). Never auto-fixed, with one exception:
during Phase B the executor fixes directed-crawl violations *inside its objective's surfaces*
under the normal deviation rules. The crawl runs on every UI PR; the explorer at the release gate
(closing aodex#359) and nightly. **Release-blocking (decided 2026-09-17):** any `unreachable` or `dead-end` finding on any route,
and any `inert` control that is a route `entry`. Everything else is filed and prioritised. `df-tools ui metrics` reports counts over time.

## 11. The cross-repo seam

- A UI objective may span the consumer and `eden-ui-flutter`. At objective start the executor
  writes `dependency_overrides: eden_ui_flutter: {path: <library worktree>}` into the consumer's
  gitignored `pubspec_overrides.yaml`; iteration is a rebuild, not a PR round-trip.
- `eden-ui-flutter` gets **tagged releases**, a CHANGELOG, and an additive-only minor contract.
  Consumers pin tags. An automated bump PR per release runs each consumer's story and probe suites.
- The pin bump is the objective's last TRD, gated: tag reachable from `origin/main`; pubspec
  comment and `ref:` agree; the consumer's suites re-run against the pinned (not overridden) copy.
- Library PRs touching shell widgets run a **reverse-dependency job**: both consumers' story and
  crawl suites against the PR via override. Required for `lib/src/widgets/eden_layout/`.

## 12. Tooling architecture

### 12.1 Arms (`df-tools ui …`)

`spec validate|render|diff`, `catalog list|show|test|render`, `probe`, `sheet`, `crawl`,
`doctor`, `metrics`. All Node CJS in `bin/lib/ui-*.cjs` with fixture-driven `node --test` suites;
Dart work (registry dump, story rendering) is delegated to `dart`/`flutter` CLI emitting JSON.

### 12.2 One manifest, versioned schemas

The ui-eval manifest is generated from the Surface Spec (`ui spec render --manifest`); the YAML
state files are deleted. Schemas for the Surface Spec, `ProbeResult`, judge output and findings
live in `devflow/schemas/` with `schema_version`; every boundary validates. Every tool output
carries `engine_version`; the verifier rejects evidence from a version other than the installed
plugin's. `df-tools health` checks that `~/.claude/devflow` equals the installed plugin (the
stale-engine class).

### 12.3 `ui doctor`

Checks and prints remediation for: chrome/chromedriver (Gatekeeper quarantine), node ≥ 25,
flutter, python, port availability for this worktree, bundled fonts, `EDEN_PROBE` build, e2e
entrypoint present, seed profiles known. A probe that cannot run reports `MISSING` with the
doctor's reason.

### 12.4 Security

The bridge is compiled only under the `EDEN_PROBE` define; release workflows grep the shipped
bundle for `__edenProbe` and fail on a hit. Probe runs only against local or e2e stacks.

## 13. Wave 0 — fix the gate we have

- aodex#569 `EdenButton` family-less `TextStyle` (library).
- Retire the YAML/JSON manifest pair; generate manifests (eden-biz#705 closes as a class).
- Stale-engine sync: `df-tools health` mirror check; `engine_version` on outputs.
- Objective-scoped manifest resolution only; bootstrap works from `flutter/` in a monorepo.
- `testing-strategy.md`: "visual: shipped (ui-eval)"; ui-eval workflow prose stops naming
  `flutter run -d chrome`. (No React column — Trades React is a donor, not a maintained stack.)
- Resolve aodex#585 / eden-biz#753 pins onto a tagged `eden-ui-flutter` release.
- Upgrade the installed plugin to current `main` (2.6.0 → 2.7.1+) so the design reference set is
  on the executor's path; `df-tools health` reports plugin-vs-main lag from now on.
- Capture the **metrics baseline** (`ui metrics --baseline`): fix/feat ratio per UI TRD on aodex
  and eden-biz since 2026-06-01, human-verify rows per UI objective, open UI issues by class.
  Nothing else changes until the baseline is committed.

## 14. Sequencing, sizing and dogfood

Sizes are rough Claude-execution estimates in the style of existing objectives (obj 020 was
"2–3 weeks, 7 TRDs"). They exist so ordering can be decided, not as commitments.

| Wave | Repo | Deliverable | Size |
|---|---|---|---|
| 0 | devflow-claude, eden-ui-flutter, consumers | §13 gate fixes; plugin upgrade; pins to a tag; metrics baseline | 1 objective, ~8 TRDs, 2–3 days |
| 1a | eden-ui-flutter | pattern library (navigation patterns first); story harness (§6.2) + `expectUiSane`; probe bridge (§7.1); generated `DESIGN.md`; shell API reshaping (§6.5) | 1 objective, ~12 TRDs, 1.5 weeks |
| 1b | devflow-claude | Surface Spec schema + `spec validate|render`; review sheet + look-lock checkpoint; `frontend-design` step 0; `design-stack-flutter.md` composition section | 1 objective, ~7 TRDs, 1 week |
| 1c | aodex, eden-biz | **e2e dependency stub** (seed registry, identity set, fault injection) per consumer; `main_e2e.dart` bridge line | 1 objective per consumer, ~5 TRDs each, 3–4 days each |
| 1 dogfood | aodex + eden-ui-flutter | write the `projects-rail` spec → look-lock → conform the existing nav branch on the reshaped API → merge and tag | inside 1a/1b, the acceptance test for both |
| 2 | devflow-claude | `ui catalog`, `ui probe` + checks, spec-vs-actual sheet, planner derivation, executor RENDER→CONFORM, verifier replay, judge references + calibration set, seam override + tag gate, `ui doctor`, `ui metrics` | 2 objectives, ~16 TRDs, 2–2.5 weeks |
| 3 | eden-biz (+ Trades read-only) | `ui crawl` + `ui-explorer`; donor route table + port-coverage metric (§19); pattern mapping + donor captures for the workflow designer; first Trades port (obj 020 scope) through A–C | 2 objectives, ~14 TRDs, 2–3 weeks |
| 4 | devflow-claude, aodex | Maestro `ProbeResult` adapter; `frontend-design` visual mode emits `ProbeResult`; explorer nightly on aodex | 1 objective, ~4 TRDs, 3–4 days |

Critical path: 0 → 1a/1b/1c in parallel → dogfood → 2 → 3. Wave 3's port objective cannot
start before 2 lands; its spec and pattern mapping (Phase A only) can be written during 2.

## 15. Success metrics (reported by `ui metrics`)

- fix commits per UI TRD (baseline ≈ 1.0 on aodex `flutter/lib`; target < 0.3 on the wave-3 port);
- human-verify rows per UI objective (baseline: every surface; target: `MISSING` + `review` only);
- review-sheet turnaround per look-lock iteration (target: minutes);
- `unspecified-route`, `dead-end`, `inert` counts per app, trending down;
- story coverage ratio; `MISSING` rows per objective; probe budget adherence.

## 16. Risks and open questions

- **Release web build time per task.** Mitigated by probing only route-changing tasks, one build
  per task, tree-hash caching. If eden-biz builds exceed 5 min, the surface layer moves to
  per-wave with story-layer per-task.
- **Golden churn across platforms.** CI-generated goldens + platform tagging; if churn persists,
  goldens are advisory and the semantics-geometry assertions carry the gate.
- **Judge reliability.** No `binding` verdict without calibration; deterministic checks carry most
  of the weight by design.
- **Spec authoring cost.** Patterns supply defaults so a surface spec is mostly routes, controls
  and seeds; the review sheet is where the time is spent, deliberately.
- **Shell API reshaping** touches both consumers; done under the reverse-dependency job.
- **Fault-injection stub is new infrastructure in two apps.** If it slips, `outage` states report
  `MISSING` (never `pass`) and the rest of the loop still runs; it does not block wave 2.
- **Design-set overlap.** The 2.7 references are prose an agent reads; the spec is data a tool
  checks. Keeping them aligned is a documentation task per wave — `design-stack-flutter.md` links
  to the pattern index and the pattern index links back.
- **Open:** whether the `must_not` vocabulary is sufficient for studio/canvas surfaces (drag, drop,
  connect) — wave 3 will extend it from the workflow-designer port. (Reviewed 2026-09-17: the
  vocabulary is fine; state-conditional `behaviors[]` were added in response.)

## 17. Testing the process itself

Every arm ships fixture-driven `node --test` suites including a **known-broken fixture that must
fail**: a `ProbeResult` with overlapping rects; one with a control missing from semantics; one
with `inert` on a non-disabled control; one with a bundle-hash mismatch; a spec with a route
lacking `back`; a spec where `outage` equals `empty`. Planner/executor prose changes are dogfooded
on the `projects-rail` spec end-to-end before release, and the calibration set gates the judge.

## 18. Migration of the existing UI machinery

What the current planner / executor / verifier do for `type: ui` and what happens to each:

| Today | Disposition | Why |
|---|---|---|
| `states:` on every `type: ui` artifact + state-coverage regex catalogue (`flutter-state-patterns.md`) | **replaced** by the Surface Spec's `states` (derived into the manifest); the regex catalogue is deleted | the spec is authored, checked and seeded; a regex guess is neither |
| `tests.widget:` / `tests.integration:` required paths | **kept**, now derived from `controls` and `flows` | unchanged contract, better source |
| `tests.maestro:` required on every mobile TRD | **relaxed** to "required when the spec declares a `mobile` viewport state"; the Maestro flow is generated from `flows` | Maestro remains the mobile driver; it stops being mandatory for web-only surfaces |
| `flutter-ui bootstrap` detector | **kept**, extended to check `main_e2e.dart` bridge line, seed registry, identity set | same gate, more prerequisites |
| verifier Step 8c (ui-eval gate) | **kept as replay** (§9.4) | first run moves to the executor |
| verifier Step 8d (advisory design review) | **split** into conformance (gates) and critique (advisory) (§9.3) | conformance is checkable |
| `flutter-ui-eval.cjs` engine | **kept**, gains `references[]`, rejects anchor-less states, calibration set | one engine |
| `<name>_states.yaml` + `manifests/*.manifest.json` | **deleted**; manifest generated from the spec | one-file rule |
| `ui-evaluator` agent | **kept** for scoring; capture moves to `ui probe` | one capture path |
| `design-preflight.md` checklist in SUMMARY | **kept** as the human-readable view; **[R]**/**[C]** items are auto-filled from `ProbeResult` | evidence, not ticks |
| `checkpoint:human-verify` for UI | **kept**, but its list is only `MISSING` + judge `review` rows | the sheet decides what a human needs to see |

Nothing in the TDD contract (Iron Law, RED→GREEN, commit conventions) changes.

## 19. The port at scale

The trigger is not one feature; it is Trades React → Eden Biz. `AOCyber-Trades/trades/client/src/App.tsx`
declares **47 routes**; the absorption plan lists 37 feature folders. The loop scales to that
through three artifacts:

1. **Donor route table** — `df-tools ui donor-routes <path-to-App.tsx>` extracts the 47 routes
   (path, component, guard) into `flutter/ui_spec/refs/trades/donor-routes.json`, committed once
   and refreshed on demand. Each route gets a `status`: `unmapped` | `mapped` (pattern-mapping
   page exists) | `specified` (Surface Spec exists) | `conformed` (binding pass) | `dropped`
   (with a reason — UX-review finding, out of scope).
2. **Pattern mapping per donor screen** — one page each (§8.1), written in Phase A ahead of the
   objective that ports it; Phase A for the next feature runs while Phase B/C run for the current.
3. **Port coverage metric** — `ui metrics` reports donor routes by status. "Done" for the port
   program is every route `conformed` or `dropped` with a reason; there is no "we think it's
   ported". **That is the gate for the Trades SaaS release on Eden Biz, and the point at which the
   React app is retired** (decided 2026-09-18: no React version is kept long term).

**Adoption policy for existing Eden surfaces:** spec-on-touch. An objective that touches a
surface without a spec writes one first (Phase A, from the pattern library and the router table).
Surfaces nobody touches stay unspecified, and the crawl's `unspecified-route` count is the visible
backlog — it must not rise.

**Ordering the port:** by donor route cluster (the absorption plan's bands), one Surface Spec per
cluster, patterns first (list-detail, form/validation, bulk-action-bar cover most of Trades), the
workflow designer (obj 020) as the canvas exemplar that extends the `must_not` vocabulary.

## 20. Completeness review — 2026-09-17

Second review pass, asking "could a planner write TRDs from this without inventing anything, and
does it cover the port at scale?" Found and folded in:

- The installed DevFlow is 2.6.0; `main` is 2.7.1 and ships a design reference set plus the
  `eden-flutter:frontend-design` skill. §5 now builds on them instead of beside them; wave 0
  upgrades the plugin.
- Look-lock had no approval channel — §8.3.
- `outage` needs fault injection that does not exist in either app — §7.4, wave 1c.
- Guards need identities — `as:` in §4.2/§7.4.
- Re-lock rule and surface granularity — §4.1.
- Explorer safety — §10.2.
- Existing UI machinery had no disposition — §18.
- The port had no scale story — §19 (donor route table, coverage metric, adoption policy).
- No sizing and no baseline — §14 and §13.

Verified while reviewing: both apps use `go_router` (272 route sites), so router-table extraction
is straightforward; the donor route table is one file.

## 21. Wave-0 retrospective — 2026-09-18

Wave 0 shipped inside its estimate (devflow-claude #80/#81, eden-biz #776, tag v2.1.0) and, in a
domain with no pixels, reproduced the failure classes of §1: a lag check that passed every test
and was dead on the real (mirror) path; executor prose about cwd persistence that needed three
rounds because prose has no executable check; a generator PR cleared by reading and then failed
by a differential (`/code-review` ran the generator and diffed); a resolver ordering bug in the
very function meant to prevent "silently absent". The branch's own commit mix was 11 fix / 3 feat.

Three amendments follow, binding for wave 1 onward:

1. **Agent prose that encodes runtime semantics gets an executable check.** Wave 1b adds a
   harness that runs the executor's Flutter-section commands in a scratch repo under the real
   one-command-per-call model (cwd persists, variables do not) and asserts where files land.
   Same principle as the probe, one level up: the oracle runs where the code runs.
2. **Every brief carries a "runtime model" section** — mirror vs checkout, cwd persistence,
   release build vs dev server, monorepo package dir, production semantics mode. Every sharp
   review catch in wave 0 came from a reviewer told to trace under that model; every miss came
   from a brief that omitted it.
3. **`/code-review` after the final branch review is mandatory before any merge**, in addition
   to the task-scoped and whole-branch reviews. In wave 0 it found eight findings those reviews
   had cleared.

Go/no-go for wave 2 is the W1★ dogfood: the nav feature must go through one look-lock and zero
surprise fix rounds. If it does not, stop and rethink before wave 2.

