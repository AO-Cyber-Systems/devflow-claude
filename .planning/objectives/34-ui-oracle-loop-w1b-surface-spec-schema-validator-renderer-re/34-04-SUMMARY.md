---
objective: 34-ui-oracle-loop-w1b-surface-spec
job: "04"
subsystem: devflow-runtime
tags: [ui-oracle-loop, surface-spec, validator, invariants, fixtures, cli, tdd]
duration: one session
completed: 2026-09-22
---

# TRD 34-04 SUMMARY — invariants I4-I8, twelve known-broken fixtures, and the `ui spec validate` arm

## I6 decision

Recorded verbatim, as the TRD's task 1 `<verify>` requires. **Resolved 2026-09-22 by the
controller: option (a) AND (b) together.** It was resolved BEFORE this TRD ran — the TRD's
frontmatter is `autonomous: true` and the task block is `type="decision-resolved" gate="none"`,
with the ruling written into the TRD as an HTML comment above the task. No `checkpoint:decision`
was emitted and none was needed.

> **The ruling — option (a) AND (b) together:**
>
> - `hit_rect.within: <control-id>` IS part of the schema (34-02 already shipped it in the
>   schema and in the `projects-rail` positive control).
> - Static I6 is **resolvability + consistency only**:
>   * every `hit_rect.disjoint_from` entry resolves to a control in this spec;
>   * it is RECIPROCAL (both controls name each other);
>   * it never names its own control;
>   * every `hit_rect.within` entry resolves to a control in this spec;
>   * a `within` target must NOT also appear in that control's `disjoint_from` — a control
>     cannot be both inside another's area and disjoint from it.
> - **Overlap itself is NOT statically checked.** The spec declares intent; W2's probe measures
>   the rects (§7.5 gains a `within` check; `disjoint` is reworded to "rects of a
>   `disjoint_from` pair overlap").
> - **TWO known-broken fixtures for I6, not one** — one per failure mode: (i) a `disjoint_from`
>   naming a control that does not exist / is not reciprocal; (ii) `within` and `disjoint_from`
>   naming the SAME control. Each fails with its own code.
> - `HIT000` (MISSING) remains the answer where the check could not run. A hit-rect check that
>   did not run never reports `pass`.

**The reasoning, as the ruling states it:** a Surface Spec carries hand-authored INTENT and
geometry is the probe's job. §4.2 gives `hit_rect` no coordinates, so there is no field from
which a static overlap could be computed; inventing one would mean asserting a layout the spec
never states. `within` is the declarable form of the aodex#544 defect (a 40×40 chevron whose
semantics node spanned the whole 360px row) and `max: "WxH"` is an upper bound the probe
asserts, not a layout instruction. (b)'s reciprocity check is cheap and correct under (a) too,
so both ship.

**The schema field, as shipped** (34-02 already carried it; unchanged by this TRD —
`schemas/surface-spec.schema.json` `$defs.hitRect.properties.within`):

```json
"within": {
  "description": "This control sits inside the named control's area but MUST own its own hit target — the declarable form of the aodex#544 defect, where a chevron's semantics node spanned the whole 360px row. Resolves to a control in this spec, and must not also appear in this control's `disjoint_from`.",
  "$ref": "#/$defs/id"
}
```

Implemented in `checkHitRects()`; both fixtures cite this heading by name.

### The contradiction the ruling exposed in the amended proposal — READ THIS

Implementing the fifth clause made the **positive control fail**, and the TRD's
`<error_recovery>` says to diagnose which of the invariant and the transcription is wrong
before editing either. The diagnosis: **neither. The amended proposal contradicts itself.**

- Amended §4.2's example declares `rail.project.chevron` with BOTH
  `within: rail.project.header` AND `disjoint_from: [rail.project.header]` (verified against
  `git show HEAD:docs/PROPOSAL-ui-oracle-loop.md`, commit `4e27123`).
- Amended §4.5 invariant 6, added in the SAME commit, forbids exactly that combination.

With only two controls, **no spec can exercise both a reciprocal `disjoint_from` pair and a
resolvable `within` between them** — the example and the rule are mutually exclusive by
construction, not by accident.

