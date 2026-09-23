---
objective: 34-ui-oracle-loop-w1b-surface-spec
kind: plugin
work: feature
tdd: tdd
status: planned
overrides:
  tdd: tdd
---

# Objective 34 — UI Oracle Loop W1b — Surface Spec: schema, validator, renderer, review sheet, look-lock, prose harness

Wave 1b of the UI Oracle Loop program. Spec: `docs/PROPOSAL-ui-oracle-loop.md` (§4 Surface Spec,
§8 Phase A, §12 tooling, §21 retrospective). Plan: `docs/IMPLEMENTATION-PLAN-ui-oracle-loop.md`
Part 3 → "W1b — devflow-claude: `df/ui-oracle-spec`" (TRDs 1b-01 … 1b-08). Both are on `main`.

## Goal

DevFlow can (a) parse and validate a Surface Spec — the one hand-authored description of how a UI
surface must function, (b) derive the ui-eval manifest, navigation graph and control table from it,
(c) render a review sheet a human approves, (d) record that approval as a look-lock that later
phases anchor on, and (e) run agent prose that encodes shell semantics against a real harness so
a doc that contradicts the runtime fails a test instead of a review round.

Nothing in this objective touches a Flutter app: it is schema, pure functions, CLI arms and prose.

## Deliverables (the plan's TRD list — the planner may re-cut, not re-scope)

1b-01 schema + `yaml-lite` parser · 1b-02 `validateSurfaceSpec` (invariants I1–I8 + `behaviors[]`
exclusivity/coverage + outage≠empty) · 1b-03 `renderSurfaceSpec` (manifest / mermaid nav graph /
plain-language control table / capture list) · 1b-04 review sheet (`ui sheet`, stable `sheet_hash`)
· 1b-05 look-lock (`ui lock`, cleared by shape change) · 1b-06 `frontend-design` build-mode step 0
· 1b-07 executor shell harness (runs fenced bash from an agent section one-command-per-call in a
scratch repo, asserts landing paths and cwd) · 1b-08 release 2.9.0.

Read the plan's W1b table for each TRD's files, RED test list and gate — it is the requirements,
verbatim, including the known-broken fixture per invariant.

## Runtime model (binding — every TRD and every reviewer brief repeats it)

- Skills invoke `node ~/.claude/devflow/bin/df-tools.cjs` — the MIRROR at `~/.claude/devflow`,
  never this checkout. `installed_plugins.json` is the registry truth; `pluginVersion()` is "the
  running engine". Anything that must know the checkout resolves it from the marketplace clone.
- The Bash tool persists the WORKING DIRECTORY across calls but NOT shell variables, and the
  worktree guard forces one command per call. Package-relative commands run in
  `( cd "$PACKAGE_DIR" && … )` subshells; every evidence path is absolute from a per-call
  `REPO_ROOT`. 1b-07 exists to make that testable.
- CommonJS `.cjs` only under `plugins/devflow/devflow/bin/lib/`; synchronous fs; **no new npm
  dependencies** (package.json carries only `node-pty`) — hence the in-repo `yaml-lite` subset
  parser rather than `js-yaml`. Dart/Flutter work is delegated to CLIs emitting JSON; Node never
  parses Dart.
- Every tool output carries `engine_version` + `schema_version`; a check that did not run reports
  `MISSING`, never `pass`.

## TDD contract

Every feature TRD is `type=tdd`. Test list first, in the TRD, before any test code. One test at a
time, RED proven by exit code before GREEN. Hand-built fixtures — for 1b-02 that means one
**known-broken fixture per invariant** (route without `back`; unknown entry control; two `does`;
overlapping `behaviors.when`; `behaviors` not covering a `visible_in` state; state without `seed`;
`outage.must_show ∩ empty.must_show ≠ ∅`; unknown pattern; overlapping `hit_rect` without
`disjoint_from`; flow ending mid-route; guard without a denied state). Commits `test:` → `feat:`
→ optional `refactor:`.

## Definition of done

`df-tools ui spec validate <file>` rejects each known-broken fixture with its own code and accepts
the `projects-rail` example from spec §4.2; `ui spec render` emits a manifest whose states carry
`state_id`/`seed`/`as`/`fault`/`references`; `ui sheet` produces a static HTML page whose
`sheet_hash` is stable across template edits and shows `MISSING` for a state with no render;
`ui lock` writes the acceptance block and is cleared by a `routes`/`controls`/`states` change but
not by prose; `frontend-design` build mode refuses to compose without a valid, locked spec;
1b-07's harness FAILS on a bare `cd X && cmd` and PASSES on `( cd X && cmd )`, and the current
`executor.md` Flutter section passes end-to-end.

## Out of scope

The probe bridge, story harness and patterns (W1a, eden-ui-flutter); e2e seed/identity/fault stubs
(W1c, consumers); `ui probe`/`ui catalog`/checks/executor CONFORM loop (W2). Do not touch
`flutter-ui-eval.cjs`'s judge behaviour — W2 owns `references[]` and calibration.
