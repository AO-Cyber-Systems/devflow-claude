---
objective: 34-ui-oracle-loop-w1b-surface-spec
job: "03"
subsystem: devflow-runtime
tags: [ui-oracle-loop, surface-spec, validator, invariants, fixtures, tdd]
duration: one session
completed: 2026-09-22
---

# TRD 34-03 SUMMARY — `validateSurfaceSpec`, invariants I1-I3, and five known-broken fixtures

## Task Evidence

| Task | Commit | What shipped |
|---|---|---|
| 1 — RED: V1-V4 | `fbfbf5b` | `bin/lib/ui-spec-validate.test.cjs` (V1-V4 only), observed failing |
| 2 — RED: I1a-I1c | `21c97e6` | I1a-I1c added, observed failing |
| 2 — GREEN: skeleton + I1 | `3588ed2` | `bin/lib/ui-spec-validate.cjs`; positive control corrected (below) |
| 3 — RED: I2a-I2f | `68d4d68` | `broken/route-without-back.md`, `broken/entry-control-unknown.md` |
| 3 — GREEN: I2 | `3f3e854` | ROUTE001-ROUTE003 |
| 3 — RED: I3a-I3h | `15928aa` | `broken/control-two-does.md`, `broken/behaviors-overlapping-when.md`, `broken/behaviors-missing-narrow.md` |
| 3 — GREEN: I3 | `97283ef` | CTRL001-CTRL006 + `enumerateBehaviorCombinations` |

Seven files touched: the five in `files_modified`, plus two the TRD's `<error_recovery>`
explicitly authorises — `__fixtures__/ui-spec/projects-rail.md` and 34-02's `ui-spec.test.cjs`
(see **Positive control corrected**). No new npm dependency: `package.json` still carries only
`node-pty`, and `ui-spec-validate.cjs` requires exactly `./ui-spec.cjs` and `./helpers.cjs`.
No JSON Schema validator — I1 is a ~120-line hand-rolled walk of the declared structure. The
schema JSON is unchanged.

## TDD Evidence

Suite baseline re-measured at TRD start (`npm test`, branch `df/w1b-surface-spec`):
**3100 tests / 3040 pass / 10 fail / 50 skipped.** The 10 failures sit in three files, none of
them touched here: `bin/devflow-watch.test.cjs` (5), `bin/handoff-e2e.test.cjs` (4),
`bin/lib/awareness.test.cjs` (1). Per the TRD and the orchestrator's brief, `npm test` is
**not** the gate for this TRD; the focused suites are.

### RED 1 — V1-V4, before `ui-spec-validate.cjs` existed (task 1, verbatim)

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-validate.test.cjs 2>&1 | tail -30; exit ${PIPESTATUS[0]}'
node:internal/modules/cjs/loader:1478
  throw err;
  ^