Resolution taken, on the 34-03 precedent (the 65-hex `locked_sheet` digest, where the
illustrative literal was wrong and the normative schema was right): **the normative rule wins
over the illustrative example.** The positive control drops the chevron's `within` line and
keeps the reciprocal pair — which §4.2 itself annotates "reciprocal", and which test-list case
I6b is written about. §4.2's literal text survives **verbatim** as the known-broken fixture
`broken/hit-rect-within-and-disjoint.md`, whose whole point is that the proposal's own example
is the violation.

The differential control, run with I6 implemented and §4.2's literal restored:

```
$ node ../df-tools.cjs ui spec validate __fixtures__/ui-spec/projects-rail.md --patterns __fixtures__/ui-spec/pattern-catalogue.json
{
  "ok": false,
  "errors": [
    {
      "code": "HIT002",
      "path": "controls[1].hit_rect.within",
      "msg": "control rail.project.chevron declares `hit_rect.within: rail.project.header` AND lists rail.project.header in its own `disjoint_from` — a control cannot be both inside another's area and disjoint from it, and W2's probe would be asked to assert containment and separation of the same pair of rects (§7.5 `within` vs `disjoint`)"
    }
  ], ...
}
# and the library suite with that one line restored (re-run against the finished engine):
$ node --test ui-spec-validate.test.cjs 2>&1 | grep -E "^ℹ (tests|pass|fail)"
ℹ tests 39   ℹ pass 20   ℹ fail 19
$ node --test ui-spec-validate.test.cjs 2>&1 | grep -E "^✖ Case (I6b|V1) "
✖ Case I6b — the positive control`s reciprocal pair produces NO HIT error at all
✖ Case V1 — the positive control validates ok:true with no errors at all
# line removed again -> ℹ tests 39  ℹ pass 39  ℹ fail 0
```

**Action for the controller:** the proposal needs a follow-up amendment to ONE side — either
§4.2's example drops `within` from the chevron (what this engine implements), or §4.5 I6 drops
the `within`/`disjoint_from` consistency clause (which would also delete this TRD's second I6
failure mode and its fixture). W2's `disjoint` and `within` checks inherit whichever lands.
Until then, `broken/hit-rect-within-and-disjoint.md` is the record of which side shipped. The
positive control's transcription note and `ui-spec.test.cjs` case F3 both carry the same note
in place, so a reader meets it at the artifact and not only here.

## Task Evidence

| Task | Commit | What shipped |
|---|---|---|
| 1 — DECIDE I6 | (no code) | Resolved before execution; recorded above. No checkpoint emitted. |
| 2 — RED: C1-C5 | `5508c63` | `bin/lib/ui-spec-cli.test.cjs`, executed against the REAL binary |
| 2 — GREEN: the arm | `c1f7027` | `bin/lib/ui-spec-cli.cjs` + `df-tools.cjs` dispatch (`metrics, spec`) |
| 3 — RED: I4a-I4e | `b947740` | `broken/state-without-seed.md`, `broken/outage-equals-empty.md` |
| 3 — GREEN: I4 | `346a450` | STATE001-STATE003 |
| 3 — RED: I5a-I5c | `4e88a29` | `broken/unknown-pattern.md`, `__fixtures__/ui-spec/pattern-catalogue.json` |
| 3 — GREEN: I5 | `a1d8e0a` | PAT000-PAT002 + the MISSING record and `ok` semantics |
| 3 — RED: I6a-I6d | `fd1b312` | `broken/hit-rect-overlap.md`, `broken/hit-rect-within-and-disjoint.md`, positive-control correction |
| 3 — GREEN: I6 | `89e7c61` | HIT000-HIT002; the correction propagated to the eight older fixtures |
| 3 — RED: I7a-I7c | `2ba9108` | `broken/flow-ends-mid-route.md` |
| 3 — GREEN: I7 | `cfa5bce` | FLOW001-FLOW002 + the namespace-local reference model |
| 3 — RED: I8a-I8b | `c25ceaf` | `broken/guard-without-denied-state.md` |
| 3 — GREEN: I8 | `e574962` | GUARD001 + `resolveGuardDeniedState`, now shared with the coverage model |
| 3 — REFACTOR | `8ead275` | the `ok`/MISSING rule and the CTRL007 reservation stated in the module header |

**Files touched.** The eleven in `files_modified`, plus four the TRD and 34-03's precedent
authorise (each recorded under **Deviations**): `__fixtures__/ui-spec/broken/hit-rect-within-and-disjoint.md`
(the second I6 fixture, mandated by the ruling), `__fixtures__/ui-spec/pattern-catalogue.json`,
`__fixtures__/ui-spec/projects-rail.md` (the correction above, under the TRD's
`<error_recovery>`), and `ui-spec.test.cjs` (34-02's case F3, which pins the positive control's
transcription).

**No new npm dependency.** `package.json` still carries exactly `node-pty@1.1.0` and no
devDependencies. `ui-spec-cli.cjs` requires only `fs`, `path`, `./ui-spec.cjs`,
`./ui-spec-validate.cjs` and `./helpers.cjs`.

## The complete shipped code table

34-03's rows are reproduced so this is the one table a reader needs. 34-05+ append below
`GUARD001` and must not collide.

| code | meaning |
|---|---|
| `SPEC000` | the input is not a readable spec — `null`, a scalar, a list, an EMPTY mapping, or a yaml-lite parse failure (whose `.line` is carried into the message). Also the catch-all for any exception that escapes a check. |
| `SPEC001` | the spec violates the declared structure of `surface-spec.schema.json`. |
| `SPEC002` | `schema_version` outside the engine's supported range. **Short-circuits.** |
| `ROUTE001` | `route.entry` absent or empty. |
| `ROUTE002` | a route declares no `back` and is not `root: true`. |
| `ROUTE003` | an `entry: [{control: id}]` names a control this spec does not declare (message carries `resolution: UNRESOLVED` / `MISSING`). |
| `CTRL001` | a control declares BOTH a top-level `does` and a `behaviors[]` list. |
| `CTRL002` | a control declares NEITHER. |
| `CTRL003` | two behaviours match the same observed combination (exclusivity). Short-circuits CTRL004 within that control. |
| `CTRL004` | a combination is matched by no behaviour (coverage). |
| `CTRL005` | an `effect` value outside the §7.5 effect classes. |
| `CTRL006` | `visible_in` names a state id absent from `states`. |
| `CTRL007` | **reserved, still not implemented** — the `must_not` vocabulary. 34-03 left it to 34-04; 34-04's own `<action>` code list and fixture table stop at `GUARD001`, and `must_not` is not among I4-I8's rules. `ctx.vocabulary` stays accepted-and-unused so the signature does not change when it lands. |
| `STATE001` | a state with no `seed`. |
| `STATE002` | `outage.content.must_show` INTERSECTS `empty.content.must_show`. |
| `STATE003` | §4.4's minimum state set is incomplete — **ONE** error listing every missing state. |
| `PAT000` | the pattern catalogue is UNREACHABLE → `status: MISSING`, does NOT flip `ok`. |
| `PAT001` | a referenced pattern is not in the catalogue. |
| `PAT002` | a control of a pattern kind drops one of that pattern's `must_not` defaults. |
| `HIT000` | the hit-rect invariant could not run (no readable `controls` list) → `status: MISSING`, does NOT flip `ok`. |
| `HIT001` | a `hit_rect.disjoint_from` entry that does not resolve, names its own control, or is not reciprocal. |
| `HIT002` | a `hit_rect.within` entry that does not resolve, or that ALSO appears in this control's `disjoint_from`. |
| `FLOW001` | a flow step names a control or route that does not exist **and that this single-spec engine was entitled to resolve** (see the namespace-local rule below). |
| `FLOW002` | a flow's last step is neither a `back` nor a route declared `root: true`. |
| `GUARD001` | a route guard that names no denied state, or whose denied state declares no `as:`. |

## STATE002: intersection, not equality

The TRD frames this as a reconciliation between the plan's `∩ ≠ ∅` and §4.4's "equal". **The
amendment removes the conflict**: the amended §4.4 and §4.5 I4 both read
`outage.must_show ∩ empty.must_show = ∅` — *"disjoint, not merely unequal … The validator
rejects any intersection, not merely equality."* So intersection is not the stronger of two
readings; it is the only reading, and equality is one instance of it.

Both halves are pinned:

- **I4b** (a `mutate`) sets `outage.must_show` equal to `empty.must_show` → `STATE002`.
- **I4c** (the FIXTURE) makes them overlap WITHOUT being equal → `STATE002`.

The fixture deliberately carries the **strong** case, because an equality-only implementation
PASSES it — a non-equal overlap is the differential control that tells a correct implementation
from a plausible wrong one, and a fixture that only shows equality proves nothing about the
rule as written. The file keeps the name `outage-equals-empty.md` that `files_modified`
declares; its `<!-- BROKEN: -->` comment states the discrepancy between its name and its
content so no reader is misled. Its `must_not_show` is emptied in the SAME line, so the fixture
does not also declare a state that must show and must not show the same sentence — a
contradiction no invariant here reports, but one a reviewer would rightly stumble over.

## `PAT000` / `HIT000` — the MISSING semantics, and why they never flip `ok`

Binding for 34-08's "refuse to compose without a valid spec" and for W2's verifier replay.
Written into `ui-spec-validate.cjs`'s module header as well as here.

- A MISSING row is an ordinary member of `errors` with one extra key: `status: 'MISSING'`. It
  is reported so no caller can miss it.
- `ok` counts **real violations** only: `ok = errors.every(e => e.status === 'MISSING')`. A
  check that could not run is not a pass and not a failure.
- MISSING rows **sort after** real violations, so `errors[0]` is always the most important thing
  actually wrong. (Within each group the order is `(code, path, msg)` and deterministic — V4.)
- A MISSING row never suppresses a `SPEC001` at the same path: "I could not check this" is not
  a more specific verdict than "this node is malformed".
- `ctx.patterns` has **three** states and the invariant turns on keeping them apart:
  `undefined`/`null` = UNREACHABLE → `PAT000`; `[]` = reachable and empty → `PAT001` per
  referenced pattern; `[...]` = reachable → `PAT001`/`PAT002` as the entries say. W1b has **no
  pinned `eden-ui-flutter` release**, so the CLI arm passes `undefined` and *every real run
  carries one `PAT000` row*. Treating that as a failure would block composition on every
  surface in the repo; treating it as a pass is the silent-green class §2 goal 5 forbids.
- A spec that references NO patterns produces no MISSING row at all: there was nothing to check.
- `HIT000` fires only when there is no readable `controls` list to resolve against. When
  controls exist and declare no `hit_rect`, the check RAN and found nothing to object to —
  that is a pass, not a MISSING.

## The guard → denied-state linkage rule (34-05's nav graph draws its edge from this)

One home: `resolveGuardDeniedState(guard, statesById)`, **exported**. Two readers today —
invariant I8 (`GUARD001`) and the behaviour-coverage model's `guard` dimension, which 34-03
had deliberately left inert pending this rule. 34-05 must call this function, not
re-implement it.

§4.5 I8 reads *"`guards` name the denied state each renders"*, but §4.2's own example does **not**
name it directly: the route declares `guards: [member-of-workspace]` while the state is called
`guard-denied`. So a guard `G` is resolved against `states[].id` **in order**:

1. `G` itself — the direct form the invariant's wording describes;
2. `${G}-denied` — the per-guard form;
3. `guard-denied` — the canonical single-denied-state form §4.2 uses (a surface with one denied
   state serves every guard on it).

**The resolved state must ALSO declare an `as:` identity.** That is the field which makes it a
*denied* state rather than another data state, and it is the label the guard edge carries:
`as` names who is being refused. A resolved state with no `as` is `GUARD001`, not a pass —
case I8b pins that half directly. The positive control resolves `member-of-workspace` →
`guard-denied` (rung 3) → `as: non-member`.

## The terminal-route rule used by FLOW002

**A terminal route is a route of THIS spec declaring `root: true`.** The TRD offers
"`root: true`, or one carrying an explicit `terminal: true`" and asks which was used. Only
`root: true` shipped, for a mechanical reason: `terminal` is **not** in
`surface-spec.schema.json`, whose route node is `additionalProperties: false`, so any spec
writing `terminal: true` would fail `SPEC001` — the rule would have no way to be satisfied.
Adding the word without adding the field is a rule with two homes and one of them broken. If a
later schema revision adds `terminal`, `checkFlows`'s `terminalRoutes` set is the one place to
widen. Case I7b pins both halves: the fixture ends on a non-terminal route (`FLOW002`), and
re-pointing that last step at `conversations.all` (`root: true`) clears it.

## The flow reference model (I7), and why it is not closed-world

Decided here because §4.2's own example forces it: the positive control's flow references
`rail.conversation[0]` (a runtime INSTANCE of a list item) and `conversation.detail` (a route
on ANOTHER surface). A closed-world "every step resolves" check reddens the proposal's own
worked example, and a MISSING row per step would bury a real typo under two rows of noise on
every well-formed spec.

**A reference is IN SCOPE for this single-spec engine when it is NAMESPACE-LOCAL:** it matches
the schema id pattern `^[a-z0-9][a-z0-9.\-]*$` **and** its first dot-segment is the first
dot-segment of some declared id *of the same kind* (controls for `click`, routes for
`expect.route`).

- `rail.conversation[0]` fails the id pattern outright (`[` is not in it) — an instance, not an id.
- `conversation.detail`: namespace `conversation` is neither `project` nor `conversations`, so
  it belongs to another surface. Out of scope, exactly as `ROUTE003`'s MISSING branch is.
- `rail.project.headr` shares `rail` with `rail.project.header` — a typo this engine can and
  does name. That is `FLOW001`'s whole value.
- `back: app-back` is a back AFFORDANCE (the vocabulary `route.back.via` uses), never a control
  id, and is not resolved as one. Case I7c pins that; resolving it is the second easiest way to
  break the positive control.

W2's repo-wide resolution owns everything out of scope.

## Fixture → expected code → observed code

Twelve fixtures. Each is `cp projects-rail.md` + exactly ONE edit + its `<!-- BROKEN: … -->`
marker, so `diff` against the positive control shows exactly **two** hunks (marker + edit) —
verified for all twelve. Observed codes are from the §17 probe below, through the REAL CLI.

| fixture | the ONE edit | expected | observed | errors | invariant |
|---|---|---|---|---|---|
| `route-without-back.md` | delete `back:` from `project.conversations` | `ROUTE002` | `ROUTE002` | 1 | I2 |
| `entry-control-unknown.md` | `entry[0]` → `{control: rail.project.missing}` | `ROUTE003` | `ROUTE003` | 1 | I2 |
| `control-two-does.md` | add `does` + `effect` alongside `behaviors:` | `CTRL001` | `CTRL001` | 1 | I3 |
| `behaviors-overlapping-when.md` | B3 `when` → `{control_state: collapsed}` | `CTRL003` | `CTRL003` | 1 | I3 |
| `behaviors-missing-narrow.md` | delete B3, keep `narrow` in `visible_in` | `CTRL004` | `CTRL004` | 1 | I3 |
| `state-without-seed.md` | delete `seed:` from the `error` state | `STATE001` | `STATE001` | 1 | I4 |
| `outage-equals-empty.md` | outage `content:` → must_show overlaps empty's, not equal | `STATE002` | `STATE002` | 1 | I4 |
| `unknown-pattern.md` | `patterns: [navigation/does-not-exist]` | `PAT001` | `PAT001` | 1 | I5 |
| `hit-rect-overlap.md` | delete the chevron's reciprocal `disjoint_from` | `HIT001` | `HIT001` | 1 | I6 (i) |
| `hit-rect-within-and-disjoint.md` | add `within: rail.project.header` beside its `disjoint_from` | `HIT002` | `HIT002` | 1 | I6 (ii) |
| `flow-ends-mid-route.md` | delete the flow's final `{back: app-back, …}` step | `FLOW002` | `FLOW002` | 1 | I7 |
| `guard-without-denied-state.md` | delete the `guard-denied` state, keep `guards:` | `GUARD001` | `GUARD001` | 1 | I8 |

`guard-denied` appears in **no** control's `visible_in`, so deleting it trips neither `CTRL006`
nor the coverage model, and it is not one of §4.4's minimum states, so `STATE003` stays silent
too — the TRD's warning about a second code does not bite, and nothing had to be removed from a
`visible_in` list.

34-03's **case I3h** — the hygiene loop over `__fixtures__/ui-spec/broken/` — is unchanged and
now runs over all twelve: codes-set size exactly 1, and that code equal to the fixture's own
marker.

## TDD Evidence

`npm test` baseline re-measured at TRD start (mid-flight, with this TRD's seven CLI RED cases
already committed): **3128 tests / 3061 pass / 17 fail / 50 skipped** — 17 = **10 pre-existing**
(`bin/devflow-watch.test.cjs`, `bin/handoff-e2e.test.cjs`, `bin/lib/awareness.test.cjs`,
`initiatives`/`org-awareness` `CLI2 scan-siblings`) **+ 7 this TRD's in-flight RED cases**.
`npm test` is **not** the gate; the focused suites and the two real-binary probes are.

### RED 1 — C1-C5, before `ui-spec-cli.cjs` existed (task 2, verbatim)

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-cli.test.cjs 2>&1 | grep -E "^(✔|✖|ℹ (tests|pass|fail))"; exit ${PIPESTATUS[0]}'
✖ Case C1 — the positive control exits 0 with ok:true, engine_version and schema_version
✖ Case C2 — a broken spec exits 1 and prints ok:false with the code
✖ Case C2b — every known-broken fixture exits 1 through the real binary
✖ Case C3 — a missing path exits 1 with one stderr line and no stack trace
✖ Case C3b — a spec whose front matter will not parse exits 1 with SPEC000 and the line
✖ Case C4 — unknown `ui` and `ui spec` subcommands exit 1 and list what is available
✖ Case C5 — --patterns supplies the catalogue; without it I5 is MISSING, not PAT001
ℹ tests 7   ℹ pass 0   ℹ fail 7
exit code: 1
```

A SPECIFIC RED, not a module-missing one — the binary existed and answered:

```
  actual: 'Error: Unknown ui subcommand. Available: metrics\n',
  expected: /Unknown ui subcommand\. Available: metrics, spec/,
```

After `c1f7027`, **C2, C3, C3b and C4 went green**; C1, C2b and C5 stayed red by design — they
assert `PAT000`, the catalogue flag and fixtures that invariants I5/I6 had not yet shipped.
They went green at `a1d8e0a` and `89e7c61`, with the whole file green at the end.

### RED 2 — I4a-I4e, with the two state fixtures (task 3)

```
✔ V1-V4, I1a-I1c, I2a-I2f, I3a-I3g   (21 pass)
✖ Case I3h — every broken fixture fails with exactly ONE code, the one its marker names
✖ Case I4a — state-without-seed.md fails with exactly STATE001, naming the state
✖ Case I4b — outage.must_show EQUAL to empty.must_show is exactly STATE002
✖ Case I4c — a NON-equal intersection is STATE002 too (the stronger, amended rule)
✖ Case I4d — a missing minimum state is exactly STATE003, ONE error naming every one
ℹ tests 26   ℹ pass 21   ℹ fail 5
exit code: 1
```

**I4e passed on arrival, by design** — it pins a NON-error (`loading` is not in the minimum
set). Its differential control, run after GREEN against the finished engine: add `'loading'`
to `MINIMUM_STATES` and **30 of 39** cases redden — `✖ Case I4e` and `✖ Case V1` both named in
the output. Restored → `ℹ tests 39  ℹ pass 39  ℹ fail 0`.

### RED 3 — I5a-I5c (task 3)

```
✖ Case I3h ✖ Case I5a ✖ Case I5b ✖ Case I5c
ℹ tests 29   ℹ pass 25   ℹ fail 4
exit code: 1
```

### RED 4 — I6a-I6d, with the two hit-rect fixtures (task 3)

```
✖ Case I3h ✖ Case I6a ✖ Case I6a2 ✖ Case I6c ✖ Case I6d
ℹ tests 34   ℹ pass 29   ℹ fail 5
exit code: 1
```

**I6b passed on arrival** — it pins the positive control producing NO `HIT` error, which is
vacuously true before `HIT*` exists. Its differential control is the §4.2-contradiction probe
recorded under **## I6 decision**: restoring §4.2's literal `within` line reddens **19 of 39**
cases, `✖ Case I6b` and `✖ Case V1` among them, with `HIT002` named at
`controls[1].hit_rect.within`. Restored → 39/39.

Adding I6 also turned the eight fixtures copied from the PRE-correction positive control red
with a second code (`HIT002` on every one). That is the correction propagating, not a new
defect: each fixture must be *the positive control plus one edit*, so the same one-line
correction was applied to all eight in the same GREEN commit, and `diff` is back to two hunks
each.

### RED 5 — I7a-I7c (task 3)

```
✖ Case I3h ✖ Case I7a ✖ Case I7b
ℹ tests 37   ℹ pass 34   ℹ fail 3
exit code: 1
```

**I7c passed on arrival** — another NON-error pin (the positive control's cross-surface and
instance references). Its differential control, run after GREEN: drop `isNamespaceLocal` from
both conditions so FLOW001 becomes closed-world →

```
ℹ tests 39   ℹ pass 6   ℹ fail 33
✖ Case I3h — every broken fixture fails with exactly ONE code, the one its marker names
✖ Case I7c — the positive control`s flow produces no FLOW error, instance refs included
✖ Case V1 — the positive control validates ok:true with no errors at all
# restored -> ℹ tests 39  ℹ pass 39  ℹ fail 0
```

**33 of 39** redden, because every fixture inherits §4.2's two out-of-scope references. That is
the exact failure the namespace-local rule exists to avoid, and it is why the rule is written
down here rather than discovered twice.

### RED 6 — I8a-I8b (task 3)

```
✖ Case I3h ✖ Case I8a ✖ Case I8b
ℹ tests 39   ℹ pass 36   ℹ fail 3
exit code: 1
```

### GREEN — the whole focused suite

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-validate.test.cjs ui-spec-cli.test.cjs ui-spec.test.cjs yaml-lite.test.cjs 2>&1 | tail -12; exit ${PIPESTATUS[0]}'
ℹ tests 74
ℹ suites 0
ℹ pass 74
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1652.034417
exit code: 0
```

74 = 34-03's 49 + this TRD's 18 library cases (I4a-I4e, I5a-I5c, I6a/I6a2/I6b/I6c/I6d,
I7a-I7c, I8a-I8b) + 7 CLI cases (C1-C5, with C2b and C3b).

## Post-TRD Verification

### The plan's W1b gate, executed against the REAL binary

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node ../df-tools.cjs ui spec validate __fixtures__/ui-spec/projects-rail.md > /dev/null; echo "positive exit=$?"'
positive exit=0

$ bash -c 'cd plugins/devflow/devflow/bin/lib && node ../df-tools.cjs ui spec validate __fixtures__/ui-spec/broken/route-without-back.md > /dev/null 2>&1; echo "broken exit=$?"'
broken exit=1
```

### Positive control through the real arm

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node ../df-tools.cjs ui spec validate __fixtures__/ui-spec/projects-rail.md | head -20; exit ${PIPESTATUS[0]}'
{
  "ok": true,
  "errors": [
    {
      "code": "PAT000",
      "path": "patterns",
      "msg": "the pattern catalogue is unreachable, so 2 referenced pattern(s) could not be resolved and no `must_not` defaults could be inherited — §4.5 I5 is UNCHECKED for this spec, which is not the same as passing (supply one with `--patterns`)",
      "status": "MISSING"
    }
  ],
  "engine_version": "2.8.0",
  "schema_version": 1,
  "spec": ".../__fixtures__/ui-spec/projects-rail.md"
}
exit code: 0
```

`ok: true` with one MISSING row is the honest verdict for W1b: there is no pinned
`eden-ui-flutter` release to read, and `--patterns` supplies one when there is.

### The §17 probe over every known-broken fixture, through the real CLI

The TRD's command, with `--patterns __fixtures__/ui-spec/pattern-catalogue.json` added (see
**Deviations**):

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && bad=0; for f in __fixtures__/ui-spec/broken/*.md; do out=$(node ../df-tools.cjs ui spec validate "$f" --patterns __fixtures__/ui-spec/pattern-catalogue.json 2>/dev/null); st=$?; codes=$(printf "%s" "$out" | node -e "…filter(e=>!/000$/.test(e.code))…"); echo "$(basename $f) exit=$st codes=$codes"; [ "$st" = "1" ] || bad=1; case "$codes" in *,*) bad=1;; "") bad=1;; esac; done; exit $bad'
behaviors-missing-narrow.md exit=1 codes=CTRL004
behaviors-overlapping-when.md exit=1 codes=CTRL003
control-two-does.md exit=1 codes=CTRL001
entry-control-unknown.md exit=1 codes=ROUTE003
flow-ends-mid-route.md exit=1 codes=FLOW002
guard-without-denied-state.md exit=1 codes=GUARD001
hit-rect-overlap.md exit=1 codes=HIT001
hit-rect-within-and-disjoint.md exit=1 codes=HIT002
outage-equals-empty.md exit=1 codes=STATE002
route-without-back.md exit=1 codes=ROUTE002
state-without-seed.md exit=1 codes=STATE001
unknown-pattern.md exit=1 codes=PAT001
probe exit code: 0
```

**And the same probe VERBATIM from the TRD, without `--patterns`** — recorded because it is the
evidence the flag was necessary, not a convenience:

```
… (eleven identical lines) …
unknown-pattern.md exit=0 codes=
probe exit code: 1
```

One fixture out of twelve cannot fail through the gate while the catalogue is unconditionally
unreachable, because `PAT000/MISSING` correctly refuses to become `PAT001`. A gate that cannot
fail for one of its own known-broken fixtures is precisely the verification trap this objective
exists to close, so the arm takes a catalogue. Case **C5** pins all three states of the flag:
supplied → `PAT001` and exit 1; absent → `PAT000` and exit 0; unreadable → a one-line refusal
and exit 1, never a silent fallback to MISSING.

### Full suite

`npm test` is not a gate here. Post-TRD:

```
ℹ tests 3146
ℹ suites 467
ℹ pass 3086
ℹ fail 10
ℹ cancelled 0
ℹ skipped 50
ℹ todo 0
```

All 10 failures are pre-existing and in files this TRD does not touch —
`bin/devflow-watch.test.cjs`, `bin/handoff-e2e.test.cjs`, `bin/lib/awareness.test.cjs`
(`S1: scanPeer`). That is **+18 tests and +25 passes** against the start measurement once its
seven in-flight RED cases are netted out, and the `initiatives`/`org-awareness`
`CLI2 scan-siblings` failure seen at start did not recur — a known timing flake, not a fix.

Zero failures in `ui-spec-validate.test.cjs`, `ui-spec-cli.test.cjs`, `ui-spec.test.cjs` or
`yaml-lite.test.cjs`.

## Deviations

1. **A second I6 fixture** — `broken/hit-rect-within-and-disjoint.md`, with its own code
   `HIT002`. Mandated by the I6 ruling ("TWO known-broken fixtures for I6, not one … each must
   fail with its own code"); the TRD's `files_modified` and code table predate the ruling and
   name only `hit-rect-overlap.md`/`HIT001`.
2. **The positive control corrected** — `__fixtures__/ui-spec/projects-rail.md` loses the
   chevron's `within: rail.project.header` line, and 34-02's case F3 in `ui-spec.test.cjs` is
   updated to match. Diagnosis, authority and the differential control are under **## I6
   decision**; the TRD's `<error_recovery>` covers exactly this ("diagnose which before editing
   either"), and 34-03 set the precedent with the 65-hex digest. **V1 was not relaxed**: the
   positive control still asserts `errors` deep-equals `[]`.
3. **`--patterns <file>` on the arm, and `__fixtures__/ui-spec/pattern-catalogue.json`** —
   evidence above. Default behaviour is exactly what the TRD mandates (`undefined`, never `[]`);
   the flag only makes I5's real codes reachable from the real binary. The catalogue is
   hand-built (CLAUDE.md habit 4), two entries, one of them carrying the `kind` + `must_not`
   binding `PAT002` needs.
4. **`outage-equals-empty.md` carries an overlap that is NOT equality** — reasoning under
   **STATE002**. The file name is the TRD's; the content is the stronger control; both the
   fixture's marker and this SUMMARY say so.
5. **Case C5 and case C2b added to the CLI list, I6a2/I6c/I6d added to the I6 list.** The
   `<test_list>` was not rewritten — C1-C4 and I6a/I6b are present and unchanged. C5/C2b exist
   because of deviation 3; I6a2/I6c/I6d because the ruling defines five static clauses and two
   failure modes, which two cases cannot cover.
6. **`terminal: true` not implemented** — reasoning under **the terminal-route rule**. `root:
   true` is the whole rule; the TRD asked which, and this is the answer.
7. **`CTRL007` still reserved** — 34-03 passed the `must_not` vocabulary to 34-04, but 34-04's
   own code list and fixture table stop at `GUARD001` and `must_not` is not among I4-I8's rules.
   Left unimplemented rather than invented; noted in the module header so the next TRD does not
   assume it shipped.

## Scope fence honoured

`ui spec render` (34-05), `ui sheet` (34-06), `ui lock` (34-07) are **not** started.
`ui-spec-cli.cjs` is structured so each adds an arm beside `validate` without re-dispatching:
`SPEC_SUBCOMMANDS` is the one list, and `df-tools.cjs`'s `case 'ui'` message
(`Available: metrics, spec`) is asserted by case C4 so it cannot drift from what is wired.
`STATE.md` and `ROADMAP.md` are untouched — the orchestrator owns them.