Error: Cannot find module './ui-spec-validate.cjs'
Require stack:
- /Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/ui-spec-validate.test.cjs
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
...
✖ ui-spec-validate.test.cjs (60.155458ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
exit code: 1
```

### RED 2 — I1a-I1c (task 2)

Same module-missing refusal (exit code 1), because the module still did not exist. That RED is
real but WEAK — it does not prove each I1 case bites for the bug it names — so each was proven
by a **differential control** once the implementation landed (below).

### GREEN 1 — V1-V4 + I1a-I1c

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-validate.test.cjs 2>&1 | grep -E "^(✔|✖|ℹ (tests|pass|fail))"; exit ${PIPESTATUS[0]}'
✔ Case V1 — the positive control validates ok:true with no errors at all
✔ Case V2 — every error record is exactly {code, path, msg}, pointer-ish and one line
✔ Case V3 — never throws: null, {}, a string and a parse failure all return SPEC000
✔ Case V4 — errors are deterministically ordered by (code, path) across runs
✔ Case I1a — a missing required top-level key is SPEC001, and nothing else
✔ Case I1b — an id outside the schema id pattern is SPEC001 at the offending path
✔ Case I1c — schema_version out of range is SPEC002 and SHORT-CIRCUITS everything else
ℹ tests 7   ℹ pass 7   ℹ fail 0
exit code: 0
```

Short-circuit probe (task 2 `<verify>`) — the TRD's `\&\&` escaping is for a different quoting
layer and is a syntax error inside `node -e`; the condition is written as a ternary instead and
is otherwise the TRD's command verbatim:

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "const {validateSurfaceSpec:v}=require(\"./ui-spec-validate.cjs\"); const r=v({schema_version:99, surface:\"x\"}); console.log(r.errors.map(e=>e.code).join(\",\")); process.exit(r.errors.length===1 ? (r.errors[0].code===\"SPEC002\" ? 0 : 1) : 1)"'
SPEC002
exit code: 0
```

#### Differential controls for I1 (because its RED was module-missing)

| control | expectation | observed |
|---|---|---|
| comment out the structural walk (`checkStructure`) | only the cases that depend on I1 redden | ✖ V2, ✖ V4, ✖ I1a, ✖ I1b — `ℹ pass 3 ℹ fail 4`; V1, V3, I1c stayed green. Restored → 7/7 |
| turn the SPEC002 `return` into a `push` | I1c alone reddens | ✖ I1c only — `ℹ pass 6 ℹ fail 1`. Restored → 7/7 |

### RED 3 — I2a-I2f, with the two route fixtures (task 3)

A specific RED this time: the module existed, the codes did not.

```
✔ V1 ✔ V2 ✔ V3 ✔ V4 ✔ I1a ✔ I1b ✔ I1c
✖ Case I2a — route-without-back.md fails with exactly ROUTE002
  AssertionError [ERR_ASSERTION]: []
  + actual - expected                       (expected [ 'ROUTE002' ])
✖ Case I2b ✖ Case I2c ✖ Case I2d ✖ Case I2f
✔ Case I2e — a bare string in `entry` (deeplink) is VALID, not an unresolvable control
ℹ tests 13   ℹ pass 8   ℹ fail 5
exit code: 1
```

**I2e passed on arrival, by design** — it pins a NON-error (the trap that breaks the positive
control). Its differential control, run after GREEN: resolve bare strings as control ids and
**9 of 13** cases redden, I2e and the positive control V1 among them (`ℹ pass 4 ℹ fail 9`).
Restored → 13/13.

### GREEN 2 — I2

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-validate.test.cjs 2>&1 | grep -E "^(✖|ℹ (tests|pass|fail))"; exit ${PIPESTATUS[0]}'
ℹ tests 13   ℹ pass 13   ℹ fail 0
exit code: 0
```

### RED 4 — I3a-I3h, with the three control fixtures (task 3)

```
✔ V1-V4, I1a-I1c, I2a-I2f  (13 pass)
✖ Case I3a — control-two-does.md (both `does` and `behaviors`) is exactly CTRL001
✖ Case I3b ✖ Case I3c ✖ Case I3d ✖ Case I3e ✖ Case I3f ✖ Case I3h
✖ Case I3g — TypeError: enumerateBehaviorCombinations is not a function
ℹ tests 21   ℹ pass 13   ℹ fail 8
exit code: 1
```

### GREEN 3 — I3, and the whole focused suite

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-validate.test.cjs ui-spec.test.cjs yaml-lite.test.cjs 2>&1 | tail -12; exit ${PIPESTATUS[0]}'
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
exit code: 0
```

49 = this TRD's 21 (V1-V4, I1a-I1c, I2a-I2f, I3a-I3h) + 34-02's 12 + 34-01's 16.

## The code table as shipped

34-04 appends to this table and must not collide with it.

| code | meaning |
|---|---|
| `SPEC000` | the input is not a readable spec — `null`, a scalar, a list, an EMPTY mapping, or a yaml-lite parse failure (whose `.line` is carried into the message). Also the catch-all for any exception that escapes a check. |
| `SPEC001` | the spec violates the declared structure of `surface-spec.schema.json` — a missing `required` key, an id outside the id pattern, a value outside a declared `enum`, a wrong declared type, a value below a `minimum`, or a key the schema does not declare where `additionalProperties: false`. |
| `SPEC002` | `schema_version` is outside the engine's supported range (today: `[1]`, read off the schema's own `schema_version`). **Short-circuits**: nothing else is evaluated or reported. |
| `ROUTE001` | `route.entry` is absent or empty — §4.5 I2's "at least one declared way in". |
| `ROUTE002` | a route declares no `back` and is not `root: true`. |
| `ROUTE003` | an `entry: [{control: id}]` names a control this spec does not declare. The message carries `resolution: UNRESOLVED` when the id is prefixed by this surface, `resolution: MISSING` when it is not. |
| `CTRL001` | a control declares BOTH a top-level `does` and a `behaviors[]` list. |
| `CTRL002` | a control declares NEITHER. |
| `CTRL003` | two behaviours match the same observed combination (§4.3 exclusivity). |
| `CTRL004` | a combination is matched by no behaviour (§4.3 coverage). |
| `CTRL005` | an `effect` value outside the §7.5 effect classes `{navigation, toggle, select, dialog, submit, inert}`. |
| `CTRL006` | `visible_in` names a state id absent from `states`. |

Not implemented here, and reserved: `CTRL007` (the `must_not` vocabulary — the vocabulary JSON's
own description assigns it to 34-03, but this TRD's `<action>` code list and `<output>` table
both stop at `CTRL006`, and `must_not` is not among I1-I3's rules. It is left to 34-04, and
`ctx.vocabulary` is accepted and unused so the signature does not change when it lands).

## The behaviour-coverage model as implemented

Binding for 34-05's control table and W2's `effect` check, and written verbatim into
`ui-spec-validate.cjs`'s header comment. `enumerateBehaviorCombinations(control, spec)` is
**exported** so those two read this function rather than re-implement the rule.

1. **An absent `when` key is a WILDCARD.** `{viewport: narrow}` matches every `control_state`,
   `theme`, `data_state` and `guard`.
2. **Each dimension's domain is closed-world, derived from the spec:**
   - `data_state` — the control's `visible_in` list.
   - `viewport` — `narrow` when the state declares a `viewport` whose width is
     **< `NARROW_MAX_WIDTH` = 600**, or when the state's id is literally `narrow`; else `desktop`.
     One named constant at module top; 34-05's capture list and 34-06's sheet columns read it.
   - `theme` — the state's `theme`, defaulting to `light`.
   - `guard` — `denied` when the state id is named by a route's `guards[]`, else `allowed`. A
     guard entry that does NOT resolve to a declared state id (the positive control's
     `member-of-workspace`) is left alone: that is invariant I8's business (34-04), not this
     model's, so nothing is guessed into the guard dimension.
   - `control_state` — **the union of every `control_state` value in THIS control's own
     `behaviors[].when`, plus every value in its `a11y.announces`**; `['default']` when empty.
3. A behaviour MATCHES a combination when, for every key present in its `when`, the value equals
   the combination's value.
4. `CTRL003` when a combination is matched by ≥2 behaviours; `CTRL004` when matched by 0.

The table for the positive control's `rail.project.header`, printed from the shipped
implementation (case I3g asserts it row for row):

```
data_state   | control_state | viewport | theme | guard   -> matched
populated    | collapsed     | desktop  | light | allowed -> B0
populated    | expanded      | desktop  | light | allowed -> B1
long-content | collapsed     | desktop  | light | allowed -> B0
long-content | expanded      | desktop  | light | allowed -> B1
narrow       | collapsed     | narrow   | light | allowed -> B2
narrow       | expanded      | narrow   | light | allowed -> B2
```

### Three precedence rules — decisions, not accidents

- **(a) `SPEC002` short-circuits.** An engine that cannot read a spec's version has no basis for
  a verdict on its contents. I1c pins it: the fixture also has a missing `states` and a route
  with no `back`, and the error list still has length 1.
- **(b) `CTRL003` short-circuits `CTRL004` *within one control*.** This is the rule the TRD's
  worked example does not state, and it is load-bearing: the prescribed edit for
  `behaviors-overlapping-when.md` (B3's `when` → `{control_state: collapsed}`) not only
  double-matches rows 1 and 3, it also leaves **(narrow, expanded) matched by nothing**. Without
  this rule that fixture fails with TWO codes and proves nothing about exclusivity (§17). The
  justification is the same honesty rule as (a) — while two behaviours match one combination the
  active behaviour is unresolvable, so a coverage verdict over that control has no basis — and
  the CTRL003 **message says so out loud** rather than leaving the reader to assume coverage
  passed. A reviewer who disagrees should change the fixture edit, not silence the message.
- **(c) A specific code beats the generic `SPEC001` at the SAME path.** The schema declares the
  `effect` enum and `route.entry`'s presence; `CTRL005` and `ROUTE001` own those same rules for
  a reader. Reporting both would make `entry`-absent and every bad-effect case fail with two
  codes. One node, one verdict — the most specific one.

And one deliberate **non**-implementation: the schema's `minItems` is not checked. "At least one
declared way in" is `ROUTE001`'s rule, and a rule with two homes is the drift objective 33
existed to close.

## The reading taken for "two `does`"

`CTRL001` = a control declaring **both** a top-level `does` and a `behaviors[]` list. §4.3
states the rule as *either* one `does` + `effect` pair *or* a `behaviors[]` list, so the
statically-checkable violation is a control that declares both — two competing statements of
what it does. The other possible reading — a literally duplicated `does:` **key** — is caught
one layer down by 34-01's yaml-lite duplicate-key refusal (case Y11a) and never reaches this
validator. Both readings are therefore covered and neither is guessed at. The reading is
written into `broken/control-two-does.md`'s own `<!-- BROKEN: … -->` marker so a reviewer meets
it at the fixture, not only here.

## The `ROUTE003` message shape (W2 replaces this branch and needs its contract)

Path is always `routes[<i>].entry[<j>]`. The message names the route by **id**, the entry by
**index**, the control by id, and ends with an explicit `resolution:` token:

```
cross-surface (id NOT prefixed by this spec's `surface`):
  route project.conversations entry[0] names control rail.project.missing, which is not
  declared in this spec and is not prefixed by surface projects-rail — resolution: MISSING
  (cross-surface entries are resolved in W2, not by this engine)

local (id IS prefixed by this spec's `surface`, or equals it):
  route project.conversations entry[0] names control projects-rail.nope, which surface
  projects-rail declares no control for — resolution: UNRESOLVED
```

`MISSING` is the honest answer for an id this engine did not look for: no repo scan is
implemented here (explicitly out of W1b's scope) and the entry is neither silently passed nor
claimed absent. Case I2f pins the two branches apart. When W2's repo-wide resolution lands, the
`MISSING` branch is what it replaces.

## The one-code-per-fixture probe, verbatim (§17 evidence)

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "const fs=require(\"fs\"),p=require(\"path\"); const {parseSurfaceSpec,loadMustNotVocabulary}=require(\"./ui-spec.cjs\"); const {validateSurfaceSpec}=require(\"./ui-spec-validate.cjs\"); const d=\"__fixtures__/ui-spec/broken\"; let bad=0; for (const f of fs.readdirSync(d).sort()) { const s=parseSurfaceSpec(fs.readFileSync(p.join(d,f),\"utf-8\")).frontMatter; const codes=[...new Set(validateSurfaceSpec(s,{vocabulary:loadMustNotVocabulary().terms}).errors.map(e=>e.code))]; console.log(f, codes.join(\",\")); if (codes.length!==1) bad++; } process.exit(bad?1:0)"'
behaviors-missing-narrow.md CTRL004
behaviors-overlapping-when.md CTRL003
control-two-does.md CTRL001
entry-control-unknown.md ROUTE003
route-without-back.md ROUTE002
exit code: 0
```

Positive-control probe:

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "… const r=validateSurfaceSpec(s,{vocabulary:loadMustNotVocabulary().terms}); console.log(r.ok, JSON.stringify(r.errors)); process.exit(r.ok?0:1)"'
true []
exit code: 0
```

### Fixture → expected code → observed code

| fixture | the ONE edit (one diff hunk) | expected | observed | errors |
|---|---|---|---|---|
| `broken/route-without-back.md` | delete the `back:` line from `project.conversations` | `ROUTE002` | `ROUTE002` | 1 |
| `broken/entry-control-unknown.md` | `entry[0]` → `{control: rail.project.missing}` | `ROUTE003` | `ROUTE003` | 1 |
| `broken/control-two-does.md` | add `does` + `effect: [toggle]` alongside `behaviors:` | `CTRL001` | `CTRL001` | 1 |
| `broken/behaviors-overlapping-when.md` | B3 `when: {viewport: narrow}` → `{control_state: collapsed}` | `CTRL003` | `CTRL003` | 1 |
| `broken/behaviors-missing-narrow.md` | delete B3, keep `narrow` in `visible_in` | `CTRL004` | `CTRL004` | 1 |

Each fixture is `cp projects-rail.md` plus that single edit, plus a `<!-- BROKEN: … expected
code XXXNNN -->` marker at the top of the prose body. `diff` against the positive control shows
exactly two hunks per fixture: the marker and the edit. **Case I3h** enforces the contract as a
LOOP over `__fixtures__/ui-spec/broken/` — codes-set size exactly 1, and that code equal to the
fixture's own marker — so 34-04's six new fixtures inherit the check and cannot skip it.

The shipped messages, verbatim:

```
CTRL004 @ controls[0].behaviors :: control rail.project.header: no behaviour matches
  (data_state=narrow, control_state=collapsed, viewport=narrow, theme=light, guard=allowed);
  (data_state=narrow, control_state=expanded, viewport=narrow, theme=light, guard=allowed)
  — §4.3 requires the `when` clauses to together cover every `visible_in` state
CTRL003 @ controls[0].behaviors[2].when :: control rail.project.header: behaviours 0 and 2 both
  match (data_state=populated, control_state=collapsed, viewport=desktop, theme=light,
  guard=allowed) and 1 further combination(s) — §4.3 requires `when` clauses to be mutually
  exclusive, and CTRL004 coverage is NOT evaluated for this control while the active behaviour
  is unresolvable
CTRL001 @ controls[0] :: control rail.project.header declares BOTH a top-level `does` and a
  `behaviors[]` list — §4.3 allows either one does+effect pair or a behaviors list, not two
  competing statements of what it does
```

## Positive control corrected — the `locked_sheet` digest was 65 hex characters

Case V1 went red the moment I1 landed, on the positive control, with one error:

```
SPEC001 @ acceptance.locked_sheet ::
  "sha256:9f2c1b7e4a6d0835c1e9b4f7a2d6c8e013b5a7f9d2c4e6081a3b5c7d9e1f3a5b7"
  does not match the pattern the schema declares here: ^sha256:[0-9a-f]{64}$
```

Diagnosed per the TRD's `<error_recovery>` ("the invariant or the transcription is wrong —
diagnose which"). **The invariant is right and the source literal is wrong.** The digest in the
AMENDED proposal §4.2 (and therefore in 34-02's faithful transcription) is **sixty-five** hex
characters and cannot be any sha256; `printf '%s' <digest> | wc -c` → 65. The schema 34-02
shipped declares `^sha256:[0-9a-f]{64}$`, which is simply the definition of a sha256.

So the fixture drops the trailing `7`, and 34-02's case F3 is updated to match and now also
asserts `locked_sheet.length === 'sha256:'.length + 64` so the next transcription cannot
reintroduce a wrong-length digest. Both edits are annotated in place, and the fixture's
transcription header records the change. **The schema JSON is unchanged**, and the proposal
itself still reads 65 — the amended proposal is a document this TRD may not edit, so the
discrepancy is recorded here rather than silently reconciled. A one-line note is appended to
`34-02-SUMMARY.md` as the TRD's `<anti_patterns>` requires ("a note in BOTH SUMMARYs").

Two files outside this TRD's `files_modified` were therefore touched —
`__fixtures__/ui-spec/projects-rail.md` and `ui-spec.test.cjs` — both under the TRD's explicit
authority for exactly this case.

## Post-TRD Verification

The TRD's `<verification>` command:

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-validate.test.cjs ui-spec.test.cjs yaml-lite.test.cjs 2>&1 | tail -12; exit ${PIPESTATUS[0]}'
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
exit code: 0
```

Mirror-shaped-tree probe — the validator, like 34-02's loaders, must work from
`~/.claude/devflow/` with the cwd somewhere else entirely:

```
$ bash -c 'set -e; T=$(mktemp -d); … cp bin/lib/{ui-spec,ui-spec-validate,yaml-lite,helpers}.cjs "$T/bin/lib/"; cp schemas/*.json "$T/schemas/"; cp references/model-profiles.json "$T/references/"; cd /tmp && node -e "…validateSurfaceSpec(projectsRail)…" "$T"'
mirror-shaped run: cwd /private/tmp ok=true engine_version=2.8.0 schema_version=1
exit code: 0
```

**One mirror-layout fact worth recording for 34-04:** `helpers.cjs` reads
`references/model-profiles.json` at **module load time**, so requiring `ui-spec-validate.cjs`
from a tree without a sibling `references/` throws at `require`. The real mirror has it
(`references` is in `sync-runtime.js`'s `SUBDIRS`, as is `schemas` since 34-02's `c6f636a`), so
this is not a defect — but a future harness that copies only `bin/lib` and `schemas` will fail
at require, not at validate, and the error will name `model-profiles.json`.

`npm test` is not a gate here. Post-TRD full suite: **3121 tests / 3062 pass / 9 fail / 50
skipped** — `bin/devflow-watch.test.cjs` (4), `bin/handoff-e2e.test.cjs` (4),
`bin/lib/awareness.test.cjs` (1). That is +21 tests and +22 passes against the start
measurement, and one FEWER failure: `devflow-watch` went 5 → 4, which is the timing flake
34-02's SUMMARY already records, not a fix. Zero failures in `ui-spec-validate.test.cjs`,
`ui-spec.test.cjs` or `yaml-lite.test.cjs`.

## Scope fence honoured

I4-I8 (states/seeds, `outage` ∩ `empty` disjointness, patterns, `hit_rect` resolvability and
reciprocity, flows, guards), `CTRL007` (the `must_not` vocabulary) and the
`df-tools ui spec validate` arm with its exit codes are **not** started here — they are 34-04.
`ctx.patterns` and `ctx.vocabulary` are accepted and documented as theirs so the signature does
not change under callers when those land. `STATE.md` and `ROADMAP.md` are untouched; the
orchestrator owns them.
